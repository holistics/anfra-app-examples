// Forecast › Net worth (18 Oct, the default tab): where is net worth heading at the pace I keep now?
// Cards (js/pages.js): fc-nw (hero = net worth in 12 months, EXACT, the governed net_worth_projected_1y at the last-12-months
// pace, data-own nw-projected-1y (18 Oct, Nhi: an exact hero like every page); grey history → a band between the two governed
// paces (last 12 months vs all history) to the chosen horizon, bonus months ringed, the what-if line when the slider moves;
// horizon pills 1Y 3Y 5Y 10Y; main 8) · fc-miles (the milestone road: today → the ₫1B star → 1 / 3 / 5 / 10 years at the
// 12-month pace, the all-time pace in each stop's hover card; main 8) ·
// fc-notes (worth knowing; rail 4) · What drives it (what made the last 12 months' change: a hover card off the hero line since
// 19 Oct, round 3; Home's Monthly pace owns all time) ·
// fc-whatif (save ₫X more a month: an estimate, client-side, never traced; quick picks and two bars, as now vs what if;
// rail 4, first since 19 Oct). Milestones open with a progress strip: today's net worth on the way to the next ₫1B.
// Every projected number is a governed metric (net worth + pace × months, tests/check_wealth.py w15); the client only places
// the points on dates. Projections past a year use OG.proj (2 significant figures): they are estimates, not balances.
// The archived mouka-v2 Forecast (apps/archive/mouka-v2/js/views/forecast.js) is where the band and the event rings come from.
(() => {
  const { fmt } = WF;
  const { $, esc, money, approx, proj, pct1, dayMon } = OG;
  const WEALTH = 'wealth', PF = 'personal_finance', P = 'og8_fc_';
  const FC = `explore { measures { nw: net_worth, ch: net_worth_change, pace: net_worth_monthly_pace,
    p1: net_worth_projected_1y, p3: net_worth_projected_3y, p5: net_worth_projected_5y, p10: net_worth_projected_10y,
    gain1: net_worth_projected_1y - net_worth, gpct1: safe_divide(net_worth_projected_1y - net_worth, net_worth),
    gains: investment_gains, saved: saved_from_income, debt: debt_change,
    gs: safe_divide(investment_gains, net_worth_change), ss: safe_divide(saved_from_income, net_worth_change), ds: safe_divide(debt_change, net_worth_change) } }`;
  const FC_METRICS = { nw: 'net_worth', ch: 'net_worth_change', pace: 'net_worth_monthly_pace', p1: 'net_worth_projected_1y', p3: 'net_worth_projected_3y',
    p5: 'net_worth_projected_5y', p10: 'net_worth_projected_10y', gains: 'investment_gains', saved: 'saved_from_income', debt: 'debt_change' };
  const H = { '1Y': { m: 12, k: 'p1', word: 'in a year' }, '3Y': { m: 36, k: 'p3', word: 'in 3 years' }, '5Y': { m: 60, k: 'p5', word: 'in 5 years' }, '10Y': { m: 120, k: 'p10', word: 'in 10 years' } };
  const HK = Object.fromEntries(Object.entries(H).map(([lbl, h]) => [h.k, { lbl, ...h }]));   // p1 → { lbl: '1Y', m: 12, word }
  const plusMonths = (k) => WF.addMonths(WF.asOf, k);
  const monthYear = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const n = (v) => fmt.n(v) ?? 0;

  // the 12-month pace query, shared: Ask AI's "where is my net worth heading" answers with the same number as this page's hero
  OG.fc = OG.fc ?? {};
  OG.fc.q12m = () => {
    if (OG.fc._q12m) return OG.fc._q12m;
    const q = OG.fc._q12m = WF.q(`${P}12m`, { dataset: WEALTH, metrics: FC_METRICS, aql: FC });
    const c = WF.dateControl(`${P}12m_period`);
    WF.app.mapControl(c, q, { field: 'dim_dates.date_key' }); WF.setPeriod(c, '1Y', { change: true });
    return q;
  };

  OG.hc['fc-line'] = () => `<div class="tp-title">How this is projected</div><div>Today's net worth plus your monthly pace (the change over the period ÷ its days × 30.4) times the months ahead. A straight line: no market returns, no raises, no bonuses beyond what the pace already holds.</div>`;
  // a road stop: the horizon at both paces (1 year exact, past it an estimate to 2 significant figures), both traced
  OG.hc['fc-stop'] = (el) => {
    const v = WF.views.get('forecast/networth'), both = v?.ready(), h = HK[el.dataset.k];
    if (!both || !h) return '';
    const [r, a] = both, f = (x) => (h.m === 12 ? money(x) : `≈ ${proj(x)}`);
    return `<div class="tp-title">${esc(h.word[0].toUpperCase() + h.word.slice(1))} · ${esc(monthYear(plusMonths(h.m)))}</div>
      <div class="kv"><span>At your 12-month pace</span><span class="v num" data-trace="${v.r.name}:${h.k}">${f(r[h.k])}</span>
        <span>At your all-time pace</span><span class="v num" data-trace="${v.a.name}:${h.k}">${f(a[h.k])}</span></div>
      <div class="fc-hc-foot">A straight line at each pace, not a market forecast.</div>`;
  };
  // the ₫1B star (19 Oct, round 3, Nhi: "hide this in a popover"): where you are on the way to it, as a hover card
  OG.hc['fc-drivers'] = () => { const v = WF.views.get('forecast/networth'), both = v?.ready(); return both ? v.drivers(both[0]) : ''; };
  OG.hc['fc-goal'] = () => { const v = WF.views.get('forecast/networth'), both = v?.ready(); return both ? v.progress(both[0]) : ''; };
  OG.hc['fc-whatif'] = () => '<div class="tp-title">An estimate</div><div>Your last-12-months pace plus the amount you pick, as a straight line. Worked out here on the page, so it is not a governed number.</div>';

  const view = {
    id: 'forecast/networth', nav: 'forecast', tab: 'Net worth',
    init(el) {
      const app = WF.app;
      this.h = '3Y';
      this.extra = 0;
      this.blocks = {
        'fc-nw': () => OG.card({ id: 'fc-nw', label: 'Net worth ahead', explain: `${P}12m:p1`, query: `${P}12m ${P}all ${P}curve ${P}events`,
          body: `${OG.heroRow({ id: 'fc-hero', own: 'nw-projected-1y' })}
            <div class="key fc-key" id="fc-key"></div>
            ${OG.chartBox('fc-chart', 'frame')}${OG.stateLine('fc-state')}
            ${OG.ranges('fc-h', Object.keys(H), this.h)}
            <p class="fc-foot"><span data-hc="fc-line">A straight line at your pace, not a market forecast.</span></p>` }),
        'fc-miles': () => OG.card({ id: 'fc-miles', label: 'Milestones', explain: `${P}12m:p10`, query: `${P}12m ${P}all`,
          body: `<div class="fc-miles" id="fc-miles-list"><div class="fc-road" id="fc-road" aria-hidden="true"></div></div>` }),
        'fc-notes': () => OG.card({ id: 'fc-notes', label: 'Worth knowing', query: `${P}12m ${P}all ${P}months ${P}events`,
          body: `<div id="fc-notes-list"></div>${OG.stateLine('fc-notes-state')}` }),
        'fc-whatif': () => OG.card({ id: 'fc-whatif', label: 'What if', query: `${P}12m`,
          actions: '<button type="button" class="btn link fc-wi-reset" id="fc-wi-reset" hidden>Reset</button>',
          body: `<div class="fc-wi">${OG.slider({ id: 'fc-extra', label: 'Save more each month', min: -10e6, max: 10e6, step: 1e6, value: 0 })}
            <div class="fc-wi-ticks" aria-hidden="true"><span>−₫10M</span><span>As now</span><span>+₫10M</span></div>
            <div class="fc-wi-chips" id="fc-wi-chips" role="group" aria-label="Quick picks">${[-5e6, 2e6, 5e6, 10e6].map((v) =>
              `<button type="button" class="fc-wi-chip" data-v="${v}">${v > 0 ? '+' : '−'}₫${Math.abs(v) / 1e6}M</button>`).join('')}</div>
            <div class="fc-wi-out" id="fc-wi-out" aria-live="polite"></div></div>` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      // the two paces: the last 12 months (the hero's basis) and all history (the band's other edge)
      this.r = OG.fc.q12m();
      this.a = WF.q(`${P}all`, { dataset: WEALTH, metrics: FC_METRICS, aql: FC });
      const aC = WF.dateControl(`${P}all_period`), cC = WF.dateControl(`${P}curve_period`), mC = WF.dateControl(`${P}months_period`);
      app.mapControl(aC, this.a, { field: 'dim_dates.date_key' }); WF.setPeriod(aC, 'ALL', { change: true });
      this.curve = WF.q(`${P}curve`, { dataset: WEALTH, pageSize: 1000, metrics: { nw: 'net_worth_daily' },
        aql: 'explore { dimensions { d: dim_dates.date_key } measures { nw: net_worth_daily } sorts { d asc } }' });
      app.mapControl(cC, this.curve, { field: 'dim_dates.date_key' }); WF.setPeriod(cC, 'ALL');
      // the months of the last year, each with its change (the bonus months' share of the year)
      this.months = WF.q(`${P}months`, { dataset: WEALTH, metrics: { ch: 'net_worth_change' },
        aql: 'explore { dimensions { m: dim_dates.month_start } measures { ch: net_worth_change } sorts { m asc } }' });
      app.mapControl(mC, this.months, { field: 'dim_dates.date_key' }); WF.setPeriod(mC, '1Y', { change: true });
      // bonuses and matured deposits, ringed on the history (verbatim from the archived Forecast)
      this.events = WF.q(`${P}events`, { dataset: PF, metrics: { b: 'bonus', mat: 'savings_matured' },
        aql: 'explore { dimensions { m: dim_dates.month_start } measures { b: bonus, mat: savings_matured } having { bonus > 0 or savings_matured > 0 } sorts { m asc } }' });

      OG.bindKeys($('fc-h'), (k) => { this.h = k; this.chartSig = null; WF.renderAll(); });
      OG.bindKeys($('fc-notes-list'), (k) => this.notes?.find((x) => x.k === k)?.go());
      // a road stop opens its hover card on focus too (the pointer opens it through data-hc); Enter or Space pins it, as a click does
      const road = $('fc-road');
      road.addEventListener('focusin', (e) => { const s = e.target.closest('.fc-stop[data-hc]'); if (s) OG.hcOpen(s); });
      road.addEventListener('keydown', (e) => {
        const s = e.target.closest('.fc-stop[data-hc]');
        if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); OG.hcOpen(s, { pin: true }); }
      });
      road.addEventListener('focusout', () => OG.hcClose());
      const sl = $('fc-extra');
      sl.addEventListener('input', () => { this.extra = Number(sl.value); this.chartSig = null; WF.renderAll(); });
      $('fc-wi-reset').addEventListener('click', () => { sl.value = '0'; sl.dispatchEvent(new Event('input')); sl.focus(); });
      $('fc-wi-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { sl.value = b.dataset.v; sl.dispatchEvent(new Event('input')); } });
      app.execute();
    },
    ready() { return WF.status(this.r, null) && WF.status(this.a, null) ? [WF.one(this.r), WF.one(this.a)] : null; },
    drawHero(r) {
      const id = this.r.name;
      $('fc-hero').innerHTML = `<span data-trace="${id}:p1">${money(r.p1)}</span>`;
      $('fc-hero-delta').innerHTML = `${OG.delta({ amt: r.gain1, pct: r.gpct1, trace: { amt: `${id}:gain1`, pct: `${id}:gpct1` } })}
        <span class="muted">in 12 months · at your last-12-months pace of <span class="num" data-trace="${id}:pace">${approx(r.pace)}</span>/mo</span>
        <button type="button" class="btn link hero-more" id="fc-drv-btn" data-hc="fc-drivers" aria-haspopup="dialog">What drives it</button>`;
    },
    // grey history → the band between the two paces to the horizon (a polygon: geometry only, no new number) → the what-if line
    drawChart(r, a) {
      const el = $('fc-chart');
      if (!WF.status(this.curve, $('fc-state'), 'No history yet.')) { WF.charts.clear(el); this.chartSig = null; return; }
      const sig = [this.curve.result, this.r.result, this.a.result, this.events.result, this.h, this.extra];
      if (this.chartSig && sig.every((x, i) => x === this.chartSig[i])) return;
      this.chartSig = sig;
      OG.setActive($('fc-h'), this.h);
      const hz = H[this.h], R = this.r.name, A = this.a.name, css = (v) => WF.charts.css(v), mono = OG.axisMono();
      const hist = WF.rows(this.curve).map((x) => [fmt.ymd(x.d), Number(x.nw)]);
      const marks = [[0, 'nw'], [12, 'p1'], [36, 'p3'], [60, 'p5'], [120, 'p10']].filter(([m]) => m <= hz.m);
      const pts = (k) => marks.map(([m, key]) => [m ? plusMonths(m) : WF.asOf, Number(k[key])]);
      const pR = pts(r), pA = pts(a);
      const wi = this.extra ? marks.map(([m, key]) => [m ? plusMonths(m) : WF.asOf, Number(r[key]) + this.extra * m]) : [];
      const ev = WF.status(this.events, null) ? WF.rows(this.events).map((x) => {
        const m0 = fmt.ymd(x.m), near = hist.find(([d]) => d >= m0) ?? hist.at(-1);
        return { value: near, name: fmt.n(x.b) ? `Bonus ${approx(x.b)}` : `Deposit matured ${approx(x.mat)}` };
      }) : [];
      const HIST = css('--fc-hist'), LINE = css('--fc-line'), BAND = css('--fc-band'), WI = css(this.extra < 0 ? '--line-down' : '--line-up');   // the what-if: mint above the pace, terracotta under it (19 Oct, round 3)   // 19 Oct, Nhi: baby blue
      const kind = { '12-month pace': 'recent', 'All-time pace': 'all', 'What if': 'wi' };
      WF.charts.chart(el).setOption({
        animation: false, textStyle: { fontFamily: DS.font('sans') },
        grid: { left: 0, right: 72, top: 16, bottom: 36 },
        tooltip: { ...OG.tip((v) => money(v)), trigger: 'item', formatter: (p) => {
          const d = p.value[0], est = p.seriesName in kind && d > WF.asOf;
          return `${esc(p.data?.name ?? p.seriesName)}<br>${esc(dayMon(d))} ${String(d).slice(0, 4)} · <b>${est ? `≈ ${proj(p.value[1])}` : money(p.value[1])}</b>${est ? ' <span class="muted">estimate</span>' : ''}`;
        } },
        xAxis: { type: 'time', max: plusMonths(hz.m), minInterval: hz.m <= 12 ? 90 * 864e5 : 365 * 864e5, axisTick: { show: false }, axisLine: { show: false }, splitLine: { show: false },
          axisLabel: { ...mono, hideOverlap: true, margin: 16, formatter: (v) => (hz.m <= 12 ? monthYear(new Date(v).toISOString().slice(0, 10)) : String(new Date(v).getFullYear())) } },
        yAxis: { type: 'value', position: 'right', scale: true, splitNumber: 4, axisLabel: { ...mono, formatter: (v) => approx(v), margin: 16 },
          splitLine: { lineStyle: { color: css('--chart-grid'), type: [3, 4] } } },
        series: [
          { type: 'line', name: 'Net worth', data: hist, showSymbol: false, lineStyle: { width: 2, color: HIST }, itemStyle: { color: HIST },
            markLine: { symbol: 'none', silent: true, lineStyle: { color: css('--ink-3'), type: 'solid', width: 1 },
              label: { color: css('--ink-2'), fontFamily: DS.font('font-label'), fontSize: DS.fs('label'), formatter: 'Today', position: 'end' }, data: [{ xAxis: WF.asOf }] } },
          { type: 'custom', name: 'Band', silent: true, z: 2, data: [[WF.asOf, Number(r.nw)]], tooltip: { show: false },
            renderItem: (params, api) => ({ type: 'polygon', shape: { points: [...pR.map((x) => api.coord(x)), ...[...pA].reverse().map((x) => api.coord(x))] },
              style: { fill: `${BAND}55`, stroke: 'none' } }) },
          { type: 'line', name: '12-month pace', data: pR, symbol: 'circle', symbolSize: (v, p) => (p.dataIndex ? 7 : 0), z: 4,
            lineStyle: { width: 2, color: LINE, type: [6, 4] }, itemStyle: { color: css('--surface'), borderColor: LINE, borderWidth: 1.5 } },
          { type: 'line', name: 'All-time pace', data: pA, symbol: 'circle', symbolSize: (v, p) => (p.dataIndex ? 6 : 0), z: 3,
            lineStyle: { width: 1.25, color: LINE, type: [2, 4] }, itemStyle: { color: css('--surface'), borderColor: LINE, borderWidth: 1.25 } },
          ...(wi.length ? [{ type: 'line', name: 'What if', data: wi, symbol: 'circle', symbolSize: (v, p) => (p.dataIndex ? 7 : 0), z: 5,
            lineStyle: { width: 2, color: WI, type: [6, 4] }, itemStyle: { color: css('--surface'), borderColor: WI, borderWidth: 1.5 } }] : []),
          { type: 'scatter', name: 'Events', data: ev, symbol: 'circle', symbolSize: 11, z: 6,
            itemStyle: { color: css('--surface'), borderColor: css('--ink-2'), borderWidth: 1.2 } },
        ],
      }, { replaceMerge: ['series'] });
      // the key names both edges with their value at the horizon (the archive's end labels, moved off the plot)
      $('fc-key').innerHTML = `<span class="k"><span class="sw ln fc-sw-hist"></span>So far</span>
        <span class="k"><span class="sw dash fc-sw-recent"></span>12-month pace <b class="num" data-trace="${R}:${hz.k}">${hz.m === 12 ? money(r[hz.k]) : `≈ ${proj(r[hz.k])}`}</b></span>
        <span class="k"><span class="sw dash fc-sw-all"></span>All-time pace <b class="num" data-trace="${A}:${hz.k}">${hz.m === 12 ? money(a[hz.k]) : `≈ ${proj(a[hz.k])}`}</b></span>
        ${wi.length ? `<span class="k"><span class="sw dash fc-sw-wi${this.extra < 0 ? ' neg' : ''}"></span>What if <b class="num">≈ ${proj(wi.at(-1)[1])}</b></span>` : ''}`;
    },
    // ----- the milestone road: the four horizons at the 12-month pace, and the ₫1B star when the pace reaches it within 10
    // years; in month order (a tie puts the star first). The values are the governed projections; the star is cross().
    stops(r) {
      const out = Object.values(H).map(({ m, k }) => ({ k, m, d: plusMonths(m), v: n(r[k]) }));
      const c = this.cross(r);
      if (c) out.push({ k: 'cross', m: c.m, d: c.d, v: c.at });
      return out.sort((x, y) => x.m - y.m || (y.k === 'cross') - (x.k === 'cross'));
    },
    // today → the stops, evenly spaced (to time scale ₫1B and 1Y would sit on top of each other). Each point bends the road
    // up (label above) or down (label below), so neighbours' labels never meet; at sm/xs the road runs top to bottom, labels
    // on the right (css/forecast.css). One path per direction, in a box 2 × the bend tall (or wide): 0 and 100 are the bends.
    // It ignores the what-if slider (the chart shows that), so it redraws only on new numbers and keeps focus on a stop.
    drawMiles(r) {
      if (this.roadSig === this.r.result) return;
      this.roadSig = this.r.result;
      const R = this.r.name, s = this.stops(r), N = s.length;
      const pts = [{ t: 0, w: 1 }, ...s.map((x, i) => ({ t: (i + 1) / N, w: i % 2 ? 1 : -1 }))];   // point 0 = today
      const path = (f) => pts.map((p, i) => {
        if (!i) return `M${f(p.t, p.w)}`;
        const q = pts[i - 1], tm = (q.t + p.t) / 2;   // flat at every point: the stops sit on the bends
        return `C${f(tm, q.w)} ${f(tm, p.w)} ${f(p.t, p.w)}`;
      }).join(' ');
      const svg = (cls, d) => `<svg class="fc-road-svg ${cls}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="bed" d="${d}"/><path class="mid" d="${d}"/></svg>`;
      const at = (i) => `style="--t:${pts[i].t};--w:${pts[i].w};--i:${i}"`;
      const lab = (i, l1, l2) => `<span class="fc-stop-lab ${pts[i].w < 0 ? 'up' : 'dn'}">${l1}<span class="d">${l2}</span></span>`;
      const val = (x) => (x.m === 12 ? money(x.v) : `≈ ${proj(x.v)}`), said = (x) => (x.m === 12 ? money(x.v) : `about ${proj(x.v)}`);
      const stop = (x, j) => {
        const i = j + 1, mo = esc(monthYear(x.d));
        if (x.k === 'cross') return `<div class="fc-stop fc-star" data-k="cross" data-hc="fc-goal" tabindex="0" role="button" ${at(i)}
          aria-label="${esc(`${proj(x.v)} around ${monthYear(x.d)}: how far along you are`)}">${OG.icon('star', 'xs')}${lab(i, `<span class="v">${esc(proj(x.v))}</span>`, mo)}</div>`;
        const h = HK[x.k], end = x.k === 'p10';
        return `<div class="fc-stop fc-mile${end ? ' fc-end' : ''}" data-k="${x.k}" data-hc="fc-stop" tabindex="0" role="button" ${at(i)}
          aria-label="${esc(`${h.word[0].toUpperCase()}${h.word.slice(1)}, ${monthYear(x.d)}: ${said(x)} at your 12-month pace`)}">${OG.icon(end ? 'finish' : 'flag', 'xs')}${lab(i, `<span class="h">${h.lbl}</span> <span class="v" data-trace="${R}:${x.k}">${val(x)}</span>`, mo)}</div>`;
      };
      // the sentence it replaced, in the road's order
      const parts = s.map((x) => (x.k === 'cross' ? `you pass ${proj(x.v)} around ${monthYear(x.d)}` : `${said(x)} ${HK[x.k].word} (${monthYear(x.d)})`));
      const el = $('fc-road');
      el.style.setProperty('--n', N + 1);
      // a group, not an img: its stops are focusable and keep their own names (an img's children are presentational)
      el.removeAttribute('aria-hidden');
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', `At your last-12-months pace: ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}. Estimates, a straight line.`);
      el.innerHTML = `${svg('fc-road-h', path((t, w) => `${t * 100},${50 + w * 50}`))}${svg('fc-road-v', path((t, w) => `${50 + w * 50},${t * 100}`))}
        <div class="fc-today" ${at(0)}>${lab(0, `<span class="h">Today</span> <span class="v" data-trace="${R}:nw">${approx(r.nw)}</span>`, esc(monthYear(WF.asOf)))}</div>${s.map(stop).join('')}`;
    },
    // ----- where you are on the way (19 Oct, Nhi), shown in the ₫1B star's hover card since round 3: today's net worth as a
    // share of the next ₫1B mark, how much is left and when the 12-month pace gets there (cross(), an estimate)
    progress(r) {
      const c = this.cross(r), nw = n(r.nw);
      if (!c) return '';
      const share = Math.max(0, Math.min(1, nw / c.at));
      return `<div class="tp-title">On the way to ${esc(proj(c.at))}</div><div class="fc-prog">
        <div class="fc-prog-h"><span><span class="k">You are here</span> <span class="v" data-trace="${this.r.name}:nw">${approx(nw)}</span></span>
          <span class="fc-prog-goal"><span class="k">Next</span> <span class="v">${esc(proj(c.at))}</span></span></div>
        <div class="fc-prog-bar" role="progressbar" aria-label="${esc(`On the way to ${proj(c.at)}`)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(share * 100)}">
          <div class="fill" style="width:${share * 100}%"></div></div>
        <div class="fc-prog-s"><b>${Math.round(share * 100)}%</b> of the way · <span class="v">${approx(c.at - nw)}</span> to go, around <b>${esc(monthYear(c.d))}</b> at your pace</div></div>`;
    },
    // the next round milestone above today (₫1B, then each ₫1B), and the month the 12-month pace reaches it: a computed estimate
    cross(r) {
      const nw = n(r.nw), pace = n(r.pace);
      if (pace <= 0) return null;
      const at = Math.ceil((nw + 1) / 1e9) * 1e9, m = Math.ceil((at - nw) / pace);
      return m <= 120 ? { at, m, d: plusMonths(m) } : null;
    },
    drawNotes(r, a) {
      const sig = [this.r.result, this.a.result, this.months.result, this.events.result];
      if (this.notesSig && sig.every((x, i) => x === this.notesSig[i])) return;
      this.notesSig = sig;
      const R = this.r.name, A = this.a.name, out = [];
      // the bonus months' share of the year's change (the straight pace smooths them over every month)
      if (WF.status(this.months, null) && WF.status(this.events, null) && n(r.ch) > 0) {
        const bonus = new Set(WF.rows(this.events).filter((x) => n(x.b) > 0).map((x) => fmt.ymd(x.m).slice(0, 7)));
        const bm = WF.rows(this.months).filter((x) => bonus.has(fmt.ymd(x.m).slice(0, 7)));
        const sum = bm.reduce((s, x) => s + n(x.ch), 0);
        if (bm.length && sum > 0) out.push({ k: 'bonus', icon: 'gift', tone: '',
          html: `${bm.length === 1 ? 'One bonus month' : `${bm.length} bonus months`} (${esc(bm.map((x) => OG.monthName(x.m, false)).join(', '))}) made <span class="em">${pct1(sum / n(r.ch))}</span> of the last year's growth`, why: 'Bonus months, against the change over 12 months',
          go: () => $('fc-chart').scrollIntoView({ behavior: 'smooth', block: 'center' }) });
      }
      const d = n(r.pace) - n(a.pace);
      if (Math.abs(d) >= 1e5) out.push({ k: 'pace', icon: d > 0 ? 'trend' : 'trend-down', tone: d > 0 ? 'pos' : 'neg',
        html: `Your pace is <span class="em">${approx(Math.abs(d))}</span> a month ${d > 0 ? 'ahead of' : 'behind'} your all-time average (<span class="num" data-trace="${R}:pace">${approx(r.pace)}</span> vs <span class="num" data-trace="${A}:pace">${approx(a.pace)}</span>)`, why: 'The last 12 months against all time, when ₫100K a month apart',
        go: () => OG.hcOpen($('fc-drv-btn'), { pin: true }) });
      const c = this.cross(r);
      if (c) out.push({ k: 'cross', icon: 'target', tone: '',
        html: `At this pace you pass <span class="em">${esc(proj(c.at))}</span> around ${esc(monthYear(c.d))}, an estimate`, why: 'The next ₫1B mark, at the last 12 months\' pace',
        go: () => { this.h = c.m <= 12 ? '1Y' : c.m <= 36 ? '3Y' : c.m <= 60 ? '5Y' : '10Y'; this.chartSig = null; WF.renderAll(); $('fc-chart').scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
      // debt_change is what debt did to net worth: below zero = card balances grew
      if (n(r.debt) < -1e5) out.push({ k: 'debt', icon: 'card', tone: 'neg',
        html: `Card balances grew <span class="em" data-trace="${R}:debt">${approx(-n(r.debt))}</span> over the year, which slows the pace`, why: 'Card debt that grew over ₫100K in 12 months', go: () => WF.go('spending/credit') });
      this.notes = out.slice(0, 4);
      $('fc-notes-list').innerHTML = OG.notes(this.notes);
      this.el.querySelector('[data-anfra-block="fc-notes"]').hidden = !this.notes.length;
    },
    // ----- what drives it (19 Oct, round 3, Nhi: progressive disclosure): no card; the hero line's "What drives it" opens the
    // last 12 months' change and its three governed drivers in a hover card (a click pins it)
    drivers(r) {
      const R = this.r.name;
      const parts = [['saved', 'Saved from income', 'ss', '--tone-cash'], ['gains', 'Investment gains', 'gs', '--tone-invest'],
        ['debt', n(r.debt) > 0 ? 'Debt paid down' : 'New debt', 'ds', '--tone-liab']];
      const max = Math.max(1, ...parts.map(([k]) => Math.abs(n(r[k]))));
      // debt_change is what debt did to net worth: more debt reads negative
      return `<div class="tp-title">What drives it</div><div class="fc-drv-pop">
        <div class="sub fc-drv-lead">What made the last 12 months' change of <span class="num ${OG.tone(r.ch)}" data-trace="${R}:ch">${approx(r.ch, true)}</span></div>
        <div id="fc-drv-rows">${parts.map(([k, t, sh, tone]) => `<div class="pace-row fc-drv"><span class="t">${t} <span class="muted" data-trace="${R}:${sh}">${pct1(r[sh])}</span></span>
        <span class="v ${OG.tone(r[k])}" data-trace="${R}:${k}">${approx(r[k], true)}</span>
        <div class="pace-bar" aria-hidden="true"><div style="width:${(Math.abs(n(r[k])) / max) * 100}%;background:var(${tone})"></div></div></div>`).join('')}</div></div>`;
    },
    // ----- what if (19 Oct, Nhi: "more fun"): the slider fills from its middle toward the thumb (green saving more, terracotta
    // less), quick picks set it in one tap, and two bars compare as now with the what-if at the chosen horizon
    drawWhatIf(r) {
      const hz = H[this.h], x = this.extra, base = n(r[hz.k]), wi = base + x * hz.m;
      const sl = $('fc-extra'), p = ((x - Number(sl.min)) / (Number(sl.max) - Number(sl.min))) * 100;
      sl.setAttribute('aria-valuetext', x ? `save ${approx(Math.abs(x))} ${x > 0 ? 'more' : 'less'} a month` : 'as now');
      sl.style.setProperty('--a', `${Math.min(50, p)}%`); sl.style.setProperty('--b', `${Math.max(50, p)}%`);
      sl.dataset.tone = x > 0 ? 'pos' : x < 0 ? 'neg' : '';
      const v = $('fc-extra-v');
      v.textContent = x ? `${x > 0 ? '+' : '−'}${approx(Math.abs(x))} a month` : 'As now';
      v.dataset.tone = sl.dataset.tone;
      $('fc-wi-chips').querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === x)));
      // 19 Oct (round 3, Nhi: "why a progress bar?"): the two figures side by side, then what the change buys: the difference
      // at the horizon and how much sooner (or later) the next ₫1B mark comes. All estimates, worked out here.
      const c = this.cross(r), pace = n(r.pace);
      let when = '';
      if (x && c) {
        const m2 = pace + x > 0 ? Math.ceil((c.at - n(r.nw)) / (pace + x)) : null, d = m2 == null ? null : m2 - c.m;
        when = m2 == null ? `You would stop moving toward <b>${esc(proj(c.at))}</b>`
          : d === 0 ? `<b>${esc(proj(c.at))}</b> still around ${esc(monthYear(c.d))}`
          : `<b>${esc(proj(c.at))}</b> around <b>${esc(monthYear(plusMonths(m2)))}</b>, <span class="${d < 0 ? 'pos' : 'neg'}">${Math.abs(d)} month${Math.abs(d) === 1 ? '' : 's'} ${d < 0 ? 'sooner' : 'later'}</span>`;
      }
      const fig = (cls, k, val) => `<div class="fc-wi-fig ${cls}"><span class="k">${k}</span><span class="v">≈ ${esc(proj(val))}</span></div>`;
      $('fc-wi-out').innerHTML = `<div class="fc-wi-when">Net worth ${esc(hz.word)}</div>
        <div class="fc-wi-figs${x ? '' : ' one'}">${fig('now', 'At your pace', base)}${x ? `<span class="fc-wi-arrow" aria-hidden="true">${OG.icon('chev', 'sm')}</span>${fig(`wi ${x > 0 ? 'pos' : 'neg'}`, `With ${x > 0 ? '+' : '−'}${approx(Math.abs(x))}/mo`, wi)}` : ''}</div>
        ${x ? `<div class="sub fc-wi-diff"><span class="${OG.tone(x)}">${x > 0 ? '+' : '−'}${esc(proj(Math.abs(x * hz.m)))}</span> ${esc(hz.word)}${when ? ` · ${when}` : ''} · <span data-hc="fc-whatif" class="fc-est">an estimate</span></div>`
        : '<div class="sub fc-wi-diff">Pick an amount or drag the slider to compare.</div>'}`;
      $('fc-wi-reset').hidden = !x;
    },
    render() {
      const both = this.ready();
      if (!both) return;
      const [r, a] = both;
      this.drawHero(r);
      this.drawChart(r, a);
      this.drawMiles(r);
      this.drawNotes(r, a);
      this.drawWhatIf(r);
    },
  };
  WF.register(view);
})();
