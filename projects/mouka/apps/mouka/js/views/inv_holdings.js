// Invest › Holdings (18 Oct): what do I actually own, and how is each one doing?
// Cards (js/pages.js): inv-hold (hero = what the open positions are worth, data-own holdings_value, the pill = unrealised
// gain; a split bar by kind; every holding grouped by kind (Stocks · ETFs · Bond fund · Gold), groups folding like Net worth's
// Summary; a Sort dropdown (value · return since bought · today's move; 19 Oct, Nhi: was an icon switch) and a % switch (each holding's share); closed positions folded at the
// bottom; then the cash waiting in SSI, so the total reconciles with Home › Investments; main 8) · inv-hold-notes (worth
// knowing; rail 4) · inv-alloc (by kind or by account; rail 4). A holding opens in the rail (OG.inv.openDrawer), ‹ back.
// Holdings are "now" (the as-of date): no range. Positions only in the hero, the bar, the weights and the ring (18 Oct, Nhi).
(() => {
  const { fmt } = WF;
  const { $, esc, money, approx, pct1, dayMon } = OG;
  const WEALTH = 'wealth', P = OG.inv.P;
  const INV = "dim_accounts.account_group == 'Investments'";
  const n = (v) => fmt.n(v) ?? 0;
  const SORT = {
    value: { label: 'Value', by: (r) => n(r.v) },
    ret: { label: 'Return since bought', by: (r) => n(r.retp) },
    today: { label: "Today's move", by: (r) => n(r.dc) },
  };

  const view = {
    id: 'invest/holdings', nav: 'invest', tab: 'Holdings',
    init(el) {
      const app = WF.app;
      this.sort = 'value';
      this.by = 'type';
      this.pct = false;
      this.blocks = {
        'inv-hold': () => OG.card({ id: 'inv-hold', label: 'Holdings', explain: `${P}tot:v`, query: `${P}hold ${P}tot ${P}cash ${P}sales`,
          control: OG.pick('inv-sort', 'Sort', Object.entries(SORT).map(([key, s]) => ({ key, label: s.label })), this.sort),
          actions: `<button class="dots pct-btn" type="button" id="inv-pct" aria-pressed="false" aria-label="Show each holding's share" title="Show each holding's share">${OG.icon('percent')}</button>`,
          body: `${OG.heroRow({ id: 'inv-h-hero', own: 'holdings_value' })}<div id="inv-split"></div>
            <div class="inv-list hide-pct" id="inv-list" data-disc-scope="inv-hold"></div>
            <div id="inv-closed" data-disc-scope="inv-closed" data-disc-closed></div>
            <div class="inv-cash" id="inv-cash"></div>${OG.stateLine('inv-hold-state')}` }),
        'inv-hold-notes': () => OG.card({ id: 'inv-hold-notes', label: 'Worth knowing', query: `${P}hold ${P}sales`,
          body: `<div id="inv-h-notes"></div>${OG.stateLine('inv-h-notes-state')}` }),
        'inv-alloc': () => OG.card({ id: 'inv-alloc', label: 'Allocation', explain: `${P}tot:v`, query: `${P}hold ${P}acc`,
          control: OG.segBtns('inv-by', [{ key: 'type', label: 'By kind' }, { key: 'acct', label: 'By account' }], this.by),
          body: `<div class="inv-ring-wrap">${OG.chartBox('inv-ring', 'inv-ring')}<div class="inv-ring-c" id="inv-ring-c"></div></div>
            <div class="nw-sum inv-alloc-list" id="inv-alloc-list"></div>${OG.stateLine('inv-alloc-state')}` }),
      };
      el.innerHTML = OG.frame(this, OG.layout(this));

      this.hold = OG.inv.holdQ();
      this.sales = OG.inv.salesQ();
      this.tot = WF.q(`${P}tot`, { dataset: WEALTH, metrics: { v: 'holdings_value', u: 'unrealized_pnl', up: 'unrealized_pnl_pct', n: 'holdings_count' },
        aql: 'explore { measures { v: holdings_value, u: unrealized_pnl, up: unrealized_pnl_pct, n: holdings_count } }' });
      // the cash in the investment accounts (SSI's idle cash) and the invested value Home shows (same metric, same group)
      this.cash = WF.q(`${P}cash`, { dataset: WEALTH, metrics: { c: 'cash_balance', v: 'accounts_value' },
        aql: `explore { measures { c: cash_balance, v: accounts_value } filters { ${INV} } }` });
      this.acc = WF.q(`${P}acc`, { dataset: WEALTH, metrics: { h: 'account_holdings' },
        aql: `explore { dimensions { a: dim_accounts.name } measures { h: account_holdings } filters { ${INV} } sorts { h desc } }` });

      const list = $('inv-list'), closed = $('inv-closed');
      for (const l of [list, closed]) {
        l.addEventListener('click', (e) => { const r = e.target.closest('[data-sym]'); if (r) this.openHolding(r.dataset.sym); });
        l.addEventListener('keydown', (e) => { const r = e.target.closest('[data-sym]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.openHolding(r.dataset.sym); } });
      }
      OG.bindKeys($('inv-sort'), (k) => { this.sort = k; this.listSig = null; WF.renderAll(); });
      OG.bindKeys($('inv-by'), (k) => { this.by = k; this.ringSig = null; WF.renderAll(); });
      OG.bindKeys($('inv-h-notes'), (k) => this.notes?.find((x) => x.k === k)?.go());
      $('inv-pct').addEventListener('click', (e) => { this.pct = !this.pct;
        e.currentTarget.classList.toggle('on', this.pct); e.currentTarget.setAttribute('aria-pressed', String(this.pct)); list.classList.toggle('hide-pct', !this.pct); });
      app.execute();
    },
    openHolding(sym) {
      const go = () => OG.inv.openDrawer(this, sym);
      // the holding's row may be folded away: open its group first
      const row = $('inv-list')?.querySelector(`[data-sym="${CSS.escape(sym)}"]`);
      if (row?.hidden) { const g = row.dataset.under; $('inv-list').querySelector(`[data-toggle="${CSS.escape(g)}"]`)?.click(); }
      go();
    },
    groups() {
      const open = OG.inv.rows().filter(OG.inv.isOpen), total = open.reduce((a, r) => a + n(r.v), 0);
      const by = new Map();
      open.forEach((r) => { const k = r.sub ?? 'Other'; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
      const gs = [...by].map(([k, rows]) => ({ ...OG.inv.sub(k), rows, v: rows.reduce((a, r) => a + n(r.v), 0), bc: rows.reduce((a, r) => a + n(r.bc), 0) }));
      gs.sort((a, b) => b.v - a.v);
      return { gs, total, open };
    },
    drawHero() {
      if (!WF.status(this.tot, null)) return;
      const k = WF.one(this.tot), id = this.tot.name;
      $('inv-h-hero').innerHTML = `<span data-trace="${id}:v">${money(k.v)}</span>`;
      $('inv-h-hero-delta').innerHTML = `${OG.delta({ amt: k.u, pct: k.up, word: 'unrealised', trace: { amt: `${id}:u`, pct: `${id}:up` } })} <span class="muted">· <span data-trace="${id}:n">${n(k.n)}</span> holdings</span>`;
    },
    drawList() {
      if (!WF.status(this.hold, $('inv-hold-state'), 'No holdings.')) return;
      const sig = [this.hold.result, this.sales.result, this.cash.result, this.tot.result, this.sort];
      if (this.listSig && sig.every((r, i) => r === this.listSig[i])) return;
      this.listSig = sig;
      const id = this.hold.name, { gs, total } = this.groups(), s = SORT[this.sort];
      OG.setPick($('inv-sort'), this.sort);
      $('inv-split').innerHTML = `<div class="inv-split">${OG.splitBar(gs.map((g) => ({ label: `${g.label} · ${pct1(g.v / total)} · ${approx(g.v)}`, value: g.v, tone: g.tone })))}</div>`;
      const sub = (r) => this.sort === 'today'
        ? `<span class="${OG.tone(r.dc)}" data-trace="${id}:dc">${pct1(r.dc, true)}</span> <span class="muted">today</span>`
        : `<span class="${OG.tone(r.retp)}" data-trace="${id}:retp">${pct1(r.retp, true)}</span>`;
      $('inv-list').innerHTML = gs.map((g) => {
        const gk = `grp:${g.k}`, gret = g.bc ? g.v / g.bc - 1 : null;
        const rows = [...g.rows].sort((a, b) => s.by(b) - s.by(a));
        return `<div class="inv-grp" data-g="${esc(g.k)}">${OG.line({ cls: 'nw-sum-gline inv-gline',
          lead: `<span class="nw-sw" style="background:var(${g.tone})"></span>`, title: OG.discBtn({ key: gk, label: esc(g.label), caret: 'end' }),
          aside: `<span class="inv-gw">${pct1(g.v / total)}</span>${this.sort === 'ret' && gret != null ? ` <span class="${OG.tone(gret)}">${pct1(gret, true)}</span>` : ''}`,
          value: `<span class="amt">${approx(g.v)}</span>` })}
          ${rows.map((r) => OG.row({ cls: 'inv-row', attrs: `data-sym="${esc(r.s)}" data-under="${gk}" role="button" tabindex="0" title="Open ${esc(r.s)}"`,
            title: esc(r.s), meta: `${esc(r.n)}<span class="inv-w"> · ${pct1(n(r.v) / total)}</span>`,
            value: `<span class="amt" data-trace="${id}:v">${approx(r.v)}</span>`, sub: sub(r) })).join('')}</div>`;
      }).join('');
      OG.applyFold($('inv-list'));
      // closed positions, folded: realised, and when they were sold
      const sales = WF.status(this.sales, null) ? WF.rows(this.sales) : [];
      const closed = OG.inv.rows().filter((r) => !OG.inv.isOpen(r));
      $('inv-closed').innerHTML = closed.length ? `<div class="inv-grp">${OG.line({ cls: 'nw-sum-gline inv-gline', lead: '<span class="nw-sw inv-sw-closed"></span>',
          title: OG.discBtn({ key: 'closed', label: `Closed · ${closed.length}`, caret: 'end' }), value: '' })}
        ${closed.map((r) => { const sale = sales.find((x) => x.s === r.s);
          return OG.row({ cls: 'inv-row', attrs: `data-sym="${esc(r.s)}" data-under="closed" role="button" tabindex="0" title="Open ${esc(r.s)}"`,
            title: esc(r.s), meta: `${esc(r.n)}${sale ? ` · sold ${esc(dayMon(sale.d))}` : ''}`,
            value: `<span class="amt ${OG.tone(r.r)}" data-trace="${id}:r">${money(r.r, true)}</span>`, sub: '<span class="muted">realised</span>' }); }).join('')}</div>` : '';
      OG.applyFold($('inv-closed'));
      // the reconcile, as a sum: the holdings + the cash sitting in SSI = the invested value on Home › Investments
      if (WF.status(this.cash, null) && WF.status(this.tot, null)) {
        const c = WF.one(this.cash), cid = this.cash.name, t = WF.one(this.tot);
        $('inv-cash').innerHTML = `${OG.line({ title: 'Holdings', value: `<span class="amt" data-trace="${this.tot.name}:v">${approx(t.v)}</span>` })}
          ${OG.line({ title: 'Cash in SSI <span class="muted">not invested yet</span>', value: `<span class="amt" data-trace="${cid}:c">+${approx(c.c)}</span>` })}
          ${OG.line({ cls: 'inv-cash-tot', title: 'Invested in total', value: `<span class="amt" data-trace="${cid}:v">${approx(c.v)}</span>` })}
          <div class="inv-cash-foot"><span class="ok">${OG.icon('check', 'sm')}Matches Investments on Home</span><button type="button" class="btn link inv-cash-go" data-go="home/invest">See it</button></div>`;
      }
      const sym = OG.inv.drawerSym();
      if (sym) this.el.querySelectorAll('[data-sym]').forEach((r) => r.classList.toggle('active', r.dataset.sym === sym));
    },
    drawRing() {
      if (!WF.status(this.hold, $('inv-alloc-state'), 'No holdings.')) return;
      OG.setActive($('inv-by'), this.by);
      const { gs, total } = this.groups();
      let parts;
      if (this.by === 'acct') {
        if (!WF.status(this.acc, $('inv-alloc-state'))) return;
        parts = WF.rows(this.acc).map((r) => ({ name: r.a, v: n(r.h), tone: OG.inv.ACCT_TONE[r.a] ?? '--chart-rest', trace: `${this.acc.name}:h` }));
      } else parts = gs.map((g) => ({ name: g.label, k: g.k, v: g.v, tone: g.tone }));
      const sig = [this.hold.result, this.acc.result, this.by];
      if (this.ringSig && sig.every((r, i) => r === this.ringSig[i])) return;
      this.ringSig = sig;
      const sum = parts.reduce((a, p) => a + p.v, 0) || total || 1;
      OG.gauge($('inv-ring'), parts.map((p) => ({ name: p.name, value: p.v, color: WF.charts.css(p.tone) })));
      $('inv-ring-c').innerHTML = `<div class="hero inv-ring-v">${approx(sum)}</div><div class="sub">${this.by === 'acct' ? `${parts.length} accounts` : `${parts.length} kinds`}</div>`;
      $('inv-alloc-list').innerHTML = parts.map((p) => OG.line({ cls: 'nw-sum-gline inv-al', attrs: p.k ? `data-g="${esc(p.k)}"` : '',
        lead: `<span class="nw-sw" style="background:var(${p.tone})"></span>`, title: esc(p.name), aside: pct1(p.v / sum),
        value: `<span class="amt"${p.trace ? ` data-trace="${p.trace}"` : ''}>${approx(p.v)}</span>` })).join('');
      // hovering a slice (or its line) lights the matching group in the list
      const ch = WF.charts.chart($('inv-ring'));
      const light = (k) => $('inv-list').querySelectorAll('.inv-grp').forEach((g) => g.classList.toggle('on', !!k && g.dataset.g === k));
      ch.off('mouseover'); ch.off('mouseout');
      if (this.by === 'type') {
        ch.on('mouseover', (e) => light(parts.find((p) => p.name === e.name)?.k));
        ch.on('mouseout', () => light(null));
      }
      $('inv-alloc-list').onmouseover = (e) => light(e.target.closest('[data-g]')?.dataset.g);
      $('inv-alloc-list').onmouseleave = () => light(null);
    },
    drawNotes() {
      const rows = OG.inv.rows();
      if (!WF.status(this.hold, $('inv-h-notes-state'))) return;
      if (this.notesSig === this.hold.result && this.notesSales === this.sales.result) return;   // keep focus / hover across redraws
      this.notesSig = this.hold.result; this.notesSales = this.sales.result;
      const open = rows.filter(OG.inv.isOpen), total = open.reduce((a, r) => a + n(r.v), 0), out = [];
      const top = [...open].sort((a, b) => n(b.v) - n(a.v))[0];
      if (top && total && n(top.v) / total > 0.25) out.push({ k: 'conc', icon: 'invest', tone: '',
        html: `<span class="em">${esc(top.s)}</span> is ${pct1(n(top.v) / total)} of what you hold, your biggest single bet`, why: 'Shown when one holding is over 25% of the total', go: () => this.openHolding(top.s) });
      const best = [...open].sort((a, b) => n(b.retp) - n(a.retp))[0];
      if (best && n(best.retp) > 0) out.push({ k: 'best', icon: 'trend', tone: 'pos',
        html: `<span class="em">${esc(best.s)}</span> is up <span class="num" data-trace="${this.hold.name}:retp">${pct1(best.retp)}</span> on what you paid`, why: 'Your best return since you bought', go: () => this.openHolding(best.s) });
      const under = open.filter((r) => n(r.u) < 0).sort((a, b) => n(a.retp) - n(b.retp));
      if (under.length) {
        const names = under.map((r) => `<span class="em">${esc(r.s)}</span>`);
        out.push({ k: 'under', icon: 'trend-down', tone: 'neg',
          html: `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)} are` : `${names[0]} is`} below what you paid`, why: 'Holdings now worth less than you paid', go: () => this.openHolding(under[0].s) });
      }
      if (WF.status(this.sales, null)) {
        const closed = rows.filter((r) => !OG.inv.isOpen(r));
        for (const r of closed) {
          const sale = WF.rows(this.sales).find((x) => x.s === r.s);
          if (!sale || !n(sale.up)) continue;
          const since = n(r.p) / n(sale.up) - 1;
          out.push({ k: `sold:${r.s}`, icon: 'coins', tone: since < 0 ? 'pos' : '',
            html: since < 0 ? `Selling <span class="em">${esc(r.s)}</span> on ${esc(dayMon(sale.d))} dodged a ${pct1(Math.abs(since))} drop`
              : `<span class="em">${esc(r.s)}</span> is up ${pct1(since)} since you sold it on ${esc(dayMon(sale.d))}`, why: 'A sale, against its price today', go: () => this.openHolding(r.s) });
        }
      }
      this.notes = out.slice(0, 4);
      $('inv-h-notes').innerHTML = OG.notes(this.notes);
      this.el.querySelector('[data-anfra-block="inv-hold-notes"]').hidden = !this.notes.length;
    },
    render() {
      this.drawHero();
      this.drawList();
      this.drawNotes();
      this.drawRing();
      OG.inv.drawDrawer();
    },
  };
  WF.register(view);
})();
