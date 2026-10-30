/* Shared realm-calendar popovers for chart, condition-group and metric filters. */
window.NetherDateFilterUI=(()=>{
 const U=NetherFieldUI,esc=U.esc,clone=v=>JSON.parse(JSON.stringify(v));
 const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const operators=[['matches','matches'],['last','last'],['next','next'],['before','before'],['after','after'],['between','between'],['is_on','is on'],['is_null','is null'],['not_null','is not null'],['top_n','top N'],['bottom_n','bottom N']];
 const presets=[['today','Today'],['yesterday','Yesterday'],['last 7 days','Last 7 days'],['last 30 days','Last 30 days'],['month to date','Month to date'],['year to date','Year to date'],['custom','Custom'],['fixed','Fixed range'],['any time','Any time']];
 const boundsCache=new Map();
 const current=()=>window.NetherDateFilter?.current()||NetherDate.current();
 function utc(y,m,d=1){const v=new Date(0);v.setUTCFullYear(y,m,d);v.setUTCHours(0,0,0,0);return v;}
 const iso=d=>String(d.getUTCFullYear()).padStart(4,'0')+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
 const parse=v=>window.NetherDateFilter?.parse(v)||NetherDate.toStorage(v)||(/^\d{4}-\d\d-\d\d/.test(String(v))?String(v):null);
 const display=v=>{if(!v)return '';const text=String(v),date=NetherDate.fmt(text);return date+(text.length>10?' '+text.slice(11,16):'');};
 function period(node){if(['top_n','bottom_n'].includes(node.operator))return (node.operator==='top_n'?'Top ':'Bottom ')+(node.values?.[0]||'N')+' dates';try{return NetherDateFilter.resolve(node,{now:current()}).label;}catch{return 'Choose dates';}}
 function coverage(dataset,field){
  const key=dataset+'|'+field;if(!dataset||!field)return Promise.resolve(null);
  if(!boundsCache.has(key))boundsCache.set(key,(async()=>{
   const metrics=['min','max'].map(aggregation=>({name:'date_filter_'+aggregation,label:aggregation,kind:'aggregate',aggregation,field}));
   const plan=NetherAnalysisQuery.build({dataset,dimensions:[],measures:metrics.map(m=>m.name),customMetrics:metrics});
   const result=await NetherPort.ask(dataset,plan.aql,'date-coverage');
   if(result.status==='unreachable')throw Error('Date coverage could not be checked.');
   const value=kind=>{const column=plan.measures.find(m=>m.field==='date_filter_'+kind);return result.rows[0]?.[column?.alias]||null;};
   return {first:value('min'),last:value('max')};
  })().catch(error=>{boundsCache.delete(key);return {error:error.message};}));return boundsCache.get(key);
 }
 function warning(bounds,resolved){if(!bounds)return 'Checking available dates…';if(bounds.error)return bounds.error;if(!bounds.last)return 'This field has no recorded dates.';
  if(resolved?.to&&String(bounds.last).slice(0,10)<String(resolved.to).slice(0,10)&&String(bounds.last).slice(0,10)!==lastDay(resolved.to))return 'Data ends at '+display(bounds.last)+'; the requested range extends beyond it.';
  if(resolved?.from&&String(bounds.last).slice(0,10)<String(resolved.from).slice(0,10))return 'Data ends at '+display(bounds.last)+'; no data reaches the requested dates.';
  return '';
 }
 function lastDay(value){const d=new Date(String(value).slice(0,10)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return iso(d);}
 function week(date){const d=new Date(date);d.setUTCDate(d.getUTCDate()+3-(d.getUTCDay()+6)%7);const start=utc(d.getUTCFullYear(),0,4);return 1+Math.round(((d-start)/86400000-3+(start.getUTCDay()+6)%7)/7);}
 function edit({anchor,node,fields,used=[],dataset,now=current(),onSave,onRemove}={}){
  dataset||=window.NetherV4?.analysis.current?.dataset;
  let draft=clone(node||{}),popup,calendarPopup,dirty=false,finished=false,error='',bounds=null,pickingEnd=false,boundsSeq=0;
  draft.operator||='matches';draft.values||=[];draft.dateSpec=!['top_n','bottom_n','is_null','not_null'].includes(draft.operator);
  let month=utc(Number(now.slice(0,4)),Number(now.slice(5,7))-1),selectedPreset=draft.preset||'',withTime=!!draft.withTime;
  const selectedField=()=>fields.find(f=>f.field===draft.field),isTop=()=>['top_n','bottom_n'].includes(draft.operator),isSingle=()=>['is_on','before','after'].includes(draft.operator),hasCalendar=()=>['matches','between','is_on','before','after'].includes(draft.operator),dateValue=v=>{try{return parse(v);}catch{return null;}};
  const initial=dateValue(draft.values[0]);if(initial)month=utc(Number(initial.slice(0,4)),Number(initial.slice(5,7))-1);
  function readRange(){try{return NetherDateFilter.resolve(draft,{now});}catch(e){return {error:e.message};}}
  function stamp(){draft.dateSpec=!isTop()&&!['is_null','not_null'].includes(draft.operator);draft.withTime=withTime;dirty=true;}
  function monthHTML(offset){
   const start=utc(month.getUTCFullYear(),month.getUTCMonth()+offset),y=start.getUTCFullYear(),m=start.getUTCMonth(),first=utc(y,m,1),grid=utc(y,m,1-(first.getUTCDay()+6)%7),resolved=readRange(),a=dateValue(draft.values[0])?.slice(0,10)||(!resolved.error?resolved.from?.slice(0,10):null),b=dateValue(draft.values[1])?.slice(0,10)||(!resolved.error&&resolved.to?lastDay(resolved.to):null),lo=a&&b?(a<b?a:b):a,hi=a&&b?(a>b?a:b):a;
   let days='<span class="date-week-head" aria-hidden="true"></span>'+['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>'<span class="date-weekday">'+d+'</span>').join('');
   for(let row=0;row<6;row++){
    const monday=new Date(grid.getTime()+row*7*86400000);days+='<span class="date-week-number">W'+week(monday)+'</span>';
    for(let col=0;col<7;col++){const d=new Date(monday.getTime()+col*86400000),value=iso(d),inMonth=d.getUTCMonth()===m,endpoint=value===a||value===b,inside=lo&&hi&&value>=lo&&value<=hi,valid=d.getUTCFullYear()>=1&&d.getUTCFullYear()<1000;days+='<button type="button" class="date-day'+(!inMonth?' is-adjacent':'')+(inside?' is-range':'')+(endpoint?' is-endpoint':'')+(value===now.slice(0,10)?' is-today':'')+'" data-date-day="'+value+'" aria-label="'+esc(display(value))+'" aria-pressed="'+!!inside+'"'+(!valid?' disabled':'')+'>'+d.getUTCDate()+'</button>';}
   }
   return '<section class="date-month" aria-label="'+names[m]+' '+(1000-y)+' BC"><header><button data-date-nav="'+(offset-1)+'" aria-label="Previous month">‹</button><select data-date-month="'+offset+'" aria-label="Month">'+names.map((name,i)=>'<option value="'+i+'"'+(i===m?' selected':'')+'>'+name+'</option>').join('')+'</select><label class="date-year"><input type="number" min="1" max="999" data-date-year="'+offset+'" aria-label="Year BC" value="'+(1000-y)+'"><span>BC</span></label><button data-date-nav="'+(offset+1)+'" aria-label="Next month">›</button></header><div class="date-month-grid">'+days+'</div></section>';
  }
  function calendarHTML(){
   const match=draft.operator==='matches',single=isSingle(),resolved=readRange();
   let body='';
   body=(match?'<label class="date-phrase-label">Date phrase<input type="text" data-date-phrase aria-label="Date phrase" placeholder="Any time, last 7 days, or exact BC dates" value="'+esc(draft.values.length<2&&!dateValue(draft.values[0])?draft.values[0]||'':'')+'"></label>':'')+'<div class="date-calendar-layout'+(match?' has-presets':'')+'">'+(match?'<nav class="date-presets" aria-label="Date presets">'+presets.map(([id,label])=>'<button data-date-preset="'+id+'" aria-pressed="'+(selectedPreset===id)+'">'+label+'</button>').join('')+'</nav>':'')+'<div class="date-calendars '+(single?'is-single':'')+'">'+monthHTML(0)+(single?'':monthHTML(1))+'</div></div>';
   body+='<div class="date-range-heading"><span>'+(single?'Date selected':'Range selected')+'</span>'+(selectedField()?.type==='datetime'?'<label><input type="checkbox" data-date-time-toggle'+(withTime?' checked':'')+'> Set time</label>':'')+'</div><div class="date-exact-inputs">'+[0,...(single?[]:[1])].map((i)=>'<label>'+(single?'Date':i?'To':'From')+'<input data-date-exact="'+i+'" aria-label="'+(single?'Date selected':i?'Range end':'Range start')+'" placeholder="dd.mm.yyy BC" value="'+esc(display(dateValue(draft.values[i])||(!resolved.error?(i?resolved.to?lastDay(resolved.to):null:resolved.from):null)))+'">'+(withTime?'<input type="time" data-date-clock="'+i+'" aria-label="'+(i?'End time':'Start time')+'" value="'+esc(String(draft.values[i]||'').slice(11,16)||'00:00')+'">':'')+'</label>').join(single?'':'<span aria-hidden="true">→</span>')+'</div>';
   return body;
  }
  function valueLabel(){
   if(draft.operator==='matches'&&(!draft.values.length||draft.values[0]==='any time'))return 'any time';
   if(!draft.values.length)return 'any time';
   if(draft.operator==='matches'&&draft.preset&&!['custom','fixed'].includes(draft.preset))return presets.find(([id])=>id===draft.preset)?.[1]||draft.preset;
   if(draft.values.length===2)return display(draft.values[0])+' → '+display(draft.values[1]);
   return display(dateValue(draft.values[0]))||draft.values[0]||'any time';
  }
  function html(){
   const calendar=hasCalendar(),relative=['last','next'].includes(draft.operator);
   const field='<button class="metric-select date-field-select" data-date-field><span class="field-type">▦</span>'+esc(selectedField()?.label||'Choose date field')+'<span>⌄</span></button>';
   const op='<select class="date-operator" data-date-operator aria-label="Date condition">'+operators.map(([id,label])=>'<option value="'+id+'"'+(draft.operator===id?' selected':'')+'>'+label+'</option>').join('')+'</select>';
   let body='';
   if(calendar)body='<button type="button" class="date-value-trigger" data-date-value aria-label="Choose date or range"><span>'+esc(valueLabel())+'</span><span aria-hidden="true">▦</span></button>';
   else if(relative){body='<input type="number" min="1" max="10000" data-date-count aria-label="Number of periods" placeholder="any value" value="'+esc(draft.values[0]||'')+'"><select data-date-unit aria-label="Period unit">'+['minute','hour','day','week','month','quarter','year'].filter(u=>selectedField()?.type==='datetime'||!['minute','hour'].includes(u)).map(unit=>'<option value="'+unit+'"'+((draft.modifier||'day')===unit?' selected':'')+'>'+unit+'s</option>').join('')+'</select><label class="date-include"><input type="checkbox" data-date-include'+(draft.includeCurrent?' checked':'')+'> '+(draft.operator==='next'?'From now':'Up to now')+'</label>';
   }else if(isTop()){body='<div class="date-rank-form"><label>'+ (draft.operator==='top_n'?'Top N':'Bottom N')+'<input type="number" min="1" max="1000" data-date-count aria-label="Number of dates" value="'+esc(draft.values[0]||'10')+'"></label><label>By value<button class="metric-select" data-date-by>'+esc(fields.find(f=>f.field===draft.by)?.label||'Not selected')+' <span>⌄</span></button></label><label>Logic<select data-date-rank-logic aria-label="Ranking logic">'+[['standard','Standard (1, 2, 2, 4)'],['dense','Dense (1, 2, 2, 3)']].map(([id,label])=>'<option value="'+id+'"'+((draft.logic||'standard')===id?' selected':'')+'>'+label+'</option>').join('')+'</select></label></div>';}
   return '<div class="date-condition-fields"><span>Select records where:</span>'+field+op+'</div><div class="date-condition-value">'+body+'</div><p class="date-resolved" role="status"></p><p class="date-coverage" role="status"></p><p class="condition-error" role="alert">'+esc(error)+'</p><footer class="date-filter-foot"><small>Click outside to apply</small>'+(onRemove?'<button class="nui-btn nui-btn--tertiary" data-date-remove>Clear</button>':'')+'<button class="nui-btn nui-btn--secondary" data-date-cancel>Cancel</button><button class="nui-btn nui-btn--primary" data-date-apply>Apply</button></footer>';
  }
  function preview(){if(!popup?.element.isConnected)return;const resolved=readRange(),status=popup.element.querySelector('.date-resolved'),alert=popup.element.querySelector('.condition-error'),warn=popup.element.querySelector('.date-coverage');status.textContent=isTop()?(draft.by?'Dates ranked by '+(fields.find(f=>f.field===draft.by)?.label||draft.by):'Choose a metric to rank the dates.'):(resolved.error?'Choose valid dates to preview the range.':resolved.label);warn.textContent=isTop()?'':warning(bounds,resolved.error?null:resolved);warn.hidden=!warn.textContent;alert.textContent=error;}
  function draw(){calendarPopup?.close();calendarPopup=null;popup.set(html());preview();}
  function drawCalendar(){if(calendarPopup?.element.isConnected)calendarPopup.set(calendarHTML());const label=popup.element.querySelector('.date-value-trigger>span');if(label)label.textContent=valueLabel();preview();}
  function openCalendar(anchor){if(calendarPopup?.element.isConnected){calendarPopup.close();calendarPopup=null;return;}popup.element.classList.add('is-picking-date');calendarPopup=U.open({anchor,title:'Choose dates',header:false,className:'date-calendar-pop',width:isSingle()?390: draft.operator==='matches'?820:650,html:calendarHTML(),focus:false,onClick,onChange,onInput,onClose(){calendarPopup=null;popup.element.classList.remove('is-picking-date');}});}
  function refreshCalendar(){
   const calendars=calendarPopup?.element.querySelector('.date-calendars');if(calendars){
    const year=calendars.querySelector('[data-date-year="0"]'),m=calendars.querySelector('[data-date-month="0"]');
    if(Number(year?.value)!==1000-month.getUTCFullYear()||Number(m?.value)!==month.getUTCMonth())calendars.innerHTML=monthHTML(0)+(isSingle()?'':monthHTML(1));
    else{const range=readRange(),from=range.from?.slice(0,10),to=range.to?lastDay(range.to):from;calendars.querySelectorAll('[data-date-day]').forEach(button=>{const day=button.dataset.dateDay,selected=!range.error&&!!from&&day>=from&&day<=to;button.classList.toggle('is-range',selected);button.classList.toggle('is-endpoint',selected&&(day===from||day===to));button.setAttribute('aria-pressed',selected);});}
   }drawCalendar();
  }
  function validate(){if(!selectedField()||!/date/.test(selectedField().type))throw Error('Choose a date field.');if(!isTop())NetherDateFilter.resolve(draft,{now});const materialized=NetherDateFilter.materialize({combinator:'and',children:[draft]},{now}),compiled=NetherFilterAql.compile(materialized,new Map(fields.map(f=>[f.field,{type:f.type,kind:f.kind==='dimension'?'dimension':'metric'}])));if(compiled.skipped.length)throw Error('Complete the date condition before applying.');return clone(draft);}
  function commit(){const next=validate();finished=true;popup.close();onSave?.(next);}
  function loadBounds(){bounds=null;const seq=++boundsSeq;coverage(dataset,draft.field).then(result=>{if(seq!==boundsSeq)return;bounds=result;preview();});}
  function onClick(e){const b=e.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-date-value')){openCalendar(b);return;}
   if(b.hasAttribute('data-date-cancel')){finished=true;popup.close();return;}
   if(b.hasAttribute('data-date-apply')){try{commit();}catch(e){error=e.message;preview();}return;}
   if(b.hasAttribute('data-date-remove')){finished=true;popup.close();onRemove?.();return;}
   if(b.hasAttribute('data-date-field')||b.hasAttribute('data-date-by')){const by=b.hasAttribute('data-date-by');U.pick({anchor:b,fields:fields.filter(f=>by?f.type==='number'&&f.kind!=='dimension':/date/.test(f.type)),used,onPick:f=>{if(by)draft.by=f.field;else{draft.field=f.field;loadBounds();}stamp();draw();}});return;}
   if(b.hasAttribute('data-date-nav')){const next=utc(month.getUTCFullYear(),month.getUTCMonth()+Number(b.dataset.dateNav));if(next.getUTCFullYear()<1||next.getUTCFullYear()>999)return;month=next;drawCalendar();return;}
   if(b.hasAttribute('data-date-preset')){selectedPreset=b.dataset.datePreset;draft.preset=selectedPreset;draft.values=['custom','fixed'].includes(selectedPreset)?[]:[selectedPreset];pickingEnd=false;stamp();if(!['custom','fixed'].includes(selectedPreset)){const range=readRange();if(range.from)month=utc(Number(range.from.slice(0,4)),Number(range.from.slice(5,7))-1);}drawCalendar();return;}
   if(b.hasAttribute('data-date-day')){const value=b.dataset.dateDay,time=withTime?' 00:00':'';if(isSingle())draft.values=[value+time];else if(!pickingEnd){draft.values=[value+time];pickingEnd=true;}else{draft.values.push(value+time);draft.values.sort();pickingEnd=false;}selectedPreset='fixed';draft.preset='fixed';stamp();drawCalendar();}
  }
  function onChange(e){const el=e.target;
   if(el.hasAttribute('data-date-phrase')){const resolved=readRange();if(!resolved.error){if(resolved.from)month=utc(Number(resolved.from.slice(0,4)),Number(resolved.from.slice(5,7))-1);refreshCalendar();calendarPopup?.element.querySelectorAll('[data-date-exact]').forEach(input=>input.value=display(Number(input.dataset.dateExact)?resolved.to?lastDay(resolved.to):null:resolved.from));}return;}
   if(el.hasAttribute('data-date-operator')){draft.operator=el.value;draft.values=isTop()?['10']:draft.operator==='matches'?['any time']:[];draft.modifier||='day';draft.logic||='standard';selectedPreset=draft.operator==='matches'?'any time':'';draft.preset=selectedPreset;pickingEnd=false;stamp();draw();return;}
   if(el.hasAttribute('data-date-month')||el.hasAttribute('data-date-year')){const offset=Number(el.dataset.dateMonth??el.dataset.dateYear),shown=utc(month.getUTCFullYear(),month.getUTCMonth()+offset),year=el.hasAttribute('data-date-year')?1000-Number(el.value):shown.getUTCFullYear(),m=el.hasAttribute('data-date-month')?Number(el.value):shown.getUTCMonth();if(year<1||year>999){error='Enter a BC year from 1 to 999.';preview();return;}month=utc(year,m-offset);drawCalendar();return;}
   if(el.hasAttribute('data-date-time-toggle')){withTime=el.checked;draft.values=draft.values.map(v=>dateValue(v)?String(v).slice(0,10)+(withTime?' 00:00':''):v);stamp();drawCalendar();return;}
   if(el.hasAttribute('data-date-exact')){const index=Number(el.dataset.dateExact),parsed=dateValue(el.value);draft.values[index]=parsed||(el.value.trim());if(withTime&&parsed&&!parsed.includes(' '))draft.values[index]=parsed+' 00:00';draft.preset=selectedPreset='fixed';stamp();if(e.type==='change'&&parsed){if(index===0)month=utc(Number(parsed.slice(0,4)),Number(parsed.slice(5,7))-1);el.value=display(parsed);refreshCalendar();}else preview();return;}
   if(el.hasAttribute('data-date-clock')){const index=Number(el.dataset.dateClock),date=dateValue(draft.values[index]);if(date)draft.values[index]=date.slice(0,10)+' '+el.value;stamp();preview();return;}
   if(el.hasAttribute('data-date-unit'))draft.modifier=el.value;
   else if(el.hasAttribute('data-date-include'))draft.includeCurrent=el.checked;
   else if(el.hasAttribute('data-date-rank-logic'))draft.logic=el.value;
   else return;stamp();preview();
  }
  function onInput(e){const el=e.target;if(el.hasAttribute('data-date-exact')||el.hasAttribute('data-date-clock'))return onChange(e);if(el.hasAttribute('data-date-phrase')){draft.values=[el.value];draft.preset=selectedPreset='';stamp();preview();}else if(el.hasAttribute('data-date-count')){draft.values=[el.value];stamp();preview();}}
  function open(){popup=U.open({anchor,title:'Date filter',header:false,className:'date-filter-pop',width:380,html:html(),focus:false,onClick,onChange,onInput,onOutside(){if(!dirty){finished=true;popup.close();return;}try{commit();}catch(e){error=e.message;preview();}},onClose(){if(finished||!dirty)return;try{const next=validate();finished=true;queueMicrotask(()=>onSave?.(next));}catch(e){error=e.message;queueMicrotask(()=>{if(anchor?.isConnected)open();});}}});popup.element.addEventListener('keydown',e=>{if(e.key==='Escape')finished=true;},true);preview();}
  open();loadBounds();return popup;
 }
 return {edit,coverage,warning,period,operators};
})();
