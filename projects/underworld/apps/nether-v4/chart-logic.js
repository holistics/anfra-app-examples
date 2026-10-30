/* Chart backend: the deterministic rules behind date drill, break down, sort,
   reference line and trend line. Pure, no Anfra calls (AD-2), no DOM.

   Each section here is the code form of one page in docs/knowledge/logic/.
   Change the rule in the page and here together, and keep
   scripts/check_nether_logic.cjs green; it proves each rule against the live
   semantic layer. */
(() => {
 'use strict';
 const root = typeof window === 'undefined' ? globalThis : window;
 const fail = message => { throw new Error(message); };
 const DAY = 86400000;

 /* ---- calendar (UTC; setUTCFullYear because Date.UTC maps years 0-99 to 19xx) */
 function utc(y, m, d){ const date = new Date(0); date.setUTCFullYear(y, m, d); return date; }   // month and day overflow roll into the year
 function parse(value){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if(!m) fail('"' + value + '" is not an ISO date.');
  return utc(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
 }
 const pad = (n, w) => String(n).padStart(w, '0');
 const iso = date => pad(date.getUTCFullYear(), 4) + '-' + pad(date.getUTCMonth() + 1, 2) + '-' + pad(date.getUTCDate(), 2);
 const days = date => Math.round(date.getTime() / DAY);

 /* ================================================================ date drill */
 // Week is not on the ladder: a week straddles months, so weeks would not add up
 // to the month that was clicked. Week stays a stand-alone grain for a chart.
 const LADDER = ['year', 'quarter', 'month', 'day'];

 function periodBounds(value, grain){
  const start = parse(value);
  let end;
  if(grain === 'year') end = utc(start.getUTCFullYear() + 1, 0, 1);
  else if(grain === 'quarter') end = utc(start.getUTCFullYear(), start.getUTCMonth() + 3, 1);
  else if(grain === 'month') end = utc(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  else if(grain === 'week') end = utc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7);
  else if(grain === 'day') end = utc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1);
  else fail('Unsupported grain: ' + grain);
  return {start: iso(start), end: iso(end)};
 }

 function periodLabel(value, grain){
  const d = parse(value), y = pad(d.getUTCFullYear(), 4);
  if(grain === 'year') return y;
  if(grain === 'quarter') return y + ' Q' + (Math.floor(d.getUTCMonth() / 3) + 1);
  if(grain === 'month') return y + '-' + pad(d.getUTCMonth() + 1, 2);
  return iso(d);
 }

 /* A period as an AQL condition, half open and day-safe: from its first day up to the next period's first day.
    Not `matches @(start until end)`: AQL reads a day-level time literal for this world's years as the whole
    month, so a week or a day came back as a month (docs/knowledge/logic/date-drill.md). */
 function periodCondition(field, period){
  if(!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(String(field))) fail('Not a field name: ' + field);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(period.start) || !/^\d{4}-\d{2}-\d{2}$/.test(period.end)) fail('A period has ISO start and end dates.');
  return 'and(' + field + " >= cast('" + period.start + "', 'date'), " + field + " < cast('" + period.end + "', 'date'))";
 }

 const drill = {
  LADDER,
  start: (grain = 'year') => ({grain, path: []}),
  canDrill: state => LADDER.indexOf(state.grain) >= 0 && LADDER.indexOf(state.grain) < LADDER.length - 1,
  /* Click a period: keep it as the filter and move one grain finer. */
  into(state, value){
   if(!drill.canDrill(state)) fail('There is no finer grain than ' + state.grain + '.');
   const bounds = periodBounds(value, state.grain);
   return {grain: LADDER[LADDER.indexOf(state.grain) + 1],
    path: [...state.path, {grain: state.grain, label: periodLabel(value, state.grain), ...bounds}]};
  },
  /* Back to a breadcrumb: depth 0 is the top (no period kept). */
  up(state, depth){
   if(!Number.isInteger(depth) || depth < 0 || depth > state.path.length) fail('No such breadcrumb: ' + depth);
   return depth === state.path.length ? state : {grain: state.path[depth]?.grain ?? state.grain, path: state.path.slice(0, depth)};
  },
  /* The SDK condition for the date filter control, or null at the top. Nested
     periods nest, so the innermost one is the whole filter. */
  condition(state){
   const last = state.path[state.path.length - 1];
   return last ? {operator: 'matches', values: [last.start + ' until ' + last.end]} : {operator: 'is', values: []};
  },
  breadcrumb: state => [{label: 'All time', depth: 0}, ...state.path.map((p, i) => ({label: p.label, depth: i + 1}))],
  /* Parts must add up to the period that was clicked. Counts and sums only. */
  addsUp(parentValue, childValues, tolerance = 1e-9){
   const sum = childValues.reduce((s, v) => s + Number(v), 0), parent = Number(parentValue);
   return Math.abs(sum - parent) <= tolerance * Math.max(1, Math.abs(parent));
  },
 };

 /* ============================================================== break down */
 /* A metric splits into parts that add up only if it is a plain count or sum.
    Ratios, averages and distinct counts do not, so they get no break down.
    Read from the metric definition (schema-notes.js carries it), so adding a
    metric needs no edit here. A derived metric (a - b) is treated as not
    additive, which is the safe side. */
 function isAdditive(definition){
  const text = String(definition || '').replace(/\s+/g, ' ').trim();
  if(!text || /\/|count_distinct|avg\(|average\(|median/i.test(text)) return false;
  // one source model, an optional where, then a single count or sum
  return /^[a-z_]+( \| where\(.*?\))? \| (count|sum)\(.+\)$/i.test(text);
 }

 /* The short list a reader may split a bar by, per SOURCE MODEL of the metric
    (the model its definition starts from). Only that model's own columns and
    columns of models on the one side of its ACTIVE many-to-one relationships.
    A field reached any other way fans out: oaths_sworn by temple deity summed to
    1014 against 157, because it went person -> offering -> temple. Each entry is
    proved additive against the live data by check_nether_logic.cjs. */
 const BREAKDOWNS = {
  nether_patient_case: [['nether_ailment.name', 'Ailment'], ['nether_patient_case.outcome', 'Outcome'], ['nether_person.birthplace', 'Healer’s birthplace']],
  nether_ownership_transaction: [['nether_asset.asset_type', 'Asset type'], ['nether_asset.location', 'Asset location'], ['nether_person.birthplace', 'Buyer’s birthplace']],
  nether_casualty_record: [['nether_casualty_record.context', 'Context'], ['nether_person.birthplace', 'Killer’s birthplace']],
  nether_harvest_record: [['nether_harvest_record.crop', 'Crop'], ['nether_estate.region', 'Estate region']],
  nether_offering: [['nether_offering.kind', 'Offering kind'], ['nether_temple.deity', 'Deity'], ['nether_person.birthplace', 'Giver’s birthplace']],
  nether_oath: [['nether_oath.subject', 'Subject'], ['nether_person.birthplace', 'Swearer’s birthplace']],
  nether_employment: [['nether_employment.role', 'Role'], ['nether_business.trade', 'Trade'], ['nether_person.birthplace', 'Soul’s birthplace']],
  nether_relationship: [['nether_relationship.bond_type', 'Bond type'], ['nether_person.birthplace', 'Soul’s birthplace']],
  nether_passage_permit: [['nether_passage_permit.status', 'Permit status'], ['nether_person.birthplace', 'Holder’s birthplace']],
 };

 const sourceModel = definition => /^\s*(nether_\w+)\s*\|/.exec(String(definition || ''))?.[1] || null;

 function breakdownChoices(definition){
  if(!isAdditive(definition)) return [];
  return (BREAKDOWNS[sourceModel(definition)] || []).map(([field, label]) => ({field, label}));
 }

 /* The panel query: the bar's value split by one field. `conditions` are the
    AQL conditions that select the bar (its period and its legend value), and
    the main chart's own filters; `compileFilters` output, so both stay in step. */
 function breakdownAql({measure, field, conditions = []}){
  const block = conditions.length ? '  filters {\n' + conditions.map(c => '    ' + c + ',').join('\n') + '\n  }\n' : '';
  return 'explore {\n  dimensions {\n    part: ' + field + ',\n  }\n  measures {\n    value: ' + measure + ',\n  }\n' + block +
   '  sorts {\n    value desc,\n    part asc,\n  }\n}';
 }

 /* ===================================================================== sort */
 /* First click ascending, a second flips, a third flips back. Clicking another
    column starts it at ascending. */
 function nextSort(current, column){
  const head = current && current[0];
  if(!head || head.field !== column) return {field: column, direction: 'asc'};
  return {field: column, direction: head.direction === 'asc' ? 'desc' : 'asc'};
 }
 /* Every sort ends with the row's unique key. Without it, rows that tie on the
    clicked column may come back in a different order on each page request, so a
    row repeats on one page and is skipped on the next. */
 function withTiebreak(sort, key){
  const keys = list(sort).filter(s => s.field !== key);
  return [...keys, {field: key, direction: 'asc'}];
 }
 const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
 /* Pages in order, each an array of rows: no key may repeat, and the sort order must hold across page edges. */
 function pagesAreSound(pages, key, compareRows){
  const seen = new Set();
  let previous = null;
  for(const page of pages) for(const row of page){
   if(seen.has(row[key])) return {ok: false, reason: 'repeated ' + row[key]};
   seen.add(row[key]);
   if(previous && compareRows && compareRows(previous, row) > 0) return {ok: false, reason: 'out of order at ' + row[key]};
   previous = row;
  }
  return {ok: true, rows: seen.size};
 }

 /* =========================================================== reference line */
 /* Attainment is actual over target, as a ratio: 1.12 reads 112%. No target, or
    a target of zero, is no attainment (null), never 0 and never infinity. */
 function attainment(actual, target){
  if(actual == null || target == null) return null;
  const a = Number(actual), t = Number(target);
  return Number.isFinite(a) && Number.isFinite(t) && t > 0 ? a / t : null;
 }

 /* ================================================================ trend line */
 function isIncomplete(periodStart, grain, now){
  return parse(periodBounds(periodStart, grain).end) > (now instanceof Date ? now : new Date(now)) ;
 }

 /* Moving average is computed by the query, so it follows the same filters.
    `order` is the date field truncated to the chart grain, written out in full:
    a measure cannot order by a dimension alias. Rows before the window is full
    carry a partial average; trend() blanks them. */
 function movingAverageAql(measure, orderField, grain, size){
  if(!Number.isInteger(size) || size < 2 || size > 60) fail('A moving average window is 2 to 60 periods.');
  if(!['year', 'quarter', 'month', 'week', 'day'].includes(grain)) fail('Unsupported grain: ' + grain);
  return 'window_avg(' + measure + ', -' + (size - 1) + '..0, order: ' + orderField + ' | ' + grain + '() | asc())';
 }

 function linear(xs, ys){
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0;
  for(let i = 0; i < n; i++){ sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  if(sxx === 0) return null;
  const slope = sxy / sxx;
  return {slope, intercept: my - slope * mx};
 }

 /* points: [{period:'YYYY-MM-DD', value, series?}], in any order.
    options: {method:'linear'|'exponential'|'moving_average', grain, now,
              dropIncomplete=true, window=3, valueKey}
    Returns one entry per series: {series, points:[{period, value}], excluded:[{period, reason}], r2?}.
    x is calendar time (days), not row position, so a month with no rows does not bend the line. */
 function trend(points, options){
  const {method, grain, now = new Date(), dropIncomplete = true, window = 3} = options;
  if(!['linear', 'exponential', 'moving_average'].includes(method)) fail('Unsupported trend: ' + method);
  const groups = new Map();
  for(const p of points){
   const key = p.series == null ? '' : p.series;
   if(!groups.has(key)) groups.set(key, []);
   groups.get(key).push(p);
  }
  const out = [];
  for(const [series, rows] of groups){
   const excluded = [];
   const ordered = rows.filter(r => r.value != null && Number.isFinite(Number(r.value)))
    .sort((a, b) => a.period < b.period ? -1 : a.period > b.period ? 1 : 0);
   const kept = ordered.filter(r => {
    if(dropIncomplete && isIncomplete(r.period, grain, now)){ excluded.push({period: r.period, reason: 'period not over yet'}); return false; }
    return true;
   });
   if(method === 'moving_average'){
    // the query supplied r.average; the first window-1 points average fewer than `window` periods
    const lines = kept.map((r, i) => ({period: r.period, value: i < window - 1 || r.average == null ? null : Number(r.average)}));
    out.push({series, points: lines, excluded});
    continue;
   }
   let usable = kept;
   if(method === 'exponential'){
    usable = kept.filter(r => {
     if(Number(r.value) > 0) return true;
     excluded.push({period: r.period, reason: 'exponential needs a value above zero'});
     return false;
    });
   }
   if(usable.length < 2){ out.push({series, points: [], excluded, reason: 'a trend needs at least two periods'}); continue; }
   const origin = days(parse(usable[0].period));
   const xs = usable.map(r => days(parse(r.period)) - origin);
   const ys = usable.map(r => method === 'exponential' ? Math.log(Number(r.value)) : Number(r.value));
   const fit = linear(xs, ys);
   if(!fit){ out.push({series, points: [], excluded, reason: 'the periods do not span any time'}); continue; }
   const at = x => method === 'exponential' ? Math.exp(fit.intercept + fit.slope * x) : fit.intercept + fit.slope * x;
   const mean = ys.reduce((s, v) => s + v, 0) / ys.length;
   const ssTot = ys.reduce((s, v) => s + (v - mean) ** 2, 0);
   const ssRes = ys.reduce((s, v, i) => s + (v - (fit.intercept + fit.slope * xs[i])) ** 2, 0);
   out.push({series, points: usable.map((r, i) => ({period: r.period, value: at(xs[i])})), excluded,
    r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot});
  }
  return out;
 }

 const api = {LADDER, periodBounds, periodCondition, periodLabel, drill, isAdditive, BREAKDOWNS, sourceModel, breakdownChoices, breakdownAql,
  nextSort, withTiebreak, pagesAreSound, attainment, isIncomplete, movingAverageAql, trend};
 if(typeof module !== 'undefined') module.exports = api; else root.NetherChartLogic = api;
})();
