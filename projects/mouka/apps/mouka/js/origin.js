// mouka's data-aware building blocks over the shared core machinery (WF.q, controls, periods, router, trace),
// plus the Mobbin lessons that several pages share: per-source freshness (O1), hover definitions (O6), the Mom toggle (O5),
// "Doesn't look right?" (O14), Transactions deep links, and accounts in the sidebar (O17).
// Layout: sidebar · page title + circle buttons · quiet tabs · white cards with a mono label header and a ✦ button
// that explains the card's headline number (its governed definition and the AQL that ran).
(() => {
  const { fmt } = WF;
  const app = WF.app;
  // the markup builders live in js/ds/components.js (loaded first); this file adds the data-aware ones + behaviour
  const { esc, $, icon, card, segIcons, bindKeys, setActive, ranges, kpis, table, drawer, closeDrawer } = OG;
  const CAT_ICON = { 'Food & drinks': 'food', Transport: 'car', Bills: 'bolt', Cat: 'paw', 'Well-being': 'heart', Shopee: 'bag',
    Subscriptions: 'repeat', Learning: 'cap', Other: 'tag', Savings: 'piggy', Investing: 'trend', Untagged: 'question' };
  const CAT_VN = { 'Ăn uống': 'Food & drinks', 'Đi lại': 'Transport', 'Hoá đơn': 'Bills', 'Mèo': 'Cat', 'Học tập': 'Learning', 'Khác': 'Other',
    'Tiết kiệm': 'Savings', 'Đầu tư': 'Investing', '(chưa phân loại)': 'Untagged', Subscription: 'Subscriptions' };
  const catIcon = (en) => CAT_ICON[en] ?? CAT_ICON[CAT_VN[en]] ?? (/food|eat/i.test(en) ? 'food' : /learn|edu/i.test(en) ? 'cap' : /cat|pet/i.test(en) ? 'paw' : 'tag');
  const catEn = (c) => CAT_VN[c] ?? c;
  // C12: every chip paints its category with the calm palette (OG.catColor), whatever colour the row carried.
  const chip = (color, en, sm = false) => `<span class="chip${sm ? ' sm' : ''}" style="--c:${esc(catColor(en, color || css('--cat-fallback')))}">${icon(catIcon(en))}</span>`;
  const initials = (s) => String(s ?? '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  // Flow types that bring money in (ledger signed amounts carry the sign; this only picks the row icon).
  const TX_ICON = { salary: 'dollar', bonus: 'dollar', interest: 'dollar', friend_payback: 'transfer', card_refund: 'transfer' };

  // ----- formats in Origin's register (₫ amounts, compact on axes)
  // C1 one precision per context (the "precision ladder"; DESIGN.md):
  //   money()  exact to the đồng: actuals that are the subject (page hero, tables, trace and hover cards)
  //   approx() 3 significant figures: secondary text, comparisons, aggregates, axes (₫16.8M, ₫2.65M, ₫423M)
  //   proj()   2 significant figures: projections and estimates (₫2.7B in 10 years)
  // Display only: the governed value is untouched and the exact figure is one hover away.
  const sig = (digits) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: digits });
  const sig3 = sig(3), sig2 = sig(2);
  const ladder = (f) => (v, signed = false) => {
    const x = fmt.n(v);
    if (x === null || !Number.isFinite(x)) return '—';
    const s = x < 0 ? '-' : signed && x > 0 ? '+' : '';
    return `${s}₫${f.format(Math.abs(x))}`;
  };
  const approx = ladder(sig3), proj = ladder(sig2);
  const short = (v) => approx(v);
  const money = (v, signed = false) => fmt.money(v, signed);
  const pct1 = (v, signed = false) => fmt.pct(v, signed).replace(/(\.\d)\d%/, '$1%');
  const dayMon = (v) => new Date(`${fmt.ymd(v)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const monthName = (v, long = true) => new Date(`${fmt.ymd(v)}T00:00:00`).toLocaleDateString('en-US', { month: long ? 'long' : 'short' });
  const tone = (v) => (fmt.n(v) > 0 ? 'pos' : fmt.n(v) < 0 ? 'neg' : '');

  // ----- controls shared across pages (each mapped onto a query at most once)
  const mapped = new Set();
  const mapOnce = (control, field = 'dim_dates.date_key') => (...qs) => qs.forEach((q) => {
    const k = `${control.name}|${q.name}`;
    if (mapped.has(k)) return;
    mapped.add(k); app.mapControl(control, q, { field });
  });
  const account = WF.fieldControl('og_account', 'wealth', 'dim_accounts.account_id');
  const accounts = WF.q('accounts_assets', { dataset: 'wealth',   // same governed list as WF.accountPicker
    aql: `explore { dimensions { id: dim_accounts.account_id, name: dim_accounts.name, o: dim_accounts.group_order }
                    filters { dim_accounts.is_liability is false } sorts { o asc, name asc } }` });
  const state = { accounts: [] };   // [] = all accounts
  function setAccounts(ids) {
    state.accounts = ids;
    account.setCondition({ operator: 'is', values: ids });
    app.execute();
  }
  const mapAccount = mapOnce(account, 'dim_accounts.account_id');

  // ----- page frame: title row, tabs
  // The single list of pages: the sidebar + tab bar (app.html), the page titles and the Definitions grouping all read it.
  const NAV = [['ask', 'Ask AI'], ['home', 'Home'], ['spending', 'Cash flow'], ['invest', 'Invest'], ['forecast', 'Forecast']];
  const navLabel = (nav) => (NAV.find(([n]) => n === nav)?.[1] ?? (nav === 'defs' ? 'Definitions' : nav));
  // Header: the title on the left (the as-of date lives in the sidebar, 17 Oct); on the right the notifications bell only at xs
  // (it lives in the sidebar's head since 19 Oct; js/notify.js), the two controls that act on every number (C8): ✦ trace and hide
  // balances, then + Add last, in ink (19 Oct, Nhi: a menu of what can be added, not built yet). No greeting, avatar or ? (Origin's circle row).
  function frame(view, body) {
    const tabs = [...WF.views.values()].filter((v) => v.nav === view.nav && v.tab);
    const vid = view.id.replace('/', '-');
    return `
      <header class="head" data-anfra-container="${vid}-head" data-anfra-label="Page header">
        <h1>${esc(navLabel(view.nav))}</h1>${view.soon ? OG.soonTag() : ''}
        <span class="me-chip" data-me-chip hidden></span>
        <span class="grow"></span>
        <button class="circle ntf-btn xs-only" type="button" data-action="notify" aria-haspopup="dialog" aria-expanded="false" title="Notifications" aria-label="Notifications">${icon('bell')}<span class="ntf-dot" hidden></span></button>
        <button class="circle" type="button" data-action="trace" title="Trace every number to its definition" aria-label="Trace every number to its definition">${icon('formula')}</button>
        <button class="circle" type="button" data-action="privacy" title="Hide balances" aria-label="Hide balances">${icon('eyeoff')}</button>
        <span class="menu-wrap add-wrap"><button class="circle add-btn" type="button" data-menu-btn aria-haspopup="menu" aria-expanded="false" aria-label="Add" title="Add">${icon('plus')}</button>
          <div class="menu add-menu" role="menu" hidden>${[['tx', 'receipt', 'Transaction'], ['account', 'landmark', 'Account'], ['asset', 'gem', 'Asset']].map(([k, ic, l]) =>
            `<button type="button" role="menuitem" data-k="add-${k}" aria-disabled="true">${icon(ic, 'sm')}<span>${l}</span><span class="soon-tag">Soon</span></button>`).join('')}</div></span>
      </header>
      ${tabs.length > 1 ? `<nav class="tabs" role="tablist" aria-label="${esc(navLabel(view.nav))} views" data-anfra-block="${vid}-tabs" data-anfra-label="Tabs">${tabs.map((v) =>
        `<button class="tab${v.id === view.id ? ' active' : ''}" type="button" role="tab" aria-selected="${v.id === view.id}" data-go="${v.id}">${esc(v.tab)}</button>`).join('')}</nav>` : '<div class="tabs-gap"></div>'}
      <div class="with-insp"${tabs.length > 1 ? ' role="tabpanel"' : ''}><div class="view-body">${body}</div><aside class="inspector" hidden></aside></div>`;
  }

  // Chart tooltips render on <body> (C17), so a page or tab switch would leave the last one on screen: hide them all.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-go], [data-nav]')) return;
    document.querySelectorAll('[_echarts_instance_]').forEach((n) => echarts.getInstanceByDom(n)?.dispatchAction({ type: 'hideTip' }));
  }, true);

  // ⓘ explain: hover (or focus) opens it after a beat, leaving it closes it; a click pins it until an outside click / Escape
  let exOpen = null, exPinned = false, exTimer = null;
  const exPop = () => $('trace-pop');
  const exLater = (fn, ms) => { clearTimeout(exTimer); exTimer = setTimeout(fn, ms); };
  const exClose = () => { if (exOpen && !exPinned) WF.tracer.close(); exOpen = null; };
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest('[data-explain]');
    if (b) { if (b !== exOpen) exLater(() => { exPinned = false; openExplain(b); }, 120); else clearTimeout(exTimer); return; }
    if (exPop()?.contains(e.target)) { clearTimeout(exTimer); return; }
    if (exOpen && !exPinned) exLater(exClose, 250); else clearTimeout(exTimer);
  });
  document.addEventListener('focusin', (e) => { const b = e.target.closest?.('[data-explain]'); if (b && b !== exOpen) { exPinned = false; openExplain(b); } });
  document.addEventListener('focusout', (e) => { if (e.target.closest?.('[data-explain]') && !exPinned) exLater(exClose, 150); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-explain]');
    if (!b) { if (!exPop()?.contains(e.target)) { exPinned = false; exOpen = null; } return; }
    clearTimeout(exTimer);
    if (exOpen === b && !exPinned) { exPinned = true; return; }   // hover already opened it: the click only pins it
    exPinned = true;
    openExplain(b);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { exPinned = false; exOpen = null; } });
  function openExplain(b) {
    exOpen = b;
    const r = b.getBoundingClientRect();
    // open beside the ⓘ, on the side with more room (js/core/trace.js place())
    WF.tracer.explain(b.dataset.explain, r.left, r.bottom, r);
    if (b.dataset.rows) {   // O14: from the definition straight to the rows behind it
      const pop = $('trace-pop');
      pop.insertAdjacentHTML('beforeend', `<div class="rows-go"><button type="button" data-rows-go='${esc(b.dataset.rows)}'>Doesn't look right? See the rows ${icon('chev', 'sm')}</button></div>`);
      WF.tracer.reposition();
    }
    // the popover grew after trace.js placed it: keep it inside the viewport
    const pop = $('trace-pop');
    pop.style.top = `${Math.max(8, Math.min(parseFloat(pop.style.top) || 8, innerHeight - pop.offsetHeight - 12))}px`;
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-rows-go]');
    if (!g) return;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));   // unpin the popover (trace.js) and close overlays
    openTx(JSON.parse(g.dataset.rowsGo));
  });


  // A transaction row (Origin's list): icon · merchant/date · signed amount.
  function txRow(r, id, { amtAlias = 'amt', signed = true } = {}) {
    const inflow = fmt.n(r[amtAlias]) > 0 && signed;
    const ic = TX_ICON[r.ft] ? icon(TX_ICON[r.ft]) : icon(catIcon(r.en ?? r.cat));
    return `<div class="tx${r.ft === 'friend_payback' ? ' dim' : ''}"><span class="ic" style="--tx-ic:${esc(r.color || 'var(--ink-2)')}">${ic}</span>
      <div class="tx-main"><div class="t">${esc(r.m || r.desc || '—')}</div><div class="s">${dayMon(r.d)}</div></div>
      <div class="amt ${inflow ? 'pos' : ''}" data-trace="${id}:${amtAlias}">${signed ? (inflow ? '+' : '') + money(Math.abs(fmt.n(r[amtAlias]))) : money(r[amtAlias])}</div></div>`;
  }


  // Origin's month calendar: day number + ₫ spent; the biggest day is filled blue.
  function monthCal(month0, rows, { key = 'period', val = 'spent', id, asOf = WF.asOf } = {}) {
    const first = new Date(`${month0}T00:00:00`), y = first.getFullYear(), m = first.getMonth();
    const days = new Date(y, m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;   // Monday first
    const by = new Map(rows.map((r) => [fmt.ymd(r[key]), r[val]]));
    let maxDay = null, maxV = -Infinity;
    by.forEach((v, d) => { if (Number(v) > maxV) { maxV = Number(v); maxDay = d; } });
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="d pad"></div>');
    for (let d = 1; d <= days; d++) {
      const ds = `${month0.slice(0, 8)}${String(d).padStart(2, '0')}`, v = by.get(ds), future = ds > asOf;
      cells.push(`<div class="d${future ? ' future' : ''}${v == null && !future ? ' none' : ''}${ds === maxDay ? ' max' : ''}${ds === asOf ? ' today' : ''}">
        <span>${d}</span><span class="v"${v != null && id ? ` data-trace="${id}:${val}"` : ''}>${future ? '' : v != null ? short(v).replace('₫', '') : '–'}</span></div>`);
    }
    return `<div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => `<div class="muted cal-h">${w}</div>`).join('')}${cells.join('')}</div>`;
  }

  // ----- popover (account filter) + drawer
  let openPop = null;
  const closePop = () => { openPop?.remove(); openPop = null; };
  // composedPath, not contains(): an option click redraws the popover, detaching the clicked node.
  document.addEventListener('click', (e) => { if (openPop && !e.composedPath().includes(openPop) && !e.target.closest('[data-pop-anchor]')) closePop(); });
  function accountPopover(anchor) {
    if (openPop) { closePop(); return; }
    anchor.setAttribute('data-pop-anchor', '');   // the click that opened it (a ⋮ menu item) must not count as an outside click
    const all = WF.rows(accounts);
    let pick = new Set(state.accounts.length ? state.accounts.map(String) : all.map((r) => String(r.id)));
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.dataset.anfraBlock = 'og-account-pop'; pop.dataset.anfraLabel = 'Your accounts'; pop.dataset.anfraControl = 'og_account';
    const draw = () => {
      const allOn = pick.size === all.length, none = pick.size === 0;
      pop.innerHTML = `<div class="ph"><span>Your accounts</span><button type="button" data-all class="box ${allOn ? 'on' : none ? '' : 'mixed'}">${allOn ? icon('check', 'sm') : ''}</button></div>
        ${all.map((r) => `<div class="opt" data-id="${esc(r.id)}"><span class="initial sm">${esc(initials(r.name))}</span><div><div class="t">${esc(r.name)}</div></div>
          <span class="box ${pick.has(String(r.id)) ? 'on' : ''}">${pick.has(String(r.id)) ? icon('check', 'sm') : ''}</span></div>`).join('')}
        <div class="pf"><button class="btn link" type="button" data-clear>Clear filters</button><button class="btn black" type="button" data-apply>Apply</button></div>`;
    };
    pop.addEventListener('click', (e) => {
      const o = e.target.closest('.opt');
      if (o) { const id = o.dataset.id; pick.has(id) ? pick.delete(id) : pick.add(id); draw(); return; }
      if (e.target.closest('[data-all]')) { pick = pick.size === all.length ? new Set() : new Set(all.map((r) => String(r.id))); draw(); return; }
      if (e.target.closest('[data-clear]')) { closePop(); setAccounts([]); return; }
      if (e.target.closest('[data-apply]')) { closePop(); setAccounts(pick.size === all.length || pick.size === 0 ? [] : [...pick]); }
    });
    draw();
    const host = anchor.closest('.card');
    host.append(pop);
    const hb = host.getBoundingClientRect(), ab = anchor.getBoundingClientRect();
    pop.style.top = `${ab.bottom - hb.top + 6}px`;
    pop.style.right = `${Math.max(8, hb.right - ab.right)}px`;
    openPop = pop;
  }
  // A popover under its anchor, right-aligned to it, inside the anchor's card; it becomes THE open popover (an outside click
  // or Escape closes it). Shared by the date range picker and the Transactions filter. It is never taller than the room
  // under its anchor (18 Oct, Nhi): down to the card's bottom or the window's, whichever comes first, but at least 320px
  // (a short card lets it reach the window's bottom instead); its body scrolls inside.
  function showPop(anchor, pop) {
    anchor.setAttribute('data-pop-anchor', '');
    const host = anchor.closest('.card');
    host.append(pop);
    const hb = host.getBoundingClientRect(), ab = anchor.getBoundingClientRect();
    pop.style.top = `${ab.bottom - hb.top + 6}px`;
    pop.style.right = `${Math.max(8, hb.right - ab.right)}px`;
    // wider than the room left of its anchor: it slides right, inside the card (8px in), as far as the card allows
    const pw = pop.offsetWidth;
    if (ab.right - pw < hb.left + 8) pop.style.right = `${Math.max(8, hb.width - 8 - pw)}px`;
    const top = ab.bottom + 6, room = Math.min(hb.bottom, window.innerHeight) - top - 16;
    pop.style.maxHeight = `${Math.max(room < 320 ? window.innerHeight - top - 16 : room, 240)}px`;
    openPop = pop;
  }
  const isOpenPop = (cls) => !!openPop?.classList.contains(cls);
  // ----- date range picker (17 Oct, Nhi: replaces the range pills on Transactions; 18 Oct: her wireframe). rangeBtn = the
  // trigger (calendar icon, the range's name or its dates, a caret); rangePopover = the presets on the left (one click picks
  // and closes; hovering one shows its dates on the calendar) and a calendar on the right: two months side by side (one in
  // a narrow card), a first click sets the start, the second the end (the band follows the pointer in between), the
  // "Range selected" From → To fields under it stay in step both ways, Apply dates picks. Days outside the data are off;
  // the last day of data carries a dot. Keyboard: one day is tabbable; arrows move a day / a week, PageUp / PageDown a
  // month, Enter or Space picks. sel = { range: key } | { a, b } (ISO dates); onPick gets the same shape. kbd = opened from
  // the keyboard (focus moves in).
  const RANGE_NAME = { this_month: 'This month', last_month: 'Last month', '1M': 'Past month', '3M': 'Past 3 months', '6M': 'Past 6 months', YTD: 'This year', '1Y': 'Past year', ALL: 'All time' };
  const spanLabel = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${dayMon(a)} – ${dayMon(b)}` : `${dayMon(a)} ${a.slice(0, 4)} – ${dayMon(b)} ${b.slice(0, 4)}`);
  const rangeLabel = (sel) => (sel.range ? RANGE_NAME[sel.range] : spanLabel(sel.a, sel.b));
  const rangeBtn = (id, sel) => `<button type="button" class="btn range-btn" id="${id}" aria-haspopup="dialog" aria-label="Date range: ${esc(rangeLabel(sel))}">${icon('cal', 'sm')}<span class="t">${esc(rangeLabel(sel))}</span>${icon('down', 'sm')}</button>`;
  const UTC = (d) => new Date(`${d}T00:00:00Z`);
  const plusDays = (d, k) => { const x = UTC(d); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
  const m1 = (d) => `${d.slice(0, 7)}-01`;
  const dayName = (d) => UTC(d).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const monthTitle = (m) => UTC(m).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  function rangePopover(anchor, sel, onPick, { kbd = false } = {}) {
    if (openPop) { closePop(); return; }
    const [a0, b0] = sel.range ? WF.range(sel.range) : [sel.a, sel.b];
    const lo = WF.firstDay, hi = WF.asOf, loM = m1(lo), hiM = m1(hi);
    const two = (anchor.closest('.card')?.clientWidth ?? 0) >= 640;   // two months when the card has room for them (≈ 620px)
    const n = two ? 2 : 1;
    let a = a0, b = b0, hover = null, preview = null, focusD = b0;
    // the first month shown: the end's month is the last one shown, never before the data's first month
    const clampM = (m) => { const last = WF.addMonths(hiM, -(n - 1)); return m < loM ? loM : m > last ? (last < loM ? loM : last) : m; };
    let left = clampM(WF.addMonths(m1(b0), -(n - 1)));
    const pop = document.createElement('div');
    pop.className = `popover range-pop${two ? ' two' : ''}`;
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Date range');
    const presets = Object.keys(RANGE_NAME).map((k) => { const [x, y] = WF.range(k);
      return `<button type="button" class="opt rp-opt" data-k="${k}" aria-pressed="${sel.range === k}" title="${esc(spanLabel(x, y))}">${esc(RANGE_NAME[k])}</button>`; }).join('');
    pop.innerHTML = `<div class="rp-presets" role="group" aria-label="Presets">${presets}
        <button type="button" class="rp-opt rp-custom-btn" data-custom aria-pressed="${!sel.range}">Custom</button></div>
      <div class="rp-main"><div class="rp-months"></div>
        <div class="rp-sel"><div class="rp-sel-h">Range selected</div>
          <div class="rp-fields"><input type="date" data-from min="${lo}" max="${hi}" aria-label="From" value="${a0}"><span class="rp-arrow" aria-hidden="true">→</span>
            <input type="date" data-to min="${lo}" max="${hi}" aria-label="To" value="${b0}"></div></div>
        <div class="pf"><button type="button" class="btn" data-cancel>Cancel</button><button type="button" class="btn black" data-apply>Apply dates</button></div></div>`;
    const months = pop.querySelector('.rp-months'), from = pop.querySelector('[data-from]'), to = pop.querySelector('[data-to]'), apply = pop.querySelector('[data-apply]');
    const month = (m, i) => {
      const lead = (UTC(m).getUTCDay() + 6) % 7, days = UTC(WF.addMonths(m, 1)) - UTC(m);
      const cells = Array.from({ length: lead }, () => '<span class="rp-c"></span>');
      for (let d = m, k = 0; k < Math.round(days / 864e5); k++, d = plusDays(d, 1)) {
        const off = d < lo || d > hi;
        cells.push(`<span class="rp-c" data-c="${d}"><button type="button" class="rp-d${d === hi ? ' last' : ''}" data-d="${d}" tabindex="-1" aria-label="${esc(dayName(d))}${d === hi ? ', last day of data' : ''}"${off ? ' disabled' : ''}>${Number(d.slice(8))}</button></span>`);
      }
      const prev = i === 0 ? `<button type="button" class="dots rp-nav" data-nav="-1" aria-label="Previous month"${left <= loM ? ' disabled' : ''}>${icon('left', 'sm')}</button>` : '';
      const next = i === n - 1 ? `<button type="button" class="dots rp-nav" data-nav="1" aria-label="Next month"${WF.addMonths(left, n - 1) >= hiM ? ' disabled' : ''}>${icon('chev', 'sm')}</button>` : '';
      return `<div class="rp-m"><div class="rp-mh">${prev}<span class="t">${esc(monthTitle(m))}</span>${next}</div>
        <div class="rp-grid" role="group" aria-label="${esc(monthTitle(m))}">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => `<span class="rp-w" aria-hidden="true">${w}</span>`).join('')}${cells.join('')}</div></div>`;
    };
    // paint the band: the draft (a → b, or a → the hovered day while the end is pending), or a hovered preset's range
    const paint = () => {
      let [x, y] = preview ?? [a, b ?? hover ?? a];
      if (x && y && x > y) [x, y] = [y, x];
      months.querySelectorAll('[data-c]').forEach((c) => { const d = c.dataset.c;
        c.classList.toggle('in', !!x && !!y && d >= x && d <= y && x !== y);
        c.classList.toggle('s', d === x && x !== y); c.classList.toggle('e', d === y && x !== y); });
      months.querySelectorAll('.rp-d').forEach((el) => { const d = el.dataset.d, end = d === x || d === y;
        el.classList.toggle('on', !!end); el.setAttribute('aria-pressed', String(!!end && !preview));
        el.tabIndex = d === focusD ? 0 : -1; });
      if (!months.querySelector('.rp-d[tabindex="0"]')) months.querySelector('.rp-d:not([disabled])')?.setAttribute('tabindex', '0');
      apply.disabled = !(a && b);
    };
    const draw = () => { months.innerHTML = Array.from({ length: n }, (_, i) => month(WF.addMonths(left, i), i)).join(''); paint(); };
    // show a day: move the months so it is in view
    const reveal = (d) => { const m = m1(d); if (m < left) left = clampM(m); else if (m > WF.addMonths(left, n - 1)) left = clampM(WF.addMonths(m, -(n - 1))); };
    const setFields = () => { from.value = a ?? ''; to.value = b ?? ''; };
    const pick = (d) => {
      if (!a || b) { a = d; b = null; hover = null; }
      else { b = d; if (b < a) [a, b] = [b, a]; }
      focusD = d; setFields(); paint();
      pop.querySelectorAll('[data-k], [data-custom]').forEach((o) => o.setAttribute('aria-pressed', String(o.hasAttribute('data-custom'))));
    };
    pop.addEventListener('click', (e) => {
      const o = e.target.closest('[data-k]');
      if (o) { closePop(); onPick({ range: o.dataset.k }); return; }
      if (e.target.closest('[data-custom]')) { months.querySelector('.rp-d[tabindex="0"]')?.focus(); return; }
      const nav = e.target.closest('[data-nav]');
      if (nav) { left = clampM(WF.addMonths(left, Number(nav.dataset.nav))); draw(); return; }
      const d = e.target.closest('.rp-d');
      if (d && !d.disabled) { pick(d.dataset.d); return; }
      if (e.target.closest('[data-cancel]')) { closePop(); anchor.focus(); return; }
      if (e.target.closest('[data-apply]')) {
        let x = from.value, y = to.value;
        if (!x || !y) return;
        if (x > y) [x, y] = [y, x];
        closePop(); onPick({ a: x, b: y });
      }
    });
    pop.addEventListener('mouseover', (e) => {
      const d = e.target.closest('.rp-d'), o = e.target.closest('[data-k]');
      const h = a && !b && d && !d.disabled ? d.dataset.d : null, pv = o ? WF.range(o.dataset.k) : null;
      if (h === hover && String(pv) === String(preview)) return;
      hover = h; preview = pv;
      if (pv) { const [, y] = pv; const was = left; reveal(y); if (left !== was) { draw(); return; } }
      paint();
    });
    pop.addEventListener('mouseleave', () => { if (hover || preview) { hover = null; preview = null; paint(); } });
    // typing a date moves the calendar to it
    pop.addEventListener('change', (e) => {
      if (!e.target.matches('[data-from], [data-to]')) return;
      const v = e.target.value && e.target.value < lo ? lo : e.target.value > hi ? hi : e.target.value;
      if (e.target.matches('[data-from]')) a = v || null; else b = v || null;
      if (a && b && a > b) [a, b] = [b, a];
      setFields();
      if (v) { focusD = v; const was = left; reveal(v); if (left !== was) { draw(); return; } }
      paint();
    });
    months.addEventListener('keydown', (e) => {
      const d = e.target.closest('.rp-d');
      if (!d) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      let t = null;
      if (step) t = plusDays(d.dataset.d, step);
      else if (e.key === 'PageUp' || e.key === 'PageDown') t = WF.addMonths(d.dataset.d, e.key === 'PageUp' ? -1 : 1);
      else if (e.key === 'Home' || e.key === 'End') t = plusDays(d.dataset.d, e.key === 'Home' ? -((UTC(d.dataset.d).getUTCDay() + 6) % 7) : 6 - ((UTC(d.dataset.d).getUTCDay() + 6) % 7));
      if (!t) return;
      e.preventDefault();
      t = t < lo ? lo : t > hi ? hi : t;
      focusD = t;
      const was = left; reveal(t);
      if (left !== was) draw(); else paint();
      months.querySelector(`.rp-d[data-d="${t}"]`)?.focus();
    });
    draw();
    showPop(anchor, pop);
    // a narrow card shows the presets as a scrolling row: bring the picked one into view
    const on = pop.querySelector('.rp-opt[aria-pressed="true"]'), row = pop.querySelector('.rp-presets');
    if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - row.offsetLeft - 12;
    if (kbd) (pop.querySelector('.opt[aria-pressed="true"]') ?? pop.querySelector('.rp-custom-btn[aria-pressed="true"]') ?? pop.querySelector('.opt'))?.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closePop(); } });

  // ----- charts (one blue, dashed grey comparisons, mono right axis)
  const C = () => WF.charts;
  // A chart resized while its page is hidden (window resize, the design panel, a theme switch) gets ECharts' 100px
  // fallback width, and nothing resized it when the page came back. Each chart now watches its own box: whenever it
  // gets a real size (page shown again, a width token, the panel opening) the chart resizes to it; hidden boxes are skipped.
  const sized = new ResizeObserver((entries) => entries.forEach((e) => {
    if (e.contentRect.width > 0 && e.contentRect.height > 0) echarts.getInstanceByDom(e.target)?.resize();
  }));
  const watched = new WeakSet();
  const chartOf = WF.charts.chart;
  WF.charts.chart = (el) => { const c = chartOf(el); if (el && !watched.has(el)) { watched.add(el); sized.observe(el); } return c; };
  const css = (v) => WF.charts.css(v);
  // fonts, sizes and colours come from the design tokens at draw time (js/ds/tokens.js), so a theme or a token edit repaints
  const MONO = () => DS.font('font-label'), SANS = () => DS.font('sans');
  const axisMono = () => ({ color: css('--ink-3'), fontFamily: MONO(), fontSize: DS.fs('label') });
  const tip = (valueFormatter, trigger = 'axis') => ({ trigger, appendTo: 'body', backgroundColor: css('--tip-bg'), borderColor: css('--tip-border'), borderWidth: 1, padding: [8, 12],
    textStyle: { color: css('--tip-ink'), fontFamily: SANS(), fontSize: DS.fs('2') }, extraCssText: `box-shadow:${css('--tip-shadow')};border-radius:${css('--r-md')}`, valueFormatter });
  // area fill: the line colour at --chart-area-alpha on top, fading to transparent (or into --chart-area-end when a theme sets one)
  const fade = (c, a) => { const end = css('--chart-area-end'); return new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${c}${css('--chart-area-alpha') || a}` }, { offset: 1, color: end ? `${end}14` : `${c}08` }]); };
  // Origin's hero chart: blue line + fading area, end dot, right mono axis, dashed grid; optional dashed comparisons.
  // marks: points on the line [{ i, y, kind: 'buy' | 'sell', name }] (Invest's holding drawer: buys filled, sells hollow)
  function area(el, xs, ys, { compare = [], hLines = [], marks = [], yFmt = short, tipFmt = (v) => money(v), xFmt = dayMon, xLabels = true, height, areaFill = true, scale = true, signed = false } = {}) {
    // signed: the line in --line-up at or above 0 and --line-down under it (19 Oct, Nhi: Invest's Return)
    const last = ys.reduce((a, y, i) => (y != null ? i : a), -1);
    // signed: a vertical gradient over the line's own box with a hard stop at 0 (the box spans the data's min to max)
    let lineC = css('--area-line');
    if (signed) {
      const v = ys.filter((y) => y != null), hi = Math.max(...v), lo = Math.min(...v), up = css('--line-up'), dn = css('--line-down');
      lineC = lo >= 0 ? up : hi <= 0 ? dn : { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: up }, { offset: hi / (hi - lo), color: up }, { offset: hi / (hi - lo), color: dn }, { offset: 1, color: dn }] };
    }
    C().chart(el).setOption({
      animation: false, textStyle: { fontFamily: SANS() },
      grid: { left: 0, right: 72, top: 16, bottom: xLabels ? 36 : 8 },
      tooltip: tip(tipFmt),
      // the dates sit 16px under the plot, so the last one ("Oct 14") never touches the right axis' bottom value label
      xAxis: { type: 'category', data: xs, boundaryGap: false, axisTick: { show: false }, axisLine: { show: false },
        axisLabel: xLabels ? { ...axisMono(), hideOverlap: true, formatter: xFmt, margin: 16 } : { show: false } },
      yAxis: { type: 'value', position: 'right', scale, splitNumber: 4, axisLabel: { ...axisMono(), formatter: yFmt, margin: 16 },
        splitLine: { lineStyle: { color: css('--chart-grid'), type: [3, 4] } } },
      series: [
        { type: 'line', name: 'Value', data: ys, showSymbol: false, smooth: 0.2, connectNulls: false, lineStyle: { width: 2, color: lineC }, itemStyle: { color: signed ? css(ys[last] < 0 ? '--line-down' : '--line-up') : css('--area-line') },
          areaStyle: areaFill ? { color: fade(css('--area-fill'), '59') } : undefined,
          markPoint: last >= 0 ? { symbol: 'circle', symbolSize: 9, itemStyle: { color: signed ? css(ys[last] < 0 ? '--line-down' : '--line-up') : css('--area-line'), borderColor: css('--surface'), borderWidth: 2 }, label: { show: false }, data: [{ coord: [last, ys[last]] }] } : undefined,
          markLine: hLines.length ? { symbol: 'none', silent: true, lineStyle: { type: [4, 4], color: css('--chart-ref'), width: 1 },
            label: { show: true, position: 'insideStartTop', color: css('--ink-2'), backgroundColor: css('--fill-subtle'), padding: [4, 6], borderRadius: 4, fontFamily: SANS(), fontSize: DS.fs('2'), formatter: (p) => p.data.name },
            data: hLines.map((h) => ({ yAxis: h.y, name: h.label })) } : undefined },
        ...compare.map((s) => ({ type: 'line', name: s.name, data: s.data, showSymbol: false, smooth: 0.2, lineStyle: { width: 1.5, color: s.color ?? css('--chart-compare'), type: [4, 4] }, itemStyle: { color: s.color ?? css('--chart-compare') },
          endLabel: s.endDot ? { show: false } : undefined })),
        ...(marks.length ? [{ type: 'scatter', name: 'Trades', z: 6, symbolSize: 9, tooltip: { show: false },
          data: marks.map((m) => ({ value: [m.i, m.y], name: m.name, itemStyle: m.kind === 'sell'
            ? { color: css('--surface'), borderColor: css('--area-line'), borderWidth: 2 } : { color: css('--area-line'), borderColor: css('--surface'), borderWidth: 2 } })) }] : []),
      ],
    }, { replaceMerge: ['series'] });
    if (height) el.style.height = `${height}px`;
  }
  // Reports: bars (blue; positive light blue on top) + dashed line with black dots on a second axis.
  function barsLine(el, labels, bars, line, { lineFmt = (v) => pct1(v), barName = 'Net cash flow', lineName = 'Savings rate', traceAlias } = {}) {
    C().chart(el).setOption({
      animation: false, textStyle: { fontFamily: SANS() },
      grid: { left: 8, right: 64, top: 20, bottom: 28 },
      tooltip: tip((v) => v, 'axis'),
      xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: css('--ink-2'), fontFamily: SANS(), fontSize: DS.fs('label') } },
      yAxis: [{ type: 'value', position: 'right', splitNumber: 4, axisLabel: { color: css('--ink-2'), fontFamily: SANS(), fontSize: DS.fs('label'), formatter: short, margin: 12 }, splitLine: { lineStyle: { color: css('--chart-grid'), type: [3, 4] } } },
              { type: 'value', show: false }],
      series: [
        { type: 'bar', name: barName, data: bars.map((v) => ({ value: v, itemStyle: { color: v >= 0 ? css('--chart') : css('--chart'), borderRadius: v >= 0 ? [2, 2, 0, 0] : [0, 0, 2, 2] } })), barMaxWidth: 24,
          tooltip: { valueFormatter: (v) => money(v, true) } },
        { type: 'line', name: lineName, yAxisIndex: 1, data: line, smooth: 0.45, symbol: 'circle', symbolSize: 7, showSymbol: true,
          lineStyle: { color: css('--ink'), width: 1.2, type: [3, 3] }, itemStyle: { color: css('--ink'), borderColor: css('--surface'), borderWidth: 1.5 }, tooltip: { valueFormatter: lineFmt } },
      ],
    }, { replaceMerge: ['series'] });
  }
  // Semicircle gauge split into segments (category colours), with a soft track.
  function gauge(el, segments, { total } = {}) {
    const sum = segments.reduce((a, s) => a + s.value, 0);
    const track = total != null && total > sum ? [{ name: 'Left', value: total - sum, itemStyle: { color: css('--chart-track') }, tooltip: { show: false } }] : [];
    C().chart(el).setOption({
      animation: false,
      tooltip: tip((v) => money(v), 'item'),
      series: [{ type: 'pie', startAngle: 200, endAngle: -20, radius: ['80%', '92%'], center: ['50%', '58%'], padAngle: 1.5, itemStyle: { borderRadius: DS.px('--r-sm') }, label: { show: false }, emphasis: { scale: false },
        data: [...segments.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })), ...track] }],
    }, { replaceMerge: ['series'] });
  }
  // Rewards ring: earned / cap, a pace tick at the projected points.
  function ring(el, value, cap, projected) {
    const v = Math.min(value, cap), p = Math.min(projected ?? 0, cap);
    C().chart(el).setOption({
      animation: false,
      series: [
        { type: 'pie', radius: ['78%', '94%'], startAngle: 90, silent: true, label: { show: false }, emphasis: { scale: false },
          data: [{ value: v, itemStyle: { color: css('--chart') } }, { value: Math.max(0, p - v), itemStyle: { color: css('--chart-pace') } }, { value: Math.max(0, cap - Math.max(v, p)), itemStyle: { color: css('--chart-track') } }] },
      ],
    }, { replaceMerge: ['series'] });
  }
  function spark(el, ys, up) {
    const color = up ? css('--pos') : css('--neg');
    C().chart(el).setOption({ animation: false, grid: { left: 2, right: 2, top: 4, bottom: 4 },
      xAxis: { type: 'category', show: false, boundaryGap: false, data: ys.map((_, i) => i) }, yAxis: { type: 'value', show: false, scale: true },
      series: [{ type: 'line', data: ys, showSymbol: false, lineStyle: { width: 1.5, color }, silent: true }] }, { replaceMerge: ['series'] });
  }
  // Weekday × hour heat grid in one blue ramp.
  function heat(el, cells, { xs, ys, max }) {
    C().chart(el).setOption({
      animation: false, textStyle: { fontFamily: SANS() },
      grid: { left: 44, right: 8, top: 8, bottom: 28 },
      tooltip: { ...tip(null, 'item'), formatter: (p) => `${ys[p.value[1]]} ${xs[p.value[0]]}h · <b>${money(p.value[2])}</b>` },
      xAxis: { type: 'category', data: xs.map((h) => `${h}`), splitArea: { show: false }, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisMono(), interval: 2, formatter: (v) => `${v}h` } },
      yAxis: { type: 'category', data: ys, inverse: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: axisMono() },
      visualMap: { show: false, min: 0, max: max || 1, inRange: { color: ['--heat-1', '--heat-2', '--heat-3', '--heat-4'].map(css) } },
      series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: css('--surface'), borderWidth: 3, borderRadius: 4 }, emphasis: { itemStyle: { borderColor: css('--ink'), borderWidth: 1 } } }],
    }, { replaceMerge: ['series'] });
  }
  // ----- Spending page charts (theme tokens only; a click on a bar or a node calls onPick)
  const pickable = (el, onPick, key = 'dataIndex') => { const ch = C().chart(el); ch.off('click'); if (onPick) { ch.on('click', (p) => onPick(p[key], p)); el.style.cursor = 'pointer'; } };
  // Cash flow: income up, spending down (pass it negative), the net as a line (--net-line); starred = indices drawn hatched (incomplete data)
  function flowBars(el, labels, inc, out, net, { onPick, starred = new Set() } = {}) {
    const hatch = (color) => ({ color, decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [3, 3], rotation: -Math.PI / 4, color: css('--surface') } });
    C().chart(el).setOption({
      animation: false, textStyle: { fontFamily: SANS() },
      grid: { left: 0, right: 64, top: 16, bottom: 28 },
      tooltip: { ...tip((v) => money(Math.abs(v))), formatter: undefined, valueFormatter: (v) => money(Math.abs(v)) },
      xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisMono(), hideOverlap: true } },
      yAxis: { type: 'value', position: 'right', splitNumber: 4, axisLabel: { ...axisMono(), formatter: (v) => short(v), margin: 14 }, splitLine: { lineStyle: { color: css('--chart-grid'), type: [3, 4] } } },
      series: [
        { type: 'bar', name: 'Income', stack: 'flow', barMaxWidth: 28, data: inc.map((v, i) => ({ value: v, itemStyle: starred.has(i) ? hatch(css('--flow-in')) : undefined })), itemStyle: { color: css('--flow-in'), borderRadius: [3, 3, 0, 0] } },
        { type: 'bar', name: 'Spending', stack: 'flow', barMaxWidth: 28, data: out.map((v, i) => ({ value: v, itemStyle: starred.has(i) ? hatch(css('--flow-out')) : undefined })), itemStyle: { color: css('--flow-out'), borderRadius: [0, 0, 3, 3] } },
        { type: 'line', name: 'Net', data: net, symbol: 'circle', symbolSize: 6, z: 5, lineStyle: { width: 2, color: css('--net-line') }, itemStyle: { color: css('--net-line'), borderColor: css('--surface'), borderWidth: 1.5 } },
      ],
    }, { replaceMerge: ['series'] });
    pickable(el, onPick);
  }
  // Card spending (Credit, 18 Oct): one bar per card per month, side by side; series [{ name, data, color }]; starred = the
  // indices drawn hatched (the month in progress)
  function cardBars(el, labels, series, { starred = new Set() } = {}) {
    const hatch = (color) => ({ color, decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [3, 3], rotation: -Math.PI / 4, color: css('--surface') } });
    C().chart(el).setOption({
      animation: false, textStyle: { fontFamily: SANS() },
      grid: { left: 0, right: 64, top: 16, bottom: 28 },
      tooltip: { ...tip((v) => money(v)), formatter: undefined, valueFormatter: (v) => money(v) },
      xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisMono(), hideOverlap: true } },
      yAxis: { type: 'value', position: 'right', splitNumber: 4, axisLabel: { ...axisMono(), formatter: (v) => short(v), margin: 14 }, splitLine: { lineStyle: { color: css('--chart-grid'), type: [3, 4] } } },
      series: series.map((x) => ({ type: 'bar', name: x.name, barMaxWidth: 14, barGap: '20%',
        data: x.data.map((v, i) => ({ value: v, itemStyle: starred.has(i) ? hatch(x.color) : undefined })), itemStyle: { color: x.color, borderRadius: [3, 3, 0, 0] } })),
    }, { replaceMerge: ['series'] });
  }
  // Sankey: nodes [{ name, color, depth }] · links [{ source, target, value }]; labels carry the compact amount; soft links
  function sankey(el, nodes, links, { onPick } = {}) {
    // narrow (a phone): less room on the right, and the middle node's label steps out so the left labels can breathe
    const narrow = el.clientWidth < 520, lastDepth = Math.max(...nodes.map((n) => n.depth ?? 0));
    C().chart(el).setOption({
      animation: false, textStyle: { fontFamily: SANS() },
      tooltip: { ...tip(null, 'item'), formatter: (p) => (p.dataType === 'edge' ? `${esc(p.data.source)} → ${esc(p.data.target)} · <b>${money(p.data.value)}</b>` : `${esc(p.name)} · <b>${money(p.value)}</b>`) },
      series: [{ type: 'sankey', left: 0, right: narrow ? 118 : 150, top: 8, bottom: 8, nodeWidth: 10, nodeGap: 12, nodeAlign: 'justify', draggable: false, layoutIterations: 32,
        emphasis: { focus: 'adjacency' },
        label: { color: css('--ink-2'), fontFamily: SANS(), fontSize: DS.fs('2'), formatter: (p) => `{n|${p.name}}  {v|${short(p.value)}}`,
          rich: { n: { color: css('--ink'), fontSize: DS.fs('2') }, v: { color: css('--ink-2'), fontSize: DS.fs('label'), fontFamily: MONO() } } },
        lineStyle: { color: 'source', opacity: 0.28, curveness: 0.5 },   // a link's own lineStyle.color wins
        itemStyle: { borderWidth: 0, borderRadius: 2 },
        data: nodes.map((n) => ({ name: n.name, depth: n.depth, itemStyle: { color: n.color }, ...(narrow && n.depth > 0 && n.depth < lastDepth ? { label: { show: false } } : {}) })), links }],
    }, { replaceMerge: ['series'] });
    pickable(el, onPick ? (_, p) => { if (p.dataType === 'node') onPick(p.name); } : null);
  }
  // Small month bars with a dashed average guide (the average is a governed metric passed in).
  function miniBars(el, labels, values, avg) {
    C().chart(el).setOption({
      animation: false, grid: { left: 4, right: 4, top: 24, bottom: 24 },
      tooltip: tip((v) => money(v)),
      xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisMono(), interval: 0 } },
      yAxis: { type: 'value', show: false },
      series: [{ type: 'bar', name: 'Spend', data: values, barMaxWidth: 18, itemStyle: { color: css('--chart-bar'), borderRadius: [3, 3, 0, 0] },
        markLine: avg != null ? { symbol: 'none', silent: true, lineStyle: { type: [4, 4], color: css('--ink-2'), width: 1 },
          label: { show: true, position: 'insideEndTop', formatter: `avg ${short(avg)}`, fontFamily: MONO(), fontSize: DS.fs('label'), color: css('--ink-2') }, data: [{ yAxis: avg }] } : undefined }],
    }, { replaceMerge: ['series'] });
  }


  // ===================================================================== lessons shared across pages
  const PF = 'personal_finance';

  // ----- O1 per-source freshness: the last line date of each ledger source. A source more than 7 days behind the
  // data as-of date is "stale" (date arithmetic only): its missing days make any period total look low.
  const fresh = WF.q('og2_fresh', { dataset: PF, metrics: { last: 'data_as_of', n: 'lines' },
    aql: 'explore { dimensions { s: dim_sources.label, o: dim_sources.sort_order } measures { last: data_as_of, n: lines } sorts { o asc } }' });
  const lagDays = (d, to = WF.asOf) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${fmt.ymd(d)}T00:00:00`)) / 864e5);
  // A source whose account holds ₫0 is not in use (17 Oct, Nhi: the TCB Visa card is paid off and idle): its quiet ledger
  // means nothing happened, not that the sync broke. Read from the sidebar's account balances (og2_side_acc).
  const idle = (src) => {
    if (sideAcc.state !== 'success') return false;
    const id = Object.keys(LEDGER_SRC).find((k) => LEDGER_SRC[k] === src), r = id && WF.rows(sideAcc).find((x) => x.id === id);
    return !!r && fmt.n(r.v) === 0;
  };
  // Sources in use whose last line is more than 7 days before `to` (default: the data as-of date).
  const stale = (to = WF.asOf) => (fresh.state === 'success' && WF.asOf ? WF.rows(fresh).filter((r) => lagDays(r.last, to) > 7 && !idle(r.s)) : []);
  // A card whose period ends on `to` shows one small amber dot (hover: which source, since when); '' when all are current.
  function freshChip({ to } = {}) {
    const list = stale(to);
    return list.length ? `<span class="stale-dot" data-hc="fresh" data-to="${esc(to ?? '')}" aria-label="${esc(list.map((r) => `${r.s} through ${dayMon(r.last)}`).join(', '))}"></span>` : '';
  }
  function freshCard(to) {
    if (fresh.state !== 'success' || !WF.asOf) return '';
    const st = stale(to || undefined);
    return `${st.length ? `<div class="hc-lead">${st.map((r) => `<b>${esc(r.s)}</b> has no lines after ${dayMon(r.last)}`).join('; ')}, so totals that include later days are missing its spending.</div>` : '<div class="hc-lead">Every source is up to date.</div>'}
      <div class="hc-list">${WF.rows(fresh).map((r) => { const lag = lagDays(r.last), off = idle(r.s), cls = off ? 'idle' : lag > 7 ? 'stale' : lag > 1 ? 'late' : 'ok';
        return `<div class="fr ${cls}"><span class="dot"></span><span>${esc(r.s)}</span><span class="num" data-trace="og2_fresh:last">${off ? `not in use · last ${dayMon(r.last)}` : lag > 1 ? `through ${dayMon(r.last)}` : 'current'}</span></div>`; }).join('')}</div>`;
  }
  function drawFresh() {
    if (fresh.state !== 'success' || !WF.asOf) return;
    const st = stale(), label = st.length ? `Out of sync: ${st.map((r) => `${r.s} through ${dayMon(r.last)}`).join(', ')}` : 'Every source is up to date';
    document.querySelectorAll('[data-fresh-dot]').forEach((d) => { d.classList.toggle('ok', !st.length); d.classList.toggle('stale', !!st.length); d.setAttribute('aria-label', label); d.title = label; });
  }

  // ----- O17 accounts with balances in the sidebar; ledger accounts open Transactions on that source.
  const sideAcc = WF.q('og2_side_acc', { dataset: 'wealth', metrics: { v: 'account_value' },
    aql: `explore { dimensions { id: dim_accounts.account_id, a: dim_accounts.name, g: dim_accounts.account_group, o: dim_accounts.group_order }
                    measures { v: account_value } sorts { o asc, v desc } }` });
  const LEDGER_SRC = { tcb_debit: 'TCB debit', timo: 'Timo', vib_credit: 'MAX VIB', credit: 'TCB Visa' };
  function accountsCard() {
    if (sideAcc.state !== 'success') return '<div class="hc-lead busy">Loading…</div>';
    const rows = WF.rows(sideAcc), groups = [...new Set(rows.map((r) => r.g))];
    return `<div class="tp-title">Your accounts</div>` + groups.map((g) => `<div class="sa-g">${esc(g)}</div>` + rows.filter((r) => r.g === g).map((r) => {
      const src = LEDGER_SRC[r.id];
      return `<button type="button" class="sa" ${src ? `data-acc-src="${esc(src)}" title="Open ${esc(src)} transactions"` : `data-go="invest" title="Open Invest"`}>
        <span class="t">${esc(r.a)}</span><span class="v num ${fmt.n(r.v) < 0 ? 'neg' : ''}" data-trace="og2_side_acc:v">${money(r.v)}</span></button>`;
    }).join('')).join('');
  }
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-acc-src]'); if (a) openTx({ src: a.dataset.accSrc }); });

  // ----- C12 one calm category palette (dim_categories.chart_color: equal OKLCH lightness, nothing near the chart blue).
  // A lookup, so shared queries (sp_cats …) keep their verbatim AQL; keyed by the Vietnamese tag and the English label.
  const catColors = WF.q('og3_cat_colors', { dataset: PF, metrics: {},
    aql: 'explore { dimensions { c: dim_categories.category, en: dim_categories.label_en, k: dim_categories.chart_color } }' });
  // A theme may repaint the categories (--cat-<slug> in ds/themes.css, e.g. --cat-food-drinks); otherwise the AML colour.
  const catSlug = (en) => String(en ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const catColor = (cat, fallback = css('--cat-fallback')) => {
    const r = catColors.state === 'success' ? WF.rows(catColors).find((x) => x.c === cat || x.en === cat) : null;
    const themed = css(`--cat-${catSlug(r?.en ?? catEn(cat))}`);
    return themed || (r?.k ?? fallback);
  };

  // ----- Transactions deep link: Spending › Transactions, filtered. f = { date: range key | 'this_month' | 'last_month',
  // month: 'YYYY-MM-01', from / to, src: dim_sources.label, cat: category, merchant: merchant_display, flow: flow_group, q: search }
  function openTx(f = {}) {
    WF.go('spending/transactions');
    WF.views.get('spending/transactions')?.openWith?.(f);
  }

  // ----- O5 the Mom toggle: one control, mapped once onto every ledger spend query. Budgets read fct_budget_months
  // (their own SQL) and never take it; the preview says so before anything changes.
  const meCtl = WF.fieldControl('og2_me', PF, 'fct_ledger.flow_type');
  const mapMe = mapOnce(meCtl, 'fct_ledger.flow_type');
  const me = { excluded: false };
  const ME_DEF = "fct_ledger | where(fct_ledger.flow_type == 'family_support')";
  const mePrev = WF.q('og2_me_preview', { dataset: PF, metrics: { v: 'family_support' },
    aql: `explore { dimensions { w: dim_dates.month_start } measures { v: family_support, n: ${ME_DEF} | count(fct_ledger.line_id) } sorts { w desc } }` });
  const meAll = WF.q('og2_me_all', { dataset: PF, metrics: { v: 'family_support' },
    aql: `explore { measures { v: family_support, n: ${ME_DEF} | count(fct_ledger.line_id), last: ${ME_DEF} | max(fct_ledger.line_date) } }` });
  const me12 = WF.q('og2_me_12m', { dataset: PF, metrics: { v: 'family_support' },
    aql: `explore { measures { v: family_support, n: ${ME_DEF} | count(fct_ledger.line_id) } }` });
  const me12Ctl = WF.dateControl('og2_me_12m_period');
  app.mapControl(me12Ctl, me12, { field: 'dim_dates.date_key' });
  function setMe(excluded) {
    me.excluded = excluded;
    meCtl.setCondition(excluded ? { operator: 'is_not', values: ['family_support'] } : { operator: 'is', values: [] });
    drawMeChip();
    app.execute();
  }
  function drawMeChip() {
    document.querySelectorAll('[data-me-chip]').forEach((c) => {
      c.hidden = !me.excluded;
      c.innerHTML = `Money to Mom not counted as spending <button type="button" data-me-undo>Undo</button>`;
    });
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-me-undo]')) setMe(false); if (e.target.closest('[data-me-open]')) meDrawer(); });
  function meDrawer() {
    if (WF.asOf) WF.setPeriod(me12Ctl, '1Y');
    const d = drawer({ label: 'Definition change · preview', body: '<div id="me-dr"></div>',
      foot: `<button class="btn" type="button" data-close>Cancel</button><button class="btn black" type="button" id="me-apply"></button>` });
    const draw = () => {
      const host = d.querySelector('#me-dr');
      if (!host?.isConnected) return;
      const ok = WF.status(meAll, null) && WF.status(me12, null) && WF.status(mePrev, null);
      const a = ok ? WF.one(meAll) : {}, y = ok ? WF.one(me12) : {};
      const month0 = `${WF.asOf.slice(0, 7)}-01`, cur = ok ? WF.rows(mePrev).find((r) => fmt.ymd(r.w) === month0) : null;
      const verb = me.excluded ? 'add back' : 'take out';
      host.innerHTML = `<div class="me-dr">
        <div class="me-dr-q">${me.excluded ? 'Count' : 'Stop counting'} money sent to Mom as spending?</div>
        <div class="sub">Governed definition of <b>spend</b> today: <i>${esc(WF.DEFS?.[PF]?.spend?.description ?? '')}</i>. This switch filters <span class="num">flow_type = family_support</span> out of every ledger spend query on this app. The AML stays as it is.</div>
        ${kpis([{ k: 'This month', v: cur ? `${money(cur.v)} · ${fmt.qty(cur.n)}` : 'none yet', trace: 'og2_me_preview:v' },
                { k: 'Last 12 months', v: ok ? `${short(y.v)} · ${fmt.qty(y.n)} lines` : '…', trace: 'og2_me_12m:v' },
                { k: 'All time', v: ok ? `${short(a.v)} · ${fmt.qty(a.n)} lines` : '…', trace: 'og2_me_all:v' }])}
        <div class="boxed"><div class="bh">${icon('check', 'sm')}<span>Will ${verb} these amounts</span></div><div class="bb sub">
          Plan (spent so far, the pace line, category spend), Cash flow (expenses, saved, savings rate, flows, spending rhythm), Home (the answer and the review letter) and the Transactions totals</div></div>
        <div class="boxed"><div class="bh">${icon('x', 'sm')}<span>Won't change</span></div><div class="bb sub">
          Budgets (Left this month and spent vs limit come from the budget table, which still counts Mom under Other), Net worth, Invest, Forecast and income.</div></div>
        ${ok && a.last ? `<div class="sub">Last transfer to Mom: ${esc(fmt.date(a.last))}. They follow each payday on the 24th.</div>` : ''}</div>`;
      const btn = d.querySelector('#me-apply');
      if (btn) btn.textContent = me.excluded ? 'Count Mom again' : 'Apply: exclude Mom';
    };
    d.addEventListener('click', (e) => { if (e.target.closest('#me-apply')) { closeDrawer(); setMe(!me.excluded); } });
    app.execute().then(draw);
    draw();
    meDrawer.redraw = draw;
  }

  // ----- hover cards (calm by default): the working behind a number lives in a card that opens on hover.
  // data-hc="key" → hc[key](el) renders it when it opens (current rows); any [data-trace] adds its AML definition.
  // The card stays open while the pointer is on the trigger or on the card, so links inside it work; a click pins it.
  // data-hc-hover="key" is the same card on hover only, for a trigger whose click does something else (opens a holding):
  // a click never pins it (the view opens it on focus and closes it on its click).
  const hc = {};
  const hcEl = $('hc');
  let hcAnchor = null, hcOpenT = 0, hcCloseT = 0, hcPinned = false, hcLastClose = 0;
  function defFor(el) {
    const [qname, alias] = (el.dataset.trace || '').split(':');
    const reg = WF.registry.get(qname);
    if (!reg) return null;
    const metric = reg.metrics[alias];
    const def = metric ? WF.DEFS?.[reg.dataset]?.[metric] : null;
    return { metric, def, qname, alias, dataset: reg.dataset };
  }
  function hcBody(el) {
    let html = '';
    const key = el.dataset.hc || el.dataset.hcHover;
    if (key) { try { html = hc[key]?.(el) ?? ''; } catch (e) { console.error('hover card', key, e); } }
    const tr = el.dataset.trace ? el : (key ? null : el.closest('[data-trace]'));
    if (tr) {
      const i = defFor(tr);
      if (i?.def) html += `<div class="hc-def${html ? ' sep' : ''}"><div class="tp-title">${esc(i.def.label)}</div><div>${esc(i.def.description || '')}</div></div>`;
      else if (i && !html) html = `<div class="hc-def"><div class="tp-title">${esc(i.alias)}</div><div>Computed in this card's query from governed metrics. ✦ shows the AQL.</div></div>`;
    }
    return html;
  }
  function hcOpen(el, { pin = false, instant = false } = {}) {
    if (!hcEl || WF.tracer?.on) return false;
    const html = hcBody(el);
    if (!html) return false;
    hcAnchor = el; hcPinned = pin;
    hcEl.innerHTML = html;
    hcEl.classList.toggle('wide', !!(el.dataset.hc || el.dataset.hcHover));
    hcEl.classList.toggle('instant', instant);   // C17: only a card that follows another one skips the pop-in
    hcEl.hidden = false;
    const r = el.getBoundingClientRect(), w = hcEl.offsetWidth, h = hcEl.offsetHeight;
    const side = el.closest('.sidebar');
    let left = side ? r.right + 8 : Math.max(8, Math.min(r.left, innerWidth - w - 12));
    let top = side ? Math.min(r.top - 8, innerHeight - h - 12) : (r.bottom + 8 + h > innerHeight ? r.top - h - 8 : r.bottom + 8);
    hcEl.style.left = `${left}px`; hcEl.style.top = `${Math.max(8, top)}px`;
    hcEl.style.transformOrigin = !side && top < r.top ? 'bottom left' : 'top left';   // flipped above its number: it grows upward from it
    return true;
  }
  function hcClose() { clearTimeout(hcOpenT); if (hcEl && !hcEl.hidden) hcLastClose = Date.now(); hcAnchor = null; hcPinned = false; if (hcEl) hcEl.hidden = true; }
  const trigger = (t) => t?.closest?.('[data-hc], [data-hc-hover], [data-trace]');
  document.addEventListener('mouseover', (e) => {
    if (!hcEl) return;
    if (hcEl.contains(e.target)) { clearTimeout(hcCloseT); return; }
    const el = trigger(e.target);
    if (el && el === hcAnchor) { clearTimeout(hcCloseT); return; }
    clearTimeout(hcOpenT);
    if (el && !WF.tracer?.on && $('trace-pop').hidden) {
      const warm = !hcEl.hidden || Date.now() - hcLastClose < 600;
      hcOpenT = setTimeout(() => { clearTimeout(hcCloseT); hcOpen(el, { instant: warm }); }, warm ? 0 : 250);
    }
    if (!hcPinned && !hcEl.hidden) { clearTimeout(hcCloseT); hcCloseT = setTimeout(hcClose, 180); }
  });
  document.addEventListener('click', (e) => {
    if (hcEl?.contains(e.target)) { if (e.target.closest('button, a, [data-go]')) setTimeout(hcClose, 0); return; }
    const el = e.target.closest('[data-hc]');
    if (el && !e.target.closest('.hc')) { hcOpen(el, { pin: true }); return; }
    if (hcPinned) hcClose();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hcClose(); });
  // a scroll closes the card, except one opened by keyboard focus (the focus itself may scroll its anchor into view): it
  // follows while its anchor is in sight, and closes once the anchor leaves the scrolled box or the window (or can't redraw)
  const kbAnchor = () => hcAnchor && hcAnchor === document.activeElement && hcAnchor.matches(':focus-visible');
  const inSight = (el, box) => {
    const r = el.getBoundingClientRect(), b = box instanceof Element ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
    return r.bottom > Math.max(0, b.top) && r.top < Math.min(innerHeight, b.bottom) && r.right > Math.max(0, b.left) && r.left < Math.min(innerWidth, b.right);
  };
  document.addEventListener('scroll', (e) => {
    if (hcEl?.contains(e.target)) return;
    if (kbAnchor() && !hcEl.hidden && inSight(hcAnchor, e.target) && hcOpen(hcAnchor, { pin: hcPinned, instant: true })) return;
    hcClose();
  }, true);
  hc.fresh = (el) => freshCard(el.dataset.to);
  hc.accounts = () => accountsCard();

  app.subscribe(() => { drawFresh(); meDrawer.redraw?.(); if (hcAnchor && !hcEl.hidden && hcAnchor.isConnected) hcOpen(hcAnchor, { pin: hcPinned }); });

  // C10 one week calendar, Monday first (Vietnam's convention), shared by Overview and Recurring.
  function weekCal(upc, id, weeks = 2) {
    const a = new Date(`${WF.asOf}T00:00:00`), start = new Date(a); start.setDate(a.getDate() - ((a.getDay() + 6) % 7));
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const by = new Map();
    upc.forEach((r) => { if (!by.has(r.due)) by.set(r.due, []); by.get(r.due).push(r); });
    const heads = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((w) => `<div class="h">${w}</div>`).join('');
    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const s = iso(d), list = by.get(s) ?? [];
      cells.push(`<div class="c${i >= 7 ? ' row2' : ''}${s < WF.asOf ? ' past' : ''}${s === WF.asOf ? ' today' : ''}" data-date="${s}"><span class="n">${d.getDate()}</span>
        <span class="chips">${list.slice(0, 3).map((r) => `<span title="${esc(r.m)} · ${money(r.amt)}">${chip(r.color, r.en, true)}</span>`).join('')}</span>
        ${list.length ? `<span class="amt"${id ? ` data-trace="${id}:amt"` : ''}>${approx(list[0].amt).replace('₫', '')}${list.length > 1 ? ` +${list.length - 1}` : ''}</span>` : ''}</div>`);
    }
    return `<div class="week">${heads}${cells.join('')}</div>`;
  }

  Object.assign(window.OG, { esc, $, icon, chip, catIcon, catEn, initials, short, money, approx, proj, weekCal, catColor, pct1, dayMon, monthName, tone, mapOnce, account, accounts, state, setAccounts, mapAccount,
    NAV, navLabel, frame, card, segIcons, bindKeys, setActive, ranges, txRow, kpis, table, monthCal, accountPopover, rangeBtn, rangePopover, rangeLabel, showPop, isOpenPop, closePop, drawer, closeDrawer,
    area, barsLine, gauge, ring, spark, heat, miniBars, tip, axisMono, flowBars, cardBars, sankey,
    PF, fresh, stale, lagDays, freshChip, freshCard, sideAcc, openTx, hc, hcOpen, hcClose, meCtl, mapMe, me, setMe, meDrawer, defFor });
})();
