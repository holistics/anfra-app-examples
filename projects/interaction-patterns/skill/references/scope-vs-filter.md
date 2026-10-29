# Widget filter

> A rule built into one chart, like "completed orders only", that viewers can't remove.

- Pattern id: `scope-vs-filter`
- Category: Filters
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#scope-vs-filter
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

A "Completed orders only" badge is part of the query and can't be removed. The reader still picks **Germany**, and the chart shows Germany's completed revenue.

Why: Readers need to know which rules are fixed, such as "we never count cancelled orders", and which ones they control.

## What to build

A fixed rule is built into the chart's query and shown as a locked badge; the reader's filters apply on top.

Layout: A locked scope badge next to normal filter chips, above a monthly trend.

Instruction: Keep a fixed rule on a chart, shown as a locked badge, separate from the reader's filters so Reset never removes it.

Done when: The locked badge has no control, filters narrow the chart within its rule, and Reset clears the filters but keeps the badge.

On the ecommerce sample: Pick Germany: the chart reads Completed revenue · Germany at $127k. Reset filters clears Germany, and the Completed orders only lock stays.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { period: orders.ordered_at | month() }
  measures { total_revenue: revenue }
  filters { orders.status == 'completed' }
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
        "Germany"
      ]
    }
  ]
}
```

Saved result:

| period | total_revenue |
|---|---|
| 2025-06-01 | 9940.44 |
| 2025-07-01 | 8072.26 |
| 2025-08-01 | 3829.95 |
| 2025-09-01 | 13544.18 |
| 2025-10-01 | 8709.35 |
| 2025-11-01 | 5313.83 |
| 2025-12-01 | 9769.84 |
| 2026-01-01 | 9811.05 |
| 2026-02-01 | 8871.96 |
| 2026-03-01 | 11064.88 |
| 2026-04-01 | 8042.44 |
| 2026-05-01 | 3452.73 |

(4 more rows)

Trailer frames 1 and 3 approximate the completed-only total at 70% of all revenue. Frame 2 is the real run result.

## SDK wiring

```js
// scope: in the AQL, so no reader can remove it
const trend = app.createQuery('trend', {
  dataset: 'ecommerce',
  aql: `
    explore {
      … filters { orders.status == 'completed' }
    }
  `,
});

// reader filter: a control on top of the scope
app.mapControl(country, trend, { field: 'customers.country' });
resetBtn.onclick = () => {
  country.reset();
  app.execute();
};
```

State it touches: Analytical: the fixed scope lives in the declaration, and the reader filter is a control condition.

## Notes

- The fixed scope sits in `filters { }` and the reader filter goes through `mapControl`. `executedAql` shows both
- `reset()` can never remove the scope

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="lock" title="Part of the query: no reader control can remove it">🔒 Completed orders only</span><label class="lbl" for="country">Country</label><select id="country"><option value="">All countries</option></select><button type="button" id="reset">Reset filters</button></div>
		<div class="panel"><div class="ph"><b>Completed revenue<span id="for"></span>: <span id="kpi">–</span></b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="hint">Reset clears the country. The lock is in the AQL filters block, so it stays</div></div>
		<div class="sent" id="sent"></div></div>
		<style>.lock { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12px; background: var(--sunken); border: 1px dashed var(--rule-strong); color: var(--weak); cursor: not-allowed; }</style>
```

Script:

```js
const app = Anfra.createApp({ title: 'Widget filter', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } filters { orders.status == \'completed\' } sorts { period asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
app.mapControl(country, trend, { field: 'customers.country' });
const sel = K.$('#country');
country.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) country.setCondition({ operator: 'is', values: [sel.value] }); else country.reset(); app.execute(); };
K.$('#reset').onclick = () => { country.reset(); sel.value = ''; app.execute(); };
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
K.status(trend, K.$('#s1'));
const c = country.appliedCondition;
K.$('#for').textContent = c && c.values && c.values.length ? ' · ' + c.values.join(', ') : ' · all countries';
if (trend.result) {
	K.$('#kpi').textContent = K.compact.format(trend.result.rows.reduce((t, r) => t + Number(r.total_revenue), 0));
	K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
}
K.sent(K.$('#sent'), app, [trend], () => ['scope (in the AQL, not reader input) → orders.status == \'completed\'']);
});
app.execute();
```

## Walkthrough on the gallery card

1. Read the badge: **🔒 Completed orders only** is part of the query and has no control
2. Pick **Germany** in the **Country** list
3. Read the chart: **Completed revenue · Germany** shows $127k
4. Click **Reset filters**: Germany clears, and the lock stays

## Other Filters patterns

- [Field filter](field-filter.md): Pick values from a list, like Vietnam and Singapore, and every chart shows only those.
- [Filter group](compound-filter.md): Combine conditions with AND and OR, like (Vietnam and Software) or cancelled.
- [Metric filter](aggregate-filter.md): Filter on a total, like customers who spent more than $12k.
- [Range filter](range-filter.md): Drag a slider to keep orders between two values, or above or below one.
- [Text filter](text-search.md): Type part of a name to find matching rows, ignoring upper and lower case.
