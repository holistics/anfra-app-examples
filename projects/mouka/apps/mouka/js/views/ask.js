// Ask AI: governed answers. It looks like a chat (a greeting, one composer, nudges), but no model writes a number: the data
// app runs sandboxed, so each use case is a set of named queries on the semantic layer plus a template that says what they
// returned. Every number in an answer is a data-trace span (trace mode and the hover cards work on it), and each answer
// names the governed metrics it read. A typed question is routed to the closest use case by keywords; anything else gets an
// honest "I answer from Ha's governed numbers" and the nudges. The thread lives in memory (the sandbox has no storage).
// Queries are made on first use, so the page load runs none. Month-scoped spending reuses Home's shared queries (same
// names, same "this month" control: the same numbers); everything else has Ask's own query names and fixed periods, so a
// range picked on Home never changes an answer, and the reverse. tests/app/ask.json checks the answers against Home.
(() => {
  const { fmt } = WF;
  const { $, esc, icon, money, approx, proj, pct1, dayMon, monthName } = OG;
  const PF = 'personal_finance', WEALTH = 'wealth', P = 'ask_';
  // a governed number inside a sentence: bold, tabular, traceable
  const n = (q, alias, text) => `<b class="num" data-trace="${q.name}:${alias}">${text}</b>`;
  const num = (v) => fmt.n(v);
  const qty = (v) => new Intl.NumberFormat('en-US').format(Math.round(num(v) ?? 0));
  const pts = (a, b) => `${((num(a) - num(b)) * 100).toFixed(1)} points`;

  // ----- queries (made on first use) and Ask's own periods
  const Q = {};
  const once = (k, make) => Q[k] ?? (Q[k] = make());
  let ctl = null;
  function periods() {
    if (ctl) return ctl;
    const make = (name, set) => { const c = WF.dateControl(`${P}${name}`); set(c); return c; };
    const m0 = `${WF.asOf.slice(0, 7)}-01`;
    ctl = {
      m1: make('1m', (c) => WF.setPeriod(c, '1M', { change: true })),                // net worth: today vs a month ago
      y1: make('1y', (c) => WF.setPeriod(c, '1Y')),                                  // investments: the past year
      all: make('all', (c) => WF.setPeriod(c, 'ALL')),                               // the pace since the first day
      last: make('last', (c) => WF.setPeriod(c, 'last_month')),                      // the report: the last full month
      lastBal: make('last_bal', (c) => WF.setPeriod(c, 'last_month', { change: true })),
      six: make('six', (c) => c.setCondition({ operator: 'between', values: [WF.addMonths(m0, -5), WF.asOf] })),   // 5 full months + this one
    };
    return ctl;
  }
  const map = (control, ...qs) => qs.forEach((q) => WF.app.mapControl(control, q, { field: 'dim_dates.date_key' }));
  // this month's spending: Home's shared queries on Home's shared "this month" control
  const month = (...qs) => { OG.mapMonth(...qs); WF.setPeriod(OG.monthCtl, 'this_month'); return qs; };
  const kpi = () => once('kpi', () => month(OG.kpi1())[0]);
  const cats = () => once('cats', () => { const q = WF.q('sp_cats', { dataset: PF, metrics: { spent: 'spend', share: 'spend_share_pct' },
    aql: `explore { dimensions { cat: dim_categories.category, en: dim_categories.label_en, color: dim_categories.color }
                    measures { spent: spend, share: spend_share_pct } sorts { spent desc } }` }); month(q); OG.mapMe(q); return q; });

  // ----- the use cases: key · nudge label · icon · routing words · queries · answer(qs) → { html, chart?, metrics }
  // home: false = not on the first screen (19 Oct, Nhi: two rows of nudges, not three); it still answers typed questions and
  // shows in follow-ups and the fallback's chips
  const USES = [
    { key: 'spend', label: 'Analyze my spending', icon: 'analyze',
      words: ['spend', 'spent', 'spending', 'expense', 'expenses', 'categor', 'where did', 'money go', 'purchase', 'bought', 'chi tieu', 'tieu'],
      follow: ['budget', 'recurring', 'report'],
      queries: () => [kpi(), cats(),
        once('top', () => { const q = WF.q(`${P}top_buy`, { dataset: PF, pageSize: 1, metrics: { v: 'spend' },
          aql: 'explore { dimensions { m: fct_ledger.merchant_display, d: fct_ledger.line_date, en: dim_categories.label_en } measures { v: spend } sorts { v desc } }' });
          month(q); OG.mapMe(q); return q; }),
        once('daily', () => month(OG.dailyQ())[0])],
      answer: ([k, c, t, d]) => {
        const r = WF.one(k), top = WF.rows(c).filter((x) => num(x.spent) > 0), buy = WF.one(t);
        const less = num(r.delta) < 0, m = monthName(WF.asOf);
        const head = `So far in ${esc(m)} you've spent ${n(k, 'spent', money(r.spent))}`
          + (num(r.prior) ? `, ${n(k, 'delta', approx(Math.abs(num(r.delta))))} ${less ? 'less' : 'more'} than the same days of ${esc(monthName(WF.addMonths(WF.asOf, -1)))} (${n(k, 'delta_pct', pct1(Math.abs(num(r.delta_pct))))} ${less ? 'down' : 'up'}).` : '.');
        const cat = top.length ? ` Your biggest category is ${esc(top[0].en)}: ${n(c, 'share', pct1(top[0].share))}, ${n(c, 'spent', approx(top[0].spent))}`
          + (top.length > 2 ? `, then ${esc(top[1].en)} (${n(c, 'share', pct1(top[1].share))}) and ${esc(top[2].en)} (${n(c, 'share', pct1(top[2].share))}).` : '.') : '';
        const big = buy.m ? ` The biggest single purchase was ${esc(buy.m)}, ${n(t, 'v', money(buy.v))} on ${dayMon(buy.d)}.` : '';
        const days = WF.rows(d);
        return { html: `<p>${head}${cat}${big}</p>`, metrics: ['Spend', 'Spend share'],
          chart: days.length ? { label: `Spend by day · ${m}`, draw: (el) => {
            const total = days.reduce((a, x) => a + (num(x.spent) ?? 0), 0);
            OG.miniBars(el, days.map((x) => String(fmt.ymd(x.period)).slice(8, 10)), days.map((x) => num(x.spent)), total / days.length);
            WF.charts.chart(el).setOption({ xAxis: { axisLabel: { interval: (i) => i % 3 === 0 } } });
          } } : null };
      } },

    { key: 'report', label: 'Write my monthly report', icon: 'report',
      words: ['report', 'summary', 'summarize', 'recap', 'review', 'overview', 'how did i do', 'last month', 'bao cao', 'tong ket'],
      follow: ['savings', 'spend', 'networth'],
      queries: () => {
        const c = periods();
        return [
          once('rep', () => { const q = WF.q(`${P}rep`, { dataset: PF, metrics: { inc: 'income', ns: 'net_spend', sur: 'surplus', rate: 'savings_rate' },
            aql: 'explore { measures { inc: income, ns: net_spend, sur: surplus, rate: savings_rate } }' }); map(c.last, q); OG.mapMe(q); return q; }),
          once('rep_cat', () => { const q = WF.q(`${P}rep_cat`, { dataset: PF, pageSize: 1, metrics: { spent: 'spend', share: 'spend_share_pct' },
            aql: 'explore { dimensions { en: dim_categories.label_en } measures { spent: spend, share: spend_share_pct } sorts { spent desc } }' }); map(c.last, q); OG.mapMe(q); return q; }),
          once('rep_nw', () => { const q = WF.q(`${P}rep_nw`, { dataset: WEALTH, metrics: { nw: 'net_worth', ch: 'net_worth_change' },
            aql: 'explore { measures { nw: net_worth, ch: net_worth_change, pct: net_worth_change_pct } }' }); map(c.lastBal, q); return q; }),
          once('rep_bud', () => { const q = WF.q(`${P}rep_bud`, { dataset: PF, metrics: { lim: 'budget_limit_categories', spent: 'budget_spent', used: 'budget_used_pct' },
            aql: `explore { measures { lim: budget_limit_categories, spent: budget_spent, used: budget_used_pct } filters { fct_budget_months.scope_type == 'category' } }` }); map(c.last, q); return q; }),
        ];
      },
      answer: ([r, c, w, b]) => {
        const x = WF.one(r), top = WF.one(c), nw = WF.one(w), bu = WF.one(b);
        const m0 = WF.range('last_month')[0], name = new Date(`${m0}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const over = num(bu.used) > 1;
        const line = (k, v) => `<div class="ask-rep-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
        // spending here is NET spend (refunds and paybacks off), so income − spending = saved, line by line
        return { metrics: ['Income', 'Net spend', 'Surplus', 'Savings rate', 'Spend share', 'Net worth', 'Budget used'],
          html: `<p>Here's your <b>${esc(name)}</b> in one place. You kept ${n(r, 'rate', pct1(x.rate))} of what came in, and your net worth ${num(nw.ch) >= 0 ? 'grew' : 'fell'} by ${n(w, 'ch', approx(Math.abs(num(nw.ch))))}.</p>
            <div class="ask-rep">
              ${line('Income', n(r, 'inc', money(x.inc)))}
              ${line('Spending', `${n(r, 'ns', money(x.ns))}<span class="muted"> · after refunds${top.en ? `, most on ${esc(top.en)} (${n(c, 'share', pct1(top.share))})` : ''}</span>`)}
              ${line('Saved', `${n(r, 'sur', money(x.sur))}<span class="muted"> · ${n(r, 'rate', pct1(x.rate))} of income</span>`)}
              ${line('Net worth', `${n(w, 'nw', money(nw.nw))}<span class="${OG.tone(nw.ch)}"> · ${n(w, 'ch', approx(nw.ch, true))}</span>`)}
              ${line('Budgets', `${n(b, 'used', pct1(bu.used))} used<span class="muted"> · ${n(b, 'spent', approx(bu.spent))} of ${n(b, 'lim', approx(bu.lim))}${over ? ', over the limit' : ''}</span>`)}
            </div>` };
      } },

    { key: 'budget', label: 'Am I on budget?', icon: 'target',
      words: ['budget', 'budgets', 'limit', 'overspend', 'over budget', 'on track', 'ngan sach', 'han muc'],
      follow: ['spend', 'savings', 'vib'],
      queries: () => [once('bud', () => month(OG.budgetTotalQ())[0]), once('cat_bud', () => month(OG.catBudgetQ())[0])],
      answer: ([t, c]) => {
        const b = WF.one(t), rows = WF.rows(c), m = monthName(WF.asOf);
        const dim = new Date(Number(WF.asOf.slice(0, 4)), Number(WF.asOf.slice(5, 7)), 0).getDate(), left = dim - Number(WF.asOf.slice(8, 10));
        const isBuf = (r) => r.buf === true || r.buf === 'true';
        const over = rows.filter((r) => num(r.used) > 1), near = rows.filter((r) => num(r.used) >= 0.8 && num(r.used) <= 1);
        const name = (r) => `${esc(r.en)}${isBuf(r) ? ' (the overflow buffer)' : ''}`;
        const say = over.length ? ` Over the limit: ${over.map((r) => `${name(r)}, ${n(c, 'spent', approx(r.spent))} of ${n(c, 'lim', approx(r.lim))}`).join('; ')}.` : ' Nothing is over its limit.';
        const close = near.length ? ` Close to it: ${near.map((r) => `${esc(r.en)} (${n(c, 'used', pct1(r.used))})`).join(', ')}.` : '';
        const list = [...rows].sort((a, z) => num(z.used) - num(a.used)).slice(0, 4).map((r) => { const o = num(r.used) > 1;
          return OG.row({ cls: 'hs-bud', lead: OG.tile({ icon: OG.catIcon(r.en), color: OG.catColor(r.cat ?? r.en, r.color) }), title: esc(r.en),
            meta: OG.progress(Math.min(1, num(r.used) ?? 0), { tone: o ? 'over' : num(r.used) >= 0.8 ? 'warn' : '', thin: true }),
            value: `<span class="amt" data-trace="${c.name}:spent">${approx(r.spent)}</span>`, sub: `<span class="${o ? 'neg' : ''}">of <span data-trace="${c.name}:lim">${approx(r.lim)}</span></span>` }); }).join('');
        return { metrics: ['Budget used', 'Budget spent', 'Budget limit'],
          html: `<p>You've used ${n(t, 'used', pct1(b.used))} of ${esc(m)}'s category budgets: ${n(t, 'spent', approx(b.spent))} of ${n(t, 'lim', approx(b.lim))}, with ${left} day${left === 1 ? '' : 's'} left.${say}${close}</p>
            <div class="ask-list">${list}</div>` };
      } },

    { key: 'vib', label: 'Plan my MAX VIB points', icon: 'gift',
      words: ['vib', 'max vib', 'point', 'points', 'reward', 'rewards', 'cashback', 'cap', 'cycle', 'diem', 'hoan tien'],
      follow: ['spend', 'budget', 'recurring'],
      queries: () => [once('vib', () => OG.vibQ())],
      answer: ([v]) => {
        const r = WF.one(v), dl = num(r.dl) ?? 0;
        const st = { behind: 'behind the pace to reach the cap', on_pace: 'on pace to reach the cap', maxed: 'already at the cap' }[r.st] ?? String(r.st ?? '');
        const plan = r.st === 'maxed' ? ' Any more MAX VIB spend this cycle earns nothing, so use another card until the next cycle starts.'
          : ` To reach the cap you'd need to spend ${n(v, 'need', money(r.need))} a day on MAX VIB for the ${dl} day${dl === 1 ? '' : 's'} left; at your current pace you'll finish near ${n(v, 'proj', qty(r.proj))} points.`;
        return { metrics: ['Points earned', 'Points left to cap', 'Daily spend needed', 'Projected points', 'Reward status'],
          html: `<p>This cycle (${esc(r.c)}) you've earned ${n(v, 'pts', qty(r.pts))} points of the ${qty(r.cap)} cap, so you're ${esc(st)}: ${n(v, 'left', qty(r.left))} points to go.${plan}</p>
            <div class="ask-meter">${OG.progress(Math.min(1, (num(r.pts) ?? 0) / (num(r.cap) || 1)), { tone: r.st === 'behind' ? 'warn' : '' })}<div class="sub"><span>${qty(r.pts)} earned</span><span>cap ${qty(r.cap)}</span></div></div>` };
      } },

    { key: 'invest', label: 'How are my investments doing?', icon: 'trend',
      words: ['invest', 'investment', 'investments', 'portfolio', 'stock', 'stocks', 'return', 'returns', 'holding', 'holdings', 'dividend', 'vn-index', 'vnindex', 'gold', 'dau tu', 'co phieu'],
      follow: ['networth', 'report', 'savings'],
      queries: () => {
        const c = periods();
        return [
          once('perf', () => { const q = WF.q(`${P}perf`, { dataset: WEALTH, metrics: { twr: 'twr', b: 'benchmark_return', gl: 'portfolio_gain_loss' },
            aql: 'explore { measures { twr: twr, b: benchmark_return, gl: portfolio_gain_loss } }' }); map(c.y1, q); return q; }),
          once('perf_curve', () => { const q = WF.q(`${P}perf_curve`, { dataset: WEALTH, metrics: { p: 'cumulative_twr', b: 'cumulative_benchmark' },
            aql: 'explore { dimensions { d: dim_dates.date_key } measures { p: cumulative_twr, b: cumulative_benchmark } sorts { d asc } }' }); map(c.y1, q); return q; }),
          once('hold', () => OG.holdQ()),
          once('inc', () => { const q = WF.q(`${P}inc`, { dataset: WEALTH, metrics: { t: 'investment_income', d: 'dividend_income', i: 'interest_income' },
            aql: 'explore { measures { t: investment_income, d: dividend_income, i: interest_income } }' }); map(c.y1, q); return q; }),
        ];
      },
      answer: ([p, curve, h, i]) => {
        const k = WF.one(p), inc = WF.one(i), ahead = num(k.twr) >= num(k.b);
        const movers = WF.rows(h).filter((r) => num(r.dc) != null && num(r.dc) !== 0).sort((a, z) => Math.abs(num(z.dc)) - Math.abs(num(a.dc))).slice(0, 2);
        const mv = movers.length ? ` On the last trading day the biggest movers were ${movers.map((r) => `${esc(r.s)} ${n(h, 'dc', `<span class="${OG.tone(r.dc)}">${pct1(r.dc, true)}</span>`)}`).join(' and ')}.` : '';
        const rows = WF.rows(curve);
        return { metrics: ['Time-weighted return', 'Benchmark return', 'Portfolio gain/loss', 'Investment income'],
          html: `<p>Over the past year your portfolio returned ${n(p, 'twr', pct1(k.twr, true))} (time-weighted), against ${n(p, 'b', pct1(k.b, true))} for the VN-Index: ${pts(k.twr, k.b).replace('-', '')} ${ahead ? 'ahead' : 'behind'}. That's ${n(p, 'gl', approx(k.gl, true))} in gains.${mv} It also paid ${n(i, 't', approx(inc.t))} in interest and dividends (${n(i, 'i', approx(inc.i))} interest, ${n(i, 'd', approx(inc.d))} dividends).</p>`,
          chart: rows.length ? { label: 'Your return vs the VN-Index · past year', key: true, draw: (el) => OG.area(el, rows.map((r) => fmt.ymd(r.d)), rows.map((r) => num(r.p)),
            { areaFill: false, scale: true, yFmt: (v) => pct1(v), tipFmt: (v) => pct1(v, true), compare: [{ name: 'VN-Index', data: rows.map((r) => num(r.b)) }] }) } : null };
      } },

    { key: 'networth', label: 'Where is my net worth heading?', icon: 'forecast', home: false,
      words: ['net worth', 'networth', 'worth', 'wealth', 'heading', 'future', 'forecast', 'projection', 'project', 'next year', 'rich', 'tai san'],
      follow: ['invest', 'savings', 'report'],
      queries: () => {
        const c = periods();
        return [
          once('nw', () => { const q = WF.q(`${P}nw`, { dataset: WEALTH, metrics: { nw: 'net_worth', ch: 'net_worth_change', pct: 'net_worth_change_pct' },
            aql: 'explore { measures { nw: net_worth, ch: net_worth_change, pct: net_worth_change_pct } }' }); map(c.m1, q); return q; }),
          once('pace', () => { const q = WF.q(`${P}pace`, { dataset: WEALTH,
            metrics: { pace: 'net_worth_monthly_pace', ch: 'net_worth_change', gains: 'investment_gains', saved: 'saved_from_income', debt: 'debt_change' },
            aql: 'explore { measures { pace: net_worth_monthly_pace, ch: net_worth_change, gains: investment_gains, saved: saved_from_income, debt: debt_change } }' }); map(c.all, q); return q; }),
          once('fc12m', () => OG.fc.q12m()),   // Forecast's hero query (18 Oct): one "in 12 months" number app-wide
          once('nw_curve', () => { const q = WF.q(`${P}nw_curve`, { dataset: WEALTH, metrics: { nw: 'net_worth_daily' },
            aql: 'explore { dimensions { period: dim_dates.date_key } measures { nw: net_worth_daily } sorts { period asc } }' }); map(c.all, q); return q; }),
        ];
      },
      answer: ([w, p, f, curve]) => {
        const k = WF.one(w), r = WF.one(p), fc = WF.one(f), since = new Date(`${WF.firstDay}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const rows = WF.rows(curve);
        return { metrics: ['Net worth', 'Net worth change', 'Monthly pace', 'Investment gains', 'Saved from income', 'Debt change', 'Net worth in 1 year'],
          html: `<p>Your net worth is ${n(w, 'nw', money(k.nw))}, ${num(k.ch) >= 0 ? 'up' : 'down'} ${n(w, 'ch', approx(Math.abs(num(k.ch))))} (${n(w, 'pct', pct1(Math.abs(num(k.pct))))}) over the past month.
            Since ${esc(since)} it has moved ${n(p, 'pace', approx(r.pace, true))} a month on average (${n(p, 'ch', approx(r.ch, true))} in all): ${n(p, 'saved', approx(r.saved))} saved from income, ${n(p, 'gains', approx(r.gains))} of investment gains and ${n(p, 'debt', approx(Math.abs(num(r.debt))))} of ${num(r.debt) <= 0 ? 'new debt' : 'debt paid down'}.</p>
            <p>At your last-12-months pace of ${n(f, 'pace', approx(fc.pace))} a month, you'd be at ${n(f, 'p1', money(fc.p1))} in 12 months, the number Forecast shows. <span class="muted">An estimate: a straight line at your pace, not a market forecast.</span></p>`,
          chart: rows.length ? { label: 'Net worth · all time', draw: (el) => OG.area(el, rows.map((x) => fmt.ymd(x.period)), rows.map((x) => num(x.nw)), { xFmt: (v) => new Date(`${v}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) }) } : null };
      } },

    { key: 'recurring', label: 'Find my recurring bills', icon: 'calsync', home: false,
      words: ['recurring', 'subscription', 'subscriptions', 'bill', 'bills', 'netflix', 'spotify', 'upcoming', 'due', 'renew', 'dinh ky', 'hoa don'],
      follow: ['budget', 'spend', 'vib'],
      queries: () => [once('rec', () => { const q = OG.recurringQ(); OG.mapRec(q); WF.setPeriod(OG.recCtl, '3M'); return q; })],
      answer: ([q]) => {
        const rows = WF.rows(q), up = OG.upcoming(rows, 31), monthly = rows.reduce((a, r) => a + (num(r.amt) ?? 0), 0);
        const list = up.slice(0, 5).map((r) => OG.row({ lead: OG.tile({ icon: OG.catIcon(r.en ?? r.cat), color: OG.catColor(r.cat ?? r.en, r.color) }),
          title: esc(r.m || r.raw), meta: `${esc(dayMon(r.due))} · ${esc(r.src)}`, value: `<span class="amt" data-trace="${q.name}:amt">${money(r.amt)}</span>` })).join('');
        return { metrics: ['Spend (Subscription and Bills)', 'Lines'],
          html: `<p>I found <b class="num">${rows.length}</b> recurring charges in the past 3 months (bills and subscriptions charged at least twice), about <b class="num">${approx(monthly)}</b> a month together (their latest charges added up).${up.length ? ` ${up.length} of them come due in the next 31 days:` : ' None comes due in the next 31 days.'}</p>
            ${list ? `<div class="ask-list">${list}</div>` : ''}<p class="muted ask-note">Due dates repeat the last charge's day of the month; the data has no billing schedule.</p>` };
      } },

    { key: 'savings', label: 'Explain my savings rate', icon: 'piggy', home: false,
      words: ['save', 'saving', 'savings', 'savings rate', 'surplus', 'put aside', 'tiet kiem', 'de danh'],
      follow: ['report', 'networth', 'budget'],
      queries: () => [once('save', () => { const q = WF.q(`${P}save`, { dataset: PF, metrics: { rate: 'savings_rate', sur: 'surplus', inc: 'income', ns: 'net_spend' },
        aql: 'explore { dimensions { m: dim_dates.date_key | month() } measures { rate: savings_rate, sur: surplus, inc: income, ns: net_spend } sorts { m asc } }' });
        map(periods().six, q); OG.mapMe(q); return q; })],
      answer: ([q]) => {
        const rows = WF.rows(q), full = rows.filter((r) => fmt.ymd(r.m).slice(0, 7) < WF.asOf.slice(0, 7) && num(r.inc));
        if (!full.length) return { html: '<p>There isn\'t a full month with income yet, so there is no savings rate to explain.</p>', metrics: ['Savings rate'] };
        const last = full[full.length - 1], avg = full.reduce((a, r) => a + num(r.rate), 0) / full.length;
        const hi = full.reduce((a, r) => (num(r.rate) > num(a.rate) ? r : a), full[0]);
        const cur = rows.find((r) => fmt.ymd(r.m).slice(0, 7) === WF.asOf.slice(0, 7));
        const mon = (r) => monthName(r.m);
        return { metrics: ['Savings rate', 'Surplus', 'Income', 'Net spend'],
          html: `<p>Your savings rate is what's left of income after net spending. In ${esc(mon(last))} you kept ${n(q, 'rate', pct1(last.rate))} of your income: ${n(q, 'sur', approx(last.sur))} of ${n(q, 'inc', approx(last.inc))}.
            Over the last ${full.length} full months you averaged ${pct1(avg)}${hi !== last ? `; ${esc(mon(hi))} stands out at ${n(q, 'rate', pct1(hi.rate))}, on ${n(q, 'inc', approx(hi.inc))} of income` : ''}.
            ${cur && !num(cur.inc) ? `${esc(mon(cur))} has no income yet, so its rate isn't counted.` : ''}</p>`,
          chart: { label: 'Savings rate by month', draw: (el) => {
            OG.miniBars(el, full.map((r) => monthName(r.m, false)), full.map((r) => num(r.rate)), avg);
            WF.charts.chart(el).setOption({ tooltip: OG.tip((v) => pct1(v)), series: [{ markLine: { label: { formatter: `avg ${pct1(avg)}` } } }] });
          } } };
      } },
  ];
  const BY = new Map(USES.map((u) => [u.key, u]));

  // ----- routing a typed question: the use case whose words it contains most (accents and case ignored); ties go to the
  // earlier use case. No match = the fallback turn.
  const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  function route(text) {
    const t = ` ${plain(text).replace(/[^a-z0-9-]+/g, ' ')} `;
    let best = null, score = 0;
    for (const u of USES) {
      const s = u.words.reduce((a, w) => a + (t.includes(` ${w}`) ? 1 : 0), 0);
      if (s > score) { best = u; score = s; }
    }
    return best;
  }

  const view = {
    id: 'ask', nav: 'ask', tab: null, soon: true,   // 19 Oct (Nhi): not live yet: a Coming soon tag, typing switched off
    init(el) {
      this.turns = [];
      this.blocks = {
        'ask-main': () => `<section class="ask" id="ask" data-anfra-block="ask-main" data-anfra-label="Ask AI">
            ${OG.cat.markup()}
            <h2 class="ask-hello">Hey Ha, what's on your mind today?</h2>
            <div class="ask-thread" id="ask-thread" aria-live="polite"></div>
            <div class="ask-dock">${OG.composer({ id: 'ask-c', off: true, placeholder: 'Typing your own questions is coming soon' })}
              <p class="ask-soon" id="ask-soon">${icon('info', 'sm')}<span>Ask AI isn't live yet. For a preview, pick a question below: it answers from your governed numbers.</span></p></div>
            <div class="ask-nudges" id="ask-nudges">${USES.filter((u) => u.home !== false).map((u) => OG.nudge(u)).join('')}</div>
          </section>`,
      };
      el.innerHTML = OG.frame(this, OG.layout(this));
      // "New chat" sits in the page header, shown once there is a thread
      el.querySelector('.head .grow').insertAdjacentHTML('afterend', `<button class="btn ask-new" type="button" id="ask-new" aria-label="New chat" hidden>${icon('newchat', 'sm')}<span>New chat</span></button>`);
      $('ask-c-send').addEventListener('click', () => this.send());
      $('ask-new').addEventListener('click', () => this.reset());
      OG.cat.bind($('ask-cat'));   // the cat (js/cat.js): wakes on hover, money rain on a click
      el.addEventListener('click', (e) => { const b = e.target.closest('.nudge[data-k]'); if (b && el.contains(b)) this.ask(BY.get(b.dataset.k)); });
    },
    // every open makes it rain (19 Oct, Nhi: ₫ notes and coins over the page, as the cat's click does; js/cat.js). Not while a
    // thread is open: the cat is hidden then and the page is a conversation.
    shown() {
      if (this.turns?.length) return;
      requestAnimationFrame(() => OG.cat.rain($('ask-cat')));
    },
    send() {
      const t = $('ask-c-in'), text = t.value.trim();
      if (!text) return;
      OG.clearComposer('ask-c');
      this.ask(route(text), text);
    },
    // one exchange: the question (the nudge's label when picked), then an answer turn that fills in once its queries are back
    ask(use, text = use?.label) {
      this.turns.push({ me: text });
      const turn = { use, at: performance.now(), sig: null };
      this.turns.push(turn);
      if (use) { turn.qs = use.queries(); WF.app.execute(); }
      this.draw(true);
      setTimeout(() => this.render(), 450);   // the reading line shows at least briefly, so an instant answer doesn't jump in
    },
    reset() {
      this.turns.forEach((t) => t.el?.querySelectorAll('.ask-chart').forEach((c) => echarts.getInstanceByDom(c)?.dispose()));
      this.turns = [];
      this.draw();
      $('ask-c-in').focus();
    },
    // the thread's markup: turns are appended once; answers fill in place (render)
    draw(scroll = false) {
      const th = $('ask-thread'), has = this.turns.length > 0;
      $('ask').classList.toggle('has-thread', has);
      $('ask-new').hidden = !has;
      if (!has) { th.innerHTML = ''; return; }
      for (const t of this.turns) {
        if (t.el) continue;
        t.el = document.createElement('div');
        if (t.me != null) { t.el.className = 'ask-turn me'; t.el.innerHTML = `<div class="bubble">${esc(t.me)}</div>`; }
        else {
          t.el.className = 'ask-turn ai';
          if (t.qs) t.el.dataset.anfraQuery = t.qs.map((q) => q.name).join(' ');
          t.el.innerHTML = `<span class="ask-mark" aria-hidden="true">${icon('ask', 'sm')}</span><div class="ask-body"><div class="ask-reading">Reading your ledger…</div></div>`;
        }
        th.append(t.el);
      }
      this.render();
      if (scroll) requestAnimationFrame(() => this.turns[this.turns.length - 2]?.el?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    },
    fill(t) {
      const body = t.el.querySelector('.ask-body');
      if (t.sig === 'fallback' || t.sig === 'error') return;
      if (!t.use) {
        t.sig = 'fallback';
        body.innerHTML = `<p>I answer from your governed numbers only, so I can't take that one. Try one of these:</p>
          <div class="ask-follow">${USES.map((u) => OG.nudge(u)).join('')}</div>`;
        return;
      }
      if (performance.now() - t.at < 400) return;
      const failed = t.qs.find((q) => q.state === 'error');
      if (failed) { body.innerHTML = `<p class="state error">Couldn't read ${esc(failed.name)}: ${esc(failed.error?.message ?? 'error')}</p>`; t.sig = 'error'; return; }
      if (!t.qs.every((q) => q.result && q.state !== 'executing')) return;   // an empty result still answers (the template says so)
      const sig = t.qs.map((q) => q.result);
      if (t.sig && Array.isArray(t.sig) && sig.every((r, i) => r === t.sig[i])) return;
      t.sig = sig;
      body.querySelectorAll('.ask-chart').forEach((c) => echarts.getInstanceByDom(c)?.dispose());
      const a = t.use.answer(t.qs);
      body.innerHTML = `${a.html}
        ${a.chart ? `<div class="ask-fig"><div class="label">${esc(a.chart.label)}</div>${a.chart.key ? '<div class="key"><span class="k"><span class="sw ln" style="background:var(--chart-line)"></span>You</span><span class="k"><span class="sw dash"></span>VN-Index</span></div>' : ''}<div class="chart ask-chart"></div></div>` : ''}
        <div class="ask-src">From governed metrics: ${a.metrics.map(esc).join(', ')} · data as of ${dayMon(WF.asOf)} · <button type="button" data-go="defs">See definitions ${icon('chev', 'xs')}</button></div>
        <div class="ask-follow">${t.use.follow.map((k) => OG.nudge(BY.get(k))).join('')}</div>`;
      if (a.chart) a.chart.draw(body.querySelector('.ask-chart'));
    },
    render() {
      for (const t of this.turns) if (t.me == null && t.el) this.fill(t);
    },
  };
  WF.register(view);
  OG.askRoute = route;   // for tests/app/ask.json
})();
