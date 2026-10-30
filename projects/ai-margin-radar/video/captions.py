"""Remotion caption files from Kokoro word timings: assets/vo/words.json -> <out>/<id>.json.

Punctuation joins the word before it, and spoken numbers become digits ("six hundred and seventy
dollars" -> "$670"), so captions read like the screen.

    python3 captions.py <out_dir>
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
PHRASES = [
    ("six hundred and seventy dollars", "$670"),
    ("three thousand dollars", "$3,000"),
    ("thirteen thousand dollars", "$13,000"),
    ("thirty thousand dollars", "$30,000"),
    ("a hundred and twenty", "120"),
    ("eighty-eight percent", "88%"),
    ("sixty-one percent", "61%"),
    ("seventy-five percent", "75%"),
    ("eleven percent", "11%"),
    ("eighty percent", "80%"),
    ("sixty percent", "60%"),
    ("ninety-nine dollar", "$99"),
    ("six months", "6 months"),
    ("a dollar", "$1"),
    ("thirty-five", "35"),
    ("sixty", "60%"),
    ("fifty", "50"),
    ("six", "6"),
]


def words_for(seg):
    out = []  # [text, start, end]
    for w in seg:
        t = w["text"].strip()
        if not t:
            continue
        if re.fullmatch(r"[,.;:!?]+", t) and out:
            out[-1][0] += t
            out[-1][2] = w["end"]
        else:
            out.append([t, w["start"], w["end"]])
    return out


def numbers(ws):
    res, i = [], 0
    while i < len(ws):
        for phrase, rep in PHRASES:
            p = phrase.split()
            chunk = ws[i:i + len(p)]
            if len(chunk) == len(p) and [re.sub(r"[,.;:!?]+$", "", c[0]).lower() for c in chunk] == p:
                tail = re.search(r"[,.;:!?]+$", chunk[-1][0])
                res.append([rep + (tail.group(0) if tail else ""), chunk[0][1], chunk[-1][2]])
                i += len(p)
                break
        else:
            res.append(ws[i])
            i += 1
    return res


def main(out_dir):
    words = json.loads((ROOT / "assets/vo/words.json").read_text())
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for seg_id, seg in words.items():
        caps = [
            {"text": (" " if k else "") + t, "startMs": round(s * 1000), "endMs": round(e * 1000), "timestampMs": round(s * 1000), "confidence": 1}
            for k, (t, s, e) in enumerate(numbers(words_for(seg)))
        ]
        (out / f"{seg_id}.json").write_text(json.dumps(caps, indent=1))
        print(seg_id, "".join(c["text"] for c in caps))


if __name__ == "__main__":
    main(sys.argv[1])
