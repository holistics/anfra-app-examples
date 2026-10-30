// Invest (18 Oct): what both tabs share. The holdings query (open AND closed positions), the four kinds of holding with
// their tones, and the holding drawer: a holding (a row on Holdings, a Winners and drags row or a note on Performance) opens in
// Holdings' rail with ‹ back, as an account does on Net worth. Loaded before inv_performance.js and inv_holdings.js.
(() => {
  const { fmt } = WF;
  const { $, esc, money, approx, pct1, dayMon } = OG;
  const WEALTH = 'wealth', P = 'og7_inv_';
  const inv = OG.inv = { P };

  // dim_assets.asset_sub_class → the group name on screen and its tone (ds/tokens.css --inv-*), in the series order
  inv.SUB = [{ k: 'Stock', label: 'Stocks', tone: '--inv-stock' }, { k: 'ETF', label: 'ETFs', tone: '--inv-etf' },
    { k: 'Bond fund', label: 'Bond fund', tone: '--inv-bond' }, { k: 'Gold', label: 'Gold', tone: '--inv-gold' }];
  inv.sub = (k) => inv.SUB.find((s) => s.k === k) ?? { k, label: k ?? 'Other', tone: '--chart-rest' };
  inv.ACCT_TONE = { 'SSI Securities': '--inv-acct-ssi', Gold: '--inv-acct-gold' };

  // every position ever held, at the as-of date (no range: holdings are "now"); quantity 0 = closed (HPG)
  inv.holdQ = () => WF.q(`${P}hold`, { dataset: WEALTH,
    metrics: { q: 'holding_quantity', p: 'holding_price', dc: 'holding_day_change_pct', v: 'holding_value', bc: 'holding_book_cost',
      u: 'holding_unrealized', r: 'holding_realized', ret: 'holding_return', retp: 'holding_return_pct' },
    aql: `explore { dimensions { s: dim_assets.symbol, n: dim_assets.name, sub: dim_assets.asset_sub_class }
                    measures { q: holding_quantity, p: holding_price, dc: holding_day_change_pct, v: holding_value, bc: holding_book_cost,
                               u: holding_unrealized, r: holding_realized, ret: holding_return, retp: holding_return_pct } sorts { v desc } }` });
  // the sales (for the closed positions: when, at what price)
  inv.salesQ = () => WF.q(`${P}sales`, { dataset: WEALTH, pageSize: 50, metrics: {},
    aql: "explore { dimensions { d: fct_activities.activity_day, s: fct_activities.symbol, up: fct_activities.unit_price, q: fct_activities.quantity } filters { fct_activities.activity_type == 'SELL' } sorts { d desc } }" });
  inv.isOpen = (r) => (fmt.n(r.q) ?? 0) > 0;
  inv.rows = () => { const q = inv.holdQ(); return WF.status(q, null) ? WF.rows(q) : []; };

  // ----- open a holding from anywhere: Holdings takes over (if it isn't the page), then its rail shows the holding
  inv.open = (sym) => {
    if (WF.current?.id !== 'invest/holdings') WF.go('invest/holdings');
    WF.views.get('invest/holdings')?.openHolding(sym);
  };

  // ----- the drawer (Holdings' rail). Its three queries are registered on the first open, so the page load doesn't run them.
  const s = { sym: null, el: null, sig: null };
  let px, act, div, symCtl;
  function queries() {
    if (px) return;
    px = WF.q(`${P}px`, { dataset: WEALTH, pageSize: 1000, metrics: { p: 'holding_price' },
      aql: 'explore { dimensions { d: dim_dates.date_key } measures { p: holding_price } sorts { d asc } }' });
    act = WF.q(`${P}act`, { dataset: WEALTH, pageSize: 200, metrics: {},
      aql: `explore { dimensions { id: fct_activities.activity_id, s: fct_activities.symbol, d: fct_activities.activity_day, t: fct_activities.activity_type, q: fct_activities.quantity,
                                   up: fct_activities.unit_price, amt: fct_activities.amount_vnd, a: fct_activities.account_name } sorts { d desc, id desc } }` });
    div = WF.q(`${P}div`, { dataset: WEALTH, metrics: { d: 'dividend_income' }, aql: 'explore { measures { d: dividend_income } }' });
    symCtl = WF.fieldControl(`${P}sym`, WEALTH, 'dim_assets.symbol');
    for (const q of [px, div]) WF.app.mapControl(symCtl, q, { field: 'dim_assets.symbol' });
    WF.app.mapControl(symCtl, act, { field: 'fct_activities.symbol' });   // a dimensions-only query: filter its own column (a dim_assets filter doesn't join)
  }
  inv.openDrawer = (view, sym) => {
    queries();
    symCtl.setCondition({ operator: 'is', values: [sym] });
    const rail = view.el.querySelector('[data-anfra-container="inv-hold-rail"]');
    s.el = OG.drawer({ label: sym, back: true, rail, body: '<div class="inv-insp" id="inv-insp"></div>',
      onClose: () => {
        const was = s.sym, inside = !document.activeElement || document.activeElement === document.body || s.el?.contains(document.activeElement);
        s.sym = null; s.el = null;
        view.el.querySelectorAll('[data-sym].active').forEach((r) => r.classList.remove('active'));
        if (inside) requestAnimationFrame(() => view.el.querySelector(`#inv-list [data-sym="${CSS.escape(was ?? '')}"]`)?.focus({ preventScroll: true }));
      } });
    s.el.querySelector('.dh .back')?.focus({ preventScroll: true });
    s.sym = sym; s.sig = null;
    view.el.querySelectorAll('[data-sym]').forEach((r) => r.classList.toggle('active', r.dataset.sym === sym));
    inv.drawDrawer();
    WF.app.execute();
  };
  inv.drawerSym = () => s.sym;

  const ACT = {
    ADD_HOLDING: (r) => `Held at the start · ${fmt.qty(r.q)} at ${money(r.up)}`,
    BUY: (r) => `Bought ${fmt.qty(r.q)} at ${money(r.up)}`,
    SELL: (r) => `Sold ${fmt.qty(r.q)} at ${money(r.up)}`,
    DIVIDEND: () => 'Dividend',
  };
  inv.drawDrawer = () => {
    const d = s.el;
    if (!d?.isConnected || !s.sym) return;
    const H = inv.holdQ(), r = inv.rows().find((x) => x.s === s.sym);
    if (!r) return;
    // only a finished run counts: while a query re-runs for the new holding it still holds the previous one's rows
    const ready = (q) => q.state === 'success' && !!q.result;
    const sales = inv.salesQ();
    const sig = [s.sym, H.result, ready(px) ? px.result : null, ready(act) ? act.result : null, ready(div) ? div.result : null, sales.result];
    if (s.sig && sig.every((x, i) => x === s.sig[i])) return;
    s.sig = sig;
    const h = H.name, open = inv.isOpen(r), acts = ready(act) ? WF.rows(act).filter((a) => a.s === s.sym) : null;
    const acct = acts?.find((a) => a.a)?.a;
    const q = fmt.n(r.q) ?? 0, avg = q > 0 ? (fmt.n(r.bc) ?? 0) / q : null;
    const total = inv.rows().filter(inv.isOpen).reduce((a, x) => a + (fmt.n(x.v) ?? 0), 0);
    d.querySelector('.dh .card-title').textContent = r.s;
    const kv = (k, v) => OG.line({ title: esc(k), value: v });
    let facts;
    if (open) {
      facts = [kv('Quantity', `<span class="num" data-trace="${h}:q">${fmt.qty(r.q)}</span>`),
        kv('Price', `<span class="num" data-trace="${h}:p">${money(r.p)}</span>`),
        kv('Average cost', `<span class="num">${money(avg)}</span>`),
        kv('Unrealised', `<span class="num ${OG.tone(r.u)}" data-trace="${h}:u">${money(r.u, true)}</span>`),
        fmt.n(r.r) ? kv('Realised', `<span class="num ${OG.tone(r.r)}" data-trace="${h}:r">${money(r.r, true)}</span>`) : '',
        ready(div) && fmt.n(WF.one(div).d) ? kv('Dividends received', `<span class="num pos" data-trace="${div.name}:d">${money(WF.one(div).d, true)}</span>`) : '',
        kv('Share of holdings', `<span class="num">${pct1(total ? (fmt.n(r.v) ?? 0) / total : 0)}</span>`),
        acct ? kv('Account', esc(acct)) : ''];
    } else {
      const sale = WF.status(sales, null) ? WF.rows(sales).find((x) => x.s === r.s) : null;
      const since = sale && fmt.n(sale.up) ? (fmt.n(r.p) ?? 0) / fmt.n(sale.up) - 1 : null;
      facts = [sale ? kv('Sold', `<span class="num">${dayMon(sale.d)} · ${fmt.qty(sale.q)} at ${money(sale.up)}</span>`) : '',
        kv('Price now', `<span class="num" data-trace="${h}:p">${money(r.p)}</span>`),
        since != null ? kv('Since you sold', `<span class="num ${OG.tone(-since)}">${pct1(since, true)}</span>`) : '',
        ready(div) && fmt.n(WF.one(div).d) ? kv('Dividends received', `<span class="num pos" data-trace="${div.name}:d">${money(WF.one(div).d, true)}</span>`) : '',
        acct ? kv('Account', esc(acct)) : ''];
    }
    const head = open
      ? `<div class="hero" data-trace="${h}:v">${money(r.v)}</div><div class="delta">${OG.delta({ amt: r.ret, pct: r.retp, word: 'since bought', trace: { amt: `${h}:ret`, pct: `${h}:retp` } })}</div>`
      : `<div class="hero" data-trace="${h}:r">${money(r.r, true)}</div><div class="delta"><span class="muted">Realised · closed position</span></div>`;
    // the activity, newest first, by day; English text built from the type, never the bank's own comment
    const byDay = new Map();
    (acts ?? []).filter((a) => ACT[a.t]).forEach((a) => { const k = fmt.ymd(a.d); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(a); });
    const actHtml = acts == null ? '<div class="state busy">Loading…</div>' : [...byDay].map(([day, list]) => `${OG.dayHead(day)}${list.map((a) => OG.line({ cls: 'inv-act',
      title: esc(ACT[a.t](a)), value: `<span class="num${a.t === 'DIVIDEND' ? ' pos' : ''}">${a.t === 'DIVIDEND' ? money(a.amt, true) : money(a.amt)}</span>` })).join('')}`).join('');
    d.querySelector('#inv-insp').innerHTML = `
      <div class="inv-insp-h"><div class="inv-insp-n"><div class="t">${esc(r.n)}</div><div class="s">${esc(inv.sub(r.sub).label)}</div></div></div>
      <div>${head}</div>
      <div><div class="label">Price since first held</div>${OG.chartBox('inv-insp-chart', 'inv-insp-chart')}${ready(px) ? '' : '<div class="state busy">Loading…</div>'}
        <div class="key inv-insp-key">${acts?.some((a) => a.t === 'BUY' || a.t === 'ADD_HOLDING') ? '<span class="k"><span class="sw dot"></span>Bought</span>' : ''}${acts?.some((a) => a.t === 'SELL') ? '<span class="k"><span class="sw dot hollow"></span>Sold</span>' : ''}${avg ? '<span class="k"><span class="sw dash"></span>Average cost</span>' : ''}</div></div>
      <div class="inv-facts">${facts.join('')}</div>
      <div><div class="label">Activity</div><div class="inv-acts">${actHtml}</div></div>`;
    if (ready(px)) {
      const pts = WF.rows(px).filter((x) => fmt.n(x.p) != null), xs = pts.map((x) => fmt.ymd(x.d)), ys = pts.map((x) => Number(x.p));
      const at = new Map(xs.map((x, i) => [x, i]));
      const marks = (acts ?? []).filter((a) => ['ADD_HOLDING', 'BUY', 'SELL'].includes(a.t) && at.has(fmt.ymd(a.d)))
        .map((a) => ({ i: at.get(fmt.ymd(a.d)), y: Number(a.up) || ys[at.get(fmt.ymd(a.d))], kind: a.t === 'SELL' ? 'sell' : 'buy', name: ACT[a.t](a) }));
      OG.area(d.querySelector('#inv-insp-chart'), xs, ys, { marks, yFmt: (v) => OG.short(v).replace('₫', ''), tipFmt: (v) => money(v),
        hLines: avg ? [{ y: avg, label: `Avg ${approx(avg)}` }] : [] });
    }
  };
})();
