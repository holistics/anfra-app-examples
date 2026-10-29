/* Realm calendar: stored ISO years belong to a chronological epoch, not AD.
   Storage year Y reads as (1000-Y) BC: 0547-06-21 = 21.06.453 BC.
   Date queries/sorts use storage values; every human readout uses this module. */
window.NetherDate=(()=>{
 'use strict';
 const ERA='BC',EPOCH=1000,FIRST_DAY='0547-06-21';
 const iso=value=>/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(String(value??''));
 function valid(y,m,d){
  if(y<1||y>=EPOCH||m<1||m>12||d<1||d>31)return false;
  const date=new Date(0);date.setUTCFullYear(y,m-1,d);date.setUTCHours(0,0,0,0);
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
 }
 function fmt(value,options={}){
  const match=iso(value);if(!match||!valid(+match[1],+match[2],+match[3]))return value;
  return match[3]+'.'+match[2]+'.'+String(EPOCH-Number(match[1])).padStart(3,'0')+(options.era===false?'':' '+ERA);
 }
 /* A date as the grain it stands for. A drilled chart's dates are period STARTS, so printing one as a day misleads
    ("01.01.453 BC" for the whole year 453 BC). The readout follows the grain:
      year     453 BC            quarter  Q2 453 BC          month  06.453 BC
      week     13.04\u201319.04.453 BC (the seven days; across a New Year both years are written)
      day, none, anything else: the full date, as fmt. */
 function period(value,grain,options={}){
  const match=iso(value);if(!match||!valid(+match[1],+match[2],+match[3]))return value;
  const era=options.era===false?'':' '+ERA,y=+match[1],m=+match[2],d=+match[3],yy=n=>String(EPOCH-n).padStart(3,'0'),mm=n=>String(n).padStart(2,'0');
  if(grain==='year')return yy(y)+era;
  if(grain==='quarter')return 'Q'+(Math.floor((m-1)/3)+1)+' '+yy(y)+era;
  if(grain==='month')return mm(m)+'.'+yy(y)+era;
  if(grain==='week'){
   const end=new Date(0);end.setUTCFullYear(y,m-1,d+6);
   const ey=end.getUTCFullYear(),em=end.getUTCMonth()+1,ed=end.getUTCDate();
   return (ey===y?mm(d)+'.'+mm(m)+'\u2013'+mm(ed)+'.'+mm(em)+'.'+yy(y):mm(d)+'.'+mm(m)+'.'+yy(y)+' \u2013 '+mm(ed)+'.'+mm(em)+'.'+yy(ey))+era;
  }
  return fmt(value,options);
 }
 function toStorage(value){
  const match=/^(\d{1,2})\.(\d{1,2})\.(\d{1,3})(?:\s*BC)?$/i.exec(String(value??'').trim());
  if(!match)return null;
  const year=EPOCH-Number(match[3]),month=+match[2],day=+match[1];
  if(!valid(year,month,day))return null;
  return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 }
 function current(value=1){
  if(value&&typeof value==='object'&&iso(value.current_date))return value.current_date.slice(0,10);
  const day=Math.max(1,Math.floor(Number(value?.day??value)||1));
  const date=new Date(FIRST_DAY+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+day-1);
  return date.toISOString().slice(0,10);
 }
 return {fmt,period,compact:value=>fmt(value,{era:false}),current,toStorage,fromDisplay:toStorage,ERA,EPOCH,FIRST_DAY,
  explanation:'BC years count down as time moves forward: 454 BC comes before 453 BC. Within a year, days and months run normally. A permit is valid from its issue date through its expiry date.'};
})();
