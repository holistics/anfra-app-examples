/* The examiner's three-panel analysis desk. Queries and controls live in port.js. */
window.createAnalysisWorkbench=function({state,refresh,recordTable,compare,note}){
 const D=NetherLedger,Q=NetherAnalysisQuery,$=s=>document.querySelector(s),esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const charts=[['table','Table'],['pivot','Pivot'],['bar','Vertical bar'],['horizontal','Horizontal bar'],['line','Line'],['combo','Bar + line']];
 const paths={table:'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',pivot:'M3 4h18v16H3zM3 9h18M9 4v16M13 13h5M16 11v6',bar:'M4 20V11h4v9M10 20V5h4v15M16 20V9h4v11',horizontal:'M4 4v16M4 6h14v3H4M4 12h10v3H4M4 18h17',line:'M3 20V4M3 20h18M5 16l5-6 4 3 6-9',combo:'M4 20V12h4v8M11 20V7h4v13M18 20V10h4v10M3 10l6-5 5 4 7-6',filter:'M3 4h18l-7 8v7l-4 2v-9z',date:'M4 5h16v16H4zM8 2v6M16 2v6M4 10h16M9 14h6M9 17h4',sort:'M7 3v17M3 16l4 4 4-4M17 21V4M13 8l4-4 4 4',analyze:'M10 3a7 7 0 110 14 7 7 0 010-14zM15 15l6 6M6 11V8M10 11V6M14 11V9',close:'M5 5l14 14M19 5L5 19',inspect:'M4 3h16v18H4zM8 7h8M8 11h8M8 15h5'};
 const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(paths[name]||paths.table)+'"/></svg>';
 const btn=(action,label,extra='',body=esc(label))=>'<button data-wb="'+action+'" '+extra+'>'+body+'</button>';
 let grainNow='none';
 const fmt=(v,compact)=>v===null||v===undefined?'—':/^\d{4}-\d\d-\d\d/.test(String(v))&&window.NetherDate?NetherDate.period(v,grainNow,{era:!compact}):typeof v==='number'?new Intl.NumberFormat('en',{maximumFractionDigits:3}).format(v):String(v);
 function formatted(value,f){if(value==null)return '—';if(f?.format==='percent'&&Number.isFinite(Number(value)))return new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:2}).format(Number(value));if(f?.format==='integer'&&Number.isFinite(Number(value)))return new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(Number(value));if(f?.format==='decimal'&&Number.isFinite(Number(value)))return new Intl.NumberFormat('en',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));return fmt(value);}
 let current=null;
 function data(s){
  if(!s.analysis||s.analysis.dataset!==s.dataset||s.analysis.model!==s.model){s.analysis={dataset:s.dataset,model:s.model,type:'table',columns:[],x:'',legend:'',y:[],pivotRow:'',pivotColumn:'',pivotRows:[],pivotColumns:[],breakdowns:[],filterTree:{combinator:'and',children:[]},references:[],trends:[],grain:'none',sortField:'',sortDir:'asc',filters:[],draft:[],groups:1,reference:'',trend:false,search:'',menu:null,key:null,status:'idle',result:null,token:0};}
  // Older workspaces kept native conditions separately. The badge counted
  // them, but the shared condition editor only displayed filterTree.
  const a=s.analysis;
  a.filterTree||={combinator:'and',children:[]};
  for(const old of a.filters||[]){
   const type=field(s,old.field)?.type;
   let operator=old.operator||'is',values=old.values??(old.value==null?[]:[old.value]);
   if(!Array.isArray(values))values=[values];
   if(['is_true','is_false'].includes(operator)){values=[String(operator==='is_true')];operator='is';}
   else if(type==='number')operator=({is:'equal',is_not:'not_equal'})[operator]||operator;
   else if(/date/.test(type))operator=({is:'is_on',is_not:'is_on'})[operator]||operator;
   if(['is_null','not_null'].includes(operator))values=[];
   const condition={field:old.field,operator,values};
   const node=/date/.test(type)&&old.operator==='is_not'?{combinator:'and',negated:true,children:[condition]}:condition;
   if(a.filterTree.combinator!=='and'||a.filterTree.negated)a.filterTree={combinator:'and',children:[a.filterTree,node]};
   else a.filterTree.children.push(node);
  }
  a.filters=[];
  return s.analysis;
 }
 function all(s){if(!s.dataset)return {dimensions:[],measures:[]};const fields=Q.fields(s.dataset);return {dimensions:fields.dimensions.map(f=>({...f,kind:'dimension'})),measures:fields.measures.map(f=>({...f,kind:'measure'}))};}
 function field(s,id){const a=all(s);return [...a.dimensions,...a.measures].find(f=>f.field===id);}
 function usedFields(a){return (a.type==='table'?a.columns:a.type==='pivot'?[...(a.pivotRows||[a.pivotRow]),...(a.pivotColumns||[a.pivotColumn]),...a.y]:[a.x,...(a.breakdowns||[a.legend]),...a.y]).filter(Boolean);}
 function selected(a,id){return usedFields(a).includes(id);}
 // Keep the full catalog mounted: a selected result can rebuild the workbench
 // while search is active, and clearing or widening must still find every field.
 function searchFields(value){
  const panel=$('#field-panel'),query=value.toLowerCase();
  panel.querySelectorAll('.wb-field-row').forEach(row=>row.hidden=!!query&&!row.dataset.search.includes(query));
  if(query)panel.querySelectorAll('details').forEach(group=>group.open=true);
 }
 function renderFields(s,a){
  a.openModels||={};if($('#field-panel').dataset.dataset===s.dataset)$('#field-panel').querySelectorAll('details[data-model]').forEach(el=>a.openModels[el.dataset.model]=el.open);$('#field-panel').dataset.dataset=s.dataset||'';
  $('#books-panel').innerHTML='<span class="dataset-picker-label">Book of Truth</span>'+NetherUI.select.triggerHTML(D.books().find(b=>b.id===s.dataset)?.title||'Choose a book','id="analysis-dataset" data-action="dataset" aria-haspopup="dialog" aria-controls="data-overlay"','wb-register');
  const f=all(s);
  const row=item=>'<div class="wb-field-row" draggable="true" data-drag-field="'+esc(item.field)+'" data-search="'+esc(item.label.toLowerCase())+'"><label class="wb-field"><input type="checkbox" data-wb-change="field" value="'+esc(item.field)+'" '+(selected(a,item.field)?'checked':'')+'><span class="wb-field-type">'+NetherFieldUI.symbol(item)+'</span><span>'+esc(item.label)+'</span></label><button type="button" class="wb-field-more" data-field-more="'+esc(item.field)+'" aria-label="Options for '+esc(item.label)+'" aria-haspopup="menu">···</button></div>';
  $('#field-panel').innerHTML='<label class="wb-field-search"><span>⌕</span><input aria-label="Search fields" data-wb-input="field-search" placeholder="Search fields…" value="'+esc(a.search)+'"></label><div class="wb-model-groups">'+(s.dataset?'<details class="wb-model" data-model="metrics" '+(a.openModels.metrics!==false?'open':'')+'><summary>'+NetherFieldUI.icons.metric+'<span>Metrics</span><small>'+f.measures.length+'</small><button class="wb-add-metric" data-wb="new-metric" aria-label="Add a metric">＋ Add</button></summary>'+f.measures.map(row).join('')+'</details>'+D.books().find(b=>b.id===s.dataset).models.map((model,i)=>'<details class="wb-model" data-model="'+model+'" '+((a.openModels[model]??i===0)?'open':'')+'><summary>'+NetherFieldUI.icons.model+'<span>'+esc(D.schema()[model].name)+'</span><small>'+D.schema()[model].fields.length+'</small></summary>'+f.dimensions.filter(v=>v.model===model).map(row).join('')+'</details>').join(''):'<p class="wb-hint">Choose a Book to see its fields.</p>')+'</div>';
  searchFields(a.search);
 }
 function slot(s,name,value,kind,slotIndex){const f=field(s,value);return '<section class="wb-slot" data-wb-drop="'+slotIndex+'"><span>'+name+'</span>'+btn('pick-slot',name,'class="wb-slot-picker" data-slot="'+slotIndex+'" data-kind="'+kind+'" aria-label="'+name+'"','<span class="field-type">'+(f?NetherFieldUI.symbol(f):'')+'</span><span>'+esc(f?.label||'Not selected')+'</span><span>⌄</span>')+'</section>';}
 function toolbar(a){return '<div class="wb-toolbar">'+'<span class="dataset-picker-label wb-config-label">Configuration</span>'+'<select class="wb-chart-select" data-ui-select data-wb-change="chart-type" aria-label="Chart type">'+charts.map(([id,name])=>'<option value="'+id+'" data-icon="'+esc(icon(id))+'"'+(id===a.type?' selected':'')+'>'+name+'</option>').join('')+'</select>'+'<div class="wb-toolbar-tools">'+['filter','date','sort','analyze'].map(name=>btn('menu',({filter:'Filters',date:'Date drill',sort:'Sort',analyze:'Analyze'})[name],'class="wb-tool '+((name==='filter'&&(a.filterTree?.children.length||0))||(name==='date'&&a.grain!=='none')||(name==='analyze'&&(a.breakdowns?.length||a.references?.length||a.trends?.length||a.reference!==''||a.trend))?'active':'')+'" data-menu="'+name+'" aria-label="'+({filter:'Filters',date:'Date drill',sort:'Sort',analyze:'Analyze'})[name]+'" title="'+name+'" aria-expanded="'+(a.menu===name)+'"',icon(name)+(name==='filter'&&(a.filterTree?.children.length||0)?'<small>'+(a.filterTree?.children.length||0)+'</small>':''))).join('')+'</div></div>';}
 function renderControls(s,a){
  let body='';
  if(a.type==='table')body='<section class="wb-config-section" data-wb-drop="columns"><h3>Columns</h3><div class="wb-chips">'+a.columns.map(id=>'<span draggable="true" data-drag-field="'+esc(id)+'" data-wb-drop="columns" data-drop-index="'+a.columns.indexOf(id)+'">'+esc(field(s,id)?.label||id)+btn('remove-field','Remove '+(field(s,id)?.label||id),'data-field="'+esc(id)+'"',icon('close'))+'</span>').join('')+'</div>'+btn('pick-slot','+ Add columns','class="wb-add" data-slot="columns" data-kind="all"')+'</section>';
  else if(a.type==='pivot')body=listSlot(s,a,'Rows','pivotRows',a.pivotRows||[a.pivotRow],'dimensions')+listSlot(s,a,'Columns','pivotColumns',a.pivotColumns||[a.pivotColumn],'dimensions')+listSlot(s,a,'Values','y',a.y,'measures');
  else body=slot(s,a.type==='horizontal'?'Y axis':'X axis',a.x,'dimensions','x')+slot(s,'Legend',a.legend,'dimensions','legend')+slot(s,a.type==='horizontal'?'X axis':'Y axis 1'+(a.type==='combo'?' · Bars':''),a.y[0],'measures','y0')+(a.type==='combo'?slot(s,'Y axis 2 · Line',a.y[1],'measures','y1'):a.y.slice(1).map((v,i)=>slot(s,'Y axis '+(i+2),v,'measures','y'+(i+1))).join(''))+btn('add-measure','+ Add another measure','class="wb-add"');
  if(!s.dataset)body='<p class="wb-hint wb-empty-hint">Choose a Book of Truth to see its fields.</p>';
  $('#analysis-config').innerHTML=toolbar(a)+'<div class="wb-config-body">'+body+'</div>'+(a.menu?menu(s,a):'');
  menus.mount(s,a);
 }
 function menu(s,a){return menus.html(s,a);}
 function listSlot(s,a,label,key,values,kind){return '<section class="wb-config-section wb-drop-section" data-wb-drop="'+key+'"><h3>'+label+'</h3><div class="wb-chips">'+values.filter(Boolean).map((id,i)=>'<span draggable="true" data-drag-field="'+esc(id)+'" data-wb-drop="'+key+'" data-drop-index="'+i+'">'+esc(field(s,id)?.label||id)+btn('remove-slot','Remove '+(field(s,id)?.label||id),'data-slot="'+key+'" data-field="'+esc(id)+'"',icon('close'))+'</span>').join('')+'</div>'+btn('pick-slot','+ Add '+label.toLowerCase(),'class="wb-add" data-slot="'+key+'" data-kind="'+kind+'"')+'</section>';}
 function operators(type){if(type==='truefalse')return [['is_true','is true'],['is_false','is false'],['is_null','is empty'],['not_null','is not empty']];return [['is','is'],['is_not','is not'],...(type==='number'?[['greater_than','is more than'],['less_than','is less than']]:/date/.test(type)?[['before','before'],['after','after']]:[['contains','contains'],['starts_with','starts with']]),['is_null','is empty'],['not_null','is not empty']];}
 function config(s,a){
  const f=all(s),dimension=id=>f.dimensions.find(v=>v.field===id),measure=id=>f.measures.find(v=>v.field===id);
  let dimensions=[],measures=[];
  if(a.type==='table'){dimensions=a.columns.filter(dimension);measures=a.columns.filter(measure);if(!dimensions.length&&!measures.length)return null;}
  else{if(a.type==='pivot'){const r=(a.pivotRows||[a.pivotRow]).filter(Boolean),c=(a.pivotColumns||[a.pivotColumn]).filter(Boolean);if(!r.length||!c.length||!a.y[0])return null;dimensions=[...r,...c];}else{if(!a.x||!a.y[0]||(a.type==='combo'&&!a.y[1]))return null;dimensions=[a.x,...(a.breakdowns||[a.legend])].filter(Boolean);}measures=[...new Set([...a.y,...(a.trends||[]).map(t=>t.field)])].filter(Boolean);}
  const filters=a.filters.map(c=>({field:c.field,operator:c.operator,values:['is_null','not_null','is_true','is_false'].includes(c.operator)?[]:[c.value],group:c.group}));if(s.filter)filters.push({field:s.model+'.'+s.filterField,operator:field(s,s.model+'.'+s.filterField)?.type==='text'?'contains':'is',values:[s.filter]});
  const raw=a.type==='table'&&a.grain==='none'&&!measures.length&&dimensions.length===D.schema()[s.model].fields.length&&dimensions.every(id=>id.startsWith(s.model+'.'));
  const tree=menus.queryFilters(a,s);filters.push(...tree.native);
  const result={customMetrics:NetherMetricStore.list(s.dataset),filterTree:withDrill(a,tree.nested),referenceStats:menus.referenceStats(a),trendStats:menus.trendStats(a),extraSorts:(a.sorts||[]).filter(sr=>!usedFields(a).includes(sr.field)).map(sr=>({field:sr.field,direction:sr.dir})),dataset:s.dataset,dimensions:raw?dimensions.map(id=>({field:id,alias:id.split('.').pop()})):dimensions,measures,filters,grain:a.grain,trend:a.trend&& !['table','pivot'].includes(a.type)};
  if(a.type==='pivot'){result.pivotRows=a.pivotRows||[a.pivotRow];result.pivotColumns=a.pivotColumns||[a.pivotColumn];}
  const plan=Q.build(result),known=plan.dimensions.concat(plan.measures),wanted=(a.sorts&&a.sorts.length?a.sorts:[{field:a.sortField||dimensions[0]||measures[0],dir:a.sortDir}]);const picked=wanted.map(w=>{const f=known.find(k=>k.field===w.field);return f&&{field:f.alias,direction:w.dir==='desc'?'desc':'asc'};}).filter(Boolean);if(a.sorts?.length){result.extraSorts=a.sorts.map(r=>({field:r.field,direction:r.dir}));result.sort=[];}else if(picked.length)result.sort=picked;return result;
 }
 function renderResult(s,a){grainNow=a.grain||'none';const root=$('#visualization');root.classList.add('wb-chart-panel');root.setAttribute('aria-busy',String(a.status==='asking'));let content='';
  if(!s.dataset)content='<div class="wb-empty"><span>◇</span><h2>Choose a Book of Truth</h2><p>Select a dataset, then choose fields to examine.</p></div>';
  else if(!a.key)content='<div class="wb-empty"><span>'+icon(a.type)+'</span><h2>'+(['table','pivot'].includes(a.type)?'Choose your fields':'Build your chart')+'</h2><p>'+ (a.type==='pivot'?'Choose a row, a column and a measure.':a.type==='combo'?'Choose an axis and two measures for the bars and line.':'Choose an axis and a measure from the models.')+'</p></div>';
  else if(a.status==='asking')content='<div class="wb-empty"><span class="wb-loading">◌</span><h2>Reading the Book…</h2></div>';
  else if(a.status==='unreachable')content='<p class="empty-note wb-query-error">'+esc(a.result?.error?.message||a.result?.error||'This Book will not open.')+'</p>';
  else if(a.status==='empty')content='<p class="empty-note">The Book holds no record matching these conditions.</p>';
  else if(a.result){const result=a.result,plan=result.plan;root.dataset.anfraQuery=(result.queryNames||[result.queryName||result.query]).filter(Boolean).join(' ');const rows=result.rows.filter(r=>r.__column_header__!=='1');
   const title=charts.find(c=>c[0]===a.type)[1];content='<header class="wb-chart-heading"><div><h2>'+esc(a.type==='table'?D.schema()[s.model].name:a.type==='pivot'?'Pivot':(field(s,a.y[0])?.label||title))+'</h2><p>'+esc(D.books().find(b=>b.id===s.dataset)?.title)+' · '+rows.length+' '+(a.type==='table'?'rows':'groups')+(a.grain!=='none'?' · '+a.grain:'')+'</p></div><span>'+title+'</span></header>'+crumbs(a);
   const raw=a.type==='table'&&a.grain==='none'&&!plan.measures.length&&a.columns.length===D.schema()[s.model].fields.length&&D.schema()[s.model].fields.every((f,i)=>a.columns[i]===s.model+'.'+f.id);
   content+=raw?recordTable(s.model,result.rows,true):a.type==='table'?table(plan,rows,a.columns):a.type==='pivot'?pivot(plan,rows):plot(a,plan,rows);
  }
  root.plotTooltipCleanup?.();
  root.innerHTML=content;
  window.NetherChartBrush?.attach({root,s,a,render,fields:()=>all(s),fmt,bc,isCurrent:()=>state()===s&&s.analysis===a});
  attachPlotTooltip(root);
 }
 function attachPlotTooltip(root){
  const svg=root.querySelector('.wb-plot');if(!svg)return;
  const tooltip=document.createElement('div');tooltip.className='wb-chart-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;
  tooltip.innerHTML='<span class="wb-chart-tooltip-category"></span><span class="wb-chart-tooltip-series"></span><strong class="wb-chart-tooltip-value"></strong>';
  document.body.append(tooltip);
  const listeners=new AbortController();
  root.plotTooltipCleanup=()=>{listeners.abort();tooltip.remove();};
  const hide=()=>{tooltip.hidden=true;};
  const show=(mark,event)=>{
   if(!mark||document.body.classList.contains('chart-brushing')){hide();return;}
   let data;try{data=JSON.parse(mark.dataset.chartTip);}catch{hide();return;}
   tooltip.querySelector('.wb-chart-tooltip-category').textContent=data.category;
   tooltip.querySelector('.wb-chart-tooltip-series').textContent=data.series;
   tooltip.querySelector('.wb-chart-tooltip-value').textContent=data.value;
   tooltip.hidden=false;
   const box=mark.getBoundingClientRect(),x=event?.clientX??box.left+box.width/2,y=event?.clientY??box.top;
   tooltip.style.left=Math.max(8,Math.min(x+14,innerWidth-tooltip.offsetWidth-8))+'px';
   tooltip.style.top=Math.max(8,Math.min(y-tooltip.offsetHeight-12,innerHeight-tooltip.offsetHeight-8))+'px';
  };
  svg.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'||event.pointerType==='pen')show(event.target.closest('[data-chart-tip]'),event);});
  svg.addEventListener('pointerleave',hide);
  svg.addEventListener('pointerdown',hide);
  svg.addEventListener('focusin',event=>show(event.target.closest('[data-chart-tip]')));
  svg.addEventListener('focusout',hide);
  root.addEventListener('scroll',hide,{passive:true,signal:listeners.signal});
 }
 function comparisonAttrs(f,value,row,plan,key){
  if(value==null)return '';
  const record=[...plan.dimensions,...plan.measures].filter(col=>row?.[col.alias]!=null).map(col=>({cat:col.field,val:String(row[col.alias])}));
  return compare('truth',f.field,value,f.label+': '+formatted(value,f))+' data-compare-key="'+esc(key)+'" data-compare-record="'+esc(JSON.stringify(record))+'"';
 }
 function compareButton(f,value,row,plan,key){return value==null?'—':'<button class="record-field-cell" '+comparisonAttrs(f,value,row,plan,key)+'>'+esc(formatted(value,f))+'</button>';}
 function table(plan,rows,order){const available=[...plan.dimensions,...plan.measures],cols=order?order.map(id=>available.find(f=>f.field===id)).filter(Boolean):available;return '<div class="identity-record-scroll wb-table-scroll"><table class="result-table identity-records"><thead><tr>'+cols.map(f=>'<th>'+esc(f.label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map((row,i)=>'<tr>'+cols.map(f=>'<td>'+compareButton(f,row[f.alias],row,plan,'table:'+i+':'+f.field)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
 function pivot(plan,rows){const rowFields=plan.pivotRows,colFields=plan.pivotColumns,measures=plan.measures,key=(r,fields)=>JSON.stringify(fields.map(f=>r[f.alias]));const rowKeys=new Map(),colKeys=new Map(),cells=new Map();for(const row of rows){rowKeys.set(key(row,rowFields),rowFields.map(f=>row[f.alias]));colKeys.set(key(row,colFields),colFields.map(f=>row[f.alias]));cells.set(key(row,rowFields)+'|'+key(row,colFields),row);}
  const headers=(values,fields,id)=>{const row=Object.fromEntries(fields.map((f,i)=>[f.alias,values[i]]));return fields.map((f,i)=>compareButton(f,values[i],row,plan,id+':'+f.field)).join(' / ');};
  return '<div class="identity-record-scroll wb-table-scroll"><table class="result-table identity-records wb-pivot"><thead><tr><th>'+rowFields.map(f=>esc(f.label)).join(' / ')+'</th>'+[...colKeys].map(([ck,v])=>measures.map(m=>'<th>'+headers(v,colFields,'pivot-column:'+ck)+'<small>'+esc(m.label)+'</small></th>').join('')).join('')+'</tr></thead><tbody>'+[...rowKeys].map(([rk,values])=>'<tr><th>'+headers(values,rowFields,'pivot-row:'+rk)+'</th>'+[...colKeys.keys()].map(ck=>measures.map(m=>{const row=cells.get(rk+'|'+ck);return '<td>'+compareButton(m,row?.[m.alias],row,plan,'pivot:'+rk+':'+ck+':'+m.field)+'</td>';}).join('')).join('')+'</tr>').join('')+'</tbody></table></div>';
 }
 function plot(a,plan,rows){
  const horizontal=a.type==='horizontal',width=900,height=520,pad={l:76,r:a.type==='combo'?78:32,t:25,b:75},w=width-pad.l-pad.r,h=height-pad.t-pad.b,x=plan.dimensions[0],legend=plan.dimensions[1],palette=['#bca66e','#779b86','#8998b0','#ad807b','#c6c193','#799da2'];
  const legends=plan.dimensions.slice(1),groupKey=row=>JSON.stringify(legends.map(d=>row[d.alias]??null)),cats=[...new Set(rows.map(r=>String(r[x.alias]??'—')))],groups=legends.length?[...new Set(rows.map(groupKey))]:[null],groupLabel=group=>group?JSON.parse(group).map(v=>fmt(v)).join(' / '):'',series=[];
  for(const [mi,m]of plan.measures.filter(m=>a.y.includes(m.field)).entries()){for(const group of groups){const values=cats.map(cat=>{const row=rows.find(r=>String(r[x.alias]??'—')===cat&&(!legends.length||groupKey(r)===group));return {value:row?.[m.alias]==null?null:Number(row[m.alias]),row};});series.push({measure:m,name:(group?groupLabel(group)+' · ':'')+m.label,values,color:palette[series.length%palette.length],line:a.type==='line'||a.type==='combo'&&mi>0,axis:a.type==='combo'&&mi>0?1:0});}}
  if(plan.trend){for(const group of groups){const values=cats.map(cat=>{const row=rows.find(r=>String(r[x.alias]??'—')===cat&&(!legends.length||groupKey(r)===group));return {value:row?.[plan.trend.field]==null?null:Number(row[plan.trend.field]),row};});series.push({name:(group?groupLabel(group)+' · ':'')+'Linear trend',values,color:'#d8c9a1',line:true,axis:0,trend:true});}}
  for(const t of a.trends||[])for(const group of groups){const m=plan.measures.find(m=>m.field===t.field);if(!m)continue;const base=cats.map(cat=>{const row=rows.find(r=>String(r[x.alias]??'—')===cat&&(!legends.length||groupKey(r)===group));return {value:row?.[m.alias]==null?null:Number(row[m.alias]),row};});let values;
   if(t.method==='moving_average'){const aux=plan.trendStats?.find(f=>f.source===t.field);values=base.map(v=>({value:v.row?.[aux?.alias]==null?null:Number(v.row[aux.alias]),row:v.row}));}
   else{const coords=/date/.test(x.type)?cats.map(c=>(new Date(c).getTime()-new Date(cats[0]).getTime())/86400000+1):undefined;const fitted=NetherTrendFit.fit(base,t.method,coords);values=base.map((v,i)=>({value:fitted[i],row:v.row}));}
   const mi=a.y.indexOf(t.field);series.push({measure:m,name:(group?groupLabel(group)+' · ':'')+m.label+' · '+(NetherWorkbenchMenus.fits.find(f=>f[0]===t.method)?.[1]||t.method),values,color:palette[(Math.max(0,mi)+3+NetherWorkbenchMenus.fits.findIndex(f=>f[0]===t.method))%palette.length],line:true,axis:a.type==='combo'&&mi>0?1:0,trend:true});
  }
  const referenceLines=(a.references||[]).map((r,i)=>{if(!r.field)return {...r,color:palette[(i+3)%palette.length],value:Number(r.value),name:'Constant'};const aux=plan.references?.find(f=>f.source===r.field&&f.aggregation===r.aggregation);return {...r,color:palette[(i+3)%palette.length],value:rows[0]?.[aux?.alias]==null?null:Number(rows[0][aux.alias]),name:(NetherWorkbenchMenus.stats.find(f=>f[0]===r.aggregation)?.[1]||r.aggregation)+' · '+(field(current,r.field)?.label||r.field)};}).filter(r=>r.value!==null&&Number.isFinite(r.value));
  const bounds=axis=>{const vals=series.filter(s=>s.axis===axis).flatMap(s=>s.values.map(v=>v.value)).filter(v=>v!==null&&Number.isFinite(v));if(axis===0){if(a.reference!=='')vals.push(Number(a.reference));vals.push(...referenceLines.map(r=>r.value));}let lo=Math.min(0,...vals),hi=Math.max(0,...vals);if(lo===hi)hi=lo+1;const extent=Math.max(Math.abs(lo),Math.abs(hi)),power=10**Math.floor(Math.log10(extent)),step=power*(extent/power>5?2:extent/power>2?1:.5);lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;return {lo,hi};},b0=bounds(0),b1=bounds(1),scale=(v,axis)=>{const b=axis?b1:b0;return (v-b.lo)/(b.hi-b.lo);};
  const point=(i,v,axis)=>horizontal?[pad.l+scale(v,axis)*w,pad.t+(i+.5)*h/cats.length]:[pad.l+(i+.5)*w/cats.length,pad.t+h-scale(v,axis)*h];
  const tipAttrs=(i,s,v)=>' data-chart-tip="'+esc(JSON.stringify({category:x.label+': '+fmt(v.row?.[x.alias]??cats[i]),series:s.name,value:formatted(v.value,s.measure)}))+'"';
  const brushMeta={field:x.field,type:x.type,label:x.label,grain:a.grain,values:cats.map(cat=>rows.find(r=>String(r[x.alias]??'—')===cat)?.[x.alias]??null),horizontal,left:pad.l,top:pad.t,width:w,height:h};
  let svg='<svg class="wb-plot" data-chart-brush="'+esc(JSON.stringify(brushMeta))+'" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(charts.find(c=>c[0]===a.type)[1]+' of '+plan.measures.map(m=>m.label).join(', ')+' by '+x.label)+'">';
  for(let i=0;i<=4;i++){const fraction=i/4,value=b0.lo+fraction*(b0.hi-b0.lo),px=pad.l+fraction*w,py=pad.t+h-fraction*h;svg+=horizontal?'<path class="wb-grid-line" d="M'+px+' '+pad.t+'v'+h+'"/><text x="'+px+'" y="'+(height-pad.b+24)+'" text-anchor="middle">'+esc(formatted(value,series.find(s=>s.axis===0)?.measure))+'</text>':'<path class="wb-grid-line" d="M'+pad.l+' '+py+'h'+w+'"/><text x="'+(pad.l-12)+'" y="'+(py+4)+'" text-anchor="end">'+esc(formatted(value,series.find(s=>s.axis===0)?.measure))+'</text>';if(a.type==='combo')svg+='<text x="'+(width-pad.r+12)+'" y="'+(py+4)+'">'+esc(formatted(b1.lo+fraction*(b1.hi-b1.lo),series.find(s=>s.axis===1)?.measure))+'</text>';}
  const stride=Math.max(1,Math.ceil(cats.length/10));cats.forEach((cat,i)=>{if(i%stride)return;const p=point(i,0,0),raw=rows.find(r=>String(r[x.alias]??'—')===cat)?.[x.alias],label=fmt(raw),tick=fmt(raw,true),attrs=comparisonAttrs(x,raw,{[x.alias]:raw},plan,'axis:'+cat)+' role="button" tabindex="0" aria-label="'+esc(x.label+': '+label)+'"';svg+=horizontal?'<text '+attrs+' x="'+(pad.l-10)+'" y="'+(p[1]+4)+'" text-anchor="end">'+esc(tick.slice(0,20))+'</text>':'<text '+attrs+' x="'+p[0]+'" y="'+(height-pad.b+24)+'" text-anchor="middle">'+esc(tick.slice(0,20))+'</text>';});
  const bars=series.filter(s=>!s.line);series.forEach((s,si)=>{if(s.line){let path='',segment=false;s.values.forEach((v,i)=>{if(v.value===null||!Number.isFinite(v.value)){segment=false;return;}const p=point(i,v.value,s.axis);path+=(segment?'L':'M')+p.join(' ');segment=true;const attrs=s.trend?'':comparisonAttrs(s.measure,v.row?.[s.measure.alias],v.row,plan,'mark:'+i+':'+s.name)+' role="button" tabindex="0" aria-label="'+esc(cats[i]+' · '+s.name+': '+formatted(v.value,s.measure))+'"';svg+='<circle '+attrs+tipAttrs(i,s,v)+' cx="'+p[0]+'" cy="'+p[1]+'" r="3" fill="'+s.color+'"/>';});svg+='<path class="wb-data-line" d="'+path+'" fill="none" stroke="'+s.color+'" stroke-width="'+(s.trend?'2':'3')+'" '+(s.trend?'stroke-dasharray="7 5"':'')+'/>';}
   else{s.values.forEach((v,i)=>{if(v.value===null||!Number.isFinite(v.value))return;const p=point(i,v.value,s.axis),zero=point(i,0,s.axis),bi=bars.indexOf(s),band=(horizontal?h:w)/Math.max(1,cats.length),size=Math.max(1,band*.72/Math.max(1,bars.length)),offset=-band*.36+bi*size;const attrs=comparisonAttrs(s.measure,v.row?.[s.measure.alias],v.row,plan,'mark:'+i+':'+s.name)+' role="button" tabindex="0" aria-label="'+esc(cats[i]+' · '+s.name+': '+formatted(v.value,s.measure))+'"';svg+='<rect '+attrs+tipAttrs(i,s,v)+' x="'+(horizontal?Math.min(p[0],zero[0]):p[0]+offset)+'" y="'+(horizontal?p[1]+offset:Math.min(p[1],zero[1]))+'" width="'+(horizontal?Math.max(.5,Math.abs(p[0]-zero[0])):size*.86)+'" height="'+(horizontal?size*.86:Math.max(.5,Math.abs(p[1]-zero[1])))+'" fill="'+s.color+'"/>';});}});
  if(a.reference!==''){const value=Number(a.reference),p=point(0,value,0);svg+='<path d="'+(horizontal?'M'+p[0]+' '+pad.t+'v'+h:'M'+pad.l+' '+p[1]+'h'+w)+'" class="wb-reference"/><text x="'+(horizontal?p[0]+6:width-pad.r-5)+'" y="'+(horizontal?pad.t+15:p[1]-8)+'" text-anchor="'+(horizontal?'start':'end')+'">Reference '+esc(formatted(value,series.find(s=>s.axis===0)?.measure))+'</text>';}
  for(const [i,r] of referenceLines.entries()){const p=point(0,r.value,0);svg+='<path d="'+(horizontal?'M'+p[0]+' '+pad.t+'v'+h:'M'+pad.l+' '+p[1]+'h'+w)+'" class="wb-reference" style="stroke:'+r.color+'"/><text x="'+(horizontal?p[0]+6:width-pad.r-5)+'" y="'+(horizontal?pad.t+15+i*15:p[1]-8)+'" text-anchor="'+(horizontal?'start':'end')+'">'+esc(r.name+': '+formatted(r.value,r.field?field(current,r.field):null))+'</text>';}
  svg+='</svg>';return '<div class="wb-plot-wrap">'+svg+'<p class="wb-axis-label">'+esc(x.label)+'</p><div class="wb-legend">'+series.map(s=>'<span><i '+(s.trend?'class="wb-legend-curve" style="color:'+s.color+'"':'style="background:'+s.color+'"')+'></i>'+esc(s.name)+'</span>').join('')+referenceLines.map(r=>'<span class="wb-reference-legend"><i class="wb-legend-line" style="color:'+r.color+'"></i>'+esc(r.name+': '+formatted(r.value,r.field?field(current,r.field):null))+'</span>').join('')+'</div>'+((a.trends||[]).length?'<p class="wb-trend-note">Curves fit the displayed groups; moving averages are calculated by the Book.</p>':a.trend?'<p class="wb-trend-note">Linear trend over ordered groups · calculated by the Book</p>':'')+'</div>';
 }
 function metricEditor(s,a,{anchor,source,spec,kind,aggregation,slotKey,replace}={}){
  const f=all(s),fields=[...f.dimensions,...f.measures],dimensions=usedFields(a).filter(id=>field(s,id)?.kind==='dimension');
  NetherMetricUI.edit({anchor,dataset:s.dataset,fields,used:usedFields(a),dimensions,grain:a.grain,rowOrder:(a.sorts||[]).map(r=>({field:r.field,direction:r.dir})),source,spec,kind,aggregation,
   async validate(draft,previous){const custom=NetherMetricStore.list(s.dataset).filter(m=>m.name!==previous);custom.push(draft);return Q.run({dataset:s.dataset,customMetrics:custom,dimensions,measures:[draft.name],grain:a.grain,extraSorts:(a.sorts||[]).map(r=>({field:r.field,direction:r.dir})),filterTree:a.filterTree});},
   onSave(next,previous){const old=replace||previous;if(old&&old!==next.name){a.columns=a.columns.map(v=>v===old?next.name:v);a.y=a.y.map(v=>v===old?next.name:v);}if(old&&old!==next.name){for(const r of [...(a.references||[]),...(a.trends||[]),...(a.sorts||[])])if(r.field===old)r.field=next.name;}if(slotKey)assign(s,a,next.name,slotKey);render(s);}
  });
 }
 function assign(s,a,id,key,index){
  const f=field(s,id);if(!f)return;
  if(['x','legend','pivotRow','pivotColumn'].includes(key)){if(f.kind!=='dimension')return;a[key]=id;if(key==='legend')a.breakdowns=[id];if(key==='pivotRow')a.pivotRows=[id];if(key==='pivotColumn')a.pivotColumns=[id];}
  else if(['pivotRows','pivotColumns'].includes(key)){if(f.kind!=='dimension')return;a[key]=(a[key]||[]).filter(v=>v!==id);a[key].splice(index??a[key].length,0,id);}
  else if(key==='columns'){a.columns=a.columns.filter(v=>v!==id);a.columns.splice(index??a.columns.length,0,id);}
  else if(key==='y'||key.startsWith('y')){if(f.kind==='dimension'){metricEditor(s,a,{source:f,slotKey:key});return;}if(key==='y'){a.y=a.y.filter(v=>v!==id);a.y.splice(index??a.y.length,0,id);}else{a.y[Number(key.slice(1))]=id;while(a.y.length&&!a.y[a.y.length-1])a.y.pop();}}
 }
 /* Drill down and date drill (interaction-logic.js). A right-click on a data point of a chart offers both: Drill down
    opens the field picker for the next level, Date drill the finer grains. The path is a.drill; its steps are filters
    in the nested tree, so they are compiled with the rest and a crumb restores the numbers it showed. */
 const IX=window.NetherInteractions;
 function withDrill(a,nested){
  const steps=[...(a.drill?IX.drill.tree(a.drill).children:[]),...(a.brush?[a.brush.tree]:[])];
  if(!steps.length)return nested;
  return {combinator:'and',children:[...(nested?.children||[]),...steps]};
 }
 const bc=(value,grain)=>NetherDate.period(value,grain);
 function crumbs(a){
  if(!a.drill?.steps.length)return '';
  const list=IX.drill.breadcrumb(a.drill,(v,step)=>/date/.test(step.type)?bc(v,step.grain):fmt(v));
  return '<nav class="wb-crumbs" aria-label="Drill path">'+list.map((c,i)=>'<button data-wb="drill-up" data-depth="'+c.depth+'"'+(i===list.length-1?' aria-current="step"':'')+'>'+esc(c.label)+'</button>').join('<span aria-hidden="true">›</span>')+'</nav>';
 }
 function afterDrill(s,a){a.sorts=[];a.sortField='';a.menu=null;render(s);}
 document.addEventListener('contextmenu',event=>{
  const mark=event.target.closest('.wb-plot [data-compare-record]');if(!mark)return;
  const ctx=edit();if(!ctx)return;const {s,a}=ctx;
  if(!['bar','horizontal','line','combo'].includes(a.type)||!a.x||!a.y[0])return;
  event.preventDefault();
  const xf=field(s,a.x);let record=[];try{record=JSON.parse(mark.dataset.compareRecord);}catch{}
  const entry=record.find(r=>r.cat===a.x),value=entry?entry.val:null;
  const state=a.drill||IX.drill.start(a.x,xf?.type,a.grain),definition=window.NetherNotes?.metric(a.y[0])?.definition||'';
  const menu=IX.contextMenu({xType:xf?.type,grain:a.grain,definition,state}),[drillItem,dateItem]=menu;
  const anchor=document.createElement('span');anchor.className='wb-ctx-anchor';anchor.style.cssText='position:fixed;width:1px;height:1px;left:'+event.clientX+'px;top:'+event.clientY+'px';document.body.append(anchor);
  const row=(item,label)=>'<button type="button" class="analytic-menu-row" data-ctx="'+item.id+'" '+(item.enabled?'':'disabled aria-disabled="true"')+'>'+label+' <span>›</span></button>'+(item.enabled?'':'<small class="wb-ctx-reason">'+esc(item.reason)+'</small>');
  const popover=NetherFieldUI.open({anchor,title:(xf?.label||'Data point')+': '+String(xf&&/date/.test(xf.type)?bc(value,a.grain):fmt(value)),width:250,className:'wb-ctx',onClose:()=>anchor.remove(),
   html:row(drillItem,'Drill down')+row(dateItem,'Date drill'),
   onClick(e,panel){
    const button=e.target.closest('[data-ctx]');if(!button||button.disabled)return;
    if(button.dataset.ctx==='drill'){
     NetherFieldUI.reportPicker({anchor:button,title:'Drill down by',header:true,fields:drillItem.fields.map(c=>field(s,c.field)).filter(Boolean),used:usedFields(a),
      onPick(f){panel.close();a.drill=IX.drill.into(state,value===undefined?null:value,{field:f.field,type:f.type});a.x=f.field;if(/date/.test(f.type)&&a.grain==='none')a.grain='year';afterDrill(s,a);}});
    }else{
     NetherFieldUI.open({anchor:button,side:true,title:'Date drill',width:250,
      html:dateItem.options.map(o=>'<button type="button" class="analytic-menu-row" data-grain="'+o.grain+'">'+o.grain[0].toUpperCase()+o.grain.slice(1)+(o.partial?' <small>edge weeks are partial</small>':'')+'</button>').join(''),
      onClick(e2,p2){const option=e2.target.closest('[data-grain]');if(!option)return;panel.close();a.drill=IX.drill.intoDate(state,value,option.dataset.grain);a.grain=option.dataset.grain;afterDrill(s,a);}});
    }
   }});
 });
 const menus=NetherWorkbenchMenus.create({get:edit,fields:s=>{const f=all(s);return [...f.dimensions,...f.measures]},field,used:usedFields,render,controls:renderControls,icon,metricEditor,assign});
 document.addEventListener('click',e=>{const more=e.target.closest('[data-field-more]');if(more){e.stopPropagation();NetherFieldUI.hideInfo();const c=edit();if(c)menus.fieldMenu(more,field(c.s,more.dataset.fieldMore),c.s,c.a);}});
 document.addEventListener('mouseover',e=>{const more=e.target.closest('[data-field-more]');if(more){const c=edit();if(c)NetherFieldUI.info(more,field(c.s,more.dataset.fieldMore));}});
 document.addEventListener('mouseout',e=>{if(e.target.closest('[data-field-more]'))NetherFieldUI.hideInfo();});
 addEventListener('nether:metric-renamed',event=>{const {dataset,previous,name}=event.detail;for(const s of window.NetherV4?.states.values()||[]){const a=s.analysis;if(!a||s.dataset!==dataset)continue;a.columns=a.columns.map(v=>v===previous?name:v);a.y=a.y.map(v=>v===previous?name:v);for(const row of [...(a.references||[]),...(a.trends||[]),...(a.sorts||[])])if(row.field===previous)row.field=name;const rewrite=node=>{if(node.children)node.children.forEach(rewrite);else if(node.field===previous)node.field=name;};if(a.filterTree)rewrite(a.filterTree);a.key=null;}});
 // Pointer dragging works inside the SDK's opaque iframe and on touch screens.
 // Inputs and option buttons keep their normal click/keyboard behavior.
 let fieldDrag=null,suppressFieldClick=false;
 function clearDrop(){document.querySelectorAll('.wb-drag-over').forEach(t=>t.classList.remove('wb-drag-over'));}
 function dropAt(x,y){return document.elementFromPoint(x,y)?.closest('[data-wb-drop]');}
 document.addEventListener('pointerdown',e=>{const row=e.target.closest('[data-drag-field]');if(!row||e.button!==0||e.target.closest('button,input,select'))return;fieldDrag={row,id:row.dataset.dragField,x:e.clientX,y:e.clientY,pointer:e.pointerId,moved:false};e.preventDefault();});
 document.addEventListener('pointermove',e=>{const d=fieldDrag;if(!d||d.pointer!==e.pointerId)return;if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<6)return;e.preventDefault();if(!d.moved){d.moved=true;d.row.setPointerCapture(e.pointerId);d.ghost=document.createElement('div');d.ghost.className='wb-field-drag';d.ghost.textContent=field(current,d.id)?.label||d.id;document.body.append(d.ghost);}d.ghost.style.left=e.clientX+12+'px';d.ghost.style.top=e.clientY+12+'px';clearDrop();dropAt(e.clientX,e.clientY)?.classList.add('wb-drag-over');});
 function finishFieldDrag(e){const d=fieldDrag;if(!d||d.pointer!==e.pointerId)return;fieldDrag=null;clearDrop();d.ghost?.remove();if(!d.moved)return;suppressFieldClick=true;setTimeout(()=>suppressFieldClick=false,0);if(e.type!=='pointerup')return;const target=dropAt(e.clientX,e.clientY),c=edit();if(target&&c){assign(c.s,c.a,d.id,target.dataset.wbDrop,target.dataset.dropIndex==null?undefined:Number(target.dataset.dropIndex));render(c.s);}}
 document.addEventListener('pointerup',finishFieldDrag);document.addEventListener('pointercancel',finishFieldDrag);
 document.addEventListener('click',e=>{if(suppressFieldClick){e.preventDefault();e.stopImmediatePropagation();}},true);
 document.addEventListener('dragstart',e=>{if(e.target.closest('[data-drag-field]'))e.preventDefault();});

 function run(s,a){if(!s.dataset)return;let cfg;try{cfg=config(s,a);}catch(error){a.status='unreachable';a.result={error};a.key='invalid';return;}if(!cfg){a.key=null;return;}const key=JSON.stringify(cfg);if(a.key===key)return;a.key=key;a.status='asking';const token=++a.token;note(s.dataset);Q.run(cfg).then(result=>{if(s.analysis!==a||a.token!==token||a.key!==key)return;a.status=result.status;a.result=result;s.rows=result.rows||[];s.rowStatus=result.status;if(current===s)renderResult(s,a);});}
 function render(s){current=s;const a=data(s);$('.workbench').classList.add('wb-workbench');renderFields(s,a);renderControls(s,a);run(s,a);renderResult(s,a);}
 function edit(){const s=state();if(!s)return null;return {s,a:data(s)};}
 document.addEventListener('click',event=>{const el=event.target.closest('[data-wb]');if(!el||el.disabled)return;const ctx=edit();if(!ctx)return;const {s,a}=ctx,action=el.dataset.wb;
  if(action==='menu'){a.menu=a.menu===el.dataset.menu?null:el.dataset.menu;if(a.menu==='sort'&&!(a.sorts&&a.sorts.length)){const first=a.sortField||usedFields(a).filter(Boolean)[0];a.sorts=first?[{field:first,dir:a.sortDir||'asc'}]:[];}if(a.menu==='filter'){a.closedGroups={};a.draft=a.filters.map(f=>({...f}));a.groups=Math.max(1,...a.draft.map(f=>(f.group||0)+1));}renderControls(s,a);return;}
  if(action==='close-menu'){a.menu=null;renderControls(s,a);return;}
  if(action==='clear-brush')a.brush=null;
  if(action==='drill-up'&&a.drill){const back=IX.drill.up(a.drill,Number(el.dataset.depth));a.x=back.current.field;if(back.current.grain)a.grain=back.current.grain;a.drill=back.steps.length?back:null;a.sorts=[];a.sortField='';}
  if(action==='chart'){a.type=el.dataset.type;a.menu=null;a.trend=false;}
  if(action==='new-metric'){event.preventDefault();metricEditor(s,a,{anchor:el});return;}
  if(action==='pick-slot'){const key=el.dataset.slot,f=all(s),value=key.startsWith('y')&&key!=='y'?a.y[Number(key.slice(1))]:a[key],canClear=!!value&&!Array.isArray(value);NetherFieldUI.pick({anchor:el,fields:el.dataset.kind==='all'?[...f.dimensions,...f.measures]:f[el.dataset.kind],used:usedFields(a),selected:Array.isArray(value)?value:[value].filter(Boolean),extraHTML:canClear?'<button class="analytic-menu-row" data-clear-slot>Clear selection</button>':'',onExtra(e,p){if(!e.target.closest('[data-clear-slot]'))return;p.close();if(key.startsWith('y')){a.y[Number(key.slice(1))]='';while(a.y.length&&!a.y[a.y.length-1])a.y.pop();}else{a[key]='';if(key==='legend')a.breakdowns=[];}render(s);},onPick:f=>{assign(s,a,f.field,key);render(s)}});return;}
  if(action==='remove-slot'){a[el.dataset.slot]=a[el.dataset.slot].filter(v=>v!==el.dataset.field);}
  if(action==='remove-field')a.columns=a.columns.filter(id=>id!==el.dataset.field);
  if(action==='add-measure'){NetherFieldUI.pick({anchor:el,fields:all(s).measures,used:usedFields(a),onPick:f=>{assign(s,a,f.field,'y');render(s)}});return;}
  if(action==='grain'){a.grain=el.dataset.grain;a.menu=null;}
  if(action==='sort-direction'){const row=(a.sorts||[])[Number(el.dataset.index)];if(row)row.dir=row.dir==='desc'?'asc':'desc';}
  if(action==='add-sort'){const taken=(a.sorts||[]).map(r=>r.field),next=usedFields(a).filter(Boolean).find(id=>!taken.includes(id));if(next)(a.sorts||=[]).push({field:next,dir:'asc'});}
  if(action==='remove-sort')(a.sorts||[]).splice(Number(el.dataset.index),1);
  if(action==='filter-field')a.draft.push({field:el.dataset.field,operator:'is',value:'',group:a.groups-1});
  if(action==='add-condition')a.draft.push({field:'',operator:'is',value:'',group:Number(el.dataset.group)});
  if(action==='remove-condition')a.draft.splice(Number(el.dataset.index),1);
  if(action==='add-group'){a.groups++;a.draft.push({field:'',operator:'is',value:'',group:a.groups-1});}
  if(action==='apply-filters'){a.filters=a.draft.filter(c=>c.field&&(['is_null','not_null','is_true','is_false'].includes(c.operator)||c.value!=='')).map(c=>({...c}));a.menu=null;}
  if(action==='clear-filters'){a.filterTree={combinator:'and',children:[]};a.filters=[];a.draft=[];a.groups=1;a.menu=null;}
  if(action==='breakdown'){a.menu='breakdown';if(['table','pivot'].includes(a.type))a.type='bar';}
  if(action==='reference'){a.reference=a.reference===''?'0':'';}
  if(action==='trend'){a.trend=!a.trend;if(a.trend){a.sortDir='asc';a.sortField=a.x;a.sorts=[{field:a.x,dir:'asc'}];}a.menu=null;}
  render(s);
 });
 document.addEventListener('change',event=>{const el=event.target.closest('[data-wb-change]');if(!el)return;const ctx=edit();if(!ctx)return;const {s,a}=ctx,name=el.dataset.wbChange,value=el.value;
  if(name==='dataset'){s.dataset=value||null;if(value){s.model=D.books().find(b=>b.id===value).models[0];s.filterField=D.schema()[s.model].fields.find(f=>f.type==='text'&&!f.key)?.id||D.schema()[s.model].fields[0].id;}s.filter='';s.selection=null;s.analysis=null;refresh();return;}
  if(name==='field'){if(a.type==='pivot'){if(field(s,value)?.kind==='measure')a.y=el.checked?[...new Set([...a.y,value])]:a.y.filter(v=>v!==value);else if(el.checked){if(!a.pivotRows.length)a.pivotRows.push(value);else a.pivotColumns.push(value);}else{a.pivotRows=a.pivotRows.filter(v=>v!==value);a.pivotColumns=a.pivotColumns.filter(v=>v!==value);}render(s);return;}if(a.type==='table')a.columns=el.checked?[...new Set([...a.columns,value])]:a.columns.filter(v=>v!==value);else if(field(s,value)?.kind==='measure')a.y=el.checked?[...new Set([...a.y,value])]:a.y.filter(v=>v!==value);else if(el.checked){if(!a.x)a.x=value;else {a.legend=value;a.breakdowns=[value];}}else{if(a.x===value)a.x='';if(a.legend===value){a.legend='';a.breakdowns=[];}}}
  if(name==='slot'){const slot=el.dataset.slot;if(slot.startsWith('y')){const index=Number(slot.slice(1));a.y[index]=value;while(a.y.length&&!a.y[a.y.length-1])a.y.pop();}else {a[slot]=value;if(slot==='legend')a.breakdowns=value?[value]:[];}}
  if(name==='chart-type'){a.type=value;a.menu=null;a.trend=false;}
  if(name==='sort-field'){const row=(a.sorts||[])[Number(el.dataset.index)];if(row)row.field=value;}
  if(name==='grain'){a.grain=value;a.menu=null;}
  if(name==='reference')a.reference=value;
  if(name==='breakdown'){a.legend=value;a.menu=null;}
  if(name==='condition-field'){a.draft[el.dataset.index].field=value;a.draft[el.dataset.index].operator='is';}
  if(name==='condition-op')a.draft[el.dataset.index].operator=value;
  if(name.startsWith('condition')){renderControls(s,a);return;}
  render(s);
 });
 document.addEventListener('input',event=>{const el=event.target;if(el.matches('[data-wb-draft]')){const ctx=edit();if(ctx)ctx.a.draft[el.dataset.wbDraft].value=el.value;}
  if(el.matches('[data-wb-input="filter-search"]')){const query=el.value.toLowerCase();document.querySelectorAll('[data-filter-label]').forEach(row=>row.hidden=!!query&&!row.dataset.filterLabel.includes(query));if(query)document.querySelectorAll('.wb-filter-picker').forEach(d=>d.open=true);}
  if(el.matches('[data-wb-input="field-search"]')){const ctx=edit();if(!ctx)return;ctx.a.search=el.value;searchFields(ctx.a.search);}
 });
 document.addEventListener('click',event=>{const ctx=edit();if(ctx?.a.menu&&!event.composedPath().some(node=>node.id==='analysis-config'||(node.classList&&(node.classList.contains('ui-select-pop')||node.classList.contains('analytic-pop')||node.classList.contains('metric-editor')||node.classList.contains('condition-group-dialog'))))){ctx.a.menu=null;renderControls(ctx.s,ctx.a);}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){const ctx=edit();if(ctx?.a.menu){ctx.a.menu=null;renderControls(ctx.s,ctx.a);event.stopPropagation();}}});
 document.addEventListener('toggle',e=>{const d=e.target;if(d.matches&&d.matches('.wb-condition-group')){const ctx=edit();if(ctx)(ctx.a.closedGroups||={})[d.dataset.group]=!d.open;}},true);
 return {render,get current(){return current?.analysis;}};
};
