# Filter group

> Combine conditions with AND and OR, like (Vietnam and Software) or cancelled.

- Pattern id: `compound-filter`
- Category: Filters
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#compound-filter
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader builds two groups: **Vietnam and Software**, or **Status is cancelled**. The table keeps only the rows that match either group.

Why: Readers ask "this, or that" questions all the time. Plain filter bars can only combine conditions with AND.

## What to build

Readers fill groups of conditions; all conditions in a group must hold, any one group can match, and the query rebuilds.

Layout: A small condition builder (two groups joined by OR) above a breakdown table.

Instruction: Let readers combine groups of conditions with AND and OR, and show the combined condition in plain words.

Done when: The condition reads back in plain words, the table keeps only rows that match some group, and emptying a group drops it.

On the ecommerce sample: With Vietnam and Software in Group 1 and Cancelled in Group 2, the title reads (Country is Vietnam and Category is Software) or Status is cancelled.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { country: customers.country, category: products.category, status: orders.status }
  measures { total_revenue: revenue }
  filters { (customers.country == 'Vietnam' and products.category == 'Software') or orders.status == 'cancelled' }
  sorts { total_revenue desc }
}
```

Saved result:

| country | category | status | total_revenue |
|---|---|---|---|
| Vietnam | Software | completed | 37777.00 |
| Australia | Services | cancelled | 31000.00 |
| Singapore | Software | cancelled | 28524.00 |
| Australia | Software | cancelled | 23594.00 |
| Germany | Services | cancelled | 21500.00 |
| Vietnam | Services | cancelled | 18000.00 |
| Singapore | Services | cancelled | 18000.00 |
| United States | Services | cancelled | 17500.00 |
| Vietnam | Software | cancelled | 17321.00 |
| United States | Software | cancelled | 15243.00 |
| Vietnam | Software | shipped | 13136.00 |
| Germany | Software | cancelled | 8953.00 |

(14 more rows)

The query runs as written. A reader-built group, though, can't be sent as SDK input: controls are ANDed, and only selections become OR expressions.

## SDK wiring

```js
// Today: each new set of groups is a new query (AQL is fixed once
// declared)
let n = 0;
// where: built ONLY from picked option values
function applyGroups(where) {
  current?.abort();
  current = app.createQuery('grp' + ++n, {
    dataset: 'ecommerce',
    aql: buildAql(where),
  });
  app.execute();
}
// Proposed: app.createConditionGroup('g', { any: [[countryIs,
// categoryIs], [statusIs]] })
```

## Notes

- The AQL `filters { }` block accepts `and` / `or` and brackets
- `executedAql` shows the exact condition that ran
- Limits: Works with app code: build and validate the expression from picked values only, and declare a new query for each change. A condition-group control is proposed.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="grp" id="g1"><span class="lbl gl">Group 1</span></div>
		<div class="row"><span class="or">OR</span><span class="hint">A row is kept when it matches every pick in either group</span></div>
		<div class="grp" id="g2"><span class="lbl gl">Group 2</span></div>
		<div class="panel"><div class="ph"><b id="words">–</b><span class="status" id="s1"></span></div><div id="table"></div></div>
		<div class="hint">App code: each change declares a new query, its filters built from picked values only</div>
		<div class="sent" id="sent"></div></div>
		<style>.grp { display: flex; gap: 6px; align-items: center; } .grp select { width: 128px; } .gl { width: 48px; } .tw { max-height: 160px; } .or { font-size: 12px; font-weight: 600; color: var(--violet-ink); background: var(--violet-soft); border-radius: 999px; padding: 2px 10px; }</style>
```

Script:

```js
const app = Anfra.createApp({ title: 'Filter group', timezone: 'Etc/UTC' });
const FIELDS = [{ key: 'country', field: 'customers.country', label: 'Country', any: 'Any country' }, { key: 'category', field: 'products.category', label: 'Category', any: 'Any category' }, { key: 'status', field: 'orders.status', label: 'Status', any: 'Any status' }];
const OPTS = {};
const groups = [{ country: 'Vietnam', category: 'Software', status: '' }, { country: '', category: '', status: '' }];
const BASE = ['explore { dimensions { country_name: customers.country, category_name: products.category, status_name: orders.status } measures { total_revenue: revenue }', ' sorts { total_revenue desc } }'];
const cache = new Map();
let n = 0, cur = null, where = '';
const ok = (k, v) => v && OPTS[k] && OPTS[k].includes(v) && !/['\\]/.test(v);
function build () {
	const parts = groups.map((g) => FIELDS.filter((f) => ok(f.key, g[f.key])).map((f) => f.field + " == '" + g[f.key] + "'")).filter((p) => p.length);
	where = parts.map((p) => parts.length > 1 && p.length > 1 ? '(' + p.join(' and ') + ')' : p.join(' and ')).join(' or ');
	const words = groups.map((g) => FIELDS.filter((f) => ok(f.key, g[f.key])).map((f) => f.label + ' is ' + g[f.key])).filter((p) => p.length).map((p) => p.length > 1 ? '(' + p.join(' and ') + ')' : p[0]);
	K.$('#words').textContent = words.length ? words.join(' or ') : 'All rows: pick values to build a condition';
	const aql = BASE[0] + (where ? ' filters { ' + where + ' }' : '') + BASE[1];
	if (!cache.has(aql)) cache.set(aql, app.createQuery('grp' + (++n), { dataset: 'ecommerce', aql }));
	cur = cache.get(aql);
	app.execute();
}
const probes = FIELDS.map((f) => app.createFilter('opt_' + f.key, { dataset: 'ecommerce', field: f.field, label: f.label }));
Promise.all(probes.map((p) => p.loadOptions())).then((lists) => {
	FIELDS.forEach((f, i) => { OPTS[f.key] = lists[i].map(String); });
	groups.forEach((g, gi) => {
		const box = K.$('#g' + (gi + 1));
		FIELDS.forEach((f, fi) => {
			if (fi) { const a = document.createElement('span'); a.className = 'lbl'; a.textContent = 'and'; box.appendChild(a); }
			const s = document.createElement('select'); s.setAttribute('aria-label', 'Group ' + (gi + 1) + ' ' + f.label);
			s.add(new Option(f.any, ''));
			OPTS[f.key].forEach((v) => s.add(new Option(f.key === 'status' ? v[0].toUpperCase() + v.slice(1) : v, v)));
			s.value = g[f.key];
			s.onchange = () => { g[f.key] = s.value; build(); };
			box.appendChild(s);
		});
	});
	build();
});
const cap = (v) => v ? v[0].toUpperCase() + v.slice(1) : v;
app.subscribe(() => {
if (!cur) return;
K.status(cur, K.$('#s1'));
if (cur.result) K.table(K.$('#table'), [{ key: 'country_name', label: 'Country' }, { key: 'category_name', label: 'Category' }, { key: 'status_name', label: 'Status', fmt: cap }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(Number(v)) }], cur.result.rows);
K.sent(K.$('#sent'), app, [cur], () => ['condition (in the AQL, rebuilt by app code) → ' + (where || 'none')]);
});
```

## Walkthrough on the gallery card

1. Read **Group 1**: it already holds **Vietnam** and **Software**
2. Pick **Cancelled** in the **Any status** list of **Group 2**
3. Read the title: (Country is Vietnam and Category is Software) or Status is cancelled
4. Read the table: it keeps only the rows that match either group

## Other Filters patterns

- [Field filter](field-filter.md): Pick values from a list, like Vietnam and Singapore, and every chart shows only those.
- [Widget filter](scope-vs-filter.md): A rule built into one chart, like "completed orders only", that viewers can't remove.
- [Metric filter](aggregate-filter.md): Filter on a total, like customers who spent more than $12k.
- [Range filter](range-filter.md): Drag a slider to keep orders between two values, or above or below one.
- [Text filter](text-search.md): Type part of a name to find matching rows, ignoring upper and lower case.
