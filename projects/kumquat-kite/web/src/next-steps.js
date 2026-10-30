// watchSaves(): it reads the project's checks just before the save and, once the save has succeeded (never on the
// click alone), sends a "kk:saved" event with that state. evaluate() then reads the checks again: a check that was
// open before and is OK now was completed by this save, and the next eligible steps are worked out from the saved
// state (shared/next-actions.mjs). A retry, a refresh or the same event twice completes nothing new, so nothing is
// announced twice. Suggestions are never stored: they are recalculated from the saved state each time.
import { suggestNextActions, completedChecks, commitmentsFrom } from '../../shared/next-actions.mjs';
import { todayIn } from '../../shared/scheduling.mjs';
import { esc, fmtDate } from './ui.js';

// The saves that can complete a readiness check, and how to find each one's project. Records read by this browser
// (proposals, milestones, work) say which project they belong to.
const owners = new Map();
const SAVES = {
  updateProject: (a) => a[0], submitChange: (a) => a[0]?.projectId, reviewChange: (a) => owners.get(a[0]), withdrawChange: (a) => owners.get(a[0]),
  issueJobCode: (a) => a[0], submitAcceptance: (a) => a[0]?.projectId, reviewAcceptance: (a) => owners.get(a[0]),
  createWork: (a) => a[0]?.project_id, updateWork: (a) => owners.get(a[0]),
};
const READS = ['changeRequests', 'acceptance', 'workItems'];

export function watchSaves(api) {
  const out = { ...api };
  for (const name of READS) {
    out[name] = async (...args) => {
      const rows = await api[name](...args);
      for (const r of rows ?? []) if (r?.id && r.project_id) owners.set(r.id, r.project_id);
      return rows;
    };
  }
  for (const [name, projectOf] of Object.entries(SAVES)) {
    out[name] = async (...args) => {
      const projectId = projectOf(args);
      // Read just before the save, so a check someone else completed meanwhile is never credited to this save.
      const before = projectId ? await api.readiness(projectId).catch(() => null) : null;
      const result = await api[name](...args);
      if (projectId && before) window.dispatchEvent(new CustomEvent('kk:saved', { detail: { op: name, projectId, before } }));
      return result;
    };
  }
  return out;
}

// The suggestions for one project, from its saved state. Everyone's open commitments are passed as owner and date
// only (commitmentsFrom), never with titles.
export async function suggestionsFor(ctx, project, readiness, completed = [], loaded = {}) {
  const [pending, milestones, work, open] = await Promise.all([
    loaded.pending ?? ctx.api.changeRequests({ projectId: project.id, status: 'pending' }), loaded.milestones ?? ctx.api.acceptance(project.id),
    loaded.work ?? ctx.api.workItems({ projectId: project.id }), ctx.api.commitments()]);
  const config = ctx.config.scheduling ?? null;
  return suggestNextActions({ project, readiness, pending, milestones, work, people: ctx.people, commitments: commitmentsFrom(open),
    viewer: { id: ctx.session.id, roles: ctx.session.roles }, config, today: todayIn(config?.timezone ?? 'Asia/Ho_Chi_Minh'), completed });
}

export function startNextSteps(ctx) {
  window.addEventListener('kk:saved', (e) => { evaluate(ctx, e.detail).catch((err) => console.error(err)); });
  window.addEventListener('hashchange', () => { if (shown && !location.hash.startsWith(`#/p/${shown}/`)) close(); });
}

let shown = null; // the project whose next steps the notice shows
async function evaluate(ctx, { projectId, before }) {
  const [after, project] = await Promise.all([ctx.api.readiness(projectId), ctx.api.project(projectId)]);
  const completed = completedChecks(before, after);
  if (!completed.length) return;
  const suggestions = await suggestionsFor(ctx, project, after, completed);
  const labels = completed.map((c) => after.find((r) => r.check_code === c)?.label ?? c);
  // Job 360's own list of suggestions takes the news when it shows this project (now, or once it has loaded after
  // the save); anywhere else a notice does.
  latest = { projectId, labels, suggestions, at: Date.now() };
  const detail = { projectId, completed, labels, suggestions, handled: false };
  window.dispatchEvent(new CustomEvent('kk:next-steps', { detail }));
  const onOverview = new RegExp(`^#/p/${project.project_ref}(/overview)?([?].*)?$`).test(location.hash);
  if (detail.handled) latest = null;
  else if (!onOverview) notice(project, labels, suggestions);
}

// The news of the last completion, for Job 360's list when it mounts after the save that caused it (once only).
let latest = null;
export function takeNews(projectId) {
  if (!latest || latest.projectId !== projectId || Date.now() - latest.at > 60000) return null;
  const n = latest; latest = null; return n;
}

const DUE = {
  estimate: (d) => `Suggested due ${esc(fmtDate(d.date))} (estimate)`,
  infeasible: (d) => (d.late ? `<span class="chip bad">Late</span> the target was ${esc(fmtDate(d.deadline))}; earliest ${esc(fmtDate(d.date))}`
    : `<span class="chip bad">Not feasible as planned</span> earliest ${esc(fmtDate(d.date))}, after ${esc(fmtDate(d.deadline))}`),
  blocked: () => 'Waits for an earlier step',
  needs_info: () => 'Needs scheduling information',
  overdue: () => '<span class="chip bad">Already overdue</span>',
};
export const dueText = (d) => (DUE[d.status] ?? DUE.needs_info)(d);

function close() { document.querySelector('.next-steps')?.remove(); shown = null; }
// On sign-out: a notice belongs to the person who saved, never to the next one at this screen.
export const closeNextSteps = close;
function notice(project, labels, suggestions) {
  close();
  shown = project.project_ref;
  const box = document.createElement('aside');
  box.className = 'next-steps';
  box.setAttribute('aria-label', 'Suggested next steps');
  box.innerHTML = `<div class="next-steps-head"><b>Done: ${esc(labels.join(', '))} · ${esc(project.project_ref)}</b>
      <button class="btn small ghost" type="button" data-close aria-label="Dismiss the suggested next steps">✕</button></div>
    <p class="small muted">Suggested next — nothing is assigned until someone saves it.</p>
    ${suggestions.length ? `<ol>${suggestions.slice(0, 3).map((s) => `<li><b>${esc(s.action)}</b>
      <span class="small">${esc(s.owner.name ?? s.owner.role)}${s.owner.suggested ? ' (suggested)' : ''} · ${dueText(s.due)}</span>
      ${s.mayAct ? `<a class="btn small" href="${esc(s.href)}">Go there</a>` : ''}</li>`).join('')}</ol>` : '<p>No open step is left on this project\'s readiness checks.</p>'}
    <a class="small" href="#/p/${esc(project.project_ref)}/overview?focus=suggestions">All suggestions, with how each date was worked out</a>`;
  document.body.append(box);
  box.querySelector('[data-close]').addEventListener('click', close);
  box.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setTimeout(close, 0)));
  // Announced politely to screen readers, without moving the focus away from what the person was doing.
  const live = document.querySelector('.toasts') ?? document.body;
  const say = document.createElement('div'); say.className = 'sr-only'; say.setAttribute('role', 'status');
  say.textContent = `Saved. ${suggestions.length} next step(s) suggested for ${project.project_ref}.`;
  live.append(say); setTimeout(() => say.remove(), 8000);
}
