"""Draw the Driftmouth Bay map background: apps/shared/driftmouth-map.svg.

The style follows the Freepik "City Map Creator" pieces in apps/shared/art/town/ (flat, hand-drawn,
muted teal, sand, tan and sage). Coastline, roads and landmark positions match apps/shared/scenery.js
and the spots' map_x / map_y, so tags, crowds and houses still line up.

    python3 tools/build_map.py          # writes the SVG
    then render it to apps/shared/driftmouth-map.jpg (see tools/render_map.sh)
"""
import math
import random
from pathlib import Path

W, H = 1440, 900
rnd = random.Random(7)
out = []
add = out.append

# Palette (from the Freepik pieces)
GRASS, GRASS_LO, GRASS_HI, GRASS_DK = '#BCCD8E', '#AFC281', '#C9D8A0', '#93AA66'
SAND, SAND_DK = '#EFDFB6', '#E0C994'
SEA, SEA_MID, SEA_DEEP, TEAL, TEAL_DK = '#A9D0D6', '#93C1CA', '#7FB2BF', '#5EA3A6', '#3C7980'
TAN, TAN_DK, OCHRE, CREAM, BLUE, BRICK, TRUNK = '#D9A66B', '#B98550', '#E8C88A', '#F6EBCF', '#8FB8C8', '#DE8F67', '#B5773E'
ROAD, ROAD_EDGE, STONE, STONE_DK, INK = '#F5EBD3', '#D9C49A', '#C9C3B4', '#A7A091', '#5E6670'
LINE, POST = 'none', '#8A7660'  # outlines off (as in the Freepik set); posts and strings in soft brown

COAST = 'M0 300 C120 330 220 380 300 420 C380 470 460 540 520 600 C580 660 650 730 700 780 C730 820 760 860 780 900'
ROADS = ('M230 332 C330 330 420 380 520 470 C560 510 590 560 600 600 M520 470 C600 420 650 400 700 395 C800 390 900 430 985 560 '
         'M700 395 C760 320 880 270 1060 250 C1160 240 1270 230 1440 240 M985 560 C1080 620 1200 640 1440 640 '
         'M700 395 C760 500 800 640 900 760 C940 810 980 860 1000 900')
PTS = [(0, 300), (300, 420), (520, 600), (700, 780), (780, 900)]


def coast_x(y):
    if y < 300:
        return -999
    for (ax, ay), (bx, by) in zip(PTS, PTS[1:]):
        if ay <= y <= by:
            return ax + (bx - ax) * (y - ay) / (by - ay)
    return 800


def in_sea(x, y, m=0):
    return y > 300 and x < coast_x(y) - m


def on_land(x, y, m=0):
    return x > coast_x(y) + m


# Things the scatter keeps clear of: landmarks, plaza, market, fields, the headland
KEEP = [(700, 390, 70), (985, 560, 110), (1066, 236, 100), (150, 380, 120), (600, 620, 60), (1340, 110, 55)]


def clear(x, y, pad=0):
    return all(math.hypot(x - a, y - b) > r + pad for a, b, r in KEEP)


def f(n):
    return f'{n:.1f}'


add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add('''<defs>
<filter id="wobble" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="paper" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" stitchTiles="stitch"/>
  <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.30  0 0 0 0 0.22  0 0 0 0.10 0"/>
</filter>
<filter id="blotch" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="3" seed="11"/>
  <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.66  0 0 0 0 0.36  0 0 0 -1.6 0.9"/>
</filter>
<pattern id="cobble" width="12" height="9" patternUnits="userSpaceOnUse">
  <rect width="12" height="9" fill="#EADCC0"/>
  <path d="M1 1h4v3h-4z M7 1h4v3h-4z M4 5h4v3h-4z M-2 5h4v3h-4z M10 5h4v3h-4z" fill="#DCCBA9"/>
</pattern>
<pattern id="planks" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-52)">
  <rect width="8" height="8" fill="#D9B98A"/><rect width="8" height="1.4" fill="#B98F5E"/>
</pattern>
<linearGradient id="seaFade" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#A9D0D6"/><stop offset="1" stop-color="#86B8C4"/>
</linearGradient>
<radialGradient id="beam" cx="0" cy="0.5" r="1">
  <stop offset="0" stop-color="#FFF4C4" stop-opacity="0.75"/><stop offset="1" stop-color="#FFF4C4" stop-opacity="0"/>
</radialGradient>
</defs>''')

# ---------- Land ----------
add(f'<rect width="{W}" height="{H}" fill="{GRASS}"/>')
add(f'<rect width="{W}" height="{H}" filter="url(#blotch)" opacity="0.55"/>')
add('<g filter="url(#wobble)">')
# meadows and woods ground
for cx, cy, rx, ry, col in [(900, 140, 380, 110, GRASS_HI), (420, 180, 270, 125, GRASS_LO), (600, 150, 130, 70, GRASS_LO),
                            (1250, 770, 270, 150, GRASS_LO), (1180, 430, 150, 120, '#B6C987'), (1270, 235, 130, 60, GRASS_HI)]:
    add(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{col}"/>')
# university lawn and market green
add(f'<ellipse cx="1066" cy="262" rx="135" ry="52" fill="#C6D79A"/>')
add(f'<ellipse cx="985" cy="565" rx="105" ry="60" fill="#CCDBA8"/>')
add('</g>')

# Fields: a patchwork with crop rows, hedges and hay bales
fields = [
    ([(732, 702), (826, 690), (842, 746), (752, 758)], '#E3D49A', '#CDB979', 'rows'),
    ([(984, 724), (1104, 706), (1122, 768), (1004, 788)], '#C5D292', '#A9BA74', 'rows'),
    ([(1150, 712), (1310, 690), (1332, 754), (1170, 778)], '#E3D49A', '#CDB979', 'rows'),
    ([(1330, 690), (1440, 676), (1440, 742), (1350, 752)], '#D6CF8F', '#BDB574', 'rows'),
    ([(1020, 800), (1160, 784), (1176, 850), (1036, 868)], '#CBDCA0', '#B2C487', 'pasture'),
    ([(1200, 800), (1330, 784), (1346, 846), (1214, 862)], '#E7CF97', '#CFB57B', 'rows'),
]
add('<g filter="url(#wobble)">')
for poly, fill, line, kind in fields:
    d = 'M' + ' L'.join(f'{x} {y}' for x, y in poly) + ' Z'
    add(f'<path d="{d}" fill="{fill}"/>')
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = poly
    if kind == 'rows':
        for t in [i / 7 for i in range(1, 7)]:
            ax, ay = x0 + (x3 - x0) * t, y0 + (y3 - y0) * t
            bx, by = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
            add(f'<path d="M{f(ax + 4)} {f(ay)} L{f(bx - 4)} {f(by)}" stroke="{line}" stroke-width="1.6" stroke-linecap="round"/>')
    add(f'<path d="{d}" fill="none" stroke="#9DB370" stroke-width="5" stroke-linejoin="round" opacity=".8"/>')
add('</g>')
# hay bales and sheep
for x, y in [(780, 726), (806, 718), (1230, 728), (1270, 722)]:
    add(f'<g><ellipse cx="{x}" cy="{y + 4}" rx="7" ry="2.5" fill="#8E9B5E" opacity=".35"/><circle cx="{x}" cy="{y}" r="5.5" fill="{OCHRE}" stroke="{TAN_DK}" stroke-width="1"/><path d="M{x - 3} {y} a3 3 0 0 1 6 0" fill="none" stroke="{TAN_DK}" stroke-width=".8"/></g>')
for x, y in [(1060, 822), (1086, 836), (1110, 818), (1130, 840), (1072, 848)]:
    add(f'<g><ellipse cx="{x}" cy="{y + 5}" rx="7" ry="2" fill="#7E8E55" opacity=".3"/><ellipse cx="{x}" cy="{y}" rx="7" ry="5" fill="#FBF6EA"/><circle cx="{x + 6}" cy="{y - 2}" r="2.6" fill="{INK}"/></g>')

# Pond with reeds and ducks (top right)
add('<g filter="url(#wobble)">')
add(f'<ellipse cx="1342" cy="112" rx="50" ry="26" fill="{SAND}"/><ellipse cx="1342" cy="110" rx="44" ry="21" fill="{SEA}"/>')
add('</g>')
add(f'<path d="M1322 106 q8 -4 16 0 M1348 118 q8 -4 16 0" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>')
for x in [1298, 1304, 1380, 1386, 1392]:
    add(f'<path d="M{x} 112 q-2 -10 1 -16" stroke="#7E9B5F" stroke-width="1.6" fill="none"/><ellipse cx="{x + 1}" cy="96" rx="1.6" ry="4" fill="{TRUNK}"/>')
for x, y in [(1336, 104), (1356, 114)]:
    add(f'<g><ellipse cx="{x}" cy="{y}" rx="4.5" ry="3" fill="#FBF6EA"/><circle cx="{x + 3.5}" cy="{y - 3}" r="2" fill="#FBF6EA"/><path d="M{x + 5} {y - 3} l2.5 .6 l-2.5 .6z" fill="{OCHRE}"/></g>')

# Grass tufts, flowers and pebbles scattered on land
for _ in range(900):
    x, y = rnd.uniform(0, W), rnd.uniform(0, H)
    if not on_land(x, y, 30) or not clear(x, y):
        continue
    r = rnd.random()
    if r < 0.62:
        c = rnd.choice([GRASS_DK, '#A2B874', '#8DA35F'])
        add(f'<path d="M{f(x - 3)} {f(y)} l1.5 -5 M{f(x)} {f(y)} l0 -6 M{f(x + 3)} {f(y)} l-1.5 -5" stroke="{c}" stroke-width="1.2" stroke-linecap="round" fill="none"/>')
    elif r < 0.9:
        c = rnd.choice(['#FBF6EA', '#F3C9C0', OCHRE, '#F6E3A1', '#C9DDE6'])
        add(f'<g fill="{c}"><circle cx="{f(x)}" cy="{f(y)}" r="1.7"/><circle cx="{f(x + 4)}" cy="{f(y + 2)}" r="1.4"/><circle cx="{f(x - 3)}" cy="{f(y + 3)}" r="1.2"/></g>')
    else:
        add(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="2.6" ry="1.8" fill="{STONE}"/>')

# ---------- Roads ----------
add('<g filter="url(#wobble)" fill="none" stroke-linecap="round">')
add(f'<path d="{ROADS}" stroke="{ROAD_EDGE}" stroke-width="17"/>')
add(f'<path d="{ROADS}" stroke="{ROAD}" stroke-width="12"/>')
add(f'<path d="{ROADS}" stroke="#E6D7B5" stroke-width="1.2" stroke-dasharray="2 9"/>')
add('</g>')

# ---------- Sea, beach, headland ----------
add('<g filter="url(#wobble)">')
add(f'<path d="{COAST}" fill="none" stroke="{SAND_DK}" stroke-width="54"/>')
add(f'<path d="{COAST}" fill="none" stroke="{SAND}" stroke-width="46"/>')
add(f'<path d="{COAST} L0 900 Z" fill="url(#seaFade)"/>')
add(f'<path d="M0 360 C110 400 200 450 270 500 C350 560 420 640 480 700 C540 760 600 830 640 900 L0 900 Z" fill="{SEA_MID}"/>')
add(f'<path d="M0 470 C90 510 170 560 230 610 C300 670 360 760 400 900 L0 900 Z" fill="{SEA_DEEP}"/>')
add('</g>')
# foam along the shore
add(f'<path d="M-6 308 C114 338 214 388 294 428 C374 478 454 548 514 608 C574 668 644 738 694 788 C724 828 754 868 774 908" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity=".55"/>')
# pebbles and shells on the beach
for _ in range(140):
    y = rnd.uniform(310, 900)
    x = coast_x(y) + rnd.uniform(-6, 18)
    add(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rnd.uniform(1, 2.4))}" ry="{f(rnd.uniform(.8, 1.6))}" fill="{rnd.choice([SAND_DK, STONE, "#F7EEDA"])}"/>')
# waves
for _ in range(110):
    x, y = rnd.uniform(0, 760), rnd.uniform(320, 900)
    if not in_sea(x, y, 40):
        continue
    w = rnd.uniform(10, 18)
    c = rnd.choice(['#FFFFFF', '#FFFFFF', TEAL])
    add(f'<path d="M{f(x)} {f(y)} q{f(w / 2)} -6 {f(w)} 0" fill="none" stroke="{c}" stroke-width="{2 if c == TEAL else 2.4}" stroke-linecap="round" opacity="{.55 if c == TEAL else .8}"/>')

# Headland with cliff strata, path and rocks
add('<g filter="url(#wobble)">')
add('<path d="M36 380 C56 424 120 452 172 444 C224 434 254 384 234 350 L242 376 C256 412 224 464 170 472 C106 480 48 446 36 406 Z" fill="#A6ADBE"/>')
add('<path d="M44 398 C80 432 130 450 176 446 M52 414 C92 444 140 458 190 452" stroke="#8D95A8" stroke-width="1.6" fill="none"/>')
add('<path d="M36 330 C66 298 192 296 234 350 C254 382 222 434 172 444 C120 452 58 424 36 380 Z" fill="#B4C88E"/>')
add('</g>')
add(f'<path d="M150 356 C170 368 196 360 214 344" fill="none" stroke="{ROAD}" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 7"/>')
for x, y, r in [(26, 470, 9), (58, 492, 6), (250, 420, 8), (262, 440, 5), (300, 470, 6)]:
    add(f'<g><ellipse cx="{x}" cy="{y + 2}" rx="{r + 3}" ry="{r / 2}" fill="#FFFFFF" opacity=".55"/><ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r * .7}" fill="#9CA3B2"/><ellipse cx="{x - r * .3}" cy="{y - r * .25}" rx="{r * .45}" ry="{r * .25}" fill="#B9BFCB"/></g>')
# fence along the cliff top
add(f'<path d="M64 336 C100 320 160 318 200 330" fill="none" stroke="{TRUNK}" stroke-width="1.4"/>')
for i in range(9):
    x = 64 + i * 17
    add(f'<path d="M{x} {336 - i * 1.6 + (i * i) * .18:.1f} v-6" stroke="{TRUNK}" stroke-width="1.6"/>')

# Lighthouse (base at y≈352, under the tag at 150,286)
add(f'<ellipse cx="142" cy="296" rx="70" ry="16" fill="url(#beam)" transform="rotate(-12 142 296)"/>')
add(f'<ellipse cx="142" cy="354" rx="20" ry="5" fill="#7E8E60" opacity=".35"/>')
add(f'''<g stroke="{LINE}" stroke-width="1.2" stroke-linejoin="round">
<path d="M127 352 L133 302 L151 302 L157 352 Z" fill="#FBF6EA"/>
<path d="M131 318 L153 318 L154 328 L130 328 Z M129 338 L155 338 L156 348 L128 348 Z" fill="{BRICK}"/>
<rect x="130" y="297" width="24" height="5" fill="{TEAL_DK}"/>
<rect x="135" y="285" width="14" height="12" fill="#F8E7A8"/>
<path d="M135 289 h14 M142 285 v12" stroke-width=".8"/>
<path d="M132 285 L142 274 L152 285 Z" fill="{TEAL_DK}"/>
<rect x="139" y="340" width="6" height="12" fill="{TAN}"/>
</g>''')
add(f'<path d="M142 274 v-5" stroke="{POST}" stroke-width="1.4"/>')

# ---------- Harbour ----------
add('<g filter="url(#wobble)">')
add(f'<ellipse cx="596" cy="618" rx="56" ry="24" fill="url(#cobble)"/>')
add('</g>')
add('<path d="M562 620 L470 736 L490 748 L582 632 Z" fill="url(#planks)" stroke="#9C7A4C" stroke-width="1.4"/>')
for t in [0.15, 0.4, 0.65, 0.9]:
    x, y = 562 + (470 - 562) * t, 620 + (736 - 620) * t
    add(f'<circle cx="{f(x - 1)}" cy="{f(y + 1)}" r="2.6" fill="#8A6B42"/><circle cx="{f(x + 19)}" cy="{f(y + 13)}" r="2.6" fill="#8A6B42"/>')
# moored boats
for x, y, rot, hull, sail in [(498, 700, 0, BLUE, BRICK), (540, 722, 0, TAN, None)]:
    add(f'<g transform="rotate({rot} {x} {y})"><ellipse cx="{x}" cy="{y + 5}" rx="17" ry="3" fill="#FFFFFF" opacity=".5"/>'
        f'<path d="M{x - 15} {y - 4} h30 l-5 8 h-20 Z" fill="{hull}" stroke="{LINE}"/>'
        + (f'<path d="M{x} {y - 4} v-22 l12 18 Z" fill="{sail}" stroke="{LINE}"/>' if sail else '') + '</g>')
# crates, barrels, lamp, nets on the quay
add(f'<g stroke="{LINE}" stroke-width="1"><rect x="618" y="606" width="10" height="9" fill="{TAN}"/><rect x="626" y="612" width="10" height="9" fill="{OCHRE}"/>'
    f'<ellipse cx="566" cy="626" rx="4.5" ry="5.5" fill="{TRUNK}"/><ellipse cx="575" cy="630" rx="4.5" ry="5.5" fill="{TAN_DK}"/></g>')
# (the bay is left open for the cruise ship, which the app shows on cruise days)
# gulls
for x, y in [(240, 540), (262, 528), (520, 560), (90, 600), (640, 840)]:
    add(f'<path d="M{x - 6} {y} q3 -4 6 0 q3 -4 6 0" fill="none" stroke="{POST}" stroke-width="1.3" stroke-linecap="round"/>')
# ---------- Old Town plaza and arcade (under the tag at 700,362) ----------
add('<g filter="url(#wobble)">')
add(f'<ellipse cx="700" cy="398" rx="52" ry="31" fill="{ROAD_EDGE}"/><ellipse cx="700" cy="398" rx="48" ry="28" fill="url(#cobble)"/>')
add('</g>')
add(f'''<g stroke="{LINE}" stroke-width="1.1" stroke-linejoin="round">
<rect x="662" y="378" width="76" height="24" fill="{CREAM}"/>
<path d="M656 378 L700 360 L744 378 Z" fill="{TAN}"/>
<path d="M670 402 v-10 a5 6 0 0 1 10 0 v10 M688 402 v-10 a5 6 0 0 1 10 0 v10 M706 402 v-10 a5 6 0 0 1 10 0 v10 M724 402 v-10 a5 6 0 0 1 10 0 v10" fill="{TEAL}"/>
<circle cx="700" cy="370" r="3.5" fill="#FBF6EA"/>
</g>''')
# bunting across the square
add(f'<path d="M650 396 Q700 412 752 396" fill="none" stroke="{POST}" stroke-width=".8"/>')
for i in range(9):
    t = (i + .5) / 9
    x = 650 + 102 * t
    y = 396 + 32 * t * (1 - t) - 0.5
    add(f'<path d="M{f(x - 3)} {f(y)} L{f(x + 3)} {f(y)} L{f(x)} {f(y + 6)} Z" fill="{[BRICK, OCHRE, TEAL, BLUE][i % 4]}"/>')

# ---------- Saturday Market: striped stalls and bunting (tag at 985,522) ----------
add(f'<path d="M914 548 C960 532 1012 532 1058 548" fill="none" stroke="{POST}" stroke-width=".8"/>')
for i in range(12):
    t = (i + .5) / 12
    x = 914 + 144 * t
    y = 548 - 21 * 4 * t * (1 - t) * .75
    add(f'<path d="M{f(x - 3)} {f(y)} L{f(x + 3)} {f(y)} L{f(x)} {f(y + 6)} Z" fill="{[OCHRE, BRICK, BLUE, "#FBF6EA"][i % 4]}"/>')
for x, y, c in [(938, 576, BRICK), (978, 556, TEAL), (1018, 578, OCHRE), (958, 606, BLUE), (1002, 608, BRICK), (1040, 600, TEAL)]:
    stripes = ''.join(f'<rect x="{x - 14 + k * 7}" y="{y - 12}" width="3.5" height="8" fill="#FBF6EA"/>' for k in range(4))
    add(f'''<g stroke="{LINE}" stroke-width="1"><rect x="{x - 12}" y="{y - 4}" width="24" height="10" fill="{TAN}"/>
<rect x="{x - 10}" y="{y - 6}" width="20" height="3" fill="{rnd.choice([OCHRE, '#C9DDE6', '#F3C9C0', CREAM])}" stroke="none"/>
<path d="M{x - 14} {y - 12} h28 l-2 8 h-24 Z" fill="{c}"/></g>{stripes}''')

# ---------- University (tag at 1060,142): lawn, path and benches; the hall itself is a sprite in scenery.js ----------
add(f'<path d="M1060 282 C1060 300 1062 320 1066 340" stroke="{ROAD}" stroke-width="8" fill="none" stroke-linecap="round"/>')
for x in [1020, 1100]:
    add(f'<rect x="{x - 8}" y="292" width="16" height="3" fill="{TRUNK}"/><path d="M{x - 6} 295 v4 M{x + 6} 295 v4" stroke="{TRUNK}" stroke-width="1.4"/>')

# Paper grain over everything
add(f'<rect width="{W}" height="{H}" filter="url(#paper)"/>')
add('</svg>')

dest = Path(__file__).resolve().parent.parent / 'apps' / 'shared' / 'driftmouth-map.svg'
dest.write_text('\n'.join(out))
print(dest, len(out), 'elements')
