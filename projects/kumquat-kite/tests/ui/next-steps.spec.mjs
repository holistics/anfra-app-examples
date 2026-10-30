// due date or what scheduling information is missing, how the date was worked out, and a link. A sample project is
// opened here and taken through the workflow. Suggestions are never stored, assign nothing until the normal form is
// saved, and keep the form's conflict detection.
import { test, expect } from '@playwright/test';
import { signIn, watchConsole } from './helpers.mjs';

const TITLE = 'Next steps pilot (sample)';
let ref;
const card = (page) => page.locator('[data-kk="next-steps"]');
const item = (page, code) => card(page).locator(`li[data-code="${code}"]`);
async function as(browser, name) {
  const context = await browser.newContext(); const page = await context.newPage();
  await signIn(page, name);
  return page;
}

test.describe.serial('Ticket 18 · next steps after a save', () => {
  test('18 · a new delivery: every open step is suggested, and a step waiting for the contract has no date', async ({ page }) => {
    await signIn(page, 'Duong Trinh');
    await page.goto('/#/crm/new');
    await page.getByLabel('New client name').fill('Harbour Kite Co. (sample)');
    await page.getByLabel('Project / opportunity').fill(TITLE);
    await page.locator('#intake input[name=next_action]').fill('Agree the delivery plan with the client');
    await page.locator('#intake input[name=next_action_due]').fill('2026-12-01');
    await page.getByRole('button', { name: 'Save opportunity' }).click();
    await expect(page).toHaveURL(/#\/p\/NP-\d+\/overview/);
    ref = page.url().match(/NP-\d+/)[0];
    const form = page.locator('#update-form');
    await form.locator('select[name=delivery_state]').selectOption('planning');
    await form.locator('select[name=account_owner_id]').selectOption({ label: 'Bao Nguyen (Account)' });
    await form.getByRole('button', { name: 'Save update' }).click();
    await expect(page.locator('.toast').last()).toContainText(/Saved NP-\d+/);
    await expect(item(page, 'contract')).toBeVisible();
    await expect(item(page, 'contract').locator('[data-role=owner]')).toHaveText('Duong Trinh · BD');
    await expect(item(page, 'approved_revenue')).toHaveAttribute('data-due', 'blocked');
    await expect(item(page, 'approved_revenue').locator('[data-role=due]')).toHaveText('Waits for an earlier step');
    await item(page, 'approved_revenue').locator('summary').click();
    await expect(item(page, 'approved_revenue').locator('[data-role=basis]')).toContainText('Waits for: Signed contract with a reference');
    // A Finance step nobody is named for gets an explicitly suggested owner, and its reason.
    await expect(item(page, 'job_code').locator('[data-role=owner]')).toContainText('suggested');
    await expect(item(page, 'job_code')).toContainText('a count, not a measure of capacity');
  });

  test('18 · BD signs the contract: the save reports it, and the steps that waited for it get dates', async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page, 'Duong Trinh');
    await page.goto(`/#/p/${ref}/overview`);
    await expect(item(page, 'approved_revenue')).toHaveAttribute('data-due', 'blocked');
    const form = page.locator('#update-form');
    await form.locator('select[name=commercial_stage]').selectOption('won');
    await form.locator('input[name=contract_reference]').fill('CT-SAMPLE-NS1');
    await form.locator('input[name=contract_signed_date]').fill('2026-10-16');
    await form.getByRole('button', { name: 'Save update' }).click();
    await expect(card(page).locator('[data-role=news]')).toContainText('Done: Signed contract with a reference.');
    await expect(item(page, 'contract')).toHaveCount(0);
    await expect(item(page, 'approved_revenue')).not.toHaveAttribute('data-due', 'blocked');
    await expect(item(page, 'approved_revenue').locator('[data-role=why]')).toContainText('Now that "Signed contract with a reference" is done');
    await item(page, 'approved_revenue').locator('summary').click();
    const basis = item(page, 'approved_revenue').locator('[data-role=basis]');
    await expect(basis).toContainText('Earliest start:');
    await expect(basis).toContainText('Effort: 1 working day(s) (an estimate for this step)');
    await expect(basis).not.toContainText('capacity');
    await expect(basis).toContainText('Monday to Friday in Asia/Ho_Chi_Minh');
    // The list shows the news itself: no second notice for the same save.
    await expect(page.locator('.next-steps')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('18 · a save that completes nothing announces nothing, and the same state gives the same suggestions', async ({ page }) => {
    await signIn(page, 'Bao Nguyen');
    await page.goto(`/#/p/${ref}/overview`);
    await expect(item(page, 'brief')).toBeVisible();
    const keys = await card(page).locator('li[data-suggestion]').evaluateAll((els) => els.map((e) => e.dataset.suggestion));
    expect(new Set(keys).size).toBe(keys.length);
    await page.locator('#update-form textarea[name=latest_note]').fill('Called the client about the brief');
    await page.getByRole('button', { name: 'Save update' }).click();
    await expect(page.locator('.toast').last()).toContainText(/Saved NP-\d+/);
    await expect(item(page, 'brief')).toBeVisible();
    await expect(card(page).locator('[data-role=news]')).toHaveCount(0);
    await expect(page.locator('.next-steps')).toHaveCount(0);
    await page.reload();
    await expect(item(page, 'brief')).toBeVisible();
    expect(await card(page).locator('li[data-suggestion]').evaluateAll((els) => els.map((e) => e.dataset.suggestion))).toEqual(keys);
  });

  test('18 · "Use as next action" fills the form only; saving assigns it, and a stale save still becomes a conflict', async ({ browser }) => {
    const account = await as(browser, 'Bao Nguyen');
    await account.goto(`/#/p/${ref}/overview`);
    const brief = item(account, 'brief');
    const action = await brief.locator('[data-role=action]').innerText();
    await brief.getByRole('button', { name: 'Use as next action' }).click();
    const form = account.locator('#update-form');
    await expect(form.locator('input[name=next_action]')).toHaveValue(action);
    await expect(form.locator('input[name=next_action]')).toBeFocused();
    await expect(form.locator('[data-role=from-suggestion]')).toContainText('nothing is assigned until you save');
    await expect(account.locator('#next-action')).toContainText('Agree the delivery plan with the client');
    // Meanwhile BD saves the same project: the suggestion's save is checked against the version, as any edit is.
    const bd = await as(browser, 'Duong Trinh');
    await bd.goto(`/#/p/${ref}/overview`);
    await bd.locator('#update-form input[name=promised_delivery_date]').fill('2026-12-15');
    await bd.getByRole('button', { name: 'Save update' }).click();
    await expect(bd.locator('.toast').last()).toContainText(/Saved NP-\d+/);
    await form.getByRole('button', { name: 'Save update' }).click();
    await expect(form.locator('h3', { hasText: 'Your changes compared with the latest saved version' })).toBeVisible();
    await form.getByRole('button', { name: 'Apply my changes to the latest version' }).click();
    await expect(account.locator('.toast').last()).toContainText(/Applied your changes to the latest version/);
    await expect(account.locator('#next-action')).toContainText(action);
    // Now in progress as the next action, so it is no longer suggested.
    await expect(item(account, 'brief')).toHaveCount(0);
  });

  test('18 · a Finance approval elsewhere: a notice lists what comes next, with links, and can be dismissed', async ({ browser }) => {
    const account = await as(browser, 'Bao Nguyen');
    await account.goto(`/#/p/${ref}/money`);
    await account.locator('[data-propose="new_service_line"]').click();
    const form = account.locator('#proposal-form');
    await form.getByLabel('Description').fill('Pilot programme, as contracted');
    await form.getByLabel(/Proposed amount/).fill('80000000');
    await form.getByLabel('Reason', { exact: true }).fill('The contract value as signed');
    await form.getByLabel(/Evidence link/).fill('https://example.com/kumquat-demo/evidence/next-steps-contract');
    await form.getByRole('button', { name: 'Send to Finance' }).click();
    await expect(account.locator('.toast').last()).toContainText(/Sent CR-\d+ to Finance/);
    const cr = (await account.locator('.toast').last().innerText()).match(/CR-\d+/)[0];

    const finance = await as(browser, 'Mai Le');
    const errors = watchConsole(finance);
    await finance.goto('/#/finance');
    await finance.locator('a.item', { hasText: cr }).click();
    await finance.locator('#decide textarea[name=comment]').fill('Matches the signed contract');
    await finance.getByRole('button', { name: /^Approve/ }).click();
    await expect(finance.locator('#decide .banner.ok')).toContainText(/Saved the new revision REV-\d+/);
    const notice = finance.locator('.next-steps');
    await expect(notice).toBeVisible();
    // The approval completes two checks at once: the revenue is approved, and nothing waits for Finance any more.
    await expect(notice).toContainText(`Done: Contract revenue approved by Finance, No change waiting for Finance · ${ref}`);
    await expect(notice).toContainText('nothing is assigned until someone saves it');
    await expect(notice.locator('li').first()).toBeVisible();
    await expect(notice.getByRole('link', { name: /All suggestions/ })).toHaveAttribute('href', `#/p/${ref}/overview?focus=suggestions`);
    await notice.getByRole('button', { name: /Dismiss/ }).click();
    await expect(notice).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
