/* Read the game's actual definitions before constructing any wiki entries.
   The catalog is an offline fallback for AML metadata only. No queries run. */
(() => {
 'use strict';
 const catalog=window.NetherWikiCatalog;
 function schedule(payload){
  const cases=payload?.cases||[],days=new Map();
  for(const c of cases){
   if(!days.has(c.day))days.set(c.day,{day:c.day,phase:c.phase,cases:[],papers:[]});
   const day=days.get(c.day);day.cases.push(c.case_id);
   for(const p of c.papers||[])if(!day.papers.includes(p.type))day.papers.push(p.type);
  }
  return {cases:cases.length,days:[...days.values()].sort((a,b)=>a.day-b.day)};
 }
 catalog.modes={hard:schedule(window.NetherCases),easy:schedule(window.NetherCasesEasy)};
 catalog.examples={};
 for(const payload of [window.NetherCases,window.NetherCasesEasy])for(const c of payload?.cases||[])for(const p of c.papers||[]){
  if(!catalog.examples[p.type])catalog.examples[p.type]={case:c.case_id,id:p.id,type:p.type,doc:c.documents[p.id]};
 }
 // Prefer the same live metadata the game sees. Descriptions are not part of
 // the SDK descriptor, so retain descriptions from the generated AML snapshot.
 const descriptors=typeof Anfra==='undefined'?{}:Anfra.datasets;
 const describe=id=>descriptors[id]||Object.entries(descriptors).find(([key])=>key.endsWith('.'+id))?.[1];
 for(const book of catalog.books){
  const source=describe(book.dataset);if(!source)continue;
  book.title=source.label||book.title;
  const oldModels=new Map(book.models.map(m=>[m.id,m])),oldMetrics=new Map(book.metrics.map(m=>[m.id,m]));
  book.models=(source.data_models||[]).map(model=>{
   const title=model.label||model.name;
   for(const field of model.fields||[])catalog.fields[model.name+'.'+field.name]={label:field.label||field.name,model:title};
   return {id:model.name,title,description:oldModels.get(model.name)?.description||''};
  });
  book.metrics=(source.metrics||[]).map(metric=>{
   const title=metric.label||metric.name;catalog.fields[metric.name]={label:title,model:'Metric'};
   return {id:metric.name,title,description:oldMetrics.get(metric.name)?.description||''};
  });
 }
 catalog.endings=Object.entries(NetherFinale.ENDINGS).map(([id,ending])=>({id,...ending}));
 catalog.rules=NetherEconomy.reference;
 catalog.seals=NetherEconomy.SEALS.map(({n,judge,need})=>({n,judge,need}));
 catalog.papers=Object.entries(NetherPapers.TYPES).filter(([,spec])=>!spec.legacy).map(([id,spec])=>({id,label:spec.label,fields:spec.fields.map(f=>({key:f.key,cat:f.cat,label:f.label}))}));
 window.NetherWikiSync={schedule};
})();
