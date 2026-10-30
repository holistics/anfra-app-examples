/* Wiki prose describes the implemented game. Major identity and ending reveals
   are kept in explicitly labelled spoiler sections. */
window.NetherWikiContent=(()=>{
 const link=(id,text)=>`<a href="#article/${id}">${text}</a>`;
 const C=NetherWikiCatalog,R=C.rules;
 const entries=[];
 const journey=mode=>`${C.modes[mode].cases} cases over ${C.modes[mode].days.length} shifts`;
 const sealCount=C.seals.length;
 const bookCount=C.books.length;
 const add=(id,category,title,summary,art,facts,sections,related=[],spoiler=false)=>entries.push({id,category,title,summary,art,facts,sections,related,spoiler});
 add('eury','characters','Eury','The examiner with a missing past.','eury',{Role:'Player character',Location:'Charon’s Ferry · The Village',Companion:'Cerberus'},[
  ['The soul at the desk',`Eury wakes in the underworld after falling into the Lethe, the river of forgetfulness. Her memory is gone, and her soul is unstable. ${link('charon','Charon')} gives her work checking the papers of the dead.`],
  ['A way to remember',`Good judgements earn ${link('light-clarity','light')}. The Books, the objects in the shop and the belongings brought home by ${link('cerberus','Cerberus')} offer different kinds of evidence about her past.`],
  ['Her identity','Eury is Eurydice. The surviving belongings connect her to Orpheus, and the official records let her test that connection. After Minos offers her Elysium, she can continue and use a petition to identify the soul who arrives with a blank passage paper.',true]
 ],['charon','item-lyre','light-clarity','ending-together']);
 add('charon','characters','Charon','The ferryman, and your first guide to the underworld.','charon',{Role:'Ferryman & mentor',Location:'Charon’s Ferry',Introduces:'The desk · The Books · The court'},[
  ['The ferryman’s apprentice','The river has taken Eury’s memory, but Charon can still offer her a place at the desk. Too many souls are crossing. Read their papers, compare their claims with the Books, and decide who can pass.'],
  ['Learning the work',`Charon introduces the inspection table and magnifier. He also explains the ${link('document-muster','muster roll')}, ${link('document-tally','discharge tally')} and ${link('document-licence','healer’s licence')} when those new kinds of evidence appear.`],
  ['An invitation',`After the ferry rounds, Charon introduces Eury to ${link('minos','Minos')} and the Court of Judgement. Its records may hold more than answers about the souls in the queue.`]
 ],['first-shift','document-muster','minos']);
 add('keeper','characters','The Shopkeeper','A familiar welcome from someone you cannot quite place.','keeper',{Role:'Trader',Location:'The Village',Offers:'Ram’s blood · Keepsakes · A gift'},[
  ['At the stall',`The keeper trades in light. ${link('item-blood','Ram’s blood')} restores clarity when used; the other objects carry inscriptions and fragments of a life.`],
  ['The waiting gift',`The ${link('item-lyre','lyre')} is a free, unique gift. Its music becomes a clue when Eury handles certain belongings. The keeper’s welcome suggests a familiarity Eury cannot yet explain.`],
  ['Reading an object','Inspecting an item in the shop shows its teaser. Obtaining it reveals the surviving story. The evidence in an object complements the official records; it does not replace checking the Books.']
 ],['item-lyre','item-blood','shelves']);
 add('cerberus','characters','Cerberus','A small charcoal puppy with a talent for finding lost things.','cerberus',{Role:'Companion',Location:'Home',Rewards:'Wind chime · Song sheet · Wedding ribbon'},[
  ['A welcome home','Cerberus waits at the cottage. A perfectly judged shift can earn a homecoming delivery, with at most one queued delivery claimed on each visit.'],
  ['What he brings',`The delivery sequence starts with a ${link('item-chime','wooden wind chime')}, then a ${link('item-song','torn song sheet')}, then a ${link('item-ribbon','wedding ribbon')}. Each is unique.`]
 ],['shelves','item-chime','item-song']);
 for(const {judge:name,need:requirement} of C.seals){
  const id=name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),role=id==='minos'?'Spokesman for the judges':'Judge of the underworld';
  add(id,'characters',name,role+'.',id,{Role:'Judge of the underworld',Location:'Court of Judgement',Associated:`One of the ${sealCount} seals`},[
   ['The Court of Judgement',`Minos, Rhadamanthus and Aeacus need an examiner who can turn their records into sound evidence. Court cases ask for a number supported by the ${link('books-guide','Books of Truth')}, as well as a judgement on the papers.`],
   ['The seal',requirement],
   ['The work at court',`A correct judgement backed by the requested number earns ${R.rewards.pavilion} light balls. A correct judgement with an unsupported number earns ${R.rewards.unsupported}. The court becomes accessible when the ferry rounds are resolved; access is separate from earning all ${sealCount} seals.`]
  ],['books-guide','light-clarity','ending-isles']);
 }
 add('orpheus','characters','Orpheus','A name that survives in music, inscriptions and keepsakes.','orpheus',{Role:'Musician & poet',Associated:'The lyre · A journey below'},[
  ['The scattered belongings','A plectrum, a laurel and a torn song sheet carry traces of a musician. Objects that make the lyre sound belong to the same person.'],
  ['A life recovered','The laurel names Orpheus as a poet and musician. Other belongings connect his journey into the underworld to Eurydice. The clay keepsake explicitly names their marriage.',true]
 ],['item-lyre','item-plectrum','item-laurel','item-keepsake'],true);
 add('souls','characters','The Arriving Souls','Every soul brings a claim. The records decide whether it holds.','souls',{Location:'The ferry · The court',Hard:journey('hard'),Easy:journey('easy')},[
  ['At the examination table','Every applicant carries an identity declaration, passage permit and obol. Other papers depend on the day: property deeds, work letters, oaths, offerings, service rolls and numerical claims.'],
  ['Checking a claim','An honest document and a forged document have the same design. Find the right record and compare what it says. Never infer a verdict from the portrait, paper colour or decorative mark.']
 ],['document-identity','document-permit','document-obol','first-shift']);
 const docs=[
  ['identity','Identity declaration','The soul’s claimed personal details.','Identity','identity','Read the name, birthdate, birthplace, identity number and place of issue against the same person’s record.'],
  ['permit','Passage permit','Permission to cross, with a seal and a period of validity.','Validity','identity','Compare the seal and dates with the passage record, and check that the current realm date lies within the permit’s validity. This is the document that receives the final stamp.'],
  ['obol','Obol','A coin whose details must agree with its birthplace’s mint.','Reference','identity','Inspect the emblem, mint mark, rim and metal together. The Book of Instruction’s map gives the mint standards. An obol is a document to inspect; the examiner is paid in light.'],
  ['deed','Deed of ownership','A claim to a holding, with its transaction and price.','Lookup','property','Find the transaction by its reference. Compare the asset, kind, location, seller, date and price. First registration prints where there is no seller.'],
  ['letter','Letter of employment','A trade house’s letter, or a self-employed soul’s own.','Lookup','work','Find the employment record and its related business. Compare the role, house, trade and dates; self-employed letters can have no house.'],
  ['oath','Oath tablet','An oath recorded in clay: what was sworn, and whether it was kept.','Lookup','rites','Find the oath’s record. Compare its subject, date, kept or broken claim, and any recorded breaking date. The tablet’s appearance never reveals whether the claim is true.'],
  ['receipt','Temple receipt','The account of an offering made at a temple.','Lookup','rites','Find the offering and its temple. Compare the deity, location, offering, value and date.'],
  ['muster','Muster roll','A soldier’s service, held against the campaign’s own dates.','Cross-check','arms','First compare the soldier’s service record. Then check that joining is not before the campaign starts, and leaving is not after the campaign ends. Matching the service line alone is not enough.'],
  ['tally','Discharge tally','A claimed count of souls killed in battle on one campaign.','Calculation','arms','Ask the Book to calculate Killed in battle for the correct soul and campaign. No individual casualty record holds this total.'],
  ['licence','Healer’s licence','One year of a healer’s work, expressed as a number.','Calculation','healing','Ask for Patients treated for this healer, grouped by year. Compare the year on the licence with the same year in the Book before comparing the count.']
 ];
 // Existing papers keep their authored guide; new types still receive an entry
 // from their game definition rather than disappearing from the archive.
 for(const paper of C.papers){
  if(docs.some(d=>d[0]===paper.id))continue;
  const cats=paper.fields.map(f=>f.cat).filter(Boolean);
  const book=C.books.find(b=>cats.some(cat=>b.models.some(m=>cat.startsWith(m.id+'.'))||b.metrics.some(m=>cat===m.id)));
  docs.push([paper.id,paper.label,'A document carried by an arriving soul.','Supporting paper',book?.id||'identity','Read the fields below and compare the claimed values with the corresponding Book records.']);
 }
 for(const [id,originalTitle,summary,kind,book,checking] of docs.filter(d=>['identity','permit','obol'].includes(d[0])||NetherPapers.TYPES[d[0]])){
 const title=NetherPapers.TYPES[id]?.label||originalTitle;
 add('document-'+id,'documents',title,summary,'document:'+id,{Kind:kind,Book:NetherWikiCatalog.books.find(b=>b.id===book).title,Use:'Inspect · Compare · Judge'},[
  ['Reading the document',summary+' Its labels name the same fields and models you can find in the Book.'],['How to check it',checking],...(NetherPapers.TYPES[id]?[['Fields on the paper',NetherPapers.TYPES[id].fields.map(f=>{const named=f.cat&&C.fields[f.cat];return (named?named.label+' · '+named.model:f.label);}).join('; ')+'.']]:[]),['The magnifier',`Pick up the magnifier, select a line on the paper, then select the corresponding detail in the Book’s chart. A result can be a match, a discrepancy, a different record or insufficient context. ${link('magnifier','Read the comparison guide')}.`]
 ],['book-'+book,'magnifier',...(kind==='Calculation'?['books-guide']:[])]);
 }
 for(const book of NetherWikiCatalog.books)add('book-'+book.id,'books',book.title,book.summary,'book:'+book.id,{Domain:({identity:'Identity',property:'Property',work:'Work',healing:'Healthcare',arms:'Battle',harvest:'Agriculture',rites:'Religion'})[book.id],Records:book.models.map(m=>m.title).join(' · '),Measures:String(book.metrics.length)},[
  ['What this Book holds',book.summary],['Reading its records',book.models.map(m=>`<strong>${m.title}</strong>`).join(', ')+'. Pick fields in the Book panel to bring these records into the chart. Related records can be read together.'],['The measures',book.metrics.map(m=>`<div class="metric-note"><h3>${m.title}</h3><p>${m.description}</p></div>`).join('')]
 ],['books-guide',...docs.filter(d=>d[4]===book.id).slice(0,3).map(d=>'document-'+d[0])]);
 for(const {id,title,requirement,body} of C.endings)add('ending-'+id,'endings',title,`One of the ${C.endings.length} conclusions to Eury’s work at the river.`,'ending:'+id,{Type:'Ending',Requirement:'Story details below'},[['How this ending is reached',requirement,true],['The conclusion',body,true]],['light-clarity','eury','orpheus'],true);
 const sources={shop:'The shop',cerberus:'Cerberus’s deliveries',court:'Her personal file'};
 for(const item of NetherItems.all)add('item-'+item.id,'items',item.name,item.teaser||'A surviving piece of a life, kept among the records.','item:'+item.art,{Kind:item.kind==='fragment'?'Keepsake':item.kind,Source:sources[item.source],...(item.price?{'Shop price':item.price+' light'}:{}),...(item.shelf?{Shelf:item.shelf==='left'?'Left bookcase':'Right bookcase'}:{})},[
  ['The object',item.teaser||item.name+'.'],['What survives',item.story||'This record is handed over through the court storyline. Its personal details are read from the Books at the time the file is assembled.',item.kind==='fragment'||item.kind==='record']
 ],['keeper','cerberus','shelves'],item.kind==='record');
 add('first-shift','gameplay','Your first shift','A practical guide to the examination desk.','documents',{Place:'Charon’s Ferry',Work:'Read · Compare · Decide'},[
  ['1. Read the papers','Click or drag a paper into the inspection area. Read the claim before choosing the Book. The identity declaration and permit describe the soul; the additional paper points to another part of their life.'],
  ['2. Open the right Book',`Use ${link('books-guide','the Book of Truth')} to choose the relevant records and fields. Use the field search to find a field by name; clearing the search restores the complete list. Add a record filter to find the soul or document you are checking.`],
  ['3. Compare and decide',`Use ${link('magnifier','the magnifier')} to hold a line against the Book. Return to the permit and apply the appropriate stamp. The case ledger records the result. After the soul departs, review its case ledger and ring the bell to call the next applicant.`]
 ],['document-identity','document-permit','magnifier','light-clarity']);
 add('magnifier','gameplay','Using the magnifier','Evidence begins with the right two details.','magnifier',{Tool:'Cross-check magnifier',Outcomes:'Match · Discrepancy · Context needed'},[
  ['Hold two details together','Pick up the magnifier beside the Book of Instruction. Click a line on the open paper to arm it, then click the corresponding field in the Book’s result. The illuminated fields stay visible through the dimmed desk.'],
  ['Reading a result','A green line shows agreement. A red line shows a supported discrepancy. A different kind of field does not correlate; an unrelated person’s record should not be treated as proof against this soul. Show another identifying field when the Book has too little context.'],
  ['Special comparisons',`The ${link('document-muster','muster roll')} can be compared against the campaign’s date boundaries. A ${link('document-tally','tally')} or ${link('document-licence','licence')} must be compared with the correct aggregate, not an individual record.`]
 ],['document-muster','document-tally','first-shift']);
 add('light-clarity','gameplay','Light & clarity','The work keeps the lamp lit. The river keeps taking its due.','item:blood',{Starting:`${R.start.light} light · ${R.start.clarity} clarity`,'Each shift':`−${R.drain} clarity`,'Ram’s blood':`+${R.bloodClarity} clarity when used`},[
  ['Light',`A correct ferry judgement earns ${R.rewards.ferry} light. At court, a correct judgement supported by the requested number earns ${R.rewards.pavilion}. An unsupported number earns ${R.rewards.unsupported} light, and a wrong judgement changes light by ${R.rewards.wrong}.`],
  ['Clarity',`Every completed shift drains ${R.drain} clarity. At zero, the river takes Eury. Buying ${link('item-blood','ram’s blood')} puts it into inventory; using it consumes the bottle and restores ${R.bloodClarity} clarity.`],
  ['Spend and survive','Blood prices can change between shifts. Keepsakes carry fixed individual prices, while the lyre is a free gift. Plan for the clarity drain before spending everything on another fragment.']
 ],['item-blood','keeper','ending-stateless']);
 add('shelves','gameplay','The cottage & memory shelves','Put the fragments of a life together.','item:lyre',{Location:'Home · The Village',Left:'The lyre',Right:'The wooden wind chime'},[
  ['Two instruments',`The ${link('item-lyre','lyre')} belongs on the left shelf; the ${link('item-chime','wooden wind chime')} belongs on the right. Each responds to one person’s belongings. The music is a clue that objects belong together.`],
  ['Listen, then read','Inspect a keepsake and listen for a response. Place belongings on the shelves, read the surviving inscriptions, and compare the story suggested by the objects with the official records.'],
  ['The deliveries',`A flawless shift can earn a delivery from ${link('cerberus','Cerberus')}. Home visits claim queued gifts one at a time; simply entering again does not create another gift.`]
 ],['cerberus','item-lyre','item-chime','item-keepsake']);
 add('books-guide','gameplay','Reading the Books of Truth','The papers are claims. The Books hold the records.','books',{Books:String(bookCount),Tools:'Fields · Filters · Charts · Measures'},[
  ['Choose a Book',`The ${bookCount} Books include ${C.books.map(b=>b.title).join(', ')}. Choose the subject that matches the claim, then find the relevant person or document.`],
  ['Find the evidence','Field labels on the papers match the Book’s labels. The model tag identifies which kind of record the field belongs to. Add enough context to distinguish this record from a namesake or another transaction.'],
  ['When a record is not enough','Some papers claim a total, and the court asks questions about groups of records. Use the Book’s measures with the correct filters and date grain. A count for the wrong person, campaign or year is not the requested answer.']
 ],['book-identity','book-arms','book-healing','magnifier']);
 add('about','gameplay','About this archive','A reference companion to the current NETHER V4 game.','books',{Scope:'Characters · Papers · Records · Story',Format:'A browsable game wiki'},[
  ['The archive','This wiki documents the game as implemented in NETHER V4. Its portraits and objects reuse the game’s artwork; document illustrations use its paper templates. Eury and Orpheus have additional wiki illustrations in the same visual style.'],
  ['A note on the story','Open a marked spoiler section to reveal endings or the identity clues. The homepage gives only the opening premise.'],
  ['The reference','The category hub and introduction/sidebar arrangement are inspired by the <a href="https://papersplease.fandom.com/wiki/Papers_Please_Wiki" target="_blank" rel="noopener noreferrer">Papers, Please Wiki</a>. The lore, illustrations and theme here belong to NETHER.']
 ],['first-shift','eury']);
 const categories=[
  {id:'characters',title:'Characters',singular:'Character',subtitle:'Guides, judges & lost souls',description:'Meet the people who keep the river moving—and those trying to cross it.',art:'charon'},
  {id:'endings',title:'Endings',singular:'Ending',subtitle:`${C.endings.length} ways the story closes`,description:'The work, the seals and a final choice decide how Eury’s story ends.',art:'arch'},
  {id:'documents',title:'Documents',singular:'Document',subtitle:'The papers in your hands',description:'Learn what each paper claims and how to hold it against the records.',art:'documents'},
  {id:'items',title:'Items & keepsakes',gateTitle:'Items',singular:'Item',subtitle:'Belongings with a memory',description:'Instruments, surviving letters and small things carried out of the river.',art:'item:lyre'},
  {id:'timeline',title:'Timeline',singular:'Timeline',subtitle:'Every shift, step by step',description:'Follow the ferry rounds and the court work in both versions of the journey.',art:'calendar'},
  {id:'books',title:'Book of Truth',singular:'Book of Truth',subtitle:`${bookCount} Books. One truth.`,description:'Explore the records, relationships and measures behind every claim.',art:'books'},
  {id:'gameplay',title:'Guides & mechanics',subtitle:'Learn the work',description:'From your first judgement to clarity, evidence and the memory shelves.',art:'magnifier'}
 ];
 return {entries,categories,link};
})();
