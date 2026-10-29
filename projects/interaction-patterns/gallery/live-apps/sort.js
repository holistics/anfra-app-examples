LIVE['sort'] = {
	h: 470,
	html: `<style>#tbl tbody tr:nth-child(25n+1):not(:first-child) td { border-top: 2px solid var(--violet-faint); }</style>
	<div class="app">
		<div class="row"><span class="hint">Click a column header to sort on the server. Click it again to flip the direction</span><button type="button" id="reset" hidden>AQL order</button></div>
		<div class="panel"><div class="ph"><b>Customers, completed orders</b><span class="status" id="s1"></span></div><div id="tbl"></div>
		<div class="row" style="justify-content: space-between; margin-top: 8px"><span class="hint" id="foot"></span><button type="button" id="more">Load 25 more</button></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Sort', timezone: 'Etc/UTC' });
const customers = app.createQuery('customers', { dataset: 'ecommerce', pageSize: 25,
	aql: 'explore { dimensions { customer_name: customers.name, country_name: customers.country } measures { total_revenue: revenue, num_orders: order_count } filters { orders.status == \\'completed\\' } sorts { total_revenue desc } }' });
const COLS = [
	{ key: 'n', label: '#', num: true, fixed: true },
	{ key: 'customer_name', label: 'Customer', first: 'asc' },
	{ key: 'country_name', label: 'Country', first: 'asc' },
	{ key: 'total_revenue', label: 'Revenue', num: true, first: 'desc', fmt: (v) => K.money.format(Number(v)) },
	{ key: 'num_orders', label: 'Orders', num: true, first: 'desc' },
];
let sort = null; // { field, direction } or null for the AQL's own order
const box = K.$('#tbl'), more = K.$('#more');
function sortBy (c) {
	if (c.fixed) return;
	const dir = sort && sort.field === c.key ? (sort.direction === 'desc' ? 'asc' : 'desc') : c.first;
	sort = { field: c.key, direction: dir };
	// the customer name breaks ties, so page 2 never repeats or skips a row
	customers.setSort(c.key === 'customer_name' ? [sort] : [sort, { field: 'customer_name', direction: 'asc' }]);
	box.dataset.top = '0';
	app.execute();
}
K.$('#reset').onclick = () => { sort = null; customers.setSort([]); app.execute(); };
more.onclick = () => { more.disabled = true; customers.fetchMore().catch(() => {}).finally(() => { more.disabled = false; }); };
app.subscribe(() => {
	K.status(customers, K.$('#s1'));
	K.$('#reset').hidden = !sort;
	if (customers.result) {
		const tw = box.querySelector('.tw'), top = box.dataset.top === '0' ? 0 : (tw ? tw.scrollTop : 0);
		delete box.dataset.top;
		const rows = customers.result.rows.map((r, i) => Object.assign({ n: i + 1 }, r));
		K.table(box, COLS.map((c) => Object.assign({}, c, { label: c.label + (sort && sort.field === c.key ? (sort.direction === 'desc' ? ' ▼' : ' ▲') : (!sort && c.key === 'total_revenue' ? ' ▽' : '')) })), rows);
		box.querySelectorAll('th').forEach((th, i) => { if (COLS[i].fixed) return; th.style.cursor = 'pointer'; th.tabIndex = 0; th.title = 'Sort by ' + COLS[i].label; th.onclick = () => sortBy(COLS[i]); th.onkeydown = (e) => { if (e.key === 'Enter') sortBy(COLS[i]); }; if (sort && sort.field === COLS[i].key) th.style.color = 'var(--violet-ink)'; });
		box.querySelector('.tw').scrollTop = top;
		K.$('#foot').textContent = rows.length + ' loaded · page ' + customers.page + (customers.hasMore ? '' : ' · all loaded');
		more.hidden = !customers.hasMore;
	}
	K.sent(K.$('#sent'), app, [customers], () => [sort ? 'sort → ' + customers.sort.map((s) => s.field + ' ' + s.direction).join(', ') : 'sort → none, the AQL\\'s own (total_revenue desc)', 'page → ' + customers.page + ', 25 rows per page']);
});
app.execute();`,
};
