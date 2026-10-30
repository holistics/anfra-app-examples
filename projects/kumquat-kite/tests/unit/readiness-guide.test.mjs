// never offers an action the database would refuse. Pure functions; run with `npm run test:unit`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { guide, CAN, GUIDE } from '../../shared/readiness-guide.mjs';

const project = { project_ref: 'NP-0100', owner_id: 'bd', account_owner_id: 'acc', next_action_owner_id: 'bd' };
const names = { bd: 'Duong Trinh', acc: 'Bao Nguyen' };
const personName = (id) => names[id];
const v = (id, ...roles) => ({ id, roles });
const check = (code, status, detail = '') => ({ check_code: code, label: code, status, detail });

test('every readiness check of the database view has guidance with both kinds of step where it has two', () => {
  for (const code of ['next_action', 'contract', 'brief', 'account_owner', 'job_code', 'approved_revenue', 'cost_complete', 'finance_review', 'work_on_time', 'acceptance']) {
    assert.ok(GUIDE[code], code);
    assert.ok(GUIDE[code].meaning && GUIDE[code].completes, code);
  }
  for (const code of ['approved_revenue', 'cost_complete', 'acceptance']) assert.deepEqual(GUIDE[code].steps.map((s) => s.kind), ['prepare', 'approve'], code);
});

test('a missing revenue line: Account prepares it now, Finance approves it next', () => {
  const g = guide(check('approved_revenue', 'missing', 'No approved revenue line yet.'), project, v('acc', 'account'), { personName });
  assert.equal(g.state, 'prepare');
  assert.deepEqual(g.steps.map((s) => [s.kind, s.state]), [['prepare', 'current'], ['approve', 'next']]);
  assert.equal(g.steps[0].who, 'Bao Nguyen (Account owner)');
  assert.equal(g.actions[0].href, '#/p/NP-0100/money?focus=new_service_line');
  assert.equal(g.step.role, 'Account');
});

test('an amount still unknown points at the line without one, not at a new line', () => {
  const g = guide(check('cost_complete', 'unknown', '1 cost line(s) without an amount (not counted as 0).'), project, v('acc', 'account'), { personName });
  assert.match(g.step.action, /cost line shown as unknown/);
  assert.equal(g.actions[0].href, '#/p/NP-0100/money?focus=money_lines');
});

test('a submitter who is not in Finance is told it waits for Finance; a Finance submitter cannot approve their own', () => {
  const pending = [{ id: 'c9', request_ref: 'CR-0009', target_type: 'new_service_line', requested_by: 'acc' }];
  const own = guide(check('approved_revenue', 'missing'), project, v('acc', 'account'), { pending, personName });
  assert.equal(own.state, 'pending');
  assert.match(own.yourPart, /^You submitted CR-0009\. It now waits for Finance/);
  assert.match(own.yourPart, /withdraw it on the Money tab/);
  assert.equal(own.mayAct, false);
  const ms = [{ id: 'm1', milestone_ref: 'AC-0001', status: 'submitted', submitted_by: 'fin' }];
  const finOwn = guide(check('acceptance', 'blocked'), project, v('fin', 'finance'), { milestones: ms });
  assert.match(finOwn.yourPart, /another person in Finance approves it/);
  assert.deepEqual(finOwn.actions, []);
});

test('overdue work: its assignee and BD/Account may act; another designer is told whom to ask', () => {
  const work = [{ assignee_id: 'des1', status: 'in_progress', due_at: '2026-01-01T10:00:00+07:00' }, { assignee_id: 'des2', status: 'done', due_at: '2026-01-01T10:00:00+07:00' }];
  const c = check('work_on_time', 'blocked', '1 work item(s) overdue.');
  assert.equal(guide(c, project, v('des1', 'design'), { work }).mayAct, true);
  assert.equal(guide(c, project, v('des2', 'design'), { work }).mayAct, false, 'finished work does not make its assignee responsible');
  assert.equal(guide(c, project, v('acc', 'account'), { work }).mayAct, true);
});

test('the job code: only Finance, and the help says the app does not check the prerequisites', () => {
  const c = check('job_code', 'missing', 'Waiting for Finance to issue a job code.');
  const fin = guide(c, project, v('fin', 'finance'));
  assert.equal(fin.mayAct, true);
  assert.match(fin.step.action, /does not check these for you/);
  assert.equal(fin.actions[0].href, '#/p/NP-0100/overview?focus=job_code');
  assert.equal(guide(c, project, v('adm', 'admin')).mayAct, false, 'Admin cannot issue a job code (issue_job_code)');
});

test('the permission table matches the database functions', () => {
  assert.equal(CAN.propose(v('a', 'admin')), false, 'submit_change_request: Account only');
  assert.equal(CAN.acceptance(v('b', 'bd')), false, 'submit_acceptance: Account only');
  assert.equal(CAN.review(v('f', 'finance'), {}, { requested_by: 'f' }), false, 'review_change_request: never one\'s own');
  assert.equal(CAN.verify(v('f', 'finance'), {}, { submitted_by: 'g' }), true);
  assert.equal(CAN.routine(v('d', 'design')), false, 'projects_before_update: BD, Account or Admin');
  assert.equal(CAN.next_action(v('d', 'design'), { next_action_owner_id: 'd' }), true, 'the next-action owner may update it');
});
