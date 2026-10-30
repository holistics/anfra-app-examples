// Home › Investments: what the invested money is worth and what it earns.
// Cards (js/pages.js): hi-port (hero + history, main 8) · hi-hold (holdings: total value | top movers, main 8) ·
// hi-acc (accounts, rail 4; an account opens in the rail, as on Net worth: OG.acctInspector) · hi-inc (income from investments, rail 4).
// The hero is the INVESTED value (the Investments account group: SSI + gold, cash inside them included), not all assets:
// assets live on Net worth (one number, one home). It equals the Investments group subtotal (og4_networth_grp) by construction (same
// metric, same group filter, same 1-month window) and tests/app/m1.json asserts it.
// Ported from the archived mouka Invest › Overview; holdings, performance and income keep their verbatim AQL.
(() => {
  const { fmt } = WF;
  const { $, esc, icon, money, approx, pct1, dayMon } = OG;
  const WEALTH = 'wealth';
  const P = 'og5_home_inv_';
  const INV = "filters { dim_accounts.account_group == 'Investments' }";
  const LEDGER_SRC = OG.LEDGER_SRC;

  const view = {
    id: 'home/invest', nav: 'home', tab: 'Investments',
    init(el) {
      const app = WF.app;
      this.range = '1M';
      this.mode = 'value';
      this.blocks = {
        'hi-port': () => OG.card({ id: 'hi-port', label: 'Portfolio', explain: `${P}kpi:v`, query: `${P}kpi ${P}curve perf_kpi perf_curve`,
          control: OG.segIcons('hi-mode', [{ key: 'value', icon: 'area', title: 'Invested value, day by day' }, { key: 'compare', icon: 'line', title: 'Return vs the VN-Index' }], this.mode),
          body: `${OG.heroRow({ id: 'hi-hero', own: 'invested' })}
            <div class="key" id="hi-key" hidden></div>
            ${OG.chartBox('hi-chart', 'frame')}${OG.stateLine('hi-state')}
            <div data-anfra-control="og5_inv_period og_perf_period">${OG.ranges('hi-ranges', OG.RANGES, this.range)}</div>` }),
        'hi-hold': () => OG.card({ id: 'hi-hold', label: 'Holdings', go: 'invest/holdings', explain: 'hold_open:v', query: 'hold_open og_spark',
          body: `<div class="pair hi-hold-grid">
              <div class="boxed hi-box"><div class="hi-box-h">Total value</div><div id="hi-tv"></div></div>
              <div class="boxed hi-box"><div class="hi-box-h">Top movers <span class="muted">· last day</span></div><div id="hi-tm"></div></div></div>
            ${OG.stateLine('hi-hold-state')}` }),
        'hi-acc': () => OG.card({ id: 'hi-acc', label: 'Accounts', explain: 'og4_networth_tree:v', query: 'og4_networth_tree og4_networth_grp og2_fresh',
          // the 1M change column can be hidden (18 Oct, Nhi): the same % switch as Transactions' rail card, on by default
          actions: `<button class="dots pct-btn on" type="button" id="hi-acc-pct" aria-pressed="true" aria-label="Show the 1M change" title="Show the 1M change">${OG.icon('percent')}</button>`,
          menu: [{ key: 'add', label: 'Add account', icon: 'plus', disabled: true, title: 'Synthetic demo: accounts come from the governed replica' }],
          body: `<div id="hi-acc-list" class="nw-sum" data-disc-scope="hi-acc"></div>${OG.stateLine('hi-acc-state')}` }),
        'hi-inc': () => OG.card({ id: 'hi-inc', label: 'Investment income', go: 'invest/performance', explain: 'inc_kpi:t', query: 'inc_kpi inc_hist',
          body: `<div class="sub">Interest and dividends, last 12 months</div><div class="hero hi-inc-v" id="hi-inc-v"></div>
            ${OG.chartBox('hi-inc-chart', 'hi-inc-chart')}<div id="hi-inc-k"></div>` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      // the invested value: one account group, its value and change over the period, and its day-by-day curve
      this.kpi = WF.q(`${P}kpi`, { dataset: WEALTH, metrics: { v: 'accounts_value', ch: 'accounts_change' },
        aql: `explore { measures { v: accounts_value, ch: accounts_change, pct: safe_divide(accounts_change, accounts_value - accounts_change) } ${INV} }` });
      this.curve = WF.q(`${P}curve`, { dataset: WEALTH, metrics: { v: 'assets_daily' },
        aql: `explore { dimensions { period: dim_dates.date_key } measures { v: assets_daily } ${INV} sorts { period asc } }` });
      // verbatim from apps/archive/wealthfolio (performance.js, holdings.js, income.js)
      this.perf = WF.q('perf_kpi', { dataset: WEALTH,
        metrics: { vr: 'simple_return', twr: 'twr', vol: 'volatility', dd: 'max_drawdown', gl: 'portfolio_gain_loss', b: 'benchmark_return' },
        aql: 'explore { measures { vr: simple_return, twr: twr, vol: volatility, dd: max_drawdown, gl: portfolio_gain_loss, b: benchmark_return } }' });
      this.perfCurve = WF.q('perf_curve', { dataset: WEALTH, metrics: { p: 'cumulative_twr', b: 'cumulative_benchmark' },
        aql: 'explore { dimensions { d: dim_dates.date_key } measures { p: cumulative_twr, b: cumulative_benchmark } sorts { d asc } }' });
      this.hold = OG.holdQ();
      this.spark = WF.q('og_spark', { dataset: WEALTH, metrics: { p: 'holding_price' },
        aql: 'explore { dimensions { s: dim_assets.symbol, d: dim_dates.date_key } measures { p: holding_price } sorts { s asc, d asc } }' });
      this.inc = WF.q('inc_kpi', { dataset: WEALTH, metrics: { t: 'investment_income', avg: 'income_monthly_avg', d: 'dividend_income', i: 'interest_income' },
        aql: 'explore { measures { t: investment_income, avg: income_monthly_avg, d: dividend_income, i: interest_income, dshare: safe_divide(dividend_income, investment_income), ishare: safe_divide(interest_income, investment_income) } }' });
      this.incHist = WF.q('inc_hist', { dataset: WEALTH, metrics: { i: 'investment_income' },
        aql: 'explore { dimensions { m: dim_dates.date_key | month() } measures { i: investment_income, cum: investment_income | running_total(dim_dates.date_key) } sorts { m asc } }' });
      // the accounts list reads Net worth's account rows (same query as its Summary: same balances, same 1-month change)
      this.acc = OG.treeQ();
      this.grp = OG.groupQ();   // each group's subtotal (the governed group subtotals)

      this.bal = WF.dateControl('og5_inv_period');
      this.flow = WF.dateControl('og_perf_period');
      for (const q of [this.kpi, this.curve]) app.mapControl(this.bal, q, { field: 'dim_dates.date_key' });
      for (const q of [this.perf, this.perfCurve]) app.mapControl(this.flow, q, { field: 'dim_dates.date_key' });
      const yr = WF.dateControl('og_inc_period'), sp = WF.dateControl('og_spark_period');
      for (const q of [this.inc, this.incHist]) app.mapControl(yr, q, { field: 'dim_dates.date_key' });
      app.mapControl(sp, this.spark, { field: 'dim_dates.date_key' });
      WF.setPeriod(yr, '1Y'); WF.setPeriod(sp, '1M');
      OG.mapAccount(this.kpi, this.curve, this.hold, this.acc, this.grp);

      // an account row opens that account in the rail, in the Accounts and income cards' place; ‹ back returns (17 Oct, Nhi: as on Net worth)
      this.insp = OG.acctInspector({ view: this, key: 'hi', q: P, tree: this.acc, period: this.bal, range: () => this.range, back: 'Accounts' });
      this.insp.bind($('hi-acc-list'));
      $('hi-acc-pct').addEventListener('click', (e) => { const on = !e.currentTarget.classList.contains('on');
        e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', String(on)); $('hi-acc-list').classList.toggle('hide-pct', !on); });
      OG.bindKeys($('hi-ranges'), (k) => this.setRange(k));
      OG.bindKeys($('hi-mode'), (k) => { this.mode = k; this.chartSig = null; WF.renderAll(); });
      this.setRange(this.range);
    },
    setRange(k) {
      this.range = k;
      WF.setPeriod(this.bal, k, { change: true });
      WF.setPeriod(this.flow, k);
      OG.setActive($('hi-ranges'), k);
      this.chartSig = null;
      WF.app.execute();
    },
    drawChart() {
      const el = $('hi-chart'), key = $('hi-key');
      OG.setActive($('hi-mode'), this.mode);
      if (this.mode === 'value') {
        key.hidden = true;
        if (!WF.status(this.curve, $('hi-state'), 'No balances in this period.')) { WF.charts.clear(el); this.chartSig = null; return; }
        const sig = ['value', this.curve.result];
        if (this.chartSig && sig.every((r, i) => r === this.chartSig[i])) return;
        this.chartSig = sig;
        echarts.getInstanceByDom(el)?.clear();
        const rows = WF.rows(this.curve);
        OG.area(el, rows.map((r) => fmt.ymd(r.period)), rows.map((r) => Number(r.v)));
        return;
      }
      if (!(WF.status(this.perfCurve, $('hi-state'), 'No returns in this period.') && WF.status(this.perf, null))) { WF.charts.clear(el); this.chartSig = null; return; }
      const sig = ['compare', this.perfCurve.result, this.perf.result];
      if (this.chartSig && sig.every((r, i) => r === this.chartSig[i])) return;
      this.chartSig = sig;
      echarts.getInstanceByDom(el)?.clear();
      const rows = WF.rows(this.perfCurve), k = WF.one(this.perf);
      OG.area(el, rows.map((r) => fmt.ymd(r.d)), rows.map((r) => Number(r.p)), { areaFill: false, scale: true, yFmt: (v) => pct1(v), tipFmt: (v) => pct1(v, true),
        compare: [{ name: 'VN-Index', data: rows.map((r) => Number(r.b)) }] });
      key.hidden = false;
      key.innerHTML = `<span class="k"><span class="sw ln" style="background:var(--chart-line)"></span>Your return <b class="num ${OG.tone(k.twr)}" data-trace="perf_kpi:twr">${pct1(k.twr, true)}</b></span>
        <span class="k"><span class="sw dash"></span>VN-Index <b class="num" data-trace="perf_kpi:b">${pct1(k.b, true)}</b></span>`;
    },
    drawHold() {
      if (!WF.status(this.hold, $('hi-hold-state'), 'No open holdings.')) return;
      const sig = [this.hold.result, this.spark.result];
      if (this.holdSig && sig.every((r, i) => r === this.holdSig[i])) return;
      this.holdSig = sig;
      const id = this.hold.name, rows = WF.rows(this.hold);
      $('hi-tv').innerHTML = rows.slice(0, 4).map((r) => OG.row({ title: esc(r.s), meta: esc(r.n),
        value: `<span class="amt" data-trace="${id}:v">${approx(r.v)}</span>` })).join('');
      const movers = [...rows].filter((r) => fmt.n(r.dc) != null).sort((a, b) => Math.abs(fmt.n(b.dc)) - Math.abs(fmt.n(a.dc))).slice(0, 4);
      $('hi-tm').querySelectorAll('.hi-spark').forEach((s) => echarts.getInstanceByDom(s)?.dispose());
      $('hi-tm').innerHTML = movers.map((r) => OG.row({ cls: 'hi-mover', title: esc(r.s), meta: esc(String(r.sub ?? '').replace(/_/g, ' ')),
        value: `<span class="hi-spark" data-spark="${esc(r.s)}"></span>${OG.badge(pct1(r.dc, true), OG.tone(r.dc) || 'zero')}` })).join('');
      $('hi-tm').querySelectorAll('.badge').forEach((b) => { b.dataset.trace = `${id}:dc`; });
      if (WF.status(this.spark, null)) {
        const by = new Map();
        WF.rows(this.spark).forEach((r) => { if (!by.has(r.s)) by.set(r.s, []); by.get(r.s).push(Number(r.p)); });
        $('hi-tm').querySelectorAll('[data-spark]').forEach((s) => {
          const r = movers.find((x) => x.s === s.dataset.spark);
          OG.spark(s, by.get(s.dataset.spark) ?? [], (fmt.n(r?.dc) ?? 0) >= 0);
        });
      } else this.holdSig = null;
    },
    drawAcc() {
      if (!WF.status(this.acc, $('hi-acc-state'), 'No accounts.')) return;
      const id = this.acc.name, stale = new Map(OG.stale().map((r) => [r.s, r.last]));
      // Investments first, then Cash; liabilities stay on Net worth
      const rows = WF.rows(this.acc).filter((r) => r.g === 'Investments' || r.g === 'Cash');
      const groups = ['Investments', 'Cash'].filter((g) => rows.some((r) => r.g === g));
      const sub = (g) => { const r = WF.status(this.grp, null) ? WF.rows(this.grp).find((x) => x.g === g) : null; return r ? `<span class="amt" data-trace="${this.grp.name}:v">${approx(r.v)}</span>` : ''; };
      // the Net worth Summary's group anatomy (17 Oct, Nhi: one look): swatch · name ⌄ · subtotal, then the accounts under it,
      // each name · 1M change · balance. Freshness shows only when a source is behind (an amber dot after the name).
      $('hi-acc-list').innerHTML = groups.map((g) => `<div class="nw-sum-grp" data-g="${esc(g)}">${OG.line({ cls: 'nw-sum-gline',
          lead: `<span class="nw-sw" style="background:var(${OG.groupTone(g)})"></span>`, title: OG.discBtn({ key: `grp:${g}`, label: esc(g), caret: 'end' }), value: sub(g) })}${rows.filter((r) => r.g === g).map((r) => {
          const src = LEDGER_SRC[r.id], late = src && stale.get(src), p = fmt.n(r.pct);
          return OG.line({ attrs: `data-acct="${esc(r.id)}" data-under="grp:${esc(g)}" role="button" tabindex="0"`, cls: `nw-sum-line no-lead${this.insp.id === r.id ? ' active' : ''}`,
            title: `${esc(r.a)}${late ? `<span class="stale-dot" data-hc="fresh" aria-label="${esc(`${src} through ${dayMon(late)}`)}"></span>` : ''}`,
            aside: p ? `<span class="${OG.tone(r.pct)}" data-trace="${id}:pct">${pct1(r.pct, true)}</span>` : '',
            value: `<span class="amt" data-trace="${id}:v">${approx(r.v)}</span>` });
        }).join('')}</div>`).join('');
      OG.applyFold($('hi-acc-list'));
    },
    render() {
      if (WF.status(this.kpi, null)) {
        const k = WF.one(this.kpi), id = this.kpi.name;
        $('hi-hero').innerHTML = `<span data-trace="${id}:v">${money(k.v)}</span>`;
        $('hi-hero-delta').innerHTML = OG.delta({ amt: k.ch, pct: k.pct, word: OG.RANGE_WORD[this.range], trace: { amt: `${id}:ch`, pct: `${id}:pct` } });
      }
      OG.setActive($('hi-ranges'), this.range);
      this.drawChart();
      this.drawHold();
      this.drawAcc();
      this.insp.draw();
      if (WF.status(this.inc, null)) {
        const k = WF.one(this.inc), id = this.inc.name;
        $('hi-inc-v').innerHTML = `<span data-trace="${id}:t">${money(k.t)}</span>`;
        $('hi-inc-k').innerHTML = OG.kpis([{ k: 'Interest', v: approx(k.i), trace: `${id}:i` }, { k: 'Dividends', v: approx(k.d), trace: `${id}:d` }, { k: 'Per month', v: approx(k.avg), trace: `${id}:avg` }]);
      }
      if (WF.status(this.incHist, null)) {
        const rows = WF.rows(this.incHist);
        OG.area($('hi-inc-chart'), rows.map((r) => fmt.ymd(r.m)), rows.map((r) => Number(r.cum)), { xLabels: false, yFmt: () => '', scale: false });
        WF.charts.chart($('hi-inc-chart')).setOption({ grid: { right: 8, top: 10 }, yAxis: { show: false } });
      }
    },
  };
  WF.register(view);
})();
