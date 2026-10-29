---
name: anfra-interaction-patterns
description: "Implements analytical interactions in anfra Data Apps with the @holistics/anfra-sdk: date filters, date drill, cross-filtering, view underlying data, drill down, Top N, period comparison, what-if and 46 more, each with its AQL, SDK wiring and a working example. Use when building or changing an interaction in an anfra Data App, or when told to follow an example from anfra.ai/interaction-patterns."
---

# anfra interaction patterns

A gallery of analytical interaction patterns for anfra Data Apps (https://anfra.ai/interaction-patterns). Each pattern has a Markdown page: references/<id>.md. The list with one line per pattern is llms.txt.

## How to use a pattern

1. Find the pattern. Common names map to these pages:
   - date filter: references/date-filter.md
   - date drill: references/date-drill.md
   - cross-filtering: references/single-select.md
   - underlying data: references/underlying-records.md
   - drill down: references/hierarchy-drill.md
   - what-if parameter: references/what-if.md
2. Read its **What to build** section for the behaviour, and **Done when** for the check.
3. Copy the **SDK wiring**: `createQuery`, `createFilter`, `createDateDrill`, `mapControl`, `mapCrossFilter`, `select`, `setSort`, `fetchMore`. **Complete working example** shows the same calls in a running app.
4. Swap the `ecommerce` fields for the user's own. Run `anfra show <dataset>` to see them, and run each query with `anfra query` before putting it in the app.
5. Check the result against **Done when**, in the browser, by doing what the reader would do.

The examples run on @holistics/anfra-sdk 0.8.0 and anfra 0.8.0. If the installed SDK is newer, check its typings (`app.d.ts`) before copying a call.

## What the examples assume

- A Data App is one HTML file in the repo's `apps/`, run by `anfra serve` in a sandboxed frame with the SDK on the global `Anfra`.
- `K` in the complete examples is the gallery's own drawing kit. It does not exist in a Data App: draw with your own HTML, SVG or a charting library.
- `ecommerce` models: `orders` (`ordered_at`, `status`, `ordered_ts` in UTC, `discount_pct`, `fiscal_year`, `fiscal_quarter`), `order_items`, `customers` (`country`), `products` (`category`, `subcategory`, `brand`), `markets` (`region`, `monthly_target`), `sessions`. Metrics: `revenue`, `order_count`, `aov`, `net_revenue`, `monthly_target`, `session_count`, `units_sold`. Orders run from 2025-06-01 to 2026-09-23.

## Rules for interactions

Everything else about a Data App is in the official anfra skills, installed with `anfra skills install`: `build-data-app` for the app, its SDK calls and the sandbox, `aql` and `write-aql` for the queries, and `aml` for adding a field or metric to a Dataset. Follow them first. These patterns add two rules, found on @holistics/anfra-sdk 0.8.0:

- Controls and selections can target only model fields and Dataset metrics, not dimensions or metrics declared in the query ("unknown field"). Promote the field or metric to the Dataset with the `aml` skill.
- Selecting rows whose date comes from `| month()` breaks the target query: the SDK sends exact-day conditions. Use a raw date field with `createDateDrill`, or turn the click into a `between` condition on a date filter, as date-drill and underlying-records do.

## Status

Each pattern page states one of:

- Works today: anfra does it natively
- Works with app code: anfra supplies the queries, the app adds some logic
- Proposed: anfra cannot do this yet (checked on 0.13.3: no write path, no query parameters, and the app frame allows scripts only, so no navigation or storage). Build the closest version and say what is missing

## Do not

- Call this site's `api/` from an app. It serves the gallery's own demos, is rate-limited, and only has the `ecommerce` sample.
- Scrape https://anfra.ai/interaction-patterns/interaction-gallery.html. It is one large HTML file with embedded fonts and scripts; everything in it is in the Markdown pages.

## Patterns

### Dates & time

Choose the period, its detail, and what to compare it with.

- [Date filter](references/date-filter.md): Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".
- [Date drill](references/date-drill.md): Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.
- [Fiscal calendar](references/fiscal-calendar.md): Report by a fiscal year that starts in July instead of January.
- [As-of anchor](references/as-of-anchor.md): Count "last 30 days" back from the newest data instead of from today.
- [Incomplete periods](references/partial-period.md): Mark a month that isn't over yet, so its short bar doesn't look like a drop.
- [Period comparison](references/period-compare.md): Show each month next to the month before and the same month last year.
- [Custom period comparison](references/custom-compare.md): Compare any two date ranges side by side, like H1 2026 and H2 2025.
- [Period to date & trailing period](references/to-date.md): Show a year-to-date total and a rolling 3-month total for each month.

### Selections

Click or drag on a chart to filter the others.

- [Cross-filtering](references/single-select.md): Click one or more bars, a country on the map or heatmap cells, and other charts show only those.
- [Range brushing](references/range-brush.md): Drag across months on a chart, and other charts show only that period.
- [Histogram brushing](references/numeric-brush.md): Drag across a range of order sizes, like $1,000 to $2,000.
- [Cross-highlighting](references/cross-highlight.md): Hover a country, and other charts keep their totals but highlight its share.
- [Multiple cross-filters](references/two-selections.md): Keep a selection in two charts at once, like Germany in one and Software in the other.
- [Selection cohort](references/selection-cohort.md): Select some customers and compare what they buy with everyone else.

### Filters

Decide which rows count.

- [Field filter](references/field-filter.md): Pick values from a list, like Vietnam and Singapore, and every chart shows only those.
- [Widget filter](references/scope-vs-filter.md): A rule built into one chart, like "completed orders only", that viewers can't remove.
- [Filter group](references/compound-filter.md): Combine conditions with AND and OR, like (Vietnam and Software) or cancelled.
- [Metric filter](references/aggregate-filter.md): Filter on a total, like customers who spent more than $12k.
- [Range filter](references/range-filter.md): Drag a slider to keep orders between two values, or above or below one.
- [Text filter](references/text-search.md): Type part of a name to find matching rows, ignoring upper and lower case.

### Tables & calculations

Choose what a chart shows and how its numbers are calculated.

- [Dynamic metric](references/metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Dynamic dimension](references/dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Sort](references/sort.md): Click a column header to sort the table by that column.
- [Top N & Others](references/top-n.md): Show the top 3 countries and group the rest into "Others".
- [Pivot table](references/pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Subtotals & grand totals](references/totals.md): Add a total for each category and one for everything.
- [Percent of total](references/percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Running total & moving calculation](references/cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](references/index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](references/ranking.md): Number each customer by revenue, overall and within their country.

### Drilling

Go from a number to the detail behind it.

- [Drill down](references/hierarchy-drill.md): Click a region to see its countries, then customers, then their orders, and climb back with breadcrumbs.
- [Drill path](references/drill-path.md): Keep a trail of every step down and up, and click any step to go back to it.
- [Break down](references/adhoc-breakdown.md): Right-click a bar to split it by another field, like order status.
- [View underlying data](references/underlying-records.md): Click a column on a chart to see the individual orders behind it.
- [Drill-through](references/drillthrough.md): Click a country to open another app already filtered to that country. (proposed)
- [Row actions](references/row-actions.md): Put links on each table row: open the customer in your CRM, email them, or see their orders.

### Scenarios & analyses

Try assumptions and run ready-made analyses.

- [Binning](references/bins.md): Group orders into size bands, like under $100 or over $1,000.
- [Reference line](references/targets.md): Draw a target line and show how far each month is above or below it.
- [Trend line](references/trend-line.md): Draw the line of best fit through a chart, to show which way it is heading.
- [What-if parameter](references/what-if.md): Try a price change, like +10% on Software, and watch revenue change.
- [Rule-based cohort](references/cohort-from-rank.md): Define a group by a rule, like the top 10% of customers by revenue.

### Controls

Decide what each control and click changes, and when.

- [Filter mapping](references/one-control-many.md): Choose which charts a filter changes, so a benchmark chart can stay unfiltered.
- [Parent-child filter](references/cascading-options.md): Picking a category limits the product list to products in that category.
- [Apply button](references/apply-button.md): Change several filters, then press Apply to update every chart at once.
- [Cross filter](references/selection-to-filter.md): Turn a clicked selection into a filter chip, so your next click narrows further.
- [Zoom / pan](references/zoom-pan.md): Scrolling zooms the picture, and double-clicking reloads that month week by week.
- [Legend visibility](references/legend-toggle.md): Click a legend item to hide its line, or Alt-click to show only that line.
- [Custom right-click menu](references/custom-menu.md): Right-click a data point to open a menu of actions, and choose which actions it offers.

### Save & share

Keep, share, undo and export what you're looking at.

- [Bookmarks](references/bookmarks.md): Save the current view and come back to it with one click.
- [Filter state URL](references/url-state.md): Copy a link that opens the app with the same filters. (proposed)
- [Reset filters](references/reset.md): Clear one filter, or all of them, back to the defaults.
- [Undo / redo](references/undo-redo.md): Step back and forward through your filter and drill changes.
- [Saved views](references/saved-views.md): Keep named views that are still there next week, on any device. (proposed)
- [Refresh & cache](references/refresh.md): Rerun the queries and see how fresh the data is.
