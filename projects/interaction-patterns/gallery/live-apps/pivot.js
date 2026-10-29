LIVE['pivot'] = {
	h: 440,
	html: `<div class="app">
		<div class="row"><span class="lbl">Cells show</span><span class="seg" id="modes"></span></div>
		<div class="panel"><div class="ph"><b id="title">Revenue, country × category</b><span class="status" id="s1"></span></div><div id="grid"></div>
		<div class="hint" id="note"></div><div class="hint">App code: the browser lays out a flat query as the grid, because a rows { } columns { } query fails in the SDK today</div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Pivot table', timezone: 'Etc/UTC' });
const pivot = app.createQuery('pivot', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country, category_name: products.category } measures { total_revenue: revenue, share_of_country: revenue * 1.0 / (revenue | exclude_grains(products.category)), share_of_category: revenue * 1.0 / (revenue | exclude_grains(customers.country)) } sorts { country_name asc, category_name asc } }' });
const MODES = [
	{ k: 'total_revenue', l: '$', t: 'Revenue, country × category', f: (v) => K.compact.format(v), note: 'Each cell is one country and one category' },
	{ k: 'share_of_country', l: '% of country', t: 'Share of each country\\'s revenue', f: (v) => (v * 100).toFixed(0) + '%', note: 'Each row adds up to 100%: revenue / (revenue | exclude_grains(products.category))' },
	{ k: 'share_of_category', l: '% of category', t: 'Share of each category\\'s revenue', f: (v) => (v * 100).toFixed(0) + '%', note: 'Each column adds up to 100%: revenue / (revenue | exclude_grains(customers.country))' },
];
let mode = MODES[0];
const seg = K.$('#modes');
for (const m of MODES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = m.l; b.onclick = () => { mode = m; draw(); }; seg.appendChild(b); }
function draw () {
	seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === mode.l)));
	K.$('#title').textContent = mode.t; K.$('#note').textContent = mode.note;
	K.status(pivot, K.$('#s1'));
	K.sent(K.$('#sent'), app, [pivot], () => ['cells → ' + mode.k + ' (drawn in the browser, not sent)']);
	if (!pivot.result) return;
	const cells = pivot.result.rows;
	// the query is flat; the browser lays it out as countries down, categories across
	const rows = [...new Set(cells.map((r) => r.country_name))], cols = [...new Set(cells.map((r) => r.category_name))];
	const at = (c, k) => cells.find((r) => r.country_name === c && r.category_name === k);
	const vals = cells.map((r) => Number(r[mode.k]) || 0), max = Math.max(...vals, 1e-9);
	let h = '<div class="tw"><table><thead><tr><th>Country</th>' + cols.map((k) => '<th class="num">' + K.esc(k) + '</th>').join('') + '</tr></thead><tbody>';
	for (const c of rows) {
		h += '<tr><td>' + K.esc(c) + '</td>' + cols.map((k) => { const r = at(c, k); if (!r) return '<td class="num">–</td>'; const v = Number(r[mode.k]), a = Math.sqrt(v / max);
			return '<td class="num" title="' + K.esc(c + ' · ' + k + ': ' + K.money.format(Number(r.total_revenue)) + ', ' + (r.share_of_country * 100).toFixed(1) + '% of ' + c + ', ' + (r.share_of_category * 100).toFixed(1) + '% of ' + k) + '" style="background: rgb(138 81 212 / ' + (0.06 + a * 0.7).toFixed(2) + '); color: ' + (a > 0.86 ? '#fff' : 'var(--ink)') + '; border: 2px solid #fff">' + mode.f(v) + '</td>'; }).join('') + '</tr>';
	}
	K.$('#grid').innerHTML = h + '</tbody></table></div>';
}
app.subscribe(draw);
app.execute();`,
};
