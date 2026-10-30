/* Charon walks the player through the examination desk the first time they board the ferry:
   papers, the inspection table, the Book of Truth, the magnifier and the stamp.
   The panel is the shared dialogue (dialogue.js); this file only sequences the steps and
   spotlights the part of the desk each one is about. Steps either wait for the player to do
   the thing (drag, click, compare) or wait for Next. */
(() => {
 'use strict';
 const $=s=>document.querySelector(s);
 const V=()=>window.NetherV4,st=()=>V().states.get(V().active),kase=()=>V().data.cases().find(c=>c.id===V().active);
 const dsOpen=()=>!!$('#data-overlay')?.open,hasBook=()=>!!st().dataset;
 const TOUR_BOOK='nether_identity',TOUR_COLUMNS=['nether_person.name','nether_person.birthdate','nether_person.birthplace'];
 const cell=(zone,cat)=>'[data-action="compare"][data-zone="'+zone+'"][data-cat="'+cat+'"]';
 const flags={};
 /* Fields and the soul's record, so the table the player compares against is one row long. */
 function prepareChart(){
  const v=V(),s=st(),c=kase(),book=v.data.books().find(b=>b.id===TOUR_BOOK);
  if(s.dataset!==TOUR_BOOK){
   const fields=v.data.schema()[book.models[0]].fields;
   Object.assign(s,{dataset:book.id,model:book.models[0],filterField:(fields.find(f=>f.type==='text'&&!f.key)||fields[0]).id,filter:'',selection:null,analysis:null});
   v.analysis.render(s);
  }
  const a=v.analysis.current;
  Object.assign(a,{type:'table',columns:TOUR_COLUMNS,grain:'none',menu:null,filters:[],filterTree:{combinator:'and',children:[{field:'nether_person.person_id',operator:'is',values:[c.personId]}]}});
  v.analysis.render(s);
 }
 /* `auto` is what Next does on a step that waits for the player: it does the thing for them. */
 const press=sel=>$(sel)?.click();
 const magnifierOn=()=>{if(!document.body.classList.contains('magnifier-mode'))press('.magnifier-toggle');};
 const STEPS=[
  {id:'papers',text:'Every soul brings papers: a declaration, a permit and an obol, and from day one a paper out of the Books too.',
   targets:['.desk-surface'],passive:true},
  {id:'drag',text:'Drag the identity declaration up into the inspection table to read it.',
   targets:['.desk-item--identity','.zoom-stage'],drag:['.desk-item--identity','.zoom-stage'],skip:()=>!!$('.open-doc--identity'),
   done:()=>!!$('.open-doc--identity'),reaction:'Good. But a paper can be forged.',
   auto:()=>$('.desk-item--identity')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))},
  {id:'truth',text:'Papers can lie. The Book of Truth holds every genuine record to check them against.',
   targets:['.workbench'],passive:true,skip:hasBook},
  {id:'pickbook',text:'Open the Book of Truth selector.',targets:['#analysis-dataset'],skip:hasBook,done:dsOpen,auto:()=>press('#analysis-dataset')},
  {id:'books',text:'These Books record the underworld\u2019s daily life. Each one checks a different claim.',
   targets:['.dataset-browser-nav'],passive:true,skip:()=>!dsOpen()},
  {id:'detail',text:'Open a Book to see its models, and switch between Diagram, List and Raw data.',
   targets:['.dataset-browser-main'],pos:'tr',skip:()=>!dsOpen()},
  {id:'usebook',text:'Press Use book to bring it to your desk.',targets:['[data-action="usedataset"]'],pos:'tr',blink:true,
   skip:hasBook,done:()=>!dsOpen()&&hasBook(),back:()=>!dsOpen()&&!hasBook()?'pickbook':null,auto:()=>press('[data-action="usedataset"]')},
  {id:'fields',text:()=>'I added name, birthdate and birthplace, filtered to '+kase().name+'\u2019s record.',
   targets:[['#analysis-config','#visualization']],passive:true,onEnter:prepareChart},
  {id:'magnifier',text:'Pick up the magnifier to hold a paper against the Book.',targets:['.magnifier-toggle'],blink:true,
   done:()=>document.body.classList.contains('magnifier-mode'),auto:()=>press('.magnifier-toggle')},
  {id:'match',text:'Click the name on the declaration, then the name in the Book.',
   targets:['.open-doc--identity '+cell('soul','nether_person.name'),'#visualization '+cell('truth','nether_person.name')],
   linkable:true,always:['.magnifier-toggle'],done:()=>flags.match,reaction:'A match. The name agrees with the Book.',
   auto:()=>{magnifierOn();press('.open-doc--identity '+cell('soul','nether_person.name'));press('#visualization '+cell('truth','nether_person.name'));}},
  {id:'mismatch',text:'Now the birthdate: click it on the declaration, then in the Book.',
   targets:['.open-doc--identity '+cell('soul','nether_person.birthdate'),'#visualization '+cell('truth','nether_person.birthdate')],
   linkable:true,always:['.magnifier-toggle'],done:()=>flags.mismatch,
   auto:()=>{magnifierOn();press('.open-doc--identity '+cell('soul','nether_person.birthdate'));press('#visualization '+cell('truth','nether_person.birthdate'));}},
  {id:'openstamps',text:'A discrepancy. The glowing chevron opens your entrance stamps and puts down the magnifier.',targets:['.stamp-tab'],blink:'.stamp-tab',done:()=>!!st().drawerOpen,auto:()=>press('.stamp-tab')},
  {id:'stamp',text:'The birthdate is forged. Stamp it DENIED.',keepLink:true,
   targets:['.open-doc--identity '+cell('soul','nether_person.birthdate'),'#visualization '+cell('truth','nether_person.birthdate'),'.stamp-plunger.reject'],blink:'.stamp-plunger.reject',
   onEnter:()=>{if(document.body.classList.contains('magnifier-mode'))press('.magnifier-toggle');$('[data-action="stamptab"][aria-expanded="false"]')?.click();},done:()=>flags.stamp,auto:()=>press('.stamp-plunger.reject')},
  {id:'end',text:'Well done. Return the papers so the soul can go. Review the result in Case ledger and close the notebook, then ring the glowing bell to call the next soul.',targets:['.zoom-stage','.soul-bell'],passive:true,
   done:()=>!$('.open-doc'),auto:()=>V().returnPapers()},
 ];
 let link=null,linkEl,autoRan=false,state='pending',root,scrim,panel,hand,step,index=-1,mode='idle',frame=0,lastKey='',rings=[];
 /* A target is a selector, or a list of selectors that share one highlight (the box that holds them all). */
 const boxOf=sel=>{const rs=(Array.isArray(sel)?sel:[sel]).map($).filter(el=>el&&el.getClientRects().length).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);
  if(!rs.length)return [];const x=Math.min(...rs.map(r=>r.left)),y=Math.min(...rs.map(r=>r.top));return [{x,y,w:Math.max(...rs.map(r=>r.right))-x,h:Math.max(...rs.map(r=>r.bottom))-y}];};
 const rectsOf=selectors=>selectors.flatMap(boxOf);
 function holePath(r,pad=8,rad=10){const x=r.x-pad,y=r.y-pad,w=r.w+pad*2,h=r.h+pad*2;return 'M'+(x+rad)+' '+y+'h'+(w-rad*2)+'a'+rad+' '+rad+' 0 0 1 '+rad+' '+rad+'v'+(h-rad*2)+'a'+rad+' '+rad+' 0 0 1 -'+rad+' '+rad+'h-'+(w-rad*2)+'a'+rad+' '+rad+' 0 0 1 -'+rad+' -'+rad+'v-'+(h-rad*2)+'a'+rad+' '+rad+' 0 0 1 '+rad+' -'+rad+'z';}
 function layout(){
  const main=step.targets?rectsOf(step.targets):[],extra=step.always?rectsOf(step.always):[],rects=main.concat(extra),ends=link?link.sel.map(sel=>rectsOf([sel])[0]):[],key=JSON.stringify([rects,ends,link?.result,innerWidth,innerHeight,!!step.targets,step.id]);
  if(key===lastKey)return;
  lastKey=key;
  scrim.toggleAttribute('hidden',!step.targets);
  scrim.setAttribute('viewBox','0 0 '+innerWidth+' '+innerHeight);
  scrim.firstElementChild.setAttribute('d','M0 0H'+innerWidth+'V'+innerHeight+'H0z'+rects.map(r=>holePath(r)).join(''));
  while(rings.length<rects.length){const ring=document.createElement('div');root.insertBefore(ring,panel.element);rings.push(ring);}
  rings.forEach((ring,i)=>{const r=rects[i];ring.hidden=!r;if(!r)return;
   ring.className='dtour-ring'+(step.passive?' is-block':'')+(step.blink&&(step.blink===true||step.targets[i]===step.blink)?' is-blink':'')+((link&&i<2)||i>=main.length?' is-quiet':'');
   Object.assign(ring.style,{left:r.x-8+'px',top:r.y-8+'px',width:r.w+16+'px',height:r.h+16+'px'});});
  dragHint(rects);
  drawLink(ends);
 }
 /* The magnifier's result, redrawn above the dimming so the line and its label stay readable. */
 function drawLink(ends){
  if(!linkEl){linkEl=document.createElementNS('http://www.w3.org/2000/svg','svg');linkEl.setAttribute('class','dtour-link');linkEl.setAttribute('aria-hidden','true');root.insertBefore(linkEl,panel.element);}
  const [a,b]=ends;
  linkEl.toggleAttribute('hidden',!link||!a||!b);
  if(!link||!a||!b)return;
  const x1=a.x+a.w+7,y1=a.y+a.h/2,x2=b.x-7,y2=b.y+b.h/2,mid=(x1+x2)/2,my=(y1+y2)/2,label=link.text.toUpperCase(),w=label.length*9+34;
  linkEl.setAttribute('viewBox','0 0 '+innerWidth+' '+innerHeight);
  linkEl.dataset.result=link.result;
  linkEl.innerHTML='<path class="dtour-link-line" d="M'+x1+' '+y1+'H'+mid+'V'+y2+'H'+x2+'"/><circle cx="'+x1+'" cy="'+y1+'" r="5"/><circle cx="'+x2+'" cy="'+y2+'" r="5"/>'
   +'<rect class="dtour-link-pill" x="'+(mid-w/2)+'" y="'+(my-15)+'" width="'+w+'" height="30" rx="15"/><text class="dtour-link-text" x="'+mid+'" y="'+(my+5)+'" text-anchor="middle">'+label.replace(/&/g,'&amp;')+'</text>';
 }
 /* A dot travelling from the paper to the table, over and over, so the gesture is shown, not just told. */
 function dragHint(rects){
  hand?.getAnimations().forEach(a=>a.cancel());
  hand.hidden=!(step.drag&&rects.length===2);
  if(hand.hidden)return;
  const [from,to]=rects,fx=from.x+from.w/2,fy=from.y+from.h/2,tx=to.x+to.w/2,ty=to.y+Math.min(to.h/2,120);
  hand.animate([{transform:'translate('+fx+'px,'+fy+'px) scale(.8)',opacity:0},{transform:'translate('+fx+'px,'+fy+'px) scale(1)',opacity:1,offset:.15},{transform:'translate('+tx+'px,'+ty+'px) scale(1)',opacity:1,offset:.8},{transform:'translate('+tx+'px,'+ty+'px) scale(.8)',opacity:0}],{duration:2000,iterations:Infinity,easing:'ease-in-out'});
 }
 function actions(){
  panel.setActions([{id:'skip',label:'Skip',variant:'tertiary'},{id:'next',label:'Next',arrow:true}]);
 }
 function go(to){
  index=to;
  while(index<STEPS.length&&STEPS[index].skip?.())index++;
  if(index>=STEPS.length)return finish();
  step=STEPS[index];lastKey='';autoRan=false;if(!step.keepLink)link=null;if(step.linkable)V().clearMagnifier();Object.keys(flags).forEach(k=>delete flags[k]);
  step.onEnter?.();
  mode=step.done?'waiting':'reading';
  root.dataset.pos=step.pos||'br';
  actions();
  panel.setText(typeof step.text==='function'?step.text():step.text);
  panel.focus('next');
  layout();
 }
 function completed(){
  if(step.reaction){mode='reading';actions();panel.setText(step.reaction);panel.focus('next');return;}
  go(index+1);
 }
 function next(){
  if(mode==='reading')go(index+1);
  else if(!autoRan){autoRan=true;step.auto?.();}
 }
 function tick(){
  if(state!=='running')return;
  const host=document.querySelector('dialog[open]')||document.body;
  if(root.parentNode!==host)host.appendChild(root);
  const back=mode==='waiting'&&step.back?.();
  if(back){go(STEPS.findIndex(s=>s.id===back));}
  else if(mode==='waiting'&&step.done()){completed();}
  layout();
  frame=requestAnimationFrame(tick);
 }
 function finish(){
  if(state!=='running')return;
  state='done';cancelAnimationFrame(frame);hand?.getAnimations().forEach(a=>a.cancel());
  root.classList.add('is-leaving');setTimeout(()=>{panel.destroy();root.remove();},260);
  document.body.dataset.deskTour='done';
 }
 function start(){
  state='running';document.body.dataset.deskTour='running';
  root=document.createElement('div');root.className='dtour';
  root.innerHTML='<svg class="dtour-scrim" aria-hidden="true"><path fill-rule="evenodd"/></svg><div class="dtour-hand" hidden aria-hidden="true"></div>';
  scrim=root.firstElementChild;hand=scrim.nextElementSibling;
  document.body.appendChild(root);
  panel=NetherDialogue.create({container:root,className:'dtour-dialogue',label:'Charon explains the desk',dialog:true,speaker:'Charon',role:'the ferryman',portrait:NetherItemArt.charon(),
   onAction(action){if(action==='skip')finish();else if(action==='next')next();}});
  go(0);tick();
 }
 /* Waiting for the player: the magnifier says what it found, the stamp is pressed. */
 addEventListener('nether:compare',e=>{
  if(state!=='running')return;
  flags[e.detail.result]=true;
  if(step.linkable&&e.detail.result!=='none'){link={result:e.detail.result,text:e.detail.text,sel:step.targets.slice(0,2)};lastKey='';$('#magnifier-svg').innerHTML='';}
 });
 document.addEventListener('click',e=>{if(state==='running'&&e.target.closest('[data-action="dispute"]'))flags.stamp=true;},true);
 /* First time on the ferry's desk, the first case, nothing touched yet. */
 function maybeStart(tries=0){
  if(state!=='pending'||document.body.dataset.screen!=='desk')return;
  const v=V();
  if(!v?.ready||document.body.dataset.onboarding==='running'){if(tries<30)setTimeout(()=>maybeStart(tries+1),300);return;}
  if(v.active!==v.data.cases()[0].id||st().status!=='waiting'){state='done';return;}
  setTimeout(()=>{if(state==='pending'&&document.body.dataset.screen==='desk')start();},500);
 }
 new MutationObserver(()=>{
  if(document.body.dataset.screen==='desk')maybeStart();
  else if(state==='running')finish();
 }).observe(document.body,{attributes:true,attributeFilter:['data-screen']});
 window.NetherDeskTour={get state(){return state;},restart(){if(state==='running')finish();state='pending';maybeStart();}};
})();
