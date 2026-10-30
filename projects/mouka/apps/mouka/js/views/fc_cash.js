// Forecast › Next 30 days (18 Oct): will the cash I can spend hold up until the next payday and past it?
// Cards (js/pages.js): fc-cash (hero = spendable cash in 30 days, the governed cash_expected_30d over the last 90 days,
// data-own cash-30d; the last 30 days of TCB debit + Timo, then the next 30 days day by day, the expected movements marked
// and the lowest point dotted; its hero line's "Highs and lows" opens the month's four points in date order with what moves
// the cash between them, as a hover card (19 Oct, round 3); main 8) · fc-items (what comes in and goes out, by day, with the balance
// after each day, in the Recurring list's rows; main 8) · fc-c-sum (in, out and net over the 30 days; rail 4) ·
// fc-c-notes (worth knowing; rail 4).
// The movements are fct_cash_ahead (paydays, money to family, card payments); everyday spending from the bank accounts is a
// rate (everyday_spend_daily), so the day-by-day line is worked out here and labelled an estimate. It ends on the hero:
// tests/check_semantic.py c12 holds the identity, tests/app/fc.json the line.
(() => {
  const { fmt } = WF;
  const { $, esc, money, approx, dayMon } = OG;
  const PF = 'personal_finance', WEALTH = 'wealth', P = 'og8_fc_';
  const n = (v) => fmt.n(v) ?? 0;
  const KIND = { income: { tag: 'Payday', icon: 'dollar', tone: '--flow-in' }, family: { tag: 'Family', icon: 'heart', tone: '--tone-bonus' },
    card: { tag: 'Card', icon: 'card', tone: '--flow-out' } };
  const addDays = (s, k) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };

  // Highs and lows (19 Oct, round 3, Nhi: progressive disclosure): no card; the hero line's link opens it as a hover card
  OG.hc['fc-swing'] = () => WF.views.get('forecast/cash')?.runwayHtml() ?? '';
  OG.hc['fc-everyday'] = () => '<div class="tp-title">Everyday spending</div><div>What you spent straight from TCB debit and Timo over the last 90 days, per day. The line spends it evenly, so it is an estimate: real days are lumpier.</div>';
  OG.hc['fc-left-out'] = () => '<div class="tp-title">Not in the line</div><div>Investing top-ups, savings deposits, moves to your pots, transfers between your own accounts and friends paying back: they have no fixed schedule. Card spending is in the card payments: about a month of each card, on the day you usually pay it.</div>';

  const view = {
    id: 'forecast/cash', nav: 'forecast', tab: 'Next 30 days',
    init(el) {
      const app = WF.app;
      this.blocks = {
        'fc-cash': () => OG.card({ id: 'fc-cash', label: 'Cash ahead', explain: `${P}cash:x`, query: `${P}cash ${P}ev ${P}hist`,
          body: `${OG.heroRow({ id: 'fc-c-hero', own: 'cash-30d' })}
            <div class="key fc-key" id="fc-c-key"></div>
            ${OG.chartBox('fc-c-chart', 'frame')}${OG.stateLine('fc-c-state')}
            <p class="fc-foot">TCB debit and Timo. <span data-hc="fc-left-out">What isn't in the line</span></p>` }),
        'fc-items': () => OG.card({ id: 'fc-items', label: 'Coming in and out', explain: `${P}io:o`, query: `${P}cash ${P}ev`,
          body: `<div class="fc-items sp-tx-list" id="fc-items-list"></div>${OG.stateLine('fc-items-state')}` }),
        'fc-c-notes': () => OG.card({ id: 'fc-c-notes', label: 'Worth knowing', query: `${P}cash ${P}ev`,
          body: `<div id="fc-c-notes-list"></div>${OG.stateLine('fc-c-notes-state')}` }),
        'fc-c-sum': () => OG.card({ id: 'fc-c-sum', label: 'Next 30 days', explain: `${P}cash:x`, query: `${P}cash ${P}io ${P}ev`,
          body: `<div class="nw-sum fc-sum" id="fc-c-sum-rows"></div>${OG.stateLine('fc-c-sum-state')}` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      // the 30-day expectation and its parts, over the last 90 days (the everyday rate is recent; the balance is today)
      this.kpi = WF.q(`${P}cash`, { dataset: PF,
        metrics: { t: 'total_cash', e: 'everyday_spend_daily', x: 'cash_expected_30d' },
        aql: `explore { measures { t: total_cash, e: everyday_spend_daily, x: cash_expected_30d,
                                   ch: cash_expected_30d - total_cash, pct: safe_divide(cash_expected_30d - total_cash, total_cash) } }` });
      // in and out over the 30 days (the movements alone: no date filter applies to them)
      this.io = WF.q(`${P}io`, { dataset: PF, metrics: { i: 'cash_ahead_in_30d', o: 'cash_ahead_out_30d' },
        aql: 'explore { measures { i: cash_ahead_in_30d, o: cash_ahead_out_30d } }' });
      this.ev = WF.q(`${P}ev`, { dataset: PF, metrics: {},
        aql: 'explore { dimensions { key: fct_cash_ahead.event_key, d: fct_cash_ahead.event_date, k: fct_cash_ahead.kind, l: fct_cash_ahead.label, det: fct_cash_ahead.detail, a: fct_cash_ahead.amount_vnd } sorts { d asc, key asc } }' });
      // the last 30 days of the same two accounts (the wealth layer's daily balances: the line's solid part)
      this.hist = WF.q(`${P}hist`, { dataset: WEALTH, pageSize: 100, metrics: { v: 'accounts_value' },
        aql: "explore { dimensions { d: dim_dates.date_key } measures { v: accounts_value } filters { dim_accounts.account_id in ['tcb_debit', 'timo'] } sorts { d asc } }" });
      const c90 = WF.dateControl(`${P}cash_period`), c30 = WF.dateControl(`${P}hist_period`);
      app.mapControl(c90, this.kpi, { field: 'dim_dates.date_key' }); app.mapControl(c30, this.hist, { field: 'dim_dates.date_key' });
      c90.setCondition({ operator: 'between', values: [addDays(WF.asOf, -89), WF.asOf] });
      c30.setCondition({ operator: 'between', values: [addDays(WF.asOf, -29), WF.asOf] });
      OG.bindKeys($('fc-c-notes-list'), (k) => this.notes?.find((x) => x.k === k)?.go());
      app.execute();
    },
    // day 0 = today (total cash), then each day spends the everyday rate and takes that day's movements
    days() {
      const k = WF.one(this.kpi), ev = WF.rows(this.ev), by = new Map();
      ev.forEach((r) => { const d = fmt.ymd(r.d); if (!by.has(d)) by.set(d, []); by.get(d).push(r); });
      let bal = n(k.t);
      const out = [{ d: WF.asOf, bal, ev: [] }];
      for (let i = 1; i <= 30; i++) {
        const d = addDays(WF.asOf, i), list = by.get(d) ?? [];
        bal += list.reduce((s, r) => s + n(r.a), 0) - n(k.e);
        out.push({ d, bal, ev: list });
      }
      return out;
    },
    drawHero() {
      const k = WF.one(this.kpi), id = this.kpi.name;
      $('fc-c-hero').innerHTML = `<span data-trace="${id}:x">${money(k.x)}</span>`;
      $('fc-c-hero-delta').innerHTML = `${OG.delta({ amt: k.ch, pct: k.pct, trace: { amt: `${id}:ch`, pct: `${id}:pct` } })}
        <span class="muted">in 30 days · from <span class="num" data-trace="${id}:t">${approx(k.t)}</span> today</span>
        <button type="button" class="btn link hero-more" id="fc-sw-btn" data-hc="fc-swing" aria-haspopup="dialog">Highs and lows</button>`;
    },
    drawChart(days) {
      const el = $('fc-c-chart');
      if (!WF.status(this.hist, $('fc-c-state'), 'No balances yet.')) { WF.charts.clear(el); this.chartSig = null; return; }
      const sig = [this.hist.result, this.kpi.result, this.ev.result];
      if (this.chartSig && sig.every((x, i) => x === this.chartSig[i])) return;
      this.chartSig = sig;
      const css = (v) => WF.charts.css(v), mono = OG.axisMono(), LINE = css('--fc-line'), HIST = css('--fc-hist');   // Forecast's blue, as on Net worth
      const hist = WF.rows(this.hist).map((r) => [fmt.ymd(r.d), Number(r.v)]);
      const fwd = days.map((x) => [x.d, Math.round(x.bal)]);
      const low = days.slice(1).reduce((m, x) => (x.bal < m.bal ? x : m), days[1]);
      const marks = days.filter((x) => x.ev.length).map((x) => ({ value: [x.d, Math.round(x.bal)],
        name: x.ev.map((r) => `${r.l} ${n(r.a) > 0 ? '+' : '−'}${approx(Math.abs(n(r.a)))}`).join(' · '),
        itemStyle: x.ev.some((r) => n(r.a) > 0) ? { color: css('--flow-in'), borderColor: css('--surface'), borderWidth: 2 } : { color: css('--surface'), borderColor: css('--flow-out'), borderWidth: 2 } }));
      WF.charts.chart(el).setOption({
        animation: false, textStyle: { fontFamily: DS.font('sans') },
        grid: { left: 0, right: 72, top: 24, bottom: 36 },
        tooltip: { ...OG.tip((v) => money(v)), trigger: 'axis', formatter: (ps) => {
          const p = ps.find((x) => x.seriesName === 'Expected') ?? ps.find((x) => x.seriesName === 'So far');
          if (!p) return '';
          const d = p.value[0], day = days.find((x) => x.d === d), est = d > WF.asOf;
          return `<div class="tp-title">${esc(dayMon(d))}</div>${est ? `≈ <b>${approx(p.value[1])}</b> <span class="muted">expected</span>` : `<b>${money(p.value[1])}</b>`}
            ${day?.ev.length ? `<br>${day.ev.map((r) => `${esc(r.l)} <b>${n(r.a) > 0 ? '+' : '−'}${money(Math.abs(n(r.a)))}</b>`).join('<br>')}` : ''}`;
        } },
        xAxis: { type: 'time', axisTick: { show: false }, axisLine: { show: false }, splitLine: { show: false },
          axisLabel: { ...mono, hideOverlap: true, margin: 16, formatter: (v) => dayMon(new Date(v).toISOString().slice(0, 10)) } },
        yAxis: { type: 'value', position: 'right', scale: true, splitNumber: 4, axisLabel: { ...mono, formatter: (v) => approx(v), margin: 16 },
          splitLine: { lineStyle: { color: css('--chart-grid'), type: [3, 4] } } },
        series: [
          { type: 'line', name: 'So far', data: hist, showSymbol: false, step: 'end', lineStyle: { width: 2, color: HIST }, itemStyle: { color: HIST },
            markLine: { symbol: 'none', silent: true, lineStyle: { color: css('--ink-3'), type: 'solid', width: 1 },
              label: { color: css('--ink-2'), fontFamily: DS.font('font-label'), fontSize: DS.fs('label'), formatter: 'Today', position: 'end' }, data: [{ xAxis: WF.asOf }] } },
          { type: 'line', name: 'Expected', data: fwd, showSymbol: false, lineStyle: { width: 2, color: LINE, type: [6, 4] }, itemStyle: { color: LINE },
            // the low as a dot only: the runway above names it in words
            markPoint: { symbol: 'circle', symbolSize: 9, silent: true, itemStyle: { color: LINE, borderColor: css('--surface'), borderWidth: 2 },
              label: { show: false }, data: [{ coord: [low.d, Math.round(low.bal)] }] } },
          { type: 'scatter', name: 'Movements', data: marks, symbolSize: 10, z: 5, tooltip: { show: false } },
        ],
      }, { replaceMerge: ['series'] });
      $('fc-c-key').innerHTML = `<span class="k"><span class="sw ln fc-sw-hist"></span>So far</span><span class="k"><span class="sw dash fc-sw-recent"></span>Expected</span>
        <span class="k"><span class="sw dot fc-dot-in"></span>Money in</span><span class="k"><span class="sw dot hollow fc-dot-out"></span>Money out</span>`;
    },
    // ----- the runway: the month's swing on one bar. lo / hi = the lowest and highest expected balance after today (ties to the
    // earliest day, as the chart's Lowest point); the track runs from the low to the peak, widened to hold today.
    runway(days) {
      const f = days.slice(1);
      const lo = f.reduce((m, x) => (x.bal < m.bal ? x : m), f[0]), hi = f.reduce((m, x) => (x.bal > m.bal ? x : m), f[0]);
      const today = days[0].bal, end = days.at(-1).bal;
      return { lo: { d: lo.d, bal: lo.bal }, hi: { d: hi.d, bal: hi.bal }, today, end,
        from: Math.min(lo.bal, today), to: Math.max(hi.bal, today), short: lo.bal < 0 };
    },
    // 19 Oct, round 3 (Nhi: "hard to understand, find another way"): the month as a story in date order. The four points
    // (today, the lowest, the peak, in 30 days) are tiles, and between each pair a leg says how much the cash moves and what
    // mostly moves it (the biggest expected movement in between, or everyday spending when there is none). No bar to read.
    // Only the end (the hero) is traced; the rest are worked out here, like the chart's.
    runwayHtml() {
      if (!(WF.status(this.kpi, null) && WF.status(this.ev, null))) return '';
      const days = this.days(), r = this.runway(days), k = WF.one(this.kpi), end = addDays(WF.asOf, 30);
      const pts = [
        { k: 'lo', at: r.lo.d, bal: r.lo.bal, v: `≈ ${approx(r.lo.bal)}`, t: r.short ? '<span class="fc-rw-short">Runs short</span>' : 'Lowest' },
        { k: 'today', at: WF.asOf, bal: r.today, v: approx(r.today), t: 'Today' },
        { k: 'end', at: end, bal: r.end, v: `≈ <span data-trace="${this.kpi.name}:x">${approx(k.x)}</span>`, t: 'In 30 days' },
        { k: 'hi', at: r.hi.d, bal: r.hi.bal, v: `≈ ${approx(r.hi.bal)}`, t: 'Peak' },
      ].sort((a, b) => a.at.localeCompare(b.at) || (a.k === 'today' ? -1 : b.k === 'today' ? 1 : a.k === 'end' ? 1 : b.k === 'end' ? -1 : 0));
      // what mostly moves the cash between two points: the biggest movement after a and up to b
      const evs = WF.rows(this.ev).map((x) => ({ d: fmt.ymd(x.d), l: x.l, a: n(x.a) }));
      const cause = (a, b) => {
        const list = evs.filter((x) => x.d > a.at && x.d <= b.at).sort((x, y) => Math.abs(y.a) - Math.abs(x.a));
        if (!list.length) return 'Everyday spending';
        return `${esc(list[0].l)}${list.length > 1 ? ` <span class="more">+ ${list.length - 1} more</span>` : ''}`;
      };
      const leg = (a, b) => { const d = b.bal - a.bal, dir = d >= 0 ? 'up' : 'down';
        return `<div class="fc-sw-leg ${dir}" aria-hidden="true"><span class="amt">${d >= 0 ? '+' : '−'}${approx(Math.abs(d))}</span>
          <span class="ln"></span><span class="why">${cause(a, b)}</span></div>`; };
      const tile = (p) => `<div class="fc-rw-item fc-rw-${p.k}" data-k="${p.k}"><span class="fc-rw-t"><span class="fc-rw-dot" aria-hidden="true"></span>${p.t}</span>
          <span class="fc-rw-lab"><span class="v">${p.v}</span><span class="d">${esc(dayMon(p.at))}</span></span></div>`;
      const label = `From ${approx(r.today)} today, lowest ≈${approx(r.lo.bal)} on ${dayMon(r.lo.d)}${r.short ? ', so you would run short' : ''}, `
        + `peak ≈${approx(r.hi.bal)} on ${dayMon(r.hi.d)}, ≈${approx(r.end)} in 30 days`;
      const say = r.short ? `<span class="neg">Runs short on ${esc(dayMon(r.lo.d))}</span>: about <b>${approx(r.lo.bal)}</b> at its lowest, then up to <b>${approx(r.hi.bal)}</b>`
        : `Your cash stays between <b>≈ ${approx(r.lo.bal)}</b> and <b>≈ ${approx(r.hi.bal)}</b> over the next 30 days`;
      return `<div class="tp-title">Highs and lows</div><div class="fc-runway" id="fc-runway" role="group" aria-label="${esc(label)}"><p class="fc-rw-say">${say}</p>
        <div class="fc-sw-story">${pts.map((p, i) => `${i ? leg(pts[i - 1], p) : ''}${tile(p)}`).join('')}</div></div>`;
    },
    drawItems(days) {
      const k = WF.one(this.kpi), id = this.kpi.name;
      // 19 Oct (Nhi: "cluttered, the tag too close to the value"): the Recurring list's rows (name over its detail · the tag ·
      // the amount, in fixed columns), under day heads that carry the balance after the day
      const rows = days.filter((x) => x.ev.length).map((x) => `<div class="sp-day">${OG.dayHead(x.d, `<span class="muted">balance after</span> <span class="num">≈ ${approx(x.bal)}</span>`)}
        ${x.ev.map((r) => { const t = KIND[r.k] ?? KIND.card;
          return OG.row({ cls: 'tx-row fc-item', title: esc(r.l), meta: esc(r.det ?? ''),
            value: `${OG.txTag(t.tag, t.icon, WF.charts.css(t.tone))}<span class="amt${n(r.a) > 0 ? ' pos' : ''}">${n(r.a) > 0 ? '+' : '−'}${money(Math.abs(n(r.a)))}</span>` }); }).join('')}</div>`).join('');
      $('fc-items-list').innerHTML = `${rows || '<div class="state">Nothing expected in or out in the next 30 days.</div>'}
        <div class="sp-day fc-every">${OG.row({ cls: 'tx-row fc-item fc-item-every', title: '<span data-hc="fc-everyday">Everyday spending</span>', meta: 'Every day, an estimate',
          value: `<span></span><span class="amt">≈ −<span data-trace="${id}:e">${approx(k.e)}</span> a day</span>` })}</div>`;
    },
    drawNotes(days) {
      const sig = [this.kpi.result, this.ev.result, this.io.result];
      if (this.notesSig && sig.every((x, i) => x === this.notesSig[i])) return;
      this.notesSig = sig;
      const k = WF.one(this.kpi), id = this.kpi.name, io = WF.status(this.io, null) ? WF.one(this.io) : {}, ev = WF.rows(this.ev), out = [];
      const low = days.slice(1).reduce((m, x) => (x.bal < m.bal ? x : m), days[1]);
      const pay = ev.find((r) => r.k === 'income');
      const before = pay && fmt.ymd(pay.d) > low.d;
      out.push({ k: 'low', icon: low.bal < 0 ? 'trend-down' : 'activity', tone: low.bal < 0 ? 'neg' : '',
        html: `Lowest point <span class="em">≈ ${approx(low.bal)}</span> on ${esc(dayMon(low.d))}${before ? ', the day before payday' : ''}${low.bal < 0 ? ': you would run short' : ''}`, why: 'The lowest day in the next 30',
        go: () => $('fc-c-chart').scrollIntoView({ behavior: 'smooth', block: 'center' }) });
      const outs = ev.filter((r) => n(r.a) < 0);
      if (pay && outs.length) {
        const after = outs.filter((r) => fmt.ymd(r.d) >= fmt.ymd(pay.d)).reduce((s, r) => s - n(r.a), 0);
        if (after > 0) out.push({ k: 'pay', icon: 'dollar', tone: 'pos',
          html: `Payday on ${esc(dayMon(pay.d))} brings <span class="em" data-trace="${this.io.name}:i">${approx(io.i ?? pay.a)}</span>; ${approx(after)} of it leaves again for ${esc([...new Set(outs.filter((r) => fmt.ymd(r.d) >= fmt.ymd(pay.d)).map((r) => r.l))].join(' and '))}`, why: 'Payday, and the bills due after it',
          go: () => $('fc-items-list').scrollIntoView({ behavior: 'smooth', block: 'center' }) });
      }
      out.push({ k: 'every', icon: 'bag', tone: '',
        html: `Everyday spending from the bank runs <span class="em" data-trace="${id}:e">${approx(k.e)}</span> a day, about ${approx(n(k.e) * 30)} over the month`, why: 'Your daily average over the last 90 days',
        go: () => WF.go('spending/transactions') });
      this.notes = out.slice(0, 4);
      $('fc-c-notes-list').innerHTML = OG.notes(this.notes);
    },
    // in, out and net over the 30 days: Net worth's Summary anatomy (a side header, a split bar, the lines)
    drawSum() {
      const k = WF.one(this.kpi), id = this.kpi.name, io = WF.status(this.io, null) ? WF.one(this.io) : null, ev = WF.rows(this.ev);
      if (!io) return;
      const ins = ev.filter((r) => n(r.a) > 0), outs = ev.filter((r) => n(r.a) < 0), every = n(k.e) * 30;
      const group = (rows) => { const m = new Map(); rows.forEach((r) => m.set(r.l, (m.get(r.l) ?? 0) + Math.abs(n(r.a)))); return [...m]; };
      const side = (title, total, trace, parts, est = false) => `<div class="nw-sum-side"><div class="nw-sum-hd"><h3>${esc(title)}</h3><span class="amt"${trace ? ` data-trace="${trace}"` : ''}>${est ? '≈ ' : ''}${approx(total)}</span></div>
        ${OG.splitBar(parts.map((p) => ({ label: p.label, value: p.v, tone: p.tone })))}
        ${parts.map((p) => OG.line({ cls: 'nw-sum-line fc-sum-line', lead: `<span class="nw-sw" style="background:var(${p.tone})"></span>`, title: esc(p.label), value: `<span class="amt">${p.est ? '≈ ' : ''}${approx(p.v)}</span>` })).join('')}</div>`;
      const inParts = group(ins).map(([l, v]) => ({ label: l, v, tone: '--flow-in' }));
      const CARD_TONE = { 'MAX VIB': '--card-vib', 'TCB Visa': '--card-tcb' };   // 19 Oct (round 3, Nhi): MAX VIB in yellow, as on Credit
      const outParts = [...group(outs).map(([l, v]) => ({ label: l, v, tone: l === 'Mom' ? '--tone-bonus' : CARD_TONE[l] ?? '--flow-out' })), { label: 'Everyday spending', v: every, tone: '--chart-rest', est: true }];
      const net = n(k.x) - n(k.t);
      $('fc-c-sum-rows').innerHTML = side('Coming in', n(io.i), `${this.io.name}:i`, inParts) + side('Going out', n(io.o) + every, null, outParts, true)
        + OG.line({ cls: 'fc-net', title: 'Net over 30 days', value: `<span class="amt ${OG.tone(net)}" data-trace="${id}:ch">${approx(net, true)}</span>` });
    },
    render() {
      // the 30-day query takes a few seconds: every card says so (or shows the error) until it lands
      const ok = WF.status(this.kpi, $('fc-c-state')) && WF.status(this.ev, $('fc-items-state'), '');
      for (const id of ['fc-items-state', 'fc-c-notes-state', 'fc-c-sum-state']) {
        const e = $(id), src = $('fc-c-state');
        if (!ok) { e.textContent = src.textContent || 'Loading…'; e.classList.toggle('error', src.classList.contains('error')); e.classList.toggle('busy', !src.textContent || src.classList.contains('busy')); e.hidden = false; } else e.hidden = true;
      }
      if (!ok) return;
      const days = this.days();
      this.drawHero();
      this.drawChart(days);
      this.drawItems(days);
      this.drawNotes(days);
      this.drawSum();
    },
  };
  WF.register(view);
})();
