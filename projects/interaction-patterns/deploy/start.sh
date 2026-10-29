#!/bin/sh
# The gallery on :8080 (its pages, /api/run and the core.* calls the live apps make),
# with anfra serving /repo on loopback behind it. The container stops when either stops.
set -u
cd /repo || exit 1
anfra serve --no-apps --no-watch --addr 127.0.0.1:7878 &
app_pid=$!
until node -e "fetch('http://127.0.0.1:7878/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"; do
  kill -0 "$app_pid" 2>/dev/null || exit 1
  sleep 0.5
done
HOST=0.0.0.0 PORT=8080 ANFRA_URL=http://127.0.0.1:7878 node /opt/gallery/server.mjs /opt/gallery/site &
web_pid=$!
trap 'kill "$app_pid" "$web_pid" 2>/dev/null; exit 0' TERM INT
# Whichever stops first takes the other down, so proto restarts the pair.
while kill -0 "$app_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do sleep 2; done
kill "$app_pid" "$web_pid" 2>/dev/null
exit 1
