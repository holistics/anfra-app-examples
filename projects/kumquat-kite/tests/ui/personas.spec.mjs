// the top bar's menu switches persona on the spot, and the page reloads as the new persona: their navigation, their
// permissions and their figures, with nothing left over from the persona before.
import { test, expect } from '@playwright/test';
import { panel, watchConsole } from './helpers.mjs';

const whoAmI = (page) => page.evaluate(async () => {
  const s = JSON.parse(sessionStorage.getItem('kk-auth'));
  const r = await fetch('/api/data/me', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}` }, body: '{"args":[]}' });
  return { persona: s.persona, roles: (await r.json()).data.roles };
});

test('Personas · six demo personas and no password; switching from the top bar reloads the same screen as the new persona', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/');
  const chooser = page.locator('[data-kk=persona-chooser]');
  await expect(chooser.getByRole('heading', { name: 'Choose a demo persona' })).toBeVisible();
  await expect(chooser.locator('[data-persona]')).toHaveCount(6);
  await expect(chooser).toContainText('not a sign-in');
  await expect(chooser).toContainText('what any persona saves, everyone sees');
  await expect(page.locator('input[type=password], input[type=email]')).toHaveCount(0);

  // Finance: the Finance and Reports tabs, and the governed money panel of a project.
  await chooser.locator('[data-persona=finance]').click();
  await expect(page.getByRole('heading', { name: /what you need to do next/ })).toBeVisible();
  await expect(page.locator('#who')).toContainText('Mai Le');
  await expect(page.locator('.appbar .nav [data-nav=finance]')).toHaveCount(1);
  await page.goto('/#/p/NP-0004/money');
  await expect(panel(page).locator('[data-kk=approved-margin]')).toHaveText(/%$/);
  expect(await whoAmI(page)).toEqual({ persona: 'finance', roles: ['finance'] });

  // Design, from the menu, on the same screen: the page reloads as Design, and Finance's figures are gone.
  await page.locator('[data-kk=user-menu]').click();
  await expect(page.getByText('Demo persona (no sign-in)')).toBeVisible();
  const reloaded = page.waitForEvent('load');
  await page.locator('[data-persona-switch=design]').click();
  await reloaded;
  await expect(page.locator('#who')).toContainText('Khai Vo');
  await expect(page).toHaveURL(/#\/p\/NP-0004\/money$/);
  await expect(page.locator('.banner.warn').first()).toContainText('Governed finance figures are shown to');
  await expect(page.locator('.panel-host iframe')).toHaveCount(0);
  await expect(page.locator('.appbar .nav [data-nav=finance]')).toHaveCount(0);
  await expect(page.locator('.appbar .nav [data-nav=reports]')).toHaveCount(0);
  expect(await whoAmI(page)).toEqual({ persona: 'design', roles: ['design'] });

  // "Change persona…" goes back to the chooser.
  await page.locator('[data-kk=user-menu]').click();
  const back = page.waitForEvent('load');
  await page.getByRole('menuitem', { name: /Change persona/ }).click();
  await back;
  await expect(page.locator('[data-kk=persona-chooser]')).toBeVisible();
  expect(errors).toEqual([]);
});
