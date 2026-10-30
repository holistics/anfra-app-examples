"""Narration with Kokoro (local). Writes assets/vo/<id>.wav, durations.json, words.json.
    ../../anfra-ai-margin/video/.venv/bin/python vo_gen.py
"""
import json, pathlib
import numpy as np, soundfile as sf
from kokoro import KPipeline

ROOT = pathlib.Path(__file__).resolve().parent
script = json.loads((ROOT / "script.json").read_text())
out = ROOT / "assets" / "vo"
out.mkdir(parents=True, exist_ok=True)
pipe = KPipeline(lang_code="a")
SR = 24000
durations, words = {}, {}
for seg in script["segments"]:
    chunks, wl, offset = [], [], 0.0
    for r in pipe(seg["text"], voice=script["voice"], speed=1.0):
        audio = r.audio.numpy() if hasattr(r.audio, "numpy") else np.asarray(r.audio)
        for t in (r.tokens or []):
            if t.start_ts is not None and t.text.strip():
                wl.append({"text": t.text + (t.whitespace or ""), "start": round(offset + t.start_ts, 3), "end": round(offset + (t.end_ts or t.start_ts), 3)})
        chunks.append(audio)
        offset += len(audio) / SR
    audio = np.concatenate(chunks)
    sf.write(out / f"{seg['id']}.wav", audio, SR)
    durations[seg["id"]] = round(len(audio) / SR, 3)
    words[seg["id"]] = wl
    print(f"{seg['id']}: {durations[seg['id']]}s")
(out / "durations.json").write_text(json.dumps(durations, indent=2))
(out / "words.json").write_text(json.dumps(words, indent=2))
