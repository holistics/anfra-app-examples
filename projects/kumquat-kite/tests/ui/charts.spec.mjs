/* global combo, KK */ // used only inside the test page, where the panel kit defines them
import { test, expect } from '@playwright/test';
import { signIn, panel, measureChart, revealInPanel } from './helpers.mjs';

const VIEWPORTS = [[375, 812], [768, 1024], [1366, 900], [1920, 1080], [2560, 1440], [844, 390]];
function expectClean(m, what) {
  expect(m.error, what).toBeUndefined();
  expect(m.overlaps, `${what}: texts that overlap`).toEqual([]);
  expect(m.outside, `${what}: texts cut by the chart's edge`).toEqual([]);
  expect(m.onBars, `${what}: texts drawn on a bar`).toEqual([]);
  expect(m.legendClearsPlot, `${what}: legend above the plot`).toBe(true);
  expect(Math.abs(m.width - m.container), `${what}: chart fills its container`).toBeLessThanOrEqual(1);
}

test('16 · Committed versions: the margin labels stay clear of the legend and the bars at every width, and after a resize', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const page = await ctx.newPage();
  await signIn(page, 'Bao Nguyen');
  await page.goto('/#/p/NP-0008/money');
  const chart = panel(page).locator('#versions-chart[data-drawn="true"]');
  await expect(chart).toBeVisible();
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await revealInPanel(page, chart);
    await expect.poll(async () => { const m = await measureChart(chart); return Math.abs(m.width - m.container) <= 1; }).toBe(true);
    const m = await measureChart(chart);
    expectClean(m, `${width}×${height}`);
    expect(m.legend).toEqual(['Gross profit', 'Margin']);
    expect(m.labels, 'the margin in force is still labelled').toContain('55.6%');
    expect(m.data[0], 'gross profit per version is unchanged').toEqual([null, 50000000]);
  }
  await ctx.close();
});

// The shared layout with data the seed does not have: tiny, huge, negative and many values, long names and legends.
const CASES = {
  'the reported case: a margin label at the top of its axis': () => combo([90e6, 120e6], [0.3, 0.4]),
  'one version at the maximum': () => combo([50e6], [0.556]),
  'negative profit and margins': () => combo([-20e6, 15e6, 40e6], [-0.35, 0.1, 0.25]),
  'a 100% margin beside a tiny profit': () => combo([120000, 9.8e9], [1, 0.02]),
  'twelve versions': () => combo([5, 8, 12, 9, 15, 22, 18, 25, 31, 27, 35, 40].map((x) => x * 1e6), [0.1, 0.12, 0.18, 0.15, 0.22, 0.3, 0.26, 0.33, 0.38, 0.35, 0.41, 0.45]),
  'incomplete versions': () => combo([null, 50e6], [null, 0.556]),
  'a three-item legend with long names': () => ({ tooltip: { trigger: 'axis' }, legend: { top: 0, data: ['Verified acceptance', 'Received, net of VAT', 'Received, incl. VAT'] },
    xAxis: { type: 'category', data: ['NP-0001', 'NP-0002', 'NP-0003', 'NP-0004', 'NP-0005', 'NP-0006', 'NP-0007', 'NP-0008'] }, yAxis: KK.axisVnd,
    series: ['Verified acceptance', 'Received, net of VAT', 'Received, incl. VAT'].map((name, k) => ({ name, type: 'bar', data: [1, 2, 3, 4, 5, 6, 7, 8].map((x) => x * (k + 1) * 3e7) })) }),
  'bars with top labels and full category names': () => ({ xAxis: { type: 'category', data: ['One-off totals', 'Per month', 'Range (low)', 'Range (high)'], axisLabel: { interval: 0 } },
    yAxis: KK.axisVnd, series: [{ type: 'bar', data: [2.4e9, 3.1e8, null, 9.75e9], label: { show: true, position: 'top', formatter: (p) => (p.value === null || p.value === undefined ? 'none' : KK.shortVnd(p.value)) } }] }),
  'horizontal bars with labels on the right': () => ({ xAxis: KK.axisVnd, yAxis: { type: 'category', data: Array.from({ length: 10 }, (_, i) => `#${10 - i} NP-00${10 + i}`) },
    series: [{ type: 'bar', barMaxWidth: 22, data: [9.8e9, 4.5e9, 1.2e9, 8.7e8, 4.2e8, 1.5e8, 9.9e7, 5e7, 2e7, 120000].reverse(), label: { show: true, position: 'right', formatter: (p) => KK.shortVnd(p.value) } }] }),
};
const WIDTHS = [300, 375, 768, 1366, 1920, 2560];

test('16 · the shared chart layout holds for every data range, width and resize', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 2600, height: 900 });
  await page.goto('/healthz');
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;font:12px system-ui}#c{height:240px}</style>
    <div id="c"></div><script src="/panels/panel-kit.js"></script>
    <script>
      function combo(gp, gm) {
        return { tooltip: { trigger: 'axis' }, legend: { top: 0, data: ['Gross profit', 'Margin'] },
          xAxis: { type: 'category', data: gp.map((_, i) => 'v' + (i + 1) + (i === gp.length - 1 ? ' (now)' : '')) }, yAxis: [KK.axisVnd, KK.axisPct],
          series: [{ name: 'Gross profit', type: 'bar', barMaxWidth: 36, data: gp, itemStyle: { color: KK.COLORS.approved } },
            { name: 'Margin', type: 'line', yAxisIndex: 1, data: gm, itemStyle: { color: KK.COLORS.info },
              label: { show: true, formatter: (p) => (p.value === null ? '' : (p.value * 100).toFixed(1).replace(/\\.0$/, '') + '%') } }] };
      }
      window.CASES = { ${Object.entries(CASES).map(([k, f]) => `${JSON.stringify(k)}: ${f.toString()}`).join(',\n')} };
    </script>`);
  const chart = page.locator('#c');
  for (const name of Object.keys(CASES)) {
    const input = await page.evaluate(async (n) => { const o = window.CASES[n](); await KK.chart('c', o); return [].concat(o.series).map((s) => s.data.map((d) => (d && typeof d === 'object' ? d.value : d))); }, name);
    for (const w of WIDTHS) {
      await chart.evaluate((el, px) => { el.style.width = `${px}px`; }, w);
      await expect.poll(async () => (await measureChart(chart)).width).toBe(w);
      const m = await measureChart(chart);
      expectClean(m, `${name} at ${w}px`);
      expect(m.data, `${name}: the figures are unchanged`).toEqual(input);
    }
  }
});

// Every chart the reports draw, on the seeded data, at every width (a resize of the same page).
const REPORT_CHARTS = { overview: ['c-monthly', 'c-top'], monthly: ['c-monthly'], ranking: ['c-ranking'], pipeline: ['c-basis', 'c-stages'], cash: ['c-projects'], quality: ['c-checks'] };

test('16 · every report chart keeps its labels, legend and marks apart at every width', async ({ browser }) => {
  test.setTimeout(360000);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const page = await ctx.newPage();
  await signIn(page, 'Mai Le');
  for (const [report, ids] of Object.entries(REPORT_CHARTS)) {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`/#/reports/${report}`);
    const f = panel(page);
    for (const id of ids) await expect(f.locator(`#${id}[data-drawn="true"]`)).toBeVisible();
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      for (const id of ids) {
        const chart = f.locator(`#${id}`);
        await revealInPanel(page, chart);
        await expect.poll(async () => { const m = await measureChart(chart); return Math.abs(m.width - m.container) <= 1; }).toBe(true);
        expectClean(await measureChart(chart), `${report} ${id} at ${width}×${height}`);
      }
    }
  }
  await ctx.close();
});
// reconciliation app (panel-kit.js): its palette, muted 11px axis labels, light gridlines on the value axis and a
// baseline under the categories with no ticks, square legend keys, and a white tooltip with a hairline border. The
// key-figure blocks share the palette. Only the look is checked here; the layout is checked above, the figures by
// npm run reconcile.
test('27 · every chart and report follows the reference look, with the same colours for the same meaning', async ({ browser }) => {
  test.setTimeout(240000);
  const PALETTE = ['#1f8a4c', '#7a5af8', '#2a78d6', '#898781', '#d13b3a', '#a15c00'];
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const page = await ctx.newPage();
  await signIn(page, 'Mai Le');
  const views = [...Object.entries(REPORT_CHARTS).map(([r, ids]) => [`/#/reports/${r}`, ids]), ['/#/p/NP-0001/money', ['versions-chart']]];
  let charts = 0;
  for (const [hash, ids] of views) {
    await page.goto(hash);
    const f = panel(page);
    for (const id of ids) await expect(f.locator(`#${id}[data-drawn="true"]`)).toBeVisible();
    for (const id of ids) {
      const look = await f.locator(`#${id}`).evaluate((el) => {
        const o = window.echarts.getInstanceByDom(el).getOption();
        const axes = [...o.xAxis, ...o.yAxis].filter((a) => !a.kkLabelRow);
        const colours = o.series.flatMap((s) => [s.itemStyle?.color, ...(s.data ?? []).map((d) => d?.itemStyle?.color)]).filter((c) => typeof c === 'string');
        return {
          labels: [...new Set(axes.map((a) => `${a.axisLabel.color} ${a.axisLabel.fontSize}`))],
          ticks: axes.some((a) => a.axisTick.show),
          baseline: [...new Set(axes.filter((a) => a.type === 'category').map((a) => a.axisLine.show && a.axisLine.lineStyle.color))],
          grid: [...new Set(axes.filter((a) => a.type === 'value' && a.splitLine.show).map((a) => a.splitLine.lineStyle.color))],
          legend: [...new Set((o.legend ?? []).map((l) => `${l.icon} ${l.itemWidth}x${l.itemHeight} ${l.textStyle.color}`))],
          tooltip: o.tooltip?.[0] && `${o.tooltip[0].backgroundColor} ${o.tooltip[0].borderColor}`,
          colours: [...new Set(colours)],
        };
      });
      const what = `${hash} ${id}`;
      expect(look.labels, `${what}: axis labels`).toEqual(['#898781 11']);
      expect(look.ticks, `${what}: no ticks`).toBe(false);
      expect(look.baseline, `${what}: a baseline under the categories`).toEqual(['#c3c2b7']);
      expect(look.grid, `${what}: gridlines across the value axis`).toEqual(['#e8e7e1']);
      expect(look.legend.every((l) => l === 'rect 10x10 #52514e'), `${what}: square legend keys`).toBe(true);
      expect(look.tooltip, `${what}: the tooltip`).toBe('#fff rgba(11, 11, 11, 0.12)');
      expect(look.colours.length, `${what}: coloured by meaning`).toBeGreaterThan(0);
      for (const c of look.colours) expect(PALETTE, `${what}: ${c} is in the palette`).toContain(c);
      charts += 1;
    }
    const tops = await f.locator('.block.approved, .block.scenario, .block.recorded').evaluateAll((els) => els.map((e) => [e.classList[1], getComputedStyle(e).borderTopColor]));
    for (const [kind, colour] of tops) expect(colour, `${hash}: the ${kind} block's top`).toBe({ approved: 'rgb(31, 138, 76)', scenario: 'rgb(122, 90, 248)', recorded: 'rgb(42, 120, 214)' }[kind]);
  }
  expect(charts, 'all nine charts').toBe(9);
  // The tooltip as drawn: white, a hairline border, rounded, with a soft shadow, and the full VND figure.
  await page.goto('/#/reports/overview');
  const chart = panel(page).locator('#c-top');
  await expect(chart).toHaveAttribute('data-drawn', 'true');
  await revealInPanel(page, chart);
  const tip = await chart.evaluate(async (el) => {
    window.echarts.getInstanceByDom(el).dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 0 });
    await new Promise((r) => setTimeout(r, 300));
    const box = [...el.querySelectorAll('div')].find((d) => /z-index: 9999999/.test(d.getAttribute('style') ?? ''));
    if (!box) return null;
    const s = getComputedStyle(box);
    return { background: s.backgroundColor, border: `${s.borderTopWidth} ${s.borderTopColor}`, radius: s.borderTopLeftRadius, shadow: s.boxShadow !== 'none', text: box.textContent };
  });
  expect(tip).toMatchObject({ background: 'rgb(255, 255, 255)', border: '1px rgba(11, 11, 11, 0.12)', radius: '8px', shadow: true });
  expect(tip.text).toMatch(/\d{1,3}(,\d{3})+ VND/);
  await ctx.close();
});
