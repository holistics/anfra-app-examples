// ★ Page layouts: which cards each page shows, in which column, in what order. Edit, reload, done.
// The grammar is at the top of js/ds/layout.js. Every page sits on ONE 12-column grid: the main column spans 8, the right
// rail spans 4, and a pair splits the main column into 4 + 4, so every card edge lands on a column line (DESIGN.md § Grid).
// How each breakpoint reflows these rows is ds/layout.css, not this file. Block ids are the cards' data-anfra-block names,
// defined in each js/views/*.js init (this.blocks). Leaving a block out hides it (it still renders, hidden).
OG.PAGES = {
  // Home › Net worth: the history (hero) and the monthly pace under it in the main column; the Summary (assets / liabilities by group, their accounts,
  // the identity) in the rail.
  'home/networth': { row: [
    { stack: ['hn-main', 'hn-pace'], span: 8, container: 'hn-main-col', label: 'Main column' },
    { stack: ['hn-sum'], span: 4, rail: true, container: 'hn-rail', label: 'Right rail' },
  ] },

  // Home › Spending: this month's spend, cash flow and running spend vs a chosen month, the latest transactions under it
  // (main); the category breakdown (Expenses / Budget) in the sticky rail.
  'home/spending': { row: [
    { stack: ['hs-month', 'hs-latest'], span: 8, container: 'hs-main-col', label: 'Main column' },
    { stack: ['hs-cats'], span: 4, rail: true, container: 'hs-rail', label: 'Right rail' },
  ] },

  // Home › Investments: the invested value (hero), the holdings under it; the accounts and the income in the rail.
  'home/invest': { row: [
    { stack: ['hi-port', 'hi-hold'], span: 8, container: 'hi-main-col', label: 'Main column' },
    { stack: ['hi-acc', 'hi-inc'], span: 4, rail: true, container: 'hi-rail', label: 'Right rail' },
  ] },

  // Ask AI: one full-width block (the greeting + composer + nudges, then the thread); css/ask.css lays it out
  ask: ['ask-main'],

  // Cash flow (the nav page id stays `spending`), four tabs since 18 Oct, renamed 18 Oct (Nhi): In & out (the first) · Transactions · Recurring · Credit.
  // The page was "Spending" with tabs Cash flow · … · Credit; the ids (spending/cashflow, spending/credit) did not change.
  // In & out: in vs out by month and where it went; the period as a Summary (income, spending) in the rail.
  // Transactions: every transaction in a date range; one rail card (18 Oct: an icon switch) for what each account spent
  // (a click filters the list), the categories and the top 5 merchants (a row opens in the rail, ‹ back). The page scrolls
  // as one, the rail sticky like every page (18 Oct: no own-scroll rail or pinned head).
  // Recurring: what's coming up; the monthly commitments (bills + subscriptions), compact and folded, and the next payday
  // in the rail.
  // Credit: what's owed and what went on each card by month (18 Oct, Nhi); the cards (details and history folded) and the
  // cashback cycle with its past cycles in the rail.
  'spending/transactions': { row: [
    { stack: ['sp-tx'], span: 8, container: 'tx-main-col', label: 'Main column', cls: 'sp-open' },
    { stack: ['sp-break'], span: 4, rail: true, container: 'tx-rail', label: 'Right rail', cls: 'sp-open' },
  ] },
  'spending/recurring': { row: [
    { stack: ['rc-upc'], span: 8, container: 'rc-main-col', label: 'Main column', cls: 'sp-open' },
    { stack: ['rc-commit', 'rc-pay'], span: 4, rail: true, container: 'rc-rail', label: 'Right rail' },
  ] },
  'spending/credit': { row: [
    { stack: ['cr-spend'], span: 8, container: 'cr-main-col', label: 'Main column' },
    { stack: ['cr-cards', 'cr-cashback'], span: 4, rail: true, container: 'cr-rail', label: 'Right rail' },
  ] },
  'spending/cashflow': { row: [
    { stack: ['cf-flow', 'cf-sankey'], span: 8, container: 'cf-main-col', label: 'Main column' },
    { stack: ['cf-sum'], span: 4, rail: true, container: 'cf-rail', label: 'Right rail' },
  ] },
  // Invest (18 Oct): Performance (default) · Holdings. Performance: the return (hero = ₫ gained), you vs the VN-Index, what moved it and
  // the winners and drags in the main column; what's worth knowing, the risk and the income in the rail. Holdings: every holding by kind (hero = what
  // they're worth) in the main column; what's worth knowing and the allocation in the rail, where a holding opens (‹ back).
  'invest/performance': { row: [
    { stack: ['inv-ret', 'inv-vs', 'inv-bridge', 'inv-movers'], span: 8, container: 'inv-perf-main', label: 'Main column' },
    { stack: ['inv-notes', 'inv-risk', 'inv-inc'], span: 4, rail: true, container: 'inv-perf-rail', label: 'Right rail' },
  ] },
  'invest/holdings': { row: [
    { stack: ['inv-hold'], span: 8, container: 'inv-hold-main', label: 'Main column' },
    { stack: ['inv-hold-notes', 'inv-alloc'], span: 4, rail: true, container: 'inv-hold-rail', label: 'Right rail' },
  ] },
  // Forecast (18 Oct): Net worth (default) · Next 30 days. Net worth: where it is heading at the pace you keep (hero = the exact
  // 1-year projection) and the milestones, in the main column; the what-if slider, what's worth knowing and what drives it in the
  // rail (19 Oct, Nhi: What if first). Next 30 days: spendable cash day by day, its highs and lows (own card, 19 Oct) and what
  // comes in and goes out; the 30-day summary, then worth knowing, in the rail.
  'forecast/networth': { row: [
    { stack: ['fc-nw', 'fc-miles'], span: 8, container: 'fc-nw-main', label: 'Main column' },
    { stack: ['fc-whatif', 'fc-notes'], span: 4, rail: true, container: 'fc-nw-rail', label: 'Right rail' },
  ] },
  'forecast/cash': { row: [
    { stack: ['fc-cash', 'fc-items'], span: 8, container: 'fc-cash-main', label: 'Main column' },
    { stack: ['fc-c-sum', 'fc-c-notes'], span: 4, rail: true, container: 'fc-cash-rail', label: 'Right rail' },
  ] },
  defs: { grid: 'defs-wrap', items: ['defs-index', 'defs-list'] },
};
