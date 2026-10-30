// node drive.mjs URL OUT_PREFIX STEPS_JSON
// Steps run inside the app frame (the frame where window.WF exists):
//   {"media": {reducedMotion}} | {"wait": ms} | {"click": "css"} | {"eval": "js expression, may be async"} | {"shot": "name"} | {"waitFor": "js predicate"}
import { chromium } from 'playwright-core';
const [url, out, stepsJson = '[]'] = process.argv.slice(2);
const exe = process.env.CHROME ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1780, height: 980 }, acceptDownloads: true });
page.on('download', async (d) => { const to = `${out}-download-${d.suggestedFilename()}`; await d.saveAs(to); logs.push(`[download] ${to}`); });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 600)));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
await page.goto(url, { waitUntil: 'load' });
const appFrame = async () => {
  for (let i = 0; i < 100; i++) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!window.WF?.app)) return f; } catch {} }
    await page.waitForTimeout(200);
  }
  console.log('FRAMES', page.frames().map((x) => x.url())); logs.forEach((l) => console.log(l)); await page.screenshot({ path: out + '-fail.png' }); throw new Error('app frame with WF not found');
};
let f = await appFrame();
const results = [];
let failed = 0;
const allow = [];
for (const s of JSON.parse(stepsJson)) {
 try {
  if (s.allow) allow.push(new RegExp(s.allow));
  if (s.viewport) await page.setViewportSize({ width: s.viewport[0], height: s.viewport[1] });
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.waitFor) { const t0 = Date.now(); let ok = false; while (!(ok = await f.evaluate(`(${s.waitFor})()`).catch(() => false)) && Date.now() - t0 < 60000) await page.waitForTimeout(250); results.push(`waitFor ${Date.now() - t0}ms${ok ? '' : ' TIMEOUT'}`); if (!ok) throw new Error('waitFor timed out: ' + s.waitFor.slice(0, 100)); }
  if (s.click) await f.click(s.click, { timeout: 10000 });
  if (s.pageClick) await page.click(s.pageClick, { timeout: 10000 });
  if (s.pageEval) { try { results.push(JSON.stringify(await page.evaluate(`(${s.pageEval})()`))); } catch (e) { results.push('pageEval error: ' + e.message); } }
  if (s.hover) await f.hover(s.hover, { timeout: 10000 });
  if (s.press) await page.keyboard.press(s.press);
  if (s.mouse) await page.mouse.move(s.mouse[0], s.mouse[1]);
  if (s.media) await page.emulateMedia(s.media);   // e.g. {"media": {"reducedMotion": "reduce"}}
  if (s.eval) { try { results.push(JSON.stringify(await f.evaluate(`(${s.eval})()`))); } catch (e) { results.push("eval error: " + e.message); } }
  if (s.assert) { let ok = false; try { ok = await f.evaluate(`(${s.assert})()`); } catch (e) { results.push('assert error: ' + e.message); } results.push(`${ok ? 'PASS' : 'FAIL'}  ${s.name ?? s.assert.slice(0, 90)}`); if (!ok) failed++; }
  if (s.shot) await page.screenshot({ path: `${out}-${s.shot}.png` });
 } catch (e) { results.push(`STEP ERROR at ${JSON.stringify(s).slice(0, 120)}: ${e.message.split('\n')[0]}`); failed++; break; }
}
await page.screenshot({ path: `${out}.png` });
console.log('--- results'); results.forEach((r) => console.log(String(r).slice(0, 3000)));
console.log('--- console'); logs.forEach((l) => console.log(l));
await browser.close();
const errs = logs.filter((l) => /^\[(error|pageerror|http)/.test(l) && !/favicon/.test(l) && !allow.some((r) => r.test(l)));
console.log(`--- ${failed ? 'FAIL' : 'PASS'}: ${failed} failed assertion(s), ${errs.length} console error(s)`);
process.exit(failed || errs.length ? 1 : 0);
