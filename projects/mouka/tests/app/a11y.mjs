// node a11y.mjs [url] (THEME=dark|calm|contrast for another preset): the accessibility + type-hierarchy gate for apps/mouka's Home, Cash flow (its four tabs), Invest (Performance, Holdings), Forecast (Net worth, Next 30 days) and Ask AI (empty + one answer), at a 1600px and a
// 390px window, in the mouka theme). Needs a live `anfra serve`. Exits 1 on any failure. Checks:
//   · every visible text node meets WCAG AA contrast against its painted background (4.5:1; 3:1 for large text);
//     the .mouka wordmark is a logotype (exempt under WCAG 1.4.3)
//   · every icon-only control (✦, ⋮, segments, carets, the sidebar toggle) shows its icon at ≥ 3:1 (non-text contrast)
//   · type: one display number per tab (the page hero), no bold sans (700 is for the serif title and heroes only),
//     card titles are h2 at the card-title size
//   · every interactive element without visible text has an accessible name
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://127.0.0.1:7878/apps/mouka/app';
const exe = process.env.CHROME ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, headless: true });
let failed = 0;
const audit = () => {
  // rgb()/rgba() give 0-255 channels; color(srgb r g b [/ a]) (what color-mix() computes to) gives 0-1 channels
  const rgb = (c) => { const v = (c.match(/[\d.]+/g) ?? []).map(Number); return /^color\(srgb/.test(c) ? [...v.slice(0, 3).map((x) => x * 255), ...v.slice(3)] : v; };
  const L = (c) => { const [r, g, b] = rgb(c).slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const opaque = (c) => { const v = rgb(c); return c && !/transparent/.test(c) && (v.length < 4 || v[3] > 0.5); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (opaque(c)) return c; } return getComputedStyle(document.body).backgroundColor; };
  const shown = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (e.hidden || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; } return el.getClientRects().length > 0; };
  const scope = [document.querySelector('.view:not([hidden])'), document.querySelector('.sidebar'), document.querySelector('.tabbar')].filter((x) => x && shown(x));
  const fails = [], seen = new Set();
  for (const root of scope) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const t = w.currentNode, el = t.parentElement;
      if (!t.textContent.trim() || !shown(el) || el.closest('[aria-hidden="true"], .chart, button[disabled], .ds-panel, .brand')) continue;
      const cs = getComputedStyle(el), px = parseFloat(cs.fontSize), big = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      const r = ratio(cs.color, bgOf(el)), need = big ? 3 : 4.5;
      const key = `${cs.color}|${bgOf(el)}|${px}`;
      if (r < need && !seen.has(key)) { seen.add(key); fails.push(`text ${r.toFixed(2)}:1 < ${need} · ${px}px ${cs.color} on ${bgOf(el)} · "${t.textContent.trim().slice(0, 24)}"`); }
    }
    // icon-only controls: the icon (stroke or fill) against the control's background
    root.querySelectorAll('button, [role="separator"]').forEach((b) => {
      if (!shown(b) || b.textContent.trim() || b.disabled) return;
      const svg = b.querySelector('svg');
      if (!svg) return;
      const s = getComputedStyle(svg), col = s.fill && s.fill !== 'none' && opaque(s.fill) ? s.fill : s.stroke !== 'none' ? s.stroke : s.color;
      const r = ratio(col.startsWith('rgb') ? col : getComputedStyle(b).color, bgOf(b));
      if (r < 3) fails.push(`icon ${r.toFixed(2)}:1 < 3 · ${b.className || b.tagName} (${b.getAttribute('aria-label') ?? b.title ?? ''})`);
      if (!b.getAttribute('aria-label') && !b.title) fails.push(`no accessible name · ${b.outerHTML.slice(0, 80)}`);
    });
  }
  // type hierarchy
  const view = document.querySelector('.view:not([hidden])');
  const heroes = [...view.querySelectorAll('.hero.page')].filter(shown);
  if (heroes.length !== (view.querySelector('.ask') ? 0 : 1)) fails.push(`type: ${heroes.length} page heroes (want ${view.querySelector('.ask') ? 0 : 1})`);   // Ask AI leads with its greeting, not a number
  [...view.querySelectorAll('*')].filter((e) => shown(e) && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).forEach((e) => {
    const cs = getComputedStyle(e);
    // the delta pill may carry --fw-delta (500 since the 17 Oct pill; exempt in case the panel turns it up)
    if (Number(cs.fontWeight) >= 600 && !/Merriweather|Newsreader|serif/i.test(cs.fontFamily.split(',')[0]) && !e.closest('.dpill')) fails.push(`type: bold sans ${cs.fontWeight} · "${e.textContent.trim().slice(0, 24)}"`);
  });
  const want = getComputedStyle(document.documentElement).getPropertyValue('--fs-card-title').trim();
  view.querySelectorAll('.card-head').forEach((h) => { const t = h.querySelector('h2.card-title'); if (!t) fails.push('type: a card head without an h2 title'); else if (getComputedStyle(t).fontSize !== want) fails.push(`type: card title ${getComputedStyle(t).fontSize} (want ${want})`); });
  return [...new Set(fails)];
};
for (const [w, h] of [[1600, 1000], [390, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url, { waitUntil: 'load' });
  let f;
  for (let i = 0; i < 100 && !f; i++) { for (const fr of page.frames()) { try { if (await fr.evaluate(() => !!window.WF?.current)) f = fr; } catch {} } if (!f) await page.waitForTimeout(200); }
  if (process.env.THEME) await f.evaluate((t) => DS.theme(t), process.env.THEME);   // THEME=dark|calm|contrast node a11y.mjs
  for (const tab of ['home/networth', 'home/spending', 'home/invest', 'spending/cashflow', 'spending/transactions', 'spending/recurring', 'spending/credit', 'invest/performance', 'invest/holdings', 'forecast/networth', 'forecast/cash', 'ask', 'ask › an answer']) {
    if (tab === 'ask › an answer') {   // one answered question: the bubble, a governed answer with its figure, the docked composer
      await f.click('#ask-nudges .nudge[data-k=spend]');
      await f.waitForFunction(() => !!document.querySelector('.ask-turn.ai .ask-src'), null, { timeout: 60000, polling: 300 });
    } else await f.evaluate((t) => WF.go(t), tab);
    await f.waitForFunction(() => [...WF.registry.values()].every((r) => r.query.state !== 'executing'), null, { timeout: 60000, polling: 300 });
    await page.waitForTimeout(600);
    const out = await f.evaluate(audit);
    console.log(`${out.length ? 'FAIL' : 'PASS'}  ${w}px ${tab}${out.length ? `\n      ${out.join('\n      ')}` : ''}`);
    failed += out.length ? 1 : 0;
  }
  await page.close();
}
await browser.close();
console.log(`--- ${failed ? 'FAIL' : 'PASS'}: ${failed} view(s) with accessibility or hierarchy issues`);
process.exit(failed ? 1 : 0);
