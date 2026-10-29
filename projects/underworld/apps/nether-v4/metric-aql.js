/* Query-local metric calculations. Pure: no data, DOM, SDK, or client-side
   arithmetic over results. See docs/knowledge/logic/metric-builder.md. */
(() => {
 'use strict';
 const root = typeof window === 'undefined' ? globalThis : window;
 const F = typeof module !== 'undefined' ? require('./filter-aql.js') : root.NetherFilterAql;
 const fail = message => { throw new Error(message); };
 const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
 const REF = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
 const AGGREGATIONS = ['count','count_distinct','sum','avg','min','max','median','stdev','stdevp','var','varp','percentile_cont','percentile_disc'];
 const NUMERIC = new Set(['sum','avg','median','stdev','stdevp','var','varp','percentile_cont','percentile_disc']);
 const FORMATS = ['default','integer','decimal','percent'];
 const UNITS = ['year','quarter','month','week','day'];
 const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
 const asMap = value => value instanceof Map ? new Map(value) : new Map(Object.entries(value || {}));
 const measure = field => ['measure','metric'].includes(field.kind) || field.isMeasure;
 const numeric = field => field.type === 'number';
 const conjunction = values => values.length > 1 ? 'and(' + values.join(', ') + ')' : values[0];

 function capabilities(field){
  if(!field) return {basic:[],window:[],comparative:[]};
  const basic = AGGREGATIONS.filter(a => !NUMERIC.has(a) || numeric(field));
  const window = ['rank'];
  if(numeric(field)) window.push('running_total');
  if(numeric(field) && measure(field)) window.push('moving');
  return {basic,window,comparative:numeric(field) ? ['percent_total','period'] : []};
 }

 function compile(spec, context = {}){
  if(!spec || !NAME.test(spec.name || '')) fail('Give the metric a name containing letters, digits and underscores.');
  const catalog = asMap(context.catalog), dependencies = new Set();
  const dimensions = list(context.dimensions).map(d => typeof d === 'string' ? {field:d} : d);
  const dimensionMap = new Map(dimensions.map(d => [d.field,d]));
  function field(value){
   if(!REF.test(value || '') || !catalog.has(value)) fail('Choose a field in this Book: ' + value);
   dependencies.add(value);
   return {...catalog.get(value),field:value};
  }
  const dim = value => { const f = field(value); if(measure(f)) fail('Choose a dimension: ' + value); return f; };
  function selected(value){
   dim(value);
   if(!dimensionMap.has(value)) fail('Add this dimension to the chart first: ' + value);
   return value;
  }
  function dimensionExpression(value){
   selected(value);
   const item = dimensionMap.get(value), type = catalog.get(value).type;
   // Only the selected drill may transform a dimension; never accept raw AQL.
   const grain = item.grain || context.grain;
   return (type === 'date' || type === 'datetime') && UNITS.includes(grain) ? value + ' | ' + grain + '()' : value;
  }
  function metricValue(value, defaultAggregation = 'sum'){
   const f = field(value);
   if(measure(f)) return value;
   if(!numeric(f) && defaultAggregation === 'sum') fail('This calculation needs a numeric field or metric.');
   return f.field.split('.')[0] + ' | ' + defaultAggregation + '(' + value + ')';
  }
  function partitions(values){
   const items = list(values).map(value => 'partition: ' + dimensionExpression(value));
   return items.length ? items.join(', ') : 'partition: []';
  }
  function orders(values, {ranking = false} = {}){
   const input = list(values).length ? list(values) : dimensions.map(d => ({field:d.field,direction:'asc'}));
   if(!input.length) fail('Add an ordering dimension to the chart first.');
   return input.map(item => {
    if(typeof item === 'string') item = {field:item};
    const f = field(item.field), direction = item.direction || 'asc';
    if(!['asc','desc'].includes(direction)) fail('Choose ascending or descending order.');
    const expression = measure(f) ? f.field : ranking
     ? f.field.split('.')[0] + ' | max(' + f.field + ')' : dimensionExpression(f.field);
    return 'order: (' + expression + ') | ' + direction + '()';
   }).join(', ');
  }
  function rowOrders(){
   const direction = spec.rowDirection || 'asc';
   if(!['asc','desc'].includes(direction)) fail('Choose forward or reverse row order.');
   const rows = list(context.rowOrder || context.sort).length ? list(context.rowOrder || context.sort) : dimensions.map(d => ({field:d.field,direction:'asc'}));
   if(!rows.length) fail('Add an ordering dimension to the chart first.');
   return rows.map(item => {
    if(item.field === spec.name) fail('A calculation cannot use its own result to order its window. Choose another chart sort.');
    const f = field(item.field), original = item.direction || 'asc';
    if(!['asc','desc'].includes(original)) fail('Choose ascending or descending row order.');
    const orderDirection = direction === 'desc' ? original === 'asc' ? 'desc' : 'asc' : original;
    let expression;
    if(measure(f)) expression = f.field;
    else if(dimensionMap.has(f.field)) expression = dimensionExpression(f.field);
    else if(item.aggregation === 'min') expression = f.field.split('.')[0] + ' | min(' + f.field + ')';
    else fail('Choose a chart dimension or metric to order the rows.');
    return 'order: (' + expression + ') | ' + orderDirection + '()';
   }).join(', ');
  }
  let expression, type = 'number', format = spec.format || 'default';
  if(!FORMATS.includes(format)) fail('Choose a supported number format.');
  const kind = spec.kind || 'aggregate';
  if(kind === 'alias'){
   const input = field(spec.field);
   if(!measure(input)) fail('A metric copy must start from an existing metric.');
   expression = input.field;type = input.type;format = spec.format || input.format || 'default';
  }else if(kind === 'aggregate'){
   const input = field(spec.field), aggregation = spec.aggregation || 'count';
   if(!capabilities(input).basic.includes(aggregation)) fail('This aggregation does not apply to this field type.');
   let args = '';
   if(aggregation.startsWith('percentile_')){
    const p = String(spec.percentile ?? '0.5');
    if(!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(p)) fail('Percentile must be between 0 and 1.');
    args = ', ' + p;
   }
   if(measure(input)){
    if(!dimensions.length) fail('Add chart dimensions before re-aggregating a metric.');
    expression = 'unique(' + dimensions.map(d => dimensionExpression(d.field)).join(', ') + ') | select(value: ' + input.field + ') | ' + aggregation + '(value' + args + ')';
   }else expression = input.field.split('.')[0] + ' | ' + aggregation + '(' + input.field + args + ')';
   if(['min','max'].includes(aggregation)) type = input.type;
  }else if(kind === 'rank'){
   const mode = spec.mode || 'rank';
   if(!['rank','dense_rank','row_number'].includes(mode)) fail('Choose rank, dense rank or row number.');
   const order = list(spec.order).length ? list(spec.order) : [{field:spec.field,direction:'desc'}];
   let keys = orders(order,{ranking:true});
   // AQL has no row_number. Rank with every grouping dimension as a unique
   // final tie-break is equivalent, including tied measure values.
   if(mode === 'row_number'){
    if(!dimensions.length) fail('Row number needs chart dimensions to identify each row.');
    keys += ', ' + orders(dimensions.map(d => ({field:d.field,direction:'asc'})),{ranking:true});
   }
   expression = (mode === 'dense_rank' ? 'dense_rank' : 'rank') + '(' + keys + ', ' + partitions(spec.partition) + ')';
  }else if(kind === 'running_total' || kind === 'moving'){
   const input = field(spec.field);
   if(!numeric(input)) fail('This calculation needs a numeric field or metric.');
   if(kind === 'moving' && !measure(input)) fail('A moving calculation needs a numeric metric. Create an aggregation first.');
   const value = metricValue(spec.field), order = spec.orderRows ? rowOrders() : orders(spec.order);
   const partition = partitions(spec.partition), args = order + ', ' + partition;
   if(kind === 'running_total') expression = 'window_sum((' + value + '), ..0, ' + args + ')';
   else{
    const calculation = spec.calculation || 'avg';
    if(!['avg','sum','min','max','count'].includes(calculation)) fail('Choose a supported moving calculation.');
    const previous = String(spec.previous ?? 2), next = String(spec.next ?? 0);
    if(!/^\d{1,4}$/.test(previous) || !/^\d{1,4}$/.test(next)) fail('Previous and next must be whole numbers from 0 to 9999.');
    const frame = '-' + Number(previous) + '..' + Number(next);
    expression = 'window_' + calculation + '((' + value + '), ' + frame + ', ' + args + ')';
    if(spec.nullIncomplete){
     const size = Number(previous) + Number(next) + 1;
     const count = 'window_count(coalesce((' + value + '), 0), ' + frame + ', ' + args + ')';
     expression = 'case(when: ' + count + ' < ' + size + ', then: null, else: ' + expression + ')';
    }
   }
  }else if(kind === 'percent_total'){
   const value = metricValue(spec.field);
   const across = spec.total === 'custom' ? list(spec.across).map(selected) : dimensions.map(d => d.field);
   if(spec.total && !['grand','custom'].includes(spec.total)) fail('Choose grand total or a custom total.');
   // keep_filters preserves the selected population, including native filters.
   // Restating compound report conditions avoids exclude_grains dropping them.
   const report = list(context.filters), filtered = '(' + value + ')' + (report.length ? ' | where(' + conjunction(report) + ')' : '');
   const total = across.length ? filtered + ' | exclude_grains(' + across.map(dimensionExpression).join(', ') + ', keep_filters: true)' : filtered;
   expression = 'safe_divide((' + value + '), (' + total + '))';
   format = spec.format || 'percent';
  }else if(kind === 'period'){
   const value = metricValue(spec.field), date = dim(spec.dateField);
   if(!['date','datetime'].includes(date.type)) fail('Choose a date dimension for the comparison.');
   if(dimensionMap.has(date.field) && !UNITS.includes(dimensionMap.get(date.field).grain || context.grain)) fail('Choose a date drill for the comparison.');
   const unit = spec.unit || 'year', offset = String(spec.offset ?? -1);
   if(!UNITS.includes(unit)) fail('Choose a day, week, month, quarter or year.');
   if(!/^-?\d{1,4}$/.test(offset) || Number(offset) === 0) fail('Comparison interval must be a nonzero whole number.');
   const shifted = '(' + value + ') | relative_period(' + date.field + ', interval(' + Number(offset) + ' ' + unit + '))';
   const display = spec.display || 'value';
   if(!['value','delta','percent'].includes(display)) fail('Choose period value, change or percentage change.');
   expression = display === 'value' ? shifted : display === 'delta' ? '(' + value + ') - (' + shifted + ')' : 'safe_divide((' + value + ') - (' + shifted + '), (' + shifted + '))';
   if(display === 'percent') format = spec.format || 'percent';
  }else fail('Choose a supported metric calculation.');

  if(spec.filters){
   if(!F) fail('The filter compiler is unavailable.');
   const filterCatalog = new Map([...catalog].map(([name,meta]) => [name,{...meta,kind:measure(meta) ? 'metric' : 'dimension'}]));
   const result = F.compile(spec.filters,filterCatalog);
   if(result.having.length || result.top) fail('Metric conditions must filter model fields, not aggregated metrics.');
   if(result.skipped.length) fail('Complete every metric condition before applying.');
   if(result.filters.length) expression = '(' + expression + ') | where(' + conjunction(result.filters) + ')';
  }
  if(spec.grouping){
   const mode = spec.grouping.mode;
   if(!['keep','exclude'].includes(mode)) fail('Choose which chart dimensions the metric groups by.');
   const selectedFields = list(spec.grouping.fields).map(selected);
   if(list(context.filters).length) expression = '(' + expression + ') | where(' + conjunction(list(context.filters)) + ')';
   if(mode === 'keep' || selectedFields.length) expression = '(' + expression + ') | ' + (mode === 'keep' ? 'keep_grains' : 'exclude_grains') + '(' + selectedFields.map(dimensionExpression).join(', ') + (selectedFields.length ? ', ' : '') + 'keep_filters: true)';
  }
  return {name:spec.name,field:spec.name,label:spec.label || spec.name,description:spec.description || '',expression,
   definitions:'metric ' + spec.name + ' = ' + expression + ';\n',type,format,kind:'measure',dependencies:[...dependencies]};
 }

 function compileAll(specs, context = {}){
  const catalog = asMap(context.catalog), inputs = list(specs), pending = new Map(), measures = [], active = new Set();
  for(const spec of inputs){
   if(!spec || !NAME.test(spec.name || '')) fail('Give every metric a valid name.');
   if(catalog.has(spec.name) || pending.has(spec.name)) fail('This field name already exists: ' + spec.name);
   pending.set(spec.name,spec);
  }
  function visit(name){
   if(catalog.has(name)) return;
   const spec = pending.get(name);
   if(!spec) return;
   if(active.has(name)) fail('Metrics cannot depend on themselves: ' + name);
   active.add(name);
   const refs = [spec.field,...list(spec.order).map(o => typeof o === 'string' ? o : o.field)];
   if(spec.orderRows) refs.push(...list(context.rowOrder || context.sort).map(o => o.field));
   for(const value of refs) if(pending.has(value)) visit(value);
   const built = compile(spec,{...context,catalog});
   catalog.set(name,built);measures.push(built);active.delete(name);pending.delete(name);
  }
  for(const name of [...pending.keys()]) visit(name);
  return {definitions:measures.map(m => m.definitions).join(''),measures,catalog};
 }

 // Reference statistics describe grouped chart values, not raw source rows.
 // Native window_median does not exist; median uses a nested aggregation with
 // the chart's complete grain, then removes outer grouping.
 function referenceStats(requests, context = {}){
  const catalog = asMap(context.catalog), dimensions = list(context.dimensions).map(d => typeof d === 'string' ? {field:d} : d);
  return list(requests).map((request,index) => {
   if(!catalog.has(request.field) || !measure(catalog.get(request.field)) || !numeric(catalog.get(request.field))) fail('Reference statistics need a numeric metric.');
   const aggregation = request.aggregation || 'avg';
   if(!['avg','sum','median','min','max'].includes(aggregation)) fail('Choose a supported reference statistic.');
   const name = request.name || 'reference_' + index;
   if(!NAME.test(name)) fail('Give the reference line a valid name.');
   const grains = dimensions.map(d => {
    if(!catalog.has(d.field) || measure(catalog.get(d.field))) fail('Reference lines need chart dimensions.');
    const grain = d.grain || context.grain, type = catalog.get(d.field).type;
    return ['date','datetime'].includes(type) && UNITS.includes(grain) ? d.field + ' | ' + grain + '()' : d.field;
   });
   const report = list(context.filters), having = list(context.having), value = request.field + (report.length ? ' | where(' + conjunction(report) + ')' : '');
   const expression = aggregation === 'median' && grains.length
    ? '(unique(' + grains.join(', ') + ')' + (having.length ? ' | filter(' + conjunction(having) + ')' : '') + ' | select(value: ' + value + ') | median(value)) | keep_grains(keep_filters: true)'
    : aggregation === 'median' ? request.field : 'window_' + aggregation + '(' + request.field + ', partition: [])';
   return {name,field:name,source:request.field,aggregation,expression,type:'number',kind:'measure',auxiliary:true,
    label:request.label || aggregation + ' of ' + (catalog.get(request.field).label || request.field),definitions:'metric ' + name + ' = ' + expression + ';\n'};
  });
 }
 const api = {AGGREGATIONS,FORMATS,UNITS,capabilities,compile,compileAll,referenceStats};
 if(typeof module !== 'undefined') module.exports = api; else root.NetherMetricAql = api;
})();
