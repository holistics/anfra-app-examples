// Definitions (O16 + craft C16): every governed metric of the two datasets this app reads, grouped by the page it appears on,
// plain name first, the AML id and definition behind a disclosure, with a sticky search and an index. "Appears in" comes from the query registry
// (alias → metric) and the cards' data-anfra-query, so it is the app's own wiring, not a hand-kept list.
(() => {
  const { $, esc, icon } = OG;
  const DATASETS = ['personal_finance', 'wealth'];

  // every page set up (off-screen), so the registry knows every query and card on this app (WF.warm in js/core/core.js)
  async function warmAll() { await WF.warm(); WF.renderAll(); }
  // dataset.metric → [{ card, viewId, viewLabel }]
  function usage() {
    const cards = new Map();   // query name → [{ card, viewId, viewLabel }]
    for (const v of WF.views.values()) {
      if (!v.el || v.id === 'defs') continue;
      v.el.querySelectorAll('[data-anfra-query]').forEach((el) => {
        for (const q of el.dataset.anfraQuery.split(/\s+/)) {
          if (!cards.has(q)) cards.set(q, []);
          cards.get(q).push({ card: el.dataset.anfraLabel ?? q, viewId: v.id, viewLabel: v.tab ? `${OG.navLabel(v.nav)} › ${v.tab}` : OG.navLabel(v.nav) });
        }
      });
    }
    const out = new Map();
    for (const [qname, reg] of WF.registry) {
      for (const metric of new Set(Object.values(reg.metrics))) {
        const k = `${reg.dataset}.${metric}`;
        if (!out.has(k)) out.set(k, new Map());
        for (const c of cards.get(qname) ?? []) out.get(k).set(`${c.viewId}|${c.card}`, c);
      }
    }
    return out;
  }

  // Ask AI goes last: its answers reuse numbers that live on Home, so a metric is grouped under the page that owns it
  const PAGES = [...OG.NAV.filter(([n]) => n !== 'ask'), ...OG.NAV.filter(([n]) => n === 'ask')];
  const view = {
    id: 'defs', nav: 'defs', tab: null,
    init(el) {
      this.text = '';
      // this page's cards; js/pages.js arranges them (OG.layout)
      this.blocks = {
        'defs-index': () => `<aside class="defs-index" id="defs-idx" data-anfra-block="defs-index" data-anfra-label="On this page"></aside>`,
        'defs-list': () => `<section class="card" data-anfra-block="defs-list" data-anfra-label="Definitions">
            <div class="defs-top">
              <div class="sub">Every number on mouka is one of these metrics, defined once in the data model. The hover cards, the ✦ popovers and this page read the same definitions.</div>
              <label class="search defs-search">${icon('search', 'sm')}<input id="defs-q" placeholder="Search metrics"></label>
            </div>
            <div class="defs-list" id="defs-list"></div>
          </section>`,
      };
      el.innerHTML = OG.frame(this, OG.layout(this));
      warmAll();
      $('defs-q').addEventListener('input', (e) => { this.text = e.target.value.trim().toLowerCase(); WF.renderAll(); });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-goview]'); if (b) { WF.go(b.dataset.goview); return; }
        const j = e.target.closest('[data-jump]'); if (j) document.getElementById(j.dataset.jump)?.scrollIntoView({ block: 'start' });
      });
    },
    render() {
      const use = usage();
      const all = DATASETS.flatMap((ds) => Object.entries(WF.DEFS?.[ds] ?? {}).map(([m, d]) => ({ ds, m, ...d, where: [...(use.get(`${ds}.${m}`)?.values() ?? [])] })));
      const match = (d) => !this.text || `${d.m} ${d.label} ${d.description}`.toLowerCase().includes(this.text);
      // C16: group by the page a metric first appears on (in nav order); metrics the app doesn't show go last
      const navOf = (d) => { const v = d.where.map((w) => WF.views.get(w.viewId)?.nav); return PAGES.find(([n]) => v.includes(n))?.[0] ?? 'none'; };
      const groups = [...PAGES, ['none', 'Not shown on a page']].map(([n, label]) => ({ n, label,
        items: all.filter((d) => navOf(d) === n && match(d)).sort((a, b) => a.label.localeCompare(b.label)) })).filter((g) => g.items.length);
      const total = groups.reduce((k, g) => k + g.items.length, 0);
      $('defs-idx').innerHTML = `<div class="label">On this page</div>${groups.map((g) => `<button type="button" data-jump="defs-g-${g.n}"><span>${esc(g.label)}</span><span class="muted">${g.items.length}</span></button>`).join('')}
        <div class="muted defs-count">${total} of ${all.length} metrics</div>`;
      $('defs-list').innerHTML = groups.map((g) => `<div class="defs-group" id="defs-g-${g.n}"><div class="label">${esc(g.label)}</div>
        ${g.items.map((d) => `<div class="def" data-metric="${esc(d.ds)}.${esc(d.m)}">
          <div class="name">${esc(d.label)}</div>
          <div class="desc">${esc(d.description || 'No description in the data model yet.')}</div>
          ${d.where.length ? `<div class="where">${d.where.map((w) => `<button type="button" data-goview="${esc(w.viewId)}">${esc(w.viewLabel)} · ${esc(w.card)}</button>`).join('')}</div>` : ''}
          <details class="aml"><summary>Show AML · <span class="mono">${esc(d.m)}</span> <span class="muted">${esc(d.ds)}</span></summary>${d.definition ? `<pre>${esc(d.definition)}</pre>` : '<div class="muted">No AQL definition.</div>'}</details>
        </div>`).join('')}</div>`).join('') || '<div class="state">No metric matches.</div>';
    },
  };
  WF.register(view);
})();
