/* Resolve reader date choices once, in the realm calendar, before querying. No machine-clock dates. */
(()=>{
 'use strict';
 const root=typeof window==='undefined'?globalThis:window,DAY=86400000;
 const fail=message=>{throw Error(message);};
 function utc(y,m,d=1,h=0,mi=0){const date=new Date(0);date.setUTCFullYear(y,m,d);date.setUTCHours(h,mi,0,0);return date;}
 const iso=date=>String(date.getUTCFullYear()).padStart(4,'0')+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0');
 const stamp=(date,time=false)=>iso(date)+(time?' '+String(date.getUTCHours()).padStart(2,'0')+':'+String(date.getUTCMinutes()).padStart(2,'0'):'');
 function parse(value){
  const text=String(value??'').trim();let match=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z)?)?$/.exec(text),y,m,d,h,mi;
  if(match)[y,m,d,h,mi]=match.slice(1).map(v=>Number(v||0));
  else{match=/^(\d{1,2})\.(\d{1,2})\.(\d{1,3})(?:\s*BC)?(?:\s+(\d{2}):(\d{2}))?$/i.exec(text);if(!match)return null;d=+match[1];m=+match[2];y=1000-Number(match[3]);h=Number(match[4]||0);mi=Number(match[5]||0);}
  if(y<1||y>999||m<1||m>12||d<1||d>31||h>23||mi>59)return null;
  const date=utc(y,m-1,d,h,mi);if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;
  return stamp(date,!!match[4]);
 }
 function dateOf(value){const valueISO=parse(value);if(!valueISO)fail('Enter a valid date as dd.mm.yyy BC.');return new Date(valueISO.replace(' ','T')+(valueISO.length===10?'T00:00':':00')+'Z');}
 function current(){const V=root.NetherV4,c=V?.data.cases().find(c=>c.id===V.active);return root.NetherDate?.current(c||1)||'0547-06-21';}
 function shown(value){if(!value)return '';const [date,time]=String(value).split(' '),parts=date.split('-');return parts[2]+'.'+parts[1]+'.'+String(1000-Number(parts[0])).padStart(3,'0')+' BC'+(time?' '+time:'');}
 function edge(value,minutes=0){const text=String(value),d=new Date(text.replace(' ','T')+(text.length===10?'T00:00':':00')+'Z');d.setTime(d.getTime()+minutes*60000);return stamp(d,text.length>10||minutes%1440!==0);}
 function floor(date,unit){const y=date.getUTCFullYear(),m=date.getUTCMonth(),d=date.getUTCDate();if(unit==='year')return utc(y,0);if(unit==='quarter')return utc(y,Math.floor(m/3)*3);if(unit==='month')return utc(y,m);if(unit==='week')return utc(y,m,d-(date.getUTCDay()+6)%7);if(unit==='day')return utc(y,m,d);if(unit==='hour')return utc(y,m,d,date.getUTCHours());return utc(y,m,d,date.getUTCHours(),date.getUTCMinutes());}
 function shift(date,n,unit){const d=new Date(date);if(unit==='year'||unit==='quarter'||unit==='month'){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n*(unit==='year'?12:unit==='quarter'?3:1));const last=utc(d.getUTCFullYear(),d.getUTCMonth()+1,0).getUTCDate();d.setUTCDate(Math.min(day,last));}else d.setTime(d.getTime()+n*(unit==='week'?7*DAY:unit==='day'?DAY:unit==='hour'?3600000:60000));return d;}
 function formatRange({from,to,withTime=false}){
  if(!from&&!to)return 'Any time';
  const last=to?edge(to,withTime?-1:-1440):null;
  if(!from)return 'Before '+shown(to);
  if(!to)return 'From '+shown(from);
  return from===last?shown(from):shown(from)+' → '+shown(last);
 }
 function phraseRange(phrase,now){
  const text=String(phrase||'').trim().toLowerCase().replace(/\s+/g,' '),today=floor(now,'day'),tomorrow=shift(today,1,'day');
  if(['any time','all time','anytime'].includes(text))return {};
  if(text==='today')return {from:today,to:tomorrow};
  if(text==='yesterday')return {from:shift(today,-1,'day'),to:today};
  if(text==='month to date'||text==='mtd')return {from:floor(today,'month'),to:tomorrow};
  if(text==='year to date'||text==='ytd')return {from:floor(today,'year'),to:tomorrow};
  const relative=/^(last|next|this)\s*(?:(\d+)\s+)?(minute|hour|day|week|month|quarter|year)s?$/.exec(text);
  if(relative){const n=Number(relative[2]||1),unit=relative[3],start=floor(now,unit);if(n<1||n>10000)fail('Use a whole period count from 1 to 10000.');if(relative[1]==='this')return {from:start,to:shift(start,1,unit)};return relative[1]==='last'?{from:shift(start,-n,unit),to:start}:{from:shift(start,1,unit),to:shift(start,n+1,unit)};}
  const year=/^(\d{1,3})\s*bc$/i.exec(text);if(year){const y=1000-Number(year[1]);return {from:utc(y,0),to:utc(y+1,0)};}
  const parts=String(phrase).split(/\s+(?:to|until|–|—|-)\s+/i);if(parts.length===2){const a=dateOf(parts[0]),b=dateOf(parts[1]);return {from:a,to:/\suntil\s/i.test(phrase)?b:shift(b,1,'day')};}
  const exact=parse(phrase);if(exact){const from=dateOf(exact);return {from,to:shift(from,1,exact.length>10?'minute':'day')};}
  fail('Use exact BC dates, today, yesterday, last/next N periods, month to date, year to date, or any time.');
 }
 function resolve(node,{now=current()}={}){
  if(!node?.field)fail('Choose a date field.');
  const values=node.values||[],operator=node.operator||'matches',clock=dateOf(now),withTime=!!node.withTime;
  if(['is_null','not_null','top_n','bottom_n'].includes(operator))return {from:null,to:null,label:operator==='is_null'?'No date':operator==='not_null'?'Has a date':(operator==='top_n'?'Top ':'Bottom ')+(values[0]||'N')+' dates',tree:{...node,dateSpec:false},anyTime:false};
  let from,to;
  if(operator==='matches'){
   if(values.length===2){from=dateOf(values[0]);const end=dateOf(values[1]);to=shift(end,1,withTime?'minute':'day');}
   else({from,to}=phraseRange(values[0],clock));
  }else if(['last','next'].includes(operator)){
   const n=Number(values[0]),unit=node.modifier||'day';if(!/^\d+$/.test(String(values[0]))||n<1||n>10000)fail('Enter a whole period count from 1 to 10000.');if(!['minute','hour','day','week','month','quarter','year'].includes(unit))fail('Choose a valid period unit.');
   const start=floor(clock,unit);
   if(operator==='last'){from=shift(start,-n,unit);to=node.includeCurrent?shift(start,1,unit):start;}
   else{from=node.includeCurrent?clock:shift(start,1,unit);to=node.includeCurrent?shift(clock,n,unit):shift(start,n+1,unit);}
  }else if(['is_on','before','after','between'].includes(operator)){
   const a=dateOf(values[0]),unit=withTime?'minute':'day';
   if(operator==='before')to=a;
   if(operator==='after')from=shift(a,1,unit);
   if(operator==='is_on'){from=a;to=shift(a,1,unit);}
   if(operator==='between'){const b=dateOf(values[1]);from=a;to=shift(b,1,unit);}
  }else fail('Choose a supported date condition.');
  for(const d of [from,to])if(d&&(d.getUTCFullYear()<1||d.getUTCFullYear()>999)&&!(d===to&&stamp(d,true)==='1000-01-01 00:00'))fail('Choose dates within the realm calendar (001–999 BC).');
  if(from&&to&&from>=to)fail('The start must come before the end. BC years count down as time moves forward.');
  const time=withTime||[from,to].some(d=>d&&(d.getUTCHours()||d.getUTCMinutes()))||['hour','minute'].includes(node.modifier),a=from?stamp(from,time):null,b=to?stamp(to,time):null;
  const range={from:a,to:b,withTime:time};return {...range,label:formatRange(range),tree:!a&&!b?{combinator:'and',children:[]}:{field:node.field,operator:'date_range',values:[a,b],dateBoundary:true,withTime:time},anyTime:!a&&!b};
 }
 function materialize(tree,options){
  // Any time is true even inside OR/NOT groups; dropping it there would change the result.
  const yes=Symbol('any date'),no=Symbol('no date');let reference;
  function visit(node){
   if(!node)return node;
   if(node.dateSpec){const result=resolve(node,options);if(result.anyTime){reference||=node.field;return yes;}return result.tree;}
   if(!Array.isArray(node.children))return {...node};
   const parts=node.children.map(visit),or=node.combinator==='or';let result;
   if(parts.includes(or?yes:no))result=or?yes:no;
   else{const keep=parts.filter(n=>n!==(or?no:yes));result=!keep.length&&parts.length?(or?no:yes):{...node,children:keep};}
   if(node.negated&&(result===yes||result===no))result=result===yes?no:yes;
   return result;
  }
  const result=visit(tree);return result===yes?{combinator:'and',children:[]}:result===no?{field:reference,operator:'date_never',dateBoundary:true,values:[]}:result;
 }
 const api={parse,current,resolve,materialize,formatRange};if(typeof module!=='undefined')module.exports=api;else root.NetherDateFilter=api;
})();
