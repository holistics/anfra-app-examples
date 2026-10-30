// Home › Net worth: owns net worth, assets / liabilities and the accounts behind them.
// Cards (js/pages.js): hn-main (hero + history, main 8) · hn-pace (monthly pace + the drivers of change, all time, main 8) · hn-sum (Summary, rail 4: per side a split bar by group, each
// group's accounts listed under it and folded by the chevron after the group's name, Totals | Percent as icons; an account
// row opens the account inspector (OG.acctInspector, js/shared.js) in the rail, in the Summary's place, ‹ back returns). The Balance sheet card was removed on 16 Oct (Nhi).
// Ported from the archived mouka-v2 Net worth page onto the card anatomy (DESIGN.md § Card): one control per card head,
// utility actions (Download CSV, Filter accounts) in ⋮, the shared range set, the key line only when a second series shows.
// nw_kpi and nw_curve keep apps/archive/wealthfolio's AQL verbatim; everything else is og4_networth_* (same AQL as v2).
(() => {
  const { fmt } = WF;
  const { $, esc, icon, money, approx, pct1, dayMon } = OG;
  const WEALTH = 'wealth';
  const RANGES = OG.RANGES;
  const GRAIN = { '1M': 'week', '3M': 'week', '6M': 'month', YTD: 'month', '1Y': 'month', ALL: 'month' };
  // Account groups are told apart by ONE tone map (Investments, Cash, Liabilities), shared with the Investments tab.
  const tone = OG.groupTone;
  const LEDGER_SRC = OG.LEDGER_SRC;
  const css = (v) => WF.charts.css(v);
  const P = 'og4_networth_';
  const isL = (v) => v === true || v === 'true';
  const unsigned = (v) => Math.abs(fmt.n(v) ?? 0);   // liabilities are stored negative; shown as what is owed

  // O7 the identity the net worth hero rests on (liab is the AQL alias net_worth - assets_value, ≤ 0: shown unsigned).
  OG.hc['h-nw-eq'] = () => {
    const q = WF.registry.get('nw_kpi')?.query;
    if (!q || !WF.status(q, null)) return '';
    const k = WF.one(q), id = q.name;
    return `<div class="tp-title">Net worth</div><div class="hc-lead">What you own minus what you owe.</div>
      <div class="eq"><span class="nw">Assets <b class="num" data-trace="${id}:assets">${money(k.assets)}</b></span> <span class="op">−</span>
        <span class="nw">Liabilities <b class="num" data-trace="${id}:liab">${money(unsigned(k.liab))}</b></span> <span class="op">=</span>
        <span class="nw">Net worth <b class="num" data-trace="${id}:nw">${money(k.nw)}</b></span></div>`;
  };

  const view = {
    id: 'home/networth', nav: 'home', tab: 'Net worth',
    init(el) {
      const app = WF.app;
      this.range = '1M';
      this.mode = 'line';
      this.sumMode = 'totals';   // the Summary's switch: totals | percent
      this.blocks = {
        'hn-main': () => OG.card({ id: 'hn-main', label: 'Net worth', explain: 'nw_kpi:nw', query: `nw_kpi nw_curve ${P}bars ${P}line`,
          control: OG.segIcons('hn-mode', [{ key: 'line', icon: 'area', title: 'Net worth, day by day' }, { key: 'bars', icon: 'bars', title: 'Assets and liabilities by period' }], this.mode),
          menu: [{ key: 'accounts', label: 'Filter accounts…', icon: 'filter' }],
          body: `${OG.heroRow({ id: 'hn-hero', own: 'net-worth' })}
            <div class="key" id="hn-key" hidden></div>
            ${OG.chartBox('hn-chart', 'frame')}${OG.stateLine('hn-chart-state')}
            <div data-anfra-control="og_nw_period">${OG.ranges('hn-ranges', RANGES, this.range)}</div>` }),
        'hn-pace': () => OG.card({ id: 'hn-pace', label: 'Monthly pace', explain: `${P}pace:pace`, query: `${P}pace`,
          body: `<div class="pace"><div class="pace-lead"><div class="hero" id="hn-pace-v"></div><div class="sub" id="hn-pace-sub"></div></div>
            <div class="pace-drivers"><div class="label">Drivers of change</div><div id="hn-pace-rows"></div></div></div>${OG.stateLine('hn-pace-state')}` }),
        'hn-sum': () => OG.card({ id: 'hn-sum', label: 'Summary', explain: `${P}side:v`, query: `${P}tree ${P}grp ${P}side og2_fresh`,
          control: OG.segIcons('hn-sum-mode', [{ key: 'totals', icon: 'dong', title: 'Totals' }, { key: 'percent', icon: 'percent', title: 'Percent of each side' }], this.sumMode),
          menu: [{ key: 'csv', label: 'Download CSV', icon: 'download' }],
          body: `<div id="hn-sum-list" class="nw-sum" data-disc-scope="hn-sum"></div>${OG.stateLine('hn-sum-state')}` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      // verbatim from apps/archive/wealthfolio/js/views/networth.js (parity)
      this.nw = WF.q('nw_kpi', { dataset: WEALTH,
        metrics: { nw: 'net_worth', ch: 'net_worth_change', pct: 'net_worth_change_pct', pace: 'net_worth_monthly_pace',
                   gains: 'investment_gains', saved: 'saved_from_income', debt: 'debt_change', assets: 'assets_value' },
        aql: `explore { measures { nw: net_worth, ch: net_worth_change, pct: net_worth_change_pct, pace: net_worth_monthly_pace,
                                   gains: investment_gains, saved: saved_from_income, debt: debt_change,
                                   assets: assets_value, liab: net_worth - assets_value } }` });
      this.curve = WF.q('nw_curve', { dataset: WEALTH, metrics: { nw: 'net_worth_daily' },
        aql: 'explore { dimensions { period: dim_dates.date_key } measures { nw: net_worth_daily } sorts { period asc } }' });
      // bars: each group's end-of-period value (liabilities hang below zero) + net worth at the same period ends
      this.bars = WF.q(`${P}bars`, { dataset: WEALTH, pageSize: 500, metrics: { v: 'accounts_value' },
        aql: `explore { dimensions { period: dim_dates.date_key, g: dim_accounts.account_group, o: dim_accounts.group_order }
                        measures { v: accounts_value } sorts { period asc, o asc } }` });
      this.line = WF.q(`${P}line`, { dataset: WEALTH, pageSize: 500, metrics: { nw: 'net_worth' },
        aql: 'explore { dimensions { period: dim_dates.date_key } measures { nw: net_worth } sorts { period asc } }' });
      // the Summary: accounts and group subtotals (each with its share of its side), side totals
      this.tree = OG.treeQ();
      this.grp = OG.groupQ();
      this.side = WF.q(`${P}side`, { dataset: WEALTH, metrics: { v: 'accounts_value', ch: 'accounts_change' },
        aql: 'explore { dimensions { liab: dim_accounts.is_liability } measures { v: accounts_value, ch: accounts_change } sorts { liab asc } }' });

      // Monthly pace, all time: the pace and the three governed parts of the change (gains + contributions + debt = change)
      this.pace = WF.q(`${P}pace`, { dataset: WEALTH,
        metrics: { pace: 'net_worth_monthly_pace', ch: 'net_worth_change', gains: 'investment_gains', saved: 'saved_from_income', debt: 'debt_change' },
        aql: 'explore { measures { pace: net_worth_monthly_pace, ch: net_worth_change, gains: investment_gains, saved: saved_from_income, debt: debt_change } }' });
      this.pacePeriod = WF.dateControl(`${P}pace_period`);
      app.mapControl(this.pacePeriod, this.pace, { field: 'dim_dates.date_key' });
      WF.setPeriod(this.pacePeriod, 'ALL');

      this.period = WF.dateControl('og_nw_period');
      for (const q of [this.nw, this.curve]) app.mapControl(this.period, q, { field: 'dim_dates.date_key' });
      this.barPeriod = WF.dateControl(`${P}bar_period`);
      this.grain = app.createDateDrill(`${P}grain`, { default: 'month' });
      for (const q of [this.bars, this.line]) { app.mapControl(this.barPeriod, q, { field: 'dim_dates.date_key' }); app.mapControl(this.grain, q, { field: 'dim_dates.date_key' }); }
      app.mapControl(OG.m1Ctl, this.side, { field: 'dim_dates.date_key' });
      // the account filter narrows the whole tab, so the hero, the chart and the summary agree
      OG.mapAccount(this.nw, this.curve, this.bars, this.line, this.tree, this.grp, this.side, this.pace);

      OG.bindKeys($('hn-ranges'), (k) => this.setRange(k));
      OG.bindKeys($('hn-mode'), (k) => { this.mode = k; this.chartSig = null; WF.renderAll(); });
      OG.bindKeys($('hn-main-menu'), (k) => { if (k === 'accounts') OG.accountPopover($('hn-main-menu').closest('.menu-wrap')); });
      el.addEventListener('click', (e) => { if (e.target.closest('[data-clear-accounts]')) OG.setAccounts([]); });
      OG.bindKeys($('hn-sum-menu'), (k) => { if (k === 'csv') this.csv(); });
      OG.bindKeys($('hn-sum-mode'), (k) => { this.sumMode = k; this.sumSig = null; WF.renderAll(); });
      // Summary: a group's rows and its bar segment light up together; an account row opens the account inspector
      const sum = $('hn-sum-list');
      const lit = (g) => sum.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('on', g != null && x.dataset.g === g));
      sum.addEventListener('mouseover', (e) => lit(e.target.closest?.('[data-g]')?.dataset.g ?? null));
      sum.addEventListener('mouseleave', () => lit(null));
      sum.addEventListener('focusin', (e) => lit(e.target.closest?.('[data-g]')?.dataset.g ?? null));
      sum.addEventListener('focusout', () => lit(null));
      this.insp = OG.acctInspector({ view: this, key: 'hn', q: P, tree: this.tree, period: this.period, range: () => this.range, back: 'Summary' });
      this.insp.bind(sum);
      this.setRange(this.range);
    },
    setRange(k) {
      this.range = k;
      WF.setPeriod(this.period, k, { change: true });
      WF.setPeriod(this.barPeriod, k);
      this.grain.setGrain(GRAIN[k]);
      OG.setActive($('hn-ranges'), k);
      WF.app.execute();
    },

    // ----- Summary (rail): per side a header (name · total), ONE split bar by group (the group's tone, widths = the governed
    // share), then each group (swatch · name ⌄ · subtotal; the chevron folds its accounts) with its accounts under it, no colour of their own. Totals | Percent
    // switches every number to its share of the side (the identity lives in the hero's hover card).
    drawSum() {
      if (!(WF.status(this.tree, $('hn-sum-state'), 'No accounts.') && WF.status(this.grp, null) && WF.status(this.side, null))) return;
      const sig = [this.tree.result, this.grp.result, this.side.result, OG.fresh.result, this.sumMode];
      if (this.sumSig && sig.every((r, i) => r === this.sumSig[i])) return;
      this.sumSig = sig;
      OG.setActive($('hn-sum-mode'), this.sumMode);
      const T = this.tree.name, G = this.grp.name, S = this.side.name, pctMode = this.sumMode === 'percent';
      const accts = WF.rows(this.tree), stale = new Map(OG.stale().map((r) => [r.s, r.last]));
      // liabilities are stored negative and shown as what is owed (the identity subtracts them)
      const num = (q, r) => (pctMode ? `<span data-trace="${q}:share">${pct1(r.share)}</span>` : `<span class="amt" data-trace="${q}:v">${approx(unsigned(r.v))}</span>`);
      const part = (L) => {
        const s = WF.rows(this.side).find((x) => isL(x.liab) === L), gs = WF.rows(this.grp).filter((g) => isL(g.liab) === L);
        if (!s) return '';
        const k = L ? 'liab' : 'assets';
        // bar widths are layout (each group's governed share); the rows below print the same facts, so the bar is aria-hidden
        return `<div class="nw-sum-side" data-sum="${k}"><div class="nw-sum-hd"><h3>${L ? 'Liabilities' : 'Assets'}</h3>
            <span class="num amt" data-trace="${S}:v">${approx(unsigned(s.v))}</span></div>
          <div class="nw-split" aria-hidden="true">${gs.map((g) => `<div data-g="${esc(g.g)}" title="${esc(g.g)}" style="flex:${Math.max(0.02, Number(g.share) || 0)};background:var(${tone(g.g)})"></div>`).join('')}</div>
          ${gs.map((g) => `<div class="nw-sum-grp" data-g="${esc(g.g)}">${OG.line({ cls: 'nw-sum-gline', lead: `<span class="nw-sw" style="background:var(${tone(g.g)})"></span>`, title: OG.discBtn({ key: g.g, label: esc(g.g), caret: 'end' }), value: num(G, g) })}
            ${accts.filter((a) => a.g === g.g && isL(a.liab) === L).sort((x, y) => unsigned(y.v) - unsigned(x.v)).map((a) => {
              const src = LEDGER_SRC[a.id], late = src && stale.get(src);
              return OG.line({ cls: `nw-sum-line no-lead${Number(a.v) ? '' : ' dim'}${this.insp.id === a.id ? ' active' : ''}`,
                attrs: `data-acct="${esc(a.id)}" data-under="${esc(g.g)}" role="button" tabindex="0"`,
                title: `${esc(a.a)}${late ? `<span class="stale-dot" data-hc="fresh" aria-label="${esc(`${src} through ${dayMon(late)}`)}"></span>` : ''}`,
                value: num(T, a) });
            }).join('')}</div>`).join('')}</div>`;
      };
      $('hn-sum-list').innerHTML = `${part(false)}${part(true)}`;
      OG.applyFold($('hn-sum-list'));
    },
    // ----- Monthly pace: the hero is the pace; the drivers are bars scaled to the largest part, in their group's tone
    drawPace() {
      if (!WF.status(this.pace, $('hn-pace-state'), 'No balances yet.')) return;
      const k = WF.one(this.pace), id = this.pace.name;
      if (this.paceSig === this.pace.result) return;
      this.paceSig = this.pace.result;
      const since = new Date(`${WF.firstDay}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      $('hn-pace-v').innerHTML = `<span class="${OG.tone(k.pace)}" data-trace="${id}:pace">${approx(k.pace, true)}</span><span class="of"> /mo</span>`;
      $('hn-pace-sub').innerHTML = `<span class="num ${OG.tone(k.ch)}" data-trace="${id}:ch">${approx(k.ch, true)}</span> since ${esc(since)}`;
      const parts = [['gains', 'Investment gains', 'Investments'], ['saved', 'Contributions', 'Cash'], ['debt', 'New debt', 'Liabilities']];
      const max = Math.max(...parts.map(([a]) => Math.abs(fmt.n(k[a]) ?? 0)), 1);
      $('hn-pace-rows').innerHTML = parts.map(([a, name, g]) => { const v = fmt.n(k[a]) ?? 0;
        return `<div class="pace-row"><span class="t">${name}</span><span class="v ${OG.tone(v)}" data-trace="${id}:${a}">${approx(v, true)}</span>
          <div class="pace-bar" aria-hidden="true"><div style="width:${(Math.abs(v) / max) * 100}%;background:var(${tone(g)})"></div></div></div>`; }).join('');
    },
    csv() {
      if (this.tree.state !== 'success') return;
      const rows = [['Account', 'Group', `Balance ${WF.asOf}`, '1-month change'], ...WF.rows(this.tree).map((r) => [r.a, r.g, r.v, r.ch])];
      const text = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: `Net worth ${WF.asOf}.csv` });
      document.body.append(a); a.click(); a.remove();
    },

    // ----- chart: the daily net worth area (line), or stacked group bars + the net worth line (bars)
    drawChart() {
      const el = $('hn-chart'), key = $('hn-key');
      OG.setActive($('hn-mode'), this.mode);
      if (this.mode === 'line') {
        key.hidden = true;   // one series: the card label names it
        const sig = ['line', this.curve.result];
        if (!WF.status(this.curve, $('hn-chart-state'), 'No balances in this period.')) { WF.charts.clear(el); this.chartSig = null; return; }
        if (this.chartSig && sig.every((r, i) => r === this.chartSig[i])) return;
        this.chartSig = sig;
        echarts.getInstanceByDom(el)?.clear();
        const rows = WF.rows(this.curve);
        OG.area(el, rows.map((r) => fmt.ymd(r.period)), rows.map((r) => Number(r.nw)));
        return;
      }
      if (!(WF.status(this.bars, $('hn-chart-state'), 'No balances in this period.') && WF.status(this.line, null))) { if (this.bars.state === 'error') WF.charts.clear(el); return; }
      const sig = ['bars', this.bars.result, this.line.result];
      if (this.chartSig && sig.every((r, i) => r === this.chartSig[i])) return;
      this.chartSig = sig;
      const rows = WF.rows(this.bars), lines = WF.rows(this.line);
      const periods = lines.map((r) => fmt.ymd(r.period));
      const groups = [...new Set(rows.map((r) => r.g))];
      const month = GRAIN[this.range] === 'month';
      const label = (d) => (month ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', " '") : dayMon(d));
      echarts.getInstanceByDom(el)?.clear();
      WF.charts.chart(el).setOption({
        animation: false, textStyle: { fontFamily: DS.font('sans') },
        grid: { left: 0, right: 64, top: 16, bottom: 28 },
        tooltip: OG.tip((v) => money(v)),
        xAxis: { type: 'category', data: periods, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...OG.axisMono(), hideOverlap: true, formatter: label } },
        yAxis: { type: 'value', position: 'right', splitNumber: 4, axisLabel: { ...OG.axisMono(), formatter: (v) => OG.short(v), margin: 14 },
          splitLine: { lineStyle: { color: css('--chart-grid'), type: [3, 4] } } },
        series: [
          ...groups.map((g) => ({ type: 'bar', name: g, stack: 'nw', barMaxWidth: 28, itemStyle: { color: css(tone(g)) },
            data: periods.map((p) => { const r = rows.find((x) => fmt.ymd(x.period) === p && x.g === g); return r ? Number(r.v) : null; }) })),
          { type: 'line', name: 'Net worth', data: lines.map((r) => Number(r.nw)), symbol: 'circle', symbolSize: 6, z: 5,
            lineStyle: { width: 2, color: css('--ink') }, itemStyle: { color: css('--ink'), borderColor: css('--surface'), borderWidth: 1.5 } },
        ],
      }, { replaceMerge: ['series'] });
      key.hidden = false;
      key.innerHTML = groups.map((g) => `<span class="k"><span class="sw" style="background:var(${tone(g)})"></span>${esc(g)}</span>`).join('')
        + `<span class="k"><span class="sw ln" style="background:var(--ink)"></span>Net worth</span><span class="k muted">by ${GRAIN[this.range]} end</span>`;
    },

    render() {
      if (WF.status(this.nw, null)) {
        const k = WF.one(this.nw), id = this.nw.name;
        $('hn-hero').innerHTML = `<span data-trace="${id}:nw" data-hc="h-nw-eq">${money(k.nw)}</span>`;
        $('hn-hero-delta').innerHTML = OG.delta({ amt: k.ch, pct: k.pct, word: OG.RANGE_WORD[this.range], trace: { amt: `${id}:ch`, pct: `${id}:pct` } });
      }
      OG.setActive($('hn-ranges'), this.range);
      // the account filter (⋮ › Filter accounts…) narrows the whole tab: say so, with a way out
      const n = OG.state.accounts.length, all = OG.accounts.state === 'success' ? WF.rows(OG.accounts).length : 0;
      $('hn-main-info').innerHTML = n ? `<button type="button" class="filter-chip" data-clear-accounts title="Show every account" aria-label="Account filter: ${n} of ${all} accounts. Clear">${n} of ${all} accounts ${icon('x', 'xs')}</button>` : '';
      this.drawChart();
      this.drawPace();
      this.drawSum();
      this.insp.draw();
    },
  };
  WF.register(view);
})();
