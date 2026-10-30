/* The one outbound edge (AD-2). Nothing else in the app may touch Anfra.

   Three calls:
     ask(dataset, aql)      rows from the semantic layer
     describe(dataset)      models, fields and metrics, for the Books panel
     validate(dataset, aql) diagnostics, without running the query

   ask never throws and never returns a bare number. It answers one of three
   outcomes (AD-8), because a soul with no record and a soul with a record of
   zero are different findings and the game grades on the difference:

     { status:'rows',        rows, columns }   one or more rows
     { status:'empty',       rows: [],  … }    the query ran and found nothing
     { status:'unreachable', error,     … }    the query could not be answered

   A measure cell of 0 is a real zero inside status 'rows', never 'empty'. */
(() => {
 const READY = typeof Anfra !== 'undefined';
 const app = READY ? Anfra.createApp({title:'Ferryman’s Ledger', timezone:'Etc/UTC'}) : null;

 /* A query's AQL is fixed once declared, so one named query per distinct
    (dataset, aql). Asking the same question twice reuses it and costs nothing.

    The name is what the Inspect panel shows, so callers say what they are
    asking — `check-identity`, `writ-Houses-served`, `records-nether_person` —
    rather than leaving a tree full of `ask1`. */
 const queries = new Map();
 const taken = new Set();
 let minted = 0;

 function nameFor(label){
  const base = (label || 'ask').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'ask';
  if(!taken.has(base)){ taken.add(base); return base; }
  let name;
  do { name = base + '-' + (++minted); } while(taken.has(name));
  taken.add(name);
  return name;
 }

 /* Same-tick asks share one execute(); executes never overlap. The grader
    resolves four checks at once (AD-12), so this is the common path. */
 let tail = Promise.resolve(), pending = null;
 function flush(){
  if(!pending) pending = Promise.resolve().then(() => {
   pending = null;
   tail = tail.then(() => app.execute(), () => app.execute());
   return tail;
  });
  return pending;
 }

 function unreachable(dataset, aql, error, name){
  return {status:'unreachable', rows:[], columns:[], dataset, aql, error, query:name};
 }

 async function ask(dataset, aql, label){
  if(!READY) return unreachable(dataset, aql, new Error('The Anfra SDK is not present. This app has to be opened through `anfra serve`.'));
  const key = dataset + '\u0000' + aql;
  let query = queries.get(key);
  if(!query){
   try{
    query = app.createQuery(nameFor(label), {dataset, aql});
   }catch(error){
    return unreachable(dataset, aql, error);   // malformed AQL, unknown dataset
   }
   queries.set(key, query);
  }
  try{
   await flush();
  }catch(error){
   return unreachable(dataset, aql, error);
  }
  // execute() resolves whether or not this query succeeded, so ask the query.
  if(query.state !== 'success' || !query.result)
   return unreachable(dataset, aql, query.error || new Error('The query did not settle.'));
  const {rows, columns} = query.result;
  return {status: rows.length ? 'rows' : 'empty', rows, columns, dataset, aql, query: query.name};
 }

 /* One cell, for a question whose answer is a single number or value.

    Bind the subject as a DIMENSION, not only as a filter. A grand-total query
    answers for a soul who has no record in this Book at all with a row reading
    0 — the same answer it gives a soul who has a record and scored zero, which
    is the mistake AD-8 exists to stop:

      measures { v: patients_treated }
        filters { nether_person.person_id is 'P9999' }      -> [['0']]
      dimensions { subject: nether_person.person_id }
        measures { v: patients_treated }
        filters { nether_person.person_id is 'P9999' }      -> []

    With the soul in the dimensions, no record returns no rows and arrives here
    as 'empty', while a real zero returns a row reading 0 and arrives as 'rows'.
    Every bound question the generator and the Writ builder emit is shaped that
    way. A null cell — a ratio with nothing to divide — is 'empty' too. */
 async function askOne(dataset, aql, field, label){
  const answer = await ask(dataset, aql, label);
  if(answer.status !== 'rows') return answer;
  const name = field || answer.columns[0]?.name;
  const value = answer.rows[0][name];
  if(value === null || value === undefined) return {...answer, status:'empty', field: name};
  return {...answer, value, field: name};
 }

 function describe(dataset){
  if(!READY) return null;
  return Anfra.datasets[dataset] || Anfra.datasets[Object.keys(Anfra.datasets).find(k => k.endsWith('.' + dataset))] || null;
 }

 function books(){
  if(!READY) return [];
  return Object.values(Anfra.datasets);
 }

 /* Where a number comes from (G4: any number traces to its definition in one
    click). Returns null when the host cannot trace, which is not an error. */
 async function lineage(dataset, field){
  if(!READY || !Anfra.features?.lineage) return null;
  try{
   return await Anfra.lineage([{parent: dataset, child: field}]);
  }catch{
   return null;
  }
 }

 /* The generator validates its AQL at build time against core.query.validate;
    the Writ builder cannot. A data app is mounted in a sandboxed iframe at an
    opaque origin, so a raw fetch to the API is refused by CORS before it is
    sent — the SDK is genuinely the only way out. So a Writ is checked by
    trying it: a malformed one comes back 'unreachable' carrying the compiler's
    complaint, and a sound one leaves its result in the cache above, which the
    run that follows reuses for free. */
 async function validate(dataset, aql, label){
  const answer = await ask(dataset, aql, label);
  if(answer.status === 'unreachable')
   return {valid:false, diagnostics:[{message: String(answer.error?.message || answer.error), severity:'error'}]};
  return {valid:true, diagnostics:[]};
 }

 // Interactive analysis has its own SDK app, so changing its filters never
 // re-executes a case check or a Writ. Conditions stay out of the AQL text.
 const controlled = new Map();let activeAnalysis=null,analysisAppIndex=0;
 async function askControlled(plan){
  const {dataset,aql}=plan;
  if(!READY)return unreachable(dataset,aql,new Error('The Anfra SDK is not present.'));
  try{
   const filters=plan.filters||[],drills=(plan.dateDrills||[]).filter(d=>d.grain&&d.grain!=='none');
   const key=JSON.stringify([dataset,aql,filters.map(f=>f.field),drills.map(d=>d.field)]);
   let session=controlled.get(key);
   if(!session){
    const owner=Anfra.createApp({title:'Nether · Analysis',timezone:'Etc/UTC'}),appIndex=++analysisAppIndex;
    const query=owner.createQuery(nameFor(plan.label||'analysis'),{dataset,aql});
    const conditions=filters.map((filter,i)=>{const control=owner.createFilter('condition-'+i,{dataset,field:filter.field});owner.mapControl(control,query,{field:filter.field});return control;});
    const grains=drills.map((drill,i)=>{const control=owner.createDateDrill('grain-'+i,{default:drill.grain});owner.mapControl(control,query,{field:drill.field});return control;});
    session={owner,query,conditions,grains,logged:false,reference:appIndex+'/'+query.name};controlled.set(key,session);
   }
   if(activeAnalysis&&activeAnalysis!==session)activeAnalysis.owner.abort();activeAnalysis=session;
   filters.forEach((filter,i)=>session.conditions[i].setCondition({operator:filter.operator||'is',values:filter.values||[]}));
   drills.forEach((drill,i)=>session.grains[i].setGrain(drill.grain));
   session.query.setSort(plan.sort||[]);
   await session.owner.execute();
   if(session.query.state!=='success'||!session.query.result)return unreachable(dataset,aql,session.query.error||new Error('The analysis did not settle.'),session.query.name);
   const {rows,columns,meta,debug}=session.query.result;
   if(!session.logged){console.info('Nether analysis',{columns,firstRow:rows[0],executedAql:debug?.executedAql});session.logged=true;}
   return {status:rows.length?'rows':'empty',rows,columns,meta,debug,dataset,aql,query:session.query.name,queryName:session.reference};
  }catch(error){return unreachable(dataset,aql,error);}
 }
 const port = {ready: READY, ask, askOne, askControlled, describe, books, lineage, validate};
 if(typeof module !== 'undefined') module.exports = port; else window.NetherPort = port;
})();
