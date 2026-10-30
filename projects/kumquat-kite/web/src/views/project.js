// Job 360: one project record from first conversation to closed job — Overview, Work, Money, Documents, History.
// Commercial stage, delivery state, financial verification and payment state are four separate fields, shown and
// changed separately. Routine fields save with a version check; money changes go through Finance review.
import { esc, link, vnd, dueChip, fmtDate, fmtDateTime, fmtVnd, toast, errorBanner, loading, emptyState, options, peopleOptions,
  formValues, markInvalid, saving, safeUrl, businessToday, fromLocalInput, qs, tip } from '../ui.js';
import { STAGE, DELIVERY, FIN_VERIFY, PAYMENT, BRIEF, KIND, GROUP, TEAM, WORK, ESTIMATE, COST_STAGE, CR_STATUS, DOC_TYPE, SOURCE, EVENT,
  CHECK_ICON, CHECK_STATUS, ROLE, label } from '../labels.js';
import { newRequestId } from '../../../shared/api.mjs';
import { renderConflict } from './conflict.js';
import { workCard, bindWork } from './work.js';
import { mountPanel } from '../anfra-host.js';
import { mountIsland } from '../islands.js';
import { GUIDE } from '../../../shared/readiness-guide.mjs';

let panel = null;
let islands = [];
export async function leave() { panel?.unmount(); panel = null; islands.forEach((i) => i.unmount()); islands = []; }
// Keeps a mounted island for leave(), unless the screen changed while it loaded.
const keep = (slot) => (i) => { if (slot.isConnected) islands.push(i); else i.unmount(); };

const TABS = [['overview', 'Overview'], ['work', 'Work'], ['money', 'Money'], ['documents', 'Documents'], ['history', 'History']];
const FIELD_LABELS = { title: 'Project', commercial_stage: 'Commercial stage', contract_reference: 'Contract reference', contract_signed_date: 'Contract signed date',
  lost_reason: 'Reason lost', delivery_state: 'Delivery state', owner_id: 'Owner', account_owner_id: 'Account owner',
  brief_status: 'Brief', brief_url: 'Brief link', promised_delivery_date: 'Promised delivery date', estimate_basis: 'Estimate type',
  estimated_amount: 'Estimated value', estimate_low: 'Estimate from', estimate_high: 'Estimate to', service_group: 'Service group',
  project_kind: 'Project kind', next_action: 'Next action', next_action_owner_id: 'Next action owner', next_action_due: 'Next action due',
  next_action_done_when: 'Done when', latest_note: 'New note' };
const ROUTINE_FIELDS = ['title', 'commercial_stage', 'contract_reference', 'contract_signed_date', 'lost_reason', 'delivery_state', 'owner_id',
  'account_owner_id', 'brief_status', 'brief_url', 'promised_delivery_date', 'estimate_basis', 'estimated_amount', 'estimate_low', 'estimate_high',
  'service_group', 'project_kind'];
const NEXT_FIELDS = ['next_action', 'next_action_owner_id', 'next_action_due', 'next_action_done_when', 'latest_note'];

export async function render(el, ctx, [ref, tab = 'overview'], params) {
  await leave();
  el.innerHTML = loading('Opening the project…');
  let p;
  try { p = await ctx.api.findProject(ref); } catch (e) { el.innerHTML = errorBanner(e); return; }
  if (!p) { el.innerHTML = `${errorBanner({ kind: 'not_found', message: `No project has the internal ID or job code "${ref}".` })}<a class="btn" href="#/crm">Back to the list</a>`; return; }
  const rerender = () => render(el, ctx, [p.project_ref, tab]);
  el.innerHTML = header(p, ctx) + `<nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<a role="tab" href="#/p/${esc(p.project_ref)}/${k}" aria-selected="${k === tab}">${esc(t)}</a>`).join('')}</nav><div id="tab"></div>`;
  const host = qs('#tab', el);
  if (tab === 'work') await workTab(host, p, ctx);
  else if (tab === 'money') await moneyTab(host, p, ctx, rerender);
  else if (tab === 'documents') await documentsTab(host, p, ctx);
  else if (tab === 'history') await historyTab(host, p, ctx);
  else await overviewTab(host, p, ctx, rerender);
  // A link from the readiness help (?focus=…) lands on the control that completes the step. It runs after the
  // router has focused the view, so the control keeps the focus.
  const focus = params?.get('focus');
  if (focus) setTimeout(() => focusTarget(host, focus), 0);
}

// Where each ?focus= key lands; the first match wins. A key whose control the viewer does not have explains why.
const FOCUS = {
  next_action: ['#update-form [name=next_action]'], commercial_stage: ['#update-form [name=commercial_stage]'],
  brief_status: ['#update-form [name=brief_status]'], account_owner_id: ['#update-form [name=account_owner_id]'],
  job_code: ['#jobcode-form [name=job_code]', '#jobcode-form'], new_service_line: ['[data-propose="new_service_line"]'],
  new_cost_line: ['[data-propose="new_cost_line"]'], money_lines: ['#money-lines'], acceptance: ['#acceptance-slot details'],
  suggestions: ['#suggestions'],
};
function focusTarget(root, key) {
  const el = (FOCUS[key] ?? []).map((sel) => root.querySelector(sel)).find(Boolean);
  if (!el) {
    if (FOCUS[key]) toast('This step is not available to your role here: the help on the readiness check says who does it.', '');
    return;
  }
  let target = el;
  if (el.tagName === 'DETAILS') { el.open = true; target = el.querySelector('input, select, textarea') ?? el; }
  const box = target.closest('label') ?? target;
  if (box.hidden) box.hidden = false;
  if (!target.matches('a[href], button, input, select, textarea, summary, [tabindex]')) target.setAttribute('tabindex', '-1');
  target.scrollIntoView({ block: 'center' });
  target.focus({ preventScroll: true });
  box.classList.add('focus-target');
  setTimeout(() => box.classList.remove('focus-target'), 3000);
}

function header(p, ctx) {
  const src = p.source_system ? `Source: <b>${esc(p.source_system)}</b> · key <span class="mono">${esc(p.source_key)}</span> · source data as of ${esc(fmtDateTime(p.source_as_of))}, imported ${esc(fmtDateTime(p.imported_at))}`
    : 'Created in the app';
  const state = (t, v, cls) => `<div class="state"><small>${esc(t)}</small><span class="chip ${cls}">${esc(v)}</span></div>`;
  const fvCls = { verified: 'ok', pending_review: 'warn', not_submitted: 'ghost' }[p.financial_verification];
  const payCls = { fully_received: 'ok', overdue: 'bad', not_due: 'ghost' }[p.payment_state] ?? 'info';
  return `<div class="row spread"><div><div class="title-row"><h1>${esc(p.title)}</h1>${tip('Job 360: one record from first conversation to closed job. Commercial stage, delivery, financial verification and payment are four separate states, each moved by its own owner.')}</div>
      <p class="sub"><b>${esc(p.project_ref)}</b> · ${p.job_code ? `Job code <b>${esc(p.job_code)}</b>` : '<span class="chip warn">No job code yet</span>'} ·
        Client <a href="#/crm/client/${esc(p.client?.id)}">${esc(p.client?.display_name)}</a> · ${esc(label(KIND, p.project_kind))}</p></div>
      <div class="small muted right">Version v${esc(p.version)} · saved ${esc(fmtDateTime(p.updated_at))}<br>by ${esc(ctx.personName(p.updated_by))}</div></div>
    <div class="states" aria-label="Four independent states">
      ${state('Commercial stage', label(STAGE, p.commercial_stage), p.commercial_stage === 'won' ? 'ok' : p.commercial_stage === 'lost' ? 'bad' : 'info')}
      ${state('Delivery', label(DELIVERY, p.delivery_state), 'info')}
      ${state('Financial verification', label(FIN_VERIFY, p.financial_verification), fvCls)}
      ${state('Payment', label(PAYMENT, p.payment_state), payCls)}</div>
    <p class="small muted" style="margin:8px 0 0">${src} · Classification: <span class="chip warn">${esc(p.data_classification === 'synthetic' ? 'sample data' : p.data_classification)}</span></p>`;
}

// ---- Overview -------------------------------------------------------------------------------------------------
async function overviewTab(host, p, ctx, rerender) {
  host.innerHTML = loading();
  const [readiness, pending, milestones, work] = await Promise.all([ctx.api.readiness(p.id), ctx.api.changeRequests({ projectId: p.id, status: 'pending' }),
    ctx.api.acceptance(p.id), ctx.api.workItems({ projectId: p.id })]);
  const open = readiness.filter((r) => ['missing', 'blocked', 'unknown'].includes(r.status));
  const routine = ctx.has('bd', 'account', 'admin');
  const actionOwner = p.next_action_owner_id === ctx.session.id;
  const estimate = p.estimate_basis === 'range' ? `${vnd(p.estimate_low)} – ${vnd(p.estimate_high)} (range)`
    : p.estimate_basis ? `${vnd(p.estimated_amount)} (${esc(label(ESTIMATE, p.estimate_basis).toLowerCase())})` : '<span class="muted">No estimate</span>';
  host.innerHTML = `<div class="grid2">
    <div class="stack">
      <section class="card" id="readiness"><h2>Delivery readiness — ${open.length ? `<span class="chip warn">${open.length} open check(s)</span>` : '<span class="chip ok">ready</span>'} ${tip('Each open check has a reason and an owner. Fixing one leaves the others in view: a job is ready only when every check is.')}</h2>
        <div id="readiness-list"><ul class="checks">${readiness.map((r) => `<li class="${esc(r.status)}"><span class="ic" aria-hidden="true">${CHECK_ICON[r.status] ?? '?'}</span>
          <span><b>${esc(r.label)}</b><br><span class="small">${esc(r.detail)}</span></span>
          <span class="small muted">${esc(CHECK_STATUS[r.status] ?? r.status)}${r.owner_role ? ` · ${esc(r.owner_role.split('/').map((x) => ROLE[x] ?? x).join('/'))}` : ''}</span></li>`).join('')}</ul></div></section>
      <section class="card" id="next-action"><h2>Next action ${tip('One next action at a time, with an owner, a due date and what "done" means. It appears on that person\'s Home.', { step: 2 })}</h2>
        ${p.next_action ? `<p style="margin:0 0 6px"><b>${esc(p.next_action)}</b></p><div class="row small">Owner: <b>${esc(ctx.personName(p.next_action_owner_id))}</b> ${dueChip(p.next_action_due)}</div>
          <p class="small muted">Done when: ${esc(p.next_action_done_when ?? 'Update the project and set the next action')}</p>` : emptyState('No next action yet — set one with an owner and a due date.')}</section>
      <section class="card" id="suggestions" tabindex="-1"><h2>Suggested next actions ${tip('Worked out from what is saved on this project: the next open steps of its readiness checks, who does each one and when it could be done. A suggestion assigns nothing; "Use as next action" fills the form, and saving it makes it the next action.')}</h2>
        <div id="suggestions-slot">${loading('Working out the next steps…')}</div></section>
      <section class="card"><h2>Details</h2><dl class="kv">
        <dt>Client</dt><dd>${esc(p.client?.display_name)} <span class="muted small">${esc(p.client?.client_ref)}</span></dd>
        <dt>Service group</dt><dd>${esc(label(GROUP, p.service_group))}</dd>
        <dt>Owner</dt><dd>${esc(ctx.personName(p.owner_id))}</dd><dt>Account owner</dt><dd>${esc(ctx.personName(p.account_owner_id))}</dd>
        <dt>Contract</dt><dd>${p.contract_reference ? `${esc(p.contract_reference)} · signed ${esc(fmtDate(p.contract_signed_date))}` : '<span class="muted">None yet</span>'}</dd>
        <dt>Promised delivery</dt><dd>${esc(p.promised_delivery_date ? fmtDate(p.promised_delivery_date) : '—')}</dd>
        <dt>Brief</dt><dd>${esc(label(BRIEF, p.brief_status))} ${p.brief_url ? link(p.brief_url, 'open brief') : ''}</dd>
        <dt>Pipeline estimate</dt><dd>${estimate} <span class="small muted">— an estimate, not revenue</span></dd>
        ${p.lost_reason ? `<dt>Reason lost</dt><dd>${esc(p.lost_reason)}</dd>` : ''}
        <dt>Latest note</dt><dd>${esc(p.latest_note ?? '—')} ${p.latest_note_at ? `<span class="small muted">(${esc(fmtDateTime(p.latest_note_at))})</span>` : ''}</dd>
        <dt>Created</dt><dd>${esc(fmtDateTime(p.created_at))} by ${esc(ctx.personName(p.created_by))}</dd></dl></section>
      ${ctx.has('bd', 'account', 'finance', 'admin') ? `<section class="card" id="project-reports"><h2>Holistics reports about this project ${tip('Reports your team built in Holistics about this project. Connect one here, open it in Holistics, and come back to this record with its Back button.')}</h2><div id="project-report-library"></div></section>` : ''}
    </div>
    <div class="stack">
      <section class="card"><h2>Update project</h2><div id="update-slot"></div></section>
      ${ctx.has('finance') ? '<section class="card" id="finance-box"><h2>Finance actions</h2><div id="finance-slot"></div></section>' : ''}
    </div></div>`;
  renderUpdateForm(qs('#update-slot', host), p, ctx, { routine, actionOwner }, rerender);
  if (ctx.has('finance')) renderFinanceBox(qs('#finance-slot', host), p, ctx, rerender);
  // The plain list above stays if the help cannot load: the checks themselves never depend on it.
  const list = qs('#readiness-list', host);
  mountIsland(list, 'readiness', { ctx, project: p, readiness, pending, milestones, work }).then(keep(list)).catch((e) => console.error(e));
  // the form is what assigns it, with the version check and the conflict comparison of any other edit.
  const useSuggestion = (s) => {
    const form = qs('#update-form', host);
    if (!form) { toast('Only BD, Account, Admin or the person who owns the next action can set it.', ''); return; }
    form.elements.next_action.value = s.action;
    if (s.owner.id) form.elements.next_action_owner_id.value = s.owner.id;
    form.elements.next_action_due.value = s.due.date ?? '';
    form.elements.next_action_done_when.value = GUIDE[s.code]?.completes ?? '';
    form.dispatchEvent(new Event('input', { bubbles: true }));
    qs('[data-role=result]', form).innerHTML = `<div class="banner info" data-role="from-suggestion">Filled in from a suggestion. Check it and change anything, then press Save update: nothing is assigned until you save${s.due.date ? '' : ', and it still needs a due date'}.</div>`;
    focusTarget(host, 'next_action');
  };
  const sug = qs('#suggestions-slot', host);
  mountIsland(sug, 'next-steps', { ctx, project: p, readiness, loaded: { pending, milestones, work }, onUse: (routine || actionOwner) ? useSuggestion : undefined })
    .then(keep(sug)).catch((e) => { sug.innerHTML = errorBanner({ kind: 'unknown', message: `The suggestions could not load: ${e.message}` }); });
  const slot = qs('#project-report-library', host);
  if (slot) {
    mountIsland(slot, 'report-library', { ctx, context: { type: 'project', id: p.id, ref: p.project_ref, label: p.title } })
      .then(keep(slot))
      .catch((e) => { slot.innerHTML = errorBanner({ kind: 'unknown', message: `The report links could not load: ${e.message}` }); });
  }
}

function renderUpdateForm(slot, p, ctx, { routine, actionOwner }, rerender) {
  if (!routine && !actionOwner) {
    slot.innerHTML = `<div class="banner info">You can see this project. BD and Account update its details; when you own the next action, you can update it here.</div>`;
    return;
  }
  const v = (f) => p[f] ?? '';
  const fields = routine ? [...ROUTINE_FIELDS, ...NEXT_FIELDS] : NEXT_FIELDS;
  slot.innerHTML = `<form class="form" id="update-form" novalidate>
    ${routine ? `
    <label class="f full">Project<input name="title" value="${esc(v('title'))}" required></label>
    <label class="f">Commercial stage<select name="commercial_stage">${options(STAGE, v('commercial_stage'))}</select></label>
    <label class="f">Delivery state<select name="delivery_state">${options(DELIVERY, v('delivery_state'))}</select></label>
    <label class="f" data-show="won contract_sent">Contract reference<input name="contract_reference" value="${esc(v('contract_reference'))}"></label>
    <label class="f" data-show="won contract_sent">Contract signed date<input name="contract_signed_date" type="date" value="${esc(v('contract_signed_date'))}"></label>
    <label class="f full" data-show="lost">Reason lost<input name="lost_reason" value="${esc(v('lost_reason'))}"></label>
    <label class="f">Owner<select name="owner_id">${peopleOptions(ctx.people, v('owner_id'), { roles: ['bd', 'account', 'admin'] })}</select></label>
    <label class="f">Account owner for delivery<select name="account_owner_id">${peopleOptions(ctx.people, v('account_owner_id'), { roles: ['account'], blank: '— not assigned —' })}</select></label>
    <label class="f">Brief<select name="brief_status">${options(BRIEF, v('brief_status'))}</select></label>
    <label class="f">Brief link<input name="brief_url" type="url" placeholder="https://…" value="${esc(v('brief_url'))}"></label>
    <label class="f">Promised delivery date<input name="promised_delivery_date" type="date" value="${esc(v('promised_delivery_date'))}"></label>
    <label class="f">Service group<select name="service_group">${options(GROUP, v('service_group'), { blank: '—' })}</select></label>
    <fieldset class="full"><legend>Pipeline estimate (VND, net of VAT)</legend><div class="form">
      <label class="f">Type<select name="estimate_basis">${options(ESTIMATE, v('estimate_basis'), { blank: 'No estimate' })}</select></label>
      <label class="f" data-est="total monthly">Value<input name="estimated_amount" type="number" min="0" step="1" value="${esc(v('estimated_amount'))}"></label>
      <label class="f" data-est="range">From<input name="estimate_low" type="number" min="0" step="1" value="${esc(v('estimate_low'))}"></label>
      <label class="f" data-est="range">To<input name="estimate_high" type="number" min="0" step="1" value="${esc(v('estimate_high'))}"></label></div></fieldset>` : ''}
    <fieldset class="full"><legend>Next action</legend><div class="form">
      <label class="f full">What needs doing<input name="next_action" value="${esc(v('next_action'))}" placeholder="For example: send the revised quotation"></label>
      <label class="f">Owner<select name="next_action_owner_id">${peopleOptions(ctx.people, v('next_action_owner_id'))}</select></label>
      <label class="f">Due<input name="next_action_due" type="date" value="${esc(v('next_action_due'))}"></label>
      <label class="f full">Done when<input name="next_action_done_when" value="${esc(v('next_action_done_when'))}" placeholder="For example: the client confirms by email"></label></div></fieldset>
    <label class="f full">New note (latest conversation)<textarea name="latest_note" placeholder="What the client said, what was agreed…"></textarea></label>
    <div class="form-actions"><button class="btn primary" type="submit">Save update</button><span class="dirty-note" data-role="dirty"></span>
      <span class="small muted">Saved against version v${esc(p.version)}: if someone saved meanwhile, you get a comparison, never an overwrite.</span></div>
    <div class="full" data-role="result"></div></form>`;
  const form = qs('#update-form', slot);
  const dirtyPatch = () => {
    const vals = formValues(form);
    const patch = {};
    for (const f of fields) {
      if (!(f in vals)) continue;
      if (f === 'latest_note') { if (vals.latest_note) patch.latest_note = vals.latest_note; continue; }
      const before = p[f] === null || p[f] === undefined ? null : String(p[f]);
      const after = vals[f];
      const numeric = f === 'estimated_amount' || f === 'estimate_low' || f === 'estimate_high';
      const same = numeric ? (before === null && after === null) || Number(before) === Number(after) : before === after;
      if (!same) patch[f] = after;
    }
    if ('estimate_basis' in patch || 'estimated_amount' in patch || 'estimate_low' in patch || 'estimate_high' in patch) {
      const eb = vals.estimate_basis;
      Object.assign(patch, { estimate_basis: eb, estimated_amount: eb && eb !== 'range' ? vals.estimated_amount : null,
        estimate_low: eb === 'range' ? vals.estimate_low : null, estimate_high: eb === 'range' ? vals.estimate_high : null });
    }
    return patch;
  };
  const sync = () => {
    const st = form.elements.commercial_stage?.value;
    form.querySelectorAll('[data-show]').forEach((l) => { l.hidden = !l.dataset.show.split(' ').includes(st) && !(l.querySelector('input')?.value); });
    const eb = form.elements.estimate_basis?.value;
    form.querySelectorAll('[data-est]').forEach((l) => { l.hidden = !eb || !l.dataset.est.split(' ').includes(eb); });
    const n = Object.keys(dirtyPatch()).length;
    qs('[data-role=dirty]', form).textContent = n ? `${n} unsaved change(s)` : '';
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  sync();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const patch = dirtyPatch();
    const out = qs('[data-role=result]', form);
    if (!Object.keys(patch).length) { out.innerHTML = '<div class="banner info">Nothing to save: no field has changed.</div>'; return; }
    const merged = { ...p, ...patch };
    const missing = [];
    if (merged.next_action && (!merged.next_action_owner_id || !merged.next_action_due)) missing.push(!merged.next_action_owner_id ? 'next_action_owner_id' : 'next_action_due');
    if (merged.commercial_stage === 'won' && (!merged.contract_reference || !merged.contract_signed_date)) missing.push(!merged.contract_reference ? 'contract_reference' : 'contract_signed_date');
    if (merged.commercial_stage === 'lost' && !merged.lost_reason) missing.push('lost_reason');
    if (merged.brief_status === 'ready' && !merged.brief_url) missing.push('brief_url');
    if (patch.brief_url && !safeUrl(patch.brief_url)) missing.push('brief_url');
    if (missing.length) {
      form.querySelectorAll('[hidden]').forEach((l) => { if (missing.some((m) => l.querySelector(`[name=${m}]`))) l.hidden = false; });
      markInvalid(form, missing);
      out.innerHTML = errorBanner({ kind: 'invalid', message: `Still missing: ${missing.map((m) => FIELD_LABELS[m]).join(', ')}. Nothing was saved.` });
      return;
    }
    try {
      const saved = await saving(qs('[type=submit]', form), () => ctx.api.updateProject(p.id, p.version, patch));
      toast(`Saved ${saved.project_ref} (version v${saved.version})`, 'ok');
      ctx.refreshCounts?.();
      rerender();
    } catch (e) {
      if (e.kind === 'conflict') {
        const latest = await ctx.api.project(p.id);
        renderConflict(out, { error: e, latest, draft: patch, original: p, labels: FIELD_LABELS,
          onReapply: async () => {
            try {
              const saved = await ctx.api.updateProject(latest.id, latest.version, patch);
              toast(`Applied your changes to the latest version (v${saved.version})`, 'ok');
              rerender();
            } catch (e2) { out.innerHTML = errorBanner(e2); }
          },
          onDiscard: () => rerender() });
      } else {
        markInvalid(form, e.constraint ? ({ next_action_needs_owner_and_due: ['next_action_owner_id', 'next_action_due'], won_needs_contract: ['contract_reference', 'contract_signed_date'],
          lost_needs_reason: ['lost_reason'], brief_ready_needs_link: ['brief_url'], estimate_shape: ['estimated_amount'] }[e.constraint] ?? []) : []);
        out.innerHTML = errorBanner(e, { actions: '<span class="small">Your draft is still in the form — fix it and save again.</span>' });
      }
    }
  });
}

function renderFinanceBox(slot, p, ctx, rerender) {
  slot.innerHTML = `<form class="form" id="jobcode-form">${p.job_code ? `<p class="full">Job code: <b>${esc(p.job_code)}</b> (issued)</p>` : `
      <label class="f">Issue a job code<input name="job_code" required placeholder="KK26-0123" pattern="[A-Za-z0-9][A-Za-z0-9\\-]{3,29}"></label>
      <div class="form-actions"><button class="btn primary" type="submit">Issue job code</button></div>`}</form>
    <form class="form" id="payment-form" style="margin-top:12px"><label class="f">Payment state<select name="state">${options(PAYMENT, p.payment_state)}</select></label>
      <label class="f">Note<input name="note" placeholder="For example: bank transfer of 15 Oct"></label>
      <div class="form-actions"><button class="btn" type="submit">Save payment state</button></div><div class="full" data-role="result"></div></form>`;
  const jf = qs('#jobcode-form', slot);
  if (!p.job_code) jf.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await saving(qs('[type=submit]', jf), () => ctx.api.issueJobCode(p.id, jf.job_code.value.trim(), p.version)); toast('Job code issued', 'ok'); rerender(); }
    catch (e) { qs('[data-role=result]', slot).innerHTML = errorBanner(e); }
  });
  const pf = qs('#payment-form', slot);
  pf.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await saving(qs('[type=submit]', pf), () => ctx.api.setPaymentState(p.id, pf.state.value, p.version, pf.note.value || null)); toast('Payment state saved', 'ok'); rerender(); }
    catch (e) { qs('[data-role=result]', slot).innerHTML = errorBanner(e); }
  });
}

// ---- Work -----------------------------------------------------------------------------------------------------
const DONE_WHEN = { design: 'Account approves the design, with the final file link', studio: 'Actual start/end times and any incidents recorded', account: 'Sent to the client and confirmed' };
async function workTab(host, p, ctx) {
  host.innerHTML = loading();
  const items = await ctx.api.workItems({ projectId: p.id });
  const routine = ctx.has('bd', 'account', 'admin');
  host.innerHTML = `<div class="grid2"><section class="stack"><h2>Work on this project (${items.length})</h2><div class="queue" id="work-list">
      ${items.map((w) => workCard(ctx, w)).join('') || emptyState('No work has been assigned on this project yet.')}</div></section>
    <section>${routine ? `<div class="card"><h2>Assign work ${tip('Hand work to Design or Studio with a brief link, a due date and a completion condition. They see it in My work and send the output back for review.', { step: 3 })}</h2><div id="new-work"></div></div>` : '<div class="banner info">BD and Account assign work. You update the work assigned to you right on its card.</div>'}</section></div>`;
  bindWork(qs('#work-list', host), ctx, items, () => workTab(host, p, ctx));
  if (routine) newWorkForm(qs('#new-work', host), p, ctx, () => workTab(host, p, ctx));
}

function newWorkForm(slot, p, ctx, reload, keep = {}) {
  const requestId = keep.requestId ?? newRequestId();
  const team = keep.team ?? 'design';
  slot.innerHTML = `<form class="form" id="work-form">
    <label class="f">Team<select name="team">${options(TEAM, team)}</select></label>
    <label class="f">Assignee<select name="assignee_id" required>${peopleOptions(ctx.people, keep.assignee_id, { roles: [team] })}</select></label>
    <label class="f full">Work<input name="title" required value="${esc(keep.title ?? '')}" placeholder="For example: design the key visual"></label>
    <label class="f">Due<input name="due_at" type="datetime-local" required value="${esc(keep.due_at ?? '')}"></label>
    <label class="f">Brief link<input name="brief_url" type="url" value="${esc(keep.brief_url ?? p.brief_url ?? '')}"></label>
    <label class="f full">Done when<input name="completion_condition" required value="${esc(keep.completion_condition ?? DONE_WHEN[team])}"></label>
    <fieldset class="full" data-studio ${team === 'studio' ? '' : 'hidden'}><legend>Studio session (a request — not a guaranteed reservation)</legend><div class="form">
      <label class="f full">Room<input name="studio_room" value="${esc(keep.studio_room ?? '')}" placeholder="Studio A"></label>
      <label class="f">Planned start<input name="planned_start" type="datetime-local" value="${esc(keep.planned_start ?? '')}"></label>
      <label class="f">Planned end<input name="planned_end" type="datetime-local" value="${esc(keep.planned_end ?? '')}"></label></div></fieldset>
    <div class="form-actions"><button class="btn primary" type="submit">Assign</button></div><div class="full" data-role="result"></div></form>`;
  const form = qs('#work-form', slot);
  form.team.addEventListener('change', () => newWorkForm(slot, p, ctx, reload, { ...formValues(form), team: form.team.value, requestId,
    completion_condition: DONE_WHEN[form.team.value] }));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(form);
    const missing = ['assignee_id', 'title', 'due_at', 'completion_condition'].filter((k) => !v[k]);
    if (v.brief_url && !safeUrl(v.brief_url)) missing.push('brief_url');
    if (missing.length) { markInvalid(form, missing); qs('[data-role=result]', form).innerHTML = errorBanner({ kind: 'invalid', message: 'Fill in the assignee, the work, the due time and "done when".' }); return; }
    const item = { project_id: p.id, team: v.team, title: v.title, assignee_id: v.assignee_id, due_at: fromLocalInput(v.due_at), brief_url: v.brief_url,
      completion_condition: v.completion_condition };
    if (v.team === 'studio') Object.assign(item, { studio_room: v.studio_room, planned_start: fromLocalInput(v.planned_start), planned_end: fromLocalInput(v.planned_end) });
    try {
      const w = await saving(qs('[type=submit]', form), () => ctx.api.createWork(item, requestId));
      toast(`${w.duplicate ? 'Already assigned' : 'Assigned'} ${w.work_ref} to ${ctx.personName(w.assignee_id)}`, 'ok');
      reload();
    } catch (e) { qs('[data-role=result]', form).innerHTML = errorBanner(e, { actions: '<span class="small">The form keeps what you typed — fix it and submit again (it will not create a duplicate).</span>' }); }
  });
}

// ---- Money ----------------------------------------------------------------------------------------------------
async function moneyTab(host, p, ctx) {
  host.innerHTML = `<div class="stack"><div id="money-panel"></div><div id="money-ops">${loading('Loading money lines…')}</div></div>`;
  const canSee = ctx.has('bd', 'account', 'finance', 'admin');
  if (canSee) {
    panel = await mountPanel(qs('#money-panel', host), { app: 'job360_money', scope: { projectRef: p.project_ref, projectTitle: p.title, mode: 'job360' },
      session: ctx.session, getToken: ctx.getToken, height: 560, label: `Project money ${p.project_ref} — Anfra` });
  } else {
    qs('#money-panel', host).innerHTML = '<div class="banner warn">Governed finance figures are shown to BD, Account, Finance and Admin only.</div>';
  }
  await moneyOps(qs('#money-ops', host), p, ctx);
}

async function moneyOps(slot, p, ctx) {
  let lines; let requests; let milestones; let receipts;
  try {
    [lines, requests, milestones, receipts] = await Promise.all([ctx.api.moneyLines(p.id), ctx.api.changeRequests({ projectId: p.id }),
      ctx.api.acceptance(p.id), ctx.api.receipts(p.id)]);
  } catch (e) { slot.innerHTML = errorBanner(e); return; }
  const pendingBy = new Map(requests.filter((r) => r.status === 'pending').map((r) => [r.cost_line_id ?? r.service_line_id, r]));
  const svc = (code) => ctx.services.find((s) => s.code === code)?.name ?? code ?? 'No service line';
  const account = ctx.has('account');
  const lineRow = (l) => {
    const c = l.current; const pend = pendingBy.get(l.id);
    const state = c?.source === 'import' ? '<span class="chip info">Imported as approved</span>' : '<span class="chip ok">Approved by Finance</span>';
    return `<tr><td><b>${esc(l.line_ref)}</b><br><span class="small muted">${esc(l.kind === 'revenue' ? 'Revenue' : `Cost · ${label(COST_STAGE, l.cost_stage)}`)}</span></td>
      <td>${esc(l.description)}<br><span class="small muted">${esc(l.kind === 'revenue' ? svc(l.service_code) : svc(lines.revenue.find((r) => r.id === l.service_line_id)?.service_code))}</span></td>
      <td class="num">${c ? vnd(c.amount) : '—'}</td><td>${c ? `${state}<br><span class="small muted">${esc(c.revision_ref)} · revision ${esc(c.revision_no)}${c.source_ref ? ` · ${esc(c.source_ref)}` : ''}</span>` : ''}</td>
      <td>${pend ? `<span class="chip warn">${esc(pend.request_ref)} pending → ${pend.proposed_amount === null ? 'unknown' : esc(fmtVnd(pend.proposed_amount))}</span>`
        : account ? `<button class="btn small" type="button" data-propose="${esc(l.id)}" data-kind="${l.kind}">Propose a change</button>` : ''}</td></tr>`;
  };
  slot.innerHTML = `
    <section class="card section" id="money-lines"><div class="row spread"><h2>Money lines in force ${tip('To change a cost or the contract value, use "Propose a change" with a reason and evidence. The governed scenario shows the new margin; the approved figure stays until Finance decides.', { step: 4 })}</h2>
      ${account ? '<div class="row"><button class="btn small" type="button" data-propose="new_cost_line">+ Propose a new cost line</button><button class="btn small" type="button" data-propose="new_service_line">+ Propose a new revenue line</button></div>' : ''}</div>
      <p class="small muted">These are the committed values (approved by Finance, or brought in as approved values by an import). Every change goes through Finance review; a cost without an amount always shows "unknown", never 0.</p>
      <div class="table-wrap"><table><thead><tr><th>Line</th><th>Description · service</th><th class="num">Amount (VND, net of VAT)</th><th>Value state</th><th></th></tr></thead>
      <tbody>${[...lines.revenue, ...lines.cost].map(lineRow).join('') || '<tr><td colspan="5">No money lines yet.</td></tr>'}</tbody></table></div>
      <div id="proposal-slot"></div></section>
    <section class="card section"><h2>Proposed changes (${requests.length})</h2>${requests.length ? `<div class="table-wrap"><table><thead><tr><th>Proposal</th><th>Previous → proposed</th><th>Reason · evidence</th><th>Status</th><th></th></tr></thead><tbody>
      ${requests.map((r) => `<tr><td><b>${esc(r.request_ref)}</b><br><span class="small muted">${esc(fmtDateTime(r.requested_at))} · ${esc(ctx.personName(r.requested_by))}</span></td>
        <td class="num">${r.previous_amount_status ? vnd(r.previous_amount) : '<span class="muted">new line</span>'} → <b>${vnd(r.proposed_amount)}</b></td>
        <td>${esc(r.reason)}<br>${link(r.evidence_url, 'evidence')}</td>
        <td><span class="chip ${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : r.status === 'pending' ? 'warn' : 'ghost'}">${esc(label(CR_STATUS, r.status))}</span>
          ${r.review_comment ? `<br><span class="small">${esc(r.review_comment)}</span>` : ''}${r.reviewed_at ? `<br><span class="small muted">${esc(ctx.personName(r.reviewed_by))} · ${esc(fmtDateTime(r.reviewed_at))}</span>` : ''}</td>
        <td>${r.status === 'pending' && r.requested_by === ctx.session.id ? `<button class="btn small" type="button" data-withdraw="${esc(r.id)}">Withdraw</button>` : ''}
          ${r.status === 'pending' && ctx.has('finance') && r.requested_by !== ctx.session.id ? `<a class="btn small primary" href="#/finance?cr=${esc(r.id)}">Review</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState('No proposals yet.')}<div data-role="cr-result"></div></section>
    <section class="card section"><h2>Acceptance and cash received</h2><p class="small muted">Contract value, acceptance and cash are three separate things; they are never added together as revenue. A deposit is cash received, not revenue.</p>
      <div class="grid2"><div><h3>Acceptance milestones</h3>${milestones.length ? `<table><thead><tr><th>Milestone</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${milestones.map((m) => `<tr><td><b>${esc(m.milestone_ref)}</b> ${esc(m.description)}<br><span class="small muted">${esc(fmtDate(m.effective_date))} · ${link(m.evidence_url, 'evidence')}</span></td><td class="num">${vnd(m.amount)}</td>
          <td><span class="chip ${m.status === 'verified' ? 'ok' : m.status === 'rejected' ? 'bad' : 'warn'}">${esc({ verified: 'Verified by Finance', submitted: 'Waiting for Finance', rejected: 'Rejected' }[m.status])}</span>${m.review_comment ? `<br><span class="small">${esc(m.review_comment)}</span>` : ''}
          ${m.status === 'submitted' && ctx.has('finance') && m.submitted_by !== ctx.session.id ? `<br><a class="btn small primary" href="#/finance?ac=${esc(m.id)}">Verify</a>` : ''}</td></tr>`).join('')}</tbody></table>` : emptyState('No acceptance milestones yet.')}
          ${account ? '<div id="acceptance-slot"></div>' : ''}</div>
        <div><h3>Cash received (allocated to this project)</h3>${receipts.length ? `<table><thead><tr><th>Receipt</th><th class="num">Allocated</th><th>Tax basis</th></tr></thead><tbody>${receipts.map((a) => `<tr><td><b>${esc(a.receipt.receipt_ref)}</b> ${esc(a.receipt.receipt_type === 'deposit' ? 'Deposit' : 'Payment')}<br><span class="small muted">${esc(fmtDate(a.receipt.receipt_date))} · ${esc(a.receipt.reference)}${a.milestone_id ? ` · for ${esc(milestones.find((m) => m.id === a.milestone_id)?.milestone_ref ?? 'milestone')}` : ''}</span></td>
          <td class="num">${vnd(a.amount)}</td><td>${esc(a.receipt.tax_basis === 'gross_incl_vat' ? 'Incl. VAT' : 'Net of VAT')}</td></tr>`).join('')}</tbody></table>` : emptyState('No cash recorded yet.')}
          ${ctx.has('finance') ? '<div id="receipt-slot"></div>' : ''}</div></div></section>`;
  const reloadAll = async (reason, expect) => { await moneyOps(slot, p, ctx); if (reason) await panel?.refresh(reason, expect); };
  slot.querySelectorAll('[data-propose]').forEach((b) => b.addEventListener('click', () => proposalForm(qs('#proposal-slot', slot), p, ctx, lines, b.dataset.propose, b.dataset.kind, reloadAll)));
  slot.querySelectorAll('[data-withdraw]').forEach((b) => b.addEventListener('click', async () => {
    const r = requests.find((x) => x.id === b.dataset.withdraw);
    try { await saving(b, () => ctx.api.withdrawChange(r.id, r.version)); toast(`Withdrew ${r.request_ref}`, 'ok'); await reloadAll('withdrawn'); }
    catch (e) { qs('[data-role=cr-result]', slot).innerHTML = errorBanner(e); }
  }));
  if (account) acceptanceForm(qs('#acceptance-slot', slot), p, ctx, reloadAll);
  if (ctx.has('finance')) receiptForm(qs('#receipt-slot', slot), p, ctx, milestones.filter((m) => m.status === 'verified'), reloadAll);
}

function proposalForm(slot, p, ctx, lines, target, kind, reloadAll, keep = {}) {
  const isNew = target === 'new_cost_line' || target === 'new_service_line';
  const line = isNew ? null : [...lines.revenue, ...lines.cost].find((l) => l.id === target);
  const revenue = target === 'new_service_line' || kind === 'revenue';
  const key = keep.key ?? newRequestId(); // one submission key per open form: a double submit is answered, not duplicated
  slot.innerHTML = `<form class="form card tight" id="proposal-form" style="margin-top:12px">
    <h3 class="full">${isNew ? (revenue ? 'Propose a new revenue line' : 'Propose a new cost line') : `Propose a change to ${esc(line.line_ref)} — ${esc(line.description)}`}</h3>
    ${!isNew ? `<p class="full small">Value in force: <b>${vnd(line.current?.amount)}</b> (${esc(line.current?.revision_ref)}). The proposal is based on exactly this revision; if it changes before you submit, you will be told.</p>` : ''}
    ${isNew ? `<label class="f full">Description<input name="description" required value="${esc(keep.description ?? '')}"></label>` : ''}
    ${target === 'new_service_line' ? `<label class="f">Service<select name="service_code" required>${ctx.services.map((s) => `<option value="${esc(s.code)}" ${s.code === keep.service_code ? 'selected' : ''}>${esc(s.code)} · ${esc(s.name)}</option>`).join('')}</select></label>` : ''}
    ${target === 'new_cost_line' ? `<label class="f">For service line<select name="service_line_id"><option value="">— not attributed —</option>${lines.revenue.map((l) => `<option value="${esc(l.id)}">${esc(l.line_ref)} · ${esc(l.description)}</option>`).join('')}</select></label>` : ''}
    ${!revenue ? `<label class="f">Cost stage<select name="cost_stage">${options(COST_STAGE, keep.cost_stage ?? line?.cost_stage ?? 'forecast')}</select></label>` : ''}
    <label class="f">Proposed amount (VND, net of VAT)<input name="amount" type="number" min="0" step="1" value="${esc(keep.amount ?? '')}" inputmode="numeric"></label>
    <label class="f inline"><input type="checkbox" name="unknown" ${keep.unknown ? 'checked' : ''}> Amount unknown (kept as "unknown", never counted as 0)</label>
    <label class="f inline"><input type="checkbox" name="zero_confirmed" ${keep.zero_confirmed ? 'checked' : ''}> A zero amount is intentional</label>
    <label class="f full">Reason<textarea name="reason" required minlength="5">${esc(keep.reason ?? '')}</textarea></label>
    <label class="f full">Evidence link (quotation, addendum, email)<input name="evidence_url" type="url" required placeholder="https://…" value="${esc(keep.evidence_url ?? '')}"></label>
    <div class="form-actions"><button class="btn primary" type="submit">Send to Finance</button><button class="btn" type="button" data-cancel>Close</button>
      <span class="small muted">The approved value does not change until Finance approves.</span></div><div class="full" data-role="result"></div></form>`;
  const form = qs('#proposal-form', slot);
  form.scrollIntoView({ block: 'nearest' });
  form.querySelector('input,select,textarea')?.focus();
  qs('[data-cancel]', form).onclick = () => { slot.innerHTML = ''; };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(form);
    const missing = [];
    if (!v.unknown && (v.amount === null || v.amount === undefined)) missing.push('amount');
    if (!v.reason || v.reason.length < 5) missing.push('reason');
    if (!safeUrl(v.evidence_url ?? '')) missing.push('evidence_url');
    if (isNew && !v.description) missing.push('description');
    if (missing.length) { markInvalid(form, missing); qs('[data-role=result]', form).innerHTML = errorBanner({ kind: 'invalid', message: 'An amount (or "amount unknown"), a reason of at least 5 characters and an evidence link are required.' }); return; }
    const args = { projectId: p.id, targetType: isNew ? target : revenue ? 'service_line' : 'cost_line', lineId: isNew ? null : line.id,
      amount: v.unknown ? null : v.amount, amountKnown: !v.unknown, zeroConfirmed: v.zero_confirmed, description: v.description, costStage: v.cost_stage,
      reason: v.reason, evidenceUrl: v.evidence_url, baseRevisionId: line?.current?.id ?? null, idempotencyKey: key, serviceCode: v.service_code,
      serviceLineId: v.service_line_id };
    try {
      const cr = await saving(qs('[type=submit]', form), () => ctx.api.submitChange(args));
      toast(`${cr.duplicate ? 'Already sent:' : 'Sent'} ${cr.request_ref} to Finance`, 'ok');
      ctx.refreshCounts?.();
      await reloadAll('proposal_submitted', { pendingRequestRef: cr.request_ref });
    } catch (e) {
      qs('[data-role=result]', form).innerHTML = errorBanner(e, { actions: e.kind === 'conflict'
        ? '<button class="btn small" type="button" data-reload>Reload the current value</button><span class="small">What you typed is kept.</span>'
        : '<span class="small">What you typed is kept — fix it and submit again.</span>' });
      qs('[data-reload]', form)?.addEventListener('click', async () => {
        const fresh = await ctx.api.moneyLines(p.id);
        proposalForm(slot, p, ctx, fresh, target, kind, reloadAll, { ...v, key: newRequestId() });
      });
    }
  });
}

function acceptanceForm(slot, p, ctx, reloadAll) {
  const key = newRequestId();
  slot.innerHTML = `<details style="margin-top:10px"><summary class="btn small">Submit an acceptance milestone</summary><form class="form" id="acc-form" style="margin-top:8px">
    <label class="f full">What was accepted<input name="description" required></label>
    <label class="f">Amount (VND, net of VAT)<input name="amount" type="number" min="0" step="1" required></label>
    <label class="f">Acceptance date<input name="effective_date" type="date" required value="${esc(businessToday())}"></label>
    <label class="f full">Link to the minutes / evidence<input name="evidence_url" type="url" required></label>
    <div class="form-actions"><button class="btn primary" type="submit">Send to Finance for verification</button></div><div class="full" data-role="result"></div></form></details>`;
  const form = qs('#acc-form', slot);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(form);
    try {
      const m = await saving(qs('[type=submit]', form), () => ctx.api.submitAcceptance({ projectId: p.id, description: v.description, amount: v.amount,
        effectiveDate: v.effective_date, evidenceUrl: v.evidence_url, idempotencyKey: key }));
      toast(`Submitted ${m.milestone_ref}`, 'ok');
      await reloadAll('acceptance_submitted');
    } catch (e) { qs('[data-role=result]', form).innerHTML = errorBanner(e); }
  });
}

function receiptForm(slot, p, ctx, milestones, reloadAll) {
  const key = newRequestId();
  slot.innerHTML = `<details style="margin-top:10px"><summary class="btn small">Record cash received</summary><form class="form" id="receipt-form" style="margin-top:8px">
    <label class="f">Date received<input name="receipt_date" type="date" required value="${esc(businessToday())}"></label>
    <label class="f">Type<select name="receipt_type"><option value="payment">Payment</option><option value="deposit">Deposit</option></select></label>
    <label class="f">Amount (VND)<input name="amount" type="number" min="1" step="1" required></label>
    <label class="f">Tax basis<select name="tax_basis"><option value="net_of_vat">Net of VAT</option><option value="gross_incl_vat">Incl. VAT</option></select></label>
    <label class="f">Reference (bank transfer, receipt no.)<input name="reference" required minlength="3"></label>
    <label class="f">For acceptance milestone<select name="milestone_id"><option value="">— no milestone —</option>${milestones.map((m) => `<option value="${esc(m.id)}">${esc(m.milestone_ref)} · ${esc(fmtVnd(m.amount))}</option>`).join('')}</select></label>
    <label class="f full">Note<input name="note"></label>
    <div class="form-actions"><button class="btn primary" type="submit">Record</button><span class="small muted">The whole receipt is allocated to this project.</span></div><div class="full" data-role="result"></div></form></details>`;
  const form = qs('#receipt-form', slot);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(form);
    try {
      const r = await saving(qs('[type=submit]', form), () => ctx.api.recordReceipt({ receipt_date: v.receipt_date, receipt_type: v.receipt_type, amount: v.amount,
        tax_basis: v.tax_basis, reference: v.reference, note: v.note }, [{ project_id: p.id, milestone_id: v.milestone_id, amount: v.amount }], key));
      toast(`${r.duplicate ? 'Already recorded:' : 'Recorded'} ${r.receipt.receipt_ref}`, 'ok');
      await reloadAll('receipt_recorded');
    } catch (e) { qs('[data-role=result]', form).innerHTML = errorBanner(e); }
  });
}

// ---- Documents ------------------------------------------------------------------------------------------------
async function documentsTab(host, p, ctx) {
  host.innerHTML = loading();
  const docs = await ctx.api.documents(p.id);
  const routine = ctx.has('bd', 'account', 'admin');
  host.innerHTML = `<div class="grid2"><section class="card"><h2>Documents (${docs.length})</h2><p class="small muted">The app keeps links to files in the existing Drive/Lark folders, not the files themselves.</p>
      ${docs.length ? `<table><thead><tr><th>Type</th><th>Document</th><th>Added by</th></tr></thead><tbody>${docs.map((d) => `<tr><td>${esc(label(DOC_TYPE, d.doc_type))}<br><span class="small muted">${esc(d.doc_ref)}</span></td>
        <td>${link(d.url, d.title)}</td><td class="small">${esc(ctx.personName(d.added_by))}<br><span class="muted">${esc(fmtDateTime(d.added_at))} · ${esc(label(SOURCE, d.source))}</span></td></tr>`).join('')}</tbody></table>` : emptyState('No documents yet.')}</section>
    ${routine ? `<section class="card"><h2>Link a document</h2><form class="form" id="doc-form">
      <label class="f">Type<select name="doc_type">${options(DOC_TYPE, 'brief')}</select></label><label class="f">Title<input name="title" required></label>
      <label class="f full">Link<input name="url" type="url" required placeholder="https://drive…"></label>
      <div class="form-actions"><button class="btn primary" type="submit">Save link</button></div><div class="full" data-role="result"></div></form></section>` : ''}</div>`;
  const form = qs('#doc-form', host);
  if (!form) return;
  const requestId = newRequestId();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(form);
    if (!safeUrl(v.url ?? '') || !v.title) { markInvalid(form, !v.title ? ['title'] : ['url']); qs('[data-role=result]', form).innerHTML = errorBanner({ kind: 'invalid', message: 'A title and a valid http(s) link are required.' }); return; }
    try { const d = await saving(qs('[type=submit]', form), () => ctx.api.addDocument({ project_id: p.id, doc_type: v.doc_type, title: v.title, url: v.url }, requestId)); toast(`Saved ${d.doc_ref}`, 'ok'); documentsTab(host, p, ctx); }
    catch (e) { qs('[data-role=result]', form).innerHTML = errorBanner(e); }
  });
}

// ---- History --------------------------------------------------------------------------------------------------
// The stored summary is the audit text; for status changes the screen shows the same facts with display labels.
const FIELD_VALUE = { commercial_stage: STAGE, delivery_state: DELIVERY, brief_status: BRIEF, project_kind: KIND, service_group: GROUP, estimate_basis: ESTIMATE };
function describeEvent(e, ctx) {
  const d = e.details ?? {};
  const m = (dict, v) => (v === null || v === undefined ? '—' : dict[v] ?? v);
  switch (e.event_type) {
    case 'stage_change': return esc(`Commercial stage: ${m(STAGE, d.from)} → ${m(STAGE, d.to)}`);
    case 'delivery_change': return esc(`Delivery state: ${m(DELIVERY, d.from)} → ${m(DELIVERY, d.to)}`);
    case 'payment_state_changed': return esc(`Payment state: ${m(PAYMENT, d.from)} → ${m(PAYMENT, d.to)}${d.note ? ` (${d.note})` : ''}`);
    case 'work_updated':
      if (d.status && d.status.from !== d.status.to) return esc(`${String(e.summary).split(':')[0]}: ${m(WORK, d.status.from)} → ${m(WORK, d.status.to)}${d.review_note ? ` — ${d.review_note}` : ''}`);
      return esc(e.summary);
    case 'field_change': {
      const changes = Object.entries(d.changes ?? {});
      if (!changes.length) return esc(e.summary);
      const show = (k, v) => (v === null || v === undefined || v === '' ? '—' : k.endsWith('_id') ? ctx.personName(v) : FIELD_VALUE[k] ? m(FIELD_VALUE[k], v) : /date|due/.test(k) ? fmtDate(v) : String(v));
      return `${esc(`Project details updated: ${changes.map(([k]) => FIELD_LABELS[k] ?? k).join(', ')}`)}<details class="small"><summary>before → after</summary>${changes.map(([k, v]) =>
        `<div>${esc(FIELD_LABELS[k] ?? k)}: ${esc(show(k, v.from))} → <b>${esc(show(k, v.to))}</b></div>`).join('')}</details>`;
    }
    default: return esc(e.summary);
  }
}
async function historyTab(host, p, ctx) {
  host.innerHTML = loading();
  const [events, lines, clientEvents] = await Promise.all([ctx.api.history(p.id), ctx.api.moneyLines(p.id), p.client?.id ? ctx.api.clientHistory(p.client.id) : []]);
  const revisions = [...lines.revenue, ...lines.cost].flatMap((l) => l.revisions.map((r) => ({ ...r, line: l })))
    .sort((a, b) => String(b.approved_at).localeCompare(String(a.approved_at)));
  host.innerHTML = `<div class="grid2"><section class="card"><h2>Timeline (${events.length})</h2><ol class="timeline">${events.map((e) => `<li>
      <time datetime="${esc(e.occurred_at)}">${esc(fmtDateTime(e.occurred_at))}</time>
      <div><span class="chip ghost">${esc(label(EVENT, e.event_type))}</span> ${describeEvent(e, ctx)}<div class="who">${esc(e.actor_id ? ctx.personName(e.actor_id) : e.source === 'import' ? `Imported from ${e.source_system ?? 'source'}${e.source_key ? ` (${e.source_key})` : ''}` : 'System')}
        · ${esc(label(SOURCE, e.source))}</div></div></li>`).join('')}</ol></section>
    <section class="stack"><div class="card"><h2>Money value revisions</h2><p class="small muted">Older revisions are kept (superseded), so an earlier figure can always be explained.</p>
      <div class="table-wrap"><table><thead><tr><th>Revision</th><th>Line</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${revisions.map((r) => `<tr class="${r.status === 'superseded' ? 'superseded' : ''}">
        <td><b>${esc(r.revision_ref)}</b><br><span class="small muted">revision ${esc(r.revision_no)} · ${esc(fmtDateTime(r.approved_at))}</span></td><td>${esc(r.line.line_ref)} ${esc(r.line.description)}</td>
        <td class="num">${vnd(r.amount)}</td><td>${r.status === 'approved' ? '<span class="chip ok">In force</span>' : '<span class="chip ghost">Superseded</span>'}<br><span class="small muted">${esc(r.source === 'import' ? 'Imported from source' : r.approved_by ? `approved by ${ctx.personName(r.approved_by)}` : label(SOURCE, r.source))}</span></td></tr>`).join('') || '<tr><td colspan="4">None yet.</td></tr>'}</tbody></table></div></div>
      <div class="card"><h2>Client history</h2><ol class="timeline">${clientEvents.map((e) => `<li><time>${esc(fmtDateTime(e.occurred_at))}</time><div>${esc(e.summary)}<div class="who">${esc(ctx.personName(e.actor_id))} · ${esc(label(SOURCE, e.source))}</div></div></li>`).join('') || '<li>None yet.</li>'}</ol></div></section></div>`;
}
