LIVE['cumulative-moving'] = {
	h: 390,
	html: `<style>#chart svg { display: block; overflow: visible; } #chart text { font-size: 12px; fill: var(--muted); } .key { display: inline-block; width: 14px; height: 0; border-top: 2px solid; vertical-align: 4px; margin-right: 4px; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Overlay</span><span class="chips"><button type="button" id="tRun" aria-pressed="false"><i class="key" style="border-color: var(--ink)"></i>Running total</button><button type="button" id="tAvg" aria-pressed="false"><i class="key" style="border-color: var(--violet-ink); border-top-style: dashed"></i>3-month average</button></span></div>
		<div class="panel"><div class="ph"><b>Monthly revenue</b><span class="status" id="s1"></span></div><div id="chart"></div>
		<div class="hint" id="read"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Running total & moving average', timezone: 'Etc/UTC' });
const q = app.createQuery('monthly', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, cumulative: revenue | running_total(orders.ordered_at), avg_3m: window_avg(revenue, -2..0, order: orders.ordered_at | month()) } sorts { period asc } }' });
const on = { run: false, avg: false };
let hover = -1;
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const tog = (id, k) => { const b = K.$(id); b.onclick = () => { on[k] = !on[k]; b.setAttribute('aria-pressed', String(on[k])); draw(); }; };
tog('#tRun', 'run'); tog('#tAvg', 'avg');
function draw () {
	K.status(q, K.$('#s1'));
	K.sent(K.$('#sent'), app, [q], () => ['overlays → ' + (['running total', '3-month average'].filter((x, i) => on[i ? 'avg' : 'run']).join(' + ') || 'none') + ' (drawn in the browser, the query already returned all three)']);
	if (!q.result) return;
	const rows = q.result.rows, n = rows.length;
	const W = K.$('#chart').clientWidth, H = 170, L = 40, R = on.run ? 46 : 8, T = 6, B = 20, w = W - L - R, h = H - T - B;
	const rev = rows.map((r) => Number(r.total_revenue)), avg = rows.map((r) => Number(r.avg_3m)), cum = rows.map((r) => Number(r.cumulative));
	const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
	const max = nice(Math.max(...rev, ...avg)), cmax = nice(Math.max(...cum));
	const step = w / n, x = (i) => L + step * i + step / 2, y = (v) => T + h - v / max * h, yc = (v) => T + h - v / cmax * h;
	const path = (vals, f) => vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + f(v).toFixed(1)).join(' ');
	let s = '<svg width="' + W + '" height="' + H + '">';
	for (const t of [0, 0.5, 1]) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(max * t) + '" y2="' + y(max * t) + '" stroke="var(--rule)"/><text x="' + (L - 4) + '" y="' + (y(max * t) + 4) + '" text-anchor="end">' + K.compact.format(max * t) + '</text>';
	if (on.run) for (const t of [0, 0.5, 1]) s += '<text x="' + (W - R + 4) + '" y="' + (yc(cmax * t) + 4) + '" style="fill: var(--ink)">' + K.compact.format(cmax * t) + '</text>';
	rev.forEach((v, i) => { s += '<rect x="' + (x(i) - step * 0.38).toFixed(1) + '" width="' + (step * 0.76).toFixed(1) + '" y="' + y(v).toFixed(1) + '" height="' + (T + h - y(v)).toFixed(1) + '" rx="2" fill="' + (i === hover ? 'var(--violet)' : (on.run || on.avg ? 'var(--violet-faint)' : 'var(--violet)')) + '"/>'; });
	if (on.avg) s += '<path d="' + path(avg, y) + '" fill="none" stroke="var(--violet-ink)" stroke-width="2" stroke-dasharray="5 3"/>';
	if (on.run) s += '<path d="' + path(cum, yc) + '" fill="none" stroke="var(--ink)" stroke-width="2"/>' + '<circle cx="' + x(n - 1) + '" cy="' + yc(cum[n - 1]) + '" r="3" fill="var(--ink)"/>';
	s += '<text x="' + x(0) + '" y="' + (H - 4) + '" text-anchor="middle">' + mon(rows[0].period) + '</text><text x="' + x(n - 1) + '" y="' + (H - 4) + '" text-anchor="middle">' + mon(rows[n - 1].period) + '</text>';
	rows.forEach((r, i) => { s += '<rect data-i="' + i + '" x="' + (L + step * i) + '" width="' + step + '" y="' + T + '" height="' + h + '" fill="transparent"/>'; });
	K.$('#chart').innerHTML = s + '</svg>';
	K.$('#chart').querySelectorAll('rect[data-i]').forEach((el) => { el.onmouseenter = () => { const i = Number(el.dataset.i); if (i !== hover) { hover = i; draw(); } }; });
	K.$('#chart svg').onmouseleave = () => { if (hover !== -1) { hover = -1; draw(); } };
	const i = hover < 0 ? n - 1 : hover;
	K.$('#read').textContent = mon(rows[i].period) + ': revenue ' + K.money.format(rev[i]) + (on.avg ? ' · 3-month average ' + K.money.format(avg[i]) : '') + (on.run ? ' · running total ' + K.money.format(cum[i]) : '') + (hover < 0 && !on.run && !on.avg ? ' · hover a month' : '');
}
app.subscribe(draw);
app.execute();`,
};
