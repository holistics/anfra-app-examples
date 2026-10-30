//
// Suggestions are derived, never stored: suggestNextActions() is a pure function of the project's saved state (its
// readiness checks, pending proposals, acceptance, work and next actions), the people and their roles, and the
// scheduling settings. So a retry, a refresh or a repeated completion event gives the same suggestions with the same
// keys, never duplicates; and a change of owner, workload, prerequisite or project state recalculates them.
// They stay separate from committed assignments: applying one means saving it through the normal Update project
// form, with its version check, by someone allowed to.
//
// The transitions are the existing workflow's: the readiness checks of public.project_readiness, their steps in
// shared/readiness-guide.mjs (prepare, then approve), and the queue's POC rule for target dates (public.queue_items,
// gap_rules). Due dates come from shared/scheduling.mjs.
import { GUIDE, currentStep, CAN, ROLE_NAME } from './readiness-guide.mjs';
import { estimateDue, toDay, fmtDay } from './scheduling.mjs';

// The queue's POC rule (public.queue_items, gap_rules): the target is this many calendar days after the anchor date.
export const RULE_TARGET = {
  contract: ['contract', 0], account_owner: ['contract', 1], approved_revenue: ['contract', 2], job_code: ['contract', 2],
  brief: ['contract', 3], cost_complete: ['contract', 5], acceptance: ['delivery', 3],
};
// Steps that wait for another check: Finance issues a job code, and approves the contract revenue, only once the
// contract is signed (issue_job_code and the queue's rule both start from the contract).
export const DEPENDS_ON = { job_code: ['contract'], approved_revenue: ['contract'] };
const MAX = 5;

function ruleTarget(code, project) {
  const rule = RULE_TARGET[code];
  if (!rule) return {};
  const anchor = rule[0] === 'delivery' ? project.promised_delivery_date : project.contract_signed_date;
  if (!anchor) return {};
  return { date: fmtDay(new Date(toDay(anchor).getTime() + rule[1] * 86400000)),
    label: `the readiness target: ${rule[1]} day(s) after the ${rule[0] === 'delivery' ? 'promised delivery' : 'contract'} date, a POC default` };
}

// The people who could own a step: by role, never the person who submitted what is being approved.
function eligible(step, project, people, item) {
  const withRole = (r) => people.filter((p) => p.roles.includes(r));
  if (step.who === 'finance') return withRole('finance').filter((p) => p.user_id !== item?.requested_by && p.user_id !== item?.submitted_by);
  if (step.who === 'bd') return withRole('bd');
  if (step.who === 'account') return withRole('account');
  if (step.who === 'bd/account') return [...withRole('bd'), ...withRole('account')];
  return [];
}

// The owner of a step: the person the project names, or, when it names nobody, an explicitly suggested eligible owner:
// the eligible person with the fewest open commitments (ties by name, so the choice is deterministic).
function ownerFor(step, project, people, item, commitments) {
  const named = { bd: project.owner_id, account: project.account_owner_id,
    'bd/account': project.next_action_owner_id ?? project.account_owner_id ?? project.owner_id }[step.who];
  const name = (id) => people.find((p) => p.user_id === id)?.display_name ?? 'another user';
  if (named) return { id: named, name: name(named), role: ROLE_NAME[step.who] ?? step.who, suggested: false };
  const pool = eligible(step, project, people, item);
  if (!pool.length) return { id: null, name: null, role: step.who === 'assignee' ? 'Assignees' : ROLE_NAME[step.who] ?? step.who, suggested: false };
  const load = (id) => commitments.filter((c) => c.ownerId === id).length;
  const pick = [...pool].sort((a, b) => load(a.user_id) - load(b.user_id) || a.display_name.localeCompare(b.display_name))[0];
  return { id: pick.user_id, name: pick.display_name, role: ROLE_NAME[step.who] ?? step.who, suggested: true,
    note: `Suggested: no one is named for this step. ${pick.display_name} has the ${ROLE_NAME[step.who] ?? step.who} role and the fewest open items (a count, not a measure of capacity).` };
}

// Open commitments of everyone, as { ownerId, due } only: never titles, so an explanation cannot reveal another person's
// task details.
export function commitmentsFrom({ workItems = [], projects = [] }) {
  const out = [];
  for (const w of workItems) if (w.assignee_id && w.due_at && !['done', 'cancelled'].includes(w.status)) out.push({ ownerId: w.assignee_id, due: String(w.due_at).slice(0, 10) });
  for (const p of projects) if (p.next_action_owner_id && p.next_action && p.next_action_due) out.push({ ownerId: p.next_action_owner_id, due: String(p.next_action_due).slice(0, 10) });
  return out;
}

// The project's next action already is this step (for example after someone applied this suggestion).
const norm = (t) => String(t ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
export function inProgress(project, step) {
  return Boolean(project.next_action) && norm(project.next_action) === norm(step.action);
}

export function suggestNextActions({ project, readiness = [], pending = [], milestones = [], work = [], people = [], commitments = [], viewer, config, today, completed = [] }) {
  const byCode = Object.fromEntries(readiness.map((r) => [r.check_code, r]));
  const doneLabels = completed.map((c) => byCode[c]?.label ?? c);
  const out = [];
  for (const check of [...readiness].sort((a, b) => a.sort_order - b.sort_order)) {
    const cur = currentStep(check, { pending, milestones, work });
    if (!cur || cur.state === 'done' || cur.state === 'na' || !cur.step) continue;
    const { step, item, state } = cur;
    // Work already in progress is not suggested again: the project's next action is already this step.
    if (inProgress(project, step)) continue;
    const open = (DEPENDS_ON[check.check_code] ?? []).filter((c) => byCode[c] && !['ok', 'not_applicable'].includes(byCode[c].status));
    const owner = ownerFor(step, project, people, item, commitments);
    const target = ruleTarget(check.check_code, project);
    const due = check.check_code === 'work_on_time'
      // Overdue work already has its assignees and due dates: the step is to finish or reschedule it, not a new date.
      ? { status: 'overdue', date: null, lines: ['This work is already past its due date. Finish it, or agree a new date with its assignee on the Work tab.'] }
      : !config ? { status: 'needs_info', date: null, missing: ['scheduling settings'], lines: ['Needs scheduling information: no scheduling settings are configured (config/scheduling.json).'] }
      : estimateDue({ stepKey: `${check.check_code}.${step.kind}`, ownerId: owner.id, today, dependencyOpen: open.length > 0,
        dependencyLabel: open.map((c) => byCode[c].label).join(', '), commitments, promisedDelivery: project.promised_delivery_date,
        ruleTarget: target.date, ruleTargetLabel: target.label, config });
    const why = doneLabels.length
      ? `Now that "${doneLabels.join('", "')}" is done, this is the next open step for "${check.label}". ${check.detail}`
      : `"${check.label}" is ${state === 'pending' ? 'waiting for approval' : state === 'blocked' ? 'blocked' : 'not done yet'}. ${check.detail}`;
    out.push({
      key: `${project.id}:${check.check_code}:${step.kind}`, code: check.check_code, label: check.label, kind: step.kind, state,
      action: step.action, where: step.where, why, owner, due, href: step.href(project, item),
      mayAct: CAN[step.can]?.(viewer, project, item) ?? false,
      mayAssign: CAN.next_action(viewer, project),
    });
  }
  // Steps that can start now come first, in workflow order; blocked ones last.
  out.sort((a, b) => (a.due.status === 'blocked') - (b.due.status === 'blocked'));
  return out.slice(0, MAX);
}

// The suggestions not announced before: repeated events, retries and refreshes announce nothing new.
export function newSuggestions(seenKeys, suggestions) {
  return suggestions.filter((s) => !seenKeys.has(s.key));
}

// Which checks a save completed: open before, ok after. A repeated event compares ok with ok, and completes nothing.
export function completedChecks(before = [], after = []) {
  const was = Object.fromEntries(before.map((r) => [r.check_code, r.status]));
  return after.filter((r) => r.status === 'ok' && was[r.check_code] && was[r.check_code] !== 'ok').map((r) => r.check_code);
}

export { GUIDE };
