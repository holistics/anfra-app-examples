#!/bin/sh
# Render apps/shared/driftmouth-map.svg to the JPG the app loads (2x for sharp screens).
set -e
cd "$(dirname "$0")/.."
python3 tools/build_map.py
OUT=$(mktemp -d)
google-chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1440,900 \
  --screenshot="$OUT/map.png" "file://$PWD/apps/shared/driftmouth-map.svg" >/dev/null 2>&1
convert "$OUT/map.png" -quality 88 apps/shared/driftmouth-map.jpg
rm -rf "$OUT"
echo "wrote apps/shared/driftmouth-map.jpg"
