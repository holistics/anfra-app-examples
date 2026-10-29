/* The papers a soul can carry, and how each is drawn.

   One table, `TYPES`, says for every kind of paper what it is called, how big it lies on the
   desk, and which of its lines can be held against the Book (the line's `cat` is the Book's
   own model.field, so the magnifier can find the same detail in a chart or a table). The
   desk, the open paper and the notebook's ledger all read it, so a paper cannot be drawn one
   way in one place and another in the next.

   A case lists its papers in order (`c.papers`): the identity declaration, the permit and the
   obol are always there, and the rest depend on the day (docs/knowledge/logic/papers.md).
   Pure: this file writes HTML text and reads nothing from the Books. */
(() => {
 'use strict';
 const root = typeof window === 'undefined' ? globalThis : window;

 const year = v => (1000 - Number(String(v).slice(0, 4))) + ' BC';          // realm calendar: storage year Y reads as 1000 - Y BC
 const yes = v => v === true || v === 'true';

 /* field: {key, label, cat, show?, raw?, value?}
      key    the line's name on the paper (the grader's doc_field)
      cat    the Book's model.field, or a metric name, that this line is held against
      show   how it reads on the paper (default: as written)
      raw    what the magnifier compares (default: the value as written)
    A line whose value is empty ('—') prints but cannot be compared: the Book prints nothing there either. */
 const TYPES = {
  deed: {label: 'Property book · Deed of ownership', eyebrow: 'PROPERTY BOOK · DEED OF OWNERSHIP', ref: 'txn_id', size: [250, 340],
   fields: [
    {key: 'asset', label: 'Asset', cat: 'nether_asset.name'},
    {key: 'asset_type', label: 'Kind', cat: 'nether_asset.asset_type'},
    {key: 'location', label: 'Where', cat: 'nether_asset.location'},
    {key: 'seller', label: 'Sold by', cat: 'nether_ownership_transaction.seller_person_id', show: (v) => v === '—' ? 'First registration' : v},
    {key: 'transacted_on', label: 'Date', cat: 'nether_ownership_transaction.transacted_on', date: true},
    {key: 'price', label: 'Price', cat: 'nether_ownership_transaction.price'}]},
  letter: {label: 'Work book · Letter of employment', eyebrow: 'WORK BOOK · LETTER OF EMPLOYMENT', ref: 'employment_id', size: [250, 340],
   fields: [
    {key: 'role', label: 'Role', cat: 'nether_employment.role'},
    {key: 'employer', label: 'House', cat: 'nether_business.name', show: (v, doc) => doc.self_employed ? 'Self-employed' : v},
    {key: 'trade', label: 'Trade', cat: 'nether_business.trade'},
    {key: 'started_on', label: 'From', cat: 'nether_employment.started_on', date: true},
    {key: 'ended_on', label: 'Until', cat: 'nether_employment.ended_on', date: true}]},
  oath: {label: 'Religion book · Oath tablet', eyebrow: 'RELIGION BOOK · OATH TABLET', ref: 'oath_id', size: [240, 350],
   fields: [
    {key: 'subject', label: 'Sworn on', cat: 'nether_oath.subject'},
    {key: 'sworn_on', label: 'Date', cat: 'nether_oath.sworn_on', date: true},
    {key: 'kept', label: 'The oath', cat: 'nether_oath.kept', show: v => yes(v) ? 'Kept' : 'Broken', raw: v => String(yes(v))},
    {key: 'broken_on', label: 'Broken on', cat: 'nether_oath.broken_on', date: true}]},
  receipt: {label: 'Religion book · Temple receipt', eyebrow: 'RELIGION BOOK · TEMPLE RECEIPT', ref: 'offering_id', size: [210, 340],
   fields: [
    {key: 'deity', label: 'Deity', cat: 'nether_temple.deity'},
    {key: 'temple_location', label: 'Temple at', cat: 'nether_temple.location'},
    {key: 'kind', label: 'Offering', cat: 'nether_offering.kind'},
    {key: 'value', label: 'Worth', cat: 'nether_offering.value'},
    {key: 'offered_on', label: 'Date', cat: 'nether_offering.offered_on', date: true}]},
  muster: {label: 'Battle book · Muster roll', eyebrow: 'BATTLE BOOK · MUSTER ROLL', ref: 'service_id', size: [250, 300],
   fields: [
    {key: 'campaign', label: 'Campaign', cat: 'nether_campaign.name'},
    {key: 'rank', label: 'Rank', cat: 'nether_service.rank'},
    {key: 'joined_on', label: 'Joined', cat: 'nether_service.joined_on', date: true},
    {key: 'left_on', label: 'Left', cat: 'nether_service.left_on', date: true}]},
  // A calculation paper states a number the Books have to add up: no record holds it.
  tally: {label: 'Battle book · Discharge tally', eyebrow: 'BATTLE BOOK · DISCHARGE TALLY', ref: 'campaign_id', size: [240, 280],
   fields: [
    {key: 'campaign', label: 'Campaign', show: (v, doc) => v},
    {key: 'campaign_id', label: 'Campaign no.', cat: 'nether_casualty_record.campaign_id'},
    {key: 'killed', label: 'Killed in battle', cat: 'killed_in_battle'}]},
  licence: {label: 'Healthcare book · Healer’s licence', eyebrow: 'HEALTHCARE BOOK · HEALER’S LICENCE', ref: null, size: [250, 260],
   fields: [
    {key: 'year', label: 'Year', cat: 'nether_patient_case.treated_on', show: year, raw: v => String(v) + '-01-01'},
    {key: 'treated', label: 'Cases treated', cat: 'patients_treated'}]},
  // The last soul's marriage claim, the only paper not made from the schedule.
  support: {label: 'Supporting claim', eyebrow: 'SUPPORTING CLAIM', ref: null, size: [240, 150], legacy: true, fields: []},
 };

 /* Where each paper's own number lives in the Books, so it can be searched for there. */
 const REFCAT = {deed: 'nether_ownership_transaction.txn_id', letter: 'nether_employment.employment_id', oath: 'nether_oath.oath_id',
  receipt: 'nether_offering.offering_id', muster: 'nether_service.service_id', tally: 'nether_casualty_record.campaign_id'};
 const standard = {identity: 'Identity book', permit: 'Identity book · Passage permit', obol: 'Book of Instruction · Obol', guide: 'Book of Instruction'};

 /* The papers lying on the desk, in order: identity and permit first, then this case's own. */
 function list(c){
  return ['identity', 'permit', ...((c && c.papers) || []).map(p => p.id)];
 }
 const find = (id, c) => ((c && c.papers) || []).find(p => p.id === id);
 const typeOf = (id, c) => (find(id, c) || {}).type || id;                 // identity, permit, obol and guide are their own type
 const label = (id, c) => standard[id] || TYPES[typeOf(id, c)]?.label || id;
 const kindOf = (id, c) => (find(id, c) || {}).kind || null;               // lookup, cross or calc

 // Open sizes (the identity card, permit, coin and the guide are drawn by the desk itself).
 const SIZES = {identity: [250, 260], permit: [250, 342], obol: [150, 150], guide: [270, 310]};
 const size = (id, c) => SIZES[id] || TYPES[typeOf(id, c)]?.size || [240, 220];

 const isDate = v => /^\d{4}-\d{2}-\d{2}/.test(String(v));

 /* The open paper. `h` carries the desk's own helpers: cmp (attributes that make a line
    comparable), esc, fmtDate. */
 function html(id, c, h){
  const type = TYPES[typeOf(id, c)], paper = find(id, c);
  if(!type) return '';
  if(type.legacy) return h.legacy ? h.legacy(c) : '';
  const doc = paper.doc || {};
  const lines = type.fields.map(f => {
   const value = doc[f.key];
   const empty = value === undefined || value === null || value === '—' || value === '';
   const shown = f.show ? f.show(empty ? '—' : value, doc) : f.date && !empty ? h.fmtDate(value) : empty ? '—' : String(value);
   const comparable = f.cat && !empty;
   const raw = f.raw ? f.raw(value) : String(value);
   // Presentation hooks only: comparison attributes and raw values stay unchanged.
   const presentation = ' data-paper-field="' + h.esc(f.key) + '"' + (f.date ? ' data-paper-format="date"' : '');
   // Keep the Book's field name, without repeating its model on the document.
   const name = (h.label && f.cat && h.label(f.cat)) || f.label;
   return comparable
    ? '<button class="zoom-field"' + presentation + ' ' + h.cmp('soul', f.cat, raw, name + ': ' + shown) + '><dt>' + h.esc(name) + '</dt><dd>' + h.esc(shown) + '</dd></button>'
    : '<div class="zoom-field is-plain"' + presentation + '><dt>' + h.esc(name) + '</dt><dd>' + h.esc(shown) + '</dd></div>';
  });
  const refCat = REFCAT[paper.type], refName = refCat && h.label ? h.label(refCat) : null;
  const ref = type.ref && doc[type.ref] ? '<h3>' + h.esc(doc[type.ref]) + '</h3>' + (refName ? '<small class="paper-ref-label">' + h.esc(refName) + '</small>' : '') : '';
  return '<header class="paper-heading"><span class="paper-emblem" aria-hidden="true"></span><div><p class="eyebrow">' + h.esc(type.eyebrow) + '</p>' + ref + '</div></header>'
   + '<dl class="zoom-fields">' + lines.join('') + '</dl><div class="paper-end" aria-hidden="true"></div>';
 }

 /* The same lines, for the notebook's case ledger. `row(check, field, label, value)` and
    `doc(title, rows)` are the ledger's own. Returns one card per paper. */
 function ledger(c, row, doc, fmtDate, labels){
  return ((c && c.papers) || []).map(p => {
   const type = TYPES[p.type];
   if(!type || type.legacy) return '';
   const d = p.doc || {};
   const rows = [];
   if(type.ref && d[type.ref]) rows.push(row(p.id, type.ref, (labels && REFCAT[p.type] && labels(REFCAT[p.type])) || 'Reference', d[type.ref]));
   for(const f of type.fields){
    const v = d[f.key], empty = v === undefined || v === null || v === '—' || v === '';
    rows.push(row(p.id, f.key, (labels && f.cat && labels(f.cat)) || f.label, f.show ? f.show(empty ? '—' : v, d) : f.date && !empty ? fmtDate(v) : empty ? '—' : v));
   }
   return doc(type.label, rows);
  }).join('');
 }

 /* The line a missing record is reported against in the ledger. */
 function reference(check, c){
  const p = find(check, c);
  return p ? TYPES[p.type]?.ref : null;
 }

 const api = {TYPES, list, find, typeOf, label, kindOf, size, html, ledger, reference, isDate};
 if(typeof module !== 'undefined') module.exports = api; else root.NetherPapers = api;
})();
