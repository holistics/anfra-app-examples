/* Minos waits at the right of his speech and introduces the court's feather. */
(() => {
 'use strict';
 let seen=false,flow=null,firstStep=0;
 const steps=[
  {who:'minos',text:'This work is more complex. Find the data in the Books and answer two questions for each soul.'},
  {who:'minos',text:'Click the feather below the bell to open your Judgment checklist.',next:'Open checklist'},
 ];
 function check(){
  if(document.body.dataset.screen!=='marsh'){
   if(flow&&!flow.finished){flow.destroy();flow=null;document.body.classList.remove('court-quill-guide');}
   return;
  }
  if(seen||flow||!window.NetherV4?.ready||document.querySelector('.onboarding,dialog[open]'))return;
  if(!document.querySelector('.court-quill'))return;
  flow=NetherDialogue.play({container:document.body,className:'onboarding court-checklist-onboarding',label:'Minos explains the judgment checklist',dialog:true,
   speakers:{minos:{name:'Minos',role:'for the three judges',portrait:NetherItemArt.judge()}},
   steps:steps.slice(firstStep),
   onStep(line,index){document.body.classList.toggle('court-quill-guide',firstStep+index===1);},
   onFinish({skipped}){
    seen=true;document.body.dataset.courtChecklistIntro='done';
    if(!skipped&&document.body.dataset.screen==='marsh')document.querySelector('.court-quill')?.click();
   }
  });
 }
 function dismiss(){flow?.destroy();flow=null;seen=true;document.body.classList.remove('court-quill-guide');document.body.dataset.courtChecklistIntro='done';}
 window.NetherCourtOnboarding={dismiss,show(step=0){dismiss();seen=false;firstStep=Math.max(0,Math.min(steps.length-1,step));check();}};
 document.addEventListener('click',event=>{
  if(!event.target.closest('[data-action="checklist"]'))return;
  document.body.classList.remove('court-quill-guide');
  if(flow&&!flow.finished)flow.skip();
 });
 new MutationObserver(check).observe(document.body,{attributes:true,attributeFilter:['data-screen'],childList:true});
 window.addEventListener('load',check);
})();
