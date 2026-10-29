# Apply button

> Change several filters, then press Apply to update every chart at once.

- Pattern id: `apply-button`
- Category: Controls (also Save & share)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#apply-button
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader changes country, status and date. Nothing runs until they press **Apply (3)**, and then every query runs once.

Why: On a slow warehouse, every click shouldn't start a query.

## What to build

Filter changes wait as drafts with a pending count; pressing Apply sends them all together, so every chart updates once.

Layout: Filter chips turn dotted while unapplied; an Apply button counts changes.

Instruction: Let readers change several filters, see how many changes are pending, and update every chart at once when they press Apply.

Done when: Charts stay put while you edit, the button counts pending changes, and one press updates every chart and clears the count.

On the ecommerce sample: Pick Japan, Completed and Jul–Sep 2026: the chart doesn't change. Press Apply (3): every query runs once and the button turns to Applied ✓.

## AQL

Not run as written: any query works; this card is about when queries run.

```aql
// unchanged: the trend query from "Field filter"
explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }
```

Trailer frame 2 approximates Japan's completed revenue at 62% of all of Japan's revenue.

## SDK wiring

```js
app.subscribe(() => {
  const n = Object.values(app.controls).filter(
    (c) => c.isDirty,
  ).length;
  applyBtn.disabled = !app.hasChanges;
  applyBtn.textContent = n ? `Apply (${n})` : 'Applied';
});
// commits pending → applied
applyBtn.onclick = () => app.execute();
```

State it touches: Analytical: pending conditions (`condition`) and applied ones (`appliedCondition`). Runtime: `hasChanges`.

## Notes

- Pending and applied state are built in: `condition`, `appliedCondition`, `isDirty` and `hasChanges`

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><select id="country" aria-label="Country"><option value="">All countries</option></select><select id="status" aria-label="Status"><option value="">Any status</option></select>
		<select id="dates" aria-label="Dates"><option value="">All dates</option><option value="2026-01-01|2026-12-31">2026</option><option value="2026-07-01|2026-09-30">Jul–Sep 2026</option></select></div>
		<div class="row"><button type="button" id="apply" class="go">Applied</button><button type="button" id="discard" hidden>Discard</button><span class="hint" id="pend">Change any filters: nothing runs until you press Apply</span></div>
		<div class="panel"><div class="ph"><b>Revenue: <span id="kpi">–</span> <span class="hint" id="note">showing the applied filters</span></b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="hint" id="runs"></div></div>
		<div class="sent" id="sent"></div></div>
		<style>select.pend { border-style: dashed; border-color: var(--violet); background: var(--violet-faint); } .go:not(:disabled) { background: var(--violet); border-color: var(--violet); color: #fff; } .go:disabled { cursor: default; color: var(--muted); }</style>
```

Script:

```js
const app = Anfra.createApp({ title: 'Apply button', timezone: 'Etc/UTC' });
const AQL = 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }';
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: AQL });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
const status = app.createFilter('status', { dataset: 'ecommerce', field: 'orders.status', label: 'Status' });
const dates = app.createFilter('dates', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Dates' });
for (const q of [kpi, trend]) { app.mapControl(country, q, { field: 'customers.country' }); app.mapControl(status, q, { field: 'orders.status' }); app.mapControl(dates, q, { field: 'orders.ordered_at' }); }
const C = [[country, K.$('#country')], [status, K.$('#status')], [dates, K.$('#dates')]];
country.loadOptions().then((vals) => vals.forEach((v) => K.$('#country').add(new Option(v, v))));
status.loadOptions().then((vals) => vals.forEach((v) => K.$('#status').add(new Option(v[0].toUpperCase() + v.slice(1), v))));
const toCond = (ctl, v) => !v ? null : ctl === dates ? { operator: 'between', values: v.split('|') } : { operator: 'is', values: [v] };
const fromCond = (ctl, c) => !c || !c.values || !c.values.length ? '' : ctl === dates ? c.values.join('|') : String(c.values[0]);
C.forEach(([ctl, el]) => { el.onchange = () => { const c = toCond(ctl, el.value); if (c) ctl.setCondition(c); else ctl.reset(); }; });
K.$('#apply').onclick = () => app.execute();
K.$('#discard').onclick = () => C.forEach(([ctl, el]) => { const c = ctl.appliedCondition; if (c && c.values && c.values.length) ctl.setCondition(c); else ctl.reset(); el.value = fromCond(ctl, c); });
const runs = { kpi: 0, trend: 0 }, was = {};
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
for (const q of [kpi, trend]) { if (q.state === 'success' && was[q.name] !== 'success') runs[q.name]++; was[q.name] = q.state; }
const dirty = C.filter(([ctl]) => ctl.isDirty);
C.forEach(([ctl, el]) => el.classList.toggle('pend', ctl.isDirty));
const btn = K.$('#apply');
btn.disabled = !app.hasChanges;
btn.textContent = dirty.length ? 'Apply (' + dirty.length + ')' : 'Applied ✓';
K.$('#discard').hidden = !dirty.length;
K.$('#pend').textContent = dirty.length ? dirty.length + (dirty.length === 1 ? ' change' : ' changes') + ' waiting: the chart still shows the applied filters' : 'Change any filters: nothing runs until you press Apply';
K.status(trend, K.$('#s1'));
if (kpi.result) K.$('#kpi').textContent = K.compact.format(Number(kpi.result.rows[0]?.total_revenue || 0));
if (trend.result) K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
K.$('#runs').textContent = 'Runs so far: kpi ' + runs.kpi + ', trend ' + runs.trend;
K.sent(K.$('#sent'), app, [kpi, trend], () => [dirty.length ? 'pending, not sent → ' + dirty.map(([ctl]) => ctl.name + ' ' + (K.cond(ctl.condition) || 'cleared')).join('; ') : '']);
});
app.execute();
```

## Walkthrough on the gallery card

1. Pick **Japan** in the **All countries** list
2. Pick **Completed** in the **Any status** list
3. Pick **Jul–Sep 2026** in the **All dates** list: nothing runs, and the chart still shows the applied filters
4. Press **Apply (3)**: every query runs once, and the button turns to **Applied ✓**

## Other Controls patterns

- [Filter mapping](one-control-many.md): Choose which charts a filter changes, so a benchmark chart can stay unfiltered.
- [Parent-child filter](cascading-options.md): Picking a category limits the product list to products in that category.
- [Cross filter](selection-to-filter.md): Turn a clicked selection into a filter chip, so your next click narrows further.
- [Zoom / pan](zoom-pan.md): Scrolling zooms the picture, and double-clicking reloads that month week by week.
- [Legend visibility](legend-toggle.md): Click a legend item to hide its line, or Alt-click to show only that line.
- [Custom right-click menu](custom-menu.md): Right-click a data point to open a menu of actions, and choose which actions it offers.
