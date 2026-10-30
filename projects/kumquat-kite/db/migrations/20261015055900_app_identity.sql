-- Kumquat Kite POC on plain PostgreSQL (feedback 05): the app-owned identity layer that replaced Supabase Auth.
--
-- People are the six fixed demo personas (public.profiles, seeded with stable IDs); there is no sign-up, password or
-- token in the database. The app server runs every request in its own transaction, as the role kk_app, and names the
-- persona acting with a transaction-local setting:
--     select set_config('app.user_id', '<persona uuid>', true);
-- and, for a routine edit, the version the person edited:
--     select set_config('app.expected_version', '<n>', true);
-- Both end with the transaction, so a pooled connection never carries one persona's identity into the next request.
-- Every permission check (row-level security, the field-ownership triggers, the workflow functions) reads the persona
-- through app.uid().

create schema if not exists app;

create or replace function app.uid() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- The app server's role. It owns nothing, so row-level security and the triggers apply to everything it does. It is
-- created without a login here; scripts/migrate.mjs gives it its login and password from the environment
-- (KK_APP_DB_PASSWORD), so no secret is stored in a migration. Roles belong to the whole PostgreSQL server, so the
-- demo and test databases share it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kk_app') then
    create role kk_app nologin noinherit;
  end if;
end $$;

-- app.uid() only reads the current transaction's setting, so every role may call it (the reporting role included).
grant usage on schema app to kk_app, public;
