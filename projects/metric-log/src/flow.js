const fs = require('fs');
const crypto = require('crypto');
const store = require('./store');
const git = require('./git');
const anfra = require('./anfra');
const { person, teams, canApprove, approvers, describeSelectors } = require('./config');
const { buildIndex, rewriteDefinition } = require('./index');
const { computeImpact } = require('./impact');

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const now = () => new Date().toISOString();
const sha = (text) => crypto.createHash('sha1').update(text).digest('hex');
const canEdit = (p) => p && (p.role === 'analyst' || p.role === 'lead');

function findDraft(cfg, sentence) {
  return cfg.simulated_drafts.find((d) => norm(d.sentence) === norm(sentence)) || null;
}

function createRequest(cfg, by, sentence, metricId) {
  const index = buildIndex(cfg.repoPath);
  const draft = findDraft(cfg, sentence);
  const target = draft ? draft.metric : metricId;
  if (!sentence.trim()) throw new Error('Write what is wrong or what should change.');
  if (!target || !index.metrics[target]) throw new Error('Pick the metric this is about.');
  const r = {
    id: store.nextRequestId(cfg),
    metric: target,
    sentence: sentence.trim(),
    requester: by.id,
    state: draft ? 'drafted' : 'requested',
    draft: draft ? { definition: draft.definition, simulated: true } : null,
    history: [{ state: 'requested', by: by.id, at: now() }],
  };
  if (draft) r.history.push({ state: 'drafted', by: 'simulated draft', at: now() });
  return store.saveRequest(cfg, r);
}

async function submit(cfg, by, id, definition, reason) {
  const r = store.getRequest(cfg, id);
  if (!r || !['requested', 'drafted'].includes(r.state)) throw new Error('This request is not open for editing.');
  if (!canEdit(by)) throw new Error('Only an analyst or lead can edit and submit.');
  if (!definition.trim()) throw new Error('The new definition is empty.');
  if (!reason.trim()) throw new Error('Give a reason for the change.');
  const index = buildIndex(cfg.repoPath);
  const target = index.metrics[r.metric];
  const impact = await computeImpact(cfg, index, r.metric, definition);
  if (!impact.valid) throw new Error('This definition does not compile: ' + impact.message);
  r.final = { definition: definition.trim(), editor: by.id, reason: reason.trim() };
  r.before = { definition: target.definition };
  r.base_hash = sha(fs.readFileSync(target.file, 'utf8'));
  r.impact = impact;
  r.state = 'in_review';
  r.history.push({ state: 'in_review', by: by.id, at: now() });
  return store.saveRequest(cfg, r);
}

async function decide(cfg, by, id, approve, note) {
  const r = store.getRequest(cfg, id);
  if (!r || r.state !== 'in_review') throw new Error('This request is not waiting for review.');
  if (!canApprove(cfg, by, r.metric)) throw new Error(`Only ${describeSelectors(cfg, approvers(cfg, r.metric))} can approve or reject.`);
  if (!approve) {
    if (!note.trim()) throw new Error('Rejecting needs a reason.');
    r.state = 'rejected';
    r.rejection = { by: by.id, reason: note.trim() };
    r.history.push({ state: 'rejected', by: by.id, at: now() });
    return store.saveRequest(cfg, r);
  }
  const index = buildIndex(cfg.repoPath);
  const target = index.metrics[r.metric];
  const text = fs.readFileSync(target.file, 'utf8');
  if (sha(text) !== r.base_hash) {
    r.state = 'drafted';
    r.draft = { definition: r.final.definition, simulated: false };
    r.history.push({ state: 'drafted', by: 'system: the dataset file changed since this was reviewed', at: now() });
    store.saveRequest(cfg, r);
    throw new Error('The dataset file changed since this was submitted. It went back to the analyst for a fresh review.');
  }
  r.approval = { by: by.id, note: (note || '').trim() };
  r.history.push({ state: 'approved', by: by.id, at: now() });
  fs.writeFileSync(target.file, rewriteDefinition(text, target, r.final.definition));
  const name = (pid) => (person(cfg, pid) || { name: pid }).name;
  const message = [
    `Change ${r.metric}: ${r.sentence}`,
    '',
    `Request: ${r.id} "${r.sentence}"`,
    `Requester: ${name(r.requester)}`,
    `Editor: ${name(r.final.editor)}`,
    `Approver: ${name(by.id)}`,
    `Reason: ${r.final.reason}`,
  ].join('\n');
  try {
    r.state = 'applied';
    r.history.push({ state: 'applied', by: by.id, at: now() });
    store.saveRequest(cfg, r);
    store.writeLog(cfg, r);
    store.addTimeline(cfg, r.metric, {
      type: 'change', by: by.id, text: `${r.sentence} (${r.id})`, request: r.id,
      before: r.before.definition, definition: r.final.definition,
      valueBefore: r.impact.metrics[0].old, value: r.impact.metrics[0].new, reason: r.final.reason,
    });
    git.commitFiles(cfg.repoPath, [target.file, store.requestFile(cfg, r.id), store.logFile(cfg, r.id), store.timelineFile(cfg, r.metric)], message);
  } catch (e) {
    fs.writeFileSync(target.file, text);
    r.state = 'in_review';
    r.history.splice(-2);
    store.saveRequest(cfg, r);
    throw new Error('Could not commit: ' + (e.stderr || e.message));
  }
  return r;
}

async function addEntry(cfg, by, metricId, decided, note) {
  const index = buildIndex(cfg.repoPath);
  const m = index.metrics[metricId];
  if (!m) throw new Error('Unknown metric.');
  decided = (decided || '').trim();
  note = (note || '').trim();
  if (!decided && !note) throw new Error('Write what we decided, or a comment.');
  if (!decided) return store.addTimeline(cfg, metricId, { type: 'comment', by: by.id, text: note });
  const value = await anfra.metricValue(cfg.anfra.url, m.dataset, m.name);
  return store.addTimeline(cfg, metricId, { type: 'decision', by: by.id, decided, text: note, value, definition: m.definition });
}

const HISTORY_TYPES = ['event', 'decision', 'learning'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (day, n) => { const x = new Date(day + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// An entry's own dates: its date→end window, otherwise the 7 days ending on its date. `prev` is the same length just
// before, or with compare 'year' the same dates 364 days earlier (same weekdays). AQL `until` leaves out its end day, hence the +1.
function entryWindow(e) {
  const from = e.end ? e.date : shift(e.date, -6);
  const to = shift(e.end || e.date, 1);
  const back = e.compare === 'year' ? 364 : days(from, to);
  return { cur: [from, to], prev: [shift(from, -back), shift(to, -back)] };
}

async function windowValue(cfg, m, range) {
  const date = ((cfg.canvas || {}).date || {})[m.dataset];
  if (!date) return null;
  const r = await anfra.query(cfg.anfra.url, m.dataset, `explore { measures { v: ${m.name} } filters { ${date} matches @(${range[0]} until ${range[1]}) } }`);
  return r.rows[0] ? r.rows[0].v : null;
}

// The definition live on a day: what the first change applied after that day replaced, else today's.
function definitionOn(cfg, m, day) {
  const later = store.listTimeline(cfg, m.id).filter((e) => e.type === 'change' && (e.date || e.at).slice(0, 10) > day);
  return later.length ? later[0].before : m.definition;
}

// Event, decision or learning (FR-21, FR-29 to FR-32). Values are Anfra's, for the entry's dates, under today's definition.
async function addHistoryEntry(cfg, by, metricId, f, opts = {}) {
  const index = buildIndex(cfg.repoPath);
  const m = index.metrics[metricId];
  if (!m) throw new Error('Unknown metric.');
  const type = f.type;
  if (!HISTORY_TYPES.includes(type)) throw new Error('Pick event, decision or learning.');
  const headline = String(f.headline || '').trim();
  if (!headline) throw new Error('Write a one-line headline.');
  if (headline.length > 90) throw new Error('Keep the headline to 90 characters.');
  const date = f.date || now().slice(0, 10);
  if (!DAY.test(date)) throw new Error('Date must be YYYY-MM-DD.');
  const end = type !== 'decision' && f.end ? f.end : null;
  if (end && (!DAY.test(end) || end < date)) throw new Error('The end date must be on or after the start date.');
  const compare = f.compare === 'year' ? 'year' : 'prev';
  const status = type === 'learning' ? (f.status === 'confirmed' ? 'confirmed' : 'hypothesis') : null;
  let follows = null;
  if (f.follows) {
    const [fm, fid] = String(f.follows).split('#');
    if (!store.listTimeline(cfg, fm).some((e) => e.id === fid)) throw new Error('The entry it follows does not exist.');
    follows = `${fm}#${fid}`;
  }
  const also_on = (f.also_on || []).filter((id) => id !== metricId);
  const unknown = also_on.filter((id) => !index.metrics[id]);
  if (unknown.length) throw new Error('Unknown metric: ' + unknown.join(', '));
  // Who else was involved: people by id, teams as `team:<name>`. The author is always first and not repeated.
  const withIds = [...new Set((f.with || []).filter((id) => id !== by.id))];
  const badWith = withIds.filter((id) => (id.startsWith('team:') ? !teams(cfg).includes(id.slice(5)) : !person(cfg, id)));
  if (badWith.length) throw new Error('Unknown person or team: ' + badWith.join(', '));
  const w = entryWindow({ date, end, compare });
  const [value, valuePrev] = await Promise.all([windowValue(cfg, m, w.cur), windowValue(cfg, m, w.prev)]);
  const entry = {
    type, date, end, compare, headline, detail: String(f.detail || '').trim() || null, status, follows,
    also_on: also_on.length ? also_on : null, by: by.id, with: withIds.length ? withIds : null, value, valuePrev, definition: definitionOn(cfg, m, date),
  };
  if (opts.seeded) entry.seeded = true;
  return store.addTimeline(cfg, metricId, entry);
}

module.exports = { findDraft, createRequest, submit, decide, addEntry, addHistoryEntry, entryWindow, canEdit };
