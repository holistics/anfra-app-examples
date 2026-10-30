-- Kumquat Kite lightweight POC — reset the demo data to its starting state, from inside the app (Admin only).
-- The seed captures the starting state right after it loads the demo: public.capture_demo_baseline copies every
-- business table, the reference sequences and the demo personas' roles into schema demo_baseline (no grants: the
-- app role cannot read it). public.reset_demo_data restores them in one transaction, with triggers off for
-- the copy (the rows are the seed's own, already checked when they were first written), then logs the reset and
-- moves the data version so cached figures are dropped. People are not business data: the profile, roles and role
-- audit of anyone who is not a demo persona are never touched, and the demo personas get their seed roles back.
create schema if not exists demo_baseline;
revoke all on schema demo_baseline from public, kk_app;

create table public.demo_resets (
  id                   bigint generated always as identity primary key,
  reset_by             uuid not null references public.profiles(user_id),
  reset_at             timestamptz not null default now(),
  baseline_captured_at timestamptz not null,
  rows_restored        integer not null
);
alter table public.demo_resets enable row level security;
revoke all on public.demo_resets from public, kk_app;
grant select on public.demo_resets to kk_app;
create policy admin_read on public.demo_resets for select to kk_app using (public.has_role('admin'));

-- The sequences that number business rows (identity columns and the NP-/CL-/WI-… references), owned by their columns.
create or replace function public.business_sequences() returns setof regclass
language sql stable set search_path = '' as $$
  select distinct s.oid::regclass
  from pg_catalog.pg_class s
  join pg_catalog.pg_depend d on d.objid = s.oid and d.classid = 'pg_catalog.pg_class'::regclass and d.deptype in ('a', 'i')
  join pg_catalog.pg_class t on t.oid = d.refobjid
  where s.relkind = 'S' and t.relnamespace = 'public'::regnamespace and t.relname = any (public.business_tables())
$$;

revoke all on function public.business_sequences() from public;

-- Seed only (postgres / service role): capture the current business data as the demo's starting state.
create or replace function public.capture_demo_baseline(p_demo_users uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t text; seq regclass; n bigint; total bigint := 0; v_last bigint; v_called boolean;
begin
  foreach t in array public.business_tables() loop
    execute format('drop table if exists demo_baseline.%I', t);
    execute format('create table demo_baseline.%I as table public.%I', t, t);
    execute format('select count(*) from demo_baseline.%I', t) into n;
    total := total + n;
  end loop;
  drop table if exists demo_baseline.sequences;
  create table demo_baseline.sequences (seq text primary key, last_value bigint not null, is_called boolean not null);
  for seq in select * from public.business_sequences() loop
    execute format('select last_value, is_called from %s', seq) into v_last, v_called;
    insert into demo_baseline.sequences values (seq::text, v_last, v_called);
  end loop;
  drop table if exists demo_baseline.demo_users;
  create table demo_baseline.demo_users as select unnest(p_demo_users) as user_id;
  drop table if exists demo_baseline.role_memberships;
  create table demo_baseline.role_memberships as table public.role_memberships with no data;
  insert into demo_baseline.role_memberships select * from public.role_memberships where user_id = any (p_demo_users);
  drop table if exists demo_baseline.meta;
  create table demo_baseline.meta as select now() as captured_at, total as business_rows, cardinality(p_demo_users) as demo_users;
  return jsonb_build_object('business_rows', total, 'sequences', (select count(*) from demo_baseline.sequences),
                            'demo_users', cardinality(p_demo_users));
end $$;
revoke all on function public.capture_demo_baseline(uuid[]) from public, kk_app;

-- Admin: put every business table back to the captured starting state.
create or replace function public.reset_demo_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t text; cols text; n bigint; total bigint := 0; v_captured timestamptz; r record;
begin
  if not public.has_role('admin') then
    perform public.forbid('Only Admin can reset the demo data.');
  end if;
  if to_regclass('demo_baseline.meta') is null then
    raise exception using errcode = 'PT409', message = 'no_demo_baseline',
      detail = 'The demo starting state has not been captured yet: run npm run seed:reset once.';
  end if;
  select captured_at into v_captured from demo_baseline.meta;
  -- Triggers (audit events, version checks, field ownership) and foreign-key checks stay off for this copy only.
  set local session_replication_role = replica;
  execute 'truncate ' || (select string_agg(format('public.%I', x), ', ') from unnest(public.business_tables()) x) || ' restart identity';
  foreach t in array public.business_tables() loop
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into cols
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t and c.is_generated = 'NEVER'
      and exists (select 1 from information_schema.columns b where b.table_schema = 'demo_baseline' and b.table_name = t and b.column_name = c.column_name);
    execute format('insert into public.%I (%s) overriding system value select %s from demo_baseline.%I', t, cols, cols, t);
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  for r in select seq, last_value, is_called from demo_baseline.sequences loop
    if to_regclass(r.seq) is not null then perform setval(r.seq::regclass, r.last_value, r.is_called); end if;
  end loop;
  delete from public.role_memberships where user_id in (select user_id from demo_baseline.demo_users);
  insert into public.role_memberships select * from demo_baseline.role_memberships;
  set local session_replication_role = origin;
  update public.data_version set version = version + 1, changed_at = now() where id;
  insert into public.demo_resets (reset_by, baseline_captured_at, rows_restored) values (app.uid(), v_captured, total);
  return jsonb_build_object('rows_restored', total, 'baseline_captured_at', v_captured, 'reset_at', now());
end $$;
revoke all on function public.reset_demo_data() from public;
grant execute on function public.reset_demo_data() to kk_app;
