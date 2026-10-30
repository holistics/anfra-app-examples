/* Chart queries use the same semantic layer as the Writ. This module only
   assembles field references; native controls carry every reader value. */
(() => {
 'use strict';
 const root = typeof window === 'undefined' ? globalThis : window;
 const metricAql = () => root.NetherMetricAql || (typeof module !== 'undefined' ? require('./metric-aql.js') : null);
 const filterAql = () => root.NetherFilterAql || (typeof module !== 'undefined' ? require('./filter-aql.js') : null);
 const identifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
 const grains = new Set(['none','year','quarter','month','week','day']);
 const operators = new Set(['none','is','is_not','is_null','not_null','contains','does_not_contain',
  'starts_with','ends_with','greater_than','less_than','between','before','after','matches','is_true','is_false']);
 const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
 const entry = value => typeof value === 'string' ? {field:value} : value;
 const fail = message => { throw new Error(message); };
 let currentRun = 0;

 function fields(dataset, customMetrics = root.NetherMetricStore?.list(dataset) || []){
  const descriptor = root.NetherPort?.describe(dataset);
  if(!descriptor) fail('This Book is not available: ' + dataset);
  const dimensions = [], measures = [];
  for(const model of descriptor.data_models || descriptor.models || []){
   for(const field of model.fields || []){
    const item = {field:model.name + '.' + field.name, label:field.label || field.name,
     model:model.name, type:field.type || 'text'};
    (field.is_custom_measure || field.role === 'measure' ? measures : dimensions).push(item);
   }
  }
  for(const metric of descriptor.metrics || []) measures.push({field:metric.name,
   label:metric.label || metric.name, type:metric.type || 'number',description:metric.description || ''});
  for(const spec of customMetrics){
   const source = [...dimensions,...measures].find(f => f.field === spec.field);
   measures.push({field:spec.name,label:spec.label || spec.name,description:spec.description || '',
    type:spec.kind === 'alias' || spec.kind === 'aggregate' && ['min','max'].includes(spec.aggregation) ? source?.type || 'number' : 'number',
    format:spec.format || (spec.kind === 'percent_total' || spec.kind === 'period' && spec.display === 'percent' ? 'percent' : 'default'),custom:true,spec});
  }
  return {dimensions,measures};
 }

 function build(config){
  if(!config || typeof config.dataset !== 'string') fail('Choose a Book first.');
  const dataset = config.dataset, customMetrics = config.customMetrics || root.NetherMetricStore?.list(dataset) || [], available = fields(dataset,customMetrics);
  const dimensionMap = new Map(available.dimensions.map(f => [f.field,f]));
  const measureMap = new Map(available.measures.map(f => [f.field,f]));
  const aliases = new Set(), selected = new Map();
  function select(value, kind){
   const input = entry(value);
   if(!input || typeof input.field !== 'string') fail('Choose a field for each chart slot.');
   const map = kind === 'dimension' ? dimensionMap : measureMap;
   const metadata = map.get(input.field);
   if(!metadata) fail('Unknown ' + kind + ' in this Book: ' + input.field);
   if(kind === 'dimension' && selected.has(input.field)) return selected.get(input.field);
   const isDate = metadata.type === 'date' || metadata.type === 'datetime';
   let alias = input.alias || (isDate ? 'period' : input.field.split('.').pop());
   if(!input.alias && aliases.has(alias)){
    if(isDate){ let index = 2; while(aliases.has('period_' + index)) index++; alias = 'period_' + index; }
    else alias = input.field.replace(/\./g,'_');
   }
   if(!identifier.test(alias)) fail('Column names must contain only letters, digits and underscores.');
   if(aliases.has(alias)) fail('Each column needs a different name: ' + alias);
   aliases.add(alias);
   const result = {...metadata,alias,kind};
   if(kind === 'dimension') selected.set(input.field,result);
   return result;
  }
  const dimensions = [...new Set(list(config.dimensions).map(f => select(f,'dimension')))];
  const pivotRequested = list(config.pivotRows).length > 0 || list(config.pivotColumns).length > 0;
  const pivotRows = list(config.pivotRows).map(f => select(f,'dimension'));
  const pivotColumns = list(config.pivotColumns).map(f => select(f,'dimension'));
  if(pivotRows.some(r => pivotColumns.some(c => c.field === r.field)))
   fail('A pivot field can be on rows or columns, but cannot be on both.');
  for(const d of [...pivotRows,...pivotColumns]) if(!dimensions.some(f => f.field === d.field)) dimensions.push(d);
  if(pivotRequested) for(const d of dimensions)
   if(!pivotRows.includes(d) && !pivotColumns.includes(d)) pivotRows.push(d);
  const measures = list(config.measures).map(f => select(f,'measure'));
  if(!dimensions.length && !measures.length) fail('Add a dimension or measure to examine.');
  if(pivotRequested && !measures.length) fail('Add a measure for the pivot cells.');

  const filters = list(config.filters).map(input => {
   if(!input || !dimensionMap.has(input.field) && !measureMap.has(input.field))
    fail('Unknown filter field in this Book: ' + input?.field);
   const operator = input.operator || 'is';
   if(!operators.has(operator)) fail('Unsupported filter condition: ' + operator);
   const metadata = dimensionMap.get(input.field) || measureMap.get(input.field);
   const values = list(input.values).map(value => {
    if(metadata.type !== 'number') return value;
    if(typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
     fail('Enter this number as text to preserve its digits.');
    return String(value);
   });
   return {field:input.field,operator,values,...(input.group != null ? {group:input.group} : {})};
  });
  const grain = config.grain || 'none';
  if(!grains.has(grain)) fail('Choose a supported date grain.');
  const catalog = new Map([...available.dimensions.map(f => [f.field,{...f,kind:'dimension'}]),
   ...available.measures.filter(f => !f.custom).map(f => [f.field,{...f,kind:'measure'}])]);
  const rowOrder = list(config.sort).map(item => {
   const visible = [...dimensions,...measures].find(f => f.alias === item.field);
   if(!visible) fail('Sort by a selected column name: ' + item.field);
   return {field:visible.field,direction:item.direction || 'asc'};
  });
  for(const item of list(config.extraSorts)) rowOrder.push({field:item.field,direction:item.direction || 'asc',
   ...(dimensionMap.has(item.field) && !dimensions.some(d => d.field === item.field) ? {aggregation:'min'} : {})});
  if(!rowOrder.length) rowOrder.push(...dimensions.map(d => ({field:d.field,direction:'asc'})));
  if(!rowOrder.length && measures.length) rowOrder.push({field:measures[0].field,direction:'desc'});
  // Stable tie-breaks also define the order inside a ROWS window. They are
  // appended to the displayed sort below, so both orders describe the same rows.
  for(const d of dimensions) if(!rowOrder.some(s => s.field === d.field)) rowOrder.push({field:d.field,direction:'asc'});
  if(config.trend && config.trend !== 'none') rowOrder.splice(0,rowOrder.length,...dimensions.map(d => ({field:d.field,direction:'asc'})));
  let compiledFilters = {filters:[],having:[]};
  if(config.filterTree){
   if(!filterAql()) fail('The filter compiler is unavailable.');
   const filterCatalog = new Map([...available.dimensions.map(f => [f.field,{...f,kind:'dimension'}]),
    ...available.measures.map(f => [f.field,{...f,kind:'metric'}])]);
   compiledFilters = filterAql().compile(config.filterTree,filterCatalog);
   if(compiledFilters.skipped.length) fail('Complete every chart condition before applying.');
  }
  let metricDefinitions = '';
  if(customMetrics.length){
   if(!metricAql()) fail('The metric calculation compiler is unavailable.');
   // A saved rank/window may need dimensions absent from the current chart.
   // Compile only requested metrics and their transitive dependencies; keeping
   // an unused local metric must never make another chart unqueryable.
   const specs = new Map(customMetrics.map(spec => [spec.name,spec])), needed = new Set();
   const include = name => {
    if(!specs.has(name) || needed.has(name)) return;
    needed.add(name);
    const spec = specs.get(name);
    include(spec.field);
    for(const item of list(spec.order)) include(typeof item === 'string' ? item : item.field);
    if(spec.orderRows) for(const item of rowOrder) include(item.field);
   };
   const filterFields = node => { if(!node) return;include(node.field);include(node.by);for(const child of list(node.children)) filterFields(child); };
   measures.forEach(m => include(m.field));filters.forEach(f => include(f.field));filterFields(config.filterTree);
   list(config.referenceStats).forEach(r => include(r.field));list(config.trendStats).forEach(r => include(r.field));
   list(config.extraSorts).forEach(r => include(r.field));
   const compiled = metricAql().compileAll(customMetrics.filter(spec => needed.has(spec.name)),{catalog,dimensions,grain,filters:compiledFilters.filters,rowOrder});
   metricDefinitions = compiled.definitions;
   for(const item of compiled.measures) catalog.set(item.field,item);
  }
  const dateDrills = grain === 'none' ? [] : dimensions
   .filter(d => d.type === 'date' || d.type === 'datetime').map(d => ({field:d.field,grain}));
  const sort = list(config.sort).map(s => {
   if(!aliases.has(s.field)) fail('Sort by a selected column name: ' + s.field);
   const direction = String(s.direction || 'asc').toLowerCase();
   if(direction !== 'asc' && direction !== 'desc') fail('Sort direction must be ascending or descending.');
   return {field:s.field,direction};
  });
  const sortAux = [];
  for(const [index,request] of list(config.extraSorts).entries()){
   const metadata = dimensionMap.get(request.field) || measureMap.get(request.field);
   if(!metadata) fail('Choose an existing field to sort by: ' + request.field);
   const direction = String(request.direction || 'asc').toLowerCase();
   if(!['asc','desc'].includes(direction)) fail('Sort direction must be ascending or descending.');
   const visible = [...dimensions,...measures].find(f => f.field === request.field);
   if(visible){sort.push({field:visible.alias,direction});continue;}
   let alias = 'sort_' + index;
   while(aliases.has(alias) || catalog.has(alias)) alias += '_';
   aliases.add(alias);
   const isDimension = dimensionMap.has(request.field);
   const expression = isDimension ? request.field.split('.')[0] + ' | min(' + request.field + ')' : request.field;
   const item = {...metadata,field:expression,source:request.field,alias,kind:'measure',auxiliary:true,hidden:true,
    aggregation:isDimension ? 'min' : null,label:(isDimension ? 'Minimum ' : '') + metadata.label};
   sortAux.push(item);sort.push({field:alias,direction});
  }
  if(!sort.length) for(const d of dimensions) sort.push({field:d.alias,direction:'asc'});
  if(!sort.length && measures.length) sort.push({field:measures[0].alias,direction:'desc'});
  if(customMetrics.some(spec => spec.orderRows)) for(const d of dimensions)
   if(!sort.some(s => s.field === d.alias)) sort.push({field:d.alias,direction:'asc'});
  // A grouped query supplies pivot cells without the server's untyped
  // synthetic pivot-header columns. Layout alone belongs to the renderer.
  const trendEnabled = Boolean(config.trend && config.trend !== 'none');
  const splitTrend = trendEnabled && dimensions.length > 1;
  let definitions = metricDefinitions, trend = null;
  const auxiliary = [...sortAux];
  const references = list(config.referenceStats).length ? metricAql()?.referenceStats(config.referenceStats,{catalog,dimensions,grain,filters:compiledFilters.filters,having:compiledFilters.having}) : [];
  if(list(config.referenceStats).length && !references) fail('The reference statistic compiler is unavailable.');
  for(const reference of references || []){
   if(aliases.has(reference.field) || catalog.has(reference.field)) fail('Give each reference line a unique name: ' + reference.field);
   aliases.add(reference.field);
   reference.alias = reference.field;
   definitions += reference.definitions;
   auxiliary.push(reference);
  }
  const trendStats = [];
  for(const [index,request] of list(config.trendStats).entries()){
   if(request.method !== 'moving_average') fail('Only moving averages are queried as chart trend statistics.');
   const size = Number(request.window || 3);
   if(!Number.isInteger(size) || size < 1 || size > 10000) fail('Choose a moving average size from 1 to 10000.');
   const name = request.name || 'moving_average_' + index;
   if(aliases.has(name) || catalog.has(name)) fail('Give each trend a unique name: ' + name);
   const built = metricAql()?.compile({name,kind:'moving',field:request.field,calculation:'avg',previous:size-1,next:0,
    nullIncomplete:request.nullIncomplete !== false,order:request.order || dimensions.slice(0,1).map(d => ({field:d.field,direction:'asc'})),partition:request.partition || dimensions.slice(1).map(d => d.field)},
    {catalog,dimensions,grain});
   if(!built) fail('The moving calculation compiler is unavailable.');
   built.alias = name;built.source = request.field;built.auxiliary = true;built.method = 'moving_average';built.window = size;
   aliases.add(name);definitions += built.definitions;auxiliary.push(built);trendStats.push(built);
  }
  if(trendEnabled){
   if(!dimensions.length || !measures.length) fail('A trend needs a dimension and a measure.');
   if(aliases.has('trend_value')) fail('Rename the selected trend_value column before adding a trend.');
   // Regression is against the ordinal position of recorded categories in
   // each series; the dimension order must match that position on the chart.
   sort.splice(0,sort.length,...dimensions.map(d => ({field:d.alias,direction:'asc'})));
   let prefix = 'examiner_fit';
   const names = new Set([...dimensionMap.keys(),...measureMap.keys(),...aliases]);
   while(['x','mx','my','cov','variance','value'].some(s => names.has(prefix + '_' + s))) prefix += '_';
   const name = suffix => prefix + '_' + suffix;
   const y = measures[0].field;
   const partition = '[]';
   const window = expression => `window_avg(${expression}, partition: ${partition})`;
   if(!splitTrend) definitions += [
    `metric ${name('x')} = case(when: ${y} is null, then: null, else: window_count(${y}, order: 'rows', partition: ${partition}));`,
    `metric ${name('mx')} = ${window(name('x'))};`,
    `metric ${name('my')} = ${window(y)};`,
    `metric ${name('cov')} = ${window(name('x') + ' * ' + y)} - ${name('mx')} * ${name('my')};`,
    `metric ${name('variance')} = ${window(name('x') + ' * ' + name('x'))} - ${name('mx')} * ${name('mx')};`,
    `metric ${name('value')} = ${name('my')} + ${name('cov')} / nullif(${name('variance')}, 0) * (${name('x')} - ${name('mx')});`,
   ].join('\n') + '\n';
   auxiliary.push({field:name('value'),alias:'trend_value',label:'Linear trend',type:'number',kind:'measure',auxiliary:true});
   trend = {field:'trend_value',measure:measures[0].alias,method:'least_squares',basis:'ordered_categories',
    description:'Database fit over the ascending ordinal position of recorded categories within each series.'};
  }
  const lines = values => values.map(f => '      ' + f.alias + ': ' + f.field + ',').join('\n');
  let aql = definitions + 'explore {\n';
  if(dimensions.length){
   aql += '  dimensions {\n';
   aql += lines(dimensions) + '\n';
   aql += '  }\n';
  }
  if(measures.length || auxiliary.length) aql += '  measures {\n' + lines([...measures,...auxiliary.filter(f => !splitTrend || f.alias !== 'trend_value')]) + '\n  }\n';
  if(compiledFilters.filters.length) aql += '  filters {\n' + compiledFilters.filters.map(f => '    ' + f + ',').join('\n') + '\n  }\n';
  if(compiledFilters.having.length) aql += '  having {\n' + compiledFilters.having.map(f => '    ' + f + ',').join('\n') + '\n  }\n';
  aql += '  sorts {\n' + sort.map(s => '    ' + s.field + ' ' + s.direction + ',').join('\n') + '\n  }\n}';
  return {dataset,aql,filters,dateDrills,sort,rowOrder,sortAux,dimensions,measures,pivotRows,pivotColumns,auxiliary,trend,references:references || [],trendStats,filterTree:config.filterTree,axisQuery:false,splitTrend,
   columns:[...dimensions,...measures,...auxiliary],pivot:pivotRequested,label:config.label || 'soul-examiner-' + dataset};
 }

 // These are calendar boundaries for native date filters, never calculations
 // over returned measures. A drilled date legend represents the entire bucket.
 function legendFilter(dimension,value,grain){
  const field = dimension.field;
  if(value === null || value === undefined) return {field,operator:'is_null',values:[]};
  if((dimension.type === 'date' || dimension.type === 'datetime') && grain && grain !== 'none'){
   const start = new Date(value), end = new Date(value);
   if(!Number.isFinite(start.getTime())) fail('The date legend did not return an ISO date.');
   if(grain === 'year') end.setUTCFullYear(end.getUTCFullYear()+1);
   else if(grain === 'quarter') end.setUTCMonth(end.getUTCMonth()+3);
   else if(grain === 'month') end.setUTCMonth(end.getUTCMonth()+1);
   else end.setUTCDate(end.getUTCDate()+(grain === 'week' ? 7 : 1));
   return {field,operator:'matches',values:[start.toISOString().slice(0,10)+' until '+end.toISOString().slice(0,10)]};
  }
  if(dimension.type === 'truefalse') return {field,operator:value === true || value === 'true' || value === '1' ? 'is_true' : 'is_false',values:[]};
  return {field,operator:'is',values:[value]};
 }

 async function fitSeries(config,plan,answer,runId){
  const primary = plan.dimensions[0], legends = plan.dimensions.slice(1);
  const groups = new Map(), cells = new Map(), queryNames = [answer.queryName || answer.query];
  const tuple = (dimensions,row) => JSON.stringify(dimensions.map(d => row[d.alias] ?? null));
  for(const row of answer.rows){
   const key = tuple(legends,row);
   if(!groups.has(key)) groups.set(key,row);
  }
  let fitColumn;
  // Port owns one active analysis session, so each series finishes before the
  // next is declared. Every series value was observed in the grouped result.
  for(const representative of groups.values()){
   if(runId !== currentRun) fail('The chart choices changed before the trend finished.');
   const fitPlan = build({dataset:plan.dataset,dimensions:[{field:primary.field,alias:primary.alias}],
    measures:[{field:plan.measures[0].field,alias:plan.measures[0].alias}],grain:config.grain,
    customMetrics:config.customMetrics,filterTree:config.filterTree,
    filters:[...plan.filters,...legends.map(d => legendFilter(d,representative[d.alias],config.grain))],
    trend:true,label:plan.label+'-trend'});
   const fitted = await root.NetherPort.askControlled(fitPlan);
   if(fitted.status === 'unreachable') throw fitted.error || new Error('A trend series could not be queried.');
   fitColumn ||= fitted.columns.find(column => column.name === 'trend_value');
   queryNames.push(fitted.queryName || fitted.query);
   for(const row of fitted.rows){
    const combined = {...representative,[primary.alias]:row[primary.alias]};
    cells.set(tuple(plan.dimensions,combined),row.trend_value ?? null);
   }
  }
  return {...answer,rows:answer.rows.map(row => ({...row,trend_value:cells.get(tuple(plan.dimensions,row)) ?? null})),
   columns:fitColumn ? [...answer.columns,fitColumn] : answer.columns,
   queryNames,meta:{...answer.meta,trendQueries:groups.size}};
 }

 async function run(config){
  const runId = ++currentRun;
  let plan;
  try{
   plan = build(config);
   if(!root.NetherPort?.askControlled) fail('The chart query port is unavailable.');
   let answer = await root.NetherPort.askControlled(plan);
   if(answer.status === 'rows' && plan.splitTrend) answer = await fitSeries(config,plan,answer,runId);
   return {...answer,queryName:answer.queryName || answer.query,aql:answer.aql || plan.aql,plan};
  }catch(error){
   return {status:'unreachable',rows:[],columns:[],error,dataset:config?.dataset,
    aql:plan?.aql || '',queryName:null,plan};
  }
 }
 function create(config){ return {build:() => build(config),run:() => run(config)}; }
 const api = {fields,build,run,create};
 if(typeof module !== 'undefined') module.exports = api; else root.NetherAnalysisQuery = api;
})();
