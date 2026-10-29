LIVE['metric-switch'] = {
	h: 360,
	html: `<div class="app">
		<div class="row"><span class="lbl">Metric</span><span class="seg" id="metrics"></span><span class="chips"><button type="button" id="nocancel" aria-pressed="true">Leave out cancelled</button></span></div>
		<div class="panel"><div class="ph"><b>By category · <span id="mname">Revenue</span></b><span class="status" id="s1"></span></div><div id="bars"></div>
		<div class="hint" id="runs"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Dynamic metric', timezone: 'Etc/UTC' });
const byCat = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue, num_orders: order_count, units: units_sold } sorts { total_revenue desc } }' });
const status = app.createFilter('status', { dataset: 'ecommerce', field: 'orders.status', label: 'Status' });
app.mapControl(status, byCat, { field: 'orders.status' });
const M = [{ k: 'total_revenue', l: 'Revenue', f: K.compact.format }, { k: 'num_orders', l: 'Orders', f: K.int.format }, { k: 'units', l: 'Units', f: K.int.format }];
let metric = M[0], runs = 0, was = '';
const seg = K.$('#metrics'), box = K.$('#bars'), nc = K.$('#nocancel');
const cancelled = () => { if (nc.getAttribute('aria-pressed') === 'true') status.setCondition({ operator: 'is_not', values: ['cancelled'] }); else status.reset(); };
cancelled();
nc.onclick = () => { nc.setAttribute('aria-pressed', String(nc.getAttribute('aria-pressed') !== 'true')); cancelled(); app.execute(); };
// draw with an animated reorder: each bar slides from its old place, and grows from its old width
function draw () {
	if (!byCat.result) return;
	const old = new Map([...box.children].map((b) => [b.querySelector('.n').textContent, { top: b.getBoundingClientRect().top, w: b.querySelector('.f').style.width }]));
	const rows = [...byCat.result.rows].sort((a, b) => Number(b[metric.k]) - Number(a[metric.k]));
	K.bars(box, rows, { label: (r) => r.category_name, value: (r) => r[metric.k], fmt: metric.f });
	[...box.children].forEach((b) => {
		const o = old.get(b.querySelector('.n').textContent); if (!o) return;
		b.querySelector('.f').style.width = o.w;
		const dy = o.top - b.getBoundingClientRect().top;
		if (dy) b.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
	});
}
for (const m of M) { const b = document.createElement('button'); b.type = 'button'; b.textContent = m.l; b.onclick = () => { metric = m; paint(); draw(); }; seg.appendChild(b); }
function paint () {
	seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === metric.l)));
	K.$('#mname').textContent = metric.l;
	K.$('#runs').textContent = 'Queries run so far: ' + runs + '. Switching the metric only redraws';
	K.sent(K.$('#sent'), app, [byCat], () => ['metric → ' + metric.k + ' (drawn in the browser, not sent)']);
}
let drawnFor = null;
app.subscribe(() => {
	if (byCat.state === 'executing' && was !== 'executing') runs++;
	was = byCat.state;
	K.status(byCat, K.$('#s1'));
	if (byCat.result && byCat.result !== drawnFor) { drawnFor = byCat.result; draw(); }
	paint();
});
app.execute();`,
};
