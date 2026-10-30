#!/usr/bin/env node
// Loads the synthetic demo data into the app's PostgreSQL database (KK_DB_NAME; npm run setup has migrated it), in this
// order:
//   1. the six demo personas (fixed IDs, shared/personas.mjs), their profiles and roles;
//   2. the service catalogue;
//   3. the synthetic source snapshot, through the real import function as the Admin user (preview, then commit),
//      so the story project gets the first reference (NP-0001);
//   4. the scenario projects of scripts/seed/fixtures.mjs, replayed through the real triggers inside one
//      transaction, so every row and history event carries its own past time and actor;
//   5. the same snapshot again, which must report no new or updated rows;
//   6. the starting state, captured for the in-app "Reset demo data" (public.capture_demo_baseline).
// Refuses to run on a database that already has business data unless --reset --yes is given (npm run demo:reset): a
// reset truncates every business table (only synthetic demo data lives there) and reloads it. --if-empty seeds only a
// database with no projects and otherwise does nothing (npm run setup). People are not business data: anyone who is
// not a demo persona keeps their profile, roles and role audit; the demo personas get their seed roles back.
//   node scripts/seed_demo.mjs [--reset --yes | --if-empty]
import path from 'node:path';
import crypto from 'node:crypto';
import { ownerClient, appPool, dbSettings, describeDb } from './lib/db.mjs';
import { ROOT } from './lib/env.mjs';
import { PERSONAS, PERSONA_IDS } from '../shared/personas.mjs';
import { fmtVnd } from '../shared/format.mjs';
import { SERVICES, CLIENTS, PROJECTS } from './seed/fixtures.mjs';
import { runImport, summarize } from './import_snapshot.mjs';

const SNAPSHOT = path.join(ROOT, 'data', 'snapshots', '2026-10-14-synthetic');
const PEOPLE_COLUMNS = new Set(['owner_id', 'account_owner_id', 'next_action_owner_id', 'assignee_id']);

const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('Usage: node scripts/seed_demo.mjs [--reset --yes | --if-empty]'); process.exit(0); }

// SQL helpers -----------------------------------------------------------------------------------------------
function sqlHelpers(db, ids) {
  const person = (k) => { if (!ids[k]) throw new Error(`unknown persona ${k}`); return ids[k]; };
  return {
    person,
    // The persona acting, and the past time the event is replayed at, for this transaction only.
    async as(key, at) {
      await db.query(`select set_config('app.user_id', $1, true), set_config('kumquat.event_time', $2, true)`, [person(key), at ?? '']);
    },
    async one(sql, params) { const r = await db.query(sql, params); return r.rows[0]; },
    async update(table, id, set) {
      const cols = Object.keys(set);
      const values = cols.map((c) => (PEOPLE_COLUMNS.has(c) && set[c] ? person(set[c]) : set[c]));
      const assignments = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      return (await db.query(`update public.${table} set ${assignments} where id = $${cols.length + 1} returning *`, [...values, id])).rows[0];
    },
    async event(projectId, type, at, actorKey, summary, details, links = {}) {
      await db.query(`insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source,
                        change_request_id, revision_id)
                      values ($1, $2, $3, $4, $5, $6, 'seed', $7, $8)`,
        [projectId, type, actorKey ? person(actorKey) : null, at, summary, details ?? {}, links.changeRequestId ?? null, links.revisionId ?? null]);
    },
  };
}

const dateOf = (ts) => ts.slice(0, 10);
const vnd = (n) => (n === null ? 'unknown' : fmtVnd(n));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = (d) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`; // as PostgreSQL's to_char 'FMDD Mon YYYY'

async function seedPeopleAndServices(db, ids) {
  await db.query('begin');
  await db.query(`select set_config('kumquat.trusted_write', 'on', true), set_config('kumquat.write_source', 'seed', true)`);
  for (const [key, p] of Object.entries(PERSONAS)) {
    await db.query(`insert into public.profiles (user_id, display_name, email, title) values ($1, $2, $3, $4)
                    on conflict (user_id) do update set display_name = excluded.display_name, email = excluded.email, title = excluded.title`,
      [ids[key], p.name, p.email, p.title]);
  }
  // The demo personas get exactly their seed roles back; nobody else's roles are touched.
  await db.query('delete from public.role_memberships where user_id = any($1::uuid[])', [Object.values(ids)]);
  for (const [key, p] of Object.entries(PERSONAS)) {
    for (const role of p.roles) {
      await db.query(`insert into public.role_memberships (user_id, role, granted_by) values ($1, $2, $3) on conflict do nothing`,
        [ids[key], role, ids.admin]);
    }
  }
  for (const [code, name, group] of SERVICES) {
    await db.query(`insert into public.services (code, name, service_group) values ($1, $2, $3)
                    on conflict (code) do update set name = excluded.name, service_group = excluded.service_group`,
      [code, name, group]);
  }
  await db.query('commit');
}

// 4. Scenario projects --------------------------------------------------------------------------------------
async function seedFixtures(db, ids) {
  const h = sqlHelpers(db, ids);
  await db.query('begin');
  await db.query(`select set_config('kumquat.trusted_write', 'on', true), set_config('kumquat.write_source', 'seed', true)`);
  const clientIds = {};
  for (const c of CLIENTS) {
    await h.as(c.owner, c.at);
    clientIds[c.key] = (await h.one(`insert into public.clients (display_name, client_type, owner_id, created_by, created_at)
                                     values ($1, $2, $3, $3, $4) returning id`, [c.name, c.type, h.person(c.owner), c.at])).id;
  }
  const refs = {};
  for (const p of PROJECTS) {
    const c = p.created;
    await h.as(c.by, c.at);
    const row = await h.one(`insert into public.projects (client_id, title, service_group, project_kind, owner_id, created_by, updated_by,
                               created_at, updated_at)
                             values ($1, $2, $3, $4, $5, $5, $5, $6, $6) returning id, project_ref`,
      [clientIds[p.client], p.title, p.group, p.kind ?? 'commercial', h.person(c.by), c.at]);
    const pid = row.id;
    refs[p.key] = row.project_ref;
    await h.update('projects', pid, { ...c.set, ...(c.note ? { latest_note: c.note } : {}) });

    for (const s of p.steps) {
      await h.as(s.by, s.at);
      if (s.set || s.note) await h.update('projects', pid, { ...(s.set ?? {}), ...(s.note ? { latest_note: s.note } : {}) });
      if (s.job) {
        const r = await h.update('projects', pid, { job_code: s.job });
        await h.event(pid, 'job_code_issued', s.at, s.by, `Finance issued job code ${s.job}`, { job_code: s.job, version: r.version });
      }
      if (s.payment) {
        const before = await h.one('select payment_state from public.projects where id = $1', [pid]);
        const r = await h.update('projects', pid, { payment_state: s.payment });
        await h.event(pid, 'payment_state_changed', s.at, s.by, `Payment state: ${before.payment_state} → ${s.payment}`,
          { from: before.payment_state, to: s.payment, version: r.version });
      }
    }

    // Money lines and their revisions. The baseline revisions are Finance-approved seed values.
    const lineIds = {}; const lineRevs = {};
    const addRevisions = async (kind, lineId, revisions) => {
      const out = [];
      for (const [i, r] of revisions.entries()) {
        const last = i === revisions.length - 1;
        const rev = await h.one(`insert into public.money_revisions (line_type, service_line_id, cost_line_id, revision_no, amount, amount_status,
                                   zero_confirmed, status, effective_date, approved_by, approved_at, source)
                                 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'seed') returning id, revision_ref`,
          [kind, kind === 'revenue' ? lineId : null, kind === 'cost' ? lineId : null, i + 1, r.amount, r.amount === null ? 'unknown' : 'known',
           Boolean(r.zero), last ? 'approved' : 'superseded', dateOf(r.at), h.person('finance'), r.at]);
        out.push({ ...rev, ...r });
      }
      return out;
    };
    for (const l of p.lines ?? []) {
      await h.as('account', l.revisions[0].at);
      lineIds[l.key] = (await h.one(`insert into public.service_lines (project_id, service_code, description, created_by, created_at)
                                     values ($1, $2, $3, $4, $5) returning id`, [pid, l.service, l.desc, h.person('account'), l.revisions[0].at])).id;
      lineRevs[l.key] = await addRevisions('revenue', lineIds[l.key], l.revisions);
    }
    for (const c2 of p.costs ?? []) {
      lineIds[c2.key] = (await h.one(`insert into public.cost_lines (project_id, service_line_id, description, cost_stage, created_by, created_at)
                                      values ($1, $2, $3, $4, $5, $6) returning id`,
        [pid, lineIds[c2.line] ?? null, c2.desc, c2.stage, h.person('account'), c2.revisions[0].at])).id;
      lineRevs[c2.key] = await addRevisions('cost', lineIds[c2.key], c2.revisions);
    }
    const firstMoney = [...(p.lines ?? []), ...(p.costs ?? [])].flatMap((x) => x.revisions.map((r) => r.at)).sort()[0];
    if (firstMoney) { await h.as('finance', firstMoney); await h.update('projects', pid, { financial_verification: 'verified' }); }

    // Financial proposals: approved (it produced the next revision), rejected (with a reason) or pending.
    for (const ch of p.changes ?? []) {
      const key = ch.cost ?? ch.line;
      const isCost = Boolean(ch.cost);
      const base = lineRevs[key][ch.base - 1];
      const reviewed = ch.status !== 'pending';
      const cr = await h.one(`insert into public.change_requests (project_id, target_type, cost_line_id, service_line_id, base_revision_id,
                                previous_amount, previous_amount_status, proposed_amount, proposed_amount_status, reason, evidence_url, status,
                                requested_by, requested_at, reviewed_by, reviewed_at, review_comment, idempotency_key, version)
                              values ($1, $2, $3, $4, $5, $6, $7, $8, 'known', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                              returning id, request_ref`,
        [pid, isCost ? 'cost_line' : 'service_line', isCost ? lineIds[key] : null, isCost ? null : lineIds[key], base.id, base.amount,
         base.amount === null ? 'unknown' : 'known', ch.amount, ch.reason, ch.evidence, ch.status, h.person(ch.by), ch.at,
         reviewed ? h.person(ch.reviewer) : null, reviewed ? ch.reviewed_at : null, ch.comment ?? null, crypto.randomUUID(), reviewed ? 2 : 1]);
      const lineRef = (await h.one(`select line_ref from public.${isCost ? 'cost_lines' : 'service_lines'} where id = $1`, [lineIds[key]])).line_ref;
      await h.event(pid, 'proposal_submitted', ch.at, ch.by,
        `Proposal ${cr.request_ref}: ${lineRef} ${vnd(base.amount)} → ${vnd(ch.amount)} VND`,
        { target_type: isCost ? 'cost_line' : 'service_line', line_id: lineIds[key], previous_amount: base.amount, proposed_amount: ch.amount,
          base_revision_id: base.id, reason: ch.reason, evidence_url: ch.evidence }, { changeRequestId: cr.id, revisionId: base.id });
      if (ch.status === 'approved') {
        const result = lineRevs[key][ch.result - 1];
        await db.query('update public.change_requests set resulting_revision_id = $1 where id = $2', [result.id, cr.id]);
        await db.query('update public.money_revisions set change_request_id = $1, evidence_url = $2 where id = $3', [cr.id, ch.evidence, result.id]);
        await h.event(pid, 'review_approved', ch.reviewed_at, ch.reviewer,
          `Finance approved ${cr.request_ref}: ${lineRef} ${vnd(base.amount)} → ${vnd(ch.amount)} VND (revision ${result.revision_ref})`,
          { line_id: lineIds[key], line_ref: lineRef, previous: { revision_id: base.id, revision_ref: base.revision_ref, amount: base.amount },
            approved: { revision_id: result.id, revision_ref: result.revision_ref, revision_no: ch.result, amount: ch.amount }, comment: ch.comment },
          { changeRequestId: cr.id, revisionId: result.id });
      } else if (ch.status === 'rejected') {
        await h.event(pid, 'review_rejected', ch.reviewed_at, ch.reviewer, `Finance rejected ${cr.request_ref}: ${ch.comment}`,
          { proposed_amount: ch.amount, base_revision_id: base.id, comment: ch.comment }, { changeRequestId: cr.id, revisionId: base.id });
      } else {
        await h.as(ch.by, ch.at);
        await h.update('projects', pid, { financial_verification: 'pending_review' });
      }
    }

    // Work items: created as "todo", then every status change replayed, so completion history is real.
    for (const w of p.work ?? []) {
      await h.as(w.created.by, w.created.at);
      const wi = await h.one(`insert into public.work_items (project_id, team, title, assignee_id, requested_by, due_at, brief_url,
                                completion_condition, studio_room, planned_start, planned_end, created_by, created_at)
                              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $5, $12) returning id`,
        [pid, w.team, w.title, h.person(w.assignee), h.person(w.created.by), w.due, w.brief_url ?? null, w.done_when, w.room ?? null,
         w.planned?.[0] ?? null, w.planned?.[1] ?? null, w.created.at]);
      for (const s of w.steps ?? []) { await h.as(s.by, s.at); await h.update('work_items', wi.id, s.set); }
    }
    for (const d of p.docs ?? []) {
      await h.as(d.by, d.at);
      await db.query(`insert into public.documents (project_id, doc_type, title, url, source, added_by, added_at)
                      values ($1, $2, $3, $4, 'seed', $5, $6)`, [pid, d.type, d.title, d.url, h.person(d.by), d.at]);
    }
    const milestones = {};
    for (const a of p.acceptance ?? []) {
      const m = await h.one(`insert into public.acceptance_milestones (project_id, description, amount, effective_date, evidence_url, status,
                               submitted_by, submitted_at, verified_by, verified_at, idempotency_key, version)
                             values ($1, $2, $3, $4, $5, 'verified', $6, $7, $8, $9, $10, 2) returning id, milestone_ref`,
        [pid, a.desc, a.amount, a.date, a.evidence, h.person(a.submitted.by), a.submitted.at, h.person(a.verified.by), a.verified.at, crypto.randomUUID()]);
      milestones[a.key] = m.id;
      await h.event(pid, 'acceptance_submitted', a.submitted.at, a.submitted.by,
        `Submitted acceptance ${m.milestone_ref}: ${vnd(a.amount)} VND (net of VAT), dated ${dmy(a.date)}`,
        { milestone_id: m.id, milestone_ref: m.milestone_ref, amount: a.amount, evidence_url: a.evidence });
      await h.event(pid, 'acceptance_verified', a.verified.at, a.verified.by, `Finance verified acceptance ${m.milestone_ref}: ${vnd(a.amount)} VND`,
        { milestone_id: m.id, amount: a.amount });
    }
    for (const r of p.receipts ?? []) {
      const rc = await h.one(`insert into public.receipts (receipt_date, receipt_type, amount, tax_basis, reference, note, recorded_by, recorded_at,
                                idempotency_key)
                              values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, receipt_ref`,
        [r.date, r.type, r.amount, r.tax, r.ref, r.note ?? null, h.person('finance'), r.at, crypto.randomUUID()]);
      await db.query('insert into public.receipt_allocations (receipt_id, project_id, milestone_id, amount) values ($1, $2, $3, $4)',
        [rc.id, pid, r.milestone ? milestones[r.milestone] : null, r.amount]);
      await h.event(pid, 'receipt_recorded', r.at, 'finance',
        `Recorded receipt ${rc.receipt_ref} (${r.type === 'deposit' ? 'deposit' : 'payment'}): ${vnd(r.amount)} VND ${r.tax === 'gross_incl_vat' ? '(incl. VAT)' : '(net of VAT)'}, dated ${dmy(r.date)}, reference ${r.ref}`,
        { receipt_id: rc.id, receipt_ref: rc.receipt_ref, milestone_id: r.milestone ? milestones[r.milestone] : null, amount: r.amount, tax_basis: r.tax });
    }
  }
  await db.query('commit');
  return refs;
}

// Main ----------------------------------------------------------------------------------------------------
const db = await ownerClient();
const app = appPool({ max: 2 });
try {
  console.log(`database: ${describeDb(dbSettings())}`);
  const { rows: [{ n }] } = await db.query('select count(*)::int as n from public.projects');
  if (n > 0 && args.includes('--if-empty')) { console.log(`already seeded (${n} projects): nothing to do`); process.exit(0); }
  if (n > 0 && !args.includes('--reset')) {
    console.error(`The database already has ${n} projects. Run with --reset --yes to truncate the business tables and reload the demo.`);
    process.exit(1);
  }
  if (args.includes('--reset')) {
    if (!args.includes('--yes')) { console.error('--reset truncates every business table; add --yes to confirm.'); process.exit(1); }
    // The business tables are listed once, in the database (public.business_tables(), also used by the demo reset).
    const { rows: [{ tables }] } = await db.query('select public.business_tables() as tables');
    await db.query(`truncate ${tables.map((t) => `public.${t}`).join(', ')} restart identity`);
    console.log(`reset: truncated ${tables.length} business tables (people kept; demo personas get their seed roles back)`);
  }
  const ids = PERSONA_IDS;
  if (args.includes('--reset')) {
    // Anyone else's preferences are kept.
    const { rowCount } = await db.query('delete from public.user_preferences where user_id = any($1::uuid[])', [Object.values(ids)]);
    console.log(`reset: cleared the walkthrough choices of ${rowCount} demo user(s)`);
  }
  await seedPeopleAndServices(db, ids);
  console.log(`profiles, roles and ${SERVICES.length} services loaded`);

  const preview = await runImport(SNAPSHOT, { pool: app });
  console.log(summarize(preview));
  const commit = await runImport(SNAPSHOT, { commit: true, pool: app });
  console.log(summarize(commit));

  const refs = await seedFixtures(db, ids);
  console.log(`fixtures: ${Object.keys(refs).length} scenario projects (${Object.entries(refs).map(([k, r]) => `${k}=${r}`).join(', ')})`);

  const again = await runImport(SNAPSHOT, { commit: true, pool: app });
  console.log('re-import of the same snapshot:');
  console.log(summarize(again));
  const created = Object.values(again.counts).reduce((s, c) => s + (c.new ?? 0) + (c.updated ?? 0), 0);
  if (created) throw new Error(`re-import created or updated ${created} rows; it must create none`);

  const { rows: [{ baseline }] } = await db.query('select public.capture_demo_baseline($1::uuid[]) as baseline', [Object.values(ids)]);
  console.log(`starting state captured for "Reset demo data": ${baseline.business_rows} rows, ${baseline.sequences} sequences, ${baseline.demo_users} demo personas`);

  const { rows } = await db.query(`select (select count(*) from public.clients)::int clients, (select count(*) from public.projects)::int projects,
    (select count(*) from public.work_items)::int work_items, (select count(*) from public.project_events)::int events,
    (select count(*) from public.money_revisions)::int revisions, (select count(*) from public.change_requests)::int change_requests,
    (select count(*) from public.import_batches)::int import_batches`);
  console.log('database now:', rows[0]);
} finally {
  await db.end();
  await app.end();
}
