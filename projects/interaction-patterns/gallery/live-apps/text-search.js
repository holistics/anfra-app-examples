LIVE['text-search'] = {
	h: 450,
	html: `<div class="app">
		<div class="row"><input type="search" id="q" placeholder="Search customers…" aria-label="Search customers" style="width: 240px"><span class="hint">Contains, ignoring case. Typing waits 300 ms and cancels a run still in flight</span></div>
		<div class="panel"><div class="ph"><b>Customers with completed orders<span id="by"></span></b><span class="status" id="s1"></span></div><div id="table"></div></div>
		<div class="sent" id="sent"></div></div>
		<style>.tw { max-height: 232px; }</style>`,
	js: `
const app = Anfra.createApp({ title: 'Text filter', timezone: 'Etc/UTC' });
const table = app.createQuery('customers', { dataset: 'ecommerce', aql: 'explore { dimensions { customer_name: customers.name, country_name: customers.country } measures { total_revenue: revenue, num_orders: order_count } filters { orders.status == \\'completed\\' } sorts { total_revenue desc } }' });
const name = app.createFilter('name', { dataset: 'ecommerce', field: 'customers.name', label: 'Customer' });
app.mapControl(name, table, { field: 'customers.name' });
const input = K.$('#q');
let t = 0, aborted = 0;
input.oninput = () => {
	clearTimeout(t);
	t = setTimeout(() => {
		const v = input.value.trim();
		if (v) { name.setCondition({ operator: 'contains', values: [v] }); table.setSort([{ field: 'num_orders', direction: 'desc' }]); }
		else { name.reset(); table.setSort([]); }
		if (table.state === 'executing') { table.abort(); aborted++; }
		app.execute();
	}, 300);
};
app.subscribe(() => {
K.status(table, K.$('#s1'));
const sorted = table.sort.length > 0;
K.$('#by').textContent = sorted ? ' · sorted by orders' : ' · sorted by revenue';
if (table.result) K.table(K.$('#table'), [{ key: 'customer_name', label: 'Customer' }, { key: 'country_name', label: 'Country' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(Number(v)) }, { key: 'num_orders', label: sorted ? 'Orders ▼' : 'Orders', num: true }], table.result.rows);
K.sent(K.$('#sent'), app, [table], () => [sorted ? 'sort → num_orders desc (overrides the AQL sort)' : 'sort → the AQL default (total_revenue desc)', aborted ? 'runs cancelled while typing → ' + aborted : '']);
});
app.execute();`,
};
