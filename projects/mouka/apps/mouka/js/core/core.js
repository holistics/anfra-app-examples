// Shared machinery: one Anfra app, a query registry (the trace overlay reads it), controls,
// periods computed from the data as-of date, query states, and the in-page router.
(() => {
  // ----- query cache (19 Oct, Nhi: "load faster"). The data changes only when the DuckDB is rebuilt, never while the app is
  // open, so the same request (AQL + dataset + filter values) gets the same rows all session. Anfra.backend.submitQuery is the
  // SDK's one way to the server (request, AbortSignal); this wraps it with an in-memory cache: a repeat (a range switched back,
  // a page revisited, a query two pages share) answers from memory, and identical requests in flight share one call. Each
  // caller gets its own copy (the SDK post-processes results) and keeps its own cancel; errors are never kept. Reload to drop it.
  // anfra 0.11.1 still exposes it in both its own appserve and anfra-host-example; a host without it only loses the cache.
  const cached = new Map();
  const backend = Anfra.backend, send = backend?.submitQuery?.bind(backend);
  const aborted = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });   // what the SDK's own cancel rejects with
  if (send) backend.submitQuery = (request, signal) => {
    const key = JSON.stringify(request);
    const hit = cached.has(key);
    if (!hit) cached.set(key, send(request, new AbortController().signal).catch((e) => { cached.delete(key); throw e; }));
    const mine = cached.get(key).then((r) => { const c = structuredClone(r); if (hit && c.debug) c.debug.fromCache = true; return c; });
    if (!signal) return mine;
    if (signal.aborted) return Promise.reject(aborted());
    return new Promise((ok, no) => { signal.addEventListener('abort', () => no(aborted()), { once: true }); mine.then(ok, no); });
  };

  const app = Anfra.createApp({ title: document.body.dataset.appTitle ?? 'Wealthfolio', timezone: 'Asia/Ho_Chi_Minh' });
  const registry = new Map();
  const logged = new Set();

  function q(name, { dataset, aql, metrics = {}, pageSize }) {
    if (registry.has(name)) return registry.get(name).query;
    const query = app.createQuery(name, pageSize ? { dataset, aql, pageSize } : { dataset, aql });
    registry.set(name, { query, dataset, metrics });
    return query;
  }
  const dateControl = (name) => app.createFilter(name, { type: 'date' });
  const textControl = (name) => app.createFilter(name, { type: 'string' });
  const fieldControl = (name, dataset, field) => app.createFilter(name, { dataset, field });

  function logFirst(query) {
    if (query.state !== 'success' || logged.has(query.name)) return;
    logged.add(query.name);
    console.log(query.name, query.result.columns, query.result.rows[0], query.result.debug?.executedAql);
  }
  // Writes the non-success state into stateEl and returns true when rows are ready to draw.
  function status(query, stateEl, emptyText = 'Nothing in this period.') {
    logFirst(query);
    let text = '', err = false;
    if (query.state === 'error') { text = `Couldn't load: ${query.error.message}`; err = true; }
    else if (!query.result) text = 'Loading…';
    else if (query.result.rows.length === 0) text = emptyText;
    if (stateEl) { stateEl.textContent = text; stateEl.classList.toggle('error', err); stateEl.classList.toggle('busy', !query.result && !err); stateEl.hidden = !text; }   // busy: the spinner (ds/components.css)
    // The SDK keeps the last result while it re-runs: mark everything this query draws as loading.
    const busy = query.state === 'executing' && !!query.result;
    document.querySelectorAll(`[data-anfra-query~="${query.name}"]`).forEach((el) => el.classList.toggle('loading', busy));
    return !text;
  }
  const rows = (query) => query.result?.rows ?? [];
  const one = (query) => rows(query)[0] ?? {};
  const mark = (el, queryName, alias) => { el.dataset.trace = `${queryName}:${alias}`; return el; };

  // ----- periods: explicit dates from the data as-of date, never wall-clock phrases
  const D = (s) => new Date(`${s}T00:00:00Z`);
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, k) => { const d = D(s); d.setUTCDate(d.getUTCDate() + k); return iso(d); };
  const addMonths = (s, k) => {
    const d = D(s), day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return iso(d);
  };
  function range(key) {
    const a = WF.asOf, f = WF.firstDay, c = (s) => (s < f ? f : s), m0 = `${a.slice(0, 7)}-01`;
    switch (key) {
      case '1D': return [a, a];
      case '1W': return [c(addDays(a, -6)), a];
      case '1M': return [c(addDays(addMonths(a, -1), 1)), a];
      case '3M': return [c(addDays(addMonths(a, -3), 1)), a];
      case '6M': return [c(addDays(addMonths(a, -6), 1)), a];
      case 'YTD': return [c(`${a.slice(0, 4)}-01-01`), a];
      case '1Y': return [c(addDays(addMonths(a, -12), 1)), a];
      case '3Y': return [c(addDays(addMonths(a, -36), 1)), a];
      case '5Y': return [c(addDays(addMonths(a, -60), 1)), a];
      case 'ALL': return [f, a];
      case 'this_month': return [c(m0), a];
      case 'last_month': return [c(addMonths(m0, -1)), addDays(m0, -1)];
      case 'last_year': { const y = Number(a.slice(0, 4)) - 1; return [c(`${y}-01-01`), `${y}-12-31`]; }
      default: throw new Error(`unknown range ${key}`);
    }
  }
  // Balance views (net worth, portfolio value) read "change over the period" from the value at the
  // start date's end of day, so their window starts one day earlier: 1D = today vs yesterday's close.
  function changeRange(key) {
    const [a, b] = range(key);
    return [a > WF.firstDay ? addDays(a, -1) : a, b];
  }
  const setPeriod = (control, key, { change = false } = {}) =>
    control.setCondition({ operator: 'between', values: change ? changeRange(key) : range(key) });
  const monthSpan = (m0) => [m0, addDays(addMonths(m0, 1), -1)];

  // ----- UI helpers
  function pills(el, items, active, onPick) {
    el.replaceChildren(...items.map((it) => {
      const b = document.createElement('button');
      b.className = `pill${it.key === active ? ' active' : ''}`;
      b.type = 'button';
      b.innerHTML = it.html ?? '';
      if (!it.html) b.textContent = it.label;
      b.addEventListener('click', () => onPick(it));
      return b;
    }));
  }
  // An account <select>: options come from a governed query; the value set is account ids.
  function accountPicker(select, control, { liabilities = false } = {}) {
    const list = q(liabilities ? 'accounts_all' : 'accounts_assets', {
      dataset: 'wealth',
      aql: `explore { dimensions { id: dim_accounts.account_id, name: dim_accounts.name, o: dim_accounts.group_order }
                      ${liabilities ? '' : 'filters { dim_accounts.is_liability is false }'} sorts { o asc, name asc } }`,
    });
    select.dataset.anfraQuery = list.name;   // the options are this governed query's rows
    const fill = () => {
      if (list.state !== 'success' || select.dataset.filled) return;
      select.dataset.filled = '1';
      select.replaceChildren(new Option('All Accounts', ''), ...rows(list).map((r) => new Option(r.name, r.id)));
    };
    list.subscribe(fill); fill();
    select.addEventListener('change', () => {
      control.setCondition({ operator: 'is', values: select.value ? [select.value] : [] });
      app.execute();
    });
  }

  // ----- router
  const views = new Map();
  const lastTab = {};
  function register(view) { views.set(view.id, view); }
  function header(view) {
    const tabs = [...views.values()].filter((v) => v.nav === view.nav && v.tab);
    const tabHtml = tabs.length > 1
      ? `<div class="pills">${tabs.map((v) => `<button class="pill${v.id === view.id ? ' active' : ''}" data-go="${v.id}">${v.tab}</button>`).join('')}</div>`
      : `<div></div>`;
    return `<div class="topbar">${tabHtml}<div class="right">${view.extraHeader ?? ''}
      <button class="icon-btn" data-action="trace" title="Trace numbers to their definitions">ƒ</button>
      <button class="icon-btn" data-action="privacy" title="Hide balances">◐</button></div></div>`;
  }
  function go(id) {
    const view = views.get(id) ?? views.get(lastTab[id]) ?? [...views.values()].find((v) => v.nav === id);
    if (!view) { console.warn(`no view for ${id}`); return; }   // a section not built yet
    lastTab[view.nav] = view.id;
    for (const v of views.values()) if (v.el) v.el.hidden = v !== view;
    document.querySelectorAll('.nav-item[data-nav]').forEach((b) => { const on = b.dataset.nav === view.nav; b.classList.toggle('active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
    if (!view.el) {
      view.el = Object.assign(document.createElement('section'), { className: 'view' });
      view.el.dataset.anfraContainer = view.id.replace('/', '-');
      view.el.dataset.anfraLabel = `${view.nav}${view.tab ? ` › ${view.tab}` : ''}`;
      document.getElementById('views').append(view.el);
      view.init(view.el);
      skeletons(view.el);
    }
    WF.current = view;
    view.shown?.();   // a view that does something on every open (Ask AI's money rain)
    document.querySelectorAll('[data-action="trace"]').forEach((b) => b.classList.toggle('on', !!WF.tracer?.on));
    app.execute();
    renderAll();
  }
  function renderAll() {
    try { WF.current?.render(); } catch (e) { console.error('render failed', e); }
    skeletons();
  }
  // Skeleton loading (20 Oct, Nhi: "loading is quite slow"): a card whose queries have not answered yet (data-anfra-query) wears
  // .skel, which ds/components.css draws as grey placeholder bars in its body. It lifts when every query has a result or failed
  // (an error shows its own state line). A re-run that keeps the old result is not a first load: that stays .loading.
  function skeletons(root = document) {
    root.querySelectorAll('.card[data-anfra-query]').forEach((c) => {
      const wait = c.dataset.anfraQuery.split(/\s+/).some((n) => { const r = registry.get(n)?.query; return r && !r.result && r.state !== 'error'; });
      c.classList.toggle('skel', wait);
    });
  }
  app.subscribe(renderAll);

  async function boot(defaultView) {
    const meta = q('meta', {
      dataset: 'personal_finance',
      metrics: { as_of: 'data_as_of' },
      aql: 'explore { measures { as_of: data_as_of, first_day: fct_ledger | min(fct_ledger.line_date) } }',
    });
    await app.execute();
    if (meta.state !== 'success') {
      document.getElementById('views').innerHTML = `<div class="empty">Couldn't load the data: ${meta.error?.message ?? 'unknown error'}</div>`;
      return;
    }
    WF.asOf = String(one(meta).as_of).slice(0, 10);
    WF.firstDay = String(one(meta).first_day).slice(0, 10);
    console.log('as of', WF.asOf, 'first day', WF.firstDay);
    const stamp = document.getElementById('asof');
    if (stamp) { stamp.textContent = new Date(`${WF.asOf}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }); mark(stamp, 'meta', 'as_of'); }
    go(defaultView);
    // prefetch (19 Oct, Nhi: "load faster"): once the first page has its numbers, the other pages are set up off-screen and
    // their queries run in the background, so opening one later answers from the query cache at once
    await idle();
    setTimeout(warm, 800);
  }
  // resolves when no query is running
  const idle = () => new Promise((ok) => { const tick = () => ([...registry.values()].some((r) => r.query.state === 'executing') ? setTimeout(tick, 100) : ok()); tick(); });
  // Initialise every page not yet open, off-screen, one page at a time: each page's queries finish before the next page starts,
  // so Anfra's AQL compiler never gets the whole app at once (18 Oct: ~74 queries in one burst made anfra-node drop requests
  // with 500s; the SDK has no concurrency cap). Shared by the boot prefetch and Definitions (which lists every page's metrics).
  let warming = null;
  function warm() {
    warming ??= (async () => {
      for (const v of views.values()) {
        if (v.el || v.id === 'defs') continue;
        v.el = Object.assign(document.createElement('section'), { className: 'view' });
        v.el.hidden = true;
        v.el.dataset.anfraContainer = v.id.replace('/', '-');
        v.el.dataset.anfraLabel = `${v.nav}${v.tab ? ` › ${v.tab}` : ''}`;
        document.getElementById('views').append(v.el);
        v.init(v.el);
        skeletons(v.el);
        await app.execute();
        skeletons(v.el);
      }
    })();
    return warming;
  }

  Object.assign(WF, { app, registry, q, dateControl, textControl, fieldControl, status, rows, one, mark, range,
    setPeriod, changeRange, monthSpan, addMonths, pills, accountPicker, register, header, go, renderAll, boot, views, warm });
})();
