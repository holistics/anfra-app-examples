// Work items (Account, Design, Studio): cards with the quick updates each person may make. The database enforces who
// may move an item where; the buttons only offer the moves that make sense for the viewer.
import { esc, link, dueChip, fmtDateTime, toLocalInput, fromLocalInput, toast, errorBanner, saving } from '../ui.js';
import { TEAM, WORK, label } from '../labels.js';
import { renderConflict } from './conflict.js';

const STATUS_CLASS = { todo: 'ghost', in_progress: 'info', in_review: 'brand', changes_requested: 'warn', done: 'ok', blocked: 'bad', cancelled: 'ghost' };

export function canEdit(ctx, w) { return ctx.has('bd', 'account', 'admin') || w.assignee_id === ctx.session.id; }

function actionsFor(ctx, w) {
  const routine = ctx.has('bd', 'account', 'admin');
  const mine = w.assignee_id === ctx.session.id;
  const a = [];
  if (!routine && !mine) return a;
  const s = w.status;
  if (['todo', 'blocked', 'changes_requested'].includes(s)) a.push(['start', 'Start']);
  if (s === 'in_progress') {
    a.push(['block', 'Mark blocked']);
    if (w.team === 'design') a.push(['review', 'Send for Account review']); else a.push(['done', w.team === 'studio' ? 'Record session done' : 'Mark done']);
  }
  if (s === 'in_review' && routine) { a.push(['approve', 'Approve — done']); a.push(['changes', 'Request changes']); }
  if (s === 'in_review' && !routine && mine) a.push(['start', 'Take back to edit']);
  if (w.team === 'studio' && s !== 'done' && s !== 'cancelled') a.push(['session', 'Record actual times']);
  if (routine && !['done', 'cancelled'].includes(s)) a.push(['cancel', 'Cancel work']);
  return a;
}

export function workCard(ctx, w, { showProject = false } = {}) {
  const overdue = w.due_at && new Date(w.due_at) < new Date() && !['done', 'cancelled'].includes(w.status);
  const studio = w.team === 'studio' ? `<div class="small muted">Room: <b>${esc(w.studio_room ?? '—')}</b> · Planned ${esc(fmtDateTime(w.planned_start) || '—')} → ${esc(fmtDateTime(w.planned_end) || '—')}
      · Actual ${esc(fmtDateTime(w.actual_start) || '—')} → ${esc(fmtDateTime(w.actual_end) || '—')}
      <br><span class="chip ghost">Session request/record — not a guaranteed reservation</span>${w.session_note ? `<br>Session note: ${esc(w.session_note)}` : ''}</div>` : '';
  return `<article class="item ${overdue ? 'overdue' : w.status === 'in_review' ? 'review' : ''}" data-work="${esc(w.id)}" id="work-${esc(w.id)}">
    <div class="reason">${esc(w.work_ref)} · ${esc(w.title)} <span class="chip ${STATUS_CLASS[w.status] ?? ''}">${esc(label(WORK, w.status))}</span></div>
    <div class="actions">${actionsFor(ctx, w).map(([k, t]) => `<button class="btn small ${k === 'approve' || k === 'review' || k === 'done' ? 'primary' : ''}" type="button" data-wact="${k}">${esc(t)}</button>`).join('')}
      ${dueChip(w.due_at, { overdue })}</div>
    <div class="small">${showProject && w.project ? `<a href="#/p/${esc(w.project.project_ref)}/work"><b>${esc(w.project.project_ref)}</b></a> ${esc(w.project.title)} · ` : ''}
      Team <b>${esc(label(TEAM, w.team))}</b> · Assignee <b>${esc(ctx.personName(w.assignee_id))}</b> · Brief ${link(w.brief_url, 'open brief')} · Output ${link(w.output_url, 'open output')}</div>
    <div class="done">Done when: <b>${esc(w.completion_condition)}</b>${w.review_note ? ` · Review note: ${esc(w.review_note)}` : ''}${w.completed_at ? ` · Completed ${esc(fmtDateTime(w.completed_at))} by ${esc(ctx.personName(w.completed_by))}` : ''}</div>
    ${studio}<div data-role="work-form"></div></article>`;
}

// Inline forms for actions that need input; plain status changes save at once.
function inlineForm(kind, w) {
  if (kind === 'review') return `<form class="form" data-wform="review"><label class="f full">Output link for Account review
      <input name="output_url" type="url" required placeholder="https://…" value="${esc(w.output_url ?? '')}"></label>
      <div class="form-actions"><button class="btn primary" type="submit">Send for review</button><button class="btn" type="button" data-cancel>Cancel</button></div></form>`;
  if (kind === 'changes') return `<form class="form" data-wform="changes"><label class="f full">What needs to change?<textarea name="review_note" required minlength="3"></textarea></label>
      <div class="form-actions"><button class="btn primary" type="submit">Request changes</button><button class="btn" type="button" data-cancel>Cancel</button></div></form>`;
  if (kind === 'session' || (kind === 'done' && w.team === 'studio')) return `<form class="form" data-wform="${kind}">
      <label class="f">Actual start<input name="actual_start" type="datetime-local" value="${esc(toLocalInput(w.actual_start ?? w.planned_start))}" ${kind === 'done' ? 'required' : ''}></label>
      <label class="f">Actual end<input name="actual_end" type="datetime-local" value="${esc(toLocalInput(w.actual_end ?? w.planned_end))}" ${kind === 'done' ? 'required' : ''}></label>
      <label class="f full">Session note (incidents, changes)<input name="session_note" value="${esc(w.session_note ?? '')}"></label>
      <div class="form-actions"><button class="btn primary" type="submit">${kind === 'done' ? 'Save and mark done' : 'Save actual times'}</button><button class="btn" type="button" data-cancel>Cancel</button></div></form>`;
  return null;
}

const NEXT = { start: 'in_progress', block: 'blocked', done: 'done', approve: 'done', cancel: 'cancelled' };
const LABELS = { status: 'Status', output_url: 'Output link', review_note: 'Review note', actual_start: 'Actual start', actual_end: 'Actual end', session_note: 'Session note' };

export function bindWork(container, ctx, items, reload) {
  container.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-wact]');
    if (!btn) return;
    const card = btn.closest('[data-work]');
    const w = items.find((x) => x.id === card.dataset.work);
    const kind = btn.dataset.wact;
    const slot = card.querySelector('[data-role=work-form]');
    const form = inlineForm(kind, w);
    if (form) {
      slot.innerHTML = form;
      const f = slot.querySelector('form');
      f.querySelector('input,textarea')?.focus();
      f.querySelector('[data-cancel]').onclick = () => { slot.innerHTML = ''; };
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(f));
        const patch = {};
        if (kind === 'review') Object.assign(patch, { status: 'in_review', output_url: v.output_url });
        if (kind === 'changes') Object.assign(patch, { status: 'changes_requested', review_note: v.review_note });
        if (kind === 'session' || kind === 'done') Object.assign(patch, { actual_start: fromLocalInput(v.actual_start), actual_end: fromLocalInput(v.actual_end), session_note: v.session_note || null });
        if (kind === 'done') {
          if (w.status === 'todo') {
            const started = await save(slot, ctx, w, { status: 'in_progress' }, reload, { quiet: true });
            if (!started) return;
            Object.assign(w, started);
          }
          patch.status = 'done';
        }
        await save(slot, ctx, w, patch, reload, { button: f.querySelector('[type=submit]') });
      });
      return;
    }
    await save(slot, ctx, w, { status: NEXT[kind] }, reload, { button: btn });
  });
}

async function save(slot, ctx, w, patch, reload, { button, quiet } = {}) {
  try {
    const saved = await saving(button, () => ctx.api.updateWork(w.id, w.version, patch));
    if (!quiet) toast(`Saved ${saved.work_ref}: ${label(WORK, saved.status)} (v${saved.version})`, 'ok');
    if (!quiet) await reload();
    return saved;
  } catch (e) {
    if (e.kind === 'conflict') {
      const latest = (await ctx.api.workItems({ projectId: w.project_id })).find((x) => x.id === w.id);
      renderConflict(slot, { error: e, latest, draft: patch, original: w, labels: LABELS,
        onReapply: async () => { Object.assign(w, latest); await save(slot, ctx, w, patch, reload); },
        onDiscard: () => reload() });
    } else slot.innerHTML = errorBanner(e);
    return null;
  }
}
