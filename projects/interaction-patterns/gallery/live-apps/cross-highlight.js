LIVE['cross-highlight'] = {
	h: 400,
	html: `<div class="app">
		<style>
		.hl { display: grid; gap: 6px; }
		.hl .r { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; align-items: center; font-size: 12px; line-height: 16px; }
		.hl .t { position: relative; height: 14px; border-radius: 3px; }
		.hl .g, .hl .o { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; transition: width 320ms var(--ease); }
		.hl .g { background: rgb(24 20 31 / 0.12); }
		.hl .o { background: var(--violet); }
		.hl .v { grid-column: 2; color: var(--weak); font-variant-numeric: tabular-nums; margin-top: -4px; }
		.hl .v b { color: var(--violet-ink); font-weight: 600; }
		</style>
		<div class="row"><span class="hint">Hover a country to highlight its part of each category. Click to keep it highlighted, click again to let go</span></div>
		<div class="cols" style="grid-template-columns: 1fr 1.15fr"><div class="panel"><div class="ph"><b>Revenue by country</b><span class="status" id="s1"></span></div><div id="bycountry"></div></div>
		<div class="panel"><div class="ph"><b>Revenue by category<span id="for"></span></b><span class="status" id="s2"></span></div><div class="hl" id="cat"></div>
		<div class="legend" style="margin-top:8px"><span><i style="background:rgb(24 20 31 / 0.12)"></i>All countries</span><span><i style="background:var(--violet)"></i><span id="lg">Selected</span></span></div></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Cross-highlighting', timezone: 'Etc/UTC' });
const byCountry = app.createQuery('byCountry', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const CAT = 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }';
const catAll = app.createQuery('catAll', { dataset: 'ecommerce', aql: CAT });
const catSel = app.createQuery('catSel', { dataset: 'ecommerce', aql: CAT });
app.mapCrossFilter(byCountry, catSel);
const kc = (v) => K.compact.format(Number(v));
// hover previews a country, a click pins it; either way it is the selection the overlay query follows
let hovered = null, pinned = null, t = 0;
const apply = () => { clearTimeout(t); t = setTimeout(() => {
	const want = hovered || pinned, now = byCountry.selectedRows[0] || null;
	if ((want && want.country_name) === (now && now.country_name)) return;
	if (want) byCountry.select([want]); else app.clearSelection();
	app.execute();
}, 90); };
K.$('#bycountry').addEventListener('mouseleave', () => { hovered = null; apply(); });
// leaving the app's frame straight from a bar fires no mouseleave on the list
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { hovered = null; apply(); } });
window.addEventListener('message', (e) => { if (e.data && e.data.gallery === 'pointer-left') { hovered = null; apply(); } });
K.$('#bycountry').addEventListener('focusout', (e) => { if (!K.$('#bycountry').contains(e.relatedTarget)) { hovered = null; apply(); } });
app.subscribe(() => {
K.status(byCountry, K.$('#s1')); K.status(catSel, K.$('#s2'));
const picked = byCountry.selectedRows[0]?.country_name || null;
if (byCountry.result) {
	const rows = byCountry.result.rows;
	K.bars(K.$('#bycountry'), rows, { label: (r) => r.country_name, value: (r) => r.total_revenue, on: (r) => !!pinned && r.country_name === pinned.country_name,
		pick: (r) => { pinned = pinned && pinned.country_name === r.country_name ? null : r; hovered = null; apply(); } });
	K.$('#bycountry').querySelectorAll('button').forEach((b, i) => { const r = rows[i]; if (!r) return; b.onmouseenter = () => { hovered = r; apply(); }; b.onfocus = () => { hovered = r; apply(); }; });
}
K.$('#for').textContent = picked ? ': ' + picked + ' of total' : '';
K.$('#lg').textContent = picked || 'Selected';
if (catAll.result) {
	const sel = new Map((catSel.result?.rows || []).map((r) => [r.category_name, Number(r.total_revenue)]));
	const max = Math.max(...catAll.result.rows.map((r) => Number(r.total_revenue)), 1);
	const el = K.$('#cat');
	el.replaceChildren(...catAll.result.rows.map((r) => {
		const tot = Number(r.total_revenue), part = picked ? (sel.get(r.category_name) || 0) : tot;
		const d = document.createElement('div'); d.className = 'r';
		d.innerHTML = '<span>' + K.esc(r.category_name) + '</span><span class="t"><span class="g" style="width:' + (tot / max * 100) + '%"></span><span class="o" style="width:' + (part / max * 100) + '%"></span></span>'
			+ '<span class="v">' + (picked ? '<b>' + kc(part) + '</b> of ' + kc(tot) + ' · ' + Math.round(part / tot * 100) + '%' : kc(tot)) + '</span>';
		return d;
	}));
}
K.sent(K.$('#sent'), app, [catAll, catSel]);
});
app.execute();`,
};
