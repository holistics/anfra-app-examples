# Dynamic metric

> Switch the chart between revenue, orders and units with one click.

- Pattern id: `metric-switch`
- Category: Tables & calculations (also Controls)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#metric-switch
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader switches **Revenue → Units**. The bars reorder: Hardware leads on units (2,775, excluding cancelled orders), and Services leads on revenue. No query runs.

Why: Switching should feel instant. Fetching all three metrics once makes it renderer-only state.

## What to build

The page loads all the measures at once, so switching which one the chart shows only redraws and reorders the bars.

Layout: Segmented metric control above category bars that reorder.

Instruction: Add a switch for which number the chart shows, so the bars reorder instantly.

Done when: The bars reorder at once for each measure, the axis and labels follow it, and nothing new loads.

On the ecommerce sample: Services leads on Revenue; switching to Units puts Hardware first with 2,775 units with cancelled orders left out, and the count of queries run does not change.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { category: products.category }
  measures { total_revenue: revenue, num_orders: order_count, units: units_sold }
  sorts { total_revenue desc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
    {
      "field": "orders.status",
      "operator": "is_not",
      "values": [
        "cancelled"
      ]
    }
  ]
}
```

Saved result:

| category | total_revenue | num_orders | units |
|---|---|---|---|
| Services | 467000.00 | 284 | 934 |
| Software | 397492.00 | 510 | 1808 |
| Hardware | 162100.74 | 718 | 2775 |
| Parts | 10586.75 | 490 | 1781 |

Orders by category add up to more than 1,500, because an order with two categories counts once in each.

## SDK wiring

```js
// one query returns revenue, orders, units
// no execute()
metricBtns.onclick = (e) => {
  metric = e.target.value;
  draw(byCategory.result, metric);
};
```

State it touches: Renderer-only: which metric is drawn. The analytical state doesn't change.

## Notes

- Return every metric in one `explore`, and switching becomes a redraw

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="lbl">Metric</span><span class="seg" id="metrics"></span><span class="chips"><button type="button" id="nocancel" aria-pressed="true">Leave out cancelled</button></span></div>
		<div class="panel"><div class="ph"><b>By category · <span id="mname">Revenue</span></b><span class="status" id="s1"></span></div><div id="bars"></div>
		<div class="hint" id="runs"></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
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
app.execute();
```

## Walkthrough on the gallery card

1. Read the bars on **Revenue**: Services leads
2. Click **Units**: the bars reorder and Hardware leads with 2,775 units, with **Leave out cancelled** on
3. Read the hint: the count of queries run does not change, because switching the metric only redraws

## Other Tables & calculations patterns

- [Dynamic dimension](dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Sort](sort.md): Click a column header to sort the table by that column.
- [Top N & Others](top-n.md): Show the top 3 countries and group the rest into "Others".
- [Pivot table](pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Subtotals & grand totals](totals.md): Add a total for each category and one for everything.
- [Percent of total](percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Running total & moving calculation](cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](ranking.md): Number each customer by revenue, overall and within their country.
