// Display labels for the stored codes. The database keeps stable codes; screens show these.
export const STAGE = { lead: 'Lead', qualified: 'Qualified', meeting: 'Meeting', proposal: 'Proposal sent', negotiation: 'Negotiation',
  contract_sent: 'Contract sent', won: 'Contract signed', lost: 'Lost', on_hold: 'On hold' };
export const STAGE_ORDER = ['lead', 'qualified', 'meeting', 'proposal', 'negotiation', 'contract_sent', 'won', 'lost', 'on_hold'];
export const DELIVERY = { not_started: 'Not started', planning: 'Planning', in_production: 'In production', delivered: 'Delivered',
  client_accepted: 'Client accepted', closed: 'Closed', cancelled: 'Cancelled' };
export const FIN_VERIFY = { not_submitted: 'Not submitted', pending_review: 'Waiting for Finance', verified: 'Verified by Finance' };
export const PAYMENT = { not_due: 'Not due', deposit_requested: 'Deposit requested', deposit_received: 'Deposit received', partially_received: 'Partly received',
  fully_received: 'Fully received', overdue: 'Payment overdue' };
export const BRIEF = { missing: 'Missing', received: 'Received, not confirmed', ready: 'Ready' };
export const KIND = { commercial: 'Commercial', sponsored: 'Sponsored (zero revenue by intent)', internal: 'Internal' };
export const GROUP = { venue: 'Venue (studio, equipment)', ecommerce: 'E-commerce (livestream, shops)', production: 'Production (photo, video)', event: 'Events', academy: 'Academy (training)' };
export const TEAM = { account: 'Account', design: 'Design', studio: 'Studio' };
export const WORK = { todo: 'To do', in_progress: 'In progress', in_review: 'In review', changes_requested: 'Changes requested', done: 'Done', blocked: 'Blocked', cancelled: 'Cancelled' };
export const ROLE = { bd: 'BD', account: 'Account', finance: 'Finance', design: 'Design', studio: 'Studio', admin: 'Admin' };
export const CLIENT_TYPE = { brand: 'Brand', agency: 'Agency', mcn: 'MCN', partner: 'Partner', internal: 'Internal' };
export const ESTIMATE = { total: 'Total value', monthly: 'Per month', range: 'Range (from – to)' };
export const COST_STAGE = { forecast: 'Forecast', committed: 'Committed', actual: 'Actual' };
export const VALUE_STATE = { imported: 'Imported as approved', approved: 'Approved by Finance', proposed: 'Proposed (not approved)' };
export const CR_STATUS = { pending: 'Waiting for Finance', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' };
export const DOC_TYPE = { brief: 'Brief', quotation: 'Quotation', internal_cost_sheet: 'Internal cost sheet', contract: 'Contract',
  acceptance_minutes: 'Acceptance minutes', design_output: 'Design output', evidence: 'Evidence', other: 'Other' };
export const SOURCE = { app: 'App', import: 'Snapshot import', seed: 'Sample data', system: 'System' };
export const EVENT = { created: 'Created', note: 'Note', stage_change: 'Stage change', delivery_change: 'Delivery change', next_action_set: 'Next action',
  field_change: 'Details updated', work_created: 'Work assigned', work_updated: 'Work updated', document_linked: 'Document linked',
  proposal_submitted: 'Proposal submitted', proposal_withdrawn: 'Proposal withdrawn', review_approved: 'Finance approved', review_rejected: 'Finance rejected',
  job_code_issued: 'Job code issued', payment_state_changed: 'Payment state', imported: 'Imported', acceptance_submitted: 'Acceptance submitted',
  acceptance_verified: 'Acceptance verified', acceptance_rejected: 'Acceptance rejected', receipt_recorded: 'Receipt recorded',
  report_linked: 'Holistics report connected', report_unlinked: 'Holistics report link removed' };
export const CHECK_ICON = { ok: '✓', missing: '!', blocked: '✕', unknown: '?', not_applicable: '–' };
export const CHECK_STATUS = { ok: 'OK', missing: 'Missing', blocked: 'Blocked', unknown: 'Unknown', not_applicable: 'Not applicable' };
export const label = (dict, code) => (code === null || code === undefined ? '—' : dict[code] ?? code);
