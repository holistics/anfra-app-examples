// (POST /api/data/<operation>, the method's arguments as a JSON array), each run in one PostgreSQL transaction as the
// role kk_app with the acting demo persona in the transaction-local app.user_id (and, for a routine edit, the version
// the person edited in app.expected_version). Row-level security, the field-ownership triggers and the workflow
// functions decide what is allowed, as before; this file adds no permission of its own. Answers keep the shapes the
// screens used: PostgreSQL builds the JSON (numbers, ISO timestamps, nested records), and an error keeps its SQLSTATE,
// message and detail, with the HTTP status a PTxyz code names.
const SAFE_REF = /^[A-Za-z0-9-]{3,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENT = /^[a-z][a-z0-9_]{0,62}$/;

const cols = (alias, list) => list.map((c) => `${alias}.${c}`).join(', ');
const obj = (alias, list) => `json_build_object(${list.map((c) => `'${c}', ${alias}.${c}`).join(', ')})`;

const PROJECT = ['id', 'project_ref', 'job_code', 'client_id', 'title', 'service_group', 'project_kind', 'commercial_stage', 'delivery_state',
  'financial_verification', 'payment_state', 'owner_id', 'account_owner_id', 'latest_note', 'latest_note_at', 'next_action', 'next_action_owner_id',
  'next_action_due', 'next_action_done_when', 'brief_status', 'brief_url', 'promised_delivery_date', 'estimated_amount', 'estimate_basis',
  'estimate_low', 'estimate_high', 'currency', 'tax_basis', 'contract_reference', 'contract_signed_date', 'lost_reason', 'data_classification',
  'source_system', 'source_key', 'source_as_of', 'imported_at', 'version', 'created_by', 'created_at', 'updated_by', 'updated_at'];
const PROJECT_CLIENT = ['id', 'client_ref', 'display_name', 'brand_name', 'client_type', 'version', 'source_system', 'source_key'];
const PROJECT_SELECT = `select ${cols('p', PROJECT)},
    (select ${obj('c', PROJECT_CLIENT)} from public.clients c where c.id = p.client_id) as client
  from public.projects p`;
const WORK = ['id', 'work_ref', 'project_id', 'team', 'title', 'assignee_id', 'requested_by', 'status', 'due_at', 'brief_url', 'output_url',
  'completion_condition', 'studio_room', 'planned_start', 'planned_end', 'actual_start', 'actual_end', 'session_note', 'review_note',
  'completed_at', 'completed_by', 'version', 'created_by', 'created_at', 'updated_by', 'updated_at', 'source_system', 'source_key'];
const REVISION = ['id', 'revision_ref', 'revision_no', 'amount', 'amount_status', 'zero_confirmed', 'status', 'effective_date', 'approved_by',
  'approved_at', 'change_request_id', 'source', 'source_ref', 'evidence_url'];
const REPORT = ['id', 'report_ref', 'title', 'purpose', 'url', 'link_kind', 'context_type', 'client_id', 'project_id', 'embed_object', 'version',
  'created_by', 'created_at', 'updated_at', 'archived_at'];
const reportSelect = (l) => `select ${cols(l, REPORT)},
    (select ${obj('c', ['id', 'client_ref', 'display_name'])} from public.clients c where c.id = ${l}.client_id) as client,
    (select ${obj('p', ['id', 'project_ref', 'title'])} from public.projects p where p.id = ${l}.project_id) as project
  from public.report_links ${l}`;
const revisions = (key) => `(select coalesce(json_agg(r), '[]'::json) from (select ${cols('m', REVISION)} from public.money_revisions m where m.${key} = l.id) r) as revisions`;

// The workflow functions the screens may call, by the name of their client method.
const FUNCTIONS = {
  intake: 'create_project_intake', submitChange: 'submit_change_request', reviewChange: 'review_change_request',
  withdrawChange: 'withdraw_change_request', issueJobCode: 'issue_job_code', setPaymentState: 'set_payment_state',
  submitAcceptance: 'submit_acceptance', reviewAcceptance: 'review_acceptance', recordReceipt: 'record_receipt',
  importSnapshot: 'import_snapshot', grantRole: 'grant_role', revokeRole: 'revoke_role', resetDemo: 'reset_demo_data',
};

export class ApiError extends Error {
  constructor(status, kind, message) { super(message); this.status = status; this.kind = kind; }
}
const bad = (message) => new ApiError(400, 'invalid', message);

export function createDataApi(pool) {
  // One transaction per request, as the persona; nothing of it outlives the transaction.
  async function run(userId, fn, { expectedVersion } = {}) {
    const db = await pool.connect();
    try {
      await db.query('begin');
      await db.query(`select set_config('app.user_id', $1, true), set_config('app.expected_version', $2, true)`,
        [userId, expectedVersion === undefined || expectedVersion === null ? '' : String(expectedVersion)]);
      const out = await fn(db);
      await db.query('commit');
      return out;
    } catch (e) {
      await db.query('rollback').catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  }
  const rows = async (db, sql, params = []) => (await db.query(`select coalesce(json_agg(t), '[]'::json) as data from (${sql}) t`, params)).rows[0].data;
  const first = async (db, sql, params) => (await rows(db, sql, params))[0] ?? null;
  // A workflow function, called with its own parameter names; objects and arrays are its jsonb arguments.
  async function call(db, fn, params = {}) {
    const names = Object.keys(params);
    if (names.some((n) => !IDENT.test(n))) throw bad('invalid parameter name');
    const values = names.map((n) => (params[n] !== null && typeof params[n] === 'object' ? JSON.stringify(params[n]) : params[n]));
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as result`;
    const { result } = (await db.query(sql, values)).rows[0];
    return result === '' || result === undefined ? null : result; // a function returning void answers nothing
  }
  // A routine edit: only the columns given, by name; the database's column grants and triggers decide the rest.
  async function update(db, table, id, patch) {
    const keys = Object.keys(patch ?? {});
    if (!UUID.test(String(id))) throw bad('invalid id');
    if (!keys.length) throw bad('nothing to change');
    if (keys.some((k) => !IDENT.test(k))) throw bad('invalid field name');
    const set = keys.map((k, i) => `${db.escapeIdentifier(k)} = $${i + 2}`).join(', ');
    return (await db.query(`update public.${table} set ${set} where id = $1 returning id`, [id, ...keys.map((k) => patch[k])])).rowCount;
  }
  // An insert that is idempotent on the form's request id: a repeat returns the first record, marked duplicate.
  async function insertOnce(db, table, fields, requestId, select) {
    const record = { ...fields, request_id: requestId };
    const keys = Object.keys(record);
    if (keys.some((k) => !IDENT.test(k))) throw bad('invalid field name');
    await db.query('savepoint insert_once');
    try {
      const { rows: [r] } = await db.query(`insert into public.${table} (${keys.map((k) => db.escapeIdentifier(k)).join(', ')})
        values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, keys.map((k) => record[k]));
      await db.query('release savepoint insert_once');
      return first(db, `${select} where t0.id = $1`, [r.id]);
    } catch (e) {
      if (e.code !== '23505' || !/request_id/.test(`${e.constraint ?? ''} ${e.detail ?? ''}`)) throw e;
      await db.query('rollback to savepoint insert_once');
      const existing = await first(db, `${select} where t0.request_id = $1`, [requestId]);
      if (!existing) throw e;
      return { ...existing, duplicate: true };
    }
  }

  const ops = {
    // ---- the persona and the people ----------------------------------------------------------------------------
    me: (db, user) => first(db, `select p.user_id as id, p.email, json_build_object('user_id', p.user_id, 'display_name', p.display_name, 'email', p.email, 'title', p.title) as profile,
        coalesce((select json_agg(m.role order by m.role) from public.role_memberships m where m.user_id = p.user_id), '[]'::json) as roles
      from public.profiles p where p.user_id = app.uid()`),
    people: (db) => rows(db, `select p.user_id, p.display_name, p.email, p.title,
        coalesce((select json_agg(m.role order by m.role) from public.role_memberships m where m.user_id = p.user_id), '[]'::json) as roles
      from public.profiles p order by p.display_name`),
    roleAudit: (db) => rows(db, 'select user_id, role, action, actor_id, occurred_at from public.role_audit order by occurred_at desc, id desc limit 200'),
    preferences: async (db) => (await first(db, 'select walkthrough, updated_at from public.user_preferences')) ?? { walkthrough: {} },
    saveWalkthrough: async (db, user, walkthrough) => {
      await db.query(`insert into public.user_preferences (walkthrough) values ($1::jsonb)
        on conflict (user_id) do update set walkthrough = excluded.walkthrough`, [JSON.stringify(walkthrough ?? {})]);
      return first(db, 'select walkthrough, updated_at from public.user_preferences');
    },

    // ---- CRM and projects ----------------------------------------------------------------------------------------
    clients: (db) => rows(db, `select id, client_ref, display_name, brand_name, agency_name, client_type, owner_id, source_system, source_key,
        version, created_at, updated_at from public.clients order by display_name`),
    services: (db) => rows(db, 'select code, name, service_group from public.services order by code'),
    projects: (db) => rows(db, `${PROJECT_SELECT} order by p.updated_at desc`),
    // Opens a project by its stable internal ID (NP-xxxx), its Finance job code, or its UUID.
    findProject: async (db, user, ref) => {
      const q = String(ref ?? '').trim();
      if (UUID.test(q)) return first(db, `${PROJECT_SELECT} where p.id = $1`, [q]);
      if (!SAFE_REF.test(q)) return null;
      return first(db, `${PROJECT_SELECT} where p.project_ref = $1 or p.job_code = $1 limit 1`, [q.toUpperCase()]);
    },
    project: async (db, user, id) => {
      if (!UUID.test(String(id))) return null;
      return first(db, `${PROJECT_SELECT} where p.id = $1`, [id]);
    },
    updateProject: async (db, user, id, expectedVersion, patch) => ((await update(db, 'projects', id, patch)) ? first(db, `${PROJECT_SELECT} where p.id = $1`, [id]) : null),
    updateClient: async (db, user, id, expectedVersion, patch) => ((await update(db, 'clients', id, patch)) ? first(db, 'select * from public.clients where id = $1', [id]) : null),
    readiness: (db, user, projectId) => rows(db, 'select * from public.project_readiness where project_id = $1 order by sort_order', [projectId]),
    history: (db, user, projectId) => rows(db, `select id, event_type, actor_id, occurred_at, summary, details, source, source_system, source_key, work_item_id,
        change_request_id, revision_id from public.project_events where project_id = $1 order by occurred_at desc, id desc`, [projectId]),
    clientHistory: (db, user, clientId) => rows(db, 'select * from public.client_events where client_id = $1 order by occurred_at desc', [clientId]),

    // ---- work ------------------------------------------------------------------------------------------------------
    workItems: (db, user, { projectId, assigneeId } = {}) => rows(db, `select ${cols('w', WORK)},
        (select ${obj('p', ['id', 'project_ref', 'title', 'account_owner_id', 'owner_id'])} from public.projects p where p.id = w.project_id) as project
      from public.work_items w where ($1::uuid is null or w.project_id = $1) and ($2::uuid is null or w.assignee_id = $2)
      order by w.due_at asc nulls last`, [projectId ?? null, assigneeId ?? null]),
    // Everyone's open commitments, for the due dates of suggested next actions: the owner and the date only.
    commitments: async (db) => ({
      workItems: await rows(db, `select assignee_id, due_at, status from public.work_items where status not in ('done', 'cancelled') and assignee_id is not null`),
      projects: await rows(db, 'select next_action_owner_id, next_action, next_action_due from public.projects where next_action is not null and next_action_owner_id is not null'),
    }),
    createWork: (db, user, item, requestId) => insertOnce(db, 'work_items', item, requestId, `select ${cols('t0', WORK)} from public.work_items t0`),
    updateWork: async (db, user, id, expectedVersion, patch) => ((await update(db, 'work_items', id, patch))
      ? first(db, `select ${cols('w', WORK)} from public.work_items w where w.id = $1`, [id]) : null),

    // ---- Holistics report links ------------------------------------------------------------------------------------
    reportLinks: (db, user, { projectId, clientId } = {}) => rows(db, `${reportSelect('l')}
      where l.archived_at is null and ($1::uuid is null or l.project_id = $1) and ($2::uuid is null or l.client_id = $2)
      order by l.created_at desc, l.report_ref desc`, [projectId ?? null, clientId ?? null]),
    createReportLink: (db, user, fields, requestId) => insertOnce(db, 'report_links', fields, requestId, reportSelect('t0')),
    updateReportLink: async (db, user, id, expectedVersion, patch) => ((await update(db, 'report_links', id, patch)) ? first(db, `${reportSelect('l')} where l.id = $1`, [id]) : null),

    // ---- documents ---------------------------------------------------------------------------------------------------
    documents: (db, user, projectId) => rows(db, 'select * from public.documents where project_id = $1 order by added_at desc', [projectId]),
    addDocument: (db, user, doc, requestId) => insertOnce(db, 'documents', doc, requestId, 'select t0.* from public.documents t0'),

    // ---- money: lines, proposals and Finance review -----------------------------------------------------------------
    moneyLines: async (db, user, projectId) => ({
      services: await rows(db, `select l.id, l.line_ref, l.service_code, l.description, l.source_system, l.source_key, l.created_at, ${revisions('service_line_id')}
        from public.service_lines l where l.project_id = $1 order by l.line_ref`, [projectId]),
      costs: await rows(db, `select l.id, l.line_ref, l.service_line_id, l.description, l.cost_stage, l.source_system, l.source_key, l.created_at, ${revisions('cost_line_id')}
        from public.cost_lines l where l.project_id = $1 order by l.line_ref`, [projectId]),
    }),
    changeRequests: (db, user, { projectId, status } = {}) => rows(db, `select r.*,
        (select json_build_object('id', p.id, 'project_ref', p.project_ref, 'job_code', p.job_code, 'title', p.title,
          'client', (select json_build_object('display_name', c.display_name) from public.clients c where c.id = p.client_id))
         from public.projects p where p.id = r.project_id) as project
      from public.change_requests r where ($1::uuid is null or r.project_id = $1) and ($2::text is null or r.status = $2)
      order by r.requested_at desc`, [projectId ?? null, status ?? null]),

    // ---- acceptance and cash ---------------------------------------------------------------------------------------
    acceptance: (db, user, projectId) => rows(db, `select a.*, (select ${obj('p', ['id', 'project_ref', 'title'])} from public.projects p where p.id = a.project_id) as project
      from public.acceptance_milestones a where ($1::uuid is null or a.project_id = $1) order by a.effective_date desc`, [projectId ?? null]),
    receipts: (db, user, projectId) => rows(db, `select ra.id, ra.project_id, ra.milestone_id, ra.amount,
        (select ${obj('r', ['id', 'receipt_ref', 'receipt_date', 'receipt_type', 'amount', 'tax_basis', 'reference', 'note', 'recorded_at', 'recorded_by'])}
         from public.receipts r where r.id = ra.receipt_id) as receipt
      from public.receipt_allocations ra where ($1::uuid is null or ra.project_id = $1)`, [projectId ?? null]),

    // ---- queues, imports and the demo ------------------------------------------------------------------------------
    queue: (db) => rows(db, 'select * from public.queue_items'),
    importBatches: (db) => rows(db, `select id, batch_ref, source_system, snapshot_label, source_as_of, payload_sha256, run_kind, counts, totals, run_by, run_at
      from public.import_batches order by run_at desc`),
    importRows: (db, user, batchId) => rows(db, 'select id, entity, source_key, outcome, message, target_id, raw from public.import_rows where batch_id = $1 order by id', [batchId]),
    demoResets: (db) => rows(db, 'select id, reset_by, reset_at, baseline_captured_at, rows_restored from public.demo_resets order by id desc limit 5'),
  };
  // The workflow functions: the client sends their parameters by their own names.
  for (const [op, fn] of Object.entries(FUNCTIONS)) ops[op] = (db, user, params) => call(db, fn, params ?? {});

  // Routine edits carry the version the person edited (their second argument).
  const VERSIONED = new Set(['updateProject', 'updateClient', 'updateWork', 'updateReportLink']);

  return {
    operations: Object.keys(ops),
    // Runs one operation for a persona. Throws an ApiError for a request the API itself refuses, or the database's
    // own error, which httpError() turns into its answer.
    async perform(userId, op, args = []) {
      const fn = Object.hasOwn(ops, op) ? ops[op] : null;
      if (!fn) throw new ApiError(404, 'not_found', `Unknown operation ${op}.`);
      if (!Array.isArray(args)) throw bad('args must be an array');
      return run(userId, (db) => fn(db, userId, ...args), VERSIONED.has(op) ? { expectedVersion: args[1] } : {});
    },
    run,
  };
}

// The answer for an error: a refusal of the API itself, or the database's error with its code, message and detail,
// and the HTTP status its SQLSTATE names (PTxyz → xyz).
const STATUS = { 23505: 409, 23503: 409, 23514: 400, 23502: 400, '22P02': 400, 22007: 400, 22008: 400, 42501: 403, P0001: 400 };
export function httpError(e) {
  if (e instanceof ApiError) return { status: e.status, body: { error: { kind: e.kind, message: e.message } } };
  if (e && typeof e.code === 'string' && e.severity) {
    const status = /^PT\d{3}$/.test(e.code) ? Number(e.code.slice(2)) : STATUS[e.code] ?? 400;
    return { status, body: { error: { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null, constraint: e.constraint ?? null } } };
  }
  return null; // anything else is a server fault, answered as such by the caller
}
