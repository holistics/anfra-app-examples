// every supported width, with no hover, tooltip or sideways scroll: identifiers stay whole, a change wraps under itself,
// and on a phone the proposal's comparison reads as label and value pairs.
import { test, expect } from '@playwright/test';
import { signIn, watchConsole } from './helpers.mjs';

// Every table on the screen: it fits its card, no cell runs past the card's edge, identifiers keep one line each, and
// no value is set smaller than the app's smallest text (12px).
const measure = (page) => page.evaluate(() => [...document.querySelectorAll('#view .table-wrap')].filter((w) => w.getClientRects().length).map((w) => {
  const t = w.querySelector('table'); const edge = w.getBoundingClientRect().right;
  const cells = [...t.querySelectorAll('td, th')].filter((c) => c.getClientRects().length);
  return {
    overflow: Math.max(0, t.scrollWidth - w.clientWidth),
    past: cells.filter((c) => c.getBoundingClientRect().right > edge + 0.5).length,
    brokenIds: [...t.querySelectorAll('td.ref b, td.ref .sub')].filter((b) => b.getClientRects().length > 1).length,
    tiny: cells.filter((c) => parseFloat(getComputedStyle(c).fontSize) < 12).length,
  };
}));
const whole = { overflow: 0, past: 0, brokenIds: 0, tiny: 0 };

test('25 · Finance review: every table value is readable at every width, with nothing cut at the right edge', async ({ browser }) => {
  test.setTimeout(300000);
  // A decided proposal for a new line, as in the screenshot: Account proposes it, Finance approves it.
  const a = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const account = await a.newPage();
  await signIn(account, 'Bao Nguyen');
  await account.goto('/#/p/NP-0001/money');
  await account.locator('[data-propose="new_cost_line"]').click();
  const pf = account.locator('#proposal-form');
  await pf.locator('[name=description]').fill('Extra studio hours (sample)');
  await pf.locator('[name=amount]').fill('60000000');
  await pf.locator('[name=reason]').fill('The supplier quotation (test)');
  await pf.locator('[name=evidence_url]').fill('https://example.com/kumquat-demo/evidence/finance-table-test');
  await pf.getByRole('button', { name: 'Send to Finance' }).click();
  await expect(account.getByText(/Sent CR-\d{4} to Finance/)).toBeVisible();
  await a.close();

  const f = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const page = await f.newPage();
  const errors = watchConsole(page);
  await signIn(page, 'Mai Le');
  await page.goto('/#/finance');
  await page.locator('#lists a.item', { hasText: 'new line' }).filter({ hasText: 'NP-0001' }).first().click();
  const cr = new URL(page.url().replace('#/', '')).searchParams.get('cr');
  await page.locator('#decide').getByRole('button', { name: /Approve/ }).click();
  await expect(page.locator('#decide .banner.ok')).toContainText('Saved the new revision');

  for (const width of [1366, 1100, 1240, 1440, 1920, 2560, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/finance');
    const decided = page.locator('#lists td.change', { hasText: 'New line' }).first();
    await expect(decided).toBeVisible();
    await expect(decided).toContainText(/New line\s*→ 60,000,000 VND/);
    expect(await measure(page), `${width}px: the review inbox`).toEqual([whole]);
    // The proposal open: beside the inbox on a wide screen, alone on a narrow one.
    await page.goto(`/#/finance?cr=${cr}`);
    const compare = page.locator('#detail table');
    await expect(compare).toContainText('60,000,000 VND');
    const tables = await measure(page);
    expect(tables, `${width}px: the inbox and the proposal`).toEqual(width > 1100 ? [whole, whole] : [whole]);
    if (width > 640) {
      // Numbers stay under their right-aligned headings.
      const align = await compare.evaluate((t) => [...t.querySelectorAll('th.num, td.num')].map((c) => getComputedStyle(c).textAlign));
      expect(new Set(align)).toEqual(new Set(['right']));
    } else {
      // On a phone, each value with its heading as a label.
      const labels = await compare.locator('td').evaluateAll((tds) => tds.map((td) => getComputedStyle(td, '::before').content));
      expect(labels).toEqual(['"Line"', '"Approved (before)"', '"Proposed"', '"Difference"']);
      await expect(compare.locator('thead')).toBeHidden();
    }
  }
  expect(errors).toEqual([]);
  await f.close();
});
