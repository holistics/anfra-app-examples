// patterns in anfra/apps/tokens.css and web/public/assets/styles.css), and one style for each state.
import { test, expect } from '@playwright/test';
import { signIn, panel } from './helpers.mjs';

const css = (locator, ...props) => locator.evaluate((el, ps) => Object.fromEntries(ps.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])), props);
const BLACK = 'rgb(23, 23, 23)';

test('20 · the bar, buttons, badges, cards and states share one style on screens, islands and panels', async ({ page }) => {
  await signIn(page, 'Bao Nguyen');
  // The top bar and its tabs.
  expect((await css(page.locator('.appbar'), 'background-color'))['background-color']).toBe('rgb(245, 245, 245)');
  const current = await css(page.locator('.nav a[aria-current="page"]'), 'border-bottom-color', 'opacity');
  expect(current).toEqual({ 'border-bottom-color': BLACK, opacity: '1' });
  // A primary button looks the same drawn by the app's own CSS and by a shadcn/ui component.
  await page.goto('/#/p/NP-0008/overview');
  const own = await css(page.locator('#update-form button.primary'), 'background-color', 'border-radius', 'color');
  await page.locator('[data-guide="approved_revenue"]').click();
  await page.goto('/#/p/NP-0003/overview');
  await page.locator('[data-guide="cost_complete"]').click();
  const island = await css(page.locator('[data-kk="guide"] a[data-variant="default"]'), 'background-color', 'border-radius', 'color');
  expect(own).toEqual(island);
  expect(own['background-color']).toBe(BLACK);
  await page.keyboard.press('Escape');
  // Badges: the same rounded rectangle in both.
  expect((await css(page.locator('.chip').first(), 'border-radius'))['border-radius']).toBe('8px');
  // Cards: a hairline, 14px corners, no shadow.
  expect(await css(page.locator('#readiness'), 'border-top-width', 'border-top-left-radius', 'box-shadow')).toEqual({ 'border-top-width': '1px', 'border-top-left-radius': '14px', 'box-shadow': 'none' });
  // Focus: the same grey ring on an input, from the keyboard.
  await page.locator('#find-q').focus();
  // (after the 0.15 s transition)
  await expect.poll(async () => (await css(page.locator('#find-q'), 'border-top-color'))['border-top-color']).toBe('rgb(161, 161, 161)');
  expect((await css(page.locator('#find-q'), 'box-shadow'))['box-shadow']).toMatch(/0px 0px 0px 3px/);
  // Disabled, empty, error and loading: one style each, wherever they are drawn.
  await page.evaluate(() => {
    const box = document.createElement('div'); box.id = 'states-probe';
    box.innerHTML = '<button class="btn" disabled>Disabled</button><div class="empty">Nothing yet</div><div class="banner bad">Refused</div><div class="skeleton"></div>';
    document.querySelector('#view').prepend(box);
  });
  expect((await css(page.locator('#states-probe .btn'), 'opacity'))['opacity']).toBe('0.5');
  expect((await css(page.locator('#states-probe .empty'), 'color'))['color']).toBe('rgb(115, 115, 115)');
  expect((await css(page.locator('#states-probe .banner'), 'background-color'))['background-color']).toBe('rgb(254, 242, 242)');
  expect((await css(page.locator('#states-probe .skeleton'), 'background-color'))['background-color']).toBe('rgb(245, 245, 245)');
  // The panels inside the Anfra frames use the same tokens.
  await page.goto('/#/p/NP-0008/money');
  const chip = panel(page).locator('.chip').first();
  await expect(chip).toBeVisible();
  expect((await css(chip, 'border-radius'))['border-radius']).toBe('8px');
  expect((await css(panel(page).locator('th').first(), 'font-weight', 'color'))).toEqual({ 'font-weight': '500', color: 'rgb(115, 115, 115)' });
});
