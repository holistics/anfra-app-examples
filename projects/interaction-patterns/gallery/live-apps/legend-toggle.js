LIVE['legend-toggle'] = {
	h: 440,
	html: `<div class="app">
		<div class="row"><span class="lg" id="legend"></span><button type="button" id="all" hidden>Show all</button></div>
		<div class="hint">Click hides a line (no query). Alt-click or Alt+Enter filters every panel to it</div>
		<div class="cols" style="grid-template-columns: 1fr 132px">
		<div class="panel"><div class="ph"><b>Revenue by category, monthly</b><span class="status" id="s1"></span></div><div id="chart"></div></div>
		<div class="panel"><div class="ph"><b>Total</b><span class="status" id="s2"></span></div><div class="kpi" id="kpi">–</div><div class="hint" id="for">all categories</div></div></div>
		<div class="row"><span class="hint" id="count"></span></div>
		<div class="sent" id="sent"></div></div>
		<style>.lg { display: flex; gap: 4px; flex-wrap: wrap; } .lg button { height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; } .lg i { width: 10px; height: 3px; border-radius: 2px; display: inline-block; } .lg button.off { color: var(--muted); text-decoration: line-through; } .lg button.off i { opacity: 0.3; } .lg button.out { color: var(--muted); border-style: dashed; } .lg button.out i { opacity: 0.3; } #chart svg { display: block; overflow: visible; } #chart text { font-size: 12px; fill: var(--muted); font-family: inherit; } #chart path { transition: d 320ms var(--ease); }</style>`,
	js: `
const app = Anfra.createApp({ title: 'Legend visibility', timezone: 'Etc/UTC' });
const lines = app.createQuery('lines', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category, period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { category_name asc, period asc } }' });
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
const category = app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
for (const q of [lines, kpi]) app.mapControl(category, q, { field: 'products.category' });
const COLORS = ['#8a51d4', '#1f9e89', '#e07b39', '#3b6fb6'];
let cats = [], only = null, hides = 0, runs = 0, was = '';
const hidden = new Set();
const legend = K.$('#legend');
const color = (c) => COLORS[Math.max(0, cats.indexOf(c)) % COLORS.length];
function filterTo (c) { only = only === c ? null : c; hidden.clear(); if (only) category.setCondition({ operator: 'is', values: [only] }); else category.reset(); app.execute(); }
function toggle (c) { if (only && only !== c) return; hidden.has(c) ? hidden.delete(c) : hidden.add(c); hides++; draw(); }
category.loadOptions().then((vals) => { cats = vals.map(String); legend.replaceChildren(...cats.map((c) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.c = c; b.innerHTML = '<i style="background:' + color(c) + '"></i>' + K.esc(c); b.onclick = (e) => { if (e.altKey) filterTo(c); else toggle(c); }; b.onkeydown = (e) => { if (e.key === 'Enter' && e.altKey) { e.preventDefault(); filterTo(c); } }; return b; })); draw(); });
K.$('#all').onclick = () => { hidden.clear(); hides++; if (only) filterTo(only); else draw(); };
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
function draw () {
	legend.querySelectorAll('button').forEach((b) => { const c = b.dataset.c; b.classList.toggle('off', hidden.has(c)); b.classList.toggle('out', !!only && only !== c); b.setAttribute('aria-pressed', String(!hidden.has(c) && (!only || only === c))); b.title = only && only !== c ? 'Filtered out: Alt-click to filter to ' + c : hidden.has(c) ? 'Hidden: click to show' : 'Click to hide, Alt-click to show only this'; });
	K.$('#all').hidden = !hidden.size && !only;
	K.$('#count').textContent = 'Queries run: ' + runs + ' · legend hides: ' + hides + ' (no query)';
	if (!lines.result) return;
	const el = K.$('#chart'), W = Math.max(200, el.clientWidth), H = 170, L = 44, B = 18;
	const periods = [...new Set(lines.result.rows.map((r) => r.period))].sort();
	const series = new Map();
	lines.result.rows.forEach((r) => { if (!series.has(r.category_name)) series.set(r.category_name, new Map()); series.get(r.category_name).set(r.period, Number(r.total_revenue)); });
	const shown = [...series.keys()].filter((c) => !hidden.has(c));
	const max = Math.max(1, ...shown.flatMap((c) => [...series.get(c).values()])) * 1.08;
	const x = (i) => L + (periods.length > 1 ? i / (periods.length - 1) : 0.5) * (W - L - 4), y = (v) => (H - B) - v / max * (H - B - 6);
	let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Revenue by category">';
	[0, 0.5, 1].forEach((t) => { const v = max / 1.08 * t, yy = y(v); s += '<line x1="' + L + '" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" stroke="rgb(24 20 31 / 0.08)"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + K.compact.format(v) + '</text>'; });
	[0, Math.floor((periods.length - 1) / 2), periods.length - 1].forEach((i, k) => { if (periods[i]) s += '<text x="' + x(i) + '" y="' + H + '" text-anchor="' + ['start', 'middle', 'end'][k] + '">' + mon(periods[i]) + '</text>'; });
	shown.forEach((c) => { const m = series.get(c); s += '<path fill="none" stroke="' + color(c) + '" stroke-width="2" stroke-linejoin="round" d="' + periods.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(m.get(p) || 0).toFixed(1)).join(' ') + '"><title>' + K.esc(c) + '</title></path>'; });
	el.innerHTML = s + '</svg>';
}
app.subscribe(() => {
if (lines.state === 'success' && was !== 'success') runs++;
was = lines.state;
K.status(lines, K.$('#s1')); K.status(kpi, K.$('#s2'));
if (kpi.result) K.$('#kpi').textContent = K.compact.format(Number(kpi.result.rows[0]?.total_revenue || 0));
K.$('#for').textContent = only || 'all categories';
draw();
K.sent(K.$('#sent'), app, [lines, kpi], () => [hidden.size ? 'hidden in the renderer, not sent → ' + [...hidden].join(', ') : '']);
});
app.execute();`,
};
