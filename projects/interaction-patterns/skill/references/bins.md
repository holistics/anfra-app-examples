# Binning

> Group orders into size bands, like under $100 or over $1,000.

- Pattern id: `bins`
- Category: Scenarios & analyses (also Tables & calculations)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#bins
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Orders fall into four value bands. A width slider rebuilds the histogram at $250 or $500 per bin.

Why: Bands turn a long list of order values into a story about order size.

## What to build

Each value falls into a band or bin, and picking a bin width regroups the values and redraws the histogram.

Layout: Band bars with orders and revenue.

Instruction: Group a number into bands or a histogram, and let the reader pick the bin width.

Done when: The band counts add up to the total, and a wider bin width shows fewer, taller bars.

On the ecommerce sample: The bands show 295 orders under $100, 421 at $100-499, 294 at $500-999 and 490 at $1,000+, and $500 bins redraw the histogram.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
dimension orders.value_band = case(
  when: orders.order_value < 100, then: '1. under $100',
  when: orders.order_value < 500, then: '2. $100-499',
  when: orders.order_value < 1000, then: '3. $500-999',
  else: '4. $1,000+'
);
explore {
  dimensions { band: orders.value_band }
  measures { num_orders: order_count, total_revenue: revenue }
  sorts { band asc }
}
```

Saved result:

| band | num_orders | total_revenue |
|---|---|---|
| 1. under $100 | 295 | 12566.89 |
| 2. $100-499 | 421 | 122893.17 |
| 3. $500-999 | 294 | 201976.78 |
| 4. $1,000+ | 490 | 945616.11 |

`orders.order_value` is a Dataset dimension (each order's revenue), and `case()` labels the band. The bin width lives in the AQL text, so each width is a new query built from a fixed list.

## SDK wiring

```js
// a fixed list: never free text
const WIDTHS = [100, 250, 500];
widthMenu.onchange = () =>
  showQuery(binsQuery(WIDTHS[widthMenu.selectedIndex]));
```

## Notes

- Declare `orders.order_value` and the band once. The joins and the two levels of grouping are handled for you

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="lbl">Bin width</span><span class="seg" id="widths"></span><span class="hint">Each width is a new query built from a fixed list</span></div>
		<div class="cols" style="grid-template-columns: 1fr 1.1fr">
			<div class="panel"><div class="ph"><b><span id="bt">Orders</span> by value band</b><span class="status" id="s1"></span></div><div id="bands"></div>
			<div class="row" style="margin-top:8px"><span class="lbl">Bars show</span><span class="seg" id="measure"><button type="button" data-m="num_orders" aria-pressed="true">Orders</button><button type="button" data-m="total_revenue" aria-pressed="false">Revenue</button></span></div></div>
			<div class="panel"><div class="ph"><b>Histogram · <span id="wl">$250</span> bins</b><span class="status" id="s2"></span></div><div id="hist"></div></div>
		</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Binning', timezone: 'Etc/UTC' });
const BANDS = 'dimension orders.value_band = case(when: orders.order_value < 100, then: \'1. under $100\', when: orders.order_value < 500, then: \'2. $100-499\', when: orders.order_value < 1000, then: \'3. $500-999\', else: \'4. $1,000+\'); explore { dimensions { band: orders.value_band } measures { num_orders: order_count, total_revenue: revenue } sorts { band asc } }';
const bands = app.createQuery('bands', { dataset: 'ecommerce', aql: BANDS });
const WIDTHS = [100, 250, 500];
const hist = {};
const histQuery = (w) => hist[w] || (hist[w] = app.createQuery('histogram' + w, { dataset: 'ecommerce', aql: 'dimension orders.value_bin = floor(orders.order_value / ' + Number(w) + ') * ' + Number(w) + '; explore { dimensions { bin_start: orders.value_bin } measures { num_orders: order_count } sorts { bin_start asc } }' }));
let w = 250, m = 'num_orders';
histQuery(w);
const seg = K.$('#widths');
for (const x of WIDTHS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = '$' + x; b.dataset.w = x; b.onclick = () => { w = x; histQuery(w); app.execute(); draw(); }; seg.appendChild(b); }
K.$('#measure').querySelectorAll('button').forEach((b) => { b.onclick = () => { m = b.dataset.m; K.$('#measure').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }; });
const usd = (v) => '$' + K.int.format(v);
function draw () {
	const h = hist[w];
	if (!h) return; // createQuery notifies subscribers before it returns
	seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.w) === w)));
	K.$('#wl').textContent = usd(w);
	K.status(bands, K.$('#s1')); K.status(h, K.$('#s2'));
	if (bands.result) K.bars(K.$('#bands'), bands.result.rows, { label: (r) => r.band.slice(3), value: (r) => r[m], fmt: m === 'num_orders' ? (v) => K.int.format(v) : (v) => K.compact.format(v) });
	K.$('#bt').textContent = m === 'num_orders' ? 'Orders' : 'Revenue';
	if (h.result) {
		const got = new Map(h.result.rows.map((r) => [Number(r.bin_start), Number(r.num_orders)]));
		const top = Math.max(...got.keys()), rows = [];
		for (let s = 0; s <= top; s += w) rows.push({ s, n: got.get(s) || 0 });
		K.columns(K.$('#hist'), rows, { label: (r) => usd(r.s) + '–' + usd(r.s + w - 1), value: (r) => r.n, fmt: (v) => K.int.format(v) + ' orders' });
	}
	K.sent(K.$('#sent'), app, [bands, h], () => ['bin width → ' + usd(w) + ', written into the AQL text of histogram' + w + ' (no query parameters in anfra 0.8.0)']);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Read **Orders by value band**: 295 orders under $100, 421 at $100-499, 294 at $500-999 and 490 at $1,000+
2. Click **Revenue** next to **Bars show**: the $1,000+ band brings in most of the money
3. Click **$500** in **Bin width**: the histogram rebuilds with $500 bins
4. Click **$250** to go back to $250 bins

## Other Scenarios & analyses patterns

- [Reference line](targets.md): Draw a target line and show how far each month is above or below it.
- [Trend line](trend-line.md): Draw the line of best fit through a chart, to show which way it is heading.
- [What-if parameter](what-if.md): Try a price change, like +10% on Software, and watch revenue change.
- [Rule-based cohort](cohort-from-rank.md): Define a group by a rule, like the top 10% of customers by revenue.
