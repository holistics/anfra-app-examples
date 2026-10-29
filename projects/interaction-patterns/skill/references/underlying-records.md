# View underlying data

> Click a column on a chart to see the individual orders behind it.

- Pattern id: `underlying-records`
- Category: Drilling (also Tables & calculations)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#underlying-records
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

KPIs and a revenue-by-month chart show $1,283,053 from 1,500 orders. The reader clicks **May 2026**: the KPIs narrow to that month, and a drawer opens with its 101 orders, newest first, 25 at a time. **Load more** fetches the next 25.

Why: Seeing the actual orders is how readers come to trust a total.

## What to build

Clicking a chart element filters to its values and opens a drawer with the records behind it, a page at a time.

Layout: Three KPIs and a revenue-by-month column chart; clicking a column opens a drawer with the order table, a row count and Load more.

Instruction: Clicking a point or column in my charts narrows the KPIs to it and opens a drawer listing the records behind it, newest first, with Load more.

Done when: The drawer lists only records matching the clicked element, newest first, and Load more adds the next page without repeats.

On the ecommerce sample: Clicking May 2026 shows $88,378 and opens a drawer with the first 25 of its 101 orders, newest first; Load more adds the next 25.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions {
    order_id: orders.id,
    ordered_at: orders.ordered_at,
    customer: customers.name,
    country: customers.country,
    status: orders.status,
  }
  measures { total_revenue: revenue, units: units_sold }
  sorts { ordered_at desc, order_id desc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
    {
      "field": "products.category",
      "operator": "is",
      "values": [
        "Software"
      ]
    },
    {
      "field": "customers.country",
      "operator": "is",
      "values": [
        "Japan"
      ]
    }
  ]
}
```

Saved result:

| order_id | ordered_at | customer | country | status | total_revenue | units |
|---|---|---|---|---|---|---|
| 566 | 2026-09-22 | Customer 72 | Japan | completed | 596.00 | 4 |
| 175 | 2026-09-18 | Customer 136 | Japan | completed | 596.00 | 4 |
| 874 | 2026-09-02 | Customer 136 | Japan | completed | 299.00 | 1 |
| 958 | 2026-08-26 | Customer 62 | Japan | completed | 745.00 | 5 |
| 1305 | 2026-08-24 | Customer 166 | Japan | completed | 897.00 | 3 |
| 307 | 2026-08-22 | Customer 98 | Japan | completed | 745.00 | 5 |
| 816 | 2026-08-16 | Customer 164 | Japan | cancelled | 447.00 | 3 |
| 985 | 2026-08-10 | Customer 164 | Japan | completed | 897.00 | 3 |
| 799 | 2026-08-08 | Customer 182 | Japan | shipped | 1495.00 | 5 |
| 190 | 2026-08-08 | Customer 103 | Japan | shipped | 1196.00 | 4 |
| 1195 | 2026-07-28 | Customer 190 | Japan | shipped | 299.00 | 1 |
| 1284 | 2026-07-09 | Customer 136 | Japan | shipped | 598.00 | 2 |

(28 more rows)

## SDK wiring

```js
const records = app.createQuery('records', {
  dataset: 'ecommerce',
  aql: RECORDS_AQL,
  pageSize: 25,
});
// the clicked month filters the KPIs and the records
app.mapControl(month, kpis, { field: 'orders.ordered_at' });
app.mapControl(month, records, { field: 'orders.ordered_at' });
column.onclick = () => {
  month.setCondition({ operator: 'between',
    values: [monthStart, monthEnd] });
  app.execute();
};
// appends; rejects on failure
loadMore.onclick = () => records.fetchMore();
loadMore.hidden = !records.hasMore;
```

State it touches: Analytical: the clicked month and the page. Runtime: rows loaded so far and `hasMore`.

## Notes

- A records `explore` plus a cross-filter edge. Paging is `pageSize` and `fetchMore()`

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>
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
		<div class="sent" id="sent"></div></div>
```

Script:

```js
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
K.$('#more').onclick = () => { err = ''; records.fetchMore().catch((e) => { err = 'Couldn\'t load more: ' + e.message; draw(); }); };
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
app.execute();
```

## Walkthrough on the gallery card

1. Read the KPIs: **$1,283,053** from **1,500** orders, and revenue by month below
2. Click the **May 2026** column: the KPIs narrow to **$88,378**, and a drawer opens with that month's orders, newest first
3. Click **Load more**: the next 25 of its 101 orders load
4. Click **Close**: the KPIs go back to all months

## Other Drilling patterns

- [Drill down](hierarchy-drill.md): Click a region to see its countries, then customers, then their orders, and climb back with breadcrumbs.
- [Drill path](drill-path.md): Keep a trail of every step down and up, and click any step to go back to it.
- [Break down](adhoc-breakdown.md): Right-click a bar to split it by another field, like order status.
- [Drill-through](drillthrough.md): Click a country to open another app already filtered to that country.
- [Row actions](row-actions.md): Put links on each table row: open the customer in your CRM, email them, or see their orders.
