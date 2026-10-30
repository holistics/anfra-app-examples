-- Kumquat Kite lightweight POC — imports from the single import template (Import & access → Bring your data).
-- import_snapshot as before, plus the fields a CRM sheet carries for a NEW project: its estimate (total, monthly or a
-- range; never revenue), project kind, the "done when" of its next action, a lost reason, and the data classification
-- of the client and project as the row states it (this POC still refuses any row not labelled synthetic). As before,
-- these are taken only when the project is created: afterwards they belong to the app, and a re-import never
-- overwrites them. The template rows are checked in the browser first (shared/template.mjs), so a row that would
-- break a constraint is reported with its fix instead of failing the batch.
create or replace function public.import_snapshot(p_meta jsonb, p_rows jsonb, p_commit boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sys text := p_meta ->> 'source_system';
  v_as_of timestamptz := (p_meta ->> 'source_as_of')::timestamptz;
  v_map jsonb := coalesce(p_meta -> 'mapping', '{}'::jsonb);
  v_batch uuid := gen_random_uuid();
  v_row jsonb;
  v_hash text;
  v_last text;
  v_outcome text;
  v_msg text;
  v_target uuid;
  v_client uuid;
  v_project uuid;
  v_user uuid;
  v_counts jsonb := '{}'::jsonb;
  v_totals jsonb;
  v_contract numeric := 0;
  v_cost numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  v_entity text;
  v_stage text;
  v_line uuid;
  v_rev public.money_revisions;
  v_key text;
  v_event_id bigint;
  v_touched uuid[] := '{}';
  v_batch_new jsonb := '{}'::jsonb;  -- source keys this run creates, per entity (a preview creates nothing)
begin
  if not public.has_role('admin') then
    perform public.forbid('Only Admin runs imports.');
  end if;
  if v_sys is null or v_as_of is null or (p_meta ->> 'payload_sha256') is null then
    raise exception using errcode = 'PT400', message = 'import_metadata_required',
      detail = 'source_system, source_as_of and payload_sha256 are required.';
  end if;
  perform public.begin_trusted_write('import');

  foreach v_entity in array array['client', 'project', 'work_item', 'cost_line', 'activity'] loop
    for v_row in select value from jsonb_array_elements(coalesce(p_rows -> (case v_entity when 'activity' then 'activities'
                                                                                else v_entity || 's' end), '[]'::jsonb)) loop
      v_hash := md5(v_row::text);
      v_key := v_row ->> (case v_entity when 'client' then 'client_id' when 'project' then 'project_id'
                                         when 'work_item' then 'work_item_id' when 'activity' then 'activity_id'
                                         else 'cost_line_id' end);
      v_msg := null;
      v_target := null;
      v_outcome := null;
      -- This POC only accepts rows explicitly labelled synthetic.
      if coalesce(v_row ->> 'data_classification', '') <> 'synthetic' then
        v_outcome := 'unresolved';
        v_msg := 'Row is not labelled synthetic; this POC imports synthetic demo data only.';
      end if;

      if v_outcome is null and v_entity = 'client' then
        select id into v_target from public.clients where source_system = v_sys and source_key = v_row ->> 'client_id';
        v_last := public.last_imported_hash('client', v_sys, v_row ->> 'client_id');
        if v_target is null then
          v_outcome := 'new';
          if p_commit then
            insert into public.clients (display_name, client_type, data_classification, source_system, source_key, source_as_of, imported_at)
            values (v_row ->> 'display_name', coalesce(v_row ->> 'client_type', 'brand'),
                    coalesce(nullif(v_row ->> 'data_classification', ''), 'synthetic'), v_sys,
                    v_row ->> 'client_id', v_as_of, now())
            returning id into v_target;
          end if;
        elsif v_last = v_hash then
          v_outcome := 'unchanged';
        else
          v_outcome := 'updated';
          if p_commit then
            -- display_name stays source-owned unless the app has edited it since the import.
            update public.clients set display_name = v_row ->> 'display_name', source_as_of = v_as_of, imported_at = now()
            where id = v_target and (updated_at <= imported_at or updated_by is null);
            if not found then v_msg := 'Name was edited in the app; source value not applied.'; end if;
          end if;
        end if;

      elsif v_outcome is null and v_entity = 'project' then
        select id into v_client from public.clients where source_system = v_sys and source_key = v_row ->> 'client_id';
        v_stage := coalesce(v_map #>> array['stage_dictionary', v_row ->> 'commercial_stage'], v_row ->> 'commercial_stage');
        v_user := (v_map #>> array['owner_roles', v_row ->> 'owner_role'])::uuid;
        select id into v_target from public.projects where source_system = v_sys and source_key = v_row ->> 'project_id';
        v_last := public.last_imported_hash('project', v_sys, v_row ->> 'project_id');
        if v_client is null and v_target is null and not coalesce(v_batch_new -> 'client' ? (v_row ->> 'client_id'), false) then
          v_outcome := 'unresolved'; v_msg := 'Client source key ' || coalesce(v_row ->> 'client_id', '?') || ' is not mapped.';
        elsif v_user is null and v_target is null then
          v_outcome := 'unresolved'; v_msg := 'Owner role ' || coalesce(v_row ->> 'owner_role', '?') || ' has no reviewed user mapping.';
        elsif v_target is null then
          v_outcome := 'new';
          if p_commit then
            insert into public.projects (client_id, title, job_code, service_group, project_kind, commercial_stage, delivery_state,
              owner_id, account_owner_id, next_action, next_action_owner_id, next_action_due, next_action_done_when,
              brief_status, contract_reference, contract_signed_date, lost_reason, estimated_amount, estimate_basis, estimate_low,
              estimate_high, data_classification, source_system, source_key, source_as_of, imported_at, created_at)
            values (v_client, v_row ->> 'title', nullif(v_row ->> 'job_code', ''), v_row ->> 'service_group',
              coalesce(nullif(v_row ->> 'project_kind', ''), 'commercial'), v_stage,
              coalesce(v_row ->> 'delivery_state', 'not_started'), v_user, v_user,
              nullif(v_row ->> 'next_action', ''), case when nullif(v_row ->> 'next_action', '') is not null then v_user end,
              nullif(v_row ->> 'next_action_due', '')::date,
              case when nullif(v_row ->> 'next_action', '') is not null
                then coalesce(nullif(v_row ->> 'done_when', ''), v_map ->> 'default_done_when', 'Update the project and set the next action') end,
              coalesce(nullif(v_row ->> 'brief_status', ''), 'missing'), nullif(v_row ->> 'contract_reference', ''),
              nullif(v_row ->> 'contract_signed_date', '')::date, nullif(v_row ->> 'lost_reason', ''),
              nullif(v_row ->> 'estimated_amount', '')::numeric, nullif(v_row ->> 'estimate_basis', ''),
              nullif(v_row ->> 'estimate_low', '')::numeric, nullif(v_row ->> 'estimate_high', '')::numeric,
              coalesce(nullif(v_row ->> 'data_classification', ''), 'synthetic'), v_sys, v_row ->> 'project_id', v_as_of, now(), now())
            returning id into v_target;
            -- Contract value becomes an approved baseline service line, attributed to the reviewed default service.
            if nullif(v_row ->> 'contract_value_net', '') is not null then
              insert into public.service_lines (project_id, service_code, description, source_system, source_key)
              values (v_target, coalesce(v_row ->> 'service_code', v_map ->> 'default_service_code'), 'Contract value (snapshot)',
                      v_sys, v_row ->> 'project_id')
              returning id into v_line;
              insert into public.money_revisions (line_type, service_line_id, revision_no, amount, amount_status, status, effective_date,
                approved_by, approved_at, source, source_ref)
              values ('revenue', v_line, 1, (v_row ->> 'contract_value_net')::numeric, 'known', 'approved',
                coalesce(nullif(v_row ->> 'contract_signed_date', '')::date, (v_as_of at time zone 'Asia/Ho_Chi_Minh')::date),
                null, now(), 'import', v_sys || ':' || (v_row ->> 'project_id'));
            end if;
            v_touched := v_touched || v_target;
          end if;
          v_contract := v_contract + coalesce(nullif(v_row ->> 'contract_value_net', '')::numeric, 0);
        elsif v_last = v_hash then
          v_outcome := 'unchanged';
          v_contract := v_contract + coalesce(nullif(v_row ->> 'contract_value_net', '')::numeric, 0);
        else
          v_outcome := 'updated';
          v_contract := v_contract + coalesce(nullif(v_row ->> 'contract_value_net', '')::numeric, 0);
          select r.* into v_rev from public.money_revisions r join public.service_lines s on s.id = r.service_line_id
          where s.project_id = v_target and s.source_system = v_sys and r.status = 'approved';
          if v_rev.id is not null and v_rev.amount is distinct from nullif(v_row ->> 'contract_value_net', '')::numeric then
            v_outcome := 'unresolved';
            v_msg := 'Source contract value differs from the approved value; it must go through Finance review.';
          end if;
          if p_commit then
            -- Title stays source-owned until edited in the app. Next actions, stages and notes are app-owned now.
            update public.projects set title = v_row ->> 'title', source_as_of = v_as_of
            where id = v_target and title is distinct from v_row ->> 'title'
              and not exists (select 1 from public.project_events e where e.project_id = v_target and e.event_type = 'field_change'
                              and e.source = 'app' and e.details -> 'changes' ? 'title');
          end if;
        end if;

      elsif v_outcome is null and v_entity = 'work_item' then
        select id into v_project from public.projects where source_system = v_sys and source_key = v_row ->> 'project_id';
        v_user := (v_map #>> array['owner_roles', v_row ->> 'owner_role'])::uuid;
        select id into v_target from public.work_items where source_system = v_sys and source_key = v_row ->> 'work_item_id';
        v_last := public.last_imported_hash('work_item', v_sys, v_row ->> 'work_item_id');
        if v_project is null and v_target is null and not coalesce(v_batch_new -> 'project' ? (v_row ->> 'project_id'), false) then
          v_outcome := 'unresolved'; v_msg := 'Project source key ' || coalesce(v_row ->> 'project_id', '?') || ' is not mapped.';
        elsif v_target is null then
          v_outcome := 'new';
          if p_commit then
            insert into public.work_items (project_id, team, title, assignee_id, status, due_at, completion_condition,
                                           source_system, source_key, created_at)
            values (v_project, v_row ->> 'team', v_row ->> 'title', v_user,
                    coalesce(v_map #>> array['work_status_dictionary', v_row ->> 'status'], v_row ->> 'status'),
                    nullif(v_row ->> 'due_at', '')::timestamptz,
                    coalesce(nullif(v_row ->> 'completion_condition', ''), v_map ->> 'default_work_done_when', 'Done, with a link to the output'),
                    v_sys, v_row ->> 'work_item_id', now())
            returning id into v_target;
          end if;
        elsif v_last = v_hash then
          v_outcome := 'unchanged';
        else
          v_outcome := 'updated';
          v_msg := 'Work items are app-owned after import; source changes are recorded but not applied.';
        end if;

      elsif v_outcome is null and v_entity = 'cost_line' then
        select id into v_project from public.projects where source_system = v_sys and source_key = v_row ->> 'project_id';
        select id into v_target from public.cost_lines where source_system = v_sys and source_key = v_row ->> 'cost_line_id';
        v_last := public.last_imported_hash('cost_line', v_sys, v_row ->> 'cost_line_id');
        if v_project is null and v_target is null and not coalesce(v_batch_new -> 'project' ? (v_row ->> 'project_id'), false) then
          v_outcome := 'unresolved'; v_msg := 'Project source key ' || coalesce(v_row ->> 'project_id', '?') || ' is not mapped.';
        elsif coalesce(v_row ->> 'review_state', '') <> 'approved' then
          v_outcome := 'unresolved'; v_msg := 'Only Finance-approved source costs become an approved baseline; this row is ' ||
                                              coalesce(v_row ->> 'review_state', 'unreviewed') || '.';
        elsif v_target is null then
          v_outcome := 'new';
          if p_commit then
            insert into public.cost_lines (project_id, description, cost_stage, source_system, source_key)
            values (v_project, v_row ->> 'description', coalesce(v_row ->> 'cost_basis', 'forecast'), v_sys, v_row ->> 'cost_line_id')
            returning id into v_target;
            insert into public.money_revisions (line_type, cost_line_id, revision_no, amount, amount_status, status, effective_date,
              approved_by, approved_at, source, source_ref)
            values ('cost', v_target, 1, nullif(v_row ->> 'amount', '')::numeric,
              case when nullif(v_row ->> 'amount', '') is null then 'unknown' else 'known' end, 'approved',
              (v_as_of at time zone 'Asia/Ho_Chi_Minh')::date, null, now(), 'import', v_sys || ':' || (v_row ->> 'cost_line_id'));
            v_touched := v_touched || v_project;
          end if;
          v_cost := v_cost + coalesce(nullif(v_row ->> 'amount', '')::numeric, 0);
        elsif v_last = v_hash then
          v_outcome := 'unchanged';
          v_cost := v_cost + coalesce(nullif(v_row ->> 'amount', '')::numeric, 0);
        else
          v_outcome := 'unresolved';
          v_msg := 'Source cost changed; an approved cost changes only through Finance review.';
          v_cost := v_cost + coalesce(nullif(v_row ->> 'amount', '')::numeric, 0);
        end if;
      end if;

      if v_outcome is null and v_entity = 'activity' then
        select id into v_project from public.projects where source_system = v_sys and source_key = v_row ->> 'project_id';
        select id into v_event_id from public.project_events where source_system = v_sys and source_key = v_row ->> 'activity_id';
        v_last := public.last_imported_hash('activity', v_sys, v_row ->> 'activity_id');
        v_target := v_project;
        if v_project is null and not coalesce(v_batch_new -> 'project' ? (v_row ->> 'project_id'), false) then
          v_outcome := 'unresolved';
          v_msg := 'Opportunity source key ' || coalesce(v_row ->> 'project_id', '?') || ' is not mapped; the activity is not turned into a new deal.';
        elsif v_event_id is not null then
          v_outcome := case when v_last = v_hash then 'unchanged' else 'unresolved' end;
          if v_outcome = 'unresolved' then
            v_msg := 'History is immutable: a changed source activity is listed for review, not rewritten.';
          end if;
        else
          v_outcome := 'new';
          if p_commit then
            insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source, source_system, source_key)
            values (v_project, 'note', null, coalesce(nullif(v_row ->> 'occurred_at', '')::timestamptz, v_as_of), v_row ->> 'note',
                    jsonb_build_object('source_system', v_sys, 'source_key', v_row ->> 'activity_id',
                                       'stage_in_source', v_row ->> 'stage', 'author_role_in_source', v_row ->> 'author_role'),
                    'import', v_sys, v_row ->> 'activity_id');
          end if;
        end if;
      end if;

      if v_outcome = 'new' and v_key is not null then
        v_batch_new := jsonb_set(v_batch_new, array[v_entity], coalesce(v_batch_new -> v_entity, '[]'::jsonb) || to_jsonb(v_key), true);
      end if;

      v_counts := jsonb_set(v_counts, array[v_entity], coalesce(v_counts -> v_entity, '{}'::jsonb), true);
      v_counts := jsonb_set(v_counts, array[v_entity, 'read'], to_jsonb(coalesce((v_counts #>> array[v_entity, 'read'])::int, 0) + 1), true);
      v_counts := jsonb_set(v_counts, array[v_entity, v_outcome], to_jsonb(coalesce((v_counts #>> array[v_entity, v_outcome])::int, 0) + 1), true);
      if v_key is null then
        v_outcome := 'unresolved';
        v_msg := coalesce(v_msg, 'Row has no source key.');
      end if;
      v_rows := v_rows || jsonb_build_object('entity', v_entity, 'source_key', coalesce(v_key, '(missing)'), 'row', v_row,
                  'hash', v_hash, 'outcome', v_outcome, 'target', v_target, 'message', v_msg);
    end loop;
  end loop;

  if p_commit then
    perform public.refresh_financial_verification(t) from unnest(v_touched) t;
  end if;
  v_totals := jsonb_build_object('contract_value_net_vnd', v_contract, 'cost_amount_vnd', v_cost);
  insert into public.import_batches (id, source_system, snapshot_label, source_as_of, payload_sha256, mapping, run_kind, counts, totals, run_by)
  values (v_batch, v_sys, coalesce(p_meta ->> 'snapshot_label', v_sys), v_as_of, p_meta ->> 'payload_sha256', v_map,
          case when p_commit then 'commit' else 'preview' end, v_counts, v_totals, app.uid());
  insert into public.import_rows (batch_id, entity, source_key, row_hash, raw, outcome, target_id, message)
  select v_batch, r ->> 'entity', r ->> 'source_key', r ->> 'hash', r -> 'row', r ->> 'outcome', nullif(r ->> 'target', '')::uuid, r ->> 'message'
  from jsonb_array_elements(v_rows) r;

  return jsonb_build_object('batch_id', v_batch, 'batch_ref', (select batch_ref from public.import_batches where id = v_batch),
                            'run_kind', case when p_commit then 'commit' else 'preview' end, 'counts', v_counts, 'totals', v_totals,
                            'rows', v_rows);
end $$;
