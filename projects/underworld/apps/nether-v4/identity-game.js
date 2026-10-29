/* The desk: documents, the Books, and a magnifier for holding one against the other.
   Every record on screen arrives from a query (ledger.js), and every verdict is
   resolved against the semantic layer (grade.js). Nothing here knows an answer. */
(() => {
 'use strict';
 const D=window.NetherLedger,G=window.NetherGrade,PV=window.NetherPavilion,REC=window.NetherRecord,EC=window.NetherEconomy,FIN=window.NetherFinale,$=s=>document.querySelector(s),esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const papersOf=c=>NetherPapers.list(c);
 const GUIDE=['Every soul must offer an obol.','Every soul must carry an identity declaration.',
  'Every soul must carry a passage permit.','Every detail must agree with the Book of Truth.'];
 const blank=()=>({status:'waiting',open:{},drawerOpen:false,evidence:false,stampMark:null,departed:false,departing:false,ledgerOpened:false,ledgerReviewed:false,coinFlipped:false,
  dataset:null,model:'nether_person',filterField:'name',filter:'',selection:null,
  rows:[],rowKey:null,rowStatus:'idle',findings:null,
  pane:'records',draft:null,answer:'',answerCorrect:undefined,judgeTruth:null,judgeWrit:null,writAnswers:{}});
 const caseClosed=s=>!!s&&['approved','disputed','pending'].includes(s.status);
 const shiftsClosed=new Set();
 const devClosedShifts=new Set(),devGiftShifts=new Set();
 let states=new Map(),active=null,screen='map',preview='identity',view='diagram',previewModel='person',previewFilter=null,page=0,sound=false,audio,stageTwo=false,armed=null,magnifierMode=false,hit=null,bookTab='guide',bookCountry=null,zTop=10,developerUnlocked=false;
 const DEV_PASSWORD_SALT='sQRqFYie4OYdgb/rA38CjA==',DEV_PASSWORD_HASH='B+cdj0vdzOpgtatm0P6LONfWq6CdRnLVzZ+L1+aeaSM=';
 const world=createTrialWorld($('#river-world')),C=()=>D.cases().find(c=>c.id===active),S=()=>states.get(active),done=()=>[...states.values()].filter(caseClosed).length;
 window.createRiverAtlas(world);
 const rooms=createPossessionRooms({go:setScreen,toast,refreshHeader:header,puppySVG});
 const analysis=createAnalysisWorkbench({state:S,refresh:workbench,recordTable,compare:cmp,note:dataset=>REC.note.search(dataset)});
 const checklist=NetherCourtChecklist.create({case:C,state:S,onChange:()=>{soul();header();},onExhausted:parkCase,exitMagnifier});
 const settled=()=>caseClosed(S()),book=id=>D.books().find(d=>d.id===id),SCH=id=>D.schema()[id],types={text:'Aa',number:'#',date:'▦',datetime:'◷',truefalse:'⊨'};
 function coinSVG(coin){
  const art={
   owl:'<path d="M30 30L35 19L43 29H57L65 19L70 30V59Q50 79 30 59Z"/><circle cx="40" cy="43" r="8"/><circle cx="60" cy="43" r="8"/><path d="M47 52L50 58L53 52M36 62L43 66M57 66L64 62"/>',
   bull:'<path d="M27 26Q24 46 38 54M73 26Q76 46 62 54"/><path d="M38 40Q50 30 62 40L66 60Q50 76 34 60Z"/><circle cx="43" cy="51" r="3"/><circle cx="57" cy="51" r="3"/><path d="M45 65H55"/>',
   lyre:'<path d="M33 70V34Q33 20 42 20M67 70V34Q67 20 58 20"/><path d="M29 70H71"/><path d="M41 66V30M50 66V27M59 66V30"/>',
   trireme:'<path d="M22 56H78L68 72H32Z"/><path d="M50 52V20M50 24L70 32L50 40"/><path d="M26 62H74"/>',
   olive:'<path d="M50 74V34"/><path d="M50 44Q32 42 28 26Q46 24 50 44ZM50 54Q68 52 72 36Q54 34 50 54Z"/><circle cx="38" cy="60" r="5"/><circle cx="62" cy="64" r="5"/>',
   serpent:'<path d="M26 66Q44 66 44 54T62 42T70 28" fill="none" stroke-width="7"/><circle cx="72" cy="25" r="5"/><path d="M24 70Q40 72 48 66"/>',
   horse:'<path d="M28 72Q26 48 42 38L46 24L58 32Q74 36 74 56V72"/><path d="M44 26L40 16L52 22"/><circle cx="52" cy="40" r="3"/>',
   amphora:'<path d="M38 24H62L58 36Q72 46 70 60T50 78T30 60T42 36Z"/><path d="M38 30Q26 34 30 46M62 30Q74 34 70 46" fill="none"/>',
   bee:'<ellipse cx="50" cy="52" rx="16" ry="21"/><path d="M34 46H66M34 58H66"/><path d="M44 32Q28 18 24 34T40 42M56 32Q72 18 76 34T60 42" fill="none"/>',
  };
  return '<svg class="obol-svg" viewBox="0 0 100 100" role="img" aria-label="'+esc(coin.symbol+' obol, mint mark '+coin.mark+', '+coin.rim+' rim')+'"><circle cx="50" cy="50" r="47" fill="'+coin.tone+'" stroke="#6f644b" stroke-width="2"/><circle cx="50" cy="50" r="41" fill="none" stroke="#655b43" stroke-width="'+(coin.rim==='plain'?1:2)+'" '+(coin.rim==='beaded'?'stroke-dasharray="1 5" stroke-linecap="round"':'')+'/>'+(coin.rim==='double'?'<circle cx="50" cy="50" r="37" fill="none" stroke="#655b43"/>':'')+'<g fill="none" stroke="#5b543e" stroke-width="2.3" stroke-linejoin="round">'+art[coin.symbol]+'</g></svg>';
 }
 function coinBackSVG(coin){
  return '<svg class="obol-svg" viewBox="0 0 100 100" role="img" aria-label="Reverse of the '+esc(coin.symbol)+' obol"><circle cx="50" cy="50" r="47" fill="'+coin.tone+'" stroke="#6f644b" stroke-width="2"/><circle cx="50" cy="50" r="41" fill="none" stroke="#655b43" stroke-width="'+(coin.rim==='plain'?1:2)+'" '+(coin.rim==='beaded'?'stroke-dasharray="1 5" stroke-linecap="round"':'')+'/>'+(coin.rim==='double'?'<circle cx="50" cy="50" r="37" fill="none" stroke="#655b43"/>':'')+'<g fill="none" stroke="#5b543e" stroke-width="2" stroke-linejoin="round"><path d="M28 62Q20 42 31 25M72 62Q80 42 69 25"/><path d="M30 32L24 27M31 40L25 36M33 48L27 45M36 56L30 54M70 32L76 27M69 40L75 36M67 48L73 45M64 56L70 54"/><circle cx="50" cy="48" r="13"/><path d="M50 39V57M41 48H59"/></g></svg>';
 }
 function magnifierSVG(){return '<svg viewBox="0 0 96 104" aria-hidden="true"><path d="M56 56L64 64" stroke="#322e23" stroke-width="13"/><path d="M57 57L65 65" stroke="#929568" stroke-width="9"/><path d="M65 65L84 88Q89 96 81 99Q76 100 73 94L55 73Z" fill="#70654e" stroke="#292a20" stroke-width="2"/><path d="M66 73L80 92" stroke="#b19a6c" opacity=".45"/><path d="M59 67L66 62M62 73L71 67" stroke="#8a9164" stroke-width="2"/><circle cx="37" cy="36" r="30" fill="none" stroke="#929568" stroke-width="6"/><circle cx="37" cy="36" r="33" fill="none" stroke="#40513b" stroke-width="1"/><circle cx="37" cy="36" r="26.5" fill="#70908422" stroke="#3e574b" stroke-width="1"/><circle cx="37" cy="36" r="23.5" fill="#66847a22" stroke="#778c6f" stroke-width="1"/></svg>';}
 function guideBookSVG(){return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M16 17L78 10L91 79L29 90L16 83Z" fill="#182d24" stroke="#9b8c5d"/><path d="M27 83L87 73V83L29 93Z" fill="#c3c7a4" stroke="#897f5b"/><path d="M30 86L83 78M31 89L84 81" stroke="#8b805c" stroke-width=".8"/><path d="M13 15L76 7L87 75L25 86L13 79Z" fill="#405844" stroke="#889473" stroke-width="1.2"/><path d="M22 15L33 81M16 31L24 30M19 54L28 52M23 73L31 71" stroke="#8f9e79" stroke-width="1.5"/><path d="M29 22L69 17L77 66L37 74Z" fill="none" stroke="#81966f" stroke-width=".7"/><path d="M52 64L56 91L62 85L66 89L62 62" fill="#884b3c" stroke="#ba8e60" stroke-width=".5"/><text transform="rotate(-8 51 37)" x="51" y="37" text-anchor="middle" font-family="Georgia,serif" font-size="8" fill="#bdc49d">BOOK OF</text><text transform="rotate(-8 54 48)" x="54" y="48" text-anchor="middle" font-family="Georgia,serif" font-size="6.5" fill="#bdc49d">INSTRUCTION</text><path d="M44 57Q52 51 61 54M48 60Q54 55 60 57" fill="none" stroke="#b3a16e" stroke-width=".8"/></svg>';}
 function bellSVG(){return '<svg class="soul-bell-art" viewBox="0 0 90 155" aria-hidden="true"><path d="M77 13V111Q77 116 72 116Q67 116 67 111V22L30 8Q27 6 29 3Q30 1 34 2L76 18M36 12L68 79" fill="#2b3d32" stroke="#899072" stroke-width="2"/><circle cx="72" cy="41" r="1.8" fill="#b3a777"/><circle cx="72" cy="102" r="1.8" fill="#b3a777"/><g class="bell-swing"><g fill="none" stroke="#9a9471" stroke-width="3"><ellipse cx="34" cy="20" rx="4" ry="7"/><circle cx="34" cy="32" r="7"/><ellipse cx="34" cy="44" rx="3.5" ry="7"/></g><path d="M29 51Q34 45 39 51V59H29Z" fill="#8d916b" stroke="#56694f"/><path d="M17 65Q18 54 34 54Q50 54 51 65L54 84Q56 94 66 100Q69 107 60 109H8Q-1 107 3 101Q13 94 14 84Z" fill="#94916a" stroke="#5b593a" stroke-width="1.5"/><path d="M17 66Q32 73 51 66M10 94Q34 101 60 94M4 102Q34 112 65 102" fill="none" stroke="#6e7757" stroke-width="1" opacity=".65"/><ellipse cx="34" cy="107" rx="30" ry="5" fill="#737958" stroke="#58694e"/><path d="M34 107V119" stroke="#26382c" stroke-width="3"/><path d="M29 115Q34 111 39 115L40 125Q34 134 28 125Z" fill="#4a4933" stroke="#b09b63"/><path d="M34 130V145" fill="none" stroke="#d0bf95" stroke-width="4"/><path d="M33 130L36 134L32 138L36 142L33 146" fill="none" stroke="#8e7e54"/><ellipse cx="34" cy="148" rx="6" ry="4" fill="#b7a478" stroke="#89784e"/></g></svg>';}
 function canCallNextSoul(s=S()){return !!s&&caseClosed(s)&&s.departed&&s.ledgerReviewed&&!s.departing&&!s.grading&&!s.callingNext;}
 function soulBell(s){const ready=canCallNextSoul(s);return '<button class="soul-bell'+(ready?' is-ready':'')+(s.callingNext?' is-ringing':'')+'" data-action="callnext" aria-label="Ring to call the next soul" title="'+(ready?'Ring to call the next soul':settled()?'Return the documents and close Case ledger before calling the next soul':'Close this case before calling the next soul')+'"'+(!ready?' disabled':'')+'>'+bellSVG()+'<span class="bell-caption" aria-live="polite">'+(ready?'Call next':'')+'</span></button>';}
 function courtQuill(c,s){if(c.phase!=='pavilion')return '';const mission=PV.checklistOf(c,s);return '<button class="court-quill'+(mission.correct?' is-complete':' is-needed')+'" data-action="checklist" aria-label="Open judgment checklist" title="Judgment checklist" aria-haspopup="dialog" aria-controls="judgment-checklist">'+NetherCourtChecklist.quillSVG()+'</button>';}
 function portrait(c){const colors=['#8f9e8a','#ab9479','#8c9aa6','#a09a81'];return '<svg class="portrait" viewBox="0 0 180 170" role="img" aria-label="Soul portrait of '+c.name+'"><path d="M32 170L44 126Q90 94 136 126L154 170" fill="'+colors[c.index%4]+'"/><path d="M71 99V121L91 148L110 121V99" fill="#a69c80"/><path d="M55 89V45Q91 7 127 45V101L110 116H71Z" fill="#53645b"/><path d="M66 48Q92 20 116 49L112 93Q92 119 72 94Z" fill="#c1b798"/><path d="M61 57L73 35L91 30L115 43L124 62L105 46L99 37L80 51Z" fill="#69786b"/><path d="M76 69H84M99 69H107M92 70L88 84H95M83 94Q92 100 103 93" fill="none" stroke="#5d6959" stroke-width="2"/><path d="M60 125L82 170M124 124L103 170" stroke="#d2c8a0" fill="none"/></svg>';}
 /* The player's record so far: right calls, and how they split by gate. The
    gate breakdown is a dimension they track without being told it is one. */
 function tally(){
  let right=0,total=0,east=0,west=0;
  for(const [id,s] of states){
   if(!caseClosed(s))continue;
   total++;
   if(!s.correct)continue;
   right++;
   const c=D.cases().find(x=>x.id===id);
   if(c&&c.gate==='East')east++;else if(c&&c.gate==='West')west++;
  }
  return {right,total,east,west};
 }
 function header(){
  const total=D.cases().length,stats=tally();
  $('#obol-count').textContent=EC.state.light;
  const clarity=$('#clarity-count');
  if(clarity)clarity.textContent=EC.state.clarity;
  document.body.classList.toggle('fading',EC.fading());
  const sealTag=$('#seal-count');
  if(sealTag)sealTag.textContent=EC.state.seals;
  $('#place-back').hidden=screen==='map';
  const ferry=D.cases().filter(c=>c.phase==='ferry');
  NetherProgress.completeFerry(ferry.length>0&&ferry.every(c=>['approved','disputed'].includes(states.get(c.id)?.status)));

 }
 function syncCourt(){const locked=!NetherProgress.canVisit('marsh'),marker=$('#marsh-marker');marker.disabled=locked;marker.setAttribute('aria-label','Court of Judgement'+(locked?' · Locked until ferry rounds are complete':''));marker.querySelector('.location-ring').innerHTML=locked?'<span aria-hidden="true">&#128274;</span>':'III';const devToggle=$('#dev-court-toggle');if(devToggle)devToggle.setAttribute('aria-pressed',String(NetherProgress.state.devCourt));}
 addEventListener('nether:progress',syncCourt);syncCourt();
 function exitMagnifier(){magnifierMode=false;clearArm();document.body.classList.remove('magnifier-mode');}
 // Both landings use this single workstation, its renderers and event handlers.
 // Keep the place in `screen` so returning to the river uses the right pier.
 const workstation=value=>value==='desk'||value==='marsh';
 function setScreen(next){
  if(next==='marsh'&&!NetherProgress.canVisit('marsh')){toast('Complete your rounds at Charon’s Ferry to enter the court.');return;}
  if(!workstation(next)){checklist.close();if(S())S().callingNext=false;exitMagnifier();}screen=next;document.body.dataset.screen=next;world.setScreen(next);
  const surface=workstation(next)?'desk':next;
  for(const id of ['map','desk','home','shop'])$('#'+id+'-screen').hidden=id!==surface;
  $('#desk-screen').setAttribute('aria-label',next==='marsh'?'Court of Judgement workstation':'Charon’s Ferry workstation');
  header();if(workstation(next))render();rooms.enter(next);
 }
 // --- Magnifier: open it from its dock, arm a detail on one side, resolve against a detail on the other. ---
 function cmp(zone,cat,val,label){return 'data-action="compare" data-zone="'+zone+'" data-cat="'+esc(cat)+'" data-val="'+esc(val)+'" data-label="'+esc(label)+'"';}
 /* Expose the original fields through the dimmer instead of repainting them. */
 let focusFrame=0;
 function queueMagnifierFocus(){if(!focusFrame)focusFrame=requestAnimationFrame(()=>{focusFrame=0;paintMagnifierFocus();});}
 function paintMagnifierFocus(){
  const scrim=$('#magnifier-scrim');if(!scrim)return;
  if(!magnifierMode){scrim.innerHTML='';$('#magnifier-borders')?.replaceChildren();return;}
  const width=innerWidth,height=innerHeight,borders=[],visible=[];
  const holes=[...document.querySelectorAll('.magnifier-armed,.magnifier-hit,.magnifier-toggle')].map(el=>{
   if(!el.getClientRects().length)return '';
   const r=el.getBoundingClientRect(),padding=el.matches('.magnifier-toggle')?13:3;
   let left=Math.max(0,r.left-padding),top=Math.max(0,r.top-padding),right=Math.min(width,r.right+padding),bottom=Math.min(height,r.bottom+padding);
   for(let parent=el.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
    const style=getComputedStyle(parent),clip=parent.getBoundingClientRect();
    if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}
    if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}
   }
   if(right<=left||bottom<=top)return '';
   visible.push(el);
   const shape='x="'+left+'" y="'+top+'" width="'+(right-left)+'" height="'+(bottom-top)+'" rx="'+(padding===13?12:3)+'"';
   if(padding!==13)borders.push('<rect '+shape+' class="magnifier-border '+(el.dataset.hit||'armed')+'"/>');
   return '<rect '+shape+' fill="black"/>';
  }).join('');
  scrim.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><defs><mask id="magnifier-light-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="'+width+'" height="'+height+'"><rect width="100%" height="100%" fill="white"/>'+holes+'</mask></defs><rect width="100%" height="100%" fill="#05090c" mask="url(#magnifier-light-mask)"/></svg>';
  let bordersSVG=$('#magnifier-borders');if(!bordersSVG){bordersSVG=document.createElementNS('http://www.w3.org/2000/svg','svg');bordersSVG.id='magnifier-borders';bordersSVG.setAttribute('aria-hidden','true');document.body.appendChild(bordersSVG);}bordersSVG.innerHTML=borders.join('');
  if(hit){const ends=hit.ends.map(findComparison);if(ends.every(el=>visible.includes(el)))drawLine(ends[0],ends[1],hit.cls,hit.label);else removeLine();}
 }
 function markFocus(){document.body.classList.toggle('magnifier-focus',!!(armed||hit));queueMagnifierFocus();}
 function clearArm(){armed=null;hit=null;document.querySelectorAll('.magnifier-armed,.magnifier-hit').forEach(n=>{n.classList.remove('magnifier-armed','magnifier-hit');n.removeAttribute('data-hit');});$('#magnifier-borders')?.replaceChildren();removeLine();markFocus();}
 function removeLine(){const svg=$('#magnifier-svg');if(svg)svg.innerHTML='';}
 function findComparison(p){return [...document.querySelectorAll('[data-action="compare"]')].find(el=>el.dataset.cat===p.cat&&el.dataset.val===p.val&&el.dataset.zone===p.zone&&(!p.key||el.dataset.compareKey===p.key));}
 /* The result of a comparison: a dotted line between the two entries and a coloured label, until the next comparison. */
 function drawLine(a,b,cls,label){const svg=$('#magnifier-svg');if(!svg||!a.isConnected||!b.isConnected||!a.getClientRects().length||!b.getClientRects().length)return;
  const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),[l,r]=ar.left<=br.left?[ar,br]:[br,ar],apart=l.right+14<r.left;
  const x1=apart?l.right+7:l.left+l.width/2,x2=apart?r.left-7:r.left+r.width/2,y1=l.top+l.height/2,y2=r.top+r.height/2,mid=(x1+x2)/2,my=(y1+y2)/2,text=String(label).toUpperCase(),w=text.length*9+34;
  svg.innerHTML='<path class="magnifier-line '+cls+'" d="M'+x1+' '+y1+'H'+mid+'V'+y2+'H'+x2+'"/><circle class="magnifier-dot '+cls+'" cx="'+x1+'" cy="'+y1+'" r="5"/><circle class="magnifier-dot '+cls+'" cx="'+x2+'" cy="'+y2+'" r="5"/>'
   +'<rect class="magnifier-pill '+cls+'" x="'+(mid-w/2)+'" y="'+(my-15)+'" width="'+w+'" height="30" rx="15"/><text class="magnifier-line-label '+cls+'" x="'+mid+'" y="'+(my+5)+'" text-anchor="middle">'+esc(text)+'</text>';
 }
 function reapplyArm(){
  const find=findComparison;
  if(armed){const match=find(armed);if(match){armed.el=match;match.classList.add('magnifier-armed');}}
  if(hit)for(const end of hit.ends){const match=find(end);if(match){match.classList.add('magnifier-hit');match.dataset.hit=hit.cls;}}
  markFocus();
 }
 function setMagnifier(on){magnifierMode=on;clearArm();document.body.classList.toggle('magnifier-mode',on);soul();}
 function compareClick(el){
  if(!magnifierMode||settled())return;
  const zone=el.dataset.zone,cat=el.dataset.cat,val=el.dataset.val,label=el.dataset.label,key=el.dataset.compareKey;
  if(armed&&armed.el===el)return;
  if(hit?.ends.some(end=>end.zone===zone&&end.cat===cat&&end.val===val&&end.key===key))return;
  if(!armed||armed.zone===zone){clearArm();armed={zone,cat,val,label,key,el};el.classList.add('magnifier-armed');markFocus();return;}
  const a=armed,b={zone,cat,val,label,key,el};clearArm();
  // Whose record is this? Read it from the rest of the paper and the rest of the Book row (compare-logic.js).
  const paper=a.zone==='soul'?a.el:b.el,book=a.zone==='soul'?b.el:a.el,cells=(box,z)=>box?[...box.querySelectorAll('[data-action="compare"][data-zone="'+z+'"]')].map(n=>({cat:n.dataset.cat,val:n.dataset.val})):[];
  let rowCells=cells(book.closest('tr'),'truth');if(book.dataset.compareRecord)try{rowCells=JSON.parse(book.dataset.compareRecord);}catch{}
  // A coin is only compared with the mint of the soul's own birthplace (the one on the declaration), never another country's.
  const place=a.cat==='obol'&&book.dataset.place?{claimed:C().paper?.birthplace,shown:book.dataset.place}:undefined;
  const {result,cls}=NetherCompare.judge(a,b,cells(paper.closest('dl.zoom-fields')||paper.parentElement,'soul'),rowCells,place);
  if(cls==='mismatch'){S().evidence=true;S().stampPrompt=!S().drawerOpen;}
  drawLine(a.el,b.el,cls,result);
  hit={cls,label:result,ends:[a,b].map(({zone,cat,val,key})=>({zone,cat,val,key}))};
  dispatchEvent(new CustomEvent('nether:compare',{detail:{result:cls,text:result}}));
  soul();
 }
 // --- The desk: documents lie on the table until dragged (or clicked) up into the open workspace. ---
 function docLabel(doc){return NetherPapers.label(doc,C());}
 /* Paper labels match the Book's field names without repeating model metadata. */
 const bookLabel=(cat,fallback)=>D.fieldLabel(cat)||fallback;
 const lineHead=(cat,fallback)=>esc(bookLabel(cat,fallback));
 const paperHelpers=()=>({cmp,esc,fmtDate:v=>NetherDate.fmt(v),legacy:zoomSupport,label:cat=>D.fieldLabel(cat)});
 /* A coin is judged whole: front and back at once. Both sides of the comparison describe it the same way. */
 const coinValue=coin=>JSON.stringify({emblem:coin.symbol,mark:coin.mark,rim:coin.rim,metal:coin.metal});
 function obolButton(c,s,big){
  const face=s.coinFlipped?coinBackSVG(c.coin):coinSVG(c.coin),cls=big?'obol-loose':'desk-coin',docAttr=big?'':' data-doc="obol"';
  if(magnifierMode)return '<button class="'+cls+'"'+docAttr+' '+cmp('soul','obol',coinValue(c.coin),'The offered obol')+'>'+face+'</button>';
  return '<button class="'+cls+'"'+docAttr+' aria-label="The offered obol" title="'+(big?'Click to flip':'Drag up to examine, or click to open')+'">'+face+'</button>';
 }
 function deskRow(c,s){const onTable=s.departed?[]:papersOf(c).filter(d=>!s.open[d]);return '<div class="desk-surface"'+(s.departing||s.departed?' inert':'')+'>'+onTable.map(doc=>'<button class="desk-item desk-item--'+NetherPapers.typeOf(doc,c)+(s.stampMark&&doc==='permit'?' stamped-'+s.stampMark:'')+'" data-doc="'+doc+'" aria-label="Open '+docLabel(doc)+'" title="Drag up to examine, or click to open"></button>').join('')+(!s.departed&&!s.open.obol&&c.coin?obolButton(c,s,false):'')+'</div>';}
 function deskClock(){const date=NetherDate.current(C());return '<div class="desk-clock" tabindex="0" aria-describedby="bc-calendar-tip"><svg viewBox="0 0 100 106" aria-hidden="true"><path d="M12 93V21Q13 15 19 15H81Q87 15 88 21V93Z" fill="#4a5f48" stroke="#899a72" stroke-width="2"/><path d="M17 88V23H83V88Z" fill="none" stroke="#bca67b" stroke-width=".7" opacity=".6"/><rect x="8" y="91" width="84" height="9" rx="2" fill="#3f4633" stroke="#a59364"/><circle cx="50" cy="51" r="30" fill="#92966e" stroke="#a5ae84"/><circle cx="50" cy="51" r="26.5" fill="#c9cdaa" stroke="#5e6247"/><g stroke="#726a49" stroke-width="1.5"><path d="M50 27V31M50 71V75M26 51H30M70 51H74M33 34L36 37M64 65L67 68M33 68L36 65M64 37L67 34"/></g><path d="M50 34V51L40 60" fill="none" stroke="#424b39" stroke-width="2.5" stroke-linecap="round"/><circle cx="50" cy="51" r="2.4" fill="#9d8655"/><path d="M22 84H78" stroke="#b29e6a"/></svg><time datetime="'+esc(date)+'">'+esc(NetherDate.compact(date))+'</time><span class="bc-calendar-tip" id="bc-calendar-tip" role="tooltip">BC years count down like a rocket launch: the bigger the number, the longer ago.</span></div>';}
 function bookHolder(s){const open=!!s.open.guide;const magBtn='<button class="magnifier-toggle" data-action="magnifier" aria-pressed="'+magnifierMode+'" aria-label="'+(magnifierMode?'Close':'Open')+' the cross-check magnifier" title="Compare a soul’s document against the Book of Truth">'+magnifierSVG()+'</button>';return '<div class="book-tray">'+deskClock()+'<div class="book-holder">'+(open?'<div class="book-slot" aria-hidden="true"></div>':'<button class="desk-book" data-doc="guide" aria-label="Open the Book of Instruction" title="Drag up to examine, or click to open">'+guideBookSVG()+'</button>')+'</div>'+magBtn+'</div>';}
 const PAPER_FIELDS=[{id:'identity_id',label:'Identity ID'},{id:'name',label:'Name'},{id:'birthdate',label:'Birthdate'},{id:'birthplace',label:'Birthplace'},{id:'issue_place',label:'Issued at'}];
 function zoomIdentity(c){return '<p class="eyebrow">'+esc(NetherPapers.label('identity',c).toUpperCase())+'</p>'+portrait(c)+'<dl class="zoom-fields">'+PAPER_FIELDS.map(f=>'<button class="zoom-field" '+cmp('soul','nether_person.'+f.id,c.paper[f.id],bookLabel('nether_person.'+f.id,f.label)+': '+NetherDate.fmt(c.paper[f.id]))+'><dt>'+lineHead('nether_person.'+f.id,f.label)+'</dt><dd class="'+(f.id==='signature'?'hand-signature':'')+'">'+esc(NetherDate.fmt(c.paper[f.id]))+'</dd></button>').join('')+'</dl>';}
 function permitStamp(c,s){if(!s.stampMark)return '';const yes=s.stampMark==='approved',date=NetherDate.fmt(s.stampedOn||NetherDate.current(c)),issuer=c.phase==='ferry'?'CHARON’S FERRY':'COURT OF JUDGEMENT';return '<div class="paper-stamp '+s.stampMark+'" role="img" aria-label="'+(yes?'Passage approved':'Passage denied')+' on '+esc(date)+'"><span class="paper-stamp-date">'+esc(date)+'</span><span class="paper-stamp-verdict"><strong>PASSAGE<br>'+(yes?'GRANTED':'DENIED')+'</strong><svg viewBox="0 0 36 40" aria-hidden="true"><path d="M18 2L32 8V23Q29 33 18 38Q7 33 4 23V8Z"/><path d="'+(yes?'M10 20L16 26L27 13':'M11 13L26 28M26 13L11 28')+'"/></svg></span><small>'+issuer+'</small></div>';}
 function zoomPermit(c,s){return '<div class="permit-stamp-area" aria-label="Entrance stamp area">'+permitStamp(c,s)+'</div><p class="permit-stamp-caption">ENTRANCE SEAL</p><div class="permit-rule" aria-hidden="true"></div><p class="eyebrow">'+esc(NetherPapers.label('permit',c).toUpperCase())+'</p><h3>'+esc(c.permit.permit_id)+'</h3><small class="paper-ref-label">'+esc(bookLabel('nether_passage_permit.permit_id','Permit Id'))+'</small><dl class="zoom-fields"><button class="zoom-field" '+cmp('soul','nether_person.name',c.name,bookLabel('nether_person.name','Name')+': '+c.name)+'><dt>'+lineHead('nether_person.name','Name')+'</dt><dd>'+esc(c.name)+'</dd></button><button class="zoom-field" '+cmp('soul','nether_passage_permit.seal',c.permit.seal,bookLabel('nether_passage_permit.seal','Seal')+': '+c.permit.seal)+'><dt>'+lineHead('nether_passage_permit.seal','Seal')+'</dt><dd>'+esc(c.permit.seal)+'</dd></button><button class="zoom-field" '+cmp('soul','nether_passage_permit.issued_on',c.permit.issued_date,bookLabel('nether_passage_permit.issued_on','Issued')+': '+NetherDate.fmt(c.permit.issued_date))+'><dt>'+lineHead('nether_passage_permit.issued_on','Issued')+'</dt><dd>'+esc(NetherDate.fmt(c.permit.issued_date))+'</dd></button><button class="zoom-field" '+cmp('soul','nether_passage_permit.expires_on',c.permit.expires_on,bookLabel('nether_passage_permit.expires_on','Expires')+': '+NetherDate.fmt(c.permit.expires_on))+'><dt>'+lineHead('nether_passage_permit.expires_on','Expires')+'</dt><dd>'+esc(NetherDate.fmt(c.permit.expires_on))+'</dd></button></dl>';}
 function zoomSupport(c){return '<p class="eyebrow">SUPPORTING CLAIM</p><button class="zoom-field support-claim" '+cmp('soul','support',JSON.stringify({id:c.support.id}),c.support.claim)+'><p>'+esc(c.support.claim)+'</p></button><small>Supporting reference: '+c.support.id+'</small>';}
 function realmMapSVG(){return '<svg class="instruction-map-art" viewBox="0 0 600 380" role="img" aria-label="A chart of the nine mint countries, peninsulas and islands around the Ash Sea"><defs><pattern id="chart-waves" width="45" height="32" patternUnits="userSpaceOnUse"><path d="M8 20q7-5 14 0t14 0" fill="none" stroke="#617e77" stroke-width="1" opacity=".3"/></pattern></defs><rect width="600" height="380" fill="#a1b3a0"/><rect width="600" height="380" fill="url(#chart-waves)"/><g fill="#e0cf9d" stroke="#6c7253" stroke-width="2.5" stroke-linejoin="round"><path d="M28 34L80 19L109 34L145 27L176 41L190 67L218 48L259 34L293 48L311 31L348 44L367 72L348 106L364 131L345 150L310 138L292 158L271 148L253 176L225 180L213 206L187 215L178 240L154 223L138 237L115 219L112 188L84 180L65 162L74 137L48 122L34 98L46 70Z"/><path d="M380 33L416 18L448 37L470 31L489 48L535 44L565 65L551 93L568 109L545 123L509 111L490 124L458 113L447 91L414 103L395 88L374 66Z"/><path d="M463 153L500 142L530 157L554 151L577 175L562 196L532 206L516 194L486 207L465 184Z"/><path d="M45 254L87 246L112 261L145 250L165 269L155 294L136 306L104 295L84 313L58 298L34 280Z"/><path d="M241 258L277 242L309 254L343 245L365 268L349 292L312 303L286 292L258 303L235 283Z"/><path d="M426 256L462 247L483 262L519 253L545 275L528 299L500 296L483 317L451 301L425 305L413 281Z"/><path d="M381 183L396 175L405 189L395 202L379 196ZM353 220L367 214L376 227L365 238L350 231ZM403 227L415 224L423 238L411 246L399 237Z"/></g><g fill="none" stroke="#8e8058" stroke-width="1.2" stroke-dasharray="4 4"><path d="M178 42L161 94L194 130L175 165L188 214M52 128L111 117L194 130L266 113L347 108M270 40L266 113L292 157"/></g><g fill="none" stroke="#82744d" stroke-width="2"><path d="M94 89l12-22 14 22m-20-8 6-14 8 13M230 76l12-23 14 23m-20-8 6-15 7 14M460 70l12-23 14 23M97 281l11-19 12 19M297 279l12-20 13 20"/></g><text x="328" y="187" text-anchor="middle" fill="#5e786e" font-size="15" font-family="Georgia" font-style="italic" transform="rotate(-12 328 187)">Ash Sea</text><g transform="translate(560 327)" stroke="#726a47" fill="none"><path d="M0-21V21M-16 0H16M0-18L-5 2L0-3L5 2Z"/><text x="0" y="-26" text-anchor="middle" fill="#726a47" stroke="none" font-size="11">N</text></g></svg>';}
 function guideContent(){
  const mint=bookTab==='countries'?D.mints().find(m=>m.country===bookCountry):null;
  const title=bookTab==='guide'?'Rules':mint?mint.country:'Maps';
  const tabs='<nav class="book-tabs" aria-label="Instruction book sections">'+['guide','countries'].map(t=>'<button data-action="booktab" data-tab="'+t+'" aria-pressed="'+(bookTab===t)+'">'+(t==='guide'?'Rules':'Maps')+'</button>').join('')+'</nav>';
  let body;
  if(bookTab==='guide')body='<div class="instruction-spread instruction-spread--single"><section class="instruction-page"><ul class="guide-list">'+GUIDE.map(g=>'<li>'+esc(g)+'</li>').join('')+'</ul></section></div>';
  else{
   if(!mint){
    body='<div class="country-map">'+realmMapSVG()+D.mints().map(m=>'<button class="country-pin" style="left:'+m.map.x+'%;top:'+m.map.y+'%" data-action="country" data-country="'+esc(m.country)+'"><span class="pin-dot"></span><small>'+esc(m.country)+'</small></button>').join('')+'</div>';
   } else {
    body='<div class="country-detail instruction-spread instruction-spread--single"><section class="instruction-page">'
     +'<h4 class="country-section-title">Coin</h4><button class="zoom-field coin-pair" '+cmp('truth','obol',coinValue(mint),mint.country+' mint reference')+' data-place="'+esc(mint.country)+'"><span class="coin-pair-faces">'+coinSVG(mint)+coinBackSVG(mint)+'</span><small>Obol, both faces</small></button>'
     +'<h4 class="country-section-title">Issue locations</h4><ul class="office-list issue-office-list">'+(mint.locations||[]).slice(0,3).map(place=>'<li><button class="zoom-field" '+cmp('truth','nether_person.issue_place',place,'Issue location: '+place)+'>'+esc(place)+'</button></li>').join('')+'</ul></section></div>';
   }
  }
  return '<div class="instruction-heading">'+(mint?'<button class="instruction-bookmark is-back" data-action="country" data-country="" aria-label="Back to the map" title="Back to the map"><svg viewBox="0 0 10 14" aria-hidden="true"><path d="M7.5 2L3 7l4.5 5"/></svg></button>':'<span class="instruction-bookmark" aria-hidden="true"></span>')+'<h3 class="instruction-title" title="'+esc(title)+'">'+esc(title)+'</h3></div>'+tabs+'<div class="instruction-leaves">'+body+'</div>';
 }
 function docContent(doc,c,s){if(doc==='guide')return guideContent();if(doc==='obol')return obolButton(c,s,true);if(doc==='identity')return zoomIdentity(c,s);if(doc==='permit')return zoomPermit(c,s);return NetherPapers.html(doc,c,paperHelpers());}
 function cascadePos(n){return {x:16+n*24,y:14+n*20};}
 function zoomStage(c,s){const entries=Object.entries(s.open);return '<div class="zoom-stage">'+entries.map(([doc,pos])=>'<div class="open-doc open-doc--'+NetherPapers.typeOf(doc,c)+'" data-doc="'+doc+'" style="left:'+pos.x+'px;top:'+pos.y+'px;z-index:'+pos.z+'">'+docContent(doc,c,s)+'</div>').join('')+'</div>';}
 function soul(){const c=C(),s=S();checklist.sync(c);const elapsed=performance.now()-(s.arrivalAt??-10000),arriving=elapsed<1400&&!s.departed;$('#soul-panel').innerHTML='<div class="panel-heading"><h2>'+(screen==='marsh'?'Judgement examination':'Identity examination')+'</h2><small>CASE '+String(c.index+1).padStart(2,'0')+'</small></div><div class="soul-window"><div class="soul-figure'+(s.departed?' is-departed':'')+(s.departing?' is-departing':'')+(arriving?' is-arriving':'')+'"'+(arriving?' style="animation-delay:-'+Math.max(0,elapsed)+'ms"':'')+'>'+portrait(c)+'</div>'+soulBell(s)+courtQuill(c,s)+'</div>'+deskRow(c,s)+zoomStage(c,s)+bookHolder(s);deskFooter();reapplyArm();}
 function stampImpact(){NetherSound.cue('stamp');removeLine();const paper=$('.open-doc--permit');paper?.classList.add('stamp-landing');setTimeout(()=>paper?.classList.remove('stamp-landing'),550);}
 function stampToolSVG(yes){
  const id=yes?'approved':'denied',light=yes?'#75864f':'#ae6050',mid=yes?'#475c34':'#7b322c',dark=yes?'#263b28':'#4b211f';
  return '<svg class="stamp-tool" viewBox="0 0 140 150" aria-hidden="true"><defs><linearGradient id="'+id+'-base" x2="0" y2="1"><stop stop-color="'+light+'"/><stop offset=".3" stop-color="'+mid+'"/><stop offset="1" stop-color="'+dark+'"/></linearGradient><linearGradient id="'+id+'-wood"><stop stop-color="#292b24"/><stop offset=".22" stop-color="#64614b"/><stop offset=".5" stop-color="#484637"/><stop offset=".8" stop-color="#303126"/><stop offset="1" stop-color="#191f1c"/></linearGradient><linearGradient id="'+id+'-metal"><stop stop-color="#454b42"/><stop offset=".3" stop-color="#b7ad85"/><stop offset=".6" stop-color="#767960"/><stop offset="1" stop-color="#373f36"/></linearGradient></defs><ellipse cx="71" cy="142" rx="60" ry="6" fill="#030a08" opacity=".65"/><rect x="12" y="121" width="116" height="17" rx="3" fill="#171c17" stroke="#767461"/><path d="M10 99L23 74Q25 70 31 70H111Q116 70 119 75L131 99V128H10Z" fill="url(#'+id+'-base)" stroke="'+dark+'" stroke-width="2"/><path d="M13 99L27 77H114L128 99Z" fill="'+mid+'" stroke="'+light+'" stroke-width="2"/><path d="M14 103H127M18 127H124" fill="none" stroke="'+light+'" opacity=".65"/><path d="M19 106V123M122 107V123" stroke="'+dark+'" stroke-width="2"/><ellipse cx="71" cy="86" rx="25" ry="9" fill="#142019" opacity=".6"/><rect x="59" y="50" width="24" height="33" rx="5" fill="url(#'+id+'-metal)"/><ellipse cx="71" cy="80" rx="12" ry="4" fill="#575c49"/><path d="M43 24H99V58C99 76 43 76 43 58Z" fill="url(#'+id+'-wood)" stroke="#262c23" stroke-width="2"/><path d="M49 29V57M54 30V64M92 29V60" stroke="#a39870" stroke-width="1" opacity=".23"/><ellipse cx="71" cy="24" rx="28" ry="13" fill="#6e6c55" stroke="#b1a47a" stroke-width="1.4"/><ellipse cx="71" cy="23" rx="20" ry="8" fill="#898268" opacity=".48"/><path d="M48 26Q69 39 94 27" fill="none" stroke="#d0be8a" opacity=".3"/><rect x="23" y="108" width="94" height="17" rx="1" fill="'+dark+'" stroke="'+light+'" stroke-width=".7"/><text x="70" y="120" text-anchor="middle" fill="'+(yes?'#d5d6a1':'#e1b49b')+'" font-family="Georgia,serif" font-size="10" font-weight="bold" letter-spacing="1">'+(yes?'APPROVED':'DENIED')+'</text><g fill="#b3a67b"><circle cx="17" cy="117" r="1.6"/><circle cx="124" cy="117" r="1.6"/></g></svg>';
 }
 let toastTimer=null;
 function toast(message){
  const el=$('#toast');if(!el)return;
  el.textContent=message;el.classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4200);
 }
 function deskFooter(){const s=S();
  const drawerOpen=s.drawerOpen;
  const mission=C().phase==='pavilion'?PV.checklistOf(C(),s):null;
  const denyAvailable=s.evidence,approveAvailable=!mission||mission.correct;
  const stamp=(yes)=>'<button class="stamp-plunger '+(yes?'accept':'reject')+(s.grading&&s.stampingAction===(yes?'approve':'dispute')?' is-pressing':'')+'" data-action="'+(yes?'approve':'dispute')+'" aria-label="'+(yes?'Approve':'Deny')+' passage permit" '+(settled()||s.grading?'disabled':'')+'>'+stampToolSVG(yes)+'<span class="plunger-label">'+(yes?'APPROVED':'DENIED')+'</span></button>';
  const stamps='<div class="stamp-press"><div class="stamp-bay'+(!denyAvailable?' is-empty':'')+'">'+(denyAvailable?stamp(false):'')+'</div><div class="stamp-bay'+(!approveAvailable?' is-empty':'')+'">'+(approveAvailable?stamp(true):'')+'</div></div>';
  const hint=s.grading?'Putting it to the Books…':mission&&!mission.correct?'Complete the judgment checklist to unlock Approve':'Align permit beneath stamp';
  $('#verdict-bar').innerHTML='<div class="stamp-dock '+(drawerOpen?'open':'')+(s.stampPrompt&&!drawerOpen?' needs-attention':'')+'"><div class="stamp-drawer-panel"><button class="stamp-tab" data-action="stamptab" aria-label="'+(drawerOpen?'Close':'Open')+' the entrance stamps" aria-expanded="'+drawerOpen+'"'+(s.stampPrompt&&!drawerOpen?' title="Discrepancy found · open the entrance stamps"':'')+'>❯</button><div class="stamp-drawer-inner"><p class="stamp-holder-label">ENTRANCE STAMPS</p>'+stamps+'<p class="stamp-hint" aria-live="polite">'+hint+'</p></div></div></div>';
 }
 // The same analysis workbench serves both ferry and court examinations.
 function searchField(model){const fields=SCH(model).fields;return (fields.find(f=>!f.key&&f.type==='text')||fields.find(f=>!f.key)||fields[0]).id;}
 function workbench(){analysis.render(S());}
 function recordTable(id,rows,interactive=false){const schema=SCH(id),pk=D.primary(id),support=C().support;return '<div class="identity-record-scroll" data-anfra-query="records-'+id+'"><table class="result-table identity-records"><thead><tr>'+schema.fields.map(f=>'<th>'+esc(f.label)+(f.key?'<small>'+f.key+'</small>':'')+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>{const isSupportRow=interactive&&support&&id===support.model&&row[pk]===support.id;return '<tr '+(interactive?'data-action="record" data-record="'+esc(row[pk])+'" tabindex="0" role="button" aria-label="Select '+esc(row[pk])+'"':'')+' class="'+(interactive&&S().selection===row[pk]?'selected':'')+'">'+schema.fields.map((f,i)=>{
   if(f.references)return '<td><button class="record-reference" data-action="reference" data-ref="'+f.references+'" data-value="'+esc(row[f.id])+'">'+esc(row[f.id])+' ↗</button></td>';
   if(isSupportRow&&i===0)return '<td><button class="record-field-cell" '+cmp('truth','support',JSON.stringify({[pk]:row[pk]}),schema.name+' '+row[pk])+'>'+esc(row[f.id])+'</button></td>';
   return '<td><button class="record-field-cell" '+cmp('truth',id+'.'+f.id,row[f.id],f.label+': '+NetherDate.fmt(row[f.id]))+'>'+esc(NetherDate.fmt(row[f.id]))+'</button></td>';
  }).join('')+'</tr>';}).join('')+'</tbody></table>'+(!rows.length?'<p class="empty-note">No records match this search.</p>':'')+'</div>';}
 function render(){soul();workbench();header();checkDeparture();}
 const pending=[];
 function queueScreen(title,body){pending.push({title,body});}
 function showNext(){
  const next=pending.shift();
  if(next)overlay(next.title,next.body);
 }

 /* The notebook: a book with side tabs. Calendar of the twenty days, and the mission. */
 const NB_DAYS=20;let nbTab='calendar',nbPending,nbCase=null,nbReviewCase=null;
 const NB_TABS=[['calendar','Calendar'],['mission','Mission'],['ledger','Case ledger']];
 function nbCalendar(){
  const current=active&&C()?C().day:1;
  return '<div class="nb-calendar">'+Array.from({length:NB_DAYS},(_,i)=>{const day=i+1,done=shiftsClosed.has(day),now=day===current&&!done;
   return '<div class="nb-day'+(done?' is-done':'')+(now?' is-current':'')+'" aria-label="Day '+day+(done?', complete':now?', today':'')+'"><header>Day '+day+'</header><div class="nb-day-body">'+(done?'<span class="nb-check" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9"/></svg></span>':now?'<span class="nb-today">Today</span>':'')+'</div></div>';}).join('')+'</div>';
 }
 function nbMission(){
  const open=NetherProgress.canVisit('marsh');
  return '<div class="nb-mission"><p>'+(open?'The ferry queue is cleared. Cross the river to the <b>Court of Judgement</b> and take your seat before the judges.':'Charon\u2019s ferry is crowded. Examine every soul on the ferry and decide where each should go. When the last one is settled, the Court of Judgement opens.')+'</p></div>';
 }
 function renderNotebook(){
  const el=$('#notebook'),title=(NB_TABS.find(([id])=>id===nbTab)||[])[1]||'Notebook';
  const body=nbTab==='calendar'?nbCalendar():nbTab==='ledger'?(nbCase?ledgerDetail(nbCase):ledgerHTML(nbPending)):nbMission();
  el.innerHTML=NetherUI.tabs.html(NB_TABS,nbTab,'data-tab','Notebook sections')+NetherUI.modal.html({title,body,closeAttrs:'data-nb="close" aria-label="Close notebook"'});
 }
 $('#notebook').addEventListener('close',()=>{
  const id=nbReviewCase;nbReviewCase=null;if(!id)return;
  const reviewed=states.get(id);if(reviewed)reviewed.ledgerReviewed=true;
  if(active===id&&workstation(screen)){
   soul();
   // The last ferry soul has gone. Finish the queued day messages, then
   // return to the river for Minos's invitation without another bell ring.
   if(C().phase==='ferry'&&reviewed?.departed&&NetherProgress.state.ferryComplete){
    advanceWhenQuiet=true;
    if(!$('#overlay').open)showNext();
    if(!$('#overlay').open){advanceWhenQuiet=false;advance();}
   }
  }
 });
 document.addEventListener('keydown',e=>{const row=e.target.closest&&e.target.closest('#notebook .case-trow');if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();row.click();}});
 document.addEventListener('click',e=>{
  const tab=e.target.closest&&e.target.closest('#notebook .nui-tabs [data-tab]'),el=$('#notebook');
  if(tab){nbTab=tab.dataset.tab;nbPending=undefined;nbCase=null;renderNotebook();return;}
  const t=e.target.closest&&e.target.closest('[data-nb]');
  if(!t){if(e.target===el)el.close();return;}
  if(t.dataset.nb==='open'){nbPending=undefined;nbCase=null;renderNotebook();if(!el.open)el.showModal();}
  else if(t.dataset.nb==='close')el.close();
  else if(t.dataset.nb==='tab'){nbTab=t.dataset.tab;nbPending=undefined;nbCase=null;renderNotebook();}
  else if(t.dataset.nb==='case'){nbCase=t.dataset.case;renderNotebook();}
  else if(t.dataset.nb==='back'){nbCase=null;renderNotebook();}
 });
 function overlay(title,body){const el=$('#overlay');el.innerHTML='<div class="overlay-heading"><h2 id="overlay-title">'+title+'</h2><button data-action="closeoverlay" class="overlay-close" aria-label="Close dialog">×</button></div>'+body;if(!el.open)el.showModal();}
 /* The stamp. Whether the call was right is not stored on the case and is not
    decided here: the four checks are put to the Books, and what they answer is
    what the player is measured against.

    AD-12: everything resolves before anything is recorded. If a Book will not
    answer, the case is left exactly as it was — a dropped query must never
    cost a soul their verdict, nor hand out a reward worth farming. */
 async function decide(action){
  const s=S(),c=C();
  if(settled()||s.grading)return;
  const allowed=PV.gate(c,s,action);
  if(!allowed.ok){toast(allowed.why);return;}
  s.grading=true;s.stampingAction=action;deskFooter();
  let resolved;
  try{resolved=await G.resolveAll(c);}
  catch{resolved={unresolved:true,findings:[]};}
  s.grading=false;s.stampingAction=null;
  if(S()!==s)return;                       // the player walked away mid-query
  if(resolved.unresolved){
   toast('The Books will not answer just now. Nothing has been written down.');
   deskFooter();return;
  }
  s.findings=resolved.findings;
  s.truth=G.verdictFor(resolved.findings);
  s.correct=action===s.truth;
  s.status=action==='approve'?'approved':'disputed';
  s.stampMark=action==='approve'?'approved':'disputed';
  s.stampedOn=NetherDate.current(c);
  s.departed=false;s.departing=false;s.ledgerOpened=false;s.ledgerReviewed=false;
  if(action==='approve')world.sendToMarsh?.();
  stageTwo=done()===D.cases().length;
  if(!s.open.permit)openAt('permit',16,14);else s.open.permit.z=++zTop;
  soul();
  stampImpact();
  const paid=EC.award({verdictCorrect:s.correct,answerCorrect:s.answerCorrect,phase:c.phase});
  s.paid=paid;
  const stats=tally();
  const seal=EC.evaluate(stats);
  if(c.phase==='finale'){queueScreen('The petition',FIN.petitionScreen(petitionAnswers,petitionResult));}
  else{
   if(seal.gained)queueScreen('A seal · '+EC.SEALS[seal.seals-1].judge,EC.sealScreen(stats));
   if(dayFinished(c.day))closeShift(c.day);
  }
  setTimeout(()=>{soul();checkDeparture();},1200);
 }
 function dayFinished(day){
  return D.cases().filter(x=>x.day===day)
   .every(x=>caseClosed(states.get(x.id)));
 }
 function parkCase(c,s){
  if(s.status!=='waiting')return;
  s.status='pending';s.correct=false;s.paid=0;s.open={};s.drawerOpen=false;
  stageTwo=done()===D.cases().length;
  if(dayFinished(c.day))closeShift(c.day);
  if(S()===s){soul();header();checkDeparture();}
 }
 function closeShift(day){
  if(shiftsClosed.has(day))return;
  shiftsClosed.add(day);
  const dayCases=D.cases().filter(c=>c.day===day);if(dayCases.length&&dayCases.every(c=>states.get(c.id)?.correct))EC.flawlessShift(day);
  EC.endShift();          // the river takes its clarity whether or not you spend
  header();
  queueScreen('End of day '+day,'<div class="overlay-body"><p>The shift is over. The keeper’s shop is open.</p><button class="brass-button" data-action="shop">Visit the shop →</button></div>');
  dispatchEvent(new CustomEvent('nether:shift-ended',{detail:{day,completedDays:[...shiftsClosed]}}));
 }
 function allPapersReturned(){return papersOf(C()).every(d=>!S().open[d]);}
 function checkDeparture(){
  const s=S(),id=active;if(!s||!settled()||!allPapersReturned()||s.departing)return;
  if(s.departed){if(!s.ledgerOpened)revealLedger(id);return;}
  s.departing=true;exitMagnifier();s.drawerOpen=false;soul();$('.desk-surface')?.classList.add('returning');
  setTimeout(()=>{
   s.departing=false;s.departed=true;
   if(active!==id||!workstation(screen))return;
   soul();revealLedger(id);
  },650);
 }
 /* Return papers, let the soul leave, review the evaluation, then ring. */
 let advanceWhenQuiet=false;
 function revealLedger(id=active){
  const s=states.get(id);if(!s||s.ledgerOpened||active!==id||!s.departed)return;
  s.ledgerOpened=true;s.ledgerReviewed=false;nbReviewCase=id;
  nbTab='ledger';nbPending=undefined;nbCase=id;renderNotebook();
  const notebook=$('#notebook');if(!notebook.open)notebook.showModal();
 }
 function callNextSoul(){
  const s=S(),id=active;if(!canCallNextSoul(s)||$('#notebook').open)return;
  NetherSound.cue('bell');exitMagnifier();s.callingNext=true;soul();
  dispatchEvent(new CustomEvent('nether:bell',{detail:{caseId:id}}));
  setTimeout(()=>{
   if(!s.callingNext||active!==id||!workstation(screen)){s.callingNext=false;return;}s.callingNext=false;
   if(pending.length||$('#overlay').open){advanceWhenQuiet=true;if(!$('#overlay').open)showNext();soul();}
   else advance();
  },650);
 }
 $('#overlay')?.addEventListener('cancel',()=>setTimeout(afterOverlay));
 function afterOverlay(){showNext();if(advanceWhenQuiet&&!pending.length&&!$('#overlay').open){advanceWhenQuiet=false;advance();}}
 /* The Book of Truth and the chart stay on the desk from one soul to the next, so the next soul does not
    start from an empty workspace. Only a soul not yet begun takes them, and only the workspace is carried:
    never the findings, the answer or the stamp. */
 function carryWorkspace(fromId,toId){
  const from=states.get(fromId),to=states.get(toId);
  if(!from||!to||from===to||!from.dataset||to.dataset||to.status!=='waiting')return;
  Object.assign(to,{dataset:from.dataset,model:from.model,filterField:from.filterField,filter:from.filter,selection:null,
   analysis:from.analysis?JSON.parse(JSON.stringify({...from.analysis,menu:null})):null});
 }
 function activate(id){carryWorkspace(active,id);active=id;S().arrivalAt=performance.now();}
 function advance(){
  advanceWhenQuiet=false;
  exitMagnifier();$('#overlay').close();$('#notebook').close();
  if(stageTwo){enterFinale();return;}
  const phase=screen==='marsh'?'pavilion':C().phase,nextCase=D.cases().find(c=>c.phase===phase&&!caseClosed(states.get(c.id)));
  if(nextCase){activate(nextCase.id);setScreen(screen==='marsh'?'marsh':'desk');}
  else{setScreen('map');toast('Your ferry rounds are complete. The Court of Judgement is open.');}
 }
 function ledgerHTML(pendingId){
  const upto=D.cases().filter(c=>c.index<=C().index);
  const rows=upto.map(c=>{const cs=states.get(c.id),pending=c.id===pendingId,judged=['approved','disputed'].includes(cs.status)&&!pending;
   const decision=cs.status==='pending'?'Pending':judged?(cs.status==='approved'?'Approved':'Denied'):pending?'Checking\u2026':'\u2014';
   const result=cs.status==='pending'?'<span class="case-status wrong">Criteria not met</span>':!judged?'\u2014':cs.correct?'<span class="case-status correct">\u2713 Right</span>':'<span class="case-status wrong">\u2715 Wrong</span>';
   return '<tr class="case-trow" data-nb="case" data-case="'+c.id+'" tabindex="0" role="button" aria-label="Open case '+(c.index+1)+', '+esc(c.name)+'"><td class="ct-num">'+String(c.index+1).padStart(2,'0')+'</td><td class="ct-name">'+esc(c.name)+'</td><td>'+esc(c.personId||'\u2014')+'</td><td>'+c.day+'</td><td>'+(c.phase==='pavilion'?'Pavilion':'Ferry')+'</td><td>'+decision+'</td><td>'+result+'</td></tr>';}).join('');
  return '<table class="case-table"><thead><tr><th>#</th><th>Soul</th><th>Person ID</th><th>Day</th><th>Stage</th><th>Decision</th><th>Result</th></tr></thead><tbody>'+rows+'</tbody></table>';
 }

 const fmtDate=d=>d?NetherDate.fmt(d):'\u2014';
 function ledgerDiscrepancies(c,cs){
  const fields=new Map(),mark=(check,field,reason)=>fields.set(check+'.'+field,reason||'Discrepancy detected.');
  // Read the saved evaluation, so a denied but matching paper is never marked.
  for(const finding of cs.findings||[]){
   if(finding.result!=='conflict')continue;
   for(const diff of finding.differences||[]){
    if(diff.field==='validity'){
     const permit=c.documents.permit,issued=String(permit.issued_on||'').slice(0,10),expires=String(permit.expires_on||'').slice(0,10),today=String(c.current_date||'').slice(0,10),date=/^\d{4}-\d{2}-\d{2}$/;
     const reason='Discrepancy detected: the current realm date must fall between issue and expiry.';
     if(!date.test(issued)||issued>=expires||today<issued)mark('permit','issued_on',reason);
     if(!date.test(expires)||issued>=expires||today>expires)mark('permit','expires_on',reason);
    }else{
     const written=/^\d{4}-\d{2}-\d{2}/.test(String(diff.written))?fmtDate(String(diff.written).slice(0,10)):String(diff.written??'\u2014');
     mark(finding.check,finding.check==='support'?'claim':diff.field,'Discrepancy detected. The Book says: '+written);
    }
   }
   // Missing records have no field comparison; flag their reference instead.
   if(!finding.differences?.length){
    const reference={identity:'identity_id',permit:'permit_id',support:'record',obol:'emblem'}[finding.check]||NetherPapers.reference(finding.check,c);
    if(reference)mark(finding.check,reference,'Discrepancy detected. '+finding.why);
   }
  }
  return fields;
 }
 function ledgerDetail(id){
  const c=D.cases().find(x=>x.id===id),cs=states.get(id);if(!c||!cs)return '';
  const judged=['approved','disputed'].includes(cs.status);
  const stamp=cs.status==='pending'?'<span class="cd-none">Pending</span>':judged?'<span class="cd-stamp '+(cs.status==='approved'?'is-approved':'is-denied')+'">'+(cs.status==='approved'?'Approved':'Denied')+'</span>':'<span class="cd-none">Not decided</span>';
  const result=cs.status==='pending'?'<span class="cd-result is-wrong">Criteria not met</span>':judged&&cs.correct!==undefined?'<span class="cd-result '+(cs.correct?'is-right':'is-wrong')+'">'+(cs.correct?'Right':'Wrong')+'</span>':'<span class="cd-none">\u2014</span>';
  const discrepancies=ledgerDiscrepancies(c,cs);
  const row=(check,field,k,v)=>{const reason=discrepancies.get(check+'.'+field);return '<div data-ledger-field="'+check+'.'+field+'"'+(reason?' class="is-discrepant" title="'+esc(reason)+'"':'')+'><dt>'+k+(reason?' <span class="cd-conflict-mark" aria-label="Discrepancy detected">!</span>':'')+'</dt><dd>'+esc(String(v==null||v===''?'\u2014':v))+'</dd></div>';};
  const doc=(title,rows,extra)=>'<article class="cd-doc"><h4>'+title+'</h4>'+(extra||'')+'<dl>'+rows.join('')+'</dl></article>';
  return '<div class="cd"><header class="cd-head"><button class="cd-back nui-btn nui-btn--secondary nui-btn--sm" data-nb="back" aria-label="Back to the case ledger"><svg viewBox="0 0 10 14" aria-hidden="true"><path d="M7.5 1.5L2 7l5.5 5.5"/></svg><span>Case ledger</span></button><h3>Case '+String(c.index+1).padStart(2,'0')+' \u00b7 '+esc(c.name)+'</h3></header>'
   +'<div class="cd-body"><aside class="cd-side"><div class="cd-portrait">'+portrait(c)+'</div><p class="cd-meta">'+esc(c.occupation||'')+' \u00b7 Day '+c.day+' \u00b7 '+(c.phase==='pavilion'?'Pavilion':'Ferry')+'</p>'
   +'<div class="cd-trays"><section class="cd-tray"><small>Decision</small>'+stamp+'</section><section class="cd-tray"><small>Result</small>'+result+'</section></div></aside>'
   +'<div class="cd-docs">'
   +doc(NetherPapers.label('identity',c),[row('identity','identity_id',bookLabel('nether_person.identity_id','Identity ID'),c.paper.identity_id),row('identity','name',bookLabel('nether_person.name','Name'),c.paper.name),row('identity','birthdate',bookLabel('nether_person.birthdate','Born'),fmtDate(c.paper.birthdate)),row('identity','birthplace',bookLabel('nether_person.birthplace','Birthplace'),c.paper.birthplace),row('identity','issue_place',bookLabel('nether_person.issue_place','Issued at'),c.paper.issue_place)])
   +doc(NetherPapers.label('permit',c),[row('permit','permit_id',bookLabel('nether_passage_permit.permit_id','Permit'),c.permit.permit_id),row('permit','seal',bookLabel('nether_passage_permit.seal','Seal'),c.permit.seal),row('permit','issued_on',bookLabel('nether_passage_permit.issued_on','Issued'),fmtDate(c.permit.issued_date)),row('permit','expires_on',bookLabel('nether_passage_permit.expires_on','Expires'),fmtDate(c.permit.expires_on))])
   +(c.coin?doc(NetherPapers.label('obol',c),[row('obol','emblem',bookLabel('nether_obol_standard.emblem','Emblem'),c.coin.symbol),row('obol','mint_mark',bookLabel('nether_obol_standard.mint_mark','Mint mark'),c.coin.mark),row('obol','rim',bookLabel('nether_obol_standard.rim','Rim'),c.coin.rim),row('obol','metal',bookLabel('nether_obol_standard.metal','Metal'),c.coin.metal)],'<div class="cd-obol">'+coinSVG(c.coin)+'</div>'):'')
   +NetherPapers.ledger(c,row,doc,fmtDate,cat=>D.fieldLabel(cat))+(c.support?doc('Supporting claim',[row('support','claim','Claim',c.support.claim),row('support','record','Record',c.support.id)]):'')
   +(c.phase==='pavilion'?doc('Judgment checklist',PV.questionsFor(c).map((q,i)=>row('checklist','answer'+i,q.prompt,cs.checklist?.answers[i]||'\u2014'))):'')
   +'</div></div></div>';
 }
 function queue(pendingId){nbTab='ledger';nbPending=pendingId;nbCase=null;renderNotebook();const el=$('#notebook');if(!el.open)el.showModal();}
 const LAYOUTS={
  nether_identity:{nether_person:[1,1],nether_relationship:[2,1],nether_passage_permit:[2,2]},
  // The transaction and the employment each join two models, so they sit between them.
  nether_property:{nether_person:[1,1],nether_ownership_transaction:[2,1],nether_asset:[3,1]},
  nether_work:{nether_person:[1,1],nether_employment:[2,1],nether_business:[3,1]},
  // Each conduct Book is a short line: a reference or parent, the soul's record, the detail.
  nether_healing:{nether_person:[1,1],nether_patient_case:[2,1],nether_ailment:[3,1]},
  nether_arms:{nether_person:[1,1],nether_service:[2,1],nether_casualty_record:[2,2],nether_campaign:[3,1]},
  nether_harvest:{nether_person:[1,1],nether_holding:[2,1],nether_estate:[3,1],nether_harvest_record:[3,2]},
  nether_rites:{nether_person:[1,1],nether_offering:[2,1],nether_temple:[3,1],nether_oath:[2,2]},
  // The four-hop chain a card is read along, left to right; the library it
  // shares with a shelved copy sits below, off the main line.
  nether_borrowings:{nether_person:[1,1],nether_library_card:[2,1],nether_borrowing_record:[3,1],
   nether_book_copy:[4,1],nether_book:[5,1],nether_library:[3,2]},
 };
 // The larger Books are drawn smaller so the models and their lines do not crowd.
 const DIAGRAM_ZOOM={nether_healing:1,nether_arms:.9,nether_harvest:.9,nether_rites:.9,nether_borrowings:.75};
 function modelPosition(id,index){const positions=LAYOUTS[preview]||{};return positions[id]||[index%3+1,Math.floor(index/3)+1];}
 let previewRows=[],previewKey=null,previewStatus='idle';
 function wantPreviewRows(){
  const key=[preview,previewModel,previewFilter].join('\u0000');
  if(previewKey===key)return;
  previewKey=key;previewStatus='asking';previewRows=[];
  REC.note.search(preview);
  D.rows(preview,previewModel,previewFilter?{field:D.primary(previewModel),value:previewFilter}:{})
   .then(answer=>{
    if(previewKey!==key)return;
    previewRows=answer.status==='rows'?answer.rows:[];previewStatus=answer.status;
    if($('#data-overlay').open)explorer();
   });
 }
 /* Book of Truth explorer. What the player arranged (node positions, folds,
    open sections, the metrics they drafted) outlives each redraw. */
 const nodePos={},nodeFolded=new Set(),listOpen={metrics:true,models:true,relationships:true},modelOpen=new Set(),searchOpen={},searchQ={},bookMetrics={},bookFields={};
 let selectedEdge=null,metricForm=false,fieldForm=false,lastView=null;
 const TYPE_NAME={text:'Text',number:'Number',date:'Date',datetime:'Date time',truefalse:'True / False'};
 const IC={
  chev:'<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5L6.8 5L3 8.5"/></svg>',
  cube:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5L13.5 4.5V11.5L8 14.5L2.5 11.5V4.5ZM2.5 4.5L8 7.5L13.5 4.5M8 7.5V14.5"/></svg>',
  ext:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2.5H13.5V7M13.5 2.5L7.5 8.5M12 9.5V13H3V4H6.5"/></svg>',
  search:'<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
  plus:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3V13M3 8H13"/></svg>'};
 const snake=text=>String(text).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'untitled';
 function nodeKey(id){return preview+'/'+id;}
 function fieldRow(id,f,keys){return '<span data-schema-field="'+id+'.'+f.id+'" class="schema-field '+(keys.has(id+'.'+f.id)?'relationship-key':'')+'"><i>'+esc(types[f.type]||'Aa')+'</i><span>'+esc(f.label)+'</span>'+(f.key?'<em class="key-note">'+f.key+'</em>':'')+'</span>';}
 function nodeHTML(id,i,keys){
  const k=nodeKey(id),pos=nodePos[k]||{x:0,y:0},folded=nodeFolded.has(k),sch=SCH(id),at=modelPosition(id,i);
  return '<div class="identity-model-node'+(folded?' is-folded':'')+'" data-node="'+id+'" style="grid-column:'+at[0]+';grid-row:'+at[1]+';transform:translate('+pos.x+'px,'+pos.y+'px)">'
   +'<header class="node-head" role="button" tabindex="0" aria-expanded="'+!folded+'" aria-label="'+esc(sch.name)+', drag to move, click to fold"><i class="node-chev">'+IC.chev+'</i><strong>'+esc(sch.name)+'</strong>'
   +'<button type="button" class="node-link" data-action="previewmodel" data-model="'+id+'" aria-label="Open '+esc(sch.name)+' raw data" title="Open raw data">'+IC.ext+'</button></header>'
   +'<div class="node-fields">'+sch.fields.map(f=>fieldRow(id,f,keys)).join('')+'</div></div>';
 }
 function typeIcon(type){return '<i class="type-ico" tabindex="0" data-tip="'+esc(TYPE_NAME[type]||'Text')+'" aria-label="'+esc(TYPE_NAME[type]||'Text')+'">'+esc(types[type]||'Aa')+'</i>';}
 function keyNote(f){return f.key?'<em class="key-note">'+f.key+'</em>':'';}
 function listSection(key,title,count,tools,body){
  const open=listOpen[key],q=searchOpen[key]?'<input class="bk-search" data-bk-search="'+key+'" aria-label="Search '+title.toLowerCase()+'" placeholder="Search…" value="'+esc(searchQ[key]||'')+'">':'';
  return '<section class="bk-sec'+(open?'':' is-closed')+'" data-sec="'+key+'"><header class="bk-sec-head"><button type="button" class="bk-sec-toggle" data-bk="sec" data-sec="'+key+'" aria-expanded="'+open+'"><i>'+IC.chev+'</i><h4>'+title+' <span>('+count+')</span></h4></button><div class="bk-sec-tools">'+q
   +'<button type="button" class="bk-icon" data-bk="search" data-sec="'+key+'" aria-label="Search '+title.toLowerCase()+'" aria-pressed="'+!!searchOpen[key]+'">'+IC.search+'</button>'+tools+'</div></header>'+(open?'<div class="bk-sec-body">'+body+'</div>':'')+'</section>';
 }
 const hide=(key,text)=>{const q=(searchQ[key]||'').trim().toLowerCase();return q&&!text.toLowerCase().includes(q)?' hidden':'';};
 function metricFormHTML(dataset){
  const opts=dataset.models.map(id=>'<optgroup label="'+esc(SCH(id).name)+'">'+SCH(id).fields.map(f=>'<option value="'+id+'.'+f.id+'">'+esc(f.label)+'</option>').join('')+'</optgroup>').join('');
  const first=dataset.models[0],ff=SCH(first).fields[0];
  return '<form class="bk-form" data-bk-form="metric" onsubmit="return false"><label>Label<input name="label" placeholder="Total holdings" autocomplete="off"></label><label>Aggregate<select name="agg">'+['count','count_distinct','sum','avg','min','max'].map(a=>'<option>'+a+'</option>').join('')+'</select></label><label>Field<select name="field">'+opts+'</select></label><label class="wide">AQL formula, edit it to combine fields from other models<input name="formula" value="'+first+' | count('+first+'.'+ff.id+')" autocomplete="off"></label><div class="bk-form-actions"><button type="button" class="bk-btn" data-bk="metric-cancel">Cancel</button><button type="button" class="bk-btn primary" data-bk="metric-save">Save metric</button></div></form>';
 }
 function fieldFormHTML(dataset){
  return '<form class="bk-form" data-bk-form="field" onsubmit="return false"><label>Model<select name="model">'+dataset.models.map(id=>'<option value="'+id+'">'+esc(SCH(id).name)+'</option>').join('')+'</select></label><label>Kind<select name="kind"><option value="dimension">Dimension</option><option value="measure">Measure</option></select></label><label>Label<input name="label" placeholder="Name" autocomplete="off"></label><label>Type<select name="type">'+Object.entries(TYPE_NAME).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><label class="wide">AQL formula (measures)<input name="formula" placeholder="count(model.field)" autocomplete="off"></label><div class="bk-form-actions"><button type="button" class="bk-btn" data-bk="field-cancel">Cancel</button><button type="button" class="bk-btn primary" data-bk="field-save">Add</button></div></form>';
 }
 function listContent(dataset,rels){
  const models=dataset.models;
  const metrics=[...(dataset.metrics||[]).map(m=>({name:m.name||m.id||'',label:m.label||'',description:m.description||''})),...(bookMetrics[preview]||[])];
  const metricRows=metrics.map(m=>{const note=NetherNotes.metric(m.name);m={...m,description:m.description||note.description,definition:m.formula||m.definition||note.definition};return '<tr class="bk-tip-row" data-tip-title="'+esc(m.label||m.name)+'" data-tip-type="Number" data-tip-icon="Σ" data-tip-def="'+esc(m.definition)+'"'+hide('metrics',m.name+' '+m.label+' '+m.description)+'><td><span class="bk-sigma">Σ</span><span class="bk-link">'+esc(m.name)+'</span></td><td>'+esc(m.label)+'</td><td class="bk-muted">'+esc(m.description)+'</td><td><code>'+esc(m.definition)+'</code></td></tr>';}).join('')||'<tr><td colspan="4" class="bk-empty">No metrics yet.</td></tr>';
  const metricsBody=(metricForm?metricFormHTML(dataset):'')+'<table class="bk-table bk-metrics"><thead><tr><th>Name</th><th>Label</th><th>Description</th><th>Formula</th></tr></thead><tbody>'+metricRows+'</tbody></table>';
  const modelRows=models.map(id=>{
   const sch=SCH(id),open=modelOpen.has(id),extra=bookFields[id]||[];
   const head='<tr class="bk-model-row'+(open?' is-open':'')+'" data-bk="model" data-model="'+id+'" tabindex="0" aria-expanded="'+open+'"'+hide('models',id+' '+sch.name+' '+sch.fields.map(f=>f.label).join(' '))+'><td><span class="bk-chev">'+IC.chev+'</span><span class="bk-cube">'+IC.cube+'</span><strong>'+esc(id)+'</strong></td><td>'+esc(sch.name)+'</td><td class="bk-muted bk-desc">'+esc(NetherNotes.model(id))+'</td><td></td></tr>';
   if(!open)return head;
   const fields=sch.fields.map(f=>'<tr class="bk-field-row bk-tip-row" data-tip-title="'+esc(f.label)+'" data-tip-type="'+esc(TYPE_NAME[f.type]||'Text')+'" data-tip-icon="'+esc(types[f.type]||'Aa')+'" data-tip-def="'+esc('{{ #SOURCE.'+f.id+' }}')+'"><td>'+typeIcon(f.type)+'<strong>'+esc(f.id)+'</strong>'+keyNote(f)+'</td><td>'+esc(f.label)+'</td><td class="bk-muted bk-desc">'+esc(NetherNotes.field(id,f.id))+'</td><td><code>'+esc(id+'.'+f.id)+'</code></td></tr>').join('')
    +extra.map(f=>'<tr class="bk-field-row bk-tip-row" data-tip-title="'+esc(f.label)+'" data-tip-type="'+esc(TYPE_NAME[f.kind==='measure'?'number':f.type]||'Text')+'" data-tip-icon="'+esc(types[f.kind==='measure'?'number':f.type]||'Aa')+'" data-tip-def="'+esc(f.formula||'')+'"><td>'+typeIcon(f.kind==='measure'?'number':f.type)+'<strong>'+esc(snake(f.label))+'</strong><em class="key-note custom">'+(f.kind==='measure'?'Measure':'Dimension')+'</em></td><td>'+esc(f.label)+'</td><td class="bk-muted bk-desc">Added by you</td><td><code>'+esc(f.formula||id+'.'+snake(f.label))+'</code></td></tr>').join('');
   return head+fields;
  }).join('');
  const modelsBody=(fieldForm?fieldFormHTML(dataset):'')+'<table class="bk-table bk-models"><thead><tr><th>Name</th><th>Label</th><th>Description</th><th>Formula</th></tr></thead><tbody>'+modelRows+'</tbody></table>';
  const ref=r=>{const [m,f]=r.split('.'),fld=SCH(m).fields.find(x=>x.id===f);return '<span class="bk-ref"><i class="bk-hash">#</i>'+esc(SCH(m).name)+' <b>'+esc(fld?fld.label:f)+'</b></span>';};
  const relRows=rels.map(r=>'<tr'+hide('relationships',r.from+' '+r.to+' '+ref(r.from).replace(/<[^>]+>/g,'')+' '+ref(r.to).replace(/<[^>]+>/g,''))+'><td>n - 1</td><td>'+ref(r.from)+'</td><td>'+ref(r.to)+'</td><td class="bk-switch-cell"><span class="bk-switch" role="switch" aria-checked="true" aria-disabled="true" title="Relationships are read-only"><i></i></span></td></tr>').join('')||'<tr><td colspan="4" class="bk-empty">No relationships.</td></tr>';
  const relBody='<table class="bk-table"><thead><tr><th>Type</th><th>From</th><th>To</th><th></th></tr></thead><tbody>'+relRows+'</tbody></table>';
  return '<div class="book-list">'
   +listSection('metrics','Metrics',metrics.length,'<button type="button" class="bk-btn" data-bk="metric-add">'+IC.plus+' Add metric</button>',metricsBody)
   +listSection('models','Models',models.length,'<button type="button" class="bk-btn" data-bk="field-add" title="Add a dimension or measure to a model">'+IC.plus+' Add</button>',modelsBody)
   +listSection('relationships','Relationships',rels.length,'',relBody)+'</div>';
 }
 function explorer(){const dataset=book(preview),models=dataset.models;const rels=D.relationships(preview),keys=new Set(rels.flatMap(r=>[r.from,r.to]));
  if(view==='raw')wantPreviewRows();
  const scroller=$('#data-explorer .model-view-body'),keepScroll=scroller&&lastView===view?scroller.scrollTop:0;lastView=view;
  let content;
  if(view==='diagram')content='<div class="identity-diagram identity-diagram--'+preview.replace('nether_','')+'" style="--model-count:'+models.length+'"><svg class="schema-edges" aria-label="Primary and foreign key relationships"></svg>'+models.map((id,i)=>nodeHTML(id,i,keys)).join('')+'</div>';
  if(view==='list')content=listContent(dataset,rels);
  if(view==='raw')content='<div class="model-table-controls"><select id="preview-model" aria-label="Raw data model">'+models.map(id=>'<option value="'+id+'" '+(id===previewModel?'selected':'')+'>'+SCH(id).name+'</option>').join('')+'</select><span>'+previewRows.length+' records</span>'+(previewFilter?'<button class="text-button" data-action="previewall">All records</button>':'')+'</div>'+recordTable(previewModel,previewRows.slice(page*15,(page+1)*15))+'<div class="model-table-pagination"><button data-action="page" data-step="-1" '+(page===0?'disabled':'')+'>‹</button><span>Page '+(page+1)+'</span><button data-action="page" data-step="1" '+((page+1)*15>=previewRows.length?'disabled':'')+'>›</button></div>';
  $('#data-explorer').innerHTML=NetherUI.modal.html({title:'Book of Truth',titleId:'data-title',closeAttrs:'data-action="closebook" aria-label="Close the Book of Truth"',bodyClass:'nui-panel__body--flush',body:'<div class="dataset-browser"><nav class="dataset-browser-nav" aria-label="Datasets">'+D.books().map(d=>'<button data-action="preview" data-dataset="'+d.id+'" aria-pressed="'+(preview===d.id)+'"><span>'+d.symbol+'</span><strong>'+d.title+'</strong></button>').join('')+'</nav><section class="dataset-browser-main"><div class="dataset-browser-heading"><h3>'+dataset.title+'</h3><span>'+models.length+' models · '+rels.length+' relationships</span></div><div class="model-view-tabs">'+['diagram','list','raw'].map(v=>'<button data-action="view" data-view="'+v+'" aria-pressed="'+(v===view)+'">'+({diagram:'Diagram',list:'List',raw:'Raw data'}[v])+'</button>').join('')+'</div><div class="model-view-body">'+content+'</div></section></div>',footer:'<button class="nui-btn nui-btn--primary" data-action="usedataset">Use book</button>'});
  const body=$('#data-explorer .model-view-body');if(body&&keepScroll)body.scrollTop=keepScroll;
  requestAnimationFrame(drawEdges);
 }
 function drawEdges(){
  const canvas=$('.identity-diagram');if(!canvas||!$('#data-overlay').open)return;
  const svg=canvas.querySelector('svg'),r=canvas.getBoundingClientRect();svg.setAttribute('viewBox','0 0 '+r.width+' '+r.height);
  // A folded model keeps its lines: they meet its header instead of a field.
  const anchor=ref=>{const el=canvas.querySelector('[data-schema-field="'+ref+'"]');if(!el)return null;const node=el.closest('.identity-model-node');return node.classList.contains('is-folded')?node.querySelector('.node-head'):el;};
  canvas.querySelectorAll('.is-linked').forEach(el=>el.classList.remove('is-linked'));
  svg.innerHTML=D.relationships(preview).map((rel,i)=>{
   const f=anchor(rel.from),p=anchor(rel.to);if(!f||!p)return '';
   const key=rel.from+'>'+rel.to,sel=key===selectedEdge;if(sel){f.classList.add('is-linked');p.classList.add('is-linked');}
   const fr=f.getBoundingClientRect(),pr=p.getBoundingClientRect(),same=Math.abs(pr.left-fr.left)<2,right=pr.left<fr.left,ps=same?-1:right?1:-1,fs=same?-1:-ps;
   const x=(ps===1?pr.right:pr.left)-r.left,tx=(fs===1?fr.right:fr.left)-r.left,y=pr.top-r.top+pr.height/2,ty=fr.top-r.top+fr.height/2,mid=same?x-24-i%3*6:(x+tx)/2+(i%3-1)*7;
   const d='M'+x+' '+y+'H'+mid+'V'+ty+'H'+tx;
   return '<g class="rel'+(sel?' is-selected':'')+'" data-edge="'+esc(key)+'" data-from="'+rel.from+'" data-to="'+rel.to+'"><title>'+rel.to+' → '+rel.from+' · one to many</title><path class="rel-hit" d="'+d+'"/><path class="relationship-line" d="'+d+'"/><path d="M'+(x+ps*5)+' '+(y-5)+'V'+(y+5)+'"/>'+(rel.nullable?'<circle cx="'+(x+ps*15)+'" cy="'+y+'" r="3.5"/>':'<path d="M'+(x+ps*10)+' '+(y-5)+'V'+(y+5)+'"/>')+'<circle cx="'+(tx+fs*19)+'" cy="'+ty+'" r="3.5"/><path d="M'+tx+' '+(ty-6)+'L'+(tx+fs*10)+' '+ty+'L'+tx+' '+(ty+6)+'M'+(tx+fs*10)+' '+ty+'H'+tx+'"/>'
    +'<text class="rel-card" x="'+(x+ps*22)+'" y="'+(y-9)+'" text-anchor="middle">1</text><text class="rel-card" x="'+(tx+fs*30)+'" y="'+(ty-9)+'" text-anchor="middle">∞</text></g>';
  }).join('');
 }
 /* Models: drag by the header, click the header to fold. */
 let nd=null;
 document.addEventListener('pointerdown',e=>{
  const head=e.target.closest('#data-explorer .node-head');if(!head||e.target.closest('.node-link')||e.button>0)return;
  const node=head.parentElement,k=nodeKey(node.dataset.node),pos=nodePos[k]||{x:0,y:0};
  nd={node,head,k,sx:e.clientX,sy:e.clientY,ox:pos.x,oy:pos.y,moved:false,pid:e.pointerId};
  try{head.setPointerCapture(e.pointerId);}catch{}
 });
 document.addEventListener('pointermove',e=>{
  if(!nd||e.pointerId!==nd.pid)return;
  const dx=e.clientX-nd.sx,dy=e.clientY-nd.sy;
  if(!nd.moved&&Math.hypot(dx,dy)<5)return;
  nd.moved=true;nd.node.classList.add('is-dragging');
  const x=Math.max(-nd.node.offsetLeft,nd.ox+dx),y=Math.max(-nd.node.offsetTop,nd.oy+dy);
  nodePos[nd.k]={x,y};nd.node.style.transform='translate('+x+'px,'+y+'px)';drawEdges();
 });
 function foldNode(node){const k=nodeKey(node.dataset.node),folded=!nodeFolded.has(k);folded?nodeFolded.add(k):nodeFolded.delete(k);node.classList.toggle('is-folded',folded);node.querySelector('.node-head').setAttribute('aria-expanded',String(!folded));drawEdges();}
 const endNodeDrag=e=>{if(!nd||e.pointerId!==nd.pid)return;const {node,moved}=nd;node.classList.remove('is-dragging');nd=null;if(!moved&&e.type==='pointerup')foldNode(node);};
 document.addEventListener('pointerup',endNodeDrag);document.addEventListener('pointercancel',endNodeDrag);
 document.addEventListener('keydown',e=>{const head=e.target.closest&&e.target.closest('#data-explorer .node-head');if(head&&e.target===head&&(e.key==='Enter'||e.key===' ')){e.preventDefault();foldNode(head.parentElement);}
  const row=e.target.closest&&e.target.closest('#data-explorer .bk-model-row');if(row&&e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();row.click();}});
 /* Hover card for a field or metric: its type and its definition. */
 let tipEl=null,tipRow=null;
 function hideTip(){if(tipEl)tipEl.hidden=true;tipRow=null;}
 function showTip(row){
  const host=$('#data-overlay');if(!host||!row.dataset.tipTitle)return;
  if(!tipEl||!tipEl.isConnected){tipEl=document.createElement('div');tipEl.className='bk-hovercard';tipEl.setAttribute('role','tooltip');host.appendChild(tipEl);}
  tipRow=row;const def=row.dataset.tipDef;
  tipEl.innerHTML='<h5>'+esc(row.dataset.tipTitle)+'</h5><div class="bk-hc-row"><i>'+esc(row.dataset.tipIcon||'Aa')+'</i><span>'+esc(row.dataset.tipType)+'</span></div>'+(def?'<div class="bk-hc-row"><i>ƒx</i><code>'+esc(def)+'</code></div>':'');
  tipEl.hidden=false;
  const r=row.getBoundingClientRect(),w=tipEl.offsetWidth,h=tipEl.offsetHeight;
  const nameCell=row.querySelector('td'),nr=nameCell.getBoundingClientRect();
  let x=nr.left+Math.min(nr.width,230)+10,y=r.top+r.height/2-h/2;
  if(x+w>innerWidth-12)x=Math.max(12,nr.left+24);
  y=Math.max(12,Math.min(y,innerHeight-h-12));if(x===nr.left+24)y=r.bottom+6<innerHeight-h?r.bottom+6:r.top-h-6;
  tipEl.style.left=x+'px';tipEl.style.top=y+'px';
 }
 document.addEventListener('mouseover',e=>{const row=e.target.closest&&e.target.closest('#data-explorer .bk-tip-row');if(row){if(row!==tipRow)showTip(row);}else if(tipRow)hideTip();});
 document.addEventListener('scroll',hideTip,true);
 /* Lines: click to pin the relationship, click anywhere else on the diagram to let go. */
 document.addEventListener('click',e=>{
  const diagram=e.target.closest&&e.target.closest('#data-explorer .identity-diagram');
  if(diagram){const g=e.target.closest('.rel');if(g){selectedEdge=selectedEdge===g.dataset.edge?null:g.dataset.edge;drawEdges();return;}
   if(selectedEdge&&!e.target.closest('.node-link')){selectedEdge=null;drawEdges();}return;}
  const bk=e.target.closest&&e.target.closest('#data-explorer [data-bk]');if(!bk)return;
  const act=bk.dataset.bk;
  if(act==='sec'){listOpen[bk.dataset.sec]=!listOpen[bk.dataset.sec];}
  else if(act==='search'){const key=bk.dataset.sec;searchOpen[key]=!searchOpen[key];if(!searchOpen[key])searchQ[key]='';explorer();const input=$('#data-explorer [data-bk-search="'+key+'"]');if(input)input.focus();return;}
  else if(act==='model'){const id=bk.dataset.model;modelOpen.has(id)?modelOpen.delete(id):modelOpen.add(id);}
  else if(act==='metric-add'){metricForm=true;listOpen.metrics=true;}
  else if(act==='metric-cancel'){metricForm=false;}
  else if(act==='metric-save'){const form=bk.closest('form'),label=form.elements.label.value.trim(),formula=form.elements.formula.value.trim();
   if(!label){form.elements.label.focus();return;}
   (bookMetrics[preview]=bookMetrics[preview]||[]).push({name:snake(label),label,description:'Added by you',formula});metricForm=false;}
  else if(act==='field-add'){fieldForm=true;listOpen.models=true;}
  else if(act==='field-cancel'){fieldForm=false;}
  else if(act==='field-save'){const form=bk.closest('form'),label=form.elements.label.value.trim();
   if(!label){form.elements.label.focus();return;}
   const model=form.elements.model.value;(bookFields[model]=bookFields[model]||[]).push({kind:form.elements.kind.value,label,type:form.elements.type.value,formula:form.elements.formula.value.trim()});modelOpen.add(model);fieldForm=false;}
  else return;
  explorer();
 });
 document.addEventListener('input',e=>{
  const search=e.target.closest&&e.target.closest('[data-bk-search]');
  if(search){const key=search.dataset.bkSearch;searchQ[key]=search.value;const q=search.value.trim().toLowerCase();
   // The rows are filtered where they stand; redrawing would take the cursor away.
   search.closest('.bk-sec').querySelectorAll('tbody>tr[data-q],.bk-table>tbody>tr').forEach(tr=>{if(tr.classList.contains('bk-fields-row'))return;tr.hidden=!!q&&!tr.textContent.toLowerCase().includes(q);});}
 });
 document.addEventListener('change',e=>{
  const form=e.target.closest&&e.target.closest('[data-bk-form="metric"]');
  if(form&&(e.target.name==='agg'||e.target.name==='field')){const model=form.elements.field.value.split('.')[0];form.elements.formula.value=model+' | '+form.elements.agg.value+'('+form.elements.field.value+')';}
 });
 function openDataset(){preview=S().dataset||D.books()[0].id;previewModel=book(preview).models[0];previewFilter=null;view='diagram';page=0;explorer();$('#data-overlay').showModal();}
 function reference(ref,value){if(value==='—'||!value)return;REC.note.thread();const [model,field]=ref.split('.');if($('#data-overlay').open){previewModel=model;previewFilter=value;page=0;view='raw';explorer();return;}const dataset=D.books().find(d=>d.models.includes(model)&&d.id===S().dataset)||D.books().find(d=>d.models.includes(model));if(!dataset)return;S().dataset=dataset.id;S().model=model;S().filterField=field;S().filter=value;S().selection=null;$('#data-overlay').close();workbench();}
 // --- Drag and drop: pick a document up off the desk or book holder, reposition one already open, or drag it back down to close it. ---
 const docSize=doc=>NetherPapers.size(doc,C());
 let drag=null;
 function openAt(doc,x,y){dispatchEvent(new CustomEvent('nether:paper-open',{detail:{doc,type:NetherPapers.typeOf(doc,C()),kind:NetherPapers.kindOf(doc,C())}}));const s=S(),[w,h]=docSize(doc),stage=$('.zoom-stage'),bound=stage?stage.getBoundingClientRect():{width:360,height:420};NetherSound.cue('paper');removeLine();s.open[doc]={x:Math.max(0,Math.min(x,Math.max(0,bound.width-w))),y:Math.max(0,Math.min(y,Math.max(0,bound.height-h))),z:++zTop};}
 function closeDoc(doc){removeLine();delete S().open[doc];NetherSound.cue('paper');}
 function makeGhost(source){
  const ghost=source.cloneNode(true);
  ghost.className=source.className+' drag-ghost';
  ghost.removeAttribute('aria-label');ghost.removeAttribute('title');ghost.removeAttribute('data-doc');
  ghost.style.cssText='position:fixed;left:0;top:0;margin:0;pointer-events:none;z-index:90;transform:translate(-50%,-50%) rotate(-4deg) scale(1.1)';
  document.body.appendChild(ghost);
  return ghost;
 }
 function flipCoin(){S().coinFlipped=!S().coinFlipped;soul();document.querySelectorAll('.desk-coin,.obol-loose').forEach(el=>el.classList.add('coin-flip-anim'));}
 document.addEventListener('pointerdown',e=>{
  if(!workstation(screen))return;
  const source=e.target.closest('.desk-item,.desk-coin,.desk-book'),paper=e.target.closest('.open-doc');
  if(source&&!e.target.closest('[data-action="compare"]')){drag={mode:'new',doc:source.dataset.doc,sourceEl:source,startX:e.clientX,startY:e.clientY,moved:false};return;}
  if(paper&&!e.target.closest('[data-action="compare"]')){
   const doc=paper.dataset.doc,rect=paper.getBoundingClientRect(),o=S().open[doc];if(!o)return;
   o.z=++zTop;paper.style.zIndex=o.z;
   removeLine();drag={mode:'move',doc,el:paper,offX:e.clientX-rect.left,offY:e.clientY-rect.top,moved:false};
  }
 });
 document.addEventListener('pointermove',e=>{
  if(!drag)return;
  if(drag.mode==='new'){
   if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6)return;
   drag.moved=true;
   if(!drag.ghost)drag.ghost=makeGhost(drag.sourceEl);
   drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px';
   return;
  }
  drag.moved=true;
  const stage=$('.zoom-stage');if(!stage)return;const rect=stage.getBoundingClientRect();
  const inside=e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom;
  if(inside){
   if(drag.shrunk){drag.el.style.position='absolute';drag.el.style.transform='';drag.el.style.zIndex=S().open[drag.doc]?.z??'';drag.el.classList.remove('drag-shrink');drag.shrunk=false;}
   const [w,h]=docSize(drag.doc);
   const x=Math.max(0,Math.min(e.clientX-rect.left-drag.offX,Math.max(0,rect.width-w))),y=Math.max(0,Math.min(e.clientY-rect.top-drag.offY,Math.max(0,rect.height-h)));
   drag.el.style.left=x+'px';drag.el.style.top=y+'px';
   const o=S().open[drag.doc];if(o){o.x=x;o.y=y;}
  } else {
   if(!drag.shrunk){drag.el.style.position='fixed';drag.el.style.zIndex='96';drag.el.classList.add('drag-shrink');drag.shrunk=true;}
   drag.el.style.left=e.clientX+'px';drag.el.style.top=e.clientY+'px';
  }
 });
 document.addEventListener('pointerup',e=>{
  if(!drag)return;
  if(drag.mode==='new'){
   drag.ghost?.remove();
   const stage=$('.zoom-stage');
   if(stage){
    const rect=stage.getBoundingClientRect();
    if(drag.moved&&e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom){openAt(drag.doc,e.clientX-rect.left-40,e.clientY-rect.top-16);soul();}
    else if(!drag.moved){const p=cascadePos(Object.keys(S().open).length);openAt(drag.doc,p.x,p.y);soul();}   // the coin turns only once it is on the table
   }
  } else if(drag.mode==='move'){
   if(drag.moved){
    if(drag.shrunk){const doc=drag.doc;closeDoc(doc);soul();checkDeparture();}
   } else if(drag.doc==='obol'){flipCoin();}
  }
  drag=null;
 });
 /* What you hear: the lyre, the river and its weather, both, or nothing. */
 let soundscape='off';
 function setSoundscape(next){
  soundscape=next;rooms.mute(next==='off');
  if(!NetherSound.set(next))toast('Sound is unavailable in this browser.');
 }
 function quietMusic(){setSoundscape(soundscape==='off'?'music':'off');}
 /* Sound is on from the start, so the lyre and the river are there as the boat arrives. A browser may hold the audio
    back until the first click or key press; soundscape.js resumes it then. */
 setSoundscape('both');
 document.querySelectorAll('[data-sound]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sound==='both')));
 async function unlockDeveloperSettings(){
  const input=$('#developer-password'),feedback=$('#developer-feedback'),options=$('#developer-options');
  if(!input||!feedback||!options)return;
  try{
   const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.value),'PBKDF2',false,['deriveBits']);
   const salt=Uint8Array.from(atob(DEV_PASSWORD_SALT),char=>char.charCodeAt(0));
   const result=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'},raw,256);
   const encoded=btoa(String.fromCharCode(...new Uint8Array(result)));
   input.value='';
   if(encoded!==DEV_PASSWORD_HASH){feedback.textContent='Password not recognized.';return;}
   developerUnlocked=true;
   feedback.textContent='Unlocked until you reload this page.';
   options.innerHTML='<button id="dev-court-toggle" data-action="togglecourt" aria-pressed="'+NetherProgress.state.devCourt+'">Unlock Court of Judgement</button>'
    +'<button data-action="mode" data-mode="easy" aria-pressed="'+(D.mode()==='easy')+'">Easy · 20 cases</button>'
    +'<button data-action="mode" data-mode="hard" aria-pressed="'+(D.mode()==='hard')+'">Hard · 50 cases</button>'
    +'<button data-action="jumpmenu">Test scenes</button><button data-action="service">Record of service</button>';
   syncDifficulty();
  }catch(error){input.value='';feedback.textContent='Password check is unavailable in this browser context.';}
 }
 document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.id==='developer-password'){event.preventDefault();unlockDeveloperSettings();}});
 addEventListener('nether:compare',e=>NetherSound.cue({match:'match',mismatch:'mismatch'}[e.detail.result]||'tick'));
 document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action;if(!active&&!['skip','settings','dev-auth'].includes(action))return;const s=active?S():null;
  if(button.closest('#developer-options')&&!developerUnlocked)return;
  if(['togglecourt','mode','jumpmenu'].includes(action)&&!developerUnlocked){const feedback=$('#developer-feedback');if(feedback)feedback.textContent='Unlock the developer settings first.';return;}
  if(['map','desk','home','marsh','shop'].includes(action)){
   advanceWhenQuiet=false;$('#overlay').close();
   if(button.classList.contains('location-marker')&&['desk','marsh'].includes(action)&&NetherProgress.canVisit(action==='marsh'?'marsh':'ferry')){const phase=action==='marsh'?'pavilion':'ferry',next=D.cases().find(c=>c.phase===phase&&!caseClosed(states.get(c.id)));if(next)activate(next.id);}
   setScreen(action);return;
  }
  switch(action){
   case 'back':setScreen('map');break;
   case 'togglecourt':NetherProgress.setDevCourt(!NetherProgress.state.devCourt);if(!NetherProgress.canVisit('marsh')&&world.currentIsland==='marsh'){world.focusIsland('ferry');setScreen('map');}break;
   case 'skip':world.skip();break;
   case 'settings':{const panel=$('#realm-settings'),open=panel.hidden;
    panel.hidden=!open;button.setAttribute('aria-expanded',String(open));break;}
   case 'dev-auth':unlockDeveloperSettings();break;
   case 'sound':quietMusic();break;case 'queue':queue();break;
   case 'case':exitMagnifier();active=button.dataset.case;$('#overlay').close();$('#notebook').close();setScreen(screen==='marsh'?'marsh':'desk');break;
   case 'closeoverlay':$('#overlay').close();afterOverlay();break;
   case 'magnifier':setMagnifier(!magnifierMode);break;
   case 'stamptab':s.drawerOpen=!s.drawerOpen;if(s.drawerOpen){s.stampPrompt=false;exitMagnifier();soul();}else deskFooter();break;
   case 'compare':compareClick(button);break;
   case 'booktab':bookTab=button.dataset.tab;bookCountry=null;soul();break;
   case 'country':bookCountry=button.dataset.country;soul();break;
   case 'dataset':openDataset();break;case 'preview':preview=button.dataset.dataset;previewModel=book(preview).models[0];previewFilter=null;page=0;explorer();break;
   case 'view':view=button.dataset.view;page=0;explorer();break;case 'previewmodel':previewModel=button.dataset.model;previewFilter=null;page=0;view='raw';explorer();break;
   case 'previewall':previewFilter=null;page=0;explorer();break;
   case 'page':page+=Number(button.dataset.step);explorer();break;
   case 'closebook':$('#data-overlay').close();break;
   case 'usedataset':if(s.dataset!==preview){s.dataset=preview;s.model=book(preview).models[0];s.filterField=searchField(s.model);s.filter='';s.selection=null;}$('#data-overlay').close();workbench();break;
   case 'record':s.selection=button.dataset.record;workbench();break;
   case 'checklist':checklist.open();break;
   case 'clearsearch':s.filter='';s.selection=null;workbench();break;case 'records':if(!s.dataset)openDataset();break;
   case 'reference':reference(button.dataset.ref,button.dataset.value);break;
   case 'approve':case 'dispute':decide(action);break;
   case 'callnext':case 'next':callNextSoul();break;



   // Not 'record': a record is a row in a ledger, and that action is taken.
   case 'service':{const right=[...states.values()].filter(x=>x.correct).length;
    overlay('Record of service',REC.screen({examined:done(),right}));break;}
   case 'jumpmenu':demoMenu();break;
   case 'mode':setDifficulty(button.dataset.mode);break;
   case 'submitpetition':submitPetition();break;
   case 'finish':finish();break;
   case 'seals':overlay('The judges’ count',EC.sealScreen(tally()));break;

   case 'buy':{const bought=EC.buy(button.dataset.item);
    toast(bought.why);header();
    if(bought.ok)overlay($('#overlay-title').textContent,EC.shopScreen());break;}
   case 'jumpstatus':{
    const id=button.dataset.case,old=states.get(id),result=old?.status==='waiting'?'correct':old?.correct?'wrong':'waiting';
    const scroll=$('.jump-menu')?.scrollTop||0;
    setDevCase(id,result);if(id===active&&workstation(screen))render();demoMenu();$('.jump-menu').scrollTop=scroll;
    break;
   }
   case 'jump':demoJump(button.dataset.jump);break;

  }
 });
 document.addEventListener('click',e=>{
  const weather=e.target.closest('[data-weather]');
  if(weather){
   netherWeather.setMode(weather.dataset.weather);
   document.querySelectorAll('[data-weather]').forEach(b=>b.setAttribute('aria-pressed',String(b===weather)));
   toast('The sky turns.');return;
  }
  const sound=e.target.closest('[data-sound]');
  if(sound){
   setSoundscape(sound.dataset.sound);
   document.querySelectorAll('[data-sound]').forEach(b=>b.setAttribute('aria-pressed',String(b===sound)));
  }
 });
 document.addEventListener('change',e=>{if(!active)return;if(e.target.dataset?.petition){petitionAnswers[e.target.dataset.petition]=e.target.value;return;}const s=S();
  if(e.target.id==='record-model'){s.model=e.target.value;s.filterField=searchField(s.model);s.filter='';s.selection=null;workbench();}if(e.target.id==='record-field'){s.filterField=e.target.value;s.filter='';s.selection=null;workbench();}if(e.target.id==='preview-model'){previewModel=e.target.value;previewFilter=null;page=0;explorer();}});
 document.addEventListener('input',e=>{if(!active)return;
  if(e.target.dataset?.petition){petitionAnswers[e.target.dataset.petition]=e.target.value;return;}
  if(e.target.id==='record-search'){S().filter=e.target.value;S().selection=null;const pos=e.target.selectionStart;workbench();$('#record-search').focus();$('#record-search').setSelectionRange(pos,pos);}
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.matches('tr[data-action]')){e.target.click();return;}
  if((e.key==='Enter'||e.key===' ')&&e.target.closest('.desk-item,.desk-coin,.desk-book')&&!settled()){e.preventDefault();const doc=e.target.closest('[data-doc]').dataset.doc;const p=cascadePos(Object.keys(S().open).length);openAt(doc,p.x,p.y);soul();}
 });
 window.addEventListener('resize',drawEdges);
 
function puppySVG(){return NetherItemArt.puppy();}
 if(!$('#magnifier-svg')){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='magnifier-svg';svg.setAttribute('aria-hidden','true');document.body.appendChild(svg);}
 if(!$('#magnifier-scrim')){const scrim=document.createElement('div');scrim.id='magnifier-scrim';scrim.setAttribute('aria-hidden','true');document.body.appendChild(scrim);}
 addEventListener('resize',()=>{if(magnifierMode)queueMagnifierFocus();});
 document.addEventListener('scroll',()=>{if(magnifierMode)queueMagnifierFocus();},true);
 document.addEventListener('pointermove',()=>{if(magnifierMode&&(armed||hit))queueMagnifierFocus();});
 document.addEventListener('click',event=>{if(magnifierMode&&!event.target.closest('[data-action="compare"],.magnifier-toggle'))clearArm();},true);
 document.addEventListener('keydown',event=>{const el=event.target.closest('[data-action="compare"]');if(magnifierMode&&el&&el.namespaceURI==='http://www.w3.org/2000/svg'&&(event.key==='Enter'||event.key===' ')){event.preventDefault();compareClick(el);}});
 new MutationObserver(()=>{if(magnifierMode)reapplyArm();}).observe($('#desk-screen'),{childList:true,subtree:true});
 /* AD-14: the game is a client over a live semantic layer. Without one there
    is nothing to show, and a desk full of blanks would be a worse lie than an
    honest stop — so this fails where whoever opened it can read why. */
 function cannotStart(error){
  document.body.dataset.screen='map';
  const panel=document.createElement('div');
  panel.className='boot-failure';
  panel.innerHTML='<h1>The river is between us.</h1><p>'+esc(error&&error.message||error)+'</p>'
   +'<pre>anfra serve\npython3 scripts/generate_nether_cases.py</pre>';
  document.body.append(panel);
  console.error('[NETHER]', error);
 }

 /* Demo entry points.

    A judge or a voter has two minutes, and the parts worth seeing are twenty
    cases in. These rebuild state rather than restore it (AD-6) — there is no
    save to load. The Test scenes menu can simulate earlier judged cases so
    development previews have the corresponding Light, seals, and gifts.

    They are a menu rather than URL parameters: a Data App is mounted in a
    srcdoc iframe whose location is `about:srcdoc` with no query string, and
    the host's own URL is behind an opaque origin. A link cannot carry state
    in, so the app has to offer the door itself. */
 const JUMPS=[
  {id:'ferry',label:'The desk',hint:'Day one. Papers, the Books, a stamp.'},
  {id:'pavilion',label:'The judges',hint:'Court trial. Papers and the judgment checklist.'},
  {id:'finale',label:'The final choice',hint:'Minos offers Elysium; continuing brings a blank petition and Orpheus.'},
  {id:'record',label:'Record of service',hint:'What you have actually been doing.'},
 ];

 /* The five endings, each reached by the run that earns it (finale.js endingFor): what the run has to look like
    to get it, as the arguments endingFor reads. A jump shows the ending as if the run had ended that way, without
    changing the run: nothing is written to the economy. */
 const ENDING_RUNS=[
  {key:'stateless',run:{clarity:0,seals:0,left:false,petitionSolved:false},hint:'Clarity runs out.'},
  {key:'unstable',run:{clarity:10,seals:0,left:false,petitionSolved:false},hint:'Fewer than three seals.'},
  {key:'isles',run:{clarity:10,seals:3,left:true,petitionSolved:false},hint:'Accept the golden ticket to Elysium.'},
  {key:'stayed',run:{clarity:10,seals:3,left:false,petitionSolved:false},hint:'Continue working and leave the petition unfiled.'},
  {key:'together',run:{clarity:10,seals:3,left:false,petitionSolved:true},hint:'Continue working and file the petition for Orpheus.'},
 ];
 /* Development progress is separate from the real stamp flow. A simulated call
    uses the case's generated answer, then the ordinary economy award. It can be
    changed again without farming Light. Skipped shifts do not drain Clarity. */
 function syncDevProgress(){
  const stats=tally();
  EC.state.seals=0;
  EC.evaluate(stats);
  stageTwo=D.cases().every(c=>caseClosed(states.get(c.id)));
  for(const day of new Set(D.cases().map(c=>c.day))){
   const cases=D.cases().filter(c=>c.day===day),complete=cases.every(c=>caseClosed(states.get(c.id)));
   if(complete&&!shiftsClosed.has(day)){shiftsClosed.add(day);devClosedShifts.add(day);}
   else if(!complete&&devClosedShifts.has(day)){shiftsClosed.delete(day);devClosedShifts.delete(day);}
   const flawless=complete&&cases.every(c=>states.get(c.id)?.correct);
   if(flawless&&!EC.state.giftShifts.includes(day)){EC.flawlessShift(day);devGiftShifts.add(day);}
   else if(!flawless&&devGiftShifts.has(day)){
    if(EC.state.pendingGiftShifts.includes(day)){
     EC.state.giftShifts=EC.state.giftShifts.filter(d=>d!==day);
     EC.state.pendingGiftShifts=EC.state.pendingGiftShifts.filter(d=>d!==day);
    }
    devGiftShifts.delete(day);
   }
  }
  header();
 }
 function setDevCase(id,result){
  const c=D.cases().find(c=>c.id===id),old=states.get(id);
  if(!c||!old)return;
  if(['approved','disputed'].includes(old.status))EC.state.light-=old.paid||0;
  const s=blank();
  if(result!=='waiting'){
   s.truth=c.requiredVerdict;
   s.correct=result==='correct';
   s.answerCorrect=c.phase==='pavilion'?s.correct:undefined;
   if(c.phase==='pavilion')PV.checklistOf(c,s).correct=s.correct;
   const verdict=s.correct?s.truth:(s.truth==='approve'?'dispute':'approve');
   s.status=verdict==='approve'?'approved':'disputed';
   s.stampMark=s.status;
   s.stampedOn=NetherDate.current(c);
   s.departed=true;s.ledgerOpened=true;s.ledgerReviewed=true;
   s.paid=EC.award({verdictCorrect:s.correct,answerCorrect:s.answerCorrect,phase:c.phase});
  }
  states.set(id,s);
  syncDevProgress();
 }
 function markEarlierCases(target,enabled){
  if(!enabled)return;
  for(const c of D.cases()){
   if(c.phase==='finale')continue;
   if(c.index>=target.index)break;
   if(states.get(c.id)?.status==='waiting')setDevCase(c.id,'correct');
  }
 }
 let devFillPrevious=true;
 document.addEventListener('change',event=>{
  if(event.target?.id==='jump-fill-previous')devFillPrevious=event.target.checked;
 });
 /* Each number jumps to a case. The small mark beside it cycles its result:
    unplayed, correctly judged, incorrectly judged. */
 function casePicker(){
  const days=new Map();
  for(const c of D.cases().filter(c=>c.phase!=='finale')){if(!days.has(c.day))days.set(c.day,[]);days.get(c.day).push(c);}
  return [...days].map(([day,list])=>'<div class="jump-day"><span>Day '+day+'</span>'+list.map(c=>{
   const s=states.get(c.id),result=s.status==='waiting'?'waiting':s.correct?'correct':'wrong';
   return '<span class="jump-case-pair"><button class="jump-case'+(result==='correct'?' is-done':result==='wrong'?' is-wrong':'')+(c.id===active?' is-current':'')+'" data-action="jump" data-jump="case:'+esc(c.id)+'" title="Jump to '+esc(c.name)+' · '+(c.phase==='pavilion'?'Pavilion':'Ferry')+'" aria-label="Jump to case '+(c.index+1)+', '+esc(c.name)+'">'+(c.index+1)+'</button>'
    +'<button class="jump-case-result '+result+'" data-action="jumpstatus" data-case="'+esc(c.id)+'" title="'+(result==='waiting'?'Unplayed; click to mark correct':result==='correct'?'Correct; click to mark wrong':'Wrong; click to clear')+'" aria-label="Case '+(c.index+1)+' '+result+'. Change result">'+({waiting:'–',correct:'✓',wrong:'×'}[result])+'</button></span>';
  }).join('')+'</div>').join('');
 }
 /* Easy (20 cases, four a day) or hard (50, five a day). The souls are fixed before the page loads, so a change
    reloads the app; the choice rides on window.name, which a sandboxed frame keeps across a reload when storage
    and the address cannot. The run starts again. */
 function setDifficulty(mode){
  if(mode===D.mode())return;
  NetherPreferences.set('mode',mode);
  try{location.reload();}catch{toast('Reload the page to start the '+mode+' game.');}
 }
 function syncDifficulty(){document.querySelectorAll('[data-action="mode"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===D.mode())));}
 function demoMenu(){
  const row=(id,label,hint)=>'<button class="jump-row" data-action="jump" data-jump="'+id+'"><strong>'+esc(label)+'</strong><small>'+esc(hint)+'</small></button>';
  overlay('Jump to','<div class="overlay-body jump-menu">'
   +JUMPS.map(j=>row(j.id,j.label,j.hint)).join('')
   +'<p class="jump-help">Checkpoints prepare their example case and earlier progress for testing.</p>'
   +[...new Set(NetherDevCheckpoints.entries.map(c=>c.group))].map(group=>'<p class="jump-heading">'+esc(group)+'</p>'+NetherDevCheckpoints.entries.filter(c=>c.group===group).map(c=>row('checkpoint:'+c.id,c.label,c.hint)).join('')).join('')
   +'<p class="jump-heading">Cases</p>'
   +'<label class="jump-fill"><input id="jump-fill-previous" type="checkbox"'+(devFillPrevious?' checked':'')+'> Mark earlier unplayed cases correct when jumping</label>'
   +'<p class="jump-help">Click a number to jump. Click its mark to cycle: – unplayed, ✓ correct, × wrong. Correct cases earn Light and count toward seals; wrong calls cost Light.</p>'
   +casePicker()
   +'<p class="jump-heading">Endings</p>'
   +ENDING_RUNS.map(e=>row('ending:'+e.key,FIN.endingFor(e.run).title,e.hint)).join('')
   +'</div>');
 }

 async function demoJump(which){
  if(which.startsWith('checkpoint:')){
   try{await NetherDevCheckpoints.run(which.slice(11),{
    cases:D.cases,state:S,activate,setResult:setDevCase,completeBefore:c=>markEarlierCases(c,true),go:setScreen,ask:q=>G.askJudgeQuestion(q),
    refresh:render,openChecklist:()=>checklist.open(),park:parkCase,
    showLedger(c,s){s.ledgerOpened=false;s.ledgerReviewed=false;if(c.phase==='ferry')NetherOnboarding.prepareCourt();revealLedger(c.id);},
    clear(){
     nbReviewCase=null;advanceWhenQuiet=false;pending.length=0;
     NetherOnboarding.dismiss();NetherCourtOnboarding.dismiss();checklist.close();
     for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
     const finale=$('#finale-stage');if(finale)finale.hidden=true;
     document.querySelectorAll('.dtour [data-dialogue-action="skip"]').forEach(b=>b.click());
     $('#realm-settings').hidden=true;exitMagnifier();
     EC.state.clarity=Math.max(20,EC.state.clarity);
     if(document.body.dataset.arrival!=='complete')world.skip();
    }
   });}catch(error){toast(error.message);}
   return;
  }
  const fillPrevious=devFillPrevious;
  $('#overlay').close();$('#notebook').close();$('#data-overlay').close();
  const cases=D.cases();
  if(which==='ferry'){active=cases[0].id;setScreen('desk');return;}
  if(which==='pavilion'){
   const soul=cases.find(c=>c.phase==='pavilion');
   if(soul){markEarlierCases(soul,fillPrevious);active=soul.id;setScreen('desk');}
   return;
  }
  if(which==='record'){
   const right=[...states.values()].filter(x=>x.correct).length;
   overlay('Record of service',REC.screen({examined:done(),right}));
   return;
  }
  if(which==='finale'){markEarlierCases({index:Infinity},fillPrevious);await enterFinale();return;}
  if(which.startsWith('case:')){
   const target=cases.find(c=>c.id===which.slice(5));
   if(target){markEarlierCases(target,fillPrevious);exitMagnifier();activate(target.id);setScreen('desk');}
   return;
  }
  if(which.startsWith('ending:')){
   const ending=ENDING_RUNS.find(e=>e.key===which.slice(7));
   if(ending){const result=FIN.endingFor(ending.run);overlay(result.title,FIN.endingScreen(result));}
   return;
  }
 }

 async function enterFinale(){
  $('#overlay').close();setScreen('map');
  EC.grantFinaleGift('elysium-ticket');rooms.refresh();
  NetherFinaleStage.show('outside');
  // Her records can still enter the bag as clues. She never enters the soul queue.
  try{const personalFile=await FIN.build();if(personalFile){EC.grantRecords(personalFile);rooms.refresh();}}catch{/* The completion choice remains playable if a clue query is unavailable. */}
 }

 document.addEventListener('nether:finale-continue',()=>{EC.grantFinaleGift('petition');rooms.refresh();openPetition();});
 document.addEventListener('nether:finale-inventory',()=>rooms.openBag('petition'));
 document.addEventListener('nether:finale-service',()=>{const right=[...states.values()].filter(x=>x.correct).length;overlay('Record of service',REC.screen({examined:done(),right}));});
 document.addEventListener('nether:open-petition',()=>openPetition());
 let petitionAnswers={},petitionResult=null;
 function openPetition(){
  overlay('The petition',FIN.petitionScreen(petitionAnswers,petitionResult));
 }
 async function submitPetition(){
  const result=await FIN.checkPetition(petitionAnswers);
  if(result.unreachable){toast('The Books will not answer. Nothing is filed.');return;}
  petitionResult=result;
  if(result.ok){$('#overlay').close();NetherFinaleStage.show('reunited');return;}
  openPetition();
 }
 function finish(){
  $('#overlay').close();
  const resolved=!!(petitionResult&&petitionResult.ok);
  const ending={key:resolved?'together':'stayed',...FIN.ENDINGS[resolved?'together':'stayed']};
  overlay(ending.title,FIN.endingScreen(ending));
 }

 async function start(){
  await D.boot();
  const cases=D.cases();
  if(!cases.length)throw new Error('No souls are waiting. Run scripts/generate_nether_cases.py.');
  states=new Map(cases.map(c=>[c.id,blank()]));
  active=cases[0].id;
  syncDifficulty();
  preview=D.books()[0].id;
  previewModel=book(preview).models[0];

  render();
  window.NetherV4={world,data:D,grade:G,states,setScreen,rooms,analysis,
   get completedDays(){return [...shiftsClosed];},
   get active(){return active;},get screen(){return screen;},get stageTwo(){return stageTwo;},
   get ready(){return true;},
   chooseCase(id){active=id;setScreen('desk');},
   clearMagnifier:clearArm,
   returnPapers(){for(const doc of Object.keys(S().open))closeDoc(doc);soul();checkDeparture();}};
 }

 start().catch(cannotStart);
})();
