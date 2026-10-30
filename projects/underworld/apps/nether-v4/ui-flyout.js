/* NetherUI.flyout: a row that opens a second panel beside its menu when you hover it.
   Usage, inside a menu that carries data-flyout-anchor (the panel opens to the right of that menu):
     NetherUI.flyout.rowHTML('fields','Existing fields',{count:12})   -> the row, with the chevron
     NetherUI.flyout.panelHTML('fields',bodyHTML,{title:'Existing fields',wide:false})
   Render the panels as siblings of the menu, not inside it: a menu with a filter or overflow would clip
   or re-anchor them. Call NetherUI.flyout.sync() after each re-render so the open panel stays open.
   Every panel has the same fixed height (shorter only when the window is) and its content scrolls.
   A panel stays open while it is hovered, holds focus, or one of its dropdown lists is open. */
window.NetherUI=window.NetherUI||{};
NetherUI.flyout=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const CHEVRON='<svg viewBox="0 0 6 10" aria-hidden="true"><path d="M1 1L5 5L1 9"/></svg>';
 let openId=null,timer=null;
 const panel=id=>document.querySelector('[data-flyout-panel="'+CSS.escape(id)+'"]');
 const row=id=>document.querySelector('[data-flyout="'+CSS.escape(id)+'"]');
 function rowHTML(id,label,{count=null}={}){
  return '<div class="nui-flyout-row" data-flyout="'+esc(id)+'" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false"><span>'+esc(label)+'</span>'+(count===null?'':'<small>'+esc(count)+'</small>')+CHEVRON+'</div>';
 }
 function panelHTML(id,body,{title='',wide=false}={}){
  return '<aside class="nui-flyout'+(wide?' nui-flyout--wide':'')+'" data-flyout-panel="'+esc(id)+'" hidden aria-label="'+esc(title)+'">'+(title?'<h4 class="nui-flyout__title">'+esc(title)+'</h4>':'')+'<div class="nui-flyout__body">'+body+'</div></aside>';
 }
 function place(id){
  const p=panel(id),r=row(id);if(!p||!r)return;
  const anchor=r.closest('[data-flyout-anchor]')||r,ar=anchor.getBoundingClientRect(),rr=r.getBoundingClientRect();
  const top=Math.max(60,Math.min(rr.top-8,innerHeight-220));
  p.style.left=(ar.right+8)+'px';p.style.top=top+'px';p.style.height=Math.max(160,Math.min(420,innerHeight-top-24))+'px';
 }
 function hideAll(){document.querySelectorAll('.nui-flyout').forEach(p=>{p.hidden=true;});document.querySelectorAll('.nui-flyout-row').forEach(r=>r.setAttribute('aria-expanded','false'));}
 function open(id){
  clearTimeout(timer);
  const p=panel(id);if(!p)return;
  hideAll();openId=id;p.hidden=false;place(id);row(id)?.setAttribute('aria-expanded','true');
 }
 function close(){clearTimeout(timer);openId=null;hideAll();}
 const sticky=()=>{const p=openId&&panel(openId);return !!p&&(p.matches(':hover')||p.contains(document.activeElement)||!!document.querySelector('.ui-select-pop'));};
 function later(){clearTimeout(timer);timer=setTimeout(()=>{if(!openId)return;if(sticky())later();else close();},260);}
 const idOf=target=>{const el=target.closest&&target.closest('.nui-flyout-row,.nui-flyout');return el?(el.dataset.flyout||el.dataset.flyoutPanel):null;};
 document.addEventListener('mouseover',e=>{const id=idOf(e.target);if(id)open(id);});
 document.addEventListener('mouseout',e=>{if(idOf(e.target)&&!(e.relatedTarget&&idOf(e.relatedTarget)))later();});
 document.addEventListener('focusin',e=>{const id=idOf(e.target);if(id)open(id);});
 document.addEventListener('focusout',e=>{if(idOf(e.target)&&!(e.relatedTarget&&idOf(e.relatedTarget)))later();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&openId&&!document.querySelector('.ui-select-pop'))close();});
 addEventListener('resize',()=>{if(openId)place(openId);});
 // After the menu is drawn again, show the panel that was open (or forget it if its menu is gone).
 function sync(){
  if(!openId)return;
  const p=panel(openId);
  if(!p){openId=null;return;}
  p.hidden=false;place(openId);row(openId)?.setAttribute('aria-expanded','true');
 }
 return {rowHTML,panelHTML,open,close,sync};
})();
