# Reference line

> Draw a target line and show how far each month is above or below it.

- Pattern id: `targets`
- Category: Scenarios & analyses (also Dates & time)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#targets
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Each month's revenue sits against the **monthly target** of the markets in view: $84k for all six countries. Filtering to **Japan** moves the line to Japan's $8k, where only August beat it (160%).

Why: Most performance pages need a plan to compare against, and the plan has to follow the filters.

## What to build

The target is drawn as a line that uses the same filters as the actuals, so changing a filter moves both together.

Layout: Columns with a dashed target line and attainment labels.

Instruction: Draw the target as a line that follows the same filters as the actuals, with attainment for each period.

Done when: Changing a filter moves the target line along with the bars, and periods above the line show attainment over 100%.

On the ecommerce sample: With all countries the dashed target is $84k. Picking Japan moves it to $8k, and only August beats it, at 160%.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { period: orders.ordered_at | month() }
  measures {
    total_revenue: revenue,
    target: monthly_target,
    attainment: revenue * 1.0 / monthly_target,
  }
  filters { orders.ordered_at matches @(2026) }
  sorts { period asc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
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

| period | total_revenue | target | attainment |
|---|---|---|---|
| 2026-01-01 | 6967.41 | 8000.00 | 0.87092625 |
| 2026-02-01 | 7590.35 | 8000.00 | 0.94879375 |
| 2026-03-01 | 5856.24 | 8000.00 | 0.73203 |
| 2026-04-01 | 5443.75 | 8000.00 | 0.68046875 |
| 2026-05-01 | 7528.85 | 8000.00 | 0.94110625 |
| 2026-06-01 | 7261.95 | 8000.00 | 0.90774375 |
| 2026-07-01 | 7852.40 | 8000.00 | 0.9815499999999999 |
| 2026-08-01 | 12777.85 | 8000.00 | 1.59723125 |
| 2026-09-01 | 5708.14 | 8000.00 | 0.7135175 |

`monthly_target` is a Dataset metric over a new `markets` model (one row per country, with its monthly target), added to the ecommerce sample for this card. Because it sums the markets in scope, it follows any country filter.

## SDK wiring

```js
// the target is data, so it obeys the same mappings as revenue
app.mapControl(country, trend, { field: 'customers.country' });
// draw target as a dashed line; colour bars where revenue / target
// >= 1
```

State it touches: Analytical: the target comes from the data and follows filters. A renderer-only constant would not.

## Notes

- `monthly_target` is a metric like revenue: the same filters reach both

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><label class="lbl" for="country">Country</label><select id="country"><option value="">All countries</option></select><span class="hint">The target is a metric, so the filter reaches it too</span></div>
		<div class="panel"><div class="ph"><b>Revenue 2026 vs target<span id="for"></span></b><span class="status" id="s1"></span></div>
		<div id="chart"></div>
		<div class="legend"><span><i style="background:var(--violet)"></i>Beat the target</span><span><i style="background:var(--violet-faint)"></i>Below it</span><span><i style="background:none;border-top:2px dashed var(--ink);height:0;border-radius:0"></i><span id="tl">Monthly target</span></span></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Reference line', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, target: monthly_target, attainment: revenue * 1.0 / monthly_target } filters { orders.ordered_at matches @(2026) } sorts { period asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
app.mapControl(country, trend, { field: 'customers.country' });
const sel = K.$('#country');
country.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) country.setCondition({ operator: 'is', values: [sel.value] }); else country.reset(); app.execute(); };
const pct = (v) => Math.round(v * 100) + '%';
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
function chart (el, rows) {
	const tgt = Math.max(...rows.map((r) => Number(r.target)), 0);
	const max = Math.max(tgt, ...rows.map((r) => Number(r.total_revenue))) * 1.15 || 1;
	const cols = rows.map((r) => { const v = Number(r.total_revenue), a = Number(r.attainment), hit = a >= 1;
		return '<div style="flex:1;position:relative;height:100%" title="' + mon(r.period) + ': ' + K.money.format(v) + ' of ' + K.money.format(Number(r.target)) + ' (' + pct(a) + ')">'
			+ '<span style="position:absolute;left:12%;right:12%;bottom:0;height:' + (v / max * 100) + '%;background:' + (hit ? 'var(--violet)' : 'var(--violet-faint)') + ';border-radius:3px 3px 0 0;transition:height 320ms"></span>'
			+ '</div>'; }).join('');
	el.innerHTML = '<div style="position:relative;height:150px;display:flex;gap:4px;align-items:flex-end">' + cols
		+ '<div style="position:absolute;left:0;right:0;bottom:' + (tgt / max * 100) + '%;border-top:2px dashed var(--ink);pointer-events:none"></div></div>'
		+ '<div style="display:flex;gap:4px;font-size:12px;line-height:16px;color:var(--muted);margin-top:4px">' + rows.map((r) => { const a = Number(r.attainment); return '<span style="flex:1;text-align:center">' + mon(r.period) + '<br><b style="font-weight:' + (a >= 1 ? '600;color:var(--violet-ink)' : '400') + '">' + pct(a) + '</b></span>'; }).join('') + '</div>';
}
app.subscribe(() => {
	K.status(trend, K.$('#s1'));
	const c = country.appliedCondition && country.appliedCondition.values && country.appliedCondition.values[0];
	K.$('#for').textContent = c ? ' · ' + c : ' · all countries';
	if (trend.result) {
		const rows = trend.result.rows;
		chart(K.$('#chart'), rows);
		const hits = rows.filter((r) => Number(r.attainment) >= 1).length;
		K.$('#tl').textContent = 'Monthly target ' + K.compact.format(Number(rows[0] ? rows[0].target : 0)) + ' · ' + hits + ' of ' + rows.length + ' months beat it';
	}
	K.sent(K.$('#sent'), app, [trend]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Read the chart with **All countries**: the dashed line is the $84k monthly target of all six countries
2. Pick **Japan** in **Country**
3. Read the chart: the line moves to Japan's $8k, and only August beats it (160%)

## Other Scenarios & analyses patterns

- [Binning](bins.md): Group orders into size bands, like under $100 or over $1,000.
- [Trend line](trend-line.md): Draw the line of best fit through a chart, to show which way it is heading.
- [What-if parameter](what-if.md): Try a price change, like +10% on Software, and watch revenue change.
- [Rule-based cohort](cohort-from-rank.md): Define a group by a rule, like the top 10% of customers by revenue.
