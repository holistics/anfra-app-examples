/* Light, clarity, the shop and the seals.

   The only numbers in the game that do not come from the Books, and the only
   arithmetic the app is allowed to do (AD-1): this is run state, not domain
   data. It lives in one place and changes only through the calls below.

   Light is the currency. An obol is a document a soul presents and is never
   money — the desk pays in light, which is what Charon's lamp runs on.

   Clarity is the Lethe. It drains every shift whether or not you work, and
   when it runs low the records start to smudge: the thing the game is about
   is the thing the river takes first. */
(() => {
 'use strict';

 const ITEMS=typeof module!=='undefined'?require('./memory-items.js'):window.NetherItems;
 const START = {light: 0, clarity: 20};
 const DRAIN = 10;             // per shift ended
 const BLOOD_CLARITY = 10;
 const REWARDS = Object.freeze({ferry: 2, pavilion: 2, wrong: 0, unsupported: 0});

 function casesPerDay(){
  if(typeof window==='undefined')return 5;
  const mode=window.NetherLedger?.mode?.()||'easy';
  const payload=mode==='easy'?window.NetherCasesEasy:window.NetherCases;
  const cases=window.NetherLedger?.cases?.()?.length?window.NetherLedger.cases():payload?.cases||[];
  const counts=new Map();
  for(const item of cases){if(item.phase==='finale')continue;counts.set(item.day,(counts.get(item.day)||0)+1);}
  return Math.max(0,...counts.values())||(mode==='easy'?4:5);
 }
 const DAILY_CASES=casesPerDay(), DAILY_MAX=DAILY_CASES*REWARDS.ferry;
 const BLOOD_REGULAR=Math.max(1,DAILY_MAX-2), BLOOD_SALE=Math.max(1,DAILY_MAX-3);

 /* Demo thresholds. The structure is the shipping one; only the numbers scale,
    so a player reaches all three seals inside a sitting. */
 const SEALS = [
  {n: 1, judge: 'Rhadamanthus', need: 'Three souls read correctly',
   met: s => s.right >= 3},
  {n: 2, judge: 'Aeacus', need: 'Two from each gate, after the first seal',
   met: s => s.right >= 3 && s.east >= 2 && s.west >= 2},
  {n: 3, judge: 'Minos', need: 'Twelve souls at four in five correct',
   met: s => s.total >= 12 && s.right / s.total >= 0.8},
 ];

 const state = {
  light: START.light,
  clarity: START.clarity,
  blood: 0,
  fragments: [],
  inventory: {},
  owned: [],
  shelves: {left:Array(24).fill(null),right:Array(24).fill(null)},
  giftShifts: [], pendingGiftShifts: [], receivedGifts: [], recordStories: {},
  seals: 0,
  shiftsEnded: 0,
  sale: false,
  bloodPrice: BLOOD_REGULAR,
  bloodSeen: BLOOD_REGULAR, // the price the player last acknowledged at the stall
  bloodWas: BLOOD_REGULAR,  // the price they remembered when the latest price was set
  priceNotice: null,    // {from, to} while the keeper still owes them a word about it
  shopIntroDone: false,
 };

 /* A bottle costs two light less than a perfect shift's pay, so one missed case
    still leaves enough for it. Sales take one more light off. */
 function reprice(rng = Math.random){
  state.sale = rng() < 0.3;
  state.bloodPrice = state.sale ? BLOOD_SALE : BLOOD_REGULAR;
  // What the player remembers is the last price they saw, not the last price there was:
  // two shifts away from the shop still compare against what they last saw.
  state.bloodWas = state.bloodSeen;
  state.priceNotice = state.bloodPrice !== state.bloodSeen ? {from: state.bloodSeen, to: state.bloodPrice} : null;
 }
 /* The keeper has told them (Ok): the new price is now the one they know. The shelf keeps
    showing old against new until the next shift moves it again. */
 function ackPrice(){state.bloodSeen = state.bloodPrice; state.priceNotice = null; changed();}
 /* Old and new price for the shelf, or null when the price has not moved. */
 function priceTrend(){
  return state.bloodWas !== state.bloodPrice
   ? {was: state.bloodWas, now: state.bloodPrice, dir: state.bloodPrice < state.bloodWas ? 'down' : 'up'}
   : null;
 }

 /* A fully correct case pays two light in either phase. Mistakes and unsupported
    answers pay nothing, so the day's maximum is two times its case count. */
 function award({verdictCorrect, answerCorrect, phase}){
  if(!verdictCorrect)return REWARDS.wrong;
  if(answerCorrect === false){ return REWARDS.unsupported; }
  const pay=phase==='pavilion'?REWARDS.pavilion:REWARDS.ferry;
  state.light += pay;
  return pay;
 }

 function endShift(){
  state.shiftsEnded++;
  state.clarity = Math.max(0, state.clarity - DRAIN);
  reprice();
  return state.clarity;
 }

 const FADING = () => state.clarity < 4;
 const LOST = () => state.clarity <= 0;

 function changed(){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('nether:possessions'));}
 function priceOf(id){if(id==='fragment')id=stock().find(item=>item.kind==='fragment')?.id;const item=ITEMS.get(id);return item?.gift?0:id==='blood'?state.bloodPrice:item?.source==='shop'?item.price:null;}
 function stock(){return ITEMS.all.filter(item=>item.source==='shop'&&(item.repeat||!state.owned.includes(item.id)));}
 function own(id,source){const item=ITEMS.get(id);if(!item||(!item.repeat&&state.owned.includes(id)))return false;
  state.inventory[id]=(state.inventory[id]||0)+1;if(!state.owned.includes(id))state.owned.push(id);
  if(item.kind==='fragment')state.fragments.push({id,source,at:state.shiftsEnded});
  if(id==='blood')state.blood=state.inventory.blood;return true;
 }
 function buy(id){
  if(id==='fragment')id=stock().find(item=>item.kind==='fragment')?.id;
  const item=ITEMS.get(id),price=priceOf(id);
  if(!item||!stock().some(item=>item.id===id))return {ok:false,why:'This item is no longer on the shelf.'};
  if(state.light<price)return {ok:false,why:'Not enough light.'};
  state.light-=price;own(id,'shop');changed();
  return {ok:true,id,why:id==='blood'?'A bottle for when the river draws closer.':item.gift?'The keeper presses the lyre into your hands.':'The keeper wraps it carefully. Its story is yours now.'};
 }
 function use(id){if(id!=='blood'||!(state.inventory[id]>0))return {ok:false,why:'There is no bottle to use.'};
  state.inventory[id]--;state.blood=state.inventory[id];state.clarity+=BLOOD_CLARITY;changed();return {ok:true,why:'The clarity comes back. +10 clarity.'};
 }
 function fits(id,side){const item=ITEMS.get(id);return !!item&&!['consumable','quest'].includes(item.kind)&&['left','right'].includes(side)&&(!item.shelf||item.shelf===side);}
 function grantFinaleGift(id){if(!['elysium-ticket','petition'].includes(id))return false;const granted=own(id,'court');if(granted)changed();return granted;}
 const cell=(side,index)=>['left','right'].includes(side)&&Number.isInteger(index)&&index>=0&&index<24;
 function place(id,side,index){if(!cell(side,index)||!fits(id,side))return {ok:false,why:'The '+(ITEMS.get(id)?.name||'item')+' belongs on the other shelf.'};
  if(!(state.inventory[id]>0)||state.shelves[side][index])return {ok:false,why:'Choose an empty cell.'};
  state.inventory[id]--;state.shelves[side][index]=id;changed();return {ok:true,id};
 }
 function move(fromSide,fromIndex,toSide,toIndex){
  if(!cell(fromSide,fromIndex)||!cell(toSide,toIndex))return {ok:false,why:'Choose a shelf cell.'};
  const id=state.shelves[fromSide][fromIndex],other=state.shelves[toSide][toIndex];
  if(!fits(id,toSide)||(other&&!fits(other,fromSide)))return {ok:false,why:'The instruments must stay on their own shelves.'};
  state.shelves[fromSide][fromIndex]=other;state.shelves[toSide][toIndex]=id;changed();return {ok:true,id};
 }
 function pack(side,index){if(!cell(side,index))return false;const id=state.shelves[side][index];if(!id)return false;state.shelves[side][index]=null;state.inventory[id]=(state.inventory[id]||0)+1;changed();return true;}
 function flawlessShift(day){if(state.giftShifts.includes(day))return;state.giftShifts.push(day);state.pendingGiftShifts.push(day);}
 function visitHome(){if(!state.pendingGiftShifts.length)return null;const id=['chime','song','ribbon'].find(id=>!state.owned.includes(id));if(!id)return null;
  state.pendingGiftShifts.shift();own(id,'cerberus');state.receivedGifts.push(id);changed();return ITEMS.get(id);
 }
 function grantRecords(soul){
  const stories={
   'birth-record':soul.paper.name+', born in '+soul.paper.birthplace+' on '+soul.paper.birthdate+'.',
   'marriage-record':'Married'+(soul.filedRecords?.marriage.bonded_from?' on '+soul.filedRecords.marriage.bonded_from:'')+'. The spouse’s name has been struck out of the record.',
   'death-record':'Died '+soul.deathDate+'. Compare this date with the marriage record.',
   'passage-record':'Permit '+soul.permit.permit_id+' — '+(soul.filedRecords?.passage.status||'redeemed')+'. Compare the Book of Truth with the papers she is holding.'
  };
  for(const [id,story] of Object.entries(stories)){own(id,'court');state.recordStories[id]=story;}changed();
 }
 /* Seal progress is a breakdown the player reads without being told it is one:
    accurate calls, grouped by the gate the soul came through. */
 function evaluate(stats){
  let earned = 0;
  for(const seal of SEALS){ if(seal.met(stats)) earned = seal.n; else break; }
  const gained = earned > state.seals;
  state.seals = Math.max(state.seals, earned);
  return {seals: state.seals, gained};
 }

 const bar = (value, of, label) => {
  const width = of ? Math.round(Math.min(1, value / of) * 100) : 0;
  return '<div class="seal-bar"><span>' + label + '</span>'
   + '<i><b style="width:' + width + '%"></b></i><small>' + value + ' / ' + of + '</small></div>';
 };

 function sealScreen(stats){
  return '<div data-anfra-block="seals" data-anfra-label="The judges’ count" class="overlay-body seal-panel">'
   + '<p>The judges keep their own count. Three seals, and each one opens more '
   + 'of your own record to you.</p>'
   + SEALS.map(seal => {
      const held = state.seals >= seal.n;
      return '<section class="seal-row' + (held ? ' held' : '') + '">'
       + '<h4>' + (held ? '✦ ' : '') + 'Seal ' + seal.n + ' · ' + seal.judge + '</h4>'
       + '<p>' + seal.need + '</p>'
       + (seal.n === 2
          ? bar(stats.east, 2, 'East gate') + bar(stats.west, 2, 'West gate')
          : seal.n === 1
           ? bar(stats.right, 3, 'Read correctly')
           : bar(stats.total, 12, 'Souls examined')
             + '<p class="seal-accuracy">Accuracy '
             + (stats.total ? Math.round(stats.right / stats.total * 100) : 0)
             + '% — four in five is asked</p>')
       + '</section>';
     }).join('')
   + '</div>';
 }

 function shopScreen(){
  const row = (item, name, note) => {
   const price = priceOf(item), afford = state.light >= price;
   return '<button class="shop-row" data-action="buy" data-item="' + item + '"'
    + (afford ? '' : ' disabled') + '>'
    + '<div><strong>' + name + '</strong><small>' + note + '</small></div>'
    + '<span class="shop-price">' + price + ' light</span></button>';
  };
  return '<div data-anfra-block="stall" data-anfra-label="Shop" class="overlay-body shop">'
   + '<p class="shop-head">The shift is over. ' + (state.sale
      ? 'There is a sale on, which does not happen often.'
      : 'The old woman at the stall has what she always has.') + '</p>'
   + '<p class="shop-purse">You hold <b>' + state.light + '</b> light. '
   + 'Clarity <b>' + state.clarity + '</b>.</p>'
   + row('blood', 'Blood of a sacrificed ram',
         'Ten clarity. Holds the river back about two shifts.')
   + row('fragment', 'A memory fragment',
         'Something of your own. Never needed to finish.')
   + '<p class="shop-note">' + (LOST()
      ? 'You cannot remember what you were counting.'
      : FADING()
       ? 'The writing has begun to blur. Blood would fix that.'
       : 'Keep enough back for the next shift.') + '</p>'
   + '</div>';
 }

 const api = {state, award, endShift, buy, use, priceOf, priceTrend, ackPrice, stock, fits, place, move, pack, flawlessShift, visitHome, grantRecords, grantFinaleGift, reprice, evaluate,
              sealScreen, shopScreen, fading: FADING, lost: LOST, SEALS,
              reference: Object.freeze({start: Object.freeze({...START}), drain: DRAIN, bloodClarity: BLOOD_CLARITY, dailyCases: DAILY_CASES, dailyMax: DAILY_MAX, bloodRegular: BLOOD_REGULAR, bloodSale: BLOOD_SALE, rewards: REWARDS})};
 if(typeof module !== 'undefined') module.exports = api; else window.NetherEconomy = api;
})();
