-- Kumquat Kite lightweight POC — the committed data version.
-- One counter that moves whenever a business table changes (a statement-level trigger on each). The app server's
-- Anfra proxy keys its result cache by it: an Anfra result is reused only for the identical query on the same data
-- version and business date, so any committed change makes the next query run fresh. Read through
-- reporting.data_version by the SELECT-only anfra_reader; nobody writes it except the trigger and the demo reset.

-- Every table of business data: what the data version tracks and what a demo reset restores. People (profiles,
-- role memberships, the role audit) are not business data.
create or replace function public.business_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array['import_rows', 'import_batches', 'receipt_allocations', 'receipts', 'acceptance_milestones', 'project_events',
               'client_events', 'money_revisions', 'change_requests', 'cost_lines', 'service_lines', 'documents', 'work_items',
               'projects', 'clients', 'services']
$$;

revoke all on function public.business_tables() from public;

create table public.data_version (
  id         boolean primary key default true check (id),
  version    bigint not null default 1,
  changed_at timestamptz not null default now()
);
insert into public.data_version (id) values (true) on conflict do nothing;
alter table public.data_version enable row level security;
revoke all on public.data_version from public, kk_app;

create or replace function public.bump_data_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.data_version set version = version + 1, changed_at = now() where id;
  return null;
end $$;
revoke all on function public.bump_data_version() from public, kk_app;

do $$
declare t text;
begin
  foreach t in array public.business_tables() loop
    execute format('drop trigger if exists %I on public.%I', t || '_data_version', t);
    execute format('create trigger %I after insert or update or delete or truncate on public.%I '
                   'for each statement execute function public.bump_data_version()', t || '_data_version', t);
  end loop;
end $$;

create or replace view reporting.data_version as
select version, changed_at from public.data_version;
grant select on reporting.data_version to anfra_reader;
