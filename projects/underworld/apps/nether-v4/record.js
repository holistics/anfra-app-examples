/* The record of service.

   The screen at the end that tells the player what they have actually been
   doing. Every line is work they did without being told the word for it:
   they searched a dataset, followed a relationship, defined a metric, reused
   it, amended it, and watched the amendment travel.

   This is the only place in the game that is allowed to use that vocabulary,
   and it earns it by waiting until the end (Q2).

   The tally counts what the player did, not what the data says — it is run
   state, not domain data, so counting it here is arithmetic AD-1 permits. */
(() => {
 'use strict';

 const tally = {
  searches: 0,        // questions put to a Book through the explorer
  books: new Set(),   // Books opened at least once
  threads: 0,         // foreign keys followed from one record to another
  writsDefined: 0,
  writsReused: 0,     // times a named Writ answered a judge
  writsAmended: 0,
  sentencesChanged: 0,
 };

 const note = {
  search(dataset){ tally.searches++; if(dataset) tally.books.add(dataset); },
  book(dataset){ if(dataset) tally.books.add(dataset); },
  thread(){ tally.threads++; },
  writDefined(){ tally.writsDefined++; },
  writReused(){ tally.writsReused++; },
  amendment(changed){ tally.writsAmended++; tally.sentencesChanged += changed; },
 };

 const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

 /* The lines, in the order they were earned. A line the player never reached
    is left out rather than shown as a zero: the record is what they did. */
 function lines(stats){
  const out = [['Souls examined', String(stats.examined)]];
  if(tally.searches) out.push(['Books searched', String(tally.searches)]);
  if(tally.books.size) out.push(['Books opened', String(tally.books.size)]);
  if(tally.threads) out.push(['Threads followed', String(tally.threads)]);
  if(tally.writsDefined) out.push(['Writs of Measure defined', String(tally.writsDefined)]);
  if(tally.writsReused) out.push(['Writs reused by the judges', String(tally.writsReused)]);
  if(tally.writsAmended)
   out.push(['Writs amended', tally.writsAmended + ', which changed '
    + plural(tally.sentencesChanged, 'sentence', 'sentences')]);
  if(stats.examined)
   out.push(['Accuracy', Math.round(stats.right / stats.examined * 100) + '%']);
  return out;
 }

 /* The translation, held back until now. Each line says what the player was
    doing in the words the rest of the industry uses for it. */
 const GLOSS = [
  ['Books searched', 'You were querying a dataset.'],
  ['Threads followed', 'You were traversing a relationship between models.'],
  ['Writs of Measure defined', 'You were defining a metric in a semantic layer.'],
  ['Writs reused by the judges', 'That metric was requested by name, and answered the same way every time.'],
  ['Writs amended', 'You changed one definition, and every number derived from it moved with it.'],
 ];

 function screen(stats){
  const rows = lines(stats);
  const shown = new Set(rows.map(r => r[0]));
  // The dialog's own heading already says what this is.
  return '<div data-anfra-block="service-record" data-anfra-label="Record of service" class="overlay-body service-record">'
   + '<h3 class="service-name">Eurydice of Thrace</h3>'
   + '<dl class="service-lines">'
   + rows.map(([label, value]) =>
      '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>').join('')
   + '</dl>'
   + '<p class="service-turn">Every number you stamped came from one definition.<br>'
   + 'That is the only reason any of this was fair.</p>'
   + '<div class="service-gloss">'
   + GLOSS.filter(([label]) => shown.has(label))
      .map(([label, meaning]) => '<p><b>' + label + '</b> — ' + meaning + '</p>').join('')
   + '</div>'
   + '<p class="service-coda">You have been using a business intelligence tool '
   + 'for the last half hour. Nobody mentioned it.</p>'
   + '</div>';
 }

 const api = {note, tally, screen, lines};
 if(typeof module !== 'undefined') module.exports = api; else window.NetherRecord = api;
})();
