/* Calculation backend: AQL for share of total, rank, running total, period
   comparison, and Top N with an Other bar. Pure: it writes AQL text and nothing
   else, so every number still comes from the semantic layer (AD-1, AD-2).

   Rules: docs/knowledge/logic/{percent-of-total,rank,running-total,period-comparison,top-n}.md
   Proof: scripts/check_nether_logic.cjs. Each builder returns text to put inside an
   explore's `measures { }`, or a whole explore (topN), so the caller aliases it. */
(() => {
 'use strict';
 const root = typeof window === 'undefined' ? globalThis : window;
 const fail = message => { throw new Error(message); };
 const fieldRef = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
 const alias = /^[a-z_][a-z0-9_]*$/;
 const GRAINS = ['year', 'quarter', 'month', 'week', 'day'];
 const ref = (value, what) => fieldRef.test(String(value)) ? String(value) : fail('Not a field or metric name: ' + what);

 /* ---------------------------------------------------------- percent of total */
 /* Share of the total under the page's filters, as a RATIO (0.25 is 25%): format it
    with Intl percent. `item` is the dimension the bars are drawn by (list every
    dimension of its model that the explore selects). One dimension per chart: with a
    legend the bar is a stack of segments, and a segment's share is not the bar's.

    `where` is the page's own conditions as one AQL condition (filter-aql's compile()
    output, joined with and()), restated inside the total. exclude_grains drops a
    compound condition (not(...), or(...)) because it cannot tell which fields it
    touches: under not(outcome == 'recovered') the total came back 818 instead of 451
    and the shares added up to 55%. Restated in where() the total is right with or
    without it, and exclude_grains still drops the Top N condition on the item, so a
    kept bar's share is of the WHOLE and the bars and Other add up to 100%.
    percent_of_total(m, 'grand_total') gives the same ratio when there is no Top N. */
 function percentOfTotal(measure, items, where){
  const list = [].concat(items || []);
  if(!list.length) fail('Name the dimension the bars are drawn by.');
  const total = ref(measure, 'measure') + (where ? ' | where(' + where + ')' : '') + ' | exclude_grains(' + list.map(i => ref(i, 'dimension')).join(', ') + ')';
  return 'safe_divide(' + measure + ', ' + total + ')';
 }
 // filter-aql conditions -> one AQL condition, or null when there are none
 const conjunction = conditions => conditions.length > 1 ? 'and(' + conditions.join(', ') + ')' : conditions[0] || null;

 /* ----------------------------------------------------------------------- rank */
 /* Two ranks side by side: across all rows, and within each group. Both order by
    the measure descending and then by EVERY dimension ascending, so no two rows tie
    and the same row order applies to both. Without the dimension tiebreak, two rows
    with the same value and item in different groups got the same overall rank.
    `dimensions` are all the explore's dimensions, group first. */
 function rank({measure, dimensions, group}){
  const dims = (dimensions || []).map(d => ref(d, 'dimension'));
  if(dims.length < 2) fail('A rank within a group needs a group and an item.');
  if(!dims.includes(group)) fail('The group must be one of the explore dimensions.');
  ref(measure, 'measure');
  const key = 'order: ' + measure + ' | desc(), ' + [group, ...dims.filter(d => d !== group)].map(d => 'order: ' + d + ' | asc()').join(', ');
  const overall = 'rank(' + key + ', partition: [])';
  const within = 'rank(' + key + ', partition: ' + group + ')';
  // The leaders toggle keeps rows where the within-group rank is 1: one row per group.
  return {overall, within, leaders: within + ' == 1'};
 }

 /* ------------------------------------------------------------- running total */
 /* Runs along the date field itself, never along a truncated one (AQL rule), so it
    follows whatever grain the dimension is drawn at. keep_filters (the default)
    keeps the page's date filter, so the last point is the sum of the visible bars. */
 function runningTotal(measure, dateField){
  return ref(measure, 'measure') + ' | running_total(' + ref(dateField, 'date field') + ')';
 }

 /* ---------------------------------------------------------- period comparison */
 /* The same measure shifted back one period of the chart's grain, or one year. The
    date dimension in the explore must be truncated to that grain (the drill sets
    it). relative_period reads the shifted time window itself, so the earlier
    period is found even when the page's date filter starts later. A period with no
    rows of its own still appears when its comparison period has rows; its value is
    null, not zero. */
 function comparison({measure, dateField, grain, kind}){
  if(!GRAINS.includes(grain)) fail('Unsupported grain: ' + grain);
  const unit = kind === 'previous' ? grain : kind === 'year' ? 'year' : fail('Compare with the previous period or the same period last year.');
  const shifted = ref(measure, 'measure') + ' | relative_period(' + ref(dateField, 'date field') + ', interval(-1 ' + unit + '))';
  // Change is (now - before) / before. A missing or zero before has no change (null), never a divide error.
  return {previous: shifted, change: 'safe_divide(' + measure + ' - (' + shifted + '), ' + shifted + ')'};
 }

 /* -------------------------------------------------------------- top N + other */
 const block = (name, items) => items.length ? '  ' + name + ' {\n' + items.map(c => '    ' + c + ',').join('\n') + '\n  }\n' : '';

 /* `compiled` is filter-aql compile() output whose `top` is set. Returns two explores:
      bars   the kept items (more than N when values tie), with value and share of the WHOLE
      other  one row: everything not kept, with its share
    They share one set of filters, so the bars and Other add up to the full total. Only
    for additive measures: a ratio has no meaningful Other (see isAdditive). */
 function topN({measure, item, compiled}){
  const top = compiled && compiled.top;
  if(!top) fail('Pick N first: the filter has no top N or bottom N.');
  if(top.item !== item) fail('The top N is on ' + top.item + ', not ' + item + '.');
  ref(measure, 'measure'); ref(item, 'item');
  const base = compiled.filters.filter(f => f !== top.aql);
  const dir = top.direction === 'bottom' ? 'asc' : 'desc';
  const bars = 'explore {\n  dimensions {\n    item: ' + item + ',\n  }\n  measures {\n    value: ' + measure + ',\n    share: ' +
   percentOfTotal(measure, item, conjunction(base)) + ',\n  }\n' + block('filters', compiled.filters) + '  sorts {\n    value ' + dir + ',\n    item asc,\n  }\n}';
  const rest = measure + ' | where(' + item + ' not in ' + top.call + ')';
  const other = 'explore {\n  measures {\n    value: ' + rest + ',\n    share: safe_divide(' + rest + ', ' + measure + '),\n  }\n' + block('filters', base) + '}';
  const total = 'explore {\n  measures {\n    value: ' + measure + ',\n  }\n' + block('filters', base) + '}';
  return {bars, other, total};
 }

 /* ------------------------------------------------------------- metric filter */
 /* A slider on a TOTAL per item (what a buyer paid in all), not on single rows: the
    list keeps the items whose summed value is at least the minimum, and counts them.
    `measure` is a dataset metric (the total), `items` the dimensions that make one row
    of the list, the KEY first (a name can repeat, an id cannot: the count is of keys).
    `conditions` are the page's own conditions (filter-aql compile().filters), so the
    list, the count and the slider's range all answer to the same filters.
      list    the items that clear it, with their total       (`having`, not `where`)
      count   how many items clear it, as one number
      range   the smallest and largest total and how many items: the slider's bounds
    "At least": an item whose total equals the minimum stays. A condition on a total goes
    in `having`; a `where` would filter the single rows and change the totals themselves. */
 const numeric = /^-?\d+(\.\d+)?$/;
 function metricFilter({measure, items, min, conditions = []}){
  const dims = [].concat(items || []).map(i => ref(i, 'item'));
  if(!dims.length) fail('Name the item the list is of.');
  const key = dims[0], total = ref(measure, 'measure');
  const floor = String(min ?? '').trim();
  if(!numeric.test(floor) || floor.length > 30) fail('The minimum is a number.');
  const where = block('filters', conditions);
  const perItem = 'unique(' + key + ') | select(t: ' + total + ')';
  const list = 'explore {\n  dimensions {\n' + dims.map((d, i) => '    item' + (i ? i + 1 : '') + ': ' + d + ',').join('\n') + '\n  }\n  measures {\n    total: ' + total + ',\n  }\n' +
   where + '  having {\n    ' + total + ' >= ' + floor + ',\n  }\n  sorts {\n    total desc,\n    item asc,\n  }\n}';
  const count = 'explore {\n  measures {\n    remaining: ' + perItem + ' | filter(t >= ' + floor + ') | count(t),\n  }\n' + where + '}';
  const range = 'explore {\n  measures {\n    lowest: ' + perItem + ' | min(t),\n    highest: ' + perItem + ' | max(t),\n    items: ' + perItem + ' | count(t),\n  }\n' + where + '}';
  return {list, count, range};
 }
 /* Slider positions for a range of totals: whole steps of 1, 2 or 5 times a power of ten, about 100 positions. */
 function sliderSteps(lowest, highest){
  const lo = Number(lowest), hi = Number(highest);
  if(!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) fail('No range to slide over.');
  const raw = Math.max(hi - lo, 1) / 100, power = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map(m => m * power).find(v => v >= raw);
  return {min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step};
 }

 const api = {metricFilter, sliderSteps, conjunction, percentOfTotal, rank, runningTotal, comparison, topN, GRAINS};
 if(typeof module !== 'undefined') module.exports = api; else root.NetherCalcAql = api;
})();
