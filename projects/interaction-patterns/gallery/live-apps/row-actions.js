LIVE['row-actions'] = {
	h: 660,
	html: `<style>
		.acts { display: flex; gap: 4px; justify-content: flex-end; }
		.acts a { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border: 1px solid var(--rule-strong); border-radius: 6px; font-size: 12px; color: var(--ink); text-decoration: none; white-space: nowrap; }
		.acts a:hover { border-color: var(--violet); color: var(--violet-ink); background: var(--violet-soft); }
		.acts a:focus-visible { outline: 2px solid var(--violet); outline-offset: 1px; }
		#last { font: 400 12px/16px 'Geist Mono', ui-monospace, monospace; color: var(--violet-ink); min-height: 16px; overflow-wrap: anywhere; }
		#orders[hidden] { display: none; }
	</style>
	<div class="app">
		<div class="panel"><div class="ph"><b>Top customers · each row has actions</b><span class="status" id="s1"></span></div><div class="tw" id="tbl"></div></div>
		<div id="last" aria-live="polite"></div>
		<div class="panel" id="orders" hidden><div class="ph"><b id="ot"></b><span class="status" id="s2"></span></div><div class="tw" id="otbl"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Row actions', timezone: 'Etc/UTC' });
// each action's URL is a field: built in AQL from the row's own values
const URLS = 'dimension customers.crm_url = concat(\\'https://crm.example.com/accounts/\\', cast(customers.id, \\'text\\'));\\n'
	+ 'dimension customers.email_url = concat(\\'mailto:\\', customers.email, \\'?subject=Your%20order%20history\\');\\n'
	+ 'dimension customers.orders_url = concat(\\'#orders?customer=\\', cast(customers.id, \\'text\\'));\\n';
const top = app.createQuery('topCustomers', { dataset: 'ecommerce', pageSize: 8, aql: URLS + 'explore { dimensions { customer_name: customers.name, country_name: customers.country, crm_url: customers.crm_url, email_url: customers.email_url, orders_url: customers.orders_url } measures { total_revenue: revenue, num_orders: order_count } sorts { total_revenue desc } }' });
const orders = app.createQuery('orders', { dataset: 'ecommerce', pageSize: 6, aql: 'explore { dimensions { order_id: orders.id, ordered_on: orders.ordered_at, order_status: orders.status } measures { total_revenue: revenue } sorts { ordered_on desc, order_id desc } }' });
const customer = app.createFilter('customer', { dataset: 'ecommerce', field: 'customers.id', label: 'Customer' });
app.mapControl(customer, orders, { field: 'customers.id' });
let who = null;
const ACTIONS = [
	{ key: 'crm_url', label: 'Open in CRM ↗', external: true },
	{ key: 'email_url', label: 'Email', external: true },
	{ key: 'orders_url', label: 'View orders →' },
];
// an in-app URL opens another view of this app; the id goes to the filter as a string
function go (url, r) {
	const m = /customer=(\\d+)/.exec(url); if (!m) return;
	who = r.customer_name; customer.setCondition({ operator: 'is', values: [m[1]] }); app.execute();
}
const dd = (v) => { const x = new Date(String(v).slice(0, 10) + 'T00:00:00Z'); return x.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()] + ' ' + String(x.getUTCFullYear()).slice(2); };
function draw () {
	K.status(top, K.$('#s1'));
	if (top.result) {
		K.table(K.$('#tbl'), [{ key: 'customer_name', label: 'Customer' }, { key: 'country_name', label: 'Country' }, { key: 'num_orders', label: 'Orders', num: true }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(v) }, { key: 'crm_url', label: 'Actions', num: true, fmt: () => '' }], top.result.rows);
		K.$('#tbl').querySelectorAll('tbody tr').forEach((tr, i) => {
			const r = top.result.rows[i], cell = tr.lastElementChild;
			const box = document.createElement('div'); box.className = 'acts';
			for (const a of ACTIONS) {
				const url = String(r[a.key] || ''), el = document.createElement('a');
				el.textContent = a.label; el.href = url; el.title = url;
								el.setAttribute('aria-label', a.label.replace(/[↗→]/g, '').trim() + ': ' + r.customer_name);
				el.onclick = (e) => { e.preventDefault(); if (a.external) K.$('#last').textContent = 'Opens ' + url + ' · blocked here: a sandboxed app can\\'t open tabs or leave the page'; else { K.$('#last').textContent = 'Goes to ' + url; go(url, r); } };
				box.appendChild(el);
			}
			cell.replaceChildren(box);
		});
	}
	K.$('#orders').hidden = !who;
	if (who) {
		K.status(orders, K.$('#s2'));
		K.$('#ot').textContent = 'Latest orders from ' + who;
		if (orders.result) K.table(K.$('#otbl'), [{ key: 'order_id', label: 'Order', fmt: (v) => '#' + v }, { key: 'ordered_on', label: 'Date', fmt: dd }, { key: 'order_status', label: 'Status' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(v) }], orders.result.rows);
	}
	K.sent(K.$('#sent'), app, who ? [top, orders] : [top]);
}
app.subscribe(draw);
app.execute();`,
};
