const { esc, fmt, delta, when, dropdown } = require('./ui');
const { viz, xLabel } = require('./viz');
const { person, canApprove, approvers, describeSelectors, owns } = require('./config');
const { canEdit } = require('./flow');
const gitmod = require('./git');
const avatars = require('./avatars');

function chg(a, b, format) {
  const d = delta(a, b, format);
  if (d.text === '–') return '';
  if (d.text === 'no change') return '<span class="chg">no change</span>';
  return `<span class="chg"><span class="ar">${b > a ? '▲' : '▼'}</span>${esc(d.text.slice(1))}</span>`;
}

const nameOf = (cfg, id) => (person(cfg, id) || { name: id }).name;
const stateChip = (s) => `<span class="chip ${s === 'applied' ? 'blue' : s === 'rejected' ? 'red' : s === 'in_review' ? 'amber' : ''}">${s.replace('_', ' ')}</span>`;
const day = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; };
const AVATAR = ['#1f4fd1', '#7b3fc4', '#0e7c86', '#c2410c', '#475569'];

const ICONS = {
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/></svg>',
  split: '<svg viewBox="0 0 24 24"><path d="M12 3v7M12 10l-6 5v6M12 10l6 5v6M3 18l3 3 3-3M15 18l3 3 3-3"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

function avatar(cfg, id) {
  if (person(cfg, id)) return avatars.face(cfg, id, 34);
  const i = cfg.people.findIndex((p) => p.id === id);
  const name = nameOf(cfg, id);
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<span class="av" style="background:${i < 0 ? AVATAR[4] : AVATAR[i % 4]}">${esc(initials)}</span>`;
}

function inboxData(cfg, me, requests) {
  const mine = [];
  for (const r of requests) {
    if (['requested', 'drafted'].includes(r.state) && canEdit(me)) mine.push({ r, why: r.state === 'requested' ? 'Needs a draft' : 'Draft to check and submit' });
    if (r.state === 'in_review' && canApprove(cfg, me, r.metric)) mine.push({ r, why: 'Waiting for your approval' });
    if (r.state === 'rejected' && r.requester === me.id) mine.push({ r, why: 'Rejected' });
  }
  const changes = requests.filter((r) => r.state === 'applied' && owns(cfg, me, r.metric)).slice(-5).reverse();
  return { mine, changes };
}

function notifications(ctx, index, requests) {
  const { cfg, me } = ctx;
  const { mine, changes } = inboxData(cfg, me, requests);
  const open = requests.filter((r) => !['applied', 'rejected'].includes(r.state)).length;
  const applied = requests.filter((r) => r.state === 'applied').length;
  const item = (r, why) => `<button class="note" data-open="request:${r.id}">${avatar(cfg, r.requester)}<span><b>${esc(r.sentence)}</b><small>${esc(index.metrics[r.metric] ? index.metrics[r.metric].label : r.metric)} · ${esc(why)}</small></span></button>`;
  const tick = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const tree = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="5" rx="1.5"/><rect x="3" y="16" width="6" height="5" rx="1.5"/><rect x="15" y="16" width="6" height="5" rx="1.5"/><path d="M12 8v4M6 16v-4h12v4"/></svg>';
  return `<div class="hero slim home"><div class="homehead">${avatars.face(cfg, me.id, 48)}<div><h2>Hi ${esc(me.name)}</h2><p>${esc(me.team)} team · ${esc(me.role)}</p></div></div>
<div class="stats"><div><b>${mine.length}</b><span>Waiting on you</span></div><div><b>${open}</b><span>Open requests</span></div><div><b>${applied}</b><span>Changes applied</span></div></div></div>
<div class="pbody"><h3>Waiting on you</h3>${mine.length ? mine.map(({ r, why }) => item(r, why)).join('') : `<div class="empty">${tick}<div><b>You're all caught up</b><span>Requests that need you will show up here.</span></div></div>`}
<h3>Changes to metrics you own</h3>${changes.length ? changes.map((r) => item(r, 'definition changed')).join('') : `<div class="empty">${tree}<div><b>No changes yet</b><span>Approved definition changes to your metrics will show up here.</span></div></div>`}
<div class="hint">${tree}<div><b>Select a metric</b><span>Click a card on the canvas for its breakdown, history and requests. Click it again to come back here.</span></div></div>
<button class="soft" data-open="new">+ Request a change</button></div>`;
}

function entry(cfg, e, m) {
  const head = `<div class="em"><b>${esc(nameOf(cfg, e.by))}</b><span class="date">${day(e.at)}</span></div>`;
  const search = esc([e.decided, e.text, e.reason, nameOf(cfg, e.by)].filter(Boolean).join(' ').toLowerCase());
  let body;
  if (e.type === 'change') {
    const c = gitmod.findCommit(cfg.repoPath, e.request);
    body = `<div class="et"><b>Definition changed.</b> ${esc(e.text)}</div>
<div class="facts"><span class="fact">${esc(fmt(e.valueBefore, m.format))} → ${esc(fmt(e.value, m.format))}</span>${c ? `<code>${esc(c)}</code>` : ''}<button class="link" data-open="request:${esc(e.request)}">request</button></div>
<div class="muted">${esc(e.reason)}</div>
<details><summary>Definitions</summary><div class="muted">was</div><pre>${esc(e.before)}</pre><div class="muted">now</div><pre class="after">${esc(e.definition)}</pre></details>`;
  } else if (e.type === 'decision') {
    body = `<div class="et"><b>${esc(e.decided)}</b>${e.text ? ` ${esc(e.text)}` : ''}</div>
<div class="facts"><span class="fact">Value that day ${esc(fmt(e.value, m.format))}</span></div>
<details><summary>Definition then</summary><pre>${esc(e.definition)}</pre></details>`;
  } else {
    body = `<div class="et">${esc(e.text)}</div>`;
  }
  return `<div class="entry" data-search="${search}">${avatar(cfg, e.by)}<div class="eb">${head}${body}</div></div>`;
}


const VIZ_ICONS = {
  area: '<svg viewBox="0 0 24 24"><path d="M3 18V9l5-3 5 4 4-5 4 3v10z"/></svg>',
  column: '<svg viewBox="0 0 24 24"><path d="M6 20V11M12 20V5M18 20v-7"/></svg>',
  table: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14"/></svg>',
};

// The hero card: header (period, breakdown dropdown, chart type), the number, then the chart or a table.
// `trend` is null when the dataset has no date to plot against; only the table is offered then.
function vizCard(m, fields, selectedId, type, data, trend, series, range) {
  const field = fields.find((f) => f.id === selectedId);
  const byModel = [];
  for (const f of fields) {
    let g = byModel.find((x) => x.title === f.model);
    if (!g) byModel.push((g = { title: f.model, options: [] }));
    g.options.push({ value: f.id, label: f.label });
  }
  const picker = fields.length ? dropdown({
    name: 'bd', groups: byModel, selected: selectedId, search: fields.length > 8, title: 'Break this metric down by a field',
    label: `<span class="dd-label">${ICONS.split}<span>${field ? esc(field.label) : 'Breakdown'}</span></span>`,
  }) : '';
  const types = trend ? ['area', 'column', 'table'] : ['table'];
  const kind = types.includes(type) ? type : types[0];
  const toggle = types.length > 1 ? `<div class="vtoggle" role="group" aria-label="Chart type">${types.map((t) => `<button type="button" data-pick="viz:${t}" aria-pressed="${t === kind}" title="${t[0].toUpperCase() + t.slice(1)}">${VIZ_ICONS[t]}</button>`).join('')}</div>` : '';
  const head = `<div class="vhead"><span class="vlabel">${esc(range.label)}</span><div class="vctl">${picker}${toggle}</div></div>
<div class="vtotal"><b>${esc(fmt(series.value, m.format))}</b>${range.cur ? `<small>${chg(series.prev, series.value, m.format)} vs prior period</small>` : ''}</div>`;

  const grainOf = (id) => (id.split('|')[1] || range.grain);
  let body;
  if (kind === 'table') {
    let rows;
    if (field && data) {
      const list = data.rows.slice();
      if (field.kind === 'date') list.sort((a, b) => a.key.localeCompare(b.key));
      else list.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
      const grain = grainOf(field.id);
      const share = data.additive && data.total && field.kind === 'text';
      const cmp = range.cur && field.kind === 'text';
      rows = list.map((r) => `<tr><td>${esc(field.kind === 'date' ? xLabel(r.key, grain) : r.key)}</td><td class="num">${esc(fmt(r.value, m.format))}</td>${share ? `<td class="num muted">${Math.round(((r.value || 0) / data.total) * 100)}%</td>` : ''}${cmp ? `<td class="num">${chg(r.prev, r.value, m.format)}</td>` : ''}</tr>`);
      body = `<table class="vt"><thead><tr><th>${esc(field.label)}</th><th class="num">${esc(m.label)}</th>${share ? '<th class="num">Share</th>' : ''}${cmp ? '<th class="num">vs prior</th>' : ''}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
    } else {
      rows = series.weeks.map((k, i) => `<tr><td>${esc(xLabel(k, series.grain))}</td><td class="num">${esc(fmt(series.spark[i], m.format))}</td></tr>`).reverse();
      body = `<table class="vt"><thead><tr><th>${{ day: 'Day', week: 'Week of', month: 'Month' }[series.grain]}</th><th class="num">${esc(m.label)}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    }
    if (!rows.length) body = '<p class="muted">No data for this period.</p>';
  } else {
    body = viz({ ...trend, type: kind, stacked: !field || field.kind === 'date' ? false : !!(data && data.additive), format: m.format });
  }
  return `<div class="vcard" id="bd">${head}<div class="vbody">${body}</div></div>`;
}

function metric(ctx, index, m, series, entries, requests, tab, period, bd, hist) {
  const { cfg } = ctx;
  const decisions = entries.filter((e) => e.type === 'decision').reverse();
  const comments = entries.filter((e) => e.type === 'comment').reverse();
  const changes = entries.filter((e) => e.type === 'change').reverse();
  const open = requests.filter((r) => !['applied', 'rejected'].includes(r.state)).reverse();
  const link = (id) => `<button class="link" data-open="metric:${id}">${esc(index.metrics[id].label)}</button>`;
  const s = series.spark;

  const owner = cfg.metrics[m.id] ? cfg.metrics[m.id].owner.replace('team:', '') + ' team' : 'nobody';
  const hero = `<div class="hero">
<div class="htop"><div class="hicon">${ICONS.bulb}</div></div>
<h2>${esc(m.label)}</h2>
<p>Owned by ${esc(owner)}. Changes need ${esc(describeSelectors(cfg, approvers(cfg, m.id)) || 'no one')}.</p>
${open.length ? `<p class="oreq">${open.length} open request${open.length > 1 ? 's' : ''}: <button class="link" data-open="request:${open[0].id}">${esc(open[0].sentence)}</button></p>` : ''}
${bd}
<div class="hfoot"><button class="abouttog" type="button" data-toggle="aboutbox" aria-expanded="false"><svg viewBox="0 0 12 12"><path d="M4.5 2.5l3.5 3.5-3.5 3.5"/></svg>About this metric</button>
<button class="mini" data-open="new:${m.id}" title="Ask for a change to this definition">Request a change</button></div>
<div class="aboutbox" hidden><pre>${esc(m.definition)}</pre>
<dl class="agrid"><dt>Built from</dt><dd><span>${m.references.length ? m.references.map(link).join(', ') : 'source columns'}</span></dd>
<dt>Feeds</dt><dd><span>${m.referencedBy.length ? m.referencedBy.map(link).join(', ') : 'none'}</span></dd>
<dt>Used in</dt><dd><span>${m.usedBy.length ? m.usedBy.map((q) => esc(`${q.appTitle} · ${q.label}`)).join('<br>') : 'none detected'}</span></dd>
<dt>Id</dt><dd><code>${esc(m.id)}</code></dd></dl></div></div>`;

const tabs = [['insights', ICONS.history, 'History'], ['comments', ICONS.chat, `Comments${comments.length ? ` ${comments.length}` : ''}`], ['changes', ICONS.flag, 'Requests']];
  const tabBar = `<div class="tabs">${tabs.map(([k, icon, t]) => `<button data-open="metric:${m.id}:${k}" aria-pressed="${k === tab}">${icon}<span>${t}</span></button>`).join('')}</div>`;
  const post = `/api/m/${encodeURIComponent(m.id)}/entry`;
  let list, form = '', placeholder;
  if (tab === 'comments') {
    placeholder = 'Search comments';
    form = `<form class="addform" hidden data-post="${post}" data-next="metric:${m.id}:comments"><textarea name="note" rows="2" placeholder="Add a comment" required></textarea><input type="hidden" name="decided" value="">
<div class="actions"><button class="primary">Comment</button><span class="ferr"></span></div></form>`;
    list = comments.length ? comments.map((e) => entry(cfg, e, m)).join('') : '<p class="muted pad0">No comments yet.</p>';
  } else if (tab === 'changes') {
    placeholder = 'Search changes';
    list = `${open.length ? open.map((r) => `<button class="note" data-open="request:${r.id}">${avatar(cfg, r.requester)}<span><b>${esc(r.sentence)}</b><small>${stateChip(r.state)} requested by ${esc(nameOf(cfg, r.requester))}</small></span></button>`).join('') : ''}
${changes.length ? changes.map((e) => entry(cfg, e, m)).join('') : '<p class="muted pad0">No changes since the log started.</p>'}`;
  } else {
    placeholder = 'Search history';
    ({ list, form } = hist);
  }
  const plus = tab === 'changes'
    ? `<button class="plus" data-open="new:${m.id}" title="Request a change">+</button>`
    : `<button class="plus" data-toggle="addform" title="Add">+</button>`;
  return `${hero}${tabBar}<div class="pbody"><div class="tbar"><label class="search">${ICONS.search}<input type="search" placeholder="${placeholder}"></label>${plus}</div>${form}<div class="entries">${list}</div></div>`;
}

function newRequest(ctx, index, metricId) {
  return `<div class="hero slim"><div class="htop"><div class="hicon">${ICONS.flag}</div>${metricId ? `<button class="mini" data-open="metric:${metricId}">Back</button>` : ''}</div>
<h2>Request a change</h2><p>Say what is wrong in plain words. An analyst drafts the new definition; in this concept the draft is simulated for three sentences.</p></div>
<div class="pbody"><form data-post="/api/requests">
<textarea name="sentence" rows="3" placeholder="Revenue shouldn't include refunded orders" required></textarea>
<label class="f">Metric</label>
${dropdown({ name: 'mt', field: 'metric', selected: metricId || '', title: 'Metric to change',
    label: `<span class="dd-label">${esc(metricId && index.metrics[metricId] ? index.metrics[metricId].label : 'From the sentence')}</span>`,
    groups: [{ options: [{ value: '', label: 'From the sentence' }, ...Object.values(index.metrics).map((x) => ({ value: x.id, label: x.label }))] }] })}
<div class="actions"><button class="primary">Send request</button><span class="ferr"></span></div></form>
<div class="sugg"><h3>Suggestions <small class="muted">for demo purposes</small></h3>
${ctx.cfg.simulated_drafts.map((d) => `<div class="sg"><span>${esc(d.sentence)}</span><button class="copy" type="button" data-copy="${esc(d.sentence)}">Copy</button></div>`).join('')}
<p class="muted small">These three get a simulated draft. Anything else goes to the analyst with no draft.</p></div></div>`;
}

function impact(cfg, index, r) {
  const i = r.impact;
  const rows = i.metrics.map((x) => `<tr><td>${esc(x.label)}${x.changed ? ' <span class="chip amber">changed</span>' : ''}</td><td class="num">${esc(fmt(x.old, x.format))}</td><td class="num">${esc(fmt(x.new, x.format))}</td><td class="num">${chg(x.old, x.new, x.format)}</td></tr>`).join('');
  const byDs = {};
  for (const x of i.metrics) { const ds = x.id.split('.')[0]; (byDs[ds] = byDs[ds] || []).push(x); }
  const datasets = Object.entries(byDs).map(([ds, ms]) => {
    const any = index.metrics[ms[0].id];
    const file = any ? require('path').relative(cfg.repoPath, any.file) : '';
    return `<div class="ds"><span><b>${esc(ds)}</b> <small class="muted">${esc(file)}</small></span><span class="muted">${ms.length} metric${ms.length > 1 ? 's' : ''} move</span></div>`;
  }).join('');
  const apps = {};
  for (const c of i.queries) (apps[c.appTitle] = apps[c.appTitle] || []).push(c);
  const dashboards = Object.entries(apps).map(([title, ws]) => `<div class="dash"><div class="dh"><span>${esc(title)}</span><span class="muted">${ws.length} widget${ws.length > 1 ? 's' : ''}</span></div>
${ws.map((c) => c.error ? `<div class="widget"><div class="wl">${esc(c.label)}</div><div class="down">${esc(c.error)}</div></div>`
    : `<div class="widget"><div class="wl">${esc(c.label)}</div>${c.items.map((x) => `<div class="kv"><span class="muted">${esc(x.label)}</span><span>${esc(fmt(x.old, x.format))} → ${esc(fmt(x.new, x.format))} ${chg(x.old, x.new, x.format)}</span></div>${c.by ? `<small class="muted">${x.moved ? `${x.moved} of ${x.points} ${esc(c.by)}s move · biggest ${esc(x.at)}` : 'no change'}</small>` : ''}`).join('')}</div>`).join('')}</div>`).join('');
  return `<h3>Affected metrics <small class="muted">· all time</small></h3><table class="imptable"><thead><tr><th>Metric</th><th class="num">Now</th><th class="num">After</th><th class="num">Change</th></tr></thead><tbody>${rows}</tbody></table>
<h3>Datasets</h3>${datasets}
<h3>Dashboards</h3>${dashboards || '<p class="muted">No dashboard widget uses these metrics.</p>'}
<p class="muted small">Computed by Anfra on a temporary copy. The live file changes only on approval.</p>`;
}

// Marks what changed between two definitions: tokens outside the common start and end are highlighted.
function diffDefs(a, b) {
  const tok = (x) => x.split(/(\s+|[()|,])/).filter((t) => t !== '');
  const A = tok(a), B = tok(b);
  let i = 0;
  while (i < A.length && i < B.length && A[i] === B[i]) i++;
  let j = 0;
  while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;
  const part = (T, cls) => `${esc(T.slice(0, i).join(''))}${T.length - i - j > 0 ? `<mark class="${cls}">${esc(T.slice(i, T.length - j).join(''))}</mark>` : ''}${esc(T.slice(T.length - j).join(''))}`;
  return { before: part(A, 'rm'), after: part(B, 'add'), same: a.trim() === b.trim() };
}

function request(ctx, index, r) {
  const { cfg, me } = ctx;
  const m = index.metrics[r.metric];
  let action = '';
  if (['requested', 'drafted'].includes(r.state)) {
    const def = r.draft ? r.draft.definition : m.definition;
    action = canEdit(me)
      ? `<h3>New definition ${r.draft && r.draft.simulated ? '<span class="chip amber">simulated draft</span>' : r.draft ? '' : '<span class="chip">no draft: write it</span>'}</h3>
<div class="muted small">Now</div><pre>${esc(m.definition)}</pre>
<form data-post="/api/r/${r.id}/submit" data-busy="Checking with Anfra…"><textarea name="definition" rows="4">${esc(def)}</textarea>
<input type="text" name="reason" placeholder="Reason (required)" required>
<div class="actions"><button class="primary">Check and submit</button><span class="ferr"></span></div></form>`
      : `<p class="wait">Waiting for an analyst to draft and submit.</p>`;
  } else if (r.state === 'in_review') {
    action = canApprove(cfg, me, r.metric)
      ? `<form class="decide" data-post="/api/r/${r.id}/approve" data-busy="Applying and committing…"><input type="text" name="note" placeholder="Note (required to reject)">
<div class="actions"><button class="primary">Approve and apply</button><button class="danger" formaction="/api/r/${r.id}/reject">Reject</button><span class="ferr"></span></div></form>`
      : `<p class="wait">Waiting on ${esc(describeSelectors(cfg, approvers(cfg, r.metric)))}.</p>`;
  }
  const commit = r.state === 'applied' ? gitmod.findCommit(cfg.repoPath, r.id) : null;
  const d = r.final ? diffDefs(r.before.definition, r.final.definition) : null;
  const defs = r.final ? `<h3>Definition</h3><div class="muted small">Before</div><pre>${d.before}</pre><div class="muted small">After${d.same ? ' <span class="chip">unchanged</span>' : ''}</div><pre class="after">${d.after}</pre>
<div class="muted small">Edited by ${esc(nameOf(cfg, r.final.editor))}: ${esc(r.final.reason)}</div>` : '';
  return `<div class="hero slim"><div class="htop"><div class="hicon">${ICONS.flag}</div><button class="mini" data-open="metric:${m.id}">${esc(m.label)}</button></div>
<h2>${esc(r.sentence)}</h2><div class="meta"><span class="who">${avatar(cfg, r.requester)}${esc(nameOf(cfg, r.requester))}</span><span>${day(r.history[0].at)}</span>${stateChip(r.state)}${commit ? `<code>${esc(commit)}</code>` : ''}</div></div>
<div class="pbody">${r.rejection ? `<div class="err">Rejected by ${esc(nameOf(cfg, r.rejection.by))}: ${esc(r.rejection.reason)}</div>` : ''}
${action}${defs}${r.impact ? impact(cfg, index, r) : ''}
<h3>History</h3><div class="rhist">${r.history.map((h) => `<div>${stateChip(h.state)}<span class="muted">${esc(nameOf(cfg, h.by))}</span><span class="muted">${when(h.at)}</span></div>`).join('')}</div></div>`;
}

function settings(ctx) {
  const slack = ctx.cfg.notifications.slack || {};
  return `<div class="hero slim"><h2>Settings</h2><p>Read from anfra-metric-log.yml.</p></div><div class="pbody">
<h3>Notifications</h3><div class="kv"><span>Slack</span><span class="chip">${slack.enabled ? 'on' : 'off'}</span></div>
<p class="muted small">Sends nothing in this concept. The bell is the only channel.</p>
<h3>People</h3>${ctx.cfg.people.map((p) => `<div class="kv person">${avatar(ctx.cfg, p.id)}<span>${esc(p.name)}</span><span class="muted">${esc(p.team)} · ${esc(p.role)}</span></div>`).join('')}
<h3>Credits</h3><p class="muted small">Faces: <a href="https://www.openpeeps.com/" target="_blank" rel="noopener">Open Peeps</a> by Pablo Stanley (CC0), drawn with <a href="https://www.dicebear.com/styles/open-peeps/" target="_blank" rel="noopener">DiceBear</a> (MIT).</p></div>`;
}

module.exports = { notifications, metric, vizCard, newRequest, request, settings, inboxData };
