#!/bin/sh
# Runs every gallery/aql/*.aql (with its input) and writes {name:{aql,input,result}} to aql-results.json.
# Needs the anfra CLI. Queries the ecommerce Dataset in anfra/: sh gallery/collect.sh
HERE=$(cd "$(dirname -- "$0")" && pwd); A=$HERE/aql; OUT=$HERE/aql-results.json
cd "$HERE/../anfra" || exit 1
tmp=$(mktemp -d)
for f in $A/[0-9]*.aql; do
  n=$(basename "$f" .aql); set -- -d ecommerce
  [ -f "$A/$n.input.json" ] && set -- "$@" --input "$(cat "$A/$n.input.json")"
  [ -f "$A/$n.tz" ] && set -- "$@" --timezone "$(cat "$A/$n.tz")"
  anfra query "$@" < "$f" > "$tmp/$n.yaml" 2>&1
done
uv run -q --no-project --with pyyaml python3 - "$A" "$tmp" "$OUT" <<'PY'
import sys, os, json, yaml
A, T, OUT = sys.argv[1:4]
res = {}
for fn in sorted(os.listdir(T)):
    n = fn[:-5]
    raw = open(os.path.join(T, fn)).read()
    entry = {"aql": open(os.path.join(A, n + ".aql")).read().strip()}
    ip = os.path.join(A, n + ".input.json")
    tz = os.path.join(A, n + ".tz")
    if os.path.exists(tz):
        entry["timezone"] = open(tz).read().strip()
    if os.path.exists(ip):
        d = json.load(open(ip))
        d = {k: v for k, v in d.items() if v}
        entry["input"] = json.dumps(d, indent=2)
    if raw.startswith("Error"):
        entry["error"] = raw.strip()[:400]
    else:
        y = yaml.safe_load(raw)
        entry["result"] = {"fields": y["result"]["fields"], "records": y["result"]["records"][:40]}
    res[n] = entry
json.dump(res, open(OUT, "w"))
print({k: ("ERR" if "error" in v else len(v["result"]["records"])) for k, v in res.items()})
PY
rm -rf "$tmp"
