/* Shared character dialogue. Text is escaped; portraits are trusted local SVGs. */
window.NetherDialogue=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const arrow='<svg viewBox="0 0 14 10" aria-hidden="true"><path d="M1 5H12M8 1L12 5L8 9"/></svg>';
 function actionsHTML(actions=[]){return actions.map(action=>'<button type="button" class="dialogue-button nui-btn nui-btn--'+(action.variant==='quiet'||action.variant==='tertiary'?'tertiary':action.variant==='secondary'?'secondary':'primary')+'" data-dialogue-action="'+esc(action.id)+'" '+(action.disabled?'disabled':'')+'><span>'+esc(action.label)+'</span>'+(action.arrow?arrow:'')+'</button>').join('');}
 function markup({speaker='',role='',text='',portrait='',className='',textId='',actions=[],label='Conversation',dialog=false}={}){
  return '<section class="dialogue-scene '+(portrait?'dialogue-scene--portrait ':'')+esc(className)+'" role="'+(dialog?'dialog':'group')+'" aria-label="'+esc(label)+'">'
   +(portrait?'<div class="dialogue-portrait">'+portrait+'</div>':'')
   +'<div class="character-dialogue"><p class="dialogue-speaker"><span class="dialogue-name">'+esc(speaker)+'</span><span class="dialogue-role" '+(!role?'hidden':'')+'>'+esc(role)+'</span></p>'
   +'<p class="dialogue-text" '+(textId?'id="'+esc(textId)+'"':'')+' aria-live="polite" aria-atomic="true">'+esc(text)+'</p>'
   +'<div class="dialogue-actions" '+(!actions.length?'hidden':'')+'>'+actionsHTML(actions)+'</div></div></section>';
 }
 function create(options={}){
  const holder=document.createElement('div');holder.innerHTML=markup(options);const element=holder.firstElementChild;
  const text=element.querySelector('.dialogue-text'),footer=element.querySelector('.dialogue-actions');let timer=null,fullText=options.text||'';
  const stop=()=>{if(timer!==null)clearInterval(timer);timer=null;text.setAttribute('aria-busy','false');};
  function setSpeaker(name,role=''){element.querySelector('.dialogue-name').textContent=name;element.querySelector('.dialogue-role').textContent=role;element.querySelector('.dialogue-role').hidden=!role;}
  function setActions(actions){footer.innerHTML=actionsHTML(actions);footer.hidden=!actions.length;}
  function setPortrait(svg){let portrait=element.querySelector('.dialogue-portrait');if(svg&&!portrait){portrait=document.createElement('div');portrait.className='dialogue-portrait';element.prepend(portrait);}if(portrait)portrait.innerHTML=svg||'';element.classList.toggle('dialogue-scene--portrait',!!svg);if(portrait)portrait.hidden=!svg;}
  function type(value,{interval=22,charsPerTick=2}={}){stop();fullText=String(value);if(matchMedia('(prefers-reduced-motion: reduce)').matches){text.textContent=fullText;return;}let index=0;text.textContent='';text.setAttribute('aria-busy','true');timer=setInterval(()=>{index+=charsPerTick;text.textContent=fullText.slice(0,index);if(index>=fullText.length)stop();},interval);}
  function complete(){stop();text.textContent=fullText;}
  function onClick(event){const button=event.target.closest('[data-dialogue-action]');if(button&&!button.disabled)options.onAction?.(button.dataset.dialogueAction,api);}
  element.addEventListener('click',onClick);
  if(options.container)options.container.appendChild(element);
  const api={element,setSpeaker,setActions,setPortrait,type,complete,stop,
   setText(value){stop();fullText=String(value);text.textContent=fullText;},
   focus(action='next'){element.querySelector('[data-dialogue-action="'+CSS.escape(action)+'"]')?.focus({preventScroll:true});},
   destroy(){stop();element.removeEventListener('click',onClick);element.remove();},get typing(){return timer!==null;}};
  return api;
 }
 // Reusable sequence controller: future onboarding flows supply steps and speakers.
 function play({steps,speakers={},onStep,onFinish,exitDuration=260,...options}){
  if(!steps?.length)throw new Error('A conversation needs at least one step.');
  let index=0,finished=false,removeTimer;
  const panel=create({...options,onAction(action){if(finished)return;if(action==='skip')finish(true);else if(action==='next')next();else options.onAction?.(action,flow);}});
  function show(){const step=steps[index],speaker=speakers[step.who]||{};
   panel.setSpeaker(step.speaker??speaker.name??step.who??'',step.role??speaker.role??'');
   const portrait=step.portrait??speaker.portrait??options.portrait;if(portrait!==undefined)panel.setPortrait(portrait);
   panel.setActions(step.actions||[{id:'skip',label:'Skip',variant:'quiet'},{id:'next',label:step.next||'Next',arrow:true}]);
   onStep?.(step,index,panel);panel.type(step.text);panel.focus('next');
  }
  function next(){if(finished)return;if(panel.typing){panel.complete();return;}if(index===steps.length-1)finish(false);else{index++;show();}}
  function finish(skipped){if(finished)return;finished=true;panel.stop();panel.element.classList.add('is-leaving');onFinish?.({skipped,index,panel});removeTimer=setTimeout(()=>panel.destroy(),exitDuration);}
  const flow={element:panel.element,panel,next,skip:()=>finish(true),destroy(){clearTimeout(removeTimer);panel.destroy();finished=true;},get index(){return index;},get finished(){return finished;}};
  show();return flow;
 }
 return {markup,create,play};
})();
