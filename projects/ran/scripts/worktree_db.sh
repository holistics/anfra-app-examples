#!/usr/bin/env bash
# Give a git worktree its own copy of the garmin database, so parallel work can migrate views
# without clobbering each other. Run from inside the worktree:
#
#   scripts/worktree_db.sh <name> <main-repo-path>
#
# Creates database garmin_<name> as a copy of garmin (data included), and writes this worktree's
# git-ignored .env and .anfra/data_sources.yml from the main repo's, pointing at the copy.
# Never runs a Garmin sync. Drop the copy afterwards with: dropdb garmin_<name>
set -euo pipefail
name="${1:?usage: worktree_db.sh <name> <main-repo-path>}"
main="${2:?usage: worktree_db.sh <name> <main-repo-path>}"
db="garmin_${name//[^a-zA-Z0-9_]/_}"

dropdb --if-exists "$db"
createdb -O garmin_sync "$db"
pg_dump garmin | psql -q -v ON_ERROR_STOP=1 "$db" >/dev/null

mkdir -p .anfra
sed -E "s#(postgresql://[^/]+/)garmin\$#\1${db}#" "$main/.env" > .env
sed -E "s#^([[:space:]]*dbname:[[:space:]]*)garmin[[:space:]]*\$#\1${db}#" "$main/.anfra/data_sources.yml" > .anfra/data_sources.yml
chmod 600 .env .anfra/data_sources.yml
grep -q "/${db}\$" .env && grep -q "dbname: ${db}\$" .anfra/data_sources.yml || { echo "failed to point config at $db" >&2; exit 1; }
echo "Database $db ready; .env and .anfra/data_sources.yml point at it."
