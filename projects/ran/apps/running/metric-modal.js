// A number that opens its history and explanation: the modal the Overview's banner and the Race
// Planner's "Where you stand" tiles share. Definitions (series, zones, text) are in metrics.js.
//
//   Run.metricModal(app, { dataset: 'running', tiles: { 'b-vo2': 'vo2', ... } })
//
// `tiles` maps a tile's data-anfra-block to a metric. The tile's .value and .sub (or its .preds /
// .flags) are shown as today's number. The history is two queries, declared on the first click.
/* global echarts, Run */
(function () {
  const { num, fmt0, fmt1, fmt2, pace, duration, css, axisBase, dash } = Run;
  const shortDate = (v) => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const MARKUP = `
<div class="mm-backdrop" id="mm" hidden data-anfra-container="metric-modal" data-anfra-label="Metric history and explanation">
  <div class="mm" role="dialog" aria-modal="true" aria-labelledby="mm-title" data-anfra-block="metric-modal-body" data-anfra-label="Metric modal" data-anfra-query="history">
    <div class="mm-head">
      <div>
        <h2 id="mm-title"></h2>
        <div class="mm-now"><b id="mm-value"></b><span class="small muted" id="mm-sub"></span></div>
      </div>
      <button type="button" class="mm-close" id="mm-close" aria-label="Close">×</button>
    </div>
    <div class="mm-bar">
      <div class="mm-stats" id="mm-stats"></div>
      <div class="mm-range" role="group" aria-label="Time range" id="mm-range">
        <button type="button" data-days="91">3M</button><button type="button" data-days="182">6M</button><button type="button" data-days="365">1Y</button><button type="button" data-days="0">All</button>
      </div>
    </div>
    <div class="mm-chart"><div id="mm-chart" style="height:100%"></div><div class="mm-loading" id="mm-loading"></div></div>
    <div class="mm-text">
      <div><h3>What it is</h3><p id="mm-what"></p></div>
      <div><h3>How it's computed</h3><p id="mm-how"></p></div>
      <div><h3>How to read it</h3><p id="mm-read"></p></div>
    </div>
    <div class="mm-related"><span class="small muted">Related:</span><span id="mm-related" style="display:contents"></span></div>
  </div>
</div>`;

  function metricModal (app, { dataset, tiles }) {
    document.body.insertAdjacentHTML('beforeend', MARKUP);
    const $ = (id) => document.getElementById(id);
    const set = (id, v) => { $(id).textContent = v; };
    const tileOf = Object.fromEntries(Object.entries(tiles).map(([b, k]) => [k, b]));
    let history = null;
    let dailyKm = null;
    let historyRows = null;
    let chart = null;
    let key = null;
    let days = 182;
    let opener = null;

    // Declared on the first click, so opening the page costs nothing; execute() runs only these two.
    function ensureHistory () {
      if (history) return;
      history = app.createQuery('history', { dataset, aql: `
        explore {
          dimensions {
            date: day.calendar_date, load: day.training_load, atl: day.atl, ctl: day.ctl, tsb: day.tsb,
            acwr: day.acwr, monotony: day.monotony, strain: day.strain, load_7d: day.load_7d, rest_days: day.rest_days,
            ready_days: day.ready_days, fresh_days: day.fresh_days,
            vo2e: day.vo2_effective, vo2g: day.vo2max_garmin, shape: day.marathon_shape, rhr: day.resting_hr,
            lt_pace: day.lt_pace_s_per_km, lt_pace_own: day.lt_pace_own_s_per_km, weight: day.weight_kg,
            f_ramp: day.flag_ramp, f_monotony: day.flag_monotony, f_no_rest: day.flag_no_rest, f_rhr: day.flag_resting_hr,
            p5: race_prediction_own.time_5k_s, p10: race_prediction_own.time_10k_s,
            phalf: race_prediction_own.time_half_s, pmar: race_prediction_own.time_marathon_s
          }
          sorts { date asc }
        }` });
      dailyKm = app.createQuery('daily_km', { dataset, aql: `
        explore {
          dimensions { date: activity.start_date }
          measures { km: run_distance_km }
          sorts { date asc }
        }` });
      app.execute();
    }

    // One row per day: the history, daily km and the rolling values the tiles show (7-day km, 7-day resting HR).
    function buildHistory () {
      if (historyRows || history?.state !== 'success' || dailyKm?.state !== 'success') return;
      const kmBy = new Map(dailyKm.result.rows.map((r) => [String(r.date).slice(0, 10), num(r.km) ?? 0]));
      const flag = (v) => (v === true || v === 'true' ? 1 : 0);
      const rows = history.result.rows.map((r) => ({
        ...r, date: String(r.date).slice(0, 10), km: kmBy.get(String(r.date).slice(0, 10)) ?? 0,
        f_ramp: flag(r.f_ramp), f_monotony: flag(r.f_monotony), f_no_rest: flag(r.f_no_rest), f_rhr: flag(r.f_rhr),
        rest_days: num(r.rest_days) ?? 0, ready_days: num(r.ready_days) ?? 0, fresh_days: num(r.fresh_days) ?? 0,
      }));
      rows.forEach((r, i) => {
        const week = rows.slice(Math.max(0, i - 6), i + 1);
        r.km7 = week.reduce((s, w) => s + w.km, 0);
        const hr = week.map((w) => num(w.rhr)).filter((v) => v !== null);
        r.rhr7 = hr.length ? hr.reduce((s, v) => s + v, 0) / hr.length : null;
      });
      historyRows = rows;
      if (key) draw();
    }
    app.subscribe(() => {
      if (history?.state === 'error' || dailyKm?.state === 'error') {
        $('mm-loading').classList.remove('loading');
        set('mm-loading', `Couldn't load the history: ${(history.error ?? dailyKm.error).message}`);
      }
      buildHistory();
    });

    const valueOf = (s, r) => {
      const v = num(r[s.field]);
      return v === null ? null : s.km ? v / s.km : v;   // predictions: time -> pace, so distances share an axis
    };
    const fmtValue = (def, v) => {
      if (v === null || v === undefined || Number.isNaN(v)) return dash;
      if (def.pace) return `${pace(v)} /km`;
      const f = def.digits === 0 ? fmt0 : def.digits === 2 ? fmt2 : fmt1;
      return `${f.format(v)}${def.unit && !['', '/km'].includes(def.unit) ? ` ${def.unit}` : ''}`;
    };

    function open (k, from) {
      if (!window.RunMetrics[k]) return;
      if (from) opener = from;
      key = k;
      $('mm').hidden = false;
      document.body.style.overflow = 'hidden';
      if (!chart) chart = echarts.init($('mm-chart'));
      ensureHistory();
      draw();
      $('mm-close').focus();
    }
    function close () {
      $('mm').hidden = true;
      document.body.style.overflow = '';
      key = null;
      opener?.focus();
    }

    function draw () {
      const def = window.RunMetrics[key];
      const tile = document.querySelector(`[data-anfra-block="${tileOf[key]}"]`);
      set('mm-title', def.title);
      // today's number and its line, as the tile shows them (a metric reached from a chip has no tile here)
      const preds = tile?.querySelector('.preds');
      if (preds) {
        set('mm-value', [...preds.children].map((d) => `${d.children[0].textContent} ${d.children[1].textContent}`).join(' · '));
      } else {
        set('mm-value', (tile?.querySelector('.value') ?? tile?.querySelector('.flags'))?.textContent ?? '');
      }
      $('mm-value').classList.toggle('long', !!preds || !tile?.querySelector('.value'));
      set('mm-sub', tile?.querySelector('.sub')?.textContent ?? '');
      set('mm-what', def.what);
      set('mm-how', def.how);
      set('mm-read', def.read);
      $('mm-related').replaceChildren(...def.related.map((k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = window.RunMetrics[k].title;
        b.addEventListener('click', () => open(k));
        return b;
      }));
      [...$('mm-range').children].forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.days) === days)));

      $('mm-loading').hidden = !!historyRows;
      $('mm-loading').classList.toggle('loading', !historyRows && !$('mm-loading').textContent);
      if (!historyRows) { chart.clear(); $('mm-stats').replaceChildren(); return; }
      // without the latest day the stats would read "today" from a stale row: use the last row's date as now
      if (!$('mm-value').textContent) {
        const last = historyRows.at(-1);
        const s0 = def.series.find((s) => s.main) ?? def.series.find((s) => !s.bar) ?? def.series[0];
        set('mm-value', fmtValue(def, valueOf(s0, last)));
      }
      const end = historyRows.at(-1).date;
      const cutoff = days ? new Date(Date.parse(end) - days * 864e5).toISOString().slice(0, 10) : '';
      const rows = historyRows.filter((r) => r.date >= cutoff);

      // stats on the main series: now, 4 weeks earlier, lowest and highest in the range
      const main = def.series.find((s) => s.main) ?? def.series.find((s) => s.width === 2.5) ?? def.series.find((s) => !s.bar) ?? def.series[0];
      const vals = rows.map((r) => valueOf(main, r));
      const lastI = vals.findLastIndex((v) => v !== null);
      const now = lastI >= 0 ? vals[lastI] : null;
      const before = lastI >= 28 ? vals.slice(0, lastI - 27).findLast((v) => v !== null) ?? null : null;
      const present = vals.filter((v) => v !== null);
      const [lo, hi] = present.length ? [Math.min(...present), Math.max(...present)] : [null, null];
      const change = now !== null && before !== null ? now - before : null;
      const stat = (label, text) => { const d = document.createElement('div'); d.innerHTML = `<span>${label}</span><b></b>`; d.querySelector('b').textContent = text; return d; };
      if (def.series.every((s) => s.stack)) {
        // counts of cautions: how many today, on how many days in the range, which one most often
        const total = (r) => def.series.reduce((n, s) => n + (num(r[s.field]) ?? 0), 0);
        const counts = def.series.map((s) => [s.name, rows.filter((r) => num(r[s.field])).length]).sort((a, c) => c[1] - a[1]);
        $('mm-stats').replaceChildren(
          stat('Today', `${total(rows.at(-1))} of ${def.series.length}`),
          stat('Days with any', `${rows.filter((r) => total(r) > 0).length} of ${rows.length}`),
          stat('Most often', counts[0][1] ? `${counts[0][0]} (${counts[0][1]} days)` : 'none'),
        );
      } else {
        $('mm-stats').replaceChildren(
          stat(def.series.length > 1 ? main.name : 'Latest', fmtValue(def, now)),
          stat('4 weeks ago', fmtValue(def, before)),
          stat('Change', change === null ? dash : def.pace
            ? `${change < 0 ? '−' : '+'}${Math.round(Math.abs(change))} s/km${change < 0 ? ' (faster)' : change > 0 ? ' (slower)' : ''}`
            : `${change > 0 ? '+' : change < 0 ? '−' : '±'}${fmtValue({ ...def, unit: '' }, Math.abs(change))}`),
          stat(days ? 'Range here' : 'Range, all time', lo === null ? dash : `${fmtValue(def, def.pace ? hi : lo)} – ${fmtValue(def, def.pace ? lo : hi)}`),
        );
      }

      const lines = def.series.filter((s) => !s.bar);
      const barAxis = lines.length ? 2 : 0;
      const zoneArea = (def.zones ?? []).map((z) => [
        { yAxis: z.from ?? -1e6, name: z.label, itemStyle: { color: z.color ? css(z.color) : 'transparent', opacity: 0.08 },
          label: { color: css('--muted'), fontSize: 11, position: 'insideTopLeft' } },
        { yAxis: z.to ?? 1e6 },
      ]);
      const series = def.series.map((s, i) => {
        const data = rows.map((r) => valueOf(s, r));
        if (s.bar) {
          return { name: s.name, type: 'bar', stack: s.stack, yAxisIndex: barAxis, data, barMaxWidth: 6,
                   itemStyle: { color: css(s.color), opacity: lines.length ? 0.35 : 0.85 } };
        }
        const first = i === def.series.indexOf(lines[0]);
        return {
          name: s.name, type: 'line', showSymbol: false, connectNulls: true, step: s.step ? 'end' : false, data,
          yAxisIndex: s.axis ?? 0, color: css(s.color),
          lineStyle: { width: s.width ?? 1.5, type: s.dashed ? 'dashed' : 'solid' },
          areaStyle: s.area ? { opacity: 0.1 } : undefined,
          markArea: first && zoneArea.length ? { silent: true, data: zoneArea } : undefined,
          markLine: first && def.lines ? {
            silent: true, symbol: 'none', lineStyle: { color: css('--muted'), type: 'dotted' },
            label: { formatter: (p) => p.name, position: 'insideEndTop', color: css('--muted'), fontSize: 11 },
            data: def.lines.map((l) => ({ yAxis: l.y, name: l.label })),
          } : undefined,
        };
      });
      const tip = (v, s) => {
        if (v === null || v === undefined) return dash;
        if (s?.km) return `${duration(v * s.km)} · ${pace(v)} /km`;
        return fmtValue(def, v);
      };
      chart.setOption({
        animation: false,
        grid: { left: 52, right: def.series.some((s) => s.axis === 1) ? 44 : 16, top: 36, bottom: 56 },
        legend: { top: 0, textStyle: { color: css('--muted') } },
        tooltip: {
          trigger: 'axis',
          formatter: (ps) => `${shortDate(ps[0].axisValue)}<br>${ps.map((p) => `${p.marker}${p.seriesName}: <b>${tip(p.value, def.series[p.seriesIndex])}</b>`).join('<br>')}`,
        },
        xAxis: { type: 'category', data: rows.map((r) => r.date), ...axisBase(),
                 // one label per month (per quarter beyond a year), on its first day
                 axisLabel: { color: css('--muted'), hideOverlap: true,
                              interval: (n, v) => v.endsWith('-01') && (rows.length <= 400 || ['01', '04', '07', '10'].includes(v.slice(5, 7))),
                              formatter: (v) => `${new Date(v).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })} '${v.slice(2, 4)}` } },
        yAxis: [
          { type: 'value', scale: !def.zones && !def.lines && !def.series.every((s) => s.bar), inverse: !!def.pace, ...axisBase(),
            minInterval: def.series.every((s) => s.stack) ? 1 : undefined,
            max: def.lines ? (e) => Math.max(e.max, ...def.lines.map((l) => l.y)) * 1.04 : undefined,
            axisLabel: { color: css('--muted'), formatter: (v) => (def.pace ? pace(v) : fmt0.format(v)) } },
          { type: 'value', ...axisBase(), splitLine: { show: false }, show: def.series.some((s) => s.axis === 1) },
          { type: 'value', show: false, max: (e) => e.max * 3 },
        ],
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8 }],
        series,
      }, { notMerge: true });
      chart.resize();
    }

    // every mapped tile is a button: click, Enter or Space; a button or input inside it (Log weight) keeps its own job
    for (const [block, k] of Object.entries(tiles)) {
      const tile = document.querySelector(`[data-anfra-block="${block}"]`);
      if (!tile) continue;
      tile.dataset.metric = k;
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-haspopup', 'dialog');
      tile.title = 'History and explanation';
      tile.addEventListener('click', (e) => { if (!e.target.closest('button, input, select, a')) open(k, tile); });
      tile.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === tile) { e.preventDefault(); open(k, tile); }
      });
    }
    $('mm-close').addEventListener('click', close);
    $('mm').addEventListener('click', (e) => { if (e.target === $('mm')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && key) close(); });
    $('mm-range').addEventListener('click', (e) => {
      const d = e.target.closest('button')?.dataset.days;
      if (d === undefined) return;
      days = Number(d);
      draw();
    });
    window.addEventListener('resize', () => chart?.resize());
    return { open, close };
  }

  Run.metricModal = metricModal;
})();
