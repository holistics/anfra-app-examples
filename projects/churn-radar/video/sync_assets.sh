#!/usr/bin/env bash
# Copy narration, captions, the take and lip-synced clips (+ first/last stills) into holistics-remotion.
set -euo pipefail
V="$(cd "$(dirname "$0")" && pwd)"
D="$HOME/workspace/holistics/holistics-remotion/public/project-assets/churn-radar"
mkdir -p "$D/vo" "$D/talk"
cp "$V/raw/take.mp4" "$D/"
cp "$V"/assets/vo/*.wav "$D/vo/"
python3 "$V/captions.py" "$D/captions"
for v in "$V"/assets/talk/*.mp4; do
  b="$D/talk/$(basename "$v")"
  cp "$v" "$b"
  ffmpeg -y -loglevel error -i "$b" -frames:v 1 "${b%.mp4}_first.png"
  ffmpeg -y -loglevel error -sseof -0.2 -i "$b" -frames:v 1 -update 1 "${b%.mp4}_last.png"
done
ls "$D/talk" | grep -c mp4
