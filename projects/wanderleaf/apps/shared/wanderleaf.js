// Wanderleaf shared helpers: formatting, metric chips, the Inspect drawer, the painted stage, and
// the one app-side rule. Every number the apps show comes from a governed metric in
// datasets/wanderleaf.dataset.aml; this file only formats and combines them.
(function () {
  const WL = {};

  WL.DATASET = 'wanderleaf';
  WL.PLAN_DAY = '2025-06-14';
  WL.LAST_YEAR_DAY = '2024-06-15';

  // ---- Formatting (values arrive as strings) --------------------------------------------------
  const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  const int0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  WL.num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  WL.money = (v) => (WL.num(v) === null || Number.isNaN(WL.num(v)) ? '—' : gbp0.format(WL.num(v)));
  WL.int = (v) => (WL.num(v) === null ? '—' : int0.format(WL.num(v)));
  WL.pct = (v, digits = 0) => (WL.num(v) === null || !Number.isFinite(WL.num(v)) ? '—' : (WL.num(v) * 100).toFixed(digits) + '%');
  WL.signedPct = (v, digits = 0) => {
    const n = WL.num(v);
    if (n === null || !Number.isFinite(n)) return '—';
    const p = (n * 100).toFixed(digits);
    return (n > 0 ? '+' : n < 0 ? '−' : '') + p.replace('-', '') + '%';
  };
  WL.round5 = (n) => Math.round(n / 5) * 5;
  WL.round10 = (n) => Math.round(n / 10) * 10;
  WL.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  WL.fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
    if (!iso) return '—';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    // en-GB writes September as "Sept" but every other month in three letters: keep them alike
    return d.toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, opts)).replace(/\bSept\b/, 'Sep');
  };

  // ---- Governed metric definitions, as written in datasets/wanderleaf.dataset.aml --------------
  WL.METRICS = {
    takings: 'sales | sum(sales.net_revenue)',
    units_sold: 'sales | sum(sales.units)',
    visitors: 'trading_days | sum(trading_days.visitor_count)',
    requests: 'genre_requests | sum(genre_requests.request_count)',
    units_loaded: 'crate_loads | sum(crate_loads.units_loaded)',
    trading_day_count: 'trading_days | count(trading_days.day_id)',
    conversion: 'safe_divide(units_sold * 1.0, visitors)',
    sell_through: 'safe_divide(units_sold * 1.0, units_loaded)',
    fill_rate: 'safe_divide(units_sold * 1.0, requests)',
    takings_per_book: 'safe_divide(takings * 1.0, units_sold)',
    unmet_requests: 'case(when: coalesce(requests, 0) > coalesce(units_sold, 0),\n     then: coalesce(requests, 0) - coalesce(units_sold, 0), else: 0)',
    books_came_home: 'coalesce(units_loaded, 0) - coalesce(units_sold, 0)',
    genre_share: 'safe_divide(requests * 1.0, requests | of_all(genres.genre))',
    genre_rank_at_spot: 'rank(order: requests | desc(), partition: spots.name)',
    genre_town_median: '(unique(spots.name) | select(v: requests) | median(v)) | of_all(spots.name)',
    spot_index: 'safe_divide(requests * 1.0, genre_town_median)',
    takings_last_year: 'takings | relative_period(trading_days.date, interval(-364 days))',
    score_vs_last_year: 'safe_divide(takings * 1.0, takings_last_year) - 1',
    running_takings: 'takings | running_total(trading_days.date)',
    avg_daily_takings: 'unique(trading_days.day_id) | select(v: coalesce(takings, 0)) | avg(v)',
    weather_effect: "safe_divide((avg_daily_takings | where(trading_days.weather == 'rain')) * 1.0,\n            avg_daily_takings | where(trading_days.weather == 'sun')) - 1",
    forecast_takings: 'unique(trading_days.day_id) | select(v: coalesce(takings, 0)) | median(v)',
    forecast_takings_low: 'unique(trading_days.day_id) | select(v: coalesce(takings, 0)) | percentile_cont(v, 0.25)',
    forecast_takings_high: 'unique(trading_days.day_id) | select(v: coalesce(takings, 0)) | percentile_cont(v, 0.75)',
    forecast_requests: 'unique(trading_days.day_id) | select(v: coalesce(requests, 0)) | median(v)',
    similar_day_count: 'trading_days | count(trading_days.day_id)',
    turned_away: 'unique(trading_days.day_id, genres.genre) | select(v: unmet_requests) | sum(v)',
    genre_list_price: 'books | avg(books.list_price)',
    lost_sales: 'unique(trading_days.day_id, genres.genre) | select(v: unmet_requests * genre_list_price) | sum(v)',
    crate_capacity_sent: 'trading_days | sum(caravans.crate_capacity)',
    crate_utilisation: 'safe_divide(units_sold * 1.0, crate_capacity_sent)',
  };

  WL.GENRE_FILL = { Mystery: '#E9A090', Travel: '#9DC0DE', Romance: '#EDB9C6', "Children's": '#BCD597', History: '#DBBD8F', Cookery: '#F0CC82',
    Fantasy: '#BBAEDB', Poetry: '#A2D0CB', Nature: '#B9CFA0', 'Sci-fi': '#B3C4D9', Philosophy: '#D6C3A8' };
  WL.VAN_COLOURS = { Juniper: '#6E9A7A', Hazel: '#B5876F', Bramble: '#C9A24A', Sorrel: '#7F93A8', Wren: '#A07FA6' };
  WL.VAN_ORDER = ['Juniper', 'Hazel', 'Bramble', 'Sorrel', 'Wren'];
  WL.SPOT_ORDER = ['Harbour', 'Old Town Square', 'Saturday Market', 'University', 'Lighthouse'];

  // A metric chip. data-q names the query that produced the number, so a click opens Inspect on it.
  WL.chip = (metric, query, text) =>
    `<button type="button" class="chip" data-metric="${WL.esc(metric)}" data-q="${WL.esc(query || '')}" title="Governed metric ${WL.esc(metric)}: click to inspect">${WL.esc(text || metric)}</button>`;

  // ---- Inspect drawer: the metric definition, the AQL that ran (with the reader's filters and
  //      cross-filter applied) and the SQL anfra generated. Also points at the host's Inspect panel.
  WL.installInspect = (queries) => {
    const el = document.createElement('aside');
    el.className = 'inspect';
    el.setAttribute('data-anfra-render', 'skip');
    el.setAttribute('aria-label', 'Inspect');
    document.body.appendChild(el);
    const close = () => el.classList.remove('open');
    const open = (metric, qname, headline) => {
      const q = queries[qname];
      const r = q && q.result;
      const dbg = (r && r.debug) || {};
      const def = WL.METRICS[metric];
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:#F6E7A6">Inspect · ${WL.esc(headline || metric)}</span>
          <button type="button" class="x" aria-label="Close Inspect">×</button>
        </div>
        <div><div class="k">Metric</div><pre>${def ? WL.esc(`metric ${metric} {\n  definition: @aql ${def} ;;\n}`) : WL.esc(metric)}</pre></div>
        <div><div class="k">Query “${WL.esc(qname)}” (AQL as executed)</div><pre>${WL.esc(dbg.executedAql || (q ? '(not run yet)' : '(no query)'))}</pre></div>
        <div><div class="k">Generated SQL (DuckDB)</div><pre>${WL.esc(dbg.executedSql || '(hidden or not run yet)')}</pre></div>
        <div class="meta">${r ? `${WL.esc(r.meta.numRows)} rows · ${dbg.fromCache ? 'cached' : 'not cached'} · ${WL.esc(dbg.executedAt || '')}` : ''}</div>
        <div style="display:flex;gap:8px;align-items:center">
          ${q ? '<button type="button" class="loc">Locate on page</button>' : ''}
        </div>
        <div style="font-size:12px;color:#D6D0C4;line-height:1.45">The same definition feeds Overview and every step of Try a day.
        anfra serve's own <b>Inspect</b> panel (top bar) lists this query under <b>Data</b> as “${WL.esc(qname)}”.</div>`;
      el.querySelector('.x').onclick = close;
      const loc = el.querySelector('.loc');
      if (loc) loc.onclick = () => q.locate();
      el.classList.add('open');
    };
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-metric]');
      if (c && c.closest('[data-trace]')) return;   // a traceable number opens the check panel instead
      if (!c) return;
      e.stopPropagation();
      open(c.getAttribute('data-metric'), c.getAttribute('data-q'), c.getAttribute('data-headline') || c.textContent.trim());
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return { open, close };
  };

  // ---- The painted 1440 × 900 stage, scaled to the frame width -----------------------------------
  // Fits the whole stage in the window (no scrollbars, so no resize feedback loop).
  // top: height of any bar above the stage (the page itself decides whether it scrolls)
  WL.fitStage = (wrap, stage, top = 0) => {
    let last = 0;
    const fit = () => {
      const s = Math.min(1, window.innerWidth / 1440, (window.innerHeight - top) / 900);
      if (Math.abs(s - last) < 0.001) return;
      last = s;
      stage.style.transform = `scale(${s})`;
      wrap.style.height = 900 * s + 'px';
      wrap.style.width = 1440 * s + 'px';
      // centred both ways in the space left, so a wide or tall window has even margins rather than one dark band
      wrap.style.margin = `${Math.max(0, (window.innerHeight - top - 900 * s) / 2)}px auto 0`;
    };
    window.addEventListener('resize', fit);
    fit();
  };

  // ---- Query state helpers -------------------------------------------------------------------------
  WL.stateText = (q, empty) => {
    if (q.state === 'error') return { text: `Couldn't load: ${q.error.message}`, error: true };
    if (!q.result) return { text: 'Loading…' };   // not run yet, or running for the first time
    if (q.state === 'success' && q.result.rows.length === 0) return { text: empty || 'No data' };
    return null;
  };
  const logged = new Set();
  WL.logFirst = (q) => {
    if (q.state !== 'success' || logged.has(q.name)) return;
    logged.add(q.name);
    console.log(q.name, 'columns', q.result.columns, 'first row', q.result.rows[0], 'executed AQL', q.result.debug?.executedAql);
  };
  WL.ready = (...qs) => qs.every((q) => q.state === 'success' || (q.result && q.state === 'executing'));

  // ---- The one app-side rule ------------------------------------------------------------------------
  // A caravan's forecast sales (books) = the smaller of its crate_capacity and its share of the
  // spot's forecast requests, with a 15% cut for a caravan without an awning in rain.
  // Inputs are governed (forecast_requests, crate_capacity, has_awning); only this min() is app-side.
  WL.RULE_TEXT = 'Each caravan sells the smaller of its crate size and its share of the spot’s forecast demand (15% less in rain without an awning).';
  WL.caravanSales = (requests, vansHere, rain) => {
    const n = vansHere.length;
    return vansHere.map((v) => {
      let share = n ? requests / n : 0;
      const cut = rain && !v.awning;
      if (cut) share *= 0.85;
      return { van: v, share, books: Math.min(v.capacity, share), capped: share > v.capacity, cut };
    });
  };

  // ---- Little villagers for the map: one figure stands for a few people asking for books ----------
  const COATS = ['#B5654A', '#6E9A7A', '#4A6585', '#D9A441', '#8C6F9E', '#A0412A'];
  const SKINS = ['#F1CDB3', '#B98463', '#E7BFA0', '#A9785A'];
  const HAIR = ['#3E2F2A', '#7A6A58', '#C9C4BC', '#2F2A30', '#9A5A3A'];
  WL.villager = (i, umbrella) => {
    const coat = COATS[i % COATS.length], skin = SKINS[(i * 3 + 1) % SKINS.length], hair = HAIR[(i * 2 + 1) % HAIR.length];
    const brolly = umbrella
      ? `<path d="M1 9 C2 1 20 1 21 9 C18 7 15 7 11 9 C7 7 4 7 1 9 Z" fill="${['#D9694A', '#4A6585', '#E9C24F', '#6E9A7A'][i % 4]}"/><path d="M11 9 V20" stroke="#3B3A45" stroke-width="1.2"/>`
      : '';
    return `<svg width="22" height="40" viewBox="0 0 22 40" aria-hidden="true">${brolly}
      <ellipse cx="11" cy="38.5" rx="6" ry="1.5" fill="#3B3A45" opacity="0.18"/>
      <rect x="7.5" y="28" width="3" height="10" rx="1.4" fill="#3B3A45"/><rect x="11.5" y="28" width="3" height="10" rx="1.4" fill="#3B3A45"/>
      <path d="M5 30 C5 22 7 18 11 18 C15 18 17 22 17 30 Z" fill="${coat}"/>
      <circle cx="11" cy="13.5" r="4.6" fill="${skin}"/>
      <path d="M6.4 13 C6.4 7.5 15.6 7.5 15.6 13 C13.5 10.5 8.5 10.5 6.4 13 Z" fill="${hair}"/></svg>`;
  };
  // Portraits of the regulars (files in shared/art: swap them for any image of the same name)
  WL.portrait = (file, size = 44) =>
    `<img src="shared/art/${file}" width="${size}" height="${size}" alt="" style="border-radius:999px;flex:none;box-shadow:0 0 0 2px var(--paper),0 2px 6px rgba(59,58,69,0.2)">`;

  window.WL = WL;
})();
