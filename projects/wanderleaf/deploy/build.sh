#!/bin/sh
# Stage anfra + the repo files anfra serve needs, then build the linux/amd64 image.
# Usage: deploy/build.sh <image-tag>
set -eu
TAG=${1:?usage: deploy/build.sh <image-tag>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CTX=$(mktemp -d)
trap 'rm -rf "$CTX"' EXIT
mkdir -p "$CTX/anfra" "$CTX/repo/.anfra" "$CTX/repo/data"
cp -a "$HOME/.anfra/bin" "$HOME/.anfra/sidecars" "$CTX/anfra/"
cp -a "$ROOT/models" "$ROOT/datasets" "$ROOT/apps" "$CTX/repo/"
cp -a "$ROOT/data/wanderleaf.duckdb" "$CTX/repo/data/"
cp -a "$ROOT/.anfra/context_sources.yml" "$CTX/repo/.anfra/"
cat > "$CTX/repo/.anfra/data_sources.yml" <<YML
data_sources:
  wanderleaf:
    type: duckdb
    connection:
      path: /srv/wanderleaf/data/wanderleaf.duckdb
YML
cp -a "$ROOT/deploy/Dockerfile" "$ROOT/deploy/Caddyfile" "$ROOT/deploy/start.sh" "$ROOT/deploy/gate" "$CTX/"
docker build --platform linux/amd64 -t "$TAG" "$CTX"
