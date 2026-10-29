LIVE['date-drill'] = {
	h: 400,
	html: `<div class="app">
		<div class="row"><span class="lbl">Grain</span><span class="seg" id="grains"></span><button type="button" id="up" hidden>↑ All dates</button></div>
		<div class="panel"><div class="ph"><b>Revenue by <span id="g">month</span><span id="range"></span></b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="hint">Click a column to drill into that period</div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Date drill', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at } measures { total_revenue: revenue } sorts { period asc } }' });
const grain = app.createDateDrill('grain', { default: 'month', label: 'Grain' });
const range = app.createFilter('range', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Dates' });
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
app.mapControl(range, trend, { field: 'orders.ordered_at' });
const G = ['year', 'quarter', 'month', 'week', 'day'];
let g = 'month', label = '';
const d = (v) => new Date(v);
const fmt = (v, k = g) => { const x = d(v); return k === 'year' ? String(x.getUTCFullYear()) : k === 'quarter' ? 'Q' + (Math.floor(x.getUTCMonth() / 3) + 1) + ' ' + x.getUTCFullYear() : k === 'month' ? x.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : x.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const iso = (x) => x.toISOString().slice(0, 10);
function end (start, k) { const x = new Date(start); if (k === 'year') x.setUTCFullYear(x.getUTCFullYear() + 1); else if (k === 'quarter') x.setUTCMonth(x.getUTCMonth() + 3); else if (k === 'month') x.setUTCMonth(x.getUTCMonth() + 1); else if (k === 'week') x.setUTCDate(x.getUTCDate() + 7); else x.setUTCDate(x.getUTCDate() + 1); x.setUTCDate(x.getUTCDate() - 1); return x; }
const setGrain = (k) => { g = k; grain.setGrain(k); };
const seg = K.$('#grains');
for (const x of G) { const b = document.createElement('button'); b.type = 'button'; b.textContent = x[0].toUpperCase() + x.slice(1); b.dataset.g = x; b.onclick = () => { setGrain(x); app.execute(); }; seg.appendChild(b); }
K.$('#up').onclick = () => { range.reset(); label = ''; setGrain('month'); app.execute(); };
app.subscribe(() => {
K.status(trend, K.$('#s1'));
seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === g)));
K.$('#g').textContent = g; K.$('#range').textContent = label ? ' in ' + label : ''; K.$('#up').hidden = !label;
const next = G[G.indexOf(g) + 1];
if (trend.result) K.columns(K.$('#trend'), trend.result.rows, { label: (r) => fmt(r.period), value: (r) => r.total_revenue,
	pick: next ? (r) => { const s = d(r.period); label = fmt(r.period); range.setCondition({ operator: 'between', values: [iso(s), iso(end(s, g))] }); setGrain(next); app.execute(); } : null });
K.sent(K.$('#sent'), app, [trend]);
});
app.execute();`,
};
