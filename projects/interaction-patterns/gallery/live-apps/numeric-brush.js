LIVE['numeric-brush'] = {
	h: 480,
	html: `<div class="app">
		<style>
		.bb { position: relative; height: 104px; display: flex; align-items: flex-end; gap: 2px; cursor: crosshair; user-select: none; touch-action: none; }
		.bb .c { flex: 1; min-width: 2px; background: var(--violet); border-radius: 2px 2px 0 0; pointer-events: none; }
		.bb.some .c:not(.in) { background: var(--violet-faint); }
		.bb .br { position: absolute; top: 0; bottom: 0; background: rgb(138 81 212 / 0.1); border: 1px solid var(--violet); border-radius: 4px; pointer-events: none; }
		.bx { display: flex; gap: 2px; font-size: 12px; line-height: 16px; color: var(--muted); margin-top: 4px; }
		.bx span { flex: 1; min-width: 2px; white-space: nowrap; overflow: visible; }
		#bycat .b { grid-template-columns: 72px minmax(0, 1fr) 52px; }
		</style>
		<div class="row"><span class="hint">Drag across the histogram to pick a range of order values</span><span class="chips"><button type="button" id="chip" aria-pressed="true" hidden></button></span></div>
		<div class="panel"><div class="ph"><b>Orders by order value, $250 bins<span id="rng"></span></b><span class="status" id="s1"></span></div><div class="bb" id="bb"></div><div class="bx" id="bx"></div></div>
		<div class="cols" style="grid-template-columns: 1fr 1.4fr">
		<div class="panel"><div class="ph"><b>In range</b><span class="status" id="s2"></span></div><div class="lbl">Orders</div><div class="kpi" id="ord">–</div><div class="lbl">Revenue</div><div class="kpi" id="rev">–</div><div class="hint" id="edge"></div></div>
		<div class="panel"><div class="ph"><b>Revenue by category</b><span class="status" id="s3"></span></div><div id="bycat"></div></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Histogram brushing', timezone: 'Etc/UTC' });
const hist = app.createQuery('histogram', { dataset: 'ecommerce', aql: 'dimension orders.value_bin = floor(orders.order_value / 250) * 250;\\nexplore { dimensions { bin_start: orders.value_bin } measures { num_orders: order_count } sorts { bin_start asc } }' });
const kpis = app.createQuery('kpis', { dataset: 'ecommerce', aql: 'explore { measures { num_orders: order_count, total_revenue: revenue } }' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const value = app.createFilter('orderValue', { dataset: 'ecommerce', field: 'orders.order_value', label: 'Order value' });
for (const q of [kpis, byCategory]) app.mapControl(value, q, { field: 'orders.order_value' });
const W = 250;
const box = K.$('#bb');
let bins = [], drag = null, live = null;
const usd = (v) => '$' + K.int.format(v);
const idx = (e) => { const r = box.getBoundingClientRect(); return Math.max(0, Math.min(bins.length - 1, Math.floor((e.clientX - r.left) / r.width * bins.length))); };
function drawBrush (a, b) {
	let br = box.querySelector('.br');
	if (a == null) { if (br) br.remove(); return; }
	if (!br) { br = document.createElement('div'); br.className = 'br'; box.appendChild(br); }
	const n = bins.length, lo = Math.min(a, b), hi = Math.max(a, b);
	br.style.left = (lo / n * 100) + '%'; br.style.width = ((hi - lo + 1) / n * 100) + '%';
	box.querySelectorAll('.c').forEach((c, i) => c.classList.toggle('in', i >= lo && i <= hi));
	box.classList.add('some');
}
box.onpointerdown = (e) => { if (!bins.length) return; box.setPointerCapture(e.pointerId); const i = idx(e); drag = [i, i]; drawBrush(i, i); };
box.onpointermove = (e) => { if (!drag) return; drag[1] = idx(e); drawBrush(drag[0], drag[1]); };
box.onpointerup = () => { if (!drag) return; live = [Math.min(...drag), Math.max(...drag)]; drag = null;
	value.setCondition({ operator: 'between', values: [String(bins[live[0]].lo), String(bins[live[1]].lo + W)] }); app.execute(); };
K.$('#chip').onclick = () => { live = null; value.reset(); app.execute(); };
app.subscribe(() => {
K.status(hist, K.$('#s1')); K.status(kpis, K.$('#s2')); K.status(byCategory, K.$('#s3'));
if (hist.result && !drag) {
	const got = new Map(hist.result.rows.map((r) => [Number(r.bin_start), Number(r.num_orders)]));
	const top = Math.max(...got.keys());
	bins = []; for (let lo = 0; lo <= top; lo += W) bins.push({ lo, n: got.get(lo) || 0 });
	const max = Math.max(...bins.map((b) => b.n), 1);
	box.className = 'bb';
	box.replaceChildren(...bins.map((b) => { const c = document.createElement('div'); c.className = 'c'; c.style.height = Math.max(0.5, b.n / max * 100) + '%'; c.title = usd(b.lo) + '–' + usd(b.lo + W) + ' · ' + K.int.format(b.n) + ' orders'; return c; }));
	K.$('#bx').replaceChildren(...bins.map((b, i) => { const sp = document.createElement('span'); sp.textContent = i % 4 === 0 ? usd(b.lo) : ''; return sp; }));
	if (live) drawBrush(live[0], live[1]);
}
const inBins = live ? bins.slice(live[0], live[1] + 1).reduce((t, b) => t + b.n, 0) : 0;
const chip = K.$('#chip'); chip.hidden = !live; chip.textContent = live ? 'Order value: ' + usd(bins[live[0]].lo) + ' – ' + usd(bins[live[1]].lo + W) + '  ×' : '';
K.$('#rng').textContent = live ? ': ' + K.int.format(inBins) + ' orders brushed' : '';
const k = kpis.result?.rows[0];
K.$('#ord').textContent = k ? K.int.format(k.num_orders) : '–';
K.$('#rev').textContent = k ? K.money.format(k.total_revenue) : '–';
const extra = k && live ? Number(k.num_orders) - inBins : 0;
K.$('#edge').textContent = extra > 0 ? 'between includes both ends: ' + extra + ' orders of exactly ' + usd(bins[live[1]].lo + W) + ' count too' : '';
if (byCategory.result) K.bars(K.$('#bycat'), byCategory.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue });
K.sent(K.$('#sent'), app, [kpis, byCategory]);
});
app.execute();`,
};
