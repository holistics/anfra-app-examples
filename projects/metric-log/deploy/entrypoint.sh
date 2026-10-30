#!/bin/sh
# The canal-query sidecar looks up its own user at start and dies if the uid has no passwd entry.
# The platform may run the container as any uid, so add one for the current uid when it is missing.
# Approvals commit to git, so the demo repo is initialised on first start (a restart resets it).
set -e
uid="$(id -u)"
if ! getent passwd "$uid" >/dev/null 2>&1; then
  echo "app:x:${uid}:0:app:${HOME}:/bin/sh" >> /etc/passwd
fi
cd /app
if [ ! -d .git ]; then
  git init -q
  git add -A
  git commit -q -m "Demo repo"
fi
exec "$@"
