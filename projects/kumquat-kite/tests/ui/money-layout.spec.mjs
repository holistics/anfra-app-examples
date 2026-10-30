// together in their order, Committed versions stays beneath them at full width, and "Why this number?" comes last;
// only the widths grow. Checked in Job 360 and in Finance review, at laptop and large-monitor widths and after a resize.
import { test, expect } from '@playwright/test';
import { signIn, panel, watchConsole } from './helpers.mjs';

const layout = (page) => panel(page).locator('body').evaluate(() => {
  const r = (k) => document.querySelector(`[data-anfra-block="${k}"]`).getBoundingClientRect();
  const [a, s, c, v, w] = ['approved', 'scenario', 'recorded', 'versions', 'why'].map(r);
  const chart = document.getElementById('versions-chart');
  return {
    cardsInOrder: a.top === s.top && s.top === c.top && a.left < s.left && s.left < c.left,
    versionsBelow: v.top >= Math.max(a.bottom, s.bottom, c.bottom) && w.top >= v.bottom,
    versionsFullWidth: Math.abs(v.width - document.querySelector('main').getBoundingClientRect().width) <= 2,
    chartFits: window.echarts.getInstanceByDom(chart).getWidth() === chart.clientWidth,
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
const expected = { cardsInOrder: true, versionsBelow: true, versionsFullWidth: true, chartFits: true, sideways: 0 };

test('30 · Project money keeps the laptop order and grouping on a large monitor, in Job 360 and in Finance review', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await signIn(page, 'Mai Le');
  for (const where of ['/#/p/NP-0008/money', 'review']) {
    for (const width of [1366, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      if (where === 'review') { await page.goto('/#/finance'); await page.locator('#lists a.item[href*="cr="]').first().click(); } else await page.goto(where);
      await expect(panel(page).locator('#versions-chart[data-drawn="true"]')).toHaveCount(1, { timeout: 60000 });
      await expect.poll(() => layout(page), { message: `${where} at ${width}px` }).toEqual(expected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${width}px: no page-level sideways scroll`).toBeLessThanOrEqual(0);
    }
  }
  // The same open panel, widened from a laptop to a large monitor: the order holds and the chart follows its box.
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/#/p/NP-0008/money');
  await expect(panel(page).locator('#versions-chart[data-drawn="true"]')).toHaveCount(1, { timeout: 60000 });
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect.poll(() => layout(page), { message: 'after widening to 2560px' }).toEqual(expected);
  expect(errors).toEqual([]);
});
