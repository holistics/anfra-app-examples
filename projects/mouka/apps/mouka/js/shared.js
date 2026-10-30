// Shared queries, controls and vocabulary several tabs use. Loaded after js/origin.js, before js/views/*.
// Query names and AQL are unchanged from the archived looks (WF.q dedupes by name: one name = one AQL, app-wide).
(() => {
  const { fmt } = WF;
  const { dayMon } = OG;
  const PF = 'personal_finance', WEALTH = 'wealth';
  const esc = OG.esc;

  // ----- the shared vocabulary (DESIGN.md): ONE range set for every chart, one word per range, one tone per account group
  OG.RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];
  OG.RANGE_WORD = { '1M': 'past month', '3M': 'past 3 months', '6M': 'past 6 months', YTD: 'this year', '1Y': 'past year', ALL: 'all time' };
  // the tones are tokens (ds/tokens.css: --tone-* default to --chart / --chart-soft / --neg), so a theme can re-map them
  const GROUP_TONE = { Investments: '--tone-invest', Cash: '--tone-cash', Liabilities: '--tone-liab' };
  OG.groupTone = (g) => GROUP_TONE[g] ?? '--chart-compare';

  // ----- accounts with their 1-month change (Net worth's Summary and Investments' accounts list read the same rows)
  OG.m1Ctl = WF.dateControl('og4_networth_1m');
  const m1 = (q) => { OG.mapOnce(OG.m1Ctl)(q); if (WF.asOf) WF.setPeriod(OG.m1Ctl, '1M', { change: true }); return q; };
  OG.treeQ = () => m1(WF.q('og4_networth_tree', { dataset: WEALTH, metrics: { v: 'account_value', ch: 'account_change', pct: 'account_change_pct' },
    aql: `explore { dimensions { id: dim_accounts.account_id, a: dim_accounts.name, g: dim_accounts.account_group, o: dim_accounts.group_order, liab: dim_accounts.is_liability }
                    measures { v: account_value, ch: account_change, pct: account_change_pct,
                               share: safe_divide(account_value, accounts_value | of_all(dim_accounts.account_id, dim_accounts.name, dim_accounts.account_group, dim_accounts.group_order)) }
                    sorts { o asc, v desc } }` }));
  OG.groupQ = () => m1(WF.q('og4_networth_grp', { dataset: WEALTH, metrics: { v: 'accounts_value', ch: 'accounts_change' },
    aql: `explore { dimensions { liab: dim_accounts.is_liability, g: dim_accounts.account_group, o: dim_accounts.group_order }
                    measures { v: accounts_value, ch: accounts_change,
                               share: safe_divide(accounts_value, accounts_value | of_all(dim_accounts.account_group, dim_accounts.group_order)) }
                    sorts { o asc } }` }));

  // ----- the account inspector: ONE behaviour for Net worth's Summary and Investments' Accounts (17 Oct, Nhi). An account
  // row ([data-acct]) opens that account (balance, 1M change, its balance over the page's range, source + freshness) in the
  // page's rail, in place of its cards (the main column keeps its width); ‹ back (or Escape) brings them back, focus on the row.
  // key: the page's id prefix ('hn' → [data-anfra-container=hn-rail], #hn-insp); q: its query-name prefix; tree: OG.treeQ();
  // period: the page's balance date control (the curve follows the range); range(): the page's range key; back: where ‹ goes.
  OG.LEDGER_SRC = { tcb_debit: 'TCB debit', timo: 'Timo', vib_credit: 'MAX VIB', credit: 'TCB Visa' };
  OG.acctInspector = ({ view, key, q, tree, period, range, back }) => {
    const s = { id: null, el: null, sig: null, acct: null, ctl: null };
    function open(id) {
      if (!s.acct) {   // registered on the first click, so the page load doesn't run it
        s.acct = WF.q(`${q}acct`, { dataset: WEALTH, pageSize: 1000, metrics: { v: 'account_value' },
          aql: 'explore { dimensions { d: dim_dates.date_key } measures { v: account_value } sorts { d asc } }' });
        s.ctl = WF.fieldControl(`${q}acct_id`, WEALTH, 'dim_accounts.account_id');
        WF.app.mapControl(s.ctl, s.acct, { field: 'dim_accounts.account_id' });
        WF.app.mapControl(period, s.acct, { field: 'dim_dates.date_key' });
      }
      s.ctl.setCondition({ operator: 'is', values: [id] });
      // drawer() first: it calls the previous account's onClose, which must not clear the new one
      const rail = view.el.querySelector(`[data-anfra-container="${key}-rail"]`);
      s.el = OG.drawer({ label: 'Account', back, rail, body: `<div class="nw-insp" id="${key}-insp"></div>`,
        onClose: () => {
          const was = s.id, inside = !document.activeElement || document.activeElement === document.body || s.el?.contains(document.activeElement);
          s.id = null; s.el = null;
          view.el.querySelectorAll('[data-acct].active').forEach((r) => r.classList.remove('active'));
          if (inside) requestAnimationFrame(() => view.el.querySelector(`[data-acct="${CSS.escape(was ?? '')}"]`)?.focus({ preventScroll: true }));
        } });
      s.el.querySelector('.dh .back')?.focus({ preventScroll: true });
      s.id = id;
      view.el.querySelectorAll('[data-acct]').forEach((r) => r.classList.toggle('active', r.dataset.acct === id));
      s.sig = null;
      draw();
      WF.app.execute();
    }
    function draw() {
      const d = s.el;
      if (!d?.isConnected || !s.id) return;
      const a = WF.rows(tree).find((r) => r.id === s.id);
      if (!a) return;
      const ready = WF.status(s.acct, null) && WF.rows(s.acct).length > 0;
      const sig = [s.id, tree.result, ready ? s.acct.result : null, OG.fresh.result, range()];
      if (s.sig && sig.every((r, i) => r === s.sig[i])) return;
      s.sig = sig;
      const T = tree.name, src = OG.LEDGER_SRC[a.id];
      d.querySelector('.dh .card-title').textContent = a.a;
      const fr = src && OG.fresh.state === 'success' ? WF.rows(OG.fresh).find((r) => r.s === src) : null;
      const lag = fr ? OG.lagDays(fr.last) : null;
      const source = src
        ? `<div class="fr ${lag > 7 ? 'stale' : lag > 1 ? 'late' : 'ok'} nw-src"><span class="dot"></span><span>Ledger · <b>${esc(src)}</b></span></div>
            ${lag > 7 ? `<div class="warn">${esc(src)} has no lines after ${dayMon(fr.last)}, so this balance may be out of date.</div>` : ''}`
        : `<div class="fr ok nw-src"><span class="dot"></span><span>${a.g === 'Investments' ? 'Holdings at market prices + cash' : 'Activities'} · wealth records</span></div>`;
      // how current the source is sits beside its label (17 Oct, Nhi), not at the end of the source line
      const when = src
        ? `<span class="num muted" ${fr ? 'data-trace="og2_fresh:last"' : ''}>${fr ? (lag > 1 ? `through ${dayMon(fr.last)}` : 'current') : '…'}</span>`
        : `<span class="num muted">as of ${dayMon(WF.asOf)}</span>`;
      d.querySelector(`#${key}-insp`).innerHTML = `
        <div><div class="label">${esc(a.g)}</div><div class="hero" data-trace="${T}:v">${OG.money(a.v)}</div>
          <div class="delta">${OG.delta({ amt: a.ch, pct: a.pct, word: 'past month', trace: { amt: `${T}:ch`, pct: `${T}:pct` } })}</div></div>
        <div><div class="label">Balance · ${esc(OG.RANGE_WORD[range()])}</div><div class="chart nw-insp-chart" id="${key}-insp-chart"></div>${ready ? '' : '<div class="state busy">Loading…</div>'}</div>
        <div><div class="label">Source <span class="sep">·</span> ${when}</div>${source}</div>`;
      if (ready) {
        const rows = WF.rows(s.acct);
        OG.area(d.querySelector(`#${key}-insp-chart`), rows.map((r) => fmt.ymd(r.d)), rows.map((r) => Number(r.v)), { xLabels: false });
      }
    }
    // the list's account rows open it: a click, or Enter / Space on the focused row
    function bind(list) {
      list.addEventListener('click', (e) => { const a = e.target.closest('[data-acct]'); if (a) open(a.dataset.acct); });
      list.addEventListener('keydown', (e) => { const a = e.target.closest('[data-acct]'); if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(a.dataset.acct); } });
    }
    return { open, draw, bind, get id() { return s.id; } };
  };

  // ----- from mouka home.js
  const KPI1 = `
    explore {
      measures {
        spent: spend,
        prior: spend | relative_period(dim_dates.date_key, interval(-1 month)),
        delta: spend - (spend | relative_period(dim_dates.date_key, interval(-1 month))),
        delta_pct: safe_divide(spend - (spend | relative_period(dim_dates.date_key, interval(-1 month))),
                               spend | relative_period(dim_dates.date_key, interval(-1 month))),
        income: income,
        net: cash_flow_net,
        to_tag: untagged_spend_lines,
        to_tag_amt: untagged_spend
      }
    }`;
  const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);
  const nextMonthly = (last, after) => {   // next date with the same day of month, strictly after `after`
    const day = Number(String(last).slice(8, 10));
    let d = new Date(`${after.slice(0, 8)}01T00:00:00`);
    for (let k = 0; k < 3; k++) {
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const c = new Date(d.getFullYear(), d.getMonth(), Math.min(day, dim));
      const s = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`;
      if (s > after) return s;
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    return null;
  };
  OG.nextMonthly = nextMonthly; OG.daysBetween = daysBetween;

  // Shared "this month" (flow) control: Home and Spending › Overview read the month in progress.
  OG.monthCtl = WF.dateControl('og_month');
  OG.mapMonth = OG.mapOnce(OG.monthCtl);
  // O5: each shared ledger factory maps the Mom control itself, so whichever page loads first wires it (mapOnce dedupes).
  OG.kpi1 = () => {
    const q = WF.q('sp_kpi_1m', { dataset: PF, aql: KPI1,
      metrics: { spent: 'spend', income: 'income', net: 'cash_flow_net', to_tag: 'untagged_spend_lines', to_tag_amt: 'untagged_spend' } });
    OG.mapMe(q);
    return q;
  };
  // Same day-grain drill as apps/wealthfolio, so the executed AQL is identical (parity).
  OG.dailyQ = () => {
    const q = WF.q('sp_daily', { dataset: PF, metrics: { spent: 'spend' },
      aql: 'explore { dimensions { period: dim_dates.date_key } measures { spent: spend } sorts { period asc } }' });
    if (!OG.dailyDrill) { OG.dailyDrill = WF.app.createDateDrill('og_daily_grain', { default: 'day' }); WF.app.mapControl(OG.dailyDrill, q, { field: 'dim_dates.date_key' }); }
    OG.mapMe(q);
    return q;
  };
  OG.recentQ = () => {
    const q = WF.q('og_recent', { dataset: PF, pageSize: 5, metrics: {},
      aql: `explore { dimensions { id: fct_ledger.line_id, d: fct_ledger.line_date, at: fct_ledger.line_at, m: fct_ledger.merchant, desc: fct_ledger.description,
                                   cat: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color, ft: fct_ledger.flow_type, amt: fct_ledger.signed_amount_vnd }
                      filters { fct_ledger.flow_group in ['spend', 'income', 'reimbursement', 'refund'] } sorts { d desc, at desc, id desc } }` });
    OG.mapMe(q);
    return q;
  };
  // "This month vs the same days last month": the window relative_period(-1 month) compares with (date arithmetic only).
  OG.priorWindow = () => {
    const [a, b] = WF.range('this_month'), pa = WF.addMonths(a, -1), pb = WF.addMonths(b, -1);
    return pa.slice(0, 7) === pb.slice(0, 7) ? `${dayMon(pa)}–${Number(pb.slice(8, 10))}` : `${dayMon(pa)}–${dayMon(pb)}`;
  };
  OG.budgetTotalQ = () => WF.q('og_budget_total', { dataset: PF, metrics: { lim: 'budget_limit_categories', spent: 'budget_spent', used: 'budget_used_pct' },
    aql: `explore { measures { lim: budget_limit_categories, spent: budget_spent, used: budget_used_pct } filters { fct_budget_months.scope_type == 'category' } }` });
  OG.incomeNextQ = () => WF.q('og_income_next', { dataset: PF, metrics: { amt: 'salary' },
    aql: `explore { measures { last: fct_ledger | where(fct_ledger.flow_type == 'salary') | max(fct_ledger.line_date),
                               amt: fct_ledger | where(fct_ledger.flow_type == 'salary') | max_by(fct_ledger.amount_vnd, fct_ledger.line_date) } }` });

  OG.vibQ = () => WF.q('og_vib', { dataset: PF,
        metrics: { pts: 'points_earned', q: 'reward_qualifying_spend', gap: 'cap_gap', need: 'daily_spend_needed', proj: 'projected_points', st: 'reward_status', left: 'points_left_to_cap' },
        aql: `explore { dimensions { c: dim_reward_cycles.cycle_label, dl: dim_reward_cycles.days_left, cap: dim_reward_cycles.reward_cap_vnd, r: dim_reward_cycles.reward_rate }
                        measures { pts: points_earned, share: safe_divide(points_earned, dim_reward_cycles | max(dim_reward_cycles.reward_cap_vnd)), q: reward_qualifying_spend, gap: cap_gap, need: daily_spend_needed, proj: projected_points, st: reward_status, left: points_left_to_cap }
                        filters { dim_reward_cycles.is_current is true } }` });

  // ----- from mouka sp_overview.js
  // Recurring charges: merchants charged at least twice in the window (subscriptions, bills), with the day of month
  // and amount of the latest charge. "Upcoming" projects that day forward; the data has no recurrence model.
  // v3 (C14): still grouped by the raw merchant text (raw), so the rows are og_recurring's; m is the governed
  // readable name (fct_ledger.merchant_display, a function of the raw text) that every list and chart shows.
  OG.recurringQ = () => WF.q('og3_recurring', { dataset: PF, metrics: {},
    aql: `explore { dimensions { raw: fct_ledger.merchant, m: fct_ledger.merchant_display, src: dim_sources.label, cat: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color }
                    measures { last: fct_ledger | max(fct_ledger.line_date), amt: fct_ledger | max_by(fct_ledger.amount_vnd, fct_ledger.line_date), n: lines }
                    filters { dim_categories.category in ['Subscription', 'Hoá đơn'] and fct_ledger.is_spend is true }
                    having { lines >= 2 } sorts { last asc } }` });
  OG.recCtl = WF.dateControl('og_rec_window');
  OG.mapRec = OG.mapOnce(OG.recCtl);
  // Upcoming dates for the recurring rows, sorted, within `days` after the as-of date.
  OG.upcoming = (rows, days = 31) => rows.map((r) => ({ ...r, due: OG.nextMonthly(fmt.ymd(r.last), WF.asOf) }))
    .filter((r) => r.due && OG.daysBetween(WF.asOf, r.due) <= days).sort((a, b) => (a.due < b.due ? -1 : 1));
  OG.catBudgetQ = () => WF.q('og_cat_budget', { dataset: PF, metrics: { lim: 'budget_limit', spent: 'budget_spent', used: 'budget_used_pct' },
    aql: `explore { dimensions { cat: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color, buf: fct_budget_months.is_buffer }
                    measures { lim: budget_limit, spent: budget_spent, used: budget_used_pct }
                    filters { fct_budget_months.scope_type == 'category' } sorts { lim desc } }` });

  // ----- from mouka inv_overview.js
  // C12 no brand colours: every holding gets the same grey initials circle (colour is for gain / loss only)
  const logo = (s, sm = false) => `<span class="initial logo${sm ? ' sm' : ''}">${esc(String(s).slice(0, 3))}</span>`;
  OG.logo = logo;
  OG.holdQ = () => WF.q('hold_open', { dataset: WEALTH,
    metrics: { q: 'holding_quantity', p: 'holding_price', dc: 'holding_day_change_pct', v: 'holding_value', ret: 'holding_return', retp: 'holding_return_pct' },
    aql: 'explore { dimensions { s: dim_assets.symbol, n: dim_assets.name, sub: dim_assets.asset_sub_class } measures { q: holding_quantity, p: holding_price, dc: holding_day_change_pct, v: holding_value, ret: holding_return, retp: holding_return_pct } having { holding_quantity > 0 } sorts { v desc } }' });
})();
