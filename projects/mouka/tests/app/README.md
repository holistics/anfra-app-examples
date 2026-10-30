# App checks

Headless browser checks for `apps/mouka` (the default `APP_URL`), run against a live `anfra serve` (http://127.0.0.1:7878).
Each `*.json` is a list of steps that run inside the app frame (`window.WF`); `drive.mjs` exits 1 on a
failed assertion or a console error.

```sh
cd tests/app && npm install          # playwright-core only; it drives the Chromium Playwright already cached
./gate.sh m1 m1-ds ask sp inv fc     # restart anfra serve before a run
```


| File | View or concern |
|---|---|
| m1 | **mouka, the official app** (default `APP_URL`): Home's three tabs, cross-card agreement (the identity, sides = net worth, categories = the spend hero, invested hero = the balance sheet's Investments row), the card-head rules, one range set, the 12-column grid lines, and the five breakpoints (1600 / 1440 / 1280 / 1100 / 390 windows: sidebar → icon rail → bottom bar + More sheet, no overflow) |
| m1-ds | **mouka's design panel**: a slider drag = one step, undo / redo (buttons and ⌘Z / ⇧⌘Z), revert one token, History jumps, Reset undoable, Save with the helper down (session look), Update offer, apply, two-click delete, charts repaint |
| m1-save | **saving to ds/presets.js**: needs `python3 -I scripts/ds_save.py` running; Save, Update and Delete round-trip through the helper |
| a11y | **`node a11y.mjs`** (`THEME=dark\|calm\|contrast` for the other presets): every visible text node at WCAG AA, icon-only controls at 3:1 with an accessible name, one display number per tab, no bold sans, card titles = h2 at the heading size; Home's three tabs at 1600 and 390px |
| sp | **Spending** (`./gate.sh sp`), four tabs since 18 Oct: Cash flow first (net = income − spending = the bars, the sankey balances, This period's Income and Spending sides add up, month drill) · Transactions (hero = categories = accounts, date range picker + calendar, filters, % switch, transfers as from → to, drills, `OG.openTx`) · Recurring (hero = bills due ≤ 30 days, commitments folded in the rail and adding up, calendar, series drill) · Credit (hero = statement + VIB owed, statements Paid in full, cycles); the nav remembers the tab; xs: tabs fit, no overflow |
| ask | **Ask AI** (`./gate.sh ask`): empty state, routing (EN + VN), every use case answers with traced numbers + a source line, spending / net worth / MAX VIB answers = Home's numbers, the report adds up, fallback, New chat, xs tab bar + docked composer |
| m1-gal | **mouka's gallery** (`APP_URL=…/apps/mouka/ds ./gate.sh m1-gal`): Saved looks, Breakpoints, Page config; a saved look appears on the page and Apply restores it |


The pinned numbers are for a build with `--end 2026-10-14`; rebuilding to another day changes them.
`drive.mjs` points at Playwright's cached Chromium (`~/Library/Caches/ms-playwright/chromium-1223`).

`./ds-lint.sh [app]` fails on any literal colour in apps/<app> (default `mouka`) outside `ds/tokens.css` + `ds/themes.css`. `node ds-snap.mjs URL out.json` snapshots every view's DOM, computed styles and ECharts options; `node ds-snap.mjs --diff before.json after.json` proves a refactor changed nothing (`LOOSE_WS=1 LOOSE_FONTS=1` ignore inter-tag whitespace and font-stack tails).
