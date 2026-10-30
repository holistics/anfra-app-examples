/* Filter backend: a tree of conditions in, AQL conditions out.

   Pure. No Anfra calls (AD-2: port.js is the only caller), no DOM. The tree is
   what a filter panel edits; this module decides, deterministically, what
   each operator means in AQL. The rules live in docs/knowledge/logic/filters.md.

   A node is either a leaf  {field, operator, values?, modifier?, includeCurrent?}
   or a group               {combinator:'and'|'or', negated?, children:[…]}.

   compile(tree, catalog) -> {filters, having, skipped, leaves, top}
     filters  AQL conditions on dimensions, ANDed together by `explore.filters`
     having   AQL conditions on metrics, ANDed together by `explore.having`
     skipped  [{path, reason}] leaves left out because they were incomplete
     top      the top N / bottom N filter if there is one, also the last of `filters`

   A reader's choice goes into the AQL text here, so a change of tree is a new
   query (port.js declares one query per distinct AQL). Flat conditions that
   need no nesting should stay on the SDK's native controls instead. */
(() => {
 'use strict';
 const root = typeof window === 'undefined' ? globalThis : window;
 const MAX_DEPTH = 6, MAX_LEAVES = 50;
 const fieldRef = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
 const numberText = /^-?\d+(\.\d+)?$/;
 const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;
 const isoDateTime = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(:(\d{2}))?$/;
 const phrase = /^[A-Za-z0-9 :.\-]{1,80}$/;
 const UNITS = ['year','quarter','month','week','day','hour','minute'];
 const SHORT_UNITS = new Set(['hour','minute']);

 const TEXT = [['is','is'],['is_not','is not'],['contains','contains'],['does_not_contain','does not contain'],
  ['starts_with','starts with'],['ends_with','ends with'],['is_null','is null'],['not_null','is not null']];
 const NUMBER = [['equal','equal'],['not_equal','not equal'],['less_than','less than'],['greater_than','greater than'],
  ['between','between'],['top_n','top N'],['bottom_n','bottom N'],['is_null','is null'],['not_null','is not null']];
 const BOOLEAN = [['is','is'],['is_not','is not'],['is_null','is null'],['not_null','is not null']];
 const DATE = [['is_on','is on'],['between','between'],['before','before'],['after','after'],['last','last'],
  ['next','next'],['matches','matches'],['is_null','is null'],['not_null','is not null']];
 const BY_TYPE = {text:TEXT, number:NUMBER, truefalse:BOOLEAN, date:DATE, datetime:DATE};
 const TOP = new Set(['top_n','bottom_n']), AGGREGATIONS = new Set(['sum','avg','min','max','count']), MAX_N = 1000;
 const ARITY = {top_n:1, bottom_n:1, is_null:0, not_null:0, between:2, equal:1, not_equal:1, less_than:1, greater_than:1,
  is_on:1, before:1, after:1, last:1, next:1, matches:1, contains:1, does_not_contain:1, starts_with:1, ends_with:1};

 const fail = (message, path) => { throw new Error((path ? path + ': ' : '') + message); };
 const list = value => value == null ? [] : Array.isArray(value) ? value : [value];

 /* The operators a field offers, in the order the panel lists them. */
 function operatorsFor(type){
  return (BY_TYPE[type] || fail('No filter exists for a field of type ' + type + '.'))
   .map(([id,label]) => ({id, label, arity: ARITY[id] ?? 1}));
 }

 function text(value, path){
  if(/[\r\n\u0000]/.test(value)) fail('A text value cannot contain a line break.', path);
  return "'" + value.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + "'";
 }
 // `%` and `_` are wildcards in LIKE and DuckDB has no default escape, so a
 // value holding one cannot be matched literally. Refuse it rather than match wrongly.
 function pattern(value, before, after, path){
  if(/[%_]/.test(value)) fail('Contains, starts with and ends with cannot match a value holding % or _.', path);
  return text(before + value + after, path);
 }
 function number(value, path){
  const raw = typeof value === 'number' ? fail('Pass a number as text to keep its digits.', path) : String(value).trim();
  if(!numberText.test(raw) || raw.length > 30) fail('"' + raw + '" is not a number.', path);
  return raw;
 }

 /* Calendar helpers use UTC and setUTCFullYear, because Date.UTC maps the
    years 0-99 to 1900-1999 and this world's dates are all in the first millennium. */
 function utcDate(y, m, d, h = 0, mi = 0, s = 0){
  const date = new Date(Date.UTC(2000, m - 1, d, h, mi, s));
  date.setUTCFullYear(y);
  return date;
 }
 function day(value, path, withTime){
  const raw = String(value).trim();
  let m = isoDate.exec(raw);
  if(!m && withTime) m = isoDateTime.exec(raw);
  if(!m) fail('"' + raw + '" is not a date' + (withTime ? ' or datetime' : '') + ' written YYYY-MM-DD.', path);
  const [y, mo, d, h = 0, mi = 0, s = 0] = [m[1], m[2], m[3], m[4], m[5], m[7]].map(v => Number(v || 0));
  const date = utcDate(y, mo, d, h, mi, s);
  if(date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
   fail('"' + raw + '" is not a real calendar date.', path);
  return date;
 }
 const iso = date => String(date.getUTCFullYear()).padStart(4,'0') + '-' + String(date.getUTCMonth()+1).padStart(2,'0') +
  '-' + String(date.getUTCDate()).padStart(2,'0');
 const castDay = date => "cast('" + iso(date) + "', 'date')";
 function nextDay(date){ const n = new Date(date.getTime()); n.setUTCDate(n.getUTCDate()+1); return n; }

 function count(value, path){
  const raw = String(value).trim();
  if(!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 10000) fail('Enter a whole number from 1 to 10000.', path);
  return Number(raw);
 }

 /* One leaf -> one AQL condition, or null when the leaf is not complete yet. */
 function leaf(node, meta, path){
  const type = meta.type, operator = node.operator || 'is', ref = node.field;
  if(operator==='date_never'&&node.dateBoundary)return 'and('+ref+' is null, '+ref+' is not null)';
  // Internal, resolved date boundaries: exact days/minutes, with an exclusive upper edge.
  if(operator==='date_range'&&node.dateBoundary){
   if(type!=='date'&&type!=='datetime')fail('A date range needs a date field.',path);
   const [from,to]=node.values||[],cast=value=>{const raw=String(value),date=day(raw,path,true);if(!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(raw))fail('Use an exact ISO date boundary.',path);if(raw.length>10)return "cast('"+iso(date)+' '+raw.slice(11)+":00', 'datetime')";return castDay(date);};
   const parts=[];if(from)parts.push(ref+' >= '+cast(from));if(to)parts.push(ref+' < '+cast(to));return parts.length===2?'and('+parts.join(', ')+')':parts[0]||null;
  }
  const offered = operatorsFor(type).map(o => o.id);
  if(!offered.includes(operator)) fail('"' + operator + '" does not apply to a ' + type + ' field.', path);
  const values = list(node.values).filter(v => v !== '' && v != null);
  if(TOP.has(operator)) fail('Top N and bottom N rank the whole result: put them directly in the first group, joined by "and".', path);
  const need = ARITY[operator] ?? 1;
  if(need === 0) return ref + (operator === 'is_null' ? ' is null' : ' is not null');
  if(operator === 'is' || operator === 'is_not'){ if(!values.length) return null; }
  else if(values.length < need) return null;
  else if(values.length > need) fail('"' + operator + '" takes ' + need + ' value' + (need > 1 ? 's' : '') + '.', path);
  const negative = operator === 'is_not';
  if(type === 'text'){
   const one = values.length === 1, strings = values.map(v => text(String(v), path));
   switch(operator){
    case 'is': return one ? ref + ' == ' + strings[0] : ref + ' in [' + strings.join(', ') + ']';
    case 'is_not': return one ? ref + ' != ' + strings[0] : ref + ' not in [' + strings.join(', ') + ']';
    case 'contains': return ref + ' ilike ' + pattern(String(values[0]), '%', '%', path);
    case 'does_not_contain': return ref + ' not ilike ' + pattern(String(values[0]), '%', '%', path);
    case 'starts_with': return ref + ' ilike ' + pattern(String(values[0]), '', '%', path);
    case 'ends_with': return ref + ' ilike ' + pattern(String(values[0]), '%', '', path);
   }
  }
  if(type === 'number'){
   const n = values.map(v => number(v, path));
   switch(operator){
    case 'equal': return ref + ' == ' + n[0];
    case 'not_equal': return ref + ' != ' + n[0];
    case 'less_than': return ref + ' < ' + n[0];
    case 'greater_than': return ref + ' > ' + n[0];
    case 'between':
     if(Number(n[0]) > Number(n[1])) fail('Between needs the lower number first.', path);
     return 'and(' + ref + ' >= ' + n[0] + ', ' + ref + ' <= ' + n[1] + ')';
   }
  }
  if(type === 'truefalse'){
   const flags = values.map(v => v === true || v === 'true' || v === '1' ? true : v === false || v === 'false' || v === '0' ? false
    : fail('Choose true or false.', path));
   if(new Set(flags).size > 1) fail('Choose one of true or false.', path);
   return ref + (negative ? ' is not ' : ' is ') + flags[0];
  }
  // date and datetime
  const withTime = type === 'datetime', current = Boolean(node.includeCurrent);
  switch(operator){
   /* Day precision is written as a comparison against cast('YYYY-MM-DD', 'date'), half open (this day up to the
      next). A time literal, @(0477-04-13), is NOT used for a day: for this world's years AQL reads it as the whole
      month 0477-04, so "is on 13 April" kept all of April. Only whole months, quarters and years are safe in @(). */
   case 'is_on': { const d = day(values[0], path); return 'and(' + ref + ' >= ' + castDay(d) + ', ' + ref + ' < ' + castDay(nextDay(d)) + ')'; }
   case 'between': {
    const a = day(values[0], path), b = day(values[1], path);
    if(a > b) fail('Between needs the earlier date first.', path);
    return 'and(' + ref + ' >= ' + castDay(a) + ', ' + ref + ' < ' + castDay(nextDay(b)) + ')';
   }
   case 'before': return ref + ' < ' + castDay(day(values[0], path));
   // Later than the whole day given: from the start of the next day. Right for a datetime too.
   case 'after': return ref + ' >= ' + castDay(nextDay(day(values[0], path)));
   case 'last': case 'next': {
    const unit = String(node.modifier || '');
    if(!UNITS.includes(unit)) fail('Choose a unit: ' + UNITS.join(', ') + '.', path);
    const n = count(values[0], path), span = operator + ' ' + n + ' ' + unit + 's';
    const edge = SHORT_UNITS.has(unit) ? 'now' : 'today';
    if(!current) return ref + ' matches @(' + span + ')';
    return ref + ' matches @(' + (operator === 'last' ? span + ' - ' + edge : edge + ' - ' + span) + ')';
   }
   case 'matches': {
    const expression = String(values[0]).trim();
    if(!phrase.test(expression)) fail('A date phrase uses letters, digits, spaces, : . and - only.', path);
    return ref + ' matches @(' + expression + ')';
   }
  }
  return fail('Unsupported operator: ' + operator, path);
 }

 const isGroup = node => node && Array.isArray(node.children);

 /* Compile one node into {kind, aql}; kind is 'dimension' or 'metric'. A group
    cannot mix both, because AQL accepts dimension and metric conditions only in
    separate blocks. The one exception is an un-negated AND at the root: its
    children are split between the two blocks, which is the same meaning. */
 function walk(node, catalog, state, depth, path){
  if(depth > MAX_DEPTH) fail('Groups are nested too deep (at most ' + MAX_DEPTH + ').', path);
  if(isGroup(node)){
   const combinator = node.combinator === 'or' ? 'or' : node.combinator === 'and' || node.combinator == null ? 'and'
    : fail('A group combines with "and" or "or".', path);
   const parts = [];
   node.children.forEach((child, i) => {
    const part = walk(child, catalog, state, depth + 1, path + '.' + i);
    if(part) parts.push(part);
   });
   if(!parts.length) return null;
   const kinds = new Set(parts.map(p => p.kind));
   if(kinds.size > 1){
    if(depth === 0 && combinator === 'and' && !node.negated) return {kind:'split', parts};
    fail('A group cannot mix conditions on fields and on metrics.', path);
   }
   const kind = parts[0].kind;
   let aql = parts.length === 1 ? parts[0].aql : combinator + '(' + parts.map(p => p.aql).join(', ') + ')';
   if(node.negated) aql = 'not(' + aql + ')';
   return {kind, aql};
  }
  if(!node || typeof node.field !== 'string' || !fieldRef.test(node.field)) fail('Choose a field.', path);
  const meta = catalog.get(node.field);
  if(!meta) fail('Unknown field in this Book: ' + node.field, path);
  if(++state.leaves > MAX_LEAVES) fail('Too many conditions (at most ' + MAX_LEAVES + ').', path);
  const aql = leaf(node, meta, path);
  if(aql === null){ state.skipped.push({path, reason:'No value yet for ' + node.field + '.'}); return null; }
  return {kind: meta.kind === 'metric' ? 'metric' : 'dimension', aql};
 }

 /* catalog: Map field -> {type, kind:'dimension'|'metric'}. Build it from a
    descriptor with catalogFrom(), or by hand in a test. */
 function compile(tree, catalog){
  const dates=root.NetherDateFilter||(typeof module!=='undefined'?require('./date-filter-logic.js'):null);
  if(dates&&tree)tree=dates.materialize(tree,{now:dates.current()});
  const map = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
  const out = {filters:[], having:[], skipped:[], leaves:0, top:null};
  if(!tree) return out;
  // Top N and bottom N run after every other filter, so they are lifted out of the
  // tree first and added last. They may only sit at the top of the first AND group.
  let tops = [], rest = tree;
  if(!isGroup(tree) && TOP.has(tree.operator)){ tops = [tree]; rest = null; }
  else if(isGroup(tree) && tree.combinator !== 'or' && !tree.negated){
   tops = tree.children.filter(c => !isGroup(c) && TOP.has(c.operator));
   rest = {...tree, children: tree.children.filter(c => !tops.includes(c))};
  }
  const state = {leaves:0, skipped:out.skipped};
  const part = rest ? walk(rest, map, state, 0, 'root') : null;
  out.leaves = state.leaves;
  if(part) for(const p of part.kind === 'split' ? part.parts : [part])
   (p.kind === 'metric' ? out.having : out.filters).push(p.aql);
  if(tops.length > 1) fail('Only one top N or bottom N filter can apply at a time.', 'root');
  if(tops.length){
   if(out.having.length) fail('Top N cannot be combined with a condition on a metric.', 'root');
   const condition = out.filters.length > 1 ? 'and(' + out.filters.join(', ') + ')' : out.filters[0] || null;
   out.top = topFilter(tops[0], map, condition, 'root');
   if(out.top) out.filters.push(out.top.aql);
   out.leaves++;
  }
  return out;
 }

 /* One top N / bottom N leaf: {field, operator, values:[N], items, aggregation?}.
    `field` is what ranks (a number field or a metric), `items` is the dimension
    whose values are kept. The ranking carries the same conditions as the rest of the
    filter. AQL's top() ignores the explore's other filters, so without this the
    top 2 under "outcome = recovered" would be the top 2 of everything. Dense
    ranking: tied items share a rank and the result can hold more than N items. */
 function topFilter(node, catalog, condition, path){
  const rankField=node.by||node.field,itemField=node.by?node.field:node.items;
  const meta = catalog.get(rankField), items = catalog.get(itemField);
  if(!meta || meta.type !== 'number') fail('Rank by a number field or a metric.', path);
  if(typeof itemField !== 'string' || !fieldRef.test(itemField) || !items) fail('Choose the field to keep the top items of.', path);
  if(items.kind === 'metric') fail('Top N keeps the values of a field, not of a metric.', path);
  const values = list(node.values).filter(v => v !== '' && v != null);
  if(!values.length) return null;
  const n = Number(String(values[0]).trim());
  if(!/^\d+$/.test(String(values[0]).trim()) || n < 1 || n > MAX_N) fail('N is a whole number from 1 to ' + MAX_N + '.', path);
  let by = rankField;
  if(meta.kind !== 'metric'){
   const aggregation = node.aggregation || 'sum';
   if(!AGGREGATIONS.has(aggregation)) fail('Rank by sum, avg, min, max or count.', path);
   if(!rankField.includes('.')) fail('Rank by a model field.', path);
   by = rankField.split('.')[0] + ' | ' + aggregation + '(' + rankField + ')';
  }
  const direction = node.operator === 'bottom_n' ? 'bottom' : 'top';
  const ranking = condition ? by + ' | where(' + condition + ')' : by;
  const logic=({standard:'skip',dense:'dense'})[node.logic||'dense'];if(!logic)fail('Choose standard or dense ranking.',path);
  const call = direction + '(' + n + ', ' + itemField + ', by: ' + ranking + ", logic: '"+logic+"')";
  return {aql: itemField + ' in ' + call, call, item: itemField, n, direction, by, where: condition};
 }

 /* {field: {type, kind}} from an Anfra descriptor (NetherPort.describe). */
 function catalogFrom(descriptor){
  const map = new Map();
  for(const model of descriptor?.data_models || descriptor?.models || [])
   for(const f of model.fields || [])
    map.set(model.name + '.' + f.name, {type:f.type || 'text', kind:f.is_custom_measure || f.role === 'measure' ? 'metric' : 'dimension'});
  for(const m of descriptor?.metrics || []) map.set(m.name, {type:m.type || 'number', kind:'metric'});
  return map;
 }

 /* Put compiled conditions into an explore. The explore must not have a
    filters or having block of its own; static conditions belong in the query
    that calls this, as one tree. */
 function withConditions(aql, compiled){
  const end = aql.lastIndexOf('}');
  if(end < 0 || !/^\s*explore\b/m.test(aql)) fail('Expected an explore { } query.');
  const block = (name, items) => items.length ? '  ' + name + ' {\n' + items.map(c => '    ' + c + ',').join('\n') + '\n  }\n' : '';
  if(/^\s*filters\s*\{/m.test(aql) && compiled.filters.length) fail('This explore already has a filters block.');
  if(/^\s*having\s*\{/m.test(aql) && compiled.having.length) fail('This explore already has a having block.');
  return aql.slice(0, end).replace(/\s*$/, '\n') + block('filters', compiled.filters) + block('having', compiled.having) + aql.slice(end);
 }

 const api = {operatorsFor, compile, MAX_N, catalogFrom, withConditions, MAX_DEPTH, MAX_LEAVES, UNITS};
 if(typeof module !== 'undefined') module.exports = api; else root.NetherFilterAql = api;
})();
