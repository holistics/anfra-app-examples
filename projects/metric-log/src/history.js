// A metric's decision history (PRD FR-20 to FR-36): a trend strip with a pin per entry, then a rail of
// events, decisions, learnings and applied changes, newest first, grouped by month.
const store = require('./store');
const anfra = require('./anfra');
const { esc, fmt, delta, dropdown } = require('./ui');
const { person, teams } = require('./config');
const avatars = require('./avatars');

const TYPES = { change: 'Change', event: 'Event', decision: 'Decision', learning: 'Learning' };
const FILTERS = [['all', 'All'], ['change', 'Changes'], ['decision', 'Decisions'], ['event', 'Events'], ['learning', 'Learnings']];
const ICON = {
  change: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2"/></svg>',
  event: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  decision: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  learning: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const nameOf = (cfg, id) => (person(cfg, id) || { name: id }).name;
const dayOf = (e) => (e.date || e.at).slice(0, 10);
const headOf = (e) => e.headline || e.decided || e.text || '';
const kindOf = (e) => (e.type === 'change' ? 'change' : TYPES[e.type] ? e.type : null);
const short = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
function span(e) {
  const a = dayOf(e), b = e.end;
  if (!b || b === a) return `${short(a)}, ${a.slice(0, 4)}`;
  return a.slice(0, 4) === b.slice(0, 4) ? `${short(a)} – ${short(b)}, ${b.slice(0, 4)}` : `${short(a)}, ${a.slice(0, 4)} – ${short(b)}, ${b.slice(0, 4)}`;
}

// Who was involved, author first: a change is its requester, editor and approver; anything else is its author plus `with`.
function who(cfg, e) {
  let ids = [e.by, ...(e.with || [])];
  if (e.type === 'change') {
    const r = store.getRequest(cfg, e.request);
    if (r) ids = [r.requester, r.final && r.final.editor, e.by];
  }
  return [...new Set(ids.filter(Boolean))];
}
const plain = (cfg, id) => avatars.nameOf(cfg, id);
// "Lily", "Lily with Hannah and Data team", "Lily and 3 others"
function byline(cfg, ids) {
  const [first, ...rest] = ids.map((id) => plain(cfg, id));
  if (!rest.length) return first;
  if (rest.length <= 2) return `${first} with ${rest.join(' and ')}`;
  return `${first} and ${rest.length} others`;
}
// Up to three faces overlapping, the type as a small badge on the first, "+N" for the rest.
function stack(cfg, ids, kind) {
  const shown = ids.length <= 3 ? ids : ids.slice(0, 2), more = ids.length - shown.length; // three faces fit; past that, two and "+N"
  return `<span class="hstack">${shown.map((id) => avatars.face(cfg, id, id.startsWith('team:') ? 22 : 26)).join('')}${more > 0 ? `<span class="hmore" title="${esc(ids.slice(shown.length).map((id) => plain(cfg, id)).join(', '))}">+${more}</span>` : ''}<span class="hbadge" title="${TYPES[kind]}">${ICON[kind]}</span></span>`;
}

// Every metric this one is built from, at any depth (FR-33).
function inputsOf(index, id, seen = new Set()) {
  for (const r of (index.metrics[id] || { references: [] }).references) if (!seen.has(r)) { seen.add(r); inputsOf(index, r, seen); }
  return seen;
}

function collect(cfg, index, m, connected) {
  const own = store.listTimeline(cfg, m.id).map((e) => ({ e, from: m.id }));
  if (!connected) return own;
  const inputs = inputsOf(index, m.id);
  const more = [];
  for (const id of Object.keys(index.metrics)) {
    if (id === m.id) continue;
    for (const e of store.listTimeline(cfg, id)) if (inputs.has(id) || (e.also_on || []).includes(m.id)) more.push({ e, from: id });
  }
  return own.concat(more);
}

// Weekly values over the whole data window, for the strip behind the pins.
async function strip(cfg, m) {
  const date = ((cfg.canvas || {}).date || {})[m.dataset];
  if (!date) return null;
  const r = await anfra.query(cfg.anfra.url, m.dataset, `explore { dimensions { t: ${date} | week() } measures { v: ${m.name} } sorts { t asc } }`);
  return r.rows.map((x) => ({ t: String(x.t).slice(0, 10), v: x.v })).filter((x) => x.v !== null);
}

function stripSvg(points, items) {
  if (!points || points.length < 2) return '';
  const W = 600, H = 64, P = 4;
  const t0 = Date.parse(points[0].t), t1 = Date.parse(points[points.length - 1].t) + 6 * 864e5;
  const x = (d) => P + ((Math.min(Math.max(Date.parse(d), t0), t1) - t0) / (t1 - t0)) * (W - 2 * P);
  const vs = points.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const y = (v) => H - 14 - ((v - lo) / (hi - lo || 1)) * (H - 22);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const marks = items.map(({ e, from }) => {
    const id = `${from}#${e.id}`, a = x(dayOf(e));
    const band = e.end ? `<rect class="hband" x="${a.toFixed(1)}" y="2" width="${Math.max(3, x(e.end) - a).toFixed(1)}" height="${H - 14}"/>` : '';
    return `<g class="hpin k-${kindOf(e)}" data-eid="${esc(id)}"><title>${esc(headOf(e))}</title>${band}<line x1="${a.toFixed(1)}" x2="${a.toFixed(1)}" y1="2" y2="${H - 2}"/></g>`;
  }).join('');
  const first = points[0].t, last = points[points.length - 1].t;
  return `<svg class="hstrip" viewBox="0 0 ${W} ${H + 12}" preserveAspectRatio="none" role="img" aria-label="Trend with history pins"><path class="hline" d="${line}"/>${marks}
<text x="${P}" y="${H + 10}">${short(first)}, ${first.slice(0, 4)}</text><text x="${W - P}" y="${H + 10}" text-anchor="end">${short(last)}, ${last.slice(0, 4)}</text></svg>`;
}

function valueChip(e, format) {
  if (e.type === 'change') return `<b>${esc(fmt(e.value, format))}</b><small>was ${esc(fmt(e.valueBefore, format))}</small>`;
  if (e.value === undefined || e.value === null) return '';
  const d = delta(e.valuePrev, e.value, format);
  const vs = e.compare === 'year' ? 'vs last year' : 'vs before';
  return `<b>${esc(fmt(e.value, format))}</b>${d.text === '–' ? '' : `<small>${d.text === 'no change' ? 'no change' : `<span class="ar">${e.value > e.valuePrev ? '▲' : '▼'}</span>${esc(d.text.slice(1))}`} ${vs}</small>`}`;
}

function row(cfg, index, { e, from }, m, hl) {
  const k = kindOf(e);
  const src = index.metrics[from] || m;
  const id = `${from}#${e.id}`;
  let follows = '';
  if (e.follows) {
    const [fm, fid] = e.follows.split('#');
    const t = store.listTimeline(cfg, fm).find((x) => x.id === fid);
    if (t) follows = `<div class="hfollow">follows <button class="link" data-open="metric:${esc(fm)}:insights:${esc(fid)}">${esc(headOf(t))}</button></div>`;
  }
  const ids = who(cfg, e);
  const meta = [span(e), TYPES[k], e.status, byline(cfg, ids), from !== m.id ? `from ${src.label}` : ''].filter(Boolean).map(esc).join(' · ');
  const search = [headOf(e), e.detail, TYPES[k], ids.map((id) => plain(cfg, id)).join(' '), src.label].filter(Boolean).join(' ').toLowerCase();
  return `<div class="hrow k-${k}${from !== m.id ? ' conn' : ''}${hl === id ? ' hl' : ''}" data-eid="${esc(id)}" data-search="${esc(search)}">
${stack(cfg, ids, k)}
<div class="hmain"><div class="hhead">${esc(headOf(e))}</div>${e.detail ? `<div class="hdetail">${esc(e.detail)}</div>` : ''}<div class="hmeta">${meta}</div>${follows}</div>
<div class="hval">${valueChip(e, src.format)}</div></div>`;
}

function addForm(cfg, m, items, post, me) {
  const typeDd = dropdown({
    name: 'htype', field: 'type', selected: 'decision', label: '<span class="dd-label">Decision</span>',
    groups: [{ options: [{ value: 'event', label: 'Event' }, { value: 'decision', label: 'Decision' }, { value: 'learning', label: 'Learning', sub: 'hypothesis' }, { value: 'learning-confirmed', label: 'Learning', sub: 'confirmed' }] }],
  });
  const opts = items.filter(({ e }) => e.type !== 'change').map(({ e, from }) => ({ value: `${from}#${e.id}`, label: headOf(e).slice(0, 60), sub: span(e) }));
  const followDd = dropdown({
    name: 'hfollow', field: 'follows', selected: '', search: opts.length > 8, label: '<span class="dd-label">Follows nothing</span>',
    groups: [{ options: [{ value: '', label: 'Follows nothing' }, ...opts] }],
  });
  const others = [...cfg.people.filter((p) => p.id !== me).map((p) => p.id), ...teams(cfg).map((t) => `team:${t}`)];
  const chips = others.map((id) => `<label class="wchip"><input type="checkbox" name="with_${esc(id)}">${avatars.face(cfg, id, 22)}<span>${esc(plain(cfg, id))}</span></label>`).join('');
  return `<form class="addform hform" hidden data-post="${post}" data-next="metric:${esc(m.id)}:insights">
<div class="hfrow">${typeDd}<input type="text" name="headline" maxlength="90" placeholder="Headline" required></div>
<input type="text" name="detail" placeholder="So what (optional)">
<div class="hfrow"><label class="hdate">From <input type="date" name="date"></label><label class="hdate">To <input type="date" name="end"></label><label class="hcheck"><input type="checkbox" name="compare" value="year"> vs last year</label></div>
<div class="hfrow">${followDd}</div>
<div class="hfrow hwith"><span class="hlabel">With</span>${chips}</div>
<div class="actions"><button class="primary">Add to history</button><small class="muted">Saves the value for these dates.</small><span class="ferr"></span></div></form>`;
}

// opts: { filter, connected, hl }. Returns { list, form } for the panel's History tab.
async function render(cfg, index, m, opts) {
  const filter = FILTERS.some(([k]) => k === opts.filter) ? opts.filter : 'all';
  const all = collect(cfg, index, m, opts.connected).filter(({ e }) => kindOf(e));
  const shown = all.filter(({ e }) => filter === 'all' || kindOf(e) === filter)
    .sort((a, b) => dayOf(b.e).localeCompare(dayOf(a.e)) || String(b.e.at).localeCompare(String(a.e.at)));
  const points = await strip(cfg, m).catch(() => null);
  // The toggle only exists when other metrics have something to add (FR-33).
  const sources = [...new Set(collect(cfg, index, m, true).map((x) => x.from).filter((id) => id !== m.id))].map((id) => index.metrics[id].label);
  const hint = `Also shows entries from ${sources.length > 1 ? `${sources.slice(0, -1).join(', ')} and ${sources[sources.length - 1]}` : sources[0]}`;
  const toggle = sources.length ? `<div class="vtoggle seg" role="group" aria-label="Which entries">${[['0', 'This metric', 'Only entries logged on this metric'], ['1', 'Relevant', hint]].map(([v, t, tip]) => `<button type="button" data-pick="hc:${v}" title="${esc(tip)}" aria-pressed="${String(opts.connected ? v === '1' : v === '0')}">${t}</button>`).join('')}</div>` : '';
  const ctl = `<div class="hctl">${dropdown({
    name: 'hf', selected: filter, label: `<span class="dd-label">${FILTERS.find(([k]) => k === filter)[1]}</span>`,
    groups: [{ options: FILTERS.map(([value, label]) => ({ value, label })) }],
  })}${toggle}</div>`;
  let rail = '', month = '';
  for (const it of shown) {
    const d = dayOf(it.e), mo = `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
    if (mo !== month) { rail += `<div class="hmonth">${mo}</div>`; month = mo; }
    rail += row(cfg, index, it, m, opts.hl ? `${m.id}#${opts.hl}` : '');
  }
  const list = `${ctl}${stripSvg(points, shown)}<div class="hrail">${rail || '<p class="muted pad0">Nothing here yet. Use + to add the first entry.</p>'}</div>`;
  return { list, form: addForm(cfg, m, all, `/api/m/${encodeURIComponent(m.id)}/entry`, opts.me) };
}

// The add form's fields → addHistoryEntry's (null when the post is not a history entry, e.g. a comment).
function fromForm(body) {
  if (!body.type) return null;
  const confirmed = body.type === 'learning-confirmed';
  return {
    type: confirmed ? 'learning' : body.type, status: confirmed ? 'confirmed' : 'hypothesis',
    headline: body.headline, detail: body.detail, date: body.date || undefined, end: body.end || null,
    compare: body.compare, follows: body.follows || null,
    with: Object.keys(body).filter((k) => k.startsWith('with_')).map((k) => k.slice(5)),
  };
}

module.exports = { render, fromForm };
