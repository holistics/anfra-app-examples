// database, no browser. Run with `npm run test:unit`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDue, todayIn } from '../../shared/scheduling.mjs';
import { suggestNextActions, newSuggestions, completedChecks, commitmentsFrom } from '../../shared/next-actions.mjs';
import { guide } from '../../shared/readiness-guide.mjs';

const config = { timezone: 'Asia/Ho_Chi_Minh', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], holidays: [],
  effortWorkingDays: { 'brief.prepare': 2, 'job_code.approve': 1, 'approved_revenue.prepare': 1, 'approved_revenue.approve': 2, 'cost_complete.prepare': 2, 'cost_complete.approve': 2, 'account_owner.prepare': 1, 'contract.prepare': 1, 'acceptance.prepare': 2, 'acceptance.approve': 2, 'next_action.prepare': 1 } };
const people = [
  { user_id: 'bd', display_name: 'Duong Trinh', roles: ['bd'] }, { user_id: 'acc', display_name: 'Bao Nguyen', roles: ['account'] },
  { user_id: 'fin', display_name: 'Mai Le', roles: ['finance'] }, { user_id: 'fin2', display_name: 'An Pham', roles: ['finance'] },
];
const project = { id: 'p1', project_ref: 'NP-0100', owner_id: 'bd', account_owner_id: 'acc', next_action: 'Send the revised quotation', next_action_owner_id: 'acc',
  next_action_due: '2026-10-21', contract_signed_date: '2026-10-16', promised_delivery_date: '2026-12-31' };
const check = (code, status, sort, detail = '') => ({ check_code: code, label: code, status, sort_order: sort, detail });
const readiness = [check('next_action', 'ok', 1), check('contract', 'ok', 2), check('brief', 'ok', 3), check('account_owner', 'ok', 4),
  check('job_code', 'missing', 5), check('approved_revenue', 'missing', 6), check('cost_complete', 'missing', 7), check('finance_review', 'ok', 8),
  check('work_on_time', 'ok', 9), check('acceptance', 'not_applicable', 10)];
const viewer = (id, roles) => ({ id, roles });

test('calendar: a Saturday request starts on Monday, and effort skips the weekend and holidays', () => {
  const r = estimateDue({ stepKey: 'brief.prepare', ownerId: 'acc', today: '2026-10-17', config });
  assert.equal(r.start, '2026-10-19');
  assert.equal(r.date, '2026-10-20');
  const fri = estimateDue({ stepKey: 'brief.prepare', ownerId: 'acc', today: '2026-10-23', config });
  assert.equal(fri.date, '2026-10-26', 'Friday plus 2 working days ends on Monday');
  const holiday = estimateDue({ stepKey: 'brief.prepare', ownerId: 'acc', today: '2026-10-19', config: { ...config, holidays: ['2026-10-20'] } });
  assert.equal(holiday.date, '2026-10-21', 'a configured holiday is not a working day');
});

test('the business date is read in the project time zone, not the machine one', () => {
  assert.equal(todayIn('Asia/Ho_Chi_Minh', new Date('2026-10-17T18:30:00Z')), '2026-10-18', '01:30 next day in Ho Chi Minh City');
  assert.equal(todayIn('Asia/Ho_Chi_Minh', new Date('2026-10-17T16:59:00Z')), '2026-10-17');
});

test('workload moves the date only when a capacity is set; the demo sets none and asks for none', () => {
  const busy = [{ ownerId: 'acc', due: '2026-10-19' }, { ownerId: 'acc', due: '2026-10-19' }, { ownerId: 'acc', due: '2026-10-20' }];
  const none = estimateDue({ stepKey: 'brief.prepare', ownerId: 'acc', today: '2026-10-19', commitments: busy, config });
  assert.equal(none.date, '2026-10-20');
  assert.equal(none.status, 'estimate');
  assert.deepEqual(none.missing, []);
  assert.doesNotMatch(none.lines.join(' '), /capacity|holiday/i, 'no scheduling input is asked for');
  const two = estimateDue({ stepKey: 'brief.prepare', ownerId: 'acc', today: '2026-10-19', commitments: busy, config: { ...config, capacityItemsPerDay: 2 } });
  assert.equal(two.start, '2026-10-20', 'two items already due on Monday fill a capacity of 2');
  assert.equal(two.date, '2026-10-21');
  assert.equal(two.status, 'estimate');
  const lighter = estimateDue({ stepKey: 'brief.prepare', ownerId: 'acc', today: '2026-10-19', commitments: busy.slice(1), config: { ...config, capacityItemsPerDay: 2 } });
  assert.equal(lighter.start, '2026-10-19', 'one fewer commitment: the work can start on Monday');
  assert.ok(!two.lines.join(' ').includes('quotation'), 'the explanation gives counts, never other tasks\' titles');
});

test('missing inputs, blocked dependencies and impossible deadlines are explicit', () => {
  const noOwner = estimateDue({ stepKey: 'brief.prepare', ownerId: null, today: '2026-10-19', config });
  assert.equal(noOwner.status, 'needs_info');
  assert.ok(noOwner.missing.includes('an owner'));
  const noEffort = estimateDue({ stepKey: 'unknown.step', ownerId: 'acc', today: '2026-10-19', config });
  assert.equal(noEffort.status, 'needs_info');
  assert.equal(noEffort.date, null);
  const blocked = estimateDue({ stepKey: 'job_code.approve', ownerId: 'fin', today: '2026-10-19', dependencyOpen: true, dependencyLabel: 'Signed contract', config });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.date, null);
  const late = estimateDue({ stepKey: 'cost_complete.prepare', ownerId: 'acc', today: '2026-10-19', promisedDelivery: '2026-10-19', config });
  assert.equal(late.status, 'infeasible', 'a completion after the deadline is never shown as achievable');
  assert.match(late.lines.join(' '), /not feasible/);
});

test('suggestions follow the workflow and the viewer\'s permissions', () => {
  const pending = [{ id: 'cr1', request_ref: 'CR-0101', target_type: 'new_service_line', requested_by: 'acc' }];
  const forAccount = suggestNextActions({ project, readiness, pending, people, viewer: viewer('acc', ['account']), config, today: '2026-10-19', completed: ['brief'] });
  const codes = forAccount.map((s) => `${s.code}.${s.kind}`);
  assert.deepEqual(codes, ['job_code.approve', 'approved_revenue.approve', 'cost_complete.prepare'], 'done and not-applicable checks are left out');
  const revenue = forAccount.find((s) => s.code === 'approved_revenue');
  assert.equal(revenue.state, 'pending');
  assert.equal(revenue.mayAct, false, 'Account cannot approve its own proposal');
  assert.equal(revenue.owner.id, 'fin2', 'the eligible Finance owner with the fewest items, never the submitter… (tie by name)');
  assert.equal(revenue.owner.suggested, true);
  assert.match(revenue.why, /Now that "brief" is done/);
  const cost = forAccount.find((s) => s.code === 'cost_complete');
  assert.equal(cost.mayAct, true);
  assert.equal(cost.owner.id, 'acc');
  assert.equal(cost.href, '#/p/NP-0100/money?focus=new_cost_line');
  const forFinance = suggestNextActions({ project, readiness, pending, people, viewer: viewer('fin', ['finance']), config, today: '2026-10-19' });
  assert.equal(forFinance.find((s) => s.code === 'approved_revenue').mayAct, true);
  assert.equal(forFinance.find((s) => s.code === 'approved_revenue').href, '#/finance?cr=cr1');
});

test('a contract not yet signed blocks the steps that depend on it', () => {
  const r = readiness.map((c) => (c.check_code === 'contract' ? { ...c, status: 'missing' } : c));
  const s = suggestNextActions({ project, readiness: r, people, viewer: viewer('bd', ['bd']), config, today: '2026-10-19' });
  const job = s.find((x) => x.code === 'job_code');
  assert.equal(job.due.status, 'blocked');
  assert.match(job.due.lines[0], /Waits for: contract/);
  assert.equal(s.at(-1).due.status, 'blocked', 'blocked steps come last');
});

test('work already in progress is not suggested again', () => {
  const r = readiness.map((c) => (c.check_code === 'brief' ? { ...c, status: 'missing' } : c));
  const p = { ...project, next_action: 'Get the brief from the client, add its link and mark it Ready' };
  const s = suggestNextActions({ project: p, readiness: r, people, viewer: viewer('acc', ['account']), config, today: '2026-10-19' });
  assert.ok(!s.some((x) => x.code === 'brief'), 'the next action already is this step');
});

test('repeated completion events, retries and refreshes create no duplicate suggestions', () => {
  const before = readiness.map((c) => (c.check_code === 'brief' ? { ...c, status: 'missing' } : c));
  assert.deepEqual(completedChecks(before, readiness), ['brief']);
  assert.deepEqual(completedChecks(readiness, readiness), [], 'the same event again completes nothing');
  const args = { project, readiness, people, viewer: viewer('acc', ['account']), config, today: '2026-10-19' };
  const first = suggestNextActions(args); const again = suggestNextActions(args);
  assert.deepEqual(again.map((s) => s.key), first.map((s) => s.key), 'the same state gives the same keys');
  assert.equal(new Set(first.map((s) => s.key)).size, first.length, 'no key twice');
  const seen = new Set(first.map((s) => s.key));
  assert.deepEqual(newSuggestions(seen, again), [], 'nothing new to announce after a repeat');
});

test('commitments carry only an owner and a date', () => {
  const c = commitmentsFrom({ workItems: [{ assignee_id: 'acc', due_at: '2026-10-20T10:00:00+07:00', status: 'todo', title: 'Secret title' }, { assignee_id: 'acc', due_at: '2026-10-21', status: 'done' }],
    projects: [{ next_action_owner_id: 'bd', next_action: 'x', next_action_due: '2026-10-22' }] });
  assert.deepEqual(c, [{ ownerId: 'acc', due: '2026-10-20' }, { ownerId: 'bd', due: '2026-10-22' }]);
});

test('ticket 17 guidance: the same check reads differently for each role and state', () => {
  const p = { project_ref: 'NP-0100', owner_id: 'bd', account_owner_id: 'acc' };
  const c = { check_code: 'acceptance', label: 'Acceptance evidence verified by Finance', status: 'missing', detail: 'Delivered, but no acceptance evidence yet.' };
  const asAccount = guide(c, p, viewer('acc', ['account']), { personName: (id) => ({ acc: 'Bao Nguyen' }[id]) });
  assert.equal(asAccount.mayAct, true);
  assert.equal(asAccount.actions[0].href, '#/p/NP-0100/money?focus=acceptance');
  const asDesign = guide(c, p, viewer('d', ['design']), { personName: (id) => ({ acc: 'Bao Nguyen' }[id]) });
  assert.equal(asDesign.mayAct, false);
  assert.deepEqual(asDesign.actions, [], 'no link to an action the role cannot take');
  assert.match(asDesign.yourPart, /Bao Nguyen \(Account owner\)/);
  const waiting = { ...c, status: 'blocked' };
  const ms = [{ id: 'm1', milestone_ref: 'AC-0001', status: 'submitted', submitted_by: 'fin' }];
  const own = guide(waiting, p, viewer('fin', ['finance']), { milestones: ms });
  assert.equal(own.mayAct, false, 'Finance cannot verify its own submission');
  const other = guide(waiting, p, viewer('fin2', ['finance']), { milestones: ms });
  assert.equal(other.actions[0].href, '#/finance?ac=m1');
  const done = guide({ ...c, status: 'ok', detail: '1 acceptance milestone(s) verified.' }, p, viewer('acc', ['account']));
  assert.equal(done.state, 'done');
  assert.deepEqual(done.actions, []);
});

test('a target date already passed is flagged late, never shown as an achievable date', () => {
  const r = estimateDue({ stepKey: 'brief.prepare', ownerId: 'acc', today: '2026-10-19', ruleTarget: '2026-10-04', ruleTargetLabel: 'the readiness target: 3 day(s) after the contract date, a POC default', config });
  assert.equal(r.status, 'infeasible');
  assert.equal(r.late, true);
  assert.equal(r.deadline, '2026-10-04');
  assert.match(r.lines.join(' '), /Sun 4 Oct 2026 \(the readiness target: 3 day\(s\) after the contract date, a POC default\) has already passed/);
  const ahead = estimateDue({ stepKey: 'cost_complete.prepare', ownerId: 'acc', today: '2026-10-19', promisedDelivery: '2026-10-19', config });
  assert.equal(ahead.late, false, 'a deadline still ahead but too close is infeasible, not late');
});

test('no owner gives no date; no scheduling settings give no date', () => {
  const r = estimateDue({ stepKey: 'brief.prepare', ownerId: null, today: '2026-10-19', config });
  assert.equal(r.date, null);
  assert.equal(r.status, 'needs_info');
  const s = suggestNextActions({ project, readiness, people, viewer: viewer('acc', ['account']), config: null, today: '2026-10-19' });
  assert.ok(s.length > 0);
  for (const x of s) {
    assert.equal(x.due.date, null);
    assert.match(x.due.lines[0], /Needs scheduling information/);
  }
});

test('the suggested owner is explained as a count of open items, never as capacity', () => {
  const p = { ...project, account_owner_id: null, next_action_owner_id: null, owner_id: 'bd' };
  const r = readiness.map((c) => (c.check_code === 'job_code' ? c : { ...c, status: 'ok' }));
  const [s] = suggestNextActions({ project: p, readiness: r, people, viewer: viewer('fin', ['finance']), config, today: '2026-10-19',
    commitments: [{ ownerId: 'fin', due: '2026-10-20' }] });
  assert.equal(s.code, 'job_code');
  assert.equal(s.owner.id, 'fin2', 'An Pham has fewer open items than Mai Le');
  assert.match(s.owner.note, /a count, not a measure of capacity/);
  assert.doesNotMatch(s.due.lines.join(' '), /capacity/, 'the estimate asks for no capacity');
});
