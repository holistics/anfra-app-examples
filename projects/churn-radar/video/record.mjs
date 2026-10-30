// Records the Churn Radar demo take: 1440x810 CSS px at 4/3 scale = 1920x1080 screencast frames.
//   node video/record.mjs [outDir]
// Needs `anfra serve` on 127.0.0.1:7878 and the AI proxy on 7879 (copilot scene).
// Writes take.mp4, marks.json (scene times) and log.json (numbers on screen, for the voice-over).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT = path.resolve(process.argv[2] || path.join(import.meta.dirname, 'raw'));
const FRAMES = path.join(OUT, 'frames');
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const URL = 'http://127.0.0.1:7878/apps/churn-radar';
const ASK = 'Who should I call this week? Pick the best play for each customer, then apply and send the offers.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, colorScheme: 'light' });
const page = await context.newPage();
await page.goto(URL);
await page.getByRole('button', { name: 'Hide sidebar' }).click();
let app;
for (let i = 0; i < 100 && !app; i++) {
  for (const f of page.frames()) if (await f.$('#ai-fab').catch(() => null)) app = f;
  if (!app) await sleep(200);
}
await app.waitForFunction(() => document.querySelectorAll('#risk-body tr').length > 5 && document.querySelector('#card-title')?.textContent.includes('·') && document.querySelectorAll('#risk-body svg').length > 5, null, { timeout: 120000 });
await sleep(1500);

const CURSOR_JS = () => {
  if (document.getElementById('__cur')) return;
  const style = document.createElement('style');
  style.textContent = `
    ::-webkit-scrollbar { display: none; }
    #__cur { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 26px; height: 26px; pointer-events: none; transform: translate(-3px, -2px); opacity: 0; transition: opacity .15s; }
    #__cur svg { filter: drop-shadow(0 2px 3px rgb(0 0 0 / .35)); }
    .__rip { position: fixed; z-index: 2147483646; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; pointer-events: none;
             background: rgb(75 63 216 / .35); border: 2px solid rgb(75 63 216 / .8); animation: __rip .55s ease-out forwards; }
    @keyframes __rip { to { transform: scale(3.4); opacity: 0; } }`;
  document.head.appendChild(style);
  const cur = document.createElement('div');
  cur.id = '__cur';
  cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15.1 L18.6 15 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(cur);
  addEventListener('mousemove', (e) => { cur.style.opacity = 1; cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
  document.addEventListener('mouseleave', () => { cur.style.opacity = 0; });
  // The app lives in an iframe: the outer copy hides once the pointer goes inside it.
  addEventListener('mouseover', (e) => { if (e.target.tagName === 'IFRAME') cur.style.opacity = 0; }, true);
  addEventListener('mousedown', (e) => {
    const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
  }, true);
};
await page.evaluate(CURSOR_JS);
await app.evaluate(CURSOR_JS);
await app.evaluate(() => window.scrollTo(0, 0));

const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = path.join(FRAMES, `${String(frames.length).padStart(6, '0')}.jpg`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ file, ts: metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const t0 = Date.now() / 1000;
const marks = [], log = [];
const mark = (name) => { marks.push({ name, t: +(Date.now() / 1000 - t0).toFixed(3) }); console.log(`[${marks.at(-1).t}s] ${name}`); };

let cur = { x: 1100, y: 450 };
async function moveTo (x, y, ms = 700) {
  const from = { ...cur }, steps = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) { const k = ease(i / steps); await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k); await sleep(16); }
  cur = { x, y };
}
async function click (x, y, ms) { await moveTo(x, y, ms); await sleep(180); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(250); }
async function center (sel, frame = app) { const b = await frame.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; }
async function scrollTo (sel, offset = 16, ms = 1100) {
  await app.evaluate(async ({ sel, offset, ms }) => {
    const el = document.querySelector(sel);
    const start = window.scrollY, end = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset), t = performance.now();
    await new Promise((res) => { const step = (now) => { const p = Math.min(1, (now - t) / ms); const k = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; window.scrollTo(0, start + (end - start) * k); p < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  }, { sel, offset, ms });
  await sleep(250);
}
const read = (ids) => app.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, document.getElementById(id)?.textContent?.trim().replace(/\s+/g, ' ')])), ids);
const KPI = ['results-body', 'k-margin', 'd-margin', 'k-churn', 'd-churn', 'k-lost', 'd-lost', 'k-risk', 'd-risk', 'k-net', 'd-net', 'risk-sub'];
const PLAYS = ['o-net', 'o-net-sub', 'o-count', 'o-stake', 'o-cost'];

try {
  // 1. Hook: what changed on 1 Oct, and what it did.
  mark('hook');
  await sleep(1000);
  let c = await center('#rules-body tr:nth-child(1)');
  await moveTo(c.x, c.y, 1000);
  await sleep(1800);
  c = await center('#results-body tr:nth-child(2)');
  await moveTo(c.x + 60, c.y, 900);
  await sleep(1600);
  c = await center('#results-body tr:nth-child(3)');
  await moveTo(c.x + 60, c.y, 700);
  await sleep(1800);
  log.push({ step: 'hook', ...(await read(KPI)) });

  // 2. Why: churn bars after the rules, then savings vs losses with the crossover.
  mark('why');
  await scrollTo('[data-anfra-container="kpis"]', 16, 1200);
  c = await center('[data-anfra-block="kpi-lost"]');
  await moveTo(c.x, c.y, 800);
  await sleep(1400);
  c = await center('#trend-chart');
  await moveTo(c.x + 150, c.y, 1000);
  await sleep(2600);
  c = await center('#net-chart');
  await moveTo(c.x + 60, c.y - 60, 1100);
  await sleep(3200);
  log.push({ step: 'why', ...(await read(['k-net', 'd-net'])) });

  // 3. The Monday list, Noah's story.
  mark('list');
  await scrollTo('[data-anfra-block="risk"]', 16, 1300);
  await sleep(1000);
  c = await center('#risk-body tr:nth-child(2)');
  await moveTo(c.x - 300, c.y, 1100);
  await sleep(1600);
  mark('noah');
  await click(c.x - 420, c.y, 300);
  await sleep(700);
  await scrollTo('[data-anfra-block="card"]', 16, 1300);
  await app.waitForFunction(() => document.getElementById('card-title').textContent.includes('Noah'));
  c = await center('#card-chart');
  await moveTo(c.x + 120, c.y, 900);
  await sleep(3000);
  log.push({ step: 'noah', head: (await app.locator('#card-head').innerText()).replace(/\s+/g, ' ') });

  // 4. Trust: Inspect shows the AQL and SQL behind the list.
  mark('trust');
  await scrollTo('main', 0, 900);
  const ib = await page.getByRole('button', { name: 'Inspect Data App' }).boundingBox();
  await click(ib.x + ib.width / 2, ib.y + ib.height / 2, 1000);
  await sleep(800);
  const tab = await page.getByRole('tab', { name: 'Data' }).boundingBox();
  await click(tab.x + tab.width / 2, tab.y + tab.height / 2, 700);
  await sleep(900);
  // scroll the panel to the risk query
  const riskHead = page.getByText('risk', { exact: true }).first();
  await riskHead.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(600);
  const rb = await riskHead.boundingBox().catch(() => null);
  if (rb) await moveTo(rb.x + 140, rb.y + 160, 900);
  await sleep(2600);
  await page.mouse.wheel(0, 260);
  await sleep(2200);
  const close = await page.getByRole('button', { name: 'Close inspect panel' }).boundingBox();
  mark('trust-close');
  await click(close.x + close.width / 2, close.y + close.height / 2, 800);
  await sleep(600);

  // 5. Save plays: raising Noah's cap loses money, pay-per-run makes money, then suggest for all.
  mark('plays');
  await scrollTo('[data-anfra-block="risk"]', 16, 1100);
  const sel = 'select[data-id="1099"]';
  c = await center(sel);
  await click(c.x, c.y, 900);
  await app.selectOption(sel, 'raise');
  await sleep(400);
  await scrollTo('[data-anfra-block="plays"]', 16, 1000);
  c = await center('#o-net');
  await moveTo(c.x, c.y, 800);
  mark('raise-result');
  await sleep(2200);
  log.push({ step: 'raise', ...(await read(PLAYS)) });
  await scrollTo('[data-anfra-block="risk"]', 16, 1000);
  c = await center(sel);
  await click(c.x, c.y, 800);
  await app.selectOption(sel, 'overage');
  await sleep(400);
  await scrollTo('[data-anfra-block="plays"]', 16, 1000);
  c = await center('#o-net');
  await moveTo(c.x, c.y, 800);
  mark('overage-result');
  await sleep(2200);
  log.push({ step: 'overage', ...(await read(PLAYS)) });
  c = await center('#suggest');
  mark('suggest');
  await click(c.x, c.y, 900);
  await sleep(1800);
  log.push({ step: 'suggest', ...(await read(PLAYS)) });
  await scrollTo('[data-anfra-block="forecast"]', 16, 1200);
  c = await center('#forecast-chart');
  await moveTo(c.x + 180, c.y - 40, 900);
  mark('forecast-proposed');
  await sleep(3000);
  log.push({ step: 'forecast-proposed', sub: await app.textContent('#forecast-sub') });

  // 6. Copilot: start from no plays so it can set them.
  await app.click('#clear-plays').catch(() => {});
  await app.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  mark('copilot');
  c = await center('#ai-fab');
  await click(c.x, c.y, 1000);
  await sleep(900);
  c = await center('#ai-text');
  await click(c.x, c.y, 600);
  mark('copilot-typing');
  await app.locator('#ai-text').pressSequentially(ASK, { delay: 32 });
  await sleep(400);
  c = await center('#ai-send');
  mark('copilot-send');
  await click(c.x, c.y, 400);
  await moveTo(c.x - 260, c.y - 420, 1200);
  // The copilot tucks its panel away while it applies the plays: follow the list.
  await app.waitForFunction(() => document.getElementById('ai-panel').hidden, null, { timeout: 240000, polling: 100 });
  mark('exec-start');
  await moveTo(1120, 300, 1200);
  await app.waitForFunction(() => document.querySelectorAll('#risk-body .sent').length && !document.querySelector('#risk-body .sent.pending'), null, { timeout: 120000, polling: 100 });
  mark('exec-done');
  await sleep(1200);
  log.push({ step: 'executed', badges: await app.locator('#risk-body .sent').allInnerTexts(), fab: await app.textContent('#ai-fab') });
  await scrollTo('[data-anfra-block="forecast"]', 16, 1300);
  mark('applied');
  c = await center('#activity');
  await moveTo(c.x, c.y - 60, 900);
  await sleep(1000);
  await app.locator('#activity details').first().evaluate((d) => { d.open = true; });
  await sleep(2400);
  c = await center('#forecast-chart');
  await moveTo(c.x + 180, c.y - 40, 900);
  await sleep(2400);
  log.push({ step: 'applied', sub: await app.textContent('#forecast-sub'), activity: (await app.locator('#activity .act-item').count()) });
  // The answer waits behind the button.
  await app.waitForFunction(() => document.querySelector('#ai-log .msg.bot, #ai-log .msg.err'), null, { timeout: 240000, polling: 250 });
  await sleep(600);
  c = await center('#ai-fab');
  mark('reply');
  await click(c.x, c.y, 1000);
  await sleep(600);
  await app.evaluate(() => { const el = document.getElementById('ai-log'); el.scrollTop = el.scrollHeight; });
  mark('reply-open');
  await sleep(4500);
  log.push({ step: 'copilot', acts: await app.locator('#ai-log .act').allInnerTexts(), answer: await app.locator('#ai-log .msg.bot, #ai-log .msg.err').first().innerText(), ...(await read(PLAYS)), ...(await read(['k-net'])) });
  mark('end');
} finally {
  await cdp.send('Page.stopScreencast').catch(() => {});
  await sleep(300);
  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 2));
  await browser.close();
}

const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, ((frames[i + 1]?.ts ?? f.ts + 1 / 30) - f.ts)).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
fs.writeFileSync(path.join(OUT, 'frames.txt'), list);
const shift = frames[0].ts - t0;
fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(marks.map((m) => ({ ...m, t: +(m.t - shift).toFixed(3) })), null, 2));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'scale=1920:1080:flags=lanczos,fps=30',
  '-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', '16', '-b:v', '0', '-profile:v', 'high', '-g', '15', '-bf', '0',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'take.mp4')], { stdio: 'inherit' });
fs.rmSync(FRAMES, { recursive: true, force: true });
console.log(`frames: ${frames.length}, take: ${path.join(OUT, 'take.mp4')}`);
