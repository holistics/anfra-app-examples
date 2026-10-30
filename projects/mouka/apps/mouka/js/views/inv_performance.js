// Invest › Performance (18 Oct, the default tab): am I doing well, and why?
// Cards (js/pages.js): inv-ret (hero = ₫ gained over the range, data-own portfolio_gain_loss; the pill is the time-weighted
// return; your return vs the index, day by day; main 8) · inv-vs (the race: you vs the VN-Index, the gap in points; its own
// card since 19 Oct, Nhi; main 8) · inv-bridge (what moved it, as one sum: start + money you added + your gain = now, then
// your gain by where it came from: price moves, dividends and the rest (fees), so it closes to the đồng; main 8) · inv-movers (winners and drags: each holding's price move as a bar
// from a zero line, gains right and losses left, best first; a row opens the holding on Holdings; main 8) ·
// inv-notes (worth knowing; rail 4) ·
// inv-risk (the worst dip, drawn under a waterline at 0%, with volatility under it; rail 4) · inv-inc (dividends and interest; rail 4).
// ONE range drives every card (og7_inv_period, default 1Y). Return, risk and the bridge cover SSI + gold (the Investments
// group): term deposits and cash are not in the return. Income counts every account (term-deposit interest is investment
// income). The account filter (Home › Net worth) does not apply here.
(() => {
  const { fmt } = WF;
  const { $, esc, money, approx, pct1, dayMon } = OG;
  const WEALTH = 'wealth', P = OG.inv.P;
  const INV = "dim_accounts.account_group == 'Investments'";
  const pts = (x) => `${(Math.abs(x) * 100).toFixed(1)} pts`;
  const RW = () => OG.RANGE_WORD[view.range];

  // hover cards: the two risk numbers in plain words
  OG.hc['inv-dd'] = () => '<div class="tp-title">Worst drop</div><div>The biggest fall from a high point to a later low in your time-weighted return over this range. Money you added or took out doesn\'t count.</div>';
  OG.hc['inv-vol'] = () => '<div class="tp-title">Volatility</div><div>How much the daily return swings, scaled to a year. Higher means a bumpier ride, not a worse one.</div>';
  // a Winners and drags row (data-hc-hover: its click opens the holding, so the card opens on hover and focus, never pins)
  OG.hc['inv-mv'] = (el) => {
    const q = WF.views.get('invest/performance')?.pgSym;
    const r = q && WF.status(q, null) ? WF.rows(q).find((x) => x.s === el.dataset.sym) : null;
    if (!r) return '';
    return `<div class="tp-title">${esc(r.s)}${r.n && r.n !== r.s ? ` <span class="muted">${esc(r.n)}</span>` : ''}</div>
      <div class="kv"><span>Price move, ${esc(RW())}</span><span class="v num" data-trace="${q.name}:pg">${money(r.pg, true)}</span></div>
      <div class="muted inv-hc-foot">Opens on Holdings</div>`;
  };

  const view = {
    id: 'invest/performance', nav: 'invest', tab: 'Performance',
    init(el) {
      const app = WF.app;
      this.range = '1Y';
      this.blocks = {
        'inv-ret': () => OG.card({ id: 'inv-ret', label: 'Return', explain: `${P}perf:g`, query: `${P}perf ${P}curve`,
          body: `${OG.heroRow({ id: 'inv-hero', own: 'portfolio_gain_loss' })}
            ${OG.chartBox('inv-chart', 'frame')}${OG.stateLine('inv-state')}
            <div data-anfra-control="${P}period">${OG.ranges('inv-ranges', OG.RANGES, this.range)}</div>
            <p class="inv-scope">SSI Securities and gold. Term deposits and cash are not in the return.</p>` }),
        'inv-vs': () => OG.card({ id: 'inv-vs', label: 'You vs the VN-Index', explain: `${P}perf:b`, query: `${P}perf`,
          body: `<div class="inv-race" id="inv-race" role="img"></div>` }),
        'inv-bridge': () => OG.card({ id: 'inv-bridge', label: 'What moved it', explain: `${P}bridge:pg`, query: `${P}perf ${P}bridge`,
          body: `<div class="inv-eq" id="inv-br-lead"></div>
            <div class="inv-br-parts"><div class="label" id="inv-br-label">Your gain came from</div><div id="inv-br-rows"></div></div>
            ${OG.stateLine('inv-br-state')}` }),
        'inv-movers': () => OG.card({ id: 'inv-movers', label: 'Winners and drags', explain: `${P}pg_sym:pg`, query: `${P}pg_sym`,
          body: `<div class="inv-movers" id="inv-movers-list" role="group"></div>${OG.stateLine('inv-mv-state')}` }),
        'inv-notes': () => OG.card({ id: 'inv-notes', label: 'Worth knowing', query: `${P}perf ${P}curve ${P}pg_sym`,
          body: `<div id="inv-notes-list"></div>${OG.stateLine('inv-notes-state')}` }),
        'inv-risk': () => OG.card({ id: 'inv-risk', label: 'Risk', explain: `${P}perf:dd`, query: `${P}perf ${P}curve`,
          body: `<div class="hero inv-risk-k" id="inv-risk-k"></div><p class="sub inv-risk-sub" id="inv-risk-sub"></p>
            ${OG.chartBox('inv-dip', 'inv-dip')}<p class="inv-risk-vol" id="inv-risk-vol"></p>${OG.stateLine('inv-risk-state')}` }),
        'inv-inc': () => OG.card({ id: 'inv-inc', label: 'Income', explain: `${P}inc:t`, query: `${P}inc ${P}inc_m`,
          body: `<div class="sub" id="inv-inc-word"></div><div class="hero inv-inc-v" id="inv-inc-v"></div>
            ${OG.chartBox('inv-inc-chart', 'inv-inc-chart')}<div id="inv-inc-k"></div>${OG.stateLine('inv-inc-state')}` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));
      $('inv-dip').setAttribute('role', 'img');   // a pure picture: the traced number and volatility sit outside it

      this.perf = WF.q(`${P}perf`, { dataset: WEALTH,
        metrics: { g: 'portfolio_gain_loss', twr: 'twr', b: 'benchmark_return', vol: 'volatility', dd: 'max_drawdown', s: 'invested_value_start', e: 'invested_value_end', f: 'invested_net_flows' },
        aql: 'explore { measures { g: portfolio_gain_loss, twr: twr, b: benchmark_return, vol: volatility, dd: max_drawdown, s: invested_value_start, e: invested_value_end, f: invested_net_flows } }' });
      this.curve = WF.q(`${P}curve`, { dataset: WEALTH, pageSize: 1000, metrics: { p: 'cumulative_twr', b: 'cumulative_benchmark' },
        aql: 'explore { dimensions { d: dim_dates.date_key } measures { p: cumulative_twr, b: cumulative_benchmark } sorts { d asc } }' });
      // the parts of the gain (SSI + gold, the scope of portfolio_gain_loss): price moves and dividends; the rest is fees
      this.bridge = WF.q(`${P}bridge`, { dataset: WEALTH, metrics: { pg: 'price_gain', dv: 'dividend_income' },
        aql: `explore { measures { pg: price_gain, dv: dividend_income } filters { ${INV} } }` });
      this.pgSym = WF.q(`${P}pg_sym`, { dataset: WEALTH, pageSize: 50, metrics: { pg: 'price_gain' },
        aql: `explore { dimensions { s: dim_assets.symbol, n: dim_assets.name } measures { pg: price_gain } filters { ${INV} } sorts { pg desc } }` });
      this.inc = WF.q(`${P}inc`, { dataset: WEALTH, metrics: { t: 'investment_income', d: 'dividend_income', i: 'interest_income', avg: 'income_monthly_avg' },
        aql: 'explore { measures { t: investment_income, d: dividend_income, i: interest_income, avg: income_monthly_avg } }' });
      this.incM = WF.q(`${P}inc_m`, { dataset: WEALTH, metrics: { t: 'investment_income' },
        aql: 'explore { dimensions { m: dim_dates.date_key | month() } measures { t: investment_income } sorts { m asc } }' });
      this.period = WF.dateControl(`${P}period`);
      for (const q of [this.perf, this.curve, this.bridge, this.pgSym, this.inc, this.incM]) app.mapControl(this.period, q, { field: 'dim_dates.date_key' });
      OG.inv.holdQ();   // a mover row opens its holding: the drawer reads this

      OG.bindKeys($('inv-ranges'), (k) => this.setRange(k));
      OG.bindKeys($('inv-notes-list'), (k) => this.notes?.find((n) => n.k === k)?.go());
      // a mover row opens its holding on Holdings (its hover card closes first: its row is about to hide); focus opens the card
      const mv = $('inv-movers-list'), go = (r) => { OG.hcClose(); OG.inv.open(r.dataset.sym); OG.hcClose(); };
      mv.addEventListener('click', (e) => { const r = e.target.closest('[data-sym]'); if (r) go(r); });
      mv.addEventListener('keydown', (e) => { const r = e.target.closest('[data-sym]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(r); } });
      mv.addEventListener('focusin', (e) => { const r = e.target.closest('.inv-mv[data-hc-hover]'); if (r) OG.hcOpen(r); });
      mv.addEventListener('focusout', () => OG.hcClose());
      this.setRange(this.range);
    },
    setRange(k) {
      this.range = k;
      WF.setPeriod(this.period, k);
      OG.setActive($('inv-ranges'), k);
      this.chartSig = null;
      this.dipSig = null;
      WF.app.execute();
    },
    // ----- the worst drop, from the curve the chart draws: the peak before the lowest point, and the day it got back
    drop() {
      if (!WF.status(this.curve, null)) return null;
      const rows = WF.rows(this.curve).map((r) => ({ d: fmt.ymd(r.d), x: 1 + (fmt.n(r.p) ?? 0) }));
      let peak = rows[0], best = null;
      for (const r of rows) {
        if (r.x > peak.x) peak = r;
        const dd = r.x / peak.x - 1;
        if (!best || dd < best.dd) best = { dd, peak, trough: r };
      }
      if (!best || best.dd >= 0) return null;
      const back = rows.find((r) => r.d > best.trough.d && r.x >= best.peak.x);
      return { ...best, back: back?.d ?? null };
    },
    // ----- the dip, day by day: how far under its running high the return sits (the same maths as drop(), so the
    // curve's lowest point is drop().trough). [day, dd], dd ≤ 0.
    dips() {
      if (!WF.status(this.curve, null)) return [];
      let peak = null;
      return WF.rows(this.curve).map((r) => {
        const x = 1 + (fmt.n(r.p) ?? 0);
        if (peak === null || x > peak) peak = x;
        return [fmt.ymd(r.d), x / peak - 1];
      });
    },
    // ----- the dip as drawn: about 36 points, each the lowest real day of its stretch (a week over 1Y), plus the first
    // and last day and the day it got back, so the shape reads as one dip, not daily noise. The trough is the first lowest
    // day overall, so it is its stretch's pick and the drawn low stays exactly drop().trough.
    calm(d, back) {
      const n = d.length, k = Math.max(1, Math.ceil(n / 36)), keep = new Set([0, n - 1]);
      for (let a = 0; a < n; a += k) {
        let lo = a;
        for (let i = a + 1; i < Math.min(n, a + k); i++) if (d[i][1] < d[lo][1]) lo = i;
        keep.add(lo);
      }
      if (back) keep.add(d.findIndex((x) => x[0] === back));
      return [...keep].filter((i) => i >= 0).sort((a, b) => a - b).map((i) => d[i]);
    },
    // ----- the race: you and the VN-Index on one scale from min(0, you, index) to max(0, you, index); a bar grows from 0
    // (left when negative, past a zero tick). The two % are the governed perf figures; the gap in points is page arithmetic.
    race(you, ix) {
      const lo = Math.min(0, you, ix), hi = Math.max(0, you, ix), gap = (you - ix) * 100;
      return { lo, hi, zero: lo < 0, gap, word: Math.abs(gap) < 0.1 ? 'level' : gap > 0 ? 'ahead' : 'behind' };
    },
    drawRace(k, id) {
      const you = fmt.n(k.twr) ?? 0, ix = fmt.n(k.b) ?? 0, r = this.race(you, ix);
      const at = (v) => ((v - r.lo) / ((r.hi - r.lo) || 1)) * 100, z = at(0), a = at(you), b = at(ix), m = (a + b) / 2;
      const gap = r.word === 'level' ? 'level with the VN-Index' : `${Math.abs(r.gap).toFixed(1)} pts ${r.word}`;
      const lane = (key, name, v, x) => `<div class="inv-lane" data-k="${key}" style="--inv-x:${x}%">
          <span class="nm">${name}</span><div class="inv-scale"><i class="bar"></i>
          <span class="pct${v < 0 ? ' l' : ''}" data-trace="${id}:${key === 'you' ? 'twr' : 'b'}">${pct1(v, true)}</span></div></div>`;
      const el = $('inv-race');
      el.classList.toggle('has-zero', r.zero);
      el.style.setProperty('--inv-z', `${z}%`);
      el.setAttribute('aria-label', `${RW()[0].toUpperCase()}${RW().slice(1)}: you ${pct1(you, true)}, the VN-Index ${pct1(ix, true)}, ${gap === 'level with the VN-Index' ? 'level with it' : gap}.`);
      el.innerHTML = `${lane('you', 'You', you, a)}
        <div class="inv-gap" data-w="${r.word}"><div class="inv-scale">${r.word === 'level' ? '' : `<i class="dash" style="left:${Math.min(a, b)}%;width:${Math.abs(a - b)}%"></i>`}
          <span class="lbl" style="left:${m}%;transform:translateX(-${m}%)"><span id="inv-race-gap">${gap}</span><span class="w"> · ${esc(RW())}</span></span></div></div>
        ${lane('ix', 'VN-Index', ix, b)}
        ${r.zero ? '<div class="inv-zero" aria-hidden="true"><div class="inv-scale"><span>0%</span></div></div>' : ''}`;
      // centre the gap's words on the connector, kept inside the scale (the words' width doesn't change with the window,
      // the scale's does, so this holds on resize). Hidden (width 0): the translate above already keeps them inside.
      const lbl = el.querySelector('.inv-gap .lbl'), w = lbl.offsetWidth;
      if (w) Object.assign(lbl.style, { transform: 'none', left: `clamp(0px, calc(${m}% - ${w / 2}px), calc(100% - ${w}px))` });
    },
    drawRet() {
      if (WF.status(this.perf, null)) {
        const k = WF.one(this.perf), id = this.perf.name, t = OG.tone(k.twr);
        $('inv-hero').innerHTML = `<span data-trace="${id}:g">${money(k.g, true)}</span>`;
        // the pill is the return (the arrow carries the sign); the index over the same days is the race under it
        $('inv-hero-delta').innerHTML = `<span class="dpill${t ? ` ${t}` : ''}">${fmt.n(k.twr) ? OG.icon(fmt.n(k.twr) > 0 ? 'arrow-up' : 'arrow-down') : ''}<span data-trace="${id}:twr">${pct1(Math.abs(fmt.n(k.twr) ?? 0))}</span></span>`;
        if (this.raceSig !== this.perf.result) { this.raceSig = this.perf.result; this.drawRace(k, id); }   // redraw (and run) only on new numbers
      }
      const el = $('inv-chart');
      if (!WF.status(this.curve, $('inv-state'), 'No returns in this range.')) { WF.charts.clear(el); this.chartSig = null; return; }
      if (this.chartSig === this.curve.result) return;
      this.chartSig = this.curve.result;
      const rows = WF.rows(this.curve);
      echarts.getInstanceByDom(el)?.clear();
      OG.area(el, rows.map((r) => fmt.ymd(r.d)), rows.map((r) => Number(r.p)), { areaFill: false, scale: true, signed: true, yFmt: (v) => pct1(v), tipFmt: (v) => pct1(v, true),
        compare: [{ name: 'VN-Index', data: rows.map((r) => Number(r.b)) }] });
      // the tooltip names the gap between the two lines in points
      // the race carries the headline, so the chart is shorter: fewer y ticks keep its labels apart at every width
      WF.charts.chart(el).setOption({ yAxis: { splitNumber: 3 }, tooltip: { formatter: (ps) => {
        const you = ps.find((p) => p.seriesName === 'Value'), ix = ps.find((p) => p.seriesName === 'VN-Index');
        if (!you) return '';
        const gap = ix ? Number(you.value) - Number(ix.value) : null;
        return `<div class="tp-title">${esc(dayMon(you.name))}</div>You <b>${pct1(you.value, true)}</b>${ix ? ` · VN-Index <b>${pct1(ix.value, true)}</b><br>${gap >= 0 ? 'Ahead' : 'Behind'} by <b>${pts(gap)}</b>` : ''}`;
      } } });
    },
    // ----- what moved it (19 Oct, Nhi: "hard to understand"): one sum you can read left to right, start + money you added +
    // your gain = now, where your gain is the hero; then your gain by where it came from: price moves + dividends + the rest.
    // The rest is computed (the gain minus its two governed parts) and shown only when it isn't zero, so the rows always
    // close to the đồng.
    drawBridge() {
      if (!(WF.status(this.perf, $('inv-br-state')) && WF.status(this.bridge, $('inv-br-state')))) return;
      const sig = [this.perf.result, this.bridge.result];
      if (this.brSig && sig.every((r, i) => r === this.brSig[i])) return;
      this.brSig = sig;
      const k = WF.one(this.perf), b = WF.one(this.bridge), id = this.perf.name, bid = this.bridge.name;
      const n = (v) => fmt.n(v) ?? 0;
      const rest = n(k.g) - n(b.pg) - n(b.dv);
      const [a, z] = WF.range(this.range), yrs = a.slice(0, 4) !== z.slice(0, 4);
      const day = (d) => (yrs ? `${dayMon(d)}, ${d.slice(0, 4)}` : dayMon(d));
      // a term of the sum: its name, the value, the date under it; op = the sign before it (+ / − / =), the value unsigned
      const term = (key, name, v, trace, when, op) => `<div class="inv-eq-t" data-part="${key}">${op ? `<span class="op" aria-hidden="true">${op}</span>` : ''}
          <span class="k">${esc(name)}</span><span class="v${key === 'g' ? ` ${OG.tone(v)}` : ''}" data-trace="${trace}">${approx(Math.abs(v))}</span>${when ? `<span class="d">${esc(when)}</span>` : '<span class="d"></span>'}</div>`;
      const sign = (v) => (v < 0 ? '−' : '+');
      $('inv-br-lead').innerHTML = `${term('s', 'Invested', n(k.s), `${id}:s`, day(a))}
        ${term('f', n(k.f) < 0 ? 'You took out' : 'You added', n(k.f), `${id}:f`, '', sign(n(k.f)))}
        ${term('g', n(k.g) < 0 ? 'Your loss' : 'Your gain', n(k.g), `${id}:g`, '', sign(n(k.g)))}
        ${term('e', 'Invested now', n(k.e), `${id}:e`, day(z), '=')}`;
      $('inv-br-lead').setAttribute('aria-label', `${day(a)}: ${approx(k.s)} invested, ${n(k.f) < 0 ? 'minus' : 'plus'} ${approx(Math.abs(n(k.f)))} ${n(k.f) < 0 ? 'taken out' : 'added'}, ${n(k.g) < 0 ? 'minus' : 'plus'} ${approx(Math.abs(n(k.g)))} ${n(k.g) < 0 ? 'lost' : 'gained'}, equals ${approx(k.e)} on ${day(z)}.`);
      $('inv-br-lead').setAttribute('role', 'group');
      const parts = [
        { key: 'pg', name: 'Price moves', v: n(b.pg), trace: `${bid}:pg`, tone: '--tone-invest' },
        { key: 'dv', name: 'Dividends', v: n(b.dv), trace: `${bid}:dv`, tone: '--tone-interest' },
        ...(Math.abs(rest) >= 1 ? [{ key: 'rest', name: 'Fees & other', v: rest, tone: '--chart-rest', hc: 'inv-rest' }] : []),
      ];
      const max = Math.max(1, ...parts.map((p) => Math.abs(p.v)));
      $('inv-br-rows').innerHTML = parts.map((p) => {
        const val = `<span class="v ${OG.tone(p.v)}"${p.trace ? ` data-trace="${p.trace}"` : ''}${p.hc ? ` data-hc="${p.hc}"` : ''}>${approx(p.v).replace(/^₫/, p.v > 0 ? '+₫' : '₫')}</span>`;
        return `<div class="pace-row inv-br-row" data-part="${p.key}"><span class="t">${esc(p.name)}</span>${val}
          <div class="pace-bar" aria-hidden="true"><div style="width:${(Math.abs(p.v) / max) * 100}%;background:var(${p.tone})${p.v < 0 ? ';opacity:.55' : ''}"></div></div></div>`;
      }).join('');
    },
    // ----- winners and drags: the holdings with a price move, best first. More than 8: the top 4 and the bottom 3, and how
    // many sit between them. pg arrives as a string from the query (a number from the tests).
    movers(rows) {
      const v = (r) => fmt.n(r.pg) ?? 0;
      const all = rows.filter((r) => v(r) !== 0).sort((a, b) => v(b) - v(a));
      return all.length > 8 ? { shown: [...all.slice(0, 4), ...all.slice(-3)], more: all.length - 7 } : { shown: all, more: 0 };
    },
    // the bars share one scale from the biggest loss to the biggest gain, so zero sits at maxLoss / (maxLoss + maxGain) of
    // the plot; the symbols have their own column left of the plot and the values sit in the plot's gutters at each bar's
    // outer end, so a bar never runs into a label
    drawMovers() {
      const el = $('inv-movers-list'), st = $('inv-mv-state'), none = 'No price moves in this range.';
      const blank = () => { el.innerHTML = ''; el.removeAttribute('aria-label'); this.mvSig = null; };
      if (!WF.status(this.pgSym, st, none)) { blank(); return; }
      // rows that all moved 0 are empty too: WF.status hid the line, so say so again on every render
      const n = (r) => fmt.n(r.pg) ?? 0, { shown, more } = this.movers(WF.rows(this.pgSym)), id = this.pgSym.name;
      if (!shown.length) { blank(); st.textContent = none; st.hidden = false; return; }
      if (this.mvSig === this.pgSym.result) return;   // keep focus across redraws
      this.mvSig = this.pgSym.result;
      const lo = Math.max(0, ...shown.map((r) => -n(r))), hi = Math.max(0, ...shown.map((r) => n(r))), span = lo + hi;
      const at = (x) => ((x + lo) / span) * 100;
      el.style.setProperty('--inv-z', `${at(0)}%`);
      el.classList.toggle('has-gain', hi > 0);
      el.classList.toggle('has-loss', lo > 0);
      const best = shown[0], worst = shown.at(-1);
      el.setAttribute('aria-label', `Price moves by holding, ${RW()}, best first${n(best) > 0 ? `: ${best.s} led with ${approx(best.pg, true)}` : ''}${n(worst) < 0 ? `, ${worst.s} dragged ${approx(worst.pg, true)}` : ''}.`);
      const row = (r) => {
        const x = n(r), neg = x < 0, a = approx(r.pg, true);
        return `<div class="inv-mv" data-sym="${esc(r.s)}" data-hc-hover="inv-mv" role="button" tabindex="0" aria-label="${esc(r.s)}, price move ${a}, open on Holdings"
            style="--inv-x:${at(x)}%">
          <span class="s">${esc(r.s)}</span>
          <span class="inv-mv-plot"><i class="inv-mv-bar${neg ? ' neg' : ''}"></i><span class="amt${neg ? ' l' : ''}" data-trace="${id}:pg">${a}</span></span></div>`;
      };
      const k = more ? 4 : shown.length;
      el.innerHTML = `${shown.slice(0, k).map(row).join('')}${more ? `<div class="inv-mv-more">and ${more} more</div>` : ''}${shown.slice(k).map(row).join('')}`;
    },
    // ----- worth knowing: up to four notes, biggest first, each only when its fact holds; every figure from a query above
    drawNotes() {
      if (!WF.status(this.perf, $('inv-notes-state'))) return;
      const sig = [this.perf.result, this.pgSym.result, this.curve.result, this.range];
      if (this.notesSig && sig.every((r, i) => r === this.notesSig[i])) return;   // keep focus / hover across redraws
      this.notesSig = sig;
      const k = WF.one(this.perf), n = (v) => fmt.n(v) ?? 0, out = [];
      const gap = n(k.twr) - n(k.b);
      out.push({ k: 'gap', icon: gap >= 0 ? 'trend' : 'trend-down', tone: gap >= 0 ? 'pos' : 'neg',
        html: `${gap >= 0 ? 'Ahead of' : 'Behind'} the VN-Index by <span class="em">${pts(gap)}</span> ${esc(RW())}`, why: 'Your return against the market, same days',
        go: () => $('inv-chart').scrollIntoView({ behavior: 'smooth', block: 'center' }) });
      if (WF.status(this.pgSym, null)) {
        const rows = WF.rows(this.pgSym), up = rows.filter((r) => n(r.pg) > 0), sumUp = up.reduce((a, r) => a + n(r.pg), 0);
        const top = up[0], low = [...rows].sort((a, b) => n(a.pg) - n(b.pg))[0];
        if (top && sumUp > 0) out.push({ k: 'top', icon: 'trend', tone: 'pos',
          html: `<span class="em">${esc(top.s)}</span> added <span class="num" data-trace="${this.pgSym.name}:pg">${approx(top.pg)}</span>, ${Math.round((n(top.pg) / sumUp) * 100)}% of what prices added`, why: 'The holding whose price added the most', go: () => OG.inv.open(top.s) });
        if (low && n(low.pg) < 0) out.push({ k: 'drag', icon: 'trend-down', tone: 'neg',
          html: `<span class="em">${esc(low.s)}</span> cost you <span class="num" data-trace="${this.pgSym.name}:pg">${approx(Math.abs(n(low.pg)))}</span> in price moves`, why: 'The holding whose price cost the most', go: () => OG.inv.open(low.s) });
      }
      const dr = this.drop();
      if (dr && dr.dd < -0.01) out.push({ k: 'drop', icon: 'activity', tone: '',
        html: `Fell <span class="em" data-trace="${this.perf.name}:dd">${pct1(Math.abs(n(k.dd)))}</span> from ${esc(dayMon(dr.peak.d))} to ${esc(dayMon(dr.trough.d))}, ${dr.back ? `back by ${esc(dayMon(dr.back))}` : 'not back yet'}`, why: 'Your worst fall from a high, when over 1%',
        go: () => $('inv-risk-k').scrollIntoView({ behavior: 'smooth', block: 'center' }) });
      this.notes = out.slice(0, 4);
      $('inv-notes-list').innerHTML = OG.notes(this.notes);
      this.el.querySelector('[data-anfra-block="inv-notes"]').hidden = !this.notes.length;
    },
    // ----- risk: the governed worst drop as the card's number, the dip drawn under a waterline at 0% (its low dotted
    // with the day, the day it got back marked on the waterline), and volatility in a quiet line under it
    drawRisk() {
      if (WF.status(this.perf, null)) {
        const k = WF.one(this.perf), id = this.perf.name;
        $('inv-risk-k').innerHTML = `<span data-hc="inv-dd" data-trace="${id}:dd">${pct1(k.dd)}</span>`;
        $('inv-risk-vol').innerHTML = `Volatility <span class="num" data-hc="inv-vol" data-trace="${id}:vol">${pct1(k.vol)}</span>`;
      }
      const el = $('inv-dip'), sub = $('inv-risk-sub'), st = $('inv-risk-state');
      // still loading, or failed: the state line says so (never "No drop", which would be a claim about the money)
      if (this.curve.state === 'error' || !this.curve.result) {
        WF.status(this.curve, st); sub.textContent = ''; el.hidden = true; WF.charts.clear(el); this.dipSig = null; return;
      }
      st.hidden = true;
      const dr = WF.status(this.curve, null) ? this.drop() : null;
      const days = dr?.back ? OG.daysBetween(dr.trough.d, dr.back) : null, dw = `${days} day${days === 1 ? '' : 's'}`;
      sub.textContent = !dr ? 'No drop in this range.' : dr.back ? `worst dip, back in ${dw}` : 'worst dip, not back yet';
      el.hidden = !dr;
      if (!dr) { WF.charts.clear(el); this.dipSig = null; return; }
      el.setAttribute('aria-label', `The worst dip: ${pct1(Math.abs(dr.dd))} down from a high on ${dayMon(dr.peak.d)} to a low on ${dayMon(dr.trough.d)}, ${dr.back ? `back on ${dayMon(dr.back)}, ${dw} later` : 'not back yet'}.`);
      if (this.dipSig === this.curve.result) return;   // redraw only on new rows
      this.dipSig = this.curve.result;
      const d = this.calm(this.dips(), dr.back), n = d.length, css = WF.charts.css;
      const at = (day) => d.findIndex((x) => x[0] === day);
      // a label near either end of the plot hangs inward, so it never runs past the edge or into the axis labels
      const align = (i) => (i < n * 0.2 ? 'left' : i > n * 0.8 ? 'right' : 'center');
      const lab = (color, pos, i) => ({ show: true, position: pos, distance: 6, align: align(i), color, fontFamily: DS.font('sans'), fontSize: DS.fs('label') });
      const end = dr.back ?? d[n - 1][0];
      echarts.getInstanceByDom(el)?.clear();
      WF.charts.chart(el).setOption({
        animation: false, textStyle: { fontFamily: DS.font('sans') },
        grid: { left: 0, right: 52, top: 22, bottom: 22 },
        tooltip: { ...OG.tip(null), axisPointer: { type: 'line', lineStyle: { color: css('--chart-ref') } },
          formatter: (ps) => { const p = ps[0]; return p ? `${esc(dayMon(p.value[0]))} · <b>${pct1(p.value[1])}</b>` : ''; } },
        xAxis: { type: 'category', data: d.map((x) => x[0]), boundaryGap: false, show: false },
        // two ticks only: the waterline (0%) and the low
        yAxis: { type: 'value', position: 'right', min: dr.dd, max: 0, interval: -dr.dd, splitLine: { show: false },
          axisLabel: { ...OG.axisMono(), margin: 10, formatter: (v) => (v === 0 ? '0%' : pct1(v)) } },
        series: [{ type: 'line', name: 'Dip', data: d, showSymbol: false, smooth: 0.5, lineStyle: { width: 1.25, color: css('--neg') }, itemStyle: { color: css('--neg') },
          areaStyle: { color: css('--neg-tint'), opacity: 0.8 },
          markLine: { silent: true, symbol: 'none', lineStyle: { color: css('--chart-ref'), width: 1, type: 'solid' }, label: { show: false }, data: [{ yAxis: 0 }] },
          markPoint: { silent: true, data: [
            { coord: [dr.trough.d, dr.dd], symbol: 'circle', symbolSize: 8, itemStyle: { color: css('--neg'), borderColor: css('--surface'), borderWidth: 2 },
              label: { ...lab(css('--ink-3'), 'bottom', at(dr.trough.d)), formatter: dayMon(dr.trough.d) } },
            { coord: [end, 0], symbol: 'circle', symbolSize: dr.back ? 7 : 0, itemStyle: { color: css('--pos'), borderColor: css('--surface'), borderWidth: 2 },
              label: { ...lab(css(dr.back ? '--pos-ink' : '--ink-3'), 'top', at(end)), formatter: dr.back ? `back ${dayMon(dr.back)}` : 'not back yet' } },
          ] } }],
      }, { replaceMerge: ['series'] });
    },
    drawInc() {
      if (!WF.status(this.inc, $('inv-inc-state'), 'No income in this range.')) return;
      const k = WF.one(this.inc), id = this.inc.name;
      $('inv-inc-word').textContent = `Dividends and interest, ${RW()}`;
      const z = (v) => fmt.n(v) ?? 0;   // a range with no interest (or no income) returns null: it reads ₫0, not —
      $('inv-inc-v').innerHTML = `<span data-trace="${id}:t">${money(z(k.t))}</span>`;
      $('inv-inc-k').innerHTML = OG.kpis([{ k: 'Dividends', v: approx(z(k.d)), trace: `${id}:d` }, { k: 'Interest', v: approx(z(k.i)), trace: `${id}:i` }, { k: 'Per month', v: approx(z(k.avg)), trace: `${id}:avg` }]);
      if (WF.status(this.incM, null) && this.incSig !== this.incM.result) {
        this.incSig = this.incM.result;
        // every month of the range, so a month with no income shows as an empty slot, not a missing one
        const got = new Map(WF.rows(this.incM).map((r) => [fmt.ymd(r.m).slice(0, 7), r]));
        const [a, z] = WF.range(this.range), rows = [];
        for (let m = `${a.slice(0, 7)}-01`; m <= z; m = WF.addMonths(m, 1)) rows.push(got.get(m.slice(0, 7)) ?? { m, t: 0 });
        const lab = (m) => new Date(`${fmt.ymd(m)}T00:00:00`).toLocaleDateString('en-US', { month: 'narrow' });
        echarts.getInstanceByDom($('inv-inc-chart'))?.clear();
        OG.miniBars($('inv-inc-chart'), rows.map((r) => lab(r.m)), rows.map((r) => Number(r.t) || 0));
        WF.charts.chart($('inv-inc-chart')).setOption({ series: [{ name: 'Income', itemStyle: { color: WF.charts.css('--tone-interest') } }],
          tooltip: { formatter: (ps) => { const p = ps[0], r = rows[p.dataIndex]; return `${esc(OG.monthName(r.m, false))} '${String(fmt.ymd(r.m)).slice(2, 4)} · <b>${money(r.t)}</b>`; } } });
      }
    },
    render() {
      OG.setActive($('inv-ranges'), this.range);
      this.drawRet();
      this.drawBridge();
      this.drawMovers();
      this.drawNotes();
      this.drawRisk();
      this.drawInc();
    },
  };
  // Fees & other: what's left of the gain after price moves and dividends (trading fees, gold's buy/sell spread)
  OG.hc['inv-rest'] = () => '<div class="tp-title">Fees & other</div><div>The gain minus price moves and dividends: mostly trading fees. It is worked out here, so the rows add up to the gain exactly.</div>';
  WF.register(view);
})();
