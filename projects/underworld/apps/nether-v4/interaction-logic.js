/* Chart interactions: range brush, histogram brush, zoom and pan, drill down, date drill and
   the right-click menu that offers the last two. Pure: no DOM, no Anfra (AD-2). It decides what a
   gesture MEANS (which period, which range, which filters, which fields are offered) and writes
   conditions as filter-aql trees or AQL text; the chart draws, port.js asks.

   Rules: docs/knowledge/logic/{range-brush,histogram-brush,zoom-pan,drill-down}.md
   Proof: scripts/check_nether_logic.cjs */
(() => {
 'use strict';
 const root = typeof window === 'undefined' ? globalThis : window;
 const CL = typeof module !== 'undefined' ? require('./chart-logic.js') : root.NetherChartLogic;
 const fail = message => { throw new Error(message); };
 const fieldRef = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
 const numberText = /^-?\d+(\.\d+)?$/;
 const isoOf = d => String(d.getUTCFullYear()).padStart(4, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
 const isDate = type => type === 'date' || type === 'datetime';

 /* ============================================================== range brush */
 /* Dragging across a time chart marks the periods under the drag. `periods` are the period starts
    as drawn, ascending ('0442-01-01', ...); i0 and i1 are the indexes where the drag began and ended,
    in either order. The brush covers WHOLE periods, from the start of the first to the end of the
    last (end excluded), so what it keeps is exactly the bars it shows highlighted. */
 const brush = {
  range(periods, grain, i0, i1){
   if(!Array.isArray(periods) || !periods.length) fail('There is nothing to brush.');
   if(![i0, i1].every(i => Number.isInteger(i) && i >= 0 && i < periods.length)) fail('The brush is outside the chart.');
   const a = Math.min(i0, i1), b = Math.max(i0, i1);
   const from = CL.periodBounds(periods[a], grain).start, to = CL.periodBounds(periods[b], grain).end;
   return {from, to, first: a, last: b, count: b - a + 1, grain, firstPeriod: periods[a], lastPeriod: periods[b],
    // the SDK date filter condition, and AQL for the same period
    condition: {operator: 'matches', values: [from + ' until ' + to]},
    aql: field => CL.periodCondition(field, {start: from, end: to})};
  },
  /* The title names the period: "Brushed 0442-03 to 0442-09" or "Brushed 0442-03". `format` turns a stored
     period into what the reader sees (the app passes the BC formatter). */
  title(range, format){
   const name = value => format ? format(value, range.grain) : CL.periodLabel(value, range.grain);
   return range.count === 1 ? 'Brushed ' + name(range.firstPeriod) : 'Brushed ' + name(range.firstPeriod) + ' to ' + name(range.lastPeriod);
  },
  /* Select bands in displayed order, including reversed drags. Dates keep whole
     periods; metric-sorted, disjoint periods stay separate rather than filling gaps. */
  selection({field, type, grain = 'none', values, first, last, label = field, format = String}){
   if(!fieldRef.test(field)) fail('Not a field name: ' + field);
   if(!Array.isArray(values) || ![first,last].every(i => Number.isInteger(i) && i >= 0 && i < values.length)) fail('The brush is outside the chart.');
   const picked=values.slice(Math.min(first,last),Math.max(first,last)+1),present=[...new Set(picked.filter(v=>v!=null))],nodes=[];
   let description;
   if(isDate(type)){
    const g=grain==='none'?'day':grain,periods=present.map(v=>CL.periodBounds(v,g)).sort((a,b)=>a.start.localeCompare(b.start)),merged=[];
    for(const period of periods){const prev=merged[merged.length-1];if(prev&&period.start<=prev.end){if(period.end>prev.end)prev.end=period.end;}else merged.push({...period});}
    for(const period of merged){const end=new Date(period.end+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-1);nodes.push({field,operator:'between',values:[period.start,isoOf(end)]});}
    const ordered=present.slice().sort();
    description=merged.length===1?brush.title(brush.range(ordered,g,0,ordered.length-1),format).replace(/^Brushed /,''):present.length+' periods';
   }else if(type==='number'){
    const monotone=present.every((v,i)=>!i||Number(v)>=Number(present[i-1]))||present.every((v,i)=>!i||Number(v)<=Number(present[i-1]));
    if(present.length&&monotone){const sorted=present.slice().sort((a,b)=>Number(a)-Number(b));nodes.push({field,operator:'between',values:[String(sorted[0]),String(sorted[sorted.length-1])]});}
    else nodes.push(...present.map(v=>({field,operator:'equal',values:[String(v)]})));
    description=present.length===1?format(present[0]):monotone&&present.length?format(Math.min(...present.map(Number)))+' to '+format(Math.max(...present.map(Number))):present.length+' values';
   }else{
    if(type==='truefalse')nodes.push(...present.map(v=>({field,operator:'is',values:[v===true||v==='true'||v==='1']})));
    else if(present.length)nodes.push({field,operator:'is',values:present.map(String)});
    description=present.length<=3?present.map(v=>format(v)).join(', '):present.length+' categories';
   }
   if(picked.some(v=>v==null)){nodes.push({field,operator:'is_null',values:[]});description=description&&present.length?description+', (none)':'(none)';}
   return {field,type,grain,values:picked,tree:nodes.length===1?nodes[0]:{combinator:'or',children:nodes},chip:label+': '+description,title:'Brushed '+description};
  },
  clear: () => null,
 };

 /* ========================================================= histogram brush */
 const niceWidth = raw => { const power = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 5, 10].map(m => m * power).find(v => v >= raw); };
 const decimals = width => Math.max(0, -Math.floor(Math.log10(width)) + (width.toString().includes('5') ? 1 : 0));
 const round = (v, width) => Number(v.toFixed(Math.min(10, decimals(width) + 2)));
 const histogram = {
  /* Equal-width bins, a 1, 2 or 5 times a power of ten wide, about `target` of them, edges on multiples of the
     width so a bin reads "10 to 20" and never "10.37 to 20.37". Bins are half open: [low, high). */
  bins(lowest, highest, target = 10){
   const lo = Number(lowest), hi = Number(highest);
   if(!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) fail('No range to make bins of.');
   const width = niceWidth(Math.max(hi - lo, 1e-9) / target), start = round(Math.floor(lo / width) * width, width);
   const bins = [];
   for(let i = 0; ; i++){
    const low = round(start + i * width, width), high = round(start + (i + 1) * width, width);
    bins.push({low, high, index: i});
    if(hi < high) break;
    if(i > 1000) fail('Too many bins.');
   }
   return {width, start, bins};
  },
  /* The histogram query. The bin is a dimension declared on the field's own model (AQL does not allow a
     calculation inline in an explore): floor(field / width) * width. The measure counts or sums per bin. */
  aql({field, width, measure, conditions = []}){
   if(!fieldRef.test(field) || !field.includes('.')) fail('Bin a model field.');
   if(!fieldRef.test(measure)) fail('Not a measure name: ' + measure);
   const w = String(width);
   if(!numberText.test(w) || Number(w) <= 0) fail('The bin width is a positive number.');
   const [model, name] = field.split('.'), bin = model + '.' + name + '_bin';
   return 'dimension ' + bin + ' = floor(' + field + ' / ' + w + ') * ' + w + ';\nexplore {\n  dimensions {\n    bin: ' + bin + ',\n  }\n  measures {\n    value: ' + measure + ',\n  }\n' +
    (conditions.length ? '  filters {\n' + conditions.map(c => '    ' + c + ',').join('\n') + '\n  }\n' : '') + '  sorts {\n    bin asc,\n  }\n}';
  },
  /* Dragging across bins i0..i1 sets a value range, low edge included and high edge excluded, the same
     half-open rule the bins use, so the rows kept are exactly the rows in the bins highlighted. */
  brush(bins, i0, i1, {label = '', format} = {}){
   if(![i0, i1].every(i => Number.isInteger(i) && i >= 0 && i < bins.length)) fail('The brush is outside the histogram.');
   const a = Math.min(i0, i1), b = Math.max(i0, i1), lo = bins[a].low, hi = bins[b].high, show = format || (v => String(v));
   return {low: lo, high: hi, first: a, last: b,
    chip: (label ? label + ': ' : '') + show(lo) + ' to ' + show(hi),
    aql: field => (fieldRef.test(field) ? 'and(' + field + ' >= ' + lo + ', ' + field + ' < ' + hi + ')' : fail('Not a field name: ' + field))};
  },
  clear: () => null,
 };

 /* ============================================================== zoom and pan */
 /* The loaded chart has n points. The view is a window onto them, in point units (fractions allowed):
    {from, to}, 0 <= from < to <= n. Scrolling and dragging only move the window; no query runs. */
 const MIN_POINTS = 2;
 const clampView = (view, n) => {
  const min = Math.min(MIN_POINTS, n);
  let width = Math.min(Math.max(view.to - view.from, min), n), from = Math.max(0, Math.min(view.from, n - width));
  return {from, to: from + width};
 };
 const zoom = {
  full: n => ({from: 0, to: n}),
  /* Scroll up zooms in, down zooms out, around `anchor` (0 to 1, where the pointer is across the plot). */
  wheel(view, n, {deltaY, anchor = .5, factor = 1.2}){
   if(!deltaY) return view;
   const scale = deltaY < 0 ? 1 / factor : factor, width = (view.to - view.from) * scale;
   const pivot = view.from + (view.to - view.from) * Math.min(1, Math.max(0, anchor));
   return clampView({from: pivot - width * Math.min(1, Math.max(0, anchor)), to: pivot + width * (1 - Math.min(1, Math.max(0, anchor)))}, n);
  },
  /* Drag sideways: `fraction` of the visible window, positive moves later. */
  pan: (view, n, fraction) => clampView({from: view.from + (view.to - view.from) * fraction, to: view.to + (view.to - view.from) * fraction}, n),
  /* Indexes of the points to draw: any point that overlaps the window. */
  visible: (view, n) => { const out = []; for(let i = Math.max(0, Math.floor(view.from)); i < Math.min(n, Math.ceil(view.to)); i++) out.push(i); return out; },
  isFull: (view, n) => view.from <= 0 && view.to >= n,

  /* The grains a double-click can go to. Week is here, between month and day, though a week straddles two
     months; the periods it makes at the edge of the clicked one are marked partial. */
  GRAINS: ['year', 'quarter', 'month', 'week', 'day'],
  finer(grain){ const i = zoom.GRAINS.indexOf(grain); return i >= 0 && i < zoom.GRAINS.length - 1 ? zoom.GRAINS[i + 1] : null; },
  /* A period at `grain` inside the clicked period is partial when it starts before it or ends after it. */
  partial(periodStart, grain, clicked){
   const bounds = CL.periodBounds(periodStart, grain);
   return bounds.start < clicked.start || bounds.end > clicked.end;
  },
  /* One zoomable chart. `ask({grain, period})` runs a query for the chart at that grain, filtered to `period`
     ({start, end} or null for the whole range) and resolves {periods:[start...], values:[...]}. It is called
     once to load, and once per double-click. Scrolling, panning and Back never call it. */
  session({grain, ask}){
   let queries = 0, loaded = null; const history = [];
   const load = async (g, period) => {
    queries++;
    const result = await ask({grain: g, period});
    const flags = result.periods.map(p => period ? zoom.partial(p, g, period) : false);
    return {grain: g, period, periods: result.periods, values: result.values, partial: flags, view: zoom.full(result.periods.length)};
   };
   return {
    get queries(){ return queries; },
    get state(){ return loaded; },
    get depth(){ return history.length; },
    async start(){ loaded = await load(grain, null); history.length = 0; return loaded; },
    wheel(input){ loaded = {...loaded, view: zoom.wheel(loaded.view, loaded.periods.length, input)}; return loaded; },
    pan(fraction){ loaded = {...loaded, view: zoom.pan(loaded.view, loaded.periods.length, fraction)}; return loaded; },
    async dblclick(index){
     if(!loaded) fail('Load the chart first.');
     const next = zoom.finer(loaded.grain);
     if(!next) fail('There is no finer grain than ' + loaded.grain + '.');
     if(!Number.isInteger(index) || index < 0 || index >= loaded.periods.length) fail('That period is not on the chart.');
     // A period at the edge of the one before it holds only the rows inside that one (a partial week of a month),
     // so drilling into it is clipped to the same edges, or its days would count rows the bar never did.
     const whole = CL.periodBounds(loaded.periods[index], loaded.grain), parent = loaded.period;
     const period = parent ? {start: whole.start > parent.start ? whole.start : parent.start, end: whole.end < parent.end ? whole.end : parent.end} : whole;
     history.push(loaded);
     loaded = await load(next, period);
     return loaded;
    },
    /* Back returns to the previous chart exactly as it was, zoom included, without a query. */
    back(){ if(history.length) loaded = history.pop(); return loaded; },
    reset(){ if(history.length){ loaded = history[0]; history.length = 0; } return loaded; },
   };
  },
 };

 /* ================================================================ drill down */
 /* A path of values the reader clicked, one level per click. At each level the chart is drawn by one
    field; clicking a value keeps it as a filter and redraws by the next field the reader picks.
      state = {base, current, steps:[{field, type, grain, value}]}
    `current` is the field the chart is drawn by now. */
 // A date level has a grain. With none chosen the values are raw dates, which are days; a field newly drilled
 // into starts at year.
 const level = (field, type, grain, fallback = 'year') => ({field, type: type || 'text', grain: isDate(type) ? (grain && grain !== 'none' ? grain : fallback) : null});
 const drill = {
  start: (field, type, grain) => ({base: level(field, type, grain, 'day'), current: level(field, type, grain, 'day'), steps: []}),
  /* Click `value` on the current level and choose the `next` field ({field, type}). */
  into(state, value, next){
   if(!next || !fieldRef.test(next.field)) fail('Choose a field to drill into.');
   if(next.field === state.current.field) fail('Choose a different field than the one drawn.');
   if(state.steps.some(s => s.field === next.field)) fail('That field is already part of the path.');
   return {base: state.base, current: level(next.field, next.type, next.grain),
    steps: [...state.steps, {field: state.current.field, type: state.current.type, grain: state.current.grain, value}]};
  },
  /* Date drill is a step on the same field: keep the clicked period, draw the same field at a finer grain. */
  intoDate(state, value, to){
   if(!isDate(state.current.type)) fail('The chart is not drawn by a date.');
   if(!dateDrill.options(state.current.grain).some(o => o.grain === to)) fail('Cannot drill from ' + state.current.grain + ' to ' + to + '.');
   return {base: state.base, current: level(state.current.field, state.current.type, to),
    steps: [...state.steps, {field: state.current.field, type: state.current.type, grain: state.current.grain, value}]};
  },
  /* Back to a crumb: depth 0 is the start. The level is drawn by the field it was drawn by then, with the
     filters of the steps before it. */
  up(state, depth){
   if(!Number.isInteger(depth) || depth < 0 || depth > state.steps.length) fail('No such crumb: ' + depth);
   if(depth === state.steps.length) return state;
   const at = state.steps[depth];
   return {base: state.base, current: level(at.field, at.type, at.grain), steps: state.steps.slice(0, depth)};
  },
  /* One filter-aql leaf per step: an equality, or for a date the period clicked. */
  tree(state){
   return {combinator: 'and', children: state.steps.map(s => {
    if(s.value === null || s.value === undefined) return {field: s.field, operator: 'is_null', values: []};
    // inclusive last day, so filter-aql writes the day-safe half-open comparison
    if(isDate(s.type) && s.grain){ const b = CL.periodBounds(s.value, s.grain), last = new Date(0); const e = b.end.split('-').map(Number); last.setUTCFullYear(e[0], e[1] - 1, e[2] - 1); return {field: s.field, operator: 'between', values: [b.start, isoOf(last)]}; }
    if(s.type === 'truefalse') return {field: s.field, operator: 'is', values: [s.value === true || s.value === 'true' || s.value === '1']};
    return {field: s.field, operator: s.type === 'number' ? 'equal' : 'is', values: [String(s.value)]};
   })};
  },
  breadcrumb(state, format = (v, step) => (step.grain && isDate(step.type) ? CL.periodLabel(v, step.grain) : String(v))){
   return [{label: 'All', depth: 0}, ...state.steps.map((s, i) => ({label: (s.label || s.field.split('.').pop()) + ': ' + (s.value === null ? '(none)' : format(s.value, s)), depth: i + 1}))];
  },
  /* The next-level choices: fields that split this measure without double counting (the break down
     list for its source model), minus the fields already on the path. Empty for a measure that does
     not add up (a ratio, a distinct count), so the menu can say why. */
  choices(definition, state){
   const taken = new Set([state.current.field, ...state.steps.map(s => s.field)]);
   return CL.breakdownChoices(definition).filter(c => !taken.has(c.field));
  },
 };

 /* ==================================================================== date drill */
 const dateDrill = {
  /* The grains a clicked period can drill to: every finer one on the ladder. */
  options(grain){
   const i = zoom.GRAINS.indexOf(grain);
   return i < 0 ? [] : zoom.GRAINS.slice(i + 1).map(to => ({grain: to, partial: to === 'week'}));
  },
  /* Click a period at `grain` and drill to a finer grain: keep the period as the filter. Partial: a week
     at the edge of the period starts before it or ends after it; its value counts only the rows inside. */
  apply(value, grain, to){
   if(!dateDrill.options(grain).some(o => o.grain === to)) fail('Cannot drill from ' + grain + ' to ' + to + '.');
   const bounds = CL.periodBounds(value, grain);
   return {grain: to, period: bounds, condition: {operator: 'matches', values: [bounds.start + ' until ' + bounds.end]},
    aql: field => CL.periodCondition(field, bounds), partial: to === 'week'};
  },
 };

 /* ============================================================ right-click menu */
 /* What a right-click on a data point offers. Both rows are always listed; a row that is not allowed is
    disabled with the reason, never hidden.
      Drill down  needs a measure that adds up, and a field left to drill into.
      Date drill  needs the chart drawn by a date at a grain that has a finer one. */
 function contextMenu({xType, grain, definition, state}){
  const fields = state ? drill.choices(definition, state) : CL.breakdownChoices(definition);
  const drillDown = fields.length ? {id: 'drill', label: 'Drill down', enabled: true, fields}
   : {id: 'drill', label: 'Drill down', enabled: false, fields: [],
    reason: CL.isAdditive(definition) ? 'No field left to drill into.' : 'This measure cannot be split without double counting.'};
  let date;
  if(!isDate(xType)) date = {id: 'date', label: 'Date drill', enabled: false, options: [], reason: 'The chart is not drawn by a date.'};
  else if(!grain || grain === 'none') date = {id: 'date', label: 'Date drill', enabled: false, options: [], reason: 'Choose a date grain first.'};
  else {
   const options = dateDrill.options(grain);
   date = options.length ? {id: 'date', label: 'Date drill', enabled: true, options}
    : {id: 'date', label: 'Date drill', enabled: false, options: [], reason: 'Already at the finest grain.'};
  }
  return [drillDown, date];
 }

 const api = {brush, histogram, zoom, drill, dateDrill, contextMenu};
 if(typeof module !== 'undefined') module.exports = api; else root.NetherInteractions = api;
})();
