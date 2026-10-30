// public.project_readiness): what it means, the steps that complete it (preparing or submitting, then approving or
// verifying), who does each step, where in the app, and what completes it. guide() combines a row of that table with
// the check's current status, the project's state and the viewer's roles.
//
// The permissions described here are the database's own, so the guidance never offers an action the viewer cannot
// take, and taking it is still checked there:
//   routine project fields (contract, brief, Account owner) ... BD, Account or Admin (projects_before_write trigger)
//   the next action ............................................ those roles, or the person who owns the next action
//   proposals of revenue or cost ................................ Account only (submit_change_request)
//   approving or rejecting a proposal ........................... Finance, never one's own (review_change_request)
//   acceptance milestones ....................................... Account submits, Finance verifies, never one's own
//   job codes ................................................... Finance only (issue_job_code)
//   work items .................................................. BD, Account, Admin, or the item's assignee

export const ROLE_NAME = { bd: 'BD', account: 'Account', finance: 'Finance', design: 'Design', studio: 'Studio', admin: 'Admin' };

const has = (viewer, ...roles) => roles.some((r) => viewer.roles.includes(r));
// Whether the viewer may take a step, by the database's rules above. `item` is the pending record, when the step is
// a review of something someone submitted.
export const CAN = {
  routine: (v) => has(v, 'bd', 'account', 'admin'),
  next_action: (v, p) => has(v, 'bd', 'account', 'admin') || p.next_action_owner_id === v.id,
  propose: (v) => has(v, 'account'),
  review: (v, _p, item) => has(v, 'finance') && (!item || item.requested_by !== v.id),
  acceptance: (v) => has(v, 'account'),
  verify: (v, _p, item) => has(v, 'finance') && (!item || item.submitted_by !== v.id),
  job_code: (v) => has(v, 'finance'),
  work: (v, _p, item) => has(v, 'bd', 'account', 'admin') || Boolean(item?.assignees?.includes(v.id)),
};

// What each kind of step is called on screen: preparing or submitting is never the same as approving or verifying.
export const STEP_TITLE = { prepare: 'Prepare and submit', approve: 'Approve or verify' };

const at = (p, tab, focus) => `#/p/${encodeURIComponent(p.project_ref)}/${tab}${focus ? `?focus=${encodeURIComponent(focus)}` : ''}`;
const isRevenue = (cr) => cr.target_type === 'service_line' || cr.target_type === 'new_service_line';
const isCost = (cr) => cr.target_type === 'cost_line' || cr.target_type === 'new_cost_line';

// who: the role that does the step; person: how to find the accountable person on the project; when: the same step
// worded for a particular status of the check (an amount still unknown, a next action overdue).
export const GUIDE = {
  next_action: {
    meaning: 'Every open project has one next action, with an owner, a due date and what "done" means, so nothing waits on someone remembering it.',
    whenNa: 'Not needed once the project has ended or was lost.',
    steps: [{ kind: 'prepare', who: 'bd/account', can: 'next_action', person: 'next_action', where: 'Job 360 → Overview → Update project → Next action',
      action: 'Set what needs doing, its owner, the due date and "done when", then save', href: (p) => at(p, 'overview', 'next_action'),
      when: { blocked: { action: 'Do the overdue next action and set the one after it, or agree a new due date and save it' } } }],
    completes: 'A saved next action with an owner and a due date that has not passed.',
  },
  contract: {
    meaning: 'Delivery starts from a signed contract, recorded with its reference and signing date.',
    whenNa: 'Needed once the deal is won or delivery starts.',
    steps: [{ kind: 'prepare', who: 'bd', can: 'routine', person: 'owner', where: 'Job 360 → Overview → Update project',
      action: 'Set the stage to "Contract signed", with the contract reference and the signing date', href: (p) => at(p, 'overview', 'commercial_stage') }],
    completes: 'The contract reference and signing date show on Job 360.',
  },
  brief: {
    meaning: 'The client\'s brief is confirmed and linked, so Design and Studio work from the same document.',
    whenNa: 'Needed once the deal is won or delivery starts.',
    steps: [{ kind: 'prepare', who: 'account', can: 'routine', person: 'account_owner', where: 'Job 360 → Overview → Update project → Brief',
      action: 'Get the brief from the client, add its link and mark it Ready', href: (p) => at(p, 'overview', 'brief_status') }],
    completes: 'The brief is Ready, with a document link.',
  },
  account_owner: {
    meaning: 'One Account owner runs delivery and is accountable for the handoffs.',
    whenNa: 'Needed once the deal is won or delivery starts.',
    steps: [{ kind: 'prepare', who: 'bd', can: 'routine', person: 'owner', where: 'Job 360 → Overview → Update project',
      action: 'Choose the Account owner for delivery, then save', href: (p) => at(p, 'overview', 'account_owner_id') }],
    completes: 'The project names its Account owner.',
  },
  job_code: {
    meaning: 'Finance issues the job code that links the contract, acceptance and cash; until then the project uses its internal ID.',
    whenNa: 'Needed once the deal is won or delivery starts.',
    steps: [{ kind: 'approve', title: 'Issue', who: 'finance', can: 'job_code', person: 'finance', where: 'Job 360 → Overview → Finance actions',
      action: 'Check that the deposit is paid, the contract signed and the quotation verified, then issue the job code (the app records the code; it does not check these for you)',
      href: (p) => at(p, 'overview', 'job_code') }],
    completes: 'The job code shows on Job 360.',
  },
  approved_revenue: {
    meaning: 'Finance has approved the contract value as revenue, with an amount, so the project\'s margin can be measured.',
    whenNa: 'Needed once the deal is won or delivery starts.',
    steps: [
      { kind: 'prepare', who: 'account', can: 'propose', person: 'account_owner', where: 'Job 360 → Money → + Propose a new revenue line',
        action: 'Propose the contract value as a revenue line, with the contract as evidence', href: (p) => at(p, 'money', 'new_service_line'),
        when: {
          unknown: { where: 'Job 360 → Money → "Propose a change" on the revenue line without an amount', action: 'Propose the amount of each revenue line shown without one, with evidence', href: (p) => at(p, 'money', 'money_lines') },
          blocked: { where: 'Job 360 → Money → Money lines in force', action: 'Check the contract value: zero revenue on a commercial project needs a proposal with the right amount, or an explanation to Finance', href: (p) => at(p, 'money', 'money_lines') },
        } },
      { kind: 'approve', who: 'finance', can: 'review', person: 'finance', where: 'Finance review',
        action: 'Compare the proposal with its evidence, then approve it, or reject it with a reason', href: (_p, item) => (item ? `#/finance?cr=${encodeURIComponent(item.id)}` : '#/finance') },
    ],
    completes: 'A revenue line with an amount, approved by Finance. A proposal alone does not count.',
  },
  cost_complete: {
    meaning: 'Every forecast cost line has an amount approved by Finance. A cost without an amount stays "unknown", never 0, so the margin is not overstated.',
    whenNa: 'Needed once the deal is won or delivery starts.',
    steps: [
      { kind: 'prepare', who: 'account', can: 'propose', person: 'account_owner', where: 'Job 360 → Money → + Propose a new cost line, or "Propose a change" on a line without an amount',
        action: 'Propose each missing cost with its amount and evidence', href: (p) => at(p, 'money', 'new_cost_line'),
        when: { unknown: { where: 'Job 360 → Money → "Propose a change" on the cost line without an amount', action: 'Propose the amount of each cost line shown as unknown, with evidence', href: (p) => at(p, 'money', 'money_lines') } } },
      { kind: 'approve', who: 'finance', can: 'review', person: 'finance', where: 'Finance review',
        action: 'Compare each cost proposal with its evidence, then approve it, or reject it with a reason', href: (_p, item) => (item ? `#/finance?cr=${encodeURIComponent(item.id)}` : '#/finance') },
    ],
    completes: 'Every cost line has an amount approved by Finance.',
  },
  finance_review: {
    meaning: 'No proposal is waiting for Finance, so the approved figures are current.',
    steps: [{ kind: 'approve', who: 'finance', can: 'review', person: 'finance', where: 'Finance review',
      action: 'Approve the waiting proposal, or reject it with a reason', href: (_p, item) => (item ? `#/finance?cr=${encodeURIComponent(item.id)}` : '#/finance') }],
    completes: 'Every pending proposal is approved, or rejected with a reason.',
  },
  work_on_time: {
    meaning: 'No piece of work on the project is past its due date.',
    steps: [{ kind: 'prepare', who: 'assignee', can: 'work', person: 'assignees', where: 'Job 360 → Work',
      action: 'Finish the overdue work (its assignee), or set a new due date with the assignee (BD or Account)', href: (p) => at(p, 'work') }],
    completes: 'No open work item is past its due date.',
  },
  acceptance: {
    meaning: 'After delivery, the client\'s acceptance is recorded with evidence and verified by Finance. Acceptance is neither cash nor revenue.',
    whenNa: 'Needed once delivery is marked Delivered.',
    steps: [
      { kind: 'prepare', who: 'account', can: 'acceptance', person: 'account_owner', where: 'Job 360 → Money → Submit an acceptance milestone',
        action: 'Submit the acceptance milestone, with the signed acceptance minutes as evidence', href: (p) => at(p, 'money', 'acceptance') },
      { kind: 'approve', who: 'finance', can: 'verify', person: 'finance', where: 'Finance review → Acceptance waiting for verification',
        action: 'Check the evidence and the amount, then verify it, or reject it with a reason', href: (_p, item) => (item ? `#/finance?ac=${encodeURIComponent(item.id)}` : '#/finance') },
    ],
    completes: 'An acceptance milestone verified by Finance.',
  },
};

// Which step a check is at now, from its status and the project's pending records. Returns the step, its kind of
// state ('done', 'na', 'prepare', 'pending' = submitted and waiting for approval, 'blocked'), and the pending record.
export function currentStep(check, { pending = [], milestones = [], work = [] } = {}) {
  const g = GUIDE[check.check_code];
  if (!g) return null;
  if (check.status === 'ok') return { g, state: 'done' };
  if (check.status === 'not_applicable') return { g, state: 'na' };
  const resolve = (st) => st && { ...st, ...st.when?.[check.status] };
  const approve = resolve(g.steps.find((s) => s.kind === 'approve'));
  const prepare = resolve(g.steps.find((s) => s.kind === 'prepare'));
  if (check.check_code === 'work_on_time') {
    const now = Date.now();
    const assignees = [...new Set(work.filter((w) => !['done', 'cancelled'].includes(w.status) && w.due_at && new Date(w.due_at).getTime() < now).map((w) => w.assignee_id).filter(Boolean))];
    return { g, step: prepare, state: 'blocked', item: { assignees } };
  }
  if (check.check_code === 'approved_revenue' || check.check_code === 'cost_complete') {
    const item = pending.find(check.check_code === 'approved_revenue' ? isRevenue : isCost);
    if (item) return { g, step: approve, state: 'pending', item };
    return { g, step: prepare, state: check.status === 'blocked' ? 'blocked' : 'prepare' };
  }
  if (check.check_code === 'finance_review') return { g, step: approve, state: 'pending', item: pending[0] };
  if (check.check_code === 'acceptance') {
    const item = milestones.find((m) => m.status === 'submitted');
    if (item) return { g, step: approve, state: 'pending', item };
    return { g, step: prepare, state: 'prepare' };
  }
  return { g, step: prepare ?? approve, state: check.status === 'blocked' ? 'blocked' : 'prepare' };
}

// The accountable person for a step, by name when the project names one.
export function responsible(step, project, { personName = () => null, item } = {}) {
  const role = step.who === 'bd/account' ? 'BD or Account' : step.who === 'assignee' ? 'the assignees' : ROLE_NAME[step.who] ?? step.who;
  const named = (id, what) => (id ? `${personName(id) ?? 'another user'} (${what})` : null);
  switch (step.person) {
    case 'owner': return named(project.owner_id, 'BD, project owner') ?? 'the project owner (BD)';
    case 'account_owner': return named(project.account_owner_id, 'Account owner') ?? 'the Account owner, not assigned yet: BD assigns one first';
    case 'next_action': return named(project.next_action_owner_id, 'owns the next action') ?? 'BD or Account';
    case 'finance': return item?.requested_by || item?.submitted_by ? 'Finance: anyone in Finance other than the person who submitted it' : 'Finance';
    case 'assignees': return 'the people whose work is overdue, with the Account owner';
    default: return role;
  }
}

// The guidance for one check, for this viewer, in this state:
//   meaning, now (what is missing or pending), steps (each step's kind, who, and whether it is done, current or next),
//   step (the current one: who, where, what), completes (what evidence or action completes it), yourPart (what this
//   viewer can do, or whom to hand it to), actions (links, only to what this viewer may do), short (a tooltip line).
const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);
export function guide(check, project, viewer, { pending = [], milestones = [], work = [], personName } = {}) {
  const cur = currentStep(check, { pending, milestones, work });
  if (!cur) return null;
  const { g, step, state, item } = cur;
  const base = { code: check.check_code, label: check.label, status: check.status, state, meaning: g.meaning, completes: g.completes, now: check.detail };
  const view = (st, s2) => ({ kind: st.kind, title: st.title ?? STEP_TITLE[st.kind], who: responsible(st, project, { personName, item }), action: st.action, state: s2 });
  if (state === 'done') return { ...base, steps: g.steps.map((st) => view(st, 'done')), short: `Done. ${check.detail}`, yourPart: null, actions: [], mayAct: false };
  if (state === 'na') return { ...base, steps: g.steps.map((st) => view(st, 'later')), short: `Not needed now. ${g.whenNa ?? ''}`.trim(), now: g.whenNa ?? check.detail, yourPart: null, actions: [], mayAct: false };
  const steps = g.steps.map((st) => {
    if (st.kind === step.kind) return view(step, 'current');
    return view(st, st.kind === 'prepare' ? 'done' : 'next');
  });
  const who = responsible(step, project, { personName, item });
  const mayAct = CAN[step.can]?.(viewer, project, item) ?? false;
  const ownSubmission = Boolean(item) && (item.requested_by === viewer.id || item.submitted_by === viewer.id);
  const ref = item?.request_ref ?? item?.milestone_ref;
  const now = state === 'pending' ? `${ref ?? 'A submission'} is waiting for Finance. ${check.detail}` : check.detail;
  let yourPart;
  if (mayAct) yourPart = `You can do this: ${lower(step.action)}.`;
  else if (ownSubmission && has(viewer, 'finance')) yourPart = 'You submitted this, so another person in Finance approves it: the database refuses an approval of one\'s own submission.';
  else if (ownSubmission) yourPart = `You submitted ${ref}. It now waits for Finance, and this check updates when they decide.${item.request_ref ? ' Until then you can withdraw it on the Money tab.' : ''}`;
  else yourPart = `This is for ${who}. Ask them to ${lower(step.action)} (${step.where}). Your role cannot do this step, and the database would refuse it.`;
  const actions = mayAct ? [{ label: state === 'pending' ? 'Open the review' : 'Go there', href: step.href(project, item) }] : [];
  // Someone who cannot act may still follow the record where the work shows (never a screen offering the action).
  if (!mayAct && step.kind === 'approve' && has(viewer, 'bd', 'account', 'admin')) actions.push({ label: 'See it on Job 360', href: at(project, 'money') });
  const short = state === 'pending'
    ? (mayAct ? `Waiting for your review: ${ref}.` : `Waiting for Finance to ${step.kind === 'approve' ? 'approve or verify' : 'act on'} ${ref ?? 'it'}.`)
    : mayAct ? `Your step: ${lower(step.action)}.` : `${step.kind === 'approve' ? 'Finance' : who} does this: ${lower(step.action)}.`;
  const role = step.who === 'bd/account' ? 'BD or Account' : step.who === 'assignee' ? 'Assignees' : ROLE_NAME[step.who] ?? step.who;
  return { ...base, now, steps, step: { kind: step.kind, title: step.title ?? STEP_TITLE[step.kind], who, role, where: step.where, action: step.action }, short, yourPart, actions, mayAct, item: item ? { ref } : null };
}
