// Shared by the running Data Apps: formatting and chart styling. The apps only read (AQL, through the
// SDK): nothing here calls a server of its own or writes back.
/* global echarts */
(function () {
  const TZ = 'Asia/Bangkok';
  const dash = '–';

  const num = (v) => (v === null || v === undefined || v === 'NaN' ? null : Number(v));
  const fmt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  const fmt1 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt2 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function pace (secPerKm) {
    const s = num(secPerKm);
    if (s === null || !isFinite(s) || s <= 0 || s > 3600) return dash;
    const m = Math.floor(s / 60), r = Math.round(s % 60);
    return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, '0')}`;
  }
  const paceFromSpeed = (mps) => { const v = num(mps); return v ? pace(1000 / v) : dash; };
  function duration (sec) {
    const s = num(sec);
    if (s === null) return dash;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.floor(s % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  }
  const or = (v, f) => (num(v) === null ? dash : f(num(v)));
  // Truncated dates arrive as UTC instants of local midnight; plain dates as YYYY-MM-DD.
  function periodLabel (v, g) {
    const opts = g === 'year' ? { year: 'numeric' }
      : g === 'month' ? { month: 'short', year: '2-digit' }
      : { day: 'numeric', month: 'short', year: '2-digit' };
    return new Date(v).toLocaleDateString(undefined, { ...opts, timeZone: TZ });
  }
  // A local wall-clock "YYYY-MM-DD HH:MI" string: formatted without any zone conversion.
  function localWhen (v, withTime = true) {
    if (!v) return dash;
    const [d, t] = String(v).split(/[ T]/);
    const date = new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined,
      { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return withTime && t ? `${date} ${t.slice(0, 5)}` : date;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const axisBase = () => ({
    axisLabel: { color: css('--muted') },
    splitLine: { lineStyle: { color: css('--border') } },
    axisLine: { lineStyle: { color: css('--border') } },
  });

  // Loading / error / empty overlay for a query's panel.
  // A chart's overlay: a shimmering placeholder until its first result, then a message for an
  // error or no rows. A re-run keeps the chart it has.
  function renderStatus (query, el, emptyText = 'No data in this period') {
    let text = '';
    el.classList.remove('error');
    const loading = !!query && !query.result && query.state !== 'error';
    if (!query || loading) text = '';
    else if (query.state === 'error') { text = `Couldn't load: ${query.error.message}`; el.classList.add('error'); }
    else if (query.state === 'success' && query.result.rows.length === 0) text = emptyText;
    el.textContent = text;
    el.classList.toggle('loading', loading);
    el.classList.toggle('visible', loading || text !== '');
  }

  // Placeholder rows for a table body until its renderer fills it.
  function skeletonRows (tbody, cols, rows = 4) {
    if (!tbody) return;
    const widths = [62, 78, 54, 70, 46, 66];
    tbody.innerHTML = Array.from({ length: rows }, (_, r) =>
      `<tr aria-hidden="true">${Array.from({ length: cols }, (_, c) =>
        `<td${c === 0 ? ' class="l"' : ''}><span class="sk" style="width:${widths[(r + c) % widths.length]}%"></span></td>`).join('')}</tr>`).join('');
  }

  // Remembers which result object each query last drew, so a render only redraws what changed.
  function changeTracker () {
    const last = new Map();
    return (query) => {
      if (!query?.result || last.get(query.name) === query.result) return false;
      last.set(query.name, query.result);
      return true;
    };
  }

  function logFirstResults () {
    const seen = new Set();
    return (...queries) => {
      for (const q of queries) {
        if (!q || q.state !== 'success' || seen.has(q.name)) continue;
        seen.add(q.name);
        console.log(q.name, q.result.columns.map((c) => c.name), q.result.rows[0], q.result.debug?.executedAql);
      }
    };
  }

  // A .table-wrap wider than its box gets .overflows (a soft right edge that says it scrolls),
  // cleared once scrolled to the end. Checked after any change to the page, at most once a frame.
  function markOverflow () {
    document.querySelectorAll('.table-wrap').forEach((w) => {
      const over = w.scrollWidth > w.clientWidth + 2;
      w.classList.toggle('overflows', over);
      w.classList.toggle('at-end', over && w.scrollLeft + w.clientWidth >= w.scrollWidth - 2);
    });
  }
  let overflowFrame = 0;
  const queueOverflow = () => { if (!overflowFrame) overflowFrame = requestAnimationFrame(() => { overflowFrame = 0; markOverflow(); }); };
  new MutationObserver(queueOverflow).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', queueOverflow);
  document.addEventListener('scroll', (e) => { if (e.target.classList?.contains('table-wrap')) queueOverflow(); }, true);

  window.Run = {
    TZ, dash, num, fmt0, fmt1, fmt2, pace, paceFromSpeed, duration, or, periodLabel, localWhen, esc,
    css, axisBase, renderStatus, skeletonRows, changeTracker, logFirstResults,
  };
})();
