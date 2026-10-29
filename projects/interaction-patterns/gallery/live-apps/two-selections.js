LIVE['two-selections'] = {
	h: 440,
	html: `<div class="app">
		<style>#bycat .b, #bycountry .b { grid-template-columns: 96px minmax(0, 1fr) 54px; } .tag { font-size: 12px; line-height: 16px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--rule-strong); } .tag.kept { border-style: dashed; color: var(--violet-ink); border-color: var(--violet); } .tag.sel { background: var(--violet-soft); color: var(--violet-ink); border-color: var(--violet); }</style>
		<div class="row"><span class="hint">Click a bar to start over, Ctrl+click (Cmd) to add to your picks</span><button type="button" id="add" aria-pressed="false" title="Acts like holding Ctrl">Add mode</button><button type="button" id="clear">Clear all</button></div>
		<div class="row"><span class="lbl">Revenue on this page</span><span class="kpi" id="kpi">–</span><span class="status" id="s3"></span><span class="row" id="tags"></span></div>
		<div class="cols"><div class="panel"><div class="ph"><b>Revenue by country</b><span class="status" id="s1"></span></div><div id="bycountry"></div></div>
		<div class="panel"><div class="ph"><b>Revenue by category</b><span class="status" id="s2"></span></div><div id="bycat"></div></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Multiple cross-filters', timezone: 'Etc/UTC' });
const byCountry = app.createQuery('byCountry', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
for (const [a, b] of [[byCountry, byCategory], [byCountry, kpi], [byCategory, byCountry], [byCategory, kpi]]) app.mapCrossFilter(a, b);
const keep = {
	byCountry: app.createFilter('keepCountry', { dataset: 'ecommerce', field: 'customers.country', label: 'Kept country' }),
	byCategory: app.createFilter('keepCategory', { dataset: 'ecommerce', field: 'products.category', label: 'Kept category' }),
};
for (const q of [byCategory, kpi]) app.mapControl(keep.byCountry, q, { field: 'customers.country' });
for (const q of [byCountry, kpi]) app.mapControl(keep.byCategory, q, { field: 'products.category' });
const dim = { byCountry: 'country_name', byCategory: 'category_name' };
let addMode = false;
const kept = (name) => { const c = keep[name].condition; return c && c.values ? c.values.map(String) : []; };
function onBar (q, row, e) {
	const add = addMode || e.ctrlKey || e.metaKey;
	const sel = app.selection, d = dim[q.name];
	if (!add) {
		Object.values(keep).forEach((f) => f.reset());
		const only = q.selectedRows.length === 1 && q.selectedRows[0][d] === row[d];
		if (only) app.clearSelection(); else q.select([row]);
	} else if (sel && sel.source !== q.name) {
		keep[sel.source].setCondition({ operator: 'is', values: sel.conditions[0].values });
		const mine = kept(q.name); keep[q.name].reset();
		q.select(q.result.rows.filter((r) => mine.includes(r[d]) || r[d] === row[d]));
	} else {
		const s = q.selectedRows, has = s.some((r) => r[d] === row[d]);
		const next = has ? s.filter((r) => r[d] !== row[d]) : [...s, row];
		if (next.length) q.select(next); else app.clearSelection();
	}
	app.execute();
}
K.$('#add').onclick = () => { addMode = !addMode; K.$('#add').setAttribute('aria-pressed', String(addMode)); };
K.$('#clear').onclick = () => { Object.values(keep).forEach((f) => f.reset()); app.clearSelection(); app.execute(); };
function draw (q, el) {
	if (!q.result) return;
	const d = dim[q.name], sel = q.selectedRows.map((r) => r[d]), k = kept(q.name);
	K.bars(K.$(el), q.result.rows, { label: (r) => r[d] + (k.includes(r[d]) ? ' · kept' : ''), value: (r) => r.total_revenue, on: (r) => sel.includes(r[d]) || k.includes(r[d]), pick: (r, e) => onBar(q, r, e) });
}
app.subscribe(() => {
K.status(byCountry, K.$('#s1')); K.status(byCategory, K.$('#s2')); K.status(kpi, K.$('#s3')); if (/row/.test(K.$('#s3').textContent)) K.$('#s3').textContent = '';
draw(byCountry, '#bycountry'); draw(byCategory, '#bycat');
const k = kpi.result?.rows[0]; K.$('#kpi').textContent = k ? K.money.format(k.total_revenue) : '–';
const tags = [];
for (const [name, lab] of [['byCountry', 'Country'], ['byCategory', 'Category']]) { const v = kept(name); if (v.length) tags.push('<span class="tag kept">' + lab + ': ' + K.esc(v.join(', ')) + ' (kept)</span>'); }
const sel = app.selection; if (sel && sel.rows.length) tags.push('<span class="tag sel">Selected: ' + K.esc(sel.rows.map((r) => r[dim[sel.source]]).join(', ')) + '</span>');
K.$('#tags').innerHTML = tags.join('');
K.sent(K.$('#sent'), app, [kpi, byCountry, byCategory]);
});
app.execute();`,
};
