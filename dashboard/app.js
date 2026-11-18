// Token Launch Radar's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a live-tokens view, a method view and a per-protocol detail
// view. No network: every byte it shows is in data.js. Hash routes: #/ the board, #/live,
// #/method, #/f/<category> the board filtered, #/p/<slug> one protocol's detail.
(function () {
  'use strict';
  var D = window.RADAR;
  var app = document.getElementById('app');
  var tabs = document.getElementById('tabs');
  if (!D || !app) return;

  var state = { tab: 'board', q: '', category: 'all', chain: 'all', watch: false, sort: 'implied', dir: -1, shown: 60 };
  var bySlug = {};
  D.rows.forEach(function (r) { bySlug[r.slug] = r; });

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.round(d) + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setHtml(html) { app.innerHTML = html; app.setAttribute('aria-busy', 'false'); }

  document.getElementById('stamp').innerHTML =
    'Snapshot <b>' + esc(D.as_of) + '</b> · model <b>' + esc(D.model_version) + '</b><br>' + esc(D.source);
  document.getElementById('foot').textContent =
    'Implied values are this radar\u2019s own model output from the frozen snapshot named above, not a prediction that any protocol will issue a token. ' +
    'A protocol listed here records no token on DefiLlama as of the snapshot date; that is a statement about the record, not proof that no token exists.';

  // ------------------------------------------------------------- routing
  function route() {
    var h = location.hash || '#/';
    var m;
    if ((m = h.match(/^#\/p\/(.+)$/))) { state.tab = 'detail'; renderDetail(decodeURIComponent(m[1])); }
    else if (h === '#/live') { state.tab = 'live'; renderLive(); }
    else if (h === '#/method') { state.tab = 'method'; renderMethod(); }
    else {
      state.tab = 'board';
      if ((m = h.match(/^#\/f\/(.+)$/))) state.category = decodeURIComponent(m[1]);
      renderBoard();
    }
    syncTabs();
  }
  function syncTabs() {
    var want = state.tab === 'detail' ? 'board' : state.tab;
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === want);
    });
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var t = b.getAttribute('data-tab');
    location.hash = t === 'board' ? '#/' : '#/' + t;
  });
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------- board
  function categories() {
    var seen = {};
    D.rows.forEach(function (r) { if (r.category) seen[r.category] = 1; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    D.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = 1; }); });
    return Object.keys(seen).sort();
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  var SORTS = {
    implied: function (r) { return r.implied_value_usd; },
    score: function (r) { return r.radar_score; },
    tvl: function (r) { return r.tvl_usd; },
    growth: function (r) { return r.change_7d === null ? -1e9 : r.change_7d; },
    age: function (r) { return r.age_days === null ? -1 : r.age_days; },
    rank: function (r) { return -r.rank; },
  };
  function statsHtml() {
    return '<div class="stats">' +
      stat('Protocols ranked', D.board_size, D.watchlist_size + ' watchlist + ' + D.early_size + ' early, from ' + D.snapshot_size + ' in the snapshot') +
      stat('Combined implied value', fmtUsd(D.total_implied_usd), 'the board\u2019s own claim, model ' + D.model_version) +
      stat('Snapshot-wide multiple', D.global_median.toFixed(3) + '\u00d7 TVL', 'median market cap / TVL of token-bearing protocols') +
      stat('Watchlist floor', fmtUsd(D.floor_usd), 'every watchlist protocol is on the board') +
      '</div>';
    function stat(k, v, s) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }
  }
  function controlsHtml(total) {
    var cats = categories().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chs = chains().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var sorts = [['implied', 'Implied value'], ['score', 'Radar score'], ['tvl', 'TVL'], ['growth', '7d change'], ['age', 'Age'], ['rank', 'Board rank']]
      .map(function (s) { return '<option value="' + s[0] + '"' + (state.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');
    return '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name or slug\u2026" value="' + esc(state.q) + '">' +
      '<select id="cat"><option value="all">All categories</option>' + cats + '</select>' +
      '<select id="chain"><option value="all">All chains</option>' + chs + '</select>' +
      '<label class="check"><input type="checkbox" id="watch"' + (state.watch ? ' checked' : '') + '> Watchlist only</label>' +
      '<select id="sort">' + sorts + '</select>' +
      '<span class="count">' + total + ' shown</span></div>';
  }
  function rowHtml(r) {
    var chg = r.change_7d === null ? '<td class="num">n/a</td>'
      : '<td class="num ' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</td>';
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><span class="pname">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="tag watch">WATCH</span>' : '') +
      '<span class="sub">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
      '<td class="chains" title="' + esc(r.chains.join(', ')) + '">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' + chg +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num">' + r.multiple.toFixed(3) + '\u00d7<span class="tag src">' + r.multiple_source + '</span></td>' +
      '<td class="num implied">' + fmtUsd(r.implied_value_usd) + '</td>' +
      '<td class="scorecell"><span class="num">' + r.radar_score.toFixed(1) + '</span><div class="scorebar"><i style="width:' + Math.min(100, r.radar_score) + '%"></i></div></td></tr>';
  }
  function renderBoard() {
    var rows = filtered().slice().sort(function (a, b) { return (SORTS[state.sort](a) - SORTS[state.sort](b)) * state.dir; });
    var shown = rows.slice(0, state.shown);
    var arrow = function (k) { return state.sort === k ? (state.dir === -1 ? ' \u25bc' : ' \u25b2') : ''; };
    var html = '<section class="view">' + statsHtml() + controlsHtml(rows.length) +
      '<table><thead><tr><th class="num sortable" data-k="rank">#</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num sortable" data-k="tvl">TVL' + arrow('tvl') + '</th><th class="num sortable" data-k="growth">7d' + arrow('growth') + '</th><th class="num sortable" data-k="age">Age' + arrow('age') + '</th>' +
      '<th class="num">Multiple</th><th class="num sortable" data-k="implied">Implied value' + arrow('implied') + '</th><th class="sortable" data-k="score">Radar score' + arrow('score') + '</th></tr></thead><tbody>' +
      shown.map(rowHtml).join('') + '</tbody></table>' +
      (rows.length > state.shown ? '<button class="more" id="more">Show more (' + (rows.length - state.shown) + ' left)</button>' : '') +
      '</section>';
    setHtml(html);
    bindBoard(rows.length);
  }
  function bindBoard() {
    var q = document.getElementById('q');
    q.addEventListener('input', function () { state.q = q.value; state.shown = 60; renderBoard(); var nq = document.getElementById('q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); });
    document.getElementById('cat').addEventListener('change', function (e) { state.category = e.target.value; state.shown = 60; renderBoard(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; state.shown = 60; renderBoard(); });
    document.getElementById('watch').addEventListener('change', function (e) { state.watch = e.target.checked; state.shown = 60; renderBoard(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; state.dir = -1; renderBoard(); });
    var more = document.getElementById('more');
    if (more) more.addEventListener('click', function () { state.shown += 120; renderBoard(); });
    app.querySelectorAll('thead th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = -1; }
        renderBoard();
      });
    });
    app.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + encodeURIComponent(tr.getAttribute('data-slug')); });
    });
  }

  // ------------------------------------------------------------- detail
  function renderDetail(slug) {
    var r = bySlug[slug];
    if (!r) { setHtml('<section class="view"><p>No protocol with that slug is on the board.</p></section>'); return; }
    var peers = r.peers.map(function (p) {
      return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.symbol || '') + '</td><td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd) + '</td><td class="num">' + p.ratio.toFixed(3) + '\u00d7</td></tr>';
    }).join('');
    var parts = [['Size (log TVL)', r.score_parts.size, 35], ['Momentum (7d)', r.score_parts.momentum, 20], ['Track record', r.score_parts.track, 20], ['Chain reach', r.score_parts.reach, 10], ['Multiple confidence', r.score_parts.confidence, 15]]
      .map(function (p) {
        return '<div class="prow"><span class="lab">' + p[0] + '</span><span class="bar scorebar"><i style="width:' + (p[1] / p[2] * 100) + '%"></i></span><span class="n">' + p[1].toFixed(1) + '</span></div>';
      }).join('');
    var farm = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    setHtml('<section class="view">' +
      '<button class="back" id="back">\u2190 Back to the board</button>' +
      '<div class="dhead"><h2>' + esc(r.name) + (r.watchlist ? '<span class="tag watch">WATCHLIST</span>' : '') + '</h2>' +
      '<span class="meta">rank #' + r.rank + ' of ' + D.board_size + ' \u00b7 ' + esc(r.category || 'Uncategorised') + ' \u00b7 records no token as of ' + esc(D.as_of) + '</span></div>' +
      '<div class="dgrid"><div>' +
      '<h3>Implied value, step by step</h3><div class="formula">' +
      frow('TVL (snapshot)', fmtUsd(r.tvl_usd)) +
      frow('Category multiple (' + esc(r.multiple_source_name) + ', ' + r.peer_count + ' peers)', '\u00d7 ' + r.multiple.toFixed(4)) +
      frow('Growth factor (7d ' + fmtPct(r.change_7d) + ')', '\u00d7 ' + r.growth_factor.toFixed(4)) +
      frow('Maturity factor (' + fmtAge(r.age_days) + ' listed)', '\u00d7 ' + r.maturity_factor.toFixed(4)) +
      '<div class="row tot"><span>Implied value</span><span class="val">' + fmtUsd(r.implied_value_usd) + '</span></div>' +
      '<p class="note">The multiple is the median market cap / TVL of the snapshot\u2019s token-bearing protocols at the ' + r.multiple_source +
      ' level, each peer ratio clamped to [0.01, 5]. The largest peers behind it:</p></div>' +
      '<table class="mini"><thead><tr><th>Peer</th><th>Symbol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Ratio</th></tr></thead><tbody>' + peers + '</tbody></table>' +
      '<h3 style="margin-top:18px">Farm plan</h3><ol class="farm">' + farm + '</ol>' +
      '</div><div>' +
      '<h3>Radar score ' + r.radar_score.toFixed(1) + ' / 100</h3><div class="parts">' + parts + '</div>' +
      '<h3 style="margin-top:18px">Snapshot record</h3><div class="facts">' +
      fact('Slug', r.slug) + fact('Chains', r.chains.join(', ') || 'none named') + fact('TVL', fmtUsd(r.tvl_usd)) +
      fact('TVL change, 7d', fmtPct(r.change_7d)) + fact('Listed on DefiLlama', r.listed_at || 'not reported') +
      fact('Age at snapshot', fmtAge(r.age_days)) + fact('On the house watchlist', r.watchlist ? 'yes' : 'no \u2014 early row') +
      '</div></div></div></section>');
    document.getElementById('back').addEventListener('click', function () { location.hash = '#/'; });
    function frow(k, v) { return '<div class="row"><span>' + k + '</span><span>' + v + '</span></div>'; }
    function fact(k, v) { return '<div><span>' + k + '</span><b>' + esc(v) + '</b></div>'; }
  }

  // ------------------------------------------------------------- live
  function renderLive() {
    var rows = D.live.map(function (p, i) {
      var chg = p.change_7d === null ? '<td class="num">n/a</td>' : '<td class="num ' + (p.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(p.change_7d) + '</td>';
      return '<tr><td class="num">' + (i + 1) + '</td><td><span class="pname">' + esc(p.name) + '</span><span class="sub">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.symbol || '') + '</td><td>' + esc(p.category || 'Uncategorised') + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.ratio === null ? 'n/a' : p.ratio.toFixed(3) + '\u00d7') + '</td>' + chg + '</tr>';
    }).join('');
    setHtml('<section class="view"><h3 class="sec">Already trading \u2014 shown at the market\u2019s own values, never ranked</h3>' +
      '<p style="color:var(--muted);max-width:860px">These protocols\u2019 tokens exist, so the radar does not price them: it shows DefiLlama\u2019s recorded market cap and the market cap / TVL ratio the model learns from. ' +
      'The board\u2019s multiples are the medians of ratios like these, per category.</p>' +
      '<table><thead><tr><th class="num">#</th><th>Protocol</th><th>Symbol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Ratio</th><th class="num">7d</th></tr></thead><tbody>' +
      rows + '</tbody></table></section>');
  }

  // ------------------------------------------------------------- method
  function renderMethod() {
    var M = D.model;
    var catRows = D.categories.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.peers + '</td><td class="num">' + (c.median === null ? 'n/a' : c.median.toFixed(3) + '\u00d7') + '</td><td class="num">' + c.used.toFixed(3) + '\u00d7</td><td>' + c.used_source + '</td></tr>';
    }).join('');
    setHtml('<section class="view method"><h3 class="sec">The model (' + esc(D.model_version) + '), in full</h3>' +
      '<p>Every figure comes from the one frozen snapshot named in the header (' + esc(D.source) + '). Nothing is fetched, predicted or hand-listed: rerun the program on the same snapshot and it writes the same board.</p>' +
      '<p><code>implied = round(TVL \u00d7 category multiple \u00d7 growth factor \u00d7 maturity factor)</code></p>' +
      '<p><b>Category multiple.</b> For each DefiLlama category, the median market cap / TVL of the snapshot\u2019s token-bearing protocols in it, each ratio first clamped to [' + M.ratio_clamp_lo + ', ' + M.ratio_clamp_hi + '] so one runaway print cannot bend a category. A category with fewer than ' + M.min_peers + ' peers falls back to its family median (lending, trading, yield, staking, bridges, asset issuers, allocators), then to the snapshot-wide median of ' + D.global_median.toFixed(3) + '\u00d7. Each row of the board names the level that priced it, the peer count and the three largest peers, so any price can be audited from the detail view.</p>' +
      '<p><b>Growth factor.</b> <code>1 + clamp(change_7d, ' + M.growth_floor + ', ' + M.growth_cap + ') / 100 \u00d7 ' + M.growth_weight + '</code>; an unreported change counts as 0. <b>Maturity factor.</b> <code>' + M.maturity_base + ' + ' + M.maturity_range + ' \u00d7 min(age_days, ' + M.maturity_days + ') / ' + M.maturity_days + '</code>, age measured from the day DefiLlama began tracking the protocol to the snapshot date; an unknown listing date takes the neutral ' + M.unknown_age_factor + '.</p>' +
      '<p><b>Population.</b> The board applies the snapshot\u2019s watchlist rule at every size: no token recorded, and not a wrapped, staked or bridged product of a token that trades (the house\u2019s excluded categories, version-marked names, names carrying the whole words wrapped / staked / staking, names beginning with an exchange\u2019s). All ' + D.watchlist_size + ' watchlist protocols are ranked, plus ' + D.early_size + ' smaller ones below the ' + fmtUsd(D.floor_usd) + ' floor \u2014 the early rows a launch radar exists to find.</p>' +
      '<p><b>Radar score (0\u2013100)</b> is a triage signal beside the rank, never the rank itself: size 35 (log TVL), momentum 20 (7-day change), track record 20 (days listed), chain reach 10, multiple confidence 15 (category 1.0, family 0.6, global 0.3).</p>' +
      '<p><b>Farm plans</b> are generated per protocol from its category, its chains, its TVL tier (the capital it suggests) and its age (the holding period): the category sets the core action and its standing risk, a second chain in the record adds a second-chain step, and every step states its cost and time.</p>' +
      '<div class="disclaimer">An implied value is what a token would be worth if it were priced like the snapshot\u2019s already-trading peers at the snapshot\u2019s figures. It is not a forecast, not a promise of an airdrop, and not financial advice. Protocols can stay tokenless for years, and TVL can leave faster than it arrived.</div>' +
      '<h3 class="sec" style="margin-top:20px">Category multiples derived from the snapshot</h3>' +
      '<div class="scrollbox"><table class="mini"><thead><tr><th>Category</th><th class="num">Token peers</th><th class="num">Own median</th><th class="num">Multiple used</th><th>Priced at</th></tr></thead><tbody>' + catRows + '</tbody></table></div>' +
      '</section>');
  }

  route();
})();
