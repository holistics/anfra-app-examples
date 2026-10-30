// Tasks: my work, overdue work, work waiting for my review, and the studio session list. Quick updates are buttons
// on each card (keyboard and narrow-screen friendly); every update saves with the item's version.
import { esc, fmtDateTime, errorBanner, loading, emptyState, qs, tip } from '../ui.js';
import { WORK, label } from '../labels.js';
import { workCard, bindWork } from './work.js';
import { itemCard } from './home.js';

const TABS = [['mine', 'My work'], ['review', 'Waiting for my review'], ['overdue', 'Overdue'], ['studio', 'Studio sessions']];

export async function render(el, ctx, [tab = 'mine'], params) {
  el.innerHTML = `<div class="title-row"><h1>Tasks</h1>${tip('My work, overdue work and the review queue. Quick updates are buttons on each card, and they work on a phone too. A studio session is a recorded request, not a guaranteed reservation.', { step: 3 })}</div><p class="sub">Account, Design and Studio work — assigned, updated and handed off on the same project record.</p>
    <nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<a role="tab" href="#/tasks/${k}" aria-selected="${k === tab}">${esc(t)}</a>`).join('')}</nav><div id="task-body">${loading()}</div>`;
  const body = qs('#task-body', el);
  const reload = () => render(el, ctx, [tab], params);
  try {
    if (tab === 'review') {
      const [queue, items] = await Promise.all([ctx.api.queue(), ctx.api.workItems()]);
      const ids = new Set(queue.filter((q) => q.kind === 'work_review' && q.owner_id === ctx.session.id).map((q) => q.work_item_id));
      const list = items.filter((w) => ids.has(w.id));
      body.innerHTML = `<div class="queue flow-wide" id="list">${list.map((w) => workCard(ctx, w, { showProject: true })).join('') || emptyState('No hand-off is waiting for your review.')}</div>`;
      bindWork(qs('#list', body), ctx, list, reload);
    } else if (tab === 'overdue') {
      const queue = await ctx.api.queue();
      const team = ctx.has('bd', 'account', 'admin');
      const list = queue.filter((q) => (team ? q.queue === 'overdue' : q.owner_id === ctx.session.id && q.is_overdue))
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
      body.innerHTML = `<p class="small muted">${team ? 'Everything overdue across the team (next actions and work), with who is accountable.' : 'Your overdue items.'}</p>
        <div class="queue flow-wide">${list.map((i) => itemCard(i, ctx)).join('') || emptyState('Nothing is overdue.')}</div>`;
    } else if (tab === 'studio') {
      const items = (await ctx.api.workItems()).filter((w) => w.team === 'studio').sort((a, b) => String(a.planned_start ?? a.due_at).localeCompare(String(b.planned_start ?? b.due_at)));
      body.innerHTML = `<div class="banner info">Studio sessions, as requested and recorded: room, planned and actual times, status and assignee. They are records, not room reservations, and are not used to measure utilisation.</div>
        <div class="table-wrap card" style="padding:0"><table><thead><tr><th>Session</th><th>Project</th><th>Room</th><th>Planned</th><th>Actual</th><th>Status</th><th>Assignee</th></tr></thead><tbody>
        ${items.map((w) => `<tr><td><b>${esc(w.work_ref)}</b> ${esc(w.title)}</td><td><a href="#/p/${esc(w.project?.project_ref)}/work">${esc(w.project?.project_ref)}</a></td><td>${esc(w.studio_room ?? '—')}</td>
          <td class="small">${esc(fmtDateTime(w.planned_start) || '—')}<br>→ ${esc(fmtDateTime(w.planned_end) || '—')}</td><td class="small">${esc(fmtDateTime(w.actual_start) || '—')}<br>→ ${esc(fmtDateTime(w.actual_end) || '—')}</td>
          <td>${esc(label(WORK, w.status))}</td><td>${esc(ctx.personName(w.assignee_id))}</td></tr>`).join('') || `<tr><td colspan="7">${emptyState('No studio sessions yet.')}</td></tr>`}</tbody></table></div>`;
    } else {
      const items = await ctx.api.workItems({ assigneeId: ctx.session.id });
      const open = items.filter((w) => !['done', 'cancelled'].includes(w.status));
      const done = items.filter((w) => w.status === 'done').slice(-5);
      body.innerHTML = `<div class="queue flow-wide" id="list">${open.map((w) => workCard(ctx, w, { showProject: true })).join('') || emptyState('You have no open work.')}</div>
        ${done.length ? `<h2 style="margin-top:20px">Recently done</h2><div class="queue flow-wide">${done.map((w) => workCard(ctx, w, { showProject: true })).join('')}</div>` : ''}`;
      bindWork(qs('#list', body), ctx, open, reload);
      const focus = params.get('focus');
      if (focus) qs(`#work-${CSS.escape(focus)}`, body)?.scrollIntoView({ block: 'center' });
    }
  } catch (e) { body.innerHTML = errorBanner(e); }
}
