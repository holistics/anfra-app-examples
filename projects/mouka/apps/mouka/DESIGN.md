# mouka (official)

The submission app, rebuilt page by page on **one grid, one card anatomy and one set of controls**. Home comes first:
three tabs (**Net worth · Spending · Investments**) from Nhi's three reference screens (16 Oct). **Cash flow** (called Spending until 18 Oct) followed on 17 Oct, now **In & out · Transactions · Recurring · Credit**; **Invest**
(Performance · Holdings) and **Forecast** (Net worth · Next 30 days) on 18 Oct: every page is built. Every earlier look lives in
`apps/archive/` (see the repo README).

- App: `http://127.0.0.1:7878/apps/mouka/app` (with `anfra serve`) · gallery: `/apps/mouka/ds`
- Self-contained: `js/core/` is this app's own copy of the shared machinery (query registry, router, periods, trace).
  `python3 -I scripts/gen_definitions.py` writes `js/core/definitions.js` after any AML edit.
- Icons: [Lucide](https://lucide.dev) (ISC), plus [Tabler](https://tabler.io/icons) for ₫ only. `scripts/gen_icons.py` writes `js/ds/icons.js`
  (only the icons mouka uses, ~7 KB); use one with `OG.icon(key)` in JS or `<svg class="i" viewBox="0 0 24 24" data-icon="key"></svg>` in HTML.
  To add or swap one: edit `MAP` in the script, run it, and run `--check`. The libraries' stroke attributes are stripped, so `.i` in
  `ds/base.css` sets the weight (1.5).
- Checks: `cd tests/app && ./gate.sh m1 m1-ds ask sp inv fc && APP_URL=http://127.0.0.1:7878/apps/mouka/ds ./gate.sh m1-gal && ./ds-lint.sh && node a11y.mjs`;
  with the save helper running, `./gate.sh m1-save`. `node shot.mjs <url> <out> 1600 1280 1100 768 390` screenshots
  the frame at each width.

## The harmony rules (what the refs did, and the one rule that replaced it)

| In the refs | The rule |
|---|---|
| Column widths and card edges differ per screen | **One 12-column grid.** Main spans 8, the rail 4; a pair splits the main column 4 + 4. Every card edge lands on a column line (`js/pages.js`, `ds/layout.css`). |
| A second chart toggle row beside the page tabs; the active tab stuck on "Net Worth" | **Page tabs = one segmented row under the title**, nothing else on it. Each tab is a router view, so the active state is always right. |
| Heads mix ✦, 2–3 toggles, a kebab, "ADD", "LATEST ›" | **Card head:** the title, an `h2` as a quiet uppercase label (`›` when the card navigates) · ⓘ explain right after it (`.explain`: opens how the number is calculated; replaced the card ✦ on 17 Oct) · info slot (freshness dot) · **at most one control** (prefer icon segments: Summary's ₫ / %) · ⋮ for utility actions (Download CSV, Filter accounts, Add); a card with ONE action shows that action's icon in the ⋮'s place (`OG.menu` with one item, 17 Oct, Nhi). In a card under 400px a text switch drops under the label as a full-width row. |
| "Total balance" sublabel vs none; "past month" vs no period; Forecast › vs vs September ▾ | **Hero block** (`OG.heroRow`): the value (serif, exact đồng) + the delta line (`OG.delta`: amount and % in the sign colour, the period word muted; spending inverts) + one optional outline button. |
| 1M·3M·YTD·1Y·ALL vs 1W·1M·3M·6M·YTD·1Y | **One range set: 1M 3M 6M YTD 1Y ALL** (`OG.RANGES`), centred under the chart. |
| Segmented Totals/Percent vs underline Expenses/Budget | **One switch look**: page tabs, icon segments and text segments share the track. Underline tabs (`OG.underlineTabs` + `OG.setTab`, a real tablist) are kept in the kit for a card body that splits into views that each carry a total; no page uses them now. Never in a card head. |
| Initials circles, coloured circles, bare icons, ticker circles | **One list row** (`OG.row`) with **one tile** (`OG.tile`, 32px): an icon on the category colour, or initials/ticker on the neutral fill. 56px rows, hairlines. |
| ₫847M next to ₫847,264,856 | **Precision ladder:** heroes, balances and the identity exact; rail and list values compact (3 significant digits); deltas compact. |
| Group colours drift | **One tone map** (`OG.groupTone`): Investments `--chart`, Cash `--chart-soft`, Liabilities `--neg`. |
| Chart heights and axes vary | **One chart frame** (`.chart.frame` = `--chart-h`): 280 / 220 / 200px by breakpoint; right mono axis; a key line only when a second series needs naming. |

Two numbers changed on purpose:
- **Spending** no longer draws the ₫18.3M budget line on the all-spend chart. The budget covers categories only (no
  bills), so it lives in the rail's Budget switch. This is the 16 Oct "one base per card" fix.
- **Investments' hero is the invested value** (the Investments group, ≈₫577M), not all assets (₫847M, which is Net
  worth's). `m1` asserts that it equals the Investments group subtotal (`og4_networth_grp`).

## Hierarchy, type and colour (the 16 Oct re-audit)

Measured on every text node of the three tabs (`tests/app/a11y.mjs` is now the gate). What changed:

**Information layers, top to bottom.** Each level has exactly one style.

| Level | Style | Example |
|---|---|---|
| 1 · the fact that matters | Display: 36px serif 700, exact đồng, **one per tab** | ₫844,299,746 |
| 2 · where you are | Title: 24px serif 700 (a step under the hero, so the hero leads) | Home |
| 3 · a card | Heading: `h2.card-title`, a quiet label: 13px sans 400, UPPERCASE, `--ls-label` tracking, `--ink-3` (16 Oct, Nhi: the archived mouka-v2 label, a bit bigger and darker). The inspector's title (`.dh`) stays sentence case: it names a subject | SUMMARY |
| 4 · a group inside a card | Disclosure row: the same 15px / 500, with a caret (and the group's colour swatch) | ▾ ■ Investments |
| 5 · an item | Body: 15px / 400 | SSI Securities |
| 6 · context | Secondary: 13px / 400, `--ink-2` (the deltas carry the sign colour) | past month · Oct 14 |
| sub-heading in a card | `.label`: 13px / 500, `--ink-2` | Net worth (the identity box), Total value |
| micro | 12px / 400 (`--fs-label`) | axes, weekdays, badges |

- **Weights:** sans uses 400 / 500 only; 700 is reserved for the serif title and heroes. Emphasis inside a sentence is `.em` (500), never bold.
  - **One exception (17 Oct, Nhi):** a delta's amount and % are bold (`--fw-delta`, 600), so the change reads right after the hero; the period word stays 400. `a11y.mjs` allows exactly `.delta > .pos / .neg`.
- **No caps labels** anywhere in the product: caps at 11px were the weakest text on the page (3.7:1). They remain only in tooling (the design panel, the gallery).

**The palette (17 Oct, Nhi): `terracotta` is the default theme** (`ds/themes.css`), mouka's type and layout in the Supercart reference palette; the previous palette is the `mouka` preset (panel `\` → mouka).
- Series in the reference's order: terracotta `#e1653e` (the data colour, `--chart`) → sky `#95d2ff` → periwinkle `#9998ff` → mustard `#fac666`, warm grey `#e2e1dd` for "other". Fills stay light (values are always labelled); lines use the strong steps (≥ 3:1).
- Group tones are tokens (`--tone-invest / -cash / -liab`): Investments terracotta, Cash sky, **Liabilities periwinkle**. Not the loss pink: terracotta beside pink fails the colour-blind check (ΔE 10.5); the minus sign and "owed" carry the meaning.
- Every value is a palette swatch, or the same hue stepped darker until it passes (ink-2, ink-3, the *-ink text tokens); validated with the dataviz palette checker.

**Colour rules: text tokens vs fill tokens.**
- `--pos` / `--neg` are **fills and strokes** (bars, sparklines, chart lines, dots). `--pos-ink` / `--neg-ink` are **text**: every signed number, delta and badge, ≥ 4.5:1 on every surface and tint. mouka: #36752b / #b8355c.
- `--ink-3` is ≥ 4.5:1 everywhere (#696866 in mouka). Meta and captions use `--ink-2`; `--ink-3` is for the quietest text and disabled states.
- `--chart` fills the area; `--chart-line` (≥ 3:1) draws the stroke and the end dot.
- `--ai` (the ✦ icon) is ≥ 3:1. The page's ✦ wears the AI tint and the `--ai-ink` icon (cards use the ⓘ, which turns AI-tinted while tracing). The orange gradient is gone.
- Every theme (mouka, calm, dark, contrast) passes `THEME=<name> node a11y.mjs`.

**Lists: primary vs secondary.**
- **One-line rows** (`OG.line`): when an item needs no second line (accounts, categories). The row is name · aside · value. The name and the value are primary (body, ink); the aside (a share or a 1M change) is secondary (13px, ink-2 or the sign colour). There are no avatars or initials on accounts, and no dividers: spacing groups the rows.
- **Freshness** shows only when a source is behind, as an amber dot after the name. It is never a repeated "up to date".
- **Two-line rows** (`OG.row`): only when the second line is real context (a transaction's date, a holding's name).
- **Group labels in lists** (`discBtn({ size: 'list' })`) are quiet: 13px ink-2 with a 12px caret and an 8px swatch. The group frames its rows and doesn't outrank them. In a table, group rows stay 15px medium because they are subtotal rows.
- **Card fold** is a small chevron at the right end of the head, always shown, so every card's right edge lines up.

**One disclosure pattern.**
- `OG.discBtn({ key, label, swatch })` is a button with `aria-expanded` and a 24px target. Rows that belong to it carry `data-under="<key>"`.
- A `[data-disc-scope]` remembers what's folded across redraws (`OG.applyFold`).
- It's used for the Summary's sides and the Accounts list's groups.
- **Indent ladder:** each level's text starts under the label above it (caret + gap = 22px, + swatch = 62px).
- **Cards fold too:** a quiet chevron at the right end of the head (after ⋮); the fold is kept for the session. The head never moves when a card folds: the body animates its height to 0 (`interpolate-size`), is `inert` while folded (a flow root, so the hero row's margin can't leak out and grow it), and the head control and the ⋮ / lone action step out (`display: none`; the title is pinned by its zero flex basis, so it doesn't move). An invisible control used to keep its room, truncating rail titles ("SUMMA…") and leaving an empty row under a wrapped head (17 Oct).
- **Chevron after the label** (`discBtn({ caret: 'end' })`): the Summary's groups (Investments ⌄, Cash ⌄, Liabilities ⌄) fold their accounts (17 Oct, Nhi).
- **Drill-down in the rail** (`OG.drawer({ rail, back: 'Summary' })`): an account opens in the rail, in the Summary's place, with ‹ back left of the title instead of × (the Net worth card keeps its width); ‹ back or Escape returns, focus on the row. Below 1024px it stays a sheet over the page. The account's Source label carries its date: "Source · as of Oct 14".

**Sidebar.**
- **Collapse / expand:** the ‹ button in the sidebar head or the `[` key.
  - At xl / lg it collapses to the icon rail.
  - At md / sm (rail by default) it opens the full sidebar over the page, with a scrim. Esc, the scrim or picking a page closes it.
- **Resize:** drag the edge (180–320px; under 120px snaps to the rail), double-click to reset, or focus the handle and use ← → Home End. The handle is `role="separator"`.
- **Not a token:** the width lives on `.shell` (`--nav-w-user`), so it is not a design-token edit and the panel's history and presets ignore it. Session only.

**Semantics:**
- the tabs are a `tablist` with `aria-selected`;
- the current nav item has `aria-current="page"`;
- the switches and ranges carry `aria-pressed`;
- every icon-only control has an accessible name (checked by `a11y.mjs`).

## Ownership (one number, one home)

| Fact | Owner (hero) | Elsewhere |
|---|---|---|
| Net worth, assets, liabilities | Home › Net worth (`data-own="net-worth"`) | Summary card in the rail: per side a split bar by group, each group with its accounts (colour = the group only), Totals / Percent, the identity box |
| Spend this month | Home › Spending (`spend-month`) | the gauge centre (compact) |
| Invested value | Home › Investments (`invested`) | the Investments group subtotal, `og4_networth_grp` (same query family) |
| Spend over a chosen range | Spending › Overview (`spend-range`, default 3M) | the categories' sum, the trend bars' total, the list's "spent" (all asserted equal in `sp.json`) |
| Bills due in the next 30 days | Spending › Recurring (`due-30d`, `recurring_due_30d`) | the sum of the list's bills due within 30 days |
| Net cash flow over a range | Spending › Cash flow (`net-flow`, default 6M) | income − spending; the sankey balances to it |
| ₫ gained on investments over a range | Invest › Performance (`portfolio_gain_loss`, default 1Y) | What moved it (`inv-bridge`): money added + price moves + dividends + fees & other = end − start (asserted in `inv.json`) |
| Net worth in 12 months (last-12-months pace) | Forecast › Net worth (`nw-projected-1y`, `og8_fc_12m:p1`, exact) | the road's 1Y stop; Ask AI's "where is my net worth heading" (the same query, asserted in `fc.json`) |
| Spendable cash in 30 days | Forecast › Next 30 days (`cash-30d`, `cash_expected_30d` over the last 90 days) | the day-by-day line ends on it; the summary's net (asserted in `fc.json`) |
| What the open positions are worth | Invest › Holdings (`holdings_value`) | the rows and the groups; + the cash waiting in SSI = Home › Investments' invested value (asserted in `inv.json`) |

## Cash flow, was Spending (17 Oct): In & out · Transactions · Recurring · Credit
**Renamed 18 Oct (Nhi):** the page held income, payday, bills and card debt, not only spending, and "Spending" was also the Home sub-tab. So the nav page is **Cash flow**, its first tab **In & out** (was Cash flow), and its first card (the net and the bars) is **Net**, not "Cash flow", so it doesn't repeat the page title. Credit was briefly renamed Cards, then kept as **Credit** (Nhi, same day). Home › Spending keeps its name. Only labels changed: the ids stay `spending/cashflow`, `spending/transactions`, `spending/recurring`, `spending/credit`, and `data-nav="spending"`. The notes below predate the tab changes of 17–18 Oct (Overview removed; Transactions and Credit added).

**Review round 10 (18 Oct, Nhi): one row language.**
- **In & out › This period:** the group lines read like Net worth's child rows (regular, `--ink-2`, 30px pitch). Interest wears `--tone-interest` (a light green) and Other `--cat-other` slate (it was Salary's sky). The ratios button is `gauge`, because `formula` is the trace.
- **Transactions:**
  - The page scrolls as one. The pinned head and the rail's own scroll are gone; the rail is sticky like every page.
  - Accounts, Categories and Merchants are ONE rail card (`sp-break`). Its icon switch sits on its own line under the title.
  - % starts off.
- **Recurring:**
  - Coming up uses the Transactions list's rows and day heads, grouped by due day, with a Payday tag.
  - The commitments' group lines have no divider; their rows match Net worth's child rows; the label sits 8px above the total.
- **Info lines** under a hero (`.delta`, `.sub`, `.rc-upc-sub`, `.cr-quiet`) are Inter Light (`--fw-light` 300). Their pills and `.em` stay 500.
- **Credit:**
  - The main card is Card spending: the owed hero, then each card's spending by month (`OG.cardBars`, `--card-tcb` / `--card-vib`, 6M · 1Y · ALL, the month in progress hatched).
  - The cards (two-line rows) and Cashback sit in the rail.

**Round 11 (18 Oct, Nhi).**
- **Colours (terracotta):**
  - Bonus mint (`--tone-bonus`), Interest warm yellow (`--tone-interest`).
  - Other takes Transport's sand beige and Transport turns grey.
- **Info lines:** back to regular weight (Inter 300 dropped) in a lighter ink (`--ink-meta`: terracotta `#7f7268`, 4.66:1 on the white card, so it stays on surfaces only).
- **Transactions rail card:**
  - The icon switch IS the title. `OG.segIcons(…, { labels: true })` names the active segment, and the h2 is kept for screen readers only.
  - It has no fold, because the 4-column rail has no room.
  - A switch eases the height and fades the view in, where a height jump used to read as a glitch.
  - The merchants' "N times" line is in `--ink-3`.
  - There's more air under the hero and before the first day.
- **Coming up:** This week / Next 30 days / Later again, with the due date in its own column (tag · date · amount).
- **Credit:**
  - Each card's spend over the range sits on the hero's right (`.flow-kpis`, as on Home).
  - The quiet lines (Paid in full…, 1 day left…) drop to 12px.
- **Payday:** 8px between the track and its dates.

**English data names (18 Oct, Nhi).**
- Everything a person reads is English: accounts (SSI Securities, Gold, Term deposits), holdings (SJC 9999 gold, the ETFs and the bond fund), pots (Da Lat trip, Emergency fund, Birthday gifts, Bap the cat, Bike repair), the payee Mom (the Mom toggle), and every AML description.
- Kept: brand names (Phúc Long, Long Châu, Bách Hóa Xanh), the raw bank memo text, and the category KEYS ('Hoá đơn', '(chưa phân loại)'). The keys are the cspipeline taxonomy values every filter joins on; the UI shows their `label_en`.

**Notifications (18 Oct, Nhi).**
- A bell sits first in every page header (`js/notify.js`), before ✦ trace and hide balances. Its dot (`--neg-ink`, 4.5:1) counts the items not yet seen this session.
- It lists what needs attention, each item from a governed query and opening the page that owns it:
  - the TCB Visa bill due within 7 days (`og_card_bill`)
  - MAX VIB cashback behind pace (`og_vib`)
  - a source in use that stopped loading (`og2_fresh` / `OG.stale`)
  - a recurring charge late or due within 3 days (`og_ntf_due`)
- **The Design entry is gone** from the sidebar and the phone's More sheet. The `\` key still toggles the design panel.

Built on the same grid, card anatomy, hero block, list rows and ranges as Home; content and AQL ported from archive/mouka and mouka-v2 (`js/views/sp_*.js`, `css/spending.css`).
- **Overview** (`spending/overview`): spending over any range (hero + delta vs the same number of days before), stacked bars by the top 4 categories + Rest per week / month (or a weekday × hour heat), the transaction list (head search, filter chips, day groups, Show more, CSV via `query.export()`), and the categories (change vs before + share bar) and top merchants in the rail. **Filters narrow the list only**; a chart bar narrows the list to that period (a dates chip).
- **Recurring** (`spending/recurring`): bills due in the next 30 days from the `fct_recurring` model, grouped This week / Next 30 days / Later (or a 5-week calendar), payday as an income row; subscriptions with 5 full months of sparkline and a rise flag at ≥ 3% (card FX wobbles are ignored); monthly commitments (split bar) and the card bills (TCB Visa statement, MAX VIB cycle) in the rail.
- **Cash flow** (`spending/cashflow`): net cash flow (hero + "kept" pill), income up / spending down bars with a net line (periods past `data_complete_through` hatched + footnoted), a sankey sources → Money in → categories + Kept, and the period's totals and money-in sources in the rail.
- **Drill-downs** all open in the rail with ‹ back: a category, a merchant, a transaction (Overview), a series (Recurring), a period (Cash flow). Every one ends in **Show transactions**, which lands on Overview's list through `OG.openTx` / `openWith` (the ✦ "See the rows" links land there too).
- **Components added:** `OG.searchField`, `OG.filterChips`, `OG.dayHead`, `OG.splitBar` (gallery › Controls); `OG.rangeBtn` + `OG.rangePopover` (17 Oct: the date range picker on Transactions); charts `OG.flowBars`, `OG.sankey` (js/origin.js). Tokens: `--chart-rest` ("the rest" in a chart), `--flow-out` (money out in Cash flow), `--flow-in` (money in; green in dark, where `--chart` is blue).
- **Naming:** `og6_sp_*`, `og6_rc_*`, `og6_cf_*`; a card's own content ids must not be `<card-id>-body / -info / -menu / -foot` (OG.card owns those).

## Invest (18 Oct): Performance · Holdings
Spec `docs/superpowers/specs/2026-10-18-invest-page-design.md` (Nhi's picks: Allocation in Holdings, Income in Performance, ₫ gained as the hero, grouped rows, insights in a rail card).
- **Performance** (`js/views/inv_performance.js`): one range for the whole tab (default 1Y). Return (`inv-ret`: hero ₫ gained, pill = TWR; the race draws you vs the VN-Index and names the gap in points; the day-by-day line below, the tooltip names the gap too) · What moved it (`inv-bridge`: Net worth's pace rows: start and end on the left; money added, price moves, dividends, fees & other on the right; closes to the đồng; price moves no longer fold) · Winners and drags (`inv-movers`, new: each holding's price move as a bar from a zero line) · rail: Worth knowing, Risk (`inv-risk`: the worst dip drawn under a waterline, volatility under it; hover cards in plain words), Income (dividends + interest, a bar per month of the range). Scope: SSI + gold, as `twr` (term deposits and cash are not in the return); income counts every account.
- **Holdings** (`js/views/inv_holdings.js`): "now", no range. Hero = open positions (`holdings_value`), pill = unrealised; a split bar and folding groups by kind (`--inv-stock / -etf / -bond / -gold`); a sort switch (value · return · today) and a % switch (weights, off by default); Closed · 1 folded; the cash waiting in SSI reconciles with Home. Rail: Worth knowing, Allocation (half ring by kind or by account; hovering a kind lights its group).
- **The holding drawer** (`js/views/inv_shared.js`, `OG.inv.open(sym)` from anywhere): opens in Holdings' rail with ‹ back. Value + return since bought, price since first held with buys (filled) and sells (hollow) on the line (`OG.area({ marks })`) and the average cost dashed, the facts, the activity by day in English (never the bank's comment). A closed holding shows realised, the sale and the move since.
- **Worth knowing** (`OG.notes`, gallery › Data display): ranked one-line insights, each a button to where its fact lives; every figure comes from a governed query, the wording is computed; a card with no notes hides.
- **Queries** `og7_inv_*`, none shared with Home (Home's `perf_kpi` / `hold_open` are mapped to Home's controls). The account filter (Net worth) doesn't apply here. ⚠️ A dimensions-only query on `fct_activities` must filter its own column (`fct_activities.symbol`): a `dim_assets` filter doesn't join.
- **Definitions warms the pages one at a time** (`js/views/defs.js`): the SDK sends every pending query at once, and ~74 in one burst made `anfra-node` drop requests with 500s.

## Forecast (18 Oct): Net worth · Next 30 days
Spec `docs/superpowers/specs/2026-10-18-forecast-page-design.md` (Nhi's picks: two tabs, a what-if slider, an exact 1-year hero).
- **Net worth** (`js/views/fc_networth.js`): hero = net worth in 12 months at the last-12-months pace, exact (`net_worth_projected_1y`). Grey history → a band between the 12-month and the all-time pace to the horizon (`1Y 3Y 5Y 10Y`, default 3Y; the edges' values in the key, `≈` + `OG.proj` past a year) → bonus months ringed → the what-if line. The road (`fc-miles`: today → the ₫1B star → 1 / 3 / 5 / 10 years, see Drawn sentences). Rail: Worth knowing (bonus months' share of the year, pace vs all time, the crossing, card debt), What if (`OG.slider`, ±₫10M a month: client arithmetic on the governed pace, so plain text + "estimate", never traced), What drives it (the 12-month drivers; Home's Monthly pace owns all time). The projection metrics are tested (`check_wealth.py` w15).
- **Next 30 days** (`js/views/fc_cash.js`): hero = `cash_expected_30d` (total cash + what `fct_cash_ahead` expects in and out − everyday spending a day × 30, over the last 90 days). The last 30 days of TCB debit + Timo (wealth daily balances) → the next 30 days day by day, movements marked, the lowest point dotted (the runway names it); the runway bar (`fc-cash`, under the hero) puts the month's low, today, peak and end on one rail. Coming in and out (day heads with the balance after; tags Payday · Card · Family) + the everyday rate. Rail: Worth knowing (the low point, what payday covers, the everyday rate), Next 30 days (Net worth's Summary anatomy: coming in, going out, net).
- **`fct_cash_ahead`** (`models/facts/`): paydays (`fct_recurring`), money to family on its day of month, each card's payment on its usual day = about a month of that card's spending (its last 90 days of card lines; card lines stop at `data_complete_through`, so "owed today" would undercount), an unpaid TCB Visa statement in place of its estimate. Not counted (no schedule): investing, savings, pots, own transfers, paybacks. `check_semantic.py` c12 rebuilds every row and the 30-day identity. ⚠️ `{{ #model }}` can't take an alias: wrap it in a CTE. ⚠️ `matches @(… until D)` excludes D: the app uses inclusive between-ranges. ⚠️ the 30-day hero query takes ~4 s (the ledger model expands three times): every card on the tab shows Loading… (or the error) until it lands. ⚠️ the day-of-month clamp is `least(m + to_days(day − 1), last_day(m))`: `make_date` throws on a 31st in a 30-day month.

## Drawn sentences (18 Oct)
Spec `docs/superpowers/specs/2026-10-18-invest-forecast-fun-design.md`. Five sentences that were text or a key are now drawn. The picture says what; the numbers stay in labels, hover cards and the hero. **Worth knowing is unchanged on every tab** (Nhi's call).

| Card | Visual | Replaces |
|---|---|---|
| `inv-ret` (Invest › Performance) | **The race**: you vs the VN-Index as two bars from a zero tick; "behind" in `--neg-ink` and negative bars grow left | the chart key |
| `inv-risk` | **The dip**: the worst drawdown under a waterline at 0%; the number is the governed `max_drawdown` | the Risk card's `OG.kpis` box (the number is now a small serif figure in the card head) |
| `inv-movers` (new) | **Winners and drags**: price move per holding, a bar from a zero line | Price moves' fold in What moved it |
| `fc-miles` (Forecast › Net worth) | **The road**: today → the ₫1B star → 1 / 3 / 5 / 10 years | the four `OG.line` rows and the ₫1B sentence in Milestones |
| `fc-cash` (Next 30 days) | **The runway**: the month's low, today, peak and end on one bar | nothing (new, between the hero and the day-by-day chart) |

- **Accessibility.** A pure picture is `role="img"` with an `aria-label` that reads as the sentence it replaced (race, runway, dip). A visual with focusable items is `role="group"` + `aria-label` instead (road, Winners and drags), because ARIA makes the children of an `img` presentational. Stops and mover rows are focusable and open the same hover card on focus; Enter/Space on a stop pins its card. A keyboard-focused card follows a scroll instead of closing (`origin.js` guard) while its anchor is in sight, and closes once the anchor scrolls out. A mover row's card is `data-hc-hover="inv-mv"` (hover only: a click on a `[data-hc]` pins, but a row's click opens the holding, so the row closes the card itself).
- **The dip** draws weekly lows (about 36 points, smoothed) but always keeps the exact trough day, the first, the last and the back day.
- **The runway**: the rail spans min(low, today) → max(peak, today); low → peak is shaded; no zero line; "Runs short" when the low is below 0.
- **The road**: stops are evenly spaced (not to time scale), the ₫1B star before 1Y. Each stop's hover card holds the all-time-pace value (traced; the 1Y one is exact money, not approx). Vertical at sm and xs. It ignores the what-if slider. With no crossing (pace ≤ 0, or more than 120 months away) the star drops and four flags remain.
- **Winners and drags**: symbols in a fixed column, the zero at maxLoss / (maxLoss + maxGain), more than 8 holdings → top 4 + bottom 3 + "and N more", zero moves dropped, a row opens the holding on Holdings; its hover card (no native `title`) holds the symbol, name and the exact signed move (traced `og7_inv_pg_sym:pg`).
- **Label collision rule.** Labels on the visuals are compact (`approx`, `proj`, `pct1`), the exact value is in the hover card; where two values sit close (the ₫115M beside the ₫113M low; the star beside 1Y) the gates assert that label rects don't intersect at 1600 and 390.
- **Pure methods.** Each visual's maths is a pure method on its view (`race`, `stops`, `runway`, `dips`, `movers`) that the gates call with made-up inputs (a leading index, a negative return, no ₫1B crossing, a cash low below zero, more than 8 holdings), so edge cases don't depend on the live data.
- **Privacy** (the eye): the road's stop values and the runway's four values blur with the heroes (the shared `body.privacy` rule in `ds/components.css`); the ₫1B star is a milestone and stays readable. Hover cards stay clear, as everywhere else.
- Colours are tokens only (`--pos`/`--pos-ink`, `--neg`/`--neg-ink`, `--chart-pace` for the road, `--chart`/`--chart-ref` for history); icons `flag`, `star`, `finish` come from `gen_icons.py`.

## Invest review round (19 Oct, Nhi)

- **A choice that needs words is a dropdown, not icons.** Holdings' sort is `OG.pick` ("Sort Value ⌄": Value · Return since bought · Today's move), on the ⋮ menu's list with a check. Allocation's switch is a text switch (`segBtns`: By kind · By account); in the rail it drops under the label at full width. Icon segments stay for pairs whose icons need no reading (₫ / %).
- **Worth knowing says what it is based on.** Each note has a `why` line under the sentence (13px, `--ink-meta`): the rule that picked it ("Shown when one holding is over 25% of the total"). The sentences are body size (15px). This applies on Invest and on Forecast.
- **The race is its own card**, *You vs the VN-Index* (`inv-vs`), under Return. The Return chart is back to the shared frame height.
- **What moved it is one sum:** Invested + You added + Your gain = Invested now, in an outlined box (a tint failed contrast for the dates and the green). Your gain is the hero, broken down under *Your gain came from*: price moves, dividends, fees & other. Under 560px the sum stacks into a receipt.
- **Winners and drags:** gain bars use `--gain-fill` (terracotta theme: the Bonus mint `#86dcc6`), and the symbols are body size. **Holdings rows** use the Transactions sizes (15px, title regular). **Risk** has 24px above the dip and 16px under it. The **bell's** count hangs off the circle's corner, and the bell sits 1px up so it looks centred.

### Round 2 (19 Oct, Nhi): Home, Recurring, Holdings, Forecast

- **Secondary lines a step lighter:** Latest's dates, the categories' %, and the budget's "of ₫7.2M" use `--ink-meta`. The holdings' second lines on Home › Investments sit on a tint, so they use `--ink-3`, because `--ink-meta` fails there (4.24:1).
- **Holdings rows:** both lines are 15px (the % as big as the value), and the name line uses `--ink-meta`. The reconcile under the list is a sum: Holdings + Cash in SSI (not invested yet) = Invested in total, linking to Home › Investments.
- **Recurring:** "6.5% of salary" and the payday line are 12px. The payday track is a progress bar (`role=progressbar`, no knob, "20 of 30 days" in words), and its badge is 13px.
- **Forecast › Net worth:** the chart uses Forecast's blue (`--fc-line / --fc-hist / --fc-band`; what-if in a deep mint `--fc-whatif`), and so does the 30-day chart. Rail order: What if, Worth knowing, What drives it (14px rows, 12px shares). What if has a thick track that fills from the middle (green when saving more, terracotta when less), quick picks (−₫5M · +₫2M · +₫5M · +₫10M), and two bars, at your pace vs what if. Milestones open with a progress strip: "You are here ₫844M → Next ₫1B, 84% of the way, around Jul 2027", and Today's road label carries its value.
- **Forecast › Next 30 days:** *Highs and lows* is its own card. It has one sentence ("Your cash stays between ≈ ₫113M and ≈ ₫154M"), the range bar with coloured ticks, and the four points in date order under it (no more labels pushed around the bar). *Coming in and out* uses the Recurring rows (`.sp-tx-list .tx-row`: name over its detail, then the tag and the amount in fixed columns). Rail order: the summary, then Worth knowing.
- **Worth knowing everywhere:** the sentence is `--ink` at line-height 1.5, with 8px between notes and the rule 4px under its sentence. **`.state:empty` takes no room**, which removed a 48px gap under Forecast's Worth knowing.

## Ask AI (governed answers, 17 Oct)
- **What it is:** a chat-shaped page above Home (`js/views/ask.js`, `css/ask.css`): a greeting, one composer (`OG.composer`), 8 nudges (`OG.nudge`). The data app is sandboxed (no model, no network), so **no model writes a number**: each use case in `USES` is named queries on the semantic layer plus a template that says what they returned.
- **Every number is governed and traceable:** numbers in an answer are `data-trace` spans (trace mode and the hover cards work), each answer ends with the metrics it read + the as-of date + "See definitions". Client-side arithmetic (an average, a 12-month extension) is printed plain, never traced, and an extension is labelled an estimate.
- **One number, one home:** this month's spending reuses Home's shared queries on Home's shared "this month" control (`sp_kpi_1m`, `sp_cats`, `og_budget_total`, `og_cat_budget`, `og_vib`, `og3_recurring`), so an answer equals the Home number; everything else has `ask_*` queries on Ask's own fixed periods (1M, 1Y, ALL, last month, 6 months), so a range picked on Home never changes an answer. `tests/app/ask.json` checks spending, net worth and MAX VIB against Home.
- **Typed questions:** `route(text)` scores each use case's `words` (EN + VN, accents ignored); no match → an honest "I answer from your governed numbers only" turn with all 8 nudges. To add a use case: one `USES` entry (key, label, icon, words, follow, queries, answer) + an icon in `scripts/gen_icons.py`.
- **Layout:** the empty state centres in the page; with a thread, the greeting and nudges step out and the composer docks at the bottom (above the tab bar at xs). The thread is memory only (no storage in the sandbox); New chat clears it. Home stays the landing page; at xs Ask AI leads the tab bar and Forecast moves into More.

**19 Oct, round 6 (Nhi): the shell.**
- **Sidebar edge:** a click on the brown edge line collapses / expands the sidebar (a drag still resizes, a double-click resets the width; the click waits 230ms for that); the line now shows in the rail too.
- **Rail logo** centred: the hidden wordmark still took the brand's 8px gap, so `html.rail .brand { gap: 0 }`.
- **Tooltips** (`#og-tip`, js/ds/components.js): any icon-only control (no text of its own, or font-size 0 in the rail) shows its `data-tip`, title (moved to `data-tip-t` so the browser's tooltip never doubles it) or aria-label after 380ms on hover, at once on keyboard focus; beside the control in the sidebar, under it elsewhere. Controls with their own hover card (data-hc, data-hc-hover, ⓘ) keep that.
- **+ Add** in every page header (a menu: Transaction · Account · Asset, each `aria-disabled` with a Soon tag; not built). The **bell** moved into the sidebar's head beside the collapse toggle (its list opens beside the sidebar); at xs, where the sidebar is the tab bar, the header keeps its own bell (`.xs-only`).
- **Profile foot** at the bottom of the sidebar: avatar HA + Pham Thu Ha; its menu (Settings · Users, Soon) floats above it (`position: fixed`, js/shell.js places it, because the sidebar clips its overflow). The rail shows only the avatar.
- **xs header** fits four round buttons: 34px circles, an 8px gap, and the Coming soon tag shortens to Soon (`OG.soonTag(text, short)`).

**19 Oct, round 5 (Nhi).** New app icon (her coral-and-blue mark, `img/logo.png`, 256px). The hero-more links get a dashed underline (solid on hover). Nav icons that say what the page is: Cash flow `arrow-down-up` (money in and out, key `cashflow`), Invest `chart-line`, Forecast `telescope`. Cash flow's Net line in `--net-line` (the chart brown in terracotta, `--ink` elsewhere).
- **Ask AI opens with money rain** (19 Oct, Nhi; replaced the halo, which went through four shapes the same day and was dropped): core's `go()` calls `view.shown?.()`, and Ask AI's runs `OG.cat.rain()` (the cat's click rain: ₫ notes and coins, fixed, no clicks, gone in ~3.5s; a few fading notes with reduced motion). Not while a thread is open.

**19 Oct, round 4 (Nhi): progressive disclosure on Forecast.** What drives it and Highs and lows are no longer cards: each is an inline terracotta text button at the end of its hero's line (`.btn.link.hero-more`, the trace accent) that opens the same content in the hover card (`data-hc="fc-drivers"` / `"fc-swing"`; hover opens, a click pins). The rails are now What if → Worth knowing and Cash ahead → Coming in and out. Worth knowing's pace note pins the drivers card. New app icon `img/logo.png` (Nhi's 200px mark).

**19 Oct, review round 3 (Nhi, 14 screenshots).**
- **Signed lines:** `--line-up` (mint `#239683`) / `--line-down` (terracotta). Invest › Return's line is mint at or above 0% and terracotta under it (`OG.area(…, { signed: true })`: a vertical gradient over the line's own box with a hard stop at 0; ECharts' visualMap broke the end-dot markPoint). Forecast's what-if line is mint when saving more, terracotta when less.
- **Invest:** You vs the VN-Index has no knobs, 12px bars in `--race-you` (a lighter brown) and `--race-ix`; What moved it sits on `--tint` (dates in `--ink-2` for 4.5:1); Holdings' reconcile ends "✓ Matches Investments on Home · See it" instead of "The same as Home › Investments".
- **Forecast › Net worth:** the progress strip lives in the ₫1B star's hover card (`data-hc="fc-goal"`, focusable). What if: the value badge under the label, Reset in the card head (`actions`), the focus a soft halo in the thumb's colour (no ring round the track); the output is two figures side by side (as now → what if) plus the difference and how many months sooner or later the next ₫1B comes, no bars.
- **Worth knowing** (every page): the sentence 13px, the rule 12px.
- **Next 30 days:** Highs and lows tells the month in date order: four tiles (Today, Lowest, Peak, In 30 days) and between each pair a leg with the change and what mostly moves it (the biggest movement in between, else Everyday spending); stacked under 600px. Going out paints MAX VIB in `--card-vib` = yellow (Credit's chart too).
- **Your accounts** hover card: at least 320px, balances in medium weight.

**19 Oct (Nhi): Ask AI is coming soon.** Typed questions aren't live, and the page says so in four places:
- a **Coming soon** tag beside the title (`OG.soonTag()`, `.soon-tag` in beige / grey, `--soon-bg / -ink` = `--fill-subtle` / `--ink-2`; `frame()` adds it for a view with `soon: true`) and a **Soon** tag on the sidebar entry (hidden in the icon rail);
- the composer is **switched off** (`OG.composer({ off: true })`: the box and send are disabled, text never enables send, a tinted fill) with the placeholder "Typing your own questions is coming soon"; the "Your data · as of" scope pill is gone (`scope` is now optional);
- one quiet line under it: "Ask AI isn't live yet. For a preview, pick a question below: it answers from your governed numbers." It hides once there is a thread.
- The page itself fades from `--page` at the top to `--surface` (white) at the bottom, fixed to the viewport (`main#views:has(> .view[data-anfra-container=ask]:not([hidden]))`); the docked composer's fade ends in `--surface` to match.
- The nudges still answer (governed templates), so the page keeps its preview. At xs, New chat turns icon-only so the tag fits the header.

**19 Oct (Nhi): two rows of nudges and a cat.**
- **Five nudges on the first screen:** `home: false` keeps net worth, recurring and savings off it. They still answer typed questions and appear in follow-ups and the fallback's chips.
- **The cat** (`js/cat.js`) sleeps above the greeting (`#ask-cat`, a button). It is an inline SVG redrawn from Nhi's reference in its own colours, `--mascot-ink / -fill / -blush` (black, white, grey; no theme overrides them). A v3 "mochi" rig with 7 morphing poses was tried the same day; Nhi went back to this one.
  - Each part is a group (`c-torso` = body + tail + paw, `c-head`, `c-eye-r .shut / .open`, `c-z`), so each moves on its own. The body, tail and paw breathe and stretch as one, so their seams never open. The tail is built from points (`tail(deg)` in `js/cat.js`): on waking only its tip swishes, by bending the path, while the root stays tucked in.
  - **The head** (19 Oct, Nhi: "more round, cute, chubby") is drawn upright around (0, 0) and tilted onto the body (`translate(51 59) rotate(-22)`): cheeks wider than the brow, soft short ears, eyes low and wide apart, bigger blush. The open eye blinks about its own centre (`transform-box: fill-box`).
  - **Asleep:** the body breathes (3.6s) and the z's drift up.
  - **Awake** (`.awake`, set by hover or focus): the head lifts and tilts at the neck on a spring, the body stretches a touch, the tail's tip swishes twice, the right eye opens and blinks once, and a bubble pops with "What's up?" (then "Mrrp?", "Need a hand?").
  - **Click:** the bubble says "Make it rain!" (then "Cha-ching!", "Payday vibes") and ₫ notes and coins rain over the page (`.money-rain`, fixed, `pointer-events: none`, at most 60 pieces, gone in about 3.5s; `--mascot-bill / -coin`).
  - Leaving or blurring puts it back to sleep. Reduced motion keeps only the eye swap and the bubble, and a few notes fade in around the cat instead of falling. The cat hides once there is a thread.

## Breakpoints (frame widths)

The app runs inside Anfra's frame, about 265px narrower than the browser window.

| Name | Frame | Typical window | Shell | Grid |
|---|---|---|---|---|
| xl | ≥ 1280 | 1600 | sidebar `--nav-w-xl` | 8 / 4, gap 20, pad 32 |
| lg | 1024–1279 | 1440 laptop | sidebar `--nav-w-lg` | 8 / 4, gap 16, pad 24 |
| md | 900–1023 | 1280 laptop | icon rail `--nav-rail-w` | 8 / 4 |
| sm | 600–899 | tablet | icon rail | one column; the rail's cards side by side (one card = full width) |
| xs | < 600 | phone | bottom tab bar + More sheet (Accounts, Definitions, Design) | one column, card pad 16, full-width tabs and ranges, the panel a full-screen sheet |

- **Only `max-width`:** range-syntax media queries (`width < 1024`) don't match inside the frame in this Chromium build. The four widths are the only ones `ds-lint.sh` allows.
- **Tokens:** layout tokens are suffixed sources (`--gap-xl / -lg / -sm`, `--page-pad-x-*`, `--nav-w-*`, `--card-pad-*`, `--chart-h-*`, `--head-h-*`). `ds/layout.css` points the live names (`--gap`, …) at them per breakpoint, so a panel edit never breaks a breakpoint.
- **Folding by content width:** the grid also folds when the page itself is squeezed (`@container views (max-width: 719px)`: the design panel pushes it at xl). Cards reflow inside with container queries: the balance sheet drops the sparkline under 520px and moves the change under the balance under 400px; holdings stack under 420px.

## Design system

- **Edit:** `ds/tokens.css` ★ (values), `ds/themes.css` (mouka / calm / dark / contrast), `ds/components.css` +
  `js/ds/components.js` (components), `js/pages.js` ★ (which card goes where), `ds/layout.css` (shell, grid, breakpoints).
- **The panel** (Design in the sidebar, More on phones, or `\`):
  - **Undo / redo / history** (`js/ds/history.js`). Every committed edit is a labelled snapshot (theme + every override): a slider release is one step, so is a colour, a font, a theme, a revert, Reset or a preset. Use ↶ ↷, ⌘Z / ⇧⌘Z / ⌘Y, or jump in History.
  - **Revert one token:** the dot on a changed token reverts that token only, and the revert is itself a step.
  - **Saved looks:** name the look and Save. `scripts/ds_save.py` (stdlib, 127.0.0.1:7879) writes it to `ds/presets.js`, which is committed and read-only at runtime. Update overwrites the active look; Delete takes two clicks. With the helper down, the look is kept for the session. Saved looks also show on the gallery page (`/apps/mouka/ds` › Saved looks) with an Apply button.
  - **Export CSS** gives the block to paste into `ds/tokens.css` / `ds/themes.css`. That is how a saved look becomes the shipped default.
- **Sandbox facts** (Anfra frame = `srcdoc` + `sandbox="allow-scripts"`):
  - There's no storage, clipboard, `confirm()` or form submission.
  - `fetch` to localhost works (no CSP).
  - `anfra serve` does not live-reload on a JS write. `DS_LAST_SAVED` re-applies a just-saved look if it ever does.
- **Before recording:** `<html data-ds-tools="off">` in `app.html` hides the Design entry and the `\` key.

## Files

- `app.html`: the shell (sidebar, tab bar, More sheet).
- `js/shell.js`: the sheet behaviour.
- `js/origin.js`: data-aware builders (frame, charts, hover cards, freshness).
- `js/shared.js`: shared queries and the vocabulary (ranges, tones, the accounts-with-1M-change queries).
- `js/views/home_networth.js`, `home_spending.js`, `home_invest.js`: the tabs.
- `js/views/inv_shared.js`, `inv_performance.js`, `inv_holdings.js` + `css/invest.css`: Invest.
- `js/views/fc_networth.js`, `fc_cash.js` + `css/forecast.css`: Forecast.
- `defs.js`: Definitions.
- `css/home.css`: page-only rules.
- `css/defs.css`: Definitions.
