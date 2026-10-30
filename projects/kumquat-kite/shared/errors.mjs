// Turns the data API's errors into one shape the screens can act on: a kind (what the user can do about it), a
// message, and the raw code and detail for a "technical details" toggle. The errors are PostgreSQL's own (SQLSTATE,
// message, detail); database functions raise PTxyz SQLSTATEs, which the app server answers with HTTP status xyz.
export class AppError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.kind = kind;            // conflict | forbidden | invalid | not_found | version_required | network | unknown
    Object.assign(this, extra);  // code, detail, status, constraint
  }
}

const BY_MESSAGE = {
  version_conflict: ['conflict', 'Someone else saved this record after you opened it. Your draft is kept: load the latest version, compare, then save again.'],
  expected_version_required: ['version_required', 'The record version is missing. Reload the data and save again.'],
  stale_base_revision: ['conflict', 'The approved value changed after you opened the form. Reload the current value, then resubmit your proposal.'],
  proposal_already_pending: ['conflict', 'This line already has a proposal waiting for Finance. Wait for the decision or withdraw that proposal first.'],
  already_reviewed: ['conflict', 'Someone else has already decided on this. Reload to see the outcome.'],
  idempotency_key_reused: ['conflict', 'This submission key belongs to another request. Reopen the form and submit again.'],
  job_code_already_issued: ['conflict', 'The project already has a job code.'],
  job_code_in_use: ['conflict', 'This job code is already used by another project.'],
  forbidden: ['forbidden', 'You are not allowed to do this.'],
  report_link_owner_only: ['forbidden', 'Only the person who connected this report, or an Admin, can change or remove it.'],
  report_link_archived: ['conflict', 'This report link was removed in the meantime. Reload the list.'],
  embed_admin_only: ['forbidden', 'Only an Admin can set the embedded dashboard of a report.'],
  no_demo_baseline: ['invalid', 'The demo starting state has not been captured yet. Run npm run seed:reset once, then try again.'],
  finance_owned_field: ['forbidden', 'Job code, financial verification and payment state are changed by Finance through their own actions.'],
  forbidden_field: ['forbidden', 'You can only update your own part of this record.'],
  immutable_field: ['forbidden', 'Identifiers and source fields cannot be edited.'],
  source_owned_field: ['forbidden', 'Import source fields cannot be edited.'],
  transition_not_allowed: ['forbidden', 'This status change is not allowed from the current status.'],
  append_only: ['forbidden', 'History cannot be edited or deleted.'],
  invalid_expected_version: ['invalid', 'The record version is not valid.'],
  amount_required: ['invalid', 'Enter an amount, or mark it "amount unknown".'],
  amount_negative: ['invalid', 'Amounts cannot be negative.'],
  zero_needs_confirmation: ['invalid', 'A zero amount must be confirmed as intentional. If the amount is not known yet, mark it "amount unknown".'],
  reason_required: ['invalid', 'Give a reason (at least 5 characters).'],
  rejection_reason_required: ['invalid', 'Give a reason for the rejection (at least 5 characters).'],
  evidence_required: ['invalid', 'Add a link to the evidence (http or https).'],
  description_required: ['invalid', 'Describe the new line.'],
  service_code_required: ['invalid', 'Choose the service of the new revenue line.'],
  effective_date_required: ['invalid', 'Enter the acceptance date.'],
  receipt_fields_required: ['invalid', 'A receipt needs a date, type, amount, tax basis and reference.'],
  allocations_required: ['invalid', 'Allocate the receipt to at least one project.'],
  allocation_amount_invalid: ['invalid', 'An allocated amount must be greater than 0.'],
  allocation_total_mismatch: ['invalid', 'Allocations must add up exactly to the receipt amount.'],
  milestone_not_verified: ['invalid', 'Allocate only to a Finance-verified acceptance milestone of the same project.'],
  invalid_decision: ['invalid', 'That decision is not valid.'],
  invalid_target_type: ['invalid', 'That kind of change is not valid.'],
  request_id_required: ['invalid', 'The submission key is missing.'],
  idempotency_key_required: ['invalid', 'The submission key is missing.'],
  import_metadata_required: ['invalid', 'The snapshot is missing its source details (system, as-of time, hash).'],
  line_not_found: ['not_found', 'That money line is not part of this project.'],
  service_line_not_found: ['not_found', 'That service line is not part of this project.'],
  project_not_found: ['not_found', 'Project not found.'],
  client_not_found: ['not_found', 'Client not found.'],
  change_request_not_found: ['not_found', 'Proposal not found.'],
  milestone_not_found: ['not_found', 'Acceptance milestone not found.'],
};

const BY_CONSTRAINT = {
  next_action_needs_owner_and_due: 'A next action needs an owner and a due date.',
  won_needs_contract: 'Moving to "Contract signed" needs the contract reference and signing date.',
  lost_needs_reason: 'Moving to "Lost" needs a reason.',
  estimate_shape: 'An estimate is a total, a monthly amount, or a range (from – to).',
  brief_ready_needs_link: 'A "Ready" brief needs a document link.',
  design_review_needs_output: 'Sending design work for review, or completing it, needs an output link.',
  studio_done_needs_times: 'Completing a studio session needs the actual start and end times.',
  studio_fields_only_for_studio: 'Room and session times are only for Studio work.',
  planned_interval: 'The planned end must be after the planned start.',
  actual_interval: 'The actual end must be after the actual start.',
  clients_display_name_check: 'The client name cannot be empty.',
  projects_title_check: 'The project title cannot be empty.',
  work_items_completion_condition_check: 'Say what "done" means for this work.',
  work_items_brief_url_check: 'The brief link must start with http:// or https://.',
  work_items_output_url_check: 'The output link must start with http:// or https://.',
  projects_brief_url_check: 'The brief link must start with http:// or https://.',
  documents_url_check: 'The document link must start with http:// or https://.',
  projects_job_code_check: 'A job code uses capital letters, digits and hyphens (4–30 characters).',
  report_links_url_check: 'The report address must be an https address on holistics.io, without an access token.',
  report_links_context_check: 'Choose the client or the project the report is about.',
  report_links_title_check: 'Give the report a title of 3 to 120 characters.',
  report_links_purpose_check: 'Keep the purpose under 500 characters.',
  report_links_embed_object_check: 'The embedded dashboard is named by its AML unique name: lowercase letters, digits and underscores.',
};

export function toAppError(error, status) {
  if (!error) return null;
  if (error instanceof AppError) return error;
  const raw = `${error.message ?? ''}`;
  if (/fetch failed|Failed to fetch|NetworkError|network|ECONN|ETIMEDOUT|Load failed|timed out|due to timeout/i.test(raw) && !error.code) {
    return new AppError('network', 'Cannot reach the server. Your draft is still on screen; save again when you are back online.', { detail: raw });
  }
  const known = BY_MESSAGE[raw];
  if (known) return new AppError(known[0], known[1], { code: error.code, detail: error.details ?? null, status });
  if (error.code === '23514') {
    const constraint = (raw.match(/constraint "([^"]+)"/) ?? [])[1];
    return new AppError('invalid', BY_CONSTRAINT[constraint] ?? 'Some values are not valid.', { code: error.code, constraint, detail: raw, status });
  }
  if (error.code === '23502') return new AppError('invalid', 'Required information is missing.', { code: error.code, detail: raw, status });
  if (error.code === '23505') return new AppError('conflict', 'This record already exists (you may have just submitted it).', { code: error.code, detail: raw, status });
  if (error.code === '23503') return new AppError('invalid', 'A related record does not exist.', { code: error.code, detail: raw, status });
  if (error.code === '22P02' || error.code === '22007' || error.code === '22008') {
    return new AppError('invalid', 'A value has the wrong format (date, number or code).', { code: error.code, detail: raw, status });
  }
  if (error.code === '42501' || status === 401 || status === 403) {
    return new AppError('forbidden', 'You are not allowed to do this.', { code: error.code, detail: raw, status });
  }
  return new AppError('unknown', 'Not saved because of a server error. Your draft is kept; try again.', { code: error.code, detail: raw, status });
}
