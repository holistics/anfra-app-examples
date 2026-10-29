#!/bin/bash
# anfra serve for HollyDeals, on the DuckDB file in /repo/data.
set -eu
exec anfra serve --addr 0.0.0.0:7878 --no-watch --no-mcp
