// Import & access (Admin): bring data in with the single import template or a full source snapshot (preview, then
// commit; repeated imports change nothing), manage roles, and reset the demo data to its starting state. Every table
// here shows a page at a time.
import { esc, fmtDateTime, fmtVnd, toast, errorBanner, loading, emptyState, saving, qs, pagedTable, tip } from '../ui.js';
import { ROLE } from '../labels.js';
import { buildImport, SNAPSHOT_FILES } from '../../../shared/snapshot.mjs';
import { templateCsv, buildTemplateImport, TEMPLATE_COLUMNS } from '../../../shared/template.mjs';

const TABS = [['import', 'Bring your data'], ['snapshot', 'Snapshot import'], ['roles', 'Roles'], ['demo', 'Demo data']];
const OUTCOME = { new: 'New', updated: 'Updated', unchanged: 'Unchanged', unresolved: 'Needs review' };
const ENTITY = { client: 'Client', project: 'Project', work_item: 'Work item', cost_line: 'Cost line', activity: 'CRM note' };

export async function render(el, ctx, [tab = 'import'], params) {
  if (!ctx.has('admin')) { el.innerHTML = errorBanner({ kind: 'forbidden', message: 'Only Admin imports data, manages roles and resets the demo.' }); return; }
  if (!TABS.some(([k]) => k === tab)) tab = 'import';
  el.innerHTML = `<h1>Import & access</h1><nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<a role="tab" href="#/admin/${k}" aria-selected="${k === tab}">${esc(t)}</a>`).join('')}</nav><div id="admin-body">${loading()}</div>`;
  const body = qs('#admin-body', el);
  if (tab === 'roles') return roles(body, ctx);
  if (tab === 'demo') return demo(body, ctx);
  if (tab === 'snapshot') return snapshot(body, ctx, params);
  return template(body, ctx);
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function countsTable(counts) {
  const cols = ['read', 'new', 'updated', 'unchanged', 'unresolved'];
  return `<div class="table-wrap"><table><thead><tr><th>Record</th>${cols.map((c) => `<th class="num">${esc(c === 'read' ? 'Read' : OUTCOME[c])}</th>`).join('')}</tr></thead><tbody>
    ${Object.entries(counts ?? {}).map(([e, c]) => `<tr><td>${esc(ENTITY[e] ?? e)}</td>${cols.map((k) => `<td class="num">${esc(c[k] ?? 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function rowsTable(container, rows) {
  pagedTable(container, { rows, pageSize: 15,
    head: '<th>Record</th><th>Source key</th><th>Outcome</th><th>Message</th><th>Raw row</th>',
    row: (r) => `<tr><td>${esc(ENTITY[r.entity] ?? r.entity)}</td><td class="mono">${esc(r.source_key)}</td>
      <td><span class="chip ${r.outcome === 'unresolved' ? 'warn' : r.outcome === 'new' ? 'ok' : 'ghost'}">${esc(OUTCOME[r.outcome] ?? r.outcome)}</span></td>
      <td class="small">${esc(r.message ?? '')}</td><td><details><summary class="small">show</summary><pre class="mono" style="white-space:pre-wrap">${esc(JSON.stringify(r.row ?? r.raw, null, 1))}</pre></details></td></tr>`,
    empty: emptyState('No rows.') });
}
function summary(counts) {
  const t = { read: 0, new: 0, updated: 0, unchanged: 0, unresolved: 0 };
  for (const c of Object.values(counts ?? {})) for (const k of Object.keys(t)) t[k] += c[k] ?? 0;
  return `Read <b>${t.read}</b> · new <b>${t.new}</b> · updated <b>${t.updated}</b> · unchanged <b>${t.unchanged}</b> · needs review <b>${t.unresolved}</b>`;
}

// The import runs of every kind, newest first; a click shows that run's rows (raw rows kept unchanged).
async function runsCard(card, ctx) {
  const batches = await ctx.api.importBatches();
  card.innerHTML = `<h2>Import runs (${batches.length})</h2><div data-runs></div><div data-run-rows></div>`;
  pagedTable(qs('[data-runs]', card), { rows: batches, pageSize: 8,
    head: '<th>Run</th><th>Source</th><th>Outcome</th>',
    row: (b) => `<tr class="clickable" data-batch="${esc(b.id)}" tabindex="0"><td class="ref">${esc(b.batch_ref)}<span class="sub">${esc(b.run_kind === 'commit' ? 'import' : 'preview')} · ${esc(fmtDateTime(b.run_at))}</span></td>
      <td>${esc(b.snapshot_label)}<span class="sub">${esc(b.source_system)} · data as of ${esc(fmtDateTime(b.source_as_of))}</span></td>
      <td class="small">${summary(b.counts)}${b.totals?.contract_value_net_vnd ? `<span class="sub">Contract values ${esc(fmtVnd(b.totals.contract_value_net_vnd))} VND</span>` : ''}</td></tr>`,
    empty: emptyState('No imports yet.'),
    onDraw: (host) => host.querySelectorAll('[data-batch]').forEach((tr) => {
      const open = async () => {
        const rows = await ctx.api.importRows(tr.dataset.batch);
        const out = qs('[data-run-rows]', card);
        out.innerHTML = '<h3 style="margin-top:12px">Rows of this run (raw rows kept unchanged)</h3><div data-rows></div>';
        rowsTable(qs('[data-rows]', out), rows);
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    }) });
}

// ---- Bring your data: the single import template --------------------------------------------------------------
async function template(body, ctx) {
  body.innerHTML = `<div class="stack pair-wide">
    <section class="card"><h2>Bring your data with one template ${tip('Keep using your sheet. Fill the template there, export it as CSV and import it here. Every row is matched by your own ID, so importing the same sheet again changes nothing.')}</h2>
      <ol class="small" style="padding-left:18px;margin-top:0">
        <li><b>Download the template</b>: one row per opportunity or project, with its client and next action.</li>
        <li><b>Fill it in your own tool</b>: Google Sheets, Excel, Lark Sheets, a Notion database or an Obsidian table — then export or save it as <b>CSV</b>.</li>
        <li><b>Preview, then import.</b> Rows that need fixing are listed with their fix; nothing is written until you import.</li></ol>
      <div class="row" style="margin-bottom:12px"><button class="btn blue" type="button" id="dl-template">Download the template (CSV)</button>
        <button class="btn" type="button" id="use-template-sample">Preview the template's sample rows</button></div>
      <div class="banner info small" style="margin-bottom:12px">This demo database takes <b>synthetic (sample) data only</b>: each row must say <span class="mono">synthetic</span> in <span class="mono">data_classification</span>.
        Real business data needs its own, approved deployment.</div>
      <form class="form" id="template-form">
        <label class="f full">Where is this sheet kept? <span class="hint">Keep the same name every time you import this sheet: its IDs belong to it.</span>
          <input name="source" value="My CRM sheet" maxlength="60" required></label>
        <label class="f full">Filled template (CSV)<input type="file" name="file" accept=".csv,text/csv"></label>
        <div class="form-actions"><button class="btn" type="submit" value="preview">Preview</button><button class="btn primary" type="submit" value="commit">Import</button></div></form>
      <div id="template-result"></div>
      <details style="margin-top:12px"><summary><b>Field guide</b> — ${TEMPLATE_COLUMNS.length} columns</summary>
        <div class="table-wrap"><table><thead><tr><th>Column</th><th>Required</th><th>Allowed values</th><th>What to put in it</th></tr></thead><tbody>
        ${TEMPLATE_COLUMNS.map((c) => `<tr><td class="mono">${esc(c.key)}</td><td>${c.required ? '<span class="chip warn">required</span>' : '<span class="muted small">optional</span>'}</td>
          <td class="small">${c.values ? esc(c.values.join(', ')) : '<span class="muted">—</span>'}</td><td class="small">${esc(c.help ?? '')}${c.example ? `<span class="sub">e.g. ${esc(c.example)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></details>
    </section>
    <section class="card" id="runs"></section></div>`;
  runsCard(qs('#runs', body), ctx);
  qs('#dl-template', body).addEventListener('click', () => download('kumquat-kite-import-template.csv', templateCsv()));
  let sample = null;
  qs('#use-template-sample', body).addEventListener('click', () => { sample = templateCsv(); qs('#template-form', body).file.value = ''; runTemplate(body, ctx, sample, false); });
  qs('#template-form', body).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const commit = ev.submitter?.value === 'commit';
    const file = ev.target.file.files[0];
    const text = file ? await file.text() : sample;
    if (!text) { qs('#template-result', body).innerHTML = errorBanner({ kind: 'invalid', message: 'Choose the filled template first (or preview the sample rows).' }); return; }
    await runTemplate(body, ctx, text, commit, ev.submitter);
  });
}

async function runTemplate(body, ctx, text, commit, button) {
  const out = qs('#template-result', body);
  const source = qs('#template-form', body).source.value.trim() || 'My CRM sheet';
  try {
    const built = await buildTemplateImport(text, ctx.people, { source });
    if (!built.rows) { out.innerHTML = errorBanner({ kind: 'invalid', message: built.issues[0].message }); return; }
    const good = built.rows.projects.length;
    const issues = built.issues.length ? `<div class="banner warn" role="alert"><b>${built.issues.length} fix(es) needed</b> — those rows are left out until fixed in your sheet.</div><div data-issues></div>` : '';
    if (!good) { out.innerHTML = `${issues}${errorBanner({ kind: 'invalid', message: 'No row is ready to import yet.' })}`; if (issues) issuesTable(out, built.issues); return; }
    const result = await saving(button, () => ctx.api.importSnapshot(built.meta, built.rows, commit));
    toast(`${result.batch_ref}: ${commit ? 'imported' : 'previewed'}`, 'ok');
    out.innerHTML = `<div class="banner ${commit ? 'ok' : 'info'}"><b>${esc(result.batch_ref)}</b> — ${commit ? 'imported' : 'preview: nothing written yet'} · ${built.read} row(s) read from the sheet,
        ${good} ready${built.issues.length ? `, ${built.issues.length} to fix` : ''}. Source <span class="mono">${esc(built.sourceSystem)}</span>.
        ${commit ? '' : '<br>Press <b>Import</b> to write the rows marked New.'} Re-importing the same sheet changes nothing; a later change to a row only updates its title — stage, owner, next action and estimates belong to the app once imported.</div>
      ${issues}${countsTable(result.counts)}<div data-result-rows style="margin-top:8px"></div>`;
    if (built.issues.length) issuesTable(out, built.issues);
    rowsTable(qs('[data-result-rows]', out), result.rows);
    if (commit) runsCard(qs('#runs', body), ctx);
  } catch (e) { out.innerHTML = errorBanner(e.kind ? e : { kind: 'invalid', message: e.message }); }
}
function issuesTable(out, issues) {
  pagedTable(qs('[data-issues]', out), { rows: issues, pageSize: 10,
    head: '<th class="num">Sheet row</th><th>Record</th><th>Column</th><th>Fix</th>',
    row: (i) => `<tr><td class="num">${esc(i.row ?? '—')}</td><td class="mono">${esc(i.record_id ?? '—')}</td><td class="mono">${esc(i.field ?? '—')}</td><td class="small">${esc(i.message)}</td></tr>` });
}

// ---- Snapshot import (advanced): a whole source snapshot folder ---------------------------------------------------
async function snapshot(body, ctx) {
  body.innerHTML = `<div class="stack pair-wide"><section class="card"><h2>Import a source snapshot ${tip('For a full export of an existing system: clients, projects, cost lines, work items and notes in separate files, with a mapping.json. Most teams use the single template instead.')}</h2>
      <p class="small muted">Pick every file of one snapshot folder (mapping.json and the CSV files). A preview writes no business record. A commit matches records only by source key (never by name or row position), keeps each raw row unchanged, and never overwrites a field the app owns. Importing the same snapshot again creates nothing.</p>
      <div class="row" style="margin-bottom:10px"><button class="btn blue" type="button" id="use-sample">Use the bundled sample snapshot (14 Oct 2026)</button>
        <span class="small muted" id="sample-note"></span></div>
      <form class="form" id="import-form"><label class="f full">…or pick snapshot files<input type="file" name="files" multiple accept=".csv,.json"></label>
        <div class="form-actions"><button class="btn" type="submit" value="preview">Preview</button><button class="btn primary" type="submit" value="commit">Import (commit)</button></div></form>
      <div id="import-result"></div></section>
    <section class="card" id="runs"></section></div>`;
  runsCard(qs('#runs', body), ctx);
  const form = qs('#import-form', body);
  let bundled = null;
  qs('#use-sample', body).addEventListener('click', async (ev) => {
    try {
      const token = await ctx.getToken();
      const names = ['mapping.json', ...SNAPSHOT_FILES];
      bundled = {};
      await saving(ev.currentTarget, async () => {
        for (const n of names) {
          const r = await fetch(`/snapshots/2026-10-14-synthetic/${n}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) throw new Error(`Could not load ${n} (${r.status})`);
          bundled[n] = await r.text();
        }
      });
      qs('#sample-note', body).textContent = `Loaded ${names.length} files. Press Preview, then Import.`;
    } catch (e) { bundled = null; qs('#import-result', body).innerHTML = errorBanner({ kind: 'network', message: e.message }); }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const commit = ev.submitter?.value === 'commit';
    const out = qs('#import-result', body);
    const files = {};
    for (const f of form.files.files) files[f.name] = await f.text();
    if (!Object.keys(files).length && bundled) Object.assign(files, bundled);
    if (!Object.keys(files).length) { out.innerHTML = errorBanner({ kind: 'invalid', message: 'Load the bundled snapshot or pick the snapshot files first.' }); return; }
    const unknown = Object.keys(files).filter((n) => n !== 'mapping.json' && !SNAPSHOT_FILES.includes(n));
    try {
      const personaIds = {};
      for (const p of ctx.config.personas) { const match = ctx.people.find((x) => x.email === p.email); if (match) personaIds[p.key] = match.user_id; }
      const { meta, rows } = await buildImport(files, personaIds);
      const result = await saving(ev.submitter, () => ctx.api.importSnapshot(meta, rows, commit));
      toast(`${result.batch_ref}: ${commit ? 'imported' : 'previewed'}`, 'ok');
      out.innerHTML = `<div class="banner ${commit ? 'ok' : 'info'}"><b>${esc(result.batch_ref)}</b> — ${commit ? 'imported' : 'preview (no business record written)'} · contract total ${esc(fmtVnd(result.totals.contract_value_net_vnd))} · cost ${esc(fmtVnd(result.totals.cost_amount_vnd))}
        ${unknown.length ? `<br>Skipped files that are not part of a snapshot: ${esc(unknown.join(', '))}` : ''}</div>${countsTable(result.counts)}<div data-result-rows style="margin-top:8px"></div>`;
      rowsTable(qs('[data-result-rows]', out), result.rows);
      if (commit) runsCard(qs('#runs', body), ctx);
    } catch (e) { out.innerHTML = errorBanner(e.kind ? e : { kind: 'invalid', message: e.message }); }
  });
}

// ---- Roles -----------------------------------------------------------------------------------------------------
async function roles(body, ctx) {
  await ctx.reloadPeople();
  const audit = await ctx.api.roleAudit();
  body.innerHTML = `<div class="grid2"><section class="card"><h2>Users and roles ${tip('Only Admin grants or revokes roles, and nobody can grant themselves Finance or Admin. The database checks this; the checkboxes only ask it.')}</h2>
    <p class="small muted">Admin is not automatically a Finance approver.</p><div data-users></div><div id="role-result"></div></section>
    <section class="card"><h2>Role changes</h2><div data-audit></div></section></div>`;
  pagedTable(qs('[data-users]', body), { rows: ctx.people, pageSize: 10,
    head: '<th>User</th><th>Roles</th>',
    row: (p) => `<tr><td><b>${esc(p.display_name)}</b><span class="sub">${esc(p.email)}</span></td>
      <td>${Object.keys(ROLE).map((r) => `<label class="f inline" style="display:inline-flex;margin-right:10px"><input type="checkbox" data-user="${esc(p.user_id)}" data-role="${r}" ${p.roles.includes(r) ? 'checked' : ''}> ${esc(ROLE[r])}</label>`).join('')}</td></tr>`,
    onDraw: (host) => host.querySelectorAll('[data-role]').forEach((cb) => cb.addEventListener('change', async () => {
      const out = qs('#role-result', body);
      try {
        if (cb.checked) await ctx.api.grantRole(cb.dataset.user, cb.dataset.role); else await ctx.api.revokeRole(cb.dataset.user, cb.dataset.role);
        toast('Role updated', 'ok');
        roles(body, ctx);
      } catch (e) { cb.checked = !cb.checked; out.innerHTML = errorBanner(e); }
    })) });
  pagedTable(qs('[data-audit]', body), { rows: audit ?? [], pageSize: 10,
    head: '<th>When</th><th>Change</th>',
    row: (a) => `<tr><td class="small nowrap">${esc(fmtDateTime(a.occurred_at))}</td><td class="small">${esc(ctx.personName(a.actor_id))} ${a.action === 'granted' ? 'granted' : 'revoked'} <b>${esc(ROLE[a.role] ?? a.role)}</b> ${a.action === 'granted' ? 'to' : 'from'} ${esc(ctx.personName(a.user_id))}</td></tr>`,
    empty: emptyState('No changes yet.') });
}

// ---- Demo data: reset to the starting state ---------------------------------------------------------------------
async function demo(body, ctx) {
  const resets = await ctx.api.demoResets().catch(() => []);
  body.innerHTML = `<div class="grid2"><section class="card"><h2>Reset the demo data ${tip('Puts every client, opportunity, project, task, money line, proposal, acceptance, receipt and import back to the demo’s starting point, in one database transaction. People and their accounts are kept.')}</h2>
      <p>Puts the business data back to the demo's starting state, so the next demo starts from the same story.</p>
      <ul class="small"><li>Clients, opportunities, projects, work, money lines, proposals, acceptance, receipts and import runs go back to the start.</li>
        <li>People keep their accounts; the six demo personas get their demo roles back. Nobody else's roles change.</li>
        <li>It runs in one database transaction and is logged here.</li>
        <li>Changes made since the demo started are lost: back them up first if you need them (<span class="mono">npm run backup</span>).</li></ul>
      <form id="reset-form" class="form"><label class="f inline full"><input type="checkbox" name="confirm"> I understand that changes made since the demo started will be lost.</label>
        <div class="form-actions"><button class="btn danger" type="submit">Reset demo data</button></div></form>
      <div id="reset-result"></div></section>
    <section class="card"><h2>Recent resets</h2><div data-resets></div></section></div>`;
  const drawResets = (rows) => pagedTable(qs('[data-resets]', body), { rows, pageSize: 5,
    head: '<th>When</th><th>By</th><th class="num">Rows restored</th>',
    row: (r) => `<tr><td class="small nowrap">${esc(fmtDateTime(r.reset_at))}</td><td class="small">${esc(ctx.personName(r.reset_by))}</td><td class="num">${esc(r.rows_restored)}</td></tr>`,
    empty: emptyState('Not reset yet.') });
  drawResets(resets);
  qs('#reset-form', body).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const out = qs('#reset-result', body);
    if (!ev.target.confirm.checked) { out.innerHTML = errorBanner({ kind: 'invalid', message: 'Tick the box to confirm the reset first.' }); return; }
    try {
      const r = await saving(ev.submitter, () => ctx.api.resetDemo());
      ev.target.confirm.checked = false;
      out.innerHTML = `<div class="banner ok" role="status"><b>Demo data reset.</b> ${esc(r.rows_restored)} rows restored to the starting state captured on ${esc(fmtDateTime(r.baseline_captured_at))}.</div>`;
      toast('Demo data reset to its starting state', 'ok');
      ctx.refreshCounts?.();
      drawResets(await ctx.api.demoResets().catch(() => []));
    } catch (e) { out.innerHTML = errorBanner(e); }
  });
}
