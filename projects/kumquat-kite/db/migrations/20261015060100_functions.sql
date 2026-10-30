-- Kumquat Kite lightweight POC — controlled workflow functions, readiness and work queues.
-- Every function is SECURITY DEFINER with an empty search_path, checks the caller's role and the allowed
-- transition itself, and runs as one transaction: the new state and its audit event commit together or not at all.
-- Errors use PTxyz SQLSTATEs, which the app server's data API answers with HTTP status xyz:
--   PT400 invalid input · PT403 forbidden · PT404 not found · PT409 conflict (stale version / already reviewed /
--   open proposal) · PT428 expected version required.

alter table public.projects add column intake_request_id uuid unique;

create table public.role_audit (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(user_id),
  role       text not null,
  action     text not null check (action in ('granted', 'revoked')),
  actor_id   uuid references public.profiles(user_id),
  occurred_at timestamptz not null default now()
);
alter table public.role_audit enable row level security;
revoke all on public.role_audit from kk_app;
grant select on public.role_audit to kk_app;
create policy admin_read on public.role_audit for select to kk_app using (public.has_role('admin'));
create trigger role_audit_append_only before update or delete on public.role_audit
  for each row execute function public.reject_mutation();

create or replace function public.begin_trusted_write(p_source text default 'app') returns void
language sql set search_path = '' as $$
  select set_config('kumquat.trusted_write', 'on', true), set_config('kumquat.write_source', p_source, true);
$$;

create or replace function public.forbid(p_detail text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'PT403', message = 'forbidden', detail = p_detail;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Quick intake: client (existing or new) + project + first next action, idempotent on p_request_id.
-- ---------------------------------------------------------------------------------------------
create or replace function public.create_project_intake(p_payload jsonb, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.projects;
  v_client_id uuid;
  v_project public.projects;
  v_owner uuid := coalesce((p_payload ->> 'owner_id')::uuid, app.uid());
begin
  if not public.has_any_role(array['bd', 'account', 'admin']) then
    perform public.forbid('Only BD, Account or Admin can create projects.');
  end if;
  if p_request_id is null then
    raise exception using errcode = 'PT400', message = 'request_id_required';
  end if;
  select * into v_existing from public.projects where intake_request_id = p_request_id;
  if found then
    return jsonb_build_object('project_id', v_existing.id, 'project_ref', v_existing.project_ref,
                              'version', v_existing.version, 'created', false);
  end if;

  perform public.begin_trusted_write();
  if p_payload ? 'client_id' then
    v_client_id := (p_payload ->> 'client_id')::uuid;
    if not exists (select 1 from public.clients where id = v_client_id) then
      raise exception using errcode = 'PT404', message = 'client_not_found';
    end if;
  else
    insert into public.clients (display_name, brand_name, client_type, owner_id, created_by)
    values (p_payload #>> '{new_client,display_name}', p_payload #>> '{new_client,brand_name}',
            coalesce(p_payload #>> '{new_client,client_type}', 'brand'), v_owner, app.uid())
    returning id into v_client_id;
  end if;

  insert into public.projects (client_id, title, service_group, project_kind, commercial_stage, owner_id, account_owner_id,
                               latest_note, latest_note_at, next_action, next_action_owner_id, next_action_due, next_action_done_when,
                               estimated_amount, estimate_basis, estimate_low, estimate_high, created_by, updated_by, intake_request_id)
  values (v_client_id, p_payload ->> 'title', p_payload ->> 'service_group', coalesce(p_payload ->> 'project_kind', 'commercial'),
          coalesce(p_payload ->> 'commercial_stage', 'lead'), v_owner, (p_payload ->> 'account_owner_id')::uuid,
          p_payload ->> 'note', case when p_payload ->> 'note' is not null then now() end,
          p_payload ->> 'next_action', (p_payload ->> 'next_action_owner_id')::uuid, (p_payload ->> 'next_action_due')::date,
          p_payload ->> 'next_action_done_when',
          (p_payload ->> 'estimated_amount')::numeric, p_payload ->> 'estimate_basis',
          (p_payload ->> 'estimate_low')::numeric, (p_payload ->> 'estimate_high')::numeric,
          app.uid(), app.uid(), p_request_id)
  returning * into v_project;

  if p_payload ->> 'note' is not null then
    insert into public.project_events (project_id, event_type, actor_id, summary, details)
    values (v_project.id, 'note', app.uid(), p_payload ->> 'note', jsonb_build_object('version', v_project.version));
  end if;
  if v_project.next_action is not null then
    insert into public.project_events (project_id, event_type, actor_id, summary, details)
    values (v_project.id, 'next_action_set', app.uid(), 'Next action: ' || v_project.next_action,
            jsonb_build_object('to', jsonb_build_object('action', v_project.next_action, 'owner_id', v_project.next_action_owner_id,
                               'due', v_project.next_action_due, 'done_when', v_project.next_action_done_when)));
  end if;
  return jsonb_build_object('project_id', v_project.id, 'project_ref', v_project.project_ref,
                            'version', v_project.version, 'created', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Financial proposals (Account) and Finance review.
-- ---------------------------------------------------------------------------------------------
create or replace function public.current_revision(p_target_type text, p_line_id uuid) returns public.money_revisions
language sql stable security definer set search_path = '' as $$
  select r.* from public.money_revisions r
  where r.status = 'approved'
    and ((p_target_type = 'cost_line' and r.cost_line_id = p_line_id)
      or (p_target_type = 'service_line' and r.service_line_id = p_line_id))
$$;

create or replace function public.change_request_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) from public.change_requests c where c.id = p_id
$$;

create or replace function public.submit_change_request(
  p_project_id uuid, p_target_type text, p_line_id uuid, p_amount numeric, p_amount_known boolean,
  p_zero_confirmed boolean, p_description text, p_cost_stage text, p_reason text, p_evidence_url text,
  p_base_revision_id uuid, p_idempotency_key uuid, p_service_code text default null, p_service_line_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.change_requests;
  v_current public.money_revisions;
  v_line_project uuid;
  v_id uuid;
  v_line_ref text;
  v_known boolean := coalesce(p_amount_known, true);
begin
  if not public.has_role('account') then
    perform public.forbid('Only Account can submit cost or commercial changes for Finance review.');
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'idempotency_key_required';
  end if;
  -- A repeated submission (double click, retry after a lost response) answers the first one; it never adds a row.
  select * into v_existing from public.change_requests where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.requested_by is distinct from app.uid() then
      raise exception using errcode = 'PT409', message = 'idempotency_key_reused';
    end if;
    return public.change_request_json(v_existing.id) || jsonb_build_object('duplicate', true);
  end if;
  if p_target_type is null or p_target_type not in ('cost_line', 'service_line', 'new_cost_line', 'new_service_line') then
    raise exception using errcode = 'PT400', message = 'invalid_target_type';
  end if;
  if v_known and p_amount is null then
    raise exception using errcode = 'PT400', message = 'amount_required', detail = 'Enter an amount, or mark it unknown.';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception using errcode = 'PT400', message = 'amount_negative', detail = 'Amounts are zero or more.';
  end if;
  if v_known and p_amount = 0 and not coalesce(p_zero_confirmed, false) then
    raise exception using errcode = 'PT400', message = 'zero_needs_confirmation',
      detail = 'Confirm that a zero amount is intentional; an unknown amount is not zero.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception using errcode = 'PT400', message = 'reason_required', detail = 'Give a reason of at least 5 characters.';
  end if;
  if coalesce(p_evidence_url, '') !~ '^https?://' then
    raise exception using errcode = 'PT400', message = 'evidence_required', detail = 'Link the supporting evidence (http or https).';
  end if;

  if p_target_type = 'cost_line' then
    select project_id, line_ref into v_line_project, v_line_ref from public.cost_lines where id = p_line_id;
  elsif p_target_type = 'service_line' then
    select project_id, line_ref into v_line_project, v_line_ref from public.service_lines where id = p_line_id;
  else
    select id into v_line_project from public.projects where id = p_project_id;
    if length(trim(coalesce(p_description, ''))) = 0 then
      raise exception using errcode = 'PT400', message = 'description_required', detail = 'Describe the new line.';
    end if;
  end if;
  if v_line_project is null or v_line_project <> p_project_id then
    raise exception using errcode = 'PT404', message = 'line_not_found';
  end if;
  if p_target_type = 'new_service_line' and not exists (select 1 from public.services where code = p_service_code) then
    raise exception using errcode = 'PT400', message = 'service_code_required', detail = 'Choose the service of the new revenue line.';
  end if;
  if p_target_type = 'new_cost_line' and p_service_line_id is not null
     and not exists (select 1 from public.service_lines where id = p_service_line_id and project_id = p_project_id) then
    raise exception using errcode = 'PT404', message = 'service_line_not_found';
  end if;

  -- The proposal must start from the value approved now: an edit made on an older screen is a conflict.
  if p_target_type in ('cost_line', 'service_line') then
    v_current := public.current_revision(p_target_type, p_line_id);
    if v_current.id is distinct from p_base_revision_id then
      raise exception using errcode = 'PT409', message = 'stale_base_revision',
        detail = json_build_object('base_revision_id', p_base_revision_id, 'current_revision_id', v_current.id,
                                   'current_amount', v_current.amount)::text;
    end if;
  end if;

  perform public.begin_trusted_write();
  begin
    insert into public.change_requests (project_id, target_type, cost_line_id, service_line_id, base_revision_id,
      previous_amount, previous_amount_status, proposed_amount, proposed_amount_status, proposed_zero_confirmed,
      proposed_description, proposed_cost_stage, proposed_service_code, proposed_service_line_id,
      reason, evidence_url, requested_by, idempotency_key)
    values (p_project_id, p_target_type,
      case when p_target_type = 'cost_line' then p_line_id end,
      case when p_target_type = 'service_line' then p_line_id end,
      v_current.id, v_current.amount, v_current.amount_status,
      case when v_known then p_amount end,
      case when v_known then 'known' else 'unknown' end,
      v_known and p_amount = 0 and coalesce(p_zero_confirmed, false),
      nullif(trim(coalesce(p_description, '')), ''),
      case when p_target_type in ('cost_line', 'new_cost_line') then p_cost_stage end,
      case when p_target_type = 'new_service_line' then p_service_code end,
      case when p_target_type = 'new_cost_line' then p_service_line_id end,
      trim(p_reason), p_evidence_url, app.uid(), p_idempotency_key)
    returning id into v_id;
  exception when unique_violation then
    -- Two submissions raced with the same key: the first one won, so answer it as the duplicate it is.
    select * into v_existing from public.change_requests where idempotency_key = p_idempotency_key;
    if found and v_existing.requested_by = app.uid() then
      return public.change_request_json(v_existing.id) || jsonb_build_object('duplicate', true);
    end if;
    raise exception using errcode = 'PT409', message = 'proposal_already_pending',
      detail = 'This line already has a proposal waiting for Finance review.';
  end;

  update public.projects set financial_verification = 'pending_review' where id = p_project_id;
  insert into public.project_events (project_id, event_type, actor_id, summary, details, change_request_id, revision_id)
  values (p_project_id, 'proposal_submitted', app.uid(),
          'Proposal ' || (select request_ref from public.change_requests where id = v_id) || ': '
            || coalesce(v_line_ref, case when p_target_type = 'new_service_line' then 'new revenue line' else 'new cost line' end) || ' '
            || coalesce(public.fmt_vnd(v_current.amount), case when v_current.id is null then 'new' else 'unknown' end)
            || ' → ' || coalesce(public.fmt_vnd(case when v_known then p_amount end), 'unknown') || ' VND',
          jsonb_build_object('target_type', p_target_type, 'line_id', p_line_id, 'previous_amount', v_current.amount,
                             'proposed_amount', case when v_known then p_amount end, 'base_revision_id', v_current.id,
                             'reason', trim(p_reason), 'evidence_url', p_evidence_url, 'service_code', p_service_code),
          v_id, v_current.id);
  return public.change_request_json(v_id) || jsonb_build_object('duplicate', false);
end $$;

create or replace function public.refresh_financial_verification(p_project_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Keeps the caller's write source (an import stays an import).
  perform set_config('kumquat.trusted_write', 'on', true);
  update public.projects p set financial_verification = case
      when exists (select 1 from public.change_requests c where c.project_id = p.id and c.status = 'pending') then 'pending_review'
      when exists (select 1 from public.money_revisions r
                   left join public.service_lines s on s.id = r.service_line_id
                   left join public.cost_lines c on c.id = r.cost_line_id
                   where r.status = 'approved' and coalesce(s.project_id, c.project_id) = p.id) then 'verified'
      else 'not_submitted' end
  where p.id = p_project_id;
end $$;

create or replace function public.review_change_request(p_request_id uuid, p_decision text, p_comment text, p_expected_version integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.change_requests;
  v_current public.money_revisions;
  v_new_rev public.money_revisions;
  v_line_id uuid;
  v_line_ref text;
  v_next_no integer;
  v_is_revenue boolean;
begin
  if not public.has_role('finance') then
    perform public.forbid('Only Finance can approve or reject financial changes.');
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'PT400', message = 'invalid_decision';
  end if;
  select * into v_req from public.change_requests where id = p_request_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'change_request_not_found';
  end if;
  if v_req.requested_by = app.uid() then
    perform public.forbid('You cannot review a change you submitted.');
  end if;
  if v_req.status <> 'pending' then
    raise exception using errcode = 'PT409', message = 'already_reviewed',
      detail = json_build_object('status', v_req.status, 'reviewed_at', v_req.reviewed_at)::text;
  end if;
  if p_expected_version is null or p_expected_version <> v_req.version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = json_build_object('expected_version', p_expected_version, 'current_version', v_req.version)::text;
  end if;
  if p_decision = 'reject' and length(trim(coalesce(p_comment, ''))) < 5 then
    raise exception using errcode = 'PT400', message = 'rejection_reason_required', detail = 'Give a reason of at least 5 characters.';
  end if;
  v_is_revenue := v_req.target_type in ('service_line', 'new_service_line');

  perform public.begin_trusted_write();
  if p_decision = 'approve' then
    if v_req.target_type = 'new_cost_line' then
      insert into public.cost_lines (project_id, service_line_id, description, cost_stage, created_by)
      values (v_req.project_id, v_req.proposed_service_line_id, v_req.proposed_description,
              coalesce(v_req.proposed_cost_stage, 'forecast'), v_req.requested_by)
      returning id, line_ref into v_line_id, v_line_ref;
      v_next_no := 1;
    elsif v_req.target_type = 'new_service_line' then
      insert into public.service_lines (project_id, service_code, description, created_by)
      values (v_req.project_id, v_req.proposed_service_code, v_req.proposed_description, v_req.requested_by)
      returning id, line_ref into v_line_id, v_line_ref;
      v_next_no := 1;
    else
      v_line_id := coalesce(v_req.cost_line_id, v_req.service_line_id);
      v_current := public.current_revision(v_req.target_type, v_line_id);
      if v_current.id is distinct from v_req.base_revision_id then
        raise exception using errcode = 'PT409', message = 'stale_base_revision',
          detail = 'The approved value changed after this proposal was made. Ask Account to resubmit.';
      end if;
      select coalesce(max(revision_no), 0) + 1 into v_next_no from public.money_revisions
      where (v_is_revenue and service_line_id = v_line_id) or (not v_is_revenue and cost_line_id = v_line_id);
      -- The previous version stays, marked superseded: history can always explain the earlier result.
      update public.money_revisions set status = 'superseded' where id = v_current.id;
      if v_req.target_type = 'cost_line' and v_req.proposed_cost_stage is not null then
        update public.cost_lines set cost_stage = v_req.proposed_cost_stage where id = v_line_id;
      end if;
      v_line_ref := coalesce((select line_ref from public.cost_lines where id = v_req.cost_line_id),
                             (select line_ref from public.service_lines where id = v_req.service_line_id));
    end if;
    insert into public.money_revisions (line_type, service_line_id, cost_line_id, revision_no, amount, amount_status, zero_confirmed,
                                        status, effective_date, approved_by, approved_at, change_request_id, source, evidence_url)
    values (case when v_is_revenue then 'revenue' else 'cost' end,
            case when v_is_revenue then v_line_id end,
            case when not v_is_revenue then v_line_id end,
            v_next_no, v_req.proposed_amount, v_req.proposed_amount_status, v_req.proposed_zero_confirmed,
            'approved', public.business_today(), app.uid(), now(), v_req.id, 'app', v_req.evidence_url)
    returning * into v_new_rev;
    update public.change_requests
      set status = 'approved', reviewed_by = app.uid(), reviewed_at = now(), review_comment = nullif(trim(coalesce(p_comment, '')), ''),
          resulting_revision_id = v_new_rev.id, version = version + 1
      where id = v_req.id;
    insert into public.project_events (project_id, event_type, actor_id, summary, details, change_request_id, revision_id)
    values (v_req.project_id, 'review_approved', app.uid(),
            'Finance approved ' || v_req.request_ref || ': ' || v_line_ref || ' '
              || coalesce(public.fmt_vnd(v_current.amount), case when v_current.id is null then 'new' else 'unknown' end)
              || ' → ' || coalesce(public.fmt_vnd(v_new_rev.amount), 'unknown') || ' VND (revision ' || v_new_rev.revision_ref || ')',
            jsonb_build_object('line_id', v_line_id, 'line_ref', v_line_ref, 'line_type', v_new_rev.line_type,
                               'previous', jsonb_build_object('revision_id', v_current.id, 'revision_ref', v_current.revision_ref,
                                                              'revision_no', v_current.revision_no,
                                                              'amount', v_current.amount, 'amount_status', v_current.amount_status),
                               'approved', jsonb_build_object('revision_id', v_new_rev.id, 'revision_ref', v_new_rev.revision_ref,
                                                              'revision_no', v_new_rev.revision_no, 'amount', v_new_rev.amount,
                                                              'amount_status', v_new_rev.amount_status),
                               'comment', nullif(trim(coalesce(p_comment, '')), '')),
            v_req.id, v_new_rev.id);
  else
    update public.change_requests
      set status = 'rejected', reviewed_by = app.uid(), reviewed_at = now(), review_comment = trim(p_comment), version = version + 1
      where id = v_req.id;
    insert into public.project_events (project_id, event_type, actor_id, summary, details, change_request_id, revision_id)
    values (v_req.project_id, 'review_rejected', app.uid(), 'Finance rejected ' || v_req.request_ref || ': ' || trim(p_comment),
            jsonb_build_object('proposed_amount', v_req.proposed_amount, 'base_revision_id', v_req.base_revision_id,
                               'comment', trim(p_comment)),
            v_req.id, v_req.base_revision_id);
  end if;
  perform public.refresh_financial_verification(v_req.project_id);
  return public.change_request_json(v_req.id)
    || jsonb_build_object('revision', case when v_new_rev.id is not null then to_jsonb(v_new_rev) end);
end $$;

create or replace function public.withdraw_change_request(p_request_id uuid, p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.change_requests;
begin
  select * into v_req from public.change_requests where id = p_request_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'change_request_not_found';
  end if;
  if v_req.requested_by is distinct from app.uid() then
    perform public.forbid('Only the person who submitted a proposal can withdraw it.');
  end if;
  if v_req.status <> 'pending' then
    raise exception using errcode = 'PT409', message = 'already_reviewed';
  end if;
  if p_expected_version is distinct from v_req.version then
    raise exception using errcode = 'PT409', message = 'version_conflict';
  end if;
  perform public.begin_trusted_write();
  update public.change_requests set status = 'withdrawn', version = version + 1 where id = v_req.id;
  insert into public.project_events (project_id, event_type, actor_id, summary, details, change_request_id)
  values (v_req.project_id, 'proposal_withdrawn', app.uid(), 'Withdrew proposal ' || v_req.request_ref, '{}'::jsonb, v_req.id);
  perform public.refresh_financial_verification(v_req.project_id);
  return public.change_request_json(v_req.id);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Finance-owned project fields
-- ---------------------------------------------------------------------------------------------
create or replace function public.issue_job_code(p_project_id uuid, p_job_code text, p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project public.projects;
begin
  if not public.has_role('finance') then
    perform public.forbid('Only Finance issues job codes.');
  end if;
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'project_not_found';
  end if;
  if p_expected_version is distinct from v_project.version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = json_build_object('expected_version', p_expected_version, 'current_version', v_project.version)::text;
  end if;
  if v_project.job_code is not null then
    raise exception using errcode = 'PT409', message = 'job_code_already_issued', detail = v_project.job_code;
  end if;
  perform public.begin_trusted_write();
  begin
    update public.projects set job_code = upper(trim(p_job_code)) where id = p_project_id returning * into v_project;
  exception when unique_violation then
    raise exception using errcode = 'PT409', message = 'job_code_in_use';
  end;
  insert into public.project_events (project_id, event_type, actor_id, summary, details)
  values (p_project_id, 'job_code_issued', app.uid(), 'Finance issued job code ' || v_project.job_code,
          jsonb_build_object('job_code', v_project.job_code, 'version', v_project.version));
  return to_jsonb(v_project);
end $$;

create or replace function public.set_payment_state(p_project_id uuid, p_state text, p_expected_version integer, p_note text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project public.projects;
  v_from text;
begin
  if not public.has_role('finance') then
    perform public.forbid('Only Finance changes the payment state.');
  end if;
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'project_not_found';
  end if;
  if p_expected_version is distinct from v_project.version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = json_build_object('expected_version', p_expected_version, 'current_version', v_project.version)::text;
  end if;
  v_from := v_project.payment_state;
  perform public.begin_trusted_write();
  update public.projects set payment_state = p_state where id = p_project_id returning * into v_project;
  insert into public.project_events (project_id, event_type, actor_id, summary, details)
  values (p_project_id, 'payment_state_changed', app.uid(), 'Payment state: ' || v_from || ' → ' || p_state,
          jsonb_build_object('from', v_from, 'to', p_state, 'note', p_note, 'version', v_project.version));
  return to_jsonb(v_project);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Roles: Admin grants; nobody grants Finance to themselves; Admin is not automatically Finance.
-- ---------------------------------------------------------------------------------------------
create or replace function public.grant_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    perform public.forbid('Only Admin can change roles.');
  end if;
  if p_user_id = app.uid() and p_role in ('finance', 'admin') then
    perform public.forbid('You cannot grant yourself Finance or Admin authority.');
  end if;
  insert into public.role_memberships (user_id, role, granted_by) values (p_user_id, p_role, app.uid())
  on conflict (user_id, role) do nothing;
  insert into public.role_audit (user_id, role, action, actor_id) values (p_user_id, p_role, 'granted', app.uid());
end $$;

create or replace function public.revoke_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    perform public.forbid('Only Admin can change roles.');
  end if;
  delete from public.role_memberships where user_id = p_user_id and role = p_role;
  insert into public.role_audit (user_id, role, action, actor_id) values (p_user_id, p_role, 'revoked', app.uid());
end $$;

-- ---------------------------------------------------------------------------------------------
-- Acceptance (Account submits, Finance verifies) and receipts (Finance records and allocates).
-- ---------------------------------------------------------------------------------------------
create or replace function public.submit_acceptance(p_project_id uuid, p_description text, p_amount numeric,
  p_effective_date date, p_evidence_url text, p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.acceptance_milestones;
  v_row public.acceptance_milestones;
begin
  if not public.has_role('account') then
    perform public.forbid('Only Account submits acceptance milestones.');
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'idempotency_key_required';
  end if;
  select * into v_existing from public.acceptance_milestones where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.submitted_by is distinct from app.uid() then
      raise exception using errcode = 'PT409', message = 'idempotency_key_reused';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('duplicate', true);
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception using errcode = 'PT404', message = 'project_not_found';
  end if;
  if length(trim(coalesce(p_description, ''))) = 0 then
    raise exception using errcode = 'PT400', message = 'description_required', detail = 'Name the accepted deliverable or milestone.';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception using errcode = 'PT400', message = 'amount_required', detail = 'Enter the accepted amount (VND, net of VAT).';
  end if;
  if p_effective_date is null then
    raise exception using errcode = 'PT400', message = 'effective_date_required', detail = 'Enter the acceptance date.';
  end if;
  if coalesce(p_evidence_url, '') !~ '^https?://' then
    raise exception using errcode = 'PT400', message = 'evidence_required', detail = 'Link the signed acceptance minutes or other evidence.';
  end if;
  perform public.begin_trusted_write();
  begin
    insert into public.acceptance_milestones (project_id, description, amount, effective_date, evidence_url, submitted_by, idempotency_key)
    values (p_project_id, trim(p_description), p_amount, p_effective_date, p_evidence_url, app.uid(), p_idempotency_key)
    returning * into v_row;
  exception when unique_violation then
    select * into v_existing from public.acceptance_milestones where idempotency_key = p_idempotency_key;
    if found and v_existing.submitted_by = app.uid() then
      return to_jsonb(v_existing) || jsonb_build_object('duplicate', true);
    end if;
    raise exception using errcode = 'PT409', message = 'idempotency_key_reused';
  end;
  insert into public.project_events (project_id, event_type, actor_id, summary, details)
  values (p_project_id, 'acceptance_submitted', app.uid(),
          'Submitted acceptance ' || v_row.milestone_ref || ': ' || public.fmt_vnd(v_row.amount) || ' VND (net of VAT), dated '
            || to_char(v_row.effective_date, 'FMDD Mon YYYY'),
          jsonb_build_object('milestone_id', v_row.id, 'milestone_ref', v_row.milestone_ref, 'amount', v_row.amount,
                             'evidence_url', v_row.evidence_url));
  return to_jsonb(v_row) || jsonb_build_object('duplicate', false);
end $$;

create or replace function public.review_acceptance(p_milestone_id uuid, p_decision text, p_comment text, p_expected_version integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.acceptance_milestones;
begin
  if not public.has_role('finance') then
    perform public.forbid('Only Finance verifies acceptance.');
  end if;
  if p_decision is null or p_decision not in ('verify', 'reject') then
    raise exception using errcode = 'PT400', message = 'invalid_decision';
  end if;
  select * into v_row from public.acceptance_milestones where id = p_milestone_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'milestone_not_found';
  end if;
  if v_row.submitted_by = app.uid() then
    perform public.forbid('You cannot verify an acceptance you submitted.');
  end if;
  if v_row.status <> 'submitted' then
    raise exception using errcode = 'PT409', message = 'already_reviewed';
  end if;
  if p_expected_version is distinct from v_row.version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = json_build_object('expected_version', p_expected_version, 'current_version', v_row.version)::text;
  end if;
  if p_decision = 'reject' and length(trim(coalesce(p_comment, ''))) < 5 then
    raise exception using errcode = 'PT400', message = 'rejection_reason_required', detail = 'Give a reason of at least 5 characters.';
  end if;
  perform public.begin_trusted_write();
  update public.acceptance_milestones
     set status = case when p_decision = 'verify' then 'verified' else 'rejected' end,
         verified_by = app.uid(), verified_at = now(), review_comment = nullif(trim(coalesce(p_comment, '')), ''),
         version = version + 1
   where id = v_row.id
  returning * into v_row;
  insert into public.project_events (project_id, event_type, actor_id, summary, details)
  values (v_row.project_id, case when p_decision = 'verify' then 'acceptance_verified' else 'acceptance_rejected' end, app.uid(),
          case when p_decision = 'verify'
               then 'Finance verified acceptance ' || v_row.milestone_ref || ': ' || public.fmt_vnd(v_row.amount) || ' VND'
               else 'Finance rejected acceptance ' || v_row.milestone_ref || ': ' || trim(p_comment) end,
          jsonb_build_object('milestone_id', v_row.id, 'amount', v_row.amount, 'comment', v_row.review_comment));
  return to_jsonb(v_row);
end $$;

create or replace function public.record_receipt(p_receipt jsonb, p_allocations jsonb, p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.receipts;
  v_receipt public.receipts;
  v_alloc jsonb;
  v_total numeric := 0;
  v_amount numeric;
  v_project uuid;
  v_milestone uuid;
begin
  if not public.has_role('finance') then
    perform public.forbid('Only Finance records receipts.');
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'idempotency_key_required';
  end if;
  select * into v_existing from public.receipts where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('receipt', to_jsonb(v_existing), 'duplicate', true);
  end if;
  if (p_receipt ->> 'receipt_date') is null or (p_receipt ->> 'amount') is null
     or coalesce(p_receipt ->> 'receipt_type', '') not in ('deposit', 'payment')
     or coalesce(p_receipt ->> 'tax_basis', '') not in ('net_of_vat', 'gross_incl_vat')
     or length(trim(coalesce(p_receipt ->> 'reference', ''))) < 3 then
    raise exception using errcode = 'PT400', message = 'receipt_fields_required',
      detail = 'A receipt needs a date, type, amount, tax basis and a bank/document reference.';
  end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception using errcode = 'PT400', message = 'allocations_required', detail = 'Allocate the receipt to at least one project.';
  end if;
  for v_alloc in select value from jsonb_array_elements(p_allocations) loop
    v_amount := nullif(v_alloc ->> 'amount', '')::numeric;
    if v_amount is null or v_amount <= 0 then
      raise exception using errcode = 'PT400', message = 'allocation_amount_invalid';
    end if;
    v_total := v_total + v_amount;
  end loop;
  if v_total <> (p_receipt ->> 'amount')::numeric then
    raise exception using errcode = 'PT400', message = 'allocation_total_mismatch',
      detail = 'Allocations must add up exactly to the receipt amount.';
  end if;
  perform public.begin_trusted_write();
  begin
    insert into public.receipts (receipt_date, receipt_type, amount, tax_basis, reference, note, recorded_by, idempotency_key)
    values ((p_receipt ->> 'receipt_date')::date, p_receipt ->> 'receipt_type', (p_receipt ->> 'amount')::numeric,
            p_receipt ->> 'tax_basis', trim(p_receipt ->> 'reference'), nullif(trim(coalesce(p_receipt ->> 'note', '')), ''),
            app.uid(), p_idempotency_key)
    returning * into v_receipt;
  exception when unique_violation then
    select * into v_existing from public.receipts where idempotency_key = p_idempotency_key;
    return jsonb_build_object('receipt', to_jsonb(v_existing), 'duplicate', true);
  end;
  for v_alloc in select value from jsonb_array_elements(p_allocations) loop
    v_project := (v_alloc ->> 'project_id')::uuid;
    v_milestone := nullif(v_alloc ->> 'milestone_id', '')::uuid;
    v_amount := (v_alloc ->> 'amount')::numeric;
    if not exists (select 1 from public.projects where id = v_project) then
      raise exception using errcode = 'PT404', message = 'project_not_found';
    end if;
    if v_milestone is not null and not exists (select 1 from public.acceptance_milestones
                                               where id = v_milestone and project_id = v_project and status = 'verified') then
      raise exception using errcode = 'PT400', message = 'milestone_not_verified',
        detail = 'Allocate only to a verified acceptance milestone of the same project.';
    end if;
    insert into public.receipt_allocations (receipt_id, project_id, milestone_id, amount)
    values (v_receipt.id, v_project, v_milestone, v_amount);
    insert into public.project_events (project_id, event_type, actor_id, summary, details)
    values (v_project, 'receipt_recorded', app.uid(),
            'Recorded receipt ' || v_receipt.receipt_ref || ' (' || case when v_receipt.receipt_type = 'deposit' then 'deposit' else 'payment' end
              || '): ' || public.fmt_vnd(v_amount) || ' VND ' || case when v_receipt.tax_basis = 'gross_incl_vat' then '(incl. VAT)' else '(net of VAT)' end
              || ', dated ' || to_char(v_receipt.receipt_date, 'FMDD Mon YYYY') || ', reference ' || v_receipt.reference,
            jsonb_build_object('receipt_id', v_receipt.id, 'receipt_ref', v_receipt.receipt_ref, 'milestone_id', v_milestone,
                               'amount', v_amount, 'tax_basis', v_receipt.tax_basis));
  end loop;
  return jsonb_build_object('receipt', to_jsonb(v_receipt), 'duplicate', false);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Readiness: explicit reasons, never a single silent "ready" flag
-- ---------------------------------------------------------------------------------------------
create or replace view public.project_readiness with (security_invoker = true) as
with revenue as (
  select s.project_id, count(r.id) as lines, count(r.id) filter (where r.amount_status = 'unknown') as unknown_lines,
         sum(r.amount) as amount
  from public.service_lines s join public.money_revisions r on r.service_line_id = s.id and r.status = 'approved'
  group by s.project_id
), cost as (
  select c.project_id, count(r.id) as lines, count(r.id) filter (where r.amount_status = 'unknown') as unknown_lines
  from public.cost_lines c join public.money_revisions r on r.cost_line_id = c.id and r.status = 'approved'
  group by c.project_id
), pending as (
  select project_id, count(*) as pending, string_agg(request_ref, ', ' order by request_ref) as refs
  from public.change_requests where status = 'pending' group by project_id
), work as (
  select project_id, count(*) filter (where status not in ('done', 'cancelled') and due_at < now()) as overdue_work
  from public.work_items group by project_id
), acceptance as (
  select project_id, count(*) filter (where status = 'verified') as verified, count(*) filter (where status = 'submitted') as submitted
  from public.acceptance_milestones group by project_id
), in_delivery as (
  select p.*, (p.commercial_stage = 'won' or p.delivery_state not in ('not_started', 'cancelled')) as delivering,
         p.delivery_state in ('delivered', 'client_accepted', 'closed') as handed_over
  from public.projects p
)
select p.id as project_id, x.check_code, x.label, x.status, x.detail, x.owner_role, x.sort_order
from in_delivery p
left join revenue rv on rv.project_id = p.id
left join cost co on co.project_id = p.id
left join pending pe on pe.project_id = p.id
left join work w on w.project_id = p.id
left join acceptance ac on ac.project_id = p.id
cross join lateral (values
  ('next_action', 'Next action has an owner and a due date', 1,
    case when p.commercial_stage = 'lost' or p.delivery_state in ('closed', 'cancelled') then 'not_applicable'
         when p.next_action is null then 'missing'
         when p.next_action_due < public.business_today() then 'blocked' else 'ok' end,
    case when p.commercial_stage = 'lost' or p.delivery_state in ('closed', 'cancelled') then 'The project has ended.'
         when p.next_action is null then 'No next action yet.'
         when p.next_action_due < public.business_today() then 'Overdue since ' || to_char(p.next_action_due, 'FMDD Mon YYYY') || '.'
         else 'Due ' || to_char(p.next_action_due, 'FMDD Mon YYYY') || '.' end, 'bd/account'),
  ('contract', 'Signed contract with a reference', 2,
    case when not p.delivering then 'not_applicable' when p.contract_reference is null then 'missing' else 'ok' end,
    case when not p.delivering then 'Deal not closed yet.' when p.contract_reference is null then 'No contract reference yet.'
         else 'Contract ' || p.contract_reference || ' signed ' || to_char(p.contract_signed_date, 'FMDD Mon YYYY') || '.' end, 'bd'),
  ('brief', 'Brief ready', 3,
    case when not p.delivering then 'not_applicable' when p.brief_status = 'ready' then 'ok' else 'missing' end,
    case when not p.delivering then 'Not needed yet.' when p.brief_status = 'ready' then 'Brief is ready.'
         when p.brief_status = 'received' then 'Brief received but not confirmed ready.' else 'No brief yet.' end, 'account'),
  ('account_owner', 'Account owner for delivery', 4,
    case when not p.delivering then 'not_applicable' when p.account_owner_id is null then 'missing' else 'ok' end,
    case when not p.delivering then 'Not needed yet.' when p.account_owner_id is null then 'No Account owner assigned.' else 'Account owner assigned.' end, 'bd'),
  ('job_code', 'Job code issued by Finance', 5,
    case when not p.delivering then 'not_applicable' when p.job_code is null then 'missing' else 'ok' end,
    case when not p.delivering then 'Not needed yet (the project uses its internal ID ' || p.project_ref || ').'
         when p.job_code is null then 'Waiting for Finance to issue a job code.' else 'Job code ' || p.job_code || '.' end, 'finance'),
  ('approved_revenue', 'Contract revenue approved by Finance', 6,
    case when not p.delivering then 'not_applicable' when coalesce(rv.lines, 0) = 0 then 'missing'
         when rv.unknown_lines > 0 then 'unknown'
         when coalesce(rv.amount, 0) = 0 and p.project_kind = 'commercial' then 'blocked' else 'ok' end,
    case when not p.delivering then 'Not needed yet.'
         when coalesce(rv.lines, 0) = 0 then 'No approved revenue line yet.'
         when rv.unknown_lines > 0 then rv.unknown_lines || ' revenue line(s) without an amount.'
         when coalesce(rv.amount, 0) = 0 and p.project_kind <> 'commercial' then 'Zero revenue is intentional (' || p.project_kind || ').'
         when coalesce(rv.amount, 0) = 0 then 'Zero revenue on a commercial project needs checking.'
         else 'Approved revenue: ' || public.fmt_vnd(rv.amount) || ' VND.' end, 'account'),
  ('cost_complete', 'Forecast cost complete and approved', 7,
    case when not p.delivering then 'not_applicable' when coalesce(co.lines, 0) = 0 then 'missing'
         when co.unknown_lines > 0 then 'unknown' else 'ok' end,
    case when not p.delivering then 'Not needed yet.'
         when coalesce(co.lines, 0) = 0 then 'No approved cost yet.'
         when co.unknown_lines > 0 then co.unknown_lines || ' cost line(s) without an amount (not counted as 0).'
         else co.lines || ' approved cost line(s).' end, 'account'),
  ('finance_review', 'No change waiting for Finance', 8,
    case when coalesce(pe.pending, 0) > 0 then 'blocked' else 'ok' end,
    case when coalesce(pe.pending, 0) > 0 then 'Waiting for review: ' || pe.refs || '.' else 'No pending proposal.' end, 'finance'),
  ('work_on_time', 'No overdue work', 9,
    case when coalesce(w.overdue_work, 0) > 0 then 'blocked' else 'ok' end,
    case when coalesce(w.overdue_work, 0) > 0 then w.overdue_work || ' work item(s) overdue.' else 'No overdue work.' end, 'account'),
  ('acceptance', 'Acceptance evidence verified by Finance', 10,
    case when not p.handed_over then 'not_applicable' when coalesce(ac.verified, 0) > 0 then 'ok'
         when coalesce(ac.submitted, 0) > 0 then 'blocked' else 'missing' end,
    case when not p.handed_over then 'Not delivered yet.'
         when coalesce(ac.verified, 0) > 0 then ac.verified || ' acceptance milestone(s) verified.'
         when coalesce(ac.submitted, 0) > 0 then 'Waiting for Finance to verify the acceptance.'
         else 'Delivered, but no acceptance evidence yet.' end, 'account')
) as x(check_code, label, sort_order, status, detail, owner_role);

-- ---------------------------------------------------------------------------------------------
-- "What do I need to do next?": every row has a reason, accountable owner, due date, next action and
-- completion condition. Evaluated per caller (security_invoker + app.uid()).
-- Readiness gaps get a due date from a POC default rule (days after the contract date or the promised
-- delivery date); the package defines no service levels, so these are documented assumptions.
-- ---------------------------------------------------------------------------------------------
create or replace view public.queue_items with (security_invoker = true) as
with gap_rules (check_code, owner_role, anchor, due_days, next_action, done_when) as (values
  ('contract', 'bd', 'contract', 0, 'Add the contract reference and signing date', 'Job 360 shows the contract reference and signing date'),
  ('account_owner', 'bd', 'contract', 1, 'Assign an Account owner for delivery', 'The project has an Account owner'),
  ('approved_revenue', 'account', 'contract', 2, 'Send the contract value to Finance for approval, with the contract', 'Finance has approved the contract revenue'),
  ('job_code', 'finance', 'contract', 2, 'Issue a job code for the project', 'The job code shows on Job 360'),
  ('brief', 'account', 'contract', 3, 'Get the brief from the client and mark it Ready', 'The brief is Ready, with a document link'),
  ('cost_complete', 'account', 'contract', 5, 'Propose the missing cost amounts, with evidence', 'Every cost line has an amount approved by Finance'),
  ('acceptance', 'account', 'delivery', 3, 'Submit the signed acceptance minutes as evidence', 'Finance has verified the acceptance milestone')
)
select 'next_action:' || p.id as item_key, 'my_next_action' as queue, 'next_action' as kind,
       p.id as project_id, p.project_ref, p.title as project_title, null::uuid as work_item_id, null::uuid as change_request_id,
       null::uuid as milestone_id,
       case when p.next_action_due < public.business_today() then 'Your next action is overdue'
            else 'You own the next action' end as reason,
       p.next_action_owner_id as owner_id, p.next_action_due as due_date, p.next_action as next_action,
       coalesce(p.next_action_done_when, 'Update the project and set the next action') as completion_condition,
       p.next_action_due < public.business_today() as is_overdue
from public.projects p
where p.next_action_owner_id = app.uid() and p.next_action is not null
union all
select 'work:' || w.id, 'my_work', 'work_item', w.project_id, p.project_ref, p.title, w.id, null, null,
       case w.status when 'changes_requested' then 'Account asked for changes' || coalesce(': ' || w.review_note, '')
                     when 'blocked' then 'This work is blocked'
                     else 'Assigned to you (' || w.team || ')' end,
       w.assignee_id, (w.due_at at time zone 'Asia/Ho_Chi_Minh')::date, w.title, w.completion_condition,
       w.due_at < now()
from public.work_items w join public.projects p on p.id = w.project_id
where w.assignee_id = app.uid() and w.status not in ('done', 'cancelled', 'in_review')
union all
select 'review_work:' || w.id, 'needs_review', 'work_review', w.project_id, p.project_ref, p.title, w.id, null, null,
       'Hand-off waiting for Account review: ' || w.work_ref,
       coalesce(p.account_owner_id, w.requested_by, p.owner_id), (w.due_at at time zone 'Asia/Ho_Chi_Minh')::date,
       'Approve or request changes: ' || w.title, 'Marked Done, or Changes requested with a note',
       w.due_at < now()
from public.work_items w join public.projects p on p.id = w.project_id
where w.status = 'in_review' and app.uid() = coalesce(p.account_owner_id, w.requested_by, p.owner_id)
union all
select 'finance_review:' || c.id, 'needs_review', 'finance_review', c.project_id, p.project_ref, p.title, null, c.id, null,
       'Proposal ' || c.request_ref || ' waiting for Finance', app.uid(),
       (c.requested_at at time zone 'Asia/Ho_Chi_Minh')::date + 2,
       'Compare the previous and proposed values with the evidence, then approve or reject', 'Approved (a new revision) or rejected with a reason',
       (c.requested_at at time zone 'Asia/Ho_Chi_Minh')::date + 2 < public.business_today()
from public.change_requests c join public.projects p on p.id = c.project_id
where c.status = 'pending' and public.has_role('finance') and c.requested_by <> app.uid()
union all
select 'acceptance_review:' || a.id, 'needs_review', 'acceptance_review', a.project_id, p.project_ref, p.title, null, null, a.id,
       'Acceptance ' || a.milestone_ref || ' waiting for Finance verification', app.uid(),
       (a.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date + 2,
       'Check the acceptance evidence and amount, then verify or reject', 'Verified, or rejected with a reason',
       (a.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date + 2 < public.business_today()
from public.acceptance_milestones a join public.projects p on p.id = a.project_id
where a.status = 'submitted' and public.has_role('finance') and a.submitted_by <> app.uid()
union all
select 'gap:' || r.check_code || ':' || p.id, 'my_next_action', 'readiness_gap', p.id, p.project_ref, p.title, null, null, null,
       'Readiness gap · ' || r.label || ': ' || r.detail,
       case g.owner_role when 'finance' then app.uid() when 'bd' then p.owner_id else coalesce(p.account_owner_id, p.owner_id) end,
       case g.anchor when 'delivery' then coalesce(p.promised_delivery_date, public.business_today())
                     else coalesce(p.contract_signed_date, public.business_today()) end + g.due_days,
       g.next_action, g.done_when,
       case g.anchor when 'delivery' then coalesce(p.promised_delivery_date, public.business_today())
                     else coalesce(p.contract_signed_date, public.business_today()) end + g.due_days < public.business_today()
from public.project_readiness r
join public.projects p on p.id = r.project_id
join gap_rules g on g.check_code = r.check_code
where r.status in ('missing', 'unknown')
  and not (g.check_code in ('approved_revenue', 'cost_complete')
           and exists (select 1 from public.change_requests c where c.project_id = p.id and c.status = 'pending'))
  and case g.owner_role when 'finance' then public.has_role('finance')
                        when 'bd' then p.owner_id = app.uid()
                        else coalesce(p.account_owner_id, p.owner_id) = app.uid() end
union all
select 'overdue_action:' || p.id, 'overdue', 'next_action', p.id, p.project_ref, p.title, null, null, null,
       'Overdue: ' || coalesce(pr.display_name, 'no owner'),
       p.next_action_owner_id, p.next_action_due, p.next_action,
       coalesce(p.next_action_done_when, 'Update the project and set the next action'), true
from public.projects p left join public.profiles pr on pr.user_id = p.next_action_owner_id
where p.next_action_due < public.business_today() and p.next_action is not null
  and public.has_any_role(array['bd', 'account', 'admin'])
union all
select 'overdue_work:' || w.id, 'overdue', 'work_item', w.project_id, p.project_ref, p.title, w.id, null, null,
       'Overdue: ' || w.work_ref || ' (' || coalesce(pr.display_name, 'unassigned') || ')',
       w.assignee_id, (w.due_at at time zone 'Asia/Ho_Chi_Minh')::date, w.title, w.completion_condition, true
from public.work_items w join public.projects p on p.id = w.project_id left join public.profiles pr on pr.user_id = w.assignee_id
where w.due_at < now() and w.status not in ('done', 'cancelled') and public.has_any_role(array['bd', 'account', 'admin']);

-- These two views are read-only for the app role.
revoke all on public.project_readiness, public.queue_items from public, kk_app;
grant select on public.project_readiness, public.queue_items to kk_app;

revoke execute on all functions in schema public from public;
grant execute on function
  public.create_project_intake(jsonb, uuid),
  public.submit_change_request(uuid, text, uuid, numeric, boolean, boolean, text, text, text, text, uuid, uuid, text, uuid),
  public.submit_acceptance(uuid, text, numeric, date, text, uuid),
  public.review_acceptance(uuid, text, text, integer),
  public.record_receipt(jsonb, jsonb, uuid),
  public.review_change_request(uuid, text, text, integer),
  public.withdraw_change_request(uuid, integer),
  public.issue_job_code(uuid, text, integer),
  public.set_payment_state(uuid, text, integer, text),
  public.grant_role(uuid, text),
  public.revoke_role(uuid, text),
  public.has_role(text), public.has_any_role(text[]), public.is_staff(), public.my_roles(), public.business_today(), public.fmt_vnd(numeric),
  public.expected_version(), public.in_trusted_write(), public.require_expected_version(integer)
  to kk_app;
-- Internal helpers stay callable only from the definer functions above.
revoke execute on function public.begin_trusted_write(text), public.forbid(text), public.current_revision(text, uuid),
  public.change_request_json(uuid), public.refresh_financial_verification(uuid) from kk_app;
