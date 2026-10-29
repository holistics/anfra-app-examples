# Drill-through

> Click a country to open another app already filtered to that country.

- Pattern id: `drillthrough`
- Category: Drilling (also Save & share)
- Status: Proposed: anfra cannot do this yet (checked on 0.13.3: no write path, no query parameters, and the app frame allows scripts only, so no navigation or storage). Build the closest version and say what is missing
- Gallery card: https://anfra.ai/interaction-patterns/interaction-gallery.html#drillthrough
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

From a summary page, the reader clicks **Japan**, picks **Open in Cohort Heatmap**, and that app opens with Country = Japan.

Why: Data Apps work better as a connected set than as islands.

## What to build

Clicking a value opens a link to another Data App, passing that value so the app opens already filtered.

Layout: A context menu, then a second app frame with the filter already set.

Instruction: Clicking a value opens another Data App with that value already filtered.

Done when: The other app opens with the clicked value set in its filter, and its numbers match that value's slice.

On the ecommerce sample: Clicking Japan and picking Open in Cohort Heatmap opens that app with Country = Japan already set in its filter.

## AQL

Not run as written: no query change.

```aql
// target app: the same field-backed filter, set from the context the host passes in
// country.setCondition({ operator: 'is', values: ['Japan'] })
```

## SDK wiring

```js
// Proposed (not real API):
// Anfra.open('reports/cohort-heatmap', { controls: { country: {
// operator: 'is', values: ['Japan'] } } })
// and in the target: Anfra.context.controls
```

## Notes

- Proposed: the host carries a snapshot (control conditions) into the target app
- Limits: Proposed. The app sandbox allows scripts only: navigation and popups are blocked, and `localStorage` throws.

## Walkthrough on the gallery card

1. Click **Japan** on the summary page
2. Pick **Open in Cohort Heatmap**
3. Read the Cohort Heatmap app: it opens with Country = Japan

## Other Drilling patterns

- [Drill down](hierarchy-drill.md): Click a region to see its countries, then customers, then their orders, and climb back with breadcrumbs.
- [Drill path](drill-path.md): Keep a trail of every step down and up, and click any step to go back to it.
- [Break down](adhoc-breakdown.md): Right-click a bar to split it by another field, like order status.
- [View underlying data](underlying-records.md): Click a column on a chart to see the individual orders behind it.
- [Row actions](row-actions.md): Put links on each table row: open the customer in your CRM, email them, or see their orders.
