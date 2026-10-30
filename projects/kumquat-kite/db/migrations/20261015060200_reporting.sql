-- Kumquat Kite lightweight POC — governed reporting views for Anfra.
-- The app role kk_app has no access to schema `reporting`. Its views are owned by the migration role and read the
-- operational tables directly; the dedicated `anfra_reader` login can SELECT these views and nothing else, in
-- read-only transactions. Its LOGIN and password are set outside migrations by scripts/migrate.mjs, from the
-- environment (ANFRA_DB_PASSWORD), so no secret is ever stored in a migration.
--
-- Grain rules (they are what stops double counting):
--   * money_facts holds one row per atomic money record per basis. Revenue exists only on service lines; the
--     project row carries no amount, so a parent and its children can never both be summed.
--   * Work items and documents are separate views with no amounts. No financial view joins them.
--   * Every financial metric chooses exactly one basis: approved (committed now), scenario (approved with each
--     pending proposal substituted), version (each committed version in history) or recorded (acceptance, cash).

revoke all on schema reporting from public;

create or replace view reporting.clients as
select c.id, c.client_ref, c.display_name, c.brand_name, c.client_type, c.data_classification, c.source_system,
       c.source_key, c.created_at, c.updated_at
from public.clients c;

create or replace view reporting.services as
select s.code, s.name, s.service_group from public.services s;

create or replace view reporting.people as
select p.user_id, p.display_name, p.title,
       (select string_agg(m.role, ',' order by m.role) from public.role_memberships m where m.user_id = p.user_id) as roles
from public.profiles p;

-- Every committed version of every project's money: version k holds, for each line, the latest revision approved at
-- or before the k-th commit time of that project. It lets the same metrics explain an earlier result.
create or replace view reporting.money_versions as
with revs as (
  select r.*, coalesce(s.project_id, c.project_id) as project_id, coalesce(r.service_line_id, r.cost_line_id) as line_id,
         coalesce(s.line_ref, c.line_ref) as line_ref, coalesce(s.description, c.description) as description,
         coalesce(s.service_code, cs.service_code) as service_code, c.cost_stage
  from public.money_revisions r
  left join public.service_lines s on s.id = r.service_line_id
  left join public.cost_lines c on c.id = r.cost_line_id
  left join public.service_lines cs on cs.id = c.service_line_id
), commits as (
  select r.project_id, r.approved_at,
         string_agg(distinct cr.request_ref, ', ') as request_refs,
         string_agg(distinct coalesce(pr.display_name, case when r.source = 'import' then 'imported from source' else 'initial load' end), ', ') as committed_by
  from revs r
  left join public.change_requests cr on cr.id = r.change_request_id
  left join public.profiles pr on pr.user_id = r.approved_by
  group by r.project_id, r.approved_at
), versions as (
  select c.*, row_number() over (partition by c.project_id order by c.approved_at) as version_no,
         lead(c.approved_at) over (partition by c.project_id order by c.approved_at) as version_until
  from commits c
)
select v.project_id, v.version_no, v.approved_at as version_from, v.version_until,
       'v' || v.version_no || ' · ' || coalesce('after ' || v.request_refs, 'initial values') || ' · ' || v.committed_by as version_label,
       l.*
from versions v
cross join lateral (
  select distinct on (r.line_id) r.line_id, r.line_ref, r.line_type, r.description, r.service_code, r.cost_stage,
         r.id as revision_id, r.revision_ref, r.revision_no, r.amount, r.amount_status, r.zero_confirmed, r.currency,
         r.tax_basis, r.effective_date, r.approved_at, r.change_request_id, r.source
  from revs r
  where r.project_id = v.project_id and r.approved_at <= v.approved_at
  order by r.line_id, r.revision_no desc
) l;

create or replace view reporting.money_facts as
with approved as (
  select r.id as revision_id, r.revision_ref, r.revision_no, r.line_type,
         coalesce(r.service_line_id, r.cost_line_id) as line_id, coalesce(s.line_ref, c.line_ref) as line_ref,
         coalesce(s.project_id, c.project_id) as project_id, coalesce(s.description, c.description) as description,
         coalesce(s.service_code, cs.service_code) as service_code, c.cost_stage, r.amount, r.amount_status, r.zero_confirmed,
         r.currency, r.tax_basis, r.effective_date, r.approved_at, r.change_request_id, r.source
  from public.money_revisions r
  left join public.service_lines s on s.id = r.service_line_id
  left join public.cost_lines c on c.id = r.cost_line_id
  left join public.service_lines cs on cs.id = c.service_line_id
  where r.status = 'approved'
), pending as (
  select * from public.change_requests where status = 'pending'
), facts as (
  select 'approved:' || a.line_id as fact_key, 'approved'::text as basis, a.line_type as fact_kind, a.line_id, a.line_ref,
         a.project_id, a.service_code, a.description, a.cost_stage, null::text as receipt_type, a.amount,
         (a.amount_status = 'known') as amount_known, a.zero_confirmed, a.currency, a.tax_basis, a.revision_id, a.revision_ref,
         a.revision_no, null::bigint as version_no, null::text as version_label, null::timestamptz as version_from,
         null::timestamptz as version_until, a.effective_date, a.approved_at as committed_at, a.change_request_id,
         null::uuid as pending_request_id, null::text as pending_request_ref,
         case when a.source = 'import' then 'imported' else 'approved' end as value_state, 'approved'::text as status, a.source
  from approved a
  union all
  select 'scenario:' || a.line_id, 'scenario', a.line_type, a.line_id, a.line_ref, a.project_id, a.service_code, a.description,
         coalesce(p.proposed_cost_stage, a.cost_stage), null,
         case when p.id is not null then p.proposed_amount else a.amount end,
         case when p.id is not null then p.proposed_amount_status = 'known' else a.amount_status = 'known' end,
         case when p.id is not null then p.proposed_zero_confirmed else a.zero_confirmed end,
         a.currency, a.tax_basis, a.revision_id, a.revision_ref, a.revision_no, null, null, null, null, a.effective_date,
         coalesce(p.requested_at, a.approved_at), a.change_request_id, p.id, p.request_ref,
         case when p.id is not null then 'proposed' when a.source = 'import' then 'imported' else 'approved' end,
         case when p.id is not null then 'pending' else 'approved' end, a.source
  from approved a
  left join pending p on (a.line_type = 'cost' and p.cost_line_id = a.line_id) or (a.line_type = 'revenue' and p.service_line_id = a.line_id)
  union all
  select 'scenario:new:' || p.id, 'scenario', case when p.target_type = 'new_service_line' then 'revenue' else 'cost' end,
         null, p.request_ref, p.project_id,
         case when p.target_type = 'new_service_line' then p.proposed_service_code else ps.service_code end,
         p.proposed_description, case when p.target_type = 'new_cost_line' then coalesce(p.proposed_cost_stage, 'forecast') end, null,
         p.proposed_amount, p.proposed_amount_status = 'known', p.proposed_zero_confirmed, p.currency, p.tax_basis,
         null, null, null, null, null, null, null, (p.requested_at at time zone 'Asia/Ho_Chi_Minh')::date, p.requested_at,
         null, p.id, p.request_ref, 'proposed', 'pending', 'app'
  from pending p left join public.service_lines ps on ps.id = p.proposed_service_line_id
  where p.target_type in ('new_cost_line', 'new_service_line')
  union all
  select 'version:' || v.project_id || ':' || v.version_no || ':' || v.line_id, 'version', v.line_type, v.line_id, v.line_ref,
         v.project_id, v.service_code, v.description, v.cost_stage, null, v.amount, v.amount_status = 'known', v.zero_confirmed,
         v.currency, v.tax_basis, v.revision_id, v.revision_ref, v.revision_no, v.version_no, v.version_label, v.version_from,
         v.version_until, v.effective_date, v.approved_at, v.change_request_id, null, null,
         case when v.source = 'import' then 'imported' else 'approved' end,
         case when v.version_until is null then 'current' else 'superseded' end, v.source
  from reporting.money_versions v
  union all
  select 'acceptance:' || m.id, 'recorded', 'acceptance', m.id, m.milestone_ref, m.project_id, null, m.description, null, null,
         m.amount, true, m.amount = 0, m.currency, m.tax_basis, null, null, null, null, null, null, null, m.effective_date,
         coalesce(m.verified_at, m.submitted_at), null, null, null,
         case m.status when 'verified' then 'verified' when 'rejected' then 'rejected' else 'submitted' end, m.status, 'app'
  from public.acceptance_milestones m
  union all
  select 'receipt:' || a.id, 'recorded', 'receipt', a.id, r.receipt_ref, a.project_id, null,
         coalesce(r.note, case r.receipt_type when 'deposit' then 'Deposit' else 'Payment' end) || ' · ' || r.reference, null,
         r.receipt_type, a.amount, true, false, r.currency, r.tax_basis, null, null, null, null, null, null, null, r.receipt_date,
         r.recorded_at, null, null, null, 'recorded', 'recorded', 'app'
  from public.receipt_allocations a join public.receipts r on r.id = a.receipt_id
)
-- inputs_complete: within one project and basis (and version), at least one revenue and one cost line, and no
-- unknown amount among them. Only complete inputs feed matching revenue, complete cost, gross profit and margin.
select f.*,
       case when f.fact_kind in ('revenue', 'cost') then
         count(*) filter (where f.fact_kind = 'revenue') over w > 0
         and count(*) filter (where f.fact_kind = 'cost') over w > 0
         and count(*) filter (where f.fact_kind in ('revenue', 'cost') and not f.amount_known) over w = 0
       end as inputs_complete
from facts f
window w as (partition by f.project_id, f.basis, f.version_no);

-- public.project_readiness is a security-invoker view, so the app reads it under each caller's row-level security,
-- and PostgreSQL checks the caller's own grants on its tables even when another view refers to it. The reporting
-- views count a project's open checks through this definer function, so anfra_reader needs no table in public.
create or replace function reporting.open_readiness_checks(p_project_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.project_readiness r
  where r.project_id = p_project_id and r.status in ('missing', 'blocked', 'unknown')
$$;
revoke all on function reporting.open_readiness_checks(uuid) from public;

create or replace view reporting.projects as
with line_state as (
  select project_id,
         count(*) filter (where basis = 'approved' and fact_kind = 'revenue') as approved_revenue_lines,
         count(*) filter (where basis = 'approved' and fact_kind = 'cost') as approved_cost_lines,
         count(*) filter (where basis = 'approved' and fact_kind in ('revenue', 'cost') and not amount_known) as approved_unknown_lines,
         count(*) filter (where basis = 'scenario' and fact_kind in ('revenue', 'cost') and not amount_known) as scenario_unknown_lines,
         count(*) filter (where basis = 'scenario' and value_state = 'proposed') as proposed_lines,
         bool_or(inputs_complete) filter (where basis = 'approved') as approved_inputs_complete,
         bool_or(inputs_complete) filter (where basis = 'scenario') as scenario_inputs_complete,
         max(committed_at) filter (where basis in ('approved', 'recorded')) as last_committed_at
  from reporting.money_facts group by project_id
)
select p.id, p.project_ref, p.job_code, p.client_id, p.title, p.service_group, p.project_kind, p.commercial_stage,
       p.delivery_state, p.financial_verification, p.payment_state,
       p.owner_id, ow.display_name as owner_name, p.account_owner_id, ac.display_name as account_owner_name,
       p.next_action, p.next_action_owner_id, p.next_action_due,
       (p.next_action is not null and p.next_action_due < public.business_today()) as next_action_overdue,
       p.brief_status, p.promised_delivery_date, p.contract_reference, p.contract_signed_date,
       p.estimated_amount, p.estimate_basis, p.estimate_low, p.estimate_high, p.currency, p.tax_basis,
       p.data_classification, p.source_system, p.source_key, p.source_as_of, p.imported_at,
       p.version, p.created_at, p.updated_at,
       coalesce(ls.approved_revenue_lines, 0) as approved_revenue_lines,
       coalesce(ls.approved_cost_lines, 0) as approved_cost_lines,
       coalesce(ls.approved_unknown_lines, 0) as approved_unknown_lines,
       coalesce(ls.scenario_unknown_lines, 0) as scenario_unknown_lines,
       coalesce(ls.proposed_lines, 0) as proposed_lines,
       coalesce(ls.approved_inputs_complete, false) as approved_inputs_complete,
       coalesce(ls.scenario_inputs_complete, false) as scenario_inputs_complete,
       ls.last_committed_at,
       reporting.open_readiness_checks(p.id) as open_readiness_checks
from public.projects p
left join line_state ls on ls.project_id = p.id
left join public.profiles ow on ow.user_id = p.owner_id
left join public.profiles ac on ac.user_id = p.account_owner_id;

-- Supporting records for "Why this number?": every revision (approved and superseded) and every proposal decision.
create or replace view reporting.money_audit as
select 'rev:' || r.id as audit_key, 'revision'::text as record_kind, r.revision_ref as record_ref,
       coalesce(s.project_id, c.project_id) as project_id, r.line_type, coalesce(s.line_ref, c.line_ref) as line_ref,
       coalesce(s.description, c.description) as line_description, r.revision_no, r.amount, (r.amount_status = 'known') as amount_known,
       r.status as record_status, r.effective_date, r.approved_at as recorded_at,
       coalesce(ap.display_name, case when r.source = 'import' then 'Imported from source' end) as decided_by,
       r.source, r.source_ref, cr.request_ref, cr.previous_amount, cr.reason, coalesce(cr.evidence_url, r.evidence_url) as evidence_url,
       cr.review_comment, rq.display_name as requested_by, cr.requested_at
from public.money_revisions r
left join public.service_lines s on s.id = r.service_line_id
left join public.cost_lines c on c.id = r.cost_line_id
left join public.change_requests cr on cr.id = r.change_request_id
left join public.profiles ap on ap.user_id = r.approved_by
left join public.profiles rq on rq.user_id = cr.requested_by
union all
select 'cr:' || cr.id, 'proposal', cr.request_ref, cr.project_id,
       case when cr.target_type in ('service_line', 'new_service_line') then 'revenue' else 'cost' end,
       coalesce(s.line_ref, c.line_ref), coalesce(s.description, c.description, cr.proposed_description), null,
       cr.proposed_amount, (cr.proposed_amount_status = 'known'), cr.status, (cr.requested_at at time zone 'Asia/Ho_Chi_Minh')::date,
       coalesce(cr.reviewed_at, cr.requested_at), rv.display_name, 'app', null, cr.request_ref, cr.previous_amount, cr.reason,
       cr.evidence_url, cr.review_comment, rq.display_name, cr.requested_at
from public.change_requests cr
left join public.service_lines s on s.id = cr.service_line_id
left join public.cost_lines c on c.id = cr.cost_line_id
left join public.profiles rv on rv.user_id = cr.reviewed_by
left join public.profiles rq on rq.user_id = cr.requested_by
where cr.status <> 'approved';

create or replace view reporting.work_items as
select w.id, w.work_ref, w.project_id, w.team, w.title, w.assignee_id, w.status, w.due_at,
       (w.due_at at time zone 'Asia/Ho_Chi_Minh')::date as due_date,
       (w.due_at < now() and w.status not in ('done', 'cancelled')) as is_overdue,
       (w.output_url is not null) as has_output, (w.brief_url is not null) as has_brief,
       w.completed_at, w.created_at, w.updated_at
from public.work_items w;

-- The dedicated, SELECT-only Anfra role. NOLOGIN until scripts/migrate.mjs sets its password (ANFRA_DB_PASSWORD).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anfra_reader') then
    create role anfra_reader nologin noinherit;
  end if;
end $$;
alter role anfra_reader set default_transaction_read_only = on;
-- A guard against runaway queries, not a performance target: database time is well under a second, but the time
-- Anfra's query sidecar spends round-tripping to the database counts too, and several panel queries run at once.
alter role anfra_reader set statement_timeout = '60s';
alter role anfra_reader set search_path = reporting;
grant usage on schema reporting to anfra_reader;
grant select on all tables in schema reporting to anfra_reader;
alter default privileges in schema reporting grant select on tables to anfra_reader;
-- Views call these helpers, so the reader must be allowed to run them (all three are read-only).
grant execute on function public.business_today(), public.fmt_vnd(numeric), reporting.open_readiness_checks(uuid)
  to anfra_reader;
