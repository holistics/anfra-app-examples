#!/usr/bin/env bash
# Lip-sync every narration segment onto the portrait with SadTalker (local). Output: assets/talk/<id>.mp4
set -euo pipefail
cd "$(dirname "$0")/models/SadTalker"
for id in intro hook trend noah trust whatif copilot outro; do
  [ -f "../../assets/talk/$id.mp4" ] && continue
  rm -rf "../../assets/talk/_$id"
  .venv/bin/python inference.py --driven_audio "../../assets/vo/$id.wav" --source_image ../../assets/face.png \
    --result_dir "../../assets/talk/_$id" --size 512 --preprocess crop --enhancer gfpgan --still --expression_scale 1.0 >/dev/null 2>&1
  mv "$(ls ../../assets/talk/_$id/*.mp4 | head -1)" "../../assets/talk/$id.mp4"
  rm -rf "../../assets/talk/_$id"
  echo "done $id"
done
