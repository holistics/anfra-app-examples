/* A Writ: a measure the player names once and uses afterwards.

   AD-7: a Writ composes governed metrics. The player chooses a metric that
   ships in the AML, narrows it, names it — and the app writes AQL that refers
   to that metric. It never computes the measure itself, which is the whole
   reason a judge can later ask for a Writ by name and get the same number.

   AD-1: no arithmetic on warehouse data here. A ratio of two Writs is divided
   inside one query, not in JavaScript.

   The amendment lives here too. Changing a Writ changes every number derived
   from it, and `recompute` re-asks the Books rather than adjusting anything it
   remembers — which is why past verdicts can move. */
(() => {
 'use strict';
 const P = window.NetherPort;

 /* When a Book records *when* something happened, and on which ledger.

    Several Books do not, and that is left honest rather than papered over: a
    casualty carries no date, so "in their last ten years" cannot be asked of
    a killing. The Book's shape decides what can be asked,
    and the desk says so instead of quietly answering something adjacent. */
 const WHEN = {
  souls_bonded:'nether_relationship.bonded_from',
  permits_held:'nether_passage_permit.issued_on',
  assets_acquired:'nether_ownership_transaction.transacted_on',
  total_paid:'nether_ownership_transaction.transacted_on',
  employers:'nether_employment.started_on',
  years_employed:'nether_employment.started_on',
  patients_treated:'nether_patient_case.treated_on',
  patients_recovered:'nether_patient_case.treated_on',
  recovery_rate:'nether_patient_case.treated_on',
  souls_killed:null,              // casualty_record keeps no date
  killed_in_battle:null,
  killed_outside_battle:null,
  total_yield:null,               // a harvest keeps a season, not a day
  harvests_recorded:null,
  average_yield:null,             // a ratio of two grains; a window would mislead
  offerings_made:'nether_offering.offered_on',
  oaths_sworn:'nether_oath.sworn_on',
  oaths_broken:'nether_oath.sworn_on',
 };

 const OPS = [
  {id:'is', label:'is'}, {id:'is not', label:'is not'},
  {id:'>', label:'is more than'}, {id:'<', label:'is less than'},
 ];

 const shelf = new Map();   // name -> spec. In memory only (AD-6).
 const quote = v => "'" + String(v).replace(/'/g, "''") + "'";

 /* ------------------------------------------------------------- the pieces */

 function metricsFor(dataset){
  const book = P.describe(dataset);
  return book ? (book.metrics || []).map(m => ({...m, windowable: !!WHEN[m.name]})) : [];
 }

 /* Dimensions a Writ may be narrowed by: a Book's own columns, minus the keys,
    which are plumbing rather than anything a judge would ask about. */
 function dimensionsFor(dataset){
  const book = P.describe(dataset);
  if(!book) return [];
  const out = [];
  for(const model of book.data_models || [])
   for(const field of model.fields || []){
    if(field.is_custom_measure) continue;
    if(/_id$/.test(field.name)) continue;
    out.push({id:model.name + '.' + field.name, label:(model.label||model.name) + ' · ' + (field.label||field.name), type:field.type});
   }
  return out;
 }

 function whenFieldFor(spec){
  return WHEN[spec.base] || null;
 }

 /* --------------------------------------------------------------- emission */

 /* One spec as a measure expression. Everything a Writ narrows by lands in
    `where`, so the narrowing applies to the measure rather than to the query,
    and two Writs can therefore sit in one query without fighting. */
 function expression(spec){
  if(spec.compose){
   const over = shelf.get(spec.compose.numerator), under = shelf.get(spec.compose.denominator);
   if(!over || !under) throw new Error('A Writ this one is built on is missing.');
   if(over.dataset !== under.dataset)
    throw new Error('Both halves must come from the same Book.');
   return '(' + expression(over) + ') * 1.0 / (' + expression(under) + ')';
  }
  // A condition the player has not finished typing is not a condition. Left
  // in, it would compile to `is ''` and quietly match nothing, which is the
  // worst of both worlds: a Writ that looks narrowed and answers zero.
  const stated = (spec.filters || []).filter(f =>
   f.op === 'is null' || f.op === 'is not null' || String(f.value ?? '').trim() !== '');
  const conditions = stated.map(f =>
   f.op === 'is null' || f.op === 'is not null'
    ? `${f.field} ${f.op}`
    : `${f.field} ${f.op} ${isFinite(f.value) && f.value !== '' ? f.value : quote(f.value)}`);
  if(spec.window && spec.window.years){
   const when = whenFieldFor(spec);
   if(!when) throw new Error('This Book does not record when, so it cannot be asked about a span of years.');
   conditions.push(`date_diff('year', ${when}, nether_person.death_date) < ${Number(spec.window.years)}`);
  }
  return conditions.length ? `${spec.base} | where(${conditions.join(' and ')})` : spec.base;
 }

 /* A Writ is subject-agnostic. It becomes a number only when it is bound to a
    soul, and the desk appends that binding — the player never writes it.

    The soul goes in `dimensions`, not only in `filters`: bound as a filter
    alone, a soul with no record in this Book answers 0, which is the same
    thing it answers for a soul who has a record and scored nothing. */
 function emit(spec, personId){
  const measure = expression(spec);
  const binding = personId ? `  filters { nether_person.person_id is ${quote(personId)} }\n` : '';
  return `explore {\n  dimensions { subject: nether_person.person_id }\n`
       + `  measures { value: ${measure} }\n${binding}}`;
 }

 /* What the Writ says, in words, for the shelf and the judge's request. */
 function describe(spec){
  if(spec.compose) return `${spec.compose.numerator} over ${spec.compose.denominator}`;
  const book = P.describe(spec.dataset);
  const metric = (book?.metrics || []).find(m => m.name === spec.base);
  let text = metric ? metric.label : spec.base;
  for(const f of spec.filters || []) text += `, where ${f.field.split('.').pop()} ${f.op} ${f.value}`;
  if(spec.window?.years) text += `, in their last ${spec.window.years} years`;
  return text;
 }

 /* ----------------------------------------------------------------- the shelf */

 function save(name, spec){
  if(!name || !name.trim()) throw new Error('A Writ needs a name before it can be used again.');
  const clean = {...spec, name:name.trim()};
  expression(clean);                       // refuses to shelve one that cannot be written
  shelf.set(clean.name, clean);
  return clean;
 }

 function amend(name, changes){
  const existing = shelf.get(name);
  if(!existing) throw new Error(`No Writ named ${name}.`);
  const next = {...existing, ...changes, name};
  expression(next);
  shelf.set(name, next);
  return next;
 }

 const get = name => shelf.get(name);
 const all = () => [...shelf.values()];
 const forget = name => shelf.delete(name);

 /* ------------------------------------------------------------------ asking */

 async function run(spec, personId){
  let aql;
  try{ aql = emit(spec, personId); }
  catch(error){ return {status:'unreachable', error, value:null}; }
  const answer = await P.askOne(spec.dataset, aql, 'value', 'writ-' + (spec.name || 'draft'));
  return {...answer, aql};
 }

 /* Check a Writ before it is offered to a judge. Running it is the check: a
    malformed one comes back unreachable with the compiler's complaint, and a
    sound one leaves its answer in the port's cache for the run that follows. */
 async function validate(spec, personId){
  const answer = await run(spec, personId);
  if(answer.status === 'unreachable')
   return {valid:false, why:String(answer.error?.message || answer.error)};
  return {valid:true, why:null, status:answer.status};
 }

 /* ------------------------------------------------------------- the amendment */

 /* The beat the whole entry is built around.

    A Writ is amended, and every case already judged with it is asked again —
    not adjusted, asked. The numbers come back from the Books under the new
    definition, and some of them are different, and some of those change what
    the verdict should have been.

    AD-12: the whole recompute resolves as a read-only projection before
    anything is committed. The caller gets a diff and decides. */
 async function recompute(name, judged){
  const spec = shelf.get(name);
  if(!spec) throw new Error(`No Writ named ${name}.`);
  const affected = judged.filter(g => g.writ === name);
  const answers = await Promise.all(affected.map(g => run(spec, g.personId)));
  if(answers.some(a => a.status === 'unreachable'))
   return {status:'unreachable', changed:[], unchanged:0};
  const changed = [];
  let unchanged = 0;
  affected.forEach((g, i) => {
   const after = answers[i].status === 'rows' ? answers[i].value : null;
   if(String(g.answer) === String(after)){ unchanged++; return; }
   changed.push({...g, before:g.answer, after});
  });
  return {status:'rows', changed, unchanged, spec};
 }

 const api = {
  metricsFor, dimensionsFor, whenFieldFor, OPS,
  expression, emit, describe, validate, run,
  save, amend, get, all, forget, shelf:() => shelf,
  recompute,
 };
 if(typeof module !== 'undefined') module.exports = api; else window.NetherWrit = api;
})();
