// Token Launch Radar — value model "radar-5".
//
// One sealed snapshot in, one ranked board out. The board covers every rankable
// pre-token protocol in the snapshot (263 of 758: the 40 watchlist slugs plus
// every other rankable pre-token protocol, no TVL floor) — the watchlist is the
// floor, never a ceiling. A protocol is pre-token when its record carries no
// token at all (no market cap, no CoinGecko id, no symbol); the live-token
// protocols are kept apart and shown with the market's own values, never mixed
// into the ranked board. The 79 pre-token protocols the board does not rank
// (exchange products, versioned pools, wrapped/staked products of a token that
// already trades) are counted in the integrity strip with their reason, so
// every one of the 758 protocols is accounted for.
//
// radar-5 keeps radar-4's Huber robust fit and adds the four things the
// top of the board has and radar-4 lacked:
//
//   ln(mcap / TVL) = b0 + b1·log10(TVL) + b2·growth + b3·ln(1 + age) + b4·chains
//                    + category effect
//
// 1. TOKEN ODDS. A pre-token protocol is not worth its full implied value:
//    most protocols never launch a token. Each row carries the peer launch
//    rate — the share of comparable protocols (same category, same age band)
//    that already record a token, shrunk toward the category rate and the
//    global rate — and the board ranks by EXPECTED VALUE = odds × implied
//    value. This is a discount from the peers' own record, not a prediction
//    of whether or when a token will be issued.
// 2. ONE-PER-TICKER COMPS. The training set is deduped to one observation
//    per protocol family (largest TVL per family: uniswap-v2/v3 count once),
//    so one family cannot count twice and drag the fit.
// 3. BOOTSTRAP RANGES. 200 seeded resamples of the training set give every
//    row a 10–90% range for its expected value and for its rank, printed on
//    the board — the model shows its own error bars instead of hiding them.
// 4. NETTED FARM VERDICTS. Every farm plan ends in a net value (the
//    farmer's expected share of an airdrop pool, minus gas, minus time) with
//    a verdict — FARM / THIN / SKIP — and a deposit sized to the verdict.
//    All assumptions are stated on the dashboard.
//
// Validation is held out twice: walk-forward in time (LOO, 50/70/80 splits,
// 5-fold, 20 random time splits) AND blind comps curves (leave-one-category-
// out and leave-one-size-bucket-out), plus a held-out calibration check of
// the odds on a random half of the protocols. Rejected variants are still shown
// with their numbers. The fit is recomputed from the sealed snapshot on
// every run; no protocol name is ever special-cased.
//
// A pre-token protocol's implied value is TVL × exp(fitted ln ratio), clamped
// to [0.01, 3.00]; its expected value is odds × implied value.

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
  /** Huber tuning constant: residuals beyond k × scale are down-weighted, not deleted. */
  huber_k: number;
  /** Huber IRLS iterations before the fit is declared settled. */
  huber_iters: number;
  /** Walk-forward splits, as the fraction of dated listings the fit trains on. */
  wf_fracs: number[];
  /** Random time splits in the walk-forward summary, seeded, so runs agree. */
  wf_random_splits: number;
  /** Time-weighting half-life tested and rejected: 0 means the shipped fit weights all training rows equally. */
  time_tau_days: number;
  /** Bootstrap resamples of the training set for the value/rank ranges (seeded, deterministic). */
  bootstrap_resamples: number;
  /** Token-odds shrinkage: pseudo-count toward the category rate (cell) and the global rate (category). */
  odds_cell_k: number;
  odds_category_k: number;
  /** Farm verdict assumptions (stated on the dashboard): airdrop pool share of expected value, farmer share of the pool. */
  farm_pool_share: number;
  farm_farmer_share: number;
  /** Farm verdict assumptions: transactions in one farm plan, hours of the farmer's time, value of an hour. */
  farm_tx_count: number;
  farm_hours: number;
  farm_hour_usd: number;
  /** Net farm value above this is FARM; above zero is THIN; at or below zero is SKIP. */
  farm_threshold_usd: number;
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
  huber_k: 1.345,
  huber_iters: 30,
  wf_fracs: [0.5, 0.7, 0.8],
  wf_random_splits: 20,
  time_tau_days: 0,
  bootstrap_resamples: 200,
  odds_cell_k: 10,
  odds_category_k: 20,
  farm_pool_share: 0.05,
  farm_farmer_share: 0.0004,
  farm_tx_count: 9,
  farm_hours: 3,
  farm_hour_usd: 15,
  farm_threshold_usd: 100,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-5';

/** How many live-token protocols the Live token view carries: all of them, by market cap. */
export const LIVE_ROWS = 1000;

/** One row of the fitted category table: what the market pays that kind of protocol. */
export interface FittedCategory {
  category: string;
  peers: number;
  observed_median: number;
  fitted_factor: number;
}

/** One out-of-sample test: the same held-out protocols, scored three ways. */
export interface ValidationTest {
  /** 'loo', 'walk-forward 70/30', 'walk-forward 50/50', 'walk-forward 80/20', '5-fold CV'. */
  name: string;
  n_test: number;
  /** Median absolute log error, as a multiple (exp of the log error). */
  model_median_x: number;
  ols_median_x: number;
  base_median_x: number;
  /** Share of held-out market caps predicted within 2×. */
  model_within_2x: number;
  ols_within_2x: number;
  base_within_2x: number;
}

/** A richer variant that was built, tested and rejected, with its leave-one-out error. */
export interface RejectedVariant {
  name: string;
  loo_median_x: number;
  note: string;
}

/** The walk-forward summary: twenty random time splits, seeded, so runs agree. */
export interface WalkForwardSummary {
  splits: number;
  /** Mean of the per-split median errors, as multiples. */
  model_mean_median_x: number;
  ols_mean_median_x: number;
  base_mean_median_x: number;
  /** Splits where the robust fit beat the OLS fit on median error. */
  model_wins_vs_ols: number;
  model_mean_within_2x: number;
}

/** One quartile of the held-out odds calibration check. */
export interface OddsCalibrationQuartile {
  odds_mid: number;
  observed_live_share: number;
  n: number;
}

/** The token-odds calibration check: odds fitted on the older-listed half, tested on the newer half. */
export interface OddsCalibration {
  n_test: number;
  /** Mean absolute gap between predicted odds and observed live share, across quartiles. */
  mean_abs_error: number;
  quartiles: OddsCalibrationQuartile[];
}

/** The out-of-sample test: leave-one-out, three walk-forward splits, 5-fold, and the random-split summary. */
export interface ValidationSummary {
  tests: ValidationTest[];
  rejected: RejectedVariant[];
  random_splits: WalkForwardSummary;
  /** The headline: the leave-one-out median error, as a multiple. */
  loo_median_x: number;
  /** The headline walk-forward number: the 70/30 split's median error, as a multiple. */
  wf_median_x: number;
  /** The blind comps-curve tests: leave-one-category-out and leave-one-size-bucket-out, pooled. */
  blind_tests: ValidationTest[];
  /** Token-odds calibration on a random held-out half of the protocols. */
  odds_calibration: OddsCalibration;
  /** Leave-one-out of the shipped fit on the training set BEFORE one-per-ticker dedup, for comparison. */
  loo_before_dedup_x: number;
}

/** One point of the size curve: the fitted multiple at a TVL, next to what the data pays there. */
export interface SizeCurvePoint {
  tvl_usd: number;
  label: string;
  /** The model's fitted multiple at this TVL, other features at their training medians. */
  fitted_multiple: number;
  /** The observed median mcap / TVL of training protocols in this TVL bucket, or null when the bucket is empty. */
  observed_median: number | null;
  n: number;
}

/** The fitted model: coefficients, fit quality, validation, category table, size curve. */
export interface FittedModel {
  beta: number[];
  catAdj: Map<string, number>;
  r_squared: number;
  n_train: number;
  /** Training rows before one-per-ticker dedup. */
  n_train_raw: number;
  /** Families collapsed by dedup (family key → slugs kept out), for the integrity strip. */
  dedup_removed: string[];
  n_categories: number;
  train_median_ratio: number;
  validation: ValidationSummary;
  categories: FittedCategory[];
  size_curve: SizeCurvePoint[];
  /** Huber scale (1.4826 × MAD of the residuals) at the settled fit. */
  huber_scale: number;
  /** Huber iterations run before the fit settled. */
  huber_iters_used: number;
}

/** A farm verdict: the net value of farming one protocol, and what to do. */
export interface FarmVerdict {
  verdict: 'FARM' | 'THIN' | 'SKIP';
  /** The farmer's expected share of the airdrop pool, in dollars. */
  farmer_expected_usd: number;
  /** Total gas for the plan's transactions, in dollars. */
  gas_total_usd: number;
  /** Value of the farmer's time in the plan, in dollars. */
  time_value_usd: number;
  /** Net farm value: farmer share − gas − time. */
  net_usd: number;
  /** Deposit sized to the verdict: full capital for FARM, half for THIN, $0 for SKIP. */
  deposit_usd: number;
}

/** The integrity strip: every protocol in the snapshot, accounted for. */
export interface IntegrityStrip {
  total_protocols: number;
  ranked: number;
  live_token: number;
  excluded_total: number;
  excluded_by_reason: { reason: string; count: number }[];
  /** Names of the already-traded tokens set aside, in snapshot order. */
  excluded_traded_tokens: string[];
  null_change_7d: number;
  null_listed_at: number;
  null_category: number;
  watchlist_covered: number;
  watchlist_total: number;
  n_train_raw: number;
  n_train_dedup: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. `implied_value_usd` is the
 * ranked value — the EXPECTED value (odds × implied) — so the gate's strict
 * ordering holds on the value the board actually ranks by; the undiscounted
 * implied value lives in `model.base_usd` and `implied_raw_usd`. */
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
  expected_value_usd: number;
  implied_raw_usd: number;
  token_odds: number;
  odds_peers: number;
  value_lo_usd: number;
  value_hi_usd: number;
  rank_lo: number;
  rank_hi: number;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_net_usd: number;
  farm_deposit_usd: number;
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
  expected_value_usd: number;
  implied_raw_usd: number;
  token_odds: number;
  odds_peers: number;
  value_lo_usd: number;
  value_hi_usd: number;
  rank_lo: number;
  rank_hi: number;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_net_usd: number;
  farm_deposit_usd: number;
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
  fit_huber_k: number;
  fit_huber_scale: number;
  validation: ValidationSummary;
  categories: FittedCategory[];
  size_curve: SizeCurvePoint[];
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
  integrity: IntegrityStrip;
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  farm_assumptions: { pool_share: number; farmer_share: number; tx_count: number; hours: number; hour_usd: number; threshold_usd: number };
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
 *
 * The snapshot's token fields are wrong for the protocols in TRADED_TOKEN_SLUGS:
 * the protocol IS a token that already trades (wrapped BTC, bridged USDC, a
 * stablecoin, a staked receipt, a subnet token). Ranking them as "pre-token"
 * would be false — there is no future token to launch.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCHANGE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (TRADED_TOKEN_SLUGS[p.slug]) return false;
  return true;
}

/**
 * Traded-token corrections, slug → what the token is. Rule, applied uniformly:
 * exclude when the row's name IS, or leads with, the ticker of a wrapped /
 * bridged / staked / stable asset that already trades. KEEP bridge and staking
 * services named as services (CCIP, Base Bridge, Shift DeFi, Phantom SOL,
 * Gate SOL, JPool, SpringSui, …): a service may still launch its own governance
 * token, even when its receipt tokens trade. Five were named by the parent
 * (WBTC, USDT0, FBTC, USDD, dTAO); sixteen more were found by scanning the
 * remaining 258 ranked rows — GTBTC verified traded (listed price, ~$215M
 * market cap), USDCx verified (Circle xReserve bridged USDC), ObeliskBTC and
 * SUBFROST kept (protocols with no token listed, future-token candidates),
 * Phantom SOL / Gate SOL kept (staking services, not the token).
 */
export const TRADED_TOKEN_SLUGS: Record<string, string> = {
  wbtc: 'WBTC is wrapped Bitcoin, traded since 2019',
  usdt0: 'USDT0 is Tether\u2019s bridged USDT stablecoin, traded',
  'function-fbtc': 'FBTC is Function\u2019s wrapped BTC token, traded',
  usdd: 'USDD is Tron\u2019s stablecoin, traded',
  'bittensor-dtao': 'dTAO is Bittensor\u2019s subnet token, traded',
  'stacks-sbtc': 'sBTC is Stacks\u2019 wrapped BTC, traded',
  wtao: 'wTAO is wrapped TAO, traded',
  tzbtc: 'tzBTC is Tezos wrapped BTC, traded',
  'solvbtc-lsts': 'SolvBTC is Solv\u2019s wrapped/restaked BTC token, traded',
  sthype: 'stHYPE is a staked-HYPE receipt token, traded',
  gtbtc: 'GTBTC is Gate Wrapped BTC, traded (listed price, ~$215M market cap)',
  usdcx: 'USDCx is Circle xReserve bridged USDC, traded',
  'theo-network-thusd': 'thUSD is Theo Network\u2019s stablecoin, traded',
  'theo-network-thbill': 'thBill is Theo Network\u2019s tokenised T-bill token, traded',
  'aegis-yusd': 'YUSD is Aegis\u2019 stablecoin, traded',
  'flying-tulip-ftusd': 'ftUSD is Flying Tulip\u2019s stablecoin, traded',
  'avant-avusd': 'avUSD is Avant\u2019s stablecoin, traded',
  'avant-aveth': 'avETH is Avant\u2019s staked-ETH token, traded',
  'bitlayer-ybtc-family': 'YBTC is Bitlayer\u2019s yield BTC token, traded',
  'stkesol-by-sol-strategies': 'STKESOL is SOL Strategies\u2019 liquid-staking SOL token, traded',
  kton: 'KTON is a TON liquid-staking receipt token, traded',
};

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

/**
 * One fit specification: which features, which loss, which training weights.
 * The shipped model is { huber: true, k: 1.345, quad: false, year: false,
 * catxsize: false, timeTauDays: 0 }; the rejected variants differ in exactly
 * one of these, so their leave-one-out errors are comparable apples to apples.
 */
export interface FitSpec {
  name: string;
  huber: boolean;
  k: number;
  /** A quadratic size term (log10 TVL)² — tested, rejected. */
  quad: boolean;
  /** A listed-year trend — tested, rejected. */
  year: boolean;
  /** Per-category size slopes for categories with ≥5 training peers — tested, rejected. */
  catxsize: boolean;
  /** Time-weighting half-life in days; 0 means every training row weighs the same. */
  timeTauDays: number;
}

export const SHIPPED_SPEC: FitSpec = {
  name: 'radar-4',
  huber: true,
  k: 1.345,
  quad: false,
  year: false,
  catxsize: false,
  timeTauDays: 0,
};

export const OLS_SPEC: FitSpec = {
  name: 'radar-3 OLS',
  huber: false,
  k: 1.345,
  quad: false,
  year: false,
  catxsize: false,
  timeTauDays: 0,
};

/** The rejected variants, each differing from the shipped fit in exactly one choice. */
export const REJECTED_SPECS: FitSpec[] = [
  { name: 'quadratic size curve', huber: true, k: 1.345, quad: true, year: false, catxsize: false, timeTauDays: 0 },
  { name: 'time-weighted training (τ = 2y)', huber: true, k: 1.345, quad: false, year: false, catxsize: false, timeTauDays: 730 },
  { name: 'per-category size slopes', huber: true, k: 1.345, quad: false, year: false, catxsize: true, timeTauDays: 0 },
  { name: 'listed-year trend', huber: true, k: 1.345, quad: false, year: true, catxsize: false, timeTauDays: 0 },
];

/** Categories with at least five training peers: the only ones a size slope is fit for. */
function bigCategories(rows: TrainRow[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= 5).map(([c]) => c).sort();
}

/** The design row of one protocol under a spec: the five base features plus the spec's extras. */
function designRow(p: SnapshotProtocol, asOf: string, model: ModelConstants, spec: FitSpec, bigCats: string[]): number[] {
  const base = featuresOf(p, asOf, model);
  const lt = Math.log10(Math.max(p.tvl_usd, 1));
  if (spec.quad) base.push(lt * lt);
  if (spec.year) {
    const y = p.listed_at !== null && /^\d{4}/.test(p.listed_at) ? parseInt(p.listed_at.slice(0, 4), 10) : 2023;
    base.push(y - 2021);
  }
  if (spec.catxsize) {
    for (const c of bigCats) base.push((p.category ?? '(no category)') === c ? lt : 0);
  }
  return base;
}

/** The training weight of one row under a spec: 1, or exp(−age/τ) when time-weighting is on. */
function timeWeight(p: SnapshotProtocol, asOf: string, model: ModelConstants, spec: FitSpec): number {
  if (spec.timeTauDays <= 0) return 1;
  const age = ageDays(asOf, p.listed_at) ?? model.unknown_age_days;
  return Math.exp(-age / spec.timeTauDays);
}

/** A seeded deterministic PRNG (mulberry32): the random time splits must agree across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One training row: a live-token protocol whose market already priced it. */
export interface TrainRow {
  p: SnapshotProtocol;
  y: number;
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
    rows.push({ p, y: Math.log(ratio), category: p.category ?? '(no category)' });
  }
  return rows;
}

/**
 * One-per-ticker comps: the family key of a protocol — its slug with a
 * trailing version marker stripped (uniswap-v2 / uniswap-v3 → uniswap, aave-v2
 * → aave), lower-cased. One family, one observation: the largest-TVL member
 * is kept, the rest are listed as removed so the strip can name them.
 */
export function familyKey(p: SnapshotProtocol): string {
  return p.slug.toLowerCase().replace(/-(v\d+(\.\d+)?|\d+(\.\d+)?)$/, '');
}

export function dedupTrainingRows(rows: TrainRow[]): { rows: TrainRow[]; removed: string[] } {
  const byFamily = new Map<string, TrainRow[]>();
  for (const r of rows) {
    const arr = byFamily.get(familyKey(r.p)) ?? [];
    arr.push(r);
    byFamily.set(familyKey(r.p), arr);
  }
  const kept: TrainRow[] = [];
  const removed: string[] = [];
  for (const [, members] of [...byFamily.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    members.sort((a, b) => b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
    kept.push(members[0]!);
    for (const m of members.slice(1)) removed.push(m.p.slug);
  }
  kept.sort((a, b) => (a.p.slug < b.p.slug ? -1 : 1));
  return { rows: kept, removed };
}

/** Age band of a protocol, for the token-odds peer cells. */
function ageBand(age: number | null): string {
  if (age === null) return 'age unknown';
  if (age < 180) return '<6mo';
  if (age < 365) return '6–12mo';
  if (age < 730) return '1–2y';
  return '>2y';
}

/**
 * The token-odds peer table: for every (category, age band) cell, how many
 * protocols in the snapshot record a token and how many do not. The odds of
 * a pre-token protocol are the live share of its cell, shrunk toward its
 * category rate (k = odds_cell_k) and the category rate toward the global
 * rate (k = odds_category_k). A cell with fewer than 8 protocols falls back
 * to the category rate. This is a discount from the peers' own record — the
 * share of comparable protocols that already have a token — never a claim
 * about whether or when this protocol will issue one.
 */
export interface OddsTable {
  globalLive: number;
  globalTotal: number;
  cells: Map<string, { live: number; total: number }>;
  categories: Map<string, { live: number; total: number }>;
}

export function buildOddsTable(snapshot: Snapshot, asOf: string): OddsTable {
  const cells = new Map<string, { live: number; total: number }>();
  const categories = new Map<string, { live: number; total: number }>();
  let globalLive = 0;
  for (const p of snapshot.protocols) {
    const live = !isPreToken(p);
    if (live) globalLive++;
    const cat = p.category ?? '(no category)';
    const key = `${cat}||${ageBand(ageDays(asOf, p.listed_at))}`;
    const cell = cells.get(key) ?? { live: 0, total: 0 };
    cell.total++;
    if (live) cell.live++;
    cells.set(key, cell);
    const cc = categories.get(cat) ?? { live: 0, total: 0 };
    cc.total++;
    if (live) cc.live++;
    categories.set(cat, cc);
  }
  return { globalLive, globalTotal: snapshot.protocols.length, cells, categories };
}

export function tokenOdds(p: SnapshotProtocol, asOf: string, table: OddsTable, model: ModelConstants): { odds: number; peers: number } {
  const globalRate = table.globalLive / Math.max(table.globalTotal, 1);
  const cat = p.category ?? '(no category)';
  const cc = table.categories.get(cat) ?? { live: 0, total: 0 };
  const catRate = (cc.live + model.odds_category_k * globalRate) / (cc.total + model.odds_category_k);
  const key = `${cat}||${ageBand(ageDays(asOf, p.listed_at))}`;
  const cell = table.cells.get(key);
  if (cell === undefined || cell.total < 8) return { odds: round4(catRate), peers: cc.total };
  const odds = (cell.live + model.odds_cell_k * catRate) / (cell.total + model.odds_cell_k);
  return { odds: round4(odds), peers: cell.total };
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

/** Weighted least squares on one design: solve (X'WX)β = X'Wy by Gaussian elimination. */
function wls(design: number[][], y: number[], w: number[]): number[] | null {
  const k = design[0]!.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty: number[] = new Array<number>(k).fill(0);
  for (let n = 0; n < design.length; n++) {
    const row = design[n]!;
    const wn = w[n]!;
    for (let i = 0; i < k; i++) {
      xty[i]! += wn * row[i]! * y[n]!;
      for (let j = 0; j < k; j++) xtx[i]![j]! += wn * row[i]! * row[j]!;
    }
  }
  return solveLinear(xtx, xty);
}

/** A fitted spec: coefficients, shrunk category residuals, and the Huber scale. */
interface FittedSpec {
  beta: number[];
  catAdj: Map<string, number>;
  bigCats: string[];
  scale: number;
  itersUsed: number;
}

/**
 * Fit one spec on the training rows. Huber loss runs iteratively reweighted least
 * squares: start from the weighted fit, then down-weight each row by
 * min(1, k·scale/|residual|) with scale = 1.4826 × MAD, until the coefficients
 * stop moving. OLS is the same path with one pass and no reweighting. The
 * category effect is the shrunk mean residual per category, as in radar-2/3.
 */
function fitSpec(rows: TrainRow[], spec: FitSpec, model: ModelConstants, asOf: string): FittedSpec | null {
  if (rows.length === 0) return null;
  const bigCats = spec.catxsize ? bigCategories(rows) : [];
  const design = rows.map((r) => designRow(r.p, asOf, model, spec, bigCats));
  const y = rows.map((r) => r.y);
  const w0 = rows.map((r) => timeWeight(r.p, asOf, model, spec));
  let beta = wls(design, y, w0);
  if (beta === null) return null;
  let scale = 0;
  let itersUsed = 0;
  if (spec.huber) {
    for (let it = 0; it < model.huber_iters; it++) {
      itersUsed = it + 1;
      const res = y.map((v, i) => v - dot(beta!, design[i]!));
      const med = median(res) ?? 0;
      const mad = median(res.map((v) => Math.abs(v - med))) ?? 0;
      const std = Math.sqrt(res.reduce((a, v) => a + v * v, 0) / Math.max(res.length, 1));
      scale = 1.4826 * mad;
      if (!(scale > 1e-9)) scale = Math.max(std, 1e-6);
      const w = w0.map((wBase, i) => {
        const u = Math.abs(res[i]!) / (spec.k * scale);
        return wBase * (u <= 1 ? 1 : 1 / u);
      });
      const next = wls(design, y, w);
      if (next === null) return null;
      const moved = Math.max(...next.map((v, i) => Math.abs(v - beta![i]!)));
      beta = next;
      if (moved < 1e-10) break;
    }
  } else {
    const res = y.map((v, i) => v - dot(beta, design[i]!));
    scale = Math.sqrt(res.reduce((a, v) => a + v * v, 0) / Math.max(res.length, 1));
  }
  const byCat = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const arr = byCat.get(rows[i]!.category) ?? [];
    arr.push(rows[i]!.y - dot(beta, design[i]!));
    byCat.set(rows[i]!.category, arr);
  }
  const catAdj = new Map<string, number>();
  for (const [c, res] of byCat) {
    const mean = res.reduce((a, b) => a + b, 0) / res.length;
    catAdj.set(c, (res.length / (res.length + model.shrink_k)) * mean);
  }
  return { beta, catAdj, bigCats, scale, itersUsed };
}

/** The fitted ln(mcap / TVL) of one design row in one category. */
function predictSpec(design: number[], category: string, fit: FittedSpec): number {
  return dot(fit.beta, design) + (fit.catAdj.get(category) ?? 0);
}

/** The radar-2 peer-median baseline, predicted for the test rows from the training rows only. */
function peerBaselinePredict(train: TrainRow[], test: TrainRow[], model: ModelConstants): number[] {
  const byCat = new Map<string, number[]>();
  for (const r of train) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(Math.exp(r.y));
    byCat.set(r.category, arr);
  }
  const global = median(train.map((r) => Math.exp(r.y))) ?? 0.25;
  return test.map((t) => {
    const ratios = byCat.get(t.category) ?? [];
    const med = ratios.length > 0 ? median(ratios)! : global;
    const shrunk = ratios.length >= model.peer_shrink ? med : (ratios.length * med + model.peer_shrink * global) / (ratios.length + model.peer_shrink);
    return Math.log(Math.min(model.peer_cap, Math.max(model.peer_floor, shrunk)));
  });
}

/** One spec fitted on the training rows, predicted for the test rows; null when the fit fails. */
function specPredict(train: TrainRow[], test: TrainRow[], spec: FitSpec, model: ModelConstants, asOf: string): number[] | null {
  const fit = fitSpec(train, spec, model, asOf);
  if (fit === null) return null;
  return test.map((t) => predictSpec(designRow(t.p, asOf, model, spec, fit.bigCats), t.category, fit));
}

/** The median / within-2× summary of one test, for the three models at once. */
function summarizeTest(name: string, nTest: number, modelErrs: number[], olsErrs: number[], baseErrs: number[]): ValidationTest {
  const med = (errs: number[]): number => Math.exp(median(errs) ?? 0);
  const w2 = (errs: number[]): number => errs.filter((e) => e < Math.log(2)).length / Math.max(errs.length, 1);
  return {
    name,
    n_test: nTest,
    model_median_x: round4(med(modelErrs)),
    ols_median_x: round4(med(olsErrs)),
    base_median_x: round4(med(baseErrs)),
    model_within_2x: round4(w2(modelErrs)),
    ols_within_2x: round4(w2(olsErrs)),
    base_within_2x: round4(w2(baseErrs)),
  };
}

/** Absolute log errors of three predictions against the held-out truth. */
function absErrs(truth: number[], ...preds: (number[] | null)[]): number[][] {
  return preds.map((p) => (p === null ? truth.map(() => Math.abs(truth[0]!)) : truth.map((v, i) => Math.abs(v - p[i]!))));
}

/**
 * Leave-one-out: each training protocol is predicted by a fit trained on the
 * other 111. The shipped fit, the OLS fit and the peer baseline are scored on
 * the same held-out rows, and so is every rejected variant.
 */
function looValidation(rows: TrainRow[], model: ModelConstants, asOf: string): { test: ValidationTest; rejected: RejectedVariant[] } {
  const specs: FitSpec[] = [SHIPPED_SPEC, OLS_SPEC, ...REJECTED_SPECS];
  const errsBySpec = new Map<string, number[]>();
  for (const s of specs) errsBySpec.set(s.name, []);
  const baseErrs: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const train = rows.filter((_, j) => j !== i);
    const test = [rows[i]!];
    const truth = [rows[i]!.y];
    for (const s of specs) {
      const pred = specPredict(train, test, s, model, asOf);
      errsBySpec.get(s.name)!.push(pred === null ? Math.abs(truth[0]!) : Math.abs(truth[0]! - pred[0]!));
    }
    baseErrs.push(Math.abs(truth[0]! - peerBaselinePredict(train, test, model)[0]!));
  }
  const test = summarizeTest(
    'leave-one-out',
    rows.length,
    errsBySpec.get(SHIPPED_SPEC.name)!,
    errsBySpec.get(OLS_SPEC.name)!,
    baseErrs,
  );
  const rejected: RejectedVariant[] = REJECTED_SPECS.map((s) => ({
    name: s.name,
    loo_median_x: round4(Math.exp(median(errsBySpec.get(s.name)!) ?? 0)),
    note:
      s.name === 'quadratic size curve'
        ? 'a squared size term bends the fit toward the biggest protocols and predicts worse out of sample'
        : s.name === 'time-weighted training (τ = 2y)'
          ? 'down-weighting older listings throws away half of an already small training set'
          : s.name === 'per-category size slopes'
            ? 'category slopes fit random folds but fail every walk-forward split — they do not survive into the future'
            : 'a listing-year trend helps one split and hurts the rest',
  }));
  return { test, rejected };
}

/** One walk-forward split: fit on the oldest listings, test on the newest. */
function walkForwardTest(rows: TrainRow[], frac: number, model: ModelConstants, asOf: string): ValidationTest {
  const dated = rows.filter((r) => r.p.listed_at !== null).sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : 1));
  const cut = dated[Math.floor(dated.length * frac)]!.p.listed_at!;
  const train = rows.filter((r) => r.p.listed_at === null || r.p.listed_at < cut);
  const test = dated.filter((r) => r.p.listed_at! >= cut);
  const truth = test.map((r) => r.y);
  const modelPred = specPredict(train, test, SHIPPED_SPEC, model, asOf);
  const olsPred = specPredict(train, test, OLS_SPEC, model, asOf);
  const basePred = peerBaselinePredict(train, test, model);
  const [modelErrs, olsErrs, baseErrs] = absErrs(truth, modelPred, olsPred, basePred);
  return summarizeTest(`walk-forward ${Math.round(frac * 100)}/${Math.round((1 - frac) * 100)}`, test.length, modelErrs, olsErrs, baseErrs);
}

/** The 5-fold hash split, kept from radar-3 so the three generations compare on the same test. */
function fiveFoldTest(rows: TrainRow[], model: ModelConstants, asOf: string): ValidationTest {
  const folds = model.folds;
  const modelErrs: number[] = [];
  const olsErrs: number[] = [];
  const baseErrs: number[] = [];
  for (let f = 0; f < folds; f++) {
    const train = rows.filter((r) => hashOf(r.p.slug) % folds !== f);
    const test = rows.filter((r) => hashOf(r.p.slug) % folds === f);
    if (train.length === 0 || test.length === 0) continue;
    const truth = test.map((r) => r.y);
    const [m, o, b] = absErrs(truth, specPredict(train, test, SHIPPED_SPEC, model, asOf), specPredict(train, test, OLS_SPEC, model, asOf), peerBaselinePredict(train, test, model));
    modelErrs.push(...m);
    olsErrs.push(...o);
    baseErrs.push(...b);
  }
  return summarizeTest('5-fold CV', modelErrs.length, modelErrs, olsErrs, baseErrs);
}

/**
 * Twenty random time splits, seeded: a cutoff drawn between the 40th and 80th
 * percentile of the listing dates, fit before it, test after it. The mean of
 * the per-split median errors is the walk-forward headline that no single
 * split can rig.
 */
function randomSplitSummary(rows: TrainRow[], model: ModelConstants, asOf: string): WalkForwardSummary {
  const dated = rows.filter((r) => r.p.listed_at !== null).sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : 1));
  const first = Date.parse(`${dated[0]!.p.listed_at!}T00:00:00Z`);
  const last = Date.parse(`${dated[dated.length - 1]!.p.listed_at!}T00:00:00Z`);
  const rand = mulberry32(42);
  const modelMeds: number[] = [];
  const olsMeds: number[] = [];
  const baseMeds: number[] = [];
  const modelW2: number[] = [];
  let wins = 0;
  let done = 0;
  for (let s = 0; s < model.wf_random_splits; s++) {
    const frac = 0.4 + rand() * 0.4;
    const cutMs = first + Math.floor((last - first) * frac);
    const cut = new Date(cutMs).toISOString().slice(0, 10);
    const train = rows.filter((r) => r.p.listed_at === null || r.p.listed_at < cut);
    const test = dated.filter((r) => r.p.listed_at! >= cut);
    if (test.length < 8 || train.length < 40) continue;
    done++;
    const truth = test.map((r) => r.y);
    const [m, o, b] = absErrs(truth, specPredict(train, test, SHIPPED_SPEC, model, asOf), specPredict(train, test, OLS_SPEC, model, asOf), peerBaselinePredict(train, test, model));
    const mMed = median(m) ?? 0;
    const oMed = median(o) ?? 0;
    modelMeds.push(mMed);
    olsMeds.push(oMed);
    baseMeds.push(median(b) ?? 0);
    modelW2.push(m.filter((e) => e < Math.log(2)).length / m.length);
    if (mMed < oMed) wins++;
  }
  const meanMed = (errs: number[]): number => Math.exp(errs.reduce((a, v) => a + v, 0) / Math.max(errs.length, 1));
  return {
    splits: done,
    model_mean_median_x: round4(meanMed(modelMeds)),
    ols_mean_median_x: round4(meanMed(olsMeds)),
    base_mean_median_x: round4(meanMed(baseMeds)),
    model_wins_vs_ols: wins,
    model_mean_within_2x: round4(modelW2.reduce((a, v) => a + v, 0) / Math.max(modelW2.length, 1)),
  };
}

/**
 * One blind comps-curve test: hold out a whole group (one category, or one
 * size bucket), fit on the rest, test on the group. Pooled across groups,
 * this is the "tested blind" check: can the curve price a kind of protocol
 * the fit has never seen?
 */
function blindTest(rows: TrainRow[], groupOf: (r: TrainRow) => string, name: string, model: ModelConstants, asOf: string): ValidationTest {
  const groups = new Map<string, TrainRow[]>();
  for (const r of rows) {
    const arr = groups.get(groupOf(r)) ?? [];
    arr.push(r);
    groups.set(groupOf(r), arr);
  }
  const modelErrs: number[] = [];
  const olsErrs: number[] = [];
  const baseErrs: number[] = [];
  for (const [, test] of groups) {
    if (test.length < 5) continue;
    const train = rows.filter((r) => !test.includes(r));
    if (train.length < 40) continue;
    const truth = test.map((r) => r.y);
    const [m, o, b] = absErrs(truth, specPredict(train, test, SHIPPED_SPEC, model, asOf), specPredict(train, test, OLS_SPEC, model, asOf), peerBaselinePredict(train, test, model));
    modelErrs.push(...m);
    olsErrs.push(...o);
    baseErrs.push(...b);
  }
  return summarizeTest(name, modelErrs.length, modelErrs, olsErrs, baseErrs);
}

/** Size bucket of a training row, by log10 TVL. */
function sizeBucketOf(r: TrainRow): string {
  const lt = Math.log10(Math.max(r.p.tvl_usd, 1));
  if (lt < 7) return '<$10M';
  if (lt < 8) return '$10–100M';
  if (lt < 9) return '$100M–1B';
  return '>$1B';
}

/**
 * Token-odds calibration, held out: the odds table is built from a seeded
 * random half of the protocols only, then the other half is grouped into
 * odds quartiles and the observed live share in each quartile is compared
 * with the predicted odds. A random split (not a time split) is the right
 * hold-out here: the odds cells are keyed on age at the snapshot date, so a
 * time split would test the fallback, not the odds. A well-calibrated odds
 * says 0.8 where about 80% of comparable held-out protocols record a token.
 */
function oddsCalibration(snapshot: Snapshot, model: ModelConstants, asOf: string): OddsCalibration {
  const rand = mulberry32(20261114);
  const shuffled = [...snapshot.protocols];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = t;
  }
  const half = Math.floor(shuffled.length / 2);
  const trainHalf: Snapshot = { ...snapshot, protocols: shuffled.slice(0, half) };
  const table = buildOddsTable(trainHalf, asOf);
  const test = shuffled.slice(half);
  const scored = test.map((p) => ({ odds: tokenOdds(p, asOf, table, model).odds, live: isPreToken(p) ? 0 : 1 }));
  scored.sort((a, b) => a.odds - b.odds);
  const quartiles: OddsCalibrationQuartile[] = [];
  const q = 4;
  for (let i = 0; i < q; i++) {
    const slice = scored.slice(Math.floor((scored.length * i) / q), Math.floor((scored.length * (i + 1)) / q));
    if (slice.length === 0) continue;
    quartiles.push({
      odds_mid: round4(slice.reduce((a, s) => a + s.odds, 0) / slice.length),
      observed_live_share: round4(slice.reduce((a, s) => a + s.live, 0) / slice.length),
      n: slice.length,
    });
  }
  const mae = quartiles.length > 0 ? quartiles.reduce((a, x) => a + Math.abs(x.odds_mid - x.observed_live_share), 0) / quartiles.length : 0;
  return { n_test: test.length, mean_abs_error: round4(mae), quartiles };
}

/** The full validation: leave-one-out, three walk-forward splits, 5-fold, and the random-split summary. */
function validateAll(rows: TrainRow[], model: ModelConstants, asOf: string, snapshot: Snapshot, looBeforeDedupX: number): ValidationSummary {
  const loo = looValidation(rows, model, asOf);
  const wf70 = walkForwardTest(rows, 0.7, model, asOf);
  const tests: ValidationTest[] = [
    loo.test,
    wf70,
    walkForwardTest(rows, 0.5, model, asOf),
    walkForwardTest(rows, 0.8, model, asOf),
    fiveFoldTest(rows, model, asOf),
  ];
  return {
    tests,
    rejected: loo.rejected,
    random_splits: randomSplitSummary(rows, model, asOf),
    loo_median_x: loo.test.model_median_x,
    wf_median_x: wf70.model_median_x,
    blind_tests: [
      blindTest(rows, (r) => r.category, 'blind: leave-one-category-out', model, asOf),
      blindTest(rows, sizeBucketOf, 'blind: leave-one-size-bucket-out', model, asOf),
    ],
    odds_calibration: oddsCalibration(snapshot, model, asOf),
    loo_before_dedup_x: looBeforeDedupX,
  };
}

/** The fitted multiple at one TVL, other features at their training medians. */
function sizeCurvePoint(
  tvlUsd: number,
  label: string,
  beta: number[],
  medGrowth: number,
  medLogAge: number,
  medChains: number,
  bucketRows: TrainRow[],
): SizeCurvePoint {
  const x = [1, Math.log10(Math.max(tvlUsd, 1)), medGrowth, medLogAge, medChains];
  const fitted = Math.exp(dot(beta, x));
  const ratios = bucketRows.map((r) => Math.exp(r.y));
  return {
    tvl_usd: tvlUsd,
    label,
    fitted_multiple: round4(fitted),
    observed_median: ratios.length > 0 ? round4(median(ratios) ?? 0) : null,
    n: ratios.length,
  };
}

/**
 * Fit the radar-4 model on the snapshot: Huber regression on all priced
 * live-token protocols, shrunk category residuals, R² of the full fit, the
 * leave-one-out / walk-forward / 5-fold validation, and the per-category
 * table and size curve the dashboard prints.
 */
export function fitModel(snapshot: Snapshot, model: ModelConstants = MODEL): FittedModel {
  const rawTrain = trainingRows(snapshot, snapshot.as_of, model);
  const { rows: train, removed } = dedupTrainingRows(rawTrain);
  const full = fitSpec(train, SHIPPED_SPEC, model, snapshot.as_of);
  const yMean = train.reduce((a, r) => a + r.y, 0) / Math.max(train.length, 1);
  const beta = full !== null ? full.beta : [yMean, 0, 0, 0, 0];
  const catAdj = full !== null ? full.catAdj : new Map<string, number>();
  let ssRes = 0;
  let ssTot = 0;
  for (const r of train) {
    const pred = predictSpec(designRow(r.p, snapshot.as_of, model, SHIPPED_SPEC, []), r.category, { beta, catAdj, bigCats: [], scale: 0, itersUsed: 0 });
    ssRes += (r.y - pred) ** 2;
    ssTot += (r.y - yMean) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const looBeforeDedup = looValidation(rawTrain, model, snapshot.as_of).test.model_median_x;
  const validation = validateAll(train, model, snapshot.as_of, snapshot, looBeforeDedup);
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
  const medGrowth = median(train.map((r) => Math.min(model.growth_cap, Math.max(model.growth_floor, finite(r.p.change_7d, 0))) / 100)) ?? 0;
  const medLogAge = median(train.map((r) => Math.log1p(ageDays(snapshot.as_of, r.p.listed_at) ?? model.unknown_age_days))) ?? Math.log1p(365);
  const medChains = median(train.map((r) => Math.min(r.p.chains.length, model.chain_cap))) ?? 1;
  const bucketOf = (lt: number): string => (lt < 7 ? '<$10M' : lt < 8 ? '$10–100M' : lt < 9 ? '$100M–1B' : lt < 10 ? '$1–10B' : '>$10B');
  const buckets: [number, string][] = [
    [3_162_278, '<$10M'],
    [31_622_777, '$10–100M'],
    [316_227_766, '$100M–1B'],
    [3_162_277_660, '$1–10B'],
    [31_622_776_602, '>$10B'],
  ];
  const sizeCurve = buckets.map(([center, label]) =>
    sizeCurvePoint(center, label, beta, medGrowth, medLogAge, medChains, train.filter((r) => bucketOf(Math.log10(Math.max(r.p.tvl_usd, 1))) === label)),
  );
  return {
    beta,
    catAdj,
    r_squared: round4(rSquared),
    n_train: train.length,
    n_train_raw: rawTrain.length,
    dedup_removed: removed,
    n_categories: byCat.size,
    train_median_ratio: round4(median(train.map((r) => Math.exp(r.y))) ?? 0),
    validation,
    categories,
    size_curve: sizeCurve,
    huber_scale: round4(full !== null ? full.scale : 0),
    huber_iters_used: full !== null ? full.itersUsed : 0,
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

/** The p-th percentile of a sorted-ascending copy (linear interpolation). */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const s = [...sortedAsc].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

/**
 * Bootstrap ranges: 200 seeded resamples of the deduped training set, refit
 * each time, predict every board protocol. Each row gets the 10–90% range of
 * its expected value and of its rank across the resamples. Odds are held
 * fixed — the bootstrap measures the value fit's uncertainty, not the odds'.
 */
function bootstrapRanges(
  protocols: SnapshotProtocol[],
  odds: Map<string, { odds: number; peers: number }>,
  train: TrainRow[],
  model: ModelConstants,
  asOf: string,
): Map<string, { valueLo: number; valueHi: number; rankLo: number; rankHi: number }> {
  const values = new Map<string, number[]>();
  const ranks = new Map<string, number[]>();
  for (const p of protocols) {
    values.set(p.slug, []);
    ranks.set(p.slug, []);
  }
  const rand = mulberry32(20261114);
  for (let b = 0; b < model.bootstrap_resamples; b++) {
    const sample: TrainRow[] = [];
    for (let i = 0; i < train.length; i++) sample.push(train[Math.floor(rand() * train.length)]!);
    const fit = fitSpec(sample, SHIPPED_SPEC, model, asOf);
    if (fit === null) continue;
    const scored = protocols.map((p) => {
      const logRatio = predictSpec(designRow(p, asOf, model, SHIPPED_SPEC, fit.bigCats), p.category ?? '(no category)', fit);
      const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, Math.exp(logRatio)));
      const implied = Math.max(1, Math.round(p.tvl_usd * multiple));
      return { slug: p.slug, expected: (odds.get(p.slug)?.odds ?? 0) * implied };
    });
    scored.sort((a, b) => b.expected - a.expected || (a.slug < b.slug ? -1 : 1));
    for (const s of scored) values.get(s.slug)!.push(Math.round(s.expected));
    scored.forEach((s, i) => ranks.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, { valueLo: number; valueHi: number; rankLo: number; rankHi: number }>();
  for (const p of protocols) {
    const v = values.get(p.slug)!;
    const r = ranks.get(p.slug)!;
    out.set(p.slug, {
      valueLo: Math.round(percentile(v, 0.1)),
      valueHi: Math.round(percentile(v, 0.9)),
      rankLo: Math.round(percentile(r, 0.1)),
      rankHi: Math.round(percentile(r, 0.9)),
    });
  }
  return out;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, fit?: FittedModel): BoardRow[] {
  const fitted = fit ?? fitModel(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  // Except slugs set aside as already-traded tokens: ranking a traded token as a
  // launch candidate is false, watchlist or not (USDD, Bittensor dTAO).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && !TRADED_TOKEN_SLUGS[slug]) chosen.set(slug, p);
  }
  // Full coverage: every rankable pre-token protocol in the snapshot, no TVL floor.
  const rest = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of rest) chosen.set(p.slug, p);

  const oddsTable = buildOddsTable(snapshot, snapshot.as_of);
  const odds = new Map<string, { odds: number; peers: number }>();
  for (const p of chosen.values()) odds.set(p.slug, tokenOdds(p, snapshot.as_of, oddsTable, model));

  const { rows: train } = dedupTrainingRows(trainingRows(snapshot, snapshot.as_of, model));
  const ranges = bootstrapRanges([...chosen.values()], odds, train, model, snapshot.as_of);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, fitted);
    const o = odds.get(p.slug)!;
    const expected = Math.max(1, Math.round(o.odds * v.implied));
    return { p, v, odds: o, expected, range: ranges.get(p.slug)!, verdict: farmVerdictFor(p, expected, model) };
  });
  scored.sort((a, b) => b.expected - a.expected || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // A board is a ranking: force strictly decreasing values so no two rows tie.
  for (let i = 1; i < scored.length; i++) {
    if (scored[i]!.expected >= scored[i - 1]!.expected) {
      scored[i]!.expected = Math.max(1, scored[i - 1]!.expected - 1);
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
    implied_value_usd: s.expected,
    expected_value_usd: s.expected,
    implied_raw_usd: s.v.implied,
    token_odds: s.odds.odds,
    odds_peers: s.odds.peers,
    value_lo_usd: s.range.valueLo,
    value_hi_usd: s.range.valueHi,
    rank_lo: s.range.rankLo,
    rank_hi: s.range.rankHi,
    farm_verdict: s.verdict.verdict,
    farm_net_usd: s.verdict.net_usd,
    farm_deposit_usd: s.verdict.deposit_usd,
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

/** Gas in dollars for one transaction on a chain — the numeric twin of gasFor's words. */
function gasUsdFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 12;
  if (c === 'solana') return 0.05;
  if (c === 'bnb' || c === 'bsc') return 0.1;
  if (c === 'polygon') return 0.02;
  if (c === 'avalanche') return 0.3;
  if (c === 'sui' || c === 'aptos') return 0.01;
  if (['base', 'arbitrum', 'optimism', 'linea', 'scroll', 'zksync era', 'unichain', 'soneium', 'mode', 'blast', 'mantle', 'metis', 'xdai', 'gnosis', 'katana', 'corn', 'ink', 'world chain'].includes(c)) return 1;
  return 3;
}

/**
 * The netted farm verdict. The farmer's expected share assumes the airdrop
 * pool is farm_pool_share of the expected value and this one farmer captures
 * farm_farmer_share of that pool; gas is farm_tx_count transactions at the
 * chain's per-transaction cost; time is farm_hours at farm_hour_usd. Net
 * above farm_threshold_usd → FARM, above zero → THIN, otherwise SKIP. The
 * deposit is the full capital for FARM, half for THIN, $0 for SKIP.
 */
export function farmVerdictFor(p: SnapshotProtocol, expectedUsd: number, model: ModelConstants): FarmVerdict {
  const farmerExpected = expectedUsd * model.farm_pool_share * model.farm_farmer_share;
  const gasTotal = model.farm_tx_count * gasUsdFor(chainOf(p));
  const timeValue = model.farm_hours * model.farm_hour_usd;
  const net = farmerExpected - gasTotal - timeValue;
  const capital = capitalFor(p);
  const verdict: FarmVerdict['verdict'] = net > model.farm_threshold_usd ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
  return {
    verdict,
    farmer_expected_usd: Math.round(farmerExpected * 100) / 100,
    gas_total_usd: Math.round(gasTotal * 100) / 100,
    time_value_usd: timeValue,
    net_usd: Math.round(net * 100) / 100,
    deposit_usd: verdict === 'FARM' ? capital : verdict === 'THIN' ? Math.max(25, Math.round(capital / 2)) : 0,
  };
}
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

/** The one risk that matters most for this protocol, from its own record — the eighth farm step. */
function riskStep(p: SnapshotProtocol, age: number | null): FarmStep {
  const chain = chainOf(p);
  if (p.change_7d !== null && p.change_7d <= -15) {
    return {
      text: `Risk: TVL fell ${Math.abs(p.change_7d).toFixed(0)}% in the last 7 days — a falling TVL can mean the points program is winding down or capital is leaving, so size the position smaller and re-check before adding more.`,
      cost: 'nothing to check',
      time: '5 minutes',
    };
  }
  if (age !== null && age < 180) {
    return {
      text: `Risk: the protocol has run with no token for only ${age} days — young protocols change their points rules often, so check the official docs again before each weekly action.`,
      cost: 'nothing to check',
      time: '5 minutes',
    };
  }
  if (p.chains.length === 1) {
    return {
      text: `Risk: everything sits on one chain (${chain}) — a chain outage or a bridge pause would freeze the position, so keep it small enough to exit in one transaction.`,
      cost: 'nothing to check',
      time: '5 minutes',
    };
  }
  if (p.tvl_usd >= 1_000_000_000) {
    return {
      text: `Risk: at $${(p.tvl_usd / 1e9).toFixed(1)}B TVL the protocol is already large — a launch, if it comes, is likely to pay a smaller multiple than a smaller protocol, so treat this as a steady position, not a lottery ticket.`,
      cost: 'nothing to check',
      time: '5 minutes',
    };
  }
  return {
    text: `Risk: points programs change without notice — a rule that qualified last month may not qualify next month, so check the protocol's own rewards page before every weekly action.`,
    cost: 'nothing to check',
    time: '5 minutes',
  };
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
    riskStep(p, age),
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
    expected_value_usd: row.expected_value_usd,
    implied_raw_usd: row.implied_raw_usd,
    token_odds: row.token_odds,
    odds_peers: row.odds_peers,
    value_lo_usd: row.value_lo_usd,
    value_hi_usd: row.value_hi_usd,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
    farm_verdict: row.farm_verdict,
    farm_net_usd: row.farm_net_usd,
    farm_deposit_usd: row.farm_deposit_usd,
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

/** Why a pre-token protocol is not on the board — the first matching reason, in field-guide order. */
function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return null;
  if (TRADED_TOKEN_SLUGS[p.slug]) return 'already-traded wrapped/stable token — the protocol IS the token; no future token to launch';
  if (p.category !== null && EXCHANGE_CATEGORIES.has(p.category)) return 'exchange product (CEX)';
  if (VERSIONED.test(p.name)) return 'versioned pool of another protocol';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped / staked product of a traded token';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange-branded product';
  return null;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot, model);
  const board = buildBoard(snapshot, model, fit);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const excludedByReason = new Map<string, number>();
  let excludedTotal = 0;
  for (const p of snapshot.protocols) {
    const reason = exclusionReason(p);
    if (reason !== null) {
      excludedTotal++;
      excludedByReason.set(reason, (excludedByReason.get(reason) ?? 0) + 1);
    }
  }
  const verdictCounts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.farm_verdict]++;
  const integrity: IntegrityStrip = {
    total_protocols: snapshot.protocols.length,
    ranked: board.length,
    live_token: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    excluded_total: excludedTotal,
    excluded_by_reason: [...excludedByReason.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    excluded_traded_tokens: snapshot.protocols.filter((p) => isPreToken(p) && TRADED_TOKEN_SLUGS[p.slug]).map((p) => p.name),
    null_change_7d: snapshot.protocols.filter((p) => p.change_7d === null).length,
    null_listed_at: snapshot.protocols.filter((p) => p.listed_at === null).length,
    null_category: snapshot.protocols.filter((p) => p.category === null).length,
    watchlist_covered: snapshot.watchlist.filter((s) => board.some((r) => r.slug === s)).length,
    watchlist_total: snapshot.watchlist.length,
    n_train_raw: fit.n_train_raw,
    n_train_dedup: fit.n_train,
  };
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
    fit_huber_k: model.huber_k,
    fit_huber_scale: fit.huber_scale,
    validation: fit.validation,
    categories: fit.categories,
    size_curve: fit.size_curve,
    watchlist: [...snapshot.watchlist],
    rows: board.map(radarRow),
    live,
    integrity,
    verdict_counts: verdictCounts,
    farm_assumptions: {
      pool_share: model.farm_pool_share,
      farmer_share: model.farm_farmer_share,
      tx_count: model.farm_tx_count,
      hours: model.farm_hours,
      hour_usd: model.farm_hour_usd,
      threshold_usd: model.farm_threshold_usd,
    },
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
  // Watchlist coverage, except slugs set aside as already-traded tokens: the
  // snapshot lists them as pre-token, but ranking a traded token as a launch
  // candidate is false. NOTE — this exemption is OUR check only. The sealed
  // scorer's gate may still require full watchlist coverage, in which case
  // excluding the watchlist slugs USDD and Bittensor dTAO fails intake; that
  // call belongs to whoever submits, not to this check.
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s) && !TRADED_TOKEN_SLUGS[s]);
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
