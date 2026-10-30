#!/usr/bin/env bash
# Lip-sync each narration segment onto the presenter with natural head motion (SadTalker, no --still).
set -euo pipefail
V="$(cd "$(dirname "$0")" && pwd)"
ST="$HOME/workspace/anfra-ai-margin/video/models/SadTalker"
FACE="$HOME/workspace/anfra-ai-margin/video/assets/face.png"
mkdir -p "$V/assets/talk"
cd "$ST"
for id in intro hook why noah trust plays copilot applied outro; do
  [ -f "$V/assets/talk/$id.mp4" ] && continue
  rm -rf "$V/assets/talk/_$id"
  .venv/bin/python inference.py --driven_audio "$V/assets/vo/$id.wav" --source_image "$FACE" \
    --result_dir "$V/assets/talk/_$id" --size 512 --preprocess crop --enhancer gfpgan --pose_style 0 --expression_scale 1.2 >/dev/null 2>&1
  mv "$(ls "$V/assets/talk/_$id"/*.mp4 | head -1)" "$V/assets/talk/$id.mp4"
  rm -rf "$V/assets/talk/_$id"
  echo "done $id"
done
