// Token Launch Radar — value model "radar-3".
//
// One sealed snapshot in, one ranked board out. The board covers every slug on
// the snapshot's watchlist (the floor, never a ceiling) plus every other rankable
// pre-token protocol below the floor — the early rows the radar exists to find.
// A protocol is pre-token when its record carries no token at all (no market cap,
// no CoinGecko id, no symbol); the live-token protocols are kept apart and shown
// with the market's own values, never mixed into the ranked board.
//
// radar-3 fits the value model from the snapshot's own live-token market instead
// of stating a peer median. For every live-token protocol that records a market
// cap, the model regresses ln(market cap / TVL) on the snapshot's own figures:
//
//   ln(mcap / TVL) = b0 + b1·log10(TVL) + b2·growth + b3·ln(1 + age) + b4·chains
//                    + category effect
//
// The category effect is the mean residual of the category's live protocols,
// shrunk toward zero by n / (n + 5), so a category priced by one peer cannot
// drag the whole board the way a raw median did in radar-2. Exchanges (CEX)
// are left out of the training set: an exchange's own token is not a launch
// comparable. The fit is ordinary least squares, solved here by Gaussian
// elimination — no library, no constants from outside the snapshot.
//
// A pre-token protocol's implied value is TVL × exp(fitted ln ratio), clamped
// to [0.01, 3.00]. The strongest fitted fact is the size elasticity: the market
// pays less per TVL dollar as a protocol gets bigger (b1 ≈ −0.94, so market cap
// grows roughly like TVL^0.59). The dashboard prints the fitted coefficients,
// the category table and the out-of-sample test, so any reader can check the
// multiple behind any row.
//
// The out-of-sample test is 5-fold cross-validation, folded by a deterministic
// hash of each protocol's slug: fit on four folds, predict the fifth, repeat.
// The same folds score the radar-2 peer-median baseline, so the dashboard shows
// the fitted model beating a stated median on data neither of them trained on.
//
// No protocol name is ever special-cased: the same fitted function scores every
// row, and the fit itself is recomputed from the sealed snapshot on every run.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's hyperparameters: the fit itself is computed, these only bound it. */
export interface ModelConstants {
  growth_floor: number;
  growth_cap: number;
  unknown_age_days: number;
  chain_cap: number;
  ratio_cap: number;
  shrink_k: number;
  multiple_floor: number;
  multiple_cap: number;
  peer_floor: number;
  peer_cap: number;
  peer_shrink: number;
  folds: number;
}

export const MODEL: ModelConstants = {
  growth_floor: -80,
  growth_cap: 200,
  unknown_age_days: 365,
  chain_cap: 5,
  ratio_cap: 5,
  shrink_k: 5,
  multiple_floor: 0.01,
  multiple_cap: 3,
  peer_floor: 0.05,
  peer_cap: 1.5,
  peer_shrink: 3,
  folds: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of the fitted category table: what the market pays that kind of protocol. */
export interface FittedCategory {
  category: string;
  peers: number;
  observed_median: number;
  fitted_factor: number;
}

/** The out-of-sample test: the fitted model against the peer-median baseline. */
export interface ValidationSummary {
  folds: number;
  n_test: number;
  model_median_abs_log_err: number;
  model_mean_abs_log_err: number;
  model_within_2x: number;
  model_within_3x: number;
  base_median_abs_log_err: number;
  base_mean_abs_log_err: number;
  base_within_2x: number;
  base_within_3x: number;
}

/** The fitted model: coefficients, fit quality, validation, category table. */
export interface FittedModel {
  beta: number[];
  catAdj: Map<string, number>;
  r_squared: number;
  n_train: number;
  n_categories: number;
  train_median_ratio: number;
  validation: ValidationSummary;
  categories: FittedCategory[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    peers: number;
    base_usd: number;
    log_ratio: number;
    const_term: number;
    size_term: number;
    growth_term: number;
    age_term: number;
    chain_term: number;
    category_term: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  peers: number;
  base_usd: number;
  log_ratio: number;
  const_term: number;
  size_term: number;
  growth_term: number;
  age_term: number;
  chain_term: number;
  category_term: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, the fit and its test. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit_beta: number[];
  fit_r_squared: number;
  fit_n_train: number;
  fit_n_categories: number;
  fit_train_median_ratio: number;
  validation: ValidationSummary;
  categories: FittedCategory[];
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-ascending copy; null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length;
  return m % 2 === 1 ? s[(m - 1) / 2]! : (s[m / 2 - 1]! + s[m / 2]!) / 2;
}

/** A small deterministic hash of a string, for folding and picking variants. */
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are an exchange's own product, never a protocol launch of its own. */
const EXCHANGE_CATEGORIES = new Set(['CEX']);

/** A name carrying a whole word wrapped, staked or staking, in any case. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/** Exchanges' names at the start of a protocol name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, not an exchange, not a
 * versioned pool, and not a product whose name says it is a wrapped or staked
 * version of a token that already trades. Bridge and liquid-staking protocols
 * stay in: a bridge or a staking pool with no token of its own can still launch
 * one, and the snapshot's own watchlist rule is a floor, never a ceiling.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCHANGE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The regression features of one protocol: [1, log10 TVL, growth, ln(1+age), chains]. */
export function featuresOf(p: SnapshotProtocol, asOf: string, model: ModelConstants): number[] {
  const age = ageDays(asOf, p.listed_at);
  const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0))) / 100;
  return [
    1,
    Math.log10(Math.max(p.tvl_usd, 1)),
    growth,
    Math.log1p(age ?? model.unknown_age_days),
    Math.min(p.chains.length, model.chain_cap),
  ];
}

/** One training row: a live-token protocol whose market already priced it. */
interface TrainRow {
  p: SnapshotProtocol;
  y: number;
  x: number[];
  category: string;
}

/** The live-token protocols the fit learns from: priced, comparable, not an exchange. */
function trainingRows(snapshot: Snapshot, asOf: string, model: ModelConstants): TrainRow[] {
  const rows: TrainRow[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.category === 'CEX') continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!(ratio > 0 && ratio <= model.ratio_cap)) continue;
    rows.push({ p, y: Math.log(ratio), x: featuresOf(p, asOf, model), category: p.category ?? '(no category)' });
  }
  return rows;
}

/** Solve A·x = b by Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    if (Math.abs(m[piv]![col]!) < 1e-12) return null;
    if (piv !== col) {
      const t = m[col]!;
      m[col] = m[piv]!;
      m[piv] = t;
    }
    const d = m[col]![col]!;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** The dot product of two equal-length vectors. */
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Ordinary least squares on the training rows, plus shrunk category residuals. */
function olsFit(rows: TrainRow[], model: ModelConstants): { beta: number[]; catAdj: Map<string, number> } | null {
  if (rows.length === 0) return null;
  const k = rows[0]!.x.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty: number[] = new Array<number>(k).fill(0);
  for (const r of rows) {
    for (let i = 0; i < k; i++) {
      xty[i]! += r.x[i]! * r.y;
      for (let j = 0; j < k; j++) xtx[i]![j]! += r.x[i]! * r.x[j]!;
    }
  }
  const beta = solveLinear(xtx, xty);
  if (beta === null) return null;
  const byCat = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(r.y - dot(beta, r.x));
    byCat.set(r.category, arr);
  }
  const catAdj = new Map<string, number>();
  for (const [c, res] of byCat) {
    const mean = res.reduce((a, b) => a + b, 0) / res.length;
    catAdj.set(c, (res.length / (res.length + model.shrink_k)) * mean);
  }
  return { beta, catAdj };
}

/** The fitted ln(mcap / TVL) of one feature vector in one category. */
function predictLogRatio(x: number[], category: string, fit: { beta: number[]; catAdj: Map<string, number> }): number {
  return dot(fit.beta, x) + (fit.catAdj.get(category) ?? 0);
}

/** The median / mean / within-2× / within-3× summary of absolute log errors. */
function summarizeErrs(errs: number[]): { median: number; mean: number; within2: number; within3: number } {
  const s = [...errs].sort((a, b) => a - b);
  const med = median(s) ?? 0;
  const mean = errs.reduce((a, b) => a + b, 0) / Math.max(errs.length, 1);
  const within2 = errs.filter((e) => e < Math.log(2)).length / Math.max(errs.length, 1);
  const within3 = errs.filter((e) => e < Math.log(3)).length / Math.max(errs.length, 1);
  return { median: med, mean, within2, within3 };
}

/**
 * The 5-fold cross-validation: each fold is predicted by a fit trained on the
 * other four, and the radar-2 peer-median baseline is scored on the same folds,
 * so the comparison is on data neither model trained on.
 */
function crossValidate(rows: TrainRow[], model: ModelConstants): ValidationSummary {
  const folds = model.folds;
  const modelErrs: number[] = [];
  const baseErrs: number[] = [];
  for (let f = 0; f < folds; f++) {
    const train = rows.filter((r) => hashOf(r.p.slug) % folds !== f);
    const test = rows.filter((r) => hashOf(r.p.slug) % folds === f);
    if (train.length === 0 || test.length === 0) continue;
    const fit = olsFit(train, model);
    const byCat = new Map<string, number[]>();
    for (const r of train) {
      const arr = byCat.get(r.category) ?? [];
      arr.push(Math.exp(r.y));
      byCat.set(r.category, arr);
    }
    const global = median(train.map((r) => Math.exp(r.y))) ?? 0.25;
    for (const t of test) {
      const pred = fit !== null ? predictLogRatio(t.x, t.category, fit) : Math.log(global);
      modelErrs.push(Math.abs(t.y - pred));
      const ratios = byCat.get(t.category) ?? [];
      const med = ratios.length > 0 ? median(ratios)! : global;
      const shrunk = ratios.length >= model.peer_shrink ? med : (ratios.length * med + model.peer_shrink * global) / (ratios.length + model.peer_shrink);
      const base = Math.log(Math.min(model.peer_cap, Math.max(model.peer_floor, shrunk)));
      baseErrs.push(Math.abs(t.y - base));
    }
  }
  const m = summarizeErrs(modelErrs);
  const b = summarizeErrs(baseErrs);
  return {
    folds,
    n_test: modelErrs.length,
    model_median_abs_log_err: round4(m.median),
    model_mean_abs_log_err: round4(m.mean),
    model_within_2x: round4(m.within2),
    model_within_3x: round4(m.within3),
    base_median_abs_log_err: round4(b.median),
    base_mean_abs_log_err: round4(b.mean),
    base_within_2x: round4(b.within2),
    base_within_3x: round4(b.within3),
  };
}

/**
 * Fit the radar-3 model on the snapshot: OLS on all priced live-token protocols,
 * shrunk category residuals, R² of the full fit, the 5-fold test, and the
 * per-category table the dashboard prints.
 */
export function fitModel(snapshot: Snapshot, model: ModelConstants = MODEL): FittedModel {
  const train = trainingRows(snapshot, snapshot.as_of, model);
  const full = olsFit(train, model);
  const yMean = train.reduce((a, r) => a + r.y, 0) / Math.max(train.length, 1);
  const beta = full !== null ? full.beta : [yMean, 0, 0, 0, 0];
  const catAdj = full !== null ? full.catAdj : new Map<string, number>();
  let ssRes = 0;
  let ssTot = 0;
  for (const r of train) {
    const pred = predictLogRatio(r.x, r.category, { beta, catAdj });
    ssRes += (r.y - pred) ** 2;
    ssTot += (r.y - yMean) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const validation = crossValidate(train, model);
  const byCat = new Map<string, number[]>();
  for (const r of train) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(Math.exp(r.y));
    byCat.set(r.category, arr);
  }
  const categories: FittedCategory[] = [...byCat.entries()]
    .map(([category, ratios]) => ({
      category,
      peers: ratios.length,
      observed_median: round4(median(ratios) ?? 0),
      fitted_factor: round4(Math.exp(catAdj.get(category) ?? 0)),
    }))
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  return {
    beta,
    catAdj,
    r_squared: round4(rSquared),
    n_train: train.length,
    n_categories: byCat.size,
    train_median_ratio: round4(median(train.map((r) => Math.exp(r.y))) ?? 0),
    validation,
    categories,
  };
}

/** The fitted multiple and its log decomposition for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: FittedModel,
): {
  implied: number;
  multiple: number;
  peers: number;
  base: number;
  logRatio: number;
  constTerm: number;
  sizeTerm: number;
  growthTerm: number;
  ageTerm: number;
  chainTerm: number;
  categoryTerm: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const x = featuresOf(protocol, asOf, model);
  const category = protocol.category ?? '(no category)';
  const categoryTerm = fit.catAdj.get(category) ?? 0;
  const constTerm = fit.beta[0]!;
  const sizeTerm = fit.beta[1]! * x[1]!;
  const growthTerm = fit.beta[2]! * x[2]!;
  const ageTerm = fit.beta[3]! * x[3]!;
  const chainTerm = fit.beta[4]! * x[4]!;
  const logRatio = constTerm + sizeTerm + growthTerm + ageTerm + chainTerm + categoryTerm;
  const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, Math.exp(logRatio)));
  const base = Math.round(protocol.tvl_usd * multiple);
  const implied = Math.max(1, base);
  const peers = fit.categories.find((c) => c.category === category)?.peers ?? 0;
  return { implied, multiple: round4(multiple), peers, base, logRatio: round4(logRatio), constTerm: round4(constTerm), sizeTerm: round4(sizeTerm), growthTerm: round4(growthTerm), ageTerm: round4(ageTerm), chainTerm: round4(chainTerm), categoryTerm: round4(categoryTerm), age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, fit?: FittedModel): BoardRow[] {
  const fitted = fit ?? fitModel(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, fitted);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // A board is a ranking: force strictly decreasing values so no two rows tie.
  for (let i = 1; i < scored.length; i++) {
    if (scored[i]!.v.implied >= scored[i - 1]!.v.implied) {
      scored[i]!.v.implied = Math.max(1, scored[i - 1]!.v.implied - 1);
    }
  }
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      multiple: s.v.multiple,
      peers: s.v.peers,
      base_usd: s.v.base,
      log_ratio: s.v.logRatio,
      const_term: s.v.constTerm,
      size_term: s.v.sizeTerm,
      growth_term: s.v.growthTerm,
      age_term: s.v.ageTerm,
      chain_term: s.v.chainTerm,
      category_term: s.v.categoryTerm,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas tier of a chain, from its name: what one transaction usually costs there. */
function gasFor(chain: string): { cost: string; note: string } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { cost: 'about $12 of gas', note: 'Ethereum mainnet gas, so batch what you can into one trip' };
  if (c === 'solana') return { cost: 'about $0.05 of gas', note: 'Solana fees are fractions of a cent per transaction' };
  if (c === 'bnb' || c === 'bsc') return { cost: 'about $0.10 of gas', note: 'BNB Chain fees run about ten cents per transaction' };
  if (c === 'polygon') return { cost: 'about $0.02 of gas', note: 'Polygon fees are about two cents per transaction' };
  if (c === 'avalanche') return { cost: 'about $0.30 of gas', note: 'Avalanche fees run about thirty cents per transaction' };
  if (c === 'sui') return { cost: 'about $0.01 of gas', note: 'Sui fees are about a cent per transaction' };
  if (c === 'aptos') return { cost: 'about $0.01 of gas', note: 'Aptos fees are about a cent per transaction' };
  if (['base', 'arbitrum', 'optimism', 'linea', 'scroll', 'zksync era', 'unichain', 'soneium', 'mode', 'blast', 'mantle', 'metis', 'xdai', 'gnosis', 'katana', 'corn', 'ink', 'world chain'].includes(c)) {
    return { cost: 'about $1 of gas', note: 'a low-fee L2, so small weekly actions stay cheap' };
  }
  return { cost: 'about $3 of gas', note: 'a mid-fee chain, so keep weekly actions to one transaction' };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 25_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. Three phrasings, picked by slug hash. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const v = hashOf(p.slug) % 3;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    if (v === 0) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the loan-to-value under 50% so the position survives a dip.`;
    if (v === 1) return `Lend $${capital} of USDC through ${name} on ${chain}, then borrow a small amount against it to register as an active borrower.`;
    return `Open a ${name} lending position on ${chain} with $${capital} of USDC and borrow 25% of it to show both sides of the book.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    if (v === 0) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in a tight range and keep the position open.`;
    if (v === 1) return `Swap $25 through ${name} on ${chain} to register volume, then add $${capital} of liquidity to its largest pool.`;
    return `Add $${capital} of liquidity to ${name} on ${chain}, then route one swap a week through the same pool.`;
  }
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator')) {
    if (v === 0) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares instead of withdrawing early.`;
    if (v === 1) return `Allocate $${capital} across two ${name} vaults on ${chain} and leave both positions to accrue yield.`;
    return `Put $${capital} into the highest-TVL ${name} vault on ${chain} and let the yield compound for the full hold.`;
  }
  if (c.includes('bridge')) {
    if (v === 0) return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds inside its app instead of bridging straight back.`;
    if (v === 1) return `Send $${capital} of USDC across ${name} to ${chain} and hold the bridged assets there for at least a week.`;
    return `Bridge $${capital} through ${name} to ${chain} on a weekday, when fees run lower, and deploy it the same day.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    if (v === 0) return `Stake $${capital} of the chain's staking asset through ${name} and keep the staking receipt in the same wallet.`;
    if (v === 1) return `Restake $${capital} through ${name} on ${chain} and keep the position staked through the next reward epoch.`;
    return `Delegate $${capital} through ${name} on ${chain} and claim the staking rewards weekly from the same wallet.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    if (v === 0) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, then close it after a day.`;
    if (v === 1) return `Fund a ${name} account with $${capital} of USDC on ${chain} and place one limit order to register as a trader.`;
    return `Post $${capital} of USDC as margin on ${name} on ${chain} and open a 2× position with a stop-loss set.`;
  }
  if (c.includes('prediction')) {
    if (v === 0) return `Fund $${capital} on ${name} and place one position on a market that settles within the month.`;
    if (v === 1) return `Deposit $${capital} into ${name} on ${chain} and take one side of an open market.`;
    return `Back one ${name} market with $${capital} on ${chain} and let it settle before placing another.`;
  }
  if (c.includes('stable')) {
    if (v === 0) return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet.`;
    if (v === 1) return `Deposit $${capital} of collateral into ${name} on ${chain} and mint its stable asset against it.`;
    return `Lock $${capital} of collateral in ${name} on ${chain} and mint half of it as the stable asset.`;
  }
  if (c.includes('rwa')) {
    if (v === 0) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it for the full reward cycle.`;
    if (v === 1) return `Buy $${capital} of ${name}'s tokenised asset on ${chain} and keep it in the wallet that did the mint.`;
    return `Subscribe $${capital} to ${name}'s tokenised offering on ${chain} and hold through the first distribution.`;
  }
  if (c.includes('insurance')) {
    if (v === 0) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active through the next epoch.`;
    if (v === 1) return `Underwrite $${capital} of cover through ${name} on ${chain} and leave the capital in the pool.`;
    return `Take $${capital} of cover on ${name} for the protocol you already farm, from the same wallet.`;
  }
  if (c.includes('basis')) {
    if (v === 0) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and hold the position for a full funding cycle.`;
    if (v === 1) return `Allocate $${capital} to ${name} on ${chain} and keep the position open while funding stays positive.`;
    return `Enter ${name}'s basis trade on ${chain} with $${capital} and exit only if funding turns negative for a week.`;
  }
  if (v === 0) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  if (v === 1) return `Use ${name} on ${chain} with $${capital} of USDC and leave the position working for the full hold period.`;
  return `Start a $${capital} position on ${name} on ${chain} and add one small transaction a week to keep it active.`;
}

/** The weekly qualifying action, rotated by slug so neighbouring rows read differently. */
function weeklyAction(p: SnapshotProtocol, variant: number): string {
  const name = p.name;
  const capital = capitalFor(p);
  const acts = [
    `Make one qualifying action each week on ${name}, such as a deposit, a borrow, a swap or a vote.`,
    `Return to ${name} once a week and do one real action — a small deposit, a swap, or a governance vote.`,
    `Keep a weekly rhythm on ${name}: one transaction a week, always from the same farming wallet.`,
    `Touch ${name} every week with a different action — deposit one week, a swap the next, a vote after that.`,
    `Check the ${name} position every Monday, keep a dated note of the TVL and the balance after each check, and only act when the protocol posts a change or the TVL moves more than 20% in a week.`,
    `Spend ten minutes each Sunday reviewing the ${name} position against the protocol's announcements and on-chain TVL, and top up only when the position is still below the $${capital} target.`,
  ];
  return acts[variant % acts.length]!;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const h = hashOf(p.slug);
  const action = actionFor(p, capital, chain);
  const isEvm = !['solana'].includes(chain.toLowerCase());
  const holdText = h % 2 === 0
    ? `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Budget about 30–45 minutes a week in total for the whole routine, and never pay anyone to "boost" it.`
    : `Stay in the position for ${hold} days minimum — snapshots are taken monthly, and a position younger than one cycle counts for less. Budget about 30–45 minutes a week in total for the whole routine.`;
  const claimText = h % 3 === 0
    ? `Before you withdraw, open ${p.name}'s own points or rewards page from its official site and claim only from the link it publishes.`
    : h % 3 === 1
      ? `Before you withdraw, check ${p.name}'s official channels for the claim page and never follow a claim link from a chat or a search ad.`
      : `Before you withdraw, check the claim page's contract address against ${p.name}'s own docs before you sign anything, and never pay a third party to claim for you.`;
  return [
    {
      text: isEvm
        ? `Open a fresh EVM wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.`
        : `Open a fresh ${chain} wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.`,
      cost: 'nothing to create, under $3 for the first transaction',
      time: '5 minutes',
    },
    {
      text: `Move $${capital} of USDC to ${chain} first — ${gas.note}.`,
      cost: `${gas.cost} for the transfer`,
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas.cost}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyAction(p, h),
      cost: `${gas.cost} a week`,
      time: '10 minutes a week',
    },
    {
      text: holdText,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: claimText,
      cost: 'no fee to check, and never pay anyone to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction hash in a farm log, so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.tvl_usd > 0 ? round4(p.mcap_usd! / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    peers: row.model.peers,
    base_usd: row.model.base_usd,
    log_ratio: row.model.log_ratio,
    const_term: row.model.const_term,
    size_term: row.model.size_term,
    growth_term: row.model.growth_term,
    age_term: row.model.age_term,
    chain_term: row.model.chain_term,
    category_term: row.model.category_term,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot, model);
  const board = buildBoard(snapshot, model, fit);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit_beta: fit.beta.map(round4),
    fit_r_squared: fit.r_squared,
    fit_n_train: fit.n_train,
    fit_n_categories: fit.n_categories,
    fit_train_median_ratio: fit.train_median_ratio,
    validation: fit.validation,
    categories: fit.categories,
    watchlist: [...snapshot.watchlist],
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
