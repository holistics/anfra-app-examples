// Cash flow › Credit (was Spending › Credit; 18 Oct, Nhi: the card bills and the cashback leave Recurring for a tab of their own; then "simplify":
// two cards, one scan line per fact, the rest behind a fold). It answers: what do I owe on my cards now, have I been
// paying them in full, and is MAX VIB's cashback paying off.
// Cards (js/pages.js): cr-spend (18 Oct, Nhi: hero = owed on both cards: the TCB Visa statement + the MAX VIB balance,
// data-own card-owed, with each card's spend over the range on its right; then what went on each card by month, side by
// side, 6M / 1Y / ALL; main 8) · cr-cards (per card ONE
// line (tile · name · status pill · amount) and one quiet line under it; "Details" folds open the minimum, due date, this
// month's spend and the statement rows (TCB Visa: each matched to the payments into the card between its close and its due
// date, so Paid in full / Paid part / Due) or the last payments (MAX VIB has no statements in the data); rail 4) ·
// cr-cashback (the current MAX VIB cycle against its cap, a strip of the past cycles, "All cycles" folds open the list; rail 4). The card-bill and cashback queries keep their names from Recurring (og_card_bill, og_vib,
// og6_rc_vib_*).
(() => {
  const { fmt } = WF;
  const { $, esc, money, approx, dayMon } = OG;
  const PF = 'personal_finance', P = 'og6_cr_';
  const SRC = OG.LEDGER_SRC;
  const when = (dd) => (dd < 0 ? `${-dd} day${dd === -1 ? '' : 's'} late` : dd === 0 ? 'today' : dd === 1 ? 'tomorrow' : `in ${dd} days`);
  const span = (a, b) => `${dayMon(a)} – ${dayMon(b)}`;
  const RANGES = ['6M', '1Y', 'ALL'];
  const CARDS = [{ name: 'TCB Visa', tone: '--card-tcb' }, { name: 'MAX VIB', tone: '--card-vib' }];   // dim_sources.label

  const view = {
    id: 'spending/credit', nav: 'spending', tab: 'Credit',
    init(el) {
      const app = WF.app;
      this.range = '1Y';
      this.blocks = {
        'cr-spend': () => OG.card({ id: 'cr-spend', label: 'Card spending', explain: 'og_card_bill:bal', query: `og_card_bill og6_rc_vib_owed ${P}monthly`,
          body: `${OG.heroRow({ id: 'cr-hero', own: 'card-owed', action: '<div class="flow-kpis" id="cr-tot"></div>' })}<div class="key" id="cr-key"></div>
            ${OG.chartBox('cr-chart', 'frame')}${OG.stateLine('cr-chart-state')}
            <div data-anfra-control="${P}period">${OG.ranges('cr-ranges', RANGES, this.range)}</div><p class="cf-foot" id="cr-foot" hidden></p>` }),
        'cr-cards': () => OG.card({ id: 'cr-cards', label: 'Cards', explain: 'og_card_bill:bal', query: `og_card_bill og6_rc_vib_owed og6_rc_vib_paid ${P}spend ${P}stmts ${P}pays ${P}vpays`,
          body: `<div class="cr-cards" id="cr-cards-c" data-disc-scope="cr-cards" data-disc-closed></div>${OG.stateLine('cr-cards-state')}` }),
        'cr-cashback': () => OG.card({ id: 'cr-cashback', label: 'Cashback', explain: 'og_vib:pts', query: `og_vib ${P}cycles`,
          body: `<div id="cr-cb-c" data-disc-scope="cr-cb" data-disc-closed></div>${OG.stateLine('cr-cb-state')}` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      // the card bills (same names and AQL as on Recurring before 18 Oct)
      this.bill = WF.q('og_card_bill', { dataset: PF, metrics: { bal: 'card_statement_balance', mn: 'card_min_payment', due: 'card_payment_due' },
        aql: 'explore { measures { bal: card_statement_balance, mn: card_min_payment, due: card_payment_due } }' });
      this.vib = OG.vibQ();
      // MAX VIB: what the card owes now (its account value in wealth, stored negative) and its last bill payment (an
      // 'othercard' debit from TCB: the pipeline's flow for paying a card at another bank)
      this.vibOwed = WF.q('og6_rc_vib_owed', { dataset: 'wealth', metrics: { v: 'account_value' },
        aql: "explore { measures { v: account_value } filters { dim_accounts.account_id == 'vib_credit' } }" });
      this.vibPaid = WF.q('og6_rc_vib_paid', { dataset: PF, metrics: {},
        aql: "explore { measures { d: fct_ledger | where(fct_ledger.pipeline_flow == 'othercard') | max(fct_ledger.line_date), amt: fct_ledger | where(fct_ledger.pipeline_flow == 'othercard') | max_by(fct_ledger.amount_vnd, fct_ledger.line_date), src: fct_ledger | where(fct_ledger.pipeline_flow == 'othercard') | max_by(fct_ledger.src, fct_ledger.line_date) } }" });
      // what went on each card this month
      this.monthCtl = WF.dateControl(`${P}month`); WF.setPeriod(this.monthCtl, 'this_month');
      this.spend = WF.q(`${P}spend`, { dataset: PF, metrics: { v: 'card_spend' },
        aql: "explore { dimensions { src: dim_sources.label } measures { v: card_spend } filters { dim_sources.instrument == 'credit_card' } }" });
      app.mapControl(this.monthCtl, this.spend, { field: 'dim_dates.date_key' });
      // TCB Visa's statements and every payment into the card; MAX VIB's payments (from TCB debit)
      this.stmts = WF.q(`${P}stmts`, { dataset: PF, pageSize: 6, metrics: {},
        aql: "explore { dimensions { lab: fct_card_statements.statement_label, ps: fct_card_statements.period_start, pe: fct_card_statements.period_end, bal: fct_card_statements.outstanding_balance_vnd, mn: fct_card_statements.min_payment_vnd, due: fct_card_statements.payment_due_date } filters { fct_card_statements.src == 'credit' } sorts { pe desc } }" });
      this.pays = WF.q(`${P}pays`, { dataset: PF, pageSize: 200, metrics: {},
        aql: "explore { dimensions { d: fct_ledger.line_date, amt: fct_ledger.amount_vnd } filters { fct_ledger.flow_type == 'card_payment', dim_sources.label == 'TCB Visa' } sorts { d desc } }" });
      this.vpays = WF.q(`${P}vpays`, { dataset: PF, pageSize: 5, metrics: {},
        aql: "explore { dimensions { d: fct_ledger.line_date, amt: fct_ledger.amount_vnd, src: dim_sources.label } filters { fct_ledger.pipeline_flow == 'othercard' } sorts { d desc } }" });
      // what went on each card, by month (18 Oct, Nhi: the chart under the hero)
      this.period = WF.dateControl(`${P}period`);
      this.monthly = WF.q(`${P}monthly`, { dataset: PF, pageSize: 200, metrics: { v: 'card_spend' },
        aql: "explore { dimensions { src: dim_sources.label, mo: dim_dates.month_start } measures { v: card_spend } filters { dim_sources.instrument == 'credit_card' } sorts { mo asc } }" });
      app.mapControl(this.period, this.monthly, { field: 'dim_dates.date_key' });
      OG.bindKeys($('cr-ranges'), (k) => this.setRange(k));
      WF.setPeriod(this.period, this.range);
      // every MAX VIB cycle
      this.cycles = WF.q(`${P}cycles`, { dataset: PF, pageSize: 40, metrics: { pts: 'points_earned', cap: 'cycle_cap', q: 'reward_qualifying_spend', st: 'reward_status' },
        aql: 'explore { dimensions { k: dim_reward_cycles.cycle_label, cs: dim_reward_cycles.cycle_start, cur: dim_reward_cycles.is_current } measures { pts: points_earned, cap: cycle_cap, q: reward_qualifying_spend, st: reward_status } sorts { cs desc } }' });
      WF.app.execute();
    },

    setRange(k) {
      this.range = k;
      WF.setPeriod(this.period, k);
      OG.setActive($('cr-ranges'), k);
      this.chartSig = null;
      WF.app.execute();
    },
    // ----- card spending by month: one bar per card, side by side; the month in progress hatched
    drawSpend() {
      const el = $('cr-chart');
      if (!WF.status(this.monthly, $('cr-chart-state'), 'No card spending in this window.')) { WF.charts.clear(el); this.chartSig = null; return; }
      if (this.chartSig === this.monthly.result) return;
      this.chartSig = this.monthly.result;
      const rows = WF.rows(this.monthly).map((r) => ({ src: r.src, mo: fmt.ymd(r.mo), v: fmt.n(r.v) ?? 0 }));
      const months = [...new Set(rows.map((r) => r.mo))].sort(), cur = WF.asOf.slice(0, 7);
      const starred = new Set(months.map((m, i) => (m.slice(0, 7) === cur ? i : -1)).filter((i) => i >= 0));
      const label = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', " '");
      const series = CARDS.map((c) => ({ name: c.name, color: WF.charts.css(c.tone), data: months.map((m) => rows.find((r) => r.src === c.name && r.mo === m)?.v ?? 0) }));
      echarts.getInstanceByDom(el)?.clear();
      OG.cardBars(el, months.map((m, i) => `${label(m)}${starred.has(i) ? '*' : ''}`), series, { starred });
      // what went on each card over the range, on the right of the hero like Home's Income · Spending · Net (18 Oct, Nhi)
      $('cr-tot').innerHTML = series.map((x) => `<div><div class="k">${esc(x.name)}</div><div class="v amt" data-trace="${this.monthly.name}:v">${approx(x.data.reduce((a, v) => a + v, 0))}</div></div>`).join('');
      $('cr-key').innerHTML = CARDS.map((c) => `<span class="k"><span class="sw" style="background:var(${c.tone})"></span>${esc(c.name)}</span>`).join('');
      el.title = 'What went on each card, by month';
      const foot = $('cr-foot');
      foot.hidden = !starred.size;
      foot.innerHTML = starred.size ? `* ${esc(new Date(`${WF.asOf}T00:00:00`).toLocaleDateString('en-US', { month: 'long' }))} so far, through ${esc(dayMon(WF.asOf))}.` : '';
    },
    // ----- the cards: per card one scan line (tile · name · status pill · amount) and one quiet line; Details folds open
    // the facts and the history
    statements() {
      const pays = WF.status(this.pays, null) ? WF.rows(this.pays).map((r) => ({ d: fmt.ymd(r.d), amt: fmt.n(r.amt) ?? 0 })) : [];
      return (WF.status(this.stmts, null) ? WF.rows(this.stmts) : []).filter((r) => r.bal != null).map((r) => {
        const pe = fmt.ymd(r.pe), due = fmt.ymd(r.due), bal = fmt.n(r.bal) ?? 0;
        const got = pays.filter((p) => p.d > pe && p.d <= due), sum = got.reduce((a, p) => a + p.amt, 0), last = got.map((p) => p.d).sort().pop();
        const dd = OG.daysBetween(WF.asOf, due);
        const s = sum >= bal - 1 ? { t: `Paid in full · ${dayMon(last)}`, tone: 'ok', full: true }
          : sum > 0 ? { t: `Paid ${approx(sum)}`, tone: 'soon' }
          : dd >= 0 ? { t: `Due ${when(dd)}`, tone: 'soon' } : { t: 'Not paid', tone: 'neg' };
        return { ps: fmt.ymd(r.ps), pe, due, bal, s, closed: dd < 0 };
      });
    },
    drawCards() {
      if (!WF.status(this.bill, null) || !WF.status(this.vibOwed, null)) { WF.status(this.bill, $('cr-cards-state'), 'No card bills.'); return; }
      $('cr-cards-state').hidden = true;
      const kv = (k, v) => OG.line({ title: esc(k), value: v });
      const b = WF.one(this.bill), bid = this.bill.name, days = b.due ? OG.daysBetween(WF.asOf, fmt.ymd(b.due)) : null;
      const owed = Math.abs(fmt.n(WF.one(this.vibOwed).v) ?? 0), oid = this.vibOwed.name;
      const paid = WF.status(this.vibPaid, null) ? WF.one(this.vibPaid) : {}, pid = this.vibPaid.name;
      const sp = new Map(WF.status(this.spend, null) ? WF.rows(this.spend).map((r) => [r.src, fmt.n(r.v) ?? 0]) : []);
      const spent = (src) => kv('Spent this month', `<span class="amt" data-trace="${this.spend.name}:v">${money(sp.get(src) ?? 0)}</span>`);
      const st = this.statements(), closed = st.filter((x) => x.closed), full = closed.filter((x) => x.s.full).length;
      const vp = WF.status(this.vpays, null) ? WF.rows(this.vpays) : [];
      $('cr-hero').innerHTML = `<span data-trace="${bid}:bal">${money((fmt.n(b.bal) ?? 0) + owed)}</span>`;
      $('cr-hero-delta').innerHTML = `<span class="muted">owed on 2 cards</span>${days != null && days >= 0 ? ` <span class="muted">·</span> <span class="dpill ${days <= 3 ? 'warn' : ''}">${approx(b.bal)} due ${esc(when(days))}</span>` : ''}`;
      // one card: the scan line, the quiet line, then its Details fold
      const card = ({ key, name, pill, tone, amt, trace, quiet, details }) => `<div class="cr-card">
          <div class="cr-line">${OG.tile({ icon: 'card' })}<span class="t">${esc(name)}</span>${pill ? `<span class="rc-due ${tone}">${esc(pill)}</span>` : ''}<span class="v amt" data-trace="${trace}">${money(amt)}</span></div>
          <div class="cr-quiet"><span>${quiet}</span>${OG.discBtn({ key, label: 'Details', caret: 'end', size: 'list' })}</div>
          <div class="cr-more" data-under="${key}">${details}</div></div>`;
      const stRow = (x) => `<div class="cr-st">${OG.line({ title: esc(span(x.ps, x.pe)), aside: `<span class="rc-due ${x.s.tone}">${esc(x.s.t)}</span>`, value: `<span class="amt" data-trace="${this.stmts.name}:bal">${money(x.bal)}</span>` })}</div>`;
      $('cr-cards-c').innerHTML = card({ key: 'tcb', name: 'TCB Visa', pill: days == null ? '' : days < 0 ? 'Overdue' : `Due ${when(days)}`, tone: days != null && days <= 3 ? 'soon' : '',
          amt: b.bal, trace: `${bid}:bal`,
          quiet: `${closed.length ? `Paid in full <span class="em">${full} of ${closed.length}</span> statements` : 'Statement balance'} · min <span class="amt" data-trace="${bid}:mn">${approx(b.mn)}</span>`,
          details: `<div class="rc-kv">${kv('Due date', `<span data-trace="${bid}:due">${esc(dayMon(b.due))}</span>`)}${kv('Minimum payment', `<span class="amt" data-trace="${bid}:mn">${money(b.mn)}</span>`)}${spent('TCB Visa')}</div>
            <div class="cr-sub-h">Statements</div>${st.map(stRow).join('')}` })
        + card({ key: 'vib', name: 'MAX VIB', pill: paid.d ? `Paid ${dayMon(paid.d)}` : '', tone: paid.d ? 'ok' : '', amt: owed, trace: `${oid}:v`,
          quiet: paid.d ? `Last paid <span class="amt" data-trace="${pid}:amt">${approx(paid.amt)}</span> from <span data-trace="${pid}:src">${esc(SRC[paid.src] ?? paid.src ?? '—')}</span>` : 'Balance owed',
          details: `<div class="rc-kv">${spent('MAX VIB')}</div>
            <div class="cr-sub-h">Payments <span class="muted">· no statements in the data</span></div>
            ${vp.map((r) => `<div class="cr-st">${OG.line({ title: esc(dayMon(r.d)), aside: `<span class="cr-due">from ${esc(r.src ?? '—')}</span>`, value: `<span class="amt" data-trace="${this.vpays.name}:amt">${money(r.amt)}</span>` })}</div>`).join('') || '<div class="state">No payments yet.</div>'}` });
      OG.applyFold($('cr-cards-c'));
    },

    // ----- cashback: the cycle against its cap, one quiet line, a strip of the past cycles (green when maxed); "All
    // cycles" folds open the list
    drawCashback() {
      if (!WF.status(this.vib, $('cr-cb-state'), 'No cashback cycle.')) return;
      const v = WF.one(this.vib), id = this.vib.name, dl = fmt.n(v.dl) ?? 0, pts = fmt.n(v.pts) ?? 0, cap = fmt.n(v.cap) || 1;
      const st = { behind: 'Behind pace', on_pace: 'On pace', maxed: 'At the cap' }[v.st] ?? String(v.st ?? '');
      const cy = WF.status(this.cycles, null) ? WF.rows(this.cycles).map((r) => ({ ...r, pts: fmt.n(r.pts) ?? 0, cap: fmt.n(r.cap) || 1, cur: r.cur === true || r.cur === 'true' })) : [];
      const past = cy.filter((r) => !r.cur), maxed = past.filter((r) => r.st === 'maxed').length;
      $('cr-cb-c').innerHTML = `<div class="cr-line">${OG.tile({ icon: 'card' })}<span class="t">MAX VIB</span>${st ? `<span class="rc-due ${v.st === 'behind' ? 'soon' : 'ok'}">${esc(st)}</span>` : ''}</div>
        <div class="rc-big cr-cb-big"><span data-trace="${id}:pts">${money(pts)}</span><span class="of"> of ${money(cap)}</span></div>
        ${OG.progress(Math.min(1, pts / cap), { tone: v.st === 'behind' ? 'warn' : '' })}
        <div class="cr-quiet cr-cb-q"><span>${dl} ${dl === 1 ? 'day' : 'days'} left${v.st !== 'maxed' ? ` · <span class="amt" data-trace="${id}:need">${approx(v.need)}</span> a day to max it` : ''}</span></div>
        ${past.length ? `<div class="cr-strip-row"><div class="cr-strip" aria-hidden="true">${[...past].reverse().map((r) => `<span class="${r.st === 'maxed' ? 'max' : ''}" title="${esc(`${r.k}: ${approx(r.pts)}`)}" style="--h:${Math.max(0.15, Math.min(1, r.pts / r.cap))}"></span>`).join('')}</div>
          <span class="cr-strip-k">Maxed <span class="em">${maxed} of ${past.length}</span> past cycles</span></div>
        <div class="cr-quiet">${OG.discBtn({ key: 'cycles', label: 'All cycles', caret: 'end', size: 'list' })}</div>
        <div class="cr-more" data-under="cycles">${cy.map((r) => `<div class="cr-cyc">${OG.line({ title: `${esc(r.k)}${r.cur ? ' <span class="rc-flag">Now</span>' : ''}`,
          value: r.st === 'maxed' ? '<span class="rc-due ok">Maxed</span>' : `<span class="amt" data-trace="${this.cycles.name}:pts">${approx(r.pts)}</span>` })}</div>`).join('')}</div>` : ''}`;
      OG.applyFold($('cr-cb-c'));
    },

    render() {
      this.drawSpend();
      this.drawCards();
      this.drawCashback();
    },
  };
  WF.register(view);
})();
