// Cash flow › In & out (was Spending › Cash flow until the 18 Oct rename): money in against money out, and where it went.
// Cards (js/pages.js): cf-flow (hero = net cash flow over the range + income up / spending down by month, main 8) ·
// cf-sankey (income sources → income → categories + saved, main 8) · cf-sum (the period as a Summary: Income by type with
// its sources, Spending by category group with its categories, then the net, the ratios and what came in that isn't income
// in a grey box; rail 4). The "Money in" card (cf-sources) folded into it on 18 Oct.
// It owns "net cash flow over a range" (data-own net-flow, default 6M). A bar opens that month (or week) in the rail with ‹ back;
// a category in the sankey opens its transactions (OG.openTx). Months after data_complete_through are hatched and footnoted:
// a source that stopped loading makes spending read low there.
(() => {
  const { fmt } = WF;
  const { $, esc, icon, money, approx, pct1, dayMon } = OG;
  const PF = 'personal_finance', P = 'og6_cf_';
  const GRAIN = { '1M': 'week', '3M': 'week', '6M': 'month', YTD: 'month', '1Y': 'month', ALL: 'month' };
  const TOP = 7;   // the sankey names the biggest categories; the rest join as one
  const catCol = (r) => OG.catColor(r.c ?? r.cat ?? r.en, r.color);
  const css = (v) => WF.charts.css(v);
  const addDays = (s, k) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  OG.hc['cf-ratios'] = () => { const v = WF.views.get('spending/cashflow'); return v?.ratios ? `<div class="tp-title">This period</div>${v.ratios}` : ''; };

  const view = {
    id: 'spending/cashflow', nav: 'spending', tab: 'In & out',
    init(el) {
      const app = WF.app;
      this.range = '6M';
      this.blocks = {
        'cf-flow': () => OG.card({ id: 'cf-flow', label: 'Net', explain: `${P}kpi:net`, query: `${P}kpi ${P}flow ${P}complete`,
          body: `${OG.heroRow({ id: 'cf-hero', own: 'net-flow' })}
            <div class="key" id="cf-key"></div>
            ${OG.chartBox('cf-chart', 'frame')}${OG.stateLine('cf-state')}
            <div data-anfra-control="${P}period">${OG.ranges('cf-ranges', OG.RANGES, this.range)}</div><p class="cf-foot" id="cf-foot" hidden></p>` }),
        'cf-sankey': () => OG.card({ id: 'cf-sankey', label: 'Where the money went', explain: `${P}cats:v`, query: `${P}inc ${P}cats ${P}kpi`,
          body: `<div class="chart cf-sankey" id="cf-sk"></div>${OG.stateLine('cf-sk-state')}` }),
        'cf-sum': () => OG.card({ id: 'cf-sum', label: 'This period', explain: `${P}kpi:kept`, query: `${P}kpi ${P}inc ${P}cats ${P}other`,
          actions: `<button class="dots cf-more" type="button" data-hc="cf-ratios" aria-label="Kept and ratios" title="Kept and ratios">${icon('gauge')}</button>`,
          body: `<div id="cf-sum-rows" class="nw-sum cf-sum" data-disc-scope="cf-sum"></div>${OG.stateLine('cf-sum-state')}` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      this.period = WF.dateControl(`${P}period`);
      this.grain = app.createDateDrill(`${P}grain`, { default: 'month' });
      const page = (q) => { app.mapControl(this.period, q, { field: 'dim_dates.date_key' }); OG.mapMe(q); return q; };
      this.kpi = page(WF.q(`${P}kpi`, { dataset: PF, metrics: { inc: 'income', sp: 'spend', net: 'cash_flow_net', kept: 'cash_flow_net_pct', sr: 'savings_rate', sur: 'surplus' },
        aql: 'explore { measures { inc: income, sp: spend, net: cash_flow_net, kept: cash_flow_net_pct, sr: savings_rate, sur: surplus } }' }));
      this.flow = page(WF.q(`${P}flow`, { dataset: PF, pageSize: 200, metrics: { inc: 'income', sp: 'spend', net: 'cash_flow_net' },
        aql: 'explore { dimensions { p: dim_dates.date_key } measures { inc: income, sp: spend, net: cash_flow_net } sorts { p asc } }' }));
      app.mapControl(this.grain, this.flow, { field: 'dim_dates.date_key' });
      this.complete = WF.q(`${P}complete`, { dataset: PF, metrics: { ct: 'data_complete_through' }, aql: 'explore { measures { ct: data_complete_through } }' });
      this.inc = page(WF.q(`${P}inc`, { dataset: PF, metrics: { v: 'income' },
        aql: 'explore { dimensions { s: fct_ledger.merchant_display, t: fct_ledger.flow_type } measures { v: income } having { income > 0 } sorts { v desc } }' }));
      this.other = page(WF.q(`${P}other`, { dataset: PF, metrics: { r: 'reimbursements', f: 'refunds' }, aql: 'explore { measures { r: reimbursements, f: refunds } }' }));
      this.cats = page(WF.q(`${P}cats`, { dataset: PF, metrics: { v: 'spend' },
        aql: 'explore { dimensions { c: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color, g: dim_categories.category_group } measures { v: spend } sorts { v desc } }' }));

      OG.bindKeys($('cf-ranges'), (k) => this.setRange(k));
      this.setRange(this.range);
    },
    setRange(k) {
      this.range = k;
      WF.setPeriod(this.period, k);
      this.grain.setGrain(GRAIN[k]);
      OG.setActive($('cf-ranges'), k);
      this.chartSig = this.skSig = null;
      WF.app.execute();
    },
    // the periods in the window, as drawn: [{ a, b, label }]
    month() { return GRAIN[this.range] === 'month'; },

    drawHero() {
      if (!WF.status(this.kpi, null)) return;
      const k = WF.one(this.kpi), id = this.kpi.name, net = fmt.n(k.net) ?? 0;
      $('cf-hero').innerHTML = `<span class="${net < 0 ? 'neg' : ''}" data-trace="${id}:net">${money(net, true)}</span>`;
      $('cf-hero-delta').innerHTML = fmt.n(k.inc)
        ? `<span class="dpill ${net >= 0 ? 'pos' : 'neg'}"><span data-trace="${id}:kept">${pct1(k.kept)}</span> kept</span> <span class="muted">${esc(OG.RANGE_WORD[this.range])}</span>`
        : `<span class="muted">No income in this window · ${esc(OG.RANGE_WORD[this.range])}</span>`;
    },
    drawFlow() {
      const el = $('cf-chart');
      if (!WF.status(this.flow, $('cf-state'), 'No money moved in this window.')) { WF.charts.clear(el); this.chartSig = null; return; }
      const sig = [this.flow.result, this.complete.result, OG.fresh.result];
      if (this.chartSig && sig.every((r, i) => r === this.chartSig[i])) return;
      this.chartSig = sig;
      const rows = WF.rows(this.flow), month = this.month();
      const ct = WF.status(this.complete, null) ? fmt.ymd(WF.one(this.complete).ct) : null;
      // a period is incomplete when it runs past the day every source is loaded through
      this.periods = rows.map((r, i) => { const a = fmt.ymd(r.p), next = rows[i + 1] ? addDays(fmt.ymd(rows[i + 1].p), -1) : WF.asOf;
        const b = month ? WF.monthSpan(a)[1] : next; return { a: a < WF.firstDay ? WF.firstDay : a, b: b > WF.asOf ? WF.asOf : b }; });
      const starred = new Set(ct ? this.periods.map((p, i) => (p.b > ct ? i : -1)).filter((i) => i >= 0) : []);
      const label = (d) => (month ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', " '") : dayMon(d));
      echarts.getInstanceByDom(el)?.clear();
      OG.flowBars(el, rows.map((r, i) => `${label(fmt.ymd(r.p))}${starred.has(i) ? '*' : ''}`), rows.map((r) => fmt.n(r.inc) ?? 0), rows.map((r) => -(fmt.n(r.sp) ?? 0)), rows.map((r) => fmt.n(r.net) ?? 0),
        { starred, onPick: (i) => this.inspect(i) });
      // the legend only (18 Oct, Nhi: succinct); how to use the chart is its tooltip
      $('cf-key').innerHTML = `<span class="k"><span class="sw" style="background:var(--flow-in)"></span>Income</span><span class="k"><span class="sw" style="background:var(--flow-out)"></span>Spending</span>
        <span class="k"><span class="sw ln" style="background:var(--net-line)"></span>Net</span>`;
      el.title = `By ${month ? 'month' : 'week'}: click a bar to see it`;
      const foot = $('cf-foot');
      foot.hidden = !starred.size;
      foot.innerHTML = starred.size ? `* Some accounts have no lines after <span data-trace="${this.complete.name}:ct">${esc(dayMon(ct))}</span>, so hatched ${month ? 'months' : 'weeks'} may read low.` : '';
    },
    drawSankey() {
      const el = $('cf-sk');
      if (!(WF.status(this.cats, $('cf-sk-state'), 'No spending in this window.') && WF.status(this.inc, null) && WF.status(this.kpi, null))) return;
      const sig = [this.cats.result, this.inc.result, this.kpi.result];
      if (this.skSig && sig.every((r, i) => r === this.skSig[i])) return;
      this.skSig = sig;
      const k = WF.one(this.kpi), inc = fmt.n(k.inc) ?? 0, sp = fmt.n(k.sp) ?? 0;
      const cats = WF.rows(this.cats).filter((r) => (fmt.n(r.v) ?? 0) > 0), top = cats.slice(0, TOP), rest = cats.slice(TOP).reduce((a, r) => a + fmt.n(r.v), 0);
      const HUB = 'Money in', nodes = [], links = [];
      // links wear the colour of where the money goes (income in sky, each category its own), so the eye follows a flow
      const to = (source, target, value, color) => links.push({ source, target, value, lineStyle: { color } });
      for (const r of WF.rows(this.inc)) { const n = String(r.s ?? r.t).replace(/ · .*$/, ''); nodes.push({ name: n, color: css('--flow-in'), depth: 0 }); to(n, HUB, fmt.n(r.v), css('--flow-in')); }
      if (sp > inc) { nodes.push({ name: 'From savings', color: css('--chart-compare'), depth: 0 }); to('From savings', HUB, sp - inc, css('--chart-compare')); }
      nodes.push({ name: HUB, color: css('--ink-2'), depth: 1 });
      for (const r of top) { nodes.push({ name: r.en, color: catCol(r), depth: 2 }); to(HUB, r.en, fmt.n(r.v), catCol(r)); }
      if (rest > 0) { nodes.push({ name: 'Rest', color: css('--chart-rest'), depth: 2 }); to(HUB, 'Rest', rest, css('--chart-rest')); }
      if (inc > sp) { nodes.push({ name: 'Kept', color: css('--pos'), depth: 2 }); to(HUB, 'Kept', inc - sp, css('--pos')); }
      const byEn = new Map(cats.map((r) => [r.en, r.c]));
      echarts.getInstanceByDom(el)?.clear();
      OG.sankey(el, nodes, links, { onPick: (name) => { const c = byEn.get(name); if (c) OG.openTx({ cat: c, date: this.range }); } });
    },
    // ----- the period as a Summary (18 Oct, Nhi: like Net worth's Assets / Liabilities): two sides, Income and Spending,
    // each a header with its total, ONE split bar, then its groups (swatch · name ⌄ · subtotal) with their items under them
    // (income by type, spending by category group; 18 Oct, Nhi: no items under them). The net, the two ratios and what
    // came in that isn't income sit in a hover card (the head's gauge button; it was ƒ until 18 Oct, which is the trace icon).
    drawSum() {
      if (!WF.status(this.kpi, $('cf-sum-state'), 'Nothing in this window.')) return;
      const k = WF.one(this.kpi), id = this.kpi.name, inc = fmt.n(k.inc) ?? 0, sp = fmt.n(k.sp) ?? 0, net = fmt.n(k.net) ?? 0;
      const TYPE = { salary: 'Salary', bonus: 'Bonus', interest: 'Interest' }, TTONE = { salary: '--flow-in', bonus: '--tone-bonus', interest: '--tone-interest' };
      const GTONE = { Essentials: '--grp-essentials', Lifestyle: '--grp-lifestyle', Other: '--grp-other', Untagged: '--grp-untagged' };
      const group = (rows, key, item) => {
        const m = new Map();
        rows.forEach((r) => { const g = key(r), v = fmt.n(r.v) ?? 0; if (v <= 0) return; if (!m.has(g)) m.set(g, { g, v: 0, items: [] }); const x = m.get(g); x.v += v; x.items.push({ t: item(r), v }); });
        return [...m.values()].sort((a, b) => b.v - a.v).map((x) => ({ ...x, items: x.items.sort((a, b) => b.v - a.v) }));
      };
      const incG = group(WF.status(this.inc, null) ? WF.rows(this.inc) : [], (r) => r.t ?? 'other', (r) => String(r.s ?? r.t).replace(/^[^·]*· /, ''))
        .map((x) => ({ ...x, label: TYPE[x.g] ?? String(x.g).replace(/^./, (c) => c.toUpperCase()), tone: TTONE[x.g] ?? '--chart-past' }));
      const spG = group(WF.status(this.cats, null) ? WF.rows(this.cats) : [], (r) => r.g ?? 'Other', (r) => r.en ?? r.c)
        .map((x) => ({ ...x, label: x.g, tone: GTONE[x.g] ?? '--chart-past' }));
      const side = (key, title, total, cls, gs, trace, under) => `<div class="nw-sum-side" data-sum="${key}"><div class="nw-sum-hd"><h3>${title}</h3><span class="num amt${cls}" data-trace="${trace}">${approx(total)}</span></div>
          <div class="nw-split" aria-hidden="true">${gs.map((g) => `<div title="${esc(g.label)}" style="flex:${Math.max(0.02, total ? g.v / total : 0)};background:var(${g.tone})"></div>`).join('')}</div>
          ${gs.map((g) => `<div class="nw-sum-grp">${OG.line({ cls: 'nw-sum-gline', lead: `<span class="nw-sw" style="background:var(${g.tone})"></span>`, title: esc(g.label),
            value: `<span class="amt" data-trace="${under}">${approx(g.v)}</span>` })}</div>`).join('')}</div>`;
      const o = WF.status(this.other, null) ? WF.one(this.other) : {}, r = fmt.n(o.r) ?? 0, f = fmt.n(o.f) ?? 0;
      const kv = (t, v, sub) => `<div class="cf-ratio">${OG.line({ title: t, value: v })}${sub ? `<div class="cf-sub">${sub}</div>` : ''}</div>`;
      const back = [r ? `friends paid back <span class="amt" data-trace="${this.other.name}:r">${approx(r)}</span>` : '', f ? `refunds <span class="amt" data-trace="${this.other.name}:f">${approx(f)}</span>` : ''].filter(Boolean).join(' · ');
      $('cf-sum-rows').innerHTML = side('inc', 'Income', inc, ' pos', incG, `${id}:inc`, `${this.inc.name}:v`)
        + side('sp', 'Spending', sp, '', spG, `${id}:sp`, `${this.cats.name}:v`);
      // the net and the ratios live in a hover card on the head's gauge button (18 Oct, Nhi: hidden until wanted)
      this.ratios = `<div class="cf-ratios">${kv(net < 0 ? 'Overspent' : 'Kept', `<span class="amt ${OG.tone(net)}" data-trace="${id}:net">${approx(net, true)}</span>`, 'Income − spending')}
          ${kv('Kept of income', `<span data-trace="${id}:kept">${pct1(k.kept)}</span>`, 'Net ÷ income')}
          ${kv('Savings rate', `<span data-trace="${id}:sr">${pct1(k.sr)}</span>`, 'After refunds and paybacks, so it reads a little higher')}
          ${back ? kv('Came in, not income', `<span class="amt">${approx(r + f)}</span>`, `${back.replace(/^./, (c) => c.toUpperCase())}: they lower your net spend`) : ''}</div>`;
    },

    // ----- a period in the rail: its totals, the top categories, the biggest purchase, its transactions
    inspect(i) {
      const p = this.periods?.[i];
      if (!p) return;
      if (!this.iq) {
        const app = WF.app, ctl = WF.dateControl(`${P}m_period`);
        const mk = (name, aql, metrics, pageSize) => { const q = WF.q(`${P}${name}`, { dataset: PF, aql, metrics, ...(pageSize ? { pageSize } : {}) }); app.mapControl(ctl, q, { field: 'dim_dates.date_key' }); OG.mapMe(q); return q; };
        this.iq = { ctl,
          kpi: mk('m_kpi', 'explore { measures { inc: income, sp: spend, net: cash_flow_net, kept: cash_flow_net_pct } }', { inc: 'income', sp: 'spend', net: 'cash_flow_net', kept: 'cash_flow_net_pct' }),
          cats: mk('m_cats', 'explore { dimensions { c: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color } measures { v: spend } sorts { v desc } }', { v: 'spend' }, 3),
          big: mk('m_big', 'explore { dimensions { md: fct_ledger.merchant_display, d: fct_ledger.line_date, en: dim_categories.label_en } measures { v: spend } sorts { v desc } }', { v: 'spend' }, 1),
        };
      }
      this.iq.ctl.setCondition({ operator: 'between', values: [p.a, p.b] });
      const label = this.month() ? new Date(`${p.a}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : `Week of ${dayMon(p.a)}`;
      this.insp = { p, label, sig: null };
      const rail = this.el.querySelector('[data-anfra-container="cf-rail"]');
      this.inspEl = OG.drawer({ label, back: 'This period', rail, body: '<div class="sp-insp" id="cf-insp"><div class="state busy">Loading…</div></div>', onClose: () => { this.insp = null; this.inspEl = null; } });
      this.inspEl.querySelector('.dh .back')?.focus({ preventScroll: true });
      WF.app.execute();
      this.drawInsp();
    },
    drawInsp() {
      const d = this.inspEl;
      if (!d?.isConnected || !this.insp) return;
      const { kpi, cats, big } = this.iq;
      if (![kpi, cats, big].every((q) => q.result && q.state !== 'executing')) return;
      const sig = [kpi.result, cats.result, big.result];
      if (this.insp.sig && sig.every((r, i) => r === this.insp.sig[i])) return;
      this.insp.sig = sig;
      const k = WF.one(kpi), b = WF.one(big), net = fmt.n(k.net), { p } = this.insp;
      d.querySelector('#cf-insp').innerHTML = `
        <div><div class="label">Net · ${esc(dayMon(p.a))} – ${esc(dayMon(p.b))}</div><div class="hero ${net < 0 ? 'neg' : ''}" data-trace="${kpi.name}:net">${money(net, true)}</div>
          ${fmt.n(k.inc) ? `<div class="sub"><span data-trace="${kpi.name}:kept">${pct1(k.kept)}</span> of income kept</div>` : '<div class="sub">No income in this period</div>'}</div>
        <div>${OG.line({ title: 'Income', value: `<span class="amt pos" data-trace="${kpi.name}:inc">${approx(k.inc)}</span>` })}${OG.line({ title: 'Spending', value: `<span class="amt" data-trace="${kpi.name}:sp">${approx(k.sp)}</span>` })}</div>
        <div><div class="label">Most of the spending</div>${WF.rows(cats).filter((r) => fmt.n(r.v) > 0).map((r) => OG.line({ lead: OG.tile({ icon: OG.catIcon(r.en), color: catCol(r) }), title: esc(r.en), value: `<span class="amt" data-trace="${cats.name}:v">${approx(r.v)}</span>` })).join('') || '<div class="state">No spending.</div>'}</div>
        ${b.md ? `<div><div class="label">Biggest purchase</div>${OG.line({ title: `${esc(b.md)} <span class="muted">· ${esc(dayMon(b.d))}</span>`, value: `<span class="amt" data-trace="${big.name}:v">${money(b.v)}</span>` })}</div>` : ''}
        <div class="sp-insp-act">${OG.btn({ label: 'Show transactions', icon: 'list', attrs: `data-cf-tx="${esc(p.a)}|${esc(p.b)}"` })}</div>`;
      d.querySelector('[data-cf-tx]').onclick = () => OG.openTx(this.month() ? { month: p.a } : { from: p.a, to: p.b });
    },

    render() {
      OG.setActive($('cf-ranges'), this.range);
      this.drawHero();
      this.drawFlow();
      this.drawSankey();
      this.drawSum();
      this.drawInsp();
    },
  };
  WF.register(view);
})();
