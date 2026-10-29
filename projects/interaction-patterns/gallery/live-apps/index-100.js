LIVE['index-100'] = {
	h: 440,
	html: `<style>#chart svg { display: block; overflow: visible; } #chart text { font-size: 12px; fill: var(--muted); } #lg button { height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12px; } #lg i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Units</span><span class="seg" id="units"></span></div>
		<div class="panel"><div class="ph"><b id="title">Revenue by category</b><span class="status" id="s1"></span></div><div id="chart"></div>
		<div class="row" id="lg" style="margin-top: 6px"></div><div class="hint" id="read" style="margin-top: 4px"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Indexed view', timezone: 'Etc/UTC' });
const q = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month(), category_name: products.category } measures { total_revenue: revenue, index_100: revenue * 100.0 / first_value(revenue, order: orders.ordered_at | month(), partition: products.category) } sorts { category_name asc, period asc } }' });
const COLORS = { Services: '#8a51d4', Software: '#18141f', Hardware: '#1d7f74', Parts: '#c2410c' };
const UNITS = [{ k: 'total_revenue', l: '$', t: 'Revenue by category', f: (v) => K.compact.format(v) }, { k: 'index_100', l: 'Index (first month = 100)', t: 'Index by category, Jun 25 = 100', f: (v) => Math.round(v) }];
let unit = UNITS[0], focus = null, hover = -1;
const seg = K.$('#units');
for (const u of UNITS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = u.l; b.onclick = () => { unit = u; draw(); }; seg.appendChild(b); }
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
function draw () {
	seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === unit.l)));
	K.$('#title').textContent = unit.t;
	K.status(q, K.$('#s1'));
	K.sent(K.$('#sent'), app, [q], () => ['units → ' + unit.k + ' (drawn in the browser, the query returned both)']);
	if (!q.result) return;
	const rows = q.result.rows;
	const months = [...new Set(rows.map((r) => r.period))].sort(), cats = Object.keys(COLORS).filter((c) => rows.some((r) => r.category_name === c));
	const val = (c, m) => { const r = rows.find((x) => x.category_name === c && x.period === m); return r ? Number(r[unit.k]) : null; };
	const all = rows.map((r) => Number(r[unit.k]));
	const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
	const idx = unit.k === 'index_100', lo = idx ? Math.floor(Math.min(...all, 100) / 20) * 20 : 0, hi = idx ? Math.ceil(Math.max(...all) / 20) * 20 : nice(Math.max(...all));
	const W = K.$('#chart').clientWidth, H = 170, L = 40, R = 112, T = 6, B = 20, w = W - L - R, h = H - T - B;
	const x = (i) => L + w * i / (months.length - 1), y = (v) => T + h - (v - lo) / (hi - lo) * h;
	let s = '<svg width="' + W + '" height="' + H + '">';
	const ticks = idx ? [lo, 100, hi] : [0, hi / 2, hi];
	for (const t of ticks) s += '<line x1="' + L + '" x2="' + (L + w) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="' + (unit.k === 'index_100' && t === 100 ? 'var(--rule-strong)' : 'var(--rule)') + '"/><text x="' + (L - 4) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + unit.f(t) + '</text>';
	if (hover >= 0) s += '<line x1="' + x(hover) + '" x2="' + x(hover) + '" y1="' + T + '" y2="' + (T + h) + '" stroke="var(--rule-strong)"/>';
	const ends = [];
	for (const c of cats) {
		const pts = months.map((m, i) => [x(i), val(c, m)]).filter((p) => p[1] != null);
		const dim = focus && focus !== c;
		s += '<path d="' + pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ') + '" fill="none" stroke="' + COLORS[c] + '" stroke-width="' + (focus === c ? 3 : 2) + '" opacity="' + (dim ? 0.18 : 1) + '"/>';
		const last = pts[pts.length - 1]; if (last) ends.push({ c, v: last[1], y: y(last[1]), dim });
	}
	// end labels, nudged apart so they don't overlap
	ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);
	for (const e of ends) s += '<text x="' + (L + w + 6) + '" y="' + (e.y + 4) + '" style="fill: ' + COLORS[e.c] + '; opacity: ' + (e.dim ? 0.3 : 1) + '; font-weight: 600">' + K.esc(e.c) + ' ' + unit.f(e.v) + '</text>';
	s += '<text x="' + L + '" y="' + (H - 4) + '">' + mon(months[0]) + '</text><text x="' + (L + w) + '" y="' + (H - 4) + '" text-anchor="end">' + mon(months[months.length - 1]) + '</text>';
	months.forEach((m, i) => { s += '<rect data-i="' + i + '" x="' + (x(i) - w / (months.length - 1) / 2) + '" width="' + (w / (months.length - 1)) + '" y="' + T + '" height="' + h + '" fill="transparent"/>'; });
	K.$('#chart').innerHTML = s + '</svg>';
	K.$('#chart').querySelectorAll('rect[data-i]').forEach((el) => { el.onmouseenter = () => { const i = Number(el.dataset.i); if (i !== hover) { hover = i; draw(); } }; });
	K.$('#chart svg').onmouseleave = () => { if (hover !== -1) { hover = -1; draw(); } };
	K.$('#lg').innerHTML = '';
	for (const c of cats) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(focus === c)); b.innerHTML = '<i style="background:' + COLORS[c] + '"></i>' + K.esc(c); b.onclick = () => { focus = focus === c ? null : c; draw(); }; K.$('#lg').appendChild(b); }
	const i = hover < 0 ? months.length - 1 : hover;
	K.$('#read').textContent = mon(months[i]) + ': ' + cats.map((c) => c + ' ' + (val(c, months[i]) == null ? '–' : unit.f(val(c, months[i])))).join(' · ');
}
app.subscribe(draw);
app.execute();`,
};
