LIVE['range-brush'] = {
	h: 480,
	html: `<div class="app">
		<style>
		.bb { position: relative; height: 104px; display: flex; align-items: flex-end; gap: 2px; cursor: crosshair; user-select: none; touch-action: none; }
		.bb .c { flex: 1; min-width: 2px; background: var(--violet); border-radius: 2px 2px 0 0; transition: background-color 160ms var(--ease); pointer-events: none; }
		.bb.some .c:not(.in) { background: var(--violet-faint); }
		.bb .br { position: absolute; top: 0; bottom: 0; background: rgb(138 81 212 / 0.1); border: 1px solid var(--violet); border-radius: 4px; pointer-events: none; }
		.bx { display: flex; gap: 2px; font-size: 12px; line-height: 16px; color: var(--muted); margin-top: 4px; }
		.bx span { flex: 1; min-width: 2px; white-space: nowrap; overflow: visible; }
		#bycat .b { grid-template-columns: 72px minmax(0, 1fr) 52px; }
		</style>
		<div class="row"><span class="hint">Drag across the columns to brush a period, or click one month</span><button type="button" id="clear" hidden>Clear brush</button></div>
		<div class="panel"><div class="ph"><b>Revenue by month<span id="rng"></span></b><span class="status" id="s1"></span></div><div class="bb" id="bb"></div><div class="bx" id="bx"></div></div>
		<div class="cols" style="grid-template-columns: 1fr 1.4fr">
		<div class="panel"><div class="ph"><b>In range</b><span class="status" id="s2"></span></div><div class="lbl">Revenue</div><div class="kpi" id="rev">–</div><div class="lbl">Orders</div><div class="kpi" id="ord">–</div></div>
		<div class="panel"><div class="ph"><b>By category</b><span class="status" id="s3"></span></div><div id="bycat"></div></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Range brushing', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at } measures { total_revenue: revenue } sorts { period asc } }' });
const kpis = app.createQuery('kpis', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue, num_orders: order_count } }' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const grain = app.createDateDrill('grain', { default: 'month', label: 'Grain' });
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
app.mapCrossFilter(trend, kpis);
app.mapCrossFilter(trend, byCategory);
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const box = K.$('#bb');
let drag = null, live = null;
const idx = (e) => { const r = box.getBoundingClientRect(); const n = trend.result.rows.length; return Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n))); };
function drawBrush (a, b) {
	let br = box.querySelector('.br');
	if (a == null) { if (br) br.remove(); return; }
	if (!br) { br = document.createElement('div'); br.className = 'br'; box.appendChild(br); }
	const n = trend.result.rows.length, lo = Math.min(a, b), hi = Math.max(a, b);
	br.style.left = (lo / n * 100) + '%'; br.style.width = ((hi - lo + 1) / n * 100) + '%';
	box.querySelectorAll('.c').forEach((c, i) => c.classList.toggle('in', i >= lo && i <= hi));
	box.classList.add('some');
}
box.onpointerdown = (e) => { if (!trend.result) return; box.setPointerCapture(e.pointerId); const i = idx(e); drag = [i, i]; drawBrush(i, i); };
box.onpointermove = (e) => { if (!drag) return; drag[1] = idx(e); drawBrush(drag[0], drag[1]); };
box.onpointerup = () => { if (!drag) return; const lo = Math.min(...drag), hi = Math.max(...drag); drag = null; live = [lo, hi];
	trend.select(trend.result.rows.slice(lo, hi + 1)); app.execute(); };
K.$('#clear').onclick = () => { live = null; app.clearSelection(); app.execute(); };
app.subscribe(() => {
K.status(trend, K.$('#s1')); K.status(kpis, K.$('#s2')); K.status(byCategory, K.$('#s3'));
const s = trend.selectedRows;
if (!s.length) live = null;
K.$('#clear').hidden = !live;
K.$('#rng').textContent = live && s.length ? ': ' + mon(s[0].period) + (s.length > 1 ? ' – ' + mon(s[s.length - 1].period) : '') + ' brushed' : '';
if (trend.result && !drag) {
	const rows = trend.result.rows, max = Math.max(...rows.map((r) => Number(r.total_revenue)), 1);
	box.className = 'bb';
	box.replaceChildren(...rows.map((r) => { const c = document.createElement('div'); c.className = 'c'; c.style.height = (Number(r.total_revenue) / max * 100) + '%'; c.title = mon(r.period) + ' · ' + K.money.format(r.total_revenue); return c; }));
	K.$('#bx').replaceChildren(...rows.map((r, i) => { const sp = document.createElement('span'); sp.textContent = i % 3 === 0 ? mon(r.period) : ''; return sp; }));
	if (live) drawBrush(live[0], live[1]);
}
const k = kpis.result?.rows[0];
K.$('#rev').textContent = k ? K.money.format(k.total_revenue) : '–';
K.$('#ord').textContent = k ? K.int.format(k.num_orders) : '–';
if (byCategory.result) K.bars(K.$('#bycat'), byCategory.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue });
K.sent(K.$('#sent'), app, [kpis, byCategory]);
});
app.execute();`,
};
