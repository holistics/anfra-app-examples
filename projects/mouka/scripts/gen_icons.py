"""Write apps/mouka/js/ds/icons.js (window.MOUKA_ICONS: key → inner SVG markup) from the icon libraries in scripts/icons.

    cd scripts/icons && npm install && cd -     # once: Lucide + Tabler, build-time only (node_modules never ships)
    python3 -I scripts/gen_icons.py             # after any MAP edit
    python3 -I scripts/gen_icons.py --check     # every MAP file exists and every icon key mouka uses is in MAP; exit 1 on a miss

Lucide is the set; Tabler fills what Lucide lacks (₫). Stroke attributes are stripped so the .i rule in ds/base.css owns
the weight for both (1.5: mouka's thin line, lighter than Lucide's native 2); the ✦ takes its fill from CSS (fill: var(--ai)).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIBS = ROOT / "scripts" / "icons" / "node_modules"
APP = ROOT / "apps" / "mouka"
OUT = APP / "js" / "ds" / "icons.js"
SRC = {  # library → (icon folder, version source, licence)
    "lucide": (LIBS / "lucide-static" / "icons", LIBS / "lucide-static" / "package.json", "ISC · github.com/lucide-icons/lucide"),
    "tabler": (LIBS / "@tabler" / "icons" / "icons" / "outline", LIBS / "@tabler" / "icons" / "package.json", "MIT · github.com/tabler/tabler-icons"),
}

# mouka key → (library, icon name)
L, T = "lucide", "tabler"
MAP = {
    # nav + shell
    "home": (L, "house"), "card": (L, "credit-card"), "cashflow": (L, "arrow-down-up"), "invest": (L, "chart-line"), "forecast": (L, "telescope"),
    "accounts": (L, "wallet"), "defs": (L, "file-text"), "palette": (L, "palette"), "more": (L, "ellipsis"),
    "sidebar": (L, "panel-left-close"),
    # controls
    "chev": (L, "chevron-right"), "down": (L, "chevron-down"), "left": (L, "chevron-left"), "x": (L, "x"),
    "undo": (L, "undo-2"), "redo": (L, "redo-2"), "dots": (L, "ellipsis-vertical"), "check": (L, "check"),
    "search": (L, "search"), "plus": (L, "plus"), "settings": (L, "settings"), "users": (L, "users"), "receipt": (L, "receipt"), "landmark": (L, "landmark"), "gem": (L, "gem"), "logout": (L, "log-out"), "filter": (L, "list-filter"), "list": (L, "list"), "download": (L, "download"), "info": (L, "info"),
    "eyeoff": (L, "eye-off"), "spark": (L, "sparkle"), "formula": (L, "square-function"), "gauge": (L, "gauge"), "bell": (L, "bell"),
    # segments
    "line": (L, "chart-line"), "area": (L, "chart-area"), "bars": (L, "chart-column"), "cal": (L, "calendar"),
    "dong": (T, "currency-dong"), "percent": (L, "percent"),
    # categories (CAT_ICON in js/origin.js) + flow types (TX_ICON)
    "food": (L, "utensils"), "car": (L, "car"), "bolt": (L, "zap"), "paw": (L, "paw-print"), "heart": (L, "heart"),
    "bag": (L, "shopping-bag"), "repeat": (L, "repeat"), "cap": (L, "graduation-cap"), "tag": (L, "tag"),
    "piggy": (L, "piggy-bank"), "trend": (L, "trending-up"), "question": (L, "circle-question-mark"),
    "dollar": (L, "circle-dollar-sign"), "transfer": (L, "arrow-right-left"),
    # table sort
    "sort-up": (L, "chevron-up"), "sort-down": (L, "chevron-down"), "sort": (L, "chevrons-up-down"),
    # delta pill
    "arrow-up": (L, "arrow-up"), "arrow-down": (L, "arrow-down"),
    # Ask AI (nav, nudges, new chat)
    "ask": (L, "sparkles"), "analyze": (L, "chart-column-big"), "report": (L, "file-chart-column"), "target": (L, "target"),
    "gift": (L, "gift"), "calsync": (L, "calendar-sync"), "newchat": (L, "square-pen"),
    # Spending page (segments: heat grid, list view)
    "heat": (L, "grid-3x3"),
    # Invest page (notes, sort switch)
    "trend-down": (L, "trending-down"), "activity": (L, "activity"), "coins": (L, "coins"), "clock": (L, "clock"),
    # Forecast page (the milestone road)
    "flag": (L, "flag-triangle-right"), "star": (L, "star"), "finish": (L, "flag"),
}

INNER = re.compile(r"<svg\b[^>]*>(.*)</svg>", re.S)
STROKE_ATTR = re.compile(r'\s(?:stroke|stroke-width|stroke-linecap|stroke-linejoin)="[^"]*"')
TABLER_BOX = re.compile(r'<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*/>')
# where mouka names an icon: icon('x') · ic('x') · { icon: 'x' } · data-icon="x" · CAT_ICON / TX_ICON / catIcon fallbacks · (next_up PAGES, gone 18 Oct)
USES = [re.compile(r"\b(?:icon|ic)\(\s*'([\w-]+)'"), re.compile(r"\bicon:\s*'([\w-]+)'"), re.compile(r'data-icon="([\w-]+)"'),
        re.compile(r"^\s*\['\w+', '([\w-]+)', '", re.M)]
DYNAMIC = re.compile(r"(?:CAT_ICON|TX_ICON) = \{(.*?)\};|const catIcon = .*?;", re.S)


def clean(svg: str, lib: str) -> str:
    body = INNER.search(svg).group(1)
    body = TABLER_BOX.sub("", body) if lib == T else body
    body = STROKE_ATTR.sub("", body)
    body = re.sub(r"\s+/>", "/>", body)
    return re.sub(r">\s+<", "><", body).strip()


def build() -> dict[str, str]:
    out = {}
    for key, (lib, name) in MAP.items():
        f = SRC[lib][0] / f"{name}.svg"
        if not f.exists():
            raise SystemExit(f"missing: {key} → {lib}/{name}.svg (run npm install in scripts/icons?)")
        out[key] = clean(f.read_text(), lib)
    return out


def used_keys() -> set[str]:
    keys = set()
    for f in [*APP.glob("*.html"), *APP.joinpath("js").rglob("*.js")]:
        if f.name in ("definitions.js", "icons.js"):
            continue
        text = f.read_text()
        for rx in USES:
            keys.update(rx.findall(text))
        for m in DYNAMIC.finditer(text):
            keys.update(re.findall(r"[:?]\s*'([\w-]+)'", m.group(0)))
    return keys


def main() -> None:
    icons = build()
    if "--check" in sys.argv:
        missing = sorted(used_keys() - icons.keys())
        print(f"{len(icons)} icons, {len(used_keys())} keys used in mouka" + (f"; NOT IN MAP: {missing}" if missing else ": all resolve"))
        sys.exit(1 if missing else 0)
    ver = {lib: json.loads(pkg.read_text())["version"] for lib, (_, pkg, _) in SRC.items()}
    head = "\n".join(f"//   {lib} {ver[lib]} ({SRC[lib][2]})" for lib in SRC)
    lines = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in icons.items())
    OUT.write_text(f"// GENERATED by scripts/gen_icons.py: don't edit, change MAP there and re-run.\n// Icons from\n{head}\n"
                   f"window.MOUKA_ICONS = {{\n{lines},\n}};\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(icons)} icons, {OUT.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
