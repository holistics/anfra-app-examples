/*
 * anfra-anomaly.js: anomaly detection for a time-series chart in an Anfra Data App.
 *
 * Copied into the repo's apps/_lib/ by the anfra detect-anomaly skill. Don't edit the copy: to
 * upgrade, copy the newer file over it. The method and its rules are in the skill's
 * references/method.md.
 */
(function (root) {
  'use strict';

  const VERSION = '0.5.0';
  const GRAINS = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute'];
  const FIELD_REF = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

  // The skill's query: each bucket judged against every bucket before it. No filter on time, so
  // the baseline reaches the start of the series. See references/method.md.
  function buildAql (spec) {
    const { measure, time, grain } = spec;
    const k = spec.k === undefined ? 3 : spec.k;
    if (!FIELD_REF.test(String(measure))) {
      throw new Error(`AnfraAnomaly: measure '${measure}' is not a field reference (model.field, or a dataset metric's name).`);
    }
    if (!FIELD_REF.test(String(time)) || !String(time).includes('.')) {
      throw new Error(`AnfraAnomaly: time '${time}' must be a model.field reference.`);
    }
    if (!GRAINS.includes(grain)) {
      throw new Error(`AnfraAnomaly: unknown grain '${grain}'. Expected one of: ${GRAINS.join(', ')}.`);
    }
    if (typeof k !== 'number' || !(k > 0)) throw new Error('AnfraAnomaly: k must be a positive number.');

    const order = `order: ${time} | ${grain}() | asc(), partition: []`;
    return [
      `metric m_prev       = window_avg(${measure}, -1..-1, ${order});`,
      `metric m_delta      = ${measure} - m_prev;`,
      `metric m_avg_change = window_avg(m_delta, ..-1, ${order});`,
      `metric m_spread     = window_stdev(m_delta, ..-1, ${order});`,
      'metric m_expected   = m_prev + m_avg_change;',
      `metric m_z          = safe_divide(${measure} - m_expected, m_spread);`,
      `metric m_lower      = m_expected - ${k} * m_spread;`,
      `metric m_upper      = m_expected + ${k} * m_spread;`,
      `metric m_anom       = case(when: abs(m_z) > ${k}, then: 1, else: 0);`,
      'metric m_verdict    = case(',
      `  when: abs(m_z) > ${k},  then: 'unusual',`,
      "  when: abs(m_z) >= 0, then: 'normal',",
      "  else: 'not assessed'",
      ');',
      'explore {',
      '  dimensions {',
      `    bucket: ${time} | ${grain}()`,
      '  }',
      '  measures {',
      `    actual: ${measure},`,
      '    expected: m_expected,',
      '    lower_bound: m_lower,',
      '    upper_bound: m_upper,',
      '    z_score: m_z,',
      '    anomaly_flag: m_anom,',
      '    verdict: m_verdict',
      '  }',
      '  sorts {',
      '    bucket asc nulls last',
      '  }',
      '}',
    ].join('\n');
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // A bucket as anfra returns it ('2026-06-01 00:00:00.000000', '2026-06-01T00:00:00Z' or
  // '2026-06-01'), in one comparable form: 'YYYY-MM-DD HH:MM:SS'.
  function bucketKey (value) {
    if (value === null || value === undefined) return null;
    const s = String(value).replace('T', ' ').replace(/Z$/, '');
    return s.length === 10 ? `${s} 00:00:00` : s.slice(0, 19);
  }

  function parts (key) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(key || '');
    return m ? { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] } : null;
  }

  // The key of the bucket after the one at `key`: where this bucket ends. Calendar arithmetic only,
  // in the same wall-clock time as the key.
  function nextKey (key, grain) {
    const p = parts(key);
    if (!p) return null;
    const step = {
      year: [1, 0, 0, 0, 0], quarter: [0, 3, 0, 0, 0], month: [0, 1, 0, 0, 0], week: [0, 0, 7, 0, 0],
      day: [0, 0, 1, 0, 0], hour: [0, 0, 0, 1, 0], minute: [0, 0, 0, 0, 1],
    }[grain];
    const ms = Date.UTC(p.y + step[0], p.mo - 1 + step[1], p.d + step[2], p.h + step[3], p.mi + step[4]);
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  }

  // `now` as a key in the time zone anfra wrote the buckets in.
  function nowKey (now, timeZone) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(now);
  }

  function num (value) {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  // The anomaly query's rows as numbers. A row with no bucket (a null date) is dropped. The last
  // bucket is marked inProgress until its period ends in `timeZone`, the zone anfra wrote the
  // buckets in: a part-period value reads as a collapse, so it is never reported or marked.
  function parsePoints (rows, grain, now, timeZone = 'UTC') {
    const points = rows.filter((row) => bucketKey(row.bucket) !== null).map((row) => ({
      key: bucketKey(row.bucket),
      actual: num(row.actual),
      expected: num(row.expected),
      lower: num(row.lower_bound),
      upper: num(row.upper_bound),
      z: num(row.z_score),
      verdict: row.verdict || 'not assessed',
      inProgress: false,
    }));
    const last = points[points.length - 1];
    if (last && nextKey(last.key, grain) > nowKey(now, timeZone)) last.inProgress = true;
    return points;
  }

  function bucketLabel (key, grain) {
    const p = parts(key);
    if (!p) return String(key);
    const month = MONTHS[p.mo - 1];
    const pad = (n) => String(n).padStart(2, '0');
    switch (grain) {
      case 'year': return String(p.y);
      case 'quarter': return `Q${Math.floor((p.mo - 1) / 3) + 1} ${p.y}`;
      case 'month': return `${month} ${p.y}`;
      case 'week': return `Week of ${p.d} ${month} ${p.y}`;
      case 'day': return `${p.d} ${month} ${p.y}`;
      default: return `${p.d} ${month} ${p.y} ${pad(p.h)}:${pad(p.mi)}`;
    }
  }

  // The alias of the chart query's dimension built on `time` (model.field).
  function findTimeAlias (columns, time) {
    const [model, field] = String(time).split('.');
    const column = (columns || []).find((c) => !c.isMeasure && c.fieldName === field && (c.modelId === undefined || c.modelId === model));
    return column ? column.name : null;
  }

  const ADJECTIVE = {
    year: 'yearly', quarter: 'quarterly', month: 'monthly', week: 'weekly',
    day: 'daily', hour: 'hourly', minute: 'minute-to-minute',
  };
  const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // A calendar position (a month, or a quarter) flagged in two different years. The method has no
  // seasonal term, so a yearly peak flags.
  function seasonalPosition (flagged, grain) {
    if (grain !== 'month' && grain !== 'quarter') return null;
    const years = {};
    for (const p of flagged) {
      const { y, mo } = parts(p.key);
      const position = grain === 'month' ? MONTHS[mo - 1] : `Q${Math.floor((mo - 1) / 3) + 1}`;
      (years[position] = years[position] || new Set()).add(y);
      if (years[position].size >= 2) return position;
    }
    return null;
  }

  // The buckets between the first and the last with no row: a period with nothing in it (a week
  // with no deals) is absent, so the change across it is one step. Counts at most 10000.
  function missingKeys (points, grain) {
    const missing = [];
    for (let i = 1; i < points.length && missing.length < 10000; i += 1) {
      for (let key = nextKey(points[i - 1].key, grain); key < points[i].key && missing.length < 10000; key = nextKey(key, grain)) {
        missing.push(key);
      }
    }
    return missing;
  }

  // The reader's summary, from `verdict` only, following the skill's rules: report the span
  // assessed and no more; "not assessed" is never "nothing unusual"; no causes.
  function summarize (points, opts) {
    const { label, grain } = opts;
    const format = opts.format || ((n) => COMPACT.format(n));
    const onChart = opts.windowKeys ? new Set(opts.windowKeys) : null;
    const isOnChart = (p) => !onChart || onChart.has(p.key);
    const notes = [];

    const last = points[points.length - 1];
    if (last && last.inProgress && isOnChart(last)) {
      notes.push(`${bucketLabel(last.key, grain)} is still in progress, so it is left out.`);
    }
    const missing = missingKeys(points, grain);
    if (missing.length === 1) {
      notes.push(`${bucketLabel(missing[0], grain)} has no data, so it is missing from the series and the change across it is counted as one step.`);
    } else if (missing.length > 1) {
      notes.push(`${missing.length} ${grain}s have no data (the first is ${bucketLabel(missing[0], grain)}), so they are missing from the series and the change across each gap is counted as one step.`);
    }
    const shown = points.filter((p) => !p.inProgress && isOnChart(p));
    if (shown.length === 0) {
      return { headline: `No complete ${grain}s of ${label} to assess on this chart.`, findings: [], notes };
    }

    const assessed = shown.filter((p) => p.verdict !== 'not assessed');
    if (assessed.length === 0) {
      const values = points.filter((p) => !p.inProgress).map((p) => p.actual);
      const flat = values.length >= 4 && values.every((v) => v === values[0]);
      const headline = flat
        ? `${label} held at exactly ${format(values[0])} every ${grain}, so there is no variation to judge a ${grain} against.`
        : `Not enough history to assess ${label}. The method needs a few ${grain}s of movement behind a ${grain} before it can judge it, and this series starts in ${bucketLabel(points[0].key, grain)}.`;
      return { headline, findings: [], notes };
    }
    if (assessed[0] !== shown[0]) {
      notes.unshift(`Assessed ${label} from ${bucketLabel(assessed[0].key, grain)} onward; the ${grain}s before it had too little history behind them.`);
    }

    const span = `${bucketLabel(assessed[0].key, grain)} to ${bucketLabel(assessed[assessed.length - 1].key, grain)}`;
    const flagged = assessed.filter((p) => p.verdict === 'unusual');
    if (flagged.length === 0) {
      return { headline: `No unusual values in ${label} over ${span}; every ${grain} moved in line with the trend up to it.`, findings: [], notes };
    }

    const findings = flagged.map((p) => {
      // A rebound swings straight back after a flagged bucket: the method sees the return as a jump too.
      const before = points[points.indexOf(p) - 1];
      const rebound = Boolean(before && before.verdict === 'unusual' && Math.sign(before.z) !== Math.sign(p.z));
      return {
        key: p.key,
        text: `${bucketLabel(p.key, grain)}: ${format(p.actual)}, ${p.z > 0 ? 'above' : 'below'} the expected trend by about ${Math.abs(p.z).toFixed(1)}× its normal ${ADJECTIVE[grain]} movement.`,
        label: bucketLabel(p.key, grain).replace(/^Week of /, ''),
        value: format(p.actual),
        direction: p.z > 0 ? 'above' : 'below',
        times: `${Math.abs(p.z).toFixed(1)}×`,
        kind: rebound ? 'rebound' : grain,
      };
    });
    const position = seasonalPosition(flagged, grain);
    if (position) {
      notes.push(`Some flags fall in ${position} of different years. The method has no seasonal term, so a peak that repeats every year is flagged; these may be the yearly pattern rather than a surprise.`);
    }
    if (assessed.length >= 6 && assessed.indexOf(flagged[0]) < assessed.length / 3) {
      notes.push(`The flag in ${bucketLabel(flagged[0].key, grain)} widened the expected range for every ${grain} after it, so milder changes later may not be flagged.`);
    }
    const compact = (key) => bucketLabel(key, grain).replace(/^Week of /, '');
    return {
      headline: `Found ${plural(flagged.length, `unusual ${grain}`)} in ${label}, ${span}.`,
      title: plural(flagged.length, `unusual ${grain}`),
      subtitle: `${compact(assessed[0].key)} – ${compact(assessed[assessed.length - 1].key)} · ${label}`,
      findings, notes,
    };
  }

  // How one bucket's expected value and range were worked out, from the anomaly query's own numbers:
  // previous = the row before; average change = expected − previous; normal movement (the spread)
  // = (upper − expected) / k; the number of earlier changes = the bucket's position − 1.
  function explainPoint (points, key, opts) {
    const i = points.findIndex((p) => p.key === key);
    if (i < 0) return null;
    const p = points[i];
    const grain = opts.grain;
    const k = opts.k === undefined ? 3 : opts.k;
    const format = opts.format || ((n) => COMPACT.format(n));
    const signed = (n) => `${n < 0 ? '−' : '+'}${format(Math.abs(n))}`;
    const previous = i > 0 ? points[i - 1].actual : null;
    const avgChange = p.expected !== null && previous !== null ? p.expected - previous : null;
    const spread = p.upper !== null && p.expected !== null ? (p.upper - p.expected) / k : null;
    const changes = Math.max(0, i - 1);
    const bucket = bucketLabel(key, grain);
    const steps = [];
    if (spread === 0) {
      steps.push(`Not assessed: the earlier changes didn't vary, so there is no normal movement to judge ${bucket} against.`);
    } else if (p.z === null || spread === null || avgChange === null) {
      steps.push(`Not assessed: the method needs at least two earlier ${grain}-to-${grain} changes before it can judge a ${grain}, and ${bucket} has ${changes}.`);
    } else {
      const first = points[0].actual;
      steps.push(
        `Expected = previous ${grain} ${format(previous)} + average ${ADJECTIVE[grain]} change ${signed(avgChange)} = ${format(p.expected)}.`,
        `Average ${ADJECTIVE[grain]} change = (previous ${grain} ${format(previous)} − first ${grain} ${format(first)}) / ${changes} ${grain}-to-${grain} changes = ${signed(avgChange)}: on average ${opts.label} ${avgChange < 0 ? 'fell' : 'grew'} by ${format(Math.abs(avgChange))} a ${grain} before this one.`,
        `Normal movement = standard deviation of those ${changes} changes = ${format(spread)}: a typical ${grain} lands about this far from the average change.`,
        `Expected range = ${format(p.expected)} ± ${k} × ${format(spread)} = ${format(p.lower)} to ${format(p.upper)}.`,
        `Off by (${format(p.actual)} − ${format(p.expected)}) / ${format(spread)} = ${Math.abs(p.z).toFixed(1)}×, ${Math.abs(p.z) > k ? 'more' : 'not more'} than ${k}, so ${p.verdict}.`,
      );
    }
    if (p.inProgress) steps.push(`${bucket} is still in progress, so it is left out of the findings.`);
    const assessed = steps.length > 1;
    const links = assessed ? [
      { step: 0, view: 'series', label: `Show the previous ${grain}` },
      { step: 1, view: 'changes', label: `Show the ${changes} changes` },
      { step: 2, view: 'changes', label: `Show the ${changes} changes` },
    ] : [];
    return {
      key, bucket, grain, label: opts.label, verdict: p.verdict,
      direction: p.z > 0 ? 'above' : p.z < 0 ? 'below' : null,
      actual: p.actual, previous, avgChange, expected: p.expected, spread,
      lower: p.lower, upper: p.upper, z: p.z, k, changes, inProgress: p.inProgress, steps, links,
    };
  }

  // The bucket-to-bucket changes behind a bucket's expected value, rebuilt from the actuals the query
  // returned. They add up to previous − first, so their average is the query's average change, and
  // their sample standard deviation is its normal movement.
  function changeHistory (points, key) {
    const i = points.findIndex((p) => p.key === key);
    if (i < 0) return null;
    const changes = [];
    for (let j = 1; j < i; j += 1) {
      if (points[j].actual !== null && points[j - 1].actual !== null) changes.push({ key: points[j].key, change: points[j].actual - points[j - 1].actual });
    }
    const sum = changes.reduce((total, c) => total + c.change, 0);
    const mean = changes.length ? sum / changes.length : null;
    const sd = changes.length >= 2 ? Math.sqrt(changes.reduce((total, c) => total + (c.change - mean) ** 2, 0) / (changes.length - 1)) : null;
    const previous = i > 0 ? points[i - 1] : null;
    const at = points[i];
    return {
      first: { key: points[0].key, actual: points[0].actual },
      previous: previous && { key: previous.key, actual: previous.actual },
      current: { key: at.key, actual: at.actual, change: previous && previous.actual !== null && at.actual !== null ? at.actual - previous.actual : null },
      changes, sum, mean, sd,
      series: points.slice(0, i + 1).map((p) => ({ key: p.key, actual: p.actual })),
    };
  }

  // The tooltip for one point on the previous-bucket chart: its bucket, tagged when it is the
  // previous or this bucket, and its value. One line per point, so a marker never repeats the value.
  function pointTooltip (history, index, opts) {
    const point = history.series[index];
    if (!point) return [];
    const format = opts.format || ((n) => COMPACT.format(n));
    const last = history.series.length - 1;
    const tag = index === last ? ` · this ${opts.grain}` : index === last - 1 ? ` · previous ${opts.grain}` : '';
    return [`${bucketLabel(point.key, opts.grain)}${tag}`, `${opts.label}: ${point.actual === null ? '—' : format(point.actual)}`];
  }

  // Where a bucket sits among the chart's own rows: the dataIndex of its point on the chart.
  function chartIndex (chartRows, timeAlias, key) {
    return chartRows.findIndex((r) => bucketKey(r[timeAlias]) === key);
  }

  const RESULT_COLUMNS = ['bucket', 'actual', 'expected', 'lower_bound', 'upper_bound', 'z_score', 'verdict'];

  // The anomaly query's rows as a table for the Explain drawer, with the explained bucket marked.
  function resultTable (rows, key, opts) {
    const format = opts.format || ((n) => COMPACT.format(n));
    const cell = (v) => (num(v) === null ? '—' : format(num(v)));
    const width = opts.grain === 'hour' || opts.grain === 'minute' ? 16 : 10;
    const out = rows.map((row) => {
      const rowKey = bucketKey(row.bucket);
      return {
        key: rowKey,
        highlight: rowKey === key,
        verdict: row.verdict || 'not assessed',
        cells: [
          rowKey === null ? '—' : rowKey.slice(0, width), cell(row.actual), cell(row.expected), cell(row.lower_bound),
          cell(row.upper_bound), num(row.z_score) === null ? '—' : num(row.z_score).toFixed(2), row.verdict || 'not assessed',
        ],
      };
    });
    return { columns: RESULT_COLUMNS, rows: out, highlighted: out.findIndex((r) => r.highlight) };
  }

  // Does a re-run's row for the bucket give the numbers the explanation was built from?
  function compareRun (explanation, row) {
    if (!row) return { matches: false, differences: [], missing: true };
    const same = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)));
    const differences = [];
    for (const [field, before] of [['expected', explanation.expected], ['lower_bound', explanation.lower],
      ['upper_bound', explanation.upper], ['z_score', explanation.z]]) {
      const after = num(row[field]);
      if (!same(before, after)) differences.push({ field, before, after });
    }
    return { matches: differences.length === 0, differences };
  }

  const SERIES_ID = 'anfra-anomaly-';
  const BAND = '#9CA3AF';
  const FLAG = '#DC2626';

  // The author's ECharts option plus the band, an invisible expected line (for the tooltip) and the
  // flagged points, aligned to the chart's own rows. Returns a new option; never mutates `option`.
  function decorateOption (option, ctx) {
    const byKey = new Map(ctx.points.map((p) => [p.key, p]));
    const xAxis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;
    const isTime = Boolean(xAxis && xAxis.type === 'time');
    const clampAtZero = ctx.points.every((p) => p.actual === null || p.actual >= 0);
    const yAxisIndex = ctx.yAxisIndex || 0;
    const colors = Object.assign({ band: BAND, flag: FLAG }, ctx.colors);
    const lower = [];
    const upper = [];
    const expected = [];
    const flagged = [];
    for (const row of ctx.chartRows) {
      const raw = row[ctx.timeAlias];
      const p = byKey.get(bucketKey(raw));
      const cell = (v) => (isTime ? [raw, v] : v);
      const low = p ? p.lower : null;
      lower.push(cell(clampAtZero && low !== null && low < 0 ? 0 : low));
      upper.push(cell(p ? p.upper : null));
      expected.push(cell(p ? p.expected : null));
      flagged.push(cell(p && p.verdict === 'unusual' && !p.inProgress ? p.actual : null));
    }
    const format = ctx.format || ((n) => COMPACT.format(n));
    const valueFormatter = (value) => {
      const v = Array.isArray(value) ? value[1] : value;
      return v === null || v === undefined ? '-' : format(v);
    };
    const tooltip = { valueFormatter };
    const band = (id, name, data) => ({
      id: SERIES_ID + id, name, type: 'line', yAxisIndex, data, symbol: 'none', z: 1, tooltip,
      lineStyle: { type: 'dashed', width: 1, color: colors.band }, itemStyle: { color: colors.band },
    });
    const ours = [
      band('lower', 'Expected range (low)', lower),
      band('upper', 'Expected range (high)', upper),
      { id: `${SERIES_ID}expected`, name: 'Expected', type: 'line', yAxisIndex, data: expected, symbol: 'none', tooltip, lineStyle: { opacity: 0 }, itemStyle: { color: colors.band } },
      {
        id: `${SERIES_ID}flagged`, name: 'Unusual', type: 'scatter', yAxisIndex, data: flagged, symbolSize: 10, z: 5, tooltip,
        itemStyle: { color: colors.flag }, cursor: 'pointer',
        emphasis: { scale: 1.8, itemStyle: { borderColor: '#FFFFFF', borderWidth: 2, shadowBlur: 12, shadowColor: colors.flag } },
      },
    ];
    const theirs = option.series === undefined ? [] : [].concat(option.series);
    return Object.assign({}, option, { series: theirs.concat(ours) });
  }

  const BUTTON_TEXT = { idle: 'Detect anomalies', running: 'Detecting…', showing: '↺ Revert', error: 'Retry' };

  // The plugin's look, clean light by default. Every rule is wrapped in :where() so it has zero
  // specificity: an app restyles the button and the summary with plain class selectors.
  const STYLE = [
    ':where(.anfra-anomaly-button){position:absolute;top:12px;right:12px;z-index:10;display:inline-flex;align-items:center;gap:6px;'
      + 'font:inherit;font-size:12px;font-weight:500;line-height:1;padding:7px 12px;border-radius:999px;border:1px solid #E2E8F0;'
      + 'background:#FFFFFF;color:#334155;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.06);transition:background .15s,border-color .15s,color .15s}',
    ':where(.anfra-anomaly-button:hover){border-color:#C7D2FE;color:#4338CA}',
    ':where(.anfra-anomaly-button[data-state="showing"]){background:#4F46E5;border-color:#4F46E5;color:#FFFFFF}',
    ':where(.anfra-anomaly-button[data-state="running"]){opacity:.7;cursor:progress}',
    ':where(.anfra-anomaly-summary){margin-top:10px;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;background:#FFFFFF;font:inherit;font-size:13px;color:#334155}',
    ':where(.anfra-anomaly-summary[data-tone="error"]){border-color:#FECACA;background:#FEF2F2;color:#B91C1C}',
    ':where(.anfra-anomaly-head){display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #F1F5F9}',
    ':where(.anfra-anomaly-summary[data-tone="flagged"] .anfra-anomaly-head){background:#FFFBFB}',
    ':where(.anfra-anomaly-count){background:#FEE2E2;color:#B91C1C;border-radius:999px;padding:3px 10px;font-weight:700}',
    ':where(.anfra-anomaly-headline){color:#0F172A;font-weight:600}',
    ':where(.anfra-anomaly-sub){color:#64748B}',
    ':where(.anfra-anomaly-rows){margin:6px 0;padding:0 14px 0 32px}',
    ':where(.anfra-anomaly-row){list-style:disc;padding:4px 8px;margin-left:-8px;border-radius:8px;cursor:pointer;line-height:1.5}',
    ':where(.anfra-anomaly-row:hover, .anfra-anomaly-row:focus){background:#F8FAFC;outline:none}',
    ':where(.anfra-anomaly-row b){color:#0F172A;font-weight:600}',
    ':where(.anfra-anomaly-how){color:#64748B}',
    ':where(.anfra-anomaly-value){color:#0F172A;font-weight:700;font-variant-numeric:tabular-nums}',
    ':where(.anfra-anomaly-explain){color:#4338CA;font-weight:500;white-space:nowrap;margin-left:4px}',
    ':where(.anfra-anomaly-foot){padding:8px 14px;border-top:1px solid #F1F5F9;color:#64748B;font-size:12px;line-height:1.55}',
    ':where(.anfra-anomaly-foot p){margin:0}',
    ':where(.anfra-anomaly-message){margin:0;padding:10px 14px}',
    ':where(.anfra-anomaly-drawer){position:fixed;top:0;right:0;bottom:0;width:min(440px,92vw);z-index:2147483000;box-sizing:border-box;'
      + 'background:#FFFFFF;box-shadow:-12px 0 32px rgba(15,23,42,.14);padding:20px 22px;overflow:auto;font:inherit;font-size:13px;'
      + 'color:#0F172A;transform:translateX(105%);visibility:hidden;transition:transform .2s ease,visibility .2s}',
    ':where(.anfra-anomaly-drawer[data-open="true"]){transform:none;visibility:visible}',
    ':where(.anfra-anomaly-drawer-head){display:flex;justify-content:space-between;align-items:flex-start;gap:12px}',
    ':where(.anfra-anomaly-drawer-title){font-size:16px;font-weight:600}',
    ':where(.anfra-anomaly-drawer-sub){color:#64748B;font-size:12px;margin-top:2px}',
    ':where(.anfra-anomaly-drawer-close){border:0;background:transparent;font-size:18px;line-height:1;color:#64748B;cursor:pointer}',
    ':where(.anfra-anomaly-tiles){display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0 4px}',
    ':where(.anfra-anomaly-tile){background:#F8FAFC;border-radius:10px;padding:10px 12px}',
    ':where(.anfra-anomaly-tile span){display:block;color:#64748B;font-size:11.5px}',
    ':where(.anfra-anomaly-tile strong){font-size:18px;font-weight:700}',
    ':where(.anfra-anomaly-tile[data-flag="true"] strong){color:#DC2626}',
    ':where(.anfra-anomaly-drawer h4){margin:18px 0 6px;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#64748B}',
    ':where(.anfra-anomaly-drawer ol){margin:0;padding-left:20px;line-height:1.6}',
    ':where(.anfra-anomaly-aql){margin:0;background:#0F172A;color:#E2E8F0;border-radius:8px;padding:12px;'
      + 'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;overflow:auto;max-height:320px}',
    ':where(.anfra-anomaly-copy){margin-top:8px;border:1px solid #E2E8F0;background:#FFFFFF;border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;cursor:pointer}',
    ':where(.anfra-anomaly-copied){margin-left:8px;color:#64748B;font-size:12px}',
    ':where(.anfra-anomaly-inspect){display:block;margin:2px 0 6px;border:0;background:transparent;padding:0;color:#4338CA;font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;text-align:left}',
    ':where(.anfra-anomaly-inspect:hover){text-decoration:underline}',
    ':where(.anfra-anomaly-minibox){margin-top:12px;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px}',
    ':where(.anfra-anomaly-minibox strong){font-size:13px}',
    ':where(.anfra-anomaly-mini){height:200px;margin-top:6px}',
    ':where(.anfra-anomaly-caption){color:#475569;font-size:12px;line-height:1.55;margin:8px 0 0}',
    ':where(.anfra-anomaly-runbar){display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}',
    ':where(.anfra-anomaly-run){border:1px solid #4F46E5;background:#4F46E5;color:#FFFFFF;border-radius:999px;padding:7px 14px;font:inherit;font-size:12.5px;font-weight:500;cursor:pointer}',
    ':where(.anfra-anomaly-run:disabled){opacity:.6;cursor:progress}',
    ':where(.anfra-anomaly-run-status){color:#64748B;font-size:12px}',
    ':where(.anfra-anomaly-match){margin:10px 0 8px;padding:8px 10px;border-radius:8px;font-size:12.5px;background:#ECFDF5;color:#065F46}',
    ':where(.anfra-anomaly-match[data-ok="false"]){background:#FEF2F2;color:#991B1B}',
    ':where(.anfra-anomaly-result){max-height:300px;overflow:auto;border:1px solid #E2E8F0;border-radius:8px}',
    ':where(.anfra-anomaly-result table){width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}',
    ':where(.anfra-anomaly-result th){position:sticky;top:0;background:#F8FAFC;color:#64748B;font-weight:500;text-align:right;padding:6px 8px;border-bottom:1px solid #E2E8F0;white-space:nowrap}',
    ':where(.anfra-anomaly-result td){text-align:right;padding:5px 8px;border-bottom:1px solid #F1F5F9;white-space:nowrap}',
    ':where(.anfra-anomaly-result th:first-child, .anfra-anomaly-result td:first-child, .anfra-anomaly-result th:last-child, .anfra-anomaly-result td:last-child){text-align:left}',
    ':where(.anfra-anomaly-result tr[data-highlight="true"] td){background:#FEF2F2;font-weight:600}',
    ':where(.anfra-anomaly-verdict){display:inline-block;border-radius:999px;padding:1px 7px;font-size:11px;background:#F1F5F9;color:#475569}',
    ':where(.anfra-anomaly-verdict[data-verdict="unusual"]){background:#FEE2E2;color:#B91C1C}',
    ':where(.anfra-anomaly-verdict[data-verdict="not assessed"]){background:transparent;color:#94A3B8}',
    ':where(.anfra-anomaly-sql){margin-top:10px}',
    ':where(.anfra-anomaly-sql summary){cursor:pointer;color:#4338CA;font-size:12.5px;margin-bottom:6px}',
  ].join('\n');

  function summaryTone (view) {
    if (view.state === 'error') return 'error';
    if (view.state === 'showing' && view.summary && view.summary.findings.length) return 'flagged';
    return 'neutral';
  }

  // Inject the stylesheet once per document, first in <head>, so the app's own CSS comes after it.
  function ensureStyle (doc) {
    if (doc.getElementById('anfra-anomaly-style')) return;
    const style = doc.createElement('style');
    style.id = 'anfra-anomaly-style';
    style.textContent = STYLE;
    (doc.head || doc.documentElement).prepend(style);
  }

  // One drawer per document, shared by every chart: "Explain" for one bucket. Text only.
  const drawers = new WeakMap();
  function ensureDrawer (doc) {
    if (drawers.has(doc)) return drawers.get(doc);
    const el = (tag, cls, parent, text) => {
      const node = doc.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    };
    const aside = el('aside', 'anfra-anomaly-drawer', doc.body);
    aside.setAttribute('role', 'dialog');
    aside.setAttribute('aria-label', 'Explain this point');
    const head = el('div', 'anfra-anomaly-drawer-head', aside);
    const titles = el('div', '', head);
    const title = el('div', 'anfra-anomaly-drawer-title', titles);
    const sub = el('div', 'anfra-anomaly-drawer-sub', titles);
    const close = el('button', 'anfra-anomaly-drawer-close', head, '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    const tiles = el('div', 'anfra-anomaly-tiles', aside);
    el('h4', '', aside, "How it's calculated");
    const steps = el('ol', '', aside);
    const miniBox = el('div', 'anfra-anomaly-minibox', aside);
    const miniTitle = el('strong', '', miniBox);
    const miniChartEl = el('div', 'anfra-anomaly-mini', miniBox);
    const miniFallback = el('div', 'anfra-anomaly-result', miniBox);
    const miniCaption = el('p', 'anfra-anomaly-caption', miniBox);
    miniBox.hidden = true;
    let miniChart = null;
    el('h4', '', aside, 'Check it yourself');
    const runBar = el('div', 'anfra-anomaly-runbar', aside);
    const runButton = el('button', 'anfra-anomaly-run', runBar, '▶ Run this query');
    runButton.type = 'button';
    const runStatus = el('span', 'anfra-anomaly-run-status', runBar);
    const match = el('p', 'anfra-anomaly-match', aside);
    const result = el('div', 'anfra-anomaly-result', aside);
    const aqlBox = el('details', 'anfra-anomaly-sql', aside);
    el('summary', '', aqlBox, 'Show the AQL');
    const aql = el('pre', 'anfra-anomaly-aql', aqlBox);
    const copy = el('button', 'anfra-anomaly-copy', aqlBox, 'Copy AQL');
    copy.type = 'button';
    const copied = el('span', 'anfra-anomaly-copied', aqlBox);
    const sqlBox = el('details', 'anfra-anomaly-sql', aside);
    el('summary', '', sqlBox, 'Show the SQL this ran as');
    const sqlText = el('pre', 'anfra-anomaly-aql', sqlBox);
    const resetRun = () => {
      runButton.disabled = false;
      runButton.textContent = '▶ Run this query';
      runStatus.textContent = '';
      match.hidden = true;
      result.hidden = true;
      result.replaceChildren();
      sqlBox.hidden = true;
      sqlBox.open = false;
    };
    resetRun();
    // The viewer may see generated SQL unless the host says otherwise.
    const canSeeSql = () => {
      const user = root.Anfra && root.Anfra.user;
      return !(user && user.permissions && user.permissions.canViewGeneratedSql === false);
    };

    let owner = null;
    let current = null; // the detail on show, so a slow run for an earlier one is ignored
    let currentFormat = (n) => COMPACT.format(n);
    const drawer = {
      open (detail, by, format) {
        const e = detail.explanation;
        owner = by;
        title.textContent = e.verdict === 'unusual' ? `Why this ${e.grain} is unusual`
          : e.verdict === 'normal' ? `Why this ${e.grain} looks normal` : `Why this ${e.grain} isn't assessed`;
        sub.textContent = `${detail.label} · ${e.bucket}`;
        const fmt = (n) => (n === null || n === undefined ? '—' : format(n));
        tiles.replaceChildren();
        for (const [name, value, flag] of [['Actual', e.actual, e.verdict === 'unusual'], ['Expected', e.expected],
          ['Range low', e.lower], ['Range high', e.upper]]) {
          const tile = el('div', 'anfra-anomaly-tile', tiles);
          if (flag) tile.dataset.flag = 'true';
          el('span', '', tile, name);
          el('strong', '', tile, fmt(value));
        }
        steps.replaceChildren(...e.steps.map((text, i) => {
          const item = el('li', '', null, text);
          for (const link of e.links.filter((l) => l.step === i)) {
            const b = el('button', 'anfra-anomaly-inspect', item, `${link.label} ›`);
            b.type = 'button';
            b.addEventListener('click', () => showView(link.view));
          }
          return item;
        }));
        miniBox.hidden = true;
        aql.textContent = detail.aql;
        aqlBox.open = false;
        copied.textContent = '';
        current = detail;
        currentFormat = format;
        resetRun();
        aside.scrollTop = 0;
        aside.dataset.open = 'true';
        close.focus({ preventScroll: true });
      },
      close (by) {
        if (by && by !== owner) return;
        aside.dataset.open = 'false';
        owner = null;
        current = null;
      },
    };
    // A short label for a bucket on the small chart's axis.
    const shortLabel = (key, grain) => {
      const q = parts(key);
      if (!q) return String(key);
      const yy = String(q.y).slice(2);
      if (grain === 'year') return String(q.y);
      if (grain === 'quarter') return `Q${Math.floor((q.mo - 1) / 3) + 1} ${yy}`;
      if (grain === 'month') return `${MONTHS[q.mo - 1]} ${yy}`;
      return `${q.d} ${MONTHS[q.mo - 1]} ${yy}`;
    };
    // The small chart in the drawer: the metric over time, or the changes behind the average.
    function showView (view) {
      const detail = current;
      if (!detail || !detail.history) return;
      const h = detail.history;
      const e = detail.explanation;
      const g = e.grain;
      const fmt = (n) => (n === null || n === undefined ? '—' : currentFormat(n));
      const signed = (n) => (n === null ? '—' : `${n < 0 ? '−' : '+'}${currentFormat(Math.abs(n))}`);
      const ec = root.echarts;
      miniBox.hidden = false;
      miniFallback.replaceChildren();
      miniFallback.hidden = true;
      let option;
      if (view === 'series') {
        const last = h.series.length - 1;
        const labels = h.series.map((p) => shortLabel(p.key, g));
        const only = (index, value) => labels.map((_, j) => (j === index ? value : null));
        miniTitle.textContent = `${detail.label} over time, up to this ${g}`;
        miniCaption.textContent = `Amber: the previous ${g}, ${bucketLabel(h.previous.key, g)} (${fmt(h.previous.actual)}). `
          + `Red: this ${g}, ${bucketLabel(h.current.key, g)} (${fmt(e.actual)}).`;
        option = {
          animation: false,
          grid: { left: 4, right: 10, top: 10, bottom: 4, containLabel: true },
          tooltip: {
            trigger: 'axis', confine: true,
            formatter: (params) => {
              const first = [].concat(params)[0];
              const lines = first ? pointTooltip(h, first.dataIndex, { grain: g, label: detail.label, format: currentFormat }) : [];
              const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
              return lines.length ? `${esc(lines[0])}<br/><b>${esc(lines[1])}</b>` : '';
            },
          },
          xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLabel: { color: '#64748B', fontSize: 10 } },
          yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F1F5F9' } }, axisLabel: { color: '#64748B', fontSize: 10, formatter: (v) => fmt(v) } },
          series: [
            { name: detail.label, type: 'line', data: h.series.map((p) => p.actual), showSymbol: false, lineStyle: { color: '#6366F1', width: 2 }, itemStyle: { color: '#6366F1' } },
            { name: `Previous ${g}`, type: 'scatter', data: only(last - 1, h.previous.actual), symbolSize: 12, z: 5, itemStyle: { color: '#F59E0B', borderColor: '#FFFFFF', borderWidth: 2 } },
            { name: `This ${g}`, type: 'scatter', data: only(last, e.actual), symbolSize: 12, z: 7, itemStyle: { color: '#EF4444', borderColor: '#FFFFFF', borderWidth: 2 } },
          ],
        };
      } else {
        const labels = h.changes.map((c) => shortLabel(c.key, g)).concat(shortLabel(h.current.key, g));
        miniTitle.textContent = `The ${h.changes.length} ${g}-to-${g} changes before this ${g}`;
        miniCaption.textContent = `Each bar is one ${g}'s change from the ${g} before it. Before this ${g} they add up to ${signed(h.sum)} `
          + `(${fmt(h.previous.actual)} − ${fmt(h.first.actual)}), an average of ${signed(h.mean)} a ${g} (solid line). `
          + `The dashed lines sit one normal movement (${fmt(h.sd)}) either side of it. This ${g}'s change, in red, is ${signed(h.current.change)}.`;
        const lines = [{ yAxis: h.mean, lineStyle: { color: '#4F46E5', type: 'solid', width: 1.5 }, label: { formatter: `average ${signed(h.mean)}`, position: 'insideStartTop', color: '#4338CA', fontSize: 10 } }];
        if (h.sd !== null) {
          for (const sign of [1, -1]) {
            lines.push({ yAxis: h.mean + sign * h.sd, lineStyle: { color: '#94A3B8', type: 'dashed', width: 1 }, label: { formatter: `${sign > 0 ? '+' : '−'}1 normal movement`, position: 'insideEndTop', color: '#64748B', fontSize: 10 } });
          }
        }
        option = {
          animation: false,
          grid: { left: 4, right: 10, top: 10, bottom: 4, containLabel: true },
          tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'shadow' }, valueFormatter: (v) => signed(v) },
          xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLabel: { color: '#64748B', fontSize: 10 } },
          yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F1F5F9' } }, axisLabel: { color: '#64748B', fontSize: 10, formatter: (v) => fmt(v) } },
          series: [{
            name: 'Change', type: 'bar', barMaxWidth: 10,
            data: h.changes.map((c) => ({ value: c.change, itemStyle: { color: '#C7D2FE' } }))
              .concat({ value: h.current.change, itemStyle: { color: '#EF4444' } }),
            markLine: { symbol: 'none', silent: true, data: lines },
          }],
        };
      }
      if (ec && typeof ec.init === 'function') {
        miniChartEl.hidden = false;
        if (!miniChart) miniChart = ec.init(miniChartEl);
        miniChart.setOption(option, true);
        miniChart.resize();
        if (view === 'series') miniChart.dispatchAction({ type: 'showTip', seriesIndex: 1, dataIndex: h.series.length - 2 });
      } else { // no ECharts on the page: list the numbers instead
        miniChartEl.hidden = true;
        const table = el('table', '', miniFallback);
        const body = el('tbody', '', table);
        const rows = view === 'series' ? h.series.map((p) => [bucketLabel(p.key, g), fmt(p.actual)]) : h.changes.map((c) => [bucketLabel(c.key, g), signed(c.change)]);
        for (const [a, b] of rows) { const tr = el('tr', '', body); el('td', '', tr, a); el('td', '', tr, b); }
        miniFallback.hidden = false;
      }
      miniBox.scrollIntoView({ block: 'nearest' });
    }
    runButton.addEventListener('click', () => {
      const detail = current;
      if (!detail) return;
      runButton.disabled = true;
      runStatus.textContent = 'Running…';
      match.hidden = true;
      result.hidden = true;
      detail.run().then((out) => {
        if (current !== detail) return;
        runButton.disabled = false;
        runButton.textContent = '▶ Run again';
        match.hidden = false;
        if (out.status === 'error') {
          runStatus.textContent = '';
          match.dataset.ok = 'false';
          match.textContent = `Couldn't run it: ${out.message}`;
          return;
        }
        const at = out.executedAt ? new Date(out.executedAt) : new Date();
        runStatus.textContent = `Ran at ${at.toLocaleTimeString()} · ${out.rowCount} rows · ${(out.ms / 1000).toFixed(1)} s${out.fromCache ? ' (from cache)' : ''}`;
        const shown = (field, n) => (n === null ? '—' : field === 'z_score' ? n.toFixed(2) : currentFormat(n));
        const c = out.comparison;
        match.dataset.ok = String(c.matches);
        match.textContent = c.missing ? `✗ The re-run has no row for bucket = ${detail.bucketValue}.`
          : c.matches ? '✓ The re-run matches: expected, range and how far off are the same as above.'
            : `✗ Differs: ${c.differences.map((d) => `${d.field} was ${shown(d.field, d.before)}, re-run ${shown(d.field, d.after)}`).join('; ')}.`;
        const table = el('table');
        const headRow = el('tr', '', el('thead', '', table));
        for (const name of out.table.columns) el('th', '', headRow, name);
        const body = el('tbody', '', table);
        let marked = null;
        for (const row of out.table.rows) {
          const tr = el('tr', '', body);
          if (row.highlight) { tr.dataset.highlight = 'true'; marked = tr; }
          row.cells.forEach((text, i) => {
            const td = el('td', '', tr);
            if (i === row.cells.length - 1) el('span', 'anfra-anomaly-verdict', td, text).dataset.verdict = row.verdict;
            else td.textContent = text;
          });
        }
        result.replaceChildren(table);
        result.hidden = false;
        if (marked) result.scrollTop = Math.max(0, marked.offsetTop - result.clientHeight / 2);
        if (out.sql && canSeeSql()) { sqlText.textContent = out.sql; sqlBox.hidden = false; }
      });
    });
    close.addEventListener('click', () => drawer.close());
    doc.addEventListener('keydown', (event) => { if (event.key === 'Escape') drawer.close(); });
    copy.addEventListener('click', async () => {
      try {
        await doc.defaultView.navigator.clipboard.writeText(aql.textContent);
        copied.textContent = 'Copied';
      } catch (err) { // the sandboxed frame may not allow the clipboard: select the text instead
        const range = doc.createRange();
        range.selectNodeContents(aql);
        const selection = doc.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        copied.textContent = 'Selected: press ⌘C (Ctrl+C) to copy';
      }
    });
    drawers.set(doc, drawer);
    return drawer;
  }

  // The button, top-right in the chart's block, and the summary under the chart. Hovering a finding
  // highlights its point; clicking it, or the point, opens the Explain drawer. Text only: nothing
  // from the data is written as HTML. Styled by STYLE through classes and data attributes.
  function domUi (chart, onClick, opts, actions) {
    const chartEl = chart && typeof chart.getDom === 'function' ? chart.getDom() : chart;
    if (!chartEl || !chartEl.ownerDocument) {
      throw new Error('AnfraAnomaly.attach: the third argument must be the ECharts instance (or its element).');
    }
    const doc = chartEl.ownerDocument;
    ensureStyle(doc);
    const drawer = ensureDrawer(doc);
    const format = opts.format || ((n) => COMPACT.format(n));
    const isChart = typeof chart.dispatchAction === 'function';
    const block = opts.block || chartEl.closest('[data-anfra-block]') || chartEl.parentElement;
    if (doc.defaultView.getComputedStyle(block).position === 'static') block.style.position = 'relative';

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'anfra-anomaly-button';
    button.addEventListener('click', onClick);
    block.appendChild(button);

    const summary = doc.createElement('div');
    summary.className = 'anfra-anomaly-summary';
    summary.hidden = true;
    chartEl.insertAdjacentElement('afterend', summary);

    const self = {};
    const explain = (key) => {
      const detail = actions && key ? actions.explain(key) : null;
      if (detail) drawer.open(detail, self, format);
    };
    const highlight = (key, on) => {
      if (!isChart || !actions) return;
      const dataIndex = actions.indexOf(key);
      if (dataIndex < 0) return;
      const seriesId = `${SERIES_ID}flagged`;
      chart.dispatchAction({ type: on ? 'highlight' : 'downplay', seriesId, dataIndex });
      const seriesIndex = (chart.getOption().series || []).findIndex((s) => s.id === seriesId);
      if (on && seriesIndex >= 0) chart.dispatchAction({ type: 'showTip', seriesIndex, dataIndex });
      if (!on) chart.dispatchAction({ type: 'hideTip' });
    };
    if (isChart && typeof chart.on === 'function') {
      chart.on('click', (params) => {
        if (params.seriesId === `${SERIES_ID}flagged` && actions) explain(actions.keyAt(params.dataIndex));
      });
    }

    const add = (tag, text, parent) => {
      const el = doc.createElement(tag);
      el.textContent = text;
      (parent || summary).appendChild(el);
      return el;
    };
    return Object.assign(self, {
      update (view) {
        button.textContent = BUTTON_TEXT[view.state];
        button.dataset.state = view.state;
        button.disabled = view.state === 'running';
        if (view.state !== 'showing') drawer.close(self);
        summary.replaceChildren();
        summary.dataset.tone = summaryTone(view);
        if (view.queryName) summary.setAttribute('data-anfra-query', view.queryName);
        if (view.state === 'error') add('p', `Couldn't detect anomalies: ${view.message}`).className = 'anfra-anomaly-message';
        if (view.state === 'showing' && view.summary) {
          const sum = view.summary;
          const head = add('div', '');
          head.className = 'anfra-anomaly-head';
          if (sum.findings.length) {
            add('span', sum.title, head).className = 'anfra-anomaly-count';
            add('span', sum.subtitle, head).className = 'anfra-anomaly-sub';
            const rows = add('ul', '');
            rows.className = 'anfra-anomaly-rows';
            for (const finding of sum.findings) {
              const row = add('li', '', rows);
              row.className = 'anfra-anomaly-row';
              row.tabIndex = 0;
              row.setAttribute('role', 'button');
              row.setAttribute('aria-label', finding.text);
              add('b', finding.label, row);
              row.appendChild(doc.createTextNode(' · '));
              add('b', finding.value, row);
              add('span', ` · ${finding.times} ${finding.direction} trend${finding.kind === 'rebound' ? ' (rebound)' : ''} · `, row).className = 'anfra-anomaly-how';
              add('span', 'Explain ›', row).className = 'anfra-anomaly-explain';
              row.addEventListener('mouseenter', () => highlight(finding.key, true));
              row.addEventListener('mouseleave', () => highlight(finding.key, false));
              row.addEventListener('focus', () => highlight(finding.key, true));
              row.addEventListener('blur', () => highlight(finding.key, false));
              row.addEventListener('click', () => explain(finding.key));
              row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); explain(finding.key); } });
            }
          } else {
            add('span', sum.headline, head).className = 'anfra-anomaly-headline';
          }
          const notes = sum.notes;
          if (notes.length) {
            const foot = add('div', '');
            foot.className = 'anfra-anomaly-foot';
            for (const note of notes) add('p', `ⓘ ${note}`, foot);
          }
        }
        summary.hidden = summary.childElementCount === 0;
      },
    });
  }

  // How many times attach() has run per app, so two charts on one query get distinct query names.
  const attached = new WeakMap();

  // Adds the anomaly button to one chart. The author's render passes its option through
  // handle.decorate(option); the plugin calls opts.render to show or remove the overlay.
  function attach (app, query, chart, opts) {
    opts = opts || {};
    if (!app || typeof app.createQuery !== 'function') {
      throw new Error('AnfraAnomaly.attach: the first argument must be the app from Anfra.createApp().');
    }
    if (!query || typeof query.name !== 'string' || !query.declaration) {
      throw new Error("AnfraAnomaly.attach: the second argument must be the chart's query, from app.createQuery().");
    }
    if (typeof opts.render !== 'function') {
      throw new Error('AnfraAnomaly.attach: opts.render must be the function that draws the chart.');
    }
    if (!opts.grain && !opts.drill) {
      throw new Error('AnfraAnomaly.attach: give opts.grain, or opts.drill for a chart with a date drill.');
    }
    buildAql({ measure: opts.measure, time: opts.time, grain: opts.grain || 'month', k: opts.k }); // refuse a bad call now, not on click

    const label = opts.label || opts.measure;
    const now = opts.now || (() => Date.now());
    const nth = (attached.get(app) || 0) + 1;
    attached.set(app, nth);
    const suffix = nth === 1 ? '' : String(nth);
    const queries = {};
    let runs = 0; // re-runs from the Explain drawer, for unique query names
    let state = 'idle';
    let grain = null;
    let points = null;
    let seen = null; // the anomaly result last read into points
    let message = null;
    let summary = null;
    // What the UI needs to highlight a finding's point and explain it.
    const actions = {
      indexOf: (key) => chartIndex(query.result ? query.result.rows : [], timeAlias(), key),
      keyAt: (index) => {
        const row = query.result ? query.result.rows[index] : undefined;
        return row ? bucketKey(row[timeAlias()]) : null;
      },
      explain: (key) => {
        if (state !== 'showing' || !points) return null;
        const explanation = explainPoint(points, key, { k: opts.k, grain, label, format: opts.format });
        if (!explanation) return null;
        const q = queries[grain];
        const debug = q.result && q.result.debug;
        return {
          explanation, label, dataset: query.declaration.dataset,
          aql: (debug && debug.executedAql) || q.declaration.aql,
          bucketValue: key.slice(0, grain === 'hour' || grain === 'minute' ? 16 : 10),
          run: () => actions.run(key),
          history: changeHistory(points, key),
        };
      },
      // Run the anomaly query again, exactly as declared and with the same filters, as a fresh
      // query (the SDK doesn't re-run an unchanged one), and check it against the explanation.
      run: (key) => {
        if (state !== 'showing' || !points || !queries[grain]) return Promise.resolve({ status: 'error', message: 'Detect anomalies first.' });
        const g = grain;
        const source = queries[g];
        const explanation = explainPoint(points, key, { k: opts.k, grain: g, label, format: opts.format });
        runs += 1;
        let q;
        try {
          q = app.createQuery(`${source.name}_run${runs}`, { dataset: source.declaration.dataset, aql: source.declaration.aql });
          for (const f of opts.filters || []) app.mapControl(f.control, q, { field: f.field });
        } catch (err) {
          return Promise.resolve({ status: 'error', message: err.message });
        }
        const started = now();
        return app.execute().then(() => {
          if (q.state === 'error') return { status: 'error', message: q.error.message };
          if (q.state !== 'success') return { status: 'error', message: 'The query did not finish.' };
          const rows = q.result.rows;
          const debug = q.result.debug || {};
          const row = rows.find((r) => bucketKey(r.bucket) === key);
          return {
            status: 'success', rowCount: rows.length, ms: now() - started,
            executedAt: debug.executedAt, fromCache: debug.fromCache === true, sql: debug.executedSql,
            table: resultTable(rows, key, { grain: g, format: opts.format }),
            comparison: explanation ? compareRun(explanation, row) : { matches: false, differences: [], missing: true },
          };
        });
      },
    };
    const ui = (opts.ui || domUi)(chart, onClick, opts, actions);

    function currentGrain () {
      const condition = opts.drill && (opts.drill.appliedCondition || opts.drill.condition);
      if (condition && condition.operator === 'transform_date_drill') return String(condition.values[0]).replace('datetrunc ', '');
      return opts.grain;
    }
    function timeAlias () {
      return opts.timeAlias || findTimeAlias(query.result && query.result.columns, opts.time);
    }
    function anomalyQuery (g) {
      if (!queries[g]) {
        const q = app.createQuery(`${query.name}__anomaly${suffix}_${g}`, {
          dataset: query.declaration.dataset,
          aql: buildAql({ measure: opts.measure, time: opts.time, grain: g, k: opts.k }),
        });
        queries[g] = q;
        // The reader's date range is left out on purpose: the baseline must reach the series' start.
        for (const f of opts.filters || []) app.mapControl(f.control, q, { field: f.field });
      }
      return queries[g];
    }
    function show () {
      const alias = timeAlias();
      const chartRows = query.result ? query.result.rows : [];
      summary = state === 'showing'
        ? summarize(points, { label, grain, format: opts.format, windowKeys: chartRows.map((r) => bucketKey(r[alias])) })
        : null;
      ui.update({ state, message, summary, queryName: grain && queries[grain] ? queries[grain].name : null });
    }
    function fail (reason) {
      state = 'error';
      message = reason;
      points = null;
      show();
      opts.render();
    }
    function start () {
      if (!query.result) return fail('the chart has no data yet; try again once it has loaded.');
      grain = currentGrain();
      if (!GRAINS.includes(grain)) return fail("the chart's date drill has no grain; pass opts.grain with the chart's own grain.");
      if (!timeAlias()) return fail(`the chart's query has no dimension on ${opts.time}; pass opts.timeAlias with its alias.`);
      state = 'running';
      message = null;
      seen = null;
      try {
        anomalyQuery(grain);
      } catch (err) {
        return fail(err.message);
      }
      show();
      app.execute().then(sync);
      return undefined;
    }
    // On every change in the app: a finished or re-run anomaly query, a new grain, or a new chart
    // result (which changes the buckets the summary reports).
    function sync () {
      if (state === 'idle' || state === 'error') return;
      if (currentGrain() !== grain) return start();
      const q = queries[grain];
      if (!q) return undefined; // the SDK notifies while app.createQuery is still declaring it
      if (q.state === 'error') return fail(q.error.message);
      if (q.state === 'success' && q.result !== seen) {
        seen = q.result;
        points = parsePoints(q.result.rows, grain, now(), opts.timeZone || app.timezone || 'UTC');
        state = 'showing';
        show();
        opts.render();
        return undefined;
      }
      if (state === 'showing') show();
      return undefined;
    }
    function revert () {
      state = 'idle';
      points = null;
      seen = null;
      message = null;
      show();
      opts.render();
    }
    function onClick () {
      if (state === 'showing') revert();
      else if (state !== 'running') start();
    }

    app.subscribe(sync);
    show();

    return {
      decorate (option) {
        if (state !== 'showing' || !points) return option;
        return decorateOption(option, { points, chartRows: query.result ? query.result.rows : [], timeAlias: timeAlias(), yAxisIndex: opts.yAxisIndex, format: opts.format, colors: opts.colors });
      },
      run: start,
      revert,
      get state () { return state; },
      get summary () { return summary; },
      get message () { return message; },
    };
  }

  // -- exports --
  root.AnfraAnomaly = {
    version: VERSION,
    attach,
    buildAql,
    bucketKey,
    parsePoints,
    bucketLabel,
    findTimeAlias,
    explainPoint,
    chartIndex,
    changeHistory,
    pointTooltip,
    resultTable,
    compareRun,
    summarize,
    decorateOption,
    STYLE,
    summaryTone,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
