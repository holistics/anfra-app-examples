/* Shop, bag and home use the same item catalogue and economy transitions. */
window.createPossessionRooms=function({go,toast,refreshHeader,puppySVG}){
 const E=window.NetherEconomy,I=window.NetherItems,A=window.NetherItemArt,$=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let shopItem='blood',bagItem=null,placing=null,selected=null,dragged=null,lastDragSide=null,room='map',lastGift=null;
 const bag=$('#inventory-dialog'),bagButton=$('#inventory-toggle');let reactionTimer,reacting=null,audioContext,voices=[],muted=true;
 const art=item=>A.svg(item.art,item.name),button=(action,label,extra='')=>'<button data-room-action="'+action+'" '+extra+'>'+label+'</button>';
 const light='<span class="light-orb" aria-label="light balls"></span>';
 const lock='<svg class="small-lock" viewBox="0 0 20 22" aria-hidden="true"><path d="M5 9V6a5 5 0 0110 0v3M3 9h14v11H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 13v3" stroke="currentColor"/></svg>';
 function story(item){return E.state.recordStories[item.id]||item.story||'The river has left marks on this object. Its story is waiting to be pieced together.';}
 function detail(item,{owned=false,inventory=false}={}){if(!item)return '<div class="item-detail empty-item"><p>Your bag is empty.</p></div>';
  return '<div class="item-detail" data-item="'+item.id+'"><div class="item-detail-art">'+art(item)+'</div><div class="item-detail-copy"><h2>'+item.name+'</h2><p>'+(owned?esc(story(item)):esc(item.teaser))+'</p>'
   +(item.id==='blood'?'<p class="item-effect">'+(owned?'Use one bottle: ':'')+'+10 clarity'+(!owned?' · '+E.priceOf(item.id)+' light balls':'')+'</p>':'')
   +(!owned&&item.id!=='blood'?'<p class="story-locked">'+lock+' Buy to unlock story</p>':'')
   +(inventory?button(item.id==='blood'?'use':item.id==='petition'?'open-petition':item.kind==='quest'?'read-ticket':'organize',item.id==='blood'?'Use':item.id==='petition'?'Fill petition':item.kind==='quest'?'Keep ticket':'Organize','class="room-button nui-btn nui-btn--primary" data-item="'+item.id+'"'):'')+'</div></div>';
 }
 function background(){return '<div class="shop-backdrop" aria-hidden="true">'+Array.from({length:4},(_,s)=>'<div class="background-cupboard">'+Array.from({length:4},(_,row)=>'<div>'+Array.from({length:7},(_,j)=>'<span class="background-object" style="--object-tone:'+['#687e69','#8e8263','#967b71','#707c8d'][(s+row+j)%4]+'">'+A.svg(['blood','song','keepsake','comb','flower'][(s+row+j)%5])+'</span>').join('')+'</div>').join('')+'</div>').join('')+'<i class="background-candle candle-a"></i><i class="background-candle candle-b"></i></div>';}
 /* The shelf price. When the keeper's price has moved, the old one is struck through and the new one sits on a tag:
    green if it fell, red if it rose. */
 function priceHTML(item){
  const trend=item.id==='blood'?E.priceTrend():null;
  if(trend)return '<span class="stock-price stock-price--moved" aria-label="Was '+trend.was+', now '+trend.now+' light balls">'+light+' <s class="price-was">'+trend.was+'</s><span class="price-tag price-tag--'+trend.dir+'">'+trend.now+'</span></span>';
  return '<span class="stock-price">'+light+' '+E.priceOf(item.id)+(item.gift?' <small>Gift</small>':'')+'</span>';
 }
 function renderShop(){const stock=E.stock();if(!stock.some(item=>item.id===shopItem))shopItem=stock[0]?.id;const item=I.get(shopItem);
  $('#shop-screen').innerHTML=background()+'<section class="shop-keeper" data-anfra-block="v4-shopkeeper" data-anfra-label="Shopkeeper and dialogue"><div class="keeper-portrait">'+A.keeper()+'</div><div class="keeper-counter"></div>'+'</section>'
   +'<section class="shop-trade" data-anfra-container="v4-shop-stock" data-anfra-label="Shop shelves and selected item"><div class="shop-trade-title"><h1>Shop</h1><span>'+light+' '+E.state.light+'</span></div><div class="shop-trade-body"><div class="shop-shelf wood-shelf" role="group" aria-label="Items for sale">'
   +stock.map(item=>'<button class="stock-card '+(item.id===shopItem?'selected':'')+'" data-room-action="select-shop" data-item="'+item.id+'" aria-pressed="'+(item.id===shopItem)+'"><span class="stock-art">'+art(item)+'</span><strong>'+item.name+'</strong>'+priceHTML(item)+'</button>').join('')
   +'</div><section class="shop-item-preview" aria-label="Selected item">'+detail(item)+'</section></div><footer class="shop-purchase">'+button('buy',item?.gift?'Take':'Buy','class="room-button purchase-button nui-btn nui-btn--primary" data-item="'+(item?.id||'')+'" '+(!item||E.state.light<E.priceOf(item.id)?'disabled':''))+'</footer></section>';
 }
 function ownedInBag(){return I.all.filter(item=>E.state.inventory[item.id]>0);}
 function renderBag(){const items=ownedInBag();if(!items.some(item=>item.id===bagItem))bagItem=items[0]?.id;const item=I.get(bagItem);
  bag.innerHTML=NetherUI.modal.html({title:'Inventory',titleId:'inventory-title',closeAttrs:'data-room-action="close-bag" aria-label="Close inventory"',body:'<div class="inventory-body"><div class="inventory-grid wood-shelf" role="group" aria-label="Inventory items">'
   +items.map(item=>'<button class="inventory-cell '+(item.id===bagItem?'selected':'')+'" data-room-action="select-bag" data-item="'+item.id+'" aria-label="'+item.name+', quantity '+E.state.inventory[item.id]+'" aria-pressed="'+(item.id===bagItem)+'">'+art(item)+'<span class="item-quantity">×'+E.state.inventory[item.id]+'</span></button>').join('')
   +Array.from({length:Math.max(0,20-items.length)},()=>'<div class="inventory-cell is-empty" aria-hidden="true"></div>').join('')+'</div><section class="inventory-detail" aria-label="Item information">'+detail(item,{owned:true,inventory:true})+'</section></div>'});
 }
 function openBag(id){bagItem=id||ownedInBag()[0]?.id;renderBag();if(!bag.open)bag.showModal();}
 function canPlace(side){return !placing||E.fits(placing,side);}
 function renderShelf(side){return '<section class="memory-bookcase '+(!canPlace(side)?'shelf-unavailable':'')+'" data-shelf="'+side+'" aria-label="'+(side==='left'?'Left shelf · Lyre':'Right shelf · Wooden chime')+'"><header><span>'+ (side==='left'?'I':'II')+'</span></header><div class="memory-grid">'
  +E.state.shelves[side].map((id,index)=>{const item=I.get(id);return '<button class="memory-cell '+(placing&&!id&&canPlace(side)?'placement-target':'')+' '+(id===selected?.id?'selected':'')+' '+(item?.id===reacting?'resonating':'')+'" data-room-action="shelf-cell" data-side="'+side+'" data-cell="'+index+'" '+(item?'draggable="false" data-item="'+id+'"':'')+' aria-label="'+(item?item.name:'Empty cell '+(index+1))+'" '+(!canPlace(side)?'disabled':'')+'>'+(item?art(item):'<i></i>')+(item?.id===reacting?'<span class="music-note note-one" aria-hidden="true">♪</span><span class="music-note note-two" aria-hidden="true">♫</span><span class="music-note note-three" aria-hidden="true">♪</span>':'')+'</button>';}).join('')+'</div><div class="bookcase-foot"></div></section>';}
 function renderHome(){const item=selected&&I.get(selected.id);
  $('#home-screen').innerHTML='<section class="home-shelves" data-anfra-container="v4-memory-shelves" data-anfra-label="Two memory shelves"><header class="home-room-heading"><h1>Home</h1>'+(placing?'<div class="placement-instruction"><span>Place '+esc(I.get(placing).name)+(I.get(placing).shelf?' on the '+I.get(placing).shelf+' shelf':' in an empty cell')+'</span>'+button('cancel-place','Cancel')+'</div>':'')+'</header><div class="home-bookcases">'+renderShelf('left')+renderShelf('right')+'</div></section>'
   +'<aside class="home-hearth-side '+(item?'showing-memory':'')+'" data-anfra-block="v4-home-hearth" data-anfra-label="Fireplace, Cerberus and memory details"><div class="hearth-setting"><div class="hearth-stone"><div class="hearth-opening"><div class="fire"><i></i><i></i><i></i></div><div class="hearth-logs"></div></div><div class="hearth-mantel"></div></div><div class="hearth-rug"></div><button id="puppy" class="puppy" data-room-action="pet" aria-label="Pet Cerberus">'+puppySVG()+'</button>'
   +(lastGift?'<button class="cerberus-gift" data-room-action="gift" data-item="'+lastGift.id+'">'+art(lastGift)+'<span>Cerberus brought<br><b>'+lastGift.name+'</b></span></button>':'')+'</div>'
   +(item?'<section class="home-memory-detail" aria-label="Memory information">'+button('close-memory','×','class="memory-detail-close" aria-label="Close item information"')+detail(item,{owned:true})+'</section>':'')+'</aside>';
 }
 function refresh(){const count=Object.values(E.state.inventory).reduce((sum,value)=>sum+value,0);$('#inventory-count').textContent=count;bagButton.setAttribute('aria-label','Inventory, '+count+' item'+(count===1?'':'s'));refreshHeader();if(room==='shop')renderShop();if(room==='home')renderHome();if(bag.open)renderBag();}
 function instrumentFor(owner){return owner==='Orpheus'?'lyre':owner==='Eurydice'?'chime':null;}
 function sound(id){
  if(muted)return;
  try{audioContext||=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume().catch(()=>{});for(const voice of voices){try{voice.stop();}catch{}}voices=[];
   const t=audioContext.currentTime,notes=id==='lyre'?[220,277.18,329.63,440]:[523.25,659.25,783.99];
   notes.forEach((freq,index)=>{const start=t+index*.22,osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=id==='lyre'?'triangle':'sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(id==='lyre'?.045:.035,start+.018);gain.gain.exponentialRampToValueAtTime(.0001,t+2.95);osc.connect(gain);gain.connect(audioContext.destination);osc.start(start);osc.stop(t+3);voices.push(osc);});
  }catch{/* Visual feedback remains available without audio. */}
 }
 function react(owner){const id=instrumentFor(owner),side=id==='lyre'?'left':'right';if(room!=='home'||!id||!E.state.shelves[side].includes(id))return;reacting=id;clearTimeout(reactionTimer);sound(id);renderHome();reactionTimer=setTimeout(()=>{reacting=null;if(room==='home')renderHome();},3000);}
 function inspect(item){if(item?.owner)react(item.owner);}
 function flyToBag(item,source){if(matchMedia('(prefers-reduced-motion: reduce)').matches||!source||!bagButton.offsetParent)return;const r=source.getBoundingClientRect(),target=bagButton.getBoundingClientRect(),ghost=document.createElement('div');ghost.className='purchase-flight';ghost.innerHTML=art(item);ghost.style.left=r.left+r.width/2-35+'px';ghost.style.top=r.top+r.height/2-35+'px';document.body.appendChild(ghost);
  const dx=target.left+target.width/2-(r.left+r.width/2),dy=target.top+target.height/2-(r.top+r.height/2);ghost.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate('+dx*.35+'px,'+(Math.min(-80,dy*.35)-70)+'px) scale(1.15)',opacity:1,offset:.35},{transform:'translate('+dx+'px,'+dy+'px) scale(.25)',opacity:.2}],{duration:850,easing:'cubic-bezier(.4,0,.2,1)'}).finished.then(()=>{ghost.remove();bagButton.animate([{transform:'scale(1)'},{transform:'scale(1.14)'},{transform:'scale(1)'}],{duration:300});}).catch(()=>ghost.remove());
 }
 function buy(id){const item=I.get(id),source=$('.stock-card[data-item="'+id+'"] .stock-art');if(!item)return;
  const bounds=source?.getBoundingClientRect(),result=E.buy(id);if(!result.ok){toast(result.why);return;}if(bounds){const anchor=document.createElement('span');anchor.style.cssText='position:fixed;left:'+bounds.left+'px;top:'+bounds.top+'px;width:'+bounds.width+'px;height:'+bounds.height+'px;pointer-events:none';document.body.appendChild(anchor);flyToBag(item,anchor);anchor.remove();}refresh();
 }
 // Actions are independent of the workstation's data-action event handlers.
 document.addEventListener('click',event=>{const el=event.target.closest('[data-room-action]');if(!el||el.disabled)return;const action=el.dataset.roomAction,id=el.dataset.item,item=I.get(id);
  if(action==='inventory'){openBag();return;}if(action==='close-bag'){bag.close();return;}
  if(action==='select-shop'){shopItem=id;renderShop();return;}if(action==='buy'){buy(id);return;}
  if(action==='select-bag'){bagItem=id;renderBag();inspect(item);return;}
  if(action==='use'){const result=E.use(id);toast(result.why);refresh();return;}
  if(action==='open-petition'){bag.close();document.dispatchEvent(new CustomEvent('nether:open-petition'));return;}
  if(action==='read-ticket'){toast('A place in Elysium is yours if you choose to stay.');return;}
  if(action==='organize'){if(!item||!(E.state.inventory[id]>0))return;clearTimeout(reactionTimer);reacting=null;for(const voice of voices){try{voice.stop();}catch{}}placing=id;selected=null;bag.close();go('home');return;}
  if(action==='cancel-place'){placing=null;renderHome();return;}
  if(action==='shelf-cell'){const side=el.dataset.side,index=Number(el.dataset.cell),id=E.state.shelves[side][index];
   if(placing){const placed=placing,result=E.place(placed,side,index);if(!result.ok){toast(result.why);return;}placing=null;selected={id:placed,side,index};refresh();if((I.get(placed).owner==='Orpheus'&&side==='left')||(I.get(placed).owner==='Eurydice'&&side==='right'))react(I.get(placed).owner);return;}
   if(id){selected={id,side,index};renderHome();inspect(I.get(id));if(matchMedia('(max-width:750px)').matches)requestAnimationFrame(()=>$('.home-memory-detail')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}));}return;
  }
  if(action==='close-memory'){selected=null;renderHome();return;}
  if(action==='pet'){el.classList.remove('petted');requestAnimationFrame(()=>el.classList.add('petted'));return;}
  if(action==='gift'){lastGift=null;openBag(id);renderHome();return;}
 });
 let pointerCandidate=null,dragGhost=null,suppressClickUntil=0;
 document.addEventListener('click',event=>{if(performance.now()<suppressClickUntil&&event.target.closest('.memory-cell')){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('pointerdown',event=>{const cell=event.target.closest('.memory-cell[data-item]');if(!cell||event.button!==0||placing)return;pointerCandidate={side:cell.dataset.side,index:Number(cell.dataset.cell),id:cell.dataset.item,x:event.clientX,y:event.clientY,pointerId:event.pointerId,element:cell};cell.setPointerCapture(event.pointerId);});
 document.addEventListener('pointermove',event=>{
  const candidate=pointerCandidate;if(!candidate||candidate.pointerId!==event.pointerId)return;
  if(!dragged&&Math.hypot(event.clientX-candidate.x,event.clientY-candidate.y)<7)return;
  event.preventDefault();if(!dragged){dragged=candidate;lastDragSide=null;document.body.classList.add('moving-memory');dragGhost=document.createElement('div');dragGhost.className='memory-drag-ghost';dragGhost.innerHTML=art(I.get(dragged.id));document.body.appendChild(dragGhost);for(const shelf of document.querySelectorAll('.memory-bookcase'))shelf.classList.toggle('shelf-unavailable',!E.fits(dragged.id,shelf.dataset.shelf));}
  dragGhost.style.left=event.clientX-38+'px';dragGhost.style.top=event.clientY-38+'px';
  const cell=document.elementFromPoint(event.clientX,event.clientY)?.closest('.memory-cell');document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
  if(!cell||!E.fits(dragged.id,cell.dataset.side))return;cell.classList.add('drop-target');const side=cell.dataset.side,item=I.get(dragged.id);if(side!==lastDragSide){lastDragSide=side;if((item.owner==='Orpheus'&&side==='left')||(item.owner==='Eurydice'&&side==='right'))reactDuringDrag(item.owner);}
 });
 function reactDuringDrag(owner){const id=instrumentFor(owner),side=id==='lyre'?'left':'right';if(!id||!E.state.shelves[side].includes(id))return;reacting=id;sound(id);const instrument=document.querySelector('.memory-cell[data-item="'+id+'"]');instrument?.classList.add('resonating');if(instrument&&!instrument.querySelector('.music-note'))instrument.insertAdjacentHTML('beforeend','<span class="music-note note-one">♪</span><span class="music-note note-two">♫</span>');clearTimeout(reactionTimer);reactionTimer=setTimeout(()=>{reacting=null;if(!dragged&&room==='home')renderHome();},3000);}
 function endMove(event,cancelled=false){
  const candidate=pointerCandidate;if(!candidate||candidate.pointerId!==event.pointerId)return;pointerCandidate=null;try{candidate.element.releasePointerCapture(event.pointerId);}catch{}
  if(!dragged)return;const from=dragged,cell=cancelled?null:document.elementFromPoint(event.clientX,event.clientY)?.closest('.memory-cell');dragged=null;dragGhost?.remove();dragGhost=null;document.body.classList.remove('moving-memory');suppressClickUntil=performance.now()+180;
  if(!cell){renderHome();return;}const side=cell.dataset.side,index=Number(cell.dataset.cell),result=E.move(from.side,from.index,side,index);
  if(!result.ok){toast(result.why);renderHome();return;}selected={id:from.id,side,index};refresh();const owner=I.get(from.id).owner;if((owner==='Orpheus'&&side==='left')||(owner==='Eurydice'&&side==='right'))react(owner);
 }
 document.addEventListener('pointerup',event=>endMove(event));document.addEventListener('pointercancel',event=>endMove(event,true));
 bag.addEventListener('click',event=>{if(event.target===bag)bag.close();});
 bagButton.innerHTML='<svg viewBox="0 0 32 28" aria-hidden="true"><path d="M10 9V7Q16 1 22 7V9M7 9H25L27 25H5Z"/><path d="M12 14V18M20 14V18"/></svg><small>Inventory</small><b id="inventory-count">0</b>';
 return {mute(value){muted=!!value;if(muted)for(const voice of voices){try{voice.stop();}catch{}}},enter(next){room=next;if(next!=='home'){placing=null;selected=null;}if(next==='home'){const gift=E.visitHome();if(gift){lastGift=gift;toast('Cerberus brought you '+gift.name+'.');}}refresh();},refresh,openBag,selectShop(id){shopItem=id;if(room==='shop')renderShop();},get shopItem(){return shopItem;},get placing(){return placing;},get reacting(){return reacting;}};
};
