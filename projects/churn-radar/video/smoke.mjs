// Smoke test a deployed (or locally run) Churn Radar image: queries load, copilot answers.
//   [PW=<site password>] node video/smoke.mjs <base-url> [screenshot.png]
import { chromium } from 'playwright-core';
const BASE = process.argv[2], SHOT = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
await page.goto(BASE);
if (page.url().includes('/__gate/login')) {
  if (!process.env.PW) throw new Error('site is password protected: set PW');
  await page.fill('input[name=password]', process.env.PW);
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  console.log('gate: logged in');
}
let app;
for (let i = 0; i < 150 && !app; i++) { for (const f of page.frames()) if (await f.$('#ai-fab').catch(() => null)) app = f; if (!app) await sleep(200); }
await app.waitForFunction(() => document.querySelectorAll('#risk-body tr').length > 5 && document.querySelectorAll('#risk-body svg').length > 5 && !document.getElementById('forecast-sub')?.textContent.includes('…'), null, { timeout: 120000 });
await sleep(3000);
console.log('kpis', await app.evaluate(() => ['k-margin', 'k-churn', 'k-lost', 'k-risk', 'k-net'].map((id) => document.getElementById(id)?.textContent.trim()).join(' | ')));
console.log('rows', await app.locator('#risk-body tr').count(), 'errors on page:', await app.locator('.err, .status.error').count());
await app.click('#ai-fab'); await sleep(1500);
await app.fill('#ai-text', 'Who is the riskiest customer? One line.'); await app.click('#ai-send');
await app.waitForFunction(() => document.querySelector('#ai-log .msg.bot, #ai-log .msg.err'), null, { timeout: 180000 });
console.log('copilot:', (await app.locator('#ai-log .msg.bot, #ai-log .msg.err').first().innerText()).slice(0, 200));
if (SHOT) await page.screenshot({ path: SHOT });
console.log('http errors:', bad.length ? bad : 'none');
await browser.close();
