LIVE['percent-of-total'] = {
	h: 370,
	html: `<style>#bars .b { grid-template-columns: 100px minmax(0, 1fr) 116px; } #bars .v b { color: var(--ink); font-weight: 600; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Category</span><span class="chips" id="cats"></span></div>
		<div class="panel"><div class="ph"><b>Share of <span id="of">all revenue</span> by country</b><span class="status" id="s1"></span></div><div id="bars"></div>
		<div class="hint" id="sum"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Percent of total', timezone: 'Etc/UTC' });
const shares = app.createQuery('shares', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue, share: percent_of_total(revenue, \\'grand_total\\') } sorts { total_revenue desc } }' });
const cat = app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
app.mapControl(cat, shares, { field: 'products.category' });
const pct = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
let picked = '';
const chips = K.$('#cats');
const chip = (v, l) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = l; b.dataset.v = v; b.onclick = () => { picked = v; if (v) cat.setCondition({ operator: 'is', values: [v] }); else cat.reset(); app.execute(); }; chips.appendChild(b); };
chip('', 'All');
cat.loadOptions().then((vals) => vals.forEach((v) => chip(v, v)));
app.subscribe(() => {
	chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === picked)));
	K.status(shares, K.$('#s1'));
	K.$('#of').textContent = picked ? picked + ' revenue' : 'all revenue';
	if (shares.result) {
		const rows = shares.result.rows;
		K.bars(K.$('#bars'), rows, { label: (r) => r.country_name, value: (r) => r.share });
		[...K.$('#bars').children].forEach((b, i) => { b.querySelector('.v').innerHTML = '<b>' + pct.format(Number(rows[i].share)) + '</b> · ' + K.compact.format(Number(rows[i].total_revenue)); });
		const sum = rows.reduce((t, r) => t + Number(r.share), 0), tot = rows.reduce((t, r) => t + Number(r.total_revenue), 0);
		K.$('#sum').textContent = 'Shares add up to ' + pct.format(sum) + ' of ' + K.compact.format(tot) + (rows[0] ? ' · the query returns ' + Number(rows[0].share).toFixed(3) + ', shown as ' + pct.format(Number(rows[0].share)) : '');
	}
	K.sent(K.$('#sent'), app, [shares]);
});
app.execute();`,
};
