/* The magnifier's verdict on one pair of details: pure, no DOM.

   A paper field set against a Book field is a discrepancy ONLY when the Book row is
   the same record as the paper. If the Book row is another soul's, of course the
   details differ, and that proves nothing. Whether it is the same record is read
   from the rest of the paper: every other field the paper shares with the row must
   agree, and the one the player clicked is the only one that does not.

     paper Kleon / Syracuse / 0436-06-22 / HUY9-8776   Book row Kleon / Syracuse / 0436-06-22 / RrH5-foQf
       click the id  -> the rest agrees -> Discrepancy detected
     paper Kleon / ...                                   Book row Misa / Delphi / 0431-01-02 / ...
       click the id  -> the name differs too -> Not the same record

   judge(a, b, paperCells, rowCells, place)
     a, b         {cat, val} the two clicked details
     paperCells   every comparable detail on the paper that was clicked: [{cat, val}]
     rowCells     every detail of the Book row that was clicked, as shown: [{cat, val}]
     place        for a coin only: {claimed, shown}, the birthplace on the paper and the country of the page
   Returns {result, cls} with cls one of 'match', 'mismatch', 'none'.

   Rules (docs/knowledge/logic/discrepancy.md):
     0. A cross-check pair (a paper date and the campaign date it must sit inside): Inside / Outside the campaign.
     1. Different kinds of detail: No correlation.
     2. The same value: Data match.
     2b. A coin held against another country's mint than the paper's birthplace: Not the same record.
     3. Different, and the paper has no other detail to tell whose record this is
        (a coin, a claim): Discrepancy detected, as it always was.
     4. Different, and the row shows none of the paper's other details: Cannot tell.
        Show more columns.
     5. Different, and some other shared detail differs too: Not the same record.
     6. Different, and every other shared detail agrees: Discrepancy detected. */
(() => {
 'use strict';
 const root = typeof window === 'undefined' ? globalThis : window;

 /* Cross-checks: a detail on the paper held against a DIFFERENT detail in the Book, because the paper's
    claim must stay inside it. A muster roll's dates must lie inside its campaign's own dates. Whole
    ISO dates compare as text. */
 const RULES = [
  {paper: 'nether_service.joined_on', book: 'nether_campaign.started_on', test: 'not_before', name: 'campaign'},
  {paper: 'nether_service.left_on', book: 'nether_campaign.ended_on', test: 'not_after', name: 'campaign'},
 ];
 const day = v => String(v).slice(0, 10);

 function judge(a, b, paperCells = [], rowCells = [], place){
  const rule = RULES.find(r => (a.cat === r.paper && b.cat === r.book) || (a.cat === r.book && b.cat === r.paper));
  if(rule){
   const paper = a.cat === rule.paper ? a : b, book = a.cat === rule.paper ? b : a;
   const inside = rule.test === 'not_before' ? day(paper.val) >= day(book.val) : day(paper.val) <= day(book.val);
   return inside ? {result: 'Inside the ' + rule.name, cls: 'match'} : {result: 'Outside the ' + rule.name, cls: 'mismatch'};
  }
  if(a.cat !== b.cat) return {result: 'No correlation', cls: 'none'};
  if(a.val === b.val) return {result: 'Data match', cls: 'match'};
  // A coin is compared with the mint of the soul's birthplace and no other: another country's coin differs
  // in everything, which proves nothing. `place` is {claimed: the birthplace on the paper, shown: the country
  // of the Book page the coin is held against}.
  if(place && place.claimed && place.shown && place.claimed !== place.shown) return {result: 'Not the same record', cls: 'none'};
  const others = new Map();
  for(const cell of paperCells) if(cell.cat !== a.cat && !others.has(cell.cat)) others.set(cell.cat, cell.val);
  if(!others.size) return {result: 'Discrepancy detected', cls: 'mismatch'};
  const shared = [...others].filter(([cat]) => rowCells.some(cell => cell.cat === cat));
  if(!shared.length) return {result: 'Show more columns to be sure', cls: 'none'};
  const agrees = ([cat, val]) => rowCells.some(cell => cell.cat === cat && cell.val === val);
  if(!shared.every(agrees)) return {result: 'Not the same record', cls: 'none'};
  return {result: 'Discrepancy detected', cls: 'mismatch'};
 }

 const api = {judge};
 if(typeof module !== 'undefined') module.exports = api; else root.NetherCompare = api;
})();
