// radar-8 experiments: forward selection (kiencx rule), odds variants, range
// honesty + conformal intervals, parametric forward odds, farm-hours derivation.
// Prints one JSON object to stdout. Reads nothing outside the sealed snapshot.
import { readFileSync } from 'node:fs';
import {
  MODEL,
  SHIPPED_SPEC,
  parseSnapshot,
  trainingRows,
  dedupTrainingRows,
  specPredict,
  blindTest,
  buildOddsTable,
  tokenOdds,
  isPreToken,
  ageDays,
  keptFeatureIndices,
  buildBoard,
  type FitSpec,
  type TrainRow,
  type Snapshot,
} from '../lib/model.ts';

const SNAP = process.argv[2] ?? '../token-radar-01-kit/input/snapshot.json';
const snapshot: Snapshot = parseSnapshot(readFileSync(SNAP, 'utf8'));
const ASOF = snapshot.as_of;
const { rows: train } = dedupTrainingRows(trainingRows(snapshot, ASOF, MODEL));

const med = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length;
  if (m === 0) return 0;
  return m % 2 === 1 ? s[(m - 1) / 2]! : (s[m / 2 - 1]! + s[m / 2]!) / 2;
};
const medX = (errs: number[]): number => Math.exp(med(errs));
const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
};
const hashStr = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};
const absErr = (truth: number[], pred: number[] | null): number[] =>
  pred === null ? truth.map((v) => Math.abs(v)) : truth.map((v, i) => Math.abs(v - pred[i]!));

function looX(rows: TrainRow[], spec: FitSpec): number {
  const errs: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const tr = rows.filter((_, j) => j !== i);
    const pred = specPredict(tr, [rows[i]!], spec, MODEL, ASOF);
    errs.push(...absErr([rows[i]!.y], pred));
  }
  return medX(errs);
}
function wfX(rows: TrainRow[], frac: number, spec: FitSpec): number {
  const dated = rows.filter((r) => r.p.listed_at !== null).sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : 1));
  const cut = dated[Math.floor(dated.length * frac)]!.p.listed_at!;
  const tr = rows.filter((r) => r.p.listed_at === null || r.p.listed_at < cut);
  const te = dated.filter((r) => r.p.listed_at! >= cut);
  const pred = specPredict(tr, te, spec, MODEL, ASOF);
  return medX(absErr(te.map((r) => r.y), pred));
}
function fiveFoldX(rows: TrainRow[], spec: FitSpec): number {
  const errs: number[] = [];
  for (let f = 0; f < 5; f++) {
    const tr = rows.filter((r) => hashStr(r.p.slug) % 5 !== f);
    const te = rows.filter((r) => hashStr(r.p.slug) % 5 === f);
    if (tr.length === 0 || te.length === 0) continue;
    errs.push(...absErr(te.map((r) => r.y), specPredict(tr, te, spec, MODEL, ASOF)));
  }
  return medX(errs);
}
const sizeBucket = (r: TrainRow): string => {
  const lt = Math.log10(Math.max(r.p.tvl_usd, 1));
  if (lt < 7) return '<$10M';
  if (lt < 8) return '$10–100M';
  if (lt < 9) return '$100M–1B';
  return '>$1B';
};
function blindX(rows: TrainRow[], groupOf: (r: TrainRow) => string, spec: FitSpec): number {
  return blindTest(rows, groupOf, 'blind', MODEL, ASOF, spec).model_median_x;
}

// ---------- E1: forward selection, kiencx rule (keep iff it lowers the held-out miss in BOTH tests) ----------
const specWith = (base: FitSpec, name: string, over: Partial<FitSpec>): FitSpec => ({ ...base, name, ...over });
const TERMS = [
  { key: 'size', flag: 'dropSize' },
  { key: 'growth', flag: 'dropGrowth' },
  { key: 'age', flag: 'dropAge' },
  { key: 'chains', flag: 'dropChains' },
  { key: 'category', flag: 'dropCat' },
] as const;
const dropAll = specWith(SHIPPED_SPEC, 'intercept-only', { dropSize: true, dropGrowth: true, dropAge: true, dropChains: true, dropCat: true });
const e1Steps: unknown[] = [];
let current: FitSpec = dropAll;
let curLoo = looX(train, current);
let curWf = wfX(train, 0.7, current);
const remaining = new Set(TERMS.map((t) => t.key));
const kept: string[] = [];
e1Steps.push({ step: 0, kept: [], loo: +curLoo.toFixed(4), wf70: +curWf.toFixed(4) });
while (remaining.size > 0) {
  let best: { key: string; spec: FitSpec; loo: number; wf: number } | null = null;
  const tried: unknown[] = [];
  for (const t of TERMS) {
    if (!remaining.has(t.key)) continue;
    const cand = specWith(current, `+${t.key}`, { [t.flag]: false } as Partial<FitSpec>);
    const loo = looX(train, cand);
    const wf = wfX(train, 0.7, cand);
    tried.push({ term: t.key, loo: +loo.toFixed(4), wf70: +wf.toFixed(4), improvesBoth: loo < curLoo && wf < curWf });
    if (loo < curLoo && wf < curWf && (best === null || loo + wf < best.loo + best.wf)) best = { key: t.key, spec: cand, loo, wf };
  }
  e1Steps.push({ step: e1Steps.length, tried, keptBefore: [...kept] });
  if (best === null) break;
  current = best.spec;
  curLoo = best.loo;
  curWf = best.wf;
  remaining.delete(best.key);
  kept.push(best.key);
}
const selectedSpec = current;
const keptTerms = [...kept];
const e1Final = {
  kept: keptTerms,
  keptIndices: keptFeatureIndices(selectedSpec),
  loo: +looX(train, selectedSpec).toFixed(4),
  wf50: +wfX(train, 0.5, selectedSpec).toFixed(4),
  wf70: +wfX(train, 0.7, selectedSpec).toFixed(4),
  wf80: +wfX(train, 0.8, selectedSpec).toFixed(4),
  fiveFold: +fiveFoldX(train, selectedSpec).toFixed(4),
  loco: +blindX(train, (r) => r.category, selectedSpec).toFixed(4),
  losbo: +blindX(train, sizeBucket, selectedSpec).toFixed(4),
  shippedForComparison: {
    loo: +looX(train, SHIPPED_SPEC).toFixed(4),
    wf50: +wfX(train, 0.5, SHIPPED_SPEC).toFixed(4),
    wf70: +wfX(train, 0.7, SHIPPED_SPEC).toFixed(4),
    wf80: +wfX(train, 0.8, SHIPPED_SPEC).toFixed(4),
    fiveFold: +fiveFoldX(train, SHIPPED_SPEC).toFixed(4),
    loco: +blindX(train, (r) => r.category, SHIPPED_SPEC).toFixed(4),
    losbo: +blindX(train, sizeBucket, SHIPPED_SPEC).toFixed(4),
  },
};

// ---------- E2: odds variants, 5-fold Brier ----------
function oddsBrier(variant: 'shipped' | 'category-only' | 'global-only' | 'no-shrink'): { brier: number; rmse: number } {
  let se = 0;
  let n = 0;
  for (let f = 0; f < 5; f++) {
    const tr = snapshot.protocols.filter((p) => hashStr(p.slug) % 5 !== f);
    const te = snapshot.protocols.filter((p) => hashStr(p.slug) % 5 === f);
    const table = buildOddsTable({ ...snapshot, protocols: tr }, ASOF);
    if (variant === 'category-only') table.cells = new Map();
    if (variant === 'global-only') {
      table.cells = new Map();
      table.categories = new Map();
    }
    const m = variant === 'no-shrink' ? { ...MODEL, odds_cell_k: 0, odds_category_k: 0 } : MODEL;
    for (const p of te) {
      const o = tokenOdds(p, ASOF, table, m).odds;
      const live = isPreToken(p) ? 0 : 1;
      se += (o - live) ** 2;
      n++;
    }
  }
  return { brier: +(se / n).toFixed(4), rmse: +Math.sqrt(se / n).toFixed(4) };
}
const e2 = {
  shipped: oddsBrier('shipped'),
  categoryOnly: oddsBrier('category-only'),
  globalOnly: oddsBrier('global-only'),
  noShrink: oddsBrier('no-shrink'),
};

// ---------- E3: range honesty via conformal intervals on LOO residuals ----------
// The bootstrap interval coverage is replaced by the conformal route: LOO
// residuals give distribution-free intervals, cross-fitted so the coverage
// number is honest (calibrate on one half, test on the other).
function looResiduals(spec: FitSpec): { resid: number[]; bucket: string[]; tvl: number[] } {
  const resid: number[] = [];
  const bucket: string[] = [];
  const tvl: number[] = [];
  for (let i = 0; i < train.length; i++) {
    const tr = train.filter((_, j) => j !== i);
    const pred = specPredict(tr, [train[i]!], spec, MODEL, ASOF);
    resid.push(pred === null ? train[i]!.y : train[i]!.y - pred[0]!);
    bucket.push(sizeBucket(train[i]!));
    tvl.push(train[i]!.p.tvl_usd);
  }
  return { resid, bucket, tvl };
}
const looRes = looResiduals(selectedSpec);
const absRes = looRes.resid.map((r) => Math.abs(r));
const q50 = pct(absRes, 0.5);
const q80 = pct(absRes, 0.8);
const q90 = pct(absRes, 0.9);
// Cross-fitted coverage: calibrate q on half A (by hash parity), test on half B and vice versa.
function crossFittedCoverage(qLevel: number): { cover: number; n: number } {
  let hit = 0;
  let n = 0;
  for (const parity of [0, 1]) {
    const cal = absRes.filter((_, i) => hashStr(train[i]!.p.slug) % 2 === parity);
    const q = pct(cal, qLevel);
    for (let i = 0; i < train.length; i++) {
      if (hashStr(train[i]!.p.slug) % 2 !== 1 - parity) continue;
      if (Math.abs(looRes.resid[i]!) <= q) hit++;
      n++;
    }
  }
  return { cover: +(hit / Math.max(n, 1)).toFixed(3), n };
}
// Per-size-bucket conformal quantiles (80%) and their cross-fitted coverage.
const buckets = ['<$10M', '$10–100M', '$100M–1B', '>$1B'];
const conformalByBucket = buckets.map((b) => {
  const idx = looRes.bucket.map((x, i) => (x === b ? i : -1)).filter((i) => i >= 0);
  const absB = idx.map((i) => Math.abs(looRes.resid[i]!));
  const q = absB.length >= 10 ? pct(absB, 0.8) : NaN;
  // cross-fit within the bucket
  let hit = 0;
  let n = 0;
  for (const parity of [0, 1]) {
    const cal = idx.filter((i) => hashStr(train[i]!.p.slug) % 2 === parity).map((i) => Math.abs(looRes.resid[i]!));
    if (cal.length < 5) continue;
    const qq = pct(cal, 0.8);
    for (const i of idx) {
      if (hashStr(train[i]!.p.slug) % 2 !== 1 - parity) continue;
      if (Math.abs(looRes.resid[i]!) <= qq) hit++;
      n++;
    }
  }
  return { bucket: b, n: idx.length, q80: +q.toFixed(3), crossCover80: n > 0 ? +(hit / n).toFixed(3) : null };
});
const e3 = {
  spec: selectedSpec.name,
  looResidualMedianAbs: +med(absRes).toFixed(3),
  conformal: {
    q50: +q50.toFixed(3),
    q80: +q80.toFixed(3),
    q90: +q90.toFixed(3),
    crossCover50: crossFittedCoverage(0.5),
    crossCover80: crossFittedCoverage(0.8),
    byBucket: conformalByBucket,
  },
};

// ---------- E4: parametric forward odds (current-status logistic in log-age) ----------
const aged = snapshot.protocols
  .map((p) => ({ p, age: ageDays(ASOF, p.listed_at) }))
  .filter((x): x is { p: (typeof snapshot.protocols)[number]; age: number } => x.age !== null && x.age >= 0);
const sig = (x: number): number => 1 / (1 + Math.exp(-x));
function forwardOddsFit(): { b0: number; b1: number; loglik: number; n: number } {
  let best = { b0: 0, b1: 0, loglik: -Infinity };
  for (let b0 = -8; b0 <= 0; b0 += 0.2) {
    for (let b1 = -1; b1 <= 4; b1 += 0.1) {
      let ll = 0;
      for (const { p, age } of aged) {
        const f = sig(b0 + b1 * Math.log(age + 1));
        ll += isPreToken(p) ? Math.log(Math.max(1 - f, 1e-9)) : Math.log(Math.max(f, 1e-9));
      }
      if (ll > best.loglik) best = { b0, b1, loglik: ll };
    }
  }
  for (let step = 0.05; step >= 0.005; step /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [db0, db1] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
        let ll = 0;
        for (const { p, age } of aged) {
          const f = sig(best.b0 + db0 + (best.b1 + db1) * Math.log(age + 1));
          ll += isPreToken(p) ? Math.log(Math.max(1 - f, 1e-9)) : Math.log(Math.max(f, 1e-9));
        }
        if (ll > best.loglik + 1e-9) {
          best = { b0: best.b0 + db0, b1: best.b1 + db1, loglik: ll };
          improved = true;
        }
      }
    }
  }
  return { ...best, loglik: +best.loglik.toFixed(1), n: aged.length };
}
const fw = forwardOddsFit();
const fAt = (age: number): number => sig(fw.b0 + fw.b1 * Math.log(age + 1));
const forward12 = (age: number): number => {
  const f1 = fAt(age);
  const f2 = fAt(age + 365);
  return (f2 - f1) / Math.max(1 - f1, 1e-9);
};
// Brier of the logistic F vs the shipped cell odds, same 5-fold protocol split.
function brierForwardVsCell(): { logistic: number; cell: number } {
  let seL = 0;
  let seC = 0;
  let n = 0;
  for (let f = 0; f < 5; f++) {
    const tr = snapshot.protocols.filter((p) => hashStr(p.slug) % 5 !== f);
    const te = snapshot.protocols.filter((p) => hashStr(p.slug) % 5 === f);
    // refit logistic on train fold only (same grid, coarse)
    const agedTr = tr
      .map((p) => ({ p, age: ageDays(ASOF, p.listed_at) }))
      .filter((x): x is { p: (typeof tr)[number]; age: number } => x.age !== null);
    let best = { b0: 0, b1: 0, ll: -Infinity };
    for (let b0 = -8; b0 <= 0; b0 += 0.5) {
      for (let b1 = -1; b1 <= 4; b1 += 0.25) {
        let ll = 0;
        for (const { p, age } of agedTr) {
          const ff = sig(b0 + b1 * Math.log(age + 1));
          ll += isPreToken(p) ? Math.log(Math.max(1 - ff, 1e-9)) : Math.log(Math.max(ff, 1e-9));
        }
        if (ll > best.ll) best = { b0, b1, ll };
      }
    }
    const table = buildOddsTable({ ...snapshot, protocols: tr }, ASOF);
    for (const p of te) {
      const age = ageDays(ASOF, p.listed_at);
      if (age === null) continue;
      const live = isPreToken(p) ? 0 : 1;
      const fl = sig(best.b0 + best.b1 * Math.log(age + 1));
      const fc = tokenOdds(p, ASOF, table, MODEL).odds;
      seL += (fl - live) ** 2;
      seC += (fc - live) ** 2;
      n++;
    }
  }
  return { logistic: +(seL / n).toFixed(4), cell: +(seC / n).toFixed(4) };
}
const e4 = {
  fit: fw,
  F: [45, 180, 365, 730, 1460, 2920].map((a) => ({ ageDays: a, F: +fAt(a).toFixed(3), forward12mo: +Math.max(0, forward12(a)).toFixed(3) })),
  brier5fold: brierForwardVsCell(),
};

// ---------- E5: farm hours from the plan's own step times ----------
const board = buildBoard(snapshot, MODEL);
const e5 = (() => {
  const hoursFor = (holdDays: number): number => {
    // steps: wallet 5, move 10, action 15, weekly 10/week, hold 0 (duration), claim 10, log 5, risk 5
    const weeks = Math.ceil(holdDays / 7);
    return (5 + 10 + 15 + 10 * weeks + 10 + 5 + 5) / 60;
  };
  let flips = 0;
  const counts: Record<string, number> = { FARM: 0, THIN: 0, SKIP: 0 };
  const flipRows: unknown[] = [];
  for (const r of board) {
    const hours = hoursFor(r.farm_hold_days);
    const netNew = r.farm_net_usd + 45 - hours * 15;
    const vNew = netNew > 100 ? 'FARM' : netNew > 0 ? 'THIN' : 'SKIP';
    counts[vNew] = (counts[vNew] ?? 0) + 1;
    if (vNew !== r.farm_verdict) {
      flips++;
      if (flipRows.length < 10) flipRows.push({ slug: r.slug, old: r.farm_verdict, new: vNew, netOld: r.farm_net_usd, netNew: +netNew.toFixed(2), hours: +hours.toFixed(2) });
    }
  }
  return { hoursByHold: [30, 45, 60].map((h) => ({ holdDays: h, hours: +hoursFor(h).toFixed(2), timeUsd: +(hoursFor(h) * 15).toFixed(2) })), flips, countsNew: counts, flipRows };
})();

console.log(
  JSON.stringify(
    { nTrain: train.length, e1: { steps: e1Steps, final: e1Final }, e2, e3, e4, e5 },
    null,
    1,
  ),
);
