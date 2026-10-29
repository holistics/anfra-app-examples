LIVE['totals'] = {
	h: 480,
	html: `<style>#tbl .tw { max-height: 300px; } #tbl td { padding: 3px 6px; } tr.sub td { font-weight: 600; background: var(--sunken); } tr.grand td { font-weight: 600; border-top: 2px solid var(--ink); border-bottom: 0; position: sticky; bottom: 0; background: #fff; } td.ind { padding-left: 18px; }</style>
	<div class="app">
		<div class="row"><label class="lbl" for="country">Country</label><select id="country"><option value="">All countries</option></select><span class="hint">Subtotals, shares and the total all follow the filter</span></div>
		<div class="panel"><div class="ph"><b>Revenue by product, with category subtotals</b><span class="status" id="s1"></span></div><div id="tbl"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Subtotals & grand totals', timezone: 'Etc/UTC' });
const totals = app.createQuery('totals', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category, product_name: products.name } measures { total_revenue: revenue, category_total: revenue | exclude_grains(products.name), grand_total: revenue | exclude_grains(products.category, products.name), share_in_category: revenue * 100.0 / (revenue | exclude_grains(products.name)) } sorts { category_name asc, total_revenue desc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
app.mapControl(country, totals, { field: 'customers.country' });
const sel = K.$('#country');
country.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) country.setCondition({ operator: 'is', values: [sel.value] }); else country.reset(); app.execute(); };
const m = (v) => K.money.format(Number(v));
app.subscribe(() => {
	K.status(totals, K.$('#s1'));
	K.sent(K.$('#sent'), app, [totals]);
	if (!totals.result) return;
	const rows = totals.result.rows;
	let h = '<div class="tw"><table><thead><tr><th>Product</th><th class="num">Revenue</th><th class="num">Share of category</th><th class="num">Share of all</th></tr></thead><tbody>';
	const sub = (r) => '<tr class="sub"><td>' + K.esc(r.category_name) + ' subtotal</td><td class="num">' + m(r.category_total) + '</td><td class="num">100%</td><td class="num">' + (r.category_total / r.grand_total * 100).toFixed(1) + '%</td></tr>';
	rows.forEach((r, i) => {
		h += '<tr><td class="ind">' + K.esc(r.product_name) + ' <span class="hint">' + K.esc(r.category_name) + '</span></td><td class="num">' + m(r.total_revenue) + '</td><td class="num">' + Number(r.share_in_category).toFixed(0) + '%</td><td class="num">' + (r.total_revenue / r.grand_total * 100).toFixed(1) + '%</td></tr>';
		if (!rows[i + 1] || rows[i + 1].category_name !== r.category_name) h += sub(r);
	});
	h += '</tbody><tfoot>';
	if (rows[0]) h += '<tr class="grand"><td>Grand total</td><td class="num">' + m(rows[0].grand_total) + '</td><td></td><td class="num">100%</td></tr>';
	K.$('#tbl').innerHTML = h + '</tfoot></table></div>';
});
app.execute();`,
};
