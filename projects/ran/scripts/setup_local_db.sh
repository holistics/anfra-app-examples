#!/usr/bin/env bash
# Creates the local `garmin` Postgres database and its two roles, and writes their
# credentials to the git-ignored .env (sync) and .anfra/data_sources.yml (Anfra).
# Run once per machine, as a Postgres superuser. Safe to re-run: it rotates the passwords.
set -euo pipefail
cd "$(dirname "$0")/.."

PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}"
DB=garmin
sync_pw="$(openssl rand -hex 24)"
reader_pw="$(openssl rand -hex 24)"

psql -h "$PGHOST" -p "$PGPORT" -d postgres -v ON_ERROR_STOP=1 -q \
  -v sync_pw="$sync_pw" -v reader_pw="$reader_pw" <<'SQL'
select format('create role garmin_sync login password %L', :'sync_pw')
  where not exists (select from pg_roles where rolname = 'garmin_sync') \gexec
select format('create role anfra_reader login password %L', :'reader_pw')
  where not exists (select from pg_roles where rolname = 'anfra_reader') \gexec
alter role garmin_sync password :'sync_pw';
alter role anfra_reader password :'reader_pw';
select 'create database garmin owner garmin_sync'
  where not exists (select from pg_database where datname = 'garmin') \gexec
SQL

psql -h "$PGHOST" -p "$PGPORT" -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists raw authorization garmin_sync;
create schema if not exists garmin authorization garmin_sync;
create schema if not exists app authorization garmin_sync;
revoke all on database garmin from public;
grant connect on database garmin to anfra_reader;
grant usage on schema garmin, app to anfra_reader;
grant select on all tables in schema app to anfra_reader;
alter default privileges for role garmin_sync in schema app grant select on tables to anfra_reader;
grant select on all tables in schema garmin to anfra_reader;
alter default privileges for role garmin_sync in schema garmin grant select on tables to anfra_reader;
alter role anfra_reader set default_transaction_read_only = on;
SQL

# .env for the sync job (keeps any other keys already in it)
touch .env
grep -v '^DATABASE_URL=' .env > .env.tmp || true
echo "DATABASE_URL=postgresql://garmin_sync:${sync_pw}@${PGHOST}:${PGPORT}/${DB}" >> .env.tmp
mv .env.tmp .env && chmod 600 .env

# Anfra's data source
mkdir -p .anfra
cat > .anfra/data_sources.yml <<YML
# Local data source; git-ignored. See data_sources.yml.example.
data_sources:
  garmin:
    type: postgresql
    connection:
      host: ${PGHOST}
      port: ${PGPORT}
      user: anfra_reader
      dbname: ${DB}
      password: ${reader_pw}
YML
chmod 600 .anfra/data_sources.yml
echo "Database '$DB' ready; credentials written to .env and .anfra/data_sources.yml"
