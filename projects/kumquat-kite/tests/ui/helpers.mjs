import { expect } from '@playwright/test';

// Chooses a demo persona on the persona chooser: demo identity selection, with no password (the server hands out a
// session token for that persona).
export async function signIn(page, name) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: /what you need to do next/ })).toBeVisible();
}

export const panel = (page) => page.frameLocator('.panel-host iframe').first();

// Collects console errors from the page and from every panel frame.
export function watchConsole(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
// against the chart's own box, against the plot area and against every bar, using the SVG the chart drew and the
// chart's own layout. Runs in the frame that holds the chart.
export function measureChart(locator) {
  return locator.evaluate((el) => {
    const svg = el.querySelector('svg');
    const c = window.echarts?.getInstanceByDom(el);
    if (!svg || !c) return { error: 'not drawn' };
    const box = svg.getBoundingClientRect();
    const rect = (r) => ({ x: r.left, y: r.top, r: r.right, b: r.bottom });
    const texts = [...svg.querySelectorAll('text')].map((t) => ({ text: t.textContent.trim(), ...rect(t.getBoundingClientRect()) }))
      .filter((t) => t.text && t.r - t.x > 0 && t.b - t.y > 0);
    const meet = (a, b) => Math.min(a.r, b.r) - Math.max(a.x, b.x) > 0.5 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 0.5;
    const overlaps = [];
    texts.forEach((a, i) => texts.slice(i + 1).forEach((b) => { if (meet(a, b)) overlaps.push(`${a.text} × ${b.text}`); }));
    const outside = texts.filter((t) => t.x < box.left - 0.5 || t.r > box.right + 0.5 || t.y < box.top - 0.5 || t.b > box.bottom + 0.5).map((t) => t.text);
    const g = c.getModel().getComponent('grid', 0).coordinateSystem.getRect();
    const plotTop = box.top + g.y;
    const names = new Set([].concat(c.getOption().legend ?? []).flatMap((l) => (l.data ?? []).map((d) => (typeof d === 'object' ? d.name : d))));
    const legend = texts.filter((t) => names.has(t.text));
    const bars = [];
    c.getModel().eachSeries((s) => {
      if (s.subType !== 'bar') return;
      const d = s.getData();
      for (let i = 0; i < d.count(); i++) {
        const l = d.getItemLayout(i);
        if (!l || !(Math.abs(l.width) > 0) || !(Math.abs(l.height) > 0)) continue;
        bars.push({ x: box.left + Math.min(l.x, l.x + l.width), y: box.top + Math.min(l.y, l.y + l.height), r: box.left + Math.max(l.x, l.x + l.width), b: box.top + Math.max(l.y, l.y + l.height) });
      }
    });
    return {
      width: Math.round(box.width), container: el.clientWidth, labels: texts.map((t) => t.text), legend: legend.map((t) => t.text),
      legendClearsPlot: legend.every((t) => t.b <= plotTop + 0.5), overlaps, outside,
      onBars: texts.filter((t) => bars.some((b) => meet(t, b))).map((t) => t.text),
      data: c.getOption().series.map((s) => s.data.map((d) => (d !== null && typeof d === 'object' ? d.value : d))),
    };
  });
}

// Scrolls the host page until an element inside the panel frame is on screen. The browser stops rendering a panel
// frame that is off screen (no animation frames, no resize callbacks), so a chart there would never redraw.
export async function revealInPanel(page, locator) {
  const y = await locator.evaluate((el) => el.getBoundingClientRect().top);
  await page.locator('.panel-host iframe').first().evaluate((frame, top) => {
    let s = frame.parentElement;
    while (s && s !== document.body && !(s.scrollHeight > s.clientHeight && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    const scroller = s && s !== document.body ? s : document.scrollingElement;
    scroller.scrollBy(0, frame.getBoundingClientRect().top + top - 60);
  }, y);
}
