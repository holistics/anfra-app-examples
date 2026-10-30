/* The player's records remain queryable clues, but she is no longer placed
   in the arriving-soul queue. Minos's choice and Orpheus's petition now close
   the story. The data reads below preserve the four personal record fragments. */
(() => {
 'use strict';
 const P = window.NetherPort, G = window.NetherGrade,
       esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

 const PLAYER = 'P0001';
 const one = rows => (rows && rows[0]) || {};

 /* Read her four record fragments for inventory clues. The returned object is
    never inserted into the playable queue. */
 async function build(){
  const person = await P.ask('nether_identity',
   "explore {\n  dimensions {\n    person_id: nether_person.person_id,\n"
   + "    name: nether_person.name,\n    birthdate: nether_person.birthdate,\n"
   + "    identity_id: nether_person.identity_id,\n    issue_place: nether_person.issue_place,\n"
   + "    birthplace: nether_person.birthplace,\n    death_date: nether_person.death_date,\n  }\n"
   + `  filters { nether_person.person_id is '${PLAYER}' }\n}`);
  if(person.status !== 'rows') return null;
  const me = one(person.rows);

  const permit = await P.ask('nether_identity',
   "explore {\n  dimensions {\n    permit_id: nether_passage_permit.permit_id,\n"
   + "    seal: nether_passage_permit.seal,\n    issued_on: nether_passage_permit.issued_on,\n"
   + "    expires_on: nether_passage_permit.expires_on,\n    status: nether_passage_permit.status,\n  }\n"
   + `  filters { nether_passage_permit.person_id is '${PLAYER}' }\n}`);
  if(permit.status !== 'rows') return null;
  const pass = one(permit.rows);

  const standard = await P.ask('nether_mint',
   "explore {\n  dimensions {\n    emblem: nether_obol_standard.emblem,\n"
   + "    mint_mark: nether_obol_standard.mint_mark,\n    rim: nether_obol_standard.rim,\n"
   + "    metal: nether_obol_standard.metal,\n  }\n"
   + `  filters { nether_person.person_id is '${PLAYER}' }\n}`);
  const coin = standard.status === 'rows' ? one(standard.rows) : null;

  const bond = await P.ask('nether_identity',
   "explore {\n  dimensions {\n    relationship_id: nether_relationship.relationship_id,\n"
   + "    bond_type: nether_relationship.bond_type,\n    bonded_from: nether_relationship.bonded_from,\n  }\n"
   + `  filters { nether_relationship.person_a_id is '${PLAYER}' }\n}`);
  const marriage = bond.status === 'rows' ? one(bond.rows) : {};

  // A permit shown as expired creates a visible disagreement now that status
  // is absent from the papers. Keep issue before expiry, as in every case.
  const issuedDate=new Date(String(pass.issued_on).slice(0,10)+'T00:00:00Z');
  issuedDate.setUTCDate(issuedDate.getUTCDate()+1);
  const claimedExpiry=issuedDate.toISOString().slice(0,10);
  const documents = {
   declaration: {doc_type:'declaration', name:me.name,
                 birthdate:me.birthdate, birthplace:me.birthplace,
                 identity_id:me.identity_id,issue_place:me.issue_place},
   // The papers she is holding say she is waiting to cross. The register does
   // not agree, and never has.
   permit: {doc_type:'permit', permit_id:pass.permit_id, seal:pass.seal,
            issued_on:pass.issued_on, expires_on:claimedExpiry},
   obol: coin && {doc_type:'obol', emblem:coin.emblem, mint_mark:coin.mint_mark,
                  rim:coin.rim, metal:coin.metal},
   support: null,
  };

  const checks = [
   {check:'identity', kind:'record', doc:'declaration', dataset:'nether_identity',
    ledger:'nether_person', bind:{person_id:PLAYER}, absent_is_conflict:true,
    prompt:'Do the personal details match the Book of Truth?',
    aql: person.aql,
    compare:[{doc_field:'name',record_field:'name'},
             {doc_field:'birthdate',record_field:'birthdate'},
             {doc_field:'identity_id',record_field:'identity_id'},
             {doc_field:'issue_place',record_field:'issue_place'},
             {doc_field:'birthplace',record_field:'birthplace'}]},
   {check:'permit', kind:'record', doc:'permit', dataset:'nether_identity',
    validity:{issued:'issued_on',expires:'expires_on'},
    ledger:'nether_passage_permit', bind:{permit_id:pass.permit_id}, absent_is_conflict:true,
    prompt:'Is the permit valid and correctly sealed?',
    aql: permit.aql,
    compare:[{doc_field:'seal',record_field:'seal'},
             {doc_field:'issued_on',record_field:'issued_on'},
             {doc_field:'expires_on',record_field:'expires_on'}]},
   {check:'support', kind:'record', doc:'support', dataset:'nether_identity',
    ledger:'nether_relationship', bind:{relationship_id:marriage.relationship_id},
    absent_is_conflict:true,
    prompt:'Does the supporting record confirm the identity?',
    claim:'I was married. The name has been struck out.',
    document:{bond_type:marriage.bond_type},
    aql: bond.aql,
    compare:[{doc_field:'bond_type',record_field:'bond_type'}]},
   {check:'obol', kind:'record', doc:'obol', dataset:'nether_mint',
    ledger:'nether_obol_standard', bind:{person_id:PLAYER}, absent_is_conflict:true,
    prompt:'Does the obol match the birthplace’s mint?',
    aql: standard.aql,
    compare:[{doc_field:'emblem',record_field:'emblem'},
             {doc_field:'mint_mark',record_field:'mint_mark'},
             {doc_field:'rim',record_field:'rim'},
             {doc_field:'metal',record_field:'metal'}]},
  ];
  documents.support = checks[2];

  return {
   id:'finale', caseId:'FINALE', index:-1, day:0, current_date:NetherDate.current(11),phase:'finale',
   gate:'East', personId:PLAYER, soul_name:me.name, name:me.name,
   occupation:null, requiredVerdict:'dispute', legit:false,
   paper:{name:me.name, birthdate:me.birthdate, birthplace:me.birthplace,identity_id:me.identity_id,issue_place:me.issue_place},
   permit:{permit_id:pass.permit_id, seal:pass.seal, issued_date:pass.issued_on,
           expires_on:claimedExpiry},
   support:{claim:checks[2].claim, id:marriage.relationship_id,
            model:'nether_relationship', dataset:'nether_identity'},
   coin: coin && {symbol:coin.emblem, mark:coin.mint_mark, rim:coin.rim,
                  metal:coin.metal, tone:'#c1bfae',
                  description:`${coin.emblem} · ${coin.mint_mark} mint mark · ${coin.rim} ${coin.metal} rim`},
   documents, checks, question:null,
   // Her one paper beyond the three, a marriage the name has been struck out of: the only supporting claim left.
   papers:[{id:'support',type:'support',kind:'lookup',doc:null}],
   questions: checks.map(c => ({id:c.check, text:c.prompt})),
   deathDate: me.death_date,
   filedRecords:{birth:{...me},marriage:{...marriage},passage:{...pass}},
  };
 }

 /* Legacy record display retained for archival development previews. */
 function filingScreen(soul){
  const line = (what, says) => '<tr><td>' + what + '</td><td>' + esc(says) + '</td></tr>';
  return '<div data-anfra-block="filed-records" data-anfra-label="Her own records, for filing" class="overlay-body filing">'
   + '<p>A clerk sets four records on the desk. For filing, he says. He does not '
   + 'say whose, and he does not wait.</p>'
   + '<table class="result-table filing-table"><tbody>'
   + line('Birth', soul.paper.name + ', of ' + soul.paper.birthplace + ', born ' + NetherDate.fmt(soul.paper.birthdate))
   + line('Marriage', 'Married. The spouse’s name has been struck out.')
   + line('Death', 'Died ' + NetherDate.fmt(soul.deathDate))
   + line('Passage', 'Permit ' + soul.permit.permit_id + ' — already redeemed')
   + '</tbody></table>'
   + '<p class="filing-note">The shift continues.</p></div>';
 }

 /* Orpheus's petition uses the same record-backed checks as the desk. */
 const FIELDS = [
  {id:'name', label:'Name', hint:'Enter the soul’s name'},
  {id:'occupation', label:'Occupation', hint:'Choose an occupation'},
  {id:'relationship', label:'Relationship', hint:'Choose a relationship'},
 ];
 const CHOICES={
  occupation:[['','Choose an occupation'],['musician-poet','Musician & poet'],['tanner','Tanner'],['physician','Physician'],['scribe','Scribe'],['soldier','Soldier']],
  relationship:[['','Choose a relationship'],['spouse','Husband'],['wife','Wife'],['mother','Mother'],['father','Father'],['sibling','Sibling'],['friend','Friend'],['stranger','Stranger']],
 };
 function fieldControl(f,answers,locked){
  if(CHOICES[f.id])return '<select data-petition="'+f.id+'"'+(locked?' disabled':'')+'>'
   +CHOICES[f.id].map(([value,label])=>'<option value="'+esc(value)+'"'+(answers[f.id]===value?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select>';
  return '<input data-petition="'+f.id+'" value="'+esc(answers[f.id]||'')+'"'+(locked?' disabled':'')+' placeholder="'+esc(f.hint)+'" autocomplete="off">';
 }

 function petitionScreen(answers = {}, result = null){
  return '<div data-anfra-block="petition" data-anfra-label="The petition" class="overlay-body petition">'
   + '<p>The soul brought only a blank passage paper. Fill these three lines from the records and clues you have gathered.</p>'
   + FIELDS.map(f => '<label class="petition-field"><span>' + f.label + '</span>'
      + fieldControl(f,answers,result&&result.ok)
      + (result && result.lines ? '<i class="' + (result.lines[f.id] ? 'right' : 'wrong') + '">'
         + (result.lines[f.id] ? '✓' : '✕') + '</i>' : '')
      + '</label>').join('')
   + (result && !result.ok
      ? '<p class="petition-verdict ' + (result.ok ? 'right' : 'wrong') + '">'
        + 'Not all of it agrees with the record. You may try again.'
        + '</p>'
      : '')
   + '<div class="petition-actions">'
   + '<button class="brass-button small" data-action="submitpetition">Submit the petition</button>'
   + '<button class="text-button" data-action="finish">Leave it unfiled</button>'
   + '</div></div>';
 }

 /* Each line is a query. Nothing here knows the answer; it asks the same Book
    the player could have asked. */
 async function checkPetition(answers){
  // Her bond names him only by key. The Identity Book joins a relationship to
  // the soul who holds it, not to the soul on the other end, so his name is a
  // second read — the same hop the player has to make to answer this at all.
  const bond = await P.ask('nether_identity',
   "explore {\n  dimensions {\n    other: nether_relationship.person_b_id,\n"
   + "    bond: nether_relationship.bond_type,\n  }\n"
   + `  filters { nether_relationship.person_a_id is '${PLAYER}' }\n}`);
  if(bond.status !== 'rows') return {ok:false, lines:{}, unreachable:true};
  const link = one(bond.rows);

  const spouse = await P.ask('nether_identity',
   "explore {\n  dimensions {\n    name: nether_person.name,\n  }\n"
   + `  filters { nether_person.person_id is '${link.other}' }\n}`);
  const work = await P.ask('nether_work',
   "explore {\n  dimensions {\n    role: nether_employment.role,\n  }\n"
   + `  filters { nether_person.person_id is '${link.other}' }\n}`);
  if(spouse.status !== 'rows') return {ok:false, lines:{}, unreachable:true};

  const him = {...one(spouse.rows), bond: link.bond};
  const job = work.status === 'rows' ? one(work.rows) : {};
  const same = (a, b) => G.normalise(a) === G.normalise(b);
  const lines = {
   name: same(answers.name, him.name),
   occupation: answers.occupation==='musician-poet'&&same(job.role,'musician'),
   relationship: same(answers.relationship, him.bond),
  };
  return {ok: Object.values(lines).every(Boolean), lines};
 }

 /* Endings and their reference descriptions are shared with the wiki. */
 const REQUIRED_SEALS = 3;
 const ENDINGS = {
  stateless: {title:'The river keeps what it is given',
   requirement:'Clarity reaches zero.',
   body:'You do not remember the desk. You do not remember the name you were '
      + 'trying to find. Somewhere on the bank a lamp goes out, and the queue '
      + 'moves up one.'},
  unstable: {title:'The case that will not close',
   requirement:`The run ends with fewer than ${REQUIRED_SEALS} seals, while clarity remains.`,
   body:'The seals never came. The shift simply stops — mid-case, mid-sentence, '
      + 'a soul still waiting on a stamp that is not going to arrive.'},
  isles: {title:'A place in the sun',
   requirement:`Finish the court’s work and accept Minos’s golden ticket to Elysium.`,
   body:'You take the golden ticket. The fields are warm, the water is clear, '
      + 'and for once no soul waits for your answer.'},
  stayed: {title:'The work continues',
   requirement:'Decline Elysium and leave the petition unfiled.',
   body:'You return to the Court of Judgement. Orpheus waits with a blank passage paper; '
      + 'the petition remains in your bag, still unanswered.'},
  together: {title:'Side by side',
   requirement:'Continue working and file a successful petition for Orpheus.',
   body:'You file the petition for Orpheus. Minos enters his name in the passage register, '
      + 'and the court gives him a way forward. This time neither of you has to walk in front.'},
 };

 function endingFor({clarity, seals, left, petitionSolved}){
  if(clarity <= 0) return {key:'stateless', ...ENDINGS.stateless};
  if(seals < REQUIRED_SEALS) return {key:'unstable', ...ENDINGS.unstable};
  if(left) return {key:'isles', ...ENDINGS.isles};
  return petitionSolved ? {key:'together', ...ENDINGS.together}
                        : {key:'stayed', ...ENDINGS.stayed};
 }

 function endingScreen(ending){
  return '<div data-anfra-block="ending" data-anfra-label="How it ended" class="overlay-body ending">'
   + '<h3>' + esc(ending.title) + '</h3>'
   + '<p>' + esc(ending.body) + '</p>'
   + '<button class="brass-button small" data-action="service">The record of service</button>'
   + '</div>';
 }

 const api = {build, filingScreen, petitionScreen, checkPetition,
              endingFor, endingScreen, FIELDS, PLAYER, ENDINGS, REQUIRED_SEALS};
 if(typeof module !== 'undefined') module.exports = api; else window.NetherFinale = api;
})();
