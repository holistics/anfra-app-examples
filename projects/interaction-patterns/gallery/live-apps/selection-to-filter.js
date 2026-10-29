LIVE['selection-to-filter'] = {
	h: 430,
	html: `<div class="app">
		<style>#bycat .b, #bycountry .b { grid-template-columns: 100px minmax(0, 1fr) 54px; } .tag { font-size: 12px; line-height: 16px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--violet); background: var(--violet-soft); color: var(--violet-ink); }</style>
		<div class="row"><span class="hint">Click a bar to select it, pin it to turn it into a filter, then click again</span></div>
		<div class="row"><span class="lbl">Revenue</span><span class="kpi" id="kpi">–</span><span class="status" id="s3"></span><button type="button" id="pin" hidden></button><span class="chips" id="chips"></span><span class="tag" id="seltag" hidden></span></div>
		<div class="cols"><div class="panel"><div class="ph"><b>Revenue by country</b><span class="status" id="s1"></span></div><div id="bycountry"></div></div>
		<div class="panel"><div class="ph"><b>Revenue by category<span id="cfor"></span></b><span class="status" id="s2"></span></div><div id="bycat"></div></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Cross filter', timezone: 'Etc/UTC' });
const byCountry = app.createQuery('byCountry', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
for (const [a, b] of [[byCountry, byCategory], [byCountry, kpi], [byCategory, byCountry], [byCategory, kpi]]) app.mapCrossFilter(a, b);
const filtersByField = {
	'customers.country': app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' }),
	'products.category': app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' }),
};
for (const q of [byCategory, kpi]) app.mapControl(filtersByField['customers.country'], q, { field: 'customers.country' });
for (const q of [byCountry, kpi]) app.mapControl(filtersByField['products.category'], q, { field: 'products.category' });
const dim = { byCountry: 'country_name', byCategory: 'category_name' };
const pinned = (field) => { const c = filtersByField[field].condition; return c && c.values ? c.values.map(String) : []; };
K.$('#pin').onclick = () => {
	const sel = app.selection;
	for (const c of sel.conditions) filtersByField[c.field].setCondition({ operator: 'is', values: c.values });
	app.clearSelection();
	app.execute();
};
function draw (q, el, field) {
	if (!q.result) return;
	const d = dim[q.name], sel = q.selectedRows.map((r) => r[d]), pin = pinned(field);
	K.bars(K.$(el), q.result.rows, { label: (r) => r[d] + (pin.includes(r[d]) ? ' · pinned' : ''), value: (r) => r.total_revenue, on: (r) => sel.includes(r[d]) || pin.includes(r[d]),
		pick: (r) => { if (sel.length === 1 && sel[0] === r[d]) app.clearSelection(); else q.select([r]); app.execute(); } });
}
app.subscribe(() => {
K.status(byCountry, K.$('#s1')); K.status(byCategory, K.$('#s2')); K.status(kpi, K.$('#s3')); if (/row/.test(K.$('#s3').textContent)) K.$('#s3').textContent = '';
draw(byCountry, '#bycountry', 'customers.country'); draw(byCategory, '#bycat', 'products.category');
const k = kpi.result?.rows[0]; K.$('#kpi').textContent = k ? K.money.format(k.total_revenue) : '–';
const sel = app.selection, names = sel ? sel.rows.map((r) => r[dim[sel.source]]) : [];
const pin = K.$('#pin'); pin.hidden = !names.length; pin.textContent = 'Pin ' + names.join(', ');
const st = K.$('#seltag'); st.hidden = !names.length; st.textContent = 'Selected: ' + names.join(', ');
const chips = K.$('#chips'); chips.replaceChildren();
for (const [field, lab] of [['customers.country', 'Country'], ['products.category', 'Category']]) {
	const v = pinned(field); if (!v.length) continue;
	const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'true'); b.title = 'Remove this filter';
	b.textContent = lab + ': ' + v.join(', ') + '  ×'; b.onclick = () => { filtersByField[field].reset(); app.execute(); };
	chips.appendChild(b);
}
const cp = pinned('customers.country'); K.$('#cfor').textContent = cp.length ? ' · ' + cp.join(', ') : '';
K.sent(K.$('#sent'), app, [kpi, byCategory, byCountry]);
});
app.execute();`,
};
