// radar-8 follow-up 2: full battery for the near-miss specs (5-fold, LOCO, LOSBO).
import { readFileSync } from 'node:fs';
import {
  MODEL,
  SHIPPED_SPEC,
  parseSnapshot,
  trainingRows,
  dedupTrainingRows,
  specPredict,
  blindTest,
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
const hashStr = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};
const specWith = (base: FitSpec, name: string, over: Partial<FitSpec>): FitSpec => ({ ...base, name, ...over });
const SIZE_ONLY = specWith(SHIPPED_SPEC, 'size-only', { dropGrowth: true, dropAge: true, dropChains: true, dropCat: true });
const SIZE_AGE = specWith(SHIPPED_SPEC, 'size+age', { dropGrowth: true, dropChains: true, dropCat: true });
const SIZE_CHAINS = specWith(SHIPPED_SPEC, 'size+chains', { dropGrowth: true, dropAge: true, dropCat: true });
const SPECS = [SIZE_ONLY, SIZE_AGE, SIZE_CHAINS, SHIPPED_SPEC];
const sizeBucket = (r: TrainRow): string => {
  const lt = Math.log10(Math.max(r.p.tvl_usd, 1));
  if (lt < 7) return '<$10M';
  if (lt < 8) return '$10–100M';
  if (lt < 9) return '$100M–1B';
  return '>$1B';
};
const out: Record<string, unknown> = {};
for (const s of SPECS) {
  const errs5: number[] = [];
  for (let f = 0; f < 5; f++) {
    const tr = train.filter((r) => hashStr(r.p.slug) % 5 !== f);
    const te = train.filter((r) => hashStr(r.p.slug) % 5 === f);
    const pred = specPredict(tr, te, s, MODEL, ASOF);
    te.forEach((r, i) => errs5.push(pred === null ? Math.abs(r.y) : Math.abs(r.y - pred[i]!)));
  }
  out[s.name] = {
    fiveFold: +medX(errs5).toFixed(4),
    loco: +blindTest(train, (r) => r.category, 'blind', MODEL, ASOF, s).model_median_x.toFixed(4),
    losbo: +blindTest(train, sizeBucket, 'blind', MODEL, ASOF, s).model_median_x.toFixed(4),
  };
}
console.log(JSON.stringify(out, null, 1));
