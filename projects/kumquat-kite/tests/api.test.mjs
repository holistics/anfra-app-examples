// End-to-end tests of the application API: the real server and database, through the client the screens use, as the
// demo personas. They run against the isolated local test database (kumquat_test), which the helpers reset to the
// starting demo data first; the demo database is never touched. The saved-data story runs on NP-0001.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, stopTestApp, signInAll, fresh, anonymous, sqlAs, rejects, newRequestId } from './helpers.mjs';
import { appPool } from '../scripts/lib/db.mjs';
import { runImport } from '../scripts/import_snapshot.mjs';
import { templateCsv, buildTemplateImport } from '../shared/template.mjs';

const STAMP = new Date().toISOString().slice(11, 19).replace(/:/g, '');
let app; let as; let anfra; let story;
const margin = async (ref) => (await anfra.rows('kumquat_finance', `explore { dimensions { ref: projects.project_ref }
  measures { approved: approved_gross_margin, scenario: scenario_gross_margin, cost: approved_complete_cost, scost: scenario_known_cost }
  filters { projects.project_ref == '${ref}' } }`))[0];

// The server runs with test embed credentials for the Holistics embed route (test 17); without them embedding is off.
const embedSecret = crypto.randomBytes(24).toString('hex');
test.before(async () => {
  app = await startTestApp({ env: { HOLISTICS_EMBED_KEY_ID: 'test-key-id', HOLISTICS_EMBED_SECRET: embedSecret, HOLISTICS_EMBED_HOST: 'secure.holistics.io' } });
  anfra = app.anfra; // the server's own core, queried directly (no result cache)
  as = await signInAll();
  story = await as.account.findProject('NP-0001');
  const lines = await as.account.moneyLines(story.id);
  const cost = lines.cost[0];
  assert.equal(Number(cost.current.amount), 60000000, 'starting demo state expected: NP-0001 cost 60,000,000');
  assert.equal((await as.account.changeRequests({ projectId: story.id, status: 'pending' })).length, 0, 'NP-0001 must have no pending proposal');
});
test.after(async () => { await stopTestApp(); });
// The figures as the screens read them: through the server's checked proxy and its result cache, with a session token.
const MARGIN_AQL = `explore { dimensions { ref: projects.project_ref } measures { approved: approved_gross_margin, scenario: scenario_gross_margin }
  filters { projects.project_ref == 'NP-0001' } }`;
async function proxied(api, aql = MARGIN_AQL) {
  const r = await fetch(`${app.url}/anfra/api/core.query`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${api.token}` },
    body: JSON.stringify({ dataset: 'kumquat_finance', query: aql }) });
  assert.equal(r.status, 200, `proxy answered ${r.status}`);
  const { result } = await r.json();
  return { cache: r.headers.get('x-kk-cache') ?? 'miss', rows: result.records.map((rec) => Object.fromEntries(result.fields.map((f, i) => [f, rec[i]]))) };
}

let created;
test('1 · BD saves an opportunity through the app API; Account reads the same record after a fresh sign-in', async () => {
  const requestId = newRequestId();
  const payload = { new_client: { display_name: `Test client ${STAMP} (sample)`, client_type: 'brand' }, title: `Test opportunity ${STAMP} (sample)`,
    service_group: 'ecommerce', note: 'Client asked about a 2-livestream package.', next_action: 'Send the quotation', next_action_owner_id: as.bd.userId,
    next_action_due: '2026-10-20', next_action_done_when: 'The client has the quotation', estimated_amount: 50000000, estimate_basis: 'total' };
  created = await as.bd.intake(payload, requestId);
  assert.equal(created.created, true);
  const again = await as.bd.intake(payload, requestId);
  assert.equal(again.created, false, 'the same submission twice creates one project');
  assert.equal(again.project_id, created.project_id);

  const account = await fresh('account');
  const p = await account.project(created.project_id);
  assert.equal(p.project_ref, created.project_ref);
  assert.equal(p.version, 1);
  assert.equal(p.title, payload.title);
  assert.equal(p.next_action, 'Send the quotation');
  assert.equal(p.next_action_due, '2026-10-20');
  assert.equal(Number(p.estimated_amount), 50000000);
  assert.equal(p.client.display_name, payload.new_client.display_name);
  const events = (await account.history(p.id)).map((e) => e.event_type);
  for (const t of ['created', 'note', 'next_action_set']) assert.ok(events.includes(t), `history has ${t}`);
  const byRef = await account.findProject(created.project_ref);
  assert.equal(byRef.id, p.id, 'searchable by its stable internal ID');
});

test('2 · A routine update needs the edited version; a stale edit is a recoverable conflict, not an overwrite', async () => {
  const v1 = await as.bd.project(created.project_id);
  const saved = await as.bd.updateProject(v1.id, v1.version, { commercial_stage: 'qualified', latest_note: 'Called; the client needs one more session.' });
  assert.equal(saved.version, v1.version + 1);
  const conflict = await rejects(as.account.updateProject(v1.id, v1.version, { next_action_due: '2026-10-22' }), 'conflict', 'Someone else saved');
  assert.match(conflict.detail, /current_version/);
  const unchanged = await (await fresh('account')).project(v1.id);
  assert.equal(unchanged.next_action_due, '2026-10-20', 'the stale edit did not overwrite anything');
  const recovered = await as.account.updateProject(v1.id, unchanged.version, { next_action_due: '2026-10-22' });
  assert.equal(recovered.version, unchanged.version + 1);
  const missing = await rejects(as.bd.updateProject(v1.id, null, { title: 'x' }), 'version_required');
  assert.equal(missing.status, 428, 'an edit without the edited version is refused');
  const direct = await sqlAs(as.bd.userId, 'update public.projects set title = $2 where id = $1', [v1.id, 'x']);
  assert.equal(direct.error?.message, 'expected_version_required', 'the database itself refuses it, whatever a client sends');
});

test('3 · Field ownership is enforced by the database, not by hidden buttons', async () => {
  const p = await as.bd.project(created.project_id);
  await rejects(as.bd.updateProject(p.id, p.version, { job_code: 'HACK-0001' }), 'forbidden');
  await rejects(as.design.updateProject(p.id, p.version, { title: 'Renamed' }), 'forbidden');
  const handed = await as.bd.updateProject(p.id, p.version, { next_action: 'Send the moodboard', next_action_owner_id: as.design.userId,
    next_action_due: '2026-10-23' });
  const own = await as.design.updateProject(p.id, handed.version, { next_action: 'Send the moodboard, version 2', next_action_due: '2026-10-24' });
  assert.equal(own.next_action, 'Send the moodboard, version 2', 'the next-action owner may update the next action');
  await rejects(as.design.updateProject(p.id, own.version, { commercial_stage: 'won' }), 'forbidden');
});

test('4 · Account links a brief and assigns Design work; the designer sees it in My work; completion follows review', async () => {
  const p = await as.account.project(created.project_id);
  const briefed = await as.account.updateProject(p.id, p.version, { brief_status: 'ready', brief_url: 'https://example.com/kumquat-demo/briefs/test' });
  assert.equal(briefed.brief_status, 'ready');
  const before = (await as.account.projects()).length;
  const requestId = newRequestId();
  const item = { project_id: p.id, team: 'design', title: `Test key visual ${STAMP}`, assignee_id: as.design.userId, due_at: '2026-10-21T17:00:00+07:00',
    brief_url: briefed.brief_url, completion_condition: 'Account approves the key visual, with the final file link' };
  const w = await as.account.createWork(item, requestId);
  const dup = await as.account.createWork(item, requestId);
  assert.equal(dup.id, w.id, 'a double submit creates one work item');
  assert.equal((await as.account.projects()).length, before, 'no duplicate project');
  const mine = (await (await fresh('design')).queue()).find((q) => q.work_item_id === w.id);
  assert.ok(mine, 'the designer sees it in My work');
  for (const f of ['reason', 'owner_id', 'due_date', 'next_action', 'completion_condition']) assert.ok(mine[f], `queue item has ${f}`);
  const started = await as.design.updateWork(w.id, w.version, { status: 'in_progress' });
  await rejects(as.design.updateWork(w.id, started.version, { status: 'done' }), 'forbidden', 'not allowed');
  await rejects(as.design.updateWork(w.id, started.version, { status: 'in_review' }), 'invalid', 'output link');
  const review = await as.design.updateWork(w.id, started.version, { status: 'in_review', output_url: 'https://example.com/kumquat-demo/outputs/test-v1' });
  assert.ok((await as.account.queue()).some((q) => q.kind === 'work_review' && q.work_item_id === w.id), 'Account has it in Needs review');
  const done = await as.account.updateWork(w.id, review.version, { status: 'done', review_note: 'Approved.' });
  assert.ok(done.completed_at, 'completion time recorded');
  const hist = (await as.account.history(p.id)).filter((e) => e.work_item_id === w.id).map((e) => e.summary);
  assert.ok(hist.some((s) => s.includes('in_review → done')), 'completion history kept');
});

let proposal;
test('5 · Saved-data story: Account proposes 70m; the scenario shows 30% while approved stays 40%', async () => {
  const lines = await as.account.moneyLines(story.id);
  const cost = lines.cost[0];
  const key = newRequestId();
  const args = { projectId: story.id, targetType: 'cost_line', lineId: cost.id, amount: 70000000, costStage: 'forecast',
    reason: 'The set supplier raised its material prices', evidenceUrl: 'https://example.com/kumquat-demo/evidence/np-0001-new-quote',
    baseRevisionId: cost.current.id, idempotencyKey: key };
  proposal = await as.account.submitChange(args);
  assert.equal(proposal.status, 'pending');
  assert.equal(proposal.duplicate, false);
  const again = await as.account.submitChange(args);
  assert.equal(again.duplicate, true, 'a repeated submission answers the first one');
  assert.equal(again.id, proposal.id);
  assert.equal((await as.account.changeRequests({ projectId: story.id })).length, 1, 'one proposal row, not two');
  const m = await margin('NP-0001');
  assert.equal(Number(m.approved), 0.4);
  assert.equal(Number(m.scenario), 0.3);
  assert.equal(Number(m.cost), 60000000, 'approved cost unchanged while the review is pending');
  const first = await proxied(as.finance);
  const second = await proxied(as.finance);
  assert.equal(Number(second.rows[0].approved), 0.4);
  assert.equal(second.cache, 'hit', 'an identical query on unchanged data is answered from the result cache');
  assert.deepEqual(second.rows, first.rows);
});

test('6 · BD and Account cannot approve; a stale review is refused', async () => {
  await rejects(as.bd.reviewChange(proposal.id, 'approve', null, proposal.version), 'forbidden');
  await rejects(as.account.reviewChange(proposal.id, 'approve', null, proposal.version), 'forbidden');
  await rejects(as.finance.reviewChange(proposal.id, 'approve', null, proposal.version + 1), 'conflict');
  assert.equal(Number((await margin('NP-0001')).approved), 0.4, 'still 40% approved');
});

test('7 · Finance approves: one transaction writes the new revision and the audit event; reload and Anfra show 30%', async () => {
  const result = await as.finance.reviewChange(proposal.id, 'approve', 'Checked against the new quotation', proposal.version);
  assert.equal(result.status, 'approved');
  assert.ok(result.revision?.revision_ref, 'new revision returned');
  await rejects(as.finance.reviewChange(proposal.id, 'approve', null, result.version), 'conflict');

  const reloaded = await fresh('finance');
  const cost = (await reloaded.moneyLines(story.id)).cost[0];
  assert.equal(Number(cost.current.amount), 70000000);
  assert.equal(cost.current.revision_no, 2);
  assert.equal(cost.current.change_request_id, proposal.id);
  assert.equal(cost.current.approved_by, as.finance.userId, 'the approver is kept on the revision');
  const old = cost.revisions.find((r) => r.revision_no === 1);
  assert.equal(old.status, 'superseded', 'the previous version is kept');
  assert.equal(Number(old.amount), 60000000);
  const ev = (await reloaded.history(story.id)).find((e) => e.event_type === 'review_approved' && e.change_request_id === proposal.id);
  assert.ok(ev, 'audit event written');
  assert.equal(ev.actor_id, as.finance.userId, 'the event names the Finance persona who approved');
  assert.equal(ev.revision_id, cost.current.id);
  assert.equal(Number(ev.details.previous.amount), 60000000);
  assert.equal(Number(ev.details.approved.amount), 70000000);
  assert.equal((await reloaded.project(story.id)).financial_verification, 'verified');

  const m = await margin('NP-0001');
  assert.equal(Number(m.approved), 0.3, 'Anfra re-queries the committed version');
  assert.equal(Number(m.cost), 70000000);
  const versions = await anfra.rows('kumquat_finance', `explore { dimensions { v: money_facts.version_no, label: money_facts.version_label }
    measures { lines: version_line_count, gm: version_gross_margin } filters { projects.project_ref == 'NP-0001' } sorts { v asc } }`);
  assert.deepEqual(versions.map((r) => Number(r.gm)), [0.4, 0.3], 'history still explains the earlier 40%');
  const after = await proxied(as.account);
  assert.equal(after.cache, 'miss', 'the committed change made the cached result stale');
  assert.equal(Number(after.rows[0].approved), 0.3, 'the screens\' figures are fresh right after the approval');
});

test('8 · A rejection needs a reason and leaves the approved value; a failed submission creates nothing', async () => {
  const cost = (await as.account.moneyLines(story.id)).cost[0];
  const count = async () => (await as.account.changeRequests({ projectId: story.id })).length;
  const n0 = await count();
  await rejects(as.account.submitChange({ projectId: story.id, targetType: 'cost_line', lineId: cost.id, amount: 75000000, reason: 'More materials',
    evidenceUrl: '', baseRevisionId: cost.current.id, idempotencyKey: newRequestId() }), 'invalid', 'evidence');
  await rejects(as.account.submitChange({ projectId: story.id, targetType: 'cost_line', lineId: cost.id, amount: 75000000, reason: 'More materials',
    evidenceUrl: 'https://example.com/x', baseRevisionId: cost.revisions.find((r) => r.revision_no === 1).id, idempotencyKey: newRequestId() }),
    'conflict', 'approved value changed');
  assert.equal(await count(), n0, 'failed submissions created no rows');
  const p = await as.account.submitChange({ projectId: story.id, targetType: 'cost_line', lineId: cost.id, amount: 75000000,
    reason: 'Spare materials as a buffer', evidenceUrl: 'https://example.com/kumquat-demo/evidence/np-0001-buffer', baseRevisionId: cost.current.id,
    idempotencyKey: newRequestId() });
  await rejects(as.finance.reviewChange(p.id, 'reject', '', p.version), 'invalid', 'reason');
  const rejected = await as.finance.reviewChange(p.id, 'reject', 'No supplier quotation yet', p.version);
  assert.equal(rejected.status, 'rejected');
  assert.equal(Number((await as.account.moneyLines(story.id)).cost[0].current.amount), 70000000, 'approved value unchanged');
});

test('9 · Unknown cost stays unknown; zero needs confirmation', async () => {
  const cost = (await as.account.moneyLines(story.id)).cost[0];
  await rejects(as.account.submitChange({ projectId: story.id, targetType: 'new_cost_line', description: 'Delivery fee', amount: 0,
    reason: 'An extra cost came up', evidenceUrl: 'https://example.com/x', idempotencyKey: newRequestId() }), 'invalid', 'zero amount');
  const unknown = await as.account.submitChange({ projectId: story.id, targetType: 'new_cost_line', description: 'Delivery fee (no quotation yet)',
    amountKnown: false, reason: 'An extra cost came up; waiting for a quotation', evidenceUrl: 'https://example.com/kumquat-demo/evidence/delivery', idempotencyKey: newRequestId() });
  assert.equal(unknown.proposed_amount_status, 'unknown');
  const m = await margin('NP-0001');
  assert.equal(m.scenario, null, 'scenario margin is unavailable while a proposed cost is unknown — never 0');
  assert.equal(Number(m.approved), 0.3, 'approved margin unaffected');
  await as.account.withdrawChange(unknown.id, unknown.version);
  assert.equal(Number((await margin('NP-0001')).scenario), 0.3);
  assert.ok(cost.current);
});

test('10 · Acceptance and cash stay separate from contract value; duplicates are not recorded twice', async () => {
  const key = newRequestId();
  const args = { projectId: story.id, description: 'Acceptance of the livestream setup', amount: 100000000, effectiveDate: '2026-10-15',
    evidenceUrl: 'https://example.com/kumquat-demo/docs/np-0001-acceptance', idempotencyKey: key };
  const ac = await as.account.submitAcceptance(args);
  assert.equal((await as.account.submitAcceptance(args)).id, ac.id);
  await rejects(as.account.reviewAcceptance(ac.id, 'verify', null, ac.version), 'forbidden');
  const verified = await as.finance.reviewAcceptance(ac.id, 'verify', 'Signed minutes on file', ac.version);
  assert.equal(verified.status, 'verified');
  const rkey = newRequestId();
  const receipt = { receipt_date: '2026-10-15', receipt_type: 'payment', amount: 40000000, tax_basis: 'net_of_vat', reference: 'BANK-TEST-01' };
  await rejects(as.finance.recordReceipt(receipt, [{ project_id: story.id, milestone_id: ac.id, amount: 30000000 }], newRequestId()), 'invalid', 'add up');
  const r1 = await as.finance.recordReceipt(receipt, [{ project_id: story.id, milestone_id: ac.id, amount: 40000000 }], rkey);
  const r2 = await as.finance.recordReceipt(receipt, [{ project_id: story.id, milestone_id: ac.id, amount: 40000000 }], rkey);
  assert.equal(r2.duplicate, true);
  assert.equal(r2.receipt.id, r1.receipt.id);
  const [row] = await anfra.rows('kumquat_finance', `explore { dimensions { ref: projects.project_ref } measures { acc: verified_acceptance,
    net: receipts_net, residual: management_residual, revenue: approved_revenue } filters { projects.project_ref == 'NP-0001' } }`);
  assert.equal(Number(row.acc), 100000000);
  assert.equal(Number(row.net), 40000000, 'the receipt counted once');
  assert.equal(Number(row.residual), 60000000);
  assert.equal(Number(row.revenue), 100000000, 'contract revenue is not increased by acceptance or cash');
});

test('11 · Nobody grants themselves Finance; role membership cannot be written directly; changes are audited', async () => {
  await rejects(as.account.grantRole(as.account.userId, 'finance'), 'forbidden');
  await rejects(as.admin.grantRole(as.admin.userId, 'finance'), 'forbidden');
  const direct = await sqlAs(as.account.userId, `insert into public.role_memberships (user_id, role) values ($1, 'finance')`, [as.account.userId]);
  assert.ok(direct.error, 'a direct insert is refused by the database');
  await as.admin.grantRole(as.studio.userId, 'design');
  assert.ok((await as.admin.people()).find((p) => p.user_id === as.studio.userId).roles.includes('design'));
  await as.admin.revokeRole(as.studio.userId, 'design');
  const audit = (await as.admin.roleAudit()).filter((a) => a.user_id === as.studio.userId); // newest first
  assert.deepEqual(audit.slice(0, 2).map((a) => a.action).reverse(), ['granted', 'revoked']);
  assert.equal(audit[0].actor_id, as.admin.userId, 'the audit names who changed the role');
  assert.equal((await as.account.roleAudit()).length, 0, 'only Admin reads the role audit');
});

test('12 · Signed-out callers read and change nothing', async () => {
  const anon = anonymous();
  await rejects(anon.projects(), 'forbidden');
  await rejects(anon.reviewChange(proposal.id, 'approve', null, 1), 'forbidden');
  await rejects(anon.intake({ title: 'x' }, newRequestId()), 'forbidden');
});

test('13 · Re-importing the same snapshot creates nothing and keeps app-owned fields', async () => {
  const before = await as.account.project(story.id);
  const result = await runImport(new URL('../data/snapshots/2026-10-14-synthetic', import.meta.url).pathname, { commit: true });
  const changed = Object.values(result.counts).reduce((s, c) => s + (c.new ?? 0) + (c.updated ?? 0), 0);
  assert.equal(changed, 0);
  const after = await as.account.project(story.id);
  assert.equal(after.version, before.version, 'the import did not touch the app-owned record');
  assert.equal(Number((await as.account.moneyLines(story.id)).cost[0].current.amount), 70000000, 'the approved 70m was not overwritten by the 60m source value');
});

test('14 · Admin resets the demo to its starting state; nobody else can; people are kept', async () => {
  await rejects(as.account.resetDemo(), 'forbidden');
  await rejects(as.finance.resetDemo(), 'forbidden');
  await rejects(anonymous().resetDemo(), 'forbidden');
  const demoIds = new Set(Object.values(as).map((a) => a.userId));
  const others = async () => (await as.admin.people()).filter((p) => !demoIds.has(p.user_id)).map((p) => `${p.user_id}:${p.roles.join(',')}`).sort();
  const othersBefore = await others();
  await as.admin.grantRole(as.studio.userId, 'design'); // a demo persona's roles changed during the demo

  const r = await as.admin.resetDemo();
  assert.ok(r.rows_restored > 400, `restored ${r.rows_restored} rows`);
  assert.equal(Number((await as.account.moneyLines(story.id)).cost[0].current.amount), 60000000, 'NP-0001 is back to 60m');
  assert.equal((await as.account.changeRequests({ projectId: story.id, status: 'pending' })).length, 0);
  assert.equal(await as.account.findProject(created.project_ref), null, 'the opportunity made in test 1 is gone');
  assert.equal(Number((await margin('NP-0001')).approved), 0.4, 'Anfra reads the restored 40%');
  assert.deepEqual((await as.admin.people()).find((p) => p.user_id === as.studio.userId).roles, ['studio'], 'demo personas get their seed roles back');
  assert.deepEqual(await others(), othersBefore, 'everyone else keeps their profile and roles');
  const [logged] = await as.admin.demoResets();
  assert.equal(logged.rows_restored, r.rows_restored);
  assert.equal(logged.reset_by, as.admin.userId);
  const next = await as.bd.intake({ new_client: { display_name: `After reset ${STAMP} (sample)`, client_type: 'brand' }, title: `After reset ${STAMP} (sample)`,
    service_group: 'ecommerce', next_action: 'Call the client', next_action_owner_id: as.bd.userId, next_action_due: '2026-10-21',
    next_action_done_when: 'The client was called', estimated_amount: 10000000, estimate_basis: 'total' }, newRequestId());
  assert.equal(next.project_ref, 'NP-0017', 'numbering restarts where the demo started');
});

test('15 · The single import template: rows that need fixing are reported; good rows become clients, projects and notes once', async () => {
  const people = await as.admin.people();
  const bad = await buildTemplateImport(`${templateCsv()}DEAL-001,CL-X,X (sample),brand,Duplicate ID (sample),event,lead,bd.demo@example.com,,,,,,,,,,,,,synthetic\r\n`, people, { source: `API test ${STAMP}` });
  assert.equal(bad.issues.length, 1, 'the duplicated record_id is reported');
  assert.match(bad.issues[0].message, /also used on row 2/);
  const t = await buildTemplateImport(templateCsv(), people, { source: `API test ${STAMP}` });
  assert.equal(t.issues.length, 0);
  const preview = await as.admin.importSnapshot(t.meta, t.rows, false);
  assert.equal(preview.counts.project.new, 3, 'preview: three new projects');
  assert.equal((await as.account.projects()).filter((p) => p.source_system === t.sourceSystem).length, 0, 'a preview writes no business record');
  const commit = await as.admin.importSnapshot(t.meta, t.rows, true);
  assert.equal(commit.counts.project.new, 3);
  assert.equal(commit.counts.client.new, 2, 'two rows of CL-ACME are one client');
  const projects = (await as.account.projects()).filter((p) => p.source_system === t.sourceSystem);
  assert.equal(projects.length, 3);
  const holiday = projects.find((p) => p.source_key === 'DEAL-001');
  assert.equal(holiday.estimate_basis, 'total');
  assert.equal(Number(holiday.estimated_amount), 50000000, 'the estimate arrives, as an estimate (not revenue)');
  assert.equal(holiday.next_action_done_when, 'The client has the quotation');
  assert.equal(holiday.data_classification, 'synthetic', 'this demo database holds synthetic data only');
  const won = projects.find((p) => p.source_key === 'DEAL-003');
  assert.equal(Number((await as.account.moneyLines(won.id)).revenue[0].current.amount), 80000000, 'a won row brings its contract value as the imported revenue baseline');
  assert.ok((await as.account.history(holiday.id)).some((e) => e.event_type === 'note' && e.summary === 'Client asked for two options'));
  const again = await as.admin.importSnapshot(t.meta, t.rows, true);
  const changed = Object.values(again.counts).reduce((n, c) => n + (c.new ?? 0) + (c.updated ?? 0), 0);
  assert.equal(changed, 0, 'importing the same sheet again creates and changes nothing');
});

test('16 · Holistics report links: saved once, read by the Reports roles, changed only by their author or an Admin, and only for a Holistics address', async () => {
  const project = await as.finance.findProject('NP-0008');
  const fields = { url: 'https://bi.holistics.io/dashboards/v4/0001-api-test-sample', title: `API test report ${STAMP} (sample)`, purpose: 'Test link (sample)',
    link_kind: 'dashboard', context_type: 'project', client_id: null, project_id: project.id };
  const requestId = newRequestId();
  const link = await as.finance.createReportLink(fields, requestId);
  assert.match(link.report_ref, /^RP-\d{4}$/);
  const again = await as.finance.createReportLink(fields, requestId);
  assert.equal(again.id, link.id, 'the same submission twice saves one link');

  const account = await fresh('account');
  const seen = (await account.reportLinks({ projectId: project.id })).find((l) => l.id === link.id);
  assert.ok(seen, 'Account reads the link after a fresh sign-in');
  assert.equal(seen.project.project_ref, 'NP-0008', 'the link keeps the CRM record it is about');
  assert.ok((await as.account.history(project.id)).some((e) => e.event_type === 'report_linked' && e.summary.includes(link.report_ref)), "the project's History records it");

  await rejects(as.account.updateReportLink(link.id, link.version, { title: 'Changed by someone else' }), 'forbidden', 'Only the person who connected');
  assert.equal((await as.design.reportLinks()).length, 0, 'Design reads no report links');
  await rejects(as.design.createReportLink({ ...fields, title: 'Design tries (sample)' }, newRequestId()), 'forbidden');
  await rejects(as.finance.createReportLink({ ...fields, url: 'https://reports.example.com/x', title: 'Another host (sample)' }, newRequestId()), 'invalid', 'holistics.io');
  await rejects(as.finance.createReportLink({ ...fields, url: 'http://bi.holistics.io/dashboards/1', title: 'Plain http (sample)' }, newRequestId()), 'invalid');
  await rejects(as.finance.createReportLink({ ...fields, url: 'https://secure.holistics.io/embed/k/objects/x?_token=abc', title: 'A token (sample)' }, newRequestId()), 'invalid');

  await rejects(as.finance.updateReportLink(link.id, link.version, { embed_object: 'pipeline_overview' }), 'forbidden', 'Admin');
  const named = await as.admin.updateReportLink(link.id, link.version, { embed_object: 'pipeline_overview' });
  assert.equal(named.embed_object, 'pipeline_overview', 'an Admin names the embedded dashboard');
  assert.equal(named.version, link.version + 1);
  await rejects(as.finance.updateReportLink(link.id, link.version, { title: 'A stale edit' }), 'conflict');
  const edited = await as.finance.updateReportLink(link.id, named.version, { title: `API test report ${STAMP} (renamed, sample)` });
  await as.finance.archiveReportLink(link.id, edited.version);
  assert.equal((await as.finance.reportLinks({ projectId: project.id })).some((l) => l.id === link.id), false, 'a removed link is no longer listed');
  assert.ok((await as.account.history(project.id)).some((e) => e.event_type === 'report_unlinked' && e.summary.includes(link.report_ref)));
  await rejects(as.finance.updateReportLink(link.id, edited.version + 1, { title: 'After removal' }), 'conflict');
});

test('17 · Holistics embedded viewing: the server signs a 10-minute HS256 token for a link the user may read; the secret stays on the server', async () => {
    const link = await as.admin.createReportLink({ url: 'https://secure.holistics.io/dashboards/v4/0002-embed-test-sample', title: `Embed test ${STAMP} (sample)`, purpose: null,
    link_kind: 'dashboard', context_type: 'portfolio', client_id: null, project_id: null, embed_object: 'pipeline_overview' }, newRequestId());
  const plain = await as.admin.createReportLink({ url: 'https://secure.holistics.io/dashboards/v4/0003-no-embed-sample', title: `No embed ${STAMP} (sample)`, purpose: null,
    link_kind: 'dashboard', context_type: 'portfolio', client_id: null, project_id: null }, newRequestId());
  const post = (token, body) => fetch(`${app.url}/api/holistics/embed`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post(null, { id: link.id })).status, 401, 'signed out: refused');
  assert.equal((await post(as.design.token, { id: link.id })).status, 403, 'Design: refused');
  assert.equal((await post(as.finance.token, { id: plain.id })).status, 409, 'no embedded dashboard named: refused');
  assert.equal((await post(as.finance.token, { id: crypto.randomUUID() })).status, 404);
  const before = Math.floor(Date.now() / 1000);
  const r = await post(as.finance.token, { id: link.id });
  assert.equal(r.status, 200);
  const { url } = await r.json();
  const u = new URL(url);
  assert.equal(u.host, 'secure.holistics.io');
  assert.equal(u.pathname, '/embed/test-key-id/objects/pipeline_overview', 'the documented URL: /embed/{key id}/objects/{dashboard}');
  const [h, p, sig] = u.searchParams.get('_token').split('.');
  assert.equal(JSON.parse(Buffer.from(h, 'base64url').toString()).alg, 'HS256');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.deepEqual(payload.objects, { dashboards: ['pipeline_overview'] });
  assert.ok(payload.exp >= before + 590 && payload.exp <= before + 610, 'the token expires in 10 minutes');
  assert.equal(sig, crypto.createHmac('sha256', embedSecret).update(`${h}.${p}`).digest('base64url'), 'signed with the server-side secret');
  assert.ok(!url.includes(embedSecret), 'the secret itself never leaves the server');
  for (const l of [link, plain]) await as.admin.archiveReportLink(l.id, l.version);
});

test('18 · The Welcome case study is served to signed-in staff only, from the anonymized copies', async () => {
    const get = async (file, token) => fetch(`${app.url}/api/case-study/${file}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  assert.equal((await get('index.json')).status, 401, 'signed out: refused');
  const design = as.design.token;
  const index = await (await get('index.json', design)).json();
  assert.equal(index.title, 'Fictional example: TP Production Studio');
  for (const d of index.documents) {
    const r = await get(`${d.id}.md`, design);
    assert.equal(r.status, 200, `${d.id} is served`);
    assert.match(r.headers.get('content-type'), /text\/markdown/);
  }
  assert.equal((await get('..%2F..%2F.env.local', design)).status, 404, 'nothing outside the case-study folder');
  assert.equal((await get('missing.md', design)).status, 404);
});

test('19 · Walkthrough preferences: each person reads and saves only their own row, within its size limit', async () => {
  await as.studio.saveWalkthrough({ choice: 'later', savedAt: new Date().toISOString() });
  assert.equal((await as.studio.preferences()).walkthrough.choice, 'later');
  const studioId = (await as.studio.me()).id;
  const seen = await sqlAs(as.finance.userId, 'select user_id from public.user_preferences');
  assert.ok(!seen.error && !seen.rows.some((r) => r.user_id === studioId), 'Finance cannot see Studio\'s row');
  const changed = await sqlAs(as.finance.userId, `update public.user_preferences set walkthrough = '{"choice":"exited"}' where user_id = $1`, [studioId]);
  assert.equal(changed.rowCount ?? 0, 0, 'an update of someone else\'s row changes nothing');
  const forged = await sqlAs(as.finance.userId, `insert into public.user_preferences (user_id, walkthrough) values ($1, '{}')`, [studioId]);
  assert.ok(forged.error, 'nobody writes a row for someone else');
  assert.equal((await as.studio.preferences()).walkthrough.choice, 'later', 'Studio\'s choice is unchanged');
  const signedOut = await anonymous().preferences().then((p) => p.walkthrough, (e) => e);
  assert.ok(signedOut instanceof Error || Object.keys(signedOut).length === 0, 'signed out: nothing to read');
  await assert.rejects(as.studio.saveWalkthrough({ note: 'x'.repeat(5000) }), 'a walkthrough record is kept small');
  await as.studio.saveWalkthrough({});
});

test('20 · Demo sessions: the server names the persona; a changed or unknown token is refused; identity ends with each transaction', async () => {
  const post = (body) => fetch(`${app.url}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ persona: 'root' })).status, 400, 'only the six demo personas exist');
  assert.equal((await post({})).status, 400);
  await rejects(anonymous('not-a-token').projects(), 'forbidden');
  // A token whose persona was changed to Admin, keeping Design's signature, is not accepted.
  const [body, sig] = as.design.token.split('.');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  const forged = Buffer.from(JSON.stringify({ ...claims, persona: 'admin', sub: as.admin.userId })).toString('base64url');
  await rejects(anonymous(`${forged}.${sig}`).roleAudit(), 'forbidden');
  const expired = Buffer.from(JSON.stringify({ ...claims, exp: 1 })).toString('base64url');
  await rejects(anonymous(`${expired}.${sig}`).me(), 'forbidden');

  // Many requests at once, from every persona, over the server's shared connections: each is answered as its own persona.
  const keys = Object.keys(as);
  const answers = await Promise.all(Array.from({ length: 36 }, (_, i) => as[keys[i % keys.length]].me()));
  answers.forEach((me, i) => assert.equal(me.id, as[keys[i % keys.length]].userId, `request ${i} answered as its own persona`));

  // The identity is transaction-local: a pooled connection keeps nothing of the persona after its transaction.
  const pool = appPool({ max: 1 });
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query(`select set_config('app.user_id', $1, true)`, [as.finance.userId]);
    assert.equal((await db.query('select app.uid() as uid')).rows[0].uid, as.finance.userId);
    await db.query('commit');
    assert.equal((await db.query('select app.uid() as uid')).rows[0].uid, null, 'no persona after the transaction');
    assert.equal((await db.query('select count(*)::int as n from public.projects')).rows[0].n, 0, 'without a persona, row-level security shows nothing');
  } finally { db.release(); await pool.end(); }
});
