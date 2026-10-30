-- Kumquat Kite lightweight POC — Holistics report links (feedback 02, item 13).
-- A report built in Holistics, kept with the CRM record it is about (the whole business, a client or a project).
-- Kumquat Kite stores the link and its context only: it does not copy, sync or send data to Holistics. A link may
-- also name the dashboard's AML unique name (embed_object), which an Admin sets once embedded analytics is set up
-- in the Holistics workspace; the app server then signs a short-lived embed token for it (server-side secret).
create sequence public.report_ref_seq;

create table public.report_links (
  id           uuid primary key default gen_random_uuid(),
  report_ref   text not null unique,
  title        text not null check (char_length(btrim(title)) between 3 and 120),
  purpose      text check (purpose is null or char_length(purpose) <= 500),
  url          text not null,
  link_kind    text not null default 'dashboard' check (link_kind in ('dashboard', 'report', 'dataset', 'other')),
  context_type text not null default 'portfolio' check (context_type in ('portfolio', 'client', 'project')),
  client_id    uuid references public.clients(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete cascade,
  embed_object text check (embed_object is null or embed_object ~ '^[a-z][a-z0-9_]{0,127}$'),
  request_id   uuid unique,
  version      integer not null default 1,
  created_by   uuid not null references public.profiles(user_id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(user_id),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  archived_by  uuid references public.profiles(user_id),
  -- An https address on holistics.io (any region or workspace subdomain), without sign-in details or a token.
  constraint report_links_url_check check (char_length(url) <= 2000 and url ~* '^https://([a-z0-9-]+\.)*holistics\.io(/|$)'
                                           and url !~* '[?&][^=&#]*token'),
  constraint report_links_context_check check (
    (context_type = 'portfolio' and client_id is null and project_id is null) or
    (context_type = 'client' and client_id is not null and project_id is null) or
    (context_type = 'project' and project_id is not null and client_id is null))
);
alter sequence public.report_ref_seq owned by public.report_links.report_ref;
create index report_links_project on public.report_links (project_id) where archived_at is null;
create index report_links_client on public.report_links (client_id) where archived_at is null;

-- Who may do what, checked here rather than by hidden buttons: BD, Account, Finance and Admin read and connect
-- reports; only the person who connected a link, or an Admin, edits or removes it; only an Admin names the embedded
-- dashboard. Identifiers, the author and the request key never change. A removed link is archived, not deleted.
create or replace function public.report_links_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not public.in_trusted_write() and not public.has_any_role(array['bd', 'account', 'finance', 'admin']) then
      raise exception using errcode = 'PT403', message = 'forbidden', detail = 'Only BD, Account, Finance or Admin can connect reports.';
    end if;
    if new.embed_object is not null and not public.in_trusted_write() and not public.has_role('admin') then
      raise exception using errcode = 'PT403', message = 'embed_admin_only', detail = 'Only an Admin can set the embedded dashboard.';
    end if;
    new.report_ref := 'RP-' || lpad(nextval('public.report_ref_seq')::text, 4, '0');
    new.version := 1;
    new.created_by := case when public.in_trusted_write() then coalesce(new.created_by, app.uid()) else app.uid() end;
    new.created_at := public.trusted_time(new.created_at);
    new.updated_by := new.created_by;
    new.updated_at := new.created_at;
    new.archived_at := null;
    new.archived_by := null;
    return new;
  end if;
  if not public.in_trusted_write() then
    perform public.require_expected_version(old.version);
    if old.archived_at is not null then
      raise exception using errcode = 'PT409', message = 'report_link_archived', detail = 'This report link was removed.';
    end if;
    if old.created_by is distinct from app.uid() and not public.has_role('admin') then
      raise exception using errcode = 'PT403', message = 'report_link_owner_only',
        detail = 'Only the person who connected this report, or an Admin, can change or remove it.';
    end if;
    if new.embed_object is distinct from old.embed_object and not public.has_role('admin') then
      raise exception using errcode = 'PT403', message = 'embed_admin_only', detail = 'Only an Admin can set the embedded dashboard.';
    end if;
    if (new.id, new.report_ref, new.created_by, new.created_at, new.request_id)
       is distinct from (old.id, old.report_ref, old.created_by, old.created_at, old.request_id) then
      raise exception using errcode = 'PT403', message = 'immutable_field', detail = 'Identifiers and the author cannot be edited.';
    end if;
  end if;
  -- Removal is stamped with the server's clock and the remover, whatever the request said.
  if new.archived_at is not null and old.archived_at is null then
    new.archived_at := now();
    new.archived_by := app.uid();
  end if;
  new.version := old.version + 1;
  new.updated_by := coalesce(app.uid(), old.updated_by);
  new.updated_at := now();
  return new;
end $$;

create trigger report_links_before_write before insert or update on public.report_links
  for each row execute function public.report_links_before_write();

-- A report about a project shows in the project's History, like a linked document.
alter table public.project_events drop constraint project_events_event_type_check;
alter table public.project_events add constraint project_events_event_type_check check (event_type in (
  'created', 'note', 'stage_change', 'delivery_change', 'next_action_set', 'field_change',
  'work_created', 'work_updated', 'document_linked', 'proposal_submitted', 'proposal_withdrawn',
  'review_approved', 'review_rejected', 'job_code_issued', 'payment_state_changed', 'imported',
  'acceptance_submitted', 'acceptance_verified', 'acceptance_rejected', 'receipt_recorded',
  'report_linked', 'report_unlinked'));

create or replace function public.report_links_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null and tg_op = 'INSERT' then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source)
    values (new.project_id, 'report_linked', new.created_by, new.created_at,
            'Connected Holistics report ' || new.report_ref || ': ' || new.title,
            jsonb_build_object('report_link_id', new.id, 'url', new.url), 'app');
  elsif tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null and old.project_id is not null then
    insert into public.project_events (project_id, event_type, actor_id, occurred_at, summary, details, source)
    values (old.project_id, 'report_unlinked', new.archived_by, new.archived_at,
            'Removed the link to Holistics report ' || new.report_ref || ': ' || new.title,
            jsonb_build_object('report_link_id', new.id), 'app');
  end if;
  return null;
end $$;

create trigger report_links_after_write after insert or update on public.report_links
  for each row execute function public.report_links_after_write();

alter table public.report_links enable row level security;
revoke all on public.report_links from public, kk_app;
revoke all on sequence public.report_ref_seq from public, kk_app;
grant select on public.report_links to kk_app;
grant insert (title, purpose, url, link_kind, context_type, client_id, project_id, embed_object, request_id) on public.report_links to kk_app;
grant update (title, purpose, url, link_kind, context_type, client_id, project_id, embed_object, archived_at) on public.report_links to kk_app;
create policy report_readers on public.report_links for select to kk_app
  using (public.has_any_role(array['bd', 'account', 'finance', 'admin']));
create policy report_connect on public.report_links for insert to kk_app
  with check (public.has_any_role(array['bd', 'account', 'finance', 'admin']));
create policy report_change on public.report_links for update to kk_app
  using (public.has_any_role(array['bd', 'account', 'finance', 'admin'])) with check (true);
revoke all on function public.report_links_before_write(), public.report_links_after_write() from public, kk_app;

-- Report links are demo data: the seed captures them in the starting state, and the demo reset restores them.
-- They are not part of the governed figures, so they get no data-version trigger (a link never changes a number).
create or replace function public.business_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array['import_rows', 'import_batches', 'receipt_allocations', 'receipts', 'acceptance_milestones', 'project_events',
               'client_events', 'money_revisions', 'change_requests', 'cost_lines', 'service_lines', 'documents', 'work_items',
               'report_links', 'projects', 'clients', 'services']
$$;
revoke all on function public.business_tables() from public;
-- A baseline captured before this migration has no copy of the new table: give it an empty one, so a reset works
-- until the next seed captures the real starting state.
do $$ begin
  if to_regclass('demo_baseline.meta') is not null and to_regclass('demo_baseline.report_links') is null then
    create table demo_baseline.report_links as table public.report_links with no data;
  end if;
end $$;
