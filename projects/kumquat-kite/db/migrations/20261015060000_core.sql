-- Kumquat Kite lightweight ERP+CRM POC — core operational schema.
-- Synthetic demo data only. Money is exact NUMERIC(18,2), VND, net of VAT. Business dates use Asia/Ho_Chi_Minh.
--
-- Write paths (the app server's data API, server/data.mjs, runs each request in one transaction as the role kk_app,
-- with the acting demo persona in app.user_id; see 20261015055900_app_identity.sql)
--   * Routine edits (clients, projects, work items): an UPDATE with the version the person edited in
--     app.expected_version; BEFORE UPDATE triggers enforce the optimistic version check, field ownership per role
--     and validation, then bump the version. AFTER triggers write the audit events.
--   * Controlled actions (intake, financial proposals, Finance review, job codes, payment state, roles):
--     SECURITY DEFINER functions in 20261015060100_functions.sql.
--   * Reporting: read-only views in schema `reporting` (20261015060200_reporting.sql), read by Anfra's
--     SELECT-only role. The app role kk_app has no access to `reporting`.

create schema if not exists reporting;

-- ---------------------------------------------------------------------------------------------
-- Human-friendly stable references (the internal UUID is the primary key everywhere)
-- ---------------------------------------------------------------------------------------------
create sequence public.client_ref_seq;
create sequence public.project_ref_seq;
create sequence public.work_ref_seq;
create sequence public.line_ref_seq;
create sequence public.change_ref_seq;
create sequence public.revision_ref_seq;
create sequence public.document_ref_seq;
create sequence public.milestone_ref_seq;
create sequence public.receipt_ref_seq;

create or replace function public.business_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

-- Money text for audit summaries: 100,000,000 (whole VND), 1,234.50 (with a fraction).
create or replace function public.fmt_vnd(p numeric) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then null
              when p = trunc(p) then to_char(p, 'FM999,999,999,999,999,990')
              else to_char(p, 'FM999,999,999,999,999,990.00') end
$$;

-- ---------------------------------------------------------------------------------------------
-- People and roles. Role membership is service infrastructure: no client can write it directly.
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key,
  display_name text not null check (length(trim(display_name)) > 0),
  email        text not null,
  title        text,
  created_at   timestamptz not null default now()
);

create table public.role_memberships (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  role       text not null check (role in ('bd', 'account', 'finance', 'design', 'studio', 'admin')),
  granted_by uuid references public.profiles(user_id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_role(p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.role_memberships m where m.user_id = app.uid() and m.role = p_role)
$$;

create or replace function public.has_any_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.role_memberships m where m.user_id = app.uid() and m.role = any (p_roles))
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.role_memberships m where m.user_id = app.uid())
$$;

create or replace function public.my_roles() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.role order by m.role), '{}') from public.role_memberships m where m.user_id = app.uid()
$$;

-- The version the person edited, which the app server sets for a routine edit (transaction-local app.expected_version).
create or replace function public.expected_version() returns integer
language plpgsql stable set search_path = '' as $$
declare
  v_raw text := nullif(current_setting('app.expected_version', true), '');
begin
  if v_raw is null then
    return null;
  end if;
  if v_raw !~ '^[0-9]{1,9}$' then
    raise exception using errcode = 'PT400', message = 'invalid_expected_version',
      detail = 'the expected version must be a whole number';
  end if;
  return v_raw::integer;
end $$;

-- True inside a SECURITY DEFINER workflow function that has already checked actor, version and transition.
create or replace function public.in_trusted_write() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('kumquat.trusted_write', true), '') = 'on'
$$;

-- Seed/import writes keep the timestamps they carry so history stays truthful.
create or replace function public.trusted_time(p_given timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select case when public.in_trusted_write() then coalesce(p_given, now()) else now() end
$$;

-- The clock history is written with. Only the synthetic seed, inside a trusted write, may replay past business
-- events (kumquat.event_time); every application write is stamped now().
create or replace function public.event_time() returns timestamptz
language sql stable set search_path = '' as $$
  select case when public.in_trusted_write() and current_setting('kumquat.write_source', true) = 'seed'
              then coalesce(nullif(current_setting('kumquat.event_time', true), '')::timestamptz, now())
              else now() end
$$;

-- ---------------------------------------------------------------------------------------------
-- Clients and the generic service catalogue (synthetic labels; the client's real margin policy is not loaded)
-- ---------------------------------------------------------------------------------------------
create table public.clients (
  id                  uuid primary key default gen_random_uuid(),
  client_ref          text not null unique default ('CL-' || lpad(nextval('public.client_ref_seq')::text, 4, '0')),
  display_name        text not null check (length(trim(display_name)) > 0),
  brand_name          text,
  agency_name         text,
  client_type         text not null default 'brand' check (client_type in ('brand', 'agency', 'mcn', 'partner', 'internal')),
  owner_id            uuid references public.profiles(user_id),
  data_classification text not null default 'synthetic' check (data_classification in ('synthetic', 'imported_snapshot')),
  source_system       text,
  source_key          text,
  source_as_of        timestamptz,
  imported_at         timestamptz,
  version             integer not null default 1,
  created_by          uuid references public.profiles(user_id),
  created_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles(user_id),
  updated_at          timestamptz not null default now(),
  unique (source_system, source_key)
);

create table public.services (
  code          text primary key check (code ~ '^[A-Z]{2,4}(-[A-Z0-9]{2,8})?$'),
  name          text not null,
  service_group text not null check (service_group in ('venue', 'ecommerce', 'production', 'event', 'academy')),
  data_classification text not null default 'synthetic'
);

-- Client history: creation, imports and every field change, append-only.
create table public.client_events (
  id          bigint generated always as identity primary key,
  client_id   uuid not null references public.clients(id),
  event_type  text not null check (event_type in ('created', 'field_change', 'imported')),
  actor_id    uuid references public.profiles(user_id),
  occurred_at timestamptz not null default now(),
  summary     text not null,
  details     jsonb not null default '{}'::jsonb,
  source      text not null default 'app' check (source in ('app', 'import', 'system', 'seed'))
);
create index client_events_client_idx on public.client_events (client_id, occurred_at desc);

-- ---------------------------------------------------------------------------------------------
-- Projects / opportunities: one record from first conversation to closed job.
-- Commercial stage, delivery state, financial verification and payment state are independent fields.
-- ---------------------------------------------------------------------------------------------
create table public.projects (
  id                     uuid primary key default gen_random_uuid(),
  project_ref            text not null unique default ('NP-' || lpad(nextval('public.project_ref_seq')::text, 4, '0')),
  job_code               text unique check (job_code is null or job_code ~ '^[A-Z0-9][A-Z0-9-]{3,29}$'),
  client_id              uuid not null references public.clients(id),
  title                  text not null check (length(trim(title)) > 0),
  service_group          text check (service_group in ('venue', 'ecommerce', 'production', 'event', 'academy')),
  project_kind           text not null default 'commercial' check (project_kind in ('commercial', 'sponsored', 'internal')),
  commercial_stage       text not null default 'lead' check (commercial_stage in
                           ('lead', 'qualified', 'meeting', 'proposal', 'negotiation', 'contract_sent', 'won', 'lost', 'on_hold')),
  delivery_state         text not null default 'not_started' check (delivery_state in
                           ('not_started', 'planning', 'in_production', 'delivered', 'client_accepted', 'closed', 'cancelled')),
  financial_verification text not null default 'not_submitted' check (financial_verification in
                           ('not_submitted', 'pending_review', 'verified')),
  payment_state          text not null default 'not_due' check (payment_state in
                           ('not_due', 'deposit_requested', 'deposit_received', 'partially_received', 'fully_received', 'overdue')),
  owner_id               uuid not null references public.profiles(user_id),
  account_owner_id       uuid references public.profiles(user_id),
  latest_note            text,
  latest_note_at         timestamptz,
  next_action            text,
  next_action_owner_id   uuid references public.profiles(user_id),
  next_action_due        date,
  next_action_done_when  text,
  brief_status           text not null default 'missing' check (brief_status in ('missing', 'received', 'ready')),
  brief_url              text check (brief_url is null or brief_url ~ '^https?://'),
  promised_delivery_date date,
  estimated_amount       numeric(18, 2) check (estimated_amount is null or estimated_amount >= 0),
  estimate_basis         text check (estimate_basis in ('total', 'monthly', 'range')),
  estimate_low           numeric(18, 2),
  estimate_high          numeric(18, 2),
  currency               text not null default 'VND' check (currency = 'VND'),
  tax_basis              text not null default 'net_of_vat' check (tax_basis = 'net_of_vat'),
  contract_reference     text,
  contract_signed_date   date,
  lost_reason            text,
  data_classification    text not null default 'synthetic' check (data_classification in ('synthetic', 'imported_snapshot')),
  source_system          text,
  source_key             text,
  source_as_of           timestamptz,
  imported_at            timestamptz,
  version                integer not null default 1,
  created_by             uuid references public.profiles(user_id),
  created_at             timestamptz not null default now(),
  updated_by             uuid references public.profiles(user_id),
  updated_at             timestamptz not null default now(),
  unique (source_system, source_key),
  constraint next_action_needs_owner_and_due check (
    next_action is null or (length(trim(next_action)) > 0 and next_action_owner_id is not null and next_action_due is not null)),
  constraint won_needs_contract check (
    commercial_stage <> 'won' or (contract_reference is not null and contract_signed_date is not null)),
  constraint lost_needs_reason check (commercial_stage <> 'lost' or length(trim(coalesce(lost_reason, ''))) > 0),
  constraint estimate_shape check (
    (estimate_basis is null and estimated_amount is null and estimate_low is null and estimate_high is null)
    or (estimate_basis in ('total', 'monthly') and estimated_amount is not null and estimate_low is null and estimate_high is null)
    or (estimate_basis = 'range' and estimate_low is not null and estimate_high is not null and estimate_low <= estimate_high
        and estimated_amount is null)),
  constraint brief_ready_needs_link check (brief_status <> 'ready' or brief_url is not null)
);

-- Immutable business history: notes, stage/delivery/next-action changes, work handoffs, money reviews.
create table public.project_events (
  id                bigint generated always as identity primary key,
  project_id        uuid not null references public.projects(id),
  event_type        text not null check (event_type in (
                      'created', 'note', 'stage_change', 'delivery_change', 'next_action_set', 'field_change',
                      'work_created', 'work_updated', 'document_linked', 'proposal_submitted', 'proposal_withdrawn',
                      'review_approved', 'review_rejected', 'job_code_issued', 'payment_state_changed', 'imported',
                      'acceptance_submitted', 'acceptance_verified', 'acceptance_rejected', 'receipt_recorded')),
  actor_id          uuid references public.profiles(user_id),
  occurred_at       timestamptz not null default now(),
  summary           text not null,
  details           jsonb not null default '{}'::jsonb,
  work_item_id      uuid,
  change_request_id uuid,
  revision_id       uuid,
  request_id        uuid unique,
  source            text not null default 'app' check (source in ('app', 'import', 'system', 'seed'))
);
create index project_events_project_idx on public.project_events (project_id, occurred_at desc);

-- ---------------------------------------------------------------------------------------------
-- Work items: one Account / Design / Studio assignment or recorded session per row.
-- A studio session here is a recorded request/session, not a guaranteed reservation (no resource model).
-- ---------------------------------------------------------------------------------------------
create table public.work_items (
  id                   uuid primary key default gen_random_uuid(),
  work_ref             text not null unique default ('WI-' || lpad(nextval('public.work_ref_seq')::text, 4, '0')),
  project_id           uuid not null references public.projects(id),
  team                 text not null check (team in ('account', 'design', 'studio')),
  title                text not null check (length(trim(title)) > 0),
  assignee_id          uuid references public.profiles(user_id),
  requested_by         uuid references public.profiles(user_id),
  status               text not null default 'todo' check (status in
                         ('todo', 'in_progress', 'in_review', 'changes_requested', 'done', 'blocked', 'cancelled')),
  due_at               timestamptz,
  brief_url            text check (brief_url is null or brief_url ~ '^https?://'),
  output_url           text check (output_url is null or output_url ~ '^https?://'),
  completion_condition text not null check (length(trim(completion_condition)) > 0),
  studio_room          text,
  planned_start        timestamptz,
  planned_end          timestamptz,
  actual_start         timestamptz,
  actual_end           timestamptz,
  session_note         text,
  review_note          text,
  completed_at         timestamptz,
  completed_by         uuid references public.profiles(user_id),
  request_id           uuid unique,
  version              integer not null default 1,
  created_by           uuid references public.profiles(user_id),
  created_at           timestamptz not null default now(),
  updated_by           uuid references public.profiles(user_id),
  updated_at           timestamptz not null default now(),
  constraint planned_interval check (planned_end is null or planned_start is null or planned_end > planned_start),
  constraint actual_interval check (actual_end is null or actual_start is null or actual_end > actual_start),
  constraint studio_fields_only_for_studio check (team = 'studio' or (studio_room is null and planned_start is null
    and planned_end is null and actual_start is null and actual_end is null)),
  constraint design_review_needs_output check (team <> 'design' or status not in ('in_review', 'done') or output_url is not null),
  constraint studio_done_needs_times check (team <> 'studio' or status <> 'done' or (actual_start is not null and actual_end is not null))
);
create index work_items_assignee_idx on public.work_items (assignee_id, status);
create index work_items_project_idx on public.work_items (project_id);

-- Document references: links to existing Drive/Lark files; the database stores the reference, not the file.
create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  doc_ref    text not null unique default ('DOC-' || lpad(nextval('public.document_ref_seq')::text, 4, '0')),
  project_id uuid not null references public.projects(id),
  doc_type   text not null check (doc_type in ('brief', 'quotation', 'internal_cost_sheet', 'contract', 'acceptance_minutes',
                                               'design_output', 'evidence', 'other')),
  title      text not null check (length(trim(title)) > 0),
  url        text not null check (url ~ '^https?://'),
  status     text not null default 'current' check (status in ('current', 'superseded')),
  source     text not null default 'app' check (source in ('app', 'import', 'seed')),
  added_by   uuid references public.profiles(user_id),
  added_at   timestamptz not null default now(),
  request_id uuid unique
);

-- ---------------------------------------------------------------------------------------------
-- Money. Revenue lives on service lines (children of the project; the project row holds no amount, so
-- parent and child cannot be double-counted). Cost lines are economic cost items; estimate/committed/actual
-- is the STAGE of one item, never three additive costs. Every value is a revision; only Finance approval
-- creates an approved revision, and the previous one is kept as superseded.
-- ---------------------------------------------------------------------------------------------
create table public.service_lines (
  id           uuid primary key default gen_random_uuid(),
  line_ref     text not null unique default ('SL-' || lpad(nextval('public.line_ref_seq')::text, 4, '0')),
  project_id   uuid not null references public.projects(id),
  service_code text not null references public.services(code),
  description  text not null check (length(trim(description)) > 0),
  created_by   uuid references public.profiles(user_id),
  created_at   timestamptz not null default now()
);

create table public.cost_lines (
  id              uuid primary key default gen_random_uuid(),
  line_ref        text not null unique default ('CO-' || lpad(nextval('public.line_ref_seq')::text, 4, '0')),
  project_id      uuid not null references public.projects(id),
  service_line_id uuid references public.service_lines(id),
  description     text not null check (length(trim(description)) > 0),
  cost_stage      text not null default 'forecast' check (cost_stage in ('forecast', 'committed', 'actual')),
  created_by      uuid references public.profiles(user_id),
  created_at      timestamptz not null default now()
);

create table public.change_requests (
  id                      uuid primary key default gen_random_uuid(),
  request_ref             text not null unique default ('CR-' || lpad(nextval('public.change_ref_seq')::text, 4, '0')),
  project_id              uuid not null references public.projects(id),
  target_type             text not null check (target_type in ('cost_line', 'service_line', 'new_cost_line', 'new_service_line')),
  cost_line_id            uuid references public.cost_lines(id),
  service_line_id         uuid references public.service_lines(id),
  base_revision_id        uuid,
  previous_amount         numeric(18, 2),
  previous_amount_status  text check (previous_amount_status in ('known', 'unknown')),
  proposed_amount         numeric(18, 2),
  proposed_amount_status  text not null check (proposed_amount_status in ('known', 'unknown')),
  proposed_zero_confirmed boolean not null default false,
  proposed_description    text,
  proposed_cost_stage     text check (proposed_cost_stage in ('forecast', 'committed', 'actual')),
  proposed_service_code   text references public.services(code),
  proposed_service_line_id uuid references public.service_lines(id),
  currency                text not null default 'VND' check (currency = 'VND'),
  tax_basis               text not null default 'net_of_vat' check (tax_basis = 'net_of_vat'),
  reason                  text not null check (length(trim(reason)) >= 5),
  evidence_url            text not null check (evidence_url ~ '^https?://'),
  status                  text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by            uuid not null references public.profiles(user_id),
  requested_at            timestamptz not null default now(),
  reviewed_by             uuid references public.profiles(user_id),
  reviewed_at             timestamptz,
  review_comment          text,
  resulting_revision_id   uuid,
  idempotency_key         uuid not null unique,
  version                 integer not null default 1,
  constraint target_shape check (
    (target_type = 'cost_line' and cost_line_id is not null and service_line_id is null)
    or (target_type = 'service_line' and service_line_id is not null and cost_line_id is null)
    or (target_type = 'new_cost_line' and cost_line_id is null and service_line_id is null
        and length(trim(coalesce(proposed_description, ''))) > 0)
    or (target_type = 'new_service_line' and cost_line_id is null and service_line_id is null
        and proposed_service_code is not null and length(trim(coalesce(proposed_description, ''))) > 0)),
  constraint service_code_only_for_new_service_line check (proposed_service_code is null or target_type = 'new_service_line'),
  constraint service_link_only_for_new_cost_line check (proposed_service_line_id is null or target_type = 'new_cost_line'),
  constraint proposed_amount_shape check ((proposed_amount is null) = (proposed_amount_status = 'unknown')),
  constraint proposed_amount_sign check (proposed_amount is null or proposed_amount >= 0),
  constraint proposed_zero_needs_confirmation check (proposed_amount is distinct from 0 or proposed_zero_confirmed),
  constraint rejection_needs_comment check (status <> 'rejected' or length(trim(coalesce(review_comment, ''))) >= 5),
  constraint reviewed_fields check ((status in ('approved', 'rejected')) = (reviewed_by is not null and reviewed_at is not null))
);
-- One open proposal per money line: a second concurrent proposal must wait for review.
create unique index change_requests_one_pending_cost on public.change_requests (cost_line_id) where status = 'pending';
create unique index change_requests_one_pending_service on public.change_requests (service_line_id) where status = 'pending';

create table public.money_revisions (
  id                uuid primary key default gen_random_uuid(),
  revision_ref      text not null unique default ('REV-' || lpad(nextval('public.revision_ref_seq')::text, 4, '0')),
  line_type         text not null check (line_type in ('revenue', 'cost')),
  service_line_id   uuid references public.service_lines(id),
  cost_line_id      uuid references public.cost_lines(id),
  revision_no       integer not null check (revision_no >= 1),
  amount            numeric(18, 2),
  amount_status     text not null check (amount_status in ('known', 'unknown')),
  zero_confirmed    boolean not null default false,
  currency          text not null default 'VND' check (currency = 'VND'),
  tax_basis         text not null default 'net_of_vat' check (tax_basis = 'net_of_vat'),
  status            text not null check (status in ('approved', 'superseded')),
  effective_date    date not null,
  approved_by       uuid references public.profiles(user_id),
  approved_at       timestamptz not null default now(),
  change_request_id uuid references public.change_requests(id),
  source            text not null default 'app' check (source in ('app', 'import', 'seed')),
  source_ref        text,
  evidence_url      text,
  constraint line_shape check ((line_type = 'revenue') = (service_line_id is not null)
                               and (line_type = 'cost') = (cost_line_id is not null)),
  constraint amount_shape check ((amount is null) = (amount_status = 'unknown')),
  constraint amount_sign check (amount is null or amount >= 0),
  constraint zero_needs_confirmation check (amount is distinct from 0 or zero_confirmed),
  unique (service_line_id, revision_no),
  unique (cost_line_id, revision_no)
);
create unique index money_revisions_one_approved_service on public.money_revisions (service_line_id) where status = 'approved';
create unique index money_revisions_one_approved_cost on public.money_revisions (cost_line_id) where status = 'approved';

alter table public.change_requests
  add constraint change_requests_base_revision_fk foreign key (base_revision_id) references public.money_revisions(id),
  add constraint change_requests_resulting_revision_fk foreign key (resulting_revision_id) references public.money_revisions(id);

-- Acceptance and cash are separate from contract value: Account submits an acceptance milestone with evidence,
-- Finance verifies it; Finance records each dated receipt and allocates it to projects/milestones. A deposit is a
-- receipt type, never extra revenue. Receipts carry their own tax basis, so they are compared with net-of-VAT
-- acceptance only when the bases match.
create table public.acceptance_milestones (
  id              uuid primary key default gen_random_uuid(),
  milestone_ref   text not null unique default ('AC-' || lpad(nextval('public.milestone_ref_seq')::text, 4, '0')),
  project_id      uuid not null references public.projects(id),
  description     text not null check (length(trim(description)) > 0),
  amount          numeric(18, 2) not null check (amount >= 0),
  currency        text not null default 'VND' check (currency = 'VND'),
  tax_basis       text not null default 'net_of_vat' check (tax_basis = 'net_of_vat'),
  effective_date  date not null,
  evidence_url    text not null check (evidence_url ~ '^https?://'),
  status          text not null default 'submitted' check (status in ('submitted', 'verified', 'rejected')),
  submitted_by    uuid not null references public.profiles(user_id),
  submitted_at    timestamptz not null default now(),
  verified_by     uuid references public.profiles(user_id),
  verified_at     timestamptz,
  review_comment  text,
  idempotency_key uuid not null unique,
  version         integer not null default 1,
  constraint acceptance_rejection_needs_comment check (status <> 'rejected' or length(trim(coalesce(review_comment, ''))) >= 5),
  constraint acceptance_review_fields check ((status in ('verified', 'rejected')) = (verified_by is not null and verified_at is not null))
);
create index acceptance_milestones_project_idx on public.acceptance_milestones (project_id);

create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  receipt_ref     text not null unique default ('RC-' || lpad(nextval('public.receipt_ref_seq')::text, 4, '0')),
  receipt_date    date not null,
  receipt_type    text not null check (receipt_type in ('deposit', 'payment')),
  amount          numeric(18, 2) not null check (amount > 0),
  currency        text not null default 'VND' check (currency = 'VND'),
  tax_basis       text not null check (tax_basis in ('net_of_vat', 'gross_incl_vat')),
  reference       text not null check (length(trim(reference)) >= 3),
  note            text,
  recorded_by     uuid not null references public.profiles(user_id),
  recorded_at     timestamptz not null default now(),
  idempotency_key uuid not null unique
);

create table public.receipt_allocations (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references public.receipts(id),
  project_id   uuid not null references public.projects(id),
  milestone_id uuid references public.acceptance_milestones(id),
  amount       numeric(18, 2) not null check (amount > 0)
);
create unique index receipt_allocations_once on public.receipt_allocations
  (receipt_id, project_id, coalesce(milestone_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index receipt_allocations_project_idx on public.receipt_allocations (project_id);

-- Each reference sequence belongs to its table, so dropping the schema (a database reset) drops it too.
alter sequence public.client_ref_seq owned by public.clients.client_ref;
alter sequence public.project_ref_seq owned by public.projects.project_ref;
alter sequence public.work_ref_seq owned by public.work_items.work_ref;
alter sequence public.line_ref_seq owned by public.service_lines.line_ref;
alter sequence public.change_ref_seq owned by public.change_requests.request_ref;
alter sequence public.revision_ref_seq owned by public.money_revisions.revision_ref;
alter sequence public.document_ref_seq owned by public.documents.doc_ref;
alter sequence public.milestone_ref_seq owned by public.acceptance_milestones.milestone_ref;
alter sequence public.receipt_ref_seq owned by public.receipts.receipt_ref;

-- ---------------------------------------------------------------------------------------------
-- Triggers: optimistic version check + field ownership (BEFORE), audit history (AFTER)
-- ---------------------------------------------------------------------------------------------
create or replace function public.require_expected_version(p_current integer) returns void
language plpgsql stable set search_path = '' as $$
declare
  v_expected integer := public.expected_version();
begin
  if v_expected is null then
    raise exception using errcode = 'PT428', message = 'expected_version_required',
      detail = 'Send the version you edited (app.expected_version).';
  end if;
  if v_expected <> p_current then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = json_build_object('expected_version', v_expected, 'current_version', p_current)::text;
  end if;
end $$;

create or replace function public.clients_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not public.in_trusted_write() and not public.has_any_role(array['bd', 'account', 'admin']) then
      raise exception using errcode = 'PT403', message = 'forbidden', detail = 'Only BD, Account or Admin can add clients.';
    end if;
    new.version := 1;
    new.created_by := coalesce(new.created_by, app.uid());
    new.created_at := public.trusted_time(new.created_at);
    new.updated_by := new.created_by;
    new.updated_at := new.created_at;
    return new;
  end if;
  if not public.in_trusted_write() then
    perform public.require_expected_version(old.version);
    if not public.has_any_role(array['bd', 'account', 'admin']) then
      raise exception using errcode = 'PT403', message = 'forbidden', detail = 'Only BD, Account or Admin can edit clients.';
    end if;
    if (new.source_system, new.source_key, new.source_as_of, new.imported_at, new.data_classification, new.client_ref)
       is distinct from (old.source_system, old.source_key, old.source_as_of, old.imported_at, old.data_classification, old.client_ref) then
      raise exception using errcode = 'PT403', message = 'source_owned_field', detail = 'Import provenance cannot be edited.';
    end if;
  end if;
  new.version := old.version + 1;
  new.updated_by := app.uid();
  new.updated_at := public.event_time();
  return new;
end $$;

create trigger clients_before_write before insert or update on public.clients
  for each row execute function public.clients_before_write();

create or replace function public.clients_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_source text := case when public.in_trusted_write() and current_setting('kumquat.write_source', true) in ('import', 'seed')
                        then current_setting('kumquat.write_source', true) else 'app' end;
begin
  if tg_op = 'INSERT' then
    insert into public.client_events (client_id, event_type, actor_id, occurred_at, summary, details, source)
    values (new.id, case when v_source = 'import' then 'imported' else 'created' end, app.uid(), new.created_at,
            case when v_source = 'import'
                 then 'Imported client from snapshot ' || coalesce(new.source_system, '') || ' (' || coalesce(new.source_key, '') || '): '
                 else 'Created client ' || new.client_ref || ': ' end || new.display_name,
            jsonb_build_object('source_system', new.source_system, 'source_key', new.source_key), v_source);
    return null;
  end if;
  foreach v_field in array array['display_name', 'brand_name', 'agency_name', 'client_type', 'owner_id'] loop
    if to_jsonb(old) -> v_field is distinct from to_jsonb(new) -> v_field then
      v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('from', to_jsonb(old) -> v_field, 'to', to_jsonb(new) -> v_field));
    end if;
  end loop;
  if v_changes <> '{}'::jsonb then
    insert into public.client_events (client_id, event_type, actor_id, occurred_at, summary, details, source)
    values (new.id, 'field_change', app.uid(), public.event_time(), 'Updated client ' || new.client_ref,
            jsonb_build_object('changes', v_changes, 'version', new.version), v_source);
  end if;
  return null;
end $$;

create trigger clients_after_write after insert or update on public.clients
  for each row execute function public.clients_after_write();

create or replace function public.projects_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_routine_editor boolean := public.has_any_role(array['bd', 'account', 'admin']);
begin
  if not public.in_trusted_write() then
    perform public.require_expected_version(old.version);
    -- Finance-owned fields and provenance change only through their controlled functions.
    if (new.job_code, new.financial_verification, new.payment_state)
       is distinct from (old.job_code, old.financial_verification, old.payment_state) then
      raise exception using errcode = 'PT403', message = 'finance_owned_field',
        detail = 'Job code, financial verification and payment state are changed by Finance through review functions.';
    end if;
    if (new.project_ref, new.source_system, new.source_key, new.source_as_of, new.imported_at, new.data_classification,
        new.client_id, new.created_by, new.created_at)
       is distinct from (old.project_ref, old.source_system, old.source_key, old.source_as_of, old.imported_at,
                         old.data_classification, old.client_id, old.created_by, old.created_at) then
      raise exception using errcode = 'PT403', message = 'immutable_field', detail = 'Identity and provenance fields cannot be edited.';
    end if;
    if not v_routine_editor then
      -- Anyone else may only report on the next action they own (and leave a note).
      if old.next_action_owner_id is distinct from app.uid() then
        raise exception using errcode = 'PT403', message = 'forbidden', detail = 'Only BD, Account, Admin or the next-action owner can update this project.';
      end if;
      if (new.title, new.service_group, new.project_kind, new.commercial_stage, new.delivery_state, new.owner_id,
          new.account_owner_id, new.brief_status, new.brief_url, new.promised_delivery_date, new.estimated_amount,
          new.estimate_basis, new.estimate_low, new.estimate_high, new.contract_reference, new.contract_signed_date, new.lost_reason)
         is distinct from
         (old.title, old.service_group, old.project_kind, old.commercial_stage, old.delivery_state, old.owner_id,
          old.account_owner_id, old.brief_status, old.brief_url, old.promised_delivery_date, old.estimated_amount,
          old.estimate_basis, old.estimate_low, old.estimate_high, old.contract_reference, old.contract_signed_date, old.lost_reason) then
        raise exception using errcode = 'PT403', message = 'forbidden_field',
          detail = 'As next-action owner you can update the next action and add a note; other fields belong to BD/Account.';
      end if;
    end if;
  end if;
  if new.latest_note is distinct from old.latest_note then
    new.latest_note_at := public.event_time();
  end if;
  new.version := old.version + 1;
  new.updated_by := app.uid();
  new.updated_at := public.event_time();
  return new;
end $$;

create trigger projects_before_update before update on public.projects
  for each row execute function public.projects_before_update();

create or replace function public.projects_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_old jsonb;
  v_new jsonb;
  v_source text := case when public.in_trusted_write() and current_setting('kumquat.write_source', true) in ('import', 'seed')
                        then current_setting('kumquat.write_source', true) else 'app' end;
begin
  if tg_op = 'INSERT' then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source)
    values (new.id, case when v_source = 'import' then 'imported' else 'created' end, app.uid(), new.created_at,
            case when v_source = 'import' then 'Imported from snapshot ' || coalesce(new.source_system, '') || ' (' || coalesce(new.source_key, '') || '): '
                 else 'Created project ' || new.project_ref || ': ' end || new.title,
            jsonb_build_object('commercial_stage', new.commercial_stage, 'delivery_state', new.delivery_state,
                               'source_system', new.source_system, 'source_key', new.source_key, 'source_as_of', new.source_as_of),
            v_source);
    return null;
  end if;
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach v_field in array array['title', 'service_group', 'project_kind', 'owner_id', 'account_owner_id', 'brief_status',
                                 'brief_url', 'promised_delivery_date', 'estimated_amount', 'estimate_basis', 'estimate_low',
                                 'estimate_high', 'contract_reference', 'contract_signed_date', 'lost_reason'] loop
    if v_old -> v_field is distinct from v_new -> v_field then
      v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('from', v_old -> v_field, 'to', v_new -> v_field));
    end if;
  end loop;
  if new.commercial_stage is distinct from old.commercial_stage then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source)
    values (new.id, 'stage_change', app.uid(), public.event_time(), 'Commercial stage: ' || old.commercial_stage || ' → ' || new.commercial_stage,
            jsonb_build_object('from', old.commercial_stage, 'to', new.commercial_stage, 'version', new.version), v_source);
  end if;
  if new.delivery_state is distinct from old.delivery_state then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source)
    values (new.id, 'delivery_change', app.uid(), public.event_time(), 'Delivery state: ' || old.delivery_state || ' → ' || new.delivery_state,
            jsonb_build_object('from', old.delivery_state, 'to', new.delivery_state, 'version', new.version), v_source);
  end if;
  if (new.next_action, new.next_action_owner_id, new.next_action_due, new.next_action_done_when)
     is distinct from (old.next_action, old.next_action_owner_id, old.next_action_due, old.next_action_done_when) then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source)
    values (new.id, 'next_action_set', app.uid(), public.event_time(), 'Next action: ' || coalesce(new.next_action, '(none)'),
            jsonb_build_object('from', jsonb_build_object('action', old.next_action, 'owner_id', old.next_action_owner_id,
                                                          'due', old.next_action_due, 'done_when', old.next_action_done_when),
                               'to', jsonb_build_object('action', new.next_action, 'owner_id', new.next_action_owner_id,
                                                        'due', new.next_action_due, 'done_when', new.next_action_done_when),
                               'version', new.version), v_source);
  end if;
  if new.latest_note is distinct from old.latest_note and new.latest_note is not null then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source)
    values (new.id, 'note', app.uid(), public.event_time(), new.latest_note, jsonb_build_object('version', new.version), v_source);
  end if;
  if v_changes <> '{}'::jsonb then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source)
    values (new.id, 'field_change', app.uid(), public.event_time(), 'Project details updated',
            jsonb_build_object('changes', v_changes, 'version', new.version), v_source);
  end if;
  return null;
end $$;

create trigger projects_after_write after insert or update on public.projects
  for each row execute function public.projects_after_write();

create or replace function public.work_items_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_routine_editor boolean := public.has_any_role(array['bd', 'account', 'admin']);
  v_is_assignee boolean;
begin
  if tg_op = 'INSERT' then
    if not public.in_trusted_write() and not v_routine_editor then
      raise exception using errcode = 'PT403', message = 'forbidden', detail = 'Only BD, Account or Admin can create and assign work.';
    end if;
    new.version := 1;
    new.created_by := coalesce(new.created_by, app.uid());
    new.requested_by := coalesce(new.requested_by, app.uid());
    new.created_at := public.trusted_time(new.created_at);
    new.updated_by := new.created_by;
    new.updated_at := new.created_at;
    if new.status = 'done' then
      new.completed_at := public.trusted_time(new.completed_at);
      new.completed_by := coalesce(new.completed_by, app.uid());
    end if;
    return new;
  end if;

  if not public.in_trusted_write() then
    perform public.require_expected_version(old.version);
    v_is_assignee := old.assignee_id is not distinct from app.uid();
    if (new.project_id, new.team, new.work_ref, new.created_by, new.created_at)
       is distinct from (old.project_id, old.team, old.work_ref, old.created_by, old.created_at) then
      raise exception using errcode = 'PT403', message = 'immutable_field', detail = 'Project, team and reference cannot change.';
    end if;
    if not v_routine_editor then
      if not v_is_assignee then
        raise exception using errcode = 'PT403', message = 'forbidden', detail = 'Only the assignee or BD/Account/Admin can update this work item.';
      end if;
      if (new.title, new.assignee_id, new.requested_by, new.due_at, new.brief_url, new.completion_condition, new.studio_room,
          new.planned_start, new.planned_end, new.review_note)
         is distinct from
         (old.title, old.assignee_id, old.requested_by, old.due_at, old.brief_url, old.completion_condition, old.studio_room,
          old.planned_start, old.planned_end, old.review_note) then
        raise exception using errcode = 'PT403', message = 'forbidden_field',
          detail = 'As assignee you can update status, output link, actual times and the session note.';
      end if;
      if new.status is distinct from old.status and not (
           (old.status in ('todo', 'blocked', 'changes_requested') and new.status = 'in_progress')
        or (old.status = 'in_progress' and new.status in ('blocked', 'in_review'))
        or (old.status = 'in_progress' and new.status = 'done' and old.team in ('studio', 'account'))
        or (old.status = 'in_review' and new.status = 'in_progress')) then
        raise exception using errcode = 'PT403', message = 'transition_not_allowed',
          detail = format('An assignee cannot move a %s item from %s to %s.', old.team, old.status, new.status);
      end if;
    end if;
  end if;

  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := public.event_time();
    new.completed_by := app.uid();
  elsif new.status <> 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  new.version := old.version + 1;
  new.updated_by := app.uid();
  new.updated_at := public.event_time();
  return new;
end $$;

create trigger work_items_before_write before insert or update on public.work_items
  for each row execute function public.work_items_before_write();

create or replace function public.work_items_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_source text := case when public.in_trusted_write() and current_setting('kumquat.write_source', true) in ('import', 'seed')
                        then current_setting('kumquat.write_source', true) else 'app' end;
begin
  if tg_op = 'INSERT' then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, work_item_id, source)
    values (new.project_id, 'work_created', app.uid(), new.created_at,
            'Assigned ' || new.work_ref || ' (' || new.team || '): ' || new.title,
            jsonb_build_object('status', new.status, 'assignee_id', new.assignee_id, 'due_at', new.due_at), new.id, v_source);
    return null;
  end if;
  if (new.status, new.assignee_id, new.due_at, new.output_url, new.actual_start, new.actual_end, new.review_note)
     is distinct from (old.status, old.assignee_id, old.due_at, old.output_url, old.actual_start, old.actual_end, old.review_note) then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, work_item_id, source)
    values (new.project_id, 'work_updated', app.uid(), public.event_time(),
            new.work_ref || ': ' || case when new.status is distinct from old.status then old.status || ' → ' || new.status else 'updated' end,
            jsonb_build_object(
              'status', jsonb_build_object('from', old.status, 'to', new.status),
              'assignee_id', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id),
              'due_at', jsonb_build_object('from', old.due_at, 'to', new.due_at),
              'output_url', jsonb_build_object('from', old.output_url, 'to', new.output_url),
              'review_note', new.review_note, 'version', new.version), new.id, v_source);
  end if;
  return null;
end $$;

create trigger work_items_after_write after insert or update on public.work_items
  for each row execute function public.work_items_after_write();

create or replace function public.documents_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.in_trusted_write() and not public.has_any_role(array['bd', 'account', 'admin']) then
    raise exception using errcode = 'PT403', message = 'forbidden', detail = 'Only BD, Account or Admin can link project documents.';
  end if;
  new.added_by := coalesce(new.added_by, app.uid());
  new.added_at := public.trusted_time(new.added_at);
  if not public.in_trusted_write() then
    new.source := 'app';
  end if;
  return new;
end $$;

create trigger documents_before_insert before insert on public.documents
  for each row execute function public.documents_before_insert();

create or replace function public.documents_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source)
  values (new.project_id, 'document_linked', coalesce(new.added_by, app.uid()), new.added_at,
          'Linked document ' || new.doc_ref || ' (' || new.doc_type || '): ' || new.title,
          jsonb_build_object('document_id', new.id, 'url', new.url), new.source);
  return null;
end $$;

create trigger documents_after_insert after insert on public.documents
  for each row execute function public.documents_after_insert();

-- ---------------------------------------------------------------------------------------------
-- Row-level security and grants. Nothing is readable without a staff role.
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.role_memberships enable row level security;
alter table public.clients enable row level security;
alter table public.client_events enable row level security;
alter table public.services enable row level security;
alter table public.projects enable row level security;
alter table public.project_events enable row level security;
alter table public.work_items enable row level security;
alter table public.documents enable row level security;
alter table public.service_lines enable row level security;
alter table public.cost_lines enable row level security;
alter table public.change_requests enable row level security;
alter table public.money_revisions enable row level security;
alter table public.acceptance_milestones enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_allocations enable row level security;

revoke all on all tables in schema public from kk_app;
revoke all on all sequences in schema public from kk_app;

grant select on public.profiles, public.role_memberships, public.clients, public.client_events, public.services, public.projects, public.project_events,
  public.work_items, public.documents, public.service_lines, public.cost_lines, public.change_requests, public.money_revisions,
  public.acceptance_milestones, public.receipts, public.receipt_allocations
  to kk_app;
grant insert (id, display_name, brand_name, agency_name, client_type, owner_id) on public.clients to kk_app;
grant update (display_name, brand_name, agency_name, client_type, owner_id) on public.clients to kk_app;
grant update (title, service_group, project_kind, commercial_stage, delivery_state, owner_id, account_owner_id, latest_note,
  next_action, next_action_owner_id, next_action_due, next_action_done_when, brief_status, brief_url, promised_delivery_date,
  estimated_amount, estimate_basis, estimate_low, estimate_high, contract_reference, contract_signed_date, lost_reason)
  on public.projects to kk_app;
grant insert (id, project_id, team, title, assignee_id, status, due_at, brief_url, output_url, completion_condition, studio_room,
  planned_start, planned_end, request_id) on public.work_items to kk_app;
grant update (title, assignee_id, status, due_at, brief_url, output_url, completion_condition, studio_room, planned_start,
  planned_end, actual_start, actual_end, session_note, review_note) on public.work_items to kk_app;
grant insert (id, project_id, doc_type, title, url, request_id) on public.documents to kk_app;
grant insert (project_id, event_type, summary, details, request_id) on public.project_events to kk_app;
grant usage on all sequences in schema public to kk_app;

create policy staff_read on public.profiles for select to kk_app using (public.is_staff());
create policy staff_read on public.role_memberships for select to kk_app using (public.is_staff());
create policy staff_read on public.clients for select to kk_app using (public.is_staff());
create policy routine_insert on public.clients for insert to kk_app with check (public.has_any_role(array['bd', 'account', 'admin']));
create policy routine_update on public.clients for update to kk_app
  using (public.has_any_role(array['bd', 'account', 'admin'])) with check (public.has_any_role(array['bd', 'account', 'admin']));
create policy staff_read on public.client_events for select to kk_app using (public.is_staff());
create policy staff_read on public.services for select to kk_app using (public.is_staff());
create policy staff_read on public.projects for select to kk_app using (public.is_staff());
create policy routine_or_action_owner_update on public.projects for update to kk_app
  using (public.has_any_role(array['bd', 'account', 'admin']) or next_action_owner_id = app.uid())
  with check (public.is_staff());
create policy staff_read on public.project_events for select to kk_app using (public.is_staff());
create policy staff_note_insert on public.project_events for insert to kk_app
  with check (public.is_staff() and event_type = 'note');
create policy staff_read on public.work_items for select to kk_app using (public.is_staff());
create policy routine_insert on public.work_items for insert to kk_app with check (public.has_any_role(array['bd', 'account', 'admin']));
create policy routine_or_assignee_update on public.work_items for update to kk_app
  using (public.has_any_role(array['bd', 'account', 'admin']) or assignee_id = app.uid())
  with check (public.is_staff());
create policy staff_read on public.documents for select to kk_app using (public.is_staff());
create policy routine_insert on public.documents for insert to kk_app with check (public.has_any_role(array['bd', 'account', 'admin']));
create policy staff_read on public.service_lines for select to kk_app using (public.is_staff());
create policy staff_read on public.cost_lines for select to kk_app using (public.is_staff());
create policy staff_read on public.change_requests for select to kk_app using (public.is_staff());
create policy staff_read on public.money_revisions for select to kk_app using (public.is_staff());
create policy staff_read on public.acceptance_milestones for select to kk_app using (public.is_staff());
create policy staff_read on public.receipts for select to kk_app using (public.is_staff());
create policy staff_read on public.receipt_allocations for select to kk_app using (public.is_staff());

-- A note inserted by the app is attributed to the caller and gets app provenance.
create or replace function public.project_events_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.in_trusted_write() then
    new.actor_id := app.uid();
    new.source := 'app';
    new.occurred_at := now();
  end if;
  return new;
end $$;

create trigger project_events_before_insert before insert on public.project_events
  for each row execute function public.project_events_before_insert();

-- Events are append-only for every client role.
create or replace function public.reject_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'PT403', message = 'append_only', detail = tg_table_name || ' rows cannot be changed or deleted.';
end $$;

create trigger project_events_append_only before update or delete on public.project_events
  for each row execute function public.reject_mutation();
create trigger money_revisions_no_delete before delete on public.money_revisions
  for each row execute function public.reject_mutation();
create trigger client_events_append_only before update or delete on public.client_events
  for each row execute function public.reject_mutation();
create trigger receipts_append_only before update or delete on public.receipts
  for each row execute function public.reject_mutation();
create trigger receipt_allocations_append_only before update or delete on public.receipt_allocations
  for each row execute function public.reject_mutation();
create trigger acceptance_milestones_no_delete before delete on public.acceptance_milestones
  for each row execute function public.reject_mutation();

revoke execute on all functions in schema public from public;
revoke execute on function public.trusted_time(timestamptz), public.event_time() from public, kk_app;
grant execute on function public.has_role(text), public.has_any_role(text[]), public.is_staff(), public.my_roles(),
  public.business_today(), public.fmt_vnd(numeric), public.expected_version(), public.in_trusted_write(),
  public.require_expected_version(integer)
  to kk_app;
