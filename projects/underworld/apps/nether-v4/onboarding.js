/* Charon's opening and the day-four invitation share the dialogue controller. */
(() => {
 'use strict';
 const LINES=[
  {who:'charon',text:'Another lost soul. Welcome to the underworld.'},
  {who:'you',text:'Where am I? And who am I?'},
  {who:'charon',text:'You are Eury. You fell into the river of forgetfulness, and it took your memory.'},
  {who:'you',text:'Then tell me who I was.'},
  {who:'charon',text:'I cannot. The river keeps its secrets, even from me.'},
  {who:'you',text:'So what do I do now?'},
  {who:'charon',text:'Watch your clarity. Your soul is unstable and loses 10 every day. At zero, you are lost.',spot:'clarity'},
  {who:'you',text:'How do I keep it up?'},
  {who:'charon',text:'Help me. Too many souls are crossing. Examine their identities for me.'},
  {who:'charon',text:'You earn light balls for every soul you judge right. Buy ram\u2019s blood with them to restore your clarity.',spot:'light'},
  {who:'you',text:'Deal. I will do it.',next:'Accept'},
  {who:'charon',text:'Good. Board my ferry when you are ready.',next:'Begin'},
 ];
 const COURT_LINES=[
  {who:'minos',text:'Charon, the court has more trials than I can handle. Can you spare a hand?'},
  {who:'charon',text:'Eury can help. She has finished her work at the ferry.'},
  {who:'minos',text:'Eury, will you help me with the court’s trials?'},
  {who:'charon',text:'Each trial you solve pays two light balls, Eury. Twice what you earn here.'},
  {who:'you',text:'Then I’ll help.',next:'Accept'},
  {who:'minos',text:'Come with me to the Court of Judgement.',next:'To the court'},
 ];
 let flow=null,started=false,kind='opening',courtDone=false,courtStep=0;
 function spot(which){
  document.querySelectorAll('.header-status .stat').forEach((el,i)=>el.classList.toggle('is-spot',(which==='light'&&i===0)||(which==='clarity'&&i===1)));
 }
 /* While a stat is spotlit, the speech sits right under it, right-aligned to it. The man stays put. */
 function pin(element,which){
  const stats=document.querySelectorAll('.header-status .stat'),stat=which==='light'?stats[0]:which==='clarity'?stats[1]:null;
  element.classList.toggle('is-pinned',!!stat);
  if(!stat)return;
  const r=stat.getBoundingClientRect();
  element.style.setProperty('--spot-right',Math.max(8,innerWidth-r.right)+'px');
  element.style.setProperty('--spot-top',(r.bottom+12)+'px');
  element.style.setProperty('--spot-caret',Math.max(14,r.width/2-8)+'px');
 }
 function begin(){
  if(started)return;started=true;kind='opening';document.body.dataset.onboarding='running';
  flow=NetherDialogue.play({
   container:document.body,className:'onboarding',label:'Charon speaks',dialog:true,
   portrait:NetherItemArt.charon(),steps:LINES,
   speakers:{charon:{name:'Charon',role:'the ferryman'},you:{name:'Eury',role:'(you)'}},
   onStep(line,index,panel){panel.element.classList.toggle('is-you',line.who==='you');spot(line.spot);pin(panel.element,line.spot);},
   onFinish({skipped}){
    spot(null);document.body.dataset.onboarding='done';
    if(!skipped&&document.body.dataset.screen==='map')document.body.classList.add('ob-point');
   }
  });
 }
 function invite(){
  kind='court';const first=courtStep;document.body.dataset.onboarding='running';document.body.dataset.courtInvitation='running';document.body.classList.remove('ob-point');
  flow=NetherDialogue.play({
   container:document.body,className:'onboarding court-onboarding',label:'An invitation from the judges',dialog:true,
   steps:COURT_LINES.slice(first),
   speakers:{charon:{name:'Charon',role:'the ferryman',portrait:NetherItemArt.charon()},minos:{name:'Minos',role:'for the three judges',portrait:NetherItemArt.judge()},you:{name:'Eury',role:'(you)',portrait:''}},
   onStep(line,index,panel){courtStep=first+index;panel.element.classList.toggle('is-you',line.who==='you');},
   onFinish({skipped}){
    courtDone=true;document.body.dataset.onboarding='done';document.body.dataset.courtInvitation='done';
    if(!skipped&&document.body.dataset.screen==='map'){
     NetherV4.world.visitIsland('marsh');
     document.body.classList.add('ob-court-point');
    }
   }
  });
 }
 function dismissForDevelopment(){
  flow?.destroy();flow=null;started=true;courtDone=true;courtStep=0;spot(null);
  document.body.dataset.onboarding='done';document.body.dataset.courtInvitation='done';
  document.body.classList.remove('ob-point','ob-court-point');
 }
 window.NetherOnboarding={dismiss:dismissForDevelopment,prepareCourt(){dismissForDevelopment();courtDone=false;},previewCourt(scene='conversation'){
  dismissForDevelopment();
  if(scene==='entrance'){
   NetherV4.world.focusIsland('marsh');document.body.classList.add('ob-court-point');
  }else{
   NetherV4.world.focusIsland('ferry');courtDone=false;invite();
  }
 }};
 function check(){
  if(document.body.dataset.arrival!=='complete'||document.body.dataset.screen!=='map')return;
  if(!started){begin();return;}
  if(courtDone||document.querySelector('.onboarding')||document.querySelector('dialog[open]')||!window.NetherV4?.ready||NetherEconomy.lost())return;
  const ferryDays=[...new Set(NetherV4.data.cases().filter(c=>c.phase==='ferry').map(c=>c.day))];
  if(ferryDays.length&&ferryDays.every(day=>NetherV4.completedDays.includes(day))&&NetherProgress.state.ferryComplete)invite();
 }
 new MutationObserver(()=>{
  if(document.body.dataset.screen!=='map'){
   document.body.classList.remove('ob-point');
   if(document.body.dataset.screen==='marsh')document.body.classList.remove('ob-court-point');
   if(flow&&!flow.finished){
    if(kind==='court'){flow.destroy();flow=null;document.body.dataset.onboarding='done';document.body.dataset.courtInvitation='pending';}
    else flow.skip();
   }
  }
  check();
 }).observe(document.body,{attributes:true,attributeFilter:['data-arrival','data-screen'],childList:true});
 for(const dialog of document.querySelectorAll('dialog'))new MutationObserver(check).observe(dialog,{attributes:true,attributeFilter:['open']});
 addEventListener('nether:shift-ended',check);addEventListener('nether:progress',check);
 document.addEventListener('DOMContentLoaded',check);window.addEventListener('load',check);
})();
