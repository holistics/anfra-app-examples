/* Shared nested field pickers and anchored panels for the examination workbench. */
window.NetherFieldUI=(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 /* The same icons as the Book of Truth list: a sigma for metrics, a cube for models. */
 const icons={metric:'<span class="bk-sigma" aria-hidden="true">Σ</span>',model:'<span class="bk-cube" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 1.5L13.5 4.5V11.5L8 14.5L2.5 11.5V4.5ZM2.5 4.5L8 7.5L13.5 4.5M8 7.5V14.5"/></svg></span>'};
 const stack=[];let infoTimer=null,infoPanel=null;
 const symbol=f=>f.kind==='measure'||f.kind==='metric'?'∑':/date/.test(f.type)?'▦':f.type==='number'?'#':f.type==='truefalse'?'◐':'Aa';
 function closeFrom(index=0){for(const p of stack.splice(index)){p.element.remove();p.onClose?.();}}
 function place(p){const r=p.anchor?.getBoundingClientRect()||{left:innerWidth/2-180,right:innerWidth/2,top:100,bottom:100},box=p.element,w=Math.min(p.width||340,innerWidth-24);box.style.width=w+'px';let left=p.side?r.right+7:r.left;if(left+w>innerWidth-12)left=p.side?r.left-w-7:innerWidth-w-12;box.style.left=Math.max(12,left)+'px';box.style.top=Math.max(60,Math.min(p.side?r.top:r.bottom+7,innerHeight-Math.min(box.matches('.date-filter-pop,.date-calendar-pop')?innerHeight-80:480,box.scrollHeight)-20))+'px';box.style.maxHeight=Math.max(150,innerHeight-parseFloat(box.style.top)-14)+'px';}
 function open({anchor,title='',header=true,sticky=false,html='',width=340,side=false,parent=null,className='',onClick,onChange,onInput,onClose,onOutside,focus=true}={}){
  hideInfo();const parentPanel=parent||anchor?.closest('[data-analytic-popup]'),index=parentPanel?stack.findIndex(p=>p.element===parentPanel)+1:0;closeFrom(index);
  const element=document.createElement('section');element.className='analytic-pop '+className;element.dataset.analyticPopup='';element.setAttribute('role','dialog');element.setAttribute('aria-label',title||'Field options');element.innerHTML=(title&&header?'<header><strong>'+esc(title)+'</strong><button type="button" data-pop-close aria-label="Close '+esc(title)+'">×</button></header>':'')+'<div class="analytic-pop-body">'+html+'</div>';
  const host=anchor?.closest('dialog[open]')||document.body;host.append(element);const panel={element,anchor,width,side,sticky,onClose,onOutside,close(){const i=stack.indexOf(panel);if(i>=0)closeFrom(i);},set(html){element.querySelector('.analytic-pop-body').innerHTML=html;place(panel);}};stack.push(panel);place(panel);
  element.addEventListener('click',e=>{e.stopPropagation();if(e.target.closest('[data-pop-close]'))panel.close();else onClick?.(e,panel)});element.addEventListener('change',e=>{e.stopPropagation();onChange?.(e,panel)});element.addEventListener('input',e=>{e.stopPropagation();onInput?.(e,panel)});element.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();panel.close();anchor?.focus();}});
  if(focus)element.querySelector('input,button,select')?.focus({preventScroll:true});return panel;
 }
 /* A field picker can be mounted anywhere, or hosted in pick()'s shared popover.
    Callers supply eligible fields, report usage and selection callbacks. */
 function pickerHTML({fields=[],used=[],selected=[],multi=false,includeUsed=true,allowGroups=false,searchLabel='Search fields…',extraHTML=''}={}){
  const row=f=>'<button type="button" class="field-pick-row" data-pick-field="'+esc(f.field)+'" data-search="'+esc((f.label+' '+f.field+' '+(window.NetherLedger?.schema()[f.model]?.name||f.model||'')).toLowerCase())+'" aria-pressed="'+selected.includes(f.field)+'"><span class="field-type">'+symbol(f)+'</span><span>'+esc(f.label)+'</span>'+(multi?'<span class="field-pick-check">'+(selected.includes(f.field)?'✓':'')+'</span>':'')+'</button>';
  const models=[...new Set(fields.filter(f=>f.kind==='dimension').map(f=>f.model))];
  const group=(title,list,isOpen=false,id='',icon='')=>'<details class="field-pick-group"'+(isOpen?' open':'')+'><summary>'+icon+'<span>'+esc(title)+'</span>'+(allowGroups&&id?'<button type="button" data-pick-model="'+esc(id)+'" aria-label="Select all '+esc(title)+' fields">+</button>':'')+'</summary>'+list.map(row).join('')+'</details>';
  const allGroups=(fields.some(f=>f.kind!=='dimension')?group('Metrics',fields.filter(f=>f.kind!=='dimension'),false,'',icons.metric):'')+models.map(model=>group(window.NetherLedger?.schema()[model]?.name||model,fields.filter(f=>f.model===model),false,model,icons.model)).join('');
  const usedRows=fields.filter(f=>used.includes(f.field)).map(row).join('');
  return '<input class="analytic-search" type="search" placeholder="'+esc(searchLabel)+'" aria-label="'+esc(searchLabel)+'">'+(includeUsed?'<details class="field-pick-section" data-field-section="used"><summary>Used in this report</summary><div class="field-pick-items">'+usedRows+'<p class="analytic-empty" data-field-empty'+(usedRows?' hidden':'')+'>No fields selected in this report.</p></div></details>':'')+'<details class="field-pick-section" data-field-section="all"><summary>All fields</summary><div class="field-all-groups">'+allGroups+'<p class="analytic-empty" data-field-empty'+(fields.length?' hidden':'')+'>No fields available.</p></div></details>'+(extraHTML?'<div class="field-picker-actions">'+extraHTML+'</div>':'');
 }
 function createPicker({fields=[],used=[],selected=[],multi=false,includeUsed=true,allowGroups=false,searchLabel,extraHTML,onPick,onPickModel,onExtra,onResize=()=>{}}={}){
  const element=document.createElement('div');element.className='field-picker';element.dataset.fieldPicker='';element.innerHTML=pickerHTML({fields,used,selected,multi,includeUsed,allowGroups,searchLabel,extraHTML});
  const chosen=new Set(selected),groups=[...element.querySelectorAll('details')];let beforeSearch=null;
  function setSelected(values){chosen.clear();values.forEach(v=>chosen.add(v));element.querySelectorAll('[data-pick-field]').forEach(row=>{const active=chosen.has(row.dataset.pickField);row.setAttribute('aria-pressed',active);const check=row.querySelector('.field-pick-check');if(check)check.textContent=active?'✓':'';});}
  element.addEventListener('click',e=>{const row=e.target.closest('[data-pick-field]'),model=e.target.closest('[data-pick-model]');if(model){e.preventDefault();const id=model.dataset.pickModel;if(multi)setSelected([...new Set([...chosen,...fields.filter(f=>f.model===id).map(f=>f.field)])]);onPickModel?.(id,[...chosen]);return;}if(!row){onExtra?.(e);return;}const field=fields.find(f=>f.field===row.dataset.pickField);setSelected(multi?(chosen.has(field.field)?[...chosen].filter(id=>id!==field.field):[...chosen,field.field]):[field.field]);onPick?.(field,[...chosen]);});
  element.addEventListener('input',e=>{if(!e.target.matches('.analytic-search'))return;const query=e.target.value.trim().toLowerCase();if(query&&!beforeSearch)beforeSearch=new Map(groups.map(g=>[g,g.open]));element.querySelectorAll('[data-search]').forEach(row=>row.hidden=!!query&&!row.dataset.search.includes(query));
   for(const group of groups.filter(g=>g.classList.contains('field-pick-group'))){group.hidden=!!query&&![...group.querySelectorAll('[data-search]')].some(r=>!r.hidden);if(query&&!group.hidden)group.open=true;}
   element.querySelectorAll('[data-field-section]').forEach(section=>{const hasRows=[...section.querySelectorAll('[data-search]')].some(r=>!r.hidden),empty=section.querySelector('[data-field-empty]');empty.hidden=hasRows;empty.textContent=query?'No matching fields.':section.dataset.fieldSection==='used'?'No fields selected in this report.':'No fields available.';if(query)section.open=true;});
   if(!query&&beforeSearch){beforeSearch.forEach((isOpen,g)=>g.open=isOpen);beforeSearch=null;}onResize();
  });
  element.addEventListener('toggle',onResize,true);
  return {element,setSelected,get selected(){return [...chosen]}};
 }
 function pick({anchor,title='Select a field',header=false,side=false,onPick,onExtra,...options}={}){
  const popup=open({anchor,title,header,side,width:350,focus:false});const picker=createPicker({...options,onResize:()=>place(popup),onPick(field,selected){if(!options.multi)popup.close();onPick?.(field,selected);},onExtra:e=>onExtra?.(e,popup)});
  popup.element.querySelector('.analytic-pop-body').append(picker.element);popup.picker=picker;place(popup);picker.element.querySelector('.analytic-search').focus({preventScroll:true});return popup;
 }
 // Compatibility for report callers: every field selection uses the same component.
 const reportPicker=options=>pick(options);
 function hideInfo(){clearTimeout(infoTimer);infoPanel?.remove();infoPanel=null;}
 function info(anchor,field){hideInfo();if(stack.length)return;infoTimer=setTimeout(()=>{if(!anchor.isConnected)return;const note=field.kind==='dimension'?(NetherNotes.fieldInfo?.(field.model,field.field.split('.').pop())||{description:NetherNotes.field(field.model,field.field.split('.').pop()),definition:field.field}):NetherNotes.metric(field.field);const content=field.spec||note;infoPanel=document.createElement('aside');infoPanel.className='analytic-pop field-info';infoPanel.setAttribute('role','tooltip');infoPanel.innerHTML='<h3><span>'+symbol(field)+'</span> '+esc(field.label)+'</h3><p class="field-info-kind">'+(field.kind==='dimension'?'Dimension':'Metric')+'</p><hr><h4>Definition</h4><p>'+esc(field.field)+'</p><p>'+esc(field.type==='number'?'Number':/date/.test(field.type)?'Date · dd.mm.yyy BC':'Text')+'</p>'+(content.description?'<p>'+esc(content.description)+'</p>':'')+'<code>'+esc(content.definition||field.definition||field.field)+'</code>';(anchor.closest('dialog[open]')||document.body).append(infoPanel);place({element:infoPanel,anchor,width:380,side:true});},320);}
 /* Portaled dropdown options belong to their editor. The event path survives
    an option changing the form, so that redraw cannot become an outside click. */
 const insidePopup=e=>e.composedPath().some(el=>el.matches?.('[data-analytic-popup]')||el.matches?.('.ui-select-pop')&&stack.some(p=>p.element===el.uiSelectOwner||p.element.contains(el.uiSelectOwner)));
 /* A click elsewhere closes the popovers, but not an editor (sticky) with work in it: only its own menus close. */
 document.addEventListener('pointerdown',e=>{if(insidePopup(e)||e.target.closest('[data-field-more]')||[...stack].reverse().some(p=>p.onOutside))return;const keep=stack.findIndex(p=>p.sticky);closeFrom(keep<0?0:keep+1);},true);
 document.addEventListener('click',e=>{if(insidePopup(e))return;const panel=[...stack].reverse().find(p=>p.onOutside);if(panel&&!e.composedPath().includes(panel.anchor))queueMicrotask(()=>{if(stack.includes(panel))panel.onOutside();});});
 addEventListener('resize',()=>{for(const p of stack)place(p);hideInfo();});
 document.addEventListener('scroll',e=>{if(!e.target.closest?.('[data-analytic-popup]')&&!e.target.closest?.('.field-info'))hideInfo();},true);
 return {esc,symbol,icons,open,pick,reportPicker,createPicker,pickerHTML,info,hideInfo,close:closeFrom};
})();
