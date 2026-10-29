# Row actions

> Put links on each table row: open the customer in your CRM, email them, or see their orders.

- Pattern id: `row-actions`
- Category: Drilling (also Controls)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#row-actions
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Each row of the top-customers table has three actions. **Open in CRM** and **Email** use URLs built in AQL from the row, such as `https://crm.example.com/accounts/184`. **View orders** is an in-app URL: on Customer 184 it opens their latest orders, starting with #803 on 23 Aug 26 for $4,243.

Why: A table of customers is a to-do list. Actions take the reader from the number to the next step without copying IDs between tools.

## What to build

Each action's URL is a field built in AQL from the row's values. An outside link opens another tool; an in-app link sets a filter and shows another view.

Layout: A customer table with an Actions column, and the orders view an in-app action opens.

Instruction: Add row actions to a table in my Data App: links built from each row's fields, such as an Open in CRM URL, plus an in-app action that opens a filtered view.

Done when: Every row's links carry that row's values, and the in-app action shows only that row's records.

On the ecommerce sample: Customer 184's CRM link ends in /accounts/184, and View orders lists #803 first, on 23 Aug 26 for $4,243.

## AQL

Not run as written: each action's URL is a dimension, built in AQL from the row's fields.

```aql
dimension customers.crm_url = concat('https://crm.example.com/accounts/', cast(customers.id, 'text'));
dimension customers.email_url = concat('mailto:', customers.email, '?subject=Your%20order%20history');
explore { dimensions { customer_name: customers.name, crm_url: customers.crm_url, email_url: customers.email_url } measures { total_revenue: revenue } sorts { total_revenue desc } }
```

`concat` takes text only, so a number such as `customers.id` needs `cast(…, 'text')`. Defined in the Dataset, the URL field can be reused by every app.

## SDK wiring

```js
// the URLs come back as columns, one per action
const ACTIONS = [
  { key: 'crm_url', label: 'Open in CRM' },
  { key: 'email_url', label: 'Email' },
  { key: 'orders_url', label: 'View orders' }, // in-app
];
link.onclick = (e) => {
  e.preventDefault();
  const id = /customer=(\d+)/.exec(row.orders_url)[1];
  // number filter values are strings
  customer.setCondition({ operator: 'is', values: [id] });
  app.execute();
};
```

State it touches: Interaction mapping: each action is a URL field on the row. An in-app action turns into a filter condition; an outside one leaves the app.

## Notes

- Define `crm_url` once in the Dataset; every query and app can show it
- Limits: Works with app code: the URLs are AQL fields, but Data Apps run in a sandbox that allows scripts only, so links to other sites can't open a tab or leave the page. In-app actions work. A proposed host API, `Anfra.openUrl(url)` with an allowlist of domains, would open the rest.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>
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
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Row actions', timezone: 'Etc/UTC' });
// each action's URL is a field: built in AQL from the row's own values
const URLS = 'dimension customers.crm_url = concat(\'https://crm.example.com/accounts/\', cast(customers.id, \'text\'));\n'
	+ 'dimension customers.email_url = concat(\'mailto:\', customers.email, \'?subject=Your%20order%20history\');\n'
	+ 'dimension customers.orders_url = concat(\'#orders?customer=\', cast(customers.id, \'text\'));\n';
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
	const m = /customer=(\d+)/.exec(url); if (!m) return;
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
				el.onclick = (e) => { e.preventDefault(); if (a.external) K.$('#last').textContent = 'Opens ' + url + ' · blocked here: a sandboxed app can\'t open tabs or leave the page'; else { K.$('#last').textContent = 'Goes to ' + url; go(url, r); } };
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
app.execute();
```

## Walkthrough on the gallery card

1. Read the table: each customer row ends with **Open in CRM ↗**, **Email** and **View orders →**
2. Hover **Open in CRM** on Customer 184: its URL is `https://crm.example.com/accounts/184`, built in the query
3. Click it: the app shows the URL, and says the sandbox won't let it open a tab
4. Click **View orders →** on Customer 184: their latest orders open below, starting with **#803** on 23 Aug 26 for $4,243

## Other Drilling patterns

- [Drill down](hierarchy-drill.md): Click a region to see its countries, then customers, then their orders, and climb back with breadcrumbs.
- [Drill path](drill-path.md): Keep a trail of every step down and up, and click any step to go back to it.
- [Break down](adhoc-breakdown.md): Right-click a bar to split it by another field, like order status.
- [View underlying data](underlying-records.md): Click a column on a chart to see the individual orders behind it.
- [Drill-through](drillthrough.md): Click a country to open another app already filtered to that country.
