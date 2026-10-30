#!/bin/sh
# anfra has no authentication, so it listens on loopback only; anfra-host-example on :5173 passes on
# just the operations a Data App needs, rate-limited per visitor. The container exits when either
# process stops, so the platform restarts it.
# ANFRA_SITE_URL: the public origin that link previews and export links name.
set -u
anfra_addr=127.0.0.1:7878
site_url="${ANFRA_SITE_URL:-https://diabetes-visit-prep.pages.holistics.dev}"
anfra_pid='' host_pid=''
stop() {
  trap '' TERM INT
  [ -n "$host_pid" ] && kill "$host_pid" 2>/dev/null
  [ -n "$anfra_pid" ] && kill "$anfra_pid" 2>/dev/null
  wait
}
trap 'stop; exit 0' TERM INT
cd /repo || exit 1
ANFRA_SITE_URL="$site_url" anfra serve --no-apps --no-watch --addr "$anfra_addr" &
anfra_pid=$!
# Start the host once anfra answers, so the first requests after a deploy don't fail.
until node -e "fetch('http://$anfra_addr/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"; do
  kill -0 "$anfra_pid" 2>/dev/null || { echo 'anfra: stopped before it answered'; exit 1; }
  sleep 1
done
# HOSTNAME is set explicitly: Docker sets it to the container ID.
NODE_ENV=production ANFRA_REPO=/repo ANFRA_URL="http://$anfra_addr" ANFRA_SITE_URL="$site_url" PORT=5173 HOSTNAME=0.0.0.0 \
  QUERY_RATE_LIMIT="${QUERY_RATE_LIMIT:-600}" TRUST_PROXY="${TRUST_PROXY:-1}" \
  node /opt/anfra-host/dist/server/main.js &
host_pid=$!
# POSIX sh has no `wait -n`: poll both, waiting on a background sleep so the trap still runs.
while kill -0 "$anfra_pid" 2>/dev/null && kill -0 "$host_pid" 2>/dev/null; do
  sleep 1 &
  wait $!
done
echo 'anfra or the host stopped; stopping the other'
stop
exit 1
