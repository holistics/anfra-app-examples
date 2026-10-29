#!/bin/sh
# j.sh name : print records as compact JSON
D="$(cd "$(dirname "$0")" && pwd)"; cd "$D/../../anfra" || exit 1
n=$1; set -- -d ecommerce
[ -f "$D/$n.input.json" ] && set -- "$@" --input "$(cat "$D/$n.input.json")"
anfra query "$@" < "$D/$n.aql" 2>&1 | uv run -q --no-project --with pyyaml python3 -c 'import sys,yaml,json; d=yaml.safe_load(sys.stdin); print(json.dumps(d["result"]["records"],separators=(",",":")))'
