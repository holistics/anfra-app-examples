"""Read the dataset's metrics and the models' fields from the AML and write them into the
composer page, so the side panels can show each figure as the governed metric it is: its
definition, what it is built from, and the raw columns at the bottom.

The page carries the result between /*MT:start*/ and /*MT:end*/. Run it after changing a
metric or model (regen.sh does); it only rewrites that one line.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "apps" / "composer.html"


def field(body, key):
    m = re.search(rf"\b{key}:\s*'''(.*?)'''|\b{key}:\s*'(.*?)'", body, re.S)
    return (m.group(1) or m.group(2)).strip() if m else ""


def load_models():
    models, fields = {}, {}
    for path in sorted((ROOT / "models").glob("*.aml")):
        text = path.read_text()
        head = re.match(r"\s*Model\s+(\w+)\s*\{", text)
        if not head:
            continue
        name = head.group(1)
        kind = field(text, "type")
        table = field(text, "table_name")
        reads = []
        if kind == "query":
            q = re.search(r"query:\s*@sql(.*?);;", text, re.S)
            sql = q.group(1) if q else ""
            ctes = set(re.findall(r"\b(\w+)\s+as\s*\(", sql))
            reads = sorted({t for t in re.findall(r"\b(?:from|join)\s+(\w+)", sql, re.I) if t not in ctes})
        models[name] = {"label": field(text, "label"), "type": kind, "table": table, "reads": reads}
        for m in re.finditer(r"\n  (dimension|measure)\s+(\w+)\s*\{(.*?)\n  \}", text, re.S):
            fk, fname, body = m.groups()
            d = re.search(r"definition:\s*@sql(.*?);;", body, re.S)
            sql = d.group(1).strip() if d else ""
            cols = sorted(set(re.findall(r"#SOURCE\.(\w+)", sql)) - {fname})  # a field that is just its own column has nothing under it
            shown = re.sub(r"\{\{\s*#SOURCE\.(\w+)\s*\}\}", r"\1", sql)
            shown = re.sub(r"\s+", " ", shown)
            src = table if kind == "table" else name
            fields[f"{name}.{fname}"] = {
                "l": field(body, "label"), "k": fk, "s": shown,
                "c": [f"{src}.{c}" for c in cols], "x": field(body, "description"),
                "t": "table" if kind == "table" else "query",
            }
    return models, fields


def load_metrics(fields):
    text = (ROOT / "datasets" / "perfume_composer.dataset.aml").read_text()
    blocks = {m.group(1): m.group(2) for m in re.finditer(r"\n  metric\s+(\w+)\s*\{(.*?)\n  \}", text, re.S)}
    names = set(blocks)
    metrics = {}
    for name, body in blocks.items():
        d = re.search(r"definition:\s*@aql(.*?);;", body, re.S)
        aql = re.sub(r"\s+", " ", d.group(1)).strip() if d else ""
        bare = re.sub(r"\|\s*exclude_grains\([^)]*\)", "", aql)
        fs = [f for f in dict.fromkeys(re.findall(r"\b(\w+\.\w+)\b", bare)) if f in fields]
        refs = [i for i in dict.fromkeys(re.findall(r"(?<![\w.])([a-z_]\w*)(?![\w.(:])", bare)) if i in names and i != name]
        metrics[name] = {"l": field(body, "label"), "d": aql, "x": field(body, "description"), "r": refs, "f": fs}
    return metrics


def main():
    models, fields = load_models()
    metrics = load_metrics(fields)
    used = {f for m in metrics.values() for f in m["f"]}
    data = {"metrics": metrics, "fields": {k: v for k, v in fields.items() if k in used}, "models": models}
    blob = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    page = PAGE.read_text()
    new, n = re.subn(r"/\*MT:start\*/.*?/\*MT:end\*/", lambda _m: f"/*MT:start*/const MT = {blob};/*MT:end*/", page, flags=re.S)
    if not n:
        raise SystemExit("markers /*MT:start*/ ... /*MT:end*/ not found in composer.html")
    PAGE.write_text(new)
    print(f"metric tree: {len(metrics)} metrics, {len(data['fields'])} model fields -> {PAGE.name}")


if __name__ == "__main__":
    main()
