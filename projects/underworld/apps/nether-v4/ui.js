/* Shared UI templates.
   NetherUI.modal.html({title, body, closeAttrs}) -> the inside of a modal <dialog class="nui-modal">:
     a panel with the title top left, a round close button top right and the content area below.
     closeAttrs is a string of attributes for the close button (a data-action, aria-label, ...);
     closeClass adds a class to it for scripts that look it up.
     footer (optional) is pinned below the content; bodyClass 'nui-panel__body--flush' removes the padding and
     lets the content manage its own scrolling.
   NetherUI.tabs.html(tabs, active, attr) -> side index tabs for a modal with the "nui-modal--tabs" class;
     tabs is [[id, label], ...], attr names the data attribute the click handler listens to.
   Dropdowns live in ui-select.js, character speech in dialogue.js. */
window.NetherUI=window.NetherUI||{};
(() => {
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const closeIcon='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3L13 13M13 3L3 13"/></svg>';
 NetherUI.modal={
  html({title='',body='',footer='',closeAttrs='aria-label="Close"',closeClass='',bodyClass='',titleId=''}={}){
   return '<section class="nui-panel"><header class="nui-panel__head"><h2 class="nui-panel__title"'+(titleId?' id="'+esc(titleId)+'"':'')+'>'+esc(title)+'</h2>'
    +'<button type="button" class="nui-panel__close'+(closeClass?' '+esc(closeClass):'')+'" '+closeAttrs+'>'+closeIcon+'</button></header><div class="nui-panel__body'+(bodyClass?' '+esc(bodyClass):'')+'">'+body+'</div>'+(footer?'<footer class="nui-panel__foot">'+footer+'</footer>':'')+'</section>';
  },
 };
 NetherUI.tabs={
  html(tabs,active,attr='data-tab',label='Sections'){
   return '<nav class="nui-tabs" aria-label="'+esc(label)+'" role="tablist">'+tabs.map(([id,text])=>'<button type="button" role="tab" '+attr+'="'+esc(id)+'" aria-selected="'+(id===active)+'"><span>'+esc(text)+'</span></button>').join('')+'</nav>';
  },
 };
})();
