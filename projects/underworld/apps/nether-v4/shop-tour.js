/* The keeper's welcome the first time the player walks into the shop, and her word when the price of
   ram's blood has moved since they last saw it. The speech is the shared dialogue (dialogue.js) and the
   highlight is the desk tour's (desk-tour.css, the `dtour` classes). Every line has Skip and Next only;
   the price note has Ok only. The panel closes when it is done and is not there the rest of the time.
   Next on a step that waits for the player does the thing for them. */
(() => {
 'use strict';
 const $=s=>document.querySelector(s),E=()=>window.NetherEconomy,R=()=>window.NetherV4.rooms;
 const card=id=>'.stock-card[data-item="'+id+'"]',owned=id=>E().state.owned.includes(id);
 const INTRO=[
  {who:'keeper',text:'Ah, there you are. It is good to see you again.'},
  {who:'you',text:'Again? Have we met before?'},
  {who:'keeper',text:'Oh ho, never mind that! I have a present for you.'},
  {who:'keeper',id:'lyre',text:'Here it is. A lyre.',skip:()=>owned('lyre'),onEnter:()=>R().selectShop('lyre'),targets:[card('lyre'),'.shop-item-preview'],passive:true},
  {who:'keeper',id:'take',text:'Press Take. It is yours.',skip:()=>owned('lyre'),targets:['.purchase-button'],blink:true,
   done:()=>owned('lyre'),auto:()=>$('.purchase-button')?.click(),reaction:'That lyre will be extremely useful later.'},
  {who:'keeper',id:'blood',text:'This is ram’s blood. It keeps your soul stable.',onEnter:()=>R().selectShop('blood'),targets:[card('blood'),'.shop-item-preview'],passive:true},
  {who:'keeper',id:'price',text:'Its price changes from day to day. Buy it when the price is good.',targets:[card('blood')+' .stock-price'],passive:true},
  {who:'keeper',id:'secrets',text:'The other things on my shelves each hold a secret. You may want them.',
   targets:()=>[...document.querySelectorAll('.stock-card')].filter(c=>c.dataset.item!=='blood').map(c=>'.stock-card[data-item="'+c.dataset.item+'"]'),passive:true},
 ];
 const noticeStep=()=>{
  const {from,to}=E().state.priceNotice;
  return {who:'keeper',okOnly:true,text:to>from?'Ram’s blood now costs '+to+' light, up from '+from+'.':'Ram’s blood is down to '+to+' light, from '+from+'. A good day to buy.'};
 };
 let running=false,root,scrim,panel,steps=[],step,index=-1,mode='idle',autoRan=false,frame=0,lastKey='',rings=[],onDone=null;
 /* A target is a selector, or a list of selectors that share one highlight (the box that holds them all). */
 const boxOf=sel=>{const rs=(Array.isArray(sel)?sel:[sel]).map($).filter(el=>el&&el.getClientRects().length).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);
  if(!rs.length)return [];const x=Math.min(...rs.map(r=>r.left)),y=Math.min(...rs.map(r=>r.top));return [{x,y,w:Math.max(...rs.map(r=>r.right))-x,h:Math.max(...rs.map(r=>r.bottom))-y}];};
 const targetsOf=()=>{const t=typeof step.targets==='function'?step.targets():step.targets;return t?t.flatMap(boxOf):[];};
 function holePath(r,pad=8,rad=10){const x=r.x-pad,y=r.y-pad,w=r.w+pad*2,h=r.h+pad*2;return 'M'+(x+rad)+' '+y+'h'+(w-rad*2)+'a'+rad+' '+rad+' 0 0 1 '+rad+' '+rad+'v'+(h-rad*2)+'a'+rad+' '+rad+' 0 0 1 -'+rad+' '+rad+'h-'+(w-rad*2)+'a'+rad+' '+rad+' 0 0 1 -'+rad+' -'+rad+'v-'+(h-rad*2)+'a'+rad+' '+rad+' 0 0 1 '+rad+' -'+rad+'z';}
 function layout(){
  const rects=targetsOf(),key=JSON.stringify([rects,innerWidth,innerHeight,step.id,!!step.targets]);
  if(key===lastKey)return;
  lastKey=key;
  scrim.toggleAttribute('hidden',!step.targets);
  scrim.setAttribute('viewBox','0 0 '+innerWidth+' '+innerHeight);
  scrim.firstElementChild.setAttribute('d','M0 0H'+innerWidth+'V'+innerHeight+'H0z'+rects.map(r=>holePath(r)).join(''));
  while(rings.length<rects.length){const ring=document.createElement('div');root.insertBefore(ring,panel.element);rings.push(ring);}
  rings.forEach((ring,i)=>{const r=rects[i];ring.hidden=!r;if(!r)return;
   ring.className='dtour-ring'+(step.passive?' is-block':'')+(step.blink?' is-blink':'');
   Object.assign(ring.style,{left:r.x-8+'px',top:r.y-8+'px',width:r.w+16+'px',height:r.h+16+'px'});});
 }
 function actions(){
  panel.setActions(step.okOnly?[{id:'next',label:'Ok'}]:[{id:'skip',label:'Skip',variant:'tertiary'},{id:'next',label:'Next',arrow:true}]);
 }
 function say(text,who){
  const you=who==='you';
  panel.setSpeaker(you?'Eury':'The keeper',you?'(you)':'');
  panel.element.classList.toggle('is-you',you);
  panel.setText(text);
 }
 function go(to){
  index=to;
  while(index<steps.length&&steps[index].skip?.())index++;
  if(index>=steps.length)return finish(false);
  step=steps[index];lastKey='';autoRan=false;
  step.onEnter?.();
  mode=step.done?'waiting':'reading';
  actions();say(step.text,step.who);panel.focus('next');layout();
 }
 function completed(){
  if(step.reaction){mode='reading';actions();say(step.reaction,step.who);panel.focus('next');return;}
  go(index+1);
 }
 function next(){
  if(mode==='reading')go(index+1);
  else if(!autoRan){autoRan=true;step.auto?.();}
 }
 function tick(){
  if(!running)return;
  if(mode==='waiting'&&step.done())completed();
  layout();
  frame=requestAnimationFrame(tick);
 }
 function finish(skipped){
  if(!running)return;
  running=false;cancelAnimationFrame(frame);
  const after=onDone;onDone=null;
  root.classList.add('is-leaving');setTimeout(()=>{panel.destroy();root.remove();},260);
  after?.(skipped);
 }
 function run(list,done){
  running=true;steps=list;onDone=done;
  root=document.createElement('div');root.className='dtour';root.dataset.pos='bl';
  root.innerHTML='<svg class="dtour-scrim" aria-hidden="true"><path fill-rule="evenodd"/></svg>';
  scrim=root.firstElementChild;rings=[];
  document.body.appendChild(root);
  panel=NetherDialogue.create({container:root,className:'dtour-dialogue shop-tour-dialogue',label:'The keeper speaks',dialog:true,speaker:'The keeper',
   onAction(action){if(action==='skip')finish(true);else if(action==='next')next();}});
  go(0);tick();
 }
 function maybeStart(tries=0){
  if(running||document.body.dataset.screen!=='shop')return;
  if(!window.NetherV4?.ready||document.querySelector('dialog[open]')){if(tries<30)setTimeout(()=>maybeStart(tries+1),300);return;}
  const e=E().state;
  if(!e.shopIntroDone){e.shopIntroDone=true;run(INTRO);}
  else if(e.priceNotice)run([noticeStep()],()=>{E().ackPrice();R().refresh();});
 }
 /* The shop screen opens: the welcome the first time, the price note when the price moved. */
 new MutationObserver(()=>{
  if(document.body.dataset.screen==='shop')setTimeout(()=>maybeStart(),500);
  else if(running)finish(true);
 }).observe(document.body,{attributes:true,attributeFilter:['data-screen']});
 window.NetherShopTour={get running(){return running;},replay(){if(running)finish(true);E().state.shopIntroDone=false;maybeStart();}};
})();
