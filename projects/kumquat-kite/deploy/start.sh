#!/bin/sh
# Container start (see Dockerfile). Everything comes from the environment; nothing here prints a secret.
#   1. Migrations, when the database owner's password is given (KK_DB_OWNER_PASSWORD, or DATABASE_PASSWORD from the
#      platform's database): only files not yet applied run, each recorded in app.schema_migrations. A migration never
#      deletes or resets a record. Without the password the database must already be migrated (npm run db:migrate).
#   2. KK_SEED_IF_EMPTY=1 loads the synthetic demo data into a database that has no project yet (a first start on a new
#      database). A database with any project is left exactly as it is, so a restart never resets the demo.
#   3. The app server, which writes anfra's data source from the same settings and starts the private anfra core. Without
#      ANFRA_DB_PASSWORD it still serves every screen and form, and the governed figures say why they are off.
set -eu
if [ -n "${KK_DB_OWNER_PASSWORD:-}${DATABASE_PASSWORD:-}" ]; then
  # The database may still be starting (a new one first initialises its volume): try for about two minutes.
  n=1
  until node scripts/migrate.mjs; do
    if [ "$n" -ge 12 ]; then echo "error: the migrations could not run (see above)" >&2; exit 1; fi
    echo "the database is not ready yet; trying again in 10 s ($n/11)" >&2
    n=$((n + 1))
    sleep 10
  done
else
  echo "note: no database owner password (KK_DB_OWNER_PASSWORD), so no migration runs at start; the database must already be migrated." >&2
fi
if [ "${KK_SEED_IF_EMPTY:-0}" = "1" ]; then
  node scripts/seed_demo.mjs --if-empty
fi
if [ -z "${ANFRA_DB_PASSWORD:-}" ]; then
  echo "warning: ANFRA_DB_PASSWORD is not set, so governed figures are off." >&2
fi
exec node server/server.mjs
