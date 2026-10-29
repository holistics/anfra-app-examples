/* The completion choice is a place in the story, not another soul in the queue. */
window.NetherFinaleStage=(()=>{
 'use strict';
 const root=document.querySelector('#finale-stage');
 const judge=()=>window.NetherItemArt.judge();
 const sky=`<div class="fs-sky" aria-hidden="true"><div class="fs-sun"></div><div class="fs-cloud fs-cloud-a"></div><div class="fs-cloud fs-cloud-b"></div><div class="fs-hills fs-hills-far"></div><div class="fs-hills fs-hills-near"></div><div class="fs-waterfall"></div><div class="fs-pool"></div><div class="fs-meadow"></div><div class="fs-tree fs-tree-left"></div><div class="fs-tree fs-tree-right"></div><div class="fs-path"></div><div class="fs-flowers"></div><div class="fs-pavilion"><i></i><i></i><i></i><i></i><i></i></div></div>`;
 const court=`<div class="fs-court" aria-hidden="true"><div class="fs-columns"><i></i><i></i><i></i><i></i></div><div class="fs-steps"></div></div>`;
 const ticket=(type,label)=>`<div class="fs-ticket fs-ticket-${type}" role="img" aria-label="${label}"><span>THE COURT OF JUDGEMENT</span><strong>${label}</strong><small>${type==='gold'?'One passage to Elysium':'One question may be asked again'}</small><i>✦</i></div>`;
 function card(speaker,text,buttons,portrait='judge'){
  return `<div class="fs-dialogue"><div class="fs-portrait ${portrait==='orpheus'?'fs-orpheus':''}">${portrait==='judge'?judge():'<span aria-hidden="true">♫</span>'}</div><div class="fs-copy"><small>${speaker}</small><p>${text}</p><div class="fs-actions">${buttons}</div></div></div>`;
 }
 function button(action,label,secondary=false){return `<button type="button" data-finale-action="${action}" class="fs-button${secondary?' fs-button-secondary':''}">${label}</button>`;}
 function show(scene){
  root.hidden=false;if(!root.open)root.showModal();root.dataset.scene=scene;
  if(scene==='outside')root.innerHTML=`${court}<div class="fs-scene-title">Outside the Court of Judgement</div>${ticket('gold','GOLDEN TICKET')}${card('MINOS','You have finished the work set before you. The court is grateful. This golden ticket grants you passage to Elysium.',button('elysium','Look toward Elysium →'))}`;
  if(scene==='elysium')root.innerHTML=`${sky}<div class="fs-scene-title fs-scene-title-light">Elysium · the blessed fields</div>${ticket('gold','GOLDEN TICKET')}${card('MINOS','Beyond the river there is sun, music, and a place to rest. The ticket is yours. Will you stay in Elysium, or continue your work?',button('stay','Stay in Elysium')+button('continue','Continue working',true))}`;
  if(scene==='stayed')root.innerHTML=`${sky}<div class="fs-scene-title fs-scene-title-light">Elysium</div><div class="fs-ending"><span>THE END</span><h1>A place in the sun</h1><p>You take the golden ticket. The fields are warm, the water is clear, and for once no soul waits for your answer.</p>${button('service','Record of service')}</div>`;
  if(scene==='hall')root.innerHTML=`${court}<div class="fs-scene-title">Inside the Court of Judgement</div><div class="fs-hall-soul fs-orpheus"><div class="fs-soul-halo"></div><div class="fs-orpheus-portrait">${window.NetherWikiArt.portrait('orpheus')}</div><div class="fs-lyre">${window.NetherItemArt.svg('lyre','A weathered lyre')}</div><span>ORPHEUS</span></div><div class="fs-blank-paper"><small>PASSAGE PAPER</small><strong>Name <i></i></strong><strong>Occupation <i></i></strong><strong>Relationship <i></i></strong><span>No other papers.</span></div>${card('MINOS','You chose to continue. This is Orpheus, with only a blank passage paper. Fill the petition from the evidence you have gathered.',button('petition','Fill in the petition'), 'judge')}`;
  if(scene==='reunited')root.innerHTML=`${court}<div class="fs-scene-title">Inside the Court of Judgement</div><div class="fs-hall-soul fs-orpheus"><div class="fs-soul-halo"></div><div class="fs-orpheus-portrait">${window.NetherWikiArt.portrait('orpheus')}</div><div class="fs-lyre">${window.NetherItemArt.svg('lyre','A weathered lyre')}</div><span>ORPHEUS</span></div><div class="fs-blank-paper fs-paper-filed"><small>PASSAGE PAPER · FILED</small><strong>Name <b>Orpheus</b></strong><strong>Occupation <b>Musician &amp; poet</b></strong><strong>Relationship <b>Husband</b></strong><span>Minos sets the record in the Book.</span></div>${card('MINOS','The Books agree. Orpheus has his name again. You may both leave the court together.',button('service','Record of service'), 'judge')}`;
 }
 async function travel(scene){
  if(root.classList.contains('fs-blinking'))return;
  root.classList.add('fs-blinking');
  await new Promise(resolve=>setTimeout(resolve,220));
  show(scene);
  root.classList.add('fs-blinking');
  await new Promise(resolve=>setTimeout(resolve,90));
  root.classList.remove('fs-blinking');
 }
 root.addEventListener('click',event=>{
  const action=event.target.closest('[data-finale-action]')?.dataset.finaleAction;
  if(root.classList.contains('fs-blinking'))return;
  if(action==='elysium')travel('elysium');
  if(action==='stay')show('stayed');
  if(action==='continue')travel('hall').then(()=>root.dispatchEvent(new CustomEvent('nether:finale-continue',{bubbles:true})));
  if(action==='inventory')root.dispatchEvent(new CustomEvent('nether:finale-inventory',{bubbles:true}));
  if(action==='petition')root.dispatchEvent(new CustomEvent('nether:open-petition',{bubbles:true}));
  if(action==='service')root.dispatchEvent(new CustomEvent('nether:finale-service',{bubbles:true}));
 });
 root.addEventListener('cancel',event=>event.preventDefault());
 return {show,get scene(){return root.dataset.scene}};
})();
