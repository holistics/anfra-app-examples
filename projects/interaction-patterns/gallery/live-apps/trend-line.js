LIVE['trend-line'] = {
	h: 440,
	html: `<style>#chart svg { display: block; overflow: visible; } #chart text { font-size: 12px; fill: var(--muted); } .key { display: inline-block; width: 14px; height: 0; border-top: 2px dashed; vertical-align: 4px; margin-right: 4px; } #per[hidden] { display: none; } .cat { display: inline-flex; align-items: center; gap: 4px; margin-right: 12px; } .cat i { width: 8px; height: 8px; border-radius: 50%; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Trend line</span><span class="seg" id="types"></span><span class="seg" id="per"></span></div>
		<div class="row"><span class="chips"><button type="button" id="split" aria-pressed="false">Break down by category</button><button type="button" id="skip" aria-pressed="true">Leave out the incomplete month</button></span></div>
		<div class="panel"><div class="ph"><b>Monthly revenue<span id="by"></span></b><span class="status" id="s1"></span></div><div id="chart"></div>
		<div class="hint" id="read"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Trend line', timezone: 'Etc/UTC' });
const m = 'orders.ordered_at | month()';
const avgs = (p) => 'avg_3m: window_avg(revenue, -2..0, order: ' + m + p + '), avg_6m: window_avg(revenue, -5..0, order: ' + m + p + ')';
const total = app.createQuery('total', { dataset: 'ecommerce', aql: 'explore { dimensions { period: ' + m + ' } measures { total_revenue: revenue, ' + avgs('') + ', last_order_day: orders | max(orders.ordered_at) } sorts { period asc } }' });
const byCat = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { period: ' + m + ', category_name: products.category } measures { total_revenue: revenue, ' + avgs(', partition: products.category') + ' } sorts { category_name asc, period asc } }' });
const TYPES = [['linear', 'Linear'], ['exp', 'Exponential'], ['avg', 'Moving average']];
const ui = { type: 'linear', per: 3, split: false, skip: true };
const COLORS = ['#8a51d4', '#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const D = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
const mon = (s) => { const x = D(s); return MN[x.getUTCMonth()] + ' ' + String(x.getUTCFullYear()).slice(2); };
function seg (el, items, key) {
	for (const [v, t] of items) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.dataset.v = v; b.onclick = () => { ui[key] = key === 'per' ? Number(v) : v; draw(); }; el.appendChild(b); }
}
seg(K.$('#types'), TYPES, 'type');
seg(K.$('#per'), [[3, '3 months'], [6, '6 months']], 'per');
K.$('#split').onclick = () => { ui.split = !ui.split; draw(); };
K.$('#skip').onclick = () => { ui.skip = !ui.skip; draw(); };
// least squares on x = 0, 1, 2 ... over the points the fit uses
function line (pts) {
	const n = pts.length; if (n < 2) return null;
	const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
	let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) * (x - mx); }
	const b = sxy / sxx; return { a: my - b * mx, b };
}
// returns the fitted value at each x (null where it is not drawn), and a one-line reading
function fit (rows, use) {
	const ys = rows.map((r) => Number(r.total_revenue)), n = ys.length;
	if (ui.type === 'avg') { const k = ui.per === 6 ? 'avg_6m' : 'avg_3m'; const v = rows.map((r, i) => i >= ui.per - 1 ? Number(r[k]) : null); return { v, read: ui.per + '-month average ends at ' + K.compact.format(v[n - 1]) }; }
	const pts = ys.map((y, i) => [i, y]).filter((p, i) => use(i) && (ui.type !== 'exp' || p[1] > 0));
	if (ui.type === 'exp') {
		const f = line(pts.map(([x, y]) => [x, Math.log(y)])); if (!f) return { v: [], read: '' };
		const g = Math.exp(f.b) - 1;
		return { v: ys.map((_, i) => Math.exp(f.a + f.b * i)), read: (g >= 0 ? '+' : '') + (g * 100).toFixed(2) + '% a month' };
	}
	const f = line(pts); if (!f) return { v: [], read: '' };
	return { v: ys.map((_, i) => f.a + f.b * i), read: (f.b >= 0 ? '+' : '−') + K.money.format(Math.abs(f.b)).replace('-', '') + ' a month' };
}
function draw () {
	K.status(ui.split ? byCat : total, K.$('#s1'));
	K.$('#types').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === ui.type)));
	K.$('#per').hidden = ui.type !== 'avg';
	K.$('#per').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === ui.per)));
	K.$('#split').setAttribute('aria-pressed', String(ui.split));
	K.$('#by').textContent = ui.split ? ' by category' : '';
	K.sent(K.$('#sent'), app, [ui.split ? byCat : total], () => ['trend line → ' + (ui.type === 'avg' ? ui.per + '-month window_avg, from the query' : TYPES.find((t) => t[0] === ui.type)[1].toLowerCase() + ' fit, drawn in the browser') + (ui.skip && ui.type !== 'avg' ? ', without the incomplete month' : '')]);
	if (!total.result || !total.result.rows.length) return;
	const rows = total.result.rows, n = rows.length, last = rows[n - 1];
	const end = D(last.period); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
	const partial = D(last.last_order_day) < end;
	const had = D(last.last_order_day).getUTCDate(), all = end.getUTCDate();
	const skip = ui.skip && partial && ui.type !== 'avg';
	K.$('#skip').textContent = partial ? 'Leave out ' + mon(last.period) + ' (' + had + ' of ' + all + ' days)' : 'Every month is complete';
	K.$('#skip').disabled = !partial || ui.type === 'avg';
	K.$('#skip').setAttribute('aria-pressed', String(skip));
	const use = (i) => !(skip && i === n - 1);
	let series;
	if (ui.split) {
		if (!byCat.result) return;
		const g = {}; for (const r of byCat.result.rows) (g[r.category_name] ||= {})[String(r.period).slice(0, 10)] = r;
		series = Object.keys(g).map((c, j) => { const rs = rows.map((r) => g[c][String(r.period).slice(0, 10)] || { total_revenue: 0, avg_3m: null, avg_6m: null }); return { name: c, color: COLORS[j % COLORS.length], ys: rs.map((r) => Number(r.total_revenue)), f: fit(rs, use) }; });
	} else series = [{ name: 'All categories', color: 'var(--violet)', ys: rows.map((r) => Number(r.total_revenue)), f: fit(rows, use) }];
	const W = K.$('#chart').clientWidth, H = 180, L = 40, R = 8, T = 6, B = 20, w = W - L - R, h = H - T - B;
	const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), q = v / p; return (q <= 1 ? 1 : q <= 2 ? 2 : q <= 2.5 ? 2.5 : q <= 5 ? 5 : 10) * p; };
	const max = nice(Math.max(1, ...series.flatMap((s) => s.ys.concat(s.f.v.filter((x) => x != null)))));
	const step = w / n, x = (i) => L + step * i + step / 2, y = (v) => T + h - v / max * h;
	const path = (vals) => { let d = '', pen = false; vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; }); return d; };
	let s = '<svg width="' + W + '" height="' + H + '"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="var(--violet-faint)"/></pattern></defs>';
	for (const t of [0, 0.5, 1]) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(max * t) + '" y2="' + y(max * t) + '" stroke="var(--rule)"/><text x="' + (L - 4) + '" y="' + (y(max * t) + 4) + '" text-anchor="end">' + K.compact.format(max * t) + '</text>';
	if (!ui.split) series[0].ys.forEach((v, i) => { s += '<rect x="' + (x(i) - step * 0.38).toFixed(1) + '" width="' + (step * 0.76).toFixed(1) + '" y="' + y(v).toFixed(1) + '" height="' + (T + h - y(v)).toFixed(1) + '" rx="2" fill="' + (use(i) ? 'var(--violet-faint)' : 'url(#hatch)') + '"' + (use(i) ? '' : ' stroke="var(--violet-faint)"') + '><title>' + mon(rows[i].period) + ': ' + K.money.format(v) + (use(i) ? '' : ' (incomplete, left out of the fit)') + '</title></rect>'; });
	else for (const se of series) s += '<path d="' + path(se.ys) + '" fill="none" stroke="' + se.color + '" stroke-width="1.5" opacity=".45"/>';
	for (const se of series) s += '<path d="' + path(se.f.v) + '" fill="none" stroke="' + (ui.split ? se.color : 'var(--ink)') + '" stroke-width="2" stroke-dasharray="6 4"/>';
	s += '<text x="' + x(0) + '" y="' + (H - 4) + '" text-anchor="middle">' + mon(rows[0].period) + '</text><text x="' + x(n - 1) + '" y="' + (H - 4) + '" text-anchor="middle">' + mon(last.period) + '</text>';
	K.$('#chart').innerHTML = s + '</svg>';
	K.$('#read').innerHTML = series.map((se) => ui.split ? '<span class="cat"><i style="background:' + se.color + '"></i>' + K.esc(se.name) + ': ' + K.esc(se.f.read) + '</span>' : '<span class="key"></span>Trend: <b>' + K.esc(se.f.read) + '</b>' + (skip ? ' · fitted on ' + (n - 1) + ' full months' : ui.type === 'avg' ? '' : ' · fitted on all ' + n + ' months')).join('');
}
app.subscribe(draw);
app.execute();`,
};
