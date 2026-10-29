LIVE['bookmarks'] = {
	h: 460,
	html: `<div class="app">
		<div class="row"><select id="country" aria-label="Country"><option value="">All countries</option></select><select id="range" aria-label="Dates"></select><span class="seg" id="grain"></span></div>
		<div class="row"><span class="lbl">Sort</span><span class="seg" id="sort"><button type="button" data-s="">By date</button><button type="button" data-s="desc">By revenue</button></span><label class="lbl" for="tz">Time zone</label><select id="tz"><option value="Etc/UTC">UTC</option><option value="Asia/Tokyo">Tokyo</option><option value="America/New_York">New York</option></select></div>
		<div class="cols" style="grid-template-columns: 1.45fr 1fr">
			<div class="panel"><div class="ph"><b>Revenue<span id="for"></span></b><span class="status" id="s1"></span></div><div id="trend"></div></div>
			<div class="panel"><div class="ph"><b>Bookmarks</b><button type="button" id="save" style="height:24px;padding:0 8px;font-size:12px">★ Save view</button></div><div id="marks" style="display:grid;gap:4px"></div></div>
		</div>
		<div class="hint">App code: a bookmark holds only applied input (conditions, sort, time zone), kept in memory for this session</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Bookmarks', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at } measures { total_revenue: revenue } sorts { period asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
const range = app.createFilter('range', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Dates' });
const grain = app.createDateDrill('grain', { default: 'month', label: 'Grain' });
app.mapControl(country, trend, { field: 'customers.country' });
app.mapControl(range, trend, { field: 'orders.ordered_at' });
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
const RANGES = [['', 'All dates'], ['2025-06-01|2025-12-31', 'H2 2025'], ['2026-01-01|2026-03-31', 'Q1 2026'], ['2026-04-01|2026-06-30', 'Q2 2026'], ['2026-07-01|2026-09-30', 'Q3 2026']];
const GRAINS = ['month', 'week', 'day'];
const $c = K.$('#country'), $r = K.$('#range'), $tz = K.$('#tz');
RANGES.forEach((x) => $r.add(new Option(x[1], x[0])));
country.loadOptions().then((vals) => { vals.forEach((v) => $c.add(new Option(v, v))); sync(); });
GRAINS.forEach((g) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.g = g; b.textContent = g[0].toUpperCase() + g.slice(1); b.onclick = () => { grain.setGrain(g); app.execute(); }; K.$('#grain').appendChild(b); });
$c.onchange = () => { if ($c.value) country.setCondition({ operator: 'is', values: [$c.value] }); else country.reset(); app.execute(); };
$r.onchange = () => { if ($r.value) range.setCondition({ operator: 'between', values: $r.value.split('|') }); else range.reset(); app.execute(); };
K.$('#sort').querySelectorAll('button').forEach((b) => { b.onclick = () => { trend.setSort(b.dataset.s ? [{ field: 'total_revenue', direction: 'desc' }] : []); app.execute(); }; });
$tz.onchange = () => { app.setTimezone($tz.value); app.execute(); };

// the snapshot: applied input only, never AQL or rendered state
const cur = (c) => c.appliedCondition || c.condition;
function snapshot () {
	return { controls: Object.fromEntries(Object.entries(app.controls).map(([k, c]) => [k, cur(c)])), selection: app.appliedSelection ? { source: app.appliedSelection.source, rows: app.appliedSelection.rows } : null, sorts: { trend: trend.sort.slice() }, timezone: app.timezone };
}
function restore (s) {
	for (const [k, c] of Object.entries(s.controls)) if (c && c.values && c.values.length) app.controls[k].setCondition(c); else app.controls[k].reset();
	trend.setSort(s.sorts.trend);
	app.setTimezone(s.timezone);
	return app.execute();
}
const val = (c) => c && c.values && c.values.length ? c.values : null;
const gOf = (c) => (val(c) ? String(c.values[0]).replace('datetrunc ', '') : 'month');
function describe (s) {
	const c = val(s.controls.country), r = val(s.controls.range);
	const rl = r ? (RANGES.find((x) => x[0] === r.join('|')) || [0, r.join('–')])[1] : 'all dates';
	return (c ? c[0] : 'All countries') + ' · ' + rl + ' · ' + gOf(s.controls.grain) + 'ly' + (s.sorts.trend.length ? ' · by revenue' : '') + (s.timezone !== 'Etc/UTC' ? ' · ' + s.timezone.split('/')[1].replace('_', ' ') : '');
}
const marks = [];
let active = -1, first = true;
const hhmm = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
K.$('#save').onclick = () => { marks.push({ s: snapshot(), at: hhmm() }); active = marks.length - 1; drawMarks(); };
function drawMarks () {
	const now = JSON.stringify(snapshot());
	K.$('#marks').innerHTML = '';
	marks.forEach((m, i) => {
		const b = document.createElement('button'); b.type = 'button';
		b.style.cssText = 'height:auto;min-height:32px;padding:4px 8px;font-size:12px;line-height:16px;text-align:left;display:flex;justify-content:space-between;gap:6px';
		b.setAttribute('aria-pressed', String(JSON.stringify(m.s) === now));
		b.innerHTML = '<span>' + K.esc(describe(m.s)) + '</span><span style="color:var(--muted)">' + m.at + '</span>';
		b.title = JSON.stringify(m.s);
		b.onclick = () => { active = i; restore(m.s); };
		K.$('#marks').appendChild(b);
	});
}
const fmt = (v, g) => { const x = new Date(v); return g === 'month' ? x.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : x.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }); };
function sync () {
	const s = snapshot();
	$c.value = val(s.controls.country) ? s.controls.country.values[0] : '';
	$r.value = val(s.controls.range) ? s.controls.range.values.join('|') : '';
	$tz.value = s.timezone;
	K.$('#grain').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === gOf(s.controls.grain))));
	K.$('#sort').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(!!b.dataset.s === !!s.sorts.trend.length)));
	return s;
}
app.subscribe(() => {
	const s = sync();
	K.status(trend, K.$('#s1'));
	K.$('#for').textContent = ' · ' + describe(s);
	if (trend.result) {
		const g = gOf(s.controls.grain);
		K.columns(K.$('#trend'), trend.result.rows, { label: (r) => fmt(r.period, g), value: (r) => r.total_revenue });
		if (first && trend.state === 'success') { first = false; marks.push({ s: snapshot(), at: hhmm() }); }
	}
	drawMarks();
	K.sent(K.$('#sent'), app, [trend], () => [(trend.sort.length ? 'sort → total_revenue desc' : 'sort → the AQL\\'s own (period asc)') + ' · timezone → ' + app.timezone]);
});
app.execute();`,
};
