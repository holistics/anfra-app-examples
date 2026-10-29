LIVE['underlying-records'] = {
	h: 520,
	html: `<style>
	.stage { position: relative; min-height: 360px; overflow: hidden; display: grid; gap: 10px; align-content: start; }
	.kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.kpis .panel { padding: 8px 12px; }
	.kpis .lab { font-size: 12px; line-height: 16px; color: var(--muted); }
	.colz .cw.on .c { background: var(--violet-ink); }
	.drawer { position: absolute; inset: 82px 0 0 48px; background: #fff; border: 1px solid var(--rule-strong); border-radius: 10px; padding: 10px 12px; box-shadow: -8px 0 24px rgb(24 20 31 / 0.10); transform: translateX(105%); visibility: hidden; transition: transform 240ms var(--ease), visibility 240ms; }
	.drawer.open { transform: none; visibility: visible; }
	.drawer .tw { max-height: 200px; }
	.drawer .ft { display: flex; justify-content: space-between; align-items: center; }
	.drawer .ph { margin-bottom: 0; align-items: center; }
	.drawer .ph button { height: 24px; padding: 0 8px; font-size: 12px; border-radius: 6px; }
	</style>
	<div class="app">
		<div class="stage">
			<div class="kpis">
				<div class="panel"><div class="lab" id="l1">Revenue · all months</div><div class="kpi" id="k1">–</div></div>
				<div class="panel"><div class="lab">Orders</div><div class="kpi" id="k2">–</div></div>
				<div class="panel"><div class="lab">Average order value</div><div class="kpi" id="k3">–</div></div>
			</div>
			<div class="panel"><div class="ph"><b>Revenue by month · click a column for its orders</b><span class="status" id="s1"></span></div><div id="trend"></div></div>
			<div class="drawer" id="drawer" aria-hidden="true">
				<div class="ph"><b id="dt">Orders</b><span><span class="status" id="s2"></span> <button type="button" id="close">Close</button></span></div>
				<div id="records"></div>
				<div class="ft"><span class="hint" id="count"></span><button type="button" id="more">Load more</button></div>
			</div>
		</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'View underlying data', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, num_orders: order_count } sorts { period asc } }' });
const kpis = app.createQuery('kpis', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue, num_orders: order_count, avg_order_value: aov } }' });
const records = app.createQuery('records', { dataset: 'ecommerce', pageSize: 25, aql: 'explore { dimensions { order_id: orders.id, ordered_on: orders.ordered_at, customer_name: customers.name, order_status: orders.status } measures { total_revenue: revenue, units: units_sold } sorts { ordered_on desc, order_id desc } }' });
// the clicked month narrows the KPIs and the records; the trend keeps every month
const month = app.createFilter('month', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Month' });
app.mapControl(month, kpis, { field: 'orders.ordered_at' });
app.mapControl(month, records, { field: 'orders.ordered_at' });
let picked = null, err = '';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d0 = (v) => new Date(String(v).slice(0, 10) + 'T00:00:00Z');
const iso = (x) => x.toISOString().slice(0, 10);
const mlabel = (v) => { const x = d0(v); return MON[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); };
const dd = (v) => { const x = d0(v); return x.getUTCDate() + ' ' + MON[x.getUTCMonth()] + ' ' + String(x.getUTCFullYear()).slice(2); };
function open (r) {
	const s = d0(r.period), e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0));
	picked = r; err = '';
	month.setCondition({ operator: 'between', values: [iso(s), iso(e)] });
	app.execute();
}
K.$('#close').onclick = () => { picked = null; month.reset(); app.execute(); };
K.$('#more').onclick = () => { err = ''; records.fetchMore().catch((e) => { err = 'Couldn\\'t load more: ' + e.message; draw(); }); };
function draw () {
	K.status(trend, K.$('#s1'));
	if (kpis.result && kpis.result.rows[0]) {
		const k = kpis.result.rows[0];
		K.$('#l1').textContent = 'Revenue · ' + (picked ? mlabel(picked.period) : 'all months');
		K.$('#k1').textContent = K.money.format(Number(k.total_revenue || 0));
		K.$('#k2').textContent = K.int.format(Number(k.num_orders || 0));
		K.$('#k3').textContent = K.money.format(Number(k.avg_order_value || 0));
	}
	if (trend.result) {
		K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mlabel(r.period), value: (r) => r.total_revenue, pick: open });
		K.$('#trend').querySelectorAll('.cw').forEach((c, i) => c.classList.toggle('on', !!picked && String(trend.result.rows[i].period) === String(picked.period)));
	}
	const dr = K.$('#drawer'); dr.classList.toggle('open', !!picked); dr.setAttribute('aria-hidden', String(!picked));
	if (picked) {
		K.status(records, K.$('#s2'));
		K.$('#dt').textContent = mlabel(picked.period) + ' · ' + K.money.format(Number(picked.total_revenue));
		if (records.result && records.state !== 'executing') {
			K.table(K.$('#records'), [{ key: 'order_id', label: 'Order', fmt: (v) => '#' + v }, { key: 'ordered_on', label: 'Date', fmt: dd }, { key: 'customer_name', label: 'Customer' }, { key: 'order_status', label: 'Status' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(v) }], records.result.rows);
			K.$('#count').textContent = err || (K.int.format(records.result.rows.length) + ' of ' + K.int.format(Number(picked.num_orders)) + ' orders loaded, newest first');
		}
		K.$('#more').hidden = !records.hasMore;
	}
	K.sent(K.$('#sent'), app, picked ? [kpis, records] : [kpis, trend], () => [picked ? 'pageSize 25 · pages loaded: ' + records.page + (records.hasMore ? ' · more to load' : ' · all loaded') : '']);
}
app.subscribe(draw);
app.execute();`,
};
