/* The court's quill opens a small, persistent checklist beside the analytics desk. */
window.NetherCourtChecklist=(()=>{
 'use strict';
 const P=NetherPavilion,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function quillSVG(){return '<svg class="court-quill-art" viewBox="0 0 76 148" aria-hidden="true"><path d="M30 100C10 93 8 75 14 53C19 29 39 5 51 4C68 14 69 39 61 64C55 83 43 95 30 100Z" fill="#4c8c7c" stroke="#9aaf8a" stroke-width="1.3"/><path d="M31 96C19 82 17 62 26 40C34 22 42 12 51 4C45 32 40 62 31 96Z" fill="#386c61"/><g fill="none" stroke="#82a18a" stroke-width=".65" opacity=".8"><path d="M23 91L31 94L54 76M17 82L33 84L61 61M15 72L36 73L65 46M17 61L39 62L66 33M21 49L42 49L64 22M28 36L45 36L59 13M36 24L48 24"/></g><path d="M28 106Q41 57 51 8" fill="none" stroke="#b6a56a" stroke-width="2"/><g fill="#b5a46b"><circle cx="51" cy="26" r="1"/><circle cx="56" cy="48" r="1.3"/><circle cx="24" cy="58" r="1"/><circle cx="42" cy="72" r="1.2"/><circle cx="31" cy="40" r=".9"/><circle cx="50" cy="60" r=".8"/></g><path d="M26 97L34 99L31 112L27 115L24 110Z" fill="#a69a65" stroke="#5e6044"/><path d="M25 114L30 115L27 134L22 133Z" fill="#a69a65" stroke="#5e6044"/><path d="M22 132L27 133L23 145L20 144Z" fill="#b6b69c" stroke="#5d6553"/><path d="M23 136L22 143M24 102L32 104M24 122L29 123M23 128L28 129" fill="none" stroke="#5e6044" stroke-width=".8"/></svg>';}
 function create({case:currentCase,state,onChange,onExhausted,exitMagnifier}){
  const dialog=document.createElement('dialog');dialog.id='judgment-checklist';dialog.className='nui-modal judgment-checklist';dialog.setAttribute('aria-labelledby','judgment-checklist-title');document.body.append(dialog);
  let owner=null,message='';
  function draw(){
   if(!owner)return;
   const {c,s}=owner,list=P.questionsFor(c),check=P.checklistOf(c,s),settled=['approved','disputed','pending'].includes(s.status),closed=check.correct||check.attempts>=P.MAX_TRIALS||settled;
   dialog.innerHTML='<section class="checklist-sheet" data-anfra-block="v4-judgment-checklist" data-anfra-label="Judgment checklist"><header class="checklist-heading"><div><h2 id="judgment-checklist-title">Judgment checklist</h2><p>'+esc(c.name)+'</p></div><button class="checklist-close" data-checklist-close aria-label="Close judgment checklist">×</button></header>'
    +'<div class="checklist-content"><ol class="checklist-questions">'+list.map((q,i)=>'<li><label for="checklist-answer-'+i+'">'+esc(q.prompt)+'</label>'+(q.decimals>0?'<small>Round to '+q.decimals+' decimal places.</small>':'')+'<input id="checklist-answer-'+i+'" data-checklist-answer="'+i+'" inputmode="decimal" autocomplete="off" placeholder="Enter a number" value="'+esc(check.answers[i])+'"'+(closed||check.checking?' disabled':'')+' aria-invalid="'+(check.results?.[i]===false)+'">'+(check.results?'<small class="checklist-result '+(check.results[i]?'is-right':'is-wrong')+'">'+(check.results[i]?'✓ Correct':'Check this answer')+'</small>':'')+'</li>').join('')+'</ol>'
    +'<p class="checklist-message" role="status" aria-live="polite">'+esc(message||(check.correct?'Both answers are correct. The approve stamp is ready.':check.attempts>=P.MAX_TRIALS?'All five trials used. This case will remain pending: criteria not met.':''))+'</p>'
    +'<section id="checklist-hints" class="checklist-hints"'+(!check.hints?' hidden':'')+'><h3>Hints</h3>'+list.map((q,i)=>'<p><b>'+ (i+1)+'.</b> '+esc(q.hint)+'</p>').join('')+'</section></div>'
    +'<footer class="checklist-footer"><button class="checklist-hint" data-checklist-hint aria-label="Show hints" aria-expanded="'+check.hints+'" aria-controls="checklist-hints">?</button><span class="checklist-attempts" aria-live="polite">'+(check.attempts?check.attempts+'/5 trials':'5 trials available')+'</span>'+(check.attempts>=P.MAX_TRIALS&&!check.correct?'<button class="nui-btn nui-btn--primary" data-checklist-close>Continue</button>':'<button class="nui-btn nui-btn--primary" data-checklist-submit'+(closed||check.checking?' disabled':'')+'>'+(check.checking?'Checking…':check.correct?'Completed':'Submit')+'</button>')+'</footer></section>';
  }
  function finishPending(){if(owner){const {c,s}=owner,check=P.checklistOf(c,s);if(check.attempts>=P.MAX_TRIALS&&!check.correct&&s.status==='waiting')onExhausted(c,s);}}
  function close(){if(dialog.open)dialog.close();finishPending();}
  dialog.addEventListener('close',finishPending);
  function open(){const c=currentCase(),s=state();if(!P.questionsFor(c).length)return;exitMagnifier();owner={c,s};message='';draw();if(!dialog.open)dialog.showModal();}
  dialog.addEventListener('input',event=>{
   const i=event.target.dataset.checklistAnswer;if(i==null||!owner)return;
   P.checklistOf(owner.c,owner.s).answers[Number(i)]=event.target.value;
   event.target.setAttribute('aria-invalid','false');
  });
  dialog.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-checklist-answer]')){event.preventDefault();dialog.querySelector('[data-checklist-submit]')?.click();}});
  dialog.addEventListener('click',async event=>{
   if(event.target===dialog||event.target.closest('[data-checklist-close]')){close();return;}
   if(!owner)return;
   const {c,s}=owner,check=P.checklistOf(c,s);
   if(event.target.closest('[data-checklist-hint]')){check.hints=!check.hints;draw();dialog.querySelector('[data-checklist-hint]').focus();return;}
   if(!event.target.closest('[data-checklist-submit]'))return;
   const request=P.submitChecklist(c,s);draw();const result=await request;
   if(result.exhausted&&!dialog.open)onExhausted(c,s);
   if(owner?.s!==s||state()!==s)return;
   message=result.ok?(result.correct?'Both answers are correct. The approve stamp is ready.':result.exhausted?'All five trials used. This case will remain pending: criteria not met.':'The answers do not both match the Books. Check your chart and try again.'):result.why;
   draw();onChange();
  });
  return {open,close,sync(c){if(owner&&owner.c.id!==c.id){close();owner=null;}},get element(){return dialog;}};
 }
 return {create,quillSVG};
})();
