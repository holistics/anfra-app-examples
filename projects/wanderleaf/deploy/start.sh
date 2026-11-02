#!/bin/bash
# anfra on loopback, Caddy in front on :8080. If either exits, the container exits.
set -eu
export WL_TOKEN=$(printf %s "${WL_PASSWORD:?WL_PASSWORD is not set}" | sha256sum | cut -d' ' -f1)
/home/app/.anfra/bin/anfra serve --addr 127.0.0.1:7878 --no-watch --no-mcp &
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
wait -n
exit 1
