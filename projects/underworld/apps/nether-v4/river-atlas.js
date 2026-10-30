/* An ink chart of the three landings. All navigation stays in the live game. */
window.createRiverAtlas=function(world){
 const toggle=document.querySelector('#river-atlas-toggle'),dialog=document.querySelector('#river-atlas');
 if(!toggle||!dialog)return;
 const tree='<path d="M0 -17L-7 -3H-4L-10 7H-2V13H2V7H10L4 -3H7Z"/>',
 house='<path d="M-13 0L0 -12L13 0M-10 -1V12H10V-1M-2 12V5H3V12"/>',
 peak='<path d="M-37 23L-5 -31L10 -11L21 -23L47 23M-5 -31L-8 -1L1 -7L10 8M21 -23L18 1L25 -3L36 15"/>',
 boat='<path d="M-23 1H25L15 12H-12ZM0 0V-29L19 -8H0M-28 18Q-15 13-3 18T22 18"/>';
 const trees=(points)=>points.map(([x,y,s=1])=>`<use href="#atlas-cypress" transform="translate(${x} ${y}) scale(${s})"/>`).join('');
 const houses=(points)=>points.map(([x,y,s=1])=>`<use href="#atlas-house" transform="translate(${x} ${y}) scale(${s})"/>`).join('');
 dialog.innerHTML=NetherUI.modal.html({title:'Map',closeClass:'atlas-close',closeAttrs:'aria-label="Close map"',body:`<svg class="atlas-drawing" viewBox="0 0 1000 650" aria-label="Map of the three islands">
   <defs>
    <g id="atlas-cypress" fill="#66563d" stroke="#4c3c2d" stroke-width="1.2" stroke-linejoin="round">${tree}</g>
    <g id="atlas-house" fill="#b9a27a" stroke="#4c3c2d" stroke-width="2" stroke-linejoin="round">${house}</g>
    <g id="atlas-peak" fill="none" stroke="#4c3c2d" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">${peak}</g>
    <g id="atlas-boat" fill="#bda57b" stroke="#4c3c2d" stroke-width="2" stroke-linejoin="round">${boat}</g>
    <pattern id="atlas-water" width="91" height="71" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)"><path d="M13 35q7 -8 14 0t14 0m-11 6q7 -7 14 0t14 0" fill="none" stroke="#77603d" stroke-width="1.1" opacity=".22"/></pattern>
    <pattern id="atlas-grid" width="125" height="125" patternUnits="userSpaceOnUse"><path d="M125 0H0V125" fill="none" stroke="#795d37" stroke-width=".6" opacity=".22"/></pattern>
    <pattern id="atlas-grain" width="4" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".4" fill="#4b361d" opacity=".2"/></pattern>
   </defs>
   <rect x="22" y="16" width="956" height="601" fill="url(#atlas-grid)"/>
   <rect x="22" y="16" width="956" height="601" fill="url(#atlas-water)"/>
   <rect x="22" y="16" width="956" height="601" fill="url(#atlas-grain)"/>
   <g class="atlas-route"><path d="M238 422Q145 325 262 257M365 489Q524 576 632 450M441 218Q636 200 702 283"/><circle cx="238" cy="422" r="4"/><circle cx="365" cy="489" r="4"/><circle cx="441" cy="218" r="4"/></g>
   <g class="atlas-island" data-island-target="marsh" role="button" tabindex="0" aria-label="Visit Court of Judgement" transform="translate(300 193)">
    <path class="atlas-coast-outer" d="M-127 -15L-119 -45L-89 -51L-75 -74L-42 -64L-15 -81L12 -67L43 -75L67 -50L107 -47L124 -22L108 0L126 22L99 43L66 42L42 65L7 58L-19 73L-49 54L-83 60L-98 34L-128 22L-116 3Z"/>
    <path class="atlas-coast" d="M-127 -15L-119 -45L-89 -51L-75 -74L-42 -64L-15 -81L12 -67L43 -75L67 -50L107 -47L124 -22L108 0L126 22L99 43L66 42L42 65L7 58L-19 73L-49 54L-83 60L-98 34L-128 22L-116 3Z"/>
    <use href="#atlas-peak" transform="translate(-65 -24) scale(.65)"/><use href="#atlas-peak" transform="translate(64 -27) scale(.75)"/>
    <g class="atlas-ink"><path d="M-64 34H64V40H-64ZM-51 -9H51L0 -39ZM-54 -5H54V2H-54ZM-48 3V32H-41V3M41 3V32H48V3M-70 30V-20H-56V30M56 30V-20H70V30M-73 -20H-53M53 -20H73"/>
    <path d="M-26 33V7H-20V33M-3 33V7H3V33M20 33V7H26V33"/></g>
    <path class="atlas-dock" d="M-23 61V88H-8V61M-23 68H-8M-23 77H-8"/>
    <text class="atlas-locked-icon" x="0" y="-103" text-anchor="middle" aria-hidden="true">&#128274;</text><text class="atlas-island-number" x="0" y="-105">III</text><text class="atlas-place-name" x="0" y="-82">Court of Judgement</text>
    <g class="atlas-here" transform="translate(94 -61)"><circle r="14"/><circle r="4"/></g>
   </g>
   <g class="atlas-island" data-island-target="ferry" role="button" tabindex="0" aria-label="Visit Charon’s Ferry" transform="translate(247 453)">
    <path class="atlas-coast-outer" d="M-113 -22L-108 -51L-73 -66L-42 -59L-18 -77L18 -65L49 -72L68 -55L103 -45L111 -17L102 7L118 29L92 50L54 48L28 68L-5 60L-36 74L-60 53L-95 48L-115 23L-105 3Z"/>
    <path class="atlas-coast" d="M-113 -22L-108 -51L-73 -66L-42 -59L-18 -77L18 -65L49 -72L68 -55L103 -45L111 -17L102 7L118 29L92 50L54 48L28 68L-5 60L-36 74L-60 53L-95 48L-115 23L-105 3Z"/>
    ${trees([[-75,-24],[-49,-40],[-25,-46],[55,-30],[74,-5],[79,25],[-70,17]])}
    <g class="atlas-ink" transform="translate(-3 3)"><path d="M-33 19H33V25H-33ZM-28 -18H28L0 -40ZM-31 -13H31V-6H-31ZM-24 -5V18H-17V-5M-4 -5V18H4V-5M17 -5V18H24V-5"/></g>
    <path class="atlas-dock" d="M-13 58V91H6V58M-13 66H6M-13 74H6M-13 83H6"/>
    <use href="#atlas-boat" transform="translate(43 93) scale(.7)"/>
    <text class="atlas-island-number" x="0" y="-105">I</text><text class="atlas-place-name" x="0" y="131">Charon’s Ferry</text>
    <g class="atlas-here" transform="translate(75 -53)"><circle r="14"/><circle r="4"/></g>
   </g>
   <g class="atlas-island" data-island-target="home" role="button" tabindex="0" aria-label="Visit Home and Shop" transform="translate(725 345)">
    <path class="atlas-coast-outer" d="M-154 -38L-159 -79L-128 -96L-107 -125L-68 -115L-40 -137L-9 -125L24 -136L52 -117L88 -125L109 -99L141 -88L150 -58L140 -29L160 3L148 33L158 60L133 88L98 91L75 119L40 112L14 128L-21 117L-56 127L-78 105L-117 100L-136 74L-158 58L-148 24L-166 -4Z"/>
    <path class="atlas-coast" d="M-154 -38L-159 -79L-128 -96L-107 -125L-68 -115L-40 -137L-9 -125L24 -136L52 -117L88 -125L109 -99L141 -88L150 -58L140 -29L160 3L148 33L158 60L133 88L98 91L75 119L40 112L14 128L-21 117L-56 127L-78 105L-117 100L-136 74L-158 58L-148 24L-166 -4Z"/>
    <g class="atlas-contours"><path d="M-115 -37Q-89 -110-25 -99T114 -49Q140 20 70 52T-77 37Z"/><path d="M-80 -36Q-70 -80-16 -74T77 -34Q88 7 37 21T-56 9Z"/></g>
    <use href="#atlas-peak" transform="translate(-24 -48) scale(1.6)"/><use href="#atlas-peak" transform="translate(57 -45) scale(.95)"/>
    ${trees([[-119,-22],[-95,-57],[104,-39],[118,-6],[-112,37],[107,53],[-23,92],[37,91],[-55,-92]])}
    ${houses([[-89,3],[-108,62,.8],[92,8],[105,78,.8],[-67,-59,.7],[85,-76,.7]])}
    <path class="atlas-footpath" d="M-46 55Q-13 77 45 65M-5 74L-5 127"/>
    <g class="atlas-player-house" transform="translate(-48 45) scale(1.3)">${house}<path d="M-6 4H-2V8H-6Z"/></g>
    <g class="atlas-stall atlas-ink" transform="translate(49 54)"><path d="M-17 0L-13 -13H14L19 0ZM-15 0V19H16V0M-15 9H16M-6 -11L-7 0M4 -11V0M13 -11L14 0"/></g>
    <path class="atlas-dock" d="M-14 119V152H5V121M-14 128H5M-14 137H5M-14 145H5"/>
    <text class="atlas-island-number" x="0" y="-170">II</text><text class="atlas-place-name" x="0" y="-144">The Village</text>
    <g class="atlas-here" transform="translate(126 -102)"><circle r="14"/><circle r="4"/></g>
   </g>
  </svg>`});
 dialog.firstElementChild.dataset.anfraBlock='v4-river-chart';dialog.firstElementChild.dataset.anfraLabel='Interactive chart of the three islands';
 const drawing=dialog.querySelector('.atlas-drawing');
 function layout(){const phone=matchMedia('(max-width:600px)').matches;drawing.setAttribute('viewBox',phone?'80 40 850 900':'0 0 1000 650');
  for(const [id,desktop,mobile] of [['marsh','300 193','500 220'],['ferry','247 453','280 650'],['home','725 345','700 590']])dialog.querySelector('g[data-island-target="'+id+'"]').setAttribute('transform','translate('+(phone?mobile:desktop)+')');
  dialog.querySelector('.atlas-route').style.display=phone?'none':'';
 }
 addEventListener('resize',layout);layout();
 function sync(){for(const el of dialog.querySelectorAll('[data-island-target]')){const locked=!NetherProgress.canVisit(el.dataset.islandTarget);el.classList.toggle('is-locked',locked);el.setAttribute('aria-disabled',String(locked));el.setAttribute('aria-label',el.dataset.islandTarget==='marsh'?'Court of Judgement'+(locked?' · Locked until ferry rounds are complete':''):el.getAttribute('aria-label'));const current=el.dataset.islandTarget===world.currentIsland;el.classList.toggle('is-current',current);if(current)el.setAttribute('aria-current','location');else el.removeAttribute('aria-current');}}
 addEventListener('nether:progress',sync);sync();
 function close(){dialog.close();toggle.setAttribute('aria-expanded','false');}
 toggle.addEventListener('click',()=>{if(document.body.dataset.screen!=='map')window.NetherV4?.setScreen('map');sync();dialog.showModal();toggle.setAttribute('aria-expanded','true');});
 dialog.querySelector('.atlas-close').addEventListener('click',close);
 dialog.addEventListener('close',()=>toggle.setAttribute('aria-expanded','false'));
 dialog.addEventListener('cancel',()=>toggle.setAttribute('aria-expanded','false'));
 dialog.addEventListener('click',event=>{const target=event.target.closest('[data-island-target]');if(target&&world.visitIsland?.(target.dataset.islandTarget))close();if(event.target===dialog)close();});
 dialog.addEventListener('keydown',event=>{const target=event.target.closest('g[data-island-target]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();if(world.visitIsland?.(target.dataset.islandTarget))close();}});
};
