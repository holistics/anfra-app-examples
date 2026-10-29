# anfra interaction patterns

## Dates & time

Choose the period, its detail, and what to compare it with.

- [Date filter](date-filter.md): Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".
- [Date drill](date-drill.md): Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.
- [Fiscal calendar](fiscal-calendar.md): Report by a fiscal year that starts in July instead of January.
- [As-of anchor](as-of-anchor.md): Count "last 30 days" back from the newest data instead of from today.
- [Incomplete periods](partial-period.md): Mark a month that isn't over yet, so its short bar doesn't look like a drop.
- [Period comparison](period-compare.md): Show each month next to the month before and the same month last year.
- [Custom period comparison](custom-compare.md): Compare any two date ranges side by side, like H1 2026 and H2 2025.
- [Period to date & trailing period](to-date.md): Show a year-to-date total and a rolling 3-month total for each month.

## Selections

Click or drag on a chart to filter the others.

- [Cross-filtering](single-select.md): Click one or more bars, a country on the map or heatmap cells, and other charts show only those.
- [Range brushing](range-brush.md): Drag across months on a chart, and other charts show only that period.
- [Histogram brushing](numeric-brush.md): Drag across a range of order sizes, like $1,000 to $2,000.
- [Cross-highlighting](cross-highlight.md): Hover a country, and other charts keep their totals but highlight its share.
- [Multiple cross-filters](two-selections.md): Keep a selection in two charts at once, like Germany in one and Software in the other.
- [Selection cohort](selection-cohort.md): Select some customers and compare what they buy with everyone else.

## Filters

Decide which rows count.

- [Field filter](field-filter.md): Pick values from a list, like Vietnam and Singapore, and every chart shows only those.
- [Widget filter](scope-vs-filter.md): A rule built into one chart, like "completed orders only", that viewers can't remove.
- [Filter group](compound-filter.md): Combine conditions with AND and OR, like (Vietnam and Software) or cancelled.
- [Metric filter](aggregate-filter.md): Filter on a total, like customers who spent more than $12k.
- [Range filter](range-filter.md): Drag a slider to keep orders between two values, or above or below one.
- [Text filter](text-search.md): Type part of a name to find matching rows, ignoring upper and lower case.

## Tables & calculations

Choose what a chart shows and how its numbers are calculated.

- [Dynamic metric](metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Dynamic dimension](dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Sort](sort.md): Click a column header to sort the table by that column.
- [Top N & Others](top-n.md): Show the top 3 countries and group the rest into "Others".
- [Pivot table](pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Subtotals & grand totals](totals.md): Add a total for each category and one for everything.
- [Percent of total](percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Running total & moving calculation](cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](ranking.md): Number each customer by revenue, overall and within their country.

## Drilling

Go from a number to the detail behind it.

- [Drill down](hierarchy-drill.md): Click a region to see its countries, then customers, then their orders, and climb back with breadcrumbs.
- [Drill path](drill-path.md): Keep a trail of every step down and up, and click any step to go back to it.
- [Break down](adhoc-breakdown.md): Right-click a bar to split it by another field, like order status.
- [View underlying data](underlying-records.md): Click a column on a chart to see the individual orders behind it.
- [Drill-through](drillthrough.md): Click a country to open another app already filtered to that country. (proposed)
- [Row actions](row-actions.md): Put links on each table row: open the customer in your CRM, email them, or see their orders.

## Scenarios & analyses

Try assumptions and run ready-made analyses.

- [Binning](bins.md): Group orders into size bands, like under $100 or over $1,000.
- [Reference line](targets.md): Draw a target line and show how far each month is above or below it.
- [Trend line](trend-line.md): Draw the line of best fit through a chart, to show which way it is heading.
- [What-if parameter](what-if.md): Try a price change, like +10% on Software, and watch revenue change.
- [Rule-based cohort](cohort-from-rank.md): Define a group by a rule, like the top 10% of customers by revenue.

## Controls

Decide what each control and click changes, and when.

- [Filter mapping](one-control-many.md): Choose which charts a filter changes, so a benchmark chart can stay unfiltered.
- [Parent-child filter](cascading-options.md): Picking a category limits the product list to products in that category.
- [Apply button](apply-button.md): Change several filters, then press Apply to update every chart at once.
- [Cross filter](selection-to-filter.md): Turn a clicked selection into a filter chip, so your next click narrows further.
- [Zoom / pan](zoom-pan.md): Scrolling zooms the picture, and double-clicking reloads that month week by week.
- [Legend visibility](legend-toggle.md): Click a legend item to hide its line, or Alt-click to show only that line.
- [Custom right-click menu](custom-menu.md): Right-click a data point to open a menu of actions, and choose which actions it offers.

## Save & share

Keep, share, undo and export what you're looking at.

- [Bookmarks](bookmarks.md): Save the current view and come back to it with one click.
- [Filter state URL](url-state.md): Copy a link that opens the app with the same filters. (proposed)
- [Reset filters](reset.md): Clear one filter, or all of them, back to the defaults.
- [Undo / redo](undo-redo.md): Step back and forward through your filter and drill changes.
- [Saved views](saved-views.md): Keep named views that are still there next week, on any device. (proposed)
- [Refresh & cache](refresh.md): Rerun the queries and see how fresh the data is.
