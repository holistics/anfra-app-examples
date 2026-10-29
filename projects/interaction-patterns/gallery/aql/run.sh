#!/bin/sh
# usage: run.sh name...   runs name.aql with name.input.json / name.tz if present; prints status + first rows
D="$(cd "$(dirname "$0")" && pwd)"; cd "$D/../../anfra" || exit 1
for n in "$@"; do
  set -- -d ecommerce
  [ -f "$D/$n.input.json" ] && set -- "$@" --input "$(cat "$D/$n.input.json")"
  [ -f "$D/$n.tz" ] && set -- "$@" --timezone "$(cat "$D/$n.tz")"
  out=$(anfra query "$@" < "$D/$n.aql" 2>&1)
  case "$out" in
    Error*) echo "## $n: ERROR"; echo "$out" | head -c 900; echo;;
    *) echo "## $n: OK"; echo "$out" | sed -n '/^result:/,/^sql:/p' | sed '1d;$d' | tr -s ' ' | paste -sd' ' | sed 's/ - - /\n  /g' | head -${ROWS:-8}; echo;;
  esac
done
