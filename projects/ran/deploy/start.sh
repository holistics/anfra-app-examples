#!/usr/bin/env bash
# The deploy image's processes: Postgres (the sample database, baked in at build), anfra answering
# the core API on loopback, and Ran's host on $PORT. If any one exits, the container exits.
set -euo pipefail
pg_ctl -D "$PGDATA" -w -l /tmp/postgres.log start
(cd /srv/ran && exec anfra serve --no-apps --addr 127.0.0.1:7878) &
(cd /srv/ran/host && NODE_ENV=production ANFRA_REPO=/srv/ran ANFRA_URL=http://127.0.0.1:7878 \
   HOSTNAME=0.0.0.0 TRUST_PROXY=1 exec node dist/server/main.js) &
wait -n
echo "a process exited; stopping" >&2
exit 1
