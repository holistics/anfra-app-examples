LIVE['cascading-options'] = {
	h: 400,
	html: `<div class="app">
		<div class="row"><label class="lbl" for="cat">Category</label><select id="cat"><option value="">All categories</option></select><span class="hint" id="count"></span></div>
		<div class="row"><span class="lbl">Product</span><span class="chips" id="prods"></span></div>
		<div class="hint" id="note">Pick a product, then a category it isn't in</div>
		<div class="panel"><div class="ph"><b>Revenue by product<span id="for"></span></b><span class="status" id="s1"></span></div><div id="bars"></div></div>
		<div class="hint">App code: the product list comes from a small options query mapped to Category, and the app drops picks that no longer fit</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Parent-child filter', timezone: 'Etc/UTC' });
const category = app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
const product = app.createFilter('product', { dataset: 'ecommerce', field: 'products.name', label: 'Product' });
const productOptions = app.createQuery('productOptions', { dataset: 'ecommerce', aql: 'explore { dimensions { product_name: products.name } sorts { product_name asc } }' });
const byProduct = app.createQuery('byProduct', { dataset: 'ecommerce', aql: 'explore { dimensions { product_name: products.name } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
app.mapControl(category, productOptions, { field: 'products.category' });
app.mapControl(category, byProduct, { field: 'products.category' });
app.mapControl(product, byProduct, { field: 'products.name' });
const picked = new Set();
const sel = K.$('#cat'), chips = K.$('#prods');
const setProduct = () => { if (picked.size) product.setCondition({ operator: 'is', values: [...picked] }); else product.reset(); };
category.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = async () => {
	if (sel.value) category.setCondition({ operator: 'is', values: [sel.value] }); else category.reset();
	const run = app.execute();
	if (picked.size) byProduct.abort();   // hold the chart until the new options say which picks still fit
	await run;
	const fit = new Set((productOptions.result?.rows || []).map((r) => r.product_name));
	const dropped = [...picked].filter((p) => !fit.has(p));
	dropped.forEach((p) => picked.delete(p));
	K.$('#note').textContent = dropped.length ? 'Dropped ' + dropped.join(', ') + ': not in ' + sel.value : 'Every picked product still fits';
	setProduct();
	app.execute();
};
const runs = { productOptions: 0, byProduct: 0 }, was = {};
app.subscribe(() => {
for (const q of [productOptions, byProduct]) { if (q.state === 'success' && was[q.name] !== 'success') runs[q.name]++; was[q.name] = q.state; }
if (productOptions.result) {
	const rows = productOptions.result.rows;
	const have = [...chips.children].map((b) => b.dataset.v).join('|');
	if (have !== rows.map((r) => r.product_name).join('|')) chips.replaceChildren(...rows.map((r) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = r.product_name; b.dataset.v = r.product_name; b.onclick = () => { picked.has(r.product_name) ? picked.delete(r.product_name) : picked.add(r.product_name); setProduct(); K.$('#note').textContent = 'Now pick a category'; app.execute(); }; return b; }));
	K.$('#count').textContent = rows.length + ' product options';
}
chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(picked.has(b.dataset.v))));
K.status(byProduct, K.$('#s1'));
const c = category.appliedCondition, p = product.appliedCondition;
K.$('#for').textContent = (c && c.values && c.values.length ? ' · ' + c.values.join(', ') : '') + (p && p.values && p.values.length ? ' · ' + p.values.join(', ') : '');
if (byProduct.result && byProduct.state !== 'executing') K.bars(K.$('#bars'), byProduct.result.rows, { label: (r) => r.product_name, value: (r) => r.total_revenue });
K.sent(K.$('#sent'), app, [productOptions, byProduct], () => ['runs so far → productOptions ' + runs.productOptions + ', byProduct ' + runs.byProduct]);
});
app.execute();`,
};
