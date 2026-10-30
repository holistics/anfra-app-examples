// Kumquat Kite — CRM, Job 360, tasks and Finance review for TP Production Studio, on PostgreSQL, with Anfra panels.
// Sample data only. People choose a demo persona instead of signing in (server/session.mjs).
import { createApi, httpTransport } from '../../shared/api.mjs';
import { esc, toast, errorBanner, qs } from './ui.js';
import { ROLE } from './labels.js';
import { resetCatalog } from './anfra-host.js';
import { watchSaves, startNextSteps, closeNextSteps } from './next-steps.js';
import { startWalkthrough, stopWalkthrough, actions as walkthrough } from './walkthrough.js';
import { mountIsland } from './islands.js';
import * as home from './views/home.js';
import * as crm from './views/crm.js';
import * as project from './views/project.js';
import * as tasks from './views/tasks.js';
import * as finance from './views/finance.js';
import * as reports from './views/reports.js';
import * as admin from './views/admin.js';
import * as welcome from './views/welcome.js';

const root = document.getElementById('app');
const ctx = { config: null, api: null, session: null, people: [], services: [], current: null };

// short: the label in a phone's bottom bar (the full one stays the link's accessible name).
const NAV = [
  { key: 'home', href: '#/home', label: 'My next actions', short: 'Home', icon: '☑', roles: null },
  { key: 'crm', href: '#/crm', label: 'Clients & opportunities', short: 'Clients', icon: '◎', roles: null },
  { key: 'tasks', href: '#/tasks/mine', label: 'Tasks', short: 'Tasks', icon: '▤', roles: null },
  { key: 'finance', href: '#/finance', label: 'Finance review', short: 'Finance', icon: '⚖', roles: ['finance', 'account', 'bd', 'admin'] },
  { key: 'reports', href: '#/reports', label: 'Reports', short: 'Reports', icon: '▦', roles: ['bd', 'account', 'finance', 'admin'] },
  { key: 'admin', href: '#/admin/import', label: 'Import & access', short: 'Admin', icon: '⚙', roles: ['admin'] },
];
const has = (roles) => !roles || roles.some((r) => ctx.session.roles.includes(r));

// This tab's demo session: the persona chosen and the server's token for it. Each tab can be a different persona.
const AUTH_KEY = 'kk-auth';
const readAuth = () => { try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) ?? 'null'); } catch { return null; } };
const writeAuth = (a) => { try { if (a) sessionStorage.setItem(AUTH_KEY, JSON.stringify(a)); else sessionStorage.removeItem(AUTH_KEY); } catch { /* private window */ } };
ctx.getToken = async () => readAuth()?.access_token;
async function startSession(persona) {
  const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona }) });
  const s = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(s.error ?? 'This persona could not be chosen.');
  writeAuth({ access_token: s.access_token, persona: s.persona });
}
// Switching persona reloads the app as the new persona, so no screen, queue, walkthrough state or figure of the
// previous one survives; the current screen is kept (it says so if the new role may not use it).
ctx.switchPersona = async (persona) => { await startSession(persona); location.reload(); };
ctx.leaveDemo = () => { writeAuth(null); location.hash = ''; location.reload(); };
function sessionEnded() {
  if (!ctx.session) return;
  writeAuth(null); ctx.session = null; stopWalkthrough(); closeNextSteps(); resetCatalog();
  renderChooser({ kind: 'forbidden', message: 'Your demo session has ended. Choose a persona again.' });
}
ctx.nav = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
ctx.reloadPeople = async () => { ctx.people = await ctx.api.people(); };
ctx.personName = (id) => (id ? ctx.people.find((p) => p.user_id === id)?.display_name ?? 'Another user' : '—');
ctx.has = (...roles) => roles.some((r) => ctx.session.roles.includes(r));

async function boot() {
  try {
    ctx.config = await (await fetch('/config.json', { cache: 'no-store' })).json();
  } catch {
    root.innerHTML = errorBanner({ kind: 'network', message: 'Cannot reach the app server.' });
    return;
  }
  // A request the network never answers fails after 30 s, as "cannot reach the server", instead of leaving a screen
  // waiting for ever. Saves report what they completed, so the next steps can be suggested once a save has succeeded
  ctx.api = watchSaves(createApi(httpTransport({ getToken: ctx.getToken, onUnauthorized: sessionEnded })));
  startNextSteps(ctx);
  if (!readAuth()) return renderChooser();
  await enter();
}

// Demo identity selection: one of the six personas, for this tab. Not a sign-in: anyone may be anyone, and switch later.
function renderChooser(error) {
  root.innerHTML = `<main class="content" style="max-width:860px;margin:0 auto;padding-top:48px">
    <div class="row" style="margin-bottom:12px"><img src="/assets/favicon.svg" alt="" width="40" height="40">
      <div><h1>Kumquat Kite</h1><p class="sub" style="margin:0">CRM, Job 360, tasks and Finance review for TP Production Studio — one project record for the whole team</p></div>
      <span class="synthetic">Sample data</span></div>
    ${error ? errorBanner(error) : ''}
    <section class="card section" data-kk="persona-chooser">
      <h2>Choose a demo persona</h2>
      <p class="sub">This is a demo identity, not a sign-in: pick who you are, and switch at any time from the top bar. Each role sees and may do different things, and the database checks every permission for the persona chosen.</p>
      <div class="grid3">${ctx.config.personas.map((p) => `
        <button class="card btn" style="display:block;text-align:left" data-persona="${esc(p.key)}" type="button">
          <b>${esc(p.name)}</b><br><span class="muted small">${esc(p.title)}</span></button>`).join('')}</div>
      <p class="small muted">Everyone using this demo shares one database of made-up records: what any persona saves, everyone sees.</p>
    </section></main>`;
  root.querySelectorAll('[data-persona]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await startSession(b.dataset.persona); await enter(); } catch (e) { renderChooser({ kind: 'forbidden', message: e.message }); }
  }));
}

async function enter() {
  try {
    // The first screen's requests go out together: the session, the people and service lists, and the queue that
    // the home screen and the navigation counts show. The queue is used for the first screen only (see route()).
    const firstQueue = ctx.api.queue();
    firstQueue.catch(() => {}); // a failed prefetch is asked again by the screen that needs it
    [ctx.session, ctx.people, ctx.services] = await Promise.all([ctx.api.me(), ctx.api.people(), ctx.api.services()]);
    if (!ctx.session.roles.length) throw Object.assign(new Error('This account has no role yet. Ask an Admin.'), { kind: 'forbidden' });
    ctx.firstQueue = firstQueue;
  } catch (e) {
    writeAuth(null); ctx.session = null;
    return renderChooser(e);
  }
  renderShell();
  window.addEventListener('hashchange', route);
  if (!location.hash || location.hash === '#/') location.hash = '#/home'; else route();
  if (!document.getElementById('wt-root')) {
    const el = document.createElement('div'); el.id = 'wt-root'; document.body.append(el);
    mountIsland(el, 'walkthrough', {}).catch((e) => console.error(e));
  }
  startWalkthrough(ctx).catch((e) => console.error(e));
}

function renderShell() {
  const s = ctx.session;
  const name = s.profile?.display_name ?? s.email;
  const roles = s.roles.map((r) => ROLE[r] ?? r).join(' · ');
  // The top bar, as in Atomic CRM: the product on the left, the tabs, then search, the walkthrough and the person's
  // menu on the right. On a phone the tabs become a bottom bar (styles.css).
  root.innerHTML = `<div class="shell">
    <header class="appbar">
      <a class="brand" href="#/home"><img class="brand-mark" src="/assets/favicon.svg" alt=""><span><b>Kumquat Kite</b><small>CRM · Job 360 · Finance</small></span></a>
      <nav class="nav" aria-label="Main navigation">${NAV.filter((n) => has(n.roles)).map((n) => `<a href="${n.href}" data-nav="${n.key}"><span class="nav-icon" aria-hidden="true">${n.icon}</span><span class="nav-label">${esc(n.label)}</span><span class="nav-short" aria-hidden="true">${esc(n.short)}</span><span class="count" data-count="${n.key}" hidden></span></a>`).join('')}</nav>
      <div class="appbar-tools">
        <form id="find" role="search"><label class="sr-only" for="find-q">Open a project</label>
          <input id="find-q" type="search" name="q" placeholder="Open a project: ID, job code or name…" autocomplete="off">
          <button class="btn small" type="submit">Open</button></form>
        <button class="btn small" type="button" data-wt-start aria-label="Start walkthrough"><span aria-hidden="true">✦</span><span><span class="wt-long">Start </span>walkthrough</span></button>
        <span class="synthetic" title="Every record in this copy is made-up sample data; no client data is used">Sample data</span>
        <div class="who" id="who"><span class="who-name">${esc(name)}</span><span class="small muted">${esc(roles)}</span>
          <div class="who-links"><a class="welcome-link" href="#/welcome" data-nav="welcome">Welcome guide</a>
            <button class="btn small" type="button" id="tips-toggle" aria-pressed="true">Tips: on</button>
            <button class="btn small" type="button" id="leave-demo">Change persona</button></div></div>
      </div>
    </header>
    <div id="wt-invite"></div>
    <main class="content" id="view" tabindex="-1"></main></div>`;
  // The plain links above work until the person's menu has loaded; then the menu takes their place.
  qs('#leave-demo').addEventListener('click', () => ctx.leaveDemo());
  qs('#tips-toggle').addEventListener('click', () => setTips(!readTips()));
  applyTips(readTips());
  const who = qs('#who');
  mountIsland(who, 'user-menu', { name, role: roles, detail: [roles, s.email].filter(Boolean).join(' · '), tipsOn: readTips(), onTips: setTips,
    personas: ctx.config.personas, current: readAuth()?.persona, onSwitch: (key) => ctx.switchPersona(key),
    onWalkthrough: () => walkthrough.open(), onLeave: () => ctx.leaveDemo() }).catch((e) => console.error(e));
  root.querySelectorAll('[data-wt-start]').forEach((b) => b.addEventListener('click', () => walkthrough.open()));
  // The top bar's height (one or two rows), for what sticks or floats below it.
  const bar = qs('.appbar');
  new ResizeObserver(() => document.documentElement.style.setProperty('--kk-appbar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`)).observe(bar);
  qs('#find').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = ev.target.q.value.trim();
    if (!q) return;
    const p = await ctx.api.findProject(q).catch(() => null);
    if (p) { ev.target.q.value = ''; ctx.nav(`#/p/${p.project_ref}/overview`); } else ctx.nav(`#/crm?q=${encodeURIComponent(q)}`);
  });
  refreshCounts();
}

export async function refreshCounts() {
  try {
    const q = await ctx.queue();
    const mine = q.filter((i) => i.owner_id === ctx.session.id && i.queue !== 'overdue').length;
    setCount('home', mine);
    if (has(['finance'])) setCount('finance', q.filter((i) => i.kind === 'finance_review' || i.kind === 'acceptance_review').length);
  } catch { /* counts are a convenience */ }
}
ctx.refreshCounts = refreshCounts;
// The queue for a screen: the one requested at sign-in while the first screen renders, a fresh one after that.
ctx.queue = () => (ctx.firstQueue ? ctx.firstQueue.catch(() => ctx.api.queue()) : ctx.api.queue());
function setCount(key, n) { const el = qs(`[data-count="${key}"]`); if (el) { el.hidden = !n; el.textContent = n; } }

const VIEWS = { home, crm, p: project, tasks, finance, reports, admin, welcome };

// Help tips (ui.js tip()): on by default, remembered per browser; shown on hover, keyboard focus or tap, placed on
// screen, closed with Escape or by scrolling.
const TIPS_KEY = 'kk.tips';
function readTips() { try { return localStorage.getItem(TIPS_KEY) !== 'off'; } catch { return true; } }
function applyTips(on) {
  document.body.classList.toggle('tips-off', !on);
  const b = qs('#tips-toggle'); if (b) { b.textContent = `Tips: ${on ? 'on' : 'off'}`; b.setAttribute('aria-pressed', String(on)); }
}
function setTips(on) { try { localStorage.setItem(TIPS_KEY, on ? 'on' : 'off'); } catch { /* private window */ } applyTips(on); }
function placeTip(btn) {
  const t = btn.querySelector('.tip-text'); if (!t) return;
  if (!btn.classList.contains('open')) btn.dataset.openedAt = String(performance.now());
  btn.classList.add('open');
  const r = btn.getBoundingClientRect();
  t.style.maxWidth = `${Math.min(300, window.innerWidth - 16)}px`;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.offsetWidth / 2), window.innerWidth - t.offsetWidth - 8);
  let top = r.bottom + 8;
  if (top + t.offsetHeight > window.innerHeight - 8) top = r.top - t.offsetHeight - 8;
  t.style.left = `${left}px`; t.style.top = `${Math.max(8, top)}px`;
}
const closeTips = () => document.querySelectorAll('.tip.open').forEach((b) => b.classList.remove('open'));
document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const b = e.target.closest?.('[data-tip]'); if (b) placeTip(b); });
document.addEventListener('pointerout', (e) => { if (e.pointerType !== 'mouse') return; const b = e.target.closest?.('[data-tip]'); if (b && !b.contains(e.relatedTarget) && document.activeElement !== b) b.classList.remove('open'); });
document.addEventListener('focusin', (e) => { const b = e.target.closest?.('[data-tip]'); if (b) placeTip(b); });
document.addEventListener('focusout', (e) => { const b = e.target.closest?.('[data-tip]'); if (b) b.classList.remove('open'); });
// A tip inside a link, a summary or a label must not trigger it. A tap focuses the tip just before its click, which
// opens it: so a click in the same gesture (within 400 ms of opening) keeps it open, and the next tap closes it.
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-tip]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const justOpened = performance.now() - Number(b.dataset.openedAt ?? 0) < 400;
  if (b.classList.contains('open') && !justOpened) b.classList.remove('open'); else placeTip(b);
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTips(); });
window.addEventListener('scroll', closeTips, { passive: true, capture: true });
async function route() {
  if (!ctx.session) return;
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const name = parts[0] ?? 'home';
  const view = VIEWS[name] ?? home;
  const navKey = name === 'p' ? 'crm' : name;
  document.querySelectorAll('[data-nav]').forEach((a) => { if (a.dataset.nav !== navKey) a.removeAttribute('aria-current'); else a.setAttribute('aria-current', 'page'); });
  try { await ctx.current?.leave?.(); } catch { /* ignore */ }
  ctx.current = view;
  const el = qs('#view');
  el.innerHTML = '';
  try {
    await view.render(el, ctx, parts.slice(1), new URLSearchParams(query ?? ''));
    el.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    el.innerHTML = errorBanner(e.kind ? e : { kind: 'unknown', message: e.message }, { actions: '<button class="btn small" type="button" onclick="location.reload()">Reload the page</button>' });
  } finally {
    ctx.firstQueue = null; // every later screen asks for the queue again
  }
}

// Every form is handled by script; none may ever fall back to a plain browser submission (a GET of this page).
document.addEventListener('submit', (e) => e.preventDefault(), { capture: true });
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast(e.reason?.message ?? 'Something went wrong', 'bad'); });
boot();
