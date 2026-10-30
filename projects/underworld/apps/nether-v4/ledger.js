/* The Books, the souls and the papers they carry — all of it live.

   Replaces the fixture module. Nothing here invents a record: the Books and
   their fields come from Anfra.datasets, every row comes from a query through
   port.js, and the souls come from data/cases.json, which the generator wrote
   and which holds no answers (AD-3).

   The one thing this module does NOT do is decide anything. Grading lives in
   grade.js, and it asks the semantic layer. */
(() => {
 'use strict';
 const P = window.NetherPort;

 /* Which Book each ledger belongs to, and what to call them at the desk. The
    datasets carry their own labels, but the desk wants shorter ones and a
    sigil, and the order is the order a player meets them. */
 const BOOKS = [
  {id:'nether_identity',   title:'Identity',    symbol:'◈'},
  {id:'nether_property',   title:'Property',    symbol:'⌂'},
  {id:'nether_borrowings', title:'Library',     symbol:'📖'},
  {id:'nether_work',       title:'Work',        symbol:'⚒'},
  {id:'nether_healing',    title:'Healthcare',  symbol:'☤'},
  {id:'nether_arms',       title:'Battle',      symbol:'⚔'},
  {id:'nether_harvest',    title:'Agriculture', symbol:'🌾'},
  {id:'nether_rites',      title:'Religion',    symbol:'⌘'},
 ];

 // A ledger's own key. Every model's first text dimension is its primary key
 // in this schema, but saying so out loud is cheaper than trusting it.
 const KEYS = {
  nether_person:'person_id', nether_relationship:'relationship_id',
  nether_passage_permit:'permit_id', nether_obol_standard:'birthplace',
  nether_asset:'asset_id', nether_ownership_transaction:'txn_id',
  nether_business:'business_id',
  nether_employment:'employment_id', nether_ailment:'ailment_id',
  nether_patient_case:'patient_case_id', nether_campaign:'campaign_id',
  nether_service:'service_id', nether_casualty_record:'casualty_id',
  nether_estate:'estate_id', nether_holding:'holding_id',
  nether_harvest_record:'harvest_id', nether_temple:'temple_id',
  nether_offering:'offering_id', nether_oath:'oath_id',
  nether_library:'library_id', nether_book:'book_id', nether_book_copy:'copy_id',
  nether_library_card:'card_id', nether_borrowing_record:'borrow_id',
 };

 // What a foreign key points at. The relationships live in the AML, but the
 // SDK's descriptor does not hand them over, so the thread map reads this.
 const THREADS = {
  nether_relationship:{person_a_id:'nether_person', person_b_id:'nether_person'},
  nether_passage_permit:{person_id:'nether_person'},
  nether_ownership_transaction:{asset_id:'nether_asset', buyer_person_id:'nether_person', seller_person_id:'nether_person'},
  nether_employment:{person_id:'nether_person', business_id:'nether_business'},
  nether_patient_case:{healer_person_id:'nether_person', patient_person_id:'nether_person', ailment_id:'nether_ailment'},
  nether_service:{person_id:'nether_person', campaign_id:'nether_campaign'},
  nether_casualty_record:{campaign_id:'nether_campaign', killer_person_id:'nether_person', victim_person_id:'nether_person'},
  nether_holding:{person_id:'nether_person', estate_id:'nether_estate'},
  nether_harvest_record:{estate_id:'nether_estate'},
  nether_offering:{person_id:'nether_person', temple_id:'nether_temple'},
  nether_oath:{person_id:'nether_person'},
  nether_library_card:{person_id:'nether_person', library_id:'nether_library'},
  nether_book_copy:{book_id:'nether_book', library_id:'nether_library'},
  nether_borrowing_record:{card_id:'nether_library_card', copy_id:'nether_book_copy'},
 };

 // Foreign keys that may be empty: a first sale has no seller, a musician or a
 // poet works for no house, and a killing outside battle has no campaign.
 const NULLABLE = new Set(['nether_employment.business_id', 'nether_ownership_transaction.seller_person_id',
  'nether_casualty_record.campaign_id']);

 const state = {books:[], schema:{}, cases:[], mints:[], build:null, ready:false,
  mode: typeof window !== 'undefined' && /nether-mode=hard/.test(window.name || '') ? 'hard' : 'easy'};

 // What a metal looks like on a struck coin, and where a mint sits on the
 // guide's map. Both are presentation: the metal and the place are the facts,
 // the colour and the pin are how the desk draws them.
 const TONE = {silver:'#c1bfae', bronze:'#ba9763', electrum:'#c4aa64'};
 const pin = i => ({x: 16 + (i % 3) * 32 + (i % 2) * 6, y: 20 + Math.floor(i / 3) * 26});

 /* ------------------------------------------------------------------ schema */

 function readSchema(){
  // The instruction book reads mint standards without exposing another
  // browsable Book of Truth. Its schema is still needed by rows().
  for(const book of [...BOOKS,{id:'nether_mint'}]){
   const descriptor = P.describe(book.id);
   if(!descriptor) continue;
   book.models = [];
   book.label = descriptor.label || book.title;
   book.metrics = (descriptor.metrics || []).map(m => ({...m}));
   for(const model of descriptor.data_models || []){
    book.models.push(model.name);
    if(state.schema[model.name]) continue;
    const key = KEYS[model.name];
    const threads = THREADS[model.name] || {};
    state.schema[model.name] = {
     id: model.name,
     name: model.label || model.name,
     fields: (model.fields || [])
      .filter(f => !f.is_custom_measure)
      .map(f => ({
       id: f.name,
       label: f.label || f.name,
       type: f.type || 'text',
       key: f.name === key ? 'PK' : (threads[f.name] ? 'FK' : null),
       references: threads[f.name] ? threads[f.name] + '.' + KEYS[threads[f.name]] : null,
       description: f.label || f.name,
      })),
     measures: (model.fields || []).filter(f => f.is_custom_measure)
      .map(f => ({id:f.name, label:f.label || f.name})),
    };
   }
  }
  state.books = BOOKS.filter(b => b.models && b.models.length);
 }

 /* -------------------------------------------------------------------- rows */

 const quote = v => "'" + String(v).replace(/'/g, "''") + "'";

 /* A ledger's rows, as a query against its Book. This is the record explorer's
    only way to see anything, so what the player browses and what the game
    grades on are the same semantic layer, reached the same way. */
 async function rows(book, model, options = {}){
  const schema = state.schema[model];
  if(!schema) return {status:'unreachable', rows:[], error:new Error('no such ledger: ' + model)};
  const selected = schema.fields
   .map(f => `    ${f.id}: ${model}.${f.id},`).join('\n');
  const clauses = [];
  if(options.field && options.value !== undefined && options.value !== '')
   clauses.push(`${model}.${options.field} is ${quote(options.value)}`);
  if(options.contains && options.containsField)
   clauses.push(`${model}.${options.containsField} ilike ${quote('%' + options.contains + '%')}`);
  const filters = clauses.length ? `  filters { ${clauses.join('\n    and ')} }\n` : '';
  const key = KEYS[model];
  const sorts = key ? `  sorts { ${key} asc }\n` : '';
  const aql = `explore {\n  dimensions {\n${selected}\n  }\n${filters}${sorts}}`;
  return P.ask(book, aql, 'records-' + model);
 }

 /* --------------------------------------------------------------- the souls */

 /* The generator wrote the papers; the desk wants them in the shape its
    documents already render. Nothing is recomputed here — a claimed value is
    carried across exactly as it was written (AD-4). */
 function dressCase(raw, index){
  const d = raw.documents.declaration, permit = raw.documents.permit;
  const support = raw.checks.find(c => c.check === 'support');   // only the last soul still carries one
  const obol = raw.documents.obol;
  return {
   id: raw.case_id.toLowerCase(),
   caseId: raw.case_id,
   index,
   day: raw.day,
   current_date: raw.current_date || NetherDate.current(raw.day),
   phase: raw.phase,
   gate: raw.gate,
   name: raw.soul_name,
   personId: raw.person_id,
   occupation: raw.occupation,
   paper: {name:d.name, birthdate:d.birthdate, birthplace:d.birthplace, identity_id:d.identity_id, issue_place:d.issue_place},
   permit: {
    permit_id: permit.permit_id, seal: permit.seal,
    issued_date: permit.issued_on, expires_on: permit.expires_on,
   },
   // The papers beyond identity, permit and obol, in the order they lie on the desk. Each carries its
   // document exactly as the generator wrote it, so the paper and the grader read one copy.
   band: raw.band, slot: raw.slot,
   papers: (raw.papers || []).map(p => ({id: p.id, type: p.type, kind: p.kind, doc: raw.documents[p.id]})),
   support: support && {
    claim: support.claim,
    id: Object.values(support.bind || {})[0] || '—',
    model: support.ledger,
    dataset: support.dataset,
   },
   coin: obol && {
    symbol: obol.emblem, mark: obol.mint_mark,
    rim: obol.rim, metal: obol.metal, tone: TONE[obol.metal] || '#b9b8a4',
    description: `${obol.emblem} · ${obol.mint_mark} mint mark · ${obol.rim} ${obol.metal} rim`,
   },
   // Kept for the ledger screen's "was that call right?" badge. The verdict
   // the player is graded against is computed from the Books, not from here.
   legit: raw.required_verdict === 'approve',
   requiredVerdict: raw.required_verdict,
   // The papers exactly as the generator wrote them. The desk renders the
   // dressed copies above; the grader reads these, so a claimed value has one
   // source and the two can never drift apart.
   documents: raw.documents,
   checks: raw.checks,
   question: raw.question,
   questions: raw.checks.map(c => ({id:c.check, text:c.prompt})),
  };
 }

 /* ---------------------------------------------------------------- the mint */

 /* The mint guide is a reference table the player has to find, so it is read
    from the Book like everything else rather than shipped as a constant. */
 async function readMints(){
  const answer = await rows('nether_mint', 'nether_obol_standard');
  if(answer.status !== 'rows') return [];
  return answer.rows.map((r, i) => ({
   country: r.birthplace, symbol: r.emblem, mark: r.mint_mark,
   locations: [r.issue_location_1,r.issue_location_2,r.issue_location_3].filter(Boolean),
   rim: r.rim, metal: r.metal, tone: TONE[r.metal] || '#b9b8a4', map: pin(i),
   description: `${r.emblem} · ${r.mint_mark} mint mark · ${r.rim} ${r.metal} rim`,
  }));
 }

 /* One real row query per model of every Book, fired once at boot so the
    whole semantic layer shows up in the host's Inspect panel from the start
    — not just the two the game itself happens to ask on load (the register
    and the mint guide), and not just one model standing in for its Book.
    Healthcare means Person, Ailment and Patient Case all present, not
    Ailment alone. Never blocks or fails boot: this is for the inspector,
    not for play. */
 async function warmUp(){
  await Promise.allSettled(
   state.books.flatMap(book => book.models.map(model => rows(book.id, model))));
 }

 /* -------------------------------------------------------------------- boot */

 /* AD-14: without a live Anfra there is no game, and a degraded one that shows
    blanks would be worse than none. Fail where a developer can see it. */
 async function boot(){
  if(!P || !P.ready)
   throw new Error('NETHER needs a live Anfra. Open it through `anfra serve`, not as a file.');

  readSchema();
  if(!state.books.length)
   throw new Error('The Books are missing. Run `anfra validate` and check datasets/nether_*.dataset.aml.');

  // Loaded by a script tag, not fetched: see the note in the generator.
  // Two games: hard (ten days of five) and easy (five days of four). Which one is chosen before the
  // page loads (see setMode), because a run cannot change its souls half way through.
  const payload = state.mode === 'easy' ? window.NetherCasesEasy : window.NetherCases;
  if(!payload) throw new Error('data/cases' + (state.mode === 'easy' ? '-easy' : '') + '.js is missing. Run scripts/generate_nether_cases.py.');
  state.build = payload.build_id;
  state.cases = payload.cases.map(dressCase);

  // AD-9: the cases and the world must come from the same build.
  const stamp = await P.ask('nether_identity',
   "explore { dimensions { n: nether_person.person_id } sorts { n asc } }",
   'the-register');
  if(stamp.status === 'unreachable')
   throw new Error('The Book of Truth will not answer. Is the `nether` data source configured?');

  state.mints = await readMints();
  await warmUp();
  state.ready = true;
  return state;
 }

 const api = {
  boot, rows, books:() => state.books, schema:() => state.schema,
  // The last soul is not generated and is not in cases.js; she is read out of
  // the Books when the game reaches her, and joins the ledger then.
  addCase(soul){ state.cases.push(soul); return soul; },
  cases:() => state.cases, mints:() => state.mints, build:() => state.build,
  mode:() => state.mode,
  /* What the Book calls a field, and the model it belongs to: 'nether_business.name' is Name of Business. A paper names its
     lines in these words so the player can find the column. A metric (a bare name) is 'Metric'. null if the Book has no such field. */
  fieldLabel(cat){
   if(typeof cat !== 'string') return null;
   if(cat.includes('.')){
    const [model, field] = cat.split('.');
    return state.schema[model]?.fields.find(f => f.id === field)?.label || null;
   }
   for(const book of [...BOOKS, {id:'nether_mint'}]){
    const metric = (book.metrics || []).find(m => m.name === cat);
    if(metric) return metric.label || metric.name;
   }
   return null;
  },
  modelLabel(cat){
   if(typeof cat !== 'string') return null;
   if(cat.includes('.')) return state.schema[cat.split('.')[0]]?.name || null;
   return this.fieldLabel(cat) ? 'Metric' : null;
  },
  /* Before boot only. The page passes the mode through window.name, which survives a reload of a
     sandboxed frame when nothing else (storage, the address) can. */
  setMode(mode){ state.mode = mode === 'easy' ? 'easy' : 'hard'; },
  primary: model => KEYS[model],
  threads: model => THREADS[model] || {},
  relationships(bookId){
   const book = state.books.find(b => b.id === bookId);
   if(!book) return [];
   return book.models.flatMap(model =>
    Object.entries(THREADS[model] || {})
     .filter(([, target]) => book.models.includes(target))
     .map(([field, target]) => ({from: model + '.' + field, to: target + '.' + KEYS[target],
      nullable: NULLABLE.has(model + '.' + field)})));
  },
 };
 if(typeof module !== 'undefined') module.exports = api; else window.NetherLedger = api;
})();
