#!/usr/bin/env bash
# Stage the anfra repo + gateway and build the image for the platform (linux/amd64).
#   deploy/build.sh <image-ref>
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
IMG="${1:?image ref}"
# Stage outside the project: a copy of models/ inside it would make anfra serve see every model twice.
B="${XDG_CACHE_HOME:-$HOME/.cache}/anfra-deploy/ai-margin-radar"
rm -rf "$B" && mkdir -p "$B/repo/.anfra" "$B/repo/data" "$B/repo/apps"
cp -r $ROOT/models $ROOT/datasets "$B"/repo/
cp $ROOT/apps/ai-margin-radar.html "$B"/repo/apps/
cp $ROOT/data/inkwell.duckdb "$B"/repo/data/
cp $ROOT/.anfra/context_sources.yml "$B"/repo/.anfra/
cat > "$B"/repo/.anfra/data_sources.yml <<'YML'
data_sources:
  inkwell:
    type: duckdb
    connection:
      path: /ai-margin-radar/data/inkwell.duckdb
YML
(cd gateway && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$B/gateway" .)
podman build --platform linux/amd64 --label org.opencontainers.image.created="$(date -u +%FT%TZ)" -f Containerfile -t "$IMG" "$B"
