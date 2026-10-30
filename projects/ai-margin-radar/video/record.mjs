// Records the demo take of AI Margin Radar at 1920x1080 from Chrome's screencast frames.
//
//   node video/record.mjs [outDir]
//
// Needs `anfra serve` on 127.0.0.1:7878 and, for the copilot scene, the AI proxy on 7879.
// Writes <outDir>/take.mp4, <outDir>/marks.json (scene timestamps) and <outDir>/log.json
// (the numbers on screen at each step, used to write the voice-over).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT = path.resolve(process.argv[2] || path.join(import.meta.dirname, 'raw'));
const FRAMES = path.join(OUT, 'frames');
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const URL = 'http://127.0.0.1:7878/apps/ai-margin-radar';
const COPILOT_ASK = 'Tune the rules to get gross margin back above 75% with the fewest customers capped, and apply the best option';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
// 1440x810 CSS pixels at 4/3 scale: a 1920x1080 picture with a UI large enough to read in a video.
const context = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, colorScheme: 'light' });
const page = await context.newPage();
await page.goto(URL);

// Shell: hide the sidebar so the app gets the full width.
await page.getByRole('button', { name: 'Hide sidebar' }).click();

// Find the app frame and wait for its data.
let app;
for (let i = 0; i < 100 && !app; i++) {
  for (const f of page.frames()) if (await f.$('#ai-fab').catch(() => null)) app = f;
  if (!app) await sleep(200);
}
if (!app) throw new Error('app frame not found');
await app.waitForFunction(() => document.querySelector('#k-revenue')?.textContent?.startsWith('$') && document.querySelectorAll('#losers-body tr').length > 5 && document.querySelector('#o-past')?.textContent !== 'Loading…', null, { timeout: 120000 });
await sleep(1500);

// A visible cursor with a click ripple, drawn in both the shell and the app frame.
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
  addEventListener('mousedown', (e) => {
    const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
  }, true);
};
await page.evaluate(CURSOR_JS);
await app.evaluate(CURSOR_JS);
await app.evaluate(() => window.scrollTo(0, 0));

// ---------------------------------------------------------------- capture
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
const marks = [];
const log = [];
const mark = (name) => { marks.push({ name, t: +(Date.now() / 1000 - t0).toFixed(3) }); console.log(`[${marks.at(-1).t}s] ${name}`); };

// ---------------------------------------------------------------- input helpers
let cur = { x: 1100, y: 450 };
async function moveTo (x, y, ms = 700) {
  const from = { ...cur }, steps = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    await sleep(16);
  }
  cur = { x, y };
}
async function click (x, y, ms) { await moveTo(x, y, ms); await sleep(180); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(250); }
async function center (sel, frame = app) { const b = await frame.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; }
async function scrollTo (sel, offset = 80, ms = 1100) {
  await app.evaluate(async ({ sel, offset, ms }) => {
    const el = document.querySelector(sel);
    const start = window.scrollY, end = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
    const t = performance.now();
    await new Promise((res) => { const step = (now) => { const p = Math.min(1, (now - t) / ms); const k = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; window.scrollTo(0, start + (end - start) * k); p < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  }, { sel, offset, ms });
  await sleep(250);
}
async function iframeBox () { return page.locator('iframe').first().boundingBox(); }
// Page coords of an ECharts item: bar rect center, or scatter point.
async function chartItem (chartId, seriesIndex, pickJs) {
  const fb = await iframeBox();
  const p = await app.evaluate(({ chartId, seriesIndex, pickJs }) => {
    const el = document.getElementById(chartId);
    const chart = echarts.getInstanceByDom(el);
    const data = chart.getModel().getSeriesByIndex(seriesIndex).getData();
    const idx = new Function('opt', pickJs)(chart.getOption());
    const l = data.getItemLayout(idx);
    const r = el.getBoundingClientRect();
    return Array.isArray(l) ? { x: r.left + l[0], y: r.top + l[1] } : { x: r.left + l.x + l.width / 2, y: r.top + l.y + l.height / 2 };
  }, { chartId, seriesIndex, pickJs });
  return { x: fb.x + p.x, y: fb.y + p.y };
}
// Drag a range input's thumb to a value.
async function dragRange (id, value, ms = 1200) {
  const info = await app.evaluate(({ id }) => { const el = document.getElementById(id); return { min: +el.min, max: +el.max, value: +el.value }; }, { id });
  const { b } = await center(`#${id}`);
  const xFor = (v) => b.x + 8 + ((v - info.min) / (info.max - info.min)) * (b.width - 16);
  const y = b.y + b.height / 2;
  await moveTo(xFor(info.value), y, 650);
  await sleep(150);
  await page.mouse.down();
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) { const k = ease(i / steps); await page.mouse.move(xFor(info.value) + (xFor(value) - xFor(info.value)) * k, y); await sleep(16); }
  cur = { x: xFor(value), y };
  await page.mouse.up();
  const got = await app.evaluate(({ id, value }) => { const el = document.getElementById(id); if (+el.value !== value) { el.value = value; el.dispatchEvent(new Event('input')); } return +el.value; }, { id, value });
  await sleep(300);
  return got;
}
const read = (ids) => app.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, document.getElementById(id)?.textContent?.trim()])), ids);
const KPI_IDS = ['k-revenue', 'd-revenue', 'k-llm', 'd-llm', 'k-margin', 'd-margin', 'k-unprof', 'd-unprof', 'k-lost', 'd-lost'];
const OUT_IDS = ['o-gain', 'o-gain-sub', 'o-past', 'o-past-sub', 'o-margin-pct', 'o-unprof', 'o-capped', 'o-overage', 'effect-summary', 'v-cap-pro', 'v-cap-team', 'v-power', 'v-uptake', 'v-route', 'v-growth'];

// ---------------------------------------------------------------- the take
try {
  // 1. Hook: the dashboard, the red numbers.
  mark('hook');
  await sleep(1200);
  let c = await center('[data-anfra-block="kpi-unprofitable"]');
  await moveTo(c.x + 40, c.y + 10, 1200);
  await sleep(1400);
  c = await center('[data-anfra-block="kpi-lost"]');
  await moveTo(c.x + 30, c.y + 10, 700);
  await sleep(1400);
  log.push({ step: 'hook', ...(await read(KPI_IDS)) });

  // 2. Why: margin falls after Agent mode. Click June.
  mark('trend');
  c = await center('[data-anfra-block="kpi-margin"]');
  await moveTo(c.x, c.y, 800);
  await sleep(900);
  const juneIdx = 'const d = opt.xAxis[0].data; return d.indexOf("Jun 2026");';
  let p = await chartItem('trend-chart', 0, juneIdx);
  await moveTo(p.x, p.y, 1100);
  await sleep(1500);
  mark('june-click');
  await click(p.x, p.y, 200);
  await app.waitForFunction(() => document.getElementById('month-select').value === '2026-06');
  await sleep(2600);
  log.push({ step: 'june', ...(await read(KPI_IDS)) });
  c = await center('#feature-chart');
  await moveTo(c.x + 80, c.y + 40, 900);
  await sleep(2400);
  // back to September
  p = await chartItem('trend-chart', 0, 'const d = opt.xAxis[0].data; return d.indexOf("Sep 2026");');
  mark('sep-click');
  await click(p.x, p.y, 1000);
  await app.waitForFunction(() => document.getElementById('month-select').value === '2026-09');
  await sleep(1800);

  // 3. Who: the dots, then Noah.
  mark('strip');
  await scrollTo('[data-anfra-block="strip"]', 24, 1300);
  await sleep(1200);
  p = await chartItem('strip-chart', 0, 'return opt.series[0].data.findIndex((d) => d.row && d.row.id === "1099");');
  await moveTo(p.x, p.y, 1400);
  await sleep(1800);
  mark('noah-click');
  await click(p.x, p.y, 150);
  await sleep(800);
  await scrollTo('[data-anfra-block="losers"]', 24, 1300);
  await app.waitForFunction(() => document.getElementById('detail-title').textContent.includes('Noah'));
  await sleep(1000);
  c = await center('#detail-chart');
  await moveTo(c.x, c.y - 20, 1000);
  await sleep(2600);
  log.push({ step: 'noah', detail: (await app.locator('#detail-head').innerText()).replace(/\s+/g, ' ') });

  // 4. Trust: Inspect shows the AQL and SQL behind the numbers.
  mark('trust');
  await scrollTo('main', 0, 1000);
  await sleep(500);
  const ib = await page.getByRole('button', { name: 'Inspect Data App' }).boundingBox();
  await click(ib.x + ib.width / 2, ib.y + ib.height / 2, 1100);
  await sleep(900);
  const tab = await page.getByRole('tab', { name: 'Data' }).boundingBox();
  await click(tab.x + tab.width / 2, tab.y + tab.height / 2, 800);
  await sleep(1200);
  const aql = await page.getByText('Executed AQL').first().boundingBox();
  await moveTo(aql.x + 120, aql.y + 120, 900);
  await sleep(2600);
  await page.mouse.wheel(0, 320);
  await sleep(2200);
  const close = await page.getByRole('button', { name: 'Close inspect panel' }).boundingBox();
  mark('trust-close');
  await click(close.x + close.width / 2, close.y + close.height / 2, 900);
  await sleep(800);

  // 5. Decide: change the rules by hand.
  mark('whatif');
  await scrollTo('[data-anfra-block="whatif"]', 16, 1400);
  await sleep(1000);
  log.push({ step: 'whatif-start', ...(await read(OUT_IDS)) });
  await dragRange('cap-team', 120, 1300);
  await sleep(1600);
  log.push({ step: 'cap-team', ...(await read(OUT_IDS)) });
  await dragRange('power-price', 1, 1000);
  await sleep(1400);
  log.push({ step: 'overage', ...(await read(OUT_IDS)) });
  await dragRange('route', 50, 1000);
  await sleep(1800);
  log.push({ step: 'route', ...(await read(OUT_IDS)) });
  c = await center('#o-past');
  await moveTo(c.x, c.y, 900);
  mark('since-start');
  await sleep(2400);
  await scrollTo('.effect', 16, 1300);
  await sleep(1000);
  c = await center('#effect-chart');
  await moveTo(c.x + 200, c.y - 80, 900);
  await sleep(2600);
  log.push({ step: 'effect', ...(await read(OUT_IDS)) });

  // 6. Wow: ask the copilot. Start from today's rules so its changes are visible.
  await app.evaluate(() => { overrides.clear(); writeRules(normalizeRules({ pro_agent_run_cap: null, team_agent_run_cap: null, route_chat_to_mini_pct: 0, overage_price_per_run_usd: 0, overage_uptake_pct: 50 })); });
  await scrollTo('[data-anfra-block="whatif"]', 16, 10);
  await sleep(600);
  mark('copilot');
  c = await center('#ai-fab');
  await click(c.x, c.y, 1100);
  await sleep(900);
  c = await center('#ai-text');
  await click(c.x, c.y, 700);
  mark('copilot-typing');
  await app.locator('#ai-text').pressSequentially(COPILOT_ASK, { delay: 38 });
  await sleep(500);
  c = await center('#ai-send');
  mark('copilot-send');
  await click(c.x, c.y, 500);
  await moveTo(c.x - 700, c.y - 300, 1200); // move out of the way
  await app.waitForFunction(() => document.querySelector('#ai-log .msg.bot, #ai-log .msg.err'), null, { timeout: 180000, polling: 250 });
  mark('copilot-answer');
  await sleep(1200);
  c = await center('#ai-log .msg.bot');
  await moveTo(c.x - 60, c.b.y + 30, 900);
  await sleep(5000);
  log.push({ step: 'copilot', acts: await app.locator('#ai-log .act').allInnerTexts(), answer: await app.locator('#ai-log .msg.bot, #ai-log .msg.err').first().innerText(), ...(await read(OUT_IDS)) });
  c = await center('#ai-close');
  mark('copilot-close');
  await click(c.x, c.y, 900);
  await sleep(600);
  c = await center('#forecast-chart');
  await moveTo(c.x + 150, c.y, 900);
  await sleep(3000);
  await scrollTo('.effect', 16, 1300);
  await sleep(3500);
  mark('end');
  log.push({ step: 'final', ...(await read(OUT_IDS)) });
} finally {
  await cdp.send('Page.stopScreencast').catch(() => {});
  await sleep(300);
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(marks, null, 2));
  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 2));
  await browser.close();
}

// ---------------------------------------------------------------- encode at constant 30 fps
const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, ((frames[i + 1]?.ts ?? f.ts + 1 / 30) - f.ts)).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
fs.writeFileSync(path.join(OUT, 'frames.txt'), list);
// The video starts at the first frame; shift marks so they line up with it.
const shift = frames[0].ts - t0;
fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(marks.map((m) => ({ ...m, t: +(m.t - shift).toFixed(3) })), null, 2));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'scale=1920:1080:flags=lanczos,fps=30', '-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', '16', '-b:v', '0', '-profile:v', 'high', '-g', '15', '-bf', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'take.mp4')], { stdio: 'inherit' });
console.log(`frames: ${frames.length}, take: ${path.join(OUT, 'take.mp4')}`);
