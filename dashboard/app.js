// Token Radar dashboard: sort, filter, search and detail, all client-side, no network.
// Reads window.RADAR from ../data.js, written by main.ts from the same board.
// State lives in the URL (?view=&q=&chain=&cat=&watch=&sort=&dir=&slug=) so any
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
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
  }
  const key = state.sort;
  const dir = state.dir === 'desc' ? -1 : 1;
  const val = (r) => {
    if (key === 'name') return r.name.toLowerCase();
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
  const stats = [
    { k: 'Protocols ranked', v: String(D.board_size), s: D.watchlist_size + ' on the watchlist · ' + D.early_size + ' early finds' },
    { k: 'Top implied value', v: money(top ? top.implied_value_usd : 0), s: top ? top.name : '—' },
    { k: 'Global peer median', v: D.global_median.toFixed(3) + '×', s: 'median mcap / TVL, live-token protocols' },
    { k: 'Live tokens set aside', v: String(D.live_size), s: 'shown at market value, never modelled' },
  ];
  $('stats').innerHTML = stats.map((s) =>
    '<div class="stat"><div class="k">' + s.k + '</div><div class="v">' + esc(s.v) + '</div><div class="s">' + esc(s.s) + '</div></div>').join('');
}

function renderPeers() {
  $('peers').innerHTML = D.peers.map((p) =>
    '<tr><td>' + esc(p.category) + '</td><td class="num">' + p.peers + '</td><td class="num">' + p.median.toFixed(3) + '×</td><td class="num"><b>' + p.multiple.toFixed(3) + '×</b></td></tr>').join('') +
    '<tr><td><b>All live-token protocols</b></td><td class="num">—</td><td class="num">' + D.global_median.toFixed(3) + '×</td><td class="num"><b>' + D.global_median.toFixed(3) + '×</b></td></tr>';
}

function fillFilters() {
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  const cats = [...new Set(D.rows.map((r) => r.category || '(no category)'))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => '<option' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => '<option value="' + esc(c) + '"' + (c === state.cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  $('q').value = state.q;
  $('watchonly').checked = state.watch;
}

function renderBoard() {
  const rows = filteredRows();
  const maxImp = rows.reduce((m, r) => Math.max(m, r.implied_value_usd), 1);
  $('rows').innerHTML = rows.map((r) =>
    '<tr data-slug="' + esc(r.slug) + '">' +
    '<td class="num"><span class="rank">' + r.rank + '</span></td>' +
    '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + (watchSet.has(r.slug) ? '<span class="watch">★ watchlist</span>' : '') + '</span>' +
    (r.category ? '<br><span class="cat">' + esc(r.category) + '</span>' : '') + '</td>' +
    '<td class="num">' + money(r.tvl_usd) + '</td>' +
    pctCell(r.change_7d) +
    '<td class="num">' + days(r.age_days) + '</td>' +
    '<td class="num">' + r.multiple.toFixed(3) + '×</td>' +
    '<td class="num imp">' + money(r.implied_value_usd) + '<span class="bar"><span style="width:' + Math.max(2, Math.round((r.implied_value_usd / maxImp) * 100)) + '%"></span></span></td>' +
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

/** The model arithmetic for one row, recomputed from the row and the model constants. */
function mathRows(r) {
  const m = D.model;
  const growthPct = Math.min(m.growth_cap, Math.max(m.growth_floor, r.change_7d === null ? 0 : r.change_7d));
  const base = r.tvl_usd * r.multiple;
  return [
    ['TVL × peer multiple', money(r.tvl_usd) + ' × ' + r.multiple.toFixed(3) + '× (' + r.peers + ' peers)', money(base)],
    ['Growth ' + pct(growthPct) + ' × 0.7', '× ' + r.growth_multiplier.toFixed(4), ''],
    ['Maturity, ' + days(r.age_days) + ' with no token', '× ' + r.maturity_multiplier.toFixed(4), ''],
    ['Chains: ' + r.chains.length + ' counted', '× ' + r.chain_multiplier.toFixed(4), ''],
  ];
}

function openDetail(slug) {
  const r = D.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.slug = slug;
  syncUrl();
  const math = mathRows(r);
  const chainList = r.chains.length > 4 ? r.chains.slice(0, 4).join(', ') + ' +' + (r.chains.length - 4) + ' more' : r.chains.join(', ');
  $('detail').innerHTML =
    '<h2>' + esc(r.name) + '</h2>' +
    '<p class="sub">' + esc(r.slug) + (r.category ? ' · ' + esc(r.category) : '') + ' · ' + esc(chainList || 'no chain listed') + '</p>' +
    '<span class="status">Records no token — pre-token</span>' +
    '<div class="kv">' +
    '<div><div class="k">Rank</div><div class="v">#' + r.rank + ' of ' + D.rows.length + '</div></div>' +
    '<div><div class="k">Implied value</div><div class="v">' + money(r.implied_value_usd) + '</div></div>' +
    '<div><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div></div>' +
    '<div><div class="k">7-day TVL change</div><div class="v">' + pct(r.change_7d) + '</div></div>' +
    '<div><div class="k">Tracked since</div><div class="v">' + (r.listed_at || '—') + '</div></div>' +
    '<div><div class="k">Age with no token</div><div class="v">' + days(r.age_days) + '</div></div>' +
    '</div>' +
    '<h3>How the value is priced</h3>' +
    '<div class="math">' + math.map((row) =>
      '<div><span>' + esc(row[0]) + '</span><span>' + esc(row[1]) + (row[2] ? ' = ' + esc(row[2]) : '') + '</span></div>').join('') +
      '<div class="tot"><span>Implied value</span><span>' + money(r.implied_value_usd) + '</span></div></div>' +
    '<h3>Farm plan — 7 steps</h3>' +
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
  $('footline').textContent = 'Snapshot ' + D.as_of + ' · floor $' + (D.floor_usd / 1e6) + 'M · ' + D.board_size + ' rows: ' + D.watchlist_size + ' watchlist + ' + D.early_size + ' early · model ' + D.model_version + '.';
  renderStats();
  renderPeers();
  fillFilters();
  renderBoard();
  renderLive();
  setView(state.view);

  $('q').addEventListener('input', (e) => { state.q = e.target.value; syncUrl(); renderBoard(); });
  $('chain').addEventListener('change', (e) => { state.chain = e.target.value; syncUrl(); renderBoard(); });
  $('cat').addEventListener('change', (e) => { state.cat = e.target.value; syncUrl(); renderBoard(); });
  $('watchonly').addEventListener('change', (e) => { state.watch = e.target.checked; syncUrl(); renderBoard(); });
  $('tab-board').addEventListener('click', () => setView('board'));
  $('tab-live').addEventListener('click', () => setView('live'));
  document.querySelectorAll('#board thead th').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 'asc' : 'desc'; }
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
