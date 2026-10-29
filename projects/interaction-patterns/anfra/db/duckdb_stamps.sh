#!/bin/sh
# The stamp for db/duckdb/ecommerce.duckdb, so it never drifts silently from its build inputs.
# The stamp records the DuckDB version in the file's header and the sha256 of the inputs and of
# the file. POSIX sh and sha256sum only, so the Docker build runs the check too.
#   sh db/duckdb_stamps.sh [check]   exits 1 naming what changed, and how to rebuild
#   sh db/duckdb_stamps.sh write     after a build (db/build_ecommerce_duckdb.py runs it)
# Trimmed from anfra-demo-data's script of the same name, with the same stamp format.
set -eu
cd "$(dirname -- "$0")/.."
PIN=v1.4.2  # the DuckDB anfra bundles; keep in step with the build script's pin
inputs='db/build_ecommerce_duckdb.py db/seed.dump.sql db/seed.sql'
bin=db/duckdb/ecommerce.duckdb
rebuild='uv run --no-project --with duckdb==1.4.2 python db/build_ecommerce_duckdb.py (from anfra/)'

if command -v sha256sum >/dev/null 2>&1; then
  sha() { sha256sum < "$1" | cut -c1-64; }
else
  sha() { shasum -a 256 < "$1" | cut -c1-64; }
fi
hash_line() { if [ -f "$1" ]; then echo "$(sha "$1")  $1"; else echo "missing  $1"; fi; }

# The DuckDB library version the file was written by, from its main header (offset 52).
version() {
  [ -f "$1" ] && [ "$(dd if="$1" bs=1 skip=8 count=4 2>/dev/null)" = DUCK ] || { echo none; return; }
  dd if="$1" bs=1 skip=52 count=32 2>/dev/null | tr -d '\000'
}

stamp() {
  echo "# Written by: sh db/duckdb_stamps.sh write ecommerce. Check: sh db/duckdb_stamps.sh"
  echo "duckdb $(version "$bin")"
  for f in $inputs $bin; do hash_line "$f"; done
}

case ${1:-check} in
  check)
    v=$(version "$bin")
    [ "$v" = "$PIN" ] || { echo "$bin was written by DuckDB $v, not $PIN. Rebuild: $rebuild" >&2; exit 1; }
    if [ -f "$bin.stamp" ] && [ "$(stamp)" = "$(cat "$bin.stamp")" ]; then echo "duckdb stamp ok: ecommerce"; exit 0; fi
    changed=
    for f in $inputs $bin; do [ -f "$bin.stamp" ] && grep -qxF "$(hash_line "$f")" "$bin.stamp" || changed="$changed $f"; done
    echo "$bin is stale, changed since its stamp:${changed:- its comment line}. Rebuild: $rebuild" >&2
    exit 1 ;;
  write)
    v=$(version "$bin")
    [ "$v" = "$PIN" ] || { echo "$bin was written by DuckDB $v, not $PIN: not stamped" >&2; exit 1; }
    stamp > "$bin.stamp"
    echo "stamped $bin.stamp" ;;
  *) echo 'usage: sh db/duckdb_stamps.sh [check|write]' >&2; exit 2 ;;
esac
