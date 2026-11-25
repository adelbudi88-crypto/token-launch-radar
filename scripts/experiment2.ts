// radar-8 follow-up: random time splits + WF80 diagnosis + near-miss specs.
import { readFileSync } from 'node:fs';
import {
  MODEL,
  SHIPPED_SPEC,
  parseSnapshot,
  trainingRows,
  dedupTrainingRows,
  specPredict,
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
const mulberry = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const specWith = (base: FitSpec, name: string, over: Partial<FitSpec>): FitSpec => ({ ...base, name, ...over });
const SIZE_ONLY = specWith(SHIPPED_SPEC, 'size-only', { dropGrowth: true, dropAge: true, dropChains: true, dropCat: true });
const SIZE_AGE = specWith(SHIPPED_SPEC, 'size+age', { dropGrowth: true, dropChains: true, dropCat: true });
const SIZE_CHAINS = specWith(SHIPPED_SPEC, 'size+chains', { dropGrowth: true, dropAge: true, dropCat: true });
const SPECS = [SIZE_ONLY, SIZE_AGE, SIZE_CHAINS, SHIPPED_SPEC];

function wfSplit(rows: TrainRow[], frac: number): { tr: TrainRow[]; te: TrainRow[] } {
  const dated = rows.filter((r) => r.p.listed_at !== null).sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : 1));
  const cut = dated[Math.floor(dated.length * frac)]!.p.listed_at!;
  return {
    tr: rows.filter((r) => r.p.listed_at === null || r.p.listed_at < cut),
    te: dated.filter((r) => r.p.listed_at! >= cut),
  };
}
const errOf = (rows: TrainRow[], spec: FitSpec, tr: TrainRow[], te: TrainRow[]): number[] => {
  const pred = specPredict(tr, te, spec, MODEL, ASOF);
  return te.map((r, i) => (pred === null ? Math.abs(r.y) : Math.abs(r.y - pred[i]!)));
};

// 1. Random time splits (same generator as randomSplitSummary: seed 42, frac 0.4-0.8).
const dated = train.filter((r) => r.p.listed_at !== null).sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : 1));
const first = Date.parse(`${dated[0]!.p.listed_at!}T00:00:00Z`);
const last = Date.parse(`${dated[dated.length - 1]!.p.listed_at!}T00:00:00Z`);
const rand = mulberry(42);
const randRes: Record<string, { meanMed: number; wins: number; splits: number }> = {};
for (const s of SPECS) randRes[s.name] = { meanMed: 0, wins: 0, splits: 0 };
const randMeds: Record<string, number[]> = {};
for (const s of SPECS) randMeds[s.name] = [];
for (let k = 0; k < 20; k++) {
  const frac = 0.4 + rand() * 0.4;
  const cutMs = first + Math.floor((last - first) * frac);
  const cut = new Date(cutMs).toISOString().slice(0, 10);
  const tr = train.filter((r) => r.p.listed_at === null || r.p.listed_at < cut);
  const te = dated.filter((r) => r.p.listed_at! >= cut);
  if (te.length < 8 || tr.length < 40) continue;
  const meds: Record<string, number> = {};
  for (const s of SPECS) {
    const m = med(errOf(train, s, tr, te));
    meds[s.name] = m;
    randMeds[s.name]!.push(m);
    randRes[s.name]!.splits++;
  }
  if (meds['size-only']! < meds['radar-7']!) randRes['size-only']!.wins++;
}
for (const s of SPECS) {
  const ms = randMeds[s.name]!;
  randRes[s.name]!.meanMed = +Math.exp(ms.reduce((a, v) => a + v, 0) / Math.max(ms.length, 1)).toFixed(4);
}

// 2. WF80 diagnosis: per-row errors, size-only vs shipped.
const { tr, te } = wfSplit(train, 0.8);
const eSize = errOf(train, SIZE_ONLY, tr, te);
const eShip = errOf(train, SHIPPED_SPEC, tr, te);
const rows80 = te
  .map((r, i) => ({ slug: r.p.slug, cat: r.category, listed: r.p.listed_at, tvl: r.p.tvl_usd, errSize: +eSize[i]!.toFixed(2), errShip: +eShip[i]!.toFixed(2) }))
  .sort((a, b) => b.errSize - b.errShip);
const med80 = { sizeOnly: +medX(eSize).toFixed(4), shipped: +medX(eShip).toFixed(4), n: te.length };

// 3. Full battery for the near-miss specs.
function looX(rows: TrainRow[], spec: FitSpec): number {
  const errs: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const t = rows.filter((_, j) => j !== i);
    const pred = specPredict(t, [rows[i]!], spec, MODEL, ASOF);
    errs.push(pred === null ? Math.abs(rows[i]!.y) : Math.abs(rows[i]!.y - pred[0]!));
  }
  return medX(errs);
}
const battery: Record<string, unknown> = {};
for (const s of SPECS) {
  const w50 = wfSplit(train, 0.5);
  const w70 = wfSplit(train, 0.7);
  const w80 = wfSplit(train, 0.8);
  battery[s.name] = {
    loo: +looX(train, s).toFixed(4),
    wf50: +medX(errOf(train, s, w50.tr, w50.te)).toFixed(4),
    wf70: +medX(errOf(train, s, w70.tr, w70.te)).toFixed(4),
    wf80: +medX(errOf(train, s, w80.tr, w80.te)).toFixed(4),
  };
}

console.log(JSON.stringify({ randomSplits: randRes, wf80: { ...med80, worstForSizeOnly: rows80.slice(0, 10), bestForSizeOnly: rows80.slice(-5) }, battery }, null, 1));
