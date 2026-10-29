(() => {
'use strict';
const D = JSON.parse(document.getElementById('data').textContent);
const AQ = JSON.parse(document.getElementById('aql').textContent);
const rec = (n) => (AQ[n] && AQ[n].result ? AQ[n].result.records : D[n]);
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ML = (s) => { const [y, m] = s.split('-'); return MN[+m - 1] + ' ' + y.slice(2); };
const k$ = (x) => '$' + (Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : Math.abs(x) >= 1e3 ? (x / 1e3).toFixed(0) + 'k' : Math.round(x));
const pct = (x, d = 0) => (x * 100).toFixed(d) + '%';

const W = rec('20-window');
const M = W.map((r) => r[0]);
const TOTAL = W.map((r) => +r[1]);
const CUM = W.map((r) => +r[2]);
const AVG3 = W.map((r) => +r[3]);
const VNSG = rec('01-filters').map((r) => +r[1]);
const DE_COMPLETED = rec('37-scope').map((r) => +r[1]);
const CTRY = rec('19-pct').map((r) => ({ k: r[0], v: +r[1], s: +r[2] }));
const byGroup = (rows) => { const o = {}; for (const [g, d, v] of rows) (o[g] ||= {})[d] = +v; return o; };
const CM = byGroup(D['41-country-month'] || D['d-country-month']);
const CATM = byGroup(D['40-cat-month'] || D['d-cat-month']);
const CATS = ['Services', 'Software', 'Hardware', 'Parts'];
const CAT_TOTAL = { Services: 578000, Software: 497394, Hardware: 193999.6, Parts: 13659.35 };
const CAT_VN = Object.fromEntries(rec('39-highlight').map((r) => [r[0], +r[1]]));
const colsOf = (vals, f) => M.map((d, i) => ({ k: d, l: ML(d), v: vals[i], ...(f ? f(i, d) : {}) }));
const trend = (vals, o = {}) => ({ kind: 'cols', title: 'Revenue by month', every: 3, items: colsOf(vals, o.f), ...o });
const sumCountries = (cs) => M.map((d) => cs.reduce((a, c) => a + (CM[c][d] || 0), 0));
const ctryBars = (o = {}) => ({ kind: 'bars', title: 'Revenue by country', items: CTRY.map((c) => ({ k: c.k, v: c.v, t: k$(c.v), ...(o.f ? o.f(c) : {}) })), ...o });
const catBars = (vals, o = {}) => ({ kind: 'bars', title: 'Revenue by category', items: CATS.map((c) => ({ k: c, v: vals[c], t: k$(vals[c]), ...(o.f ? o.f(c) : {}) })), ...o });
const chip = (k, t, c) => ({ k: 'c:' + k, t, c });

// ---------- primitives ----------
const prims = [
	{ key: 'time', ic: 'T', name: 'Dates & time', tech: 'Time context', sub: 'Choose the period, its detail, and what to compare it with.', short: 'Dates & time', desc: 'Which period, at what grain, in which time zone and calendar, anchored where, compared with what.', ex: "revenue | relative_period(orders.ordered_at, interval(-1 year))" },
	{ key: 'sel', ic: 'S', name: 'Selections', tech: 'Selections', sub: 'Click or drag on a chart to filter the others.', short: 'Selections', desc: 'Rows the reader picked in a chart (one, several, pairs or a range) and the conditions they create elsewhere.', ex: 'byCountry.select([row1, row2])' },
	{ key: 'pred', ic: 'P', name: 'Filters', tech: 'Predicates', sub: 'Decide which rows count.', short: 'Filters', desc: 'Conditions that decide which rows count: country is Vietnam, revenue over $12k, name contains "smith".', ex: "region.setCondition({ operator: 'is', values: ['VN'] })" },
	{ key: 'shape', ic: 'Q', name: 'Tables & calculations', tech: 'Query shape', sub: 'Choose what a chart shows and how its numbers are calculated.', short: 'Tables & calculations', desc: 'What the query returns: metrics, breakdowns, sort, Top N, pivot, totals and calculations.', ex: "explore { dimensions { … } measures { … } }" },
	{ key: 'drill', ic: 'D', name: 'Drilling', tech: 'Drill context', sub: 'Go from a number to the detail behind it.', short: 'Drilling', desc: 'Where the reader is in a hierarchy, and the path that got them there, down to the rows behind a number.', ex: 'All regions › APAC › Australia › Customer 184' },
	{ key: 'param', ic: '#', name: 'Scenarios & analyses', tech: 'Parameter sets', sub: 'Try assumptions and run ready-made analyses.', short: 'Scenarios & analyses', desc: 'Values that change a calculation rather than a filter: a target, a price uplift, a bin width, a cohort rule.', ex: "{ uplift: 0.10, category: 'Software' }" },
	{ key: 'map', ic: '→', name: 'Controls', tech: 'Interaction mappings', sub: 'Decide what each control and click changes, and when.', short: 'Controls', desc: 'Which gesture or control changes which query, on which field, and whether it re-queries or only redraws.', ex: "app.mapControl(country, trend, { field: 'customers.country' })" },
	{ key: 'snap', ic: '⎘', name: 'Save & share', tech: 'Exploration snapshots', sub: 'Keep, share, undo and export what you\'re looking at.', short: 'Save & share', desc: 'The analytical state saved as a value, so it can be bookmarked, shared, undone, refreshed or exported.', ex: '{ controls, selection, sorts, grain, timezone }' },
];

const SQL_JOIN = 'Join <code>order_items</code> → <code>orders</code> → <code>customers</code> and <code>products</code> by hand, and repeat it in every query';
const SQL_REV = 'Recompute revenue as <code>SUM(quantity * price)</code> in every query, and keep the copies in sync';
const AN_JOIN = 'No joins: AQL follows the Dataset relationships, and <code>revenue</code> is defined once';

// ---------- demos ----------
const demos = [
// ===== Predicates =====
{
	id: 'field-filter', prim: 'pred', also: ['map'], status: 'works', title: 'Field filter',
	one: 'Pick values from a list, like Vietnam and Singapore, and every chart shows only those.',
	does: 'The reader picks <b>Vietnam</b> and <b>Singapore</b>, then <b>Completed</b>. The monthly revenue trend redraws, and the bars slide down from $1.28M to $281k.',
	why: 'Most dashboards need a filter first. Here the filter field is checked when the app starts, and its options come from the data.',
	viz: 'Monthly revenue columns under a row of filter chips; the unfiltered total stays as a grey ghost so the drop is visible.',
	trailer: [
		{ cap: 'All orders: $1.28M over 16 months', chips: [chip('country', 'Country: All'), chip('status', 'Status: All')], viz: trend(TOTAL) },
		{ cap: 'Country → Vietnam, Singapore', at: 'c:country', chips: [chip('country', 'Country: Vietnam, Singapore', 'on'), chip('status', 'Status: All')], viz: trend(sumCountries(['Vietnam', 'Singapore']), { f: (i) => ({ g: TOTAL[i] }) }) },
		{ cap: 'Status → Completed. Same AQL, new input', at: 'c:status', chips: [chip('country', 'Country: Vietnam, Singapore', 'on'), chip('status', 'Status: Completed', 'on')], viz: trend(VNSG, { f: (i) => ({ g: TOTAL[i] }), max: Math.max(...TOTAL) * 1.08 }) },
	],
	aqlRef: '01-filters',
	sdk: `const app = Anfra.createApp({ timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', {
  dataset: 'ecommerce',
  aql: TREND_AQL,
});

const country = app.createFilter('country', {
  dataset: 'ecommerce',
  field: 'customers.country',
});
const status = app.createFilter('status', {
  dataset: 'ecommerce',
  field: 'orders.status',
});
// options come from the data
await country.loadOptions();

app.mapControl(country, trend, { field: 'customers.country' });
app.mapControl(status, trend, { field: 'orders.status' });

country.setCondition({
  operator: 'is',
  values: ['Vietnam', 'Singapore'],
});
// re-runs only what changed
await app.execute();`,
	state: 'Analytical: two filter conditions. Renderer: the grey ghost bars.',
	sql: [SQL_JOIN, 'Build <code>WHERE country IN (…)</code> safely from the reader\'s choices, and drop it when the list is empty', 'Write a separate <code>SELECT DISTINCT</code> query for each picker\'s options'],
	anfra: ['One filter and one mapping per query. The SDK sends <code>filters[]</code>, and the AQL text never changes', 'A typo in <code>field</code> fails at once, with a "did you mean" suggestion', '<code>loadOptions()</code> fetches values that this reader is allowed to see'],
	prompt: 'Show monthly revenue as columns. Add a Country and an Order status multi-select above it, mapped to customers.country and orders.status. Keep the unfiltered total as faint ghost bars so the reader sees how much the filter removed.',
	generic: 'Add field-backed multi-select filters above a main chart, each mapped explicitly to the queries it should affect, with options loaded from the data.',
},
{
	id: 'scope-vs-filter', prim: 'pred', status: 'works', title: 'Widget filter',
	one: 'A rule built into one chart, like "completed orders only", that viewers can\'t remove.',
	does: 'A "Completed orders only" badge is part of the query and can\'t be removed. The reader still picks <b>Germany</b>, and the chart shows Germany\'s completed revenue.',
	why: 'Readers need to know which rules are fixed, such as "we never count cancelled orders", and which ones they control.',
	viz: 'A locked scope badge next to normal filter chips, above a monthly trend.',
	trailer: [
		{ cap: 'Scope is part of the query: completed only', chips: [chip('scope', '🔒 Completed orders only', 'btn'), chip('country', 'Country: All')], viz: trend(TOTAL.map((v, i) => v * 0.7)) },
		{ cap: 'Reader adds Country → Germany', at: 'c:country', chips: [chip('scope', '🔒 Completed orders only', 'btn'), chip('country', 'Country: Germany', 'on')], viz: trend(DE_COMPLETED, { max: Math.max(...DE_COMPLETED) * 1.1 }) },
		{ cap: 'Reset clears Germany; the scope stays', at: 'c:country', chips: [chip('scope', '🔒 Completed orders only', 'btn'), chip('country', 'Country: All')], viz: trend(TOTAL.map((v) => v * 0.7)) },
	],
	aqlRef: '37-scope',
	aqlNote: 'Trailer frames 1 and 3 approximate the completed-only total at 70% of all revenue. Frame 2 is the real run result.',
	sdk: `// scope: in the AQL, so no reader can remove it
const trend = app.createQuery('trend', {
  dataset: 'ecommerce',
  aql: \`
    explore {
      … filters { orders.status == 'completed' }
    }
  \`,
});

// reader filter: a control on top of the scope
app.mapControl(country, trend, { field: 'customers.country' });
resetBtn.onclick = () => {
  country.reset();
  app.execute();
};`,
	state: 'Analytical: the fixed scope lives in the declaration, and the reader filter is a control condition.',
	sql: ['Mix the fixed WHERE clauses with the reader\'s clauses in one string, and keep them apart when resetting'],
	anfra: ['The fixed scope sits in <code>filters { }</code> and the reader filter goes through <code>mapControl</code>. <code>executedAql</code> shows both', '<code>reset()</code> can never remove the scope'],
	prompt: 'Make a monthly revenue chart that always counts completed orders only (put that rule in the query and show it as a locked badge), and add a Country filter the reader can change and reset.',
	generic: 'Separate fixed business rules (in the query\'s filters block, shown as a locked badge) from reader filters (controls), so Reset never removes the rules.',
},
{
	id: 'compound-filter', prim: 'pred', status: 'app', title: 'Filter group',
	one: 'Combine conditions with AND and OR, like (Vietnam and Software) or cancelled.',
	does: 'The reader builds two groups: <b>Vietnam and Software</b>, or <b>Status is cancelled</b>. The table keeps only the rows that match either group.',
	why: 'Readers ask "this, or that" questions all the time. Plain filter bars can only combine conditions with AND.',
	viz: 'A small condition builder (two groups joined by OR) above a breakdown table.',
	trailer: [
		{ cap: 'Group 1: Vietnam AND Software', chips: [chip('g1', '( Country = Vietnam AND Category = Software )', 'on')], viz: { kind: 'table', title: 'Revenue', head: ['Country', 'Category', 'Status', 'Revenue'], rows: [{ c: ['Vietnam', 'Software', 'completed', '$37.8k'] }, { c: ['Vietnam', 'Software', 'shipped', '$13.4k'] }, { c: ['Vietnam', 'Software', 'cancelled', '$17.0k'] }] } },
		{ cap: 'OR group 2: Status = cancelled', at: 'c:g2', chips: [chip('g1', '( Vietnam AND Software )', 'on'), chip('or', 'OR'), chip('g2', '( Status = cancelled )', 'on')], viz: { kind: 'table', title: 'Revenue', animateNew: true, head: ['Country', 'Category', 'Status', 'Revenue'], rows: rec('03-compound').slice(0, 7).map((r) => ({ c: [r[0], r[1], r[2], k$(+r[3])] })) } },
	],
	aqlRef: '03-compound',
	aqlNote: 'The query runs as written. A reader-built group, though, can\'t be sent as SDK input: controls are ANDed, and only selections become OR expressions.',
	sdk: `// Today: each new set of groups is a new query (AQL is fixed once
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
// categoryIs], [statusIs]] })`,
	limits: 'Works with app code: build and validate the expression from picked values only, and declare a new query for each change. A condition-group control is proposed.',
	limitsShort: 'reader-built OR groups need a new query per change',
	sql: ['Build nested <code>(… AND …) OR …</code> strings with correct brackets and parameter binding', SQL_JOIN],
	anfra: ['The AQL <code>filters { }</code> block accepts <code>and</code> / <code>or</code> and brackets', '<code>executedAql</code> shows the exact condition that ran'],
	prompt: 'Add a condition builder with up to two groups joined by OR, each group ANDing country, category and status picks. Rebuild the breakdown query from picked option values only, never free text, and show the condition in words above the table.',
	generic: 'Let readers combine filter groups with OR, by declaring a new query per change built only from picked option values, and show the condition in plain words.',
},
{
	id: 'aggregate-filter', prim: 'pred', also: ['param'], status: 'works', title: 'Metric filter',
	one: 'Filter on a total, like customers who spent more than $12k.',
	does: 'Drag the slider to <b>$12k</b>. The customer list shrinks from 200 rows to the 16 who spent more than that.',
	why: 'A condition on a total is a different kind of filter from a condition on a row. The reader shouldn\'t have to know that.',
	viz: 'Customer leaderboard with a threshold slider; rows below the line fade out.',
	trailer: [
		{ cap: '200 customers, sorted by revenue', chips: [chip('min', 'Revenue over: —')], viz: { kind: 'bars', title: 'Customer revenue', items: rec('02-having').slice(0, 9).map((r) => ({ k: r[0], v: +r[2], t: k$(+r[2]) })) } },
		{ cap: 'Revenue over $12k → 16 customers left', at: 'c:min', chips: [chip('min', 'Revenue over: $12k', 'on')], viz: { kind: 'bars', title: 'Customer revenue', note: '16 rows', items: rec('02-having').slice(0, 9).map((r) => ({ k: r[0], v: +r[2], t: k$(+r[2]) })) } },
	],
	aqlRef: '02-having',
	aqlNote: 'Mapping a control onto the dataset metric <code>revenue</code> becomes a <code>having</code> condition. A <b>query-local</b> metric was rejected ("unknown field: expected a dataset field as model.field or a dataset metric"), so <code>aov</code> is now a Dataset metric: run 44 filters customers to AOV over $1,300 the same way.',
	sdk: `const minRevenue = app.createFilter('minRevenue', {
  type: 'number',
  label: 'Revenue over',
});
// dataset metric → having
app.mapControl(minRevenue, customers, { field: 'revenue' });

// or on any field, with an aggregation
app.mapControl(minUnits, customers, {
  field: 'order_items.quantity',
  aggregation: 'sum',
});

slider.oninput = () => {
  minRevenue.setCondition({
    operator: 'greater_than',
    values: [String(slider.value)],
  });
  app.execute();
};`,
	state: 'Analytical: one number condition, applied after aggregation.',
	sql: ['Know to use <code>HAVING</code> rather than <code>WHERE</code>, and repeat the revenue expression inside it', 'Bind the number safely'],
	anfra: ['The same <code>mapControl</code> call works. Point it at a metric, and anfra puts the condition in <code>having</code>', 'Number values are strings, so no digits are lost'],
	prompt: 'Show customers ranked by revenue, with a "Revenue over" slider mapped to the revenue metric so it filters after aggregation. Show how many customers are left.',
	generic: 'Add a threshold slider mapped onto a dataset metric (or a field with an aggregation) so it filters totals, not rows; promote any query-local metric into the Dataset first.',
},
{
	id: 'range-filter', prim: 'pred', also: ['map'], status: 'works', title: 'Range filter', thumb: 0,
	one: 'Drag a slider to keep orders between two values, or above or below one.',
	does: 'A two-handled slider keeps orders worth <b>$500 to $2,000</b>: 589 orders and $622,557. Switching to <b>one handle, over $2,000</b> leaves 195 orders, $388k of them Services. Two handles from $2,000 to the top find 205: <code>between</code> keeps the 10 orders of exactly $2,000, and <code>&gt;</code> leaves them out.',
	why: 'Readers think in ranges: big orders, small baskets, the middle band. A slider shows the range at a glance and is quick to adjust.',
	viz: 'A slider with one or two handles over an order-value track, an orders KPI and revenue by category.',
	trailer: (() => {
		const r = (cap, o, vals, at) => ({ cap, at, chips: [chip('m', o.one ? 'One handle: ' + (o.one === 'min' ? 'over' : 'under') : 'Two handles', o.one ? 'on' : '')], viz: { kind: 'range', title: o.label, min: 0, max: 5500, minLabel: '$0', maxLabel: '$5,500', ...o, items: CATS.map((c) => ({ k: c, v: vals[c], t: k$(vals[c]) })).sort((x, y) => y.v - x.v), barsMax: 420000 } });
		return [
			r('Two handles: $500 to $2,000 → 589 orders', { lo: 500, hi: 2000, label: 'Order value $500 – $2,000' }, { Software: 342832, Services: 190000, Hardware: 85551.1, Parts: 4173.85 }),
			r('Drag both handles: between 2000 and 5500 → 205 orders', { lo: 2000, hi: 5500, label: 'Order value $2,000 – $5,500' }, { Software: 115786, Services: 408000, Hardware: 20035.09, Parts: 1214.85 }),
			r('One handle, over $2,000: > 2000 → 195 orders', { lo: 2000, hi: 5500, one: 'min', label: 'Order value over $2,000' }, { Software: 115786, Services: 388000, Hardware: 20035.09, Parts: 1214.85 }, 'c:m'),
			r('One handle, under $2,000: < 2000 → 1,295 orders', { lo: 0, hi: 2000, one: 'max', label: 'Order value under $2,000' }, { Software: 381608, Services: 170000, Hardware: 173964.51, Parts: 12444.5 }, 'c:m'),
		];
	})(),
	aqlRef: null, aqlWhy: 'the slider sets a condition on orders.order_value, a Dataset dimension',
	aqlInline: `explore { dimensions { category_name: products.category } measures { total_revenue: revenue } filters { orders.order_value between 500 and 2000 } sorts { total_revenue desc } }`,
	aqlNote: 'The SDK\'s number operators are <code>between</code>, <code>greater_than</code> and <code>less_than</code>. <code>between</code> compiles to <code>&gt;=</code> and <code>&lt;=</code>, so it keeps both ends; one handle compiles to <code>&gt;</code> or <code>&lt;</code> and leaves its end out. There is no SDK operator for "at least".',
	sdk: `const value = app.createFilter('orderValue', {
  dataset: 'ecommerce',
  field: 'orders.order_value',
});
app.mapControl(value, byCategory, { field: 'orders.order_value' });
// two handles, or one: over or under
const condition = {
  two: { operator: 'between', values: [lo, hi] },
  min: { operator: 'greater_than', values: [lo] },
  max: { operator: 'less_than', values: [hi] },
}[mode];
// values are strings, and the drag is debounced
value.setCondition(condition);
app.execute();`,
	state: 'Predicate: one number condition on a field. Which handles show, and where they sit, is renderer state.',
	sql: ['Compute each order\'s value in a subquery, join it back, and write <code>BETWEEN</code>, <code>&gt;</code> or <code>&lt;</code> for each mode', 'Rebuild the WHERE clause on every drag'],
	anfra: ['<code>orders.order_value</code> is declared once in the Dataset; the slider only sets the operator and values'],
	prompt: 'Add an order-value range slider with two handles, or one handle for over or under, with number inputs for exact values; filter an orders KPI and revenue by category.',
	generic: 'Map a number filter to the charts; two handles set between, one handle sets greater_than or less_than; debounce the drag and send values as strings.',
},
{
	id: 'text-search', prim: 'pred', status: 'works', title: 'Text filter',
	one: 'Type part of a name to find matching rows, ignoring upper and lower case.',
	does: 'The reader types <b>customer 1</b> into a search box. The completed-orders table keeps the matching names, now sorted by order count.',
	why: 'A search box is often the quickest way to find one customer or one product.',
	viz: 'Search box above a customer table; matching rows stay, others leave.',
	trailer: [
		{ cap: 'All customers with completed orders', chips: [chip('q', '🔍 Search customers…')], viz: { kind: 'table', title: 'Customers', head: ['Customer', 'Country', 'Revenue', 'Orders'], rows: rec('02-having').slice(0, 6).map((r) => ({ k: r[0], c: [r[0], r[1], k$(+r[2]), r[3]] })) } },
		{ cap: 'Type "customer 1" → contains, case-insensitive', at: 'c:q', chips: [chip('q', '🔍 customer 1', 'on')], viz: { kind: 'table', title: 'Customers', animateNew: true, head: ['Customer', 'Country', 'Revenue', 'Orders ▼'], rows: rec('34-search').slice(0, 6).map((r) => ({ k: r[0], c: [r[0], r[1], k$(+r[2]), r[3]] })) } },
	],
	aqlRef: '34-search',
	sdk: `const name = app.createFilter('name', {
  dataset: 'ecommerce',
  field: 'customers.name',
});
app.mapControl(name, table, { field: 'customers.name' });
input.oninput = debounce(() => {
  name.setCondition({
    operator: 'contains',
    values: input.value ? [input.value] : [],
  });
  table.setSort([{ field: 'num_orders', direction: 'desc' }]);
  app.execute();
}, 250);`,
	state: 'Analytical: a contains condition and a sort. Runtime: the debounce and the in-flight abort.',
	sql: ['Escape <code>%</code> and <code>_</code>, choose <code>ILIKE</code> or <code>LOWER()</code>, and bind the value', 'Cancel stale requests yourself'],
	anfra: ['<code>contains</code> is case-insensitive', 'An empty value list sends nothing, so the box clears itself'],
	prompt: 'Add a search box that filters the customer table by name (contains, case-insensitive), debounced, and sorts the results by order count.',
	generic: 'Add a debounced search box mapped with the contains operator; an empty box sends no condition.',
},
// ===== Interaction mappings =====
{
	id: 'one-control-many', prim: 'map', also: ['pred'], status: 'works', title: 'Filter mapping',
	one: 'Choose which charts a filter changes, so a benchmark chart can stay unfiltered.',
	does: 'The reader picks <b>Japan</b>. The KPI and the trend switch to Japan. The "All countries" benchmark doesn\'t move, because it isn\'t mapped.',
	why: 'A benchmark that follows every filter stops being a benchmark. Each mapping is declared, so nothing is wired by accident.',
	viz: 'KPI tile + trend that follow the filter, next to a benchmark panel with a "not mapped" tag.',
	trailer: [
		{ cap: 'Three panels, one Country filter', chips: [chip('country', 'Country: All')], viz: { kind: 'split', cols: '1.4fr 1fr', a: trend(TOTAL, { title: 'Revenue · follows Country' }), b: ctryBars({ title: 'Benchmark · not mapped', rowH: 22 }) } },
		{ cap: 'Country → Japan: the mapped panel follows', at: 'c:country', chips: [chip('country', 'Country: Japan', 'on')], viz: { kind: 'split', cols: '1.4fr 1fr', a: trend(M.map((d) => CM.Japan[d]), { title: 'Revenue · follows Country', f: (i) => ({ g: TOTAL[i] }), max: Math.max(...TOTAL) * 1.08 }), b: ctryBars({ title: 'Benchmark · not mapped', rowH: 22, f: (c) => ({ cls: c.k === 'Japan' ? 'hl' : '' }) }) } },
	],
	aqlRef: null, aqlWhy: 'uses the trend query from "Field filter" and the country query from "Percent of total"',
	aqlInline: `// trend: mapped
explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }
// benchmark: same Dataset, deliberately not mapped
explore { dimensions { country: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }`,
	sdk: `for (const q of [kpi, trend])
  app.mapControl(country, q, { field: 'customers.country' });
// benchmark: no mapping, so the filter never reaches it
// the full wiring, inspectable
console.log(app.mappings.map((e) => e.id));`,
	state: 'Interaction mapping: edges from a control to queries. <code>app.mappings</code> lists every edge.',
	sql: ['Remember which queries receive which WHERE clauses, often in scattered code'],
	anfra: ['Every edge is declared, and there is no "filter everything" shortcut', 'The Inspect panel (<code>_lib/inspector.js</code>) draws the graph'],
	prompt: 'Put a KPI, a monthly trend and an "all countries" benchmark on one page. Map the Country filter to the KPI and trend only, and label the benchmark "not filtered".',
	generic: 'Map each control explicitly to the queries it should affect, leave benchmark panels unmapped and label them as such.',
},
{
	id: 'cascading-options', prim: 'map', also: ['pred'], status: 'app', title: 'Parent-child filter',
	one: 'Picking a category limits the product list to products in that category.',
	does: 'The reader picks <b>Category: Hardware</b>, and the product picker shrinks from 8 options to 3. A product that no longer fits is dropped from the selection.',
	why: 'A picker that offers impossible combinations leads to empty charts.',
	viz: 'Two dropdowns side by side; the second one\'s list animates down to the matching items.',
	trailer: [
		{ cap: 'Product picker lists all 8 products', chips: [chip('cat', 'Category: All'), chip('prod', 'Product ▾')], viz: { kind: 'note', title: 'Product options', items: ['Analytics Pro', 'Dashboard Kit', 'Gadget', 'Gizmo', 'Support Plan', 'Widget', 'Flange', 'Sprocket'].map((p) => ({ k: p, html: p })) } },
		{ cap: 'Category → Hardware: options query re-runs', at: 'c:cat', chips: [chip('cat', 'Category: Hardware', 'on'), chip('prod', 'Product ▾')], viz: { kind: 'note', title: 'Product options', note: 'from the options query', items: rec('04-cascade').map((r) => ({ k: r[0], cls: 'item on', html: r[0] })) } },
	],
	aqlRef: '04-cascade',
	aqlNote: '<code>loadOptions()</code> takes no other conditions, because the suggestions request carries only dataset, model, field and search text. So the dependent list comes from a small query mapped to the parent control.',
	sdk: `const category = app.createFilter('category', {
  dataset: 'ecommerce',
  field: 'products.category',
});
const product = app.createFilter('product', {
  dataset: 'ecommerce',
  field: 'products.name',
});
const productOptions = app.createQuery('productOptions', {
  dataset: 'ecommerce',
  aql: OPTIONS_AQL,
});
app.mapControl(category, productOptions, {
  field: 'products.category',
});
for (const q of [trend, table]) {
  app.mapControl(category, q, { field: 'products.category' });
  app.mapControl(product, q, { field: 'products.name' });
}
productOptions.subscribe(() => {
  const ok = new Set(
    productOptions.result?.rows.map((r) => r.product),
  );
  const keep =
    product.condition.values?.filter((v) => ok.has(v)) ?? [];
  if (keep.length !== (product.condition.values?.length ?? 0))
    product.setCondition({ operator: 'is', values: keep });
});`,
	limits: 'Works with app code. A proposed <code>dependsOn</code> option on <code>createFilter</code> would replace the options query.',
	sql: ['Write a second query for the options that repeats the parent\'s WHERE clause', 'Clear any child value the parent no longer allows'],
	anfra: ['The options query is a three-line <code>explore</code> that uses the same mapping', 'The mapping is explicit, so the cascade shows in the Inspect panel'],
	prompt: 'Add Category and Product pickers where the product list only offers products in the chosen categories. Use a small options query mapped to the category control, and drop product picks that no longer fit.',
	generic: 'Feed a child picker from a small dimension-only options query mapped to the parent control, and drop child values that no longer fit.',
},
{
	id: 'apply-button', prim: 'map', also: ['snap'], status: 'works', title: 'Apply button',
	one: 'Change several filters, then press Apply to update every chart at once.',
	does: 'The reader changes country, status and date. Nothing runs until they press <b>Apply (3)</b>, and then every query runs once.',
	why: 'On a slow warehouse, every click shouldn\'t start a query.',
	viz: 'Filter chips turn dotted while unapplied; an Apply button counts changes.',
	trailer: [
		{ cap: 'Edits are pending: nothing runs yet', chips: [chip('country', 'Country: Japan', 'prop'), chip('status', 'Status: Completed', 'prop'), chip('apply', 'Apply (2)', 'btn')], viz: trend(TOTAL, { note: 'showing the applied state' }) },
		{ cap: 'app.hasChanges → Apply runs everything once', at: 'c:apply', chips: [chip('country', 'Country: Japan', 'on'), chip('status', 'Status: Completed', 'on'), chip('apply', 'Applied ✓', 'btn')], viz: trend(M.map((d) => CM.Japan[d] * 0.62), { f: (i) => ({ g: TOTAL[i] }), max: Math.max(...TOTAL) * 1.08 }) },
	],
	aqlRef: null, aqlWhy: 'any query works; this card is about when queries run',
	aqlInline: `// unchanged: the trend query from "Field filter"
explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }`,
	sdk: `app.subscribe(() => {
  const n = Object.values(app.controls).filter(
    (c) => c.isDirty,
  ).length;
  applyBtn.disabled = !app.hasChanges;
  applyBtn.textContent = n ? \`Apply (\${n})\` : 'Applied';
});
// commits pending → applied
applyBtn.onclick = () => app.execute();`,
	state: 'Analytical: pending conditions (<code>condition</code>) and applied ones (<code>appliedCondition</code>). Runtime: <code>hasChanges</code>.',
	sql: ['Keep two copies of the state, pending and applied, and compare them yourself'],
	anfra: ['Pending and applied state are built in: <code>condition</code>, <code>appliedCondition</code>, <code>isDirty</code> and <code>hasChanges</code>'],
	prompt: 'Make the filters on this page apply only when the reader presses Apply. Show how many changes are pending, and show the chips as dotted until they are applied.',
	generic: 'Defer execution behind an Apply button driven by app.hasChanges and each control\'s isDirty.',
	aqlNote: 'Trailer frame 2 approximates Japan\'s completed revenue at 62% of all of Japan\'s revenue.',
},
{
	id: 'selection-to-filter', prim: 'map', also: ['sel', 'pred'], status: 'app', title: 'Cross filter',
	one: 'Turn a clicked selection into a filter chip, so your next click narrows further.',
	does: 'The reader clicks <b>Vietnam</b> on the bar chart, then presses <b>📌 Pin</b>. Vietnam turns into a filter chip, and the next click (Software) starts a new selection inside Vietnam.',
	why: 'An app holds one selection at a time. Pinning lets the reader stack questions anyway.',
	viz: 'Country bars + category bars; a pin icon appears on the selected bar.',
	trailer: [
		{ cap: 'Click Vietnam: a cross-filter selection', at: 'Vietnam', chips: [chip('sel', 'Selected: Vietnam', 'sel'), chip('pin', '📌 Pin', 'btn')], viz: { kind: 'split', a: ctryBars({ f: (c) => ({ cls: c.k === 'Vietnam' ? 'hl' : 'dim' }) }), b: catBars(CAT_VN, { title: 'Category (Vietnam)' }) } },
		{ cap: 'Pin → the selection becomes a filter control', at: 'c:pin', chips: [chip('country', 'Country: Vietnam', 'on')], viz: { kind: 'split', a: ctryBars({ f: (c) => ({ cls: c.k === 'Vietnam' ? '' : 'dim' }) }), b: catBars(CAT_VN, { title: 'Category (Vietnam)' }) } },
		{ cap: 'Next click starts a new selection inside it', at: 'Software', chips: [chip('country', 'Country: Vietnam', 'on'), chip('sel', 'Selected: Software', 'sel')], viz: { kind: 'split', a: ctryBars({ f: (c) => ({ cls: c.k === 'Vietnam' ? '' : 'dim' }) }), b: catBars(CAT_VN, { title: 'Category (Vietnam)', f: (c) => ({ cls: c === 'Software' ? 'hl' : 'dim' }) }) } },
	],
	aqlRef: '39-highlight', aqlNote: 'The input shows how the SDK sends a selection: as a <code>conditions[].expr</code>. After pinning, the same value becomes a <code>filters[]</code> entry.',
	sdk: `pinBtn.onclick = () => {
  // { source, rows, conditions }
  const sel = app.selection;
  for (const c of sel.conditions) {
    // e.g. customers.country → country filter
    const f = filtersByField[c.field];
    f.setCondition({ operator: 'is', values: c.values });
  }
  app.clearSelection();
  app.execute();
};`,
	state: 'Moves state from a selection, which can be replaced, to a control, which persists.',
	sql: ['Track the click state and the filter state in different places, then merge them into SQL'],
	anfra: ['<code>app.selection.conditions</code> already holds the field and values, so pinning means copying them into a filter'],
	prompt: 'Let readers pin the current chart selection into the matching filter control, so they can drill step by step (country, then category, then product) while each step stays visible as a chip.',
	generic: 'Add a Pin action that copies app.selection.conditions into matching filter controls and clears the selection.',
},
{
	id: 'zoom-pan', prim: 'map', also: ['time'], status: 'app', title: 'Zoom / pan',
	one: 'Scrolling zooms the picture, and double-clicking reloads that month week by week.',
	does: 'A scroll zooms the monthly chart without a new query. A double-click on September changes the question: the range becomes September and the grain becomes week, so the query runs again.',
	why: 'Readers expect zoom to show more detail, but zooming pixels can\'t show detail that was never loaded.',
	viz: 'Monthly columns with a zoom window, then the same panel redrawn as weekly bars.',
	trailer: [
		{ cap: 'Scroll = renderer zoom, no query', chips: [chip('grain', 'Grain: month'), chip('mode', 'Zoom: visual')], viz: trend(TOTAL, { brush: [10, 15] }) },
		{ cap: 'Double-click Sep 26 = new range + week grain', at: M[15], chips: [chip('grain', 'Grain: week', 'on'), chip('range', 'Sep 2026', 'on')], viz: { kind: 'cols', title: 'Revenue by week (Sep 2026)', items: rec('08-drill').map((r, i) => ({ k: r[0], l: 'w/c ' + r[0].slice(5), v: +r[1], t: k$(+r[1]), cls: i === 0 || i === 3 ? 'partial' : '' })) } },
	],
	aqlRef: '08-drill',
	aqlNote: 'Week buckets start on Monday: the first one, which starts on 31 Aug, holds only 1–6 Sep. The hatched bars mark partial weeks.',
	sdk: `chart.on('datazoom', () => {
  /* renderer only: no execute() */
});
chart.on('dblclick', (p) => {
  const month = trend.result.rows[p.dataIndex].period;
  range.setCondition({
    operator: 'between',
    values: [month, endOfMonth(month)],
  });
  grain.setGrain('week');
  app.execute();
});`,
	state: 'Renderer: the zoom window. Analytical: the range and the grain.',
	sql: ['Re-write <code>DATE_TRUNC</code> and the range in SQL for the new grain'],
	anfra: ['<code>createDateDrill</code> re-buckets every dimension built on the field, and the row key (<code>period</code>) stays the same'],
	prompt: 'On the monthly revenue chart, make mouse-wheel zoom purely visual, and make a double-click on a month re-query that month at weekly grain. Mark partial weeks.',
	generic: 'Keep wheel zoom renderer-only; make an explicit gesture commit a date range and a finer grain (date drill) that re-queries.',
},
{
	id: 'legend-toggle', prim: 'map', also: ['shape'], status: 'works', title: 'Legend visibility',
	one: 'Click a legend item to hide its line, or Alt-click to show only that line.',
	does: 'Clicking <b>Services</b> in the legend hides its line, and the y-axis rescales without a query. Alt-clicking <b>Parts</b> filters the page to Parts, and every panel re-queries.',
	why: 'The same gesture can mean "hide this" or "only this". The app should say which one it does.',
	viz: 'Four category lines with a clickable legend.',
	trailer: [
		{ cap: 'Four categories', chips: [chip('cat', 'Category: All')], viz: { kind: 'lines', title: 'Revenue by category', x: ['Jun 25', 'Dec 25', 'Jun 26', 'Sep 26'], series: CATS.map((c) => ({ name: c, vals: M.map((d) => CATM[c][d]) })) } },
		{ cap: 'Click Services → hidden (renderer only)', at: 'Services', chips: [chip('cat', 'Category: All')], viz: { kind: 'lines', title: 'Revenue by category', x: ['Jun 25', 'Dec 25', 'Jun 26', 'Sep 26'], series: CATS.map((c) => ({ name: c, vals: M.map((d) => CATM[c][d]), off: c === 'Services' })) } },
		{ cap: 'Alt-click Parts → filter (re-queries)', at: 'Parts', chips: [chip('cat', 'Category: Parts', 'on')], viz: { kind: 'lines', title: 'Revenue by category', x: ['Jun 25', 'Dec 25', 'Jun 26', 'Sep 26'], series: CATS.map((c) => ({ name: c, vals: M.map((d) => CATM[c][d]), off: c !== 'Parts' })) } },
	],
	aqlRef: '40-cat-month',
	sdk: `chart.on('legendselectchanged', (e) => {
  /* hide: renderer only */
});
legendEl.addEventListener('click', (e) => {
  if (!e.altKey) return;
  category.setCondition({
    operator: 'is',
    values: [e.target.dataset.series],
  });
  app.execute();
});`,
	state: 'Renderer: which series are hidden. Analytical: the category filter.',
	sql: ['None for hiding. For "only this", a new WHERE clause in every query'],
	anfra: ['Hiding stays in the renderer. Filtering is one <code>setCondition</code> call'],
	prompt: 'On a revenue-by-category line chart, make a legend click hide or show a line without re-querying, and an Alt-click filter the whole page to that category. Explain the difference in a tooltip.',
	generic: 'Distinguish legend hide (renderer state, no query) from legend filter (a control condition that re-queries).',
},
// ===== Selections =====
{
	id: 'custom-menu', prim: 'map', also: ['drill', 'pred'], status: 'app', title: 'Custom right-click menu',
	one: 'Right-click a data point to open a menu of actions, and choose which actions it offers.',
	does: 'Right-clicking <b>Germany</b> opens a menu at the pointer: <b>Keep only</b>, <b>Exclude</b>, <b>Drill to customers</b> and <b>View orders</b>. The app author turns items on or off and adds their own, such as <b>Copy as AQL filter</b>. Exclude Germany and the chart drops to five countries; Drill to customers lists Customer 92 first, at $13,118.',
	why: 'One click target can do many things. A menu says what each click will do, and the author keeps it to the actions that make sense for that chart.',
	viz: 'Country bars with a right-click menu at the pointer, and a strip of menu items the author can toggle.',
	trailer: (() => {
		const menu = (on, own) => [chip('keep', 'Keep only', on.includes('keep') ? '' : 'off'), chip('exclude', 'Exclude', on.includes('exclude') ? '' : 'off'), chip('drill', 'Drill to customers', on.includes('drill') ? '' : 'off'), chip('orders', 'View orders', on.includes('orders') ? '' : 'off')].filter((c) => c.c !== 'off').concat(own ? [chip('copy', '+ Copy as AQL filter', 'prop')] : []);
		const all = ['keep', 'exclude', 'drill', 'orders'];
		return [
			{ cap: 'Right-click Germany: its menu opens', at: 'Germany', chips: menu(all), viz: ctryBars({ f: (c) => ({ cls: c.k === 'Germany' ? 'hl' : '' }) }) },
			{ cap: 'Exclude → customers.country is not Germany', at: 'c:exclude', chips: menu(all), viz: { ...ctryBars(), items: CTRY.filter((c) => c.k !== 'Germany').map((c) => ({ k: c.k, v: c.v, t: k$(c.v) })) } },
			{ cap: 'The author hides Exclude and adds their own item', at: 'c:copy', chips: menu(['keep', 'drill', 'orders'], true), viz: ctryBars({ f: (c) => ({ cls: c.k === 'Germany' ? 'hl' : '' }) }) },
			{ cap: 'Drill to customers: the top customers in Germany', at: 'c:drill', chips: menu(['keep', 'drill', 'orders'], true), viz: { kind: 'bars', title: 'Top customers in Germany', items: [['Customer 92', 13118], ['Customer 42', 12369], ['Customer 61', 12330], ['Customer 172', 11029], ['Customer 77', 10860]].map(([k, v]) => ({ k, v, t: k$(v) })) } },
		];
	})(),
	aqlRef: null, aqlWhy: 'each menu item is a filter on the clicked value, sent to the chart or to a detail query',
	aqlInline: `explore { dimensions { customer_name: customers.name } measures { total_revenue: revenue, num_orders: order_count } filters { customers.country is 'Germany' } sorts { total_revenue desc } }`,
	sdk: `// the author's menu: a label and what it does with the row
const MENU = [
  { label: 'Keep only', run: (row) =>
      country.setCondition({ operator: 'is',
        values: [row.country_name] }) },
  { label: 'Exclude', run: (row) =>
      country.setCondition({ operator: 'is_not',
        values: [row.country_name] }) },
  { label: 'Drill to customers', run: (row) =>
      point.setCondition({ operator: 'is',
        values: [row.country_name] }) },
  // the author's own item
  { label: 'Copy as AQL filter', run: (row) =>
      navigator.clipboard.writeText(
        "customers.country is '" + row.country_name + "'") },
];
bar.oncontextmenu = (e) => {
  e.preventDefault(); // instead of the browser's menu
  openMenu(e.clientX, e.clientY, row, MENU.filter(isOn));
};
// each item ends the same way
const pick = (item, row) => { item.run(row); app.execute(); };`,
	state: 'Interaction mapping: which items the menu offers is renderer state. What each item does is a filter condition on the clicked value, so it shows up in the AQL.',
	limits: 'Works with app code: the app draws the menu and maps each item to an SDK call. A proposed <code>app.createMenu(query, items)</code> would offer the standard items, built from the Dataset\'s drill paths and fields.',
	sql: ['Write a different WHERE clause for each menu item, and a second query for each drill target', 'Keep the excluded values in your own list and rebuild <code>NOT IN (…)</code> each time'],
	anfra: ['Each item is <code>setCondition</code> on a filter that is already mapped to the right queries'],
	prompt: 'Add a right-click menu on the country bars, with Keep only, Exclude, Drill to customers and View orders, plus a settings strip to turn items on or off and a custom Copy as AQL filter item.',
	generic: 'On right-click (and the Menu key), open a small menu at the pointer instead of the browser\'s; each item sets a filter condition on the clicked value (on the chart or on a detail query); let the author configure the item list.',
},
{
	id: 'single-select', prim: 'sel', also: ['map'], status: 'works', title: 'Cross-filtering',
	one: 'Click one or more bars, a country on the map or heatmap cells, and other charts show only those.',
	does: 'The reader clicks <b>Singapore</b>. The other bars dim, and the monthly trend re-queries for Singapore. Each further click adds or removes a country: with <b>Germany + Japan</b> picked, the trend shows their combined revenue. A map works the same way: clicking <b>Australia</b> re-queries the category mix for Australia. A heatmap cell selects a pair: picking <b>(Vietnam, Jan)</b> and <b>(Japan, Mar)</b> shows <b>$21.1k</b> from exactly those two country-month pairs, not all four combinations.',
	why: 'Clicking a chart is the most natural question a reader can ask. A cell click means "this cell", so the filter keeps each pair.',
	viz: 'Country bars (source) beside a monthly trend (target), country tiles laid out like a map, and a country × month heatmap beside category bars.',
	trailer: [
		{ cap: 'Source: countries. Target: trend', viz: { kind: 'split', cols: '1fr 1.3fr', a: ctryBars(), b: trend(TOTAL, { title: 'Monthly revenue' }) } },
		{ cap: 'Click Singapore', at: 'Singapore', chips: [chip('sel', 'Selected: Singapore', 'sel')], viz: { kind: 'split', cols: '1fr 1.3fr', a: ctryBars({ f: (c) => ({ cls: c.k === 'Singapore' ? 'hl' : 'dim' }) }), b: trend(M.map((d) => CM.Singapore[d]), { title: 'Monthly revenue · Singapore', f: (i) => ({ g: TOTAL[i] }), max: Math.max(...TOTAL) * 1.08 }) } },
		{ cap: 'Click again → clearSelection()', at: 'Singapore', viz: { kind: 'split', cols: '1fr 1.3fr', a: ctryBars(), b: trend(TOTAL, { title: 'Monthly revenue' }) } },
		{ cap: 'Same pattern on a map: click Australia', at: 'Australia', chips: [chip('sel', 'Selected: Australia', 'sel')], viz: { kind: 'split', cols: '1.2fr 1fr', a: { kind: 'map', title: 'Revenue by country', items: CTRY.map((c) => ({ k: c.k, v: c.v, t: k$(c.v), cls: c.k === 'Australia' ? 'sel' : 'dim' })) }, b: catBars({ Services: 143500, Software: 125428, Hardware: 41112.53, Parts: 3356.95 }, { title: 'Category mix (Australia)', f: (c) => ({ g: CAT_TOTAL[c] }) }) } },
		// several bars: each click adds or removes a country
		{ cap: 'Click Germany', at: 'Germany', chips: [chip('sel', 'Selected: Germany', 'sel')], viz: { kind: 'split', cols: '1fr 1.3fr', a: ctryBars({ f: (c) => ({ cls: c.k === 'Germany' ? 'hl' : 'dim' }) }), b: trend(M.map((d) => CM.Germany[d]), { title: 'Selected revenue', max: 65000 }) } },
		{ cap: '…and Japan: rows are ORed', at: 'Japan', chips: [chip('sel', 'Selected: Germany, Japan', 'sel')], viz: { kind: 'split', cols: '1fr 1.3fr', a: ctryBars({ f: (c) => ({ cls: ['Germany', 'Japan'].includes(c.k) ? 'hl' : 'dim' }) }), b: trend(sumCountries(['Germany', 'Japan']), { title: 'Selected revenue', max: 65000 }) } },
		// a heatmap cell is a selection too: a country-month pair
		...(() => {
			const cols = M.slice(7, 13);
			const rows = ['Australia', 'Germany', 'Japan', 'Singapore', 'United States', 'Vietnam'];
			const cells = rows.map((r) => cols.map((c) => CM[r][c]));
			const heat = (sel, dim) => ({ kind: 'heat', title: 'Revenue: country × month', rw: 62, rows, cols: cols.map(ML), cells, sel, dimOthers: dim });
			const tup = Object.fromEntries(rec('05-tuple').map((r) => [r[0], +r[1]]));
			return [
				{ cap: 'Country × month', viz: { kind: 'split', cols: '1.5fr 1fr', a: heat([]), b: catBars(CAT_TOTAL, { title: 'Category' }) } },
				{ cap: 'Pick (Vietnam, Jan 26)', at: 'Vietnam|Jan 26', chips: [chip('sel', '(Vietnam, Jan)', 'sel')], viz: { kind: 'split', cols: '1.5fr 1fr', a: heat(['Vietnam|Jan 26']), b: catBars(CAT_TOTAL, { title: 'Category' }) } },
				{ cap: '+ (Japan, Mar 26) → exact OR of pairs', at: 'Japan|Mar 26', chips: [chip('sel', '(Vietnam, Jan) OR (Japan, Mar)', 'sel')], viz: { kind: 'split', cols: '1.5fr 1fr', a: heat(['Vietnam|Jan 26', 'Japan|Mar 26'], true), b: catBars(tup, { title: 'Category · 2 cells' }) } },
			];
		})(),
	],
	aqlRef: null, aqlWhy: 'the source is the "Percent of total" query and the target is the trend query',
	aqlInline: `// source
explore { dimensions { country: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }
// target
explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }`,
	sdk: `app.mapCrossFilter(byCountry, trend);
// each click adds or removes a row; picks OR together
chart.on('click', (p) => {
  const row = byCountry.result.rows[p.dataIndex];
  const s = byCountry.selectedRows;
  byCountry.select(
    s.includes(row) ? s.filter((r) => r !== row) : [...s, row],
  );
  app.execute();
});
// highlight: byCountry.selectedRows (the source is never filtered
// by its own selection)

// a map is just another renderer for the same source query
map.on('click', (p) => {
  byCountry.select([
    byCountry.result.rows.find((r) => r.country === p.name),
  ]);
  app.execute();
});

// heatmap cells: select the picked rows; anfra filters to
// exactly those country-month pairs (the month comes from a
// date drill, so each cell is a month range)
app.mapCrossFilter(heat, byCategory);
heat.select([vietnamJan, japanMar]);
app.execute();`,
	state: 'Analytical: <code>app.selection</code>. Renderer: the dimmed bars.',
	sql: ['Read the clicked value, add <code>WHERE country = ?</code> to the other queries, and leave the clicked chart alone', 'Keep a list of clicked values and turn it into <code>IN (…)</code>', 'For heatmap cells, write one bracket per picked cell, <code>(country = ? AND month bounds) OR …</code>, never <code>country IN (…) AND month IN (…)</code>, which adds the combinations nobody picked'],
	anfra: ['One edge and one <code>select()</code> call. The SDK builds the condition from the row', 'The source never filters itself', 'The same call works for bars, maps and tables'],
	prompt: 'Make clicking a country bar cross-filter the monthly trend next to it; clicking again clears it. Dim unselected bars using selectedRows. Also show the countries as map tiles where a click does the same.',
	generic: 'Declare mapCrossFilter(source, target) and call source.select([row]) on click; toggle off on a second click.',
},
{
	id: 'range-brush', prim: 'sel', also: ['time'], status: 'works', title: 'Range brushing',
	one: 'Drag across months on a chart, and other charts show only that period.',
	does: 'The reader drags a brush across <b>Feb–Apr 2026</b>. The months inside it become the selection. Revenue in the range is $225k.',
	why: 'Dragging across a period is quicker than typing two dates.',
	viz: 'Monthly columns with a translucent brush, and a KPI that follows.',
	trailer: [
		{ cap: 'Drag starts at Feb 26', at: M[8], click: false, viz: { kind: 'split', cols: '1.6fr 1fr', a: trend(TOTAL, { brush: [8, 8] }), b: { kind: 'kpis', title: 'In range', cols: 1, items: [{ k: 'Revenue', v: 86602 }, { k: 'Orders', v: 87, fmt: 'int' }] } } },
		{ cap: '…to Apr 26: rows in the brush become the selection', at: M[10], viz: { kind: 'split', cols: '1.6fr 1fr', a: trend(TOTAL, { brush: [8, 10], f: (i) => ({ cls: i >= 8 && i <= 10 ? 'hl' : 'dim' }) }), b: { kind: 'kpis', title: 'In range', cols: 1, items: [{ k: 'Revenue', v: 225090 }, { k: 'Orders', v: 263, fmt: 'int' }] } } },
	],
	aqlRef: '33-brush',
	aqlNote: 'The input shows the same range as a date filter. A brushed selection becomes date ranges only when the source chart\'s month comes from a date drill; with <code>| month()</code> in the AQL, the SDK matches exact days and the targets fail to compile (seen live on 15 Oct).',
	sdk: `app.mapCrossFilter(trend, kpis);
chart.on('brushEnd', (e) => {
  const [a, b] = e.areas[0].coordRange;
  trend.select(trend.result.rows.slice(a, b + 1));
  app.execute();
});`,
	state: 'Analytical: a selection of contiguous rows.',
	sql: ['Turn pixel positions into dates, round them to the grain, and write <code>BETWEEN</code>'],
	anfra: ['Select the rows under the brush, and the SDK writes the date condition at the applied grain'],
	prompt: 'Add a brush to the monthly revenue chart; brushing selects those months and cross-filters the KPIs and the category chart.',
	generic: 'Translate a brush to the rows it covers and select them; the SDK derives the date condition at the current grain.',
},
{
	id: 'numeric-brush', prim: 'sel', also: ['param'], status: 'app', title: 'Histogram brushing',
	one: 'Drag across a range of order sizes, like $1,000 to $2,000.',
	does: 'The reader brushes the order-value histogram from $1,000 to $2,000. The brush becomes a <code>between</code> filter on <code>orders.order_value</code>, and the category chart shows those 295 orders (between includes both ends, so 10 orders of exactly $2,000 count): $218k of Software, $166k of Services.',
	why: 'Readers often ask about big orders or small baskets.',
	viz: 'Order-value histogram ($250 bins) with a brush, and the category chart it filters.',
	trailer: [
		{ cap: 'Order value histogram', viz: { kind: 'split', cols: '1.4fr 1fr', a: { kind: 'cols', title: 'Orders by value ($250 bins)', items: rec('25b-binwidth').slice(0, 14).map((r) => ({ k: 'b' + r[0], l: '$' + r[0], v: +r[1] })), every: 2 }, b: catBars(CAT_TOTAL, { title: 'Category' }) } },
		{ cap: 'Brush $1,000–$2,000', at: 'b1500', click: false, viz: { kind: 'split', cols: '1.4fr 1fr', a: { kind: 'cols', title: 'Orders by value ($250 bins)', items: rec('25b-binwidth').slice(0, 14).map((r, i) => ({ k: 'b' + r[0], l: '$' + r[0], v: +r[1], cls: i >= 4 && i <= 7 ? 'hl' : 'dim' })), every: 2, brush: [4, 7] }, b: catBars(CAT_TOTAL, { title: 'Category' }) } },
		{ cap: 'Brush → orders.order_value between 1000 and 2000', chips: [chip('v', 'Order value: $1,000 – $2,000', 'on')], viz: { kind: 'split', cols: '1.4fr 1fr', a: { kind: 'cols', title: 'Orders by value ($250 bins)', items: rec('25b-binwidth').slice(0, 14).map((r, i) => ({ k: 'b' + r[0], l: '$' + r[0], v: +r[1], cls: i >= 4 && i <= 7 ? 'hl' : 'dim' })), every: 2, brush: [4, 7] }, b: catBars(Object.fromEntries(rec('43-value-filter').map((r) => [r[0], +r[1]])), { title: 'Category · $1k–$2k orders', f: (c) => ({ g: CAT_TOTAL[c] }) }) } },
	],
	aqlRef: '43-value-filter',
	aqlNote: '<code>orders.order_value</code> is now a Dataset dimension (an order\'s revenue, added to the ecommerce sample for this card), so any query can filter on it. The $250 bins are still declared in the query, and "query-local computed dimensions are skipped when cross-filtering" (AQL.md), so the brush sends a <code>between</code> filter rather than a selection.',
	sdk: `const value = app.createFilter('value', {
  dataset: 'ecommerce',
  field: 'orders.order_value',
});
for (const q of [byCategory, trend])
  app.mapControl(value, q, { field: 'orders.order_value' });
chart.on('brushEnd', (e) => {
  // e.g. 1000, 2000
  const [lo, hi] = binRange(e);
  value.setCondition({
    operator: 'between',
    values: [String(lo), String(hi)],
  });
  app.execute();
});`,
	limits: 'Works with app code: the brush becomes a filter, not a cross-filter selection, because the bins are computed in the query.',
	sql: ['Write the bin expression twice: once to draw the histogram and once in the WHERE clause'],
	anfra: ['<code>order_value</code> lives in the Dataset once, so a brush is one <code>between</code> condition every query understands'],
	prompt: 'Add a histogram of orders.order_value in $250 bins with a brush. Turn the brushed range into a between filter on orders.order_value mapped to the other charts, and show the range as a chip the reader can clear.',
	generic: 'For brushing numeric bins, keep the binned value as a Dataset dimension and turn the brush into a between filter on it.',
},
{
	id: 'cross-highlight', prim: 'sel', also: ['map'], status: 'app', title: 'Cross-highlighting',
	one: 'Hover a country, and other charts keep their totals but highlight its share.',
	does: 'The reader hovers <b>Vietnam</b> (a click keeps it). The category chart keeps the full totals as grey bars and overlays Vietnam\'s part in violet: $91.5k of Services\' $578k.',
	why: 'A filter hides the context. A highlight keeps it, so the reader sees "how much of the whole".',
	viz: 'Category bars with a grey total and a violet overlay for the selection.',
	trailer: [
		{ cap: 'Totals by category', viz: { kind: 'split', cols: '1fr 1.2fr', a: ctryBars(), b: catBars({}, { title: 'Category', f: (c) => ({ g: CAT_TOTAL[c], v: 0, t: k$(CAT_TOTAL[c]) }) }) } },
		{ cap: 'Hover Vietnam → overlay its share, keep the totals', at: 'Vietnam', click: false, chips: [chip('sel', 'Highlight: Vietnam', 'sel')], viz: { kind: 'split', cols: '1fr 1.2fr', a: ctryBars({ f: (c) => ({ cls: c.k === 'Vietnam' ? 'hl' : 'dim' }) }), b: catBars({}, { title: 'Category: Vietnam of total', f: (c) => ({ g: CAT_TOTAL[c], v: 0, o: CAT_VN[c], t: k$(CAT_VN[c]) + ' / ' + k$(CAT_TOTAL[c]) }) }) } },
	],
	aqlRef: '39-highlight',
	sdk: `// two copies of the same AQL: one is a cross-filter target, the
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
// draw catAll as grey bars, catSel on top in the accent colour`,
	limits: 'Works with app code: two queries. A proposed <code>mapCrossFilter(from, to, { mode: \'highlight\' })</code> would return both in one result.',
	sql: ['Run the query twice, or add a <code>CASE WHEN country = ? THEN … END</code> column for the highlight'],
	anfra: ['Same AQL, two declarations, one edge. The highlight is a second query that is mapped'],
	prompt: 'Make hovering a country highlight its share inside the category bars instead of filtering them: grey bars for all countries, an accent overlay for the selection.',
	generic: 'Declare the target query twice—one unmapped (context), one cross-filtered (overlay)—and draw them layered.',
},
{
	id: 'two-selections', prim: 'sel', also: ['map'], status: 'app', title: 'Multiple cross-filters',
	one: 'Keep a selection in two charts at once, like Germany in one and Software in the other.',
	does: 'A plain click on <b>Germany</b> filters the page to Germany. A <b>Ctrl+click</b> (Cmd on Mac) on <b>Software</b> in another chart adds it: the page shows Germany\'s Software, $65,236. A plain click anywhere starts over.',
	why: 'Readers expect each chart to keep its pick, the way spreadsheet slicers do. anfra holds one selection per app, so the app turns the earlier pick into a filter.',
	viz: 'Country bars and category bars; the earlier pick stays highlighted while the new one is added.',
	trailer: (() => {
		const pv = rec('17-pivot').filter((x) => x[0] === 'Germany');
		const deCat = Object.fromEntries(pv.map((x) => [x[1], +x[2]]));
		const swByCountry = { Vietnam: 68234, Japan: 48378, Singapore: 110816, Australia: 125428, 'United States': 79302, Germany: 65236 };
		const ctrySw = { kind: 'bars', title: 'Software revenue by country', items: CTRY.map((c) => ({ k: c.k, v: swByCountry[c.k], g: c.v, t: k$(swByCountry[c.k]), cls: c.k === 'Germany' ? 'hl' : '' })) };
		return [
			{ cap: 'Click Germany: a normal cross-filter', at: 'Germany', chips: [chip('a', 'Selected: Germany', 'sel')], viz: { kind: 'split', a: ctryBars({ f: (c) => ({ cls: c.k === 'Germany' ? 'hl' : 'dim' }) }), b: catBars(deCat, { title: 'Category · Germany' }) } },
			{ cap: 'Ctrl+click Software: Germany becomes a filter, Software the selection', at: 'Software', chips: [chip('p', 'Country: Germany (kept)', 'on'), chip('b', 'Selected: Software', 'sel')], viz: { kind: 'split', a: ctrySw, b: catBars(deCat, { title: 'Category · Germany', f: (c) => ({ cls: c === 'Software' ? 'hl' : 'dim' }) }) } },
			{ cap: 'Everything else shows Germany AND Software', chips: [chip('p', 'Country: Germany (kept)', 'on'), chip('b', 'Selected: Software', 'sel')], viz: { kind: 'kpis', title: 'Revenue', cols: 3, items: [{ k: 'Germany', v: 205890 }, { k: 'Software', v: 497394 }, { k: 'Germany AND Software', v: 65236 }] } },
		];
	})(),
	aqlRef: '55-and-selection',
	aqlNote: 'This is what a third chart receives after the Ctrl+click: the kept pick arrives as an ordinary filter (country is Germany) and the new selection as its condition (category is Software). They are ANDed. Checked live on 15 Oct: click Germany $205,890, Ctrl+click Software $65,236, Ctrl+click Services in the same chart $169,236 (Software OR Services), plain click Japan $118,326.',
	sdk: `// every chart cross-filters the others
for (const [a, b] of [
  [byCountry, byCategory],
  [byCountry, trend],
  [byCategory, byCountry],
  [byCategory, trend],
])
  app.mapCrossFilter(a, b);

// one hidden "kept pick" filter per chart, mapped to every query
// EXCEPT that chart,
// so the chart still shows all its bars and can highlight the kept
// ones
const keep = {
  byCountry: app.createFilter('keepCountry', {
    dataset: 'ecommerce',
    field: 'customers.country',
  }),
  byCategory: app.createFilter('keepCategory', {
    dataset: 'ecommerce',
    field: 'products.category',
  }),
};
for (const q of [byCategory, trend])
  app.mapControl(keep.byCountry, q, { field: 'customers.country' });
for (const q of [byCountry, trend])
  app.mapControl(keep.byCategory, q, {
    field: 'products.category',
  });

function onBarClick(query, row, event) {
  // Ctrl, or Cmd on Mac
  const add = event.ctrlKey || event.metaKey;
  const sel = app.selection;
  // plain click: start over
  if (!add) {
    Object.values(keep).forEach((f) => f.reset());
    query.select([row]);
    // Ctrl+click on another chart: keep the old pick as a filter
  } else if (sel && sel.source !== query.name) {
    keep[sel.source].setCondition({
      operator: 'is',
      values: sel.conditions[0].values,
    });
    query.select([row]);
    // Ctrl+click on the same chart: toggle (OR)
  } else {
    const s = query.selectedRows;
    query.select(
      s.includes(row) ? s.filter((r) => r !== row) : [...s, row],
    );
  }
  app.execute();
}
// highlight kept picks yourself: keep[name].condition.values;
// selectedRows only knows the current selection`,
	state: 'Analytical: one live selection plus one kept-pick filter per chart. Both are ordinary SDK state, so bookmarks and undo work as usual.',
	limits: 'Works with app code. Each chart must break down by one field: a two-field chart (a country × month heatmap) sends its selection as one combined expression, which can\'t be copied into a single filter. An SDK that held named selections itself would remove this bookkeeping (proposed).',
	limitsShort: 'one live selection per app; the app keeps earlier picks as filters',
	sql: ['Keep each chart\'s picks yourself and AND them into every other chart\'s WHERE clause'],
	anfra: ['Each pick is either the one selection or a kept-pick filter; the SDK ANDs them for every query', 'Plain click, Ctrl+click and toggle are about 15 lines of app code'],
	prompt: 'Make the country and category charts cross-filter each other and the trend. A plain click starts a new selection; Ctrl+click (Cmd on Mac) on another chart keeps the earlier pick as a hidden filter and adds the new one, so the page shows both together; Ctrl+click on the same chart toggles bars. Highlight kept picks, and add a Clear all button.',
	generic: 'Combine picks across charts: plain click resets, Ctrl/Cmd+click on another chart copies the current selection into a hidden per-chart filter (mapped to every query but that chart) and selects the new row; Ctrl/Cmd+click on the same chart toggles rows.',
},
{
	id: 'selection-cohort', prim: 'sel', also: ['param'], status: 'works', title: 'Selection cohort',
	one: 'Select some customers and compare what they buy with everyone else.',
	does: 'The reader lassoes customers 1–5 in a table and presses <b>Make cohort</b>. Two bar charts compare the cohort\'s category mix with the rest: 195 other customers.',
	why: 'A "what do these people do differently?" question deserves a comparison, not just a filter.',
	viz: 'Paired bars: cohort vs rest, by category.',
	trailer: [
		{ cap: 'Lasso customers 1–5', chips: [chip('sel', '5 customers selected', 'sel'), chip('mk', 'Make cohort', 'btn')], viz: { kind: 'table', title: 'Customers', head: ['ID', 'Customer', 'Country'], rows: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ k: 'id' + i, c: [String(i), 'Customer ' + i, ''], cls: i <= 5 ? 'hl' : '' })) } },
		{ cap: 'Cohort = id is [1..5]; rest = is_not', at: 'c:mk', chips: [chip('coh', 'Cohort: 5 customers', 'on'), chip('rest', 'Rest: 195', 'on')], viz: catBars(Object.fromEntries(rec('06-cohort-vs-rest').map((r) => [r[0], +r[1]])), { title: 'Rest of customers by category' }) },
	],
	aqlRef: '06-cohort-vs-rest',
	aqlNote: 'IDs travel as strings (<code>"1"</code>, not <code>1</code>). anfra rejected the JS numbers: "send \\"1\\", not 1".',
	sdk: `const inCohort = app.createFilter('inCohort', {
  dataset: 'ecommerce',
  field: 'customers.id',
});
const outCohort = app.createFilter('outCohort', {
  dataset: 'ecommerce',
  field: 'customers.id',
});
app.mapControl(inCohort, cohortMix, { field: 'customers.id' });
app.mapControl(outCohort, restMix, { field: 'customers.id' });
makeBtn.onclick = () => {
  const ids = table.selectedRows.map((r) => r.id); // strings
  inCohort.setCondition({ operator: 'is', values: ids });
  outCohort.setCondition({ operator: 'is_not', values: ids });
  app.execute();
};`,
	state: 'Parameter set: a named list of IDs, used by two controls with opposite operators.',
	sql: ['Build two queries with <code>IN</code> and <code>NOT IN</code>, and handle long ID lists'],
	anfra: ['The same AQL is declared twice, with two controls on <code>customers.id</code> using <code>is</code> and <code>is_not</code>'],
	prompt: 'Let readers select customers in a table and turn them into a cohort, then compare the cohort\'s category mix with everyone else side by side.',
	generic: 'Turn selected IDs into a cohort with two filters on the same field (is / is_not) mapped to twin queries for a side-by-side comparison.',
},
// ===== Time context =====
{
	id: 'date-filter', prim: 'time', status: 'works', title: 'Date filter',
	one: 'Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".',
	does: 'One date chip moves through exact dates (<b>1 Jan – 30 Jun 2026</b>), the phrase <b>last 3 months</b> (Jul–Sep) and <b>last 30 days</b>, which warns that data stops on 23 Sep, so only the days up to then count. Every chart mapped to it redraws. Calendar phrases like "last quarter" work the same way.',
	why: 'People ask for dates in all three ways. They are one control that sends a different condition each time, not three features.',
	viz: 'A date chip with presets above the monthly chart.',
	trailer: [
		{ cap: 'Exact dates: between 1 Jan and 30 Jun 2026', at: 'c:d', chips: [chip('d', '📅 2026-01-01 → 2026-06-30', 'on')], viz: { kind: 'cols', title: 'Revenue by month', items: M.slice(7, 13).map((d, i) => ({ k: d, l: ML(d), v: TOTAL[7 + i], t: k$(TOTAL[7 + i]) })) } },
		{ cap: 'Phrase: last 3 months (from today)', at: 'c:d', chips: [chip('d', '📅 Last 3 months', 'on')], viz: { kind: 'cols', title: 'Revenue by month', items: rec('07-relative').map((r) => ({ k: r[0], l: ML(r[0]), v: +r[1], t: k$(+r[1]) })), max: 110000 } },
		{ cap: 'Relative: last 30 days → data ends 23 Sep, so only a few days count', at: 'c:d', chips: [chip('d', '📅 last 30 days', 'on'), chip('w', '⚠ data ends 23 Sep', 'prop')], viz: { kind: 'cols', title: 'Revenue by month', items: rec('07b-last').map((r) => ({ k: r[0], l: ML(r[0]) + ' (partial)', v: +r[1], t: k$(+r[1]), cls: 'partial' })), max: 110000 } },
	],
	aqlRef: '07b-last',
	aqlNote: 'The AQL never changes; only the condition the SDK sends does. All three ran on ecommerce: <code>between</code> (runs 08 and 35), <code>last 30 day</code> (above, run 07b), <code>matches \'last 3 months\'</code> (run 07) and <code>matches \'this year\'</code> (run 07c). In fixed AQL the same ranges are literals: <code>@(2026-01-01 - 2026-06-30)</code>, <code>@(last 3 months)</code>, <code>@(last quarter)</code>.',
	sdk: `const range = app.createFilter('range', {
  type: 'date',
  label: 'Dates',
});
for (const q of [kpis, trend, table])
  app.mapControl(range, q, { field: 'orders.ordered_at' });

// exact dates
range.setCondition({
  operator: 'between',
  values: ['2026-01-01', '2026-06-30'],
});
// relative
range.setCondition({
  operator: 'last',
  values: [30],
  modifier: 'day',
});
// calendar phrase
range.setCondition({
  operator: 'matches',
  values: ['last quarter'],
});
app.execute();`,
	sql: ['Write different SQL for each kind of range: <code>BETWEEN</code>, <code>CURRENT_DATE - INTERVAL</code>, and hand-computed quarter boundaries', 'Decide whether end dates are inclusive and which time zone "today" is in'],
	anfra: ['One control, three conditions. The server understands phrases like <code>last quarter</code> in the app\'s time zone', 'In fixed AQL they are literals: <code>@(last quarter)</code>'],
	prompt: 'Add one date filter mapped to orders.ordered_at on every query, with exact dates, presets (last 7 days, last 30 days, last 3 months, this year, last quarter) and a free-text phrase box. Show the dates each choice resolved to, and warn when the newest order is older than the end of the range.',
	generic: 'Use one date control mapped to the main date field; offer between, last N and matches phrases, show the resolved dates and warn about data gaps.',
},
{
	id: 'date-drill', prim: 'time', also: ['drill', 'shape'], status: 'works', title: 'Date drill',
	one: 'Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.',
	does: 'The reader switches <b>Month → Quarter</b>, and 16 bars become 6. Then they click <b>Q2 2026</b>: the range narrows to April–June and the grain steps down to month.',
	why: 'The right level of time detail depends on the question, and time is the hierarchy every reader already knows.',
	viz: 'A grain switch above a column chart that rebuckets, then drills into the clicked quarter.',
	trailer: [
		{ cap: 'Month', chips: [chip('g', 'Grain: month', 'on')], viz: trend(TOTAL) },
		{ cap: 'Quarter: same alias "period", new buckets', at: 'c:g', chips: [chip('g', 'Grain: quarter', 'on')], viz: { kind: 'cols', title: 'Revenue by quarter', items: [['2025-04-01', 97537.24], ['2025-07-01', 231777.15], ['2025-10-01', 225937.4], ['2026-01-01', 230676.95], ['2026-04-01', 263475.8], ['2026-07-01', 233648.41]].map(([d, v]) => ({ k: 'q' + d, l: 'Q' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1) + ' ' + d.slice(2, 4), v, t: k$(v) })) } },
		{ cap: 'Click Q2 26 → between 1 Apr and 30 Jun, grain month', at: 'q2026-04-01', chips: [chip('g', 'Grain: month', 'on'), chip('r', 'Q2 2026', 'on')], viz: { kind: 'cols', title: 'Revenue Q2 2026', items: M.slice(10, 13).map((d, i) => ({ k: d, l: ML(d), v: TOTAL[10 + i], t: k$(TOTAL[10 + i]) })), max: 270000 } },
	],
	aqlRef: '35-timedrill',
	aqlNote: 'The input shows the quarter grain within 2026. Run 08 drilled September 2026 to weeks: weeks start on Monday, so the first bucket (31 Aug) holds only 1–6 Sep.',
	sdk: `const grain = app.createDateDrill('grain', { default: 'month' });
// the field, not the alias
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
grainButtons.onclick = (e) => {
  grain.setGrain(e.target.value);
  app.execute();
};

// click a period to drill into it: narrow the range, step the grain
// down
chart.on('click', (p) => {
  const start = trend.result.rows[p.dataIndex].period;
  range.setCondition({
    operator: 'between',
    values: [start, endOf(start, currentGrain)],
  });
  grain.setGrain(nextFiner[currentGrain]);
  app.execute();
});`,
	sql: ['Rewrite <code>DATE_TRUNC(\'month\', …)</code> in the SELECT, GROUP BY and ORDER BY of every query', 'Change the WHERE clause as well when drilling into a period'],
	anfra: ['One date drill rebuckets every dimension built on <code>orders.ordered_at</code>', 'The row key stays <code>period</code>, so the renderer doesn\'t change', 'Drilling in is two controls, a range and a grain, applied in one run'],
	prompt: 'Add a Week / Month / Quarter switch to the revenue trend using a date drill mapped to orders.ordered_at, and make clicking a bar drill into that period at the next finer grain, with a "back up" button.',
	generic: 'Add createDateDrill mapped to the date field (not the alias) with a grain-neutral alias; on click, set a between range to the clicked period and step the grain one level finer.',
},
{
	id: 'fiscal-calendar', prim: 'time', status: 'works', title: 'Fiscal calendar',
	one: 'Report by a fiscal year that starts in July instead of January.',
	does: 'The reader picks <b>Fiscal (July start)</b>. The quarters relabel: Jul–Sep 2026 becomes <b>FY27 Q1</b> at $234k.',
	why: 'Finance teams report in fiscal periods, and calendar quarters confuse them.',
	viz: 'Quarter columns that relabel from calendar to fiscal.',
	trailer: [
		{ cap: 'Calendar quarters', chips: [chip('cal', 'Calendar', 'on'), chip('fy', 'Fiscal (Jul)')], viz: { kind: 'cols', title: 'Revenue by quarter', items: rec('10-fiscal').map((r, i) => ({ k: 'q' + i, l: ['Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26', 'Q3 26'][i], v: +r[2], t: k$(+r[2]) })) } },
		{ cap: 'Fiscal: orders.fiscal_year and orders.fiscal_quarter', at: 'c:fy', chips: [chip('cal', 'Calendar'), chip('fy', 'Fiscal (Jul)', 'on')], viz: { kind: 'cols', title: 'Revenue by fiscal quarter', items: rec('10-fiscal').map((r, i) => ({ k: 'q' + i, l: `FY${String(r[0]).slice(2)} Q${r[1]}`, v: +r[2], t: k$(+r[2]), cls: 'alt' })) } },
	],
	aqlRef: '10-fiscal',
	aqlNote: '<code>orders.fiscal_year</code> and <code>orders.fiscal_quarter</code> are defined once in <code>models/ecommerce/orders.model.aml</code> (added for this card), so every query and every reader can use them. A date drill still can\'t regrain them, so the toggle switches between two queries; a fiscal-aware date drill is proposed.',
	sdk: `// two declared queries, calendar and fiscal; the toggle picks which
// one to show
const calQ = app.createQuery('cal', {
  dataset: 'ecommerce',
  aql: CALENDAR_AQL,
});
const fyQ = app.createQuery('fy', {
  dataset: 'ecommerce',
  aql: FISCAL_AQL,
});
for (const q of [calQ, fyQ])
  app.mapControl(country, q, { field: 'customers.country' });
toggle.onchange = () =>
  show(toggle.value === 'fiscal' ? fyQ : calQ);`,
	sql: ['Write <code>CASE WHEN month &gt; 6 …</code> and copy it into every report'],
	anfra: ['Fiscal year and quarter are model fields: one definition, used by name everywhere'],
	prompt: 'Add a Calendar / Fiscal (July start) toggle to the quarterly revenue chart using orders.fiscal_year and orders.fiscal_quarter, and label bars like "FY27 Q1".',
	generic: 'Define fiscal year/quarter dimensions once in the AML and switch the chart between calendar and fiscal queries.',
},
{
	id: 'as-of-anchor', prim: 'time', status: 'app', title: 'As-of anchor',
	one: 'Count "last 30 days" back from the newest data instead of from today.',
	does: 'An anchor query finds the newest order: <b>23 Sep 2026</b>. "Last 30 days" now means 25 Aug–23 Sep, and a chip shows the anchor.',
	why: 'With batch data, "today" is often after the newest data, and relative ranges come back empty.',
	viz: 'Anchor chip, then range chips that resolve against it.',
	trailer: [
		{ cap: 'Anchor query: latest = 23 Sep 2026', chips: [chip('a', '⚓ As of 23 Sep 2026', 'on')], viz: { kind: 'note', title: 'Anchor', items: [{ html: '<span>Latest order (max(orders.ordered_at))</span><b>2026-09-23</b>' }, { html: '<span>Today</span><b>2026-10-14</b>' }, { cls: 'warn', html: '"Last 30 days" from today would hold only 10 days of data' }] } },
		{ cap: '"Last 30 days" → 25 Aug – 23 Sep: 30 days of data', at: 'c:r', chips: [chip('a', '⚓ As of 23 Sep 2026', 'on'), chip('r', 'Last 30 days: 25 Aug → 23 Sep', 'on')], viz: { kind: 'kpis', title: 'Last 30 days', items: [{ k: 'Revenue (anchored)', v: 93255 }, { k: 'Revenue (from today)', v: 16854 }, { k: 'Orders (anchored)', v: 102, fmt: 'int' }] } },
	],
	aqlRef: '12-anchor',
	aqlNote: 'The <code>bi-apps/drill.html</code> app in this repo already does this: it runs a <code>maxTime</code> query and works out its ranges from it.',
	sdk: `const anchor = app.createQuery('anchor', {
  dataset: 'ecommerce',
  aql: \`
    explore {
      measures { latest: orders | max(orders.ordered_at) }
    }
  \`,
});
await app.execute();
// '2026-09-23'
const end = anchor.result.rows[0].latest;
range.setCondition({
  operator: 'between',
  values: [minusDays(end, 29), end],
});
await app.execute();`,
	limits: 'Works with app code. A proposed AQL phrase such as <code>@(last 30 days as of latest)</code> would make it one line.',
	sql: ['Add a <code>MAX(date)</code> subquery to every relative filter'],
	anfra: ['One tiny anchor query, then ordinary <code>between</code> conditions'],
	prompt: 'Anchor every relative range on this page to the newest order date (from a max(orders.ordered_at) query) instead of today, and show "As of <date>" next to the filters.',
	generic: 'Run a small max(date) anchor query first and resolve relative presets against it; display the anchor.',
},
{
	id: 'partial-period', prim: 'time', status: 'works', title: 'Incomplete periods',
	one: 'Mark a month that isn\'t over yet, so its short bar doesn\'t look like a drop.',
	does: 'The chart adds <code>last_order_day</code> to each month. September 2026 ends on the 23rd, so its bar is hatched and labelled "23 of 30 days".',
	why: 'A short final bar looks like a collapse. Most false alarms on dashboards start here.',
	viz: 'Columns with the last bar hatched and a footnote.',
	trailer: [
		{ cap: 'Sep 26 looks like a −26% drop', viz: trend(TOTAL, { f: (i) => ({ cls: i === 15 ? 'hl' : '' }) }) },
		{ cap: 'last_order_day = 23 Sep → partial period', at: M[15], chips: [chip('p', '▨ Sep 26: 23 of 30 days', 'prop')], viz: trend(TOTAL, { f: (i) => ({ cls: i === 15 ? 'partial' : '', t: i === 15 ? '23/30 d' : '' }) }) },
	],
	aqlRef: '11-partial',
	sdk: `trend.subscribe(() => {
  for (const r of trend.result?.rows ?? [])
    r._partial = r.last_order_day < endOfMonth(r.period);
});`,
	sql: ['Add <code>MAX(date)</code> to each group and compare it with the end of the period in the app'],
	anfra: ['One extra measure. The app compares it with the end of the period'],
	prompt: 'On the monthly revenue chart, detect months whose last order is before the month\'s end and hatch those bars with a "partial" note instead of letting them read as a drop.',
	generic: 'Add a max(date) measure per period and visually mark periods that end before their calendar end.',
},
{
	id: 'period-compare', prim: 'time', status: 'works', title: 'Period comparison',
	one: 'Show each month next to the month before and the same month last year.',
	does: 'The reader turns on <b>Compare: previous month</b> and <b>same month last year</b>. Lines appear over the bars. Sep 2026 shows −26% month on month and −31% year on year.',
	why: 'A number means little without something to compare it with.',
	viz: 'Columns (this period) with a dark line (previous month) and a green line (last year).',
	trailer: (() => {
		const r = rec('13-pop');
		const base = (o) => ({ kind: 'cols', title: 'Revenue 2026', items: r.map((x) => ({ k: x[0], l: ML(x[0]), v: +x[1] })), ...o });
		return [
			{ cap: '2026 by month', chips: [chip('pm', 'vs previous month'), chip('py', 'vs last year')], viz: base({}) },
			{ cap: '+ previous month (relative_period −1 month)', at: 'c:pm', chips: [chip('pm', 'vs previous month', 'on'), chip('py', 'vs last year')], viz: base({ line: r.map((x) => +x[2]), lineDash: true }) },
			{ cap: '+ same month last year (null before Jun 25)', at: 'c:py', chips: [chip('pm', 'vs previous month', 'on'), chip('py', 'vs last year', 'on')], viz: base({ line: r.map((x) => +x[2]), lineDash: true, line2: r.map((x) => x[3] == null ? null : +x[3]) }) },
		];
	})(),
	aqlRef: '13-pop',
	aqlNote: 'The <code>transform_pop_*</code> control operators fail on anfra, which is documented in API.md. Comparisons go in the AQL. The filter limits the base months, and <code>relative_period</code> still reads Dec 2025 for January\'s comparison.',
	sdk: `// toggles pick which measures to draw; one query returns all of
// them
compareMonth.onchange = () =>
  chart.setOption(
    series(trend.result, { prevMonth: compareMonth.checked }),
  );`,
	state: 'Renderer: which comparison lines are shown. Analytical: the comparison measures in the AQL.',
	sql: ['Write a self-join or <code>LAG()</code> over a complete calendar spine, with gaps handled'],
	anfra: ['<code>revenue | relative_period(orders.ordered_at, interval(-1 year))</code>, one line per comparison'],
	prompt: 'Show 2026 monthly revenue with toggles for "vs previous month" and "vs same month last year" as overlay lines, and a % change in the tooltip. Show "no comparison" where last year has no data.',
	generic: 'Add comparison measures with relative_period in one query and let toggles control which overlays render.',
},
{
	id: 'custom-compare', prim: 'time', status: 'works', title: 'Custom period comparison',
	one: 'Compare any two date ranges side by side, like H1 2026 and H2 2025.',
	does: 'The reader picks two ranges. Each country gets a pair of bars. Singapore grew from $82k to $113k, and Australia slipped from $119k to $113k.',
	why: 'Launches, campaigns and seasons rarely line up with calendar periods.',
	viz: 'Paired horizontal bars per country.',
	trailer: [
		{ cap: 'Range A: H2 2025', chips: [chip('a', 'A: Jul–Dec 2025', 'on'), chip('b', 'B: —')], viz: { kind: 'bars', title: 'Revenue by country', items: rec('15-exact').map((r) => ({ k: r[0], v: +r[2], t: k$(+r[2]), cls: 'g' })) } },
		{ cap: 'Range B: H1 2026 (exact_period)', at: 'c:b', chips: [chip('a', 'A: Jul–Dec 2025', 'on'), chip('b', 'B: Jan–Jun 2026', 'on')], viz: { kind: 'bars', title: 'H1 2026 (bar) vs H2 2025 (grey)', items: rec('15-exact').map((r) => ({ k: r[0], v: +r[1], g: +r[2], t: `${k$(+r[1])} vs ${k$(+r[2])}` })) } },
	],
	aqlRef: '15-exact',
	sdk: `// reader-chosen ranges: two date controls on two copies of the
// query (see bi-apps/drill.html)
app.mapControl(rangeA, queryA, { field: 'orders.ordered_at' });
app.mapControl(rangeB, queryB, { field: 'orders.ordered_at' });`,
	sql: ['Write two subqueries or <code>SUM(CASE WHEN date BETWEEN … THEN …)</code> for each range'],
	anfra: ['<code>exact_period</code> for fixed ranges, or two date controls for ranges the reader picks'],
	prompt: 'Compare revenue by country between two date ranges the reader chooses (default H2 2025 vs H1 2026), as paired bars with the % change.',
	generic: 'Compare two ranges via exact_period (fixed) or two date controls on twin queries (reader-chosen).',
},
{
	id: 'to-date', prim: 'time', also: ['shape'], status: 'works', title: 'Period to date & trailing period',
	one: 'Show a year-to-date total and a rolling 3-month total for each month.',
	does: 'Toggles add <b>YTD</b>, which climbs and resets in January, and <b>Trailing 3 months</b>, a rolling total.',
	why: 'Executives ask "where are we for the year?" and "what\'s the run rate?" more often than "what happened in March?".',
	viz: 'Monthly columns with a YTD line and a trailing-3-month line.',
	trailer: [
		{ cap: 'Monthly revenue', chips: [chip('ytd', 'YTD'), chip('t3', 'Trailing 3m')], viz: trend(TOTAL, { max: 600000 }) },
		{ cap: 'YTD: period_to_date(\'year\', …) resets in January', at: 'c:ytd', chips: [chip('ytd', 'YTD', 'on'), chip('t3', 'Trailing 3m')], viz: trend(TOTAL, { max: 700000, line: rec('14-ptd').map((r) => +r[2]) }) },
		{ cap: 'Trailing 3 months: trailing_period(…, interval(3 months))', at: 'c:t3', chips: [chip('ytd', 'YTD', 'on'), chip('t3', 'Trailing 3m', 'on')], viz: trend(TOTAL, { max: 700000, line: rec('14-ptd').map((r) => +r[2]), line2: rec('14-ptd').map((r) => +r[3]) }) },
	],
	aqlRef: '14-ptd',
	sdk: `// one query, three measures; toggles are renderer state
ytdToggle.onchange = () => redraw();`,
	sql: ['Write a window <code>SUM() OVER (PARTITION BY year ORDER BY month)</code> and a <code>ROWS BETWEEN 2 PRECEDING</code> frame, and fill missing months first'],
	anfra: ['<code>period_to_date</code> and <code>trailing_period</code> are built-in functions'],
	prompt: 'Add YTD and trailing-3-month lines to the monthly revenue chart, each behind a toggle.',
	generic: 'Use period_to_date and trailing_period measures in one query; toggles only change what renders.',
},
// ===== Drill =====
{
	id: 'hierarchy-drill', prim: 'drill', also: ['sel'], status: 'app', title: 'Drill down', video: 'media/drill-down.mp4', app: 'patterns/drill-down',
	one: 'Click a region to see its countries, then customers, then their orders, and climb back with breadcrumbs.',
	does: 'The reader clicks <b>APAC</b>, then <b>Australia</b>, then <b>Customer 184</b>, and lands on that customer\'s 13 orders. The breadcrumb reads "All regions › APAC › Australia › Customer 184"; clicking a crumb climbs back. The KPIs and trend on the right follow the path.',
	why: 'A drill path answers "why is this number big?" one step at a time.',
	viz: 'Bars at each level with a breadcrumb trail.',
	trailer: [
		{ cap: 'Level 1: category', chips: [chip('bc', 'All')], viz: catBars(CAT_TOTAL, { title: 'Category' }) },
		{ cap: 'Click Software → level 2: product', at: 'Software', chips: [chip('bc', 'All › Software', 'on')], viz: { kind: 'bars', title: 'Products in Software', items: [{ k: 'Analytics Pro', v: 321425, t: '$321k' }, { k: 'Dashboard Kit', v: 175969, t: '$176k' }] } },
		{ cap: 'Click Analytics Pro → level 3: its orders', at: 'Analytics Pro', chips: [chip('bc', 'All › Software › Analytics Pro', 'on')], viz: { kind: 'table', title: 'Orders', animateNew: true, head: ['Order', 'Date', 'Customer', 'Revenue'], rows: rec('16-records').slice(0, 6).map((r) => ({ c: ['#' + r[0], r[1], r[2], '$' + Math.round(+r[5])] })) } },
	],
	aqlRef: '50c-drill-country',
	aqlNote: 'The recording is the real Data App <code>apps/patterns/drill-down.html</code>, running on the ecommerce sample. Each level is its own query, and the path is one filter per level: <code>markets.region</code>, <code>markets.name</code>, <code>customers.id</code>. The input above is the path after clicking APAC.',
	sdk: `const levels = [
  // a filter control per level
  { q: byCategory, f: category },
  { q: byProduct, f: product },
  { q: orders, f: null },
];
// level i+1 is mapped to the filters of levels 0..i
chart.on('click', (p) => {
  const lvl = levels[depth];
  lvl.f.setCondition({
    operator: 'is',
    values: [lvl.q.result.rows[p.dataIndex][lvl.key]],
  });
  depth++;
  app.execute();
  renderLevel(depth);
});
crumb.onclick = (i) => {
  for (const l of levels.slice(i)) l.f?.reset();
  depth = i;
  app.execute();
};`,
	state: 'Drill context: the path [category, product] stored as filter conditions, plus the current depth (renderer).',
	limits: 'Works with app code. A proposed <code>createDrillPath([...fields])</code> would hold the path and depth as one control.',
	sql: ['Write a query for each level, and keep the parent\'s WHERE clause as you go down and back up'],
	anfra: ['The path is just filters, so it shows in <code>executedAql</code> and can be bookmarked like any other filter'],
	prompt: 'Make a drill-down from category to product to individual orders, with a breadcrumb that lets the reader climb back. Store the path as filter conditions.',
	generic: 'Model a drill path as one filter control per level, each level\'s query mapped to the filters above it, with a breadcrumb that resets deeper levels.',
},
{
	id: 'drill-path', prim: 'drill', also: ['snap'], status: 'app', title: 'Drill path',
	one: 'Keep a trail of every step down and up, and click any step to go back to it.',
	does: 'The reader drills <b>APAC › Australia</b>, goes <b>↑ up</b> to APAC, then drills into <b>Singapore</b>. The drill path reads "All regions › ↓ APAC › ↓ Australia › ↑ APAC › ↓ Singapore"; clicking <b>↓ Australia</b> brings back Australia\'s customers and its $313,397.',
	why: 'A breadcrumb shows where the reader is. A drill path shows how they got there, so they can compare branches without starting over.',
	viz: 'Bars at the current level, with the drill path as a row of steps above them.',
	trailer: [
		{ cap: 'Level 1: regions', chips: [chip('dp', 'Drill path: All regions')], viz: { kind: 'bars', title: 'Revenue by region', items: [{ k: 'APAC', v: 872009, t: '$872k' }, { k: 'Europe', v: 205890, t: '$206k' }, { k: 'Americas', v: 205154, t: '$205k' }] } },
		{ cap: 'Click APAC, then Australia → its customers', at: 'Customer 184', click: false, chips: [chip('dp', 'All regions › ↓ APAC › ↓ Australia', 'on')], viz: { kind: 'bars', title: 'Customers in Australia', items: [{ k: 'Customer 184', v: 23750, t: '$23.8k' }, { k: 'Customer 14', v: 13460, t: '$13.5k' }, { k: 'Customer 55', v: 13448, t: '$13.4k' }, { k: 'Customer 127', v: 12543, t: '$12.5k' }] } },
		{ cap: '↑ Up: back to APAC, and the path keeps the step', at: 'c:dp', chips: [chip('dp', '… › ↓ Australia › ↑ APAC', 'on')], viz: { kind: 'bars', title: 'Countries in APAC', items: [{ k: 'Australia', v: 313397, t: '$313k' }, { k: 'Singapore', v: 255030, t: '$255k' }, { k: 'Vietnam', v: 185000, t: '$185k' }, { k: 'Japan', v: 118000, t: '$118k' }] } },
		{ cap: 'Click Singapore: every step stays on the path', at: 'Singapore', chips: [chip('dp', '… › ↑ APAC › ↓ Singapore', 'on')], viz: { kind: 'bars', title: 'Customers in Singapore', items: [{ k: 'Customer 25', v: 20786, t: '$20.8k' }, { k: 'Customer 43', v: 12552, t: '$12.6k' }, { k: 'Customer 45', v: 11727, t: '$11.7k' }, { k: 'Customer 18', v: 10842, t: '$10.8k' }] } },
	],
	aqlRef: null, aqlWhy: 'each step is the same level query with the path\'s filters',
	aqlInline: `explore { dimensions { key: markets.name } measures { total_revenue: revenue } filters { markets.region is 'APAC' } sorts { total_revenue desc } }`,
	sdk: `// each step keeps the filter values it left behind
const trail = [{ label: 'All regions', picks: [] }];
let at = 0;
function step(label, picks) {
  trail.splice(at + 1); // a new step after a jump drops the rest
  trail.push({ label, picks });
  at = trail.length - 1;
  show(picks);
}
function show(picks) {
  levels.slice(0, 2).forEach((l, i) =>
    picks[i] != null
      ? l.filter.setCondition({ operator: 'is', values: [picks[i]] })
      : l.filter.reset(),
  );
  app.execute();
}
// down: step(row.key, [...picks, row.key])
// up:   step(parent, picks.slice(0, -1))
// jump: at = i; show(trail[i].picks)`,
	state: 'Drill context: the path as filter conditions, plus the list of steps (renderer state) that records how the reader got there.',
	limits: 'Works with app code: the app keeps the list of steps. A proposed <code>createDrillPath()</code> would hold the path, and its history, as one control.',
	sql: ['Rebuild the WHERE clause for every step, and drop the last condition when the reader goes up', 'Keep your own list of past steps and the WHERE clause each one used'],
	anfra: ['Each step is a set of filter conditions; jumping back sets them again'],
	prompt: 'Make a drill-down from region to country to customer that records each step down and up as a drill path of breadcrumbs, where clicking a breadcrumb returns to that step.',
	generic: 'Record each drill step (down or up) with the filter conditions it set, show the steps as breadcrumbs, and restore them when one is clicked.',
},
{
	id: 'adhoc-breakdown', prim: 'drill', also: ['shape'], status: 'app', title: 'Break down',
	one: 'Right-click a bar to split it by another field, like order status.',
	does: 'The reader right-clicks <b>Software</b> and picks <b>Break down by → Status</b>. A new panel shows Software revenue by status.',
	why: 'The next question is often about a different dimension, not a deeper one.',
	viz: 'Context menu over a bar, then a new breakdown panel.',
	trailer: [
		{ cap: 'Right-click Software', at: 'Software', viz: catBars(CAT_TOTAL, { title: 'Category' }) },
		{ cap: 'Break down by status → new query + filter', at: 'c:bd', chips: [chip('bd', 'Software › by Status', 'on')], viz: { kind: 'split', a: catBars(CAT_TOTAL, { title: 'Category', f: (c) => ({ cls: c === 'Software' ? 'hl' : 'dim' }) }), b: { kind: 'bars', title: 'Software by status', items: rec('38-breakdown').map((r) => ({ k: r[0], v: +r[1], t: k$(+r[1]) })) } } },
	],
	aqlRef: '38-breakdown',
	sdk: `let n = 0;
// dimRef from a fixed list, never typed text
function breakdown(row, dimRef, alias) {
  const q = app.createQuery('bd' + ++n, {
    dataset: 'ecommerce',
    aql: \`
      explore {
        dimensions { \${alias}: \${dimRef} }
        measures { total_revenue: revenue }
        sorts { total_revenue desc }
      }
    \`,
  });
  const f = app.createFilter('bdf' + n, {
    dataset: 'ecommerce',
    field: 'products.category',
  });
  f.setCondition({ operator: 'is', values: [row.category] });
  app.mapControl(f, q, { field: 'products.category' });
  return app.execute();
}`,
	limits: 'Works with app code: "AQL is fixed once declared", so each breakdown is a new query.',
	sql: ['Template the GROUP BY column and keep the parent filter'],
	anfra: ['A new <code>explore</code> from a fixed list of dimensions. The parent value is a mapped filter, not text in the query'],
	prompt: 'Add a right-click menu on category bars with "Break down by" Status, Country or Product, opening a breakdown panel filtered to the clicked category.',
	generic: 'On demand, declare a new query whose dimension comes from a fixed allow-list, filtered to the clicked value via a mapped control.',
},
{
	id: 'underlying-records', prim: 'drill', also: ['shape'], status: 'works', title: 'View underlying data',
	one: 'Click a column on a chart to see the individual orders behind it.',
	does: 'KPIs and a revenue-by-month chart show $1,283,053 from 1,500 orders. The reader clicks <b>May 2026</b>: the KPIs narrow to that month, and a drawer opens with its 101 orders, newest first, 25 at a time. <b>Load more</b> fetches the next 25.',
	why: 'Seeing the actual orders is how readers come to trust a total.',
	viz: 'Three KPIs and a revenue-by-month column chart; clicking a column opens a drawer with the order table, a row count and Load more.',
	trailer: [
		{ cap: 'Revenue $1.28M from 1,500 orders, by month', viz: { kind: 'split', cols: '1fr 2fr', a: { kind: 'kpis', title: 'All months', items: [{ k: 'Revenue', v: 1283053 }, { k: 'Orders', v: 1500, fmt: 'int' }] }, b: trend(TOTAL) } },
		{ cap: 'Click May 2026: the KPIs narrow to $88.4k, 101 orders', at: M.find((d) => String(d).startsWith('2026-05')), viz: { kind: 'split', cols: '1fr 2fr', a: { kind: 'kpis', title: 'May 2026', items: [{ k: 'Revenue', v: 88378 }, { k: 'Orders', v: 101, fmt: 'int' }] }, b: trend(TOTAL, { f: (i, d) => ({ cls: String(d).startsWith('2026-05') ? 'hl' : 'dim' }) }) } },
		{ cap: 'The drawer: May 2026 orders, newest first, 25 at a time', viz: { kind: 'table', title: 'Orders behind May 2026', animateNew: true, head: ['Order', 'Date', 'Customer', 'Status', 'Revenue'], rows: [['#1447', '31 May 26', 'Customer 52', 'shipped', '$39'], ['#1249', '31 May 26', 'Customer 151', 'cancelled', '$23'], ['#379', '31 May 26', 'Customer 157', 'shipped', '$2,594'], ['#720', '30 May 26', 'Customer 45', 'completed', '$897'], ['#491', '30 May 26', 'Customer 80', 'completed', '$496'], ['#1278', '29 May 26', 'Customer 111', 'shipped', '$844']].map((c) => ({ k: c[0], c })) } },
	],
	aqlRef: '16-records',
	sdk: `const records = app.createQuery('records', {
  dataset: 'ecommerce',
  aql: RECORDS_AQL,
  pageSize: 25,
});
// the clicked month filters the KPIs and the records
app.mapControl(month, kpis, { field: 'orders.ordered_at' });
app.mapControl(month, records, { field: 'orders.ordered_at' });
column.onclick = () => {
  month.setCondition({ operator: 'between',
    values: [monthStart, monthEnd] });
  app.execute();
};
// appends; rejects on failure
loadMore.onclick = () => records.fetchMore();
loadMore.hidden = !records.hasMore;`,
	state: 'Analytical: the clicked month and the page. Runtime: rows loaded so far and <code>hasMore</code>.',
	sql: ['Write the detail query by hand, apply the same filters, and add <code>LIMIT</code>/<code>OFFSET</code>'],
	anfra: ['A records <code>explore</code> plus a cross-filter edge. Paging is <code>pageSize</code> and <code>fetchMore()</code>'],
	prompt: 'Add KPIs and a revenue-by-month chart; clicking a month narrows the KPIs and opens a drawer with its orders: newest first, 25 at a time, with Load more and a row count.',
	generic: 'Declare a paged records query filtered by the clicked chart element; open it in a drawer with fetchMore.',
},
{
	id: 'drillthrough', prim: 'drill', also: ['snap'], status: 'proposed', title: 'Drill-through',
	one: 'Click a country to open another app already filtered to that country.',
	does: 'From a summary page, the reader clicks <b>Japan</b>, picks <b>Open in Cohort Heatmap</b>, and that app opens with Country = Japan.',
	why: 'Data Apps work better as a connected set than as islands.',
	viz: 'A context menu, then a second app frame with the filter already set.',
	trailer: [
		{ cap: 'Click Japan → "Open in Cohort Heatmap"', at: 'Japan', chips: [chip('o', '↗ Open in Cohort Heatmap', 'btn')], viz: ctryBars({ f: (c) => ({ cls: c.k === 'Japan' ? 'hl' : 'dim' }) }) },
		{ cap: 'Proposed: host opens the app with context', chips: [chip('ctx', 'Country: Japan (from Overview)', 'on'), chip('p', 'proposed', 'prop')], viz: { kind: 'note', title: 'reports/cohort-heatmap', items: [{ cls: 'url', html: '/apps/reports/cohort-heatmap?country=Japan' }, { cls: 'warn', html: 'Data Apps run in a sandbox: "Forms, popups and navigation are blocked." The host would need to carry the context.' }] } },
	],
	aqlRef: null, aqlWhy: 'no query change',
	aqlInline: `// target app: the same field-backed filter, set from the context the host passes in
// country.setCondition({ operator: 'is', values: ['Japan'] })`,
	sdk: `// Proposed (not real API):
// Anfra.open('reports/cohort-heatmap', { controls: { country: {
// operator: 'is', values: ['Japan'] } } })
// and in the target: Anfra.context.controls`,
	limits: 'Proposed. The app sandbox allows scripts only: navigation and popups are blocked, and <code>localStorage</code> throws.',
	limitsShort: 'sandboxed apps cannot navigate; needs a host-level open-with-context API',
	sql: ['Encode the state in a URL and parse it again in the other report'],
	anfra: ['Proposed: the host carries a snapshot (control conditions) into the target app'],
	prompt: 'I want to drill from this page to another Data App with the clicked country already filtered. Show me what is possible in the sandbox today and stub the hand-off.',
	generic: 'Cross-app drillthrough with context needs a host API; today, offer a copyable snapshot or link the reader opens manually.',
},
// ===== Query shape =====
{
	id: 'row-actions', prim: 'drill', also: ['map'], status: 'app', title: 'Row actions',
	one: 'Put links on each table row: open the customer in your CRM, email them, or see their orders.',
	does: 'Each row of the top-customers table has three actions. <b>Open in CRM</b> and <b>Email</b> use URLs built in AQL from the row, such as <code>https://crm.example.com/accounts/184</code>. <b>View orders</b> is an in-app URL: on Customer 184 it opens their latest orders, starting with #803 on 23 Aug 26 for $4,243.',
	why: 'A table of customers is a to-do list. Actions take the reader from the number to the next step without copying IDs between tools.',
	viz: 'A customer table with an Actions column, and the orders view an in-app action opens.',
	trailer: (() => {
		const acts = 'CRM ↗ · Email · Orders →';
		const rows = [['Customer 184', 'Australia', '$23.8k'], ['Customer 25', 'Singapore', '$20.8k'], ['Customer 140', 'United States', '$16.5k'], ['Customer 27', 'Vietnam', '$13.6k'], ['Customer 14', 'Australia', '$13.5k']];
		const table = (hl) => ({ kind: 'table', title: 'Top customers', head: ['Customer', 'Country', 'Revenue', 'Actions'], widths: '1fr .9fr .6fr 1.2fr', rows: rows.map((r) => ({ k: r[0], c: [...r, acts], cls: r[0] === hl ? 'hl' : '' })) });
		return [
			{ cap: 'Every row carries its own actions', viz: table() },
			{ cap: 'Open in CRM: concat(url, cast(customers.id, \'text\'))', at: 'Customer 184', chips: [chip('u', 'crm.example.com/accounts/184', 'on')], viz: table('Customer 184') },
			{ cap: 'Email: a mailto: URL with the customer\'s address', at: 'Customer 184', chips: [chip('u', 'mailto:customer184@example.com', 'on')], viz: table('Customer 184') },
			{ cap: 'View orders: an in-app URL sets customers.id is 184', at: 'c:u', chips: [chip('u', '#orders?customer=184', 'on')], viz: { kind: 'table', title: 'Latest orders from Customer 184', head: ['Order', 'Date', 'Status', 'Revenue'], rows: [['#803', '23 Aug 26', 'cancelled', '$4,243'], ['#374', '26 May 26', 'completed', '$2,000'], ['#472', '8 Apr 26', 'shipped', '$1,644'], ['#521', '13 Feb 26', 'completed', '$2,897']].map((r) => ({ k: r[0], c: r })) } },
		];
	})(),
	aqlRef: null, aqlWhy: 'each action\'s URL is a dimension, built in AQL from the row\'s fields',
	aqlInline: `dimension customers.crm_url = concat('https://crm.example.com/accounts/', cast(customers.id, 'text'));
dimension customers.email_url = concat('mailto:', customers.email, '?subject=Your%20order%20history');
explore { dimensions { customer_name: customers.name, crm_url: customers.crm_url, email_url: customers.email_url } measures { total_revenue: revenue } sorts { total_revenue desc } }`,
	aqlNote: '<code>concat</code> takes text only, so a number such as <code>customers.id</code> needs <code>cast(…, \'text\')</code>. Defined in the Dataset, the URL field can be reused by every app.',
	sdk: `// the URLs come back as columns, one per action
const ACTIONS = [
  { key: 'crm_url', label: 'Open in CRM' },
  { key: 'email_url', label: 'Email' },
  { key: 'orders_url', label: 'View orders' }, // in-app
];
link.onclick = (e) => {
  e.preventDefault();
  const id = /customer=(\\d+)/.exec(row.orders_url)[1];
  // number filter values are strings
  customer.setCondition({ operator: 'is', values: [id] });
  app.execute();
};`,
	state: 'Interaction mapping: each action is a URL field on the row. An in-app action turns into a filter condition; an outside one leaves the app.',
	limits: 'Works with app code: the URLs are AQL fields, but Data Apps run in a sandbox that allows scripts only, so links to other sites can\'t open a tab or leave the page. In-app actions work. A proposed host API, <code>Anfra.openUrl(url)</code> with an allowlist of domains, would open the rest.',
	limitsShort: 'sandboxed apps cannot open outside links; needs a host openUrl API',
	sql: ['Write <code>\'https://crm…/\' || CAST(c.id AS VARCHAR)</code> in every query that lists customers', 'Parse the clicked URL and rebuild the orders query\'s WHERE clause yourself'],
	anfra: ['Define <code>crm_url</code> once in the Dataset; every query and app can show it'],
	prompt: 'Add row actions to the top-customers table: Open in CRM and Email built as AQL URL fields, and an in-app View orders action that opens the customer\'s latest orders.',
	generic: 'Build each action\'s URL as an AQL dimension (concat, cast numbers to text), show it as a link on each row, and turn in-app URLs into filter conditions.',
},
{
	id: 'metric-switch', prim: 'shape', also: ['map'], status: 'works', title: 'Dynamic metric',
	one: 'Switch the chart between revenue, orders and units with one click.',
	does: 'The reader switches <b>Revenue → Units</b>. The bars reorder: Hardware leads on units (2,775, excluding cancelled orders), and Services leads on revenue. No query runs.',
	why: 'Switching should feel instant. Fetching all three metrics once makes it renderer-only state.',
	viz: 'Segmented metric control above category bars that reorder.',
	trailer: (() => {
		const r = rec('36-multi');
		const by = (j, fmt) => ({ kind: 'bars', title: 'By category', items: [...r].sort((a, b) => b[j] - a[j]).map((x) => ({ k: x[0], v: +x[j], t: fmt(+x[j]) })) });
		return [
			{ cap: 'Revenue', chips: [chip('r', 'Revenue', 'on'), chip('o', 'Orders'), chip('u', 'Units')], viz: by(1, k$) },
			{ cap: 'Units: bars reorder, no query', at: 'c:u', chips: [chip('r', 'Revenue'), chip('o', 'Orders'), chip('u', 'Units', 'on')], viz: by(3, (x) => x.toLocaleString()) },
			{ cap: 'Orders', at: 'c:o', chips: [chip('r', 'Revenue'), chip('o', 'Orders', 'on'), chip('u', 'Units')], viz: by(2, (x) => x.toLocaleString()) },
		];
	})(),
	aqlRef: '36-multi',
	aqlNote: 'Orders by category add up to more than 1,500, because an order with two categories counts once in each.',
	sdk: `// one query returns revenue, orders, units
// no execute()
metricBtns.onclick = (e) => {
  metric = e.target.value;
  draw(byCategory.result, metric);
};`,
	state: 'Renderer-only: which metric is drawn. The analytical state doesn\'t change.',
	sql: ['Usually one query per metric, or a dynamic column that also has to be secured'],
	anfra: ['Return every metric in one <code>explore</code>, and switching becomes a redraw'],
	prompt: 'Add a Revenue / Orders / Units switch to the category chart. Fetch all three in one query so switching never re-queries, and animate bars to their new order.',
	generic: 'Fetch all candidate metrics in one query and make the metric switch renderer-only, with an animated reorder.',
},
{
	id: 'dimension-switch', prim: 'shape', also: ['drill'], status: 'app', title: 'Dynamic dimension',
	one: 'Switch how the chart groups data: by country, category or status.',
	does: 'The reader switches <b>Group by: Country → Status</b>, and the bars rebuild with completed, shipped and cancelled.',
	why: 'Let the reader decide how to slice the data, instead of building three charts.',
	viz: 'Dropdown + bars that rebuild.',
	trailer: [
		{ cap: 'Group by Country', chips: [chip('g', 'Group by: Country', 'on')], viz: ctryBars({ title: 'Revenue' }) },
		{ cap: 'Group by Category: a pre-declared query', at: 'c:g', chips: [chip('g', 'Group by: Category', 'on')], viz: catBars(CAT_TOTAL, { title: 'Revenue' }) },
	],
	aqlRef: null, aqlWhy: 'three small queries, each like the "Percent of total" query',
	aqlInline: `// declare one query per allowed dimension, up front
explore { dimensions { key: customers.country }  measures { total_revenue: revenue } sorts { total_revenue desc } }
explore { dimensions { key: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }
explore { dimensions { key: orders.status }     measures { total_revenue: revenue } sorts { total_revenue desc } }`,
	sdk: `const by = Object.fromEntries(
  DIMS.map((d) => [
    d.id,
    app.createQuery('by_' + d.id, {
      dataset: 'ecommerce',
      aql: aqlFor(d.ref),
    }),
  ]),
);
for (const q of Object.values(by))
  app.mapControl(country, q, { field: 'customers.country' });
// executes only the stale one
groupBy.onchange = () => {
  active = by[groupBy.value];
  app.execute();
};`,
	limits: 'Works with app code. Declare each allowed dimension up front, and use the same alias (<code>key</code>) so the renderer stays the same.',
	sql: ['Template the GROUP BY column from an allow-list'],
	anfra: ['Same alias in every query, so one renderer handles them all. <code>execute()</code> skips queries that are already fresh'],
	prompt: 'Add a "Group by" dropdown (Country, Category, Status) to the revenue chart. Pre-declare one query per option with the same alias and switch between them.',
	generic: 'Pre-declare one query per allowed dimension with a shared alias and switch which one renders.',
},
{
	id: 'sort', prim: 'shape', status: 'works', title: 'Sort',
	one: 'Click a column header to sort the table by that column.',
	does: 'The reader clicks the <b>Orders</b> header. The table re-sorts on the server, so page 2 continues the new order.',
	why: 'A sort done in the browser on page 1 of 8 is wrong.',
	viz: 'Table with sortable headers.',
	trailer: [
		{ cap: 'Sorted by revenue (the AQL default)', viz: { kind: 'table', title: 'Customers', head: ['Customer', 'Country', 'Revenue ▼', 'Orders'], rows: rec('02-having').slice(0, 7).map((r) => ({ k: r[0], c: [r[0], r[1], k$(+r[2]), r[3]] })) } },
		{ cap: 'Click Orders → setSort([{ field: \'orders\', direction: \'desc\' }])', viz: { kind: 'table', title: 'Customers', head: ['Customer', 'Country', 'Revenue', '<span class="sort">Orders ▼</span>'], rows: [...rec('02-having')].sort((a, b) => b[3] - a[3]).slice(0, 7).map((r) => ({ k: r[0], c: [r[0], r[1], k$(+r[2]), r[3]] })) } },
	],
	aqlRef: '34-search', aqlNote: 'The input\'s <code>sorts</code> replaces the AQL\'s own <code>sorts</code> for that run. <code>setSort([])</code> brings the AQL order back.',
	sdk: `th.onclick = () => {
  dir = dir === 'desc' ? 'asc' : 'desc';
  // a result column name
  table.setSort([{ field: th.dataset.col, direction: dir }]);
  app.execute();
};`,
	sql: ['Allow-list the column, add <code>ORDER BY</code>, and keep it in step with the paging'],
	anfra: ['<code>setSort</code> takes a result column name and doesn\'t change the AQL'],
	prompt: 'Make every column header of the customer table sortable on the server (click toggles direction), and keep Load more consistent with the sort.',
	generic: 'Use query.setSort with result column names on header click; setSort([]) restores the default.',
},
{
	id: 'top-n', prim: 'shape', also: ['param'], status: 'works', title: 'Top N & Others',
	one: 'Show the top 3 countries and group the rest into "Others".',
	does: 'The reader picks <b>Top 3</b>: Australia, Singapore and Germany. An <b>Other</b> bar holds the remaining $509k, so the bars still add up to $1.28M.',
	why: 'A Top N chart without "Other" quietly drops part of the total.',
	viz: 'Bars for the top N and an italic "Other" bar.',
	trailer: [
		{ cap: 'All 6 countries', chips: [chip('n', 'Top: all')], viz: ctryBars() },
		{ cap: 'Top 3: top(3, customers.country, by: revenue)', at: 'c:n', chips: [chip('n', 'Top: 3', 'on')], viz: { kind: 'bars', title: 'Revenue by country', items: rec('24b-other').map((r) => ({ k: r[0], v: +r[1], t: k$(+r[1]) })), max: 520000 } },
		{ cap: 'Other = all_countries − top 3 (app computes it)', chips: [chip('n', 'Top: 3', 'on')], viz: { kind: 'bars', title: 'Revenue by country', max: 520000, items: [...rec('24b-other').map((r) => ({ k: r[0], v: +r[1], t: k$(+r[1]) })), { k: 'Other (3)', v: 1283052.95 - rec('24b-other').reduce((a, r) => a + +r[1], 0), t: k$(1283052.95 - rec('24b-other').reduce((a, r) => a + +r[1], 0)), cls: 'other' }] } },
	],
	aqlRef: '24b-other',
	aqlNote: 'A single "Top 3 or Other" dimension doesn\'t work yet: <code>case(when: country in top_3 …)</code> crashed the compiler, and a dimensionalized rank came back as 1 on every row. The N lives in the AQL text, so a reader-chosen N is a new query, or a dataset metric for the rank.',
	sdk: `// n from a fixed menu: 3, 5, 10
function topN(n) {
  const q = app.createQuery('top' + n, {
    dataset: 'ecommerce',
    aql: topAql(n),
  });
  app.mapControl(status, q, { field: 'orders.status' });
  return app.execute().then(() => {
    const rows = q.result.rows,
      total = Number(rows[0].all_countries);
    return [
      ...rows,
      {
        country: 'Other',
        total_revenue:
          total -
          rows.reduce((a, r) => a + Number(r.total_revenue), 0),
      },
    ];
  });
}`,
	sql: ['Write a <code>RANK()</code> subquery, a <code>CASE</code> to fold the tail into "Other", then group again'],
	anfra: ['<code>top(3, customers.country, by: revenue)</code> in the filters, plus an <code>exclude_grains</code> total'],
	prompt: 'Show the top N countries by revenue (menu: 3, 5, all) plus an "Other" bar computed from an exclude_grains total, so the bars always sum to the grand total.',
	generic: 'Filter with top(n, dim, by: metric) and add a metric | exclude_grains(dim) total so the app can show Other.',
},
{
	id: 'pivot', prim: 'shape', status: 'works', title: 'Pivot table',
	one: 'Countries down the side, categories across the top, and each cell\'s share of its row.',
	does: 'The pivot shows countries down the side and categories across the top. A toggle switches the cells to <b>% of country</b>: Services is 46% of Australia.',
	why: 'A pivot is how a spreadsheet user reads a breakdown.',
	viz: 'Heatmap-style pivot table with a $ / % toggle.',
	trailer: (() => {
		const r = rec('17-pivot').filter((x) => x[0]);
		const rows = [...new Set(r.map((x) => x[0]))];
		const cell = (j) => rows.map((c) => CATS.map((k) => { const f = r.find((x) => x[0] === c && x[1] === k); return f ? +f[j] : null; }));
		return [
			{ cap: 'rows { country } columns { category }', chips: [chip('d', '$', 'on'), chip('p', '% of row')], viz: { kind: 'heat', title: 'Revenue', rw: 70, rows, cols: CATS, cells: cell(2), text: k$ } },
			{ cap: 'percent_of_total(revenue, \'row_total\')', at: 'c:p', chips: [chip('d', '$'), chip('p', '% of row', 'on')], viz: { kind: 'heat', title: 'Share of country', rw: 70, rows, cols: CATS, cells: cell(3), text: (v) => pct(v) } },
		];
	})(),
	aqlRef: '17-pivot',
	aqlNote: 'The result includes header rows, marked by <code>__pivot_row__</code> and <code>__pivot_column__</code>. <code>percent_of_total</code> returns a fraction (0.458), so format it as a percentage.',
	sdk: `// no pageSize
const pivot = app.createQuery('pivot', {
  dataset: 'ecommerce',
  aql: PIVOT_AQL,
});
const cells = pivot.result.rows.filter(
  (r) => r.__column_header__ === '0',
);`,
	sql: ['Pivot with <code>SUM(CASE WHEN category = …)</code> columns, or the database\'s own PIVOT, plus a window for row totals'],
	anfra: ['<code>rows { }</code> and <code>columns { }</code> inside <code>dimensions</code>. Shares use <code>percent_of_total</code>'],
	prompt: 'Add a country × category pivot of revenue with a toggle between dollars and % of the country\'s total (format the fraction as a percent).',
	generic: 'Use dimensions { rows { } columns { } } and percent_of_total(metric, \'row_total\'); render header rows from the pivot markers.',
},
{
	id: 'totals', prim: 'shape', status: 'works', title: 'Subtotals & grand totals',
	one: 'Add a total for each category and one for everything.',
	does: 'The product table shows each product\'s revenue, its <b>category subtotal</b> and its <b>share of category</b>. Gizmo is 61% of Hardware. The grand total is $1.28M.',
	why: 'Totals that come from the same query always add up.',
	viz: 'Grouped table with subtotal rows.',
	trailer: [
		{ cap: 'Products', viz: { kind: 'table', title: 'Revenue by product', head: ['Category', 'Product', 'Revenue'], rows: rec('18-totals').map((r) => ({ k: r[1], c: [r[0], r[1], k$(+r[2])] })) } },
		{ cap: 'exclude_grains(products.name) → category subtotal + share', viz: { kind: 'table', title: 'Revenue by product', head: ['Category', 'Product', 'Revenue', 'Cat. total', 'Share'], widths: '1fr 1.2fr .8fr .8fr .6fr', rows: [...rec('18-totals').map((r) => ({ k: r[1], c: [r[0], r[1], k$(+r[2]), k$(+r[3]), (+r[5]).toFixed(0) + '%'] })), { k: 'tot', cls: 'tot', c: ['Total', '', k$(+rec('18-totals')[0][4]), '', ''] }] } },
	],
	aqlRef: '18-totals',
	sdk: `// render subtotal rows when category changes; grand_total is on
// every row
const rows = totals.result.rows;`,
	sql: ['Use <code>GROUP BY ROLLUP</code> or window sums, and the totals must respect every filter'],
	anfra: ['<code>revenue | exclude_grains(products.name)</code> is "revenue for the whole category", and it follows the filters'],
	prompt: 'Show revenue by product grouped under category subtotal rows with each product\'s share of its category, and a grand total row, from one query.',
	generic: 'Use metric | exclude_grains(child_dims) for subtotals and shares in one query; draw subtotal rows client-side.',
},
{
	id: 'percent-of-total', prim: 'shape', status: 'works', title: 'Percent of total',
	one: 'Show each country\'s share of all revenue, like Australia at 24%.',
	does: 'Each country bar is labelled with its share. Australia has 24.4% and Japan 9.2%. Filtering to Software changes the shares.',
	why: 'Shares are easier to compare than raw sums.',
	viz: 'Bars with % labels.',
	trailer: [
		{ cap: 'Revenue', viz: ctryBars() },
		{ cap: 'percent_of_total(revenue, \'grand_total\')', viz: ctryBars({ f: (c) => ({ t: pct(c.s, 1) }) }) },
	],
	aqlRef: '19-pct',
	aqlNote: 'Found while checking: the result is a fraction (0.244). The reference describes a value from 0 to 100.',
	sdk: `// Intl.NumberFormat({ style: 'percent' })
label: (r) => pct.format(Number(r.share));`,
	sql: ['Write <code>SUM(x) / SUM(SUM(x)) OVER ()</code>, and handle filters and division by zero'],
	anfra: ['A built-in function with row, column and grand totals'],
	prompt: 'Label each country bar with its share of total revenue using percent_of_total (it returns a fraction; format with Intl percent).',
	generic: 'Add percent_of_total(metric, \'grand_total\') and format the fraction as a percent.',
},
{
	id: 'cumulative-moving', prim: 'shape', also: ['time'], status: 'works', title: 'Running total & moving calculation',
	one: 'Add a running total and a 3-month average to a monthly chart.',
	does: 'Toggles add a <b>running total</b> line and a <b>3-month moving average</b> over the monthly bars.',
	why: 'Readers ask two questions here: "are we on track?" and "is it trending?"',
	viz: 'Columns with two overlay lines.',
	trailer: [
		{ cap: 'Monthly revenue', viz: trend(TOTAL, { max: 120000 }) },
		{ cap: 'window_avg(revenue, -2..0, order: month)', viz: trend(TOTAL, { max: 120000, line: AVG3 }) },
		{ cap: 'running_total(orders.ordered_at), on its own scale', viz: { kind: 'lines', title: 'Cumulative revenue', x: ['Jun 25', 'Dec 25', 'Jun 26', 'Sep 26'], series: [{ name: 'Running total', vals: CUM }] } },
	],
	aqlRef: '20-window',
	sdk: `// one query, three measures; the toggles only redraw`,
	sql: ['Write <code>SUM() OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)</code>, after filling months that have no rows'],
	anfra: ['<code>running_total</code> and <code>window_avg</code> with a range such as <code>-2..0</code>'],
	prompt: 'Add a running-total line and a 3-month moving-average line to the monthly revenue chart, each behind a toggle; plot the running total on a secondary axis.',
	generic: 'Use running_total and window_avg measures in the same query; toggles are renderer state.',
},
{
	id: 'index-100', prim: 'shape', also: ['time'], status: 'works', title: 'Indexed view',
	one: 'Start every line at 100, so growth compares fairly between big and small series.',
	does: 'The lines switch from dollars to an index. Parts (worth a few hundred dollars a month) and Services (worth tens of thousands) now share one scale. Parts ends at 84.',
	why: 'Comparing growth across series of very different sizes is hard in raw units.',
	viz: 'Four category lines, rebased.',
	trailer: (() => {
		const r = rec('21-index');
		const s = (j) => CATS.map((c) => ({ name: c, vals: M.map((d) => { const f = (j === 3 ? D['21-index'] : D['21-index']).find((x) => x[0] === d && x[1] === c); return f ? +f[j] : null; }) }));
		return [
			{ cap: 'Revenue: Services dwarfs Parts', chips: [chip('u', '$', 'on'), chip('i', 'Index')], viz: { kind: 'lines', title: 'Revenue by category', x: ['Jun 25', 'Dec 25', 'Jun 26', 'Sep 26'], series: s(2) } },
			{ cap: 'revenue * 100 / first_value(revenue, order: month, partition: category)', at: 'c:i', chips: [chip('u', '$'), chip('i', 'Index = 100', 'on')], viz: { kind: 'lines', title: 'Index (Jun 25 = 100)', x: ['Jun 25', 'Dec 25', 'Jun 26', 'Sep 26'], series: s(3) } },
		];
	})(),
	aqlRef: '21-index',
	sdk: `unitToggle.onchange = () =>
  draw(
    q.result,
    unitToggle.value === 'index' ? 'index_100' : 'revenue',
  );`,
	sql: ['Write <code>FIRST_VALUE() OVER (PARTITION BY category ORDER BY month)</code> and divide by it'],
	anfra: ['<code>first_value</code> with <code>partition</code>, in one measure'],
	prompt: 'Add an Index toggle to the category trend that rebases every category to 100 at its first month using first_value.',
	generic: 'Rebase series with metric * 100 / first_value(metric, order: time, partition: series).',
},
{
	id: 'ranking', prim: 'shape', status: 'works', title: 'Rank',
	one: 'Number each customer by revenue, overall and within their country.',
	does: 'Two rank columns appear: overall, and within the customer\'s country.',
	why: 'Saying "the best in each region" needs a rank within each group.',
	viz: 'Leaderboard with rank badges.',
	trailer: [
		{ cap: 'Customers by revenue', viz: { kind: 'table', title: 'Leaderboard', head: ['Customer', 'Country', 'Revenue'], rows: rec('23-rank').slice(0, 8).map((r) => ({ k: r[0], c: [r[0], r[1], k$(+r[2])] })) } },
		{ cap: 'rank(…, partition: []) and rank(…, partition: customers.country)', viz: { kind: 'table', title: 'Leaderboard', head: ['#', 'Customer', 'Country', 'Revenue', 'In country'], widths: '.4fr 1.2fr 1fr .8fr .7fr', rows: rec('23-rank').slice(0, 8).map((r) => ({ k: r[0], c: ['#' + r[3], r[0], r[1], k$(+r[2]), '#' + r[4]], cls: r[1] === 'Australia' ? 'hl' : '' })) } },
	],
	aqlRef: '23-rank',
	aqlNote: 'Leaving out <code>partition</code> ranks each row against itself. Use <code>partition: []</code> for a whole-table rank.',
	sdk: `// read rank columns straight from the rows; sort stays server-side`,
	sql: ['Write <code>RANK() OVER (PARTITION BY country ORDER BY SUM(…) DESC)</code> on top of an aggregate subquery'],
	anfra: ['<code>rank(order: revenue | desc(), partition: customers.country)</code>'],
	prompt: 'Add overall rank and rank-within-country columns to the customer leaderboard and highlight country leaders.',
	generic: 'Use rank(order: metric | desc(), partition: []) and partitioned rank in one query.',
},
// ===== Parameters =====
{
	id: 'bins', prim: 'param', also: ['shape'], status: 'works', title: 'Binning',
	one: 'Group orders into size bands, like under $100 or over $1,000.',
	does: 'Orders fall into four value bands. A width slider rebuilds the histogram at $250 or $500 per bin.',
	why: 'Bands turn a long list of order values into a story about order size.',
	viz: 'Band bars with orders and revenue.',
	trailer: [
		{ cap: 'Order value bands', chips: [chip('b', 'Bands', 'on'), chip('w', 'Width: $250')], viz: { kind: 'bars', title: 'Orders by value band', items: rec('25-bins').map((r) => ({ k: r[0].slice(3), v: +r[1], t: r[1] + ' orders' })) } },
		{ cap: 'Revenue by band: big orders dominate', viz: { kind: 'bars', title: 'Revenue by value band', items: rec('25-bins').map((r) => ({ k: r[0].slice(3), v: +r[2], t: k$(+r[2]) })) } },
		{ cap: 'Width $250 histogram (a new query per width)', at: 'c:w', chips: [chip('b', 'Bands'), chip('w', 'Width: $250', 'on')], viz: { kind: 'cols', title: 'Orders by value', every: 2, items: rec('25b-binwidth').slice(0, 14).map((r) => ({ k: 'b' + r[0], l: '$' + r[0], v: +r[1] })) } },
	],
	aqlRef: '25-bins',
	aqlNote: '<code>orders.order_value</code> is a Dataset dimension (each order\'s revenue), and <code>case()</code> labels the band. The bin width lives in the AQL text, so each width is a new query built from a fixed list.',
	sdk: `// a fixed list: never free text
const WIDTHS = [100, 250, 500];
widthMenu.onchange = () =>
  showQuery(binsQuery(WIDTHS[widthMenu.selectedIndex]));`,
	sql: ['Write a subquery for each order\'s value, then <code>FLOOR(v / 250) * 250</code>, then group again'],
	anfra: ['Declare <code>orders.order_value</code> and the band once. The joins and the two levels of grouping are handled for you'],
	prompt: 'Group orders into value bands (under $100, $100–499, $500–999, $1,000+) showing orders and revenue per band, plus a histogram with a bin-width menu.',
	generic: 'Dimensionalize a per-entity value, then band it with case() or floor(); offer bin widths from a fixed list (one query each).',
},
{
	id: 'targets', prim: 'param', also: ['time'], status: 'works', title: 'Reference line',
	one: 'Draw a target line and show how far each month is above or below it.',
	does: 'Each month\'s revenue sits against the <b>monthly target</b> of the markets in view: $84k for all six countries. Filtering to <b>Japan</b> moves the line to Japan\'s $8k, where only August beat it (160%).',
	why: 'Most performance pages need a plan to compare against, and the plan has to follow the filters.',
	viz: 'Columns with a dashed target line and attainment labels.',
	trailer: (() => {
		const all = rec('26b-target-all'), jp = rec('26-target');
		const items = (r, lab) => r.map((x) => { const a = +x[1] / +x[2]; return { k: x[0], l: ML(x[0]), v: +x[1], t: lab ? pct(a) : '', cls: lab && a >= 1 ? 'alt' : '' }; });
		return [
			{ cap: 'All markets: target = sum of monthly targets, $84k', chips: [chip('c', 'Country: All')], viz: { kind: 'cols', title: 'Revenue 2026 vs target', items: items(all, true), max: 110000, target: 84000, targetLabel: '$84k target' } },
			{ cap: 'Country → Japan: the target follows the filter, $8k', at: 'c:c', chips: [chip('c', 'Country: Japan', 'on')], viz: { kind: 'cols', title: 'Revenue 2026 vs target (Japan)', items: items(jp, true), max: 14000, target: 8000, targetLabel: '$8k target' } },
		];
	})(),
	aqlRef: '26-target',
	aqlNote: '<code>monthly_target</code> is a Dataset metric over a new <code>markets</code> model (one row per country, with its monthly target), added to the ecommerce sample for this card. Because it sums the markets in scope, it follows any country filter.',
	sdk: `// the target is data, so it obeys the same mappings as revenue
app.mapControl(country, trend, { field: 'customers.country' });
// draw target as a dashed line; colour bars where revenue / target
// >= 1`,
	state: 'Analytical: the target comes from the data and follows filters. A renderer-only constant would not.',
	sql: ['Join a targets table at the right grain, and keep it in step with every filter'],
	anfra: ['<code>monthly_target</code> is a metric like revenue: the same filters reach both'],
	prompt: 'Show 2026 monthly revenue with the monthly_target metric as a dashed line and attainment % on each bar, with a Country filter mapped so the target follows it.',
	generic: 'Model targets as data (a targets model and metric) so the reference line follows filters; show gap and attainment per period.',
},
{
	id: 'trend-line', prim: 'param', also: ['time', 'shape'], status: 'app', title: 'Trend line',
	one: 'Draw the line of best fit through a chart, to show which way it is heading.',
	does: 'A dashed <b>linear</b> trend runs through 16 months of revenue. Across every month it slopes down, −$56 a month, because September 2026 has only 23 of 30 days. <b>Leaving out that month</b> turns it up, to +$342 a month. <b>Exponential</b> and a <b>3- or 6-month moving average</b> are one click away, and <b>Break down by category</b> fits a line for each: Software grows +$450 a month while Services falls −$202.',
	why: 'Monthly numbers bounce around. A trend line answers "are we growing?" without the reader squinting at the bars.',
	viz: 'Monthly columns with a dashed trend line; per-category lines when broken down.',
	trailer: (() => {
		const fitL = (vals, n) => { const p = vals.slice(0, n).map((v, i) => [i, v]); const mx = p.reduce((a, q) => a + q[0], 0) / n, my = p.reduce((a, q) => a + q[1], 0) / n; let sxy = 0, sxx = 0; for (const [x, v] of p) { sxy += (x - mx) * (v - my); sxx += (x - mx) ** 2; } const b = sxy / sxx; return vals.map((_, i) => my + b * (i - mx)); };
		const o = { max: 120000, lineDash: true };
		return [
			{ cap: 'Monthly revenue: up or down?', chips: [chip('t', 'Trend line: off')], viz: trend(TOTAL, { max: 120000 }) },
			{ cap: 'Linear, every month: −$56 a month', at: 'c:t', chips: [chip('t', 'Trend line: Linear', 'on')], viz: trend(TOTAL, { ...o, line: fitL(TOTAL, 16) }) },
			{ cap: 'Leave out Sep 26 (23 of 30 days): +$342 a month', at: M[15], chips: [chip('t', 'Trend line: Linear'), chip('p', 'Leave out Sep 26', 'on')], viz: trend(TOTAL, { ...o, line: fitL(TOTAL, 15), f: (i) => ({ cls: i === 15 ? 'partial' : '' }) }) },
			{ cap: '3-month moving average: window_avg(revenue, -2..0)', at: 'c:t', chips: [chip('t', 'Trend line: Moving average', 'on')], viz: trend(TOTAL, { ...o, line: AVG3.map((v, i) => i < 2 ? null : v) }) },
		];
	})(),
	aqlRef: null, aqlWhy: 'the query returns the points; a moving average comes from window_avg',
	aqlInline: `explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, avg_3m: window_avg(revenue, -2..0, order: orders.ordered_at | month()), last_order_day: orders | max(orders.ordered_at) } sorts { period asc } }`,
	sdk: `// least squares on the rows the query returned
function linear(ys) {
  const n = ys.length, mx = (n - 1) / 2;
  const my = ys.reduce((a, y) => a + y, 0) / n;
  let sxy = 0, sxx = 0;
  ys.forEach((y, x) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  });
  const b = sxy / sxx; // change per month
  return ys.map((_, x) => my + b * (x - mx));
}
const rows = q.result.rows;
const last = rows.at(-1);
// leave out a month that isn't over yet
const full = isPartial(last.last_order_day)
  ? rows.slice(0, -1) : rows;
drawDashed(linear(full.map((r) => +r.total_revenue)));`,
	state: 'Renderer state: the fit type and its options. The points, the moving average and the incomplete-month check come from the query, so filters reach them.',
	limits: 'Works with app code: AQL has no regression function, so the app fits linear and exponential lines on the returned rows, as a chart library would. Exponential needs values above zero.',
	sql: ['Add a month index, then <code>REGR_SLOPE(revenue, idx)</code> and <code>REGR_INTERCEPT</code> over an aggregate subquery', 'Write a <code>MAX(ordered_at)</code> check to drop the month that isn\'t over, and repeat it per category'],
	anfra: ['The query returns the points and <code>last_order_day</code>; the moving average is <code>window_avg</code> with a <code>partition</code> for each category'],
	prompt: 'Add a dashed trend line to the monthly revenue chart with Linear, Exponential and Moving average (3 or 6 months) options, a Break down by category toggle, and an option to leave out the incomplete last month.',
	generic: 'Fit the trend on the query\'s rows in the app (least squares; log values for exponential), use window_avg for moving averages, and leave out an incomplete last period.',
},
{
	id: 'what-if', prim: 'param', status: 'app', title: 'What-if parameter', video: 'media/what-if-parameter.mp4', app: 'patterns/what-if-parameter',
	one: 'Try a price change, like +10% on Software, and watch revenue change.',
	does: 'The reader picks the <b>Optimistic</b> preset (Software +10%, Services +5%), drags <b>Hardware</b> up, then tries <b>Price war</b>. Scenario revenue moves against actual by category and by month: Optimistic is $1,327,669 against $1,283,053 actual, +3.5%.',
	why: 'Readers plan by asking "what if?". Answering in the app saves building a spreadsheet.',
	viz: 'Actual vs scenario bars, with the delta.',
	trailer: [
		{ cap: 'Actual revenue', chips: [chip('u', 'Software price: +0%')], viz: catBars(CAT_TOTAL, { title: 'Revenue by category' }) },
		{ cap: 'Software +10% → scenario metric (new query)', at: 'c:u', chips: [chip('u', 'Software price: +10%', 'on'), chip('d', 'Δ +$49.7k', 'sel')], viz: catBars(Object.fromEntries(rec('27-whatif').map((r) => [r[0], +r[2]])), { title: 'Scenario (bar) vs actual (grey)', f: (c) => ({ g: CAT_TOTAL[c] }) }) },
	],
	aqlRef: '51-whatif',
	aqlNote: 'The recording is the real Data App <code>apps/patterns/what-if-parameter.html</code>. Each change rebuilds this query from validated numbers (price factor and volume factor per category), because anfra 0.8.0 has no query parameters. The query above is one example parameter set.',
	sdk: `// a number from a slider, validated
function scenario(upliftPct) {
  const f = (1 + Number(upliftPct) / 100).toFixed(4);
  prev?.abort();
  prev = app.createQuery('s' + ++n, {
    dataset: 'ecommerce',
    aql: WHATIF_AQL.replace('1.10', f),
  });
  return app.execute();
}
// Proposed: aql with $uplift and app.createParameter('uplift', {
// type: 'number' })`,
	limits: 'Works with app code. Typed query parameters (<code>createParameter</code>) are proposed, so the AQL wouldn\'t have to be rebuilt.',
	sql: ['Template the factor into SQL safely, and repeat the revenue logic'],
	anfra: ['A scenario metric sits next to the real one, and both go through the same joins'],
	prompt: 'Add a price-uplift slider (0–20%) for one category that shows scenario revenue next to actual by category, with the delta. Build the scenario query only from the validated number.',
	generic: 'Express a scenario as a metric next to the actual one; rebuild only from validated numeric inputs until query parameters exist.',
},
{
	id: 'cohort-from-rank', prim: 'param', also: ['sel'], status: 'app', title: 'Rule-based cohort',
	one: 'Define a group by a rule, like the top 10% of customers by revenue.',
	does: 'The reader picks the rule <b>Top 10% by revenue</b>. The app ranks customers into deciles and saves decile 1 as a cohort. Other charts can then compare that cohort with everyone else.',
	why: 'A cohort defined by a rule can be explained and rebuilt. One picked by hand can\'t.',
	viz: 'Decile bars, then a cohort chip.',
	trailer: [
		{ cap: 'ntile(10, order: revenue | desc(), partition: [])', viz: { kind: 'table', title: 'Customers', head: ['Customer', 'Revenue', 'Decile'], rows: rec('30-percentrank').slice(0, 7).map((r) => ({ k: r[0], c: [r[0], k$(+r[1]), String(r[2])], cls: r[2] === '1' ? 'hl' : '' })) } },
		{ cap: 'Decile 1 → cohort (20 customer ids)', chips: [chip('c', 'Cohort: Top 10% (20)', 'on')], viz: { kind: 'kpis', title: 'Cohort', items: [{ k: 'Customers', v: 20, fmt: 'int' }, { k: 'Their revenue', v: rec('30-percentrank').slice(0, 20).reduce((a, r) => a + +r[1], 0) }] } },
	],
	aqlRef: '30-percentrank',
	sdk: `await app.execute();
const ids = deciles.result.rows
  .filter((r) => r.decile === '1')
  .map((r) => r.id);
inCohort.setCondition({ operator: 'is', values: ids });`,
	limits: 'Works with app code: two steps, rank and then filter. Promoting the decile to a Dataset dimension would make it one filter.',
	sql: ['Write <code>NTILE(10) OVER …</code> in a CTE, then join it back into each query'],
	anfra: ['<code>ntile</code> in one measure, and the cohort is a list of IDs in a filter'],
	prompt: 'Let the reader define a cohort by rule (top 10% / 25% customers by revenue) using ntile, then compare that cohort with the rest across the page.',
	generic: 'Compute ntile buckets, turn the chosen bucket\'s IDs into a filter-based cohort.',
},
// ===== Snapshots =====
{
	id: 'bookmarks', prim: 'snap', status: 'app', title: 'Bookmarks',
	one: 'Save the current view and come back to it with one click.',
	does: 'The reader saves the current view as a bookmark. Later, one click restores the filters, selection, sort, grain and time zone, and the page runs again.',
	why: 'Exploring means trying things, and a bookmark lets the reader come back to one.',
	viz: 'A bookmark list beside the chart.',
	trailer: [
		{ cap: 'Explore: Japan, Q2 2026, weekly', chips: [chip('c', 'Japan', 'on'), chip('r', 'Q2 2026', 'on'), chip('g', 'week', 'on'), chip('s', '★ Save', 'btn')], viz: { kind: 'note', title: 'Bookmarks', items: [{ k: 'b1', html: '<span>All countries, monthly</span><span class="tag">10:02</span>' }] } },
		{ cap: 'Save → snapshot of analytical state', at: 'c:s', chips: [chip('c', 'Japan', 'on'), chip('r', 'Q2 2026', 'on'), chip('g', 'week', 'on'), chip('s', '★ Saved', 'btn')], viz: { kind: 'note', title: 'Bookmarks', animateNew: true, items: [{ k: 'b1', html: '<span>All countries, monthly</span><span class="tag">10:02</span>' }, { k: 'b2', cls: 'item on', html: '<span>Japan · Q2 2026 · weekly</span><span class="tag">10:06</span>' }, { k: 'code', cls: 'code', html: "{ controls: { country: {is:['Japan']},\n  range: {between:['2026-04-01','2026-06-30']},\n  grain: 'week' }, selection: null, sorts: {} }" }] } },
	],
	aqlRef: null, aqlWhy: 'no query change: a bookmark only stores input',
	aqlInline: `// a bookmark never stores AQL text, only the reader's input on top of it`,
	sdk: `function snapshot() {
  return {
    controls: Object.fromEntries(
      Object.entries(app.controls).map(([k, c]) => [
        k,
        c.appliedCondition,
      ]),
    ),
    selection: app.appliedSelection && {
      source: app.appliedSelection.source,
      rows: app.appliedSelection.rows,
    },
    sorts: Object.fromEntries(
      Object.entries(app.queries).map(([k, q]) => [k, q.sort]),
    ),
    timezone: app.timezone,
  };
}
function restore(s) {
  for (const [k, c] of Object.entries(s.controls))
    c ? app.controls[k].setCondition(c) : app.controls[k].reset();
  for (const [k, so] of Object.entries(s.sorts))
    app.queries[k].setSort(so);
  app.setTimezone(s.timezone);
  // selection rows need re-matching after the source re-runs
  return app.execute();
}`,
	state: 'Snapshot: only analytical state (applied conditions, selection, sorts, time zone). Renderer and runtime state are left out.',
	limits: 'Works with app code, for this session only. Data Apps run in a sandbox where <code>localStorage</code> throws, so saving across sessions needs a host (see "Saved views").',
	sql: ['Serialize your own filter objects, and rebuild the SQL from them'],
	anfra: ['The SDK already separates the applied state (<code>appliedCondition</code>, <code>appliedSelection</code>, <code>sort</code>), so a snapshot is a small map'],
	prompt: 'Add a Bookmarks panel that saves the current applied filters, sorts, grain and time zone (not renderer state) and restores them in one click, for this session.',
	generic: 'Snapshot appliedCondition of every control, appliedSelection, sorts and timezone; restore with setCondition/setSort/setTimezone then execute.',
},
{
	id: 'url-state', prim: 'snap', status: 'proposed', title: 'Filter state URL',
	one: 'Copy a link that opens the app with the same filters.',
	does: 'The reader presses <b>Share</b> and gets a link that encodes the snapshot. A colleague opens it and sees Japan, Q2 and weekly.',
	why: 'Saying "look at this" works better with a link than with a set of instructions.',
	viz: 'A URL bar that grows parameters as state changes.',
	trailer: [
		{ cap: 'Change filters…', chips: [chip('c', 'Japan', 'on'), chip('g', 'week', 'on')], viz: { kind: 'note', title: 'Link', items: [{ cls: 'url', html: '/apps/extension-showcases/ecommerce-overview' }] } },
		{ cap: 'Proposed: host writes the snapshot to the URL', chips: [chip('c', 'Japan', 'on'), chip('g', 'week', 'on'), chip('sh', '🔗 Share', 'btn'), chip('p', 'proposed', 'prop')], viz: { kind: 'note', title: 'Link', items: [{ cls: 'url', html: '/apps/…/ecommerce-overview?s=eyJjb250cm9scyI6eyJjb3VudHJ5Ijp7…' }, { cls: 'warn', html: 'The sandbox has an opaque origin: the app can\'t read or write the page URL. The host has to do it.' }] } },
	],
	aqlRef: null, aqlWhy: 'no query change',
	aqlInline: `// same snapshot as "Bookmarks", carried by the host in the URL`,
	sdk: `// Proposed (not real API):
// Anfra.state.write(snapshot());           host encodes into ?s=
// const s = Anfra.state.read(); if (s) restore(s);
// app.d.ts already notes: "a control set from a URL at startup is
// not an unapplied change"`,
	limits: 'Proposed. The SDK expects controls to be set at startup ("a control set from a URL at startup is not an unapplied change"), but anfra 0.8.0 has no URL API for the app.',
	limitsShort: 'no URL state API for sandboxed apps',
	sql: ['Encode and decode query strings by hand, and check every value'],
	anfra: ['Proposed: the host writes the snapshot to the URL and gives it back at startup'],
	prompt: 'Add a Share button that produces a copyable snapshot (JSON) of the applied state, and a "Paste snapshot" box that restores it, as a stand-in until hosts support URL state.',
	generic: 'Until hosts support URL state, offer copy/paste of a JSON snapshot that restores applied controls, sorts and timezone.',
},
{
	id: 'reset', prim: 'snap', also: ['pred'], status: 'works', title: 'Reset filters',
	one: 'Clear one filter, or all of them, back to the defaults.',
	does: 'Each chip has an × that resets that filter. <b>Reset all</b> resets every control, clears the selection and restores the AQL\'s own sort.',
	why: 'Readers explore more freely when getting back is one click.',
	viz: 'Chips with × and a Reset all link.',
	trailer: [
		{ cap: 'Three changes', chips: [chip('c', 'Japan ×', 'on'), chip('s', 'Completed ×', 'on'), chip('sel', 'Selected: Software ×', 'sel'), chip('r', 'Reset all', 'btn')], viz: trend(M.map((d) => CM.Japan[d] * 0.5), { max: Math.max(...TOTAL) * 1.08 }) },
		{ cap: 'Reset all → defaults, one execute()', at: 'c:r', chips: [chip('c', 'Country: All'), chip('s', 'Status: All')], viz: trend(TOTAL) },
	],
	aqlRef: null, aqlWhy: 'no query change',
	aqlInline: `// defaults live in the declaration: createFilter(name, { default: { operator, values } })`,
	sdk: `chipX.onclick = () => {
  filter.reset();
  app.execute();
};
resetAll.onclick = () => {
  for (const c of Object.values(app.controls)) c.reset();
  app.clearSelection();
  for (const q of Object.values(app.queries)) q.setSort([]);
  app.execute();
};`,
	sql: ['Remember the defaults and rebuild the clean SQL'],
	anfra: ['<code>reset()</code> returns to the declared <code>default</code>, and <code>setSort([])</code> to the AQL\'s order'],
	prompt: 'Give every filter chip an × that resets it, and add a Reset all that resets controls, clears the selection and restores default sorts in one execute().',
	generic: 'Use control.reset(), app.clearSelection() and setSort([]) for one-click resets.',
	aqlNote: 'Trailer frame 1 approximates the filtered numbers at half of Japan\'s revenue.',
},
{
	id: 'undo-redo', prim: 'snap', status: 'app', title: 'Undo / redo',
	one: 'Step back and forward through your filter and drill changes.',
	does: 'Every applied change pushes a snapshot. <b>Undo</b> restores the previous one, and <b>Redo</b> goes forward again.',
	why: 'Without undo, readers stay cautious. With it, they try more.',
	viz: 'A history strip under the chips.',
	trailer: [
		{ cap: 'History: 3 steps', chips: [chip('u', '↶ Undo', 'btn'), chip('r', '↷ Redo')], viz: { kind: 'note', title: 'History', items: [{ k: 'h1', html: '<span>1 · Country = Japan</span>' }, { k: 'h2', html: '<span>2 · Grain = week</span>' }, { k: 'h3', cls: 'item on', html: '<span>3 · Selected: Software</span><span class="tag">current</span>' }] } },
		{ cap: 'Undo → restore snapshot 2', at: 'c:u', chips: [chip('u', '↶ Undo', 'btn'), chip('r', '↷ Redo', 'btn')], viz: { kind: 'note', title: 'History', items: [{ k: 'h1', html: '<span>1 · Country = Japan</span>' }, { k: 'h2', cls: 'item on', html: '<span>2 · Grain = week</span><span class="tag">current</span>' }, { k: 'h3', html: '<span style="opacity:.5">3 · Selected: Software</span>' }] } },
	],
	aqlRef: null, aqlWhy: 'no query change',
	aqlInline: `// undo replays input, never AQL`,
	sdk: `const past = [],
  future = [];
app.subscribe(() => {
  /* after a successful execute with changes */
});
async function commit() {
  past.push(snapshot());
  future.length = 0;
  await app.execute();
}
async function undo() {
  if (past.length < 2) return;
  future.push(past.pop());
  await restore(past.at(-1));
}
async function redo() {
  const s = future.pop();
  if (s) {
    past.push(s);
    await restore(s);
  }
}`,
	limits: 'Works with app code, using the snapshot and restore functions from "Bookmarks".',
	sql: ['Same as bookmarks, plus two stacks'],
	anfra: ['A snapshot is small and holds only input, so undo is cheap. Results may come from the cache'],
	prompt: 'Add undo/redo (buttons and Ctrl+Z / Ctrl+Shift+Z) over applied state changes, using snapshots of controls, selection, sorts and timezone.',
	generic: 'Push a snapshot per applied change; undo/redo restore snapshots and execute.',
},
{
	id: 'saved-views', prim: 'snap', status: 'proposed', title: 'Saved views',
	one: 'Keep named views that are still there next week, on any device.',
	does: 'The reader saves a view. Next week, on another device, it\'s in their list. Today a bookmark is lost when the frame reloads.',
	why: 'A Data App people return to needs to remember their views.',
	viz: 'A saved-views menu.',
	trailer: [
		{ cap: 'Saved views (proposed)', chips: [chip('v', '☰ Views', 'btn'), chip('p', 'proposed', 'prop')], viz: { kind: 'note', title: 'My views', items: [{ html: '<span>Monday: APAC weekly</span><span class="tag">saved 7 Oct</span>' }, { html: '<span>Finance: FY27 Q1</span><span class="tag">saved 1 Oct</span>' }, { cls: 'warn', html: 'Sandbox: localStorage, sessionStorage and cookies throw. Saving has to go through the host.' }] } },
	],
	aqlRef: null, aqlWhy: 'no query change',
	aqlInline: `// persisted snapshot = same shape as a bookmark`,
	sdk: `// Proposed (not real API):
// await Anfra.views.save('Monday: APAC weekly', snapshot());
// const views = await Anfra.views.list();`,
	limits: 'Proposed. API.md: "The origin is opaque: keep state in variables, since localStorage, sessionStorage and cookies throw."',
	limitsShort: 'sandboxed apps cannot persist state; needs a host views API',
	sql: ['Build your own table and API for saved views'],
	anfra: ['Proposed: host-side storage of snapshots, keyed by reader and app'],
	prompt: 'Design how this app would save named views across sessions. Implement in-session bookmarks now, and stub a saveView/listViews interface for the host to fill in.',
	generic: 'Persisted views need host storage; implement in-session bookmarks and an interface the host can back later.',
},
{
	id: 'refresh', prim: 'snap', also: ['time'], status: 'works', title: 'Refresh & cache',
	one: 'Rerun the queries and see how fresh the data is.',
	does: 'A freshness line shows the newest data, when the query ran and whether it came from cache. <b>Refresh</b> skips the cache.',
	why: 'Readers trust a number more when they can see how old it is.',
	viz: 'A freshness bar with a refresh button.',
	trailer: [
		{ cap: 'Served from cache', chips: [chip('f', 'Data as of 23 Sep · ran 10:02 · cache'), chip('r', '⟳ Refresh', 'btn')], viz: trend(TOTAL) },
		{ cap: 'app.refresh() → bustCache, executedAt updates', at: 'c:r', chips: [chip('f', 'Data as of 23 Sep · ran 10:14 · fresh', 'on'), chip('r', '⟳ Refresh', 'btn')], viz: trend(TOTAL, { note: 'debug.fromCache = false' }) },
	],
	aqlRef: '12-anchor',
	sdk: `// re-runs everything, skips result cache
refreshBtn.onclick = () => app.refresh();
app.subscribe(() => {
  const d = trend.result?.debug;
  const cache = d?.fromCache ? ' · cache' : '';
  fresh.textContent = \`ran \${ago(d?.executedAt)}\${cache}\`;
});
// live data only
setInterval(() => app.refresh(), 5 * 60_000);`,
	state: 'Runtime: <code>executedAt</code> and <code>fromCache</code>. Never saved in a snapshot.',
	sql: ['Build cache-busting and timestamps yourself'],
	anfra: ['<code>refresh()</code> and <code>result.debug</code> give the run\'s age and cache status'],
	prompt: 'Add a freshness line (latest order date, when the query ran, cache or fresh) and a Refresh button using app.refresh().',
	generic: 'Show latest-data date plus result.debug executedAt/fromCache; app.refresh() bypasses cache.',
},
];

const adds = [
	{ id: 'markets', built: true, what: 'Model markets (code, region, UTC offset, latitude, longitude, monthly_target) + customers.country_code', why: 'Exact map matching and a monthly revenue target per country that follows filters.', cards: ['single-select', 'targets'] },
	{ id: 'order-value', built: true, what: 'orders.order_value (dataset dimension) + aov (dataset metric)', why: 'Histogram brushes become filters every query understands, and controls can reach AOV.', cards: ['numeric-brush', 'bins', 'aggregate-filter'] },
	{ id: 'fiscal', built: true, what: 'orders.fiscal_year / fiscal_quarter (model dimensions)', why: 'Reusable fiscal reporting, and a starting point for a fiscal-aware date drill.', cards: ['fiscal-calendar'] },
	{ id: 'subcategory', built: true, what: 'products.subcategory, products.brand', why: 'A product hierarchy (category › subcategory › product) and a brand to break down by.', cards: ['hierarchy-drill', 'adhoc-breakdown'] },
	{ id: 'discount', built: true, what: 'orders.discount_pct + net_revenue (dataset metric)', why: 'Order discounts (0, 5 or 10%) and revenue after discount, next to gross revenue.', cards: ['what-if'] },
];
const props = [
	{ id: 'named-selections', what: 'Named, independent selections', today: 'One selection per app. The app keeps earlier picks as filters (Ctrl+click recipe).', cards: ['two-selections', 'selection-to-filter'] },
	{ id: 'params', what: 'Typed query parameters and parameter sets', today: 'A new query for each value, built from validated numbers.', cards: ['what-if', 'bins', 'top-n'] },
	{ id: 'local-targets', what: 'Controls on query-local metrics', today: '"unknown field". Promote the metric to the Dataset.', cards: ['aggregate-filter', 'top-n'] },
	{ id: 'cond-groups', what: 'Condition-group control (AND/OR)', today: 'A new query for each change.', cards: ['compound-filter'] },
	{ id: 'depends-on', what: 'Dependent filter options', today: 'An options query mapped to the parent control.', cards: ['cascading-options'] },
	{ id: 'highlight', what: 'Cross-highlight mode', today: 'Two queries, one of them mapped.', cards: ['cross-highlight'] },
	{ id: 'state-host', what: 'Host state: URL, saved views, drillthrough', today: 'In-session snapshots only, because the sandbox blocks storage and navigation.', cards: ['url-state', 'saved-views', 'drillthrough'] },
	{ id: 'anchor', what: 'Anchored relative dates (as of latest)', today: 'An anchor query, then <code>between</code>.', cards: ['as-of-anchor'] },
	{ id: 'drill-path', what: 'Drill-path control', today: 'One filter per level.', cards: ['hierarchy-drill'] },
];

window.GALLERY = { prims, demos, adds, props };
})();
