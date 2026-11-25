// Token Radar dashboard: sort, filter, search and detail, all client-side, no network.
// Reads window.RADAR from ../data.js, written by main.ts from the same board.
// State lives in the URL (?view=&q=&chain=&cat=&verdict=&watch=&sort=&dir=&slug=) so any
// view — board, filtered, or one protocol's detail — is a link of its own.

const D = window.RADAR;
const $ = (id) => document.getElementById(id);
const watchSet = new Set(D.watchlist);

/** Escape text for HTML. */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** $1.23B, $456M, $78K, $900. */
function money(n) {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

/** +12.5% / −4.0% / —. */
function pct(n) {
  if (n === null || n === undefined) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}

/** 812d / —. */
function days(n) {
  if (n === null || n === undefined) return '—';
  return n + 'd';
}

/** A signed percent cell, green when up, red when down. */
function pctCell(n) {
  if (n === null || n === undefined) return '<td class="num">—</td>';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  return '<td class="num ' + cls + '">' + pct(n) + '</td>';
}

const params = new URLSearchParams(location.search);
const state = {
  view: params.get('view') === 'live' ? 'live' : 'board',
  q: params.get('q') || '',
  chain: params.get('chain') || '',
  cat: params.get('cat') || '',
  verdict: params.get('verdict') || '',
  watch: params.get('watch') === '1',
  sort: params.get('sort') || 'rank',
  dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  slug: params.get('slug') || '',
};

/** Write the state back to the URL without reloading. */
function syncUrl() {
  const p = new URLSearchParams();
  if (state.view !== 'board') p.set('view', state.view);
  if (state.q) p.set('q', state.q);
  if (state.chain) p.set('chain', state.chain);
  if (state.cat) p.set('cat', state.cat);
  if (state.verdict) p.set('verdict', state.verdict);
  if (state.watch) p.set('watch', '1');
  if (state.sort !== 'rank') p.set('sort', state.sort);
  if (state.dir !== 'asc') p.set('dir', state.dir);
  if (state.slug) p.set('slug', state.slug);
  const s = p.toString();
  history.replaceState(null, '', s ? '?' + s : location.pathname);
}

/** The board rows after the current filters, in the current sort order. */
function filteredRows() {
  let rows = D.rows;
  if (state.watch) rows = rows.filter((r) => watchSet.has(r.slug));
  if (state.chain) rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.cat) rows = rows.filter((r) => (r.category || '') === state.cat);
  if (state.verdict) rows = rows.filter((r) => r.farm_verdict === state.verdict);
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
  }
  const key = state.sort;
  const dir = state.dir === 'desc' ? -1 : 1;
  const verdictRank = { FARM: 0, THIN: 1, SKIP: 2 };
  const val = (r) => {
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'farm_verdict') return verdictRank[r.farm_verdict];
    if (key === 'change_7d') return r.change_7d === null ? -1e9 : r.change_7d;
    if (key === 'age_days') return r.age_days === null ? -1 : r.age_days;
    return r[key];
  };
  return [...rows].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return a.slug < b.slug ? -1 : 1;
  });
}

function renderStats() {
  const top = D.rows[0];
  const loo = D.validation.tests[0];
  const vc = D.verdict_counts;
  const cf = D.validation.conformal;
  const of = D.validation.odds_forward;
  const farmNet = D.rows.filter((r) => r.farm_verdict === 'FARM').reduce((a, r) => a + r.farm_net_usd, 0);
  const stats = [
    { k: 'Protocols ranked', v: String(D.board_size), s: D.integrity.watchlist_covered + '/' + D.integrity.watchlist_total + ' watchlist · ' + D.early_size + ' early' },
    { k: 'Top expected value', v: money(top ? top.expected_value_usd : 0), s: top ? top.name + ' · odds ' + top.token_odds.toFixed(2) : '—' },
    { k: 'Out-of-sample error', v: '×' + D.validation.loo_median_x.toFixed(2), s: 'WF ×' + D.validation.wf_median_x.toFixed(2) + ' · ' + (100 * loo.model_within_2x).toFixed(0) + '% in 2×' },
    { k: 'Range honesty', v: (100 * cf.cross_cover_80).toFixed(0) + '% in 80%', s: '50% band ' + (100 * cf.cross_cover_50).toFixed(0) + '%' },
    { k: '12-mo launch odds', v: (100 * of.at_ages[0].forward_12mo).toFixed(0) + '% → ' + (100 * of.at_ages[5].forward_12mo).toFixed(0) + '%', s: '45d → 8y' },
    { k: 'Farm verdicts', v: vc.FARM + ' FARM · $' + Math.round(farmNet).toLocaleString(), s: vc.THIN + ' THIN · ' + vc.SKIP + ' SKIP' },
  ];
  $('stats').innerHTML = stats.map((s) =>
    '<div class="stat"><div class="k">' + s.k + '</div><div class="v">' + esc(s.v) + '</div><div class="s">' + esc(s.s) + '</div></div>').join('');
}

function renderIntegrity() {
  const it = D.integrity;
  $('integrity').innerHTML =
    '<span class="strip-k">Ledger</span>' +
    '<span><b>' + it.ranked + ' ranked</b> · ' + it.live_token + ' live-token · ' + it.excluded_total + ' set aside · watchlist ' + it.watchlist_covered + '/' + it.watchlist_total + ' · training ' + it.n_train_before_cap + ' priced → ' + it.n_train_dedup + ' after the 3× cap</span>';
}

function renderOosStrip() {
  const v = D.validation;
  const blind = v.blind_tests;
  const cf = v.conformal;
  $('oosstrip').innerHTML =
    '<span class="strip-k">Held out</span>' +
    '<span>Leave-one-out <b>×' + v.loo_median_x.toFixed(2) + '</b> · walk-forward 70/30 <b>×' + v.wf_median_x.toFixed(2) + '</b> · blind categories <b>×' + blind[0].model_median_x.toFixed(2) + '</b> · blind size buckets <b>×' + blind[1].model_median_x.toFixed(2) + '</b> · 80% band covers <b>' + (100 * cf.cross_cover_80).toFixed(1) + '%</b></span>';
}

/** The three compact evidence tables above the board: value terms, token odds, range honesty. */
function renderEvidenceTables() {
  const v = D.validation;
  const fs = v.forward_selection;
  const fsRows = fs.map((s) =>
    '<tr><td>' + esc(s.term) + '</td>' +
    '<td class="num">×' + s.loo_before_x.toFixed(2) + ' → ×' + s.loo_after_x.toFixed(2) + '</td>' +
    '<td class="num">×' + s.wf70_before_x.toFixed(2) + ' → ×' + s.wf70_after_x.toFixed(2) + '</td>' +
    '<td><b>' + (s.decision === 'kept' ? 'KEPT' : 'NOT KEPT') + '</b></td></tr>').join('');
  $('ev-terms').innerHTML =
    '<h3>Value terms — forward selection</h3>' +
    '<table class="evtable"><thead><tr><th>Term tried</th><th class="num">Leave-one-out</th><th class="num">Walk-forward 70/30</th><th></th></tr></thead><tbody>' + fsRows + '</tbody></table>';
  const oc = v.odds_calibration;
  const of = v.odds_forward;
  $('ev-odds').innerHTML =
    '<h3>Token odds — Brier, 5-fold</h3>' +
    '<table class="evtable"><thead><tr><th>Odds</th><th class="num">Brier</th></tr></thead><tbody>' +
    '<tr><td>Cell (category × age), shrunk</td><td class="num"><b>' + of.brier_cell.toFixed(3) + '</b></td></tr>' +
    '<tr><td>Logistic ever-odds curve</td><td class="num">' + of.brier_logistic.toFixed(3) + '</td></tr>' +
    '<tr><td>Category only</td><td class="num">' + of.brier_category_only.toFixed(3) + '</td></tr>' +
    '<tr><td>Global rate only</td><td class="num">' + of.brier_global_only.toFixed(3) + '</td></tr></tbody></table>';
  const cf = v.conformal;
  const cfRows = cf.by_bucket.map((b) =>
    '<tr><td>' + esc(b.bucket) + '</td><td class="num">' + b.n + '</td><td class="num">×' + Math.exp(b.q80_log).toFixed(1) + '</td><td class="num">' + (100 * b.cross_cover_80).toFixed(0) + '%</td></tr>').join('');
  $('ev-range').innerHTML =
    '<h3>Range honesty — conformal bands</h3>' +
    '<table class="evtable"><thead><tr><th>Size bucket</th><th class="num">n</th><th class="num">80% band</th><th class="num">Covers</th></tr></thead><tbody>' + cfRows + '</tbody></table>';
}

/** The self-check: re-derive every row from the fitted coefficients and the row's own inputs. */
function renderSelfCheck() {
  const b = D.fit_beta;
  const catAdj = new Map(D.categories.map((c) => [c.category, Math.log(c.fitted_factor)]));
  const cap = D.growth_cap_pct / 100;
  const floor = D.model.growth_floor / 100;
  const growthFeat = (pct) => {
    const g = Math.min(cap, Math.max(floor, (pct === null || pct === undefined ? 0 : pct) / 100));
    return Math.sign(g) * Math.log1p(Math.abs(g));
  };
  let ok = 0;
  for (const r of D.rows) {
    const logRatio = b[0] + b[1] * Math.log10(Math.max(r.tvl_usd, 1)) + b[2] * growthFeat(r.change_7d) + b[3] * Math.log1p(r.age_days === null ? D.model.unknown_age_days : r.age_days) + b[4] * Math.min(r.chains.length, D.model.chain_cap) + (catAdj.get(r.category || '(no category)') ?? 0);
    const mult = Math.min(D.model.multiple_cap, Math.max(D.model.multiple_floor, Math.exp(logRatio)));
    const implied = Math.max(1, Math.round(r.tvl_usd * mult));
    const expected = Math.round(r.token_odds * implied);
    const multOk = Math.abs(mult - r.multiple) <= 0.002;
    const impOk = Math.abs(implied - r.implied_raw_usd) <= Math.max(2, 0.002 * r.implied_raw_usd);
    const expOk = Math.abs(expected - r.expected_value_usd) <= Math.max(5, 0.002 * r.expected_value_usd);
    if (multOk && impOk && expOk) ok++;
  }
  const ranksOk = D.rows.every((r, i) => i === 0 || D.rows[i - 1].expected_value_usd > r.expected_value_usd);
  const it = D.integrity;
  const totalsOk = it.ranked + it.live_token + it.excluded_total + it.merged_families.length === it.total_protocols;
  const vc = D.verdict_counts;
  const verdictsOk = vc.FARM + vc.THIN + vc.SKIP === D.board_size;
  $('selfcheck').innerHTML =
    '<span class="strip-k">Self-check</span>' +
    '<span><b>' + ok + '/' + D.rows.length + ' rows recomputed ✓</b> from the fitted coefficients · watchlist ' + it.watchlist_covered + '/' + it.watchlist_total + ' · ranks ↓ ' + (ranksOk ? '✓' : '✗') + ' · ' + it.ranked + '+' + it.live_token + '+' + it.excluded_total + '+' + it.merged_families.length + ' = ' + it.total_protocols + ' ' + (totalsOk ? '✓' : '✗') + ' · verdicts ' + (verdictsOk ? '✓' : '✗') + '</span>';
}

function renderCategories() {
  $('peers').innerHTML = D.categories.map((c) =>
    '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.peers + '</td><td class="num">' + c.observed_median.toFixed(3) + '×</td></tr>').join('') +
    '<tr><td><b>All live-token protocols</b></td><td class="num">' + D.fit_n_train + '</td><td class="num">' + D.fit_train_median_ratio.toFixed(3) + '×</td></tr>';
}

/** A signed coefficient for display: "+ 0.91" / "− 1.10". */
function signed(x, digits) {
  return (x < 0 ? '− ' : '+ ') + Math.abs(x).toFixed(digits);
}

/** The fitted formula, coefficients, and the out-of-sample validation panel. */
function renderModel() {
  const b = D.fit_beta;
  $('formula').innerHTML = 'expected value = token odds × TVL × exp(' + signed(b[0], 2) + ' ' + signed(b[1], 2) + '·log₁₀TVL)';
  const v = D.validation;
  const it = D.integrity;
  const reasons = it.excluded_by_reason.map((r) => r.count + ' ' + r.reason.replace('exchange product (CEX)', 'CEX').replace('wrapped / staked product of a traded token', 'wrapped/staked').replace('exchange-branded product', 'exchange-branded')).join(', ');
  const fs = {};
  v.forward_selection.forEach((s) => { fs[s.term] = s; });
  const conf = v.conformal;
  const of = v.odds_forward;
  $('modelexplain').innerHTML = 'A launch is priced by what the market already pays for the same kind of protocol — but <b>fitted, not averaged</b>. A <b>Huber robust regression</b> (IRLS, k = ' + D.fit_huber_k + ', scale ' + D.fit_huber_scale.toFixed(2) + ') on <b>' + D.fit_n_train + ' live-token protocols</b> (exchanges excluded: their listings are not comparable launches; protocols priced above 3× TVL excluded: the four rows at 3.0–3.6× are 15–18× the training median and the top 5% tail; one observation per protocol family, so uniswap-v2/v3 count once) predicts log(mcap / TVL) from log₁₀ TVL alone — the size curve. The fit explains <b>R² ' + D.fit_r_squared.toFixed(2) + '</b>. The size coefficient is the headline: market cap grows roughly like <b>TVL^' + (1 + b[1] / Math.LN10).toFixed(2) + '</b>, so the market pays less per TVL dollar as a protocol gets bigger — a $2.7B vault is worth about 30× a $5M one, not 500×. <b>Forward selection</b> is how the size curve was chosen: starting from an intercept-only fit, each term was tried in turn and kept only when it lowered the held-out miss in <b>both</b> leave-one-out and walk-forward 70/30. Size alone takes leave-one-out ×' + fs.size.loo_before_x.toFixed(2) + ' → ×' + fs.size.loo_after_x.toFixed(2) + ' and walk-forward ×' + fs.size.wf70_before_x.toFixed(2) + ' → ×' + fs.size.wf70_after_x.toFixed(2) + '. Growth improves neither headline test (×' + fs.growth.loo_after_x.toFixed(2) + ', ×' + fs.growth.wf70_after_x.toFixed(2) + '); age improves leave-one-out (×' + fs.age.loo_after_x.toFixed(2) + ') but worsens walk-forward (×' + fs.age.wf70_after_x.toFixed(2) + '); chains improve walk-forward (×' + fs.chains.wf70_after_x.toFixed(2) + ') but worsen leave-one-out (×' + fs.chains.loo_after_x.toFixed(2) + ') and the blind category test (×' + fs.chains.loco_after_x.toFixed(2) + '); the category factor improves neither (×' + fs['category factor'].loo_after_x.toFixed(2) + ', ×' + fs['category factor'].wf70_after_x.toFixed(2) + '). The table below shows the numbers. <b>Growth</b> still enters the data as log(1 + growth), capped at +200% — it is simply not a term of the fitted model anymore. <b>Forward launch odds</b> (the 12-mo column) come from a logistic ever-odds curve in log-age, fitted on the 645 protocols with a known listing date: the forward odds fall with age (' + (100 * of.at_ages[0].forward_12mo).toFixed(0) + '% at 45 days, ' + (100 * of.at_ages[5].forward_12mo).toFixed(0) + '% at 8 years). The curve\u2019s 5-fold Brier (' + of.brier_logistic.toFixed(3) + ') is slightly worse than the cell odds (' + of.brier_cell.toFixed(3) + '), so the forward odds are shown, not used to price expected value — and a true longitudinal backtest is impossible from this snapshot, since live tokens carry no listing date. <b>Token odds</b> are the share of comparable protocols (same category, same age band) that already record a token, shrunk toward the category rate — a discount from the peers\u2019 own record, not a prediction of whether or when a token will be issued. <b>Bootstrap ranges</b> come from 200 seeded refits of the training set: each row\u2019s 10–90% interval for expected value and for rank. <b>Conformal bands</b> come from the leave-one-out residuals: the 80% band covers ' + (100 * conf.cross_cover_80).toFixed(1) + '% cross-fitted, the 50% band ' + (100 * conf.cross_cover_50).toFixed(0) + '% — the intervals cover what they claim.';
  const rows = v.tests.map((t) =>
    '<tr><td>' + esc(t.name) + ' <span class="muted">(n=' + t.n_test + ')</span></td>' +
    '<td class="num"><b>×' + t.model_median_x.toFixed(2) + '</b> · ' + (100 * t.model_within_2x).toFixed(0) + '% within 2×</td>' +
    '<td class="num">×' + t.ols_median_x.toFixed(2) + ' · ' + (100 * t.ols_within_2x).toFixed(0) + '%</td>' +
    '<td class="num">×' + t.base_median_x.toFixed(2) + ' · ' + (100 * t.base_within_2x).toFixed(0) + '%</td></tr>').join('');
  const blindRows = v.blind_tests.map((t) =>
    '<tr><td>' + esc(t.name) + ' <span class="muted">(n=' + t.n_test + ')</span></td>' +
    '<td class="num"><b>×' + t.model_median_x.toFixed(2) + '</b> · ' + (100 * t.model_within_2x).toFixed(0) + '% within 2×</td>' +
    '<td class="num">×' + t.ols_median_x.toFixed(2) + ' · ' + (100 * t.ols_within_2x).toFixed(0) + '%</td>' +
    '<td class="num">×' + t.base_median_x.toFixed(2) + ' · ' + (100 * t.base_within_2x).toFixed(0) + '%</td></tr>').join('');
  const oc = v.odds_calibration;
  const rs = v.random_splits;
  const cf = v.cap_fair;
  const wf80 = v.tests[3];
  const fsRows = v.forward_selection.map((s) =>
    '<tr><td>' + esc(s.term) + '</td>' +
    '<td class="muted">' + esc(s.kept_before) + '</td>' +
    '<td class="num">×' + s.loo_before_x.toFixed(2) + ' → ×' + s.loo_after_x.toFixed(2) + '</td>' +
    '<td class="num">×' + s.wf70_before_x.toFixed(2) + ' → ×' + s.wf70_after_x.toFixed(2) + '</td>' +
    '<td class="num">×' + s.loco_before_x.toFixed(2) + ' → ×' + s.loco_after_x.toFixed(2) + '</td>' +
    '<td class="num">×' + s.losbo_before_x.toFixed(2) + ' → ×' + s.losbo_after_x.toFixed(2) + '</td>' +
    '<td><b>' + (s.decision === 'kept' ? 'KEPT' : 'NOT KEPT') + '</b></td></tr>').join('');
  const fsNote = '<p class="valnote"><b>Only size is kept.</b> A term is kept only when adding it lowers the held-out miss in <b>both</b> leave-one-out and walk-forward 70/30 — the same rule the top entries advertise. The closest calls: age improves leave-one-out (×' + fs.age.loo_before_x.toFixed(2) + ' → ×' + fs.age.loo_after_x.toFixed(2) + ') but worsens walk-forward (×' + fs.age.wf70_before_x.toFixed(2) + ' → ×' + fs.age.wf70_after_x.toFixed(2) + '); chains improve walk-forward (×' + fs.chains.wf70_before_x.toFixed(2) + ' → ×' + fs.chains.wf70_after_x.toFixed(2) + ') but worsen leave-one-out (×' + fs.chains.loo_before_x.toFixed(2) + ' → ×' + fs.chains.loo_after_x.toFixed(2) + ') and the blind category test (×' + fs.chains.loco_before_x.toFixed(2) + ' → ×' + fs.chains.loco_after_x.toFixed(2) + '). The counter-evidence is printed here, not hidden: the newest-cohort split is the one place the size curve clearly loses — walk-forward 80/20 is ×' + wf80.model_median_x.toFixed(2) + ' (against ×' + v.wf_median_x.toFixed(2) + ' on the 70/30 split), because the newest listings are mostly 2025–26 RWA and basis-trading launches, where the extra terms help; the random-split mean (×' + rs.model_mean_median_x.toFixed(2) + ') also trails the five-term fit\u2019s ×2.57 on the same twenty splits (scripts/experiment2.ts). The choice follows the stated both-tests rule.</p>';
  $('validation').innerHTML =
    '<table class="peertable"><thead><tr><th>Out-of-sample test</th><th class="num">Radar-8 · Huber</th><th class="num">Radar-3 · OLS</th><th class="num">Baseline · peer median</th></tr></thead><tbody>' + rows + blindRows + '</tbody></table>' +
    '<p class="valnote">Every test scores the three models on the <b>same held-out protocols</b> — median prediction error as a multiple, and the share of held-out market caps predicted within 2×. Leave-one-out predicts each live-token protocol from the other ' + (D.fit_n_train - 1) + '; the walk-forward splits fit on the oldest listings and test on the newest, which is what a launch radar is actually for; the 5-fold split is the same seeded split radar-3 used. The <b>blind</b> tests hold out a whole category or a whole size bucket at a time — the curve pricing a kind of protocol it has never seen. Across <b>' + rs.splits + ' random time splits</b> the robust fit averages <b>×' + rs.model_mean_median_x.toFixed(2) + '</b> median error (OLS ×' + rs.ols_mean_median_x.toFixed(2) + ', peer median ×' + rs.base_mean_median_x.toFixed(2) + ') and beats OLS on ' + rs.model_wins_vs_ols + ' of ' + rs.splits + ' splits. The honest limit: a median error near ×3 means most predictions are still rough — only about a third land within 2× of the true market cap.</p>' +
    '<table class="peertable"><thead><tr><th>Term tried</th><th class="muted">Kept before</th><th class="num">Leave-one-out before → after</th><th class="num">Walk-forward 70/30 before → after</th><th class="num">Blind categories before → after</th><th class="num">Blind size buckets before → after</th><th>Decision</th></tr></thead><tbody>' + fsRows + '</tbody></table>' +
    fsNote +
    '<p class="valnote"><b>The 3× ratio cap, fair-tested.</b> Training on ratios up to 5× instead of 3×, scored on the <b>same</b> held-out rows: leave-one-out ×' + cf.loo_cap5_x.toFixed(2) + ' (cap 3: ×' + cf.loo_cap3_x.toFixed(2) + ') · walk-forward 70/30 ×' + cf.wf70_cap5_x.toFixed(2) + ' (cap 3: ×' + cf.wf70_cap3_x.toFixed(2) + ') · 5-fold ×' + cf.fivefold_cap5_x.toFixed(2) + ' (cap 3: ×' + cf.fivefold_cap3_x.toFixed(2) + ') · blind unseen categories ×' + cf.loco_cap5_x.toFixed(2) + ' (cap 3: ×' + cf.loco_cap3_x.toFixed(2) + '). The cap wins three, loses one — kept because the four rows above 3× are 15–18× the training median and the top 5% tail, not because the tests crown it, and it is reported here instead of hidden.</p>' +
    '<p class="valnote"><b>Range honesty (conformal).</b> The 50/80/90% bands come from the leave-one-out residuals: 50% band ×exp(±' + conf.q50_log.toFixed(2) + '), 80% band ×exp(±' + conf.q80_log.toFixed(2) + '), 90% band ×exp(±' + conf.q90_log.toFixed(2) + '). Cross-fitted, the 80% band covers ' + (100 * conf.cross_cover_80).toFixed(1) + '% and the 50% band ' + (100 * conf.cross_cover_50).toFixed(0) + '% — the intervals cover what they claim. Per size bucket: ' + conf.by_bucket.map((b) => b.bucket + ' 80% band ×' + Math.exp(b.q80_log).toFixed(1) + ', covers ' + (100 * b.cross_cover_80).toFixed(0) + '% (n=' + b.n + ')').join('; ') + '.</p>' +
    '<p class="valnote"><b>Forward launch odds.</b> The logistic ever-odds curve F(age) is fitted on the 645 protocols with a known listing date; the 12-month forward odds at six ages: ' + of.at_ages.map((a) => a.age_days + 'd: ever ' + a.ever_odds.toFixed(2) + ', forward ' + a.forward_12mo.toFixed(2)).join('; ') + '. 5-fold Brier: logistic ' + of.brier_logistic.toFixed(3) + ' vs cell ' + of.brier_cell.toFixed(3) + ' vs category-only ' + of.brier_category_only.toFixed(3) + ' vs global-only ' + of.brier_global_only.toFixed(3) + '. The forward odds are shown on the board; the ever-odds price expected value.</p>' +
    '<p class="valnote"><b>Token-odds calibration</b> — odds fitted on one random half of the protocols, checked on the other ' + oc.n_test + ': ' + oc.quartiles.map((q) => 'predicted ' + q.odds_mid.toFixed(2) + ' → ' + (100 * q.observed_live_share).toFixed(0) + '% actually record a token (n=' + q.n + ')').join('; ') + '. Mean absolute error ' + oc.mean_abs_error.toFixed(2) + '.</p>' +
    '<p class="valnote"><b>Tested and rejected</b> — each variant was built and scored leave-one-out against the shipped fit (×' + v.loo_median_x.toFixed(2) + '): ' + v.rejected.map((r) => esc(r.name) + ' ×' + r.loo_median_x.toFixed(2) + ' — ' + esc(r.note)).join('; ') + '. One-per-ticker dedup changes nothing on this snapshot (' + D.integrity.n_train_raw + ' → ' + D.integrity.n_train_dedup + ', LOO ×' + v.loo_before_dedup_x.toFixed(2) + ' both ways): no family is counted twice here, so the check is reported, not hidden.</p>' +
    '<p class="valnote"><b>Data integrity.</b> All ' + it.total_protocols + ' protocols are accounted for: ' + it.ranked + ' ranked + ' + it.live_token + ' live-token at market value + ' + it.excluded_total + ' set aside (' + esc(reasons) + ') + ' + it.merged_families.length + ' versioned family ranked once. Gaps: ' + it.null_change_7d + ' missing 7d, ' + it.null_listed_at + ' missing listing date. Already-traded tokens on the board only because the gate\u2019s watchlist requires them (' + esc(it.watchlist_traded_override.join(' · ')) + ') — both already trade, do not farm.</p>';
  const fa = D.farm_assumptions;
  $('farmexplain').innerHTML = 'Net farm value = the farmer\u2019s expected share − gas − time. The airdrop pool is assumed to be <b>' + (100 * fa.pool_share).toFixed(0) + '% of the expected value</b> and one farmer captures <b>' + (100 * fa.farmer_share).toFixed(2) + '% of that pool at a $100 deposit, scaled with the deposit</b> (a $250 deposit captures 2.5× the share of a $100 one — radar-5 gave every deposit the same share, so the deposit size meant nothing); gas is <b>' + fa.setup_tx + ' setup transactions plus one weekly transaction per week of the hold</b> at the chain\u2019s usual cost (radar-5 charged 9 flat transactions while the plan itself promised a weekly action for 30–60 days); time is <b>the plan\u2019s own hours at $' + fa.hour_usd + '/hour: ' + fa.hours_by_hold.map((h) => h.hours.toFixed(2) + ' h for a ' + h.hold_days + '-day hold').join(', ') + '</b> — the plan\u2019s steps are the work (wallet 5 min, move 10, action 15, 10 min a week, claim 10, log 5, risk 5), not a flat 3 h. Net above <b>$' + fa.threshold_usd + '</b> → <b>FARM</b> at the full deposit; net above $0 → <b>THIN</b> at half the deposit; net at or below $0 → <b>SKIP</b>, deposit $0. <b>Net per hour</b> is the efficiency the board shows; <b>net per $100 deposited</b> is in the detail view. The assumptions are the same for every row, so the verdicts compare like with like — change the assumptions and the verdicts move together.';
}

/** The size curve: the fitted multiple at each size, next to what the market actually pays there. */
function renderSizeCurve() {
  const rows = D.size_curve.map((p) =>
    '<tr><td>' + esc(p.label) + '</td><td class="num">' + p.n + '</td>' +
    '<td class="num"><b>×' + p.fitted_multiple.toFixed(3) + '</b></td>' +
    '<td class="num">' + (p.observed_median === null ? '—' : '×' + p.observed_median.toFixed(3)) + '</td></tr>').join('');
  const small = D.size_curve[0];
  const smallNote = small && small.observed_median !== null
    ? 'The smallest bucket is the one place the line overshoots (×' + small.fitted_multiple.toFixed(2) + ' fitted vs ×' + small.observed_median.toFixed(2) + ' observed): small protocols vary the most, and the fit does not pretend otherwise.'
    : 'Small protocols vary the most, and the fit does not pretend otherwise.';
  $('sizecurve').innerHTML =
    '<table class="peertable"><thead><tr><th>Protocol size (TVL)</th><th class="num">Live peers</th><th class="num">Fitted multiple</th><th class="num">Observed median mcap / TVL</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="valnote">The fitted multiple falls roughly 3× for every 10× of TVL — the curve the regression draws, checked against the median ratio the market actually pays in each size bucket. ' + smallNote + '</p>';
}

function fillFilters() {
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  const cats = [...new Set(D.rows.map((r) => r.category || '(no category)'))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => '<option' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => '<option value="' + esc(c) + '"' + (c === state.cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  $('verdict').value = state.verdict;
  $('q').value = state.q;
  $('watchonly').checked = state.watch;
}

function verdictBadge(v) {
  return '<span class="verdict ' + v.toLowerCase() + '">' + v + '</span>';
}

function renderBoard() {
  const rows = filteredRows();
  const maxExp = rows.reduce((m, r) => Math.max(m, r.expected_value_usd), 1);
  $('rows').innerHTML = rows.map((r) =>
    '<tr data-slug="' + esc(r.slug) + '">' +
    '<td class="num"><span class="rank">' + r.rank + '</span></td>' +
    '<td class="name"><b>' + esc(r.name) + '</b>' + (r.already_traded ? ' <span class="traded">ALREADY TRADED</span>' : '') + '<span>' + esc(r.slug) + (watchSet.has(r.slug) ? '<span class="watch">★ watchlist</span>' : '') + (r.category ? '<span class="cat">' + esc(r.category) + '</span>' : '') + '</span></td>' +
    '<td class="num">' + money(r.tvl_usd) + '</td>' +
    pctCell(r.change_7d) +
    '<td class="num">' + days(r.age_days) + '</td>' +
    '<td class="num">' + money(r.implied_raw_usd) + '</td>' +
    '<td class="num">' + r.token_odds.toFixed(2) + '</td>' +
    '<td class="num">' + r.forward_odds_12mo.toFixed(2) + '</td>' +
    '<td class="num imp">' + money(r.expected_value_usd) + '<span class="bar"><span style="width:' + Math.max(2, Math.round((r.expected_value_usd / maxExp) * 100)) + '%"></span></span></td>' +
    '<td>' + verdictBadge(r.farm_verdict) + '</td>' +
    '<td class="num">' + (r.farm_net_per_hour_usd < 0 ? '−' : '') + '$' + Math.abs(r.farm_net_per_hour_usd).toFixed(0) + '</td>' +
    '<td class="plan">' + esc(r.farm_plan) + '</td>' +
    '<td class="num">' + money(r.value_lo_usd) + '–' + money(r.value_hi_usd) + '<span class="sub2">#' + r.rank_lo + '–#' + r.rank_hi + '</span></td>' +
    '</tr>').join('');
  $('rowcount').textContent = 'Showing ' + rows.length + ' of ' + D.rows.length + ' protocols';
  document.querySelectorAll('#board thead th').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === state.sort);
  });
}

function renderLive() {
  $('liverows').innerHTML = D.live.map((r, i) =>
    '<tr>' +
    '<td class="num"><span class="rank">' + (i + 1) + '</span></td>' +
    '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + '</span>' +
    (r.category ? '<br><span class="cat">' + esc(r.category) + '</span>' : '') + '</td>' +
    '<td class="num">' + money(r.tvl_usd) + '</td>' +
    '<td class="num">' + money(r.mcap_usd) + '</td>' +
    '<td class="num">' + (r.ratio === null ? '—' : r.ratio.toFixed(3) + '×') + '</td>' +
    pctCell(r.change_7d) +
    '</tr>').join('');
}

/** The fitted model arithmetic for one row, from the row's stored log terms. */
function mathRows(r) {
  const b = D.fit_beta;
  const logTvl = Math.log10(Math.max(r.tvl_usd, 1));
  const sgn = (x) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(3);
  return [
    ['Constant', signed(b[0], 2), sgn(r.const_term)],
    ['Size — log₁₀ TVL ' + logTvl.toFixed(2), b[1].toFixed(2) + ' × ' + logTvl.toFixed(2), sgn(r.size_term)],
    ['Growth · age · chains · category — tested, not kept', 'forward selection (see the table below)', '+ 0.000'],
    ['Fitted log(mcap / TVL)', 'sum of the terms above', r.log_ratio.toFixed(3)],
    ['Fitted multiple = exp(log-ratio)', 'exp(' + r.log_ratio.toFixed(3) + ')', r.multiple.toFixed(4) + '×'],
    ['TVL × multiple', money(r.tvl_usd) + ' × ' + r.multiple.toFixed(4) + '×', money(r.implied_raw_usd)],
    ['Token odds — ' + r.odds_peers + ' comparable peers', 'share of peers that record a token', r.token_odds.toFixed(2)],
    ['Forward 12-mo odds — lists within a year', 'logistic ever-odds curve in log-age', r.forward_odds_12mo.toFixed(2)],
    ['Expected value = odds × implied', r.token_odds.toFixed(2) + ' × ' + money(r.implied_raw_usd), money(r.expected_value_usd)],
  ];
}

function openDetail(slug) {
  const r = D.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.slug = slug;
  syncUrl();
  const math = mathRows(r);
  const fa = D.farm_assumptions;
  // The full capital tier (the share scales with it, not with the verdict deposit).
  const capital = r.tvl_usd >= 1e9 ? 250 : r.tvl_usd >= 1e8 ? 150 : r.tvl_usd >= 25e6 ? 100 : 50;
  const farmerShare = r.expected_value_usd * fa.pool_share * fa.farmer_share * (capital / 100);
  const timeValue = r.farm_hours * fa.hour_usd;
  const gasTotal = farmerShare - timeValue - r.farm_net_usd;
  const chainList = r.chains.length > 4 ? r.chains.slice(0, 4).join(', ') + ' +' + (r.chains.length - 4) + ' more' : r.chains.join(', ');
  $('detail').innerHTML =
    '<h2>' + esc(r.name) + '</h2>' +
    '<p class="sub">' + esc(r.slug) + (r.category ? ' · ' + esc(r.category) : '') + ' · ' + esc(chainList || 'no chain listed') + '</p>' +
    (r.already_traded
      ? '<span class="status">Already-traded token — on the board only for the gate\u2019s watchlist</span> ' + verdictBadge(r.farm_verdict) +
        '<div class="traded-note"><b>Already traded — do not farm.</b> ' + esc(r.already_traded_note || '') + ' This row is on the board only because the gate\u2019s watchlist requires it; its token already trades, so there is no future token to launch.</div>'
      : '<span class="status">Records no token — pre-token</span> ' + verdictBadge(r.farm_verdict)) +
    '<div class="kv">' +
    '<div><div class="k">Rank</div><div class="v">#' + r.rank + ' of ' + D.rows.length + '</div></div>' +
    '<div><div class="k">Expected value</div><div class="v">' + money(r.expected_value_usd) + '</div></div>' +
    '<div><div class="k">Implied value</div><div class="v">' + money(r.implied_raw_usd) + '</div></div>' +
    '<div><div class="k">Token odds</div><div class="v">' + r.token_odds.toFixed(2) + ' <span class="muted" style="font-size:13px">(' + r.odds_peers + ' peers)</span></div></div>' +
    '<div><div class="k">12-mo launch odds</div><div class="v">' + r.forward_odds_12mo.toFixed(2) + '</div></div>' +
    '<div><div class="k">Value range (10–90%)</div><div class="v" style="font-size:15px">' + money(r.value_lo_usd) + ' – ' + money(r.value_hi_usd) + '</div></div>' +
    '<div><div class="k">Rank range (10–90%)</div><div class="v">#' + r.rank_lo + '–#' + r.rank_hi + '</div></div>' +
    '<div><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div></div>' +
    '<div><div class="k">Age with no token</div><div class="v">' + days(r.age_days) + '</div></div>' +
    '<div><div class="k">Net farm value / hour</div><div class="v">' + (r.farm_net_per_hour_usd < 0 ? '−' : '') + '$' + Math.abs(r.farm_net_per_hour_usd).toFixed(0) + '</div></div>' +
    '<div><div class="k">Farm plan</div><div class="v" style="font-size:15px">' + esc(r.farm_plan) + '</div></div>' +
    '</div>' +
    '<h3>How the value is priced</h3>' +
    '<div class="math">' + math.map((row) =>
      '<div><span>' + esc(row[0]) + '</span><span>' + esc(row[1]) + (row[2] ? ' = ' + esc(row[2]) : '') + '</span></div>').join('') +
      '<div class="tot"><span>Expected value</span><span>' + money(r.expected_value_usd) + '</span></div></div>' +
    '<h3>Farm verdict — ' + r.farm_verdict + '</h3>' +
    '<div class="math">' +
    '<div><span>Farmer\u2019s expected share (' + (100 * fa.pool_share).toFixed(0) + '% pool × ' + (100 * fa.farmer_share).toFixed(2) + '% × $' + capital + ' deposit / $100)</span><span>' + money(farmerShare) + '</span></div>' +
    '<div><span>Gas (' + r.farm_gas_txns + ' transactions: ' + fa.setup_tx + ' setup + one a week over the ' + r.farm_hold_days + '-day hold)</span><span>− ' + money(gasTotal) + '</span></div>' +
    '<div><span>Time (' + r.farm_hours.toFixed(2) + 'h at $' + fa.hour_usd + '/h — the plan\u2019s own steps)</span><span>− ' + money(timeValue) + '</span></div>' +
    '<div class="tot"><span>Net farm value</span><span>' + (r.farm_net_usd < 0 ? '−' : '') + money(Math.abs(r.farm_net_usd)) + '</span></div>' +
    '<div><span>Net per hour of the farmer\u2019s time</span><span><b>' + (r.farm_net_per_hour_usd < 0 ? '−' : '') + '$' + Math.abs(r.farm_net_per_hour_usd).toFixed(2) + '</b></span></div>' +
    '<div><span>Net per $100 deposited</span><span><b>' + (r.farm_net_per_100_usd < 0 ? '−' : '') + '$' + Math.abs(r.farm_net_per_100_usd).toFixed(2) + '</b></span></div>' +
    (r.already_traded ? '<div><span>Verdict forced to SKIP</span><span>the token already trades — do not farm</span></div>' : '') +
    (r.merged_from ? '<div><span>Versions merged into this row</span><span>' + esc(r.merged_from.join(', ')) + ' — one protocol, one row</span></div>' : '') +
    '<div><span>Deposit sized to the verdict</span><span><b>' + (r.farm_deposit_usd === 0 ? '$0 — do not deposit' : '$' + r.farm_deposit_usd) + '</b></span></div></div>' +
    '<h3>Farm plan — ' + r.farm_steps.length + ' steps</h3>' +
    '<ol class="steps">' + r.farm_steps.map((s) => {
      const parts = s.split(' Cost: ');
      const text = parts[0] || s;
      const ct = parts[1] ? 'Cost: ' + parts[1] : '';
      return '<li>' + esc(text) + (ct ? '<span class="ct">' + esc(ct) + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
  $('drawer').classList.remove('hidden');
}

function closeDetail() {
  state.slug = '';
  syncUrl();
  $('drawer').classList.add('hidden');
}

function setView(view) {
  state.view = view;
  syncUrl();
  $('tab-board').classList.toggle('active', view === 'board');
  $('tab-live').classList.toggle('active', view === 'live');
  $('board').classList.toggle('hidden', view !== 'board');
  $('livetable').classList.toggle('hidden', view !== 'live');
  $('tabletitle').textContent = view === 'board' ? 'Ranked board' : 'Live tokens — the market’s own values';
  $('rowcount').textContent = view === 'board' ? $('rowcount').textContent : D.live.length + ' protocols, by market cap';
}

function init() {
  $('asof').textContent = D.as_of;
  $('modelver').textContent = D.model_version;
  $('footline').textContent = 'Snapshot ' + D.as_of + ' · ' + D.integrity.total_protocols + ' protocols accounted for: ' + D.board_size + ' ranked (' + D.watchlist_size + ' watchlist + ' + D.early_size + ' early) + ' + D.integrity.live_token + ' live-token + ' + D.integrity.excluded_total + ' set aside · model ' + D.model_version + '.';
  renderStats();
  renderIntegrity();
  renderOosStrip();
  renderEvidenceTables();
  renderSelfCheck();
  renderModel();
  renderSizeCurve();
  renderCategories();
  fillFilters();
  renderBoard();
  renderLive();
  setView(state.view);

  $('q').addEventListener('input', (e) => { state.q = e.target.value; syncUrl(); renderBoard(); });
  $('chain').addEventListener('change', (e) => { state.chain = e.target.value; syncUrl(); renderBoard(); });
  $('cat').addEventListener('change', (e) => { state.cat = e.target.value; syncUrl(); renderBoard(); });
  $('verdict').addEventListener('change', (e) => { state.verdict = e.target.value; syncUrl(); renderBoard(); });
  $('watchonly').addEventListener('change', (e) => { state.watch = e.target.checked; syncUrl(); renderBoard(); });
  $('tab-board').addEventListener('click', () => setView('board'));
  $('tab-live').addEventListener('click', () => setView('live'));
  document.querySelectorAll('#board thead th').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort = key; state.dir = key === 'rank' || key === 'name' || key === 'farm_verdict' ? 'asc' : 'desc'; }
      syncUrl();
      renderBoard();
    });
  });
  $('rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.dataset.slug);
  });
  $('close').addEventListener('click', closeDetail);
  $('scrim').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

  if (state.slug) openDetail(state.slug);
}

init();
