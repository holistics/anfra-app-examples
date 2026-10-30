/* NetherUI.select: the app's one dropdown.

   Usage
     NetherUI.select.enhance(root)        upgrade every <select> inside root (default: the document)
     NetherUI.select.refresh(select)      re-read the label after changing the native select by hand
     NetherUI.select.triggerHTML(label, attrs, extraClass)
                                          the same trigger as a plain button, for a control that opens
                                          something else (the register launcher opens the Book of Truth)

   The native <select> stays in the DOM as the source of truth (value, id, name, aria-label), visually
   hidden. Picking an item sets its value and dispatches a bubbling 'change' event on it, so existing
   document-level 'change' handlers keep working. Every <select> in the app is upgraded
   automatically, including ones drawn later by innerHTML; add the data-native attribute to keep a
   native one, or call enhance(root) yourself. Keyboard: Enter/Space/Arrows open; Up/Down/Home/End
   move; Enter picks; Escape and Tab close; typing jumps to a matching item.
   The popover lives inside the nearest <dialog> (the top layer would hide it otherwise). */
window.NetherUI=window.NetherUI||{};
window.NetherUI.select=(()=>{
 'use strict';
 const AUTO='select:not([data-native])';
 const CHEVRON='<svg class="ui-select-chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="M1.5 1.75L6 6.25L10.5 1.75"/></svg>';
 const CHECK='<svg class="ui-select-check" viewBox="0 0 12 10" aria-hidden="true"><path d="M1.5 5.25L4.5 8.25L10.5 1.75"/></svg>';
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 let open=null,seq=0,typed='',typedAt=0;

 function triggerHTML(label,attrs='',extraClass=''){
  return '<button type="button" class="ui-select-trigger'+(extraClass?' '+extraClass:'')+'" '+attrs+'><span class="ui-select-label">'+esc(label)+'</span>'+CHEVRON+'</button>';
 }

 function items(select){
  const out=[];
  for(const node of select.children){
   if(node.tagName==='OPTGROUP'){
    out.push({group:node.label});
    for(const o of node.children)if(o.tagName==='OPTION')out.push({option:o,disabled:o.disabled||node.disabled});
   }else if(node.tagName==='OPTION')out.push({option:node,disabled:node.disabled});
  }
  return out;
 }
 const labelOf=select=>select.selectedOptions[0]?.textContent.trim()||'';
 // An option may carry a trusted inline SVG in data-icon; it shows before the label.
 const iconOf=option=>option&&option.dataset.icon?'<i class="ui-select-icon" aria-hidden="true">'+option.dataset.icon+'</i>':'';
 const labelHTML=select=>iconOf(select.selectedOptions[0])+'<span>'+esc(labelOf(select))+'</span>';
 function refresh(select){
  const trigger=select.closest('.ui-select')?.querySelector('.ui-select-trigger');
  if(trigger)trigger.querySelector('.ui-select-label').innerHTML=labelHTML(select);
 }

 function close(returnFocus){
  if(!open)return;
  const {pop,trigger}=open;open=null;
  pop.remove();trigger.setAttribute('aria-expanded','false');trigger.classList.remove('is-open');
  if(returnFocus)trigger.focus({preventScroll:true});
 }

 function place(){
  const {pop,trigger}=open,r=trigger.getBoundingClientRect(),gap=6;
  pop.style.minWidth=Math.max(r.width,160)+'px';pop.style.maxHeight='';
  const h=pop.offsetHeight,room=innerHeight-r.bottom-gap-10,above=r.top-gap-10;
  const flip=h>room&&above>room;
  const max=Math.min(300,flip?above:room);
  pop.style.maxHeight=max+'px';
  const height=Math.min(h,max);
  pop.style.top=(flip?r.top-gap-height:r.bottom+gap)+'px';
  let left=r.left;const w=pop.offsetWidth;if(left+w>innerWidth-10)left=Math.max(10,innerWidth-10-w);
  pop.style.left=left+'px';pop.classList.toggle('is-above',flip);
 }

 function setActive(index,scroll=true){
  const {pop}=open,rows=[...pop.querySelectorAll('[role=option]')];
  rows.forEach((el,i)=>el.classList.toggle('is-active',i===index));
  open.active=index;
  const el=rows[index];if(el){pop.setAttribute('aria-activedescendant',el.id);if(scroll)el.scrollIntoView({block:'nearest'});}
 }
 const enabledRows=()=>[...open.pop.querySelectorAll('[role=option]:not([aria-disabled=true])')];
 function move(delta){
  const rows=[...open.pop.querySelectorAll('[role=option]')],ok=i=>rows[i]&&rows[i].getAttribute('aria-disabled')!=='true';
  let i=open.active;do{i+=delta;}while(i>=0&&i<rows.length&&!ok(i));
  if(ok(i))setActive(i);
 }
 function choose(row){
  if(!row||row.getAttribute('aria-disabled')==='true')return;
  const {select}=open,changed=select.value!==row.dataset.value;
  close(true);
  if(!changed)return;
  select.value=row.dataset.value;refresh(select);
  select.dispatchEvent(new Event('input',{bubbles:true}));
  select.dispatchEvent(new Event('change',{bubbles:true}));
 }

 function show(wrap){
  const trigger=wrap.querySelector('.ui-select-trigger'),select=wrap.querySelector('select');
  if(open&&open.trigger===trigger){close(true);return;}
  close(false);
  const host=trigger.closest('dialog')||[...document.querySelectorAll('dialog[open]')].pop()||document.body;
  const pop=document.createElement('div');
  pop.className='ui-select-pop';pop.setAttribute('role','listbox');pop.tabIndex=-1;
  // Keep the owning editor even when choosing an option redraws its contents.
  pop.uiSelectOwner=trigger.closest('[data-analytic-popup]')||wrap;
  if(select.getAttribute('aria-label'))pop.setAttribute('aria-label',select.getAttribute('aria-label'));
  const id='ui-opt-'+(++seq)+'-';let n=0;
  pop.innerHTML=items(select).map(it=>{
   if(it.group!==undefined)return '<div class="ui-select-group" role="presentation">'+esc(it.group)+'</div>';
   const sel=it.option.selected;
   return '<div class="ui-select-option'+(sel?' is-selected':'')+'" role="option" id="'+id+(n++)+'" data-value="'+esc(it.option.value)+'" aria-selected="'+sel+'"'+(it.disabled?' aria-disabled="true"':'')+'>'+iconOf(it.option)+'<span>'+esc(it.option.textContent.trim())+'</span>'+(sel?CHECK:'')+'</div>';
  }).join('');
  host.appendChild(pop);
  open={wrap,trigger,select,pop,active:-1};
  trigger.setAttribute('aria-expanded','true');trigger.classList.add('is-open');
  place();
  const rows=[...pop.querySelectorAll('[role=option]')];
  let start=rows.findIndex(el=>el.classList.contains('is-selected'));
  if(start<0)start=rows.findIndex(el=>el.getAttribute('aria-disabled')!=='true');
  setActive(start);
  pop.focus({preventScroll:true});
  pop.addEventListener('pointerdown',e=>e.preventDefault());
  pop.addEventListener('click',e=>choose(e.target.closest('[role=option]')));
  pop.addEventListener('pointermove',e=>{const row=e.target.closest('[role=option]');if(row&&row.getAttribute('aria-disabled')!=='true')setActive(rows.indexOf(row),false);});
  pop.addEventListener('keydown',onKey);
 }

 function onKey(e){
  if(!open)return;
  const rows=[...open.pop.querySelectorAll('[role=option]')];
  switch(e.key){
   case 'ArrowDown':e.preventDefault();move(1);break;
   case 'ArrowUp':e.preventDefault();move(-1);break;
   case 'Home':e.preventDefault();setActive(rows.findIndex(el=>el.getAttribute('aria-disabled')!=='true'));break;
   case 'End':{e.preventDefault();const ok=enabledRows();if(ok.length)setActive(rows.indexOf(ok[ok.length-1]));break;}
   case 'Enter':case ' ':e.preventDefault();choose(rows[open.active]);break;
   case 'Escape':e.preventDefault();e.stopPropagation();close(true);break;
   case 'Tab':close(false);break;
   default:
    if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
     const now=Date.now();typed=(now-typedAt>700?'':typed)+e.key.toLowerCase();typedAt=now;
     const hit=rows.findIndex((el,i)=>el.getAttribute('aria-disabled')!=='true'&&el.textContent.trim().toLowerCase().startsWith(typed)&&(typed.length>1||i>open.active));
     const any=hit>=0?hit:rows.findIndex(el=>el.getAttribute('aria-disabled')!=='true'&&el.textContent.trim().toLowerCase().startsWith(typed));
     if(any>=0)setActive(any);
    }
  }
 }

 function upgrade(select){
  if(select.dataset.uiSelectDone||select.multiple||select.size>1)return;
  select.dataset.uiSelectDone='1';
  const wrap=document.createElement('div'),trigger=document.createElement('button');
  wrap.className='ui-select';trigger.type='button';trigger.className='ui-select-trigger';
  trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  const name=select.getAttribute('aria-label');if(name)trigger.setAttribute('aria-label',name);
  trigger.innerHTML='<span class="ui-select-label"></span>'+CHEVRON;
  select.parentNode.insertBefore(wrap,select);
  wrap.append(trigger,select);
  select.classList.add('ui-select-native');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  trigger.querySelector('.ui-select-label').innerHTML=labelHTML(select);
  if(select.disabled)trigger.disabled=true;
  trigger.addEventListener('click',()=>show(wrap));
  trigger.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();show(wrap);}});
  select.addEventListener('change',()=>refresh(select));
 }

 function enhance(root=document){
  const list=root.matches&&root.matches('select')?[root]:[...root.querySelectorAll('select')];
  list.forEach(upgrade);
 }
 function auto(){document.querySelectorAll(AUTO).forEach(upgrade);}

 let queued=false;
 const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;auto();});});
 function start(){auto();observer.observe(document.body,{childList:true,subtree:true});}
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start);

 // Outside click, resize and scrolling elsewhere dismiss it.
 document.addEventListener('pointerdown',e=>{if(open&&!open.pop.contains(e.target)&&!open.trigger.contains(e.target))close(false);},true);
 addEventListener('resize',()=>close(false));
 document.addEventListener('scroll',e=>{if(open&&!open.pop.contains(e.target))close(false);},true);

 return {enhance,refresh,triggerHTML};
})();
