// The application's data API, as the screens use it: every read and write, by name, over the app server's data API
// (POST /api/data/<operation>, server/data.mjs), which runs it in PostgreSQL as the chosen demo persona. Routine edits
// carry the version the person edited; controlled actions are database functions, called with their own parameter
// names. Tests import this same module, so what they prove is what the screens do.
import { AppError, toAppError } from './errors.mjs';

export function newRequestId() {
  return globalThis.crypto.randomUUID();
}

// How a call reaches the server: fetch, with the persona's session token, given up after 30 s ("cannot reach the
// server"), and an expired or unknown session reported to onUnauthorized (the app then asks for a persona again).
export function httpTransport({ base = '', getToken, onUnauthorized = () => {}, timeoutMs = 30000 } = {}) {
  return async function call(op, args = []) {
    let r;
    try {
      r = await fetch(`${base}/api/data/${op}`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${(await getToken?.()) ?? ''}` }, body: JSON.stringify({ args }) });
    } catch (e) {
      throw toAppError({ message: e.message ?? 'network' }, 0);
    }
    const body = await r.json().catch(() => ({}));
    if (r.ok) return body.data ?? null;
    if (r.status === 401) onUnauthorized();
    const error = body.error ?? { message: `HTTP ${r.status}` };
    if (error.kind) throw new AppError(error.kind, error.message, { code: error.code, status: r.status });
    throw toAppError(error, r.status);
  };
}

export function createApi(call) {
  const api = {
    // ---- the persona and the people ----------------------------------------------------------------------------
    async me() {
      const me = await call('me');
      if (!me) throw new AppError('forbidden', 'Your demo session has ended. Choose a persona again.');
      return me;
    },
    people: () => call('people'),
    roleAudit: () => call('roleAudit'),
    preferences: () => call('preferences'),
    saveWalkthrough: (walkthrough) => call('saveWalkthrough', [walkthrough]),

    // ---- CRM and projects -----------------------------------------------------------------------------------
    clients: () => call('clients'),
    services: () => call('services'),
    projects: () => call('projects'),
    // Opens a project by its stable internal ID (NP-xxxx), its Finance job code, or its UUID.
    findProject: (ref) => call('findProject', [ref]),
    async project(id) {
      const row = await call('project', [id]);
      if (!row) throw new AppError('not_found', 'Project not found, or you are not allowed to see it.');
      return row;
    },
    // Quick intake: new or existing client + opportunity + first next action, in one idempotent call.
    intake: (payload, requestId) => call('intake', [{ p_payload: payload, p_request_id: requestId }]),
    // Routine update of a project, with the version the user edited. Returns the saved row (new version).
    async updateProject(id, expectedVersion, patch) {
      const row = await call('updateProject', [id, expectedVersion, patch]);
      if (!row) throw new AppError('forbidden', 'You are not allowed to update this project.');
      return row;
    },
    async updateClient(id, expectedVersion, patch) {
      const row = await call('updateClient', [id, expectedVersion, patch]);
      if (!row) throw new AppError('forbidden', 'You are not allowed to update this client.');
      return row;
    },
    readiness: (projectId) => call('readiness', [projectId]),
    history: (projectId) => call('history', [projectId]),
    clientHistory: (clientId) => call('clientHistory', [clientId]),

    // ---- work -----------------------------------------------------------------------------------------------
    workItems: ({ projectId, assigneeId } = {}) => call('workItems', [{ projectId, assigneeId }]),
    // only, never titles.
    commitments: () => call('commitments'),
    // Creating work is idempotent on the form's request id: a double submit returns the first item.
    createWork: (item, requestId) => call('createWork', [item, requestId]),
    async updateWork(id, expectedVersion, patch) {
      const row = await call('updateWork', [id, expectedVersion, patch]);
      if (!row) throw new AppError('forbidden', 'You are not allowed to update this work item.');
      return row;
    },

    // ---- Holistics report links (a report built in Holistics, kept with the CRM record it is about) ---------------
    reportLinks: ({ projectId, clientId } = {}) => call('reportLinks', [{ projectId, clientId }]),
    // Idempotent on the form's request id: a double submit returns the first link.
    createReportLink: (fields, requestId) => call('createReportLink', [fields, requestId]),
    async updateReportLink(id, expectedVersion, patch) {
      const row = await call('updateReportLink', [id, expectedVersion, patch]);
      if (!row) throw new AppError('forbidden', 'You are not allowed to change this report link.');
      return row;
    },
    // Removing a link archives it (the database stamps when and by whom); the report itself stays in Holistics.
    archiveReportLink: (id, expectedVersion) => api.updateReportLink(id, expectedVersion, { archived_at: new Date().toISOString() }),

    // ---- documents ------------------------------------------------------------------------------------------
    documents: (projectId) => call('documents', [projectId]),
    addDocument: (doc, requestId) => call('addDocument', [doc, requestId]),

    // ---- money: lines, proposals and Finance review -----------------------------------------------------------
    async moneyLines(projectId) {
      const { services, costs } = await call('moneyLines', [projectId]);
      const shape = (kind) => (l) => {
        const revisions = [...(l.revisions ?? [])].sort((a, b) => b.revision_no - a.revision_no);
        return { ...l, kind, revisions, current: revisions.find((r) => r.status === 'approved') ?? null };
      };
      return { revenue: services.map(shape('revenue')), cost: costs.map(shape('cost')) };
    },
    changeRequests: ({ projectId, status } = {}) => call('changeRequests', [{ projectId, status }]),
    submitChange: (p) => call('submitChange', [{
      p_project_id: p.projectId, p_target_type: p.targetType, p_line_id: p.lineId ?? null,
      p_amount: p.amountKnown === false ? null : p.amount, p_amount_known: p.amountKnown !== false, p_zero_confirmed: Boolean(p.zeroConfirmed),
      p_description: p.description ?? null, p_cost_stage: p.costStage ?? null, p_reason: p.reason, p_evidence_url: p.evidenceUrl,
      p_base_revision_id: p.baseRevisionId ?? null, p_idempotency_key: p.idempotencyKey, p_service_code: p.serviceCode ?? null,
      p_service_line_id: p.serviceLineId ?? null,
    }]),
    reviewChange: (requestId, decision, comment, expectedVersion) => call('reviewChange', [{ p_request_id: requestId, p_decision: decision,
      p_comment: comment ?? null, p_expected_version: expectedVersion }]),
    withdrawChange: (requestId, expectedVersion) => call('withdrawChange', [{ p_request_id: requestId, p_expected_version: expectedVersion }]),
    issueJobCode: (projectId, jobCode, expectedVersion) => call('issueJobCode', [{ p_project_id: projectId, p_job_code: jobCode, p_expected_version: expectedVersion }]),
    setPaymentState: (projectId, state, expectedVersion, note) => call('setPaymentState', [{ p_project_id: projectId, p_state: state,
      p_expected_version: expectedVersion, p_note: note ?? null }]),

    // ---- acceptance and cash ----------------------------------------------------------------------------------
    acceptance: (projectId) => call('acceptance', [projectId ?? null]),
    submitAcceptance: (p) => call('submitAcceptance', [{ p_project_id: p.projectId, p_description: p.description, p_amount: p.amount,
      p_effective_date: p.effectiveDate, p_evidence_url: p.evidenceUrl, p_idempotency_key: p.idempotencyKey }]),
    reviewAcceptance: (milestoneId, decision, comment, expectedVersion) => call('reviewAcceptance', [{ p_milestone_id: milestoneId,
      p_decision: decision, p_comment: comment ?? null, p_expected_version: expectedVersion }]),
    receipts: (projectId) => call('receipts', [projectId ?? null]),
    recordReceipt: (receipt, allocations, idempotencyKey) => call('recordReceipt', [{ p_receipt: receipt, p_allocations: allocations, p_idempotency_key: idempotencyKey }]),

    // ---- home queues ------------------------------------------------------------------------------------------
    queue: () => call('queue'),

    // ---- import and roles (Admin) -------------------------------------------------------------------------------
    importSnapshot: (meta, rows, commit) => call('importSnapshot', [{ p_meta: meta, p_rows: rows, p_commit: commit }]),
    importBatches: () => call('importBatches'),
    importRows: (batchId) => call('importRows', [batchId]),
    grantRole: (userId, role) => call('grantRole', [{ p_user_id: userId, p_role: role }]),
    revokeRole: (userId, role) => call('revokeRole', [{ p_user_id: userId, p_role: role }]),

    // ---- demo reset (Admin) ---------------------------------------------------------------------------------
    // Every business table back to the demo's starting state, in one database transaction; people are kept.
    resetDemo: () => call('resetDemo', [{}]),
    demoResets: () => call('demoResets'),
  };
  return api;
}
