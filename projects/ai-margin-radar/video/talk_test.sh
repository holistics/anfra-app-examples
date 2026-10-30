#!/usr/bin/env bash
# Head-motion variants of SadTalker on one line, for picking a livelier presenter.
set -euo pipefail
cd "$(dirname "$0")/models/SadTalker"
OUT=../../assets/talk_tests
run () { # name, extra args
  [ -f "$OUT/$1.mp4" ] && return
  rm -rf "$OUT/_$1"
  .venv/bin/python inference.py --driven_audio ../../assets/vo/hook.wav --source_image ../../assets/face.png \
    --result_dir "$OUT/_$1" --size 512 --enhancer gfpgan "${@:2}" >/dev/null 2>&1
  mv "$(ls $OUT/_$1/*.mp4 | head -1)" "$OUT/$1.mp4"; rm -rf "$OUT/_$1"; echo "done $1"
}
run still      --preprocess crop --still
run pose0      --preprocess crop --pose_style 0  --expression_scale 1.2
run pose12     --preprocess crop --pose_style 12 --expression_scale 1.2
run pose30     --preprocess crop --pose_style 30 --expression_scale 1.2
run full_pose12 --preprocess full --pose_style 12 --expression_scale 1.2
