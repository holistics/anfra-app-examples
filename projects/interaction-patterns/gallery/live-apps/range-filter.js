LIVE['range-filter'] = {
	h: 470,
	html: `<style>
		.rs { position: relative; height: 32px; margin: 0 2px; }
		.rs .tr { position: absolute; left: 8px; right: 8px; top: 14px; height: 4px; border-radius: 2px; background: var(--sunken); }
		.rs .fl { position: absolute; top: 0; bottom: 0; border-radius: 2px; background: var(--violet); }
		.rs input { position: absolute; left: 0; width: 100%; top: 8px; height: 16px; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
		.rs input[hidden] { display: none; }
		.rs input::-webkit-slider-runnable-track { background: none; height: 16px; }
		.rs input::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid var(--violet); box-shadow: 0 1px 3px rgb(24 20 31 / 0.2); cursor: grab; }
		.rs input::-moz-range-thumb { pointer-events: auto; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid var(--violet); cursor: grab; }
		.rs input:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--violet); outline-offset: 2px; }
		.ends { display: flex; justify-content: space-between; font-size: 12px; line-height: 16px; color: var(--muted); }
		.nums { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); }
		.nums label[hidden] { display: none; }
		.nums input { width: 96px; }
		.cond { font: 400 12px/16px 'Geist Mono', ui-monospace, monospace; color: var(--violet-ink); }
		.cols2 { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 12px; }
	</style>
	<div class="app">
		<div class="panel"><div class="ph"><b>Order value</b><span class="seg" id="modes"></span></div>
			<div class="rs" id="rs"><div class="tr"><span class="fl" id="fl"></span></div><input type="range" id="lo" min="0" max="5500" step="50" value="500" aria-label="Lowest order value"><input type="range" id="hi" min="0" max="5500" step="50" value="2000" aria-label="Highest order value"></div>
			<div class="ends"><span>$0</span><span>$5,500</span></div>
			<div class="nums"><label id="loL">From $ <input type="number" id="loN" min="0" max="5500" step="50"></label><label id="hiL">To $ <input type="number" id="hiN" min="0" max="5500" step="50"></label><span class="cond" id="cond"></span></div>
		</div>
		<div class="cols2">
			<div class="panel"><div class="ph"><b>Orders in range</b><span class="status" id="s1"></span></div><div class="kpi" id="kOrders">–</div><div class="hint" id="kRev"></div></div>
			<div class="panel"><div class="ph"><b>Revenue by category</b><span class="status" id="s2"></span></div><div id="bars"></div></div>
		</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Range filter', timezone: 'Etc/UTC' });
const total = app.createQuery('total', { dataset: 'ecommerce', aql: 'explore { measures { num_orders: order_count, total_revenue: revenue } }' });
const byCat = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const value = app.createFilter('orderValue', { dataset: 'ecommerce', field: 'orders.order_value', label: 'Order value' });
app.mapControl(value, total, { field: 'orders.order_value' });
app.mapControl(value, byCat, { field: 'orders.order_value' });
const MAX = 5500;
const MODES = [['two', 'Two handles'], ['min', 'One: over'], ['max', 'One: under']];
let mode = 'two', t = 0;
const lo = K.$('#lo'), hi = K.$('#hi'), loN = K.$('#loN'), hiN = K.$('#hiN');
const usd = (v) => '$' + K.int.format(v);
for (const [k, label] of MODES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.m = k; b.onclick = () => { mode = k; sync(true); }; K.$('#modes').appendChild(b); }
// the handles can't cross: the one you move stops at the other
lo.oninput = () => { if (mode === 'two' && +lo.value > +hi.value) lo.value = hi.value; sync(); };
hi.oninput = () => { if (mode === 'two' && +hi.value < +lo.value) hi.value = lo.value; sync(); };
loN.onchange = () => { lo.value = Math.max(0, Math.min(+loN.value || 0, mode === 'two' ? +hi.value : MAX)); sync(true); };
hiN.onchange = () => { hi.value = Math.min(MAX, Math.max(+hiN.value || 0, mode === 'two' ? +lo.value : 0)); sync(true); };
function condition () {
	const a = +lo.value, b = +hi.value;
	if (mode === 'min') return a > 0 ? { operator: 'greater_than', values: [String(a)] } : null;
	if (mode === 'max') return b < MAX ? { operator: 'less_than', values: [String(b)] } : null;
	return a > 0 || b < MAX ? { operator: 'between', values: [String(a), String(b)] } : null;
}
function sync (now) {
	K.$('#modes').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
	lo.hidden = mode === 'max'; hi.hidden = mode === 'min';
	K.$('#loL').hidden = mode === 'max'; K.$('#hiL').hidden = mode === 'min';
	loN.value = lo.value; hiN.value = hi.value;
	const a = mode === 'max' ? 0 : +lo.value, b = mode === 'min' ? MAX : +hi.value;
	const fl = K.$('#fl'); fl.style.left = (a / MAX * 100) + '%'; fl.style.width = ((b - a) / MAX * 100) + '%';
	const c = condition();
	K.$('#cond').textContent = !c ? 'no filter: every order' : 'orders.order_value ' + (c.operator === 'between' ? 'between ' + c.values[0] + ' and ' + c.values[1] : (c.operator === 'greater_than' ? '> ' : '< ') + c.values[0]);
	clearTimeout(t);
	t = setTimeout(() => { if (c) value.setCondition(c); else value.reset(); app.execute(); }, now ? 0 : 250);
}
app.subscribe(() => {
	K.status(total, K.$('#s1')); K.status(byCat, K.$('#s2'));
	if (total.result && total.result.rows[0]) { const r = total.result.rows[0]; K.$('#kOrders').textContent = K.int.format(Number(r.num_orders)); K.$('#kRev').textContent = K.money.format(Number(r.total_revenue || 0)) + ' revenue'; }
	if (byCat.result) K.bars(K.$('#bars'), byCat.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue });
	K.sent(K.$('#sent'), app, [total, byCat]);
});
sync(true);`,
};
