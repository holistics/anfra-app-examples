// node shot.mjs URL out-prefix [window widths…]: screenshot the app frame at each width; prints console errors. Env: TAB=<view id> (WF.go), FULL=1 (whole page), WAIT=ms, EVAL=<js in the frame>, H=height
import { chromium } from 'playwright-core';
const [url, out, ...ws] = process.argv.slice(2);
const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const b = await chromium.launch({ executablePath: exe, headless: true });
const tab = process.env.TAB;
for (const w of (ws.length ? ws : ['1440']).map(Number)) {
  const p = await b.newPage({ viewport: { width: w, height: Number(process.env.H ?? 1000) }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto(url, { waitUntil: 'load' });
  let f;
  for (let i = 0; i < 100 && !f; i++) { for (const fr of p.frames()) { try { if (await fr.evaluate(() => !!window.WF?.current)) f = fr; } catch {} } if (!f) await p.waitForTimeout(200); }
  if (f && tab) { await f.evaluate((t) => WF.go(t), tab); }
  await p.waitForTimeout(Number(process.env.WAIT ?? 4000));
  if (f && process.env.EVAL) console.log(JSON.stringify(await f.evaluate(process.env.EVAL)));
  const frame = p.locator('iframe').first();
  const full = process.env.FULL === '1';
  if (full && f) {
    // full-height shot of the frame's document
    const hgt = await f.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: w, height: Math.min(hgt + 60, 4000) });
    await p.waitForTimeout(1200);
  }
  await frame.screenshot({ path: `${out}-${w}.png` });
  console.log(w, 'errors:', errs.length ? errs.join(' | ') : 'none');
  await p.close();
}
await b.close();
