(() => {
 'use strict';
 const W=NetherWikiContent,A=NetherWikiArt,C=NetherWikiCatalog,$=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const entries=new Map(W.entries.map(entry=>[entry.id,entry])),categories=new Map(W.categories.map(category=>[category.id,category]));
 let route={kind:'home'},typing=false;
 const href=id=>'#article/'+id,categoryHref=id=>id==='timeline'?'#timeline/hard':'#category/'+id;
 const count=id=>id==='timeline'?C.modes.hard.days.length:W.entries.filter(e=>e.category===id).length;
 const longPortrait=id=>['charon','keeper','minos'].includes(id);
 function documentArt(type){
  const sample=C.examples[type],spec=NetherPapers.TYPES[type];
  if(!sample||!spec)return standardPaper(type);
  const helpers={esc,fmtDate:NetherDate.fmt,label:cat=>C.fields[cat]?.label,model:cat=>C.fields[cat]?.model,cmp:()=>''};
  const wrapper=document.createElement('div');wrapper.innerHTML=NetherPapers.html(sample.id,{papers:[sample]},helpers);
  wrapper.querySelectorAll('button').forEach(button=>{const field=document.createElement('div');field.className=button.className;for(const attr of button.attributes)if(attr.name.startsWith('data-paper-'))field.setAttribute(attr.name,attr.value);field.innerHTML=button.innerHTML;button.replaceWith(field);});
  return `<div class="wiki-paper" style="--preview-w:${spec.size[0]}px;--preview-h:${spec.size[1]}px"><div class="open-doc open-doc--${type}">${wrapper.innerHTML}</div></div>`;
 }
 function standardPaper(type){
  const base=(content,bg='#cfbd92')=>`<svg viewBox="0 0 160 180" role="img" aria-label="${esc(type)} illustration"><path d="M24 9h113v159H24z" fill="${bg}" stroke="#716d4d" stroke-width="2"/>${content}</svg>`;
  if(type==='obol')return `<svg viewBox="0 0 160 160" role="img" aria-label="An obol, with emblem and mint mark"><circle cx="80" cy="80" r="60" fill="#baa664" stroke="#6f674b" stroke-width="3"/><circle cx="80" cy="80" r="51" fill="none" stroke="#786d47" stroke-width="2"/><circle cx="80" cy="80" r="46" fill="none" stroke="#786d47"/><g fill="none" stroke="#5b6045" stroke-width="3"><ellipse cx="80" cy="78" rx="17" ry="24"/><path d="M64 70h32M64 83h32M73 56q-29-25-28 1t24 10M87 56q29-25 28 1T91 67"/></g><text x="80" y="124" fill="#5b6045" font-family="Georgia,serif" font-size="13" text-anchor="middle">ΣΥ</text></svg>`;
  if(type==='permit')return base('<path d="M31 17h99v143H31z" fill="none" stroke="#765b54" stroke-width="2"/><text x="81" y="35" text-anchor="middle" fill="#654c44" font-size="9" font-family="Georgia,serif">PASSAGE PERMIT</text><path d="M46 103h70M46 116h70M46 129h70M46 142h56" stroke="#96796d"/><rect x="45" y="50" width="73" height="36" fill="none" stroke="#99766a" stroke-dasharray="3 3"/>','#d4b4a8');
  return base('<rect x="94" y="30" width="28" height="34" fill="#7e8f7f"/><text x="36" y="39" fill="#5c6045" font-size="9" font-family="Georgia,serif">IDENTITY</text><text x="36" y="52" fill="#5c6045" font-size="7" font-family="Georgia,serif">DECLARATION</text><path d="M37 79h84M37 94h84M37 109h84M37 124h84M37 139h67" stroke="#998854"/>');
 }
 function art(id){
  if(id.startsWith('document:'))return documentArt(id.slice(9));
  if(id.startsWith('item:'))return NetherItemArt.svg(id.slice(5),'');
  if(id.startsWith('book:')){const b=C.books.find(b=>b.id===id.slice(5));return `<span class="book-emblem">${A.icon('books')}<small>${esc(b?.title.replace('The Book of ',''))}</small></span>`;}
  if(id.startsWith('ending:')||id==='arch')return A.arch();
  if(['documents','calendar','books'].includes(id))return A[id]();
  if(id==='magnifier')return `<svg viewBox="0 0 160 160" role="img" aria-label="The magnifier"><path d="M91 91l39 43" stroke="#4f5943" stroke-width="17" stroke-linecap="round"/><path d="M92 92l35 39" stroke="#af9a68" stroke-width="8" stroke-linecap="round"/><circle cx="65" cy="64" r="43" fill="#6b98802b" stroke="#9ca378" stroke-width="7"/><circle cx="65" cy="64" r="35" fill="none" stroke="#647e65" stroke-width="2"/></svg>`;
  return A.portrait(id);
 }
 function gate(compact=false){
  $('#category-gate').classList.toggle('compact',compact);
  $('#category-gate').innerHTML=W.categories.slice(0,6).map(category=>`<a class="gate-link" href="${categoryHref(category.id)}" ${route.category===category.id||route.kind==='timeline'&&category.id==='timeline'?'aria-current="page"':''}><span class="gate-arrow" aria-hidden="true">↗</span><span class="gate-art ${category.id==='characters'?'portrait-art':''}" aria-hidden="true">${art(category.art)}</span><strong>${esc(category.gateTitle||category.title)}</strong><small>${esc(category.subtitle)}</small></a>`).join('');
 }
 function categoryPanel(){return `<section class="side-panel"><h2>Categories</h2><ul class="category-index">${W.categories.map(category=>`<li><a href="${categoryHref(category.id)}" ${route.category===category.id?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${A.icon(category.id)}</span>${esc(category.title)}<span class="count">${count(category.id)}</span></a></li>`).join('')}</ul></section>`;}
 function sidebar(entry){
  let info='';
  if(entry)info=`<section class="side-panel"><h2>${esc(entry.title)}</h2><div class="sidebar-portrait ${longPortrait(entry.art)?'portrait-tall':''}" aria-hidden="true">${art(entry.art)}</div>${['eury','orpheus'].includes(entry.art)?'<p class="info-caption">Wiki illustration · NETHER visual style</p>':''}<dl class="info-facts">${Object.entries(entry.facts||{}).map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`;
  $('#wiki-sidebar').innerHTML=info+categoryPanel()+`<section class="side-panel"><h2>New at the ferry?</h2><div class="side-links"><a href="${href('first-shift')}">Your first shift</a><a href="${href('magnifier')}">Using the magnifier</a><a href="${href('light-clarity')}">Light & clarity</a><a href="${href('shelves')}">The memory shelves</a></div></section>`+(!entry?`<section class="side-panel"><h2>NETHER, at a glance</h2><div class="archive-facts"><div><span>The setting</span><span>The underworld</span></div><div><span>Your role</span><span>Soul examiner</span></div><div><span>Hard journey</span><span>${C.modes.hard.days.length} shifts · ${C.modes.hard.cases} souls</span></div><div><span>Easy journey</span><span>${C.modes.easy.days.length} shifts · ${C.modes.easy.cases} souls</span></div><div><span>The archive</span><span>${W.entries.length} entries</span></div></div></section>`:'')+`<p class="side-note">Some records reveal more than others. Story and ending spoilers are marked. <a href="${href('about')}">About this archive</a></p>`;
 }
 const section=(title,body,more='')=>`<section class="wiki-section"><div class="section-heading"><h2>${title}</h2>${more}</div>${body}</section>`;
 function home(){
  return section('Introduction',`<div class="section-copy"><p class="lead">At the edge of the afterlife, the truth is still in the paperwork.</p><p><em>NETHER</em> is a game of souls, records and the space between a claim and a fact. Take your place at Charon’s desk, read the papers of the arriving dead, and use the Books of Truth to decide whether their stories hold.</p><p>This archive is your companion to the journey: the people you meet, the documents you handle, the choices you make, and the traces of a life you might remember.</p><h3 class="story-title">Story</h3><p>You are Eury. You fell into the Lethe, the river of forgetfulness, and it took your memory. Charon cannot tell you who you were. He can, however, give you work.</p><p>Earn light for sound judgements. Keep your clarity from slipping away. Beyond the ferry lie the Village and the Court of Judgement—and somewhere among their records and belongings, a thread that leads back to you.</p></div><blockquote class="quote">“The river keeps its secrets, even from me.”<small>Charon, the ferryman</small></blockquote>`)
   +section('Learn the work',`<div class="steps"><div class="step"><span>1</span><h3>Read the claim</h3><p>Bring the soul’s papers onto the inspection table. Every detail has a story to tell.</p></div><div class="step"><span>2</span><h3>Find the record</h3><p>Open the right Book. Search, follow a relationship, or ask it to add up the evidence.</p></div><div class="step"><span>3</span><h3>Make the call</h3><p>Compare what the paper says with what the Book knows. Then reach for the stamp.</p></div></div>`,`<a href="${href('first-shift')}">Your first shift ↗</a>`);
 }
 function entryCard(entry){return `<a class="entry-card ${entry.category==='documents'?'document-card':''}" href="${href(entry.id)}"><div class="entry-art ${longPortrait(entry.art)?'tall':''}" aria-hidden="true">${art(entry.art)}</div><div class="entry-text"><span class="entry-category">${esc(categories.get(entry.category).title)}</span><h2>${esc(entry.title)}</h2><p>${esc(entry.summary)}</p><div class="entry-bottom">${entry.spoiler?'<span class="spoiler-badge">Story spoilers</span>':'<span>Read entry</span>'}<span aria-hidden="true">↗</span></div></div></a>`;}
 function heading(eyebrow,title,summary){return `<header class="page-heading"><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(summary)}</p></header>`;}
 function categoryPage(id){
  const category=categories.get(id);if(!category)return notFound();
  return heading('THE ARCHIVE',category.title,category.description)+(id==='endings'?`<div class="spoiler-warning">This section discusses the ${C.endings.length} endings. Open a marked spoiler section in an entry to reveal its conditions and conclusion.</div>`:'')+`<div class="catalog-grid">${W.entries.filter(entry=>entry.category===id).map(entryCard).join('')}</div>`;
 }
 function article(id){
  const entry=entries.get(id);if(!entry)return notFound();
  return heading(categories.get(entry.category).title,entry.title,entry.summary)+`<div class="article-body">${entry.sections.map(([title,body,spoiler])=>spoiler?`<details class="spoiler"><summary>Reveal ${esc(title.toLowerCase())}<span>Story spoilers</span></summary><div class="spoiler-content"><h2>${esc(title)}</h2><p>${body}</p></div></details>`:`<section class="article-section"><h2>${esc(title)}</h2><div>${body}</div></section>`).join('')}</div>`+(entry.related.length?`<section class="article-bottom"><h2>Related entries</h2><div class="related-links">${entry.related.filter(id=>entries.has(id)).map(id=>`<a href="${href(id)}">${esc(entries.get(id).title)}</a>`).join('')}</div></section>`:'')+'<p class="archive-note">From the current NETHER V4 game. Story reveals stay behind the marked sections.</p>';
 }
 function timeline(mode){
  const data=C.modes[mode]||C.modes.hard,easy=mode==='easy';
  const previous=new Set();
  return heading('THE JOURNEY','Timeline','A shift-by-shift guide to the papers and places you encounter. No case verdicts are revealed.')+`<nav class="mode-tabs" aria-label="Game difficulty"><a href="#timeline/hard" ${!easy?'aria-current="page"':''}>Hard · ${C.modes.hard.cases} cases</a><a href="#timeline/easy" ${easy?'aria-current="page"':''}>Easy · ${C.modes.easy.cases} cases</a></nav><ol class="timeline">${data.days.map((day,i)=>{const fresh=day.papers.filter(type=>!previous.has(type));day.papers.forEach(type=>previous.add(type));const courtOpens=day.phase!=='ferry'&&data.days[i-1]?.phase==='ferry';const title=i===0?'The first names':courtOpens?'The court opens':fresh.includes('muster')?'A soldier’s service':fresh.includes('tally')||fresh.includes('licence')?'Numbers on paper':i===data.days.length-1?'The last scheduled shift':'The work continues';return `<li><div class="day-label">DAY ${day.day}<span>·</span>${day.phase==='ferry'?'Charon’s Ferry':'Court of Judgement'}<span>·</span>${day.cases.length} SOULS</div><h2>${title}</h2><p>${i===0?'Begin with identity, a permit and an obol. Additional papers ask you to find a specific record.':courtOpens?'With the ferry rounds resolved, the judges ask for numbers supported by the Books.':fresh.includes('muster')?'A service record can agree with the paper and still fall outside the campaign’s dates.':fresh.includes('tally')||fresh.includes('licence')?'Calculation papers introduce a claim that no individual record can answer.':day.phase==='ferry'?'More papers arrive together. Choose the relevant Book and keep each record in context.':'Continue comparing the papers and answering the court’s questions. Keep enough light for the next clarity drain.'}</p><details><summary>Case references & papers</summary><p>${day.cases.map(esc).join(' · ')}</p><div class="paper-links">${day.papers.map(type=>`<a href="${href('document-'+type)}">${esc(entries.get('document-'+type)?.title||type)}${fresh.includes(type)?' · introduced':''}</a>`).join('')}</div></details></li>`;}).join('')}</ol><section class="article-bottom"><h2>Beyond the scheduled rounds</h2><p class="section-copy">The personal file, the petition and the final choice bring the work back to Eury. Their outcomes depend on clarity, seals and what the records support.</p><div class="related-links"><a href="#category/endings">Explore the endings</a><a href="${href('shelves')}">The memory shelves</a></div></section>`;
 }
 function searchEntries(value){const q=value.trim().toLowerCase();return W.entries.filter(entry=>!q||[entry.title,entry.summary,categories.get(entry.category)?.title].join(' ').toLowerCase().includes(q));}
 function searchPage(value){const results=searchEntries(value);return heading('THE ARCHIVE',value?'Search: '+value:'All entries',results.length+' '+(results.length===1?'entry':'entries')+' found.')+(results.length?`<div class="catalog-grid">${results.map(entryCard).join('')}</div>`:`<div class="empty-search"><p>No records found for “${esc(value)}”. Try a character, document, Book or item name.</p><p><a href="#home">Return to the archive</a></p></div>`);}
 function notFound(){return heading('THE ARCHIVE','That record is missing.','This entry is not in the archive.')+'<p><a href="#home">Return to the wiki home ↗</a></p>';}
 function render(initial=false){
  let parts;try{parts=decodeURIComponent(location.hash.slice(1)||'home').split('/');}catch{parts=['missing'];}
  const [kind,id]=parts,entry=kind==='article'?entries.get(id):null;
  route={kind,category:kind==='category'?id:kind==='timeline'?'timeline':entry?.category,id};document.body.dataset.view=kind;
  $('#wiki-hero').hidden=kind!=='home';gate(kind!=='home');sidebar(entry);
  const crumbs=[['#home','NETHER Wiki']];if(entry){crumbs.push([categoryHref(entry.category),categories.get(entry.category).title],[null,entry.title]);}else if(kind!=='home')crumbs.push([null,kind==='category'?categories.get(id)?.title||'Missing record':kind==='timeline'?'Timeline':kind==='search'?'Search':'Missing record']);
  $('#breadcrumbs').innerHTML=crumbs.map(([url,title],i)=>(i?'<span aria-hidden="true">›</span>':'')+(url?`<a class="${i?'':'crumb-root'}" href="${url}">${esc(title)}</a>`:`<span aria-current="page">${esc(title)}</span>`)).join('');
  $('#wiki-main').innerHTML=kind==='home'?home():kind==='article'?article(id):kind==='category'?categoryPage(id):kind==='timeline'?timeline(id):kind==='search'?searchPage(parts.slice(1).join('/')):notFound();
  const title=entry?.title||(kind==='category'?categories.get(id)?.title:kind==='timeline'?'Timeline':kind==='search'?'Search':null);document.title=(title?title+' — ':'')+'NETHER Wiki';
  $('#search-results').hidden=true;
  if(kind==='search'&&!typing)$('#wiki-search').value=parts.slice(1).join('/');
  if(!initial){$('#wiki-main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});$('#wiki-announcement').textContent=title||'Wiki home';}
 }
 const search=$('#wiki-search'),results=$('#search-results');
 search.addEventListener('input',()=>{
  const value=search.value.trim();typing=true;
  if(!value){results.hidden=true;if(route.kind==='search')location.hash='#home';typing=false;return;}
  const matches=searchEntries(value);results.innerHTML=matches.slice(0,7).map(entry=>`<a class="search-result" href="${href(entry.id)}"><span>${esc(entry.title)}</span><small>${esc(categories.get(entry.category).title)}${entry.spoiler?' · Story spoilers':''}</small></a>`).join('')||'<p class="search-empty">No records found. Try another name.</p>';
  if(matches.length>7)results.innerHTML+=`<a class="search-result" href="#search/${encodeURIComponent(value)}"><span>View all ${matches.length} results ↗</span></a>`;
  results.hidden=false;typing=false;
 });
 search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();typing=false;location.hash='#search/'+encodeURIComponent(search.value.trim());results.hidden=true;}if(event.key==='Escape')results.hidden=true;if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('a')?.focus();}});
 results.addEventListener('keydown',event=>{if(event.key==='Escape'){results.hidden=true;search.focus();}if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const links=[...results.querySelectorAll('a')],index=links.indexOf(document.activeElement);links[(index+(event.key==='ArrowDown'?1:-1)+links.length)%links.length]?.focus();}});
 document.addEventListener('click',event=>{
  if(!event.target.closest('.wiki-search'))results.hidden=true;
  const anchor=event.target.closest('a[href^="#"]');
  if(!anchor||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  // The Anfra host supplies a base URL. Set the fragment explicitly so an
  // internal wiki link does not navigate away from its sandboxed frame.
  event.preventDefault();const target=anchor.getAttribute('href');
  if(target==='#wiki-main'){$('#wiki-main').focus();$('#wiki-main').scrollIntoView();return;}
  if(location.hash===target)render();else location.hash=target;
 });
 document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.target.matches('input,textarea,[contenteditable]')){event.preventDefault();search.focus();}});
 document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=A.icon(el.dataset.icon));
 window.addEventListener('hashchange',()=>render());$('#river-scene').innerHTML=A.scene();render(true);
 window.NetherWiki={get route(){return route;},entries:W.entries,categories:W.categories,search:searchEntries,ready:true};
})();
