# Cross-highlighting

> Hover a country, and other charts keep their totals but highlight its share.

- Pattern id: `cross-highlight`
- Category: Selections (also Controls)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#cross-highlight
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader hovers **Vietnam** (a click keeps it). The category chart keeps the full totals as grey bars and overlays Vietnam's part in violet: $91.5k of Services' $578k.

Why: A filter hides the context. A highlight keeps it, so the reader sees "how much of the whole".

## What to build

Hovering an item overlays its share on the other charts, while their full totals stay visible underneath; a click pins it.

Layout: Category bars with a grey total and a violet overlay for the selection.

Instruction: Make hovering an item in one chart highlight its share in the other charts, keeping their full totals visible; a click keeps the highlight.

Done when: The highlight follows the pointer, each bar keeps its full total with the share on top, and a pinned item stays after the pointer leaves.

On the ecommerce sample: Hover Vietnam: Revenue by category keeps the full totals in grey with Vietnam's part on top, and Services shows $91.5k of $578k.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { category: products.category }
  measures { total_revenue: revenue }
  sorts { total_revenue desc }
}
```

Reader input the SDK sent:

```json
{
  "conditions": [
    {
      "expr": "customers.country == 'Vietnam'"
    }
  ]
}
```

Saved result:

| category | total_revenue |
|---|---|
| Services | 91500.00 |
| Software | 68234.00 |
| Hardware | 23746.62 |
| Parts | 1774.15 |

## SDK wiring

```js
// two copies of the same AQL: one is a cross-filter target, the
// other is not
const catAll = app.createQuery('catAll', {
  dataset: 'ecommerce',
  aql: CAT_AQL,
});
const catSel = app.createQuery('catSel', {
  dataset: 'ecommerce',
  aql: CAT_AQL,
});
// only the overlay follows the selection
app.mapCrossFilter(byCountry, catSel);
// draw catAll as grey bars, catSel on top in the accent colour
```

## Notes

- Same AQL, two declarations, one edge. The highlight is a second query that is mapped
- Limits: Works with app code: two queries. A proposed `mapCrossFilter(from, to, { mode: 'highlight' })` would return both in one result.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<style>
		.hl { display: grid; gap: 6px; }
		.hl .r { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; align-items: center; font-size: 12px; line-height: 16px; }
		.hl .t { position: relative; height: 14px; border-radius: 3px; }
		.hl .g, .hl .o { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; transition: width 320ms var(--ease); }
		.hl .g { background: rgb(24 20 31 / 0.12); }
		.hl .o { background: var(--violet); }
		.hl .v { grid-column: 2; color: var(--weak); font-variant-numeric: tabular-nums; margin-top: -4px; }
		.hl .v b { color: var(--violet-ink); font-weight: 600; }
		</style>
		<div class="row"><span class="hint">Hover a country to highlight its part of each category. Click to keep it highlighted, click again to let go</span></div>
		<div class="cols" style="grid-template-columns: 1fr 1.15fr"><div class="panel"><div class="ph"><b>Revenue by country</b><span class="status" id="s1"></span></div><div id="bycountry"></div></div>
		<div class="panel"><div class="ph"><b>Revenue by category<span id="for"></span></b><span class="status" id="s2"></span></div><div class="hl" id="cat"></div>
		<div class="legend" style="margin-top:8px"><span><i style="background:rgb(24 20 31 / 0.12)"></i>All countries</span><span><i style="background:var(--violet)"></i><span id="lg">Selected</span></span></div></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Cross-highlighting', timezone: 'Etc/UTC' });
const byCountry = app.createQuery('byCountry', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const CAT = 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }';
const catAll = app.createQuery('catAll', { dataset: 'ecommerce', aql: CAT });
const catSel = app.createQuery('catSel', { dataset: 'ecommerce', aql: CAT });
app.mapCrossFilter(byCountry, catSel);
const kc = (v) => K.compact.format(Number(v));
// hover previews a country, a click pins it; either way it is the selection the overlay query follows
let hovered = null, pinned = null, t = 0;
const apply = () => { clearTimeout(t); t = setTimeout(() => {
	const want = hovered || pinned, now = byCountry.selectedRows[0] || null;
	if ((want && want.country_name) === (now && now.country_name)) return;
	if (want) byCountry.select([want]); else app.clearSelection();
	app.execute();
}, 90); };
K.$('#bycountry').addEventListener('mouseleave', () => { hovered = null; apply(); });
// leaving the app's frame straight from a bar fires no mouseleave on the list
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { hovered = null; apply(); } });
window.addEventListener('message', (e) => { if (e.data && e.data.gallery === 'pointer-left') { hovered = null; apply(); } });
K.$('#bycountry').addEventListener('focusout', (e) => { if (!K.$('#bycountry').contains(e.relatedTarget)) { hovered = null; apply(); } });
app.subscribe(() => {
K.status(byCountry, K.$('#s1')); K.status(catSel, K.$('#s2'));
const picked = byCountry.selectedRows[0]?.country_name || null;
if (byCountry.result) {
	const rows = byCountry.result.rows;
	K.bars(K.$('#bycountry'), rows, { label: (r) => r.country_name, value: (r) => r.total_revenue, on: (r) => !!pinned && r.country_name === pinned.country_name,
		pick: (r) => { pinned = pinned && pinned.country_name === r.country_name ? null : r; hovered = null; apply(); } });
	K.$('#bycountry').querySelectorAll('button').forEach((b, i) => { const r = rows[i]; if (!r) return; b.onmouseenter = () => { hovered = r; apply(); }; b.onfocus = () => { hovered = r; apply(); }; });
}
K.$('#for').textContent = picked ? ': ' + picked + ' of total' : '';
K.$('#lg').textContent = picked || 'Selected';
if (catAll.result) {
	const sel = new Map((catSel.result?.rows || []).map((r) => [r.category_name, Number(r.total_revenue)]));
	const max = Math.max(...catAll.result.rows.map((r) => Number(r.total_revenue)), 1);
	const el = K.$('#cat');
	el.replaceChildren(...catAll.result.rows.map((r) => {
		const tot = Number(r.total_revenue), part = picked ? (sel.get(r.category_name) || 0) : tot;
		const d = document.createElement('div'); d.className = 'r';
		d.innerHTML = '<span>' + K.esc(r.category_name) + '</span><span class="t"><span class="g" style="width:' + (tot / max * 100) + '%"></span><span class="o" style="width:' + (part / max * 100) + '%"></span></span>'
			+ '<span class="v">' + (picked ? '<b>' + kc(part) + '</b> of ' + kc(tot) + ' · ' + Math.round(part / tot * 100) + '%' : kc(tot)) + '</span>';
		return d;
	}));
}
K.sent(K.$('#sent'), app, [catAll, catSel]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Hover **Vietnam** on **Revenue by country**
2. Read **Revenue by category**: the grey bars keep the full totals, and Vietnam's part sits on top in violet
3. Read **Services**: $91.5k of $578k
4. Move to another country to compare, or click **Vietnam** to keep it highlighted after the pointer leaves

## Other Selections patterns

- [Cross-filtering](single-select.md): Click one or more bars, a country on the map or heatmap cells, and other charts show only those.
- [Range brushing](range-brush.md): Drag across months on a chart, and other charts show only that period.
- [Histogram brushing](numeric-brush.md): Drag across a range of order sizes, like $1,000 to $2,000.
- [Multiple cross-filters](two-selections.md): Keep a selection in two charts at once, like Germany in one and Software in the other.
- [Selection cohort](selection-cohort.md): Select some customers and compare what they buy with everyone else.
