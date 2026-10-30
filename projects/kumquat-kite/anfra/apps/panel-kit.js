// Shared helpers of the Kumquat Kite Anfra panels. Each panel loads this file (by relative path, from the same server)
// before its own code, so every panel formats, pages, charts and explains its numbers the same way. Data still comes
// only from the SDK; this file computes no figure.
(function () {
  'use strict';
  const ctx = JSON.parse(document.getElementById('kk-host-context')?.textContent || '{}');
  const TZ = 'Asia/Ho_Chi_Minh';
  const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const pctF = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
  const ptsF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  const dt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const d8 = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
  const mLong = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, month: 'long', year: 'numeric' });
  const mShort = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, month: 'short', year: 'numeric' });
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNull = (v) => v === null || v === undefined || v === 'NaN' || v === '';
  const isTrue = (v) => v === true || v === 'true' || v === 1 || v === '1';
  const num = (v) => (isNull(v) ? null : Number(v)); // for charts and comparisons only; display uses the string
  const asDate = (v) => new Date(String(v).length === 10 ? `${v}T00:00:00+07:00` : v);
  const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

  const KK = {
    ctx, esc, isNull, isTrue, num, todayVN,
    vnd: (v, na = '—') => (isNull(v) ? `<span class="muted">${esc(na)}</span>` : `${money.format(v)} VND`),
    plainVnd: (v) => (isNull(v) ? '—' : `${money.format(v)} VND`),
    signedVnd: (v) => (isNull(v) ? '—' : `${Number(v) > 0 ? '+' : ''}${money.format(v)} VND`),
    count: (v) => (isNull(v) ? '0' : money.format(v)),
    pct: (v, na = 'not applicable') => (isNull(v) ? `<span class="muted">${esc(na)}</span>` : pctF.format(v)),
    plainPct: (v) => (isNull(v) ? '—' : pctF.format(v)),
    pts: (v) => (isNull(v) ? '—' : `${ptsF.format(Number(v) * 100)} pts`),
    when: (v) => (v ? dt.format(asDate(v)) : '—'),
    day: (v) => (v ? d8.format(asDate(v)) : '—'),
    month: (v) => (v ? mLong.format(asDate(String(v).slice(0, 10))) : '—'),
    monthShort: (v) => (v ? mShort.format(asDate(String(v).slice(0, 10))) : '—'),
    shortVnd: (v) => { const n = Number(v); const a = Math.abs(n); return a >= 1e9 ? `${(n / 1e9).toFixed(1)}bn` : a >= 1e6 ? `${Math.round(n / 1e6)}m` : money.format(n); },
    // figures (its "positive"), purple for the scenario (its "after your decisions"), blue for information and recorded
    // money (its "live"), grey for what is there to compare with, red for refused and amber-brown for waiting. Each
    // keeps at least 3:1 against white. The key-figure blocks take the same colours (panel.css, --viz-*).
    COLORS: { approved: '#1f8a4c', scenario: '#7a5af8', info: '#2a78d6', muted: '#898781', bad: '#d13b3a', warn: '#a15c00', previous: '#898781' },
  };
  for (const [name, colour] of Object.entries({ approved: KK.COLORS.approved, scenario: KK.COLORS.scenario, recorded: KK.COLORS.info })) {
    document.documentElement.style.setProperty(`--viz-${name}`, colour);
  }

  // ---- Start: styles first (no unstyled flash), then the panel's own code, then the height report.
  KK.start = function (main) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('panel.css', document.baseURI).href;
    const ready = new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; });
    document.head.append(link);
    ready.then(() => { main(KK); reportHeight(); });
  };

  // The app around this panel sizes the frame to the content, so the page scrolls instead of the frame. The message is
  // layout only (one number, no data); the app accepts it only from this frame and only within sane bounds.
  // Browsers pause animation frames (and resize observations) in a sandboxed frame that is off screen, as a panel
  // below the fold on a phone is: so the height is also posted when the content changes and a few times after the
  // first draw, never waiting for a frame to be painted.
  function reportHeight() {
    let last = 0; let queued = false;
    const post = () => {
      queued = false;
      const h = Math.ceil(document.body.getBoundingClientRect().height);
      if (Math.abs(h - last) > 1) { last = h; parent.postMessage({ type: 'kk:height', height: h }, '*'); }
    };
    const soon = () => { if (!queued) { queued = true; setTimeout(post, 30); } };
    new ResizeObserver(soon).observe(document.body);
    new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'open', 'style'] });
    window.addEventListener('resize', soon);
    [250, 1000, 2500, 5000].forEach((ms) => setTimeout(post, ms));
    post();
  }

  // ---- Query states, drawn over a block: loading, error (Anfra's message), empty (a sentence, never a bare 0).
  KK.status = function (q, id, empty = 'No data for this scope.') {
    const el = document.getElementById(id); if (!el) return;
    let t = '';
    if (q.state === 'executing' && !q.result) t = 'Loading…';
    else if (q.state === 'error') t = q.error?.name === 'PermissionError' ? 'You may not see these figures.' : `Could not load: ${q.error?.message ?? ''}`;
    else if (q.state === 'success' && q.result.rows.length === 0) t = empty;
    el.textContent = t; el.classList.toggle('visible', Boolean(t)); el.classList.toggle('error', q.state === 'error');
  };
  const logged = new Set();
  KK.first = function (q) {
    if (q.state !== 'success' || logged.has(q.name)) return;
    logged.add(q.name);
    console.log(q.name, 'columns', q.result.columns, 'first row', q.result.rows[0], 'executed AQL', q.result.debug?.executedAql);
  };

  // ---- Tables and paging: one table style; a long table shows a page at a time, and every row stays reachable.
  KK.table = (head, body, foot = '') => `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
  const pages = new Map();
  // id: the element to draw into; rows: the rows to show; row(r, i): a <tr>; query: an SDK-paged query, whose next
  // page is fetched when the reader moves past the rows already loaded.
  KK.paged = function (id, opts) {
    const host = document.getElementById(id); if (!host) return;
    const { rows, head, row, pageSize = 10, query = null, empty = '', note = '', onDraw } = opts;
    const more = Boolean(query?.hasMore);
    const lastPage = Math.max(1, Math.ceil(rows.length / pageSize)) + (more && rows.length % pageSize === 0 ? 1 : 0);
    const page = Math.min(pages.get(id) ?? 1, lastPage);
    pages.set(id, page);
    if (!rows.length) { host.innerHTML = empty; onDraw?.(host); return; }
    const from = (page - 1) * pageSize;
    const slice = rows.slice(from, from + pageSize);
    const total = more ? `${rows.length}+` : String(rows.length);
    const pager = rows.length > pageSize || more ? `<div class="pager" role="navigation" aria-label="Pages of this table">
        <span>Rows ${from + 1}–${from + slice.length} of ${esc(total)}</span>
        <button type="button" data-pg="prev" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹ Previous</button>
        <span>Page ${page} of ${more ? `${lastPage}+` : lastPage}</span>
        <button type="button" data-pg="next" ${page >= lastPage && !more ? 'disabled' : ''} aria-label="Next page">Next ›</button></div>` : '';
    host.innerHTML = KK.table(head, slice.map((r, i) => row(r, from + i)).join('')) + note + pager;
    host.querySelector('[data-pg=prev]')?.addEventListener('click', () => { pages.set(id, page - 1); KK.paged(id, { ...opts, rows: query?.result?.rows ?? rows }); });
    host.querySelector('[data-pg=next]')?.addEventListener('click', async (e) => {
      if ((page * pageSize) >= rows.length && query?.hasMore) {
        e.currentTarget.disabled = true;
        try { await query.fetchMore(); } catch (err) { console.error(err); }
      }
      pages.set(id, page + 1);
      KK.paged(id, { ...opts, rows: query?.result?.rows ?? rows });
    });
    onDraw?.(host);
  };
  KK.resetPage = (id) => pages.delete(id);

  // ---- Charts: ECharts 6.1.0, pinned with its integrity hash; no entry animation, so a picture is always complete.
  let echartsP = null;
  function echartsReady() {
    echartsP ??= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js';
      s.integrity = 'sha384-C2iskrW/uPW46KzOjrvJIQo4YkV8lkD+QS0CrDN18IIPIpT/g2USu8bTP3nvmIAD';
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(window.echarts);
      s.onerror = () => reject(new Error('The chart could not be drawn (the chart library did not load).'));
      document.head.append(s);
    });
    return echartsP;
  }
  // - The legend is laid out here, before the plot is placed: its items are packed into as many centred rows as the
  //   chart's width needs (one legend component per row), so its height is known and the plot starts below it.
  // - A value label drawn above a mark (a line point, a bar with position 'top') gets its own band between the legend
  //   and the plot. A labelled line over bars (gross profit and margin) shows its values in a row of their own above
  //   the plot, in the line's colour, because on its points they would sit on the bars. A label to the right of a
  //   bar gets room measured from the widest label it will draw.
  // - Value axes end on a rounded tick above the largest value (and below the smallest negative one), so a mark at
  //   the maximum never touches the plot's edge.
  // - Labels that would still collide are hidden: their value stays in the tooltip and in the table under the chart.
  //   Category labels a panel shows in full (interval 0) wrap to the width of their band instead.
  // - A new width lays the chart out again (legend rows, label widths), not just rescales it.
  // The data and the figures are untouched: only the space around them changes. ECharts draws SVG, so labels are real
  // text that a test can measure (tests/ui/charts.spec.mjs).
  // 2026; the same ECharts version): small muted axis labels; light gridlines across the value axis and a baseline
  // under the categories, with no ticks; square legend keys in secondary ink; a white tooltip with a hairline border,
  // rounded corners and a soft shadow, over a shaded band on bar charts; flat marks in the colours above. Measurements
  // still use 12px, so the layout keeps a little slack for the 11px labels. A panel's own setting wins.
  const FONT = 12;
  const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const INK = '#0b0b0b', INK_2 = '#52514e', INK_MUTED = '#898781', GRID_LINE = '#e8e7e1', BASELINE = '#c3c2b7';
  const LEGEND = { itemWidth: 10, itemHeight: 10, itemGap: 10, padding: 5, row: 22 };
  const LABEL_BAND = Math.ceil(FONT * 1.5);
  let measurer = null;
  const textWidth = (text) => {
    measurer ??= document.createElement('canvas').getContext('2d');
    measurer.font = `${FONT}px ${FONT_FAMILY}`;
    return Math.ceil(measurer.measureText(String(text)).width);
  };
  KK.niceCeil = function (v, headroom = 1.15) {
    if (!(v > 0)) return 0;
    const target = v * headroom;
    const raw = target / 5;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
    return Math.ceil(target / step) * step;
  };
  const arr = (v) => [].concat(v ?? []);
  const nameOf = (d) => (d !== null && typeof d === 'object' ? d.name : d);
  const valueOf = (d) => (d !== null && typeof d === 'object' ? d.value : d);
  const labelPlace = (s) => (s.label?.show ? s.label.position ?? (s.type === 'line' ? 'top' : 'inside') : null);
  const labelText = (s, d, i) => {
    const v = valueOf(d); if (v === null || v === undefined) return '';
    const f = s.label?.formatter;
    return typeof f === 'function' ? f({ value: v, data: d, dataIndex: i, seriesName: s.name }) : String(v);
  };
  const withHeadroom = (axis) => (axis?.type === 'value' && axis.max === undefined
    ? { ...axis, max: (e) => (e.max > 0 ? KK.niceCeil(e.max) : 0), min: axis.min ?? ((e) => (e.min < 0 ? -KK.niceCeil(-e.min) : 0)) } : axis);
  const withCategoryLabels = (axis) => (axis?.type !== 'category' ? axis
    : { ...axis, axisLabel: axis.axisLabel?.interval === 0 ? { overflow: 'break', lineHeight: Math.round(FONT * 1.4), ...axis.axisLabel } : { hideOverlap: true, ...axis.axisLabel } });
  // Category labels under the plot start a full text height below the axis, so they clear the value axis's lowest
  // label, which is centred on that axis line, even where a wide first label reaches past the plot's left edge.
  const belowAxis = (axis) => (axis?.type === 'category' && axis.position !== 'top' ? { ...axis, axisLabel: { margin: FONT, ...axis.axisLabel } } : axis);
  const mapAxes = (v, f) => (Array.isArray(v) ? v.map(f) : v && f(v));
  const themed = (axis) => {
    if (!axis) return axis;
    const value = axis.type === 'value';
    // The font is named on the labels themselves: ECharts sizes the room for wrapped labels with the label's own font,
    // not the chart's, and a narrower guess would leave a second line outside the chart. On a value axis, a label that
    // would touch its neighbour (an end value set by the headroom above) is left out; its gridline stays.
    return { ...axis, axisLabel: { color: INK_MUTED, fontSize: 11, fontFamily: FONT_FAMILY, ...(value ? { hideOverlap: true } : {}), ...axis.axisLabel },
      axisTick: { show: false, ...axis.axisTick },
      axisLine: { show: !value, ...axis.axisLine, lineStyle: { color: BASELINE, ...axis.axisLine?.lineStyle } },
      splitLine: { show: value, ...axis.splitLine, lineStyle: { color: GRID_LINE, ...axis.splitLine?.lineStyle } } };
  };
  KK.legendRows = function (items, width) {
    const room = width - 2 * LEGEND.padding - 8; // 8px of slack against rounding in the measurement
    const rows = [[]]; let used = 0;
    for (const item of items) {
      const w = LEGEND.itemWidth + 5 + textWidth(nameOf(item));
      if (rows.at(-1).length && used + LEGEND.itemGap + w > room) { rows.push([]); used = 0; }
      used += (rows.at(-1).length ? LEGEND.itemGap : 0) + w;
      rows.at(-1).push(item);
    }
    return rows;
  };
  KK.chartOption = function (option, width) {
    let series = arr(option.series);
    const out = { ...option };
    out.xAxis = mapAxes(mapAxes(mapAxes(mapAxes(option.xAxis, withHeadroom), withCategoryLabels), belowAxis), themed);
    out.yAxis = mapAxes(mapAxes(mapAxes(option.yAxis, withHeadroom), withCategoryLabels), themed);
    const cat = arr(option.xAxis)[0];
    const lines = cat?.type === 'category' && series.some((s) => s.type === 'bar') ? series.filter((s) => s.type === 'line' && labelPlace(s) === 'top') : [];
    if (lines.length === 1) {
      const line = lines[0];
      const texts = arr(line.data).map((d, i) => labelText(line, d, i));
      out.xAxis = [...arr(out.xAxis), { type: 'category', position: 'top', data: arr(cat.data), kkLabelRow: line.name,
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisPointer: { show: false },
        axisLabel: { interval: 0, hideOverlap: true, margin: 6, color: line.itemStyle?.color ?? line.color, fontWeight: 600, formatter: (_v, i) => texts[i] ?? '' } }];
      series = series.map((s) => (s === line ? { ...s, label: { ...s.label, show: false } } : s));
    }
    let legendHeight = 8;
    if (option.legend) {
      const { data, ...legend } = option.legend;
      const rows = KK.legendRows(data ?? series.map((s) => s.name), width);
      out.legend = rows.map((items, r) => ({ icon: 'rect', ...legend, type: 'plain', left: 'center', top: r * LEGEND.row, padding: LEGEND.padding,
        itemWidth: LEGEND.itemWidth, itemHeight: LEGEND.itemHeight, itemGap: LEGEND.itemGap, textStyle: { color: INK_2, fontSize: 11.5, fontFamily: FONT_FAMILY, ...legend.textStyle }, data: items }));
      legendHeight = rows.length * LEGEND.row + 8;
    }
    const top = series.some((s) => labelPlace(s) === 'top');
    const right = Math.max(0, ...series.filter((s) => labelPlace(s) === 'right').flatMap((s) => arr(s.data).map((d, i) => textWidth(labelText(s, d, i)))));
    out.grid = { left: 8, bottom: 8, containLabel: true, ...option.grid, top: legendHeight + (top ? LABEL_BAND : 0), right: Math.max(16, right ? right + 10 : 0) };
    out.series = series.map((s) => ({ ...s,
      ...(s.type === 'line' ? { symbol: s.symbol ?? 'circle', symbolSize: s.symbolSize ?? 6, lineStyle: { width: 2, ...s.lineStyle } } : {}),
      ...(s.label?.show ? { label: { color: INK_2, fontSize: 11, fontFamily: FONT_FAMILY, ...s.label }, labelLayout: { hideOverlap: true, ...s.labelLayout } } : {}) }));
    const tip = option.tooltip;
    if (tip) {
      out.tooltip = { backgroundColor: '#fff', borderColor: 'rgba(11, 11, 11, 0.12)', borderWidth: 1, padding: [8, 10],
        extraCssText: 'border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);', ...tip, textStyle: { color: INK, fontSize: 12, ...tip.textStyle },
        ...(tip.trigger === 'axis' && series.some((x) => x.type === 'bar') ? { axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(11, 11, 11, 0.05)' }, ...tip.axisPointer } } : {}) };
    }
    return out;
  };
  // Category labels shown in full wrap to the width of their band, which only the drawn chart knows.
  function fitCategoryLabels(c) {
    const xAxis = arr(c.getOption().xAxis).map((a, i) => {
      if (a.type !== 'category' || a.axisLabel?.interval !== 0 || a.axisLabel?.rotate || a.position === 'top') return {};
      const n = arr(a.data).length;
      const band = n > 1 ? Math.abs(c.convertToPixel({ xAxisIndex: i }, 1) - c.convertToPixel({ xAxisIndex: i }, 0)) : c.getWidth() - 80;
      return { axisLabel: { width: Math.max(24, Math.floor(band) - 6) } };
    });
    if (xAxis.some((a) => a.axisLabel)) c.setOption({ xAxis });
  }

  const charts = new Map();
  function draw(el, entry) {
    entry.width = el.clientWidth;
    entry.c.setOption({ animation: false, textStyle: { fontFamily: FONT_FAMILY, fontSize: FONT, color: INK_2 }, ...KK.chartOption(entry.option, entry.width) }, { notMerge: true });
    fitCategoryLabels(entry.c);
  }
  KK.chart = async function (id, option) {
    const el = document.getElementById(id); if (!el) return null;
    try {
      const echarts = await echartsReady();
      let entry = charts.get(el);
      if (!entry || entry.c.isDisposed()) {
        entry = { c: echarts.init(el, null, { renderer: 'svg' }) };
        charts.set(el, entry);
        new ResizeObserver(() => { entry.c.resize(); if (el.clientWidth !== entry.width) draw(el, entry); }).observe(el);
      }
      entry.option = option;
      draw(el, entry);
      el.dataset.drawn = 'true';
      return entry.c;
    } catch (e) {
      el.innerHTML = `<p class="small muted">${esc(e.message)} The table has the same figures.</p>`;
      el.style.height = 'auto';
      return null;
    }
  };
  KK.axisVnd = { type: 'value', axisLabel: { formatter: (v) => KK.shortVnd(v) } };
  KK.axisPct = { type: 'value', axisLabel: { formatter: (v) => `${Math.round(v * 100)}%` }, splitLine: { show: false } };
  KK.tipVnd = (v) => (v === null || v === undefined ? '—' : `${money.format(v)} VND`);

  // ---- Report filters: contract-signed period and client, as SDK filters mapped onto the given queries, so they show
  // in every query's executed AQL. Their starting values come from the app (the reader's last report), else the
  // current month and the three before it.
  function defaultPeriod() {
    const [y, m] = todayVN.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 4, 1)); const end = new Date(Date.UTC(y, m, 0));
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  KK.filters = function (app, DS, { period = true, client = true } = {}) {
    const given = ctx.filters ?? {};
    const p0 = given.period && /^\d{4}-\d{2}-\d{2}$/.test(given.period.from) && /^\d{4}-\d{2}-\d{2}$/.test(given.period.to) ? given.period : defaultPeriod();
    const out = { period: null, client: null, queries: [] };
    const box = document.getElementById('filters');
    let html = '';
    if (period) {
      out.period = app.createFilter('period', { dataset: DS, field: 'projects.contract_signed_date', label: 'Period (contract signed)',
        default: { operator: 'between', values: [p0.from, p0.to] } });
      html += `<div class="block" data-anfra-block="period-picker" data-anfra-label="Period by contract-signed date" data-anfra-control="period">
        <label class="small" for="from"><b>Contract signed</b></label> <input type="date" id="from" aria-label="From" value="${esc(p0.from)}">
        <span aria-hidden="true">→</span> <input type="date" id="to" aria-label="To" value="${esc(p0.to)}"> <button type="button" id="apply">Apply</button></div>`;
    }
    if (client) {
      out.client = app.createFilter('client', { dataset: DS, field: 'clients.display_name', label: 'Client' });
      if (given.client) out.client.setCondition({ operator: 'is', values: [String(given.client)] });
      html += `<div class="block" data-anfra-block="client-picker" data-anfra-label="Client" data-anfra-control="client">
        <label class="small" for="client"><b>Client</b></label> <select id="client"><option value="">All clients</option></select></div>`;
    }
    if (box) box.innerHTML = html;
    out.map = (...queries) => {
      for (const q of queries) {
        if (out.period) app.mapControl(out.period, q, { field: 'projects.contract_signed_date' });
        if (out.client) app.mapControl(out.client, q, { field: 'clients.display_name' });
        out.queries.push(q);
      }
    };
    out.wire = () => {
      document.getElementById('apply')?.addEventListener('click', () => {
        const f = document.getElementById('from').value; const t = document.getElementById('to').value;
        if (!f || !t || f > t) { document.getElementById('from').setCustomValidity('The start must not be after the end.'); document.getElementById('from').reportValidity(); return; }
        document.getElementById('from').setCustomValidity('');
        out.period.setCondition({ operator: 'between', values: [f, t] });
        app.execute();
      });
      if (out.client) {
        out.client.loadOptions().then((opts) => {
          const sel = document.getElementById('client');
          for (const o of opts) sel.append(new Option(String(o), String(o)));
          if (given.client) sel.value = String(given.client);
        }).catch((e) => console.error('client options', e));
        document.getElementById('client').addEventListener('change', (e) => {
          out.client.setCondition({ operator: 'is', values: e.target.value ? [e.target.value] : [] });
          app.execute();
        });
      }
    };
    out.describe = () => {
      const p = out.period?.condition?.values ?? [p0.from, p0.to];
      const c = out.client?.condition?.values?.[0];
      return `${out.period ? `contract signed <b>${esc(KK.day(p[0]))}</b> → <b>${esc(KK.day(p[1]))}</b>${String(p[1]) >= `${todayVN.slice(0, 7)}-01` ? ' (includes the month in progress, which is incomplete)' : ''}` : 'no period (the pipeline is as of today)'}${out.client ? ` · client <b>${esc(c ?? 'all')}</b>` : ''}`;
    };
    return out;
  };

  // ---- "Why this number?": definitions from the compiled AML (with the definition-set fingerprint), then the rest.
  KK.why = function (id, { metrics = [], items = [] }) {
    const el = document.getElementById(id); if (!el) return;
    const d = (n) => ctx.definitions?.[n] ?? {};
    el.innerHTML = `<dl>
      <dt>Definition and version</dt><dd>${metrics.map((n) => `<div><b>${esc(d(n).label ?? n)}</b>${d(n).description ? ` — ${esc(d(n).description)}` : ''}<pre class="aql">${esc(d(n).definition || n)}</pre></div>`).join('')}
        <span class="small muted">Taken from the compiled AML (core.show), not typed into this panel. Definition set <b class="mono">${esc(ctx.definitionsVersion ?? 'unknown')}</b>: a fingerprint of every metric definition in the dataset, which changes whenever any definition changes.</span></dd>
      ${items.map(([t, html]) => `<dt>${esc(t)}</dt><dd>${html}</dd>`).join('')}</dl>`;
  };
  KK.fresh = (id, lastCommitted, query) => {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = `Last committed <b>${esc(KK.when(lastCommitted))}</b><br>Queried ${esc(KK.when(query?.result?.debug?.executedAt))}`;
  };

  window.KK = KK;
})();
