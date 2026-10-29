# Writing a live mini Data App for a gallery card

The gallery page (`site/interaction-gallery.html`, built from `gallery/`) shows 54 interaction-pattern cards. Clicking a card opens a popup. Cards that have a **live app** show "Try it live": a real anfra Data App, mounted by the page with the SDK's `mountDataApp` in a sandboxed frame. Its queries run on the real `ecommerce` dataset through the page's `/api`. The point is that a reader can **play with the pattern and understand what it does**, and see what the SDK sent to anfra.

Three finished examples (read them first; copy their structure):
`live-apps/field-filter.js`, `live-apps/single-select.js`, `live-apps/date-drill.js`.

## What you write

One file per card: `gallery/live-apps/<card id>.js`, containing exactly:

```js
LIVE['<card id>'] = {
	h: 420,            // frame height in px; keep it 360–480
	html: `<div class="app"> … <div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: '…', timezone: 'Etc/UTC' });
…
app.subscribe(() => { … K.sent(K.$('#sent'), app, [queries…]); });
app.execute();`,
};
```

- `html` is the frame's body. `js` runs inside the frame with `Anfra` (the SDK) and `K` (the kit) in scope.
- **`js` is a template literal in the page source.** Never use backticks or `${` inside `js` (they would run at page level and break). Build strings with `+` and single quotes. Same for `html` (no `${`).
- Do NOT edit any other file (`live.js`, `engine.js`, `design.css`, `demos.js`, `build.mjs`, `gallery.src.html`, other agents' app files). If the kit lacks something, write a small local helper inside your own `js`. Mention kit wishes in your report.
- No external scripts or CDNs (no ECharts). Draw with the kit or plain HTML/SVG.

## Kit (`K`, defined in `live.js` → `kit()`)

- Formatters: `K.money` (USD, 0 dp), `K.compact` (USD compact, 3 sig.), `K.int`; `K.esc(s)`; `K.$(selector)`.
- `K.bars(el, rows, { label, value, fmt?, on?(row), pick?(row, event) })`: horizontal bars; `pick` makes them clickable buttons; with `on`, unpicked bars fade.
- `K.columns(el, rows, { label, value, fmt?, ghost?(row), pick?(row) })`: vertical columns for time series; `ghost` draws an unfiltered value behind in grey; `pick` makes columns clickable; hover shows a tip.
- `K.table(el, cols, rows, { on?, pick? })`: `cols = [{ key, label, fmt?(value, row), num? }]`, scrolls after 240px.
- `K.status(query, el)`: "Running…", "N rows", or the error.
- `K.sent(el, app, queries, extra?)`: the "What the SDK sent to anfra" panel. For each query it lists the applied control conditions and the cross-filter selection, plus a "Show the AQL anfra ran" toggle. `extra()` may return extra lines (strings) for state the panel can't see, such as a sort, a time zone, a parameter or a page number. **Every app must have this panel**, listing the queries the interaction changes.
- CSS classes: `.app` (padded grid), `.row` (flex row), `.cols` (two columns; override `style="grid-template-columns: …"`), `.panel` + `.ph` (panel + header: `<b>` title left, `.status` right), `.lbl`, `.hint` (12px muted), `.kpi` (20px number), `.seg` (button group; use `aria-pressed="true"` for the on state), `.chips` (pill buttons), `.legend`, `.sent`. Inputs: `select`, `button`, `input[type=text|search|number|date|range]` are styled.
- Design: light, white panels, ink text, one violet accent (`var(--violet)`, `--violet-ink`, `--violet-soft`, `--violet-faint`), muted grey `--muted`, rules `--rule`. Only 12, 14 and 20px type. One-sentence UI text has no final period.

## SDK essentials (anfra 0.8.0, `@holistics/anfra-sdk`)

- `app.createQuery(name, { dataset: 'ecommerce', aql, pageSize? })`; `q.state`, `q.result.rows` (objects keyed by alias), `q.result.debug.executedAql`, `q.setSort([{ field: '<alias>', direction: 'asc'|'desc' }])` (check `app.d.ts` for exact shape), `q.fetchMore()`, `q.hasMore`, `q.export()`, `q.select(rows)`.
- `app.createFilter(name, { dataset, field: 'model.field', label })` → `f.setCondition({ operator, values, modifier? })`, `f.reset()`, `f.loadOptions()`. Operators: is, is_not, is_null, not_null, greater_than, less_than, between, contains, does_not_contain, starts_with, ends_with, matches, last, next, before, after, transform_pop_relative, transform_pop_absolute, transform_date_drill …
- `app.createDateDrill(name, { default: 'month' })` → `setGrain(g)`.
- `app.mapControl(control, query, { field, aggregation? })`, `app.mapCrossFilter(from, to)`, `app.clearSelection()`, `app.selection`, `app.setTimezone(tz)`, `app.execute()`, `app.refresh()`, `app.subscribe(fn)`, `app.toJSON()`.
- Typings: `node_modules/@holistics/anfra-sdk/dist/app.d.ts` and `types-*.d.ts` (`@holistics/anfra-sdk` 0.8.0).
- Existing full Data Apps for reference: `apps/` in [anfra-demo-data](https://github.com/holistics/anfra-demo-data), outside this repo.

## Rules learned the hard way (verified on 0.8.0)

- **Alias naming:** never name an AQL alias after a model, dimension or metric. Write `total_revenue: revenue`, `num_orders: order_count`, `avg_order_value: aov`, `country_name: customers.country`, `category_name: products.category`.
- Controls and selections can only target **model fields or dataset metrics**, not ad hoc (query-declared) dimensions or metrics ("unknown field"). Author-written `filters`/`having` in the AQL work.
- **Selecting rows whose date comes from `| month()` in the AQL breaks** the target (SDK sends exact-day conditions). For date selections, use a raw date field + `createDateDrill`, or turn the click into a `between` filter yourself (as `date-drill.js` does).
- `percent_of_total` returns a fraction (0.24): format as a percent.
- `case(when: x in top_n …)` crashes the compiler; Top N + Other needs an `exclude_grains` total.
- One live selection per app; a second chart's selection replaces the first. Multi-row and tuple selections work (OR-of-ANDs).
- Dataset: orders 2025-06-01 … 2026-09-23; 200 customers in 6 countries (Australia, Germany, Japan, Singapore, United States, Vietnam); 8 products in 4 categories (Services, Software, Hardware, Parts); also `markets` (region, monthly_target), `sessions` (funnel, reached_step 1–5, channel), `orders.ordered_ts` (UTC timestamp), `orders.discount_pct`, `products.subcategory`/`brand`, `orders.fiscal_year`/`fiscal_quarter`, metrics `revenue`, `order_count`, `aov`, `net_revenue`, `monthly_target`, `session_count`, `units_sold`. Model files: `/home/user/workspace/repo/models/ecommerce/`, `/home/user/workspace/repo/datasets/ecommerce.dataset.aml`.

## Each card's story

Read the card's entry in `gallery/demos.js` (`id: '<card id>'`): `one`, `does` (the story to reproduce, with numbers), `viz`, `aqlRef`, `sdk`, `state`, `limits`. The verified AQL is `.amp/in/aql/<aqlRef>.aql` (+ `.input.json`, `.tz`), and its saved results are in `.amp/in/gallery/aql-results.json`. The live app should let the reader **do the story themselves** and land on the card's numbers. Where the story needs something anfra can't do natively (status `app` cards, or limits noted on the card), build the closest working version and say what is app code in one `.hint` line. Keep each app focused: one idea, 1–3 panels.

Test AQL quickly:

```sh
curl -s -X POST http://127.0.0.1:8080/api/core.query -H 'content-type: application/json' \
  -d '{"dataset":"ecommerce","query":"explore { measures { total_revenue: revenue } }","input":{"filters":[]}}' | jq '.rows // .'
```

## Verify every app in the browser (required)

```sh
node gallery/build.mjs        # safe to run while others build
export AGENT_BROWSER_SESSION=live-<your batch letter>
agent-browser open "http://127.0.0.1:8080/interaction-gallery.html#<card id>"
agent-browser set viewport 1244 779 2
agent-browser eval "location.hash='<card id>'; location.reload(); 'ok'"   # after every rebuild or card change
sleep 5
agent-browser snapshot -i          # controls inside the frame appear with refs; click them with: agent-browser click @eNN
agent-browser screenshot /tmp/live-<card id>.png   # then Read the PNG and look at it
agent-browser errors
```

- Do the card's story through real clicks (`click @ref`, `select @ref <value>`, `fill @ref <text>`), then read the screenshot. Check: the numbers match the card or `aql-results.json` (or explain the difference), the "What the SDK sent" panel shows the new condition, nothing overflows the frame (the popup's left column is about 560px wide), no error text in a `.status`.
- Use only your own `AGENT_BROWSER_SESSION`. Do not restart services, touch git, or clear anfra caches. Do not edit files outside your `live-apps/<id>.js` files.
