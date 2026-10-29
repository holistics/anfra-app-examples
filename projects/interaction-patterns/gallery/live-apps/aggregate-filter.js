LIVE['aggregate-filter'] = {
	h: 420,
	html: `<div class="app">
		<div class="row"><label class="lbl" for="min">Revenue over</label><input type="range" id="min" min="0" max="24000" step="1000" value="0" style="width: 220px"><b id="val">no minimum</b></div>
		<div class="panel"><div class="ph"><b>Customers by revenue: <span id="kpi">–</span></b><span class="status" id="s1"></span></div><div id="table"></div>
		<div class="hint" style="margin-top: 6px">The condition is on the revenue total, so anfra puts it in having, after aggregation</div></div>
		<div class="sent" id="sent"></div></div>
		`,
	js: `
const app = Anfra.createApp({ title: 'Metric filter', timezone: 'Etc/UTC' });
const customers = app.createQuery('customers', { dataset: 'ecommerce', aql: 'explore { dimensions { customer_name: customers.name, country_name: customers.country } measures { total_revenue: revenue, num_orders: order_count } sorts { total_revenue desc } }' });
const minRevenue = app.createFilter('minRevenue', { type: 'number', label: 'Revenue over' });
app.mapControl(minRevenue, customers, { field: 'revenue' });
const slider = K.$('#min');
let all = null, t = 0;
const label = () => { const v = Number(slider.value); K.$('#val').textContent = v ? K.compact.format(v) : 'no minimum'; };
slider.oninput = () => {
	label();
	clearTimeout(t);
	t = setTimeout(() => { const v = Number(slider.value); if (v) minRevenue.setCondition({ operator: 'greater_than', values: [String(v)] }); else minRevenue.reset(); app.execute(); }, 250);
};
app.subscribe(() => {
K.status(customers, K.$('#s1'));
if (customers.result) {
	const rows = customers.result.rows;
	const c = minRevenue.appliedCondition;
	if (!(c && c.values && c.values.length)) all = rows.length;
	K.$('#kpi').textContent = K.int.format(rows.length) + (all != null ? ' of ' + K.int.format(all) : '');
	K.table(K.$('#table'), [{ key: 'customer_name', label: 'Customer' }, { key: 'country_name', label: 'Country' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(Number(v)) }, { key: 'num_orders', label: 'Orders', num: true }], rows);
}
K.sent(K.$('#sent'), app, [customers]);
});
app.execute();`,
};
