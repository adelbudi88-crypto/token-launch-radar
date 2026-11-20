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
  const stats = [
    { k: 'Protocols ranked', v: String(D.board_size), s: D.integrity.watchlist_covered + '/' + D.integrity.watchlist_total + ' watchlist · ' + D.early_size + ' early · ' + D.integrity.total_protocols + ' accounted for' },
    { k: 'Top expected value', v: money(top ? top.expected_value_usd : 0), s: top ? top.name + ' · odds ' + top.token_odds.toFixed(2) + ' · implied ' + money(top.implied_raw_usd) : '—' },
    { k: 'Out-of-sample error', v: '×' + D.validation.loo_median_x.toFixed(2), s: 'leave-one-out · walk-forward ×' + D.validation.wf_median_x.toFixed(2) + ' · ' + (100 * loo.model_within_2x).toFixed(0) + '% within 2×' },
    { k: 'Farm verdicts', v: vc.FARM + ' FARM', s: vc.THIN + ' THIN · ' + vc.SKIP + ' SKIP — netted to one number each' },
  ];
  $('stats').innerHTML = stats.map((s) =>
    '<div class="stat"><div class="k">' + s.k + '</div><div class="v">' + esc(s.v) + '</div><div class="s">' + esc(s.s) + '</div></div>').join('');
}

function renderIntegrity() {
  const it = D.integrity;
  const reasons = it.excluded_by_reason.map((r) => r.count + ' ' + r.reason.replace('exchange product (CEX)', 'CEX').replace('wrapped / staked product of a traded token', 'wrapped/staked').replace('versioned pool of another protocol', 'versioned pools').replace('exchange-branded product', 'exchange-branded')).join(', ');
  $('integrity').innerHTML =
    '<span class="strip-k">Integrity — all ' + it.total_protocols + ' protocols accounted for</span>' +
    '<span><b>' + it.ranked + ' ranked</b> · ' + it.live_token + ' live-token at market value · ' + it.excluded_total + ' set aside (' + esc(reasons) + ') · watchlist ' + it.watchlist_covered + '/' + it.watchlist_total + ' · gaps: ' + it.null_change_7d + ' missing 7d, ' + it.null_listed_at + ' missing listing date · training ' + it.n_train_raw + ' → ' + it.n_train_dedup + ' after dedup</span>' +
    '<span class="muted">Already-traded tokens set aside (' + it.excluded_traded_tokens.length + ' — the protocol IS the token, no future token to launch): ' + esc(it.excluded_traded_tokens.join(' · ')) + '</span>';
}

function renderOosStrip() {
  const v = D.validation;
  const blind = v.blind_tests;
  const oc = v.odds_calibration;
  const qline = oc.quartiles.map((q) => 'odds ' + q.odds_mid.toFixed(2) + ' → ' + (100 * q.observed_live_share).toFixed(0) + '% live').join(' · ');
  $('oosstrip').innerHTML =
    '<span class="strip-k">How we know this works — held out twice</span>' +
    '<span>Leave-one-out <b>×' + v.loo_median_x.toFixed(2) + '</b> · walk-forward 70/30 <b>×' + v.wf_median_x.toFixed(2) + '</b> · blind unseen categories <b>×' + blind[0].model_median_x.toFixed(2) + '</b> · blind unseen size buckets <b>×' + blind[1].model_median_x.toFixed(2) + '</b> · odds calibration on ' + oc.n_test + ' held-out (mean error ' + oc.mean_abs_error.toFixed(2) + '): ' + esc(qline) + '</span>';
}

function renderCategories() {
  $('peers').innerHTML = D.categories.map((c) =>
    '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.peers + '</td><td class="num">' + c.observed_median.toFixed(3) + '×</td><td class="num"><b>' + c.fitted_factor.toFixed(3) + '×</b></td></tr>').join('') +
    '<tr><td><b>All live-token protocols</b></td><td class="num">' + D.fit_n_train + '</td><td class="num">' + D.fit_train_median_ratio.toFixed(3) + '×</td><td class="num"><b>1.000×</b></td></tr>';
}

/** A signed coefficient for display: "+ 0.91" / "− 1.10". */
function signed(x, digits) {
  return (x < 0 ? '− ' : '+ ') + Math.abs(x).toFixed(digits);
}

/** The fitted formula, coefficients, and the out-of-sample validation panel. */
function renderModel() {
  const b = D.fit_beta;
  $('formula').innerHTML = 'expected value = token odds × TVL × exp(' + signed(b[0], 2) + ' ' + signed(b[1], 2) + '·log₁₀TVL ' + signed(b[2], 2) + '·growth ' + signed(b[3], 2) + '·ln(1+age) ' + signed(b[4], 2) + '·chains + category factor)';
  $('modelexplain').innerHTML = 'A launch is priced by what the market already pays for the same kind of protocol — but <b>fitted, not averaged</b>. A <b>Huber robust regression</b> (IRLS, k = ' + D.fit_huber_k + ', scale ' + D.fit_huber_scale.toFixed(2) + ') on <b>' + D.fit_n_train + ' live-token protocols</b> (exchanges excluded: their listings are not comparable launches; one observation per protocol family, so uniswap-v2/v3 count once) predicts log(mcap / TVL) from log₁₀ TVL, 7-day growth, age with no token and chain count; the <b>category factor</b> is the mean residual of the category\u2019s live-token peers, shrunk toward zero when few peers price it (k = 5). Huber down-weights the protocols whose market caps sit far from any line instead of letting them drag the fit. The fit explains <b>R² ' + D.fit_r_squared.toFixed(2) + '</b>. The size coefficient is the headline: market cap grows roughly like <b>TVL^' + (1 + b[1] / Math.LN10).toFixed(2) + '</b>, so the market pays less per TVL dollar as a protocol gets bigger — a $2.7B vault is not worth 500× a $5M one. Every row above shows its own multiple; the detail view shows the arithmetic. <b>Token odds</b> are the share of comparable protocols (same category, same age band) that already record a token, shrunk toward the category rate — a discount from the peers\u2019 own record, not a prediction of whether or when a token will be issued. <b>Bootstrap ranges</b> come from 200 seeded refits of the training set: each row\u2019s 10–90% interval for expected value and for rank.';
  const v = D.validation;
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
  $('validation').innerHTML =
    '<table class="peertable"><thead><tr><th>Out-of-sample test</th><th class="num">Radar-5 · Huber</th><th class="num">Radar-3 · OLS</th><th class="num">Baseline · peer median</th></tr></thead><tbody>' + rows + blindRows + '</tbody></table>' +
    '<p class="valnote">Every test scores the three models on the <b>same held-out protocols</b> — median prediction error as a multiple, and the share of held-out market caps predicted within 2×. Leave-one-out predicts each live-token protocol from the other 111; the walk-forward splits fit on the oldest listings and test on the newest, which is what a launch radar is actually for; the 5-fold split is the same seeded split radar-3 used. The <b>blind</b> tests hold out a whole category or a whole size bucket at a time — the curve pricing a kind of protocol it has never seen. Across <b>' + rs.splits + ' random time splits</b> the robust fit averages <b>×' + rs.model_mean_median_x.toFixed(2) + '</b> median error (OLS ×' + rs.ols_mean_median_x.toFixed(2) + ', peer median ×' + rs.base_mean_median_x.toFixed(2) + ') and beats OLS on ' + rs.model_wins_vs_ols + ' of ' + rs.splits + ' splits. The honest limit: a median error near ×3 means most predictions are still rough — only about a third land within 2× of the true market cap.</p>' +
    '<p class="valnote"><b>Token-odds calibration</b> — odds fitted on one random half of the protocols, checked on the other ' + oc.n_test + ': ' + oc.quartiles.map((q) => 'predicted ' + q.odds_mid.toFixed(2) + ' → ' + (100 * q.observed_live_share).toFixed(0) + '% actually record a token (n=' + q.n + ')').join('; ') + '. Mean absolute error ' + oc.mean_abs_error.toFixed(2) + '.</p>' +
    '<p class="valnote"><b>Tested and rejected</b> — each variant was built and scored leave-one-out against the shipped fit (×' + v.loo_median_x.toFixed(2) + '): ' + v.rejected.map((r) => esc(r.name) + ' ×' + r.loo_median_x.toFixed(2) + ' — ' + esc(r.note)).join('; ') + '. One-per-ticker dedup changes nothing on this snapshot (112 → 112, LOO ×' + v.loo_before_dedup_x.toFixed(2) + ' both ways): no family is counted twice here, so the check is reported, not hidden.</p>';
  const fa = D.farm_assumptions;
  $('farmexplain').innerHTML = 'Net farm value = the farmer\u2019s expected share − gas − time. The airdrop pool is assumed to be <b>' + (100 * fa.pool_share).toFixed(0) + '% of the expected value</b> and one farmer captures <b>' + (100 * fa.farmer_share).toFixed(2) + '% of that pool</b>; gas is <b>' + fa.tx_count + ' transactions</b> at the chain\u2019s usual cost; time is <b>' + fa.hours + ' hours at $' + fa.hour_usd + '/hour</b>. Net above <b>$' + fa.threshold_usd + '</b> → <b>FARM</b> at the full deposit; net above $0 → <b>THIN</b> at half the deposit; net at or below $0 → <b>SKIP</b>, deposit $0. The assumptions are the same for every row, so the verdicts compare like with like — change the assumptions and the verdicts move together.';
}

/** The size curve: the fitted multiple at each size, next to what the market actually pays there. */
function renderSizeCurve() {
  const rows = D.size_curve.map((p) =>
    '<tr><td>' + esc(p.label) + '</td><td class="num">' + p.n + '</td>' +
    '<td class="num"><b>×' + p.fitted_multiple.toFixed(3) + '</b></td>' +
    '<td class="num">' + (p.observed_median === null ? '—' : '×' + p.observed_median.toFixed(3)) + '</td></tr>').join('');
  $('sizecurve').innerHTML =
    '<table class="peertable"><thead><tr><th>Protocol size (TVL)</th><th class="num">Live peers</th><th class="num">Fitted multiple</th><th class="num">Observed median mcap / TVL</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="valnote">The fitted multiple falls roughly 3× for every 10× of TVL — the curve the regression draws, checked against the median ratio the market actually pays in each size bucket. The smallest bucket is the one place the line overshoots (×0.75 fitted vs ×0.54 observed): small protocols vary the most, and the fit does not pretend otherwise.</p>';
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
    '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + (watchSet.has(r.slug) ? '<span class="watch">★ watchlist</span>' : '') + '</span>' +
    (r.category ? '<br><span class="cat">' + esc(r.category) + '</span>' : '') + '</td>' +
    '<td class="num">' + money(r.tvl_usd) + '</td>' +
    pctCell(r.change_7d) +
    '<td class="num">' + days(r.age_days) + '</td>' +
    '<td class="num">' + r.multiple.toFixed(3) + '×</td>' +
    '<td class="num">' + money(r.implied_raw_usd) + '</td>' +
    '<td class="num">' + r.token_odds.toFixed(2) + '<span class="sub2">' + r.odds_peers + ' peers</span></td>' +
    '<td class="num imp">' + money(r.expected_value_usd) + '<span class="bar"><span style="width:' + Math.max(2, Math.round((r.expected_value_usd / maxExp) * 100)) + '%"></span></span></td>' +
    '<td>' + verdictBadge(r.farm_verdict) + '</td>' +
    '<td class="num">' + money(r.value_lo_usd) + ' – ' + money(r.value_hi_usd) + '</td>' +
    '<td class="num">#' + r.rank_lo + '–#' + r.rank_hi + '</td>' +
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
  const growthFeat = Math.min(2.0, Math.max(-0.8, r.change_7d === null ? 0 : r.change_7d / 100));
  const ageFeat = Math.log1p(r.age_days === null ? 365 : r.age_days);
  const chainFeat = Math.min(r.chains.length, 5);
  const sgn = (x) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(3);
  return [
    ['Constant', signed(b[0], 2), sgn(r.const_term)],
    ['Size — log₁₀ TVL ' + logTvl.toFixed(2), b[1].toFixed(2) + ' × ' + logTvl.toFixed(2), sgn(r.size_term)],
    ['Growth — ' + pct(r.change_7d), b[2].toFixed(2) + ' × ' + growthFeat.toFixed(2), sgn(r.growth_term)],
    ['Age — ' + (r.age_days === null ? 'unknown (365d used)' : r.age_days + 'd with no token'), b[3].toFixed(2) + ' × ' + ageFeat.toFixed(2), sgn(r.age_term)],
    ['Chains — ' + r.chains.length + ' counted', b[4].toFixed(2) + ' × ' + chainFeat, sgn(r.chain_term)],
    ['Category factor — ' + (r.category || '(no category)'), 'exp(' + sgn(r.category_term) + ') = ×' + Math.exp(r.category_term).toFixed(3), sgn(r.category_term)],
    ['Fitted log(mcap / TVL)', 'sum of the terms above', r.log_ratio.toFixed(3)],
    ['Fitted multiple = exp(log-ratio)', 'exp(' + r.log_ratio.toFixed(3) + ')', r.multiple.toFixed(4) + '×'],
    ['TVL × multiple', money(r.tvl_usd) + ' × ' + r.multiple.toFixed(4) + '×', money(r.implied_raw_usd)],
    ['Token odds — ' + r.odds_peers + ' comparable peers', 'share of peers that record a token', r.token_odds.toFixed(2)],
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
  const farmerShare = r.expected_value_usd * fa.pool_share * fa.farmer_share;
  const timeValue = fa.hours * fa.hour_usd;
  const gasTotal = farmerShare - timeValue - r.farm_net_usd;
  const chainList = r.chains.length > 4 ? r.chains.slice(0, 4).join(', ') + ' +' + (r.chains.length - 4) + ' more' : r.chains.join(', ');
  $('detail').innerHTML =
    '<h2>' + esc(r.name) + '</h2>' +
    '<p class="sub">' + esc(r.slug) + (r.category ? ' · ' + esc(r.category) : '') + ' · ' + esc(chainList || 'no chain listed') + '</p>' +
    '<span class="status">Records no token — pre-token</span> ' + verdictBadge(r.farm_verdict) +
    '<div class="kv">' +
    '<div><div class="k">Rank</div><div class="v">#' + r.rank + ' of ' + D.rows.length + '</div></div>' +
    '<div><div class="k">Expected value</div><div class="v">' + money(r.expected_value_usd) + '</div></div>' +
    '<div><div class="k">Implied value</div><div class="v">' + money(r.implied_raw_usd) + '</div></div>' +
    '<div><div class="k">Token odds</div><div class="v">' + r.token_odds.toFixed(2) + ' <span class="muted" style="font-size:13px">(' + r.odds_peers + ' peers)</span></div></div>' +
    '<div><div class="k">Value range (10–90%)</div><div class="v" style="font-size:15px">' + money(r.value_lo_usd) + ' – ' + money(r.value_hi_usd) + '</div></div>' +
    '<div><div class="k">Rank range (10–90%)</div><div class="v">#' + r.rank_lo + '–#' + r.rank_hi + '</div></div>' +
    '<div><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div></div>' +
    '<div><div class="k">Age with no token</div><div class="v">' + days(r.age_days) + '</div></div>' +
    '</div>' +
    '<h3>How the value is priced</h3>' +
    '<div class="math">' + math.map((row) =>
      '<div><span>' + esc(row[0]) + '</span><span>' + esc(row[1]) + (row[2] ? ' = ' + esc(row[2]) : '') + '</span></div>').join('') +
      '<div class="tot"><span>Expected value</span><span>' + money(r.expected_value_usd) + '</span></div></div>' +
    '<h3>Farm verdict — ' + r.farm_verdict + '</h3>' +
    '<div class="math">' +
    '<div><span>Farmer\u2019s expected share (' + (100 * fa.pool_share).toFixed(0) + '% pool × ' + (100 * fa.farmer_share).toFixed(2) + '%)</span><span>' + money(farmerShare) + '</span></div>' +
    '<div><span>Gas (' + fa.tx_count + ' transactions)</span><span>− ' + money(gasTotal) + '</span></div>' +
    '<div><span>Time (' + fa.hours + 'h at $' + fa.hour_usd + '/h)</span><span>− ' + money(timeValue) + '</span></div>' +
    '<div class="tot"><span>Net farm value</span><span>' + (r.farm_net_usd < 0 ? '−' : '') + money(Math.abs(r.farm_net_usd)) + '</span></div>' +
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
