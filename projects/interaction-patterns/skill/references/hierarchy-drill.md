# Drill down

> Click a region to see its countries, then customers, then their orders, and climb back with breadcrumbs.

- Pattern id: `hierarchy-drill`
- Category: Drilling (also Selections)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#hierarchy-drill
- Full Data App: https://demo.anfra.ai/apps/patterns/drill-down
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader clicks **APAC**, then **Australia**, then **Customer 184**, and lands on that customer's 13 orders. The breadcrumb reads "All regions › APAC › Australia › Customer 184"; clicking a crumb climbs back. The KPIs and trend on the right follow the path.

Why: A drill path answers "why is this number big?" one step at a time.

## What to build

Clicking a value opens the next level down filtered to it, and the breadcrumb records each step so far.

Layout: Bars at each level with a breadcrumb trail.

Instruction: Let the reader drill down level by level by clicking, with a breadcrumb to climb back up.

Done when: Each level's values add up to the one clicked, and clicking a crumb returns to that level with its filters.

On the ecommerce sample: Clicking APAC, Australia, then Customer 184 lists that customer's 13 orders, the breadcrumb reads All regions › APAC › Australia › Customer 184, and APAC climbs back.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { key: markets.name }
  measures { total_revenue: revenue, order_n: order_count, buyers: count_distinct(orders, orders.customer_id) }
  sorts { total_revenue desc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
    {
      "field": "markets.region",
      "operator": "is",
      "values": [
        "APAC"
      ]
    }
  ]
}
```

Saved result:

| key | total_revenue | order_n | buyers |
|---|---|---|---|
| Australia | 313397.48 | 347 | 43 |
| Singapore | 255030.20 | 317 | 41 |
| Vietnam | 185254.77 | 202 | 28 |
| Japan | 118326.31 | 146 | 22 |

The recording is the real Data App `apps/patterns/drill-down.html`, running on the ecommerce sample. Each level is its own query, and the path is one filter per level: `markets.region`, `markets.name`, `customers.id`. The input above is the path after clicking APAC.

## SDK wiring

```js
const levels = [
  // a filter control per level
  { q: byCategory, f: category },
  { q: byProduct, f: product },
  { q: orders, f: null },
];
// level i+1 is mapped to the filters of levels 0..i
chart.on('click', (p) => {
  const lvl = levels[depth];
  lvl.f.setCondition({
    operator: 'is',
    values: [lvl.q.result.rows[p.dataIndex][lvl.key]],
  });
  depth++;
  app.execute();
  renderLevel(depth);
});
crumb.onclick = (i) => {
  for (const l of levels.slice(i)) l.f?.reset();
  depth = i;
  app.execute();
};
```

State it touches: Drill context: the path [category, product] stored as filter conditions, plus the current depth (renderer).

## Notes

- The path is just filters, so it shows in `executedAql` and can be bookmarked like any other filter
- Limits: Works with app code. A proposed `createDrillPath([...fields])` would hold the path and depth as one control.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>
	.crumbs { display: flex; gap: 2px; align-items: center; flex-wrap: wrap; font-size: 12px; }
	.crumbs button { height: 24px; padding: 0 8px; font-size: 12px; border-radius: 6px; }
	.crumbs .sep { color: var(--muted); }
	.crumbs .here { font-weight: 600; padding: 0 6px; }
	.lv { max-height: 200px; overflow: auto; }
	.kp { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
	.kp > div { font-size: 12px; line-height: 16px; color: var(--muted); }
	#mini .colz { height: 96px; }
	</style>
	<div class="app">
		<div class="crumbs" id="crumbs"></div>
		<div class="cols" style="grid-template-columns: 1.25fr 1fr">
			<div class="panel"><div class="ph"><b id="title">Regions</b><span class="status" id="s1"></span></div><div class="lv"><div id="level"></div></div><div class="hint" id="lh"></div></div>
			<div class="panel"><div class="ph"><b>The path so far</b><span class="status" id="s2"></span></div>
				<div class="kp"><div>Revenue<div class="kpi" id="k1">–</div></div><div>Orders<div class="kpi" id="k2">–</div></div></div>
				<div class="lbl">Monthly revenue</div><div id="mini"></div></div>
		</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Drill down', timezone: 'Etc/UTC' });
const DS = 'ecommerce', M = 'measures { total_revenue: revenue, order_n: order_count }';
const byRegion = app.createQuery('byRegion', { dataset: DS, aql: 'explore { dimensions { key: markets.region } ' + M + ' sorts { total_revenue desc } }' });
const byCountry = app.createQuery('byCountry', { dataset: DS, aql: 'explore { dimensions { key: markets.name } ' + M + ' sorts { total_revenue desc } }' });
const byCustomer = app.createQuery('byCustomer', { dataset: DS, aql: 'explore { dimensions { key: customers.name, cid: customers.id } ' + M + ' sorts { total_revenue desc } }' });
const orders = app.createQuery('orders', { dataset: DS, pageSize: 25, aql: 'explore { dimensions { order_id: orders.id, ordered_on: orders.ordered_at, order_status: orders.status } measures { total_revenue: revenue } sorts { ordered_on desc, order_id desc } }' });
const scope = app.createQuery('scope', { dataset: DS, aql: 'explore { ' + M + ' }' });
const scopeTrend = app.createQuery('scopeTrend', { dataset: DS, aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }' });
const L = [
	{ q: byRegion, f: app.createFilter('region', { dataset: DS, field: 'markets.region', label: 'Region' }), field: 'markets.region', name: 'Regions', val: (r) => r.key },
	{ q: byCountry, f: app.createFilter('country', { dataset: DS, field: 'markets.name', label: 'Country' }), field: 'markets.name', name: 'Countries', val: (r) => r.key },
	{ q: byCustomer, f: app.createFilter('customer', { dataset: DS, field: 'customers.id', label: 'Customer' }), field: 'customers.id', name: 'Customers', val: (r) => String(r.cid) },
	{ q: orders, f: null, name: 'Orders' },
];
// level i is filtered by every level above it; the KPIs and trend follow the whole path
L.forEach((lvl, i) => L.slice(0, i).forEach((up) => app.mapControl(up.f, lvl.q, { field: up.field })));
for (const q of [scope, scopeTrend]) for (const up of L.slice(0, 3)) app.mapControl(up.f, q, { field: up.field });
const path = []; // labels picked so far
let depth = 0;
function down (r) { const lvl = L[depth]; lvl.f.setCondition({ operator: 'is', values: [lvl.val(r)] }); path.push(r.key); depth++; app.execute(); }
function climb (i) { for (const l of L.slice(i, 3)) l.f.reset(); path.length = i; depth = i; app.execute(); }
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const dd = (v) => new Date(String(v).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace('Sept', 'Sep');
app.subscribe(() => {
const lvl = L[depth];
K.status(lvl.q, K.$('#s1')); K.status(scope, K.$('#s2'));
const cr = K.$('#crumbs'); cr.innerHTML = '';
['All regions'].concat(path).forEach((t, i) => {
	if (i) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '›'; cr.appendChild(s); }
	if (i === path.length) { const s = document.createElement('span'); s.className = 'here'; s.textContent = t; cr.appendChild(s); }
	else { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => climb(i); cr.appendChild(b); }
});
K.$('#title').textContent = lvl.name + (path.length ? (depth === 3 ? ' of ' : ' in ') + path[path.length - 1] : '');
if (lvl.q.result) {
	if (depth < 3) { K.bars(K.$('#level'), lvl.q.result.rows, { label: (r) => r.key, value: (r) => r.total_revenue, pick: (r) => down(r) }); K.$('#lh').textContent = 'Click a bar to drill in'; }
	else {
		K.table(K.$('#level'), [{ key: 'order_id', label: 'Order', fmt: (v) => '#' + v }, { key: 'ordered_on', label: 'Date', fmt: (v) => dd(v) }, { key: 'order_status', label: 'Status' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(v) }], lvl.q.result.rows);
		K.$('#lh').textContent = 'Click a crumb above to climb back';
	}
}
if (scope.result) { const s = scope.result.rows[0] || {}; K.$('#k1').textContent = K.compact.format(Number(s.total_revenue || 0)); K.$('#k2').textContent = K.int.format(Number(s.order_n || 0)); }
if (scopeTrend.result) K.columns(K.$('#mini'), scopeTrend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
K.sent(K.$('#sent'), app, [lvl.q, scope], () => ['depth: ' + depth + ' of 3 (renderer state; the path is the filter conditions)']);
});
app.execute();
```

## Walkthrough on the gallery card

1. Click **APAC** in **Regions**
2. Click **Australia** in **Countries in APAC**
3. Click **Customer 184**: the table lists that customer's 13 orders
4. Read the breadcrumb, **All regions › APAC › Australia › Customer 184**, and the KPIs and trend on the right, which follow the path
5. Click **APAC** in the breadcrumb to climb back

## Other Drilling patterns

- [Drill path](drill-path.md): Keep a trail of every step down and up, and click any step to go back to it.
- [Break down](adhoc-breakdown.md): Right-click a bar to split it by another field, like order status.
- [View underlying data](underlying-records.md): Click a column on a chart to see the individual orders behind it.
- [Drill-through](drillthrough.md): Click a country to open another app already filtered to that country.
- [Row actions](row-actions.md): Put links on each table row: open the customer in your CRM, email them, or see their orders.
