// The component gallery (ds.html, /apps/mouka/ds): every token, component, chart and layout of mouka, drawn with
// the same builders and CSS the app uses, so a token edit (ds/tokens.css or the panel) shows everywhere at once.
// Sample numbers are synthetic; category colours are the governed ones (dim_categories.chart_color) once they load.
(() => {
  const { esc, icon } = OG;
  const $ = (id) => document.getElementById(id);
  WF.asOf = WF.asOf || '2026-10-14';   // calendars and freshness read the data as-of date (the app sets it at boot)
  // ds-lint: allow (sample fallback for the governed palette, replaced by OG.catColor once og3_cat_colors loads)
  const CAT = [['Food & drinks', '#D49648'], ['Transport', '#72B875'], ['Bills', '#A497EA'], ['Cat', '#DF84A8'], ['Well-being', '#26BDAE'],
    ['Shopee', '#E58870'], ['Subscriptions', '#1DB8CE'], ['Learning', '#C68BD3'], ['Other', '#9FA5AC']];   // ds-lint: allow
  const cat = (en) => OG.catColor(en, CAT.find(([n]) => n === en)?.[1]);

  // ---- helpers
  const sec = (id, title, lead, body) => `<section class="gal-sec" id="${id}"><h2>${esc(title)}</h2>${lead ? `<p class="gal-lead">${lead}</p>` : ''}${body}</section>`;
  const demo = (name, html, code = '') => `<figure class="gal-demo"><div class="gal-stage">${html}</div><figcaption><span class="gal-name">${esc(name)}</span>${code ? `<code>${esc(code)}</code>` : ''}</figcaption></figure>`;
  const lum = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if (!m) return null;
    const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const toHex = (v) => {
    const s = String(v).trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
    const m = s.match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
    return m ? `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : s;
  };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); if (x == null || y == null) return null; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  // ---- foundations
  const COLOUR_GROUPS = [
    ['Surfaces', ['--page', '--surface', '--tint', '--fill-subtle', '--fill-active', '--fill-circle', '--fill-initial', '--row-hover', '--stripe']],
    ['Lines', ['--border', '--border-strong', '--rule', '--rule-soft']],
    ['Ink', ['--ink', '--ink-2', '--ink-3', '--on-ink']],
    ['Status', ['--pos', '--pos-ink', '--pos-tint', '--neg', '--neg-ink', '--neg-tint', '--warn', '--warn-tint', '--warn-ink', '--info-ink', '--info-tint', '--budget']],
    ['✦ AI and notes', ['--ai', '--ai-ink', '--ai-tint', '--ai-border', '--note-tint', '--note-border']],
    ['Charts', ['--area-line', '--area-fill', '--chart', '--chart-line', '--chart-soft', '--chart-pace', '--chart-done', '--chart-track', '--chart-grid', '--chart-ref', '--chart-compare', '--chart-hist', '--chart-past', '--chart-past-2']],
    ['Heat ramp', ['--heat-1', '--heat-2', '--heat-3', '--heat-4']],
  ];
  // text tokens are checked at 4.5:1; --ai / --chart-line are icons and strokes (3:1, marked by NONTEXT)
  const TEXTY = new Set(['--ink', '--ink-2', '--ink-3', '--pos-ink', '--neg-ink', '--warn-ink', '--info-ink', '--ai-ink', '--ai', '--chart-line']);
  const NONTEXT = new Set(['--ai', '--chart-line', '--area-line']);
  function colour() {
    const surface = toHex(DS.token('--surface'));
    const sw = (t) => {
      const v = toHex(DS.token(t)), c = TEXTY.has(t) ? contrast(v, surface) : null;
      return `<div class="gal-swatch"><span class="chipbox" style="background:var(${t})"></span><div><div class="gal-tk">${t}</div><div class="muted gal-val">${esc(v)}${c ? ` · <span class="${c >= (NONTEXT.has(t) ? 3 : 4.5) ? '' : 'warn'}" title="contrast on --surface (${NONTEXT.has(t) ? 'icon / stroke: 3:1' : 'text: 4.5:1'})">${c.toFixed(1)}:1</span>` : ''}</div></div></div>`;
    };
    return COLOUR_GROUPS.map(([g, ts]) => `<div class="gal-g">${g}</div><div class="gal-swatches">${ts.map(sw).join('')}</div>`).join('')
      + `<div class="gal-g">Categories (the AML's dim_categories.chart_color, unless the theme sets --cat-&lt;slug&gt;)</div><div class="gal-swatches">${CAT.map(([n]) => {
        const slug = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), themed = DS.token(`--cat-${slug}`);
        return `<div class="gal-swatch">${OG.chip(cat(n), n)}<div><div class="gal-tk">${esc(n)}</div><div class="muted gal-val">${esc(toHex(cat(n)))} · ${themed ? `theme --cat-${slug}` : 'AML'}</div></div></div>`;
      }).join('')}</div>`;
  }
  function type() {
    const row = (t, cls, txt, note) => `<div class="gal-type"><div class="gal-tk">${t}<span class="muted"> · ${esc(DS.token(t))}</span></div><div class="${cls}">${txt}</div>${note ? `<div class="muted gal-val">${note}</div>` : ''}</div>`;
    return row('--fs-page-hero', 'hero page', '₫844,299,746', 'the one page hero per view (.hero.page)')
      + row('--fs-card-hero', 'hero', '₫2,650,510', 'card heroes, page titles (.hero)')
      + `<div class="gal-type"><div class="gal-tk">--serif<span class="muted"> · ${esc(DS.token('--serif').split(',')[0])}</span></div><div class="editorial"><h3>Salary lands in <em>10 days</em></h3></div></div>`
      + row('--fs-body', 'gal-body', 'Body text, list rows and table cells: Highlands Coffee, Grab, Circle K.', '')
      + row('--fs-2', 'sub', 'Secondary text and buttons. Oct 14 · 13 buys', '')
      + row('--fs-label', 'label', 'Mono caps label', `.label · tracking ${esc(DS.token('--ls-label'))}`)
      + `<div class="gal-type"><div class="gal-tk">--fw-regular / --fw-medium</div><div class="gal-body">Regular ${DS.token('--fw-regular')} · <b style="font-weight:var(--fw-medium)">Medium ${DS.token('--fw-medium')}</b></div></div>`;
  }
  function shape() {
    const r = ['--r-sm', '--r-md', '--r-lg'].map((t) => `<div class="gal-shape" style="border-radius:var(${t})"><span class="gal-tk">${t}</span><span class="muted">${DS.token(t)}</span></div>`).join('');
    const s = ['--shadow-card', '--shadow-pop'].map((t) => `<div class="gal-shape gal-shadow" style="box-shadow:var(${t})"><span class="gal-tk">${t}</span></div>`).join('');
    return `<div class="gal-row">${r}</div><div class="gal-row">${s}<div class="gal-shape gal-ring" tabindex="0"><span class="gal-tk">--focus-ring</span><span class="muted">tab here</span></div></div>`;
  }
  function space() {
    const sp = [1, 2, 3, 4, 5, 6].map((i) => `<div class="gal-sp"><span class="gal-tk">--sp-${i}</span><span class="gal-bar" style="width:var(--sp-${i})"></span><span class="muted">${DS.token(`--sp-${i}`)}</span></div>`).join('');
    const lay = ['--nav-w', '--gap', '--page-pad-x', '--card-pad', '--card-head-h', '--ctl-h', '--tile', '--row-h', '--chart-h', '--content-max'].map((t) =>
      `<div class="gal-sp"><span class="gal-tk">${t}</span><span class="muted">${DS.token(t)}</span></div>`).join('');
    const mo = `<div class="gal-row"><button class="btn" type="button" data-replay="pop">Replay pop-in · <span class="muted">--dur-fast ${DS.token('--dur-fast')}</span></button>
      <button class="btn" type="button" data-replay="slide">Replay slide · <span class="muted">--dur ${DS.token('--dur')}</span></button><div class="gal-motion" id="gal-motion">${icon('spark')}</div></div>`;
    return `<div class="gal-cols"><div>${sp}</div><div>${lay}</div></div>${mo}`;
  }

  // ---- components
  function cards() {
    const hero = `${OG.heroRow({ id: 'gal-hero', action: OG.btn({ label: 'Forecast', icon: 'chev' }) })}`;
    const fill = (html) => html.replace('id="gal-hero"></div>', 'id="gal-hero">₫844,299,746</div>').replace('id="gal-hero-delta"></div>', `id="gal-hero-delta">${OG.delta({ amt: 29600000, pct: 0.036, word: 'past month' })}</div>`);
    const rows = [['Bills', '33.2%', '₫882K'], ['Food & drinks', '28.3%', '₫750K']].map(([n, m, v]) => OG.row({ lead: OG.tile({ icon: OG.catIcon(n), color: cat(n) }), title: n, meta: m, value: v })).join('');
    return `<p class="gal-lead">ONE anatomy: eyebrow label (› when the card navigates) · an info slot (the amber freshness dot) · at most ONE control · the quiet ✦ · ⋮ for utility actions (Download CSV, Add). A text switch drops under the label in a narrow card.</p>
    <div class="gal-grid3">
      ${demo('card · control + ✦ + ⋮ + hero', fill(OG.card({ id: 'gal-c1', label: 'Net worth', explain: 'x:y', control: OG.segIcons('gal-c1-m', [{ key: 'line', icon: 'area' }, { key: 'bars', icon: 'bars' }], 'line'), menu: [{ key: 'csv', label: 'Download CSV', icon: 'list' }], body: hero })), "OG.card({ label, control, explain, menu, body: OG.heroRow(…) })")}
      ${demo('card · navigates (›) + info dot', OG.card({ id: 'gal-c2', label: 'Category breakdown', go: 'x', info: '<span class="stale-dot"></span>', explain: 'x:y', body: rows }), "OG.card({ go, info })")}
      ${demo('card · narrow, text switch', `<div class="gal-narrow">${OG.card({ id: 'gal-c3', label: 'Summary', explain: 'x:y', control: OG.segBtns('gal-c3-s', [{ key: 't', label: 'Totals' }, { key: 'p', label: 'Percent' }], 't'), menu: [{ key: 'csv', label: 'Download CSV' }], body: '<div class="sub">In a card under 400px the switch takes its own row.</div>' })}</div>`, '@container (max-width: 400px)')}
      ${demo('card · flush body', OG.card({ id: 'gal-c4', label: 'Balance sheet', explain: 'x:y', flush: true, body: OG.table({ cols: [{ title: 'Account', main: true, cell: (r) => r.s }, { title: 'Balance', r: true, cell: (r) => r.v }], rows: [{ s: 'SSI Securities', v: '₫423,368,677' }, { s: 'Vàng', v: '₫153,500,000' }] }) }), "OG.card({ flush: true }): the body brings its own padding")}
      ${demo('missing block (pages.js typo)', '<section class="card ds-missing">Unknown block “hn-mian” in js/pages.js (home/networth)</section>', 'what a wrong id in js/pages.js shows')}
    </div>`;
  }
  function numbers() {
    return `<div class="gal-grid3">
      ${demo('page hero + delta line', `${OG.hero({ value: '₫844,299,746', page: true })}<div class="delta">${OG.delta({ amt: 29600000, pct: 0.036, word: 'past month' })}</div>`, "OG.heroRow({ id }) · OG.delta({ amt, pct, word, invert })")}
      ${demo('delta · inverted (spending)', `<div class="delta">${OG.delta({ amt: -14100000, pct: -0.841, word: 'vs Sep 1–14', invert: true })}</div><div class="delta">${OG.delta({ amt: 2100000, pct: 0.12, word: 'vs Sep 1–14', invert: true })}</div>`, 'invert: true → spending more reads as a loss')}
      ${demo('card hero', `${OG.hero({ value: '₫2,650,510' })}${OG.change({ cls: 'muted', html: '₫1.1M less than September' })}`, 'OG.hero({ value })')}
      ${demo('legend', `${OG.legendDot('October')} &nbsp; ${OG.legendDot('September', 'dash')}`, "OG.legendDot(text, 'dash')")}
      ${demo('kpi strip', OG.kpis([{ k: 'Interest', v: '₫4.2M' }, { k: 'Dividends', v: '₫1.9M' }, { k: 'Per month', v: '₫508K' }]), 'OG.kpis(items)')}
      ${demo('kpi strip · left', OG.kpis([{ k: 'Net', v: '<span class="pos">+₫14.1M</span>' }, { k: 'Savings rate', v: '26.3%' }], 'left'), "OG.kpis(items, 'left')")}
      ${demo('kpi band', OG.kpis([{ k: 'Spent', v: '₫2.65M' }, { k: 'Income', v: '₫41M' }, { k: 'Net', v: '₫38.4M' }], 'band'), "OG.kpis(items, 'band')")}
      ${demo('progress', `${OG.progress(0.42)}<br>${OG.progress(0.86, { tone: 'warn' })}<br>${OG.progress(1, { tone: 'over' })}<br>${OG.progress(0.3, { thin: true })}`, "OG.progress(share, { tone: 'warn' | 'over', thin })")}
      ${demo('states', `<div class="state busy">Loading…</div><div class="state">Nothing in this period.</div><div class="state error">Couldn't load: timeout</div>`, "OG.stateLine(id) (filled by WF.status)")}
      ${demo('notes · Worth knowing', OG.notes([{ k: 'a', icon: 'trend', tone: 'pos', html: 'Ahead of the VN-Index by <span class="em">4.4 pts</span> this year' }, { k: 'b', icon: 'invest', html: '<span class="em">Gold</span> is 27% of what you hold' }, { k: 'c', icon: 'trend-down', tone: 'neg', html: '<span class="em">MWG</span> and <span class="em">VNM</span> are below what you paid' }]), "OG.notes([{ k, icon, tone: '' | 'pos' | 'neg', html }])")}
      ${demo('callout', OG.callout({ label: 'Summary', html: 'You spend most on <b>weekday lunches</b>, 11:00–13:00.' }), 'OG.callout({ label, html })')}
    </div>`;
  }
  function controls() {
    return `<p class="gal-lead">One segmented look for every switch (page tabs, icon segments, text segments); one range set for every chart.</p><div class="gal-grid3">
      ${demo('buttons', `<div class="gal-row">${OG.btn({ label: 'Forecast', icon: 'chev' })}${OG.btn({ label: 'Save', kind: 'primary' })}${OG.btn({ label: 'Clear filters', kind: 'link' })}<button class="btn" type="button" disabled>Disabled</button></div>`, "OG.btn({ label, kind: '' | 'primary' | 'link' | 'full', icon })")}
      ${demo('page tabs', '<nav class="tabs"><button class="tab active" type="button">Net worth</button><button class="tab" type="button">Spending</button><button class="tab" type="button">Investments</button></nav>', '.tabs > .tab (OG.frame draws them)')}
      ${demo('range pills', OG.ranges('gal-rng', OG.RANGES ?? ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'], '1M'), 'OG.ranges(id, OG.RANGES, active)')}
      ${demo('icon segments', OG.segIcons('gal-seg', [{ key: 'line', icon: 'line' }, { key: 'cal', icon: 'cal' }], 'line'), 'OG.segIcons(id, items, active)')}
      ${demo('slider', OG.slider({ id: 'gal-sl', label: 'Save more each month', min: -10, max: 10, step: 1, value: 3 }), "OG.slider({ id, label, min, max, step, value }) · the view fills #id-v")}
      ${demo('text segments', OG.segBtns('gal-sb', [{ key: 'e', label: 'Expenses' }, { key: 'b', label: 'Budget' }], 'e'), 'OG.segBtns(id, items, active)')}
      ${demo('⋮ menu', `<div class="gal-row">${OG.menu('gal-menu', [{ key: 'csv', label: 'Download CSV', icon: 'list' }, { key: 'add', label: 'Add account', icon: 'plus', disabled: true }])}<span class="sub">click the dots</span></div>`, 'OG.menu(id, items) (OG.card({ menu }) draws it)')}
      ${demo('icon buttons', `<div class="gal-row"><button class="sq" type="button">${icon('plus')}</button><span class="card-head gal-inline"><button class="sq ai" type="button">${icon('spark')}</button></span><button class="dots" type="button">${icon('dots')}</button><button class="sq bare" type="button">${icon('left')}</button></div>`, '.sq · ✦ (.sq.ai) · .dots · .sq.bare')}
      ${demo('search + toggle', `<div class="gal-row"><label class="search">${icon('search', 'sm')}<input placeholder="Search"></label>${OG.toggle('Pro view', true)}</div>`, ".search · OG.toggle(label, on)")}
      ${demo('Ask AI composer', OG.composer({ id: 'gal-ask', scope: '<span class="dot"></span><span>Your data · as of Oct 14</span>' }), "OG.composer({ id, placeholder, scope }) · Enter sends, Shift+Enter = new line")}
      ${demo('nudge chips', `<div class="gal-row">${OG.nudge({ key: 'spend', label: 'Analyze my spending', icon: 'analyze' })}${OG.nudge({ key: 'budget', label: 'Am I on budget?', icon: 'target' })}</div>`, 'OG.nudge({ key, label, icon }) (data-k: OG.bindKeys)')}
      ${demo('head search', `<div class="gal-row">${OG.searchField('gal-q', 'Search merchants')}</div>`, "OG.searchField(id, placeholder) · a card-head control; under 520px it drops under the title")}
      ${demo('filter chips', OG.filterChips([{ key: 'cat', label: 'Food & drinks' }, { key: 'q', label: '“Grab”' }]), "OG.filterChips([{ key, label }]) · × removes one (data-chip), Clear all (data-chip-clear)")}
      ${demo('day header + split bar', `${OG.dayHead('2026-10-14', '<span class="amt">₫260K</span> spent')}<div style="margin-top:16px">${OG.splitBar([{ label: 'Bills', value: 1.32, tone: '--chart' }, { label: 'Subscriptions', value: 1.35, tone: '--flow-in' }])}</div>`, "OG.dayHead(ymd, rightHtml) · OG.splitBar([{ label, value, tone | color }])")}
    </div>`;
  }
  function pills() {
    return `<div class="gal-grid3">
      ${demo('category chips', `<div class="gal-row">${CAT.slice(0, 6).map(([n]) => OG.chip(cat(n), n)).join('')}</div><div class="gal-row">${CAT.slice(0, 6).map(([n]) => OG.chip(cat(n), n, true)).join('')}</div>`, 'OG.chip(color, category, small)')}
      ${demo('initials', '<div class="gal-row"><span class="initial">TC</span><span class="initial sm">VI</span><span class="initial logo">FPT</span></div>', '.initial · .initial.sm · .initial.logo')}
      ${demo('category pill', `<span class="cat-pill">${OG.chip(cat('Transport'), 'Transport', true)}Transport ${icon('down', 'sm')}</span>`, '.cat-pill')}
      ${demo('badges', `<div class="gal-row">${OG.badge('+3.6%', 'pos')}${OG.badge('-1.2%', 'neg')}${OG.badge('0.0%')}</div>`, "OG.badge(text, 'pos' | 'neg' | 'zero')")}
      ${demo('status pills', `<div class="gal-row">${OG.statusPill('behind', 'behind')}${OG.statusPill('on pace', 'on_pace')}${OG.statusPill('maxed', 'maxed')}${OG.statusPill('no cycle')}</div>`, "OG.statusPill(text, kind)")}
      ${demo('freshness dot + Mom chip', '<div class="gal-row"><span class="label">Spend this month</span><span class="stale-dot"></span></div><span class="me-chip">Money to Mom not counted <button type="button">Undo</button></span>', '.stale-dot (O1) · .me-chip (O5)')}
    </div>`;
  }
  function lists() {
    const tx = [
      { m: 'Highlands Coffee', d: '2026-10-14', amt: -65000, en: 'Food & drinks' }, { m: 'Grab', d: '2026-10-13', amt: -17000, en: 'Transport' },
      { m: 'Salary', d: '2026-09-24', amt: 41000000, en: 'Other', ft: 'salary' }, { m: 'Lan paid back lunch', d: '2026-09-22', amt: 120000, en: 'Other', ft: 'friend_payback' },
    ].map((r) => ({ ...r, color: cat(r.en) }));
    const rows = [{ s: 'FPT', n: 'FPT Corp', q: 400, v: 52400000, r: 0.124 }, { s: 'VNM', n: 'Vinamilk', q: 600, v: 38760000, r: -0.031 }, { s: 'SJC', n: 'SJC gold', q: 2, v: 26800000, r: 0.214 }];
    const table = OG.table({ cols: [
      { title: 'Holding', main: true, cell: (r) => `<div class="hold"><span class="initial logo">${r.s}</span><div><div class="t">${r.n}</div><div class="s">${r.q} units</div></div></div>` },
      { title: 'Value', r: true, sort: 'v', cell: (r) => OG.money(r.v) },
      { title: 'Return', r: true, sort: 'r', cell: (r) => `<span class="${r.r >= 0 ? 'pos' : 'neg'}">${r.r >= 0 ? '+' : ''}${(r.r * 100).toFixed(1)}%</span>` }], rows, sort: { field: 'v', direction: 'desc' } });
    const rowDemo = [
      OG.row({ lead: OG.tile({ icon: OG.catIcon('Food & drinks'), color: cat('Food & drinks') }), title: 'Food & drinks', meta: '28.3%', value: '₫750K' }),
      OG.row({ lead: OG.tile({ icon: 'repeat', color: cat('Subscriptions') }), title: 'Notion', meta: 'Oct 14', value: '₫259,510' }),
      OG.row({ lead: OG.tile({ text: 'SS' }), title: 'SSI Securities', meta: 'up to date', value: '₫423M', sub: '<span class="pos">+2.0%</span>' }),
      OG.row({ lead: OG.tile({ text: 'FPT' }), title: 'FPT', meta: 'FPT Corporation', value: '₫94.7M' }),
    ].join('');
    return `<div class="gal-grid2">
      ${demo('one-line row · accounts, categories (no second line, no dividers)', `<div data-disc-scope="gal-acc"><div class="lrow-group">${OG.discBtn({ key: 'g', label: 'Investments', swatch: '--chart', size: 'list' })}<span class="v">₫577M</span></div>
        ${OG.line({ attrs: 'data-under="g"', cls: 'in-group gal-in', title: 'SSI Securities', aside: '<span class="pos">+2.0%</span>', value: '₫423M' })}${OG.line({ attrs: 'data-under="g"', cls: 'in-group gal-in', title: 'Vàng', aside: '<span class="pos">+12.9%</span>', value: '₫154M' })}</div>
        ${OG.line({ lead: OG.tile({ icon: OG.catIcon('Bills'), color: cat('Bills') }), title: 'Bills', aside: '33.2%', value: '₫882K' })}`, "OG.line({ lead?, title, aside, value }) · OG.discBtn({ …, size: 'list' })")}
      ${demo('two-line row · transactions, holdings (the second line is context)', rowDemo, 'OG.row({ lead: OG.tile({ icon, color } | { text }), title, meta, value, sub })')}
      ${demo('boxed list', OG.boxed({ head: '<span class="dot" style="background:var(--ink-2)"></span><span>Expense</span><span class="grow"></span><span class="sub">Monthly limit</span>', body: '<div class="sub">Rows go here</div>' }), 'OG.boxed({ head, body })')}
    </div>${demo('table', table, "OG.table({ cols: [{ title, r, main, sort, cell }], rows, sort })")}`;
  }
  function calendars() {
    const m0 = '2026-10-01', days = [3, 12, 0, 8, 41, 6, 17, 2, 9, 0, 11, 7, 14, 5].map((k, i) => ({ period: `2026-10-${String(i + 1).padStart(2, '0')}`, spent: k * 63000 }));
    const upc = [{ due: '2026-10-15', m: 'Netflix', amt: 260000, en: 'Subscriptions' }, { due: '2026-10-18', m: 'EVN', amt: 451000, en: 'Bills' }, { due: '2026-10-21', m: 'Spotify', amt: 59000, en: 'Subscriptions' }]
      .map((r) => ({ ...r, color: cat(r.en) }));
    return `<div class="gal-grid2">${demo('month calendar', OG.monthCal(m0, days, { asOf: '2026-10-14' }), "OG.monthCal(month0, rows, { key, val, asOf })")}
      ${demo('week calendar (Monday first)', OG.weekCal(upc, 'gal'), 'OG.weekCal(upcoming, queryName, weeks)')}</div>`;
  }
  function overlays() {
    const hc = `<div class="hc wide gal-static"><div class="tp-title">Spend this month</div><div class="hc-lead">Oct 1 → Oct 14, every ledger source.</div>
      <div class="kv"><span>Card lines</span><span class="v">₫2.1M</span><span>Debit lines</span><span class="v">₫550K</span></div>
      <div class="hc-def sep"><div class="tp-title">spend</div><div>Money that left for goods and services; transfers to yourself are not spending.</div></div>
      <button class="link" type="button">See the rows ${icon('chev', 'sm')}</button></div>`;
    const tp = `<div class="trace-pop gal-static"><div class="tp-title">${icon('spark', 'sm')} Net worth</div><div class="meta">wealth · nw</div><div>Assets minus liabilities at the as-of date.</div><pre>explore { measures { nw: net_worth } }</pre></div>`;
    const pop = `<div class="popover gal-static"><div class="ph"><span>Your accounts</span><span class="box on">${icon('check', 'sm')}</span></div>
      <div class="opt"><span class="initial sm">TC</span><div><div class="t">TCB debit</div></div><span class="box on">${icon('check', 'sm')}</span></div>
      <div class="opt"><span class="initial sm">TI</span><div><div class="t">Timo</div></div><span class="box"></span></div>
      <div class="pf">${OG.btn({ label: 'Clear filters', kind: 'link' })}${OG.btn({ label: 'Apply', kind: 'primary' })}</div></div>`;
    return `<div class="gal-grid3">${demo('hover card', hc, 'data-hc="key" + OG.hc[key] = (el) => html')}${demo('✦ trace popover', tp, 'WF.tracer.explain("query:alias")')}${demo('popover', pop, '.popover (OG.accountPopover)')}
      ${demo('drawer', `${OG.btn({ label: 'Open a drawer', attrs: 'data-gal-drawer' })}`, 'OG.drawer({ label, body, foot })')}
      ${demo('scrim', '<div class="gal-scrim"></div>', '.scrim (--overlay)')}</div>`;
  }
  function charts() {
    const box = (id, name, code, h = 220) => demo(name, `<div class="chart" id="${id}" style="height:${h}px"></div>`, code);
    return `<div class="gal-grid2">${box('gal-area', 'area + comparison + reference line', 'OG.area(el, xs, ys, { compare, hLines })')}${box('gal-bars', 'bars + line', 'OG.barsLine(el, labels, bars, line)')}
      ${box('gal-gauge', 'gauge', 'OG.gauge(el, segments, { total })', 200)}${box('gal-heat', 'heat grid', 'OG.heat(el, cells, { xs, ys, max })', 200)}
      ${box('gal-mini', 'mini bars + average', 'OG.miniBars(el, labels, values, avg)', 160)}
      ${demo('ring + spark', '<div class="gal-row"><div class="ring" id="gal-ring"></div><div class="chart" id="gal-spark" style="height:40px;width:160px"></div><div class="chart" id="gal-spark2" style="height:40px;width:160px"></div></div>', 'OG.ring(el, value, cap, projected) · OG.spark(el, ys, up)')}</div>`;
  }
  function drawCharts() {
    if (!$('gal-area')) return;
    const xs = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
    let a = 0, b = 0;
    const cur = xs.map((_, i) => (i < 14 ? (a += 120000 + ((i * 7919) % 5) * 90000) : null));
    const prev = xs.map((_, i) => (b += 150000 + ((i * 104729) % 7) * 80000));
    OG.area($('gal-area'), xs, cur, { areaFill: false, scale: false, xFmt: (v) => v, compare: [{ name: 'September', data: prev }], hLines: [{ y: 4500000, label: '₫4.5M Budget' }] });
    const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
    OG.barsLine($('gal-bars'), months, [12e6, 9.5e6, -2e6, 14e6, 11e6, 6e6], [0.29, 0.23, -0.05, 0.34, 0.27, 0.15]);
    OG.gauge($('gal-gauge'), CAT.slice(0, 5).map(([n], i) => ({ name: n, value: [881800, 750000, 724200, 259510, 35000][i], color: cat(n) })), { total: 3000000 });
    const hours = Array.from({ length: 24 }, (_, h) => h), wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cells = []; wd.forEach((_, y) => hours.forEach((h) => cells.push([h, y, Math.max(0, Math.round(Math.sin((h - 6) / 3) * 3 + ((h * 31 + y * 17) % 5)) * 40000)])));
    OG.heat($('gal-heat'), cells, { xs: hours, ys: wd, max: Math.max(...cells.map((c) => c[2])) });
    OG.miniBars($('gal-mini'), months, [3.1e6, 2.6e6, 4.0e6, 2.9e6, 3.3e6, 2.65e6], 3.1e6);
    OG.ring($('gal-ring'), 217208, 1000000, 410000);
    OG.spark($('gal-spark'), [3, 4, 3.5, 5, 6, 5.5, 7], true);
    OG.spark($('gal-spark2'), [7, 6, 6.5, 5, 4, 4.5, 3], false);
  }

  // ---- breakpoints, layouts and page config
  const BPS = [['xl', '≥ 1280', 'sidebar', 'main 8 · rail 4'], ['lg', '1024–1279', 'sidebar (narrower)', 'main 8 · rail 4'], ['md', '900–1023', 'icon rail', 'main 8 · rail 4'],
    ['sm', '600–899', 'icon rail', 'one column · the rail’s cards side by side'], ['xs', '< 600', 'bottom tab bar + More', 'one column']];
  function breakpoints() {
    const now = DS.bp();
    const mini = (k) => `<div class="gal-bp-frame bp-${k}"><span class="nav"></span><span class="m"></span><span class="r"></span><span class="bar"></span></div>`;
    return `<p class="gal-lead">Breakpoints are <b>frame</b> widths: the app runs in Anfra's frame, about 265px narrower than the browser window (a 1440px laptop gives a ~1166px frame = lg).
      They live in <code>ds/layout.css</code> (max-width 1279 / 1023 / 899 / 599px) and nowhere else (<code>ds-lint.sh</code> checks). Inside a card, container queries do the reflow.</p>
      <div class="gal-bp-now">This frame: <b id="gal-bp-w">${innerWidth}px</b> → <b id="gal-bp-k">${now}</b></div>
      <div class="gal-bps">${BPS.map(([k, w, shell, grid]) => `<div class="gal-bp${k === now ? ' on' : ''}" data-bp="${k}">${mini(k)}<div class="gal-tk">${k} · ${w}</div><div class="sub">${shell}</div><div class="muted gal-val">${grid}</div></div>`).join('')}</div>`;
  }
  function layouts() {
    const ph = (t) => () => `<div class="gal-ph">${esc(t)}</div>`;
    const lay = (id, page, blocks) => { OG.PAGES[id] = page; return `<div class="gal-wire">${OG.layout({ id, blocks })}</div>`; };
    const b = { a: ph('hero'), b: ph('below'), c: ph('rail'), d: ph('rail 2'), p: ph('left'), q: ph('right') };
    return `<div class="gal-grid2">
      ${demo('row · main 8 + rail 4', lay('_gal-mr', { row: [{ stack: ['a', 'b'], span: 8 }, { stack: ['c', 'd'], span: 4, rail: true }] }, b), "{ row: [{ stack: [...], span: 8 }, { stack: [...], span: 4, rail: true }] }")}
      ${demo('pair inside the main column (4 + 4)', lay('_gal-pair', { row: [{ stack: ['a', { pair: ['p', 'q'] }], span: 8 }, { stack: ['c'], span: 4, rail: true }] }, b), "{ pair: ['left', 'right'] }")}
      ${demo('row · 6 + 6', lay('_gal-66', { row: [{ stack: ['p'], span: 6 }, { stack: ['q'], span: 6 }] }, b), "{ row: [{ stack, span: 6 }, { stack, span: 6 }] }")}
      ${demo('stack', lay('_gal-stack', { stack: ['a', 'b'] }, b), "{ stack: [ … ] }")}</div>`;
  }
  const ids = (n, out = []) => { if (typeof n === 'string') out.push(n); else if (Array.isArray(n)) n.forEach((x) => ids(x, out)); else if (n) [n.row, n.stack, n.pair, n.items].forEach((x) => x && ids(x, out)); return out; };
  const tree = (n) => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(tree).join(' · ')
    : n.row ? `row [ ${n.row.map(tree).join(' | ')} ]` : n.stack ? `${n.span ? `${n.span}:` : ''}stack(${tree(n.stack)})${n.rail ? '·rail' : ''}` : n.pair ? `pair(${tree(n.pair)})` : n.grid ? `${n.grid} [ ${(n.items ?? []).map(tree).join(' | ')} ]` : '?');

  // ---- saved looks (presets): what the panel's Save wrote to ds/presets.js, plus this session's unsaved ones
  function presets() {
    const list = DS.PRESETS;
    if (!list.length) return `<p class="gal-lead">No saved looks yet. Open the panel (<b>Edit tokens</b> or <code>\\</code>), adjust, then name the look and Save. With <code>python3 -I scripts/ds_save.py</code> running it lands in <code>ds/presets.js</code> and shows here.</p>`;
    const isColour = (v) => /^#[0-9a-f]{6}$/i.test(v);
    return `<div class="gal-presets">${list.map((p) => {
      const o = Object.entries(p.overrides ?? {}), on = DS.active?.slug === p.slug;
      return `<div class="gal-preset${on ? ' on' : ''}"><div class="row-between"><div><div class="gal-pn">${esc(p.name)}${on ? ` <span class="badge pos">active${DS.presetModified() ? ', modified' : ''}</span>` : ''}${p.session ? ' <span class="badge zero">this session</span>' : ''}</div>
          <div class="muted gal-val">${esc(p.theme)} theme · ${o.length} token${o.length === 1 ? '' : 's'}${p.savedAt ? ` · saved ${esc(new Date(p.savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}` : ''}</div></div>
          ${OG.btn({ label: on ? 'Applied' : 'Apply', attrs: `data-gal-preset="${esc(p.slug)}"` })}</div>
        <div class="gal-pswatches">${o.filter(([, v]) => isColour(v)).map(([k, v]) => `<span class="chipbox" title="${esc(k)} ${esc(v)}" style="background:${esc(v)}"></span>`).join('')}</div>
        <div class="gal-pdiff">${o.map(([k, v]) => `<div><code>${esc(k)}</code> <span class="muted">${esc(v)}</span></div>`).join('') || '<span class="muted">the theme as it ships</span>'}</div></div>`;
    }).join('')}</div>`;
  }
  function pages() {
    return Object.entries(OG.PAGES).filter(([k]) => !k.startsWith('_')).map(([k, page]) => {
      const blocks = Object.fromEntries(ids(page).map((b) => [b, () => `<div class="gal-ph">${esc(b)}</div>`]));
      return demo(k, `<div class="gal-wire small">${OG.layout({ id: k, blocks })}</div>`, tree(page));
    }).join('');
  }

  // ---- page
  function render() {
    $('gallery').innerHTML = `
      <header class="gal-head"><div><h1>mouka design system</h1>${DS.active ? `<div class="gal-active">Look: <b>${esc(DS.active.name)}</b>${DS.presetModified() ? ' · modified' : ''}</div>` : ''}
        <p class="gal-lead">Every token, component and layout of the app, drawn by the same code. Edit the mouka block in <code>ds/themes.css</code> (mouka's colours and type), <code>ds/tokens.css</code> (shared values: sizes, radii, spacing, widths, and calm's colours),
        <code>ds/components.css</code> + <code>js/ds/components.js</code> (components) or <code>js/pages.js</code> (layouts), then reload; or try values live in the panel.</p></div>
        <div class="dsp-themes gal-themes">${DS.THEMES.map((t) => `<button type="button" data-gal-theme="${t}" class="${t === DS.theme() ? 'on' : ''}">${t}</button>`).join('')}</div></header>
      ${sec('presets', 'Saved looks', 'Named sets of token changes from the panel’s Save. Apply one to see every component in it (undoable in the panel).', presets())}
      ${sec('colour', 'Colour', 'Semantic tokens (what themes override). Contrast is against <code>--surface</code>; amber means under 4.5:1.', colour())}
      ${sec('type', 'Type', 'Five sizes, two weights (C11). Sans, mono and serif families are tokens too.', type())}
      ${sec('shape', 'Shape & elevation', 'Three radii and two shadows; cards use <code>--r-lg</code> through <code>--card-radius</code>.', shape())}
      ${sec('space', 'Space, layout & motion', 'The spacing scale, the layout tokens behind <code>js/pages.js</code>, and the two motion durations.', space())}
      ${sec('cards', 'Cards', 'The unit every page is made of: a mono label head, an optional ✦, a body and a foot.', cards())}
      ${sec('numbers', 'Numbers', 'Heroes, changes, KPI strips, progress, states and the ✦ summary.', numbers())}
      ${sec('controls', 'Buttons & controls', 'Sentence-case buttons (at most one primary per view), quiet tabs and pills.', controls())}
      ${sec('pills', 'Chips & pills', 'Category colours come from the AML; everything else from the tokens.', pills())}
      ${sec('lists', 'Lists & tables', '', lists())}
      ${sec('calendars', 'Calendars', 'Monday first (C10); the biggest day fills with the chart blue.', calendars())}
      ${sec('overlays', 'Overlays', 'Hover cards hold the working behind a number; ✦ shows its definition and AQL.', overlays())}
      ${sec('charts', 'Charts', 'ECharts reads every colour, font and size from the tokens at draw time (<code>DS.token</code>), so themes repaint them.', charts())}
      ${sec('breakpoints', 'Breakpoints', '', breakpoints())}
      ${sec('layouts', 'Layouts', 'Every page sits on one 12-column grid (<code>--grid-cols</code>, <code>--gap</code>): the main column spans 8, the rail 4, a pair splits the main column 4 + 4, so every card edge lands on a column line.', layouts())}
      ${sec('pages', 'Page config', 'What <code>js/pages.js</code> says today, drawn as wireframes. Move a block id to move the card.', pages())}`;
    drawCharts();
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-gal-theme]');
    if (t) { DS.theme(t.dataset.galTheme); DS.history.commit(); return; }
    const gp = e.target.closest('[data-gal-preset]');
    if (gp) { DS.panel.applyPreset(gp.dataset.galPreset); return; }
    const a = e.target.closest('.gal-nav a[href^="#"]');
    if (a) { e.preventDefault(); $(a.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (e.target.closest('[data-gal-drawer]')) {
      OG.drawer({ label: 'Drawer', body: `<div class="sub">Drawers slide in over a scrim (<code>--dur</code>, <code>--overlay</code>).</div>${OG.kpis([{ k: 'This month', v: '₫2.65M' }, { k: 'Last 12 months', v: '₫38.1M' }])}`,
        foot: `${OG.btn({ label: 'Cancel', attrs: 'data-close' })}${OG.btn({ label: 'Apply', kind: 'primary', attrs: 'data-close' })}` });
      return;
    }
    const r = e.target.closest('[data-replay]');
    if (r) { const m = $('gal-motion'); m.style.animation = 'none'; void m.offsetWidth; m.style.animation = r.dataset.replay === 'pop' ? 'v3-pop var(--dur-fast) var(--ease-out)' : 'v3-slide var(--dur) var(--ease-out)'; }
  });
  DS.onChange(() => {
    // a theme or a token changed: redraw everything that printed a value (cheap: static markup + 8 charts)
    const y = $('gallery').closest('.shell') ? document.scrollingElement.scrollTop : 0;
    render(); document.scrollingElement.scrollTop = y;

  });
  DS.panel.onPresets(() => render());
  // the breakpoint readout follows the frame width (the cards in it reflow by themselves)
  addEventListener('resize', () => { const w = $('gal-bp-w'), k = $('gal-bp-k'); if (!w) return; w.textContent = `${innerWidth}px`; k.textContent = DS.bp();
    document.querySelectorAll('.gal-bp').forEach((x) => x.classList.toggle('on', x.dataset.bp === DS.bp())); });
  render();
  // the governed category palette: load it, then redraw the chips and the gauge with it
  WF.app.execute().then(() => { if (WF.registry.get('og3_cat_colors')?.query.state === 'success') render(); }).catch(() => {});
})();
