// Home › Spending: this month's spending at a glance.
// Cards (js/pages.js): hs-month (hero + income · spending · net + running spend vs a chosen month, main 8) ·
// hs-latest under it (main 8) · hs-cats (category breakdown, Expenses / Budget, rail 4). Upcoming was removed on 17 Oct (Nhi).
// One base per card: the hero and the chart are ALL spending (the ledger's spend), compared with the same days of another
// month; budgets cover categories only (no bills line), so they live in the rail's Budget switch, never as a line on an
// all-spend chart (the 16 Oct "misleading numbers" fix). Ported from the archived mouka Spending › Overview.
(() => {
  const { fmt } = WF;
  const { $, esc, icon, money, approx, pct1, dayMon, monthName } = OG;
  const PF = 'personal_finance';
  const P = 'og5_home_';
  const MTD = 'explore { dimensions { d: dim_dates.date_key } measures { v: spend_mtd } sorts { d asc } }';
  // the governed gap to the same day-span k months back (one query per offset, made when first picked)
  const GAP = (k) => `explore { measures { cur: spend, cmp: spend | relative_period(dim_dates.date_key, interval(-${k} month)),
                                         gap: spend - (spend | relative_period(dim_dates.date_key, interval(-${k} month))),
                                         pct: safe_divide(spend - (spend | relative_period(dim_dates.date_key, interval(-${k} month))),
                                                          spend | relative_period(dim_dates.date_key, interval(-${k} month))) } }`;
  // Latest: the ledger's newest lines with the governed readable name (fct_ledger.merchant_display)
  const RECENT = `explore { dimensions { id: fct_ledger.line_id, d: fct_ledger.line_date, at: fct_ledger.line_at, m: fct_ledger.merchant_display, desc: fct_ledger.description,
                                         cat: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color, ft: fct_ledger.flow_type, amt: fct_ledger.signed_amount_vnd }
                            filters { fct_ledger.flow_group in ['spend', 'income', 'reimbursement', 'refund'] } sorts { d desc, at desc, id desc } }`;
  const day = (s) => Number(String(s).slice(8, 10));
  const monShort = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
  const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
  const catCol = (r) => OG.catColor(r.cat ?? r.en, r.color);
  const TX_ICON = { salary: 'dollar', bonus: 'dollar', interest: 'dollar', friend_payback: 'transfer', card_refund: 'transfer' };

  // Spend-to-date by day of month, carried forward over days without spend, up to the as-of date.
  function byDay(rows, month0, upTo) {
    const days = new Date(Number(month0.slice(0, 4)), Number(month0.slice(5, 7)), 0).getDate();
    const m = new Map(rows.map((r) => [Number(fmt.ymd(r.d).slice(8, 10)), Number(r.v)]));
    const out = []; let last = null;
    for (let d = 1; d <= 31; d++) {
      const ds = `${month0.slice(0, 8)}${String(d).padStart(2, '0')}`;
      if (d > days || (upTo && ds > upTo)) { out.push(null); continue; }
      if (m.has(d)) last = m.get(d);
      out.push(last ?? 0);
    }
    return out;
  }

  const view = {
    id: 'home/spending', nav: 'home', tab: 'Spending',
    init(el) {
      const app = WF.app;
      this.mode = 'line';
      this.catTab = 'expenses';
      this.month0 = `${WF.asOf.slice(0, 7)}-01`;
      this.cmp = WF.addMonths(this.month0, -1);
      this.blocks = {
        'hs-month': () => OG.card({ id: 'hs-month', label: 'Spend this month', explain: 'sp_kpi_1m:spent', rows: { date: 'this_month', flow: 'spend' },
          query: `sp_kpi_1m og_mtd og_mtd_cmp sp_daily ${P}gap_1`,
          // the compared month sits beside the chart switch (17 Oct, Nhi): both say what the chart draws
          control: `<span class="menu-wrap" data-anfra-control="og_cmp_month">
              <button class="btn hs-cmp" type="button" data-menu-btn aria-haspopup="menu" aria-expanded="false" id="hs-cmp"><span class="key"><span class="sw dash"></span></span>vs <span id="hs-cmp-l"></span> ${icon('down', 'sm')}</button>
              <div class="menu" id="hs-cmp-menu" role="menu" hidden></div></span>${OG.segIcons('hs-mode', [{ key: 'line', icon: 'line', title: 'Running total' }, { key: 'cal', icon: 'cal', title: 'Calendar' }], this.mode)}`,
          body: `${OG.heroRow({ id: 'hs-hero', own: 'spend-month', action: '<div class="flow-kpis" id="hs-flow"></div>' })}
            <div class="key" id="hs-key"></div>
            ${OG.chartBox('hs-chart', 'frame')}<div id="hs-cal" class="hs-cal" hidden></div>${OG.stateLine('hs-state')}` }),
        'hs-latest': () => OG.card({ id: 'hs-latest', label: 'Latest', go: 'spending', explain: `${P}recent:amt`, query: `${P}recent`,
          body: `<div id="hs-latest-list" class="tx-list"></div>${OG.stateLine('hs-latest-state')}` }),
        'hs-cats': () => OG.card({ id: 'hs-cats', label: 'Category breakdown', go: 'spending', explain: 'sp_cats:spent', rows: { date: 'this_month', flow: 'spend' },
          query: 'sp_cats og_cat_budget og_budget_total sp_kpi_1m',
          control: OG.segBtns('hs-ctab', [{ key: 'expenses', label: 'Expenses' }, { key: 'budget', label: 'Budget' }], this.catTab),
          body: `<div class="hs-gwrap"><div class="chart hs-gauge" id="hs-gauge"></div><div class="hs-gc" id="hs-gc"></div></div>
            <div id="hs-cat-rows" class="cat-rows"></div>${OG.stateLine('hs-cats-state')}` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      this.kpi = OG.kpi1(); this.daily = OG.dailyQ(); this.budget = OG.budgetTotalQ(); this.catBudget = OG.catBudgetQ();
      this.recent = WF.q(`${P}recent`, { dataset: PF, pageSize: 5, metrics: {}, aql: RECENT });
      this.mtd = WF.q('og_mtd', { dataset: PF, metrics: { v: 'spend_mtd' }, aql: MTD });
      this.mtdCmp = WF.q('og_mtd_cmp', { dataset: PF, metrics: { v: 'spend_mtd' }, aql: MTD });
      this.cats = WF.q('sp_cats', { dataset: PF, metrics: { spent: 'spend', share: 'spend_share_pct' },
        aql: `explore { dimensions { cat: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color }
                        measures { spent: spend, share: spend_share_pct } sorts { spent desc } }` });
      OG.mapMonth(this.kpi, this.daily, this.budget, this.mtd, this.cats, this.catBudget);
      OG.mapMe(this.mtd, this.mtdCmp, this.cats, this.recent);
      WF.setPeriod(OG.monthCtl, 'this_month');
      this.cmpCtl = WF.dateControl('og_cmp_month');
      app.mapControl(this.cmpCtl, this.mtdCmp, { field: 'dim_dates.date_key' });
      this.gaps = new Map();
      this.setCmp(this.cmp);

      OG.bindKeys($('hs-mode'), (k) => { this.mode = k; WF.renderAll(); });
      OG.bindKeys($('hs-ctab'), (k) => { this.catTab = k; this.catSig = null; WF.renderAll(); });
      OG.bindKeys($('hs-cmp-menu'), (k) => this.setCmp(k));
    },
    gapQ(k) {
      if (!this.gaps.has(k)) {
        const q = WF.q(`${P}gap_${k}`, { dataset: PF, metrics: { cur: 'spend' }, aql: GAP(k) });
        OG.mapMonth(q); OG.mapMe(q);
        this.gaps.set(k, q);
      }
      return this.gaps.get(k);
    },
    // "Sep 1–14": the month-to-date span shifted k months back (date arithmetic only)
    windowLabel(k) {
      const a = WF.addMonths(this.month0, -k), b = WF.addMonths(WF.asOf, -k);
      return day(b) > 1 ? `${monShort(a)} 1–${day(b)}` : `${monShort(a)} 1`;
    },
    setCmp(m0) {
      this.cmp = m0;
      this.k = monthsBetween(m0, this.month0);
      this.gap = this.gapQ(this.k);
      this.cmpCtl.setCondition({ operator: 'between', values: WF.monthSpan(m0) });
      $('hs-cmp-l').textContent = monthName(m0);
      const opts = [1, 2, 3, 6, 12].map((k) => WF.addMonths(this.month0, -k)).filter((x) => x >= `${WF.firstDay.slice(0, 8)}01`);
      $('hs-cmp-menu').innerHTML = opts.map((o) => `<button type="button" role="menuitem" data-k="${o}">${o === this.cmp ? icon('check', 'sm') : '<span class="menu-sp"></span>'}<span>${new Date(`${o}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span></button>`).join('');
      $('hs-cmp').closest('.card').dataset.anfraQuery = `sp_kpi_1m og_mtd og_mtd_cmp sp_daily ${this.gap.name}`;
      this.chartSig = null;
      WF.app.execute();
    },
    drawChart() {
      OG.setActive($('hs-mode'), this.mode);
      $('hs-chart').hidden = this.mode !== 'line';
      $('hs-cal').hidden = this.mode !== 'cal';
      $('hs-key').hidden = this.mode !== 'line';
      if (this.mode === 'cal') {
        if (WF.status(this.daily, $('hs-state'), 'No spending yet this month.')) $('hs-cal').innerHTML = OG.monthCal(this.month0, WF.rows(this.daily), { id: 'sp_daily' });
        return;
      }
      if (!(WF.status(this.mtd, $('hs-state'), 'No spending yet this month.') && WF.status(this.mtdCmp, null))) { WF.charts.clear($('hs-chart')); this.chartSig = null; return; }
      const sig = [this.mtd.result, this.mtdCmp.result];
      if (this.chartSig && sig.every((r, i) => r === this.chartSig[i])) return;
      this.chartSig = sig;
      const xs = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
      const cur = byDay(WF.rows(this.mtd), this.month0, WF.asOf), prev = byDay(WF.rows(this.mtdCmp), this.cmp);
      OG.area($('hs-chart'), xs, cur, { areaFill: false, scale: false, xFmt: (v) => v, tipFmt: (v) => money(v), compare: [{ name: monthName(this.cmp), data: prev }] });
      WF.charts.chart($('hs-chart')).setOption({ xAxis: { axisLabel: { interval: (i) => i % 7 === 0 } } });
      $('hs-key').innerHTML = `<span class="k"><span class="sw ln" style="background:var(--chart-line)"></span>${esc(monthName(this.month0))}</span>
        <span class="k"><span class="sw dash"></span>${esc(monthName(this.cmp))}</span>`;
    },
    drawCats() {
      OG.setActive($('hs-ctab'), this.catTab);
      const sig = [this.catTab, this.cats.result, this.budget.result, this.catBudget.result, this.kpi.result];
      if (this.catSig && sig.every((r, i) => r === this.catSig[i])) return;
      if (this.catTab === 'expenses') {
        if (!WF.status(this.cats, $('hs-cats-state'), 'No spending yet this month.')) { WF.charts.clear($('hs-gauge')); return; }
        this.catSig = sig;
        const rows = WF.rows(this.cats).filter((r) => Number(r.spent) > 0);
        OG.gauge($('hs-gauge'), rows.map((r) => ({ name: r.en, value: Number(r.spent), color: catCol(r) })));
        this.quietGauge();
        // the centre is approx (C1): the hero on the left card stays the one exact headline
        $('hs-gc').innerHTML = `<div class="sub">${esc(monthName(this.month0))}</div><div class="hero" data-trace="sp_kpi_1m:spent">${WF.status(this.kpi, null) ? approx(WF.one(this.kpi).spent) : ''}</div><div class="sub">${rows.length} categories</div>`;
        // one line per category: icon · name · share (secondary) · amount
        $('hs-cat-rows').innerHTML = rows.slice(0, 5).map((r) => OG.line({
          lead: OG.tile({ icon: OG.catIcon(r.en), color: catCol(r) }), title: esc(r.en),
          aside: `<span data-trace="sp_cats:share">${pct1(r.share)}</span>`, value: `<span class="amt" data-trace="sp_cats:spent">${approx(r.spent)}</span>` })).join('');
        return;
      }
      if (!(WF.status(this.budget, $('hs-cats-state'), 'No budgets this month.') && WF.status(this.catBudget, null))) return;
      this.catSig = sig;
      const b = WF.one(this.budget), rows = WF.rows(this.catBudget);
      OG.gauge($('hs-gauge'), [{ name: 'Spent', value: Number(b.spent), color: WF.charts.css('--budget') }], { total: Number(b.lim) });
      this.quietGauge();
      $('hs-gc').innerHTML = `<div class="sub" data-trace="og_budget_total:used">${pct1(b.used)} used</div><div class="hero" data-trace="og_budget_total:spent">${approx(b.spent)}</div>
        <div class="sub">of <span data-trace="og_budget_total:lim">${approx(b.lim)}</span></div>`;
      // "spent of limit" is a comparison: approx (C1); an over-limit row says "over" as well as turning red (C12)
      $('hs-cat-rows').innerHTML = rows.map((r) => { const over = fmt.n(r.used) > 1;
        return OG.row({ cls: 'hs-bud', lead: OG.tile({ icon: OG.catIcon(r.en), color: catCol(r) }),
          title: `${esc(r.en)}${r.buf === true || r.buf === 'true' ? ' <span class="muted">· buffer</span>' : ''}`,
          meta: OG.progress(Math.min(1, fmt.n(r.used) ?? 0), { tone: over ? 'over' : '', thin: true }),
          value: `<span class="amt" data-trace="og_cat_budget:spent">${approx(r.spent)}</span>`,
          sub: `<span class="${over ? 'neg' : ''}">of <span data-trace="og_cat_budget:lim">${approx(r.lim)}</span>${over ? ' · over' : ''}</span>` }); }).join('');
    },
    // the gauge steps back: a thin arc (OG.gauge draws it; this only restyles the series)
    quietGauge() {
      WF.charts.chart($('hs-gauge')).setOption({ series: [{ radius: ['80%', '93%'], center: ['50%', '62%'], padAngle: 2, itemStyle: { borderRadius: DS.px('--r-sm') / 2 } }] });
    },
    render() {
      if (WF.status(this.kpi, null)) {
        const k = WF.one(this.kpi), inc = fmt.n(k.income), net = fmt.n(k.net);
        $('hs-hero').innerHTML = `<span data-trace="sp_kpi_1m:spent">${money(k.spent)}</span>`;
        // the month's cash flow: income − spending = net (no income yet reads "—", not ₫0)
        $('hs-flow').innerHTML = `<div><div class="k">Income</div><div class="v amt${inc ? '' : ' muted'}" data-trace="sp_kpi_1m:income">${inc ? approx(inc) : '—'}</div></div>
          <div><div class="k">Spending</div><div class="v amt" data-trace="sp_kpi_1m:spent">${approx(k.spent)}</div></div>
          <div><div class="k">Net</div><div class="v amt ${OG.tone(net)}" data-trace="sp_kpi_1m:net">${approx(net, true)}</div></div>`;
      }
      if (WF.status(this.gap, null)) {
        const g = WF.one(this.gap), id = this.gap.name;
        // spending more than the same days of the compared month reads as a loss (invert)
        $('hs-hero-delta').innerHTML = OG.delta({ amt: g.gap, pct: g.pct, word: `vs ${this.windowLabel(this.k)}`, invert: true, trace: { amt: `${id}:gap`, pct: `${id}:pct` } });
      }
      this.drawChart();
      if (WF.status(this.recent, $('hs-latest-state'), 'No transactions yet.')) {
        $('hs-latest-list').innerHTML = WF.rows(this.recent).map((r) => {
          const inflow = fmt.n(r.amt) > 0;
          // a transaction list row (17 Oct, Nhi's reference): merchant over the weekday date; the amount signed, money out in
          // ink as "-₫…", money in green as "+₫…"
          const d = new Date(`${fmt.ymd(r.d)}T00:00:00`);
          const when = `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
          return OG.row({ cls: r.ft === 'friend_payback' ? 'dim' : '', lead: OG.tile({ icon: TX_ICON[r.ft] ?? OG.catIcon(r.en ?? r.cat), color: catCol(r) }),
            title: esc(r.m || r.desc || '—'), meta: esc(when),
            value: `<span class="amt${inflow ? ' pos' : ''}" data-trace="${this.recent.name}:amt">${inflow ? '+' : '-'}${money(Math.abs(fmt.n(r.amt)))}</span>` });
        }).join('');
      }
      this.drawCats();
    },
  };
  WF.register(view);
})();
