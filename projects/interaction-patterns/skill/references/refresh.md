# Refresh & cache

> Rerun the queries and see how fresh the data is.

- Pattern id: `refresh`
- Category: Save & share (also Dates & time)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#refresh
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

A freshness line shows the newest data, when the query ran and whether it came from cache. **Refresh** skips the cache.

Why: Readers trust a number more when they can see how old it is.

## What to build

A line shows how new the data is and when it loaded, and Refresh skips the cache and fetches everything again.

Layout: A freshness bar with a refresh button.

Instruction: Show how new the data is and when it was loaded, with a Refresh button that fetches it again.

Done when: Pressing Refresh updates the load time, and the freshness line says whether the data came from cache.

On the ecommerce sample: The top line shows the newest order date and when the query ran. Run again re-runs nothing, while Refresh re-runs and updates the time.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore { measures { latest: orders | max(orders.ordered_at), earliest: orders | min(orders.ordered_at) } }
```

Saved result:

| latest | earliest |
|---|---|
| 2026-09-23 | 2025-06-01 |

## SDK wiring

```js
// re-runs everything, skips result cache
refreshBtn.onclick = () => app.refresh();
app.subscribe(() => {
  const d = trend.result?.debug;
  const cache = d?.fromCache ? ' · cache' : '';
  fresh.textContent = `ran ${ago(d?.executedAt)}${cache}`;
});
// live data only
setInterval(() => app.refresh(), 5 * 60_000);
```

State it touches: Runtime: `executedAt` and `fromCache`. Never saved in a snapshot.

## Notes

- `refresh()` and `result.debug` give the run's age and cache status

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app"><style>.colz { height: 110px; }</style>
		<div class="row" style="justify-content:space-between"><span id="fresh" class="lbl" style="font-size:14px;color:var(--ink)">–</span><span class="row"><button type="button" id="again" title="app.execute(): runs only queries whose input changed">Run again</button><button type="button" id="refresh" title="app.refresh(): re-runs everything and skips the result cache">⟳ Refresh</button></span></div>
		<div class="panel"><div class="ph"><b>Monthly revenue: <span id="kpi">–</span></b><span class="status" id="s1"></span></div><div id="trend"></div></div>
		<div class="panel" style="padding:6px 10px"><div class="ph" style="margin-bottom:4px"><b>Runs</b><span>Newest first</span></div><div id="log"></div></div>
		<div class="hint">This host's core API backend reports fromCache false on every run, so "cache" never shows here</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Refresh & cache', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }' });
const anchor = app.createQuery('anchor', { dataset: 'ecommerce', aql: 'explore { measures { latest: orders | max(orders.ordered_at), earliest: orders | min(orders.ordered_at) } }' });
const runs = [];
const t = (d) => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–';
async function run (kind) {
	const before = trend.result && trend.result.debug ? String(trend.result.debug.executedAt) : null, t0 = performance.now();
	const entry = { kind, at: new Date(), ms: null, ran: null };
	runs.unshift(entry); draw();
	const sum = kind === 'Refresh' ? await app.refresh() : await app.execute();
	entry.ms = Math.round(performance.now() - t0);
	entry.ran = sum.succeeded.length + sum.failed.length;
	entry.same = trend.result && trend.result.debug && String(trend.result.debug.executedAt) === before;
	entry.cache = !!(trend.result && trend.result.debug && trend.result.debug.fromCache);
	draw();
}
K.$('#again').onclick = () => run('Run again');
K.$('#refresh').onclick = () => run('Refresh');
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const day = (v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function draw () {
	K.status(trend, K.$('#s1'));
	const d = trend.result && trend.result.debug;
	const latest = anchor.result && anchor.result.rows[0] ? day(anchor.result.rows[0].latest) : '…';
	K.$('#fresh').innerHTML = 'Data as of <b>' + latest + '</b> · ran ' + t(d && d.executedAt) + ' · ' + (trend.state === 'executing' ? 'running…' : d ? (d.fromCache ? 'from cache' : '<span style="color:var(--violet-ink)">fresh</span>') : '…');
	if (trend.result) {
		K.$('#kpi').textContent = K.compact.format(trend.result.rows.reduce((s, r) => s + Number(r.total_revenue), 0));
		K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
	}
	K.$('#log').innerHTML = runs.slice(0, 3).map((r) => '<div style="display:flex;justify-content:space-between;font-size:12px;line-height:20px"><span><b style="font-weight:500">' + r.kind + '</b> at ' + t(r.at) + '</span><span style="color:var(--muted)">'
		+ (r.ran == null ? 'running…' : r.ran === 0 ? 'nothing re-ran: the input did not change, results kept' : r.ran + ' queries re-ran' + (r.kind === 'Refresh' ? ' with bustCache' : '') + ' · ' + r.ms + ' ms · ' + (r.cache ? 'cache' : 'fresh')) + '</span></div>').join('') || '<div class="hint">Press Run again or Refresh</div>';
	K.sent(K.$('#sent'), app, [trend, anchor], () => [(runs[0] ? 'last call → ' + (runs[0].kind === 'Refresh' ? 'app.refresh() (bustCache: true)' : 'app.execute() (changed input only)') : 'first load → app.execute()') + ' · debug.fromCache ' + String(!!(d && d.fromCache))]);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Read the line at the top: **Data as of** the newest order date, when the query ran, and **fresh**
2. Click **Run again**: under **Runs**, nothing re-runs because the input did not change
3. Click **⟳ Refresh**: every query re-runs past the cache, and the run time updates

## Other Save & share patterns

- [Bookmarks](bookmarks.md): Save the current view and come back to it with one click.
- [Filter state URL](url-state.md): Copy a link that opens the app with the same filters.
- [Reset filters](reset.md): Clear one filter, or all of them, back to the defaults.
- [Undo / redo](undo-redo.md): Step back and forward through your filter and drill changes.
- [Saved views](saved-views.md): Keep named views that are still there next week, on any device.
