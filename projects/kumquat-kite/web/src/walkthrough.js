// acceptance Finance verifies, through the app's real screens, as BD, Account and Finance in turn.
//
// What it never does: it saves nothing itself (each step is done by the person, with the app's own forms, under their
// own permissions); it changes role only through the demo's own persona switch (ctx.switchPersona, which reloads the app
// as that persona); it touches no other record (it follows only the sample project it opened).
// It fills sample values into empty fields, which the person checks and saves.
//
// each action names its control and how the form shows it done (a value chosen, a field filled, a form opened), read
// from the form as it is at that moment. So a click that changes nothing moves nothing, a value changed back brings the
// highlight back, and values already right are passed over. The last action is the step's save: the step is done only
// once the saved state says so (done(), below), so a save that fails leaves the step where it is.
//
// Where its state lives:
//   - each person's choice (started, later, finished, exited) and run (the sample project, paused or not): their own
//     row of public.user_preferences, saved through the Data API under row-level security;
//   - progress: nowhere. The current step is the first one the sample project's saved state does not satisfy, so it is
//     always in step with the records, whoever made the change and wherever;
//   - a role change in this tab: the run's project goes from one persona to the next in sessionStorage (each persona
//     has their own preferences row), and the next persona saves it as their own run.
import { esc, businessToday } from './ui.js';

const HANDOFF = 'kk.walkthrough.handoff';
const TITLE = 'Walkthrough: launch livestream (sample)';
const ROLE_NAME = { bd: 'BD', account: 'Account', finance: 'Finance' };
const inDays = (n) => { const d = new Date(`${businessToday()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ok = (s, code) => s.readiness?.find((r) => r.check_code === code)?.status === 'ok';
const overview = (s) => `#/p/${s.ref}/overview`;
const money = (s) => `#/p/${s.ref}/money`;
// In Finance review: this project's item in the inbox, or, once it is open, its Approve or Verify button.
const financeItem = (kind) => (s) => {
  const items = [...document.querySelectorAll(`#lists a.item[href*="${kind}="]`)].filter((a) => a.textContent.includes(s.ref));
  const decide = document.querySelector(kind === 'cr' ? '#decide' : '#ac-decide');
  if (decide && items.some((a) => a.classList.contains('review'))) return decide.querySelector('button.primary');
  return items[0] ?? null;
};

// The actions of a step. filled(): a field with a valid value; chosen(): a select set to one of the values a step needs;
// opened(): a control that opens a form, done once that form is on screen; press(): the save, never done by the screen.
const filled = (target, ok = (el) => el.value.trim() !== '' && el.checkValidity()) => ({ target, met: ok });
const chosen = (target, ...values) => ({ target, met: (el) => values.includes(el.value) });
const opened = (target, isOpen) => ({ target, met: () => Boolean(isOpen()) });
const press = (target) => ({ target });
const accountOwner = () => ctx?.people?.find((p) => p.display_name === persona('account')?.name)?.user_id;
const SAVE_UPDATE = '#update-form button[type=submit]';
const proposal = (kind) => [
  opened(`[data-propose="new_${kind}_line"]`, () => document.querySelector(kind === 'service' ? '#proposal-form [name=service_code]' : '#proposal-form [name=cost_stage]')
    && document.querySelector('#proposal-form [name=description]')),
  filled('#proposal-form [name=description]'),
  filled('#proposal-form [name=amount]', (el) => (el.value !== '' && el.checkValidity()) || Boolean(document.querySelector('#proposal-form [name=unknown]')?.checked)),
  filled('#proposal-form [name=reason]', (el) => el.value.trim().length >= 5), filled('#proposal-form [name=evidence_url]'),
  press('#proposal-form button[type=submit]'),
];

// The steps, in order. done() reads the saved state; actions are what to do on the step's screen, in order; fill gives
// sample values for empty fields on that screen.
export const STEPS = [
  { id: 'open', role: 'bd', title: 'Open the opportunity', where: () => '#/crm/new',
    // The title stays the walkthrough's own: it is how the new project is recognised as the run's.
    actions: [filled('#intake [name=new_client_name]', (el) => el.value.trim() !== '' || Boolean(document.querySelector('#intake [name=client_id]')?.value)),
      chosen('#intake [name=title]', TITLE), filled('#intake [name=next_action]'), filled('#intake [name=next_action_due]'), press('#intake button[type=submit]')],
    duty: 'BD records each new opportunity once, at the first conversation: the client, what they want, who owns it and the next action.',
    todo: 'On Quick intake, check the sample values filled in for you, then press Save opportunity.',
    outcome: 'A new sample project with its first next action. The same record carries on into delivery.',
    fill: (r) => ({ '#intake [name=new_client_name]': `Walkthrough client ${r.stamp} (sample)`, '#intake [name=title]': TITLE,
      '#intake [name=next_action]': 'Agree the launch plan with the client', '#intake [name=next_action_done_when]': 'The client confirms the plan by email',
      // The form starts the due date at today; a week ahead keeps the sample's next action from turning overdue.
      '#intake [name=next_action_due]': { value: inDays(7), replace: businessToday() } }),
    done: (s) => Boolean(s.project) },
  { id: 'win', role: 'bd', title: 'Win the deal and hand it to delivery', where: overview,
    actions: [chosen('#update-form [name=commercial_stage]', 'won'), filled('#update-form [name=contract_reference]'), filled('#update-form [name=contract_signed_date]'),
      { target: '#update-form [name=account_owner_id]', met: (el) => Boolean(el.value) && el.value === accountOwner() }, press(SAVE_UPDATE)],
    duty: 'BD closes the deal: the signed contract is recorded, and an Account owner takes over delivery.',
    todo: 'In Update project, set Commercial stage to "Contract signed", keep the sample contract reference and date, choose Bao Nguyen as Account owner for delivery, then press Save update.',
    outcome: 'Delivery readiness shows the signed contract and the Account owner as OK.',
    fill: (r) => ({ '#update-form [name=contract_reference]': `CT-WT-${r.stamp}`, '#update-form [name=contract_signed_date]': businessToday() }),
    done: (s) => ok(s, 'contract') && ok(s, 'account_owner') },
  { id: 'brief', role: 'account', title: 'Confirm the brief', where: overview,
    actions: [chosen('#update-form [name=brief_status]', 'ready'), filled('#update-form [name=brief_url]'), press(SAVE_UPDATE)],
    duty: 'The Account owner runs delivery, starting with the brief that Design and Studio work from.',
    todo: 'Set Brief to "Ready", keep the sample brief link, then press Save update.',
    outcome: '"Brief ready" shows OK.',
    fill: (r) => ({ '#update-form [name=brief_url]': `https://example.com/kumquat-demo/briefs/walkthrough-${r.stamp}` }),
    done: (s) => ok(s, 'brief') },
  { id: 'revenue', role: 'account', title: 'Send the contract value to Finance', where: money, actions: proposal('service'),
    duty: 'Account proposes the money figures; only Finance approves them, so a proposal is never counted as revenue.',
    todo: 'On Money, press "+ Propose a new revenue line", check the sample values, then press Send to Finance.',
    outcome: 'A proposal waits for Finance. The approved figures do not change until Finance decides.',
    fill: (r) => ({ '#proposal-form [name=description]': 'Launch livestream, as contracted', '#proposal-form [name=amount]': '150000000',
      '#proposal-form [name=reason]': 'The contract value as signed', '#proposal-form [name=evidence_url]': `https://example.com/kumquat-demo/evidence/walkthrough-contract-${r.stamp}` }),
    done: (s) => ok(s, 'approved_revenue') || s.proposed('revenue') },
  { id: 'cost', role: 'account', title: 'Propose the forecast cost', where: money, actions: proposal('cost'),
    duty: 'Every forecast cost needs an amount approved by Finance; a cost without one stays "unknown", never 0.',
    todo: 'Press "+ Propose a new cost line", check the sample values, then press Send to Finance.',
    outcome: 'Two proposals wait for Finance.',
    fill: (r) => ({ '#proposal-form [name=description]': 'Host and studio crew', '#proposal-form [name=amount]': '60000000',
      '#proposal-form [name=reason]': 'The supplier quotation', '#proposal-form [name=evidence_url]': `https://example.com/kumquat-demo/evidence/walkthrough-quote-${r.stamp}` }),
    done: (s) => ok(s, 'cost_complete') || s.proposed('cost') },
  { id: 'job_code', role: 'finance', title: 'Issue the job code', where: overview,
    actions: [filled('#jobcode-form [name=job_code]'), press('#jobcode-form button[type=submit]')],
    duty: 'Finance issues the job code that links the contract, acceptance and cash, once the deposit, contract and quotation are in.',
    todo: 'In Finance actions, keep the sample job code, then press Issue job code.',
    outcome: '"Job code issued by Finance" shows OK, and the code shows on Job 360.',
    fill: (r) => ({ '#jobcode-form [name=job_code]': `KK-WT${r.stamp}` }),
    done: (s) => ok(s, 'job_code') },
  { id: 'approve', role: 'finance', title: 'Approve the two proposals', where: () => '#/finance', actions: [press(financeItem('cr'))],
    duty: 'Finance compares each proposal with its evidence before it counts. Nobody approves their own proposal.',
    todo: 'In Finance review, open each proposal for this project, check the evidence, then press Approve. Do it for both.',
    outcome: 'Contract revenue and forecast cost show OK: the project\'s margin is now measured on approved figures.',
    fill: () => ({ '#decide [name=comment]': 'Checked against the evidence (walkthrough)' }),
    done: (s) => ok(s, 'approved_revenue') && ok(s, 'cost_complete') },
  { id: 'deliver', role: 'account', title: 'Report the delivery', where: overview,
    actions: [chosen('#update-form [name=delivery_state]', 'delivered', 'client_accepted', 'closed'), press(SAVE_UPDATE)],
    duty: 'Account reports where delivery stands; acceptance can be recorded once the work is delivered.',
    todo: 'In Update project, set Delivery state to "Delivered", then press Save update.',
    outcome: 'Acceptance becomes the open check.',
    done: (s) => ['delivered', 'client_accepted', 'closed'].includes(s.project?.delivery_state) },
  { id: 'acceptance', role: 'account', title: 'Submit the client\'s acceptance', where: money,
    actions: [opened('#acceptance-slot summary', () => document.querySelector('#acceptance-slot details')?.open), filled('#acc-form [name=description]'),
      filled('#acc-form [name=amount]'), filled('#acc-form [name=effective_date]'), filled('#acc-form [name=evidence_url]'), press('#acc-form button[type=submit]')],
    duty: 'After delivery, Account submits the client\'s acceptance with its evidence. Acceptance is neither cash nor revenue.',
    todo: 'On Money, open "Submit an acceptance milestone", check the sample values, then press Send to Finance for verification.',
    outcome: 'The acceptance waits for Finance to verify it.',
    fill: (r) => ({ '#acc-form [name=description]': 'Launch livestream delivered and accepted', '#acc-form [name=amount]': '150000000',
      '#acc-form [name=evidence_url]': `https://example.com/kumquat-demo/evidence/walkthrough-acceptance-${r.stamp}` }),
    done: (s) => ok(s, 'acceptance') || s.acceptanceSent },
  { id: 'verify', role: 'finance', title: 'Verify the acceptance', where: () => '#/finance', actions: [press(financeItem('ac'))],
    duty: 'Finance verifies acceptance against its evidence; nobody verifies their own submission.',
    todo: 'In Finance review, open the acceptance for this project, check the evidence, then press Verify.',
    outcome: 'Every readiness check of the project is OK.',
    fill: () => ({ '#ac-decide [name=comment]': 'Minutes checked (walkthrough)' }),
    done: (s) => ok(s, 'acceptance') },
  { id: 'ready', role: null, title: 'The project is ready', where: overview, actions: [press('#readiness')],
    duty: 'One record carried the project from the first conversation to verified acceptance, and each role did only its own part.',
    todo: 'Look at Delivery readiness: every check is OK. The reports now count this project\'s approved figures.',
    outcome: 'You have seen the whole lifecycle: check your next actions, or read the case study.',
    done: () => false },
];

// ---- state, shared with the island that draws it (web/src/ui/islands/walkthrough.tsx) ------------------------------
let ctx = null;
let prefs = { walkthrough: {} };
let view = { status: 'off' };
const listeners = new Set();
export const store = { subscribe: (f) => { listeners.add(f); return () => listeners.delete(f); }, get: () => view };
function setView(next) { view = { ...view, ...next }; listeners.forEach((f) => f()); }
const set = setView;
const W = () => prefs.walkthrough ?? {};
const persona = (role) => ctx?.config.personas?.find((p) => p.key === role) ?? null;
const isDemo = () => Boolean(ctx?.config.personas?.some((p) => p.email === ctx.session?.email));

async function save(walkthrough) {
  prefs = { ...prefs, walkthrough: { ...walkthrough, savedAt: new Date().toISOString() } };
  try { await ctx.api.saveWalkthrough(prefs.walkthrough); set({ error: null }); }
  catch (e) { set({ error: `Your walkthrough progress could not be saved: ${e.message}` }); }
}
function readHandoff() { try { return JSON.parse(sessionStorage.getItem(HANDOFF) ?? 'null'); } catch { return null; } }
function writeHandoff(h) { try { sessionStorage.setItem(HANDOFF, JSON.stringify(h)); } catch { /* the next account can resume from its own run */ } }
function clearHandoff() { try { sessionStorage.removeItem(HANDOFF); } catch { /* nothing to clear */ } }

// A read that never answers must not freeze the walkthrough: it gives up after a while, and the step is read again.
const patience = (promise, ms = 15000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('the server took too long to answer')), ms))]);
async function projectState(run) {
  if (!run.projectId) return { project: null, ref: null };
  let project;
  try { project = await patience(ctx.api.project(run.projectId)); } catch (e) { if (e.kind === 'not_found') return { gone: true }; throw e; }
  const [readiness, requests, milestones] = await patience(Promise.all([ctx.api.readiness(project.id), ctx.api.changeRequests({ projectId: project.id }), ctx.api.acceptance(project.id)]));
  const live = (r) => r.status === 'pending' || r.status === 'approved';
  return { project, ref: project.project_ref, readiness,
    proposed: (kind) => requests.some((r) => live(r) && (kind === 'revenue' ? /service_line/.test(r.target_type) : /cost_line/.test(r.target_type))),
    acceptanceSent: milestones.some((m) => m.status === 'submitted' || m.status === 'verified') };
}

// Works out the current step from the saved state. A call while one is running asks for one more run after it, so a
// save that lands meanwhile is never missed, and the runs never overlap.
// Each sign-in is a new generation: whatever the previous session was still working out is discarded, never shown.
let evaluating = null;
let again = false;
let generation = 0;
export function evaluate() {
  if (evaluating) { again = true; return evaluating; }
  const gen = generation;
  const run = (async () => {
    await null;
    try { do { again = false; await compute(gen); } while (again && gen === generation); }
    finally { if (evaluating === run) evaluating = null; }
    if (gen === generation) { fill(); mark(); }
  })();
  evaluating = run;
  return run;
}
let lastRead = 0;
async function compute(gen) {
  const set = (next) => { if (gen === generation) setView(next); };
  lastRead = Date.now();
  try {
    const w = W();
    if (!ctx?.session) return set({ status: 'off' });
    if (view.status === 'complete') return; // the completion stays until the person moves on (actions.complete)
    if (!w.run) return set({ status: !w.choice && isDemo() ? 'invite' : view.status === 'choose' || view.status === 'demo-only' ? view.status : 'off', step: null });
    const s = await projectState(w.run);
    if (s.gone) return set({ status: 'gone', step: null });
    const index = STEPS.findIndex((st) => !st.done(s));
    const step = STEPS[index];
    // is complete. A dialog says so once: the run is recorded as finished straight away, so no re-render or reload
    // shows it again. A paused run says so when it is resumed.
    if (step.id === 'ready' && !w.run.paused && view.status !== 'choose') {
      set({ status: 'complete', index, total: STEPS.length, step: null, ref: s.ref, s, error: null });
      if (gen === generation) await save({ choice: 'finished', run: null });
      return;
    }
    const who = step.role ? persona(step.role) : null;
    // "choose" (resume or start again, from the profile control) stays until the person picks one.
    set({ status: view.status === 'choose' ? 'choose' : w.run.paused ? 'paused' : 'active', index, total: STEPS.length, step: stepView(step), ref: s.ref, s,
      roleOk: !step.role || ctx.session.roles.includes(step.role), who: who && { key: who.key, name: who.name, role: ROLE_NAME[step.role] }, error: null });
    retries = 0;
  } catch (e) {
    set({ error: `The walkthrough could not read the sample project: ${e.message}. It tries again in a moment.` });
    if (gen === generation && retries++ < 5) setTimeout(() => { if (gen === generation) evaluate(); }, 3000);
  }
}
let retries = 0;
const stepView = (st) => ({ id: st.id, title: st.title, duty: st.duty, todo: st.todo, outcome: st.outcome, role: st.role && ROLE_NAME[st.role] });

// ---- the step's screen: highlight its control and fill sample values into empty fields -----------------------------
const current = () => STEPS.find((st) => st.id === view.step?.id);
const onScreen = (st) => st && view.s && location.hash.split('?')[0] === st.where(view.s).split('?')[0];
// The control to use now: the first of the step's actions that the screen does not show as done. Nothing, while that
// control is not on the screen.
function targetOf(st) {
  for (const a of st.actions) {
    const el = typeof a.target === 'function' ? a.target(view.s) : document.querySelector(a.target);
    if (!el) return null;
    if (!a.met?.(el, view.s)) return el;
  }
  return null;
}
let marked = null;
function mark() {
  const st = current();
  const el = view.status === 'active' && view.roleOk && onScreen(st) ? targetOf(st) : null;
  const next = el && marked && el !== marked && marked.isConnected; // the next action, on the same screen
  if (marked && marked !== el) marked.classList.remove('wt-target');
  if (el && !el.classList.contains('wt-target')) el.classList.add('wt-target');
  marked = el;
  if (!el) return;
  // On a wide screen the card sits on the side away from the control it points at, so it never covers it.
  const r = el.getBoundingClientRect();
  document.body.dataset.wtSide = r.left + r.width / 2 < window.innerWidth / 2 ? 'right' : 'left';
  if (next) reveal(el);
}
// Brings a control to the middle of the part of the screen that the top bar and the card leave free (on a phone the card
// spans the screen above the bottom navigation), away from the edges where the card and notices sit: always when the
// person asked to be taken there, and when the highlight moves on to a control that is off screen or under the card.
// The focus stays where it is.
function reveal(el, { always = false } = {}) {
  const r = el.getBoundingClientRect();
  const card = document.querySelector('[data-kk="walkthrough"]')?.getBoundingClientRect();
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kk-appbar-h')) || 0;
  const bottom = card && card.left < r.right && card.right > r.left ? card.top : window.innerHeight;
  if (!always && r.top >= top + 8 && r.bottom <= bottom - 8) return;
  el.style.scrollMarginTop = `${top + Math.max(16, (bottom - top - r.height) / 2)}px`;
  el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.style.scrollMarginTop = '';
}
const prefilled = new WeakSet();
function fill() {
  const st = current();
  if (view.status !== 'active' || !view.roleOk || !st?.fill || !onScreen(st)) return;
  for (const [sel, spec] of Object.entries(st.fill(W().run))) {
    const { value, replace } = typeof spec === 'object' ? spec : { value: spec };
    const el = document.querySelector(sel);
    // Only an empty field (or one still showing the form's own default) is filled, once: a person's entry is never overwritten.
    if (!el || prefilled.has(el) || (el.value && el.value !== replace)) continue;
    prefilled.add(el);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.closest('label')?.removeAttribute('hidden');
  }
}

// ---- actions, from the island and the profile control ----------------------------------------------------------------
const stamp = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  .format(new Date()).replace(/\D/g, '');
// The person's saved walkthrough state, loaded once per sign-in; every action waits for it, so a quick click can never
// be overwritten by a load that finishes after it.
let loadedPrefs = Promise.resolve();
export const actions = {
  async start() {
    await loadedPrefs;
    if (!isDemo()) return set({ status: 'demo-only' });
    await save({ choice: 'started', run: { projectId: null, ref: null, startedAt: new Date().toISOString(), stamp: stamp(), paused: false } });
    await evaluate();
    if (view.roleOk) actions.go(); // otherwise the card offers the switch to the account the step needs
  },
  async later() { await save({ ...W(), choice: 'later' }); evaluate(); },
  // The profile control: start, or (with a run already going) choose between resuming and starting again.
  async open() { await loadedPrefs; if (W().run) set({ status: 'choose' }); else actions.start(); },
  // Each change shows once it is saved, so the card never shows a state the database does not have.
  async resume() { if (!W().run) return actions.start(); await save({ ...W(), run: { ...W().run, paused: false } }); set({ status: 'active' }); await evaluate(); },
  async pause() { await save({ ...W(), run: { ...W().run, paused: true } }); await evaluate(); },
  async exit() { await save({ choice: 'exited', run: null }); set({ status: 'off', step: null }); mark(); },
  async restart() { set({ status: 'off' }); await save({ choice: 'started', run: null }); await actions.start(); },
  // the screen as it is. The run was recorded as finished when it completed.
  complete(hash) { set({ status: 'off', step: null }); if (hash) ctx.nav(hash); },
  close() { set({ status: 'off' }); evaluate(); },
  // Open the step's screen and put the focus on its control.
  async go() {
    const st = current(); if (!st || !view.s || !view.roleOk) return; // never a screen this role cannot use
    ctx.nav(st.where(view.s));
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      fill();
      const el = targetOf(st);
      if (el) { mark(); reveal(el, { always: true }); el.focus({ preventScroll: true }); return; }
    }
  },
  // A step for another role: switch to that demo persona; the app reloads as them and carries on with this run.
  async switchTo(role) {
    const p = persona(role); if (!p) return;
    writeHandoff({ run: { ...W().run, paused: false }, persona: p.key, name: p.name, role: ROLE_NAME[role], ref: view.ref });
    set({ status: 'off', step: null });
    await ctx.switchPersona(p.key);
  },
};

// ---- start-up ---------------------------------------------------------------------------------------------------------
let bound = false;
export async function startWalkthrough(app) {
  ctx = app;
  set({ status: 'off', step: null, error: null });
  loadedPrefs = ctx.api.preferences().catch(() => ({ walkthrough: {} })).then((p) => { prefs = p; });
  await loadedPrefs;
  const h = readHandoff();
  if (h?.run) {
    clearHandoff();
    await save({ choice: 'started', run: h.run });
    await evaluate();
    if (view.status === 'active' && view.roleOk) actions.go();
  } else await evaluate();
  document.body.dataset.wtReady = '1'; // the person's walkthrough state is loaded (tests wait for it)
  if (bound) return;
  bound = true;
  // The intake of the walkthrough's sample opportunity becomes the run's project.
  const intake = ctx.api.intake;
  ctx.api.intake = async (payload, requestId) => {
    const r = await intake(payload, requestId);
    const run = W().run;
    if (run && !run.projectId && payload?.title === TITLE) { await save({ ...W(), run: { ...run, projectId: r.project_id, ref: r.project_ref } }); evaluate(); }
    return r;
  };
  window.addEventListener('kk:saved', (e) => { if (e.detail?.projectId && e.detail.projectId === W().run?.projectId) evaluate(); });
  // A new screen needs its control marked at once; the saved state is read again on saves (above), on coming back to
  // the tab (someone else may have acted meanwhile), and at most every 15 s while moving between screens.
  window.addEventListener('hashchange', () => { if (!ctx.session) return; fill(); mark(); if (Date.now() - lastRead > 15000) evaluate(); });
  window.addEventListener('focus', () => { if (ctx.session && W().run) evaluate(); });
  let t = null;
  const soon = () => { clearTimeout(t); t = setTimeout(() => { fill(); mark(); }, 60); };
  new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
  // A value typed or chosen moves the highlight to the next action (or back); a new width may put the card on the
  // other side.
  document.addEventListener('input', soon, true);
  document.addEventListener('change', soon, true);
  document.addEventListener('toggle', soon, true);
  window.addEventListener('resize', soon);
}
export function stopWalkthrough() {
  generation += 1; evaluating = null; again = false;
  set({ status: 'off', step: null, s: null });
  delete document.body.dataset.wtReady;
  if (marked) marked.classList.remove('wt-target');
  marked = null;
}
