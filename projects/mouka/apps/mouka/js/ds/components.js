// The mouka component library: markup builders that return HTML strings, styled by ds/components.css.
// Change a component here (markup) or in ds/components.css (look); every page and the gallery (ds.html) follow.
// Loaded before js/origin.js, which adds the data-aware builders (txRow, chip, monthCal, weekCal, freshChip) and the
// behaviour (hover cards, popovers, trace) onto the same OG object. Values come from ds/tokens.css.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (id) => document.getElementById(id);


  // ----- icons: Iconoir (+ Tabler where Iconoir has none), generated into js/ds/icons.js by scripts/gen_icons.py
  const P = window.MOUKA_ICONS || {};
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[n] ?? ''}</svg>`;
  document.querySelectorAll('svg[data-icon]').forEach((s) => { s.innerHTML = P[s.dataset.icon] ?? ''; });

  // ----- card: ONE anatomy for every card (DESIGN.md § Card).
  //   head = the card title (an h2, sentence case; + › when the card navigates: go) · an info slot (freshness
  //          dot) · grow · at most ONE control (segIcons / segBtns / a button) · ✦ explain · ⋮ menu (CSV, Add, filters) · the fold chevron
  //   body · optional foot. Every card folds to its head (collapsible: false opts out); the fold is kept for the session.
  // explain: "query:alias" opened by the ✦ button (the card's headline governed number).
  // rows: the Transactions filters behind the headline ({ date, src, cat, flow }); the ✦ popover offers them (O14).
  // menu: [{ key, label, icon?, disabled? }] → a ⋮ button; OG.bindKeys($(`${id}-menu`), fn) handles the picks.
  const foldedCards = new Set();
  function card({ id, label, go, chevron, info = '', control = '', actions = '', explain, rows, menu: items, body = '', foot = '', flush = false, query = '', cls = '', head = true, collapsible = true }) {
    const chev = (chevron ?? !!go) ? icon('chev', 'sm chev') : '';
    const title = go ? `<h2 class="card-title"><button type="button" data-go="${go}" title="Open ${esc(label)}">${esc(label)}${chev}</button></h2>` : `<h2 class="card-title">${esc(label)}</h2>`;
    const folded = foldedCards.has(id);
    const fold = collapsible ? `<button class="fold" type="button" data-fold="${id}" aria-expanded="${!folded}" aria-controls="${id}-body" aria-label="${folded ? 'Expand' : 'Collapse'} ${esc(label)}">${icon('down', 'sm')}</button>` : '';
    // explain = a quiet ⓘ right after the title (it opens the trace: what the number is, where it comes from)
    const ai = explain ? `<button class="explain" type="button" data-explain="${explain}"${rows ? ` data-rows="${esc(JSON.stringify(rows))}"` : ''} title="How this is calculated" aria-label="How ${esc(label)} is calculated">${icon('info', 'sm')}</button>` : '';
    return `
      <section class="card ${cls}${folded ? ' folded' : ''}" data-anfra-block="${id}" data-anfra-label="${esc(label)}"${query ? ` data-anfra-query="${query}"` : ''}>
        ${head ? `<div class="card-head">${title}${ai}<span class="card-info" id="${id}-info">${info}</span><span class="grow"></span>${control ? `<span class="head-ctl">${control}</span>` : ''}${actions}${items ? menu(`${id}-menu`, items) : ''}${fold}</div>` : ''}
        <div class="card-body${flush ? ' flush' : ''}" id="${id}-body"${folded ? ' inert' : ''}>${body}</div>
        ${foot ? `<div class="card-foot" id="${id}-foot"${folded ? ' inert' : ''}>${foot}</div>` : ''}
      </section>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fold]');
    if (!b) return;
    const c = b.closest('.card'), id = b.dataset.fold, folded = !c.classList.contains('folded');
    // the body animates its height (ds/components.css); it clips only while it moves, so tooltips aren't cut at rest
    c.classList.add('folding');
    clearTimeout(c._foldT);
    c._foldT = setTimeout(() => c.classList.remove('folding'), 400);
    c.classList.toggle('folded', folded);
    c.querySelectorAll(':scope > .card-body, :scope > .card-foot').forEach((x) => { x.inert = folded; });
    folded ? foldedCards.add(id) : foldedCards.delete(id);
    b.setAttribute('aria-expanded', String(!folded));
    b.setAttribute('aria-label', `${folded ? 'Expand' : 'Collapse'} ${c.dataset.anfraLabel ?? ''}`);
  });

  // ----- disclosure: ONE pattern for grouped rows (the Accounts list's groups, the
  // Summary's sides). discBtn = the caret + optional swatch + label, as a button with aria-expanded; rows that belong to
  // it carry data-under="<key> …". A scope ([data-disc-scope="name"]) remembers what is folded across redraws; a view
  // calls OG.applyFold(scopeEl) after it rewrites the rows. A scope with data-disc-closed starts with every group folded
  // (progressive disclosure, 18 Oct); after that it remembers what the reader opened.
  // size 'list' = a quiet group label above list rows (13px, secondary ink); the default is a table's subtotal row (15px)
  // caret 'end' = the chevron after the label instead of before it (the Summary's group rows, 17 Oct)
  const discBtn = ({ key, label, swatch, size, caret }) => {
    const c = icon('down', 'sm'), end = caret === 'end';
    return `<button type="button" class="disc${size === 'list' ? ' sm' : ''}${end ? ' end' : ''}" data-toggle="${esc(key)}" aria-expanded="true">${end ? '' : c}${swatch ? `<span class="sw" style="background:var(${swatch})"></span>` : ''}<span class="t">${label}</span>${end ? c : ''}</button>`;
  };
  const folds = new Map();
  const folds_seen = new Map();   // per data-disc-closed scope: the group keys it has met (a new one starts folded)
  const foldSet = (scope) => { const k = scope.dataset.discScope; if (!folds.has(k)) folds.set(k, new Set()); return folds.get(k); };
  function applyFold(scope) {
    if (!scope) return;
    const set = foldSet(scope);
    if ('discClosed' in scope.dataset) {
      const k = scope.dataset.discScope; if (!folds_seen.has(k)) folds_seen.set(k, new Set());
      const seen = folds_seen.get(k);
      scope.querySelectorAll('[data-toggle]').forEach((b) => { if (!seen.has(b.dataset.toggle)) { seen.add(b.dataset.toggle); set.add(b.dataset.toggle); } });
    }
    scope.querySelectorAll('[data-under]').forEach((r) => { r.hidden = r.dataset.under.split(' ').some((k) => set.has(k)); });
    scope.querySelectorAll('[data-toggle]').forEach((b) => b.setAttribute('aria-expanded', String(!set.has(b.dataset.toggle))));
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-disc-scope] [data-toggle]');
    if (!b) return;
    e.stopPropagation();
    const scope = b.closest('[data-disc-scope]'), set = foldSet(scope), k = b.dataset.toggle;
    set.has(k) ? set.delete(k) : set.add(k);
    applyFold(scope);
  }, true);

  // ----- ⋮ menu: a small list of utility actions under a dots button. Items carry data-k (bindKeys); the menu closes on a
  // pick, an outside click or Escape. One menu is open at a time.
  // ONE item = no menu (17 Oct, Nhi): the action's own icon button in the ⋮'s place, same id, same data-k, so bindKeys is unchanged.
  const menu = (id, items) => items.length === 1
    ? `<span class="menu-wrap one" id="${id}"><button class="dots" type="button" data-k="${esc(items[0].key)}"${items[0].disabled ? ' disabled' : ''} title="${esc(items[0].title ?? items[0].label)}" aria-label="${esc(items[0].label)}">${icon(items[0].icon ?? 'dots')}</button></span>`
    : `<span class="menu-wrap"><button class="dots" type="button" data-menu-btn aria-haspopup="menu" aria-expanded="false" title="More">${icon('dots')}</button>
    <div class="menu" id="${id}" role="menu" hidden>${items.map((it) => `<button type="button" role="menuitem" data-k="${esc(it.key)}"${it.disabled ? ' disabled' : ''}${it.title ? ` title="${esc(it.title)}"` : ''}>${it.icon ? icon(it.icon, 'sm') : ''}<span>${esc(it.label)}</span></button>`).join('')}</div></span>`;
  const closeMenus = (except) => document.querySelectorAll('.menu:not([hidden])').forEach((m) => { if (m !== except) { m.hidden = true; m.previousElementSibling?.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-menu-btn]');
    if (b) { const m = b.nextElementSibling; closeMenus(m); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); return; }
    if (e.target.closest('.menu [data-k]') || !e.target.closest('.menu')) closeMenus();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

  // ----- tooltip (19 Oct, Nhi: "tell people what the icon-only buttons are"): one quiet label for any button, link or control
  // that shows no text of its own (an icon, or a rail item whose label is hidden). It reads data-tip, else the title (moved
  // to data-tip-t so the browser's own tooltip never doubles it), else aria-label. Under the control, or beside it in the
  // sidebar; after a short pause on hover, at once on keyboard focus; gone on leave, blur, click, scroll or Escape. Controls
  // with their own hover card (data-hc, data-hc-hover, ⓘ explain) keep that instead.
  const tipEl = Object.assign(document.createElement('div'), { className: 'tip', role: 'tooltip', hidden: true });
  tipEl.id = 'og-tip';
  tipEl.dataset.anfraRender = 'skip';
  if (document.body) document.body.append(tipEl); else document.addEventListener('DOMContentLoaded', () => document.body.append(tipEl));
  let tipFor = null, tipT = 0, tipShut = 0;   // tipShut: when the last tip closed (a neighbour within 300ms opens at once)
  const TIP_SEL = 'button, a[href], [role=button], [role=separator], [data-tip]';
  const tipLabel = (el) => {
    if (el.matches('[data-hc], [data-hc-hover], [data-explain]') || el.closest('.menu, .tip, .hc')) return '';
    if (el.title) { el.dataset.tipT = el.title; el.removeAttribute('title'); }
    const label = el.dataset.tip || el.dataset.tipT || el.getAttribute('aria-label') || '';
    if (!label || el.dataset.tip) return label;
    // icon-only: no text of its own, or its text is hidden (font-size 0: the rail)
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 || (n.nodeType === 1 && n.tagName !== 'svg' && getComputedStyle(n).display !== 'none'))
      .map((n) => n.textContent).join('').trim();
    return !text || getComputedStyle(el).fontSize === '0px' ? label : '';
  };
  function tipShow(el, warm = false) {
    const label = tipLabel(el);
    if (!label || !el.isConnected) return;
    tipFor = el;
    tipEl.textContent = label;
    tipEl.classList.toggle('instant', warm);
    tipEl.hidden = false;
    const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, side = el.closest('.sidebar');
    const left = side ? r.right + 8 : Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    const top = side ? r.top + r.height / 2 - h / 2 : (r.bottom + 6 + h > innerHeight ? r.top - h - 6 : r.bottom + 6);
    tipEl.style.left = `${left}px`; tipEl.style.top = `${Math.max(4, top)}px`;
    tipEl.style.transformOrigin = side ? 'left center' : top < r.top ? 'center bottom' : 'center top';   // it grows out of its control
  }
  const tipHide = () => { clearTimeout(tipT); if (!tipEl.hidden) tipShut = Date.now(); tipFor = null; tipEl.hidden = true; };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.(TIP_SEL);
    if (el === tipFor) return;
    tipHide();
    const warm = Date.now() - tipShut < 300;   // moving along a row of icons: the next tip shows at once, without the pop
    if (el) tipT = setTimeout(() => tipShow(el, warm), warm ? 0 : 380);
  });
  document.addEventListener('focusin', (e) => { const el = e.target.closest?.(TIP_SEL); tipHide(); if (el && el.matches(':focus-visible')) tipShow(el); });
  document.addEventListener('focusout', tipHide);
  document.addEventListener('pointerdown', tipHide, true);
  document.addEventListener('scroll', tipHide, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tipHide(); });

  // ----- segmented controls (19 Oct, Nhi: "smoother"): when a click moves the choice, the new choice's pill (its ::before) slides
  // over from where the old one was, on a strong ease-in-out (Emil Kowalski's tab-indicator recipe). Read in the capture phase,
  // before the view's own handler re-marks .active; a page tab swaps to another page's header, so its pill is found there.
  // Keyboard and reduced motion switch at once.
  const SEG = '.tabs > .tab, .segicons > button, .seg-btns > button, .ranges > .range, .underline-tabs > button';
  const stillMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.(SEG);
    if (!b || e.detail === 0 || stillMotion.matches || b.classList.contains('active')) return;
    const from = b.parentElement.querySelector(':scope > .active');
    if (!from) return;
    const r0 = from.getBoundingClientRect(), pageTab = b.matches('.tabs > .tab');
    requestAnimationFrame(() => {
      const to = b.isConnected && b.classList.contains('active') ? b : pageTab ? document.querySelector('.view:not([hidden]) .tabs > .tab.active') : null;
      if (!to || to === from) return;
      const r1 = to.getBoundingClientRect();
      to.animate([{ left: `${r0.left - r1.left}px`, width: `${r0.width}px` }, { left: '0px', width: `${r1.width}px` }],
        { duration: parseFloat(DS.token('--dur-slide')) || 240, easing: DS.token('--ease-in-out') || 'ease-in-out', pseudoElement: '::before' });
    });
  }, true);

  // ----- hero block: the card's big number + its delta line on the left, ONE optional secondary action on the right.
  // The view fills #<id> (the value) and #<id>-delta (OG.delta). own = the data-own key (the one page that owns this fact).
  const heroRow = ({ id, own, action = '' }) => `<div class="hero-row"><div class="hero-col"><div class="hero page" id="${id}"${own ? ` data-own="${own}"` : ''}></div>
    <div class="delta" id="${id}-delta"></div></div>${action ? `<div class="hero-act">${action}</div>` : ''}</div>`;
  // delta line: a tinted pill "↑ ₫29.6M (3.6%)" + the muted period word. The arrow carries the direction, so the numbers
  // drop their sign; the pill takes the good/bad tone (invert: up is bad, e.g. spending). trace = { amt, pct: 'query:alias' }.
  function delta({ amt, pct, word = '', trace = {}, invert = false, hc } = {}) {
    const x = WF.fmt.n(amt), t = x == null || x === 0 ? '' : (x > 0) !== invert ? 'pos' : 'neg';
    const abs = (v) => { const n = WF.fmt.n(v); return n == null ? v : Math.abs(n); };
    const arrow = x ? icon(x > 0 ? 'arrow-up' : 'arrow-down') : '';
    const a = `<span${trace.amt ? ` data-trace="${trace.amt}"` : ''}${hc ? ` data-hc="${hc}"` : ''}>${OG.approx(abs(amt))}</span>`;
    const p = pct != null && WF.fmt.n(pct) != null ? ` <span${trace.pct ? ` data-trace="${trace.pct}"` : ''}>(${OG.pct1(abs(pct))})</span>` : '';
    return `<span class="dpill${t ? ` ${t}` : ''}">${arrow}${a}${p}</span>${word ? ` <span class="muted">${esc(word)}</span>` : ''}`;
  }

  // ----- list row: ONE row for every list (accounts, categories, transactions, holdings).
  //   lead (a tile) · title + meta · value + sub (right-aligned, tabular). Strings are html: escape data before passing it.
  const row = ({ lead = '', title = '', meta = '', value = '', sub = '', attrs = '', cls = '' }) =>
    `<div class="lrow${lead ? '' : ' no-lead'}${cls ? ` ${cls}` : ''}"${attrs ? ` ${attrs}` : ''}>${lead}<div class="lrow-main"><div class="t">${title}</div>${meta ? `<div class="s">${meta}</div>` : ''}</div>
      <div class="lrow-end"><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div></div>`;
  // line: the ONE-LINE list row, for lists whose items need no second line (accounts, categories):
  //   [lead] · title (primary) · aside (secondary: a share or a change, 13px) · value (primary, tabular). No dividers.
  const line = ({ lead = '', title = '', aside = '', value = '', attrs = '', cls = '' }) =>
    `<div class="lline${lead ? '' : ' no-lead'}${cls ? ` ${cls}` : ''}"${attrs ? ` ${attrs}` : ''}>${lead}<span class="t">${title}</span><span class="a">${aside}</span><span class="v">${value}</span></div>`;
  // tile: the leading circle (--tile). { icon, color } = an icon on a colour (categories, merchants: a light tint of the colour, the icon a darker shade); { text } = initials
  // or a ticker on the neutral fill (accounts, holdings). Colour is data (dim_categories.chart_color), never a literal.
  const tile = ({ icon: ic, color, text } = {}) => text != null
    ? `<span class="tile initials">${esc(String(text).slice(0, 3))}</span>`
    : `<span class="tile${color ? ' cat' : ''}"${color ? ` style="--c:${esc(color)}"` : ''}>${icon(ic ?? 'tag')}</span>`;

  // ----- controls: icon segments, range pills ([data-k] items; bindKeys wires a click, setActive marks the current one)
  // labels: the active segment also shows its name (a switch that stands in for a card's title, 18 Oct)
  const segIcons = (id, items, active, { labels = false } = {}) => `<span class="segicons${labels ? ' labeled' : ''}" id="${id}">${items.map((it) =>
    `<button type="button" data-k="${it.key}" class="${it.key === active ? 'active' : ''}" aria-pressed="${it.key === active}" title="${esc(it.title ?? it.key)}" aria-label="${esc(it.title ?? it.key)}">${icon(it.icon)}${labels ? `<span class="seg-l" aria-hidden="true">${esc(it.title ?? it.key)}</span>` : ''}</button>`).join('')}</span>`;
  // pick: a dropdown for a choice whose options need words (Holdings' sort, 19 Oct, Nhi: the icon switch was hard to read).
  // The trigger reads "<label> <current> ⌄" and opens the ⋮ menu's list (same open / close rules); items carry data-k, so
  // OG.bindKeys($(id), fn) handles a pick and OG.setPick($(id), key) moves the check and the trigger's word.
  const pick = (id, label, items, active) => `<span class="menu-wrap pick"><button class="pick-btn" type="button" data-menu-btn aria-haspopup="menu" aria-expanded="false" aria-label="${esc(label)}: ${esc(items.find((it) => it.key === active)?.label ?? '')}">
      <span class="pick-l">${esc(label)}</span> <span class="pick-v" id="${id}-v">${esc(items.find((it) => it.key === active)?.label ?? '')}</span>${icon('down', 'sm')}</button>
    <div class="menu" id="${id}" role="menu" hidden>${items.map((it) => `<button type="button" role="menuitemradio" data-k="${esc(it.key)}" aria-checked="${it.key === active}"><span>${esc(it.label)}</span>${icon('check', 'sm pick-ok')}</button>`).join('')}</div></span>`;
  function setPick(el, key) {
    if (!el) return;
    let word = '';
    el.querySelectorAll('[data-k]').forEach((b) => { const on = b.dataset.k === key; b.setAttribute('aria-checked', String(on)); if (on) word = b.textContent.trim(); });
    const v = document.getElementById(`${el.id}-v`); if (v) v.textContent = word;
    const btn = el.previousElementSibling; if (btn) btn.setAttribute('aria-label', `${btn.querySelector('.pick-l')?.textContent ?? ''}: ${word}`);
  }
  function bindKeys(el, onPick) { el?.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) onPick(b.dataset.k); }); }
  function setActive(el, key) { el?.querySelectorAll('[data-k]').forEach((b) => { b.classList.toggle('active', b.dataset.k === key); b.setAttribute('aria-pressed', String(b.dataset.k === key)); }); }
  const ranges = (id, keys, active) => `<div class="ranges" id="${id}">${keys.map((k) => `<button class="range${k === active ? ' active' : ''}" type="button" data-k="${k}" aria-pressed="${k === active}">${k}</button>`).join('')}</div>`;

  // ----- kpi strip + table
  // kpis: [{ k: label, v: html, cls?, trace? }], cls: '' | 'left' | 'band'
  function kpis(items, cls = '') {
    return `<div class="kpis ${cls}">${items.map((k) => `<div><div class="k">${esc(k.k)}</div><div class="v ${k.cls ?? ''}"${k.trace ? ` data-trace="${k.trace}"` : ''}>${k.v}</div></div>`).join('')}</div>`;
  }
  // cols: [{ title, r?, main?, sort?, cell(row) }]
  function table({ cols, rows, sort, rowClass, rowAttr, cls = '' }) {
    const th = (c) => `<th class="${c.r ? 'r' : ''}${c.sort ? ' sort' : ''}"${c.sort ? ` data-sort="${c.sort}"` : ''}>${esc(c.title)}${c.sort && sort?.field === c.sort ? icon(sort.direction === 'asc' ? 'sort-up' : 'sort-down', 'xs') : c.sort ? icon('sort', 'xs muted') : ''}</th>`;
    return `<table class="ot ${cls}"><thead><tr>${cols.map(th).join('')}</tr></thead><tbody>${rows.map((r, i) =>
      `<tr class="${rowClass ? rowClass(r) : ''}"${rowAttr ? ` ${rowAttr(r, i)}` : ''}>${cols.map((c) => `<td class="${c.r ? 'r' : ''}${c.main ? ' name-cell' : ''}">${c.cell(r, i)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // ----- inspector (v2; Copilot / YNAB): the drill-down opens in a right column of the current page, not a modal
  // drawer. No scrim: the page stays usable, and clicking the next row replaces the inspector's content in place.
  // Same call shape as mouka's drawer({ label, back, body, foot, onClose }), so every caller moved over unchanged;
  // returns the inspector element. Escape or × closes it (origin.js). Under 1080px it becomes a sheet (ds/layout.css).
  // back: a ‹ button left of the title closes it in place of the × (a string names where it goes back to).
  // rail: a column element (a .rail stack) to open in, in place of its cards, so the rest of the page doesn't reflow.
  function drawer({ label, back = false, rail, body, foot = '', onClose }) {
    let host = rail ?? WF.current?.el?.querySelector('.with-insp');
    if (rail && !rail.querySelector(':scope > .inspector')) rail.insertAdjacentHTML('beforeend', '<aside class="inspector" hidden></aside>');
    if (!host) {   // the gallery, or a page without the frame: a floating sheet
      host = document.querySelector('body > .with-insp.floating') ?? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'with-insp floating', innerHTML: '<aside class="inspector" hidden></aside>' }));
    }
    // a fresh element per subject: listeners a previous caller added (addEventListener) must not fire for the next one
    const d0 = host.querySelector(':scope > .inspector'), d = d0.cloneNode(false);
    d0.replaceWith(d);
    const entering = !openDrawer;   // only the first open slides in; the next subject replaces it in place
    closeDrawer();   // the previous subject (this page's or another's) gives way to the new one; its onClose runs
    d.dataset.anfraBlock = 'og-inspector'; d.dataset.anfraLabel = label;
    const backTo = typeof back === 'string' ? `Back to ${back}` : 'Back';
    d.innerHTML = `<div class="dh${back ? ' has-back' : ''}">${back ? `<button class="sq bare back" type="button" data-close title="${esc(backTo)}" aria-label="${esc(backTo)}">${icon('left')}</button>` : ''}<h2 class="card-title">${esc(label)}</h2><span class="grow"></span>
      ${back ? '' : `<button class="sq bare" type="button" data-close title="Close" aria-label="Close">${icon('x')}</button>`}</div><div class="db">${body}</div>${foot ? `<div class="dfoot">${foot}</div>` : ''}`;
    d.onclick = (e) => { if (e.target.closest('[data-close]')) closeDrawer(); };
    d.hidden = false; d.scrollTop = 0;
    d.classList.toggle('enter', entering);
    host.classList.add('open');
    openDrawer = { d, host, onClose };
    return d;
  }
  let openDrawer = null;
  function closeDrawer() {
    if (!openDrawer) return;
    const { d, host, onClose } = openDrawer;
    openDrawer = null;
    d.hidden = true; d.innerHTML = ''; host.classList.remove('open');
    onClose?.();
  }

  // ----- Ask AI: the composer (a growing textarea, a scope pill, a round send) and the nudge chip.
  // The composer behaviour is delegated below: it grows with its text (to 200px), send is enabled only with text, Enter sends
  // (Shift+Enter = a new line; never while an IME is composing, so Vietnamese typing is safe). A view listens to #<id>-send.
  // off: shown but switched off (Ask AI is coming soon, 19 Oct): the box and send are disabled and typing never enables send
  const composer = ({ id, placeholder = 'Ask about your money', scope = '', off = false }) => `<div class="composer${off ? ' off' : ''}" id="${id}"${off ? ' aria-disabled="true"' : ''}>
      <textarea id="${id}-in" rows="1" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"${off ? ' disabled' : ''}></textarea>
      <div class="composer-bar">${scope ? `<span class="composer-scope" id="${id}-scope">${scope}</span>` : ''}<span class="grow"></span>
        <button class="composer-send" type="button" id="${id}-send" title="Send (Enter)" aria-label="Send" disabled>${icon('arrow-up')}</button></div></div>`;
  const growComposer = (t) => { t.style.height = 'auto'; t.style.height = `${Math.min(200, t.scrollHeight)}px`; };
  document.addEventListener('input', (e) => {
    const t = e.target.closest?.('.composer textarea');
    if (!t) return;
    growComposer(t);
    t.closest('.composer').querySelector('.composer-send').disabled = !t.value.trim() || t.closest('.composer').classList.contains('off');
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest?.('.composer textarea');
    if (!t || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    t.closest('.composer').querySelector('.composer-send:not([disabled])')?.click();
  });
  // clear(): after a send, the box empties and shrinks back
  const clearComposer = (id) => { const t = $(`${id}-in`); if (!t) return; t.value = ''; growComposer(t); $(`${id}-send`).disabled = true; };
  // nudge: a suggested question (an outlined chip with a quiet icon); [data-k] so OG.bindKeys handles the pick
  const nudge = ({ key, label, icon: ic }) => `<button class="nudge" type="button" data-k="${esc(key)}">${ic ? icon(ic, 'sm') : ''}<span>${esc(label)}</span></button>`;

  // ----- lists that filter (Spending): a search field sized as a card-head control, removable filter chips, day headers,
  // and a split bar (one bar, one segment per part, widths = shares; the rows under it print the same facts, so it is aria-hidden)
  const searchField = (id, placeholder = 'Search') => `<label class="search head-search">${icon('search', 'sm')}<input id="${id}" type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" autocomplete="off"></label>`;
  // items: [{ key, label }] → chips with × (data-chip = key); clear: a "Clear all" link after them
  const filterChips = (items, { clear = true } = {}) => items.length ? `<div class="chips-row">${items.map((it) =>
    `<button type="button" class="filter-chip" data-chip="${esc(it.key)}" title="Remove this filter" aria-label="Remove filter: ${esc(it.label)}">${esc(it.label)} ${icon('x', 'xs')}</button>`).join('')}${clear && items.length > 1 ? '<button type="button" class="btn link chips-clear" data-chip-clear>Clear all</button>' : ''}</div>` : '';
  // a day group in a transaction list: "Tue, Oct 14" on the left, that day's total (html) on the right
  const dayHead = (ymd, right = '') => {
    const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
    return `<div class="lrow-group day-head"><span class="t">${esc(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))}</span><span class="v">${right}</span></div>`;
  };
  // the tag pill in a transaction-style row (Transactions, Recurring › Coming up): the category's icon on its colour, shrunk
  // to a dot, then the label; color = a resolved colour (OG.catColor or WF.charts.css('--token'))
  const txTag = (label, ic, color) => `<span class="tx-tag" title="${esc(label)}"><span class="tx-ic" aria-hidden="true" style="--c:${esc(color)}">${icon(ic)}</span><span class="tx-tl">${esc(label)}</span></span>`;
  // parts: [{ label, value, tone: '--token' | color: a data colour (OG.catColor) }]
  const splitBar = (parts) => { const sum = parts.reduce((a, p) => a + Math.max(0, Number(p.value) || 0), 0) || 1;
    return `<div class="split" aria-hidden="true">${parts.map((p) => `<div title="${esc(p.label)}" style="flex:${Math.max(0.02, (Number(p.value) || 0) / sum)};background:${p.color ? esc(p.color) : `var(${p.tone})`}"></div>`).join('')}</div>`; };

  // ----- notes ("Worth knowing", Invest, 18 Oct): ranked one-line insights, each a button to where its fact lives.
  // items: [{ k, icon, tone: '' | 'pos' | 'neg', html, why }] (html: the sentence, the key figure in .em; why: the rule that
  // picked it, a quiet line under it, 19 Oct, Nhi: "what is it based on"); the view binds the picks with
  // OG.bindKeys(list, (k) => …). No items = '' (the card hides itself).
  const notes = (items) => items.length ? `<div class="notes">${items.map((n) =>
    `<button type="button" class="note" data-k="${esc(n.k)}"><span class="note-ic${n.tone ? ` ${n.tone}` : ''}" aria-hidden="true">${icon(n.icon ?? 'info')}</span><span class="note-t">${n.html}${n.why ? `<span class="note-why">${esc(n.why)}</span>` : ''}</span>${icon('chev', 'sm note-go')}</button>`).join('')}</div>` : '';

  // ----- slider (Forecast's What if, 18 Oct): a native range input (keyboard ← → and Home / End for free) under its label,
  // the current value on the right (#<id>-v, the view writes it and sets aria-valuetext); min / max / step in the data's unit
  const slider = ({ id, label, min, max, step, value = 0 }) => `<div class="slider"><div class="slider-h"><label for="${id}">${esc(label)}</label><span class="slider-v" id="${id}-v"></span></div>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;

  // ----- small pieces the pages used to write by hand
  // hero: the big number. page = the one page hero per view (C4); value is html.
  const hero = ({ id, value = '', page = false, cls = '', trace, hc } = {}) =>
    `<div class="hero${page ? ' page' : ''}${cls ? ` ${cls}` : ''}"${id ? ` id="${id}"` : ''}${trace ? ` data-trace="${trace}"` : ''}${hc ? ` data-hc="${hc}"` : ''}>${value}</div>`;
  // change: the line under a hero (± vs a period)
  const change = ({ id, html = '', cls = '' } = {}) => `<div class="change${cls ? ` ${cls}` : ''}"${id ? ` id="${id}"` : ''}>${html}</div>`;
  // stateLine: the loading / empty / error line a query writes into (WF.status(q, stateEl, emptyText))
  const stateLine = (id, { hc } = {}) => `<div class="state" id="${id}"${hc ? ` data-hc="${hc}"` : ''}></div>`;
  // chartBox: the element an ECharts chart draws into. cls 'frame' = the hero chart frame (--chart-h per breakpoint).
  const chartBox = (id, cls = '') => `<div class="chart${cls ? ` ${cls}` : ''}" id="${id}"></div>`;
  // boxed: a tinted inner box with a head row
  const boxed = ({ head = '', body = '', cls = '' } = {}) => `<div class="boxed${cls ? ` ${cls}` : ''}"><div class="bh">${head}</div><div class="bb">${body}</div></div>`;
  // underlineTabs: [{ key, label, v? }] (v = a second line, e.g. an amount)
  // underlineTabs: a card body split into views, each tab naming one with its total under it (Net worth's Assets / Liabilities).
  // A tablist: each tab's aria-controls = `${id}-${key}` (the view renders those panels); setTab marks the current one.
  const underlineTabs = (id, items, active, { tall = false, label = '' } = {}) => `<div class="underline-tabs${tall ? ' tall' : ''}" id="${id}" role="tablist"${label ? ` aria-label="${esc(label)}"` : ''}>${items.map((it) =>
    `<button type="button" role="tab" data-k="${it.key}" id="${id}-tab-${it.key}" aria-controls="${id}-${it.key}" aria-selected="${it.key === active}" tabindex="${it.key === active ? 0 : -1}" class="${it.key === active ? 'active' : ''}">${esc(it.label)}${it.v != null ? `<span class="v">${it.v}</span>` : ''}</button>`).join('')}</div>`;
  function setTab(el, key) { el?.querySelectorAll('[role=tab]').forEach((b) => { const on = b.dataset.k === key; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); }
  // segBtns: the ONE in-card text switch (Totals / Percent, Expenses / Budget); same track look as segIcons and the page tabs
  const segBtns = (id, items, active) => `<div class="seg-btns" id="${id}">${items.map((it) =>
    `<button type="button" data-k="${it.key}" class="${it.key === active ? 'active' : ''}">${esc(it.label)}</button>`).join('')}</div>`;
  // btn: kind = '' | 'primary' | 'link' | 'full'
  const btn = ({ label, kind = '', icon: ic, attrs = '' }) => `<button class="btn${kind ? ` ${kind}` : ''}" type="button"${attrs ? ` ${attrs}` : ''}>${ic ? icon(ic, 'sm') : ''}${esc(label)}</button>`;
  // progress: share 0..1; tone = '' | 'warn' | 'over'
  const progress = (share, { tone = '', thin = false } = {}) =>
    `<div class="progress${thin ? ' thin' : ''}"><div class="${tone}" style="width:${Math.max(0, Math.min(1, Number(share) || 0)) * 100}%"></div></div>`;
  // soonTag: a feature that is shown but not live yet (Ask AI, 19 Oct), next to its page title
  // xs shows the short word (19 Oct: the phone header carries four round buttons)
  const soonTag = (text = 'Coming soon', short = 'Soon') => `<span class="soon-tag"><span class="soon-l">${esc(text)}</span><span class="soon-s">${esc(short)}</span></span>`;
  const badge = (text, tone = 'zero') => `<span class="badge ${tone}">${esc(text)}</span>`;
  // statusPill: kind = '' | 'behind' | 'on_pace' | 'maxed'
  const statusPill = (text, kind = '') => `<span class="status-pill ${kind}">${esc(text)}</span>`;
  // legendDot: cls = '' | 'dash' | 'past' | 'inc' | 'exp'
  const legendDot = (text, cls = '') => `<span class="legend-dot${cls ? ` ${cls}` : ''}">${esc(text)}</span>`;
  const toggle = (label, on = false, id = '') => `<button class="toggle${on ? ' on' : ''}" type="button"${id ? ` id="${id}"` : ''}><span class="knob"></span>${esc(label)}</button>`;
  // callout: the ✦ summary line (Reports, Forecast)
  const callout = ({ label = 'Summary', html = '' } = {}) => `<div class="callout">${icon('spark', 'sm spark-ic')}<span class="label">${esc(label)}</span><span>${html}</span></div>`;

  window.OG = Object.assign(window.OG || {}, { esc, $, icon, ICONS: P, card, discBtn, applyFold, line, menu, closeMenus, pick, setPick, heroRow, delta, row, tile, segIcons, bindKeys, setActive, ranges, kpis, table, drawer, closeDrawer,
    soonTag, hero, change, stateLine, chartBox, boxed, underlineTabs, setTab, segBtns, btn, progress, badge, statusPill, legendDot, toggle, callout, composer, clearComposer, nudge,
    searchField, filterChips, dayHead, txTag, splitBar, notes, slider });
})();
