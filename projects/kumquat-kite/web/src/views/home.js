// Home: "What do I need to do next?" — my items due this week, my other next actions, and what waits for my review.
// Every item comes from the queue_items view, which gives its reason, accountable owner, due date, next action and
// completion condition.
import { esc, fmtDate, dueChip, emptyState, errorBanner, loading, businessToday, tip } from '../ui.js';
import { WELCOME_SEEN_KEY } from './welcome.js';
import { ROLE } from '../labels.js';

const GAP_TAB = { brief: 'overview', contract: 'overview', account_owner: 'overview', job_code: 'overview', approved_revenue: 'money',
  cost_complete: 'money', acceptance: 'money' };

export function targetOf(item) {
  switch (item.kind) {
    case 'work_item': return `#/tasks/mine?focus=${item.work_item_id}`;
    case 'work_review': return `#/p/${item.project_ref}/work`;
    case 'finance_review': return `#/finance?cr=${item.change_request_id}`;
    case 'acceptance_review': return `#/finance?ac=${item.milestone_id}`;
    case 'readiness_gap': return `#/p/${item.project_ref}/${GAP_TAB[item.item_key.split(':')[1]] ?? 'overview'}`;
    default: return `#/p/${item.project_ref}/overview`;
  }
}

export function itemCard(item, ctx) {
  const cls = item.is_overdue ? 'overdue' : item.queue === 'needs_review' ? 'review' : item.kind === 'readiness_gap' ? 'gap' : '';
  const verb = { work_item: 'Update work', work_review: 'Review hand-off', finance_review: 'Open to review', acceptance_review: 'Open to verify' }[item.kind] ?? 'Open project';
  return `<article class="item ${cls}" data-item="${esc(item.item_key)}">
    <div class="reason">${esc(item.reason)}</div>
    <div class="actions"><a class="btn small ${item.is_overdue ? 'primary' : ''}" href="${esc(targetOf(item))}">${esc(verb)}</a>${dueChip(item.due_date, { overdue: item.is_overdue })}</div>
    <div><a href="#/p/${esc(item.project_ref)}/overview"><b>${esc(item.project_ref)}</b></a> · ${esc(item.project_title)}</div>
    <div class="meta"><span>Next action: <b>${esc(item.next_action)}</b></span><span>Accountable: <b>${esc(ctx.personName(item.owner_id))}</b></span>
      <span>Due: <b>${esc(item.due_date ? fmtDate(item.due_date) : 'none')}</b></span></div>
    <div class="done">Done when: <b>${esc(item.completion_condition)}</b></div></article>`;
}

// The business week runs Monday–Sunday; returns that Sunday as YYYY-MM-DD (pure calendar arithmetic).
function endOfWeek(today) {
  const [y, m, d] = today.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay();
  return new Date(t + ((7 - dow) % 7) * 86400000).toISOString().slice(0, 10);
}

export async function render(el, ctx) {
  el.innerHTML = loading('Loading your work…');
  let queue;
  try { queue = await ctx.queue(); } catch (e) { el.innerHTML = errorBanner(e, { actions: '<button class="btn small" data-retry>Try again</button>' }); el.querySelector('[data-retry]').onclick = () => render(el, ctx); return; }
  const me = ctx.session.id;
  const today = businessToday();
  const weekEnd = endOfWeek(today);
  const byDue = (a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.project_ref.localeCompare(b.project_ref);
  const mine = queue.filter((i) => i.owner_id === me && i.queue !== 'needs_review' && i.queue !== 'overdue').sort(byDue);
  const thisWeek = mine.filter((i) => i.due_date && i.due_date <= weekEnd);
  const later = mine.filter((i) => !i.due_date || i.due_date > weekEnd);
  const review = queue.filter((i) => i.queue === 'needs_review' && i.owner_id === me).sort(byDue);
  const teamOverdue = queue.filter((i) => i.queue === 'overdue');
  const name = ctx.session.profile?.display_name ?? '';
  let seen = true;
  try { seen = localStorage.getItem(`${WELCOME_SEEN_KEY}.${me}`) === '1'; } catch { /* private window */ }
  el.innerHTML = `
    <div class="title-row"><h1>Hi ${esc(name)} — what you need to do next</h1>${tip('Everything that waits for you, in one list. Each item says why it is here, who owns it, when it is due and what "done" means. Open it to act.', { step: 2 })}</div>
    ${seen ? '' : `<div class="banner info" id="welcome-banner">New to Kumquat Kite? <a href="#/welcome"><b>Read the two-minute welcome guide</b></a> — what it is for, the steps of the use case and where each one lives.
      <div class="actions"><a class="btn small blue" href="#/welcome">Open the guide</a><button class="btn small" type="button" id="welcome-dismiss">Dismiss</button></div></div>`}
    <p class="sub">${esc(ctx.session.roles.map((r) => ROLE[r] ?? r).join(' · '))} · Today is ${esc(fmtDate(today))} · Every item has a reason, an accountable owner, a due date and a "done when".</p>
    ${teamOverdue.length ? `<div class="banner warn">The team has <b>${teamOverdue.length}</b> overdue item(s). <a href="#/tasks/overdue">See the overdue list</a></div>` : ''}
    <section class="section" aria-labelledby="h-week"><h2 id="h-week">Due this week <span class="chip ghost">${thisWeek.length}</span></h2>
      <div class="queue flow-wide">${thisWeek.map((i) => itemCard(i, ctx)).join('') || emptyState('Nothing of yours is due this week.')}</div></section>
    <section class="section" aria-labelledby="h-review"><h2 id="h-review">Needs your review <span class="chip ghost">${review.length}</span></h2>
      <div class="queue flow-wide">${review.map((i) => itemCard(i, ctx)).join('') || emptyState('Nothing is waiting for your review.')}</div></section>
    <section class="section" aria-labelledby="h-later"><h2 id="h-later">My other next actions <span class="chip ghost">${later.length}</span></h2>
      <div class="queue flow-wide">${later.map((i) => itemCard(i, ctx)).join('') || emptyState('No other open actions.')}</div></section>`;
  el.querySelector('#welcome-dismiss')?.addEventListener('click', () => {
    try { localStorage.setItem(`${WELCOME_SEEN_KEY}.${me}`, '1'); } catch { /* private window */ }
    el.querySelector('#welcome-banner')?.remove();
  });
  ctx.refreshCounts?.();
}
