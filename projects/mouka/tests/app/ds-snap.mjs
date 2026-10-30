// node ds-snap.mjs URL OUT.json [theme]
// Snapshot every view of an mouka app: DOM (canvases stripped), the computed style of every element, and every
// ECharts option. Two snapshots of the same data diff to zero when a refactor changes no pixel-relevant value.
//   node ds-snap.mjs http://127.0.0.1:7878/apps/mouka/app /tmp/before.json
//   node ds-snap.mjs … /tmp/after.json && node ds-snap.mjs --diff /tmp/before.json /tmp/after.json
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

if (process.argv[2] === '--diff') {
  // #fff and #ffffff are the same colour: normalise hex case and length before comparing chart options
  const norm = (t) => t.replace(/#([0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (_, h) => '#' + [...h].map((c) => c + c).join('')).replace(/#[0-9a-fA-F]{6}\b/g, (h) => h.toLowerCase());
  // LOOSE_FONTS=1: a font stack compares by its first family (Inter, 'Helvetica Neue', … ≡ Inter, sans-serif when Inter loads)
  const fonts = (t) => (process.env.LOOSE_FONTS ? t.replace(/"fontFamily":"([^"]*)"/g, (_, f) => `"fontFamily":"${f.split(',')[0].replace(/'/g, '').trim()}"`) : t);
  const [a, b] = process.argv.slice(3).map((p) => JSON.parse(fonts(norm(readFileSync(p, 'utf8')))));
  // LOOSE_WS=1: whitespace between tags doesn't matter (grids and flex ignore it)
  if (process.env.LOOSE_WS) for (const s of [a, b]) for (const v of Object.values(s)) v.html = v.html.replace(/>\s+</g, '><');
  let n = 0;
  const say = (s) => { if (n++ < 60) console.log(s); };
  for (const v of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[v], y = b[v];
    if (!x || !y) { say(`${v}: only in ${x ? 'before' : 'after'}`); continue; }
    if (x.html !== y.html) {
      let i = 0; while (x.html[i] === y.html[i]) i++;
      say(`${v}: html differs at ${i}\n  before …${x.html.slice(Math.max(0, i - 80), i + 120)}\n  after  …${y.html.slice(Math.max(0, i - 80), i + 120)}`);
    }
    const ks = new Set([...Object.keys(x.style), ...Object.keys(y.style)]);
    for (const k of ks) {
      const s = x.style[k], t = y.style[k];
      if (!s || !t) { say(`${v}: element ${k} only in ${s ? 'before' : 'after'}`); continue; }
      for (const p of Object.keys(s)) if (s[p] !== t[p]) say(`${v}: ${k} ${p}: ${s[p]} → ${t[p]}`);
    }
    if (JSON.stringify(x.charts) !== JSON.stringify(y.charts)) {
      for (const id of new Set([...Object.keys(x.charts), ...Object.keys(y.charts)])) {
        const p = JSON.stringify(x.charts[id]), q = JSON.stringify(y.charts[id]);
        if (p !== q) { let i = 0; while (p?.[i] === q?.[i]) i++; say(`${v}: chart ${id} differs at ${i}\n  before …${p?.slice(Math.max(0, i - 80), i + 120)}\n  after  …${q?.slice(Math.max(0, i - 80), i + 120)}`); }
      }
    }
  }
  console.log(n ? `--- DIFF: ${n} difference(s)` : '--- IDENTICAL');
  process.exit(n ? 1 : 0);
}

const [url, out, theme] = process.argv.slice(2);
const exe = process.env.CHROME ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
let f;
for (let i = 0; i < 100 && !f; i++) {
  for (const fr of page.frames()) { try { if (await fr.evaluate(() => !!window.WF?.app && !!WF.current)) f = fr; } catch {} }
  if (!f) await page.waitForTimeout(200);
}
if (!f) throw new Error('app frame not found');
const snap = await f.evaluate(async (theme) => {
  const idle = async () => { for (let i = 0; i < 300; i++) { await new Promise((r) => setTimeout(r, 100)); if ([...WF.registry.values()].every((r) => r.query.state !== 'executing')) return; } };
  if (theme) (window.DS?.apply ? DS.apply(theme) : document.documentElement.setAttribute('data-theme', theme));
  const PROPS = ['display', 'position', 'width', 'height', 'color', 'background-color', 'background-image', 'border-top', 'border-right',
    'border-bottom', 'border-left', 'border-radius', 'box-shadow', 'font-family', 'font-size', 'font-weight', 'line-height',
    'letter-spacing', 'text-transform', 'padding', 'margin', 'gap', 'grid-template-columns', 'opacity', 'filter', 'fill', 'stroke',
    'outline', 'transition', 'animation-name', 'animation-duration', 'white-space'];
  const out = {};
  const key = (el, root) => { const path = []; for (let e = el; e && e !== root; e = e.parentElement) path.unshift(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}:${[...e.parentElement.children].indexOf(e)}`); return path.join('>'); };
  const styleOf = (root) => { const s = {}; for (const el of [root, ...root.querySelectorAll('*')]) { if (el.closest('canvas')) continue; const c = getComputedStyle(el); s[key(el, root) || 'root'] = Object.fromEntries(PROPS.map((p) => [p, c.getPropertyValue(p)])); } return s; };
  const charts = (root) => { const o = {}; for (const el of root.querySelectorAll('[_echarts_instance_]')) { const inst = echarts.getInstanceByDom(el); if (inst) o[el.id || key(el, root)] = JSON.parse(JSON.stringify(inst.getOption(), (k, v) => (typeof v === 'function' ? 'fn' : v))); } return o; };
  const html = (root) => { const c = root.cloneNode(true); c.querySelectorAll('canvas').forEach((x) => x.remove()); c.querySelectorAll('[_echarts_instance_]').forEach((x) => { x.removeAttribute('_echarts_instance_'); x.innerHTML = ''; }); return c.outerHTML.replace(/\s+/g, ' '); };
  for (const id of WF.views.keys()) { WF.go(id); await idle(); await idle(); }
  for (const id of WF.views.keys()) {
    WF.go(id); await idle(); await new Promise((r) => setTimeout(r, 900));
    const v = WF.views.get(id).el;
    out[id] = { html: html(v), style: styleOf(v), charts: charts(v) };
  }
  // overlays live outside #views: the first hover card of each view, a popover, a drawer, the month review, the ✦ popover
  const grab = (name, el) => { if (el) out[name] = { html: html(el), style: styleOf(el), charts: charts(el) }; };
  for (const id of WF.views.keys()) {
    WF.go(id); await idle();
    const t = WF.views.get(id).el.querySelector('[data-hc]');
    if (t && OG.hcOpen(t, { pin: true })) grab(`_hc:${id}`, document.getElementById('hc'));
    OG.hcClose();
  }
  WF.go('home'); await idle();
  const sb = document.querySelector('.sidebar');
  out._sidebar = { html: html(sb), style: styleOf(sb), charts: {} };
  OG.accountPopover(document.querySelector('#h-acc')); grab('_popover', document.querySelector('.popover')); OG.closePop();
  OG.meDrawer(); await idle(); await new Promise((r) => setTimeout(r, 300)); grab('_drawer', document.querySelector('.drawer')); grab('_scrim', document.querySelector('.scrim')); OG.closeDrawer();
  document.querySelector('#h-review-open')?.click(); await idle(); await new Promise((r) => setTimeout(r, 900)); grab('_review', document.querySelector('.drawer')); OG.closeDrawer();
  WF.tracer.explain('nw_kpi:nw', 100, 100); grab('_tracepop', document.getElementById('trace-pop'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  return out;
}, theme ?? null);
await browser.close();
writeFileSync(out, JSON.stringify(snap));
console.log(`snap: ${Object.keys(snap).length} views → ${out}; page errors: ${errs.length}`);
errs.slice(0, 5).forEach((e) => console.log('  ' + e));
process.exit(errs.length ? 1 : 0);
