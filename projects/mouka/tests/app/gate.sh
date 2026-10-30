#!/bin/sh
# gate.sh t3 t4 ... : run each browser test; print its verdict; exit 1 on the first failure.
# default = the official apps/mouka; APP_URL=http://127.0.0.1:7878/apps/archive/wealthfolio/app runs the archived Wealthfolio checks (t3…t12). APP_URL=http://127.0.0.1:7878/apps/archive/origin-style/app ./gate.sh ... runs the same checks on the sibling skin.
SP=$(cd "$(dirname "$0")" && pwd)
cd "$SP" || exit 2
for t in "$@"; do
  node drive.mjs "${APP_URL:-http://127.0.0.1:7878/apps/mouka/app}" "$SP/$t" "$(cat "$SP/$t.json")" > "$SP/$t.log" 2>&1
  rc=$?
  echo "$t: $(tail -1 "$SP/$t.log")"
  [ $rc -eq 0 ] || { grep -E 'FAIL|ERROR' "$SP/$t.log" | head -5; exit 1; }
done
