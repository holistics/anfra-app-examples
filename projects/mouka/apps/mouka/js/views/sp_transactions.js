// Cash flow › Transactions (the first Spending tab since 17 Oct, when Overview was removed): every transaction in a date
// range, searchable and filterable, and the categories and top merchants behind it.
// Cards (js/pages.js): sp-tx (head: the date range picker, a search icon that expands into the field, a filter icon that opens
// Categories · Merchants · Amount; hero = what the listed transactions spent, data-own spend-range, with a summary strip
// under it; filter chips; the list grouped by day; main 8)
// · sp-break (rail 4, 18 Oct, Nhi: one card, an icon switch between Accounts (what each account spent; a click filters the
// list to it), Categories and the top 5 Merchants; was three cards). One date range drives both cards; the list's
// filters (search, category, merchant, account, flow) narrow the list and its hero only. The list shows every flow, so
// moves between your own accounts (transfers, card bills, pots, savings) are there too, marked "not spending". A category, a merchant or a transaction opens in
// the rail, in its cards' place, with ‹ back (OG.drawer({ rail })).
// openWith(f) is the page every "See the rows" link lands on (OG.openTx in js/origin.js).
(() => {
  const { fmt } = WF;
  const { $, esc, money, approx, pct1, dayMon } = OG;
  const PF = 'personal_finance', P = 'og6_tx_';
  // the list: every flow group (fct_ledger.flow_group; 'other' is empty by test). Only 'spend' counts as spending.
  const FLOWS = ['spend', 'income', 'reimbursement', 'refund', 'reward', 'transfer', 'save_invest'];
  const BETWEEN = new Set(['transfer', 'save_invest']);            // money moving between your own accounts: never spending
  // the tag that leads a row: spending (and saving / investing) wears its category; other flows say what they are
  const FLOW_TAG = { income: 'Income', reimbursement: 'Paid back', refund: 'Refund', reward: 'Points cash-out', transfer: 'Transfer' };
  const FLOW_ICON = { income: 'dollar', reimbursement: 'transfer', refund: 'transfer', reward: 'gift', transfer: 'transfer', save_invest: 'piggy' };
  const catCol = (r) => OG.catColor(r.cat ?? r.en, r.color);
  // a move between your own accounts reads "from → to" (18 Oct, Nhi), from the pipeline's flow, the pot and the direction
  const fromTo = (r) => {
    const s = r.src ?? '', out = r.dir === 'out';
    switch (r.ft) {
      case 'pot_move': return r.pd === 'out' ? `${r.pot} pot → ${s}` : `${s} → ${r.pot} pot`;
      case 'card_payment': return out ? `${s} → ${r.pf === 'othercard' ? 'MAX VIB' : 'TCB Visa'}` : `Bill payment → ${s}`;
      case 'own_transfer': return out ? `${s} → ${r.pf === 'timo' ? 'Timo' : 'your account'}` : `${s === 'Timo' ? 'TCB debit' : 'Your account'} → ${s}`;
      case 'investment': return out ? `${s} → SSI` : `SSI → ${s}`;
      case 'term_deposit': case 'saving_deposit': return `${s} → Savings`;
      case 'saving_maturity': return `Savings → ${s}`;
      default: return s;
    }
  };
  const FLOW_SAYS = {
    spend: 'Counts as spending.',
    income: 'Counts as income.',
    reimbursement: 'A friend paying you back: not income, it lowers your net spend.',
    refund: 'A merchant refund: not income, it lowers your net spend.',
  };
  const CS_SAYS = { auto: 'automatically, by a rule', user: 'by hand' };   // fct_ledger.category_source
  // amounts typed into the filter: digits with separators, or a k / m shorthand ("100k", "1.5m")
  const parseAmt = (t) => { const m = String(t ?? '').trim().toLowerCase().replace(/[₫đ,\s]/g, '').match(/^(\d+(?:\.\d+)?)([km]?)$/);
    return m ? Math.round(Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1)) : null; };
  const AMT_PRESETS = [{ k: 'lt100k', label: 'Under ₫100K', max: 1e5 }, { k: '100k-1m', label: '₫100K – ₫1M', min: 1e5, max: 1e6 }, { k: 'gt1m', label: 'Over ₫1M', min: 1e6 }];
  const amtLabel = (min, max) => (min != null && max != null ? `${approx(min)} – ${approx(max)}` : min != null ? `Over ${approx(min)}` : `Under ${approx(max)}`);
  const BRK = {
    accts: { label: 'Accounts', icon: 'accounts', explain: 'og6_tx_accts:v' },
    cats: { label: 'Categories', icon: 'tag', explain: 'og6_tx_cats:v' },
    merch: { label: 'Merchants', icon: 'bag', explain: 'og6_tx_merch:v' },   // the top 5
  };
  const fullDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const spanFull = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${dayMon(a)} – ${fullDate(b)}` : `${fullDate(a)} – ${fullDate(b)}`);

  const view = {
    id: 'spending/transactions', nav: 'spending', tab: 'Transactions',
    init(el) {
      const app = WF.app;
      this.sel = { range: '3M' };   // the date range: { range: key } or { a, b } (custom dates, from the picker or a deep link)
      this.f = { cats: [], merchants: [], min: null, max: null, src: null, q: '' };   // the list's filters
      // show / hide the shares on Accounts and Categories (18 Oct, Nhi): one switch, off until asked for
      this.pct = false;
      // the rail's one breakdown card (18 Oct, Nhi): Accounts · Categories · Merchants behind an icon switch
      this.brk = 'accts';
      const pctBtn = `<button class="dots pct-btn" type="button" data-pct aria-pressed="false" aria-label="Show shares" title="Show shares">${OG.icon('percent')}</button>`;
      // anfra 0.11: a plugin's API is present only where it is installed (Anfra.features is deprecated)
      const exp = typeof Anfra !== 'undefined' && (Anfra.plugins?.has?.('export') ?? Anfra.features?.export) && Anfra.user?.permissions?.canExportData !== false;
      this.blocks = {
        'sp-tx': () => OG.card({ id: 'sp-tx', label: 'Transactions', explain: `${P}list_kpi:sp`, query: `${P}list ${P}list_kpi ${P}days`,
          control: `<span data-anfra-control="${P}period">${OG.rangeBtn('tx-range', this.sel)}</span>`,
          actions: `<span class="tx-search" id="tx-search">${OG.searchField('sp-q', 'Search')}<button class="dots tx-search-btn" type="button" aria-label="Search merchants" aria-expanded="false" aria-controls="sp-q" title="Search merchants">${OG.icon('search')}</button></span>`
            + `<button class="dots tx-filter-btn" id="tx-filter" type="button" aria-haspopup="dialog" aria-label="Filter transactions" title="Filter">${OG.icon('filter')}<span class="fbadge" id="tx-fbadge" hidden></span></button>`,
          menu: exp ? [{ key: 'csv', label: 'Download CSV', icon: 'download' }] : null,
          body: `<div class="tx-top">${OG.heroRow({ id: 'tx-hero', own: 'spend-range' })}<div class="tx-sum" id="tx-sum"></div>
            <div id="sp-chips"></div></div>
            <div class="sp-tx-list" id="sp-tx-list"></div>${OG.stateLine('sp-tx-state')}
            <div class="sp-more"><button class="btn" type="button" id="sp-more" hidden>Show more</button></div>` }),
        'sp-break': () => OG.card({ id: 'sp-break', label: BRK[this.brk].label, explain: BRK[this.brk].explain, query: `${P}accts ${P}cats ${P}merch`,
          control: OG.segIcons('sp-brk', Object.entries(BRK).map(([key, b]) => ({ key, icon: b.icon, title: b.label })), this.brk, { labels: true }), actions: pctBtn, collapsible: false,
          body: `<div data-brk="accts"><div id="sp-acct-rows" class="sp-cats"></div>${OG.stateLine('sp-accts-state')}</div>
            <div data-brk="cats" hidden><div id="sp-cat-rows" class="sp-cats"></div>${OG.stateLine('sp-cats-state')}</div>
            <div data-brk="merch" hidden><div id="sp-merch-rows"></div>${OG.stateLine('sp-merch-state')}</div>` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      // ----- the date range
      this.period = WF.dateControl(`${P}period`);
      const page = (q) => { app.mapControl(this.period, q, { field: 'dim_dates.date_key' }); OG.mapMe(q); return q; };
      this.cats = page(WF.q(`${P}cats`, { dataset: PF, metrics: { v: 'spend', share: 'spend_share_pct' },
        aql: 'explore { dimensions { cat: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color } measures { v: spend, share: spend_share_pct } sorts { v desc } }' }));
      // what each account (card or bank account) spent in the range (18 Oct, Nhi)
      this.accts = page(WF.q(`${P}accts`, { dataset: PF, metrics: { v: 'spend', n: 'spend_lines' },
        aql: 'explore { dimensions { src: dim_sources.label, ins: dim_sources.instrument } measures { v: spend, n: spend_lines } having { spend > 0 } sorts { v desc } }' }));
      this.merch = page(WF.q(`${P}merch`, { dataset: PF, pageSize: 5, metrics: { v: 'spend', n: 'spend_lines' },
        aql: 'explore { dimensions { m: fct_ledger.merchant_display } measures { v: spend, n: spend_lines } having { spend > 0 } sorts { v desc } }' }));

      // ----- the list: the date range + its own filters
      this.list = WF.q(`${P}list`, { dataset: PF, pageSize: 30, metrics: { amt: 'spend' },
        aql: `explore { dimensions { id: fct_ledger.line_id, d: fct_ledger.line_date, at: fct_ledger.line_at, m: fct_ledger.merchant, md: fct_ledger.merchant_display,
                                     desc: fct_ledger.description, src: dim_sources.label, cat: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color,
                                     ft: fct_ledger.flow_type, fg: fct_ledger.flow_group, cs: fct_ledger.category_source, amt: fct_ledger.signed_amount_vnd,
                                     pf: fct_ledger.pipeline_flow, pot: fct_ledger.pot_name, pd: fct_ledger.pot_direction, dir: fct_ledger.direction }
                        sorts { d desc, at desc, id desc } }` });
      // mv = money moved out to your own accounts (transfers, card bills, pots, savings): listed, never spending
      this.listKpi = WF.q(`${P}list_kpi`, { dataset: PF, metrics: { n: 'lines', sp: 'spend', inc: 'income' },
        aql: "explore { measures { n: lines, sp: spend, inc: income, mv: fct_ledger | where(fct_ledger.flow_group in ['transfer', 'save_invest'] and fct_ledger.direction == 'out') | sum(fct_ledger.amount_vnd) } }" });
      // the filter's choices: every category, and the merchants in the date range (most lines first)
      this.catList = WF.q(`${P}catlist`, { dataset: PF, metrics: {}, aql: 'explore { dimensions { cat: dim_categories.category, en: dim_categories.label_en, o: dim_categories.sort_order } sorts { o asc } }' });
      this.mList = page(WF.q(`${P}mlist`, { dataset: PF, pageSize: 120, metrics: { n: 'lines' }, aql: 'explore { dimensions { m: fct_ledger.merchant_display } measures { n: lines } sorts { n desc } }' }));
      this.days = WF.q(`${P}days`, { dataset: PF, pageSize: 400, metrics: { sp: 'spend', inc: 'income' },
        aql: 'explore { dimensions { d: fct_ledger.line_date } measures { sp: spend, inc: income } sorts { d desc } }' });
      this.c = {
        flow: WF.fieldControl(`${P}flow`, PF, 'fct_ledger.flow_group'),
        cat: WF.fieldControl(`${P}cat`, PF, 'dim_categories.category'),
        merchant: WF.fieldControl(`${P}merchant`, PF, 'fct_ledger.merchant_display'),
        src: WF.fieldControl(`${P}src`, PF, 'dim_sources.label'),
        amt: WF.fieldControl(`${P}amt`, PF, 'fct_ledger.amount_vnd'),
        q: WF.textControl(`${P}q`),
      };
      for (const q of [this.list, this.listKpi, this.days]) {
        page(q);
        app.mapControl(this.c.flow, q, { field: 'fct_ledger.flow_group' });
        app.mapControl(this.c.cat, q, { field: 'dim_categories.category' });
        app.mapControl(this.c.merchant, q, { field: 'fct_ledger.merchant_display' });
        app.mapControl(this.c.src, q, { field: 'dim_sources.label' });
        app.mapControl(this.c.amt, q, { field: 'fct_ledger.amount_vnd' });
        app.mapControl(this.c.q, q, { field: 'fct_ledger.merchant_display' });
      }
      this.c.flow.setCondition({ operator: 'is', values: FLOWS });

      // ----- events
      if (exp) OG.bindKeys($('sp-tx-menu'), (k) => { if (k === 'csv') this.list.export({ filename: `Transactions ${OG.rangeLabel(this.sel)}` }).catch((e) => console.error('export', e)); });
      let t;
      $('sp-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => this.setFilter({ q: e.target.value.trim() }), 250); });
      // the search icon expands into the field; an empty field folds back to the icon when it loses focus (Escape clears it)
      const box = $('tx-search'), sbtn = box.querySelector('.tx-search-btn');
      const openSearch = (on) => { box.classList.toggle('open', on); sbtn.setAttribute('aria-expanded', String(on)); };
      sbtn.addEventListener('click', () => { openSearch(true); $('sp-q').focus(); });
      $('sp-q').addEventListener('blur', () => { if (!$('sp-q').value.trim()) openSearch(false); });
      $('sp-q').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); $('sp-q').value = ''; this.setFilter({ q: '' }); openSearch(false); sbtn.focus(); } });
      this.openSearch = openSearch;
      $('tx-filter').addEventListener('click', (e) => this.openFilter(e.currentTarget, e.detail === 0));
      el.classList.add('hide-pct');
      el.querySelectorAll('[data-pct]').forEach((b) => b.addEventListener('click', () => {
        this.pct = !this.pct;
        el.classList.toggle('hide-pct', !this.pct);
        el.querySelectorAll('[data-pct]').forEach((x) => { x.classList.toggle('on', this.pct); x.setAttribute('aria-pressed', String(this.pct)); });
      }));
      OG.bindKeys($('sp-brk'), (k) => this.setBreak(k));
      this.setBreak(this.brk);
      $('sp-more').addEventListener('click', () => { const b = $('sp-more'); b.setAttribute('aria-busy', 'true'); this.list.fetchMore().catch((err) => console.error('more', err)).finally(() => b.removeAttribute('aria-busy')); });
      el.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-chip]');
        if (chip && el.contains(chip)) { this.dropChip(chip.dataset.chip); return; }
        if (e.target.closest('[data-chip-clear]')) { this.clearFilters(); return; }
        const only = e.target.closest('[data-only]');
        if (only) { OG.closeDrawer(); this.setFilter(JSON.parse(only.dataset.only)); this.toList(); return; }
      });
      const open = (sel, fn) => (e) => { const r = e.target.closest(sel); if (!r || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return; if (e.type === 'keydown') e.preventDefault(); fn(r); };
      for (const ev of ['click', 'keydown']) {
        $('sp-acct-rows').addEventListener(ev, open('[data-acct]', (r) => { this.setFilter({ src: this.f.src === r.dataset.acct ? null : r.dataset.acct }); if (this.f.src) this.toList(); }));
        $('sp-cat-rows').addEventListener(ev, open('[data-cat]', (r) => this.inspectCat(r.dataset.cat)));
        $('sp-merch-rows').addEventListener(ev, open('[data-merch]', (r) => this.inspectMerch(r.dataset.merch)));
        $('sp-tx-list').addEventListener(ev, open('[data-tx]', (r) => this.inspectTx(r.dataset.tx)));
      }
      this.applyWindow();
    },

    // ----- the window
    window() { return this.sel.range ? WF.range(this.sel.range) : [this.sel.a, this.sel.b]; },
    windowLabel() { return this.sel.range ? OG.RANGE_WORD[this.sel.range] ?? OG.rangeLabel(this.sel).toLowerCase() : OG.rangeLabel(this.sel); },
    setSel(sel) {
      this.sel = sel.range ? { range: sel.range } : { a: sel.a < WF.firstDay ? WF.firstDay : sel.a, b: sel.b > WF.asOf ? WF.asOf : sel.b };
      this.applyWindow();
    },
    setRange(k) { this.setSel({ range: k }); },
    applyWindow() {
      const [a, b] = this.window();
      this.period.setCondition({ operator: 'between', values: [a, b] });
      $('tx-range').outerHTML = OG.rangeBtn('tx-range', this.sel);
      $('tx-range').addEventListener('click', (e) => OG.rangePopover(e.currentTarget, this.sel, (sel) => this.setSel(sel), { kbd: e.detail === 0 }));
      this.listSig = this.catSig = null;
      WF.app.execute();
      WF.renderAll();
    },
    // patch: any of { cats, merchants, min, max, src, q }; { cat, merchant } (one value or null, from deep links and "Only …")
    // set that list alone
    setFilter(patch) {
      const p = { ...patch };
      if ('cat' in p) { p.cats = p.cat ? [p.cat] : []; delete p.cat; }
      if ('merchant' in p) { p.merchants = p.merchant ? [p.merchant] : []; delete p.merchant; }
      this.f = { ...this.f, ...p };
      const { cats, merchants, min, max, src, q } = this.f;
      this.c.cat.setCondition({ operator: 'is', values: cats });
      this.c.merchant.setCondition({ operator: 'is', values: merchants });
      this.c.src.setCondition({ operator: 'is', values: src ? [src] : [] });
      this.c.amt.setCondition(min != null || max != null ? { operator: 'between', values: [String(min ?? 0), String(max ?? 1e15)] } : { operator: 'is', values: [] });
      this.c.q.setCondition(q ? { operator: 'contains', values: [q] } : { operator: 'is', values: [] });
      if ($('sp-q').value.trim() !== q) { $('sp-q').value = q; this.openSearch?.(!!q); }
      const n = cats.length + merchants.length + (min != null || max != null ? 1 : 0);
      $('tx-fbadge').hidden = !n; $('tx-fbadge').textContent = n || '';
      $('tx-filter').classList.toggle('on', !!n);
      $('tx-filter').setAttribute('aria-label', n ? `Filter transactions, ${n} active` : 'Filter transactions');
      this.listSig = null;
      WF.app.execute();
      WF.renderAll();
    },
    clearFilters() { this.setFilter({ cats: [], merchants: [], min: null, max: null, src: null, q: '' }); },
    // a chip's key: 'cat|<category>', 'merchant|<name>', 'amt', 'src' or 'q'
    dropChip(key) {
      const [k, v] = [key.split('|')[0], key.slice(key.indexOf('|') + 1)];
      if (k === 'cat') this.setFilter({ cats: this.f.cats.filter((x) => x !== v) });
      else if (k === 'merchant') this.setFilter({ merchants: this.f.merchants.filter((x) => x !== v) });
      else if (k === 'amt') this.setFilter({ min: null, max: null });
      else this.setFilter({ [k]: k === 'q' ? '' : null });
    },

    // ----- the filter popover (17 Oct, Nhi): Categories (toggle chips wearing the category's icon dot, as everywhere),
    // Merchants (a searchable checklist of the range's merchants), Amount (min / max, k / m shorthand, three presets).
    // Picks are a draft until Apply; Reset clears the draft. One popover at a time (OG.showPop).
    openFilter(anchor, kbd) {
      if (OG.isOpenPop('filter-pop')) { OG.closePop(); return; }
      OG.closePop();
      const d = { cats: new Set(this.f.cats), merchants: new Set(this.f.merchants), min: this.f.min, max: this.f.max };
      const cats = WF.status(this.catList, null) ? WF.rows(this.catList) : [];
      const merch = WF.status(this.mList, null) ? WF.rows(this.mList).filter((r) => r.m) : [];
      const pop = document.createElement('div');
      pop.className = 'popover filter-pop';
      pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Filter transactions');
      pop.dataset.anfraBlock = 'tx-filter-pop'; pop.dataset.anfraLabel = 'Filter transactions';
      const box = (on) => `<span class="box ${on ? 'on' : ''}" aria-hidden="true">${on ? OG.icon('check', 'sm') : ''}</span>`;
      const fmtIn = (v) => (v == null ? '' : Number(v).toLocaleString('en-US'));
      const draw = () => {
        const term = pop.querySelector('[data-msearch]')?.value ?? '';
        const shown = merch.filter((r) => !term || String(r.m).toLowerCase().includes(term.toLowerCase()));
        const preset = AMT_PRESETS.find((x) => (x.min ?? null) === d.min && (x.max ?? null) === d.max)?.k;
        pop.innerHTML = `<div class="ph"><span>Filters</span><button type="button" class="btn link" data-reset>Reset</button></div>
          <div class="fp-body">
            <section class="fp-sec"><div class="fp-h"><span>Categories</span><span class="fp-n">${d.cats.size ? `${d.cats.size} selected` : 'All'}</span></div>
              <div class="fp-chips">${cats.map((r) => { const on = d.cats.has(r.cat);
                return `<button type="button" class="fp-chip" data-fcat="${esc(r.cat)}" aria-pressed="${on}"><span class="tx-ic" style="--c:${esc(catCol(r))}" aria-hidden="true">${OG.icon(OG.catIcon(r.en))}</span>${esc(r.en)}</button>`; }).join('')}</div></section>
            <section class="fp-sec"><div class="fp-h"><span>Merchants</span><span class="fp-n">${d.merchants.size ? `${d.merchants.size} selected` : 'All'}</span></div>
              <label class="search fp-search">${OG.icon('search', 'sm')}<input type="search" data-msearch placeholder="Find a merchant" aria-label="Find a merchant" autocomplete="off" value="${esc(term)}"></label>
              <div class="fp-list" role="group" aria-label="Merchants">${shown.map((r) => { const on = d.merchants.has(r.m);
                return `<button type="button" class="fp-opt" data-fm="${esc(r.m)}" aria-pressed="${on}">${box(on)}<span class="t">${esc(r.m)}</span><span class="n">${fmt.n(r.n)}</span></button>`; }).join('') || '<div class="fp-empty">No merchant matches.</div>'}</div></section>
            <section class="fp-sec"><div class="fp-h"><span>Amount</span><span class="fp-n">${d.min != null || d.max != null ? esc(amtLabel(d.min, d.max)) : 'Any'}</span></div>
              <div class="fp-range"><label><span>Min</span><input data-min inputmode="decimal" placeholder="0" value="${fmtIn(d.min)}" autocomplete="off"></label>
                <span class="fp-dash" aria-hidden="true">–</span><label><span>Max</span><input data-max inputmode="decimal" placeholder="No limit" value="${fmtIn(d.max)}" autocomplete="off"></label></div>
              <div class="fp-presets">${AMT_PRESETS.map((x) => `<button type="button" class="fp-chip sm" data-preset="${x.k}" aria-pressed="${x.k === preset}">${esc(x.label)}</button>`).join('')}</div></section>
          </div>
          <div class="pf"><button type="button" class="btn" data-cancel>Cancel</button><button type="button" class="btn black" data-apply>Apply</button></div>`;
      };
      const readAmt = () => { const lo = parseAmt(pop.querySelector('[data-min]').value), hi = parseAmt(pop.querySelector('[data-max]').value);
        d.min = lo || null; d.max = hi || null; if (d.min != null && d.max != null && d.min > d.max) [d.min, d.max] = [d.max, d.min]; };
      // redraw but keep the merchant search's focus and caret (typing filters the checklist live)
      const redraw = (focusSel) => { const scroll = pop.querySelector('.fp-list')?.scrollTop ?? 0; draw(); pop.querySelector('.fp-list').scrollTop = scroll;
        if (focusSel) { const f = pop.querySelector(focusSel); f?.focus(); if (f?.setSelectionRange) f.setSelectionRange(f.value.length, f.value.length); } };
      pop.addEventListener('click', (e) => {
        const c = e.target.closest('[data-fcat]'), m = e.target.closest('[data-fm]'), pr = e.target.closest('[data-preset]');
        if (c) { const k = c.dataset.fcat; d.cats.has(k) ? d.cats.delete(k) : d.cats.add(k); readAmt(); redraw(`[data-fcat="${CSS.escape(k)}"]`); return; }
        if (m) { const k = m.dataset.fm; d.merchants.has(k) ? d.merchants.delete(k) : d.merchants.add(k); readAmt(); redraw(`[data-fm="${CSS.escape(k)}"]`); return; }
        if (pr) { const x = AMT_PRESETS.find((y) => y.k === pr.dataset.preset), same = (x.min ?? null) === d.min && (x.max ?? null) === d.max;
          d.min = same ? null : x.min ?? null; d.max = same ? null : x.max ?? null; redraw(`[data-preset="${x.k}"]`); return; }
        if (e.target.closest('[data-reset]')) { d.cats.clear(); d.merchants.clear(); d.min = d.max = null; redraw(); return; }
        if (e.target.closest('[data-cancel]')) { OG.closePop(); anchor.focus(); return; }
        if (e.target.closest('[data-apply]')) { readAmt(); OG.closePop(); this.setFilter({ cats: [...d.cats], merchants: [...d.merchants], min: d.min, max: d.max }); this.toList(); }
      });
      pop.addEventListener('input', (e) => { if (e.target.matches('[data-msearch]')) { readAmt(); redraw('[data-msearch]'); } });
      pop.addEventListener('change', (e) => { if (e.target.matches('[data-min], [data-max]')) { readAmt(); redraw(); } });
      pop.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-min], [data-max]')) pop.querySelector('[data-apply]').click(); });
      draw();
      OG.showPop(anchor, pop);
      if (kbd) pop.querySelector('.fp-chip')?.focus();
    },
    toList() { requestAnimationFrame(() => this.el.querySelector('[data-anfra-block="sp-tx"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    // a deep link (OG.openTx): { date, month, from, to, cat, merchant, src, flow, q }
    openWith(f = {}) {
      if (f.month) { const m0 = String(f.month).slice(0, 8) + '01'; const [a, b] = WF.monthSpan(m0); this.setSel({ a, b }); }
      else if (f.from || f.to) this.setSel({ a: f.from ?? WF.firstDay, b: f.to ?? WF.asOf });
      else if (OG.RANGES.includes(f.date) || f.date === 'this_month' || f.date === 'last_month') this.setSel({ range: f.date });
      const flow = f.flow ? [].concat(f.flow) : FLOWS;
      this.c.flow.setCondition({ operator: 'is', values: flow });
      this.setFilter({ cat: f.cat ?? null, merchant: f.merchant ?? null, min: null, max: null, src: f.src ?? null, q: f.q ?? '' });
      this.toList();
    },

    // ----- the hero: what the listed transactions spent (filters included); under it a summary strip (17 Oct, Nhi) of the
    // other facts: how many, over which dates, what came in, what moved between your own accounts
    drawHero() {
      if (!WF.status(this.listKpi, null)) return;
      const k = WF.one(this.listKpi), id = this.listKpi.name, n = fmt.n(k.n) ?? 0, [a, b] = this.window();
      $('tx-hero').innerHTML = `<span data-trace="${id}:sp">${money(k.sp)}</span>`;
      $('tx-hero-delta').hidden = true;
      const it = (label, v, cls = '') => `<div class="ts-i"><span class="k">${label}</span><span class="v${cls ? ` ${cls}` : ''}">${v}</span></div>`;
      $('tx-sum').innerHTML = it('Total transactions', `<span data-trace="${id}:n">${n.toLocaleString('en-US')}</span>`)
        + it('Date range', esc(spanFull(a, b)))
        + it('Total income', `<span class="amt" data-trace="${id}:inc">${money(k.inc ?? 0)}</span>`, 'pos')
        + it('Between accounts', `<span class="amt" data-trace="${id}:mv">${money(k.mv ?? 0)}</span>`);
    },

    // ----- rail: one card, three views (accounts and categories: amount + a share bar; the top merchants). The switch is the
    // card's title (18 Oct, Nhi: the active segment names the view; the h2 stays for screen readers); the ⓘ follows the view;
    // the % switch only shows where there are shares. A switch eases the card to its new height and fades the view in.
    setBreak(k) {
      const c = this.el.querySelector('[data-anfra-block="sp-break"]'), b = BRK[k], body = c.querySelector('.card-body');
      const from = this.brk !== k && c.isConnected ? body.offsetHeight : null;
      this.brk = k;
      c.querySelectorAll('[data-brk]').forEach((p) => { p.hidden = p.dataset.brk !== k; });
      if (from != null && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const to = body.offsetHeight, ease = 'cubic-bezier(0.23, 1, 0.32, 1)';
        body.getAnimations().forEach((a) => a.cancel());
        if (to !== from) { body.style.overflow = 'hidden'; body.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 220, easing: ease }).onfinish = () => { body.style.overflow = ''; }; }
        c.querySelector(`[data-brk="${k}"]`).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      }
      c.querySelector('.card-title').textContent = b.label;
      c.dataset.anfraLabel = b.label;
      const ex = c.querySelector('.card-head .explain');
      if (ex) { ex.dataset.explain = b.explain; ex.setAttribute('aria-label', `How ${b.label} is calculated`); }
      c.querySelector('[data-pct]').style.visibility = k === 'merch' ? 'hidden' : '';
      OG.setActive($('sp-brk'), k);
    },
    // ----- rail: accounts and categories (amount + a share bar), the top merchants
    // an account row filters the list to that account (the 'src' chip); a second click, or the chip's ×, clears it
    drawAccts() {
      if (!WF.status(this.accts, $('sp-accts-state'), 'No spending in this window.')) return;
      const sig = [this.accts.result, this.f.src];
      if (this.acctSig && sig.every((r, i) => r === this.acctSig[i])) return;
      this.acctSig = sig;
      const rows = WF.rows(this.accts), max = Math.max(...rows.map((r) => fmt.n(r.v) ?? 0), 1), total = rows.reduce((a, r) => a + (fmt.n(r.v) ?? 0), 0);
      $('sp-acct-rows').innerHTML = rows.map((r) => {
        const on = this.f.src === r.src, n = fmt.n(r.n) ?? 0;
        return `<div class="sp-cat sp-acct${on ? ' active' : this.f.src ? ' dim' : ''}" data-acct="${esc(r.src)}" role="button" tabindex="0" aria-pressed="${on}"
            aria-label="${esc(`${r.src}: ${approx(r.v)}, ${n} ${n === 1 ? 'purchase' : 'purchases'}${on ? ', the list shows only this account' : ''}`)}">
          ${OG.line({ lead: OG.tile({ icon: r.ins === 'credit_card' ? 'card' : 'accounts' }), title: esc(r.src),
            aside: total ? pct1((fmt.n(r.v) ?? 0) / total) : '',
            value: `<span class="amt" data-trace="${this.accts.name}:v">${approx(r.v)}</span>` })}
          <div class="sp-bar" aria-hidden="true"><div style="width:${((fmt.n(r.v) ?? 0) / max) * 100}%"></div></div></div>`;
      }).join('');
    },
    drawCats() {
      if (!WF.status(this.cats, $('sp-cats-state'), 'No spending in this window.')) return;
      const sig = [this.cats.result];
      if (this.catSig && sig.every((r, i) => r === this.catSig[i])) return;
      this.catSig = sig;
      const rows = WF.rows(this.cats).filter((r) => (fmt.n(r.v) ?? 0) > 0), max = Math.max(...rows.map((r) => fmt.n(r.v)), 1);
      $('sp-cat-rows').innerHTML = rows.map((r) => {
        return `<div class="sp-cat" data-cat="${esc(r.cat)}" role="button" tabindex="0" aria-label="${esc(r.en)}: ${esc(approx(r.v))}">
          ${OG.line({ lead: OG.tile({ icon: OG.catIcon(r.en), color: catCol(r) }), title: esc(r.en), cls: 'has-sh',
            aside: r.share != null ? `<span class="sh" data-trace="${this.cats.name}:share">${pct1(r.share)}</span>` : '',
            value: `<span class="amt" data-trace="${this.cats.name}:v">${approx(r.v)}</span>` })}
          <div class="sp-bar" aria-hidden="true"><div style="width:${(fmt.n(r.v) / max) * 100}%;background:${esc(catCol(r))}"></div></div></div>`;
      }).join('');
      this.markActive();
    },
    drawMerch() {
      if (!WF.status(this.merch, $('sp-merch-state'), 'No merchants in this window.')) return;
      $('sp-merch-rows').innerHTML = WF.rows(this.merch).map((r) => OG.row({ lead: OG.tile({ text: OG.initials(r.m) }), title: esc(r.m ?? '—'),
        meta: `${fmt.n(r.n)} ${fmt.n(r.n) === 1 ? 'time' : 'times'}`, value: `<span class="amt" data-trace="${this.merch.name}:v">${approx(r.v)}</span>`,
        attrs: `data-merch="${esc(r.m)}" role="button" tabindex="0"` })).join('');
      this.markActive();
    },
    markActive() {
      this.el.querySelectorAll('[data-cat], [data-merch]').forEach((r) => r.classList.toggle('active', (r.dataset.cat ?? r.dataset.merch) === this.inspKey));
    },

    // ----- the list: chips, rows grouped by day
    drawList() {
      const chips = [];
      this.f.cats.forEach((c) => chips.push({ key: `cat|${c}`, label: OG.catEn(c) }));
      this.f.merchants.forEach((m) => chips.push({ key: `merchant|${m}`, label: m }));
      if (this.f.min != null || this.f.max != null) chips.push({ key: 'amt', label: amtLabel(this.f.min, this.f.max) });
      if (this.f.src) chips.push({ key: 'src', label: this.f.src });
      if (this.f.q) chips.push({ key: 'q', label: `“${this.f.q}”` });
      $('sp-chips').innerHTML = OG.filterChips(chips);
      if (!WF.status(this.list, $('sp-tx-state'), 'No transactions match. Clear a filter to see more.')) { $('sp-tx-list').innerHTML = ''; $('sp-more').hidden = true; return; }
      const sig = [this.list.result, this.days.result];
      if (this.listSig && sig.every((r, i) => r === this.listSig[i])) return;
      this.listSig = sig;
      const totals = new Map(WF.status(this.days, null) ? WF.rows(this.days).map((r) => [fmt.ymd(r.d), r]) : []);
      const groups = new Map();
      WF.rows(this.list).forEach((r) => { const d = fmt.ymd(r.d); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(r); });
      $('sp-tx-list').innerHTML = [...groups.entries()].map(([d, rs]) => {
        const t = totals.get(d), sp = fmt.n(t?.sp), inc = fmt.n(t?.inc);
        const right = [sp ? `<span class="amt">${approx(sp)}</span> spent` : '', inc ? `<span class="amt pos">+${approx(inc)}</span> in` : ''].filter(Boolean).join(' · ');
        return `<div class="sp-day">${OG.dayHead(d, right)}${rs.map((r) => this.txRow(r)).join('')}</div>`;
      }).join('');
      $('sp-more').hidden = !this.list.hasMore;
      this.el.querySelectorAll('[data-tx]').forEach((r) => r.classList.toggle('active', r.dataset.tx === String(this.txId)));
    },
    // a row (17 Oct, Nhi): merchant over the account first, then its tag, then the amount. The tag maps to the Categories
    // card: the same icon on the same colour, shrunk to a dot inside a quiet pill (category, or what the flow is). Amounts
    // carry no minus: money out is plain, money in is "+" and green. Moves between your own accounts are dimmed and say
    // "not spending".
    txRow(r) {
      const v = fmt.n(r.amt) ?? 0, inflow = v > 0, between = BETWEEN.has(r.fg);
      const byCat = r.fg === 'spend' || (r.fg === 'save_invest' && r.cat && r.cat !== '(chưa phân loại)');
      const label = byCat ? (r.en ?? r.cat ?? 'Untagged') : FLOW_TAG[r.fg] ?? (between ? 'Saving' : r.fg);
      const ic = byCat ? OG.catIcon(r.en ?? r.cat) : FLOW_ICON[r.fg] ?? 'transfer';
      const color = byCat ? catCol(r) : r.fg === 'income' ? WF.charts.css('--flow-in') : WF.charts.css('--chart-hist');
      const tag = OG.txTag(label, ic, color);
      return OG.row({ cls: `tx-row${between ? ' between' : ''}`, title: esc(r.md || r.desc || '—'),
        meta: between ? esc(fromTo(r)) : esc(r.src ?? ''),
        value: `${tag}<span class="amt${inflow && !between ? ' pos' : ''}" data-trace="${this.list.name}:amt">${inflow ? '+' : ''}${money(Math.abs(v))}</span>`,
        attrs: `data-tx="${esc(r.id)}" data-flow="${esc(r.fg)}" role="button" tabindex="0"` });
    },

    // ----- inspectors in the rail (‹ back to the rail's cards)
    rail() { return this.el.querySelector('[data-anfra-container="tx-rail"]'); },
    openInsp(label, back, key, body) {
      this.inspKey = key;
      this.inspEl = OG.drawer({ label, back, rail: this.rail(), body, onClose: () => { this.inspKey = null; this.txId = null; this.inspEl = null; this.markActive();
        this.el.querySelectorAll('[data-tx].active').forEach((r) => r.classList.remove('active')); } });
      this.inspEl.querySelector('.dh .back')?.focus({ preventScroll: true });
      this.markActive();
      return this.inspEl;
    },
    inspQueries() {
      if (this.iq) return this.iq;
      const app = WF.app;
      const y1 = WF.dateControl(`${P}i_year`); WF.setPeriod(y1, '1Y');
      const cat = WF.fieldControl(`${P}i_cat`, PF, 'dim_categories.category'), mer = WF.fieldControl(`${P}i_merchant`, PF, 'fct_ledger.merchant_display');
      const mk = (name, aql, metrics, { year = false, pageSize } = {}) => { const q = WF.q(`${P}${name}`, { dataset: PF, aql, metrics, ...(pageSize ? { pageSize } : {}) });
        app.mapControl(year ? y1 : this.period, q, { field: 'dim_dates.date_key' }); app.mapControl(cat, q, { field: 'dim_categories.category' }); app.mapControl(mer, q, { field: 'fct_ledger.merchant_display' }); OG.mapMe(q); return q; };
      this.iq = { cat, mer,
        hist: mk('i_hist', 'explore { dimensions { m: dim_dates.month_start } measures { v: spend } sorts { m asc } }', { v: 'spend' }, { year: true }),
        avg: mk('i_avg', 'explore { measures { avg: spend_monthly_avg } }', { avg: 'spend_monthly_avg' }, { year: true }),
        kpi: mk('i_kpi', 'explore { measures { v: spend, n: spend_lines, t: avg_ticket } }', { v: 'spend', n: 'spend_lines', t: 'avg_ticket' }),
        top: mk('i_top', 'explore { dimensions { m: fct_ledger.merchant_display } measures { v: spend } having { spend > 0 } sorts { v desc } }', { v: 'spend' }, { pageSize: 3 }),
        last: mk('i_last', "explore { dimensions { id: fct_ledger.line_id, d: fct_ledger.line_date, at: fct_ledger.line_at, en: dim_categories.label_en } measures { v: spend } filters { fct_ledger.is_spend is true } sorts { d desc, at desc, id desc } }", { v: 'spend' }, { pageSize: 5 }),
      };
      return this.iq;
    },
    inspectCat(c) {
      const iq = this.inspQueries();
      iq.cat.setCondition({ operator: 'is', values: [c] }); iq.mer.setCondition({ operator: 'is', values: [] });
      this.insp = { kind: 'cat', key: c, sig: null };
      this.openInsp(OG.catEn(c), 'Categories', c, '<div class="sp-insp" id="sp-insp"></div>');
      WF.app.execute(); this.drawInsp();
    },
    inspectMerch(m) {
      const iq = this.inspQueries();
      iq.mer.setCondition({ operator: 'is', values: [m] }); iq.cat.setCondition({ operator: 'is', values: [] });
      this.insp = { kind: 'merch', key: m, sig: null };
      this.openInsp(m, 'Top merchants', m, '<div class="sp-insp" id="sp-insp"></div>');
      WF.app.execute(); this.drawInsp();
    },
    inspectTx(id) {
      const r = WF.rows(this.list).find((x) => String(x.id) === String(id));
      if (!r) return;
      this.insp = { kind: 'tx', key: id };
      this.txId = id;
      const v = fmt.n(r.amt) ?? 0, inflow = v > 0, when = new Date(`${fmt.ymd(r.d)}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      const at = r.at ? String(r.at).slice(11, 16) : '';
      const lag = OG.fresh.state === 'success' ? WF.rows(OG.fresh).find((x) => x.s === r.src) : null, late = lag && OG.lagDays(lag.last) > 7;
      const d = this.openInsp(r.md || r.desc || 'Transaction', 'Transactions', null, `<div class="sp-insp">
          <div><div class="label">${esc(r.fg === 'spend' ? (r.en ?? 'Spending') : FLOW_SAYS[r.fg] ? ({ income: 'Income', reimbursement: 'Paid back', refund: 'Refund' }[r.fg]) : 'Transaction')}</div>
            <div class="hero${inflow ? ' pos' : ''}" data-trace="${this.list.name}:amt">${inflow ? '+' : '-'}${money(Math.abs(v))}</div>
            <div class="sub">${esc(when)}${at && at !== '00:00' ? ` · ${esc(at)}` : ''}</div></div>
          <dl class="sp-facts">
            <div><dt>Merchant</dt><dd>${esc(r.md || '—')}</dd></div>
            <div><dt>Bank text</dt><dd class="mono">${esc(r.desc || '—')}</dd></div>
            <div><dt>Category</dt><dd>${esc(r.en ?? 'Untagged')}${r.cs ? ` <span class="muted">· tagged ${esc(CS_SAYS[r.cs] ?? r.cs)}</span>` : r.cat ? '' : ' <span class="muted">· not tagged yet</span>'}</dd></div>
            <div><dt>Account</dt><dd>${esc(r.src ?? '—')}${late ? `<span class="stale-dot" aria-label="${esc(r.src)} lines end ${esc(dayMon(lag.last))}" title="${esc(r.src)} lines end ${esc(dayMon(lag.last))}"></span>` : ''}</dd></div>
            <div><dt>Counts as</dt><dd>${esc(FLOW_SAYS[r.fg] ?? `Not spending (${r.fg}).`)}</dd></div>
          </dl>
          <div class="sp-insp-act">${r.cat ? OG.btn({ label: `Only ${OG.catEn(r.cat)}`, attrs: `data-only='${esc(JSON.stringify({ cat: r.cat }))}'` }) : ''}${r.md ? OG.btn({ label: `Only ${r.md}`, attrs: `data-only='${esc(JSON.stringify({ merchant: r.md }))}'` }) : ''}</div>
        </div>`);
      this.el.querySelectorAll('[data-tx]').forEach((x) => x.classList.toggle('active', x.dataset.tx === String(id)));
      return d;
    },
    drawInsp() {
      const d = this.inspEl;
      if (!d?.isConnected || !this.insp || this.insp.kind === 'tx') return;
      const iq = this.iq, ready = [iq.hist, iq.avg, iq.kpi, iq.top, iq.last].every((q) => q.result && q.state !== 'executing');
      const box = d.querySelector('#sp-insp');
      if (!ready) { if (!box.innerHTML) box.innerHTML = '<div class="state busy">Loading…</div>'; return; }
      const sig = [iq.hist.result, iq.avg.result, iq.kpi.result, iq.top.result, iq.last.result, this.insp.key];
      if (this.insp.sig && sig.every((r, i) => r === this.insp.sig[i])) return;
      this.insp.sig = sig;
      const k = WF.one(iq.kpi), avg = fmt.n(WF.one(iq.avg).avg), hist = WF.rows(iq.hist), cat = this.insp.kind === 'cat';
      const all = WF.status(this.cats, null) ? WF.rows(this.cats).reduce((a, r) => a + (fmt.n(r.v) ?? 0), 0) : 0;
      const f = cat ? { cat: this.insp.key } : { merchant: this.insp.key };
      // the drill-down, top to bottom (17 Oct, Nhi: easier to scan): the amount for the range, three facts side by side
      // (share · purchases · average), the past year by month against its average (the chart's dashed line), then where (category) or the latest
      // purchases (merchant), each section under the same quiet label
      const sec = (label, aside, body) => `<section class="ins-sec"><div class="ins-h"><span>${label}</span>${aside ? `<span class="ins-a">${aside}</span>` : ''}</div>${body}</section>`;
      const facts = [
        ...(cat && all ? [{ k: 'Share', v: pct1(fmt.n(k.v) / all) }] : []),
        { k: 'Purchases', v: `<span data-trace="${iq.kpi.name}:n">${fmt.n(k.n) ?? 0}</span>` },
        { k: 'Average', v: `<span class="amt" data-trace="${iq.kpi.name}:t">${approx(k.t)}</span>` },
      ];
      box.innerHTML = `
        <div><div class="label">Spent · ${esc(this.windowLabel())}</div><div class="hero" data-trace="${iq.kpi.name}:v">${money(k.v)}</div></div>
        ${OG.kpis(facts, 'left ins-kpis')}
        ${sec('Past year, by month', '', '<div class="chart sp-insp-chart" id="sp-insp-chart"></div>')}
        ${cat ? sec('Top merchants', '', WF.rows(iq.top).map((r) => OG.line({ title: esc(r.m ?? '—'), aside: fmt.n(k.v) ? pct1(fmt.n(r.v) / fmt.n(k.v)) : '', value: `<span class="amt" data-trace="${iq.top.name}:v">${approx(r.v)}</span>` })).join('') || '<div class="state">No merchants.</div>')
          : sec('Latest purchases', '', WF.rows(iq.last).map((r) => OG.line({ title: esc(dayMon(r.d)), aside: esc(r.en ?? ''), value: `<span class="amt" data-trace="${iq.last.name}:v">${money(r.v)}</span>` })).join('') || '<div class="state">No purchases.</div>')}
        <div class="sp-insp-act">${OG.btn({ label: 'Show transactions', icon: 'list', attrs: `data-only='${esc(JSON.stringify(f))}'` })}</div>`;
      if (hist.length) {
        OG.miniBars(box.querySelector('#sp-insp-chart'), hist.map((r) => OG.monthName(r.m, false)), hist.map((r) => fmt.n(r.v)), avg);
        if (hist.length > 7) WF.charts.chart(box.querySelector('#sp-insp-chart')).setOption({ xAxis: { axisLabel: { interval: 1 } } });
      }
    },

    render() {
      this.drawHero();
      this.drawAccts();
      this.drawCats();
      this.drawMerch();
      this.drawList();
      this.drawInsp();
    },
  };
  WF.register(view);
})();
