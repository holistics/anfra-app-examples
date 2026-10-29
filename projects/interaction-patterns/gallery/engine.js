const TIMELINE_SVG = '/*__TIMELINE__*/';
(() => {
'use strict';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- stage renderer ----------
function keyed(parent, sel, key, make) {
	let el = parent.querySelector(`:scope > ${sel}[data-key="${CSS.escape(key)}"]`);
	if (!el) { el = make(); el.dataset.key = key; parent.appendChild(el); el._new = true; } else el._new = false;
	return el;
}
function prune(parent, sel, keep) {
	for (const el of [...parent.querySelectorAll(`:scope > ${sel}`)]) if (!keep.has(el.dataset.key)) el.remove();
}
const pathOf = (vals, max, n) => {
	const pts = [];
	vals.forEach((v, i) => { if (v == null) return; const x = n === 1 ? 50 : ((i + 0.5) / n) * 100; const y = 100 - (v / max) * 100; pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`); });
	return pts.length ? 'M' + pts.join(' L') : 'M0 100';
};
const linePath = (vals, max, n) => {
	const pts = [];
	vals.forEach((v, i) => { if (v == null) return; const x = n === 1 ? 50 : (i / (n - 1)) * 100; const y = 100 - (v / max) * 100; pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`); });
	return pts.length ? 'M' + pts.join(' L') : 'M0 100';
};
// categorical chart palette, violet first (app-DESIGN.md: Charts)
const COLORS = ['#8a51d4', '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

const R = {};
R.cols = (vz, v) => {
	let c = vz.querySelector(':scope > .cols');
	if (!c) { c = h('div', 'cols'); vz.appendChild(c); }
	const max = v.max || Math.max(...v.items.map((d) => Math.max(d.v || 0, d.g || 0)), ...(v.line || []).filter((x) => x != null), v.target || 0) * 1.08;
	const keep = new Set();
	v.items.forEach((d, i) => {
		const col = keyed(c, '.col', d.k, () => { const e = h('div', 'col'); e.append(h('i', 'ghost'), h('i'), h('b'), h('em')); return e; });
		keep.add(d.k);
		col.style.order = i;
		col.className = 'col' + (d.cls ? ' ' + d.cls : '');
		const [g, bar, lab, val] = col.children;
		g.style.height = ((d.g || 0) / max * 100) + '%';
		const set = () => { bar.style.height = ((d.v || 0) / max * 100) + '%'; };
		if (col._new && !REDUCED) requestAnimationFrame(() => requestAnimationFrame(set)); else set();
		lab.textContent = (v.every ? (i % v.every === 0 ? d.l || '' : '') : d.l || '');
		val.textContent = d.t || '';
		val.style.bottom = `calc(${((d.v || 0) / max * 100)}% + 2px)`;
	});
	prune(c, '.col', keep);
	let ov = vz.querySelector(':scope > svg.ov');
	if (!ov) { ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ov.setAttribute('class', 'ov'); ov.setAttribute('viewBox', '0 0 100 100'); ov.setAttribute('preserveAspectRatio', 'none'); vz.appendChild(ov); }
	const lines = [v.line && { k: 'l1', vals: v.line, color: v.lineColor || '#18141f', dash: v.lineDash }, v.line2 && { k: 'l2', vals: v.line2, color: v.line2Color || '#2a78d6', dash: v.line2Dash }].filter(Boolean);
	const lk = new Set(lines.map((l) => l.k));
	for (const p of [...ov.querySelectorAll('path')]) if (!lk.has(p.dataset.key)) p.remove();
	for (const l of lines) {
		let p = ov.querySelector(`path[data-key="${l.k}"]`);
		if (!p) { p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.dataset.key = l.k; ov.appendChild(p); p.style.d = `path('${pathOf(l.vals.map(() => 0), max, v.items.length)}')`; }
		p.setAttribute('stroke', l.color);
		p.setAttribute('stroke-dasharray', l.dash ? '4 3' : '');
		const d = pathOf(l.vals, max, v.items.length);
		requestAnimationFrame(() => { p.style.d = `path('${d}')`; });
	}
	let t = vz.querySelector(':scope > .tline');
	if (v.target) {
		if (!t) { t = h('div', 'tline', '<span></span>'); vz.appendChild(t); }
		t.style.bottom = `calc(14px + ${(v.target / max) * 100}% * (1 - 28px / 100%))`;
		t.style.bottom = `calc(14px + (100% - 28px) * ${(v.target / max).toFixed(4)})`;
		t.firstChild.textContent = v.targetLabel || 'target';
	} else if (t) t.remove();
	let b = vz.querySelector(':scope > .brush');
	if (v.brush) {
		if (!b) { b = h('div', 'brush'); b.dataset.key = 'brush'; vz.appendChild(b); }
		const n = v.items.length;
		b.style.left = (v.brush[0] / n * 100) + '%';
		b.style.width = ((v.brush[1] - v.brush[0] + 1) / n * 100) + '%';
	} else if (b) b.remove();
};
R.bars = (vz, v) => {
	let c = vz.querySelector(':scope > .bars');
	if (!c) { c = h('div', 'bars'); vz.appendChild(c); }
	const max = v.max || Math.max(...v.items.map((d) => Math.max(d.v || 0, d.g || 0))) * 1.02;
	const rowH = v.rowH || 24;
	const keep = new Set();
	v.items.forEach((d, i) => {
		const r = keyed(c, '.br', d.k, () => { const e = h('div', 'br'); e.append(h('span'), h('div', 'tr', '<i class="g"></i><i></i><i class="ol"></i>'), h('b')); return e; });
		keep.add(d.k);
		r.className = 'br' + (d.cls ? ' ' + d.cls : '');
		r.style.top = (i * rowH) + 'px';
		r.children[0].textContent = d.l ?? d.k;
		const [g, bar, ol] = r.children[1].children;
		const set = () => { g.style.width = ((d.g || 0) / max * 100) + '%'; bar.style.width = ((d.v || 0) / max * 100) + '%'; ol.style.width = ((d.o || 0) / max * 100) + '%'; };
		if (r._new && !REDUCED) { r.style.opacity = 0; requestAnimationFrame(() => requestAnimationFrame(() => { r.style.opacity = ''; set(); })); } else set();
		r.children[2].textContent = d.t || '';
	});
	prune(c, '.br', keep);
};
R.lines = (vz, v) => {
	let s = vz.querySelector(':scope > svg.ln');
	if (!s) { s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ln'); s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('preserveAspectRatio', 'none'); vz.appendChild(s); }
	const all = v.series.filter((x) => !x.off).flatMap((x) => x.vals.filter((y) => y != null));
	const max = v.max || Math.max(...all) * 1.08;
	const min = v.min ?? 0;
	const n = v.n || Math.max(...v.series.map((x) => x.vals.length));
	const keep = new Set();
	v.series.forEach((x, i) => {
		const k = x.k || x.name;
		keep.add(k);
		let p = s.querySelector(`path[data-key="${CSS.escape('p:' + k)}"]`);
		const scaled = x.vals.map((y) => y == null ? null : (y - min));
		if (!p) { p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.dataset.key = 'p:' + k; s.appendChild(p); p.style.d = `path('${linePath(scaled.map((y) => y == null ? null : 0), max - min, n)}')`; }
		p.setAttribute('stroke', x.color || COLORS[i % COLORS.length]);
		p.setAttribute('class', x.dash ? 'dash' : '');
		p.style.opacity = x.off ? 0 : (x.dim ? 0.18 : 1);
		p.style.strokeWidth = x.hl ? 3 : 2;
		const d = linePath(scaled, max - min, n);
		requestAnimationFrame(() => { p.style.d = `path('${d}')`; });
	});
	for (const p of [...s.querySelectorAll('path')]) if (!keep.has(p.dataset.key.slice(2))) p.remove();
	let xl = vz.querySelector(':scope > .xl');
	if (!xl) { xl = h('div', 'xl'); vz.appendChild(xl); }
	xl.innerHTML = (v.x || []).map((t) => `<span>${esc(t)}</span>`).join('');
	let lg = vz.querySelector(':scope > .lg');
	if (!lg) { lg = h('div', 'lg'); vz.appendChild(lg); }
	const lkeep = new Set();
	v.series.filter((x) => !x.nolegend).forEach((x, i) => {
		const k = x.k || x.name; lkeep.add(k);
		const sp = keyed(lg, 'span', k, () => h('span', '', '<i></i><em style="font-style:normal"></em>'));
		sp.className = x.off ? 'off' : '';
		sp.querySelector('i').style.background = x.color || COLORS[v.series.indexOf(x) % COLORS.length];
		sp.querySelector('em').textContent = x.name;
	});
	prune(lg, 'span', lkeep);
};
R.heat = (vz, v) => {
	let g = vz.querySelector(':scope > .heat');
	if (!g) { g = h('div', 'heat'); vz.appendChild(g); }
	g.style.gridTemplateColumns = `${v.rw || 54}px repeat(${v.cols.length}, 1fr)`;
	g.style.gridTemplateRows = `14px repeat(${v.rows.length}, 1fr)`;
	const max = v.max || Math.max(...v.cells.flat().filter((x) => x != null));
	const keep = new Set();
	const put = (k, cls, make) => { const e = keyed(g, 'div', k, make); keep.add(k); return e; };
	put('corner', '', () => h('div', 'rh'));
	v.cols.forEach((c, j) => { const e = put('c|' + j, '', () => h('div', 'ch')); e.textContent = c; e.style.gridRow = 1; e.style.gridColumn = j + 2; });
	v.rows.forEach((r, i) => {
		const e = put('r|' + i, '', () => h('div', 'rh')); e.textContent = r; e.style.gridRow = i + 2; e.style.gridColumn = 1;
		v.cols.forEach((c, j) => {
			const val = v.cells[i][j];
			const cell = put(`${r}|${c}`, '', () => h('div', 'hc'));
			cell.style.gridRow = i + 2; cell.style.gridColumn = j + 2;
			const sel = (v.sel || []).includes(`${r}|${c}`);
			cell.className = 'hc' + (val == null ? ' blank' : '') + (sel ? ' sel' : '');
			const w = val == null ? 0 : (v.dimOthers && !sel ? 6 : Math.round(12 + 88 * Math.min(1, val / max)));
			// sequential violet ramp, labels stay ink (app-DESIGN.md: Charts)
			cell.style.background = sel || val == null ? '' : `color-mix(in oklch, var(--bright) ${w}%, var(--wash))`;
			cell.textContent = v.text && val != null ? v.text(val) : '';
		});
	});
	prune(g, 'div', keep);
};
R.table = (vz, v) => {
	let t = vz.querySelector(':scope > .tbl');
	if (!t) { t = h('div', 'tbl'); vz.appendChild(t); }
	const tmpl = v.widths || `repeat(${v.head.length}, 1fr)`;
	const keep = new Set(['__h', '__f']);
	const hd = keyed(t, '.tr', '__h', () => h('div', 'tr h'));
	hd.style.gridTemplateColumns = tmpl; hd.style.order = -1;
	hd.innerHTML = v.head.map((x) => `<span>${x}</span>`).join('');
	v.rows.forEach((r, i) => {
		const k = r.k || r.c.join('|');
		const e = keyed(t, '.tr', k, () => h('div', 'tr'));
		keep.add(k);
		e.style.gridTemplateColumns = tmpl; e.style.order = i;
		e.className = 'tr' + (r.cls ? ' ' + r.cls : '') + (e._new && v.animateNew ? ' new' : '');
		e.innerHTML = r.c.map((x) => `<span>${esc(x)}</span>`).join('');
	});
	t.style.display = 'flex'; t.style.flexDirection = 'column';
	const ft = keyed(t, '.ft', '__f', () => h('div', 'ft'));
	ft.style.order = 9999;
	ft.innerHTML = v.foot ? v.foot.map((x) => `<span>${x}</span>`).join('') : '';
	prune(t, '.tr', keep);
};
R.kpis = (vz, v) => {
	let g = vz.querySelector(':scope > .kpis');
	if (!g) { g = h('div', 'kpis'); vz.appendChild(g); }
	if (v.cols) g.style.gridTemplateColumns = `repeat(${v.cols}, 1fr)`;
	const keep = new Set();
	v.items.forEach((d) => {
		const e = keyed(g, '.kpi', d.k, () => h('div', 'kpi', '<small></small><strong></strong><span class="d"></span>'));
		keep.add(d.k);
		e.children[0].textContent = d.k;
		countTo(e.children[1], d.v, d.fmt || 'money');
		e.children[2].textContent = d.d || '';
		e.children[2].className = 'd' + (d.dc ? ' ' + d.dc : '');
	});
	prune(g, '.kpi', keep);
};
R.funnel = (vz, v) => {
	let g = vz.querySelector(':scope > .fun');
	if (!g) { g = h('div', 'fun'); vz.appendChild(g); }
	const keep = new Set();
	const max = Math.max(...v.items.map((d) => d.v));
	v.items.forEach((d) => {
		const e = keyed(g, '.fs', d.k, () => h('div', 'fs', '<span></span><div class="tr"><i></i></div><b></b>'));
		keep.add(d.k);
		e.className = 'fs' + (d.cls ? ' ' + d.cls : '');
		e.children[0].textContent = d.k;
		const i = e.querySelector('i');
		const set = () => { i.style.width = (d.v / max * 100) + '%'; };
		if (e._new && !REDUCED) { i.style.width = 0; requestAnimationFrame(() => requestAnimationFrame(set)); } else set();
		e.children[2].textContent = d.t || '';
	});
	prune(g, '.fs', keep);
};
const MAPPOS = { 'United States': [6, 30], Germany: [40, 14], Japan: [80, 22], Vietnam: [68, 50], Singapore: [62, 70], Australia: [80, 80] };
R.map = (vz, v) => {
	let g = vz.querySelector(':scope > .map');
	if (!g) { g = h('div', 'map'); vz.appendChild(g); }
	const max = Math.max(...v.items.map((d) => d.v));
	const keep = new Set();
	v.items.forEach((d) => {
		const e = keyed(g, '.mt', d.k, () => h('div', 'mt'));
		keep.add(d.k);
		const [x, y] = MAPPOS[d.k] || [0, 0];
		e.style.left = x + '%'; e.style.top = y + '%';
		e.className = 'mt' + (d.cls ? ' ' + d.cls : '');
		const w = Math.round(25 + 75 * (d.v / max));
		e.style.background = d.cls === 'sel' ? '' : `color-mix(in oklch, var(--bright) ${w}%, var(--wash))`;
		e.innerHTML = `${esc(d.k === 'United States' ? 'US' : d.k)}<br>${esc(d.t || '')}`;
	});
	prune(g, '.mt', keep);
};
// a range slider (one or two handles) over the bars it filters
R.range = (vz, v) => {
	let s = vz.querySelector(':scope > .rng'), b = vz.querySelector(':scope > .rb');
	if (!s) {
		s = h('div', 'rng', '<div class="rt"><i class="rf"></i><i class="rh lo"></i><i class="rh hi"></i></div><div class="re"><span></span><span></span></div>');
		b = h('div', 'rb'); vz.append(s, b);
	}
	const pc = (x) => ((x - v.min) / (v.max - v.min) * 100) + '%';
	const a = v.one === 'max' ? v.min : v.lo, z = v.one === 'min' ? v.max : v.hi;
	const f = $('.rf', s); f.style.left = pc(a); f.style.width = `calc(${pc(z)} - ${pc(a)})`;
	const lo = $('.rh.lo', s), hi = $('.rh.hi', s);
	lo.style.left = pc(v.lo ?? v.min); hi.style.left = pc(v.hi ?? v.max);
	lo.style.opacity = v.one === 'max' ? 0 : 1; hi.style.opacity = v.one === 'min' ? 0 : 1;
	const ends = s.querySelectorAll('.re span'); ends[0].textContent = v.minLabel || ''; ends[1].textContent = v.maxLabel || '';
	R.bars(b, { items: v.items, max: v.barsMax });
};
R.note = (vz, v) => {
	let g = vz.querySelector(':scope > .note');
	if (!g) { g = h('div', 'note'); vz.appendChild(g); }
	const keep = new Set();
	v.items.forEach((d, i) => {
		const k = d.k || ('n' + i);
		const e = keyed(g, 'div', k, () => h('div'));
		keep.add(k);
		e.className = (d.cls || 'item') + (e._new && v.animateNew ? ' new' : '');
		e.style.order = i;
		e.innerHTML = d.html;
	});
	prune(g, 'div', keep);
};

function countTo(el, to, fmt) {
	const f = FMT[fmt] || FMT.money;
	const from = el._v ?? 0;
	el._v = to;
	if (REDUCED || from === to) { el.textContent = f(to); return; }
	const t0 = performance.now();
	const step = (t) => { const p = Math.min(1, (t - t0) / 700); const e = 1 - Math.pow(1 - p, 3); el.textContent = f(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
	requestAnimationFrame(step);
}
const FMT = {
	money: (x) => '$' + (Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : Math.abs(x) >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : Math.round(x)),
	int: (x) => Math.round(x).toLocaleString('en-US'),
	pct: (x) => (x * 100).toFixed(1) + '%',
	raw: (x) => String(x),
};

function renderViz(slot, v) {
	if (!v) { slot.innerHTML = ''; slot.dataset.kind = ''; return; }
	const kind = v.kind;
	if (slot.dataset.kind !== kind) { slot.innerHTML = ''; slot.dataset.kind = kind; }
	if (kind === 'split') {
		let a = slot.querySelector(':scope > .sa'), b = slot.querySelector(':scope > .sb');
		if (!a) { slot.style.display = 'grid'; slot.style.gridTemplateColumns = v.cols || '1fr 1fr'; slot.style.gap = '10px'; a = h('div', 'sa'); b = h('div', 'sb'); for (const x of [a, b]) { x.style.position = 'relative'; x.style.minWidth = 0; } slot.append(a, b); }
		renderPanel(a, v.a); renderPanel(b, v.b); return;
	}
	slot.style.display = ''; slot.style.gridTemplateColumns = '';
	renderPanel(slot, v, true);
}
function renderPanel(el, v, isRoot) {
	if (!isRoot) { if (el.dataset.kind !== v.kind) { el.innerHTML = ''; el.dataset.kind = v.kind; } }
	let lab = el.querySelector(':scope > .vz-label');
	if (!lab) { lab = h('div', 'vz-label'); el.prepend(lab); }
	lab.innerHTML = `<b>${v.title || ''}</b><span>${v.note || ''}</span>`;
	let inner = el.querySelector(':scope > .vzi');
	if (!inner) { inner = h('div', 'vzi'); inner.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0'; el.appendChild(inner); }
	if (inner.dataset.kind !== v.kind) { inner.innerHTML = ''; inner.dataset.kind = v.kind; }
	R[v.kind](inner, v);
}

class Stage {
	constructor(host, demo, mini) {
		this.demo = demo; this.mini = mini; this.i = -1;
		this.el = h('div', 'stage' + (mini ? ' mini' : ''));
		this.el.innerHTML = `<div class="s-top"><span class="s-title"></span></div><div class="s-body"><div class="vz"></div></div><div class="s-cap"><span class="n"></span><span class="t"></span></div><div class="cursor"><svg viewBox="0 0 14 14"><path d="M1 1 L1 12 L4 9 L6.5 13 L8.3 12.2 L5.9 8.3 L10 8.3 Z" fill="#111827" stroke="#fff" stroke-width="1"/></svg><span class="ring"></span></div>`;
		$('.s-title', this.el).textContent = demo.app || 'Ecommerce';
		host.appendChild(this.el);
		this.cursor = $('.cursor', this.el);
		this.cursor.style.opacity = 0;
		this.fit(host);
		new ResizeObserver(() => this.fit(host)).observe(host);
	}
	fit(host) { const s = host.clientWidth / 480; this.el.style.transform = `scale(${s})`; }
	show(i) {
		const beats = this.demo.trailer;
		this.i = i;
		const b = beats[i];
		const top = $('.s-top', this.el);
		const keep = new Set();
		(b.chips || []).forEach((c, j) => {
			const k = c.k || c.t;
			const e = keyed(top, '.chip', k, () => h('span', 'chip'));
			keep.add(k);
			e.className = 'chip' + (c.c ? ' ' + c.c : '') + (e._new && i > 0 && !REDUCED ? ' new' : '');
			e.innerHTML = esc(c.t);
			e.style.order = j + 1;
		});
		for (const e of [...top.querySelectorAll(':scope > .chip')]) if (!keep.has(e.dataset.key)) e.remove();
		renderViz($('.vz', this.el), b.viz);
		$('.s-cap .n', this.el).textContent = `${i + 1}/${beats.length}`;
		$('.s-cap .t', this.el).textContent = b.cap || '';
		this.point(b);
	}
	point(b) {
		const c = this.cursor;
		c.classList.remove('click');
		if (!b.at) { c.style.opacity = 0; return; }
		requestAnimationFrame(() => requestAnimationFrame(() => {
			const t = this.el.querySelector(`[data-key="${CSS.escape(b.at)}"]`);
			if (!t) { c.style.opacity = 0; return; }
			const sr = this.el.getBoundingClientRect(), tr = t.getBoundingClientRect();
			const sc = sr.width / 480 || 1;
			const x = (tr.left - sr.left + tr.width * (b.ax ?? 0.5)) / sc, y = (tr.top - sr.top + tr.height * (b.ay ?? 0.5)) / sc;
			c.style.opacity = 1;
			c.style.transform = `translate(${x}px, ${y}px)`;
			if (b.click !== false) { void c.offsetWidth; c.classList.add('click'); }
		}));
	}
}

// ---------- gallery UI ----------
const ANFRA_APPS = 'https://demo.anfra.ai/apps/';
const DEMOS = window.GALLERY.demos;
const PRIMS = window.GALLERY.prims;
const STATUS = { works: 'Works today', app: 'Works with app code', data: 'Needs dataset addition', proposed: 'Proposed' };
const AQL = JSON.parse(document.getElementById('aql').textContent);
// each card's story as numbered steps the reader can follow in its live app (steps/*.json)
const STEPS = /*__STEPS__*/{};
// per card: a hand-written SQL sketch for the vs raw SQL tab, and a short prompt
const SQLX = /*__SQLX__*/{};
const PROMPTS = /*__PROMPTS__*/{};
// the AQL each card is about: lines matching one of these are highlighted (a line that opens a bracket
// keeps the band until it closes); filter and selection cards point at the filters anfra adds on a click
// the SDK lines a card is about, when the point is in the wiring rather than the AQL
const SDK_FOCUS = {};
const FOCUS = {
	'field-filter': ['^\\s*filters'], 'scope-vs-filter': ['^\\s*filters'], 'compound-filter': ['^\\s*filters'],
	'aggregate-filter': ['^\\s*having'], 'text-search': ['^\\s*filters'], 'one-control-many': ['^\\s*filters'], 'cascading-options': ['^\\s*filters'],
	'apply-button': ['^\\s*filters'], 'selection-to-filter': ['^\\s*filters'], 'zoom-pan': ['^\\s*filters', 'ordered_at \\| (year|quarter|month|week|day)\\(\\)'], 'legend-toggle': ['^\\s*measures'], 'custom-menu': ['^\\s*filters'], 'range-filter': ['^\\s*filters'], 'row-actions': ['^\\s*dimension '],
	'single-select': ['customers\\.country (is|in) ', '^\\s*or\\('], 'range-brush': ['^\\s*filters'],
	'numeric-brush': ['^\\s*filters', 'value_bin ='], 'cross-highlight': ['^\\s*filters'], 'two-selections': ['^\\s*filters'], 'selection-cohort': ['^\\s*filters'],
	'date-filter': ['^\\s*filters'], 'date-drill': ['ordered_at \\| (year|quarter|month|week|day)\\(\\)', '^\\s*filters'], 'fiscal-calendar': ['fiscal_', '\\| quarter\\(\\)'],
	'as-of-anchor': ['max\\(orders\\.ordered_at\\)', '^\\s*filters'], 'partial-period': ['last_order_day', 'max\\(orders\\.ordered_at\\)'], 'period-compare': ['relative_period'], 'custom-compare': ['exact_period', '^\\s*filters'],
	'to-date': ['period_to_date', 'trailing_period'], 'hierarchy-drill': ['^\\s*filters'], 'drill-path': ['^\\s*filters'], 'adhoc-breakdown': ['^\\s*dimensions', '^\\s*filters'], 'underlying-records': ['^\\s*filters'],
	'drillthrough': ['^\\s*filters'], 'metric-switch': ['^\\s*measures'], 'dimension-switch': ['^\\s*dimensions'], 'sort': ['^\\s*sorts'],
	'top-n': ['\\btop\\(', 'exclude_grains'], 'pivot': ['^\\s*(rows|columns)\\b', 'exclude_grains', 'percent_of_total'], 'totals': ['exclude_grains'],
	'percent-of-total': ['percent_of_total'], 'cumulative-moving': ['running_total', 'window_avg'], 'index-100': ['first_value'], 'ranking': ['\\brank\\('],
	'bins': ['^\\s*dimension ', 'floor\\(', 'case\\('], 'targets': ['monthly_target'], 'trend-line': ['window_avg\\(', 'last_order_day'], 'what-if': ['^\\s*(dimension|metric) '], 'cohort-from-rank': ['ntile\\('],
	'bookmarks': ['^\\s*filters'],
	'url-state': ['^\\s*filters'], 'reset': ['^\\s*filters'], 'undo-redo': ['^\\s*filters'], 'saved-views': ['^\\s*filters'],
	'refresh': ['max\\(orders\\.ordered_at\\)'],
};
// split highlighted code into lines, banding the ones that match `focus` and the bracket they open
function focusLines (text, focus) {
	const res = (focus || []).map((f) => new RegExp(f, 'i'));
	const lines = text.split('\n');
	const on = lines.map(() => false);
	const depth = (l) => { let d = 0; l.replace(/'[^'\n]*'|"[^"\n]*"|\/\/.*$|--.*$/g, '').replace(/[({[]|[)}\]]/g, (c) => { d += '({['.includes(c) ? 1 : -1; return c; }); return d; };
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*(\/\/|--)/.test(lines[i]) || !res.some((r) => r.test(lines[i]))) continue;
		on[i] = true;
		let d = depth(lines[i]), j = i;
		while (d > 0 && j < lines.length - 1) { j++; on[j] = true; d += depth(lines[j]); }
	}
	return { lines, on, any: on.some(Boolean) };
}
const byId = Object.fromEntries(DEMOS.map((d) => [d.id, d]));
// the interactions readers reach for most: a section of their own, and a star on their cards
const TOP_PICKS = ['date-filter', 'date-drill', 'single-select', 'hierarchy-drill', 'what-if', 'underlying-records', 'one-control-many'];
const STAR = '<span class="star" title="Top picked" aria-label="Top picked">★</span>';
let fPrim = null, fStatus = null, fHol = null, fq = '';
const HOL = JSON.parse(document.getElementById('hol').textContent || '{}');
const HV = { yes: 'Yes', partial: 'Partly', no: 'No', unverified: 'Unverified' };
const hol = (id) => (HOL.verdicts || {})[id] || { v: 'unverified', note: 'Not checked yet.', src: [] };
const HMARK = '<svg class="hmark" viewBox="0 0 185 204" aria-hidden="true"><g fill="#5bcb88"><path d="M144.6,47.94c1.32-4.45,3.96-8.33,7.47-11.18l-49.21-28.41c-5.31-3.06-11.84-3.06-17.15,0L18,47.44c-5.31,3.06-8.57,8.72-8.57,14.85v60.25c2.77-1.21,5.82-1.88,9.03-1.88h4.39s0-55.39,0-55.39c0-3.18,1.7-6.12,4.45-7.71l62.55-36.11c2.75-1.59,6.15-1.59,8.9,0l45.87,26.48Z"/><path d="M166.36,38.54c-8.74,0-15.83,7.09-15.83,15.83,0,2.1.41,4.11,1.16,5.94l-49.76,46.49c-2.26-1.25-4.87-1.96-7.64-1.96-8.74,0-15.83,7.09-15.83,15.83,0,.16,0,.32.01.48l-46.47,14.01c-2.77-4.58-7.8-7.64-13.55-7.64-8.74,0-15.83,7.09-15.83,15.83s7.09,15.83,15.83,15.83,15.11-6.39,15.77-14.52l47.53-14.33c2.89,3.75,7.43,6.17,12.54,6.17,8.74,0,15.83-7.09,15.83-15.83,0-2.43-.55-4.72-1.52-6.78l49.36-46.11c2.44,1.53,5.32,2.42,8.41,2.42,8.74,0,15.83-7.09,15.83-15.83s-7.09-15.83-15.83-15.83ZM18.45,149.41c-3.34,0-6.06-2.72-6.06-6.06s2.72-6.06,6.06-6.06,6.06,2.72,6.06,6.06-2.72,6.06-6.06,6.06ZM94.29,126.73c-3.34,0-6.06-2.72-6.06-6.06s2.72-6.06,6.06-6.06,6.06,2.72,6.06,6.06-2.72,6.06-6.06,6.06ZM166.36,60.43c-3.34,0-6.06-2.72-6.06-6.06s2.72-6.06,6.06-6.06,6.06,2.72,6.06,6.06-2.72,6.06-6.06,6.06Z"/></g><g fill="#012a49"><path d="M166.36,77.06c-.21,0-.42-.01-.63-.02v60.45c0,3.18-1.7,6.12-4.45,7.71l-62.55,36.11c-2.75,1.59-6.15,1.59-8.9,0l-50.48-29.15c-1.82,4.3-4.93,7.92-8.85,10.39l55.2,31.87c5.31,3.06,11.84,3.06,17.15,0l67.72-39.1c5.31-3.06,8.57-8.72,8.57-14.85v-67.38c-3.64,2.5-8.05,3.96-12.79,3.96Z"/></g></svg>';
const SPARK = '<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/></svg>';
const holTag = (id) => { const x = hol(id); return `<span class="hol h-${x.v}" title="${esc(x.note)}">${HMARK}Holistics: ${HV[x.v]}</span>`; };
function promptFor (d, mode) {
	const p = PROMPTS[d.id] || {};
	const gap = d.status === 'proposed' ? `\n\nanfra 0.8.0 can't do this yet (${d.limitsShort || 'see the card'}), so build the closest version and show what's missing.` : '';
	// how the interaction works, and what a good result looks like, so the agent can check its own work
	const brief = (good) => (p.how ? `\n\nHow it works: ${p.how}` : '') + (good ? `\nGood outcome: ${good}` : '');
	return mode === 'try'
		? `Use the designing-data-apps skill to build a small Data App on the ecommerce Dataset.\n\n${p.try || d.prompt}${brief(p.goodTry || p.good)}${gap}`
		: `Add "${d.title}" to my Data App: ${p.mine || d.generic}${brief(p.good)}${examples(d)}\n\nSuggest which of my fields to use before changing anything.${gap}`;
}
// the card's AQL and SDK wiring on the ecommerce sample, for the agent to adapt to the reader's fields
function examples (d) {
	const q = AQL[d.aqlRef];
	const aql = fmtAql(q ? q.aql : (d.aqlInline || '')).trim();
	const sdk = (d.sdk || '').trim();
	if (!aql && !sdk) return '';
	return '\n\nExample on the ecommerce sample Dataset (swap in my own fields):'
		+ (aql ? `\n\nAQL:\n\`\`\`\n${aql}\n\`\`\`` : '')
		+ (sdk ? `\n\nSDK wiring:\n\`\`\`js\n${sdk}\n\`\`\`` : '');
}
async function copyText (txt) { try { await navigator.clipboard.writeText(txt); } catch { const ta = h('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } }
function flash (btn, text, ms = 1600) { const lab = btn.querySelector('span') || btn; const old = lab.textContent; btn.classList.add('done'); lab.textContent = text; clearTimeout(btn._t); btn._t = setTimeout(() => { btn.classList.remove('done'); lab.textContent = old; }, ms); }
// lay out AQL: one block per line, a block's items on one line when they fit, else one per line;
// only whitespace changes, and anything it can't parse is returned as is
function fmtAql (src, width = 68) {
	// a date drill writes the grain as date_trunc(field, 'month'); show it the way AQL is usually written,
	// field | month(), which gives the same rows
	src = src.replace(/date_trunc\(\s*([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*,\s*'(year|quarter|month|week|day)'\s*\)/gi, (m, f, g) => f + ' | ' + g.toLowerCase() + '()');
	// whole-line `//` comments stay as written; the AQL between them is laid out
	const bare = (t) => t.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '');
	const lines = src.trim().split('\n');
	if (lines.some((l) => /^\s*\/\//.test(l))) {
		const out = [];
		let chunk = [];
		const flush = () => { if (chunk.join('').trim()) out.push({ code: fmtAql(chunk.join('\n'), width) }); chunk = []; };
		const note = (l) => { let cur = ''; for (const w of l.trim().replace(/^\/\/\s*/, '').split(' ')) { if (cur && ('// ' + cur + ' ' + w).length > width) { out.push({ note: '// ' + cur }); cur = w; } else cur = cur ? cur + ' ' + w : w; } out.push({ note: '// ' + cur }); };
		for (const l of lines) { if (/^\s*\/\//.test(l)) { flush(); note(l); } else chunk.push(l); }
		flush();
		return out.map((x, k) => (x.note && k && out[k - 1].code ? '\n' : '') + (x.note || x.code)).join('\n');
	}
	if (/\/\/|--|\/\*|#/.test(bare(src))) return src;
	let i = 0;
	const n = src.length;
	// one level: items and blocks until the closing brace (or the end at the top)
	function level (top) {
		const kids = [];
		let buf = '', depth = 0;
		const flush = (sep) => { const t = buf.replace(/\s+/g, ' ').trim(); if (t) kids.push({ t, sep }); else if (sep === ',' && kids.length) kids[kids.length - 1].sep = ','; buf = ''; };
		while (i < n) {
			const c = src[i];
			if (c === "'" || c === '"') { let j = i + 1; while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1; if (j >= n) throw 0; buf += src.slice(i, j + 1); i = j + 1; continue; }
			if (c === '(' || c === '[') depth++;
			if (c === ')' || c === ']') { depth--; if (depth < 0) throw 0; }
			if (depth === 0 && c === '{') { i++; const head = buf.replace(/\s+/g, ' ').trim(); buf = ''; const body = level(false); kids.push({ head, body, sep: '' }); continue; }
			if (depth === 0 && c === '}') { if (top) throw 0; flush(''); i++; return kids; }
			if (depth === 0 && c === ',') { flush(','); i++; continue; }
			if (depth === 0 && c === '\n') {
				// a line that starts or ends on an operator continues the item
				const next = src.slice(i + 1).match(/^\s*(\||\/|\*|\+|-(?!-)|and\b|or\b|==|!=|<|>)/);
				if (next || /(\||\/|\*|\+|-|=|\band|\bor|<|>)\s*$/.test(buf)) { buf += ' '; i++; continue; }
				flush('\n'); i++; continue;
			}
			if (depth === 0 && c === ';') { buf += ';'; flush('\n'); i++; continue; }
			buf += c; i++;
		}
		if (!top || depth) throw 0;
		flush('');
		return kids;
	}
	let tree;
	try { tree = level(true); } catch { return src; }
	const pad = (k) => '  '.repeat(k);
	// a line too long: break its first call that has several arguments, one argument (or when/then pair) per line
	// a line too long: break its first call that has several arguments, one argument (or when/then pair)
	// per line; else break before a top-level operator; else break inside its largest bracket
	function scan (t, cb) {
		let d = 0;
		for (let j = 0; j < t.length; j++) {
			const c = t[j];
			if (c === "'" || c === '"') { j++; while (j < t.length && t[j] !== c) j += t[j] === '\\' ? 2 : 1; continue; }
			if (c === '(' || c === '[') d++;
			else if (c === ')' || c === ']') d--;
			cb(c, j, d);
		}
	}
	function groups (t) {
		const gs = [], stack = [];
		scan(t, (c, j, d) => { if (c === '(' || c === '[') stack.push(j); else if ((c === ')' || c === ']') && stack.length) { const o = stack.pop(); if (!stack.length) gs.push([o, j]); } });
		return gs;
	}
	function args (inner) {
		const as = [];
		let from = 0;
		scan(inner, (c, j, d) => { if (c === ',' && d === 0) { as.push(inner.slice(from, j).trim()); from = j + 1; } });
		as.push(inner.slice(from).trim());
		return as;
	}
	function wrap (t, ind) {
		if (pad(ind).length + t.length <= width) return pad(ind) + t;
		for (const [o, c] of groups(t)) {
			const as = args(t.slice(o + 1, c));
			if (as.length < 2) continue;
			const gs = [];
			for (let a = 0; a < as.length; a++) gs.push(/^when\s*:/.test(as[a]) && /^then\s*:/.test(as[a + 1] || '') ? as[a] + ', ' + as[++a] : as[a]);
			return `${pad(ind)}${t.slice(0, o + 1)}\n${gs.map((g, x) => wrap(g, ind + 1) + (x < gs.length - 1 ? ',' : '')).join('\n')}\n${pad(ind)}${t.slice(c)}`;
		}
		// a bracketed term that ends the line, like `x / (…)`, breaks inside its bracket first
		const last = groups(t).pop();
		if (last && last[1] - last[0] > 12 && t[last[0] - 1] === ' ' && /^[,;]?$/.test(t.slice(last[1] + 1).trim()) && pad(ind).length + last[0] + 1 <= width) return `${pad(ind)}${t.slice(0, last[0] + 1)}\n${wrap(t.slice(last[0] + 1, last[1]).trim(), ind + 1)}\n${pad(ind)}${t.slice(last[1])}`;
		const cuts = [];
		scan(t, (c, j, d) => { if (d === 0 && j > 0 && t[j - 1] === ' ' && /^(\| |\/ |\* |\+ |and |or )/.test(t.slice(j))) cuts.push(j); });
		const fit = cuts.filter((j) => pad(ind).length + j - 1 <= width);
		const cut = fit.length ? fit[fit.length - 1] : cuts[0];
		if (cut) return `${pad(ind)}${t.slice(0, cut - 1)}\n${wrap(t.slice(cut), ind + 1)}`;
		const big = groups(t).filter(([o, c]) => c - o > 12).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
		if (big) return `${pad(ind)}${t.slice(0, big[0] + 1)}\n${wrap(t.slice(big[0] + 1, big[1]).trim(), ind + 1)}\n${pad(ind)}${t.slice(big[1])}`;
		return pad(ind) + t;
	}
	function out (kids, ind) {
		return kids.map((k, j) => {
			const last = j === kids.length - 1;
			const sep = k.sep === ',' && !last ? ',' : '';
			if (!k.body) return wrap(k.t + sep, ind);
			const flat = k.body.every((b) => !b.body) && k.body.every((b, x) => x === k.body.length - 1 || b.sep === ',');
			const one = `${k.head} { ${k.body.map((b) => b.t).join(', ')} }`;
			if (!k.body.length) return pad(ind) + `${k.head} { }` + sep;
			if (flat && pad(ind).length + one.length <= width) return pad(ind) + one + sep;
			return `${pad(ind)}${k.head} {\n${out(k.body, ind + 1)}\n${pad(ind)}}${sep}`;
		}).join('\n');
	}
	return out(tree, 0).replace(/\n(?=explore\b)/g, '\n\n');
}
// a code block: label, Copy, and Run for AQL; Run sends the query to anfra through the gallery server
const CODE = [];
function codeBlock (text, { label = 'Code', run = null, focus = null, lang = 'aql', mark = null } = {}) {
	const i = CODE.push({ text, run }) - 1;
	return `<div class="code" data-code="${i}"><div class="code-bar"><span class="code-label">${esc(label)}</span>${run ? `<button type="button" class="cb cb-run" data-run="${i}"><span>▶ Run</span></button>` : ''}<button type="button" class="cb cb-copy" data-copy="${i}"><span>Copy</span></button></div><pre>${codeHtml(text, focus, lang, mark)}</pre>${run ? `<div class="run-out" id="run-${i}"></div>` : ''}</div>`;
}
function codeHtml (text, focus, lang, mark) {
	const paint = lang === 'sql' ? hlSql : hl;
	if (mark && mark.some(Boolean)) return text.split('\n').map((l, i) => `<span class="ln${mark[i] ? ' on' : ''}">${paint(l) || ' '}</span>`).join('');
	const f = focus && focusLines(text, focus);
	if (!f || !f.any) return paint(text);
	return f.lines.map((l, i) => `<span class="ln${f.on[i] ? ' on' : ''}">${paint(l) || ' '}</span>`).join('');
}
function rowsTable (fields, records, note) {
	return `<table class="res"><thead><tr>${fields.map((f) => `<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${records.map((r) => `<tr>${r.map((x) => `<td>${esc(x == null ? 'null' : fmtCell(x))}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="input">${note}</div>`;
}
document.addEventListener('click', async (ev) => {
	const cp = ev.target.closest('[data-copy]');
	if (cp) { await copyText(CODE[cp.dataset.copy].text); flash(cp, 'Copied'); return; }
	const rn = ev.target.closest('[data-run]');
	if (!rn) return;
	const c = CODE[rn.dataset.run], out = document.getElementById('run-' + rn.dataset.run);
	rn.disabled = true; flash(rn, 'Running…', 60000);
	out.innerHTML = '<div class="input">Running on anfra…</div>';
	try {
		const r = await fetch('api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: c.text, input: c.run.input || undefined, timezone: c.run.timezone || undefined }) });
		const j = await r.json();
		if (!r.ok) throw new Error(j.error?.details?.diagnostics?.map((x) => x.message).join(' ') || j.error?.message || ('HTTP ' + r.status));
		const res = j.result || { fields: [], records: [] };
		out.innerHTML = `<div class="run-head">Live result · ${res.records.length}${res.records.length === 50 ? '+' : ''} rows · ${j.ms} ms</div>` + rowsTable(res.fields, res.records.slice(0, 50), res.records.length ? '' : 'No rows');
	} catch (err) {
		out.innerHTML = `<div class="limits">${esc(String(err.message || err).slice(0, 600))}${String(err).includes('Failed to fetch') ? ' (Run needs the gallery server)' : ''}</div>`;
	} finally { rn.disabled = false; clearTimeout(rn._t); rn.classList.remove('done'); rn.querySelector('span').textContent = '▶ Run again'; }
});
const holSrc = (id) => (hol(id).src || []).map((k) => HOL.sources && HOL.sources[k]).filter(Boolean).map((s2) => `<a href="${esc(s2.url)}" target="_blank" rel="noopener">${esc(s2.title)}</a>`).join(' · ');

// sidebar: one entry per kind of state; a click filters the gallery to it
const side = $('#side');
// a sidebar count is the number of cards in that section
const countOf = (k) => k === 'top' ? TOP_PICKS.length : DEMOS.filter((d) => !k || d.prim === k).length;
side.innerHTML = `<div class="side-head"><p class="side-label">Patterns</p><button type="button" class="side-toggle" aria-controls="side"></button></div><ul class="side-list" role="list"></ul>`;
const sideList = $('.side-list', side);
// collapse the sidebar to an icon rail; remembered across visits
const shell = side.parentElement, sideBtn = $('.side-toggle', side);
const PANEL = (open) => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="${open ? 'm14 9 3 3-3 3' : 'm16 15-3-3 3-3'}"/></svg>`;
function setSide (collapsed, save) {
	shell.classList.toggle('side-collapsed', collapsed);
	sideBtn.setAttribute('aria-expanded', String(!collapsed));
	sideBtn.title = sideBtn.ariaLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
	sideBtn.innerHTML = PANEL(collapsed);
	if (save) try { localStorage.setItem('gallery-side', collapsed ? 'collapsed' : 'open'); } catch {}
}
let sideStored = null; try { sideStored = localStorage.getItem('gallery-side'); } catch {}
setSide(sideStored === 'collapsed', false);
sideBtn.onclick = () => setSide(!shell.classList.contains('side-collapsed'), true);

[{ key: null, ic: '∗', name: 'All patterns', tech: '' }, { key: 'top', ic: '★', name: 'Top picked', tech: 'Most used', desc: 'The interactions readers reach for most' }, ...PRIMS].forEach((p) => {
	const li = h('li');
	const b = h('button', 'side-item');
	b.dataset.k = p.key || '';
	b.title = p.desc ? p.desc.replace(/<[^>]+>/g, '') : 'Every pattern in the gallery';
	b.innerHTML = `<span class="ic">${p.ic}</span><span class="nm">${esc(p.name)}${p.tech ? `<small>${esc(p.tech)}</small>` : ''}</span><span class="n">${countOf(p.key)}</span>`;
	// the sidebar jumps to a section (opening it if folded); it doesn't filter
	b.onclick = () => {
		showPage('gallery');
		const gh = p.key ? groupsEl.querySelector(`.gh[data-k="${p.key}"]`) : $('#gallery');
		if (!gh || gh.hidden) return;
		const tg = p.key && gh.querySelector('.gtoggle');
		if (tg && tg.getAttribute('aria-expanded') !== 'true') tg.click();
		gh.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
	};
	li.appendChild(b); sideList.appendChild(li);
});
// Gallery and About are two tabs; #gallery and #state-kinds switch them
function showPage(id) {
	for (const t of document.querySelectorAll('.page-tabs [role=tab]')) {
		const on = t.dataset.page === id;
		t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
		$('#' + t.dataset.page).hidden = !on;
	}
	window.dispatchEvent(new Event('resize'));
	window.dispatchEvent(new Event('scroll'));
}
const pageOf = (h) => h === 'state-kinds' ? 'state-kinds' : 'gallery';
document.querySelectorAll('.page-tabs [role=tab]').forEach((t, i, all) => {
	t.onclick = () => { showPage(t.dataset.page); history.replaceState(null, '', '#' + t.dataset.page); scrollTo({ top: 0 }); };
	t.onkeydown = (e) => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (k) { const n = all[(i + k + all.length) % all.length]; n.focus(); n.click(); } };
});
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h === 'gallery' || h === 'state-kinds') showPage(h); });
showPage(pageOf(location.hash.slice(1)));
const ginfo = $('#ginfo');
$('#q').addEventListener('input', (e) => { fq = e.target.value.trim().toLowerCase(); sync(); });

// cards
const groupsEl = $('#groups');
const cards = new Map();
const topCards = [];
const groupHead = (k, name, n, sub) => {
	const gh = h('h2', 'gh', `<button type="button" class="gtoggle" aria-expanded="true" aria-controls="grid-${k}"><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>${esc(name)} <small>${n}</small></button><span class="gsub">${esc(sub)}</span>`); gh.dataset.k = k;
	const grid = h('div', 'grid'); grid.dataset.k = k; grid.id = 'grid-' + k;
	gh.querySelector('.gtoggle').onclick = (ev) => {
		const b = ev.currentTarget, open = b.getAttribute('aria-expanded') !== 'true';
		b.setAttribute('aria-expanded', String(open));
		grid.classList.toggle('collapsed', !open);
		if (open && !REDUCED) grid.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
	};
	groupsEl.append(gh, grid);
	return grid;
};
function makeCard (d, grid, primary) {
		const wrap = h('div', 'card-wrap');
		const c = h('button', 'card');
		if (primary) c.id = 'card-' + d.id;
		c._wrap = wrap;
		c.innerHTML = `<div class="thumb"><span class="play">▶ preview</span><i class="tp"></i></div><div class="meta"><h3>${esc(d.title)}${TOP_PICKS.includes(d.id) ? STAR : ''}</h3><p>${esc(d.one)}</p></div>`;
		const cm = h('button', 'cmagic', `${SPARK}<span>Copy prompt</span>`);
		cm.type = 'button'; cm.title = `Copy a prompt that adds "${d.title}" to your own Data App`;
		cm.onclick = async () => { await copyText(promptFor(d, 'mine')); flash(cm, 'Copied'); };
		wrap.append(c, cm);
		grid.appendChild(wrap);
		const st = d.video ? null : new Stage($('.thumb', c), d, true);
		if (st) st.show(d.thumb ?? Math.min(1, d.trailer.length - 1));
		if (d.video) $('.thumb', c).insertAdjacentHTML('beforeend', `<video class="tv" src="${d.video}" poster="${d.video.replace('.mp4', '.jpg')}" muted loop playsinline preload="none"></video>`);
		let timer = null;
		const tp = $('.tp', c);
		const prog = (i) => { tp.style.transition = 'none'; tp.style.width = (i / d.trailer.length * 100) + '%'; void tp.offsetWidth; tp.style.transition = 'width 1.3s linear'; tp.style.width = ((i + 1) / d.trailer.length * 100) + '%'; };
		const tv = $('.tv', c);
		c.addEventListener('mouseenter', () => { if (REDUCED) return; if (tv) { tv.play().catch(() => {}); return; } let i = 0; st.show(0); prog(0); timer = setInterval(() => { i = (i + 1) % d.trailer.length; st.show(i); prog(i); }, 1300); });
		c.addEventListener('mouseleave', () => { if (tv) { tv.pause(); tv.currentTime = 0; return; } clearInterval(timer); tp.style.transition = 'opacity .3s'; tp.style.width = '0'; st.show(d.thumb ?? Math.min(1, d.trailer.length - 1)); });
		c.onclick = () => open(d.id);
		wrap.style.viewTransitionName = (primary ? 'c-' : 'ct-') + d.id;
		if (primary) cards.set(d.id, c); else topCards.push([d.id, c]);
}
const topGrid = groupHead('top', 'Top picked', TOP_PICKS.length, 'The interactions readers reach for most');
PRIMS.forEach((p) => {
	const list = DEMOS.filter((d) => d.prim === p.key);
	if (!list.length) return;
	const gh = h('h2', 'gh', `<button type="button" class="gtoggle" aria-expanded="true" aria-controls="grid-${p.key}"><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>${esc(p.name)} <small>${list.length}</small></button><span class="gsub">${esc(p.sub)}</span>`); gh.dataset.k = p.key;
	const grid = h('div', 'grid'); grid.dataset.k = p.key; grid.id = 'grid-' + p.key;
	gh.querySelector('.gtoggle').onclick = (ev) => {
		const b = ev.currentTarget, open = b.getAttribute('aria-expanded') !== 'true';
		b.setAttribute('aria-expanded', String(open));
		grid.classList.toggle('collapsed', !open);
		if (open && !REDUCED) grid.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
	};
	groupsEl.append(gh, grid);
	// Dates & time opens with a time line of its terms; it folds away, and a click opens it full screen
	if (p.key === 'time') {
		const tl = h('details', 'timeline');
		const src = `data:image/svg+xml;base64,${TIMELINE_SVG}`, alt = 'A time line from June 2025 to November 2026. Anchors: data starts 1 Jun 2025, the as-of anchor (newest data) 23 Sep 2026, and now, 15 Oct 2026. Above it, ranges: exact dates, YTD, last 3 months, trailing 3 months, last 30 days from the anchor or from today, next 30 days. Below it, calendar and fiscal quarters (fiscal year from July), year-over-year and previous-month comparisons, an incomplete September, a custom H2 2025 vs H1 2026 comparison, date drill grains and time zones.';
		tl.innerHTML = `<summary><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>Time line: how the terms relate</summary>
			<button type="button" class="tl-open" aria-label="Open the time line full screen"><img src="${src}" width="1860" height="1040" alt="${alt}"></button>`;
		tl.querySelector('.tl-open').onclick = () => {
			const lb = h('dialog', 'lightbox');
			lb.setAttribute('aria-label', 'Time line: how the terms relate');
			lb.innerHTML = `<button type="button" class="lb-close" aria-label="Close">×</button><img src="${src}" width="1860" height="1040" alt="${alt}">`;
			lb.onclick = (e) => { if (e.target === lb || e.target.closest('.lb-close')) lb.close(); };
			lb.onclose = () => lb.remove();
			document.body.appendChild(lb);
			lb.showModal();
		};
		grid.prepend(tl);
	}
	list.forEach((d) => makeCard(d, grid, true));
});
TOP_PICKS.forEach((id) => byId[id] && makeCard(byId[id], topGrid, false));
const empty = h('div', 'empty', 'No pattern matches. Clear a filter or try another word.'); empty.hidden = true; groupsEl.appendChild(empty);

function matches(d) {
	if (fPrim && d.prim !== fPrim && !(d.also || []).includes(fPrim)) return false;
	if (fq) { const hay = [d.title, d.one, d.does, (STEPS[d.id] || []).join(' '), d.viz, hol(d.id).note, d.aqlInline || '', (AQL[d.aqlRef] || {}).aql || '', (d.tags || []).join(' ')].join(' ').toLowerCase(); if (!hay.includes(fq)) return false; }
	return true;
}
let syncReady = false;
function sync() {
	if (syncReady && !REDUCED && document.startViewTransition && !modal.open) document.startViewTransition(syncNow);
	else syncNow();
	syncReady = true;
}
function syncNow() {
	let n = 0;
	for (const [id, c] of cards) { const ok = matches(byId[id]); c.hidden = !ok; c._wrap.hidden = !ok; if (ok) n++; }
	for (const [id, c] of topCards) { const ok = matches(byId[id]); c.hidden = !ok; c._wrap.hidden = !ok; }
	for (const g of groupsEl.querySelectorAll('.grid')) { const vis = [...g.children].filter((c) => c.classList.contains('card-wrap') && !c.hidden).length; g.hidden = !vis; g.previousElementSibling.hidden = !vis; g.previousElementSibling.querySelector('small').textContent = vis; }
	empty.hidden = n > 0;
	const pk = PRIMS.find((p) => p.key === fPrim);
	ginfo.hidden = !pk;
	if (pk) ginfo.innerHTML = `<div><h3>${esc(pk.name)} <small>State primitive: ${esc(pk.tech)}</small></h3><p>${pk.desc}</p></div><code>${esc(pk.ex)}</code>`;
}

function countUpText(el, to, f) {
	const from = el._n ?? to; el._n = to;
	if (REDUCED || from === to) { el.textContent = f(to); return; }
	const t0 = performance.now();
	const tick = (t) => { const p = Math.min(1, (t - t0) / 280); el.textContent = f(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
	requestAnimationFrame(tick);
}

// content rule (app-DESIGN.md: Content): text of one sentence has no end period
const SENT = /[.!?]["”')]?\s+(?=[A-Z0-9"“(])/g;
function tidy(root) {
	const sel = 'p, dd, li, figcaption, td, .sub, .gsub, .q, .test, .holline, .vizline, .limits, .promptbox ~ x';
	for (const el of root.querySelectorAll(sel)) {
		if (el.closest('pre, code, .promptbox, .stage')) continue;
		const t = el.textContent.trim();
		if (!t.endsWith('.') || t.endsWith('..') || (t.match(SENT) || []).length) continue;
		const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		let last = null; while (w.nextNode()) if (w.currentNode.nodeValue.trim()) last = w.currentNode;
		if (last && last.parentElement.closest('code') === null) last.nodeValue = last.nodeValue.replace(/\.(\s*)$/, '$1');
	}
}

// inspector
const insp = $('#insp');
const modal = $('#modal');
let current = null, lastCard = null;
let theater = null, playT = null, liveApp = null;
const dropLive = () => { if (liveApp) { liveApp.unmount(); liveApp = null; } };
function hl(code) {
	// one pass, so a later rule never rewrites markup an earlier rule inserted
	return esc(code).replace(/(\/\/[^\n]*)|('[^'\n]*'|"[^"\n]*")|\b(explore|dimensions|measures|filters|having|sorts|metric|dimension|rows|columns|const|await|for|of|if|else|return|new|function)\b/g,
		(m, c, str, k) => c ? `<span class="c">${c}</span>` : str ? `<span class="s">${str}</span>` : `<span class="k">${k}</span>`);
}
function hlSql(code) {
	return esc(code).replace(/(--[^\n]*)|('[^'\n]*')|\b([A-Z][A-Z_]+)\b/g,
		(m, c, str, k) => c ? `<span class="c">${c}</span>` : str ? `<span class="s">${str}</span>` : `<span class="k">${k}</span>`);
}
function resultTable(rec) {
	if (!rec || !rec.fields) return '';
	const rows = rec.records.slice(0, 5);
	return `<table class="res"><thead><tr>${rec.fields.map((f) => `<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${esc(x == null ? 'null' : fmtCell(x))}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="input">${rec.records.length > 5 ? `First 5 of ${rec.records.length} rows.` : ''}</div>`;
}
function fmtCell(x) { const n = Number(x); if (x !== '' && !isNaN(n) && String(x).includes('.') && String(x).split('.')[1].length > 4) return n.toFixed(4); return x; }
function visibleIds() { return [...cards].filter(([, c]) => !c.hidden).map(([k]) => k); }
function open(id, dir = 0) {
	dropLive();
	const d = byId[id];
	if (!d) return;
	for (const [k, c] of cards) c.setAttribute('aria-current', String(k === id));
	clearTimeout(playT);
	const opening = !modal.open;
	if ($('#gallery').hidden) showPage('gallery');
	if (opening) { lastCard = cards.get(id); modal.showModal(); }
	current = id;
	const ids = visibleIds(); const pos = ids.indexOf(id);
	$('#m-pos').textContent = pos >= 0 ? `${pos + 1} / ${ids.length}` : '';
	insp.classList.remove('swap'); void insp.offsetWidth; if (dir) insp.classList.add('swap');
	const q = AQL[d.aqlRef];
	const aqlText = fmtAql(q ? q.aql : (d.aqlInline || ''));
	const ran = !!q;
	insp.innerHTML = `
		<div class="ih" id="insp-head">
			<div class="title-row"><h2 id="m-title">${esc(d.title)}</h2><button class="copy magic" type="button" id="magic" title="Copies this pattern's prompt, ready to paste into your coding agent"><svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/></svg><span>Copy prompt</span></button></div>
			${STEPS[d.id] ? `<ol class="steps">${STEPS[d.id].map((x, i) => `<li style="--i:${i}"><span>${x}</span></li>`).join('')}</ol>` : `<p>${d.does}</p>`}
			<p class="why" style="--n:${(STEPS[d.id] || [1]).length}">${d.why}</p>
		</div>
		<div class="mgrid"><div class="mleft">
		<div class="theater" id="insp-trailer">
			${LiveHost.has(d.id) ? `<div class="tmode" role="tablist" aria-label="Live app or trailer"><button type="button" role="tab" data-tm="live" aria-selected="true"><i class="dotlive"></i>Try it live</button><button type="button" role="tab" data-tm="trailer" aria-selected="false">Watch the trailer</button><button type="button" class="tfull" aria-label="Show the live app full screen" title="Full screen"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Full screen</button></div><div class="live"></div>` : ''}
			${d.video ? `<div class="trailer-title">Recording of the real Data App · <a href="${ANFRA_APPS}${d.app}" target="_blank" rel="noopener">open ${esc(d.app)}</a></div>
			<div class="screen screen-video"><video src="${d.video}" poster="${d.video.replace('.mp4', '.jpg')}" muted loop playsinline ${REDUCED ? 'controls' : 'autoplay'}></video></div>
			<div class="ctl"><button type="button" data-a="restart">↺ Replay</button><div class="dots"></div><button type="button" data-a="vpause">❚❚</button></div>` : `<div class="trailer-title">Trailer · ${d.trailer.length} beats · about ${Math.round(d.trailer.length * 2.2)} s</div>
			<div class="screen"></div>
			<div class="ctl"><button type="button" data-a="play">↺ Replay</button><div class="dots">${d.trailer.map((_, i) => `<button type="button" class="dot" data-i="${i}" aria-label="Beat ${i + 1}"></button>`).join('')}</div><button type="button" data-a="pause">❚❚</button></div>`}
		</div>
		<p class="vizline" id="insp-viz"><b>Visualization:</b> ${d.viz}</p>
		</div><div class="mright">
		<div class="tabs" role="tablist">
			<button role="tab" data-t="aql" aria-selected="true">AQL &amp; SDK</button>
			<button role="tab" data-t="vs">vs raw SQL</button>
			<button role="tab" data-t="prompt">Prompt</button>
		</div>
		<div class="pane" id="insp-pane"></div>
		</div></div>`;
	tidy(insp);
	const screen = $('.screen', insp);
	if (d.video) {
		const v = $('video', screen);
		insp.querySelector('[data-a="restart"]').onclick = () => { v.currentTime = 0; v.play().catch(() => {}); };
		insp.querySelector('[data-a="vpause"]').onclick = (e) => { if (v.paused) { v.play().catch(() => {}); e.target.textContent = '❚❚'; } else { v.pause(); e.target.textContent = '▶'; } };
	}
	theater = d.video ? { show () {} } : new Stage(screen, d, false);
	let i = 0, paused = false;
	const dots = [...insp.querySelectorAll('.dot')];
	const go = (k) => { i = k; theater.show(k); dots.forEach((x, j) => { x.style.setProperty('--p', j < k ? '100%' : '0%'); x.style.transition = ''; }); const cur = dots[k]; if (!REDUCED && !paused) { cur.style.transition = 'none'; cur.style.setProperty('--p', '0%'); requestAnimationFrame(() => { cur.style.transition = 'width 2.2s linear'; cur.style.setProperty('--p', '100%'); }); } else cur.style.setProperty('--p', '100%'); };
	// the trailer loops: it holds the last beat a little longer, then starts again
	const play = () => { clearTimeout(playT); if (paused) return; const last = i >= d.trailer.length - 1; playT = setTimeout(() => { go(last ? 0 : i + 1); play(); }, last ? 3300 : 2200); };
	if (d.video) { /* the recording plays itself */ } else if (REDUCED) { go(d.trailer.length - 1); } else { go(0); play(); }
	if (!d.video) insp.querySelector('[data-a="play"]').onclick = () => { paused = false; go(0); play(); };
	if (!d.video) insp.querySelector('[data-a="pause"]').onclick = (e) => { paused = !paused; e.target.textContent = paused ? '▶' : '❚❚'; if (!paused) play(); else clearTimeout(playT); };
	dots.forEach((x) => x.onclick = () => { paused = true; clearTimeout(playT); insp.querySelector('[data-a="pause"]').textContent = '▶'; go(+x.dataset.i); });
	// a live card's AQL tab shows what its app ran, and follows each click
	const isLive = LiveHost.has(d.id);
	let ranNow = [], ranSig = '', tab = 'aql';
	const sqlBase = {};
	const onInspect = (apps) => {
		if (current !== id) return;
		ranNow = apps.flatMap((a) => Object.entries(a.queries).map(([name, q2]) => ({ name, tz: a.timezone, aql: q2.debug?.executedAql || a.declaration?.queries?.[name]?.aql || '', ran: !!q2.debug?.executedAql, sql: q2.debug?.executedSql || '' })));
		for (const r of ranNow) if (r.sql && !(r.name in sqlBase)) sqlBase[r.name] = r.sql;
		const sig = JSON.stringify(ranNow);
		if (sig === ranSig) return;
		ranSig = sig;
		const part = tab === 'aql' && pane.querySelector('.aql-part');
		if (part) part.innerHTML = aqlPart();
		const sp = tab === 'vs' && pane.querySelector('.sql-live');
		if (sp) sp.innerHTML = liveSql();
	};
	const liveAql = () => ranNow.length
		? `<div class="stamp"><span class="ran"><i class="dotlive"></i>The AQL anfra ran for the live app</span><span>Updates as you use it</span></div>`
			+ (FOCUS[d.id] && !ranNow.some((r) => focusLines(fmtAql(r.aql), FOCUS[d.id]).any) ? '<div class="input focus-hint">Use the app on the left: the AQL it adds is highlighted here</div>' : '')
			+ ranNow.map((r) => codeBlock(fmtAql(r.aql), { focus: FOCUS[d.id], label: `${r.name}${r.ran ? '' : ' · not run yet'}${r.tz ? ` · time zone ${r.tz}` : ''}`, run: { timezone: r.tz } })).join('')
		: '<div class="input">Waiting for the live app\'s first query…</div>';
	const sqlText = (q) => q.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').trim();
	const liveSql = () => {
		const ran = ranNow.filter((r) => r.sql);
		if (!ran.length) return '<div class="input">Waiting for the live app\'s first query…</div>';
		const changed = ran.some((r) => sqlText(r.sql) !== sqlText(sqlBase[r.name] || r.sql));
		return `<div class="stamp"><span class="ran"><i class="dotlive"></i>The SQL anfra compiled for the live app</span><span>Updates as you use it</span></div>`
			+ (changed ? '' : '<div class="input focus-hint">Use the app on the left: the SQL it changes is highlighted here</div>')
			+ ran.map((r) => { const t = sqlText(r.sql), base = new Set(sqlText(sqlBase[r.name] || r.sql).split('\n')); return codeBlock(t, { label: `${r.name} · ${t.split('\n').length} lines`, lang: 'sql', mark: t.split('\n').map((l) => !base.has(l)) }); }).join('');
	};
	if (isLive) {
		const th = $('#insp-trailer'), liveBox = $('.live', th);
		const mode = (m) => {
			th.classList.toggle('is-live', m === 'live');
			th.querySelectorAll('.tmode [data-tm]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tm === m)));
			if (m === 'live') {
				paused = true; clearTimeout(playT);
				if (!liveApp) LiveHost.mount(liveBox, d.id, d.title, onInspect).then((m2) => { if (current === id && m2) liveApp = m2; else if (m2) m2.unmount(); });
			} else if (!d.video) { paused = false; go(0); play(); }
		};
		th.querySelectorAll('.tmode [data-tm]').forEach((b) => b.onclick = () => mode(b.dataset.tm));
		$('.tfull', th).onclick = () => (document.fullscreenElement ? document.exitFullscreen() : liveBox.requestFullscreen()).catch(() => {});
		mode('live');
	}
	const pane = $('#insp-pane');
	const aqlPart = () => isLive ? liveAql() : `
			<div class="stamp">${ran ? `<span class="ran">✓ Ran on anfra 0.8.0 · ecommerce · 14 Oct 2026</span><span>${esc(d.aqlRef)}.aql</span>` : `<span class="sketch">◇ Sketch, not run</span><span>${esc(d.aqlWhy || 'reuses a query shown on another card')}</span>`}</div>
			${codeBlock(aqlText, { focus: FOCUS[d.id], label: 'AQL' + (q && q.timezone ? ` · time zone ${q.timezone}` : ''), run: d.aqlNoRun ? null : { input: q && q.input ? JSON.parse(q.input) : null, timezone: q && q.timezone } })}
			${q && q.input ? `${codeBlock(JSON.stringify(JSON.parse(q.input), null, 2), { label: 'Reader input (JSON)' })}` : ''}
			${q && q.result ? `<div class="run-head saved">Saved result</div>${resultTable(q.result)}` : ''}
			${d.aqlNote ? `<div class="limits">${d.aqlNote}</div>` : ''}`;
	const sdkPart = () => `${codeBlock(d.sdk, { label: 'SDK (JavaScript)', focus: SDK_FOCUS[d.id] })}${d.state ? `<div class="input"><b>State it touches:</b> ${d.state}</div>` : ''}`;
	const tabs = {
		// AQL first, then the SDK wiring under a divider
		aql: () => `<div class="aql-part">${aqlPart()}</div><div class="code-divider" role="separator"><span>SDK wiring</span></div>${sdkPart()}`,
		vs: () => `<div class="vs"><div class="sql"><h4>Raw SQL: you write</h4><ul>${d.sql.map((x) => `<li>${x}</li>`).join('')}</ul>${isLive ? `<div class="sql-live">${liveSql()}</div>${SQLX[d.id] ? `<details class="sql-hand"><summary>The same thing written by hand</summary>${codeBlock(SQLX[d.id].sql, { label: 'Hand-written SQL · sample DuckDB', focus: SQLX[d.id].focus, lang: 'sql' })}</details>` : ''}` : (SQLX[d.id] ? codeBlock(SQLX[d.id].sql, { label: 'Hand-written SQL · sample DuckDB', focus: SQLX[d.id].focus, lang: 'sql' }) : '')}</div></div>${d.limits ? `<div class="limits ${d.status === 'proposed' ? 'prop' : ''}">${d.limits}</div>` : ''}`,
		prompt: () => `
			${d.status === 'proposed' ? '<div class="limits prop">This is a proposed capability. The prompt asks for the closest version that works today and says what is missing.</div>' : ''}
			<div class="pcard"><div class="code-bar"><span class="code-label">Prompt for your coding agent</span><button type="button" class="cb" id="pcopy"><span>Copy</span></button></div><div class="promptbox" id="pbox"></div></div>`,
	};
	const pf = (mode) => promptFor(d, mode);
	// one prompt: the version for the reader's own Data App
	const pmode = 'mine';
	const magic = $('#magic');
	magic.onclick = async () => {
		await copyText(pf(pmode));
		flash(magic, 'Copied: paste it into your agent');
	};
	const showTab = (t) => {
		tab = t;
		insp.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === t)));
		pane.innerHTML = tabs[t]();
		pane.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED ? 160 : 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
		if (t === 'prompt') {
			$('#pbox').textContent = pf(pmode);
			const pc = $('#pcopy'); pc.onclick = async () => { await copyText(pf(pmode)); flash(pc, 'Copied'); };
		}
	};
	insp.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => showTab(b.dataset.t));
	showTab('aql');
	modal.scrollTop = 0;
	history.replaceState(null, '', '#' + id);
	const card = cards.get(id);
	if (opening) zoom(card, true);
	else if (card && !card.hidden) card.scrollIntoView({ block: 'center', behavior: 'instant' });
}
function zoomFrames(card) {
	const a = card.getBoundingClientRect(), b = modal.getBoundingClientRect();
	const sc = Math.max(0.15, a.width / b.width);
	const dx = (a.left + a.width / 2) - (b.left + b.width / 2), dy = (a.top + a.height / 2) - (b.top + b.height / 2);
	return [{ transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0, borderRadius: '24px' }, { transform: 'none', opacity: 1, borderRadius: '16px' }];
}
function zoom(card, inward) {
	// floating surfaces scale from 0.97 and fade; UI motion stays under 300 ms with ease-anfra-out
	const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
	const f = REDUCED ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }];
	const opts = inward ? { duration: REDUCED ? 160 : 220, easing: ease } : { duration: 160, easing: ease, fill: 'forwards' };
	modal.animate([{ opacity: inward ? 0 : 1 }, { opacity: inward ? 1 : 0 }], { ...opts, pseudoElement: '::backdrop' });
	return modal.animate(inward ? f : [...f].reverse(), opts);
}
let closing = false;
function closeModal() {
	if (closing || !modal.open) return;
	const a = zoom(cards.get(current), false);
	if (!a) { modal.close(); return; }
	closing = true;
	a.onfinish = () => { closing = false; modal.close(); a.cancel(); modal.getAnimations({ subtree: true }).forEach((x) => x.cancel()); };
}
modal.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });
function step(k) { const ids = visibleIds(); if (!ids.length) return; const i = ids.indexOf(current); open(ids[(i + k + ids.length) % ids.length], k); }
modal.addEventListener('close', () => {
	dropLive();
	clearTimeout(playT); insp.innerHTML = ''; current = null;
	history.replaceState(null, '', location.pathname + location.search);
	if (lastCard && !lastCard.hidden) lastCard.focus({ preventScroll: true });
});
modal.addEventListener('click', (e) => {
	if (e.target === modal) { closeModal(); return; }
	const b = e.target.closest('[data-m]'); if (!b) return;
	if (b.dataset.m === 'close') closeModal(); else step(b.dataset.m === 'next' ? 1 : -1);
});
modal.addEventListener('keydown', (e) => {
	if (e.target.closest('input, textarea')) return;
	if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
});
document.addEventListener('click', (e) => { const a = e.target.closest('[data-open]'); if (a) { e.preventDefault(); open(a.dataset.open); } });

// tables below
if ($('#adds')) $('#adds').innerHTML = window.GALLERY.adds.map((a) => `<tr id="add-${a.id}"><td>${a.built ? '<span class="st works">Built</span>' : '<span class="st app">Not built</span>'}</td><td><code>${esc(a.what)}</code></td><td>${a.why}</td><td>${a.cards.filter((c) => byId[c]).map((c) => `<a href="#" data-open="${c}">${esc(byId[c].title)}</a>`).join(', ')}</td></tr>`).join('');
if ($('#props')) $('#props').innerHTML = window.GALLERY.props.map((a) => `<tr id="prop-${a.id}"><td><b>${esc(a.what)}</b></td><td>${a.today}</td><td>${a.cards.filter((c) => byId[c]).map((c) => `<a href="#" data-open="${c}">${esc(byId[c].title)}</a>`).join(', ')}</td></tr>`).join('');

for (const el of document.querySelectorAll('[data-count]')) { const k = el.dataset.count; el.textContent = k === 'all' ? DEMOS.length : k.startsWith('h-') ? DEMOS.filter((d) => hol(d.id).v === k.slice(2)).length : DEMOS.filter((d) => d.status === k).length; }
// scroll reveal
const revealIO = REDUCED || !('IntersectionObserver' in window) ? null : new IntersectionObserver((ents) => {
	let k = 0;
	for (const e of ents) {
		if (!e.isIntersecting) continue;
		const el = e.target;
		el.style.transitionDelay = Math.min(k++, 8) * 40 + 'ms';
		el.classList.add('in');
		revealIO.unobserve(el);
		setTimeout(() => { el.style.transitionDelay = ''; }, 1100);
	}
}, { rootMargin: '0px 0px -6% 0px' });
for (const el of document.querySelectorAll('header > *, .prim, .kind, .flowline, .card, .finding, table.plain tbody tr, section > h2, section > .sub')) {
	if (!revealIO) continue;
	el.classList.add('rv');
	revealIO.observe(el);
}
// the click-to-numbers flow lights up one step at a time while it is on screen
const flow = $('.flowline');
if (flow && !REDUCED) {
	const parts = [...flow.children]; let t = null, i = 0;
	new IntersectionObserver(([e]) => {
		clearInterval(t);
		if (!e.isIntersecting) return;
		t = setInterval(() => { parts.forEach((p, j) => p.classList.toggle('lit', j === i || (p.classList.contains('e') && j === i - 1))); i = (i + 1) % (parts.length + 2); }, 520);
	}).observe(flow);
}
tidy(document);
syncNow();
syncReady = true;
// the sidebar marks the section in view
const spy = () => {
	let k = null;
	for (const gh of groupsEl.querySelectorAll('.gh')) { if (!gh.hidden && gh.getBoundingClientRect().top < innerHeight * 0.35) k = gh.dataset.k; }
	if ($('#gallery').hidden || $('#gallery').getBoundingClientRect().top > innerHeight * 0.35) k = undefined;
	// at the end of the page the last section is the one in view, even if its title can't reach the top
	if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) { const last = [...groupsEl.querySelectorAll('.gh')].filter((g) => !g.hidden).pop(); if (last) k = last.dataset.k; }
	for (const b of sideList.querySelectorAll('.side-item')) { const on = k === undefined ? false : (b.dataset.k || null) === k; if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }
};
addEventListener('scroll', spy, { passive: true });
const setBarH = () => document.documentElement.style.setProperty('--toolbar-h', ($('.toolbar')?.offsetHeight || 56) + 16 + 'px');
addEventListener('resize', setBarH); setBarH();
spy();
// back to top: shows once the reader is a screen down the page
const toTop = h('button', 'to-top', '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
toTop.type = 'button'; toTop.title = 'Back to top'; toTop.setAttribute('aria-label', 'Back to top');
toTop.onclick = () => scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
document.body.appendChild(toTop);
const showTop = () => toTop.classList.toggle('on', scrollY > innerHeight);
addEventListener('scroll', showTop, { passive: true });
showTop();
const start = location.hash.slice(1);
if (byId[start]) open(start);
})();
