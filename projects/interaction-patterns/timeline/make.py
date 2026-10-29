import calendar, base64, pathlib
HERE = pathlib.Path(__file__).resolve().parent
F = HERE.parent / 'assets' / 'fonts'
inter = base64.b64encode((F/'inter-latin-wght-normal.woff2').read_bytes()).decode()
mono = base64.b64encode((F/'geist-mono-latin-400-normal.woff2').read_bytes()).decode()
W, H = 1860, 1040
X0, MW = 170, 86          # x of 1 Jun 2025, px per month
def X(y, m, d=1):
    return X0 + ((y-2025)*12 + (m-6) + (d-1)/calendar.monthrange(y, m)[1]) * MW
INK, MUTED, RULE, VIO, VINK, VSOFT, PAPER = '#18141f', '#625c69', 'rgba(24,20,31,0.16)', '#8a51d4', '#4f2a86', '#efe9fb', '#f2f0ea'
o = []
t = lambda x, y, s, cls='', anchor='start': o.append(f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" text-anchor="{anchor}">{s}</text>')
line = lambda x1, y1, x2, y2, cls='': o.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" class="{cls}"/>')

# title
t(X0, 46, 'Dates &amp; time in anfra: anchors and periods on one time line', 'title')
t(X0, 70, 'The ecommerce sample: orders from 1 Jun 2025 to 23 Sep 2026, read on 15 Oct 2026. Grey text names the gallery card that uses each term', 'sub')

RY = 470                  # ruler top
DATA0, ANCHOR, NOW, END = X(2025,6,1), X(2026,9,23), X(2026,10,15), X(2026,11,30)+MW/30
# ruler bands
o.append(f'<rect x="{DATA0}" y="{RY}" width="{ANCHOR-DATA0:.1f}" height="40" fill="{VSOFT}" stroke="{VIO}" stroke-width="1"/>')
o.append(f'<rect x="{ANCHOR:.1f}" y="{RY}" width="{NOW-ANCHOR:.1f}" height="40" fill="url(#hatch)" stroke="{RULE}"/>')
o.append(f'<rect x="{NOW:.1f}" y="{RY}" width="{END-NOW:.1f}" height="40" fill="url(#dots)" stroke="{RULE}"/>')
t((DATA0+ANCHOR)/2, RY+25, 'PAST · has data', 'band v', 'middle')
t((ANCHOR+NOW)/2, RY+25, 'no data yet', 'tiny', 'middle')
t((NOW+END)/2, RY+25, 'FUTURE', 'band', 'middle')
# month ticks
for i in range(19):
    y, m = 2025 + (5+i)//12, (5+i)%12 + 1
    x = X0 + i*MW
    q = m in (1,4,7,10)
    line(x, RY+40, x, RY+(56 if q else 48), 'tick')
    if i < 18:
        lab = calendar.month_abbr[m] + (f' {str(y)[2:]}' if m in (1,6) or i == 0 else '')
        t(x + MW/2, RY+64, lab, 'mono', 'middle')
# calendar quarters
QY = RY+92
t(X0-10, QY+4, 'Calendar', 'rowlab', 'end')
for (y, q0) in [(2025,7),(2025,10),(2026,1),(2026,4),(2026,7),(2026,10)]:
    x1, x2 = X(y,q0), min(END, X(y+(q0+3>12), (q0+3-1)%12+1))
    o.append(f'<rect x="{x1+1:.1f}" y="{QY-12}" width="{x2-x1-2:.1f}" height="22" rx="4" class="qbox"/>')
    t((x1+x2)/2, QY+3, f'Q{(q0-1)//3+1} {y}', 'small', 'middle')
o.append(f'<rect x="{X0+1}" y="{QY-12}" width="{MW-2}" height="22" rx="4" class="qbox ghost"/>'); t(X0+MW/2, QY+3, 'Q2', 'small m', 'middle')
# fiscal quarters (FY starts 1 July)
FY = QY+34
t(X0-10, FY+4, 'Fiscal (July)', 'rowlab', 'end')
o.append(f'<rect x="{X0+1}" y="{FY-12}" width="{MW-2}" height="22" rx="4" class="fbox ghost"/>'); t(X0+MW/2, FY+3, 'FY25 Q4', 'tiny', 'middle')
for k, (y, m) in enumerate([(2025,7),(2025,10),(2026,1),(2026,4),(2026,7),(2026,10)]):
    x1 = X(y, m); x2 = min(END, x1 + 3*MW)
    fy = 26 if k < 4 else 27
    o.append(f'<rect x="{x1+1:.1f}" y="{FY-12}" width="{x2-x1-2:.1f}" height="22" rx="4" class="fbox{" on" if (fy,k) == (27,4) else ""}"/>')
    t((x1+x2)/2, FY+3, f'FY{fy} Q{k%4+1}', 'small' + (' v' if (fy,k) == (27,4) else ''), 'middle')
for (y1, m1, lab) in [(2025, 7, 'FY26 · 1 Jul 2025 – 30 Jun 2026'), (2026, 7, 'FY27 · starts 1 Jul 2026')]:
    x1 = X(y1, m1); x2 = min(END, x1 + (12*MW if y1 == 2025 else 6*MW))
    line(x1, FY+22, x2, FY+22, 'brk'); line(x1, FY+17, x1, FY+27, 'brk'); line(x2, FY+17, x2, FY+27, 'brk')
    t((x1+x2)/2, FY+40, lab + '   <tspan class="card">Fiscal calendar</tspan>', 'small', 'middle')

# anchors (vertical lines with pills)
def anchor(x, top, label, cls, side='right'):
    line(x, top+14, x, RY+40, 'anc ' + cls)
    w = len(label)*7.1 + 24
    x1 = x - 1 if side == 'right' else x - w + 1
    o.append(f'<g class="pill {cls}"><rect x="{x1:.1f}" y="{top-14}" width="{w:.1f}" height="28" rx="14"/><text x="{x1 + w/2:.1f}" y="{top+5}" text-anchor="middle">{label}</text></g>')
anchor(DATA0, 432, 'Data starts · 1 Jun 2025', 'grey')
anchor(ANCHOR, 432, 'As-of anchor · newest data · 23 Sep 2026', 'vio', 'left')
anchor(NOW, 432, 'NOW · today · 15 Oct 2026', 'ink')

# range brackets above the ruler: (x1, x2, label, card, style, labelSide)
def bracket(x1, x2, y, label, card, cls='', side='mid'):
    line(x1, y, x2, y, 'brk ' + cls); line(x1, y-6, x1, y+6, 'brk ' + cls); line(x2, y-6, x2, y+6, 'brk ' + cls)
    lab = f'{label}  <tspan class="card">{card}</tspan>'
    if side == 'mid': t((x1+x2)/2, y-9, lab, 'lab ' + cls, 'middle')
    elif side == 'left': t(x1-10, y+4, lab, 'lab ' + cls, 'end')
    else: t(x2+10, y+4, lab, 'lab ' + cls, 'start')
B = 120
bracket(X(2026,1), X(2026,7), B, '<tspan class="b">Exact dates</tspan> · 1 Jan – 30 Jun 2026', 'Date filter', '', 'left')
bracket(X(2026,1), ANCHOR, B+36, '<tspan class="b">YTD · year to date</tspan> · 1 Jan 2026 → as-of 23 Sep', 'Period to date', 'v', 'left')
bracket(X(2026,7), X(2026,10), B+72, '<tspan class="b">Last 3 months</tspan> · Jul – Sep 2026, whole months', 'Date filter', '', 'left')
# trailing window: three positions of a sliding 3-month window
for k, (y, m) in enumerate([(2026,5),(2026,6),(2026,7)]):
    x1 = X(y, m); yy = B+108 + k*7
    line(x1, yy, x1+3*MW, yy, 'brk ' + ('v' if k == 2 else 'faint'))
    line(x1, yy-4, x1, yy+4, 'brk ' + ('v' if k == 2 else 'faint')); line(x1+3*MW, yy-4, x1+3*MW, yy+4, 'brk ' + ('v' if k == 2 else 'faint'))
t(X(2026,5)-10, B+120, '<tspan class="b">Trailing 3 months</tspan> · a rolling window, one per month  <tspan class="card">Period to date &amp; trailing period</tspan>', 'lab', 'end')
bracket(X(2026,8,25), ANCHOR, B+164, '<tspan class="b">Last 30 days from the anchor</tspan> · 25 Aug – 23 Sep', 'As-of anchor', 'v', 'left')
bracket(X(2026,9,15), NOW, B+200, '<tspan class="b">Last 30 days from today</tspan> · 15 Sep – 15 Oct, only 9 days have data', 'Date filter', '', 'left')
bracket(X(2026,10,16), X(2026,11,14), B+236, '<tspan class="b">Next 30 days</tspan> · 16 Oct – 14 Nov, no data', 'Date filter (operator next)', 'dash', 'left')
t(X0, B+270, 'Phrases like "last quarter", "this year" or "last 7 days" resolve to ranges like these, counted from today  <tspan class="card">Date filter</tspan>', 'note', 'start')

# incomplete period callout on Sep 2026
sx1, sx2 = X(2026,9), X(2026,10)
o.append(f'<rect x="{sx1:.1f}" y="{RY-6}" width="{sx2-sx1:.1f}" height="52" fill="none" stroke="{VINK}" stroke-width="1.5" stroke-dasharray="3 3" rx="3"/>')

# comparisons below
CY = FY + 92
def arc(x1, x2, y, h, label, card, cls=''):
    o.append(f'<path d="M{x1:.1f} {y} C{x1:.1f} {y+h} {x2:.1f} {y+h} {x2:.1f} {y}" class="arc {cls}" marker-end="url(#arr{"v" if cls else ""})"/>')
    o.append(f'<circle cx="{x1:.1f}" cy="{y}" r="3.5" class="dot {cls}"/>')
sep25, sep26, aug26 = X(2025,9)+MW/2, X(2026,9)+MW/2, X(2026,8)+MW/2
line(sep25, FY+48, sep25, CY, 'faint'); line(sep26, FY+48, sep26, CY, 'faint')
arc(sep25, sep26-4, CY, 70, '', '', 'v')
t((sep25+sep26)/2, CY+66, '<tspan class="b">Year over year</tspan> · Sep 2026 vs the same month last year: −31%  <tspan class="card">Period comparison</tspan>', 'lab v', 'middle')
arc(aug26, sep26-3, CY, 26, '', '')
t(aug26-12, CY+26, '<tspan class="b">Previous month</tspan> · Sep vs Aug 2026: −26%', 'lab', 'end')
t(sep26+20, CY+6, '<tspan class="b">Incomplete period</tspan>', 'lab v', 'start')
t(sep26+20, CY+22, 'Sep 2026: 23 of 30 days, so', 'note', 'start')
t(sep26+20, CY+38, 'its short bar is not a drop', 'note', 'start')
t(sep26+20, CY+54, 'Incomplete periods', 'card', 'start')
# custom comparison
KY = CY + 112
for (x1, x2, lab) in [(X(2025,7), X(2026,1), 'H2 2025 · Jul – Dec 2025'), (X(2026,1), X(2026,7), 'H1 2026 · Jan – Jun 2026')]:
    o.append(f'<rect x="{x1+2:.1f}" y="{KY-14}" width="{x2-x1-4:.1f}" height="26" rx="6" class="cbox"/>')
    t((x1+x2)/2, KY+4, lab, 'small', 'middle')
t(X(2026,1), KY+34, '<tspan class="b">Custom period comparison</tspan> · any two ranges side by side, e.g. Singapore $82k → $113k  <tspan class="card">Custom period comparison</tspan>', 'lab', 'middle')

# inset: date drill
IX, IY = X(2026,4)-20, KY+64
o.append(f'<rect x="{IX}" y="{IY}" width="{END-IX:.1f}" height="128" rx="10" class="inset"/>')
t(IX+16, IY+26, '<tspan class="b">Date drill · grain</tspan>  <tspan class="card">Date drill</tspan>', 'lab')
t(IX+16, IY+44, 'The same range, bucketed coarser or finer; clicking a bar narrows the range and steps down', 'note')
gx = IX+16
for k, g in enumerate(['Year', 'Quarter', 'Month', 'Week', 'Day']):
    o.append(f'<rect x="{gx}" y="{IY+58}" width="88" height="28" rx="6" class="gbox{" on" if g == "Quarter" else ""}"/>'); t(gx+44, IY+77, g, 'small' + (' v' if g == 'Quarter' else ''), 'middle')
    if k < 4: t(gx+97, IY+77, '›', 'small m', 'middle')
    gx += 106
t(IX+16, IY+110, 'Month → Quarter: 16 bars become 6 · click Q2 2026 → Apr · May · Jun by month', 'small')
# inset: time zone
TX, TY = X0, IY
o.append(f'<rect x="{TX}" y="{TY}" width="{IX-TX-24:.1f}" height="128" rx="10" class="inset"/>')
t(TX+16, TY+26, '<tspan class="b">Time zone</tspan>  <tspan class="card">Dynamic timezone</tspan>', 'lab')
t(TX+16, TY+44, 'One order, one instant; the day and hour it lands in depend on the reader\'s zone', 'note')
for k, (zone, hh, day) in enumerate([('UTC', '23:00', 'Thu 15 Oct'), ('Asia/Tokyo', '08:00', 'Fri 16 Oct')]):
    cx = TX + 60 + k*250; cy = TY + 88
    o.append(f'<circle cx="{cx}" cy="{cy}" r="24" class="clock"/>')
    import math
    hr = int(hh[:2]) % 12
    ang = math.radians(hr*30 - 90)
    line(cx, cy, cx + 13*math.cos(ang), cy + 13*math.sin(ang), 'hand'); line(cx, cy, cx, cy-19, 'hand thin')
    t(cx+36, cy-6, f'<tspan class="b">{zone}</tspan>', 'small'); t(cx+36, cy+12, f'{hh} · {day}', 'small')
t(TX+16+520, TY+80, 'Japan\'s orders move from 23:00–13:00 UTC', 'small m'); t(TX+16+520, TY+98, 'to the 08:00–22:00 business day', 'small m')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
<style>
@font-face {{ font-family: I; src: url(data:font/woff2;base64,{inter}) format('woff2'); font-weight: 100 900; }}
@font-face {{ font-family: M; src: url(data:font/woff2;base64,{mono}) format('woff2'); }}
text {{ font-family: I, sans-serif; fill: {INK}; font-size: 14px; }}
.title {{ font-size: 24px; font-weight: 650; }} .sub {{ font-size: 14px; fill: {MUTED}; }}
.mono {{ font-family: M, monospace; font-size: 12px; fill: {MUTED}; }} .mono2 {{ font-family: M, monospace; font-size: 13px; }}
.small {{ font-size: 12px; }} .tiny {{ font-size: 11px; fill: {MUTED}; }} .m {{ fill: {MUTED}; }}
.lab {{ font-size: 13px; }} .b {{ font-weight: 600; }} .v, .lab.v {{ fill: {VINK}; }} .card {{ fill: #8e8896; font-size: 11.5px; font-weight: 400; }}
.note {{ font-size: 12px; fill: {MUTED}; }} .rowlab {{ font-size: 12px; fill: {MUTED}; font-weight: 500; }}
.band {{ font-size: 13px; font-weight: 600; fill: {MUTED}; letter-spacing: 0.04em; }} .band.v {{ fill: {VINK}; }}
.tick {{ stroke: {INK}; stroke-width: 1; }}
.brk {{ stroke: {INK}; stroke-width: 1.4; }} .brk.v {{ stroke: {VIO}; stroke-width: 2; }} .brk.dash {{ stroke-dasharray: 4 3; stroke: {MUTED}; }} .brk.faint {{ stroke: rgba(138,81,212,0.35); stroke-width: 1.4; }}
.faint {{ stroke: {RULE}; stroke-dasharray: 2 3; }}
.qbox {{ fill: #fff; stroke: {RULE}; }} .fbox {{ fill: #fff; stroke: {RULE}; }} .fbox.on {{ fill: {VSOFT}; stroke: {VIO}; }} .ghost {{ fill: none; stroke-dasharray: 3 3; }}
.anc {{ stroke-width: 1.5; }} .anc.grey {{ stroke: {MUTED}; }} .anc.vio {{ stroke: {VIO}; stroke-dasharray: 5 3; stroke-width: 2; }} .anc.ink {{ stroke: {INK}; stroke-width: 2.2; }}
.pill rect {{ stroke-width: 1; }} .pill text {{ font-size: 12.5px; font-weight: 600; }}
.pill.grey rect {{ fill: #fff; stroke: {RULE}; }} .pill.grey text {{ fill: {MUTED}; }}
.pill.vio rect {{ fill: {VIO}; stroke: {VIO}; }} .pill.vio text {{ fill: #fff; }}
.pill.ink rect {{ fill: {INK}; stroke: {INK}; }} .pill.ink text {{ fill: #fff; }}
.arc {{ fill: none; stroke: {INK}; stroke-width: 1.4; }} .arc.v {{ stroke: {VIO}; stroke-width: 2; }} .dot {{ fill: {INK}; }} .dot.v {{ fill: {VIO}; }}
.cbox {{ fill: #fff; stroke: {INK}; stroke-width: 1; }}
.inset {{ fill: #fff; stroke: {RULE}; }}
.gbox {{ fill: #fff; stroke: rgba(24,20,31,0.24); }} .gbox.on {{ fill: {VSOFT}; stroke: {VIO}; }}
.clock {{ fill: #fff; stroke: {INK}; stroke-width: 1.4; }} .hand {{ stroke: {INK}; stroke-width: 2.2; stroke-linecap: round; }} .hand.thin {{ stroke-width: 1.2; }}
</style>
<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#fff"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(24,20,31,0.18)" stroke-width="2"/></pattern>
<pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff"/><circle cx="4" cy="4" r="1" fill="rgba(24,20,31,0.22)"/></pattern>
<marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="{INK}"/></marker>
<marker id="arrv" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="{VIO}"/></marker>
</defs>
<rect width="{W}" height="{H}" fill="{PAPER}"/>
<rect x="24" y="92" width="{W-48}" height="{H-116}" rx="14" fill="#fff" stroke="{RULE}"/>
{''.join(o)}
</svg>'''
(HERE / 'timeline.svg').write_text(svg)
print('ok', len(svg))
