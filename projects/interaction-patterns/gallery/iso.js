(() => {
'use strict';
// Isometric drawing for "three kinds of state", on anfra.ai's own projection
// (holistics/anfra-landing src/lib/landing/iso-projection.ts): true 30° isometric,
// +x runs right-down, +y runs left-down, +z is up. Light from the upper left.
const host = document.getElementById('iso-state');
if (!host) return;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = Math.cos(Math.PI / 6), S = 0.5;
const P = (x, y, z) => [(x - y) * C, (x + y) * S - z];
const f = (n) => +n.toFixed(2);
const pts = (l) => l.map(([x, y, z]) => P(x, y, z).map(f).join(',')).join(' ');
const mtx = (a, b, c, d, o) => `matrix(${f(a)} ${f(b)} ${f(c)} ${f(d)} ${f(o[0])} ${f(o[1])})`;
const frame = {
	left: (x, y, z) => mtx(C, S, 0, 1, P(x, y, z)),          // wall y = const, reads along +x
	right: (x, y, z) => mtx(C, -S, 0, 1, P(x, y, z)),        // wall x = const, reads along -y
	floorX: (x, y, z) => mtx(C, S, -C, S, P(x, y, z)),        // top face, reads along +x
	floorY: (x, y, z) => mtx(C, -S, C, S, P(x, y, z)),        // top face, reads along -y
};
// iso materials: top, left-front, right-front, edge
const MAT = {
	paper: ['#fbfaf7', '#e6e2da', '#d6d1c7', 'rgb(24 20 31 / 0.42)'],
	soft: ['#ece2fb', '#d9c6f7', '#c3a6ef', 'rgb(79 42 134 / 0.5)'],
	violet: ['#c8a2ff', '#ad6bff', '#8a51d4', 'rgb(79 42 134 / 0.5)'],
	ink: ['#2c2635', '#1c1823', '#121017', 'rgb(24 20 31 / 0.8)'],
};
const bounds = [];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function block({ x, y, z = 0, w, d, h, m = 'paper', delay = 0, hatch = false, dashed = false }) {
	bounds.push([x, y, z], [x + w, y + d, z], [x, y, z + h], [x + w, y + d, z + h], [x + w, y, z], [x, y + d, z]);
	const t = z + h, [ct, cl, cr, edge] = MAT[m];
	const top = pts([[x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t]]);
	return `<g class="ib" style="--d:${delay}ms;--h:${h}px">
		<g transform="${frame.left(x, y + d, z)}"><rect class="wall" x="0" y="${-h}" width="${w}" height="${h}" fill="${cl}" stroke="${edge}"/></g>
		<g transform="${frame.right(x + w, y + d, z)}"><rect class="wall" x="0" y="${-h}" width="${d}" height="${h}" fill="${cr}" stroke="${edge}"/></g>
		<g class="lid"><polygon points="${top}" fill="${ct}" stroke="${edge}"/>${hatch ? `<polygon points="${top}" fill="url(#iso-hatch)"/>` : ''}${dashed ? `<polygon class="dash" points="${top}"/>` : ''}</g>
	</g>`;
}
// engraved label: mono, ink / 64% (paper / 70% on ink, deep violet on violet)
function label(text, tr, { x = 0, y = 0, size = 9, tone = 'ink', anchor = 'start', weight = 400 } = {}) {
	return `<g transform="${tr}"><text class="eng eng-${tone}" x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(text)}</text></g>`;
}
function trace(list, { kind = 'violet', head = true, delay = 0 } = {}) {
	for (const p of list) bounds.push(p);
	const pr = list.map(([x, y, z]) => P(x, y, z));
	const d = 'M' + pr.map((p) => p.map(f).join(' ')).join(' L');
	let arrow = '';
	if (head) {
		const [a, b] = pr.slice(-2), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 7, W = 3.6;
		const p1 = [b[0] - L * Math.cos(ang) + W * Math.sin(ang), b[1] - L * Math.sin(ang) - W * Math.cos(ang)];
		const p2 = [b[0] - L * Math.cos(ang) - W * Math.sin(ang), b[1] - L * Math.sin(ang) + W * Math.cos(ang)];
		arrow = `<polygon class="head" points="${[b, p1, p2].map((p) => p.map(f).join(',')).join(' ')}"/>`;
	}
	return `<g class="tr tr-${kind}" style="--d:${delay}ms"><path d="${d}" pathLength="1"/>${arrow}</g>`;
}

// Two stacks on one canvas. Left: an agent builds the interface, anfra owns the analytical state
// (SDK) and metric execution (server + semantic model). Right: the same app with raw SQL against
// the warehouse, where the interface carries every query, formula and piece of state itself.
const parts = [];
const late = [];
const W0 = 150, D0 = 90;
const ZU = 330, ZK = 220, ZS = 110, ZW = 0;     // interface, SDK, server, warehouse
const SHIFT = 230;                               // world offset of the right stack (moves it right on screen)
const seg = (pts, opt) => parts.push(trace(pts, opt));
const text = (t, x, y, cls, anchor = 'start') => `<text class="${cls}" x="${f(x)}" y="${f(y)}" text-anchor="${anchor}">${esc(t)}</text>`;
const at = (x, y, z) => { bounds.push([x, y, z]); return P(x, y, z); };
const ghost = (x, y, z, w, d, delay) => { bounds.push([x, y, z], [x + w, y + d, z]); return `<g class="ib ghost" style="--d:${delay}ms;--h:0px"><g class="lid"><polygon class="dash" points="${pts([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]])}"/></g></g>`; };
const leaderLeft = (t, x, y, z, cls) => { const [px, py] = at(x, y, z); bounds.push([x - 140, y + 140, z]); return `<g class="lname"><path d="M${f(px - 4)} ${f(py)} H${f(px - 22)}"/>${text(t, px - 26, py + 4, cls, 'end')}</g>`; };
const bars = (ox, oy, z, d0) => [22, 40, 16, 30, 20].map((hh, i) => block({ x: ox + 18 + i * 24, y: oy + 12, z, w: 10, d: 10, h: hh, m: i === 1 ? 'violet' : 'paper', delay: d0 + i * 50 }));

// hover targets: each group carries the explanation shown on hover, focus or tap
const TIP = {
	lu: ['Interface', ['Built by Claude, ChatGPT or any coding agent', 'Plain HTML with any chart library', 'Turns each click, drag or hover into one SDK call, like byCountry.select([Germany])', 'Never writes SQL or a metric formula']],
	lk: ['anfra SDK: analytical state', ['Holds what the reader chose: filters, selections, date range and grain, drill path, parameters', 'Selections can be exact pairs, like Vietnam in January', 'Decides which charts each choice reaches', 'Saves, restores, undoes and exports that state']],
	ls: ['anfra server: governed metrics', ['Compiles the same AQL plus the reader\'s input into SQL, through the semantic model', 'Revenue is defined once in AML, so every chart and every agent gets the same number', 'The AQL and SQL it ran stay inspectable']],
	lw: ['Warehouse', ['Your database (here DuckDB)', 'Only receives SQL compiled from the governed definitions']],
	lt: ['One click', ['The SDK sends structured input, like "country is Germany", never SQL text', 'The server re-runs the same AQL with that input', 'Every chart the choice is mapped to gets new rows']],
	ru: ['Interface, doing everything', ['Writes and joins SQL for each chart', 'Copies the revenue formula into each query', 'Adds every filter to every query', 'Hand-codes selections, time zones and saved state']],
	rq: ['A SQL string per chart', ['Change how revenue is defined, and every copy must be found and edited', 'Miss one, and two charts on the same page show different numbers']],
	rg: ['No shared layer', ['No shared metric definitions', 'No shared interaction state', 'Each app, and each agent that builds one, re-implements both its own way']],
	rt: ['Each chart queries on its own', ['Every chart sends its own SQL straight to the warehouse', 'Filters and selections must be copied into each query by hand, or the charts disagree']],
	rw: ['Warehouse', ['The same database', 'Now it receives whatever SQL each app happened to write']],
};
const hot = (k, ...items) => `<g class="hot" tabindex="0" role="button" aria-label="${esc(TIP[k][0])}: ${esc(TIP[k][1].join('. '))}" data-tip="${k}">${items.flat().join('')}</g>`;
const tr = (k, pts, opt) => hot(k, trace(pts, opt));

// ---------- left: with anfra ----------
parts.push(hot('lw', block({ x: 0, y: 0, z: ZW, w: W0, d: D0, h: 22, delay: 0 })));
parts.push(hot('lt', trace([[54, 18, ZS], [54, 18, ZW + 22]], { kind: 'ink', delay: 1300 })));
parts.push(hot('ls', block({ x: 0, y: 0, z: ZS, w: W0, d: D0, h: 28, m: 'ink', delay: 150 }),
	// engraved on the top face, like the SDK's labels, in front of where the arrows land
	label('revenue = defined once', frame.floorX(14, 50, ZS + 28), { y: 11, size: 8.5, tone: 'paper' }),
	label('AQL → SQL', frame.floorX(14, 68, ZS + 28), { y: 11, size: 8.5, tone: 'paper' })));
parts.push(tr('lt', [[54, 18, ZK], [54, 18, ZS + 28]], { delay: 1150 }));
parts.push(hot('lk', block({ x: 0, y: 0, z: ZK, w: W0, d: D0, h: 10, m: 'soft', delay: 300 }),
	block({ x: 12, y: 8, z: ZK + 10, w: 126, d: 22, h: 6, m: 'violet', delay: 420 }),
	block({ x: 12, y: 34, z: ZK + 10, w: 126, d: 22, h: 6, delay: 470 }),
	block({ x: 12, y: 60, z: ZK + 10, w: 126, d: 22, h: 6, delay: 520 }),
	label('filters · selections', frame.floorX(20, 12, ZK + 16), { y: 11, size: 8.5, tone: 'violet', weight: 500 }),
	label('time · drill', frame.floorX(20, 38, ZK + 16), { y: 11, size: 8.5 }),
	label('saved state', frame.floorX(20, 64, ZK + 16), { y: 11, size: 8.5 })));
parts.push(tr('lt', [[54, 18, ZU], [54, 18, ZK + 16]], { delay: 900 }));
parts.push(hot('lu', block({ x: 0, y: 0, z: ZU, w: W0, d: D0, h: 6, delay: 600 }), ...bars(0, 0, ZU + 6, 700)));
// the return arrow ends on the interface slab's side, so it is drawn after the slab, not hidden under it
parts.push(tr('lt', [[W0, 45, ZS + 14], [W0 + 22, 45, ZS + 14], [W0 + 22, 45, ZU + 3], [W0, 45, ZU + 3]], { delay: 1450 }));
late.push(leaderLeft('Interface · pixels and gestures', 0, D0, ZU + 3, 'ln'));
late.push(leaderLeft('anfra SDK · analytical state', 0, D0, ZK + 5, 'ln ln-v'));
late.push(leaderLeft('anfra server · governed metrics', 0, D0, ZS + 14, 'ln'));
late.push(leaderLeft('Warehouse', 0, D0, ZW + 11, 'ln'));
{
	const [x, y] = at(W0 + 26, 45, (ZU + ZS) / 2);
	late.push(text('same AQL,', x + 6, y - 4, 'fl fl-v'), text('new rows', x + 6, y + 8, 'fl fl-v'));
	const [cx, cy] = at(54, 18, (ZU + ZK + 16) / 2);
	late.push(text('one SDK call', cx + 8, cy + 3, 'fl fl-v'));
}

// ---------- right: raw SQL against the warehouse ----------
const X = SHIFT, Y = -SHIFT;
parts.push(hot('rw', block({ x: X, y: Y, z: ZW, w: W0, d: D0, h: 22, delay: 0 })));
[[X + 22, Y + 20], [X + 60, Y + 30], [X + 98, Y + 40], [X + 132, Y + 50]].forEach(([x, y], i) => parts.push(tr('rt', [[x, y, ZU], [x, y, ZW + 22]], { kind: 'faint', head: true, delay: 900 + i * 90 })));
parts.push(hot('rg', ghost(X, Y, ZS + 14, W0, D0, 150)));
parts.push(hot('rg', ghost(X, Y, ZK + 5, W0, D0, 300)));
parts.push(hot('ru', block({ x: X, y: Y, z: ZU, w: W0, d: D0, h: 6, delay: 600 }), ...bars(X, Y, ZU + 6, 700),
	block({ x: X + 14, y: Y + 70, z: ZU + 6, w: 60, d: 14, h: 4, hatch: true, delay: 900 })));
parts.push(hot('rq', ...[[X + 16, Y + 40], [X + 54, Y + 50], [X + 92, Y + 60], [X + 126, Y + 66]].map(([x, y], i) => block({ x, y, z: ZU + 6, w: 18, d: 14, h: 5, m: 'ink', delay: 820 + i * 40 }))));
{
	const right = (t, z, cls) => { const [px, py] = at(X + W0, Y, z); bounds.push([X + W0 + 190, Y - 190, z]); return `<g class="lname"><path d="M${f(px + 4)} ${f(py)} H${f(px + 22)}"/>${text(t, px + 26, py + 4, cls)}</g>`; };
	late.push(right('Interface · pixels, gestures and everything else', ZU + 3, 'ln'));
	const [bx, by] = at(X + W0, Y, ZU - 26);
	bounds.push([X + W0 + 190, Y - 190, ZU - 26]);
	['• SQL written and joined per chart', '• revenue formula copied into each', '• every filter added to every query', '• selections, time zones, saved state'].forEach((t, i) => late.push(text(t, bx + 26, by + i * 14, 'c-line')));
	late.push(right('No shared layer: each app repeats it', ZK + 5, 'ln ln-muted'));
	late.push(right('Warehouse', ZW + 11, 'ln'));
}
// column titles
{
	const [lx, ly] = at(0, 0, ZU + 70), [rx, ry] = at(X, Y, ZU + 70);
	late.push(text('With anfra', lx, ly, 'col-title', 'middle'), text('Without anfra', rx, ry, 'col-title', 'middle'));
}
parts.push(...late);

// viewBox from everything drawn, plus room for labels
const pr = bounds.map(([x, y, z]) => P(x, y, z));
const minX = Math.min(...pr.map((p) => p[0])) - 24, maxX = Math.max(...pr.map((p) => p[0])) + 24;
const minY = Math.min(...pr.map((p) => p[1])) - 18, maxY = Math.max(...pr.map((p) => p[1])) + 24;
const W = maxX - minX, H = maxY - minY;
const CELL = { w: 34.64, h: 20 };
host.innerHTML = `<svg class="iso-svg" viewBox="${f(minX)} ${f(minY)} ${f(W)} ${f(H)}" role="img" aria-label="Two stacks compared. With anfra: the interface built by an agent sends one SDK call per click; the anfra SDK holds the analytical state; the anfra server runs governed metrics against the warehouse and sends new rows back. Without anfra: the interface writes its own SQL for every chart straight to the warehouse, and carries the metric formulas, filters and state itself, with no shared layer in between.">
	<defs>
		<pattern id="iso-grid" patternUnits="userSpaceOnUse" width="${CELL.w}" height="${CELL.h}"><path class="grid" d="M0 0 L${CELL.w} ${CELL.h} M0 ${CELL.h} L${CELL.w} 0"/></pattern>
		<pattern id="iso-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><line class="hatch" x1="0" y1="0" x2="0" y2="5"/></pattern>
		<radialGradient id="iso-fade" cx="0.5" cy="0.5" r="0.55"><stop offset="0.3" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
		<mask id="iso-mask"><rect x="${f(minX)}" y="${f(minY)}" width="${f(W)}" height="${f(H)}" fill="url(#iso-fade)"/></mask>
	</defs>
	<rect x="${f(minX)}" y="${f(minY)}" width="${f(W)}" height="${f(H)}" fill="url(#iso-grid)" mask="url(#iso-mask)"/>
	${parts.join('\n')}
</svg>`;

// hover, focus or tap a part to read about it; the rest of the drawing dims
const tip = document.createElement('div');
tip.className = 'iso-tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
host.appendChild(tip);
const svg = host.querySelector('svg');
function showTip (g, x, y) {
	const [t, body] = TIP[g.dataset.tip];
	tip.innerHTML = `<b>${esc(t)}</b><ul>${body.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
	tip.hidden = false;
	svg.classList.add('focusing');
	svg.querySelectorAll('.hot').forEach((o) => o.classList.toggle('on', o.dataset.tip === g.dataset.tip));
	const r = host.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
	let left = x - r.left + 14, top = y - r.top + 14;
	if (left + tw > r.width - 8) left = x - r.left - tw - 14;
	if (top + th > r.height - 8) top = y - r.top - th - 14;
	tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
}
function hideTip () { tip.hidden = true; svg.classList.remove('focusing'); svg.querySelectorAll('.hot.on').forEach((o) => o.classList.remove('on')); }
svg.querySelectorAll('.hot').forEach((g) => {
	g.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') showTip(g, e.clientX, e.clientY); });
	g.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hideTip(); });
	g.addEventListener('focus', () => { const b = g.getBoundingClientRect(); showTip(g, b.left + b.width / 2, b.top + b.height / 2); });
	g.addEventListener('blur', hideTip);
	g.addEventListener('click', (e) => showTip(g, e.clientX, e.clientY));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#iso-state .hot')) hideTip(); });

// build when it scrolls into view; the finished frame shows at once under reduced motion
if (REDUCED || !('IntersectionObserver' in window)) { host.classList.add('built'); return; }
new IntersectionObserver((ents, io) => { if (ents.some((e) => e.isIntersecting)) { host.classList.add('built'); io.disconnect(); } }, { threshold: 0.35 }).observe(host);
})();
