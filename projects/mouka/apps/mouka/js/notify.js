// Notifications (18 Oct, Nhi): a bell in every page header, beside ✦ trace and hide balances. It lists what needs the
// user's attention now, each item read from a governed query and opening the page that owns it:
//   · a card bill due within 7 days (og_card_bill, the same query as Cash flow › Credit)
//   · MAX VIB's cashback behind pace in the current cycle (og_vib, OG.vibQ)
//   · a source in use that stopped loading (og2_fresh, OG.stale: its missing days make totals read low)
//   · a recurring charge that is late or due within 3 days (og_ntf_due, from fct_recurring)
// The dot on the bell would count the items not yet seen; 19 Oct (Nhi): the demo assumes they have all been read, so it never shows.
(() => {
  const { fmt } = WF;
  const { esc, icon, money, approx, dayMon } = OG;
  const PF = 'personal_finance';
  const when = (dd) => (dd < 0 ? `${-dd} day${dd === -1 ? '' : 's'} late` : dd === 0 ? 'today' : dd === 1 ? 'tomorrow' : `in ${dd} days`);

  const bill = WF.q('og_card_bill', { dataset: PF, metrics: { bal: 'card_statement_balance', mn: 'card_min_payment', due: 'card_payment_due' },
    aql: 'explore { measures { bal: card_statement_balance, mn: card_min_payment, due: card_payment_due } }' });
  const vib = OG.vibQ();
  const due = WF.q('og_ntf_due', { dataset: PF, pageSize: 20, metrics: {},
    aql: 'explore { dimensions { m: fct_recurring.merchant_display, k: fct_recurring.kind, dd: fct_recurring.days_to_due, nd: fct_recurring.next_due, amt: fct_recurring.expected_vnd } filters { fct_recurring.days_to_due <= 3 } sorts { dd asc } }' });
  const ok = (q) => q.state === 'success' && !!q.result;

  // [{ key, tone: 'warn' | 'neg' | 'info', title, sub, go }] — keys stay the same while the fact does, so "seen" sticks
  function items() {
    const out = [];
    if (ok(bill) && WF.rows(bill).length) {
      const b = WF.one(bill), d = b.due ? OG.daysBetween(WF.asOf, fmt.ymd(b.due)) : null, bal = fmt.n(b.bal) ?? 0;
      if (d != null && d >= 0 && d <= 7 && bal > 0) out.push({ key: `bill:${fmt.ymd(b.due)}`, tone: d <= 3 ? 'warn' : 'info', go: 'spending/credit',
        title: `TCB Visa bill due ${when(d)}`, sub: `<span class="amt" data-trace="og_card_bill:bal">${money(bal)}</span> statement · min <span class="amt" data-trace="og_card_bill:mn">${approx(b.mn)}</span>` });
    }
    if (ok(vib) && WF.rows(vib).length) {
      const v = WF.one(vib), dl = fmt.n(v.dl) ?? 0;
      if (v.st === 'behind') out.push({ key: `vib:${v.c}`, tone: 'warn', go: 'spending/credit',
        title: 'MAX VIB cashback is behind pace', sub: `${dl} ${dl === 1 ? 'day' : 'days'} left · <span class="amt" data-trace="og_vib:need">${approx(v.need)}</span> a day to max it` });
    }
    for (const s of OG.stale()) out.push({ key: `stale:${s.s}:${fmt.ymd(s.last)}`, tone: 'neg', go: 'spending/cashflow',
      title: `${s.s} stopped loading`, sub: `No lines after <span data-trace="og2_fresh:last">${esc(dayMon(s.last))}</span>, so totals after that read low` });
    if (ok(due)) for (const r of WF.rows(due).filter((x) => x.k !== 'income')) {
      const dd = fmt.n(r.dd) ?? 0;
      out.push({ key: `due:${r.m}:${fmt.ymd(r.nd)}`, tone: dd < 0 ? 'neg' : 'info', go: 'spending/recurring',
        title: `${r.m} ${dd < 0 ? 'is late' : `due ${when(dd)}`}`, sub: `<span class="amt" data-trace="og_ntf_due:amt">${money(r.amt)}</span> · ${esc(dayMon(r.nd))}` });
    }
    return out;
  }

  const seen = new Set();
  let pop = null, anchor = null;
  // the bell in the sidebar's head (and, at xs, in every page header: js/origin.js frame); its dot counts the unseen items
  function paint() {
    const list = items();
    list.forEach((x) => seen.add(x.key));   // read already (19 Oct, Nhi: no red dot)
    const fresh = list.filter((x) => !seen.has(x.key)).length;
    document.querySelectorAll('[data-action="notify"]').forEach((b) => {
      b.querySelector('.ntf-dot').hidden = !fresh;
      b.querySelector('.ntf-dot').textContent = fresh > 9 ? '9+' : String(fresh || '');
      b.setAttribute('aria-label', `Notifications${list.length ? `, ${list.length}${fresh ? ` (${fresh} new)` : ''}` : ', none'}`);
    });
    if (pop) draw();
  }
  function draw() {
    const list = items();
    pop.innerHTML = `<div class="ntf-h">Notifications</div>${list.length ? list.map((x) => `<button type="button" class="ntf-i" data-go-ntf="${esc(x.go)}">
        <span class="ntf-tone ${x.tone}" aria-hidden="true"></span><span class="ntf-b"><span class="ntf-t">${esc(x.title)}</span><span class="ntf-s">${x.sub}</span></span>${icon('chev', 'sm')}</button>`).join('')
      : '<div class="ntf-empty">Nothing needs your attention.</div>'}`;
  }
  function close() {
    if (!pop) return;
    pop.remove(); pop = null;
    anchor?.setAttribute('aria-expanded', 'false'); anchor = null;
  }
  function open(btn, keyboard) {
    close();
    anchor = btn;
    pop = Object.assign(document.createElement('div'), { className: 'ntf-pop', role: 'dialog' });
    pop.setAttribute('aria-label', 'Notifications');
    pop.dataset.anfraRender = 'skip';
    document.body.append(pop);
    draw();
    // under the bell, right-aligned to it, kept inside the window (a phone: it slides left to fit)
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    if (btn.closest('.sidebar')) {   // the sidebar's bell (19 Oct): the list opens beside the sidebar, top-aligned with the bell
      pop.style.top = `${r.top}px`;
      pop.style.left = `${Math.min(btn.closest('.sidebar').getBoundingClientRect().right + 8, innerWidth - w - 8)}px`;
    } else {
      pop.style.top = `${r.bottom + 8}px`;
      pop.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
    }
    pop.style.transformOrigin = btn.closest('.sidebar') ? 'top left' : 'top right';   // it grows from the bell
    pop.classList.toggle('instant', !!keyboard);
    btn.setAttribute('aria-expanded', 'true');
    items().forEach((x) => seen.add(x.key));
    paint();
    if (keyboard) pop.querySelector('button')?.focus();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action="notify"]');
    if (b) { pop && anchor === b ? close() : open(b, e.detail === 0); return; }
    const it = e.target.closest('[data-go-ntf]');
    if (it) { const to = it.dataset.goNtf; close(); WF.go(to); return; }
    if (pop && !pop.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) { const a = anchor; close(); a?.focus(); } });
  addEventListener('resize', close);
  WF.app.subscribe(paint);
  // a page's header is drawn the first time it opens: paint its bell then too
  new MutationObserver(paint).observe(document.getElementById('views'), { childList: true });
  OG.notify = { items, paint };
})();
