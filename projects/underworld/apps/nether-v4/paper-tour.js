/* Charon introduces a new kind of paper the first time it is opened.

   Only the papers that ask for something the player has not done yet get one:
     muster roll       a cross-check: the paper's dates must sit inside the campaign's own dates
     discharge tally   a calculation: a number the Book has to add up
     healer's licence  a calculation, by year
   A lookup paper needs none: it is the identity card again.

   Two steps each, as few as can still show the way. The first says what is different about the paper.
   The second opens the right Book and sets the chart up (as the ferry tour does for the first soul), so
   the player sees what to ask for. The calculation tours stop at the number: they do not go on to the
   comparison. The panel and spotlight are the desk tour's (dialogue.js, desk-tour.css). Docs:
   docs/knowledge/logic/papers.md. */
(() => {
 'use strict';
 const $ = s => document.querySelector(s);
 const V = () => window.NetherV4;
 const seen = new Set();       // kinds introduced in this run; nothing persists (AD-6)
 let running = false, root, scrim, panel, steps, step, index, frame = 0, lastKey = '', rings = [];

 /* What each tour sets the chart to. `paper` is the document opened, `c` the case. */
 const TOURS = {
  muster: (paper, c) => [
   {text: 'Check this roll against the Book of Battle. The service dates must also fall within the campaign dates.',
    targets: ['.open-doc--muster']},
   {text: 'The Book shows this soldier’s service and campaign dates. Use the magnifier to compare them with the roll.',
    targets: [['#analysis-config', '#visualization']], last: true,
    chart: {book: 'nether_arms', columns: ['nether_service.rank', 'nether_campaign.name', 'nether_service.joined_on', 'nether_service.left_on', 'nether_campaign.started_on', 'nether_campaign.ended_on'],
     filters: [{field: 'nether_service.service_id', value: paper.doc.service_id}]}},
  ],
  tally: (paper, c) => [
   {text: 'This tally claims a total killed in one campaign. Use the Book to check the total.',
    targets: ['.open-doc--tally']},
   {text: 'The chart shows Killed in battle for this soul and campaign ' + paper.doc.campaign_id + '. Compare its total with the tally.',
    targets: [['#analysis-config', '#visualization']], last: true,
    chart: {book: 'nether_arms', columns: ['nether_casualty_record.campaign_id', 'killed_in_battle'],
     filters: [{field: 'nether_person.person_id', value: c.personId}, {field: 'nether_casualty_record.campaign_id', value: paper.doc.campaign_id}]}},
  ],
  licence: (paper, c) => [
   {text: 'This licence claims how many patients the healer treated in one year. Check that count in the Book.',
    targets: ['.open-doc--licence']},
   {text: 'The chart shows Patients treated by year for this healer. Find the licence’s year and compare the count.',
    targets: [['#analysis-config', '#visualization']], last: true,
    chart: {book: 'nether_healing', columns: ['nether_patient_case.treated_on', 'patients_treated'], grain: 'year',
     filters: [{field: 'nether_person.person_id', value: c.personId}]}},
  ],
 };

 /* The Book and chart for a step: the same preparation the ferry tour does for the first soul. */
 function prepareChart(cfg){
  const v = V(), s = v.states.get(v.active), book = v.data.books().find(b => b.id === cfg.book);
  if(!book) return;
  if(s.dataset !== cfg.book){
   const fields = v.data.schema()[book.models[0]].fields;
   Object.assign(s, {dataset: book.id, model: book.models[0], filterField: (fields.find(f => f.type === 'text' && !f.key) || fields[0]).id,
    filter: '', selection: null, analysis: null});
   v.analysis.render(s);
  }
  const a = v.analysis.current;
  Object.assign(a, {type: 'table', columns: cfg.columns, grain: cfg.grain || 'none', menu: null, drill: null, sorts: [],
   filterTree: {combinator: 'and', children: cfg.filters.map(f => ({field: f.field, operator: 'is', values: [f.value]}))}, filters: []});
  v.analysis.render(s);
 }

 /* A target is a selector, or a list of selectors that share one highlight (the box that holds them all). */
 const boxOf = sel => {
  const rs = (Array.isArray(sel) ? sel : [sel]).map($).filter(el => el && el.getClientRects().length).map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
  if(!rs.length) return [];
  const x = Math.min(...rs.map(r => r.left)), y = Math.min(...rs.map(r => r.top));
  return [{x, y, w: Math.max(...rs.map(r => r.right)) - x, h: Math.max(...rs.map(r => r.bottom)) - y}];
 };
 function holePath(r, pad = 8, rad = 10){
  const x = r.x - pad, y = r.y - pad, w = r.w + pad * 2, h = r.h + pad * 2;
  return 'M' + (x + rad) + ' ' + y + 'h' + (w - rad * 2) + 'a' + rad + ' ' + rad + ' 0 0 1 ' + rad + ' ' + rad + 'v' + (h - rad * 2) + 'a' + rad + ' ' + rad + ' 0 0 1 -' + rad + ' ' + rad +
   'h-' + (w - rad * 2) + 'a' + rad + ' ' + rad + ' 0 0 1 -' + rad + ' -' + rad + 'v-' + (h - rad * 2) + 'a' + rad + ' ' + rad + ' 0 0 1 ' + rad + ' -' + rad + 'z';
 }
 function layout(){
  const rects = step.targets.flatMap(boxOf), key = JSON.stringify([rects, innerWidth, innerHeight, index]);
  if(key === lastKey) return;
  lastKey = key;
  scrim.setAttribute('viewBox', '0 0 ' + innerWidth + ' ' + innerHeight);
  scrim.firstElementChild.setAttribute('d', 'M0 0H' + innerWidth + 'V' + innerHeight + 'H0z' + rects.map(r => holePath(r)).join(''));
  while(rings.length < rects.length){ const ring = document.createElement('div'); root.insertBefore(ring, panel.element); rings.push(ring); }
  rings.forEach((ring, i) => {
   const r = rects[i]; ring.hidden = !r; if(!r) return;
   ring.className = 'dtour-ring';
   Object.assign(ring.style, {left: r.x - 8 + 'px', top: r.y - 8 + 'px', width: r.w + 16 + 'px', height: r.h + 16 + 'px'});
  });
 }

 function go(to){
  index = to; step = steps[index]; lastKey = '';
  if(step.chart) prepareChart(step.chart);
  root.dataset.pos = 'br';
  panel.setActions(step.last ? [{id: 'next', label: 'Got it', arrow: true}] : [{id: 'skip', label: 'Skip', variant: 'tertiary'}, {id: 'next', label: 'Next', arrow: true}]);
  panel.setText(step.text);
  panel.focus('next');
  layout();
 }
 function tick(){
  if(!running) return;
  const host = document.querySelector('dialog[open]') || document.body;
  if(root.parentNode !== host) host.appendChild(root);
  layout();
  frame = requestAnimationFrame(tick);
 }
 function finish(){
  if(!running) return;
  running = false; cancelAnimationFrame(frame);
  root.classList.add('is-leaving');
  setTimeout(() => { panel.destroy(); root.remove(); }, 260);
 }
 function start(type, paper, c){
  running = true; seen.add(type);
  steps = TOURS[type](paper, c);
  root = document.createElement('div'); root.className = 'dtour';
  root.innerHTML = '<svg class="dtour-scrim" aria-hidden="true"><path fill-rule="evenodd"/></svg>';
  scrim = root.firstElementChild; rings = [];
  document.body.appendChild(root);
  const court=c.phase==='pavilion'||document.body.dataset.screen==='marsh';
  panel = NetherDialogue.create({container: root, className: 'dtour-dialogue', label: (court?'Minos':'Charon')+' explains the paper', dialog: true,
   speaker: court?'Minos':'Charon', role: court?'for the three judges':'the ferryman', portrait: court?NetherItemArt.judge():NetherItemArt.charon(),
   onAction(action){ if(action === 'skip') finish(); else if(index >= steps.length - 1) finish(); else go(index + 1); }});
  go(0); tick();
 }

 addEventListener('nether:paper-open', event => {
  const {doc, type} = event.detail || {};
  if(running || !TOURS[type] || seen.has(type)) return;
  if(document.body.dataset.deskTour === 'running') return;         // the ferry tour is speaking
  const v = V(); if(!v?.ready) return;
  const c = v.data.cases().find(x => x.id === v.active), paper = c?.papers?.find(p => p.id === doc);
  if(!paper || ['approved', 'disputed'].includes(v.states.get(v.active)?.status)) return;
  setTimeout(() => { if(!running && !seen.has(type) && $('.open-doc--' + type)) start(type, paper, c); }, 400);
 });
 window.NetherPaperTour = {get running(){ return running; }, get seen(){ return [...seen]; }, reset(){ seen.clear(); }};
})();
