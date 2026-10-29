LIVE['bins'] = {
	h: 440,
	html: `<div class="app">
		<div class="row"><span class="lbl">Bin width</span><span class="seg" id="widths"></span><span class="hint">Each width is a new query built from a fixed list</span></div>
		<div class="cols" style="grid-template-columns: 1fr 1.1fr">
			<div class="panel"><div class="ph"><b><span id="bt">Orders</span> by value band</b><span class="status" id="s1"></span></div><div id="bands"></div>
			<div class="row" style="margin-top:8px"><span class="lbl">Bars show</span><span class="seg" id="measure"><button type="button" data-m="num_orders" aria-pressed="true">Orders</button><button type="button" data-m="total_revenue" aria-pressed="false">Revenue</button></span></div></div>
			<div class="panel"><div class="ph"><b>Histogram · <span id="wl">$250</span> bins</b><span class="status" id="s2"></span></div><div id="hist"></div></div>
		</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Binning', timezone: 'Etc/UTC' });
const BANDS = 'dimension orders.value_band = case(when: orders.order_value < 100, then: \\'1. under $100\\', when: orders.order_value < 500, then: \\'2. $100-499\\', when: orders.order_value < 1000, then: \\'3. $500-999\\', else: \\'4. $1,000+\\'); explore { dimensions { band: orders.value_band } measures { num_orders: order_count, total_revenue: revenue } sorts { band asc } }';
const bands = app.createQuery('bands', { dataset: 'ecommerce', aql: BANDS });
const WIDTHS = [100, 250, 500];
const hist = {};
const histQuery = (w) => hist[w] || (hist[w] = app.createQuery('histogram' + w, { dataset: 'ecommerce', aql: 'dimension orders.value_bin = floor(orders.order_value / ' + Number(w) + ') * ' + Number(w) + '; explore { dimensions { bin_start: orders.value_bin } measures { num_orders: order_count } sorts { bin_start asc } }' }));
let w = 250, m = 'num_orders';
histQuery(w);
const seg = K.$('#widths');
for (const x of WIDTHS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = '$' + x; b.dataset.w = x; b.onclick = () => { w = x; histQuery(w); app.execute(); draw(); }; seg.appendChild(b); }
K.$('#measure').querySelectorAll('button').forEach((b) => { b.onclick = () => { m = b.dataset.m; K.$('#measure').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }; });
const usd = (v) => '$' + K.int.format(v);
function draw () {
	const h = hist[w];
	if (!h) return; // createQuery notifies subscribers before it returns
	seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.w) === w)));
	K.$('#wl').textContent = usd(w);
	K.status(bands, K.$('#s1')); K.status(h, K.$('#s2'));
	if (bands.result) K.bars(K.$('#bands'), bands.result.rows, { label: (r) => r.band.slice(3), value: (r) => r[m], fmt: m === 'num_orders' ? (v) => K.int.format(v) : (v) => K.compact.format(v) });
	K.$('#bt').textContent = m === 'num_orders' ? 'Orders' : 'Revenue';
	if (h.result) {
		const got = new Map(h.result.rows.map((r) => [Number(r.bin_start), Number(r.num_orders)]));
		const top = Math.max(...got.keys()), rows = [];
		for (let s = 0; s <= top; s += w) rows.push({ s, n: got.get(s) || 0 });
		K.columns(K.$('#hist'), rows, { label: (r) => usd(r.s) + '–' + usd(r.s + w - 1), value: (r) => r.n, fmt: (v) => K.int.format(v) + ' orders' });
	}
	K.sent(K.$('#sent'), app, [bands, h], () => ['bin width → ' + usd(w) + ', written into the AQL text of histogram' + w + ' (no query parameters in anfra 0.8.0)']);
}
app.subscribe(draw);
app.execute();`,
};
