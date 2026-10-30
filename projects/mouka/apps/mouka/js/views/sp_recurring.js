// Cash flow › Recurring: what is coming up, and what the bills and subscriptions cost a month.
// Cards (js/pages.js): rc-upc (hero = bills due in the next 30 days, data-own due-30d, + every series by when it's due, as a
// list in the Transactions list's style under This week / Next 30 days / Later (18 Oct) or a 5-week calendar; main 8) · rc-commit (the monthly commitments, last full month, compact with progressive
// disclosure (18 Oct, Nhi): a label over the total, the share of salary, a split bar, then Bills and Subscriptions as
// group lines that start folded; unfolded, one line per bill or subscription with its last 5 months, a price rise
// flagged, a subscription that missed the month called out; rail 4). The card bills and the cashback moved to
// Spending › Credit (js/views/sp_credit.js) on 18 Oct.
// The series come from the fct_recurring model (one row per merchant that charges or pays monthly: next due = the last
// charge's day, a month on); a series opens in the rail with ‹ back.
(() => {
  const { fmt } = WF;
  const { $, esc, icon, money, approx, pct1, dayMon } = OG;
  const PF = 'personal_finance', P = 'og6_rc_';
  const SRC = OG.LEDGER_SRC;
  const css = (v) => WF.charts.css(v);
  const when = (dd) => (dd < 0 ? `${-dd} day${dd === -1 ? '' : 's'} late` : dd === 0 ? 'today' : dd === 1 ? 'tomorrow' : `in ${dd} days`);
  const mon = (d) => new Date(`${fmt.ymd(d)}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
  const COMMIT = "dim_categories.category in ['Hoá đơn', 'Subscription']";   // the commitments: bills + subscriptions

  const view = {
    id: 'spending/recurring', nav: 'spending', tab: 'Recurring',
    init(el) {
      const app = WF.app;
      this.mode = 'list';
      this.blocks = {
        'rc-upc': () => OG.card({ id: 'rc-upc', label: 'Coming up', explain: `${P}due:amt`, query: `${P}due ${P}series`,
          control: OG.segIcons('rc-mode', [{ key: 'list', icon: 'list', title: 'List' }, { key: 'cal', icon: 'cal', title: 'Calendar, 5 weeks' }], this.mode),
          body: `${OG.heroRow({ id: 'rc-hero', own: 'due-30d' })}
            <div id="rc-list" class="rc-list sp-tx-list"></div><div id="rc-cal" class="rc-cal" hidden></div>${OG.stateLine('rc-state')}` }),
        'rc-commit': () => OG.card({ id: 'rc-commit', label: 'Monthly commitments', explain: `${P}kpi:total`, query: `${P}kpi ${P}commit ${P}subs ${P}due`,
          body: `<div class="rc-block rc-commit-top"><div class="label" id="rc-commit-label">Bills &amp; subscriptions, last month</div><div class="rc-big" id="rc-commit-hero" data-own="commit-month"></div><div class="rc-upc-sub" id="rc-commit-hero-delta"></div></div>
            <div id="rc-commit-c" data-disc-scope="rc-commit" data-disc-closed></div>${OG.stateLine('rc-commit-state')}` }),
        'rc-pay': () => OG.card({ id: 'rc-pay', label: 'Payday', explain: `${P}due:inc`, query: `${P}due ${P}series`,
          body: `<div id="rc-pay-c"></div>${OG.stateLine('rc-pay-state')}` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      this.series = WF.q(`${P}series`, { dataset: PF, pageSize: 200, metrics: {},
        aql: `explore { dimensions { k: fct_recurring.kind, m: fct_recurring.merchant_display, src: fct_recurring.src, c: fct_recurring.category,
                                     last: fct_recurring.last_date, nd: fct_recurring.next_due, dd: fct_recurring.days_to_due, amt: fct_recurring.expected_vnd, n: fct_recurring.charges }
                        sorts { nd asc } }` });
      this.due = WF.q(`${P}due`, { dataset: PF, metrics: { amt: 'recurring_due_30d', n: 'recurring_due_30d_count', inc: 'income_expected_30d', pay: 'next_payday' },
        aql: 'explore { measures { amt: recurring_due_30d, n: recurring_due_30d_count, inc: income_expected_30d, pay: next_payday } }' });
      // the last full month: what the commitments and the subscriptions cost
      this.lastCtl = WF.dateControl(`${P}last_month`); WF.setPeriod(this.lastCtl, 'last_month');
      this.kpi = WF.q(`${P}kpi`, { dataset: PF, metrics: { subs: 'subscription_spend', act: 'active_subscriptions' },
        aql: `explore { measures { subs: subscription_spend, act: active_subscriptions,
                                   bills: fct_ledger | where(fct_ledger.category == 'Hoá đơn') | sum(fct_ledger.spend_vnd),
                                   total: subscription_spend + (fct_ledger | where(fct_ledger.category == 'Hoá đơn') | sum(fct_ledger.spend_vnd)) } }` });
      app.mapControl(this.lastCtl, this.kpi, { field: 'dim_dates.date_key' });
      // ...and each merchant behind them (the Summary's rows)
      this.commit = WF.q(`${P}commit`, { dataset: PF, pageSize: 100, metrics: { v: 'spend' },
        aql: `explore { dimensions { m: fct_ledger.merchant_display, c: dim_categories.category } measures { v: spend } filters { ${COMMIT} } having { spend > 0 } sorts { v desc } }` });
      app.mapControl(this.lastCtl, this.commit, { field: 'dim_dates.date_key' });
      // six months of each bill's and subscription's charges (5 full months + this one): the rows' sparklines
      this.sixCtl = WF.dateControl(`${P}six`);
      this.sixCtl.setCondition({ operator: 'between', values: [WF.addMonths(`${WF.asOf.slice(0, 7)}-01`, -5), WF.asOf] });
      this.subs = WF.q(`${P}subs`, { dataset: PF, pageSize: 300, metrics: { v: 'spend' },
        aql: `explore { dimensions { m: fct_ledger.merchant_display, c: dim_categories.category, mo: dim_dates.month_start } measures { v: spend } filters { ${COMMIT} } sorts { m asc, mo asc } }` });
      app.mapControl(this.sixCtl, this.subs, { field: 'dim_dates.date_key' });

      OG.bindKeys($('rc-mode'), (k) => { this.mode = k; WF.renderAll(); });
      const open = (e) => { const r = e.target.closest('[data-series]'); if (!r || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return; if (e.type === 'keydown') e.preventDefault(); this.inspect(r.dataset.series); };
      for (const ev of ['click', 'keydown']) { $('rc-list').addEventListener(ev, open); $('rc-commit-c').addEventListener(ev, open); }
      WF.app.execute();
    },

    rows() { return WF.rows(this.series).map((r) => ({ ...r, dd: fmt.n(r.dd), amt: fmt.n(r.amt), nd: fmt.ymd(r.nd), en: OG.catEn(r.c), color: OG.catColor(r.c) })); },
    staleSrc() { return new Map(OG.stale().map((s) => [s.s, s.last])); },
    // a row in the Transactions list's style (18 Oct, Nhi): name over the account, the category's tag (or Payday), the due
    // date (amber within 3 days or late; "in N days" is its tooltip), the amount.
    row(r, stale) {
      const inc = r.k === 'income', late = stale.get(SRC[r.src] ?? r.src), acct = SRC[r.src] ?? r.src;
      const tag = inc ? OG.txTag('Payday', 'dollar', css('--flow-in')) : OG.txTag(r.en ?? 'Untagged', OG.catIcon(r.en), r.color);
      return OG.row({ cls: `tx-row${r.m === this.inspKey ? ' active' : ''}`,
        title: `<span class="rc-name" title="${esc(r.m)}">${esc(inc ? String(r.m).replace(/ · .*$/, '') : r.m)}</span>${late ? `<span class="stale-dot" data-hc="fresh" aria-label="${esc(`${acct} lines end ${dayMon(late)}; a charge may be missing`)}"></span>` : ''}`,
        meta: esc(acct),
        value: `${tag}<span class="rc-when${r.dd <= 3 ? ' soon' : ''}" title="${esc(when(r.dd))}">${esc(dayMon(r.nd))}</span><span class="amt${inc ? ' pos' : ''}" data-trace="${this.due.name}:${inc ? 'inc' : 'amt'}">${inc ? `+${money(r.amt)}` : money(r.amt)}</span>`,
        attrs: `data-series="${esc(r.m)}" role="button" tabindex="0" aria-label="${esc(`${r.m}, ${dayMon(r.nd)} (${when(r.dd)}), ${money(r.amt)}`)}"` });
    },
    drawUpc() {
      OG.setActive($('rc-mode'), this.mode);
      if (WF.status(this.due, null)) {
        const k = WF.one(this.due), id = this.due.name, n = fmt.n(k.n) ?? 0;
        $('rc-hero').innerHTML = `<span data-trace="${id}:amt">${money(k.amt)}</span>`;
        $('rc-hero-delta').innerHTML = `<span class="muted"><span data-trace="${id}:n">${n}</span> ${n === 1 ? 'bill' : 'bills'} in the next 30 days</span>`
          + (k.pay ? ` <span class="muted">· payday <span data-trace="${id}:pay">${esc(dayMon(k.pay))}</span> brings</span> <span class="dpill pos"><span data-trace="${id}:inc">+${approx(k.inc)}</span></span>` : '');
      }
      if (!WF.status(this.series, $('rc-state'), 'No recurring charges found yet.')) return;
      const rows = this.rows(), stale = this.staleSrc();
      $('rc-list').hidden = this.mode !== 'list'; $('rc-cal').hidden = this.mode !== 'cal';
      if (this.mode === 'cal') {
        $('rc-cal').innerHTML = OG.weekCal(rows.filter((r) => r.k !== 'income').map((r) => ({ due: r.nd, m: r.m, amt: r.amt, color: r.color, en: r.en })), this.due.name, 5);
        return;
      }
      // the Transactions list's rows under When groups (18 Oct, Nhi: This week / Next 30 days / Later, the exact date in its
      // own column; no totals on the group heads); anything late (or whose account stopped loading) first
      const groups = [['Late or not loaded', (r) => r.dd < 0], ['This week', (r) => r.dd >= 0 && r.dd <= 7], ['Next 30 days', (r) => r.dd > 7 && r.dd <= 30], ['Later', (r) => r.dd > 30]];
      $('rc-list').innerHTML = groups.map(([label, pick]) => { const rs = rows.filter(pick);
        return rs.length ? `<div class="sp-day"><div class="lrow-group day-head"><span class="t">${esc(label)}</span></div>${rs.map((r) => this.row(r, stale)).join('')}</div>` : ''; }).join('');
    },
    // ----- monthly commitments: the last full month's total (governed: subscription_spend + the bills), ONE split bar
    // (Bills | Subscriptions), then each group (swatch · name ⌄ · what it holds · subtotal; the chevron folds it) with a row
    // per bill or subscription: its last 5 full months as a sparkline and what it charged that month, so a group's rows add
    // up to its subtotal. A subscription that is still recurring but charged nothing that month sits last, called out
    // (it shows as late in Coming up too); one that stopped is dimmed.
    drawCommit() {
      if (!WF.status(this.kpi, $('rc-commit-state'), 'No bills or subscriptions last month.')) return;
      const sig = [this.kpi.result, this.commit.result, this.due.result, this.subs.result, this.series.result];
      if (this.commitSig && sig.every((r, i) => r === this.commitSig[i])) return;
      this.commitSig = sig;
      const k = WF.one(this.kpi), id = this.kpi.name, bills = fmt.n(k.bills) ?? 0, subs = fmt.n(k.subs) ?? 0, total = bills + subs;
      const salary = WF.status(this.due, null) ? fmt.n(WF.one(this.due).inc) : null;
      const m0 = WF.range('last_month')[0], name = new Date(`${m0}T00:00:00`).toLocaleDateString('en-US', { month: 'long' });
      const charged = new Map((WF.status(this.commit, null) ? WF.rows(this.commit) : []).map((r) => [`${r.c}|${r.m}`, fmt.n(r.v) ?? 0]));
      const series = new Map(WF.status(this.series, null) ? this.rows().map((r) => [r.m, r]) : []);
      // full months only: this month is partial (and a source that stopped loading would read as a cancelled subscription)
      const months = Array.from({ length: 5 }, (_, i) => WF.addMonths(`${WF.asOf.slice(0, 7)}-01`, i - 5));
      const hist = new Map();
      (WF.status(this.subs, null) ? WF.rows(this.subs) : []).forEach((r) => { const key = `${r.c}|${r.m}`; if (!hist.has(key)) hist.set(key, []); hist.get(key).push({ mo: fmt.ymd(r.mo), v: fmt.n(r.v) ?? 0 }); });
      const item = (cat, m) => {
        const rs = hist.get(`${cat}|${m}`) ?? [], vals = months.map((mo) => rs.find((x) => x.mo === mo)?.v ?? 0), paid = rs.filter((x) => x.v > 0 && months.includes(x.mo));
        const v = charged.get(`${cat}|${m}`) ?? 0, last = paid[paid.length - 1], prev = paid[paid.length - 2];
        // a rise worth flagging (subscriptions only; a bill moves every month): 3% or more over the charge before
        // (card FX on a USD price moves it a few hundred đồng every month)
        const rise = cat === 'Subscription' && v && prev && last?.mo === months[4] && v - prev.v >= prev.v * 0.03 ? v - prev.v : 0;
        const active = series.has(m), state = v ? 'paid' : active ? 'missing' : 'stopped';
        return { m, cat, v, vals, rise, state, first: paid[0]?.mo, last, src: series.get(m)?.src };
      };
      const groups = [
        { key: 'Bills', cat: 'Hoá đơn', v: bills, trace: `${id}:bills`, one: 'bill', many: 'bills' },
        { key: 'Subscriptions', cat: 'Subscription', v: subs, trace: `${id}:subs`, one: 'charged', many: 'charged' },
      ].map((g) => {
        const names = new Set([...charged.keys(), ...hist.keys()].filter((x) => x.startsWith(`${g.cat}|`)).map((x) => x.slice(g.cat.length + 1)));
        const order = { paid: 0, missing: 1, stopped: 2 };
        const items = [...names].map((m) => item(g.cat, m)).filter((x) => x.v || x.state === 'missing' || x.last)
          .sort((a, b) => order[a.state] - order[b.state] || b.v - a.v || (b.last?.v ?? 0) - (a.last?.v ?? 0));
        const n = items.filter((x) => x.state === 'paid').length, miss = items.filter((x) => x.state === 'missing').length;
        const holds = miss ? `${miss} missed` : '';   // folded, the group line only says what needs a look
        return { ...g, color: OG.catColor(g.cat), items, holds };
      });
      $('rc-commit-c').querySelectorAll('.rc-spark').forEach((x) => echarts.getInstanceByDom(x)?.dispose());
      // one line per bill or subscription (18 Oct, Nhi: easier to scan): name · account (or what is wrong) · a flag ·
      // the 5-month sparkline · last month's charge, on fixed columns under one column head
      const short = (m) => new Date(`${m}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
      const row = (g, x) => {
        const acct = x.src ? `<span class="rc-acct">${esc(SRC[x.src] ?? x.src)}</span>` : '';
        const flag = x.state === 'missing' ? `<span class="rc-flag miss" title="${esc(x.last ? `Last charged ${money(x.last.v)} in ${mon(x.last.mo)}` : '')}">Missed ${esc(short(m0))}</span>`
          : x.state === 'stopped' ? '<span class="rc-flag">Stopped</span>'
          : x.rise > 0 ? `<span class="badge neg" title="Up from the charge before">${icon('arrow-up', 'xs')}${approx(x.rise)}</span>` : '';
        const say = x.state === 'paid' ? money(x.v) : x.state === 'missing' ? `no charge in ${name}${x.last ? `, last ${money(x.last.v)} in ${mon(x.last.mo)}` : ''}` : 'stopped';
        return OG.line({ cls: `rc-cl rc-sub${x.state === 'paid' ? '' : ' dim'}${x.m === this.inspKey ? ' active' : ''}`,
          title: `<span class="rc-name">${esc(x.m)}</span>${x.state === 'missing' && x.last ? `<span class="rc-acct">last ${approx(x.last.v)} in ${esc(mon(x.last.mo))}</span>` : acct}${flag}`,
          aside: `<span class="rc-spark" data-spark="${esc(`${x.cat}|${x.m}`)}" aria-hidden="true"></span>`,
          value: `<span class="rc-sub-v">${x.v ? `<span class="amt" data-trace="${this.commit.name}:v">${money(x.v)}</span>` : '<span class="muted">—</span>'}</span>`,
          attrs: `data-under="${esc(g.key)}"${series.has(x.m) ? ` data-series="${esc(x.m)}" role="button" tabindex="0" aria-label="${esc(`${x.m}, ${say}`)}"` : ''}` });
      };
      $('rc-commit-label').textContent = `${name}'s bills & subscriptions`;
      $('rc-commit-hero').innerHTML = `<span data-trace="${id}:total">${money(k.total)}</span>`;
      $('rc-commit-hero-delta').innerHTML = salary ? `${pct1(total / salary)} of salary · ${approx(salary)}` : '';
      // bar widths are layout (each group's share of the total); the group lines print the same facts, so the bar is aria-hidden
      $('rc-commit-c').innerHTML = `<div class="nw-split rc-split" aria-hidden="true">${groups.map((g) => `<div title="${esc(g.key)}" style="flex:${Math.max(0.02, total ? g.v / total : 0)};background:${esc(g.color)}"></div>`).join('')}</div>
        <div class="rc-colh" aria-hidden="true"><span></span><span>${esc(short(months[0]))} – ${esc(short(months[4]))}</span><span>${esc(name)}</span></div>
        ${groups.map((g) => `<div class="rc-grp">${OG.line({ cls: 'rc-gline', lead: `<span class="nw-sw" style="background:${esc(g.color)}"></span>`, title: OG.discBtn({ key: g.key, label: esc(g.key), caret: 'end' }),
            aside: g.holds ? `<span class="rc-flag miss">${esc(g.holds)}</span>` : '', value: `<span class="amt" data-trace="${g.trace}">${approx(g.v)}</span>` })}
          ${g.items.map((x) => row(g, x)).join('')}</div>`).join('')}`;
      OG.applyFold($('rc-commit-c'));
      $('rc-commit-c').querySelectorAll('[data-spark]').forEach((el) => {
        const [cat, m] = [el.dataset.spark.split('|')[0], el.dataset.spark.slice(el.dataset.spark.indexOf('|') + 1)];
        const x = groups.find((g) => g.cat === cat).items.find((y) => y.m === m);
        OG.spark(el, x.vals, true);
        WF.charts.chart(el).setOption({ series: [{ lineStyle: { color: x.rise > 0 ? css('--neg') : css('--chart-compare') } }] });
      });
    },
    // ----- a series in the rail: its last six months against their average, next due, its transactions
    inspect(m) {
      const r = this.rows().find((x) => x.m === m) ?? { m, k: 'bill' };
      if (!this.iq) {
        const app = WF.app, mer = WF.fieldControl(`${P}i_merchant`, PF, 'fct_ledger.merchant_display');
        const q = WF.q(`${P}i_hist`, { dataset: PF, metrics: { v: 'spend', inc: 'income' }, aql: 'explore { dimensions { mo: dim_dates.month_start } measures { v: spend, inc: income } sorts { mo asc } }' });
        app.mapControl(mer, q, { field: 'fct_ledger.merchant_display' }); app.mapControl(this.sixCtl, q, { field: 'dim_dates.date_key' });
        this.iq = { mer, hist: q };
      }
      this.iq.mer.setCondition({ operator: 'is', values: [m] });
      this.inspKey = m; this.insp = { r, sig: null };
      const rail = this.el.querySelector('[data-anfra-container="rc-rail"]');
      this.inspEl = OG.drawer({ label: m, back: 'Recurring', rail, body: '<div class="sp-insp" id="rc-insp"><div class="state busy">Loading…</div></div>',
        onClose: () => { this.inspKey = null; this.insp = null; this.inspEl = null; this.el.querySelectorAll('[data-series].active').forEach((x) => x.classList.remove('active')); } });
      this.inspEl.querySelector('.dh .back')?.focus({ preventScroll: true });
      this.el.querySelectorAll('[data-series]').forEach((x) => x.classList.toggle('active', x.dataset.series === m));
      WF.app.execute();
      this.drawInsp();
    },
    drawInsp() {
      const d = this.inspEl;
      if (!d?.isConnected || !this.insp) return;
      const h = this.iq.hist;
      if (!(h.result && h.state !== 'executing')) return;
      if (this.insp.sig === h.result) return;
      this.insp.sig = h.result;
      const { r } = this.insp, inc = r.k === 'income', key = inc ? 'inc' : 'v';
      const months = Array.from({ length: 6 }, (_, i) => WF.addMonths(`${WF.asOf.slice(0, 7)}-01`, i - 5));
      const by = new Map(WF.rows(h).map((x) => [fmt.ymd(x.mo), fmt.n(x[key]) ?? 0]));
      const vals = months.map((mo) => by.get(mo) ?? 0), paid = vals.filter((v) => v > 0), avg = paid.length ? paid.reduce((a, v) => a + v, 0) / paid.length : 0;
      d.querySelector('#rc-insp').innerHTML = `
        <div><div class="label">${inc ? 'Expected' : 'Next charge'}${r.nd ? ` · ${esc(dayMon(r.nd))}, ${esc(when(r.dd))}` : ''}</div>
          <div class="hero${inc ? ' pos' : ''}">${inc ? '+' : ''}${money(r.amt)}</div>
          <div class="sub">every month · the last ${inc ? 'payment' : 'charge'} was ${r.last ? esc(dayMon(r.last)) : '—'}</div></div>
        <div><div class="label">Last 6 months <span class="muted">· avg ${approx(avg)} a month</span></div><div class="chart sp-insp-chart" id="rc-insp-chart"></div></div>
        <dl class="sp-facts">
          <div><dt>Account</dt><dd>${esc(SRC[r.src] ?? r.src ?? '—')}</dd></div>
          <div><dt>Category</dt><dd>${esc(inc ? 'Income' : r.en ?? '—')}</dd></div>
          <div><dt>Last 3 months</dt><dd>${fmt.n(r.n) ?? '—'} ${inc ? 'payments' : 'charges'}</dd></div>
        </dl>
        <div class="sp-insp-act">${OG.btn({ label: 'Show transactions', icon: 'list', attrs: 'data-rc-tx' })}</div>`;
      OG.miniBars(d.querySelector('#rc-insp-chart'), months.map((mo) => OG.monthName(mo, false)), vals, avg || null);
      if (inc) WF.charts.chart(d.querySelector('#rc-insp-chart')).setOption({ series: [{ itemStyle: { color: css('--flow-in') } }] });
      d.querySelector('[data-rc-tx]').onclick = () => OG.openTx({ merchant: r.m, date: '6M' });
    },

    // ----- payday (18 Oct, Nhi: cute and compact): when the salary lands and how much, and a 30-day track from the last
    // payday to the next with today on it
    drawPay() {
      if (!WF.status(this.due, $('rc-pay-state'), 'No payday found.')) return;
      const k = WF.one(this.due), id = this.due.name;
      if (!k.pay) { $('rc-pay-c').innerHTML = '<div class="state">No payday in the next 30 days.</div>'; return; }
      const next = fmt.ymd(k.pay), sal = WF.status(this.series, null) ? this.rows().find((r) => r.k === 'income') : null;
      const last = sal?.last ? fmt.ymd(sal.last) : WF.addMonths(next, -1), dd = OG.daysBetween(WF.asOf, next);
      const span = Math.max(1, OG.daysBetween(last, next)), at = Math.min(1, Math.max(0, OG.daysBetween(last, WF.asOf) / span));
      const who = sal ? String(sal.m).replace(/^[^·]*· /, '') : '', gone = Math.max(0, Math.min(span, span - dd));
      $('rc-pay-c').innerHTML = `<div class="rc-pay" title="${esc(who ? `Salary from ${who}` : 'Salary')}">
          ${OG.tile({ icon: 'dollar', color: css('--flow-in') })}
          <div class="rc-pay-t"><div class="t">${dd === 0 ? 'Payday is today' : dd === 1 ? 'Payday tomorrow' : `Payday in <span data-trace="${id}:pay">${dd}</span> days`}</div>
            <div class="s">${esc(new Date(`${next}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))}${who ? ` · ${esc(who)}` : ''}</div></div>
          <span class="dpill pos"><span data-trace="${id}:inc">+${approx(k.inc)}</span></span></div>
        <div class="rc-track" role="progressbar" aria-label="Days since the last payday" aria-valuemin="0" aria-valuemax="${span}" aria-valuenow="${gone}"><div class="fill" style="width:${at * 100}%"></div></div>
        <div class="rc-track-k" aria-hidden="true"><span>${esc(dayMon(last))}</span><span>${gone} of ${span} days</span><span>${esc(dayMon(next))}</span></div>`;
    },

    render() {
      this.drawPay();
      this.drawUpc();
      this.drawCommit();
      this.drawInsp();
    },
  };
  WF.register(view);
})();
