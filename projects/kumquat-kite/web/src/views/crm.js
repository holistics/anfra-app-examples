// CRM: clients and opportunities. A project is created once at intake and carried through every stage; winning it
// does not create a second record. Pipeline estimates are kept by basis (total, monthly, range) and never summed
// together or counted as revenue.
import { esc, vnd, dueChip, fmtDateTime, toast, errorBanner, loading, emptyState, options, peopleOptions, formValues,
  markInvalid, saving, businessToday, qs, tip } from '../ui.js';
import { STAGE, STAGE_ORDER, DELIVERY, GROUP, ESTIMATE, CLIENT_TYPE, SOURCE, label } from '../labels.js';
import { newRequestId } from '../../../shared/api.mjs';
import { renderConflict } from './conflict.js';

export async function render(el, ctx, parts, params) {
  if (parts[0] === 'new') return intake(el, ctx, params);
  if (parts[0] === 'client' && parts[1]) return client(el, ctx, parts[1]);
  return list(el, ctx, params);
}

const estimateText = (p) => (p.estimate_basis === 'range' ? `${vnd(p.estimate_low)} – ${vnd(p.estimate_high)}`
  : p.estimate_basis === 'monthly' ? `${vnd(p.estimated_amount)}/month` : p.estimate_basis === 'total' ? vnd(p.estimated_amount) : '<span class="muted">—</span>');

async function list(el, ctx, params) {
  el.innerHTML = loading('Loading opportunities and projects…');
  let projects;
  try { projects = await ctx.api.projects(); } catch (e) { el.innerHTML = errorBanner(e); return; }
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const stage = params.get('stage') ?? '';
  const mine = params.get('mine') === '1';
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shown = projects.filter((p) => (!q || [p.project_ref, p.job_code, p.title, p.client?.display_name].some((v) => norm(v).includes(norm(q))))
    && (!stage || p.commercial_stage === stage) && (!mine || p.owner_id === ctx.session.id || p.account_owner_id === ctx.session.id));
  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, projects.filter((p) => p.commercial_stage === s).length]));
  const byBasis = Object.fromEntries(Object.keys(ESTIMATE).map((b) => [b, projects.filter((p) => p.estimate_basis === b && !['won', 'lost'].includes(p.commercial_stage)).length]));
  const routine = ctx.has('bd', 'account', 'admin');
  el.innerHTML = `<div class="row spread"><div><div class="title-row"><h1>Clients & opportunities</h1>${tip('Add an opportunity once: client, stage, owner, next action and due date. When it is won, the same record becomes the project, so nothing is typed twice.', { step: 1 })}</div><p class="sub">One record per opportunity, from the first conversation to the closed project.</p></div>
      ${routine ? '<a class="btn primary" href="#/crm/new">+ Quick intake</a>' : ''}</div>
    <section class="card section"><div class="row">${STAGE_ORDER.map((s) => `<a class="chip ${stage === s ? 'brand' : ''}" href="#/crm?stage=${s}">${esc(STAGE[s])} · ${byStage[s]}</a>`).join('')}
      ${stage ? '<a class="chip ghost" href="#/crm">Clear filter</a>' : ''}</div>
      <p class="small muted" style="margin-bottom:0">Open opportunities by estimate type: ${Object.entries(byBasis).map(([b, n]) => `${esc(ESTIMATE[b])} <b>${n}</b>`).join(' · ')} — the three types are never added together and are not revenue.</p></section>
    <form class="row section" id="crm-filter" role="search"><input name="q" type="search" value="${esc(params.get('q') ?? '')}" placeholder="Search by project ID, job code, project or client" style="flex:1;min-width:220px">
      <label class="f inline"><input type="checkbox" name="mine" ${mine ? 'checked' : ''}> Mine only</label><button class="btn" type="submit">Filter</button></form>
    <div class="table-wrap card" style="padding:0"><table><thead><tr><th>ID</th><th>Project · client</th><th>Stage</th><th>Delivery</th><th>Owner</th><th>Next action</th><th>Estimate</th></tr></thead>
      <tbody>${shown.map((p) => `<tr class="clickable" data-ref="${esc(p.project_ref)}" tabindex="0"><td class="nowrap"><b>${esc(p.project_ref)}</b><br><span class="small muted">${esc(p.job_code ?? 'no job code')}</span></td>
        <td><a href="#/p/${esc(p.project_ref)}/overview">${esc(p.title)}</a><br><span class="small muted">${esc(p.client?.display_name)}</span></td>
        <td>${esc(label(STAGE, p.commercial_stage))}</td><td class="small">${esc(label(DELIVERY, p.delivery_state))}</td><td class="small">${esc(ctx.personName(p.owner_id))}</td>
        <td class="small">${p.next_action ? `${esc(p.next_action)}<br>${dueChip(p.next_action_due)} ${esc(ctx.personName(p.next_action_owner_id))}` : '<span class="muted">—</span>'}</td>
        <td class="num small">${estimateText(p)}</td></tr>`).join('') || `<tr><td colspan="7">${emptyState(q ? `No project matches "${params.get('q')}".` : 'No opportunities yet.')}</td></tr>`}</tbody></table></div>`;
  qs('#crm-filter', el).addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const u = new URLSearchParams();
    if (f.get('q')) u.set('q', f.get('q'));
    if (stage) u.set('stage', stage);
    if (f.get('mine')) u.set('mine', '1');
    ctx.nav(`#/crm?${u}`);
  });
  el.querySelectorAll('tr[data-ref]').forEach((tr) => {
    const go = () => ctx.nav(`#/p/${tr.dataset.ref}/overview`);
    tr.addEventListener('click', (e) => { if (!e.target.closest('a')) go(); });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}

async function intake(el, ctx) {
  if (!ctx.has('bd', 'account', 'admin')) { el.innerHTML = errorBanner({ kind: 'forbidden', message: 'Only BD, Account or Admin take in new opportunities.' }); return; }
  const clients = await ctx.api.clients();
  const requestId = newRequestId();
  el.innerHTML = `<div class="title-row"><h1>Quick intake</h1>${tip('Enough to start: who the client is, what the opportunity is, who owns it and the next action with its due date. Everything else can follow later on the same record.', { step: 1 })}</div><p class="sub">Client, project, service, owner, next action and due date — enough to start. This record carries on into the project: nothing is entered twice.</p>
    <form class="form card" id="intake" novalidate>
      <fieldset class="full"><legend>Client</legend><div class="form">
        <label class="f">Existing client<select name="client_id"><option value="">— new client —</option>${clients.map((c) => `<option value="${esc(c.id)}">${esc(c.display_name)} · ${esc(c.client_ref)}</option>`).join('')}</select></label>
        <label class="f" data-new-client>New client name<input name="new_client_name"></label>
        <label class="f" data-new-client>Type<select name="new_client_type">${options(CLIENT_TYPE, 'brand')}</select></label></div></fieldset>
      <label class="f full">Project / opportunity<input name="title" required placeholder="For example: new product launch livestream"></label>
      <label class="f">Service group<select name="service_group">${options(GROUP, 'ecommerce')}</select></label>
      <label class="f">Stage<select name="commercial_stage">${options(Object.fromEntries(STAGE_ORDER.slice(0, 6).map((s) => [s, STAGE[s]])), 'lead')}</select></label>
      <label class="f">Owner<select name="owner_id">${peopleOptions(ctx.people, ctx.session.id, { roles: ['bd', 'account', 'admin'] })}</select></label>
      <label class="f full">Conversation note<textarea name="note"></textarea></label>
      <fieldset class="full"><legend>Next action (required)</legend><div class="form">
        <label class="f full">What needs doing<input name="next_action" required></label>
        <label class="f">Owner<select name="next_action_owner_id">${peopleOptions(ctx.people, ctx.session.id)}</select></label>
        <label class="f">Due<input name="next_action_due" type="date" required value="${esc(businessToday())}"></label>
        <label class="f full">Done when<input name="next_action_done_when" placeholder="For example: the client confirms the meeting"></label></div></fieldset>
      <fieldset class="full"><legend>Estimate (optional, VND net of VAT)</legend><div class="form">
        <label class="f">Type<select name="estimate_basis">${options(ESTIMATE, null, { blank: 'No estimate' })}</select></label>
        <label class="f" data-est="total monthly">Value<input name="estimated_amount" type="number" min="0" step="1"></label>
        <label class="f" data-est="range">From<input name="estimate_low" type="number" min="0" step="1"></label>
        <label class="f" data-est="range">To<input name="estimate_high" type="number" min="0" step="1"></label></div></fieldset>
      <div class="form-actions"><button class="btn primary" type="submit">Save opportunity</button><a class="btn" href="#/crm">Cancel</a></div><div class="full" data-role="result"></div></form>`;
  const form = qs('#intake', el);
  const sync = () => {
    form.querySelectorAll('[data-new-client]').forEach((l) => { l.hidden = Boolean(form.client_id.value); });
    form.querySelectorAll('[data-est]').forEach((l) => { l.hidden = !form.estimate_basis.value || !l.dataset.est.split(' ').includes(form.estimate_basis.value); });
  };
  form.addEventListener('change', sync); sync();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = formValues(form);
    const missing = ['title', 'next_action', 'next_action_owner_id', 'next_action_due'].filter((k) => !f[k]);
    if (!f.client_id && !f.new_client_name) missing.unshift('new_client_name');
    if (f.estimate_basis && f.estimate_basis !== 'range' && !f.estimated_amount) missing.push('estimated_amount');
    if (f.estimate_basis === 'range' && (!f.estimate_low || !f.estimate_high || Number(f.estimate_low) > Number(f.estimate_high))) missing.push('estimate_low');
    if (missing.length) { markInvalid(form, missing); qs('[data-role=result]', form).innerHTML = errorBanner({ kind: 'invalid', message: 'Required information is missing (marked in red). Nothing was saved.' }); return; }
    const payload = { title: f.title, service_group: f.service_group, commercial_stage: f.commercial_stage, owner_id: f.owner_id, note: f.note,
      next_action: f.next_action, next_action_owner_id: f.next_action_owner_id, next_action_due: f.next_action_due, next_action_done_when: f.next_action_done_when,
      estimate_basis: f.estimate_basis, estimated_amount: f.estimate_basis && f.estimate_basis !== 'range' ? f.estimated_amount : null,
      estimate_low: f.estimate_basis === 'range' ? f.estimate_low : null, estimate_high: f.estimate_basis === 'range' ? f.estimate_high : null };
    if (f.client_id) payload.client_id = f.client_id; else payload.new_client = { display_name: f.new_client_name, client_type: f.new_client_type };
    for (const k of Object.keys(payload)) if (payload[k] === null || payload[k] === undefined) delete payload[k];
    try {
      const r = await saving(qs('[type=submit]', form), () => ctx.api.intake(payload, requestId));
      toast(`${r.created ? 'Created' : 'Already exists:'} ${r.project_ref}`, 'ok');
      ctx.refreshCounts?.();
      ctx.nav(`#/p/${r.project_ref}/overview`);
    } catch (e) {
      qs('[data-role=result]', form).innerHTML = errorBanner(e, { actions: '<span class="small">The form keeps what you typed — submitting again will not create a duplicate.</span>' });
    }
  });
}

async function client(el, ctx, id) {
  el.innerHTML = loading();
  const [clients, projects, history] = await Promise.all([ctx.api.clients(), ctx.api.projects(), ctx.api.clientHistory(id)]);
  const c = clients.find((x) => x.id === id);
  if (!c) { el.innerHTML = errorBanner({ kind: 'not_found', message: 'Client not found.' }); return; }
  const mine = projects.filter((p) => p.client_id === id);
  const routine = ctx.has('bd', 'account', 'admin');
  el.innerHTML = `<h1>${esc(c.display_name)}</h1><p class="sub">${esc(c.client_ref)} · ${esc(label(CLIENT_TYPE, c.client_type))} · ${c.source_system ? `Source ${esc(c.source_system)} (${esc(c.source_key)})` : 'Created in the app'} · v${esc(c.version)}</p>
    <div class="grid2"><section class="card"><h2>Projects and opportunities (${mine.length})</h2>${mine.map((p) => `<p><a href="#/p/${esc(p.project_ref)}/overview"><b>${esc(p.project_ref)}</b> ${esc(p.title)}</a> · ${esc(label(STAGE, p.commercial_stage))}</p>`).join('') || emptyState('No projects yet.')}
      <h2 style="margin-top:16px">Client history</h2><ol class="timeline">${history.map((e) => `<li><time>${esc(fmtDateTime(e.occurred_at))}</time><div>${esc(e.summary)}<div class="who">${esc(ctx.personName(e.actor_id))} · ${esc(label(SOURCE, e.source))}</div></div></li>`).join('')}</ol></section>
    <section class="card"><h2>Client details</h2>${routine ? `<form class="form" id="client-form"><label class="f full">Display name<input name="display_name" required value="${esc(c.display_name)}"></label>
      <label class="f">Brand<input name="brand_name" value="${esc(c.brand_name ?? '')}"></label><label class="f">Type<select name="client_type">${options(CLIENT_TYPE, c.client_type)}</select></label>
      <label class="f">Owner<select name="owner_id">${peopleOptions(ctx.people, c.owner_id, { roles: ['bd', 'account', 'admin'] })}</select></label>
      <div class="form-actions"><button class="btn primary" type="submit">Save</button></div><div class="full" data-role="result"></div></form>` : '<p class="muted">Only BD, Account or Admin edit client details.</p>'}</section></div>`;
  const form = qs('#client-form', el);
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = formValues(form);
    const patch = Object.fromEntries(['display_name', 'brand_name', 'client_type', 'owner_id'].filter((k) => (f[k] ?? null) !== (c[k] ?? null)).map((k) => [k, f[k]]));
    if (!Object.keys(patch).length) return;
    try { await saving(qs('[type=submit]', form), () => ctx.api.updateClient(c.id, c.version, patch)); toast('Client saved', 'ok'); client(el, ctx, id); }
    catch (e) {
      if (e.kind === 'conflict') {
        const latest = (await ctx.api.clients()).find((x) => x.id === id);
        renderConflict(qs('[data-role=result]', form), { error: e, latest, draft: patch, original: c, labels: { display_name: 'Name', brand_name: 'Brand', client_type: 'Type', owner_id: 'Owner' },
          onReapply: async () => { await ctx.api.updateClient(latest.id, latest.version, patch); client(el, ctx, id); }, onDiscard: () => client(el, ctx, id) });
      } else qs('[data-role=result]', form).innerHTML = errorBanner(e);
    }
  });
}
