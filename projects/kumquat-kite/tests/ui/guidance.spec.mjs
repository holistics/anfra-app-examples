// sample project is opened here and taken through the workflow (missing, waiting for Finance, done), with the pointer,
// the keyboard and touch, as BD, Account, Design and Finance.
import { test, expect } from '@playwright/test';
import { signIn, watchConsole } from './helpers.mjs';

const TITLE = 'Guided handover (sample)';
let ref;
const row = (page, code) => page.locator(`li[data-check="${code}"]`);
const help = (page, code) => page.locator(`[data-guide="${code}"]`);
const popover = (page) => page.locator('[data-kk="guide"]');
async function as(browser, name, options = {}) {
  const context = await browser.newContext(options); const page = await context.newPage();
  await signIn(page, name);
  return page;
}

test.describe.serial('Ticket 17 · readiness guidance', () => {
  test('17 · BD opens a sample project and starts its delivery', async ({ page }) => {
    await signIn(page, 'Duong Trinh');
    await page.goto('/#/crm/new');
    await page.getByLabel('New client name').fill('Lantern Tea House (sample)');
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
    await expect(row(page, 'approved_revenue')).toHaveAttribute('data-state', 'prepare');
    // BD cannot propose revenue: the help hands it to the Account owner instead of offering the action.
    await help(page, 'approved_revenue').click();
    await expect(popover(page).locator('[data-role=your-part]')).toContainText('This is for Bao Nguyen (Account owner)');
    await expect(popover(page).getByRole('link', { name: 'Go there' })).toHaveCount(0);
  });

  test('17 · Account (pointer): a tooltip names their step, and the help\'s link lands on the control that completes it', async ({ browser }) => {
    const page = await as(browser, 'Bao Nguyen');
    const errors = watchConsole(page);
    await page.goto(`/#/p/${ref}/overview`);
    await expect(row(page, 'approved_revenue').locator('[data-role=status]')).toHaveText('Missing · Account');
    await help(page, 'approved_revenue').hover();
    await expect(page.locator('[data-kk="guide-tip"]')).toContainText('Your step: propose the contract value as a revenue line');
    await help(page, 'approved_revenue').click();
    const pop = popover(page);
    await expect(pop).toBeVisible();
    await expect(pop.locator('[data-step="prepare"]')).toHaveAttribute('data-step-state', 'current');
    await expect(pop.locator('[data-step="prepare"]')).toContainText('Prepare and submit');
    await expect(pop.locator('[data-step="prepare"]')).toContainText('Who: Bao Nguyen (Account owner)');
    await expect(pop.locator('[data-step="approve"]')).toHaveAttribute('data-step-state', 'next');
    await expect(pop.locator('[data-step="approve"]')).toContainText('Approve or verify');
    await expect(pop).toContainText('Done when: A revenue line with an amount, approved by Finance.');
    await expect(pop.locator('[data-role=your-part]')).toContainText('You can do this');
    await pop.getByRole('link', { name: 'Go there' }).click();
    await expect(page).toHaveURL(new RegExp(`#/p/${ref}/money\\?focus=new_service_line$`));
    const target = page.locator('[data-propose="new_service_line"]');
    await expect(target).toBeFocused();
    await expect(target).toHaveClass(/focus-target/);
    // Not needed yet: acceptance waits for delivery, and its help says so without an action.
    await page.goto(`/#/p/${ref}/overview`);
    await expect(row(page, 'acceptance')).toHaveAttribute('data-state', 'na');
    await help(page, 'acceptance').click();
    await expect(popover(page)).toContainText('Needed once delivery is marked Delivered.');
    await expect(popover(page).getByRole('link')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('17 · Design (keyboard): the help opens with Enter, explains the handoff, offers nothing it cannot do, and Escape returns focus', async ({ browser }) => {
    const page = await as(browser, 'Khai Vo');
    await page.goto(`/#/p/${ref}/overview`);
    const b = help(page, 'approved_revenue');
    await b.focus();
    await expect(page.locator('[data-kk="guide-tip"]')).toContainText('Bao Nguyen (Account owner) does this');
    await page.keyboard.press('Enter');
    const pop = popover(page);
    await expect(pop).toBeVisible();
    await expect(pop.locator('[data-role=your-part]')).toContainText('This is for Bao Nguyen (Account owner). Ask them to propose the contract value');
    await expect(pop.locator('[data-role=your-part]')).toContainText('Your role cannot do this step');
    await expect(pop.getByRole('link')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await expect(b).toBeFocused();
  });

  test('17 · touch: a tap opens the help on a phone, fully on screen', async ({ browser }) => {
    const page = await as(browser, 'Bao Nguyen', { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    await page.goto(`/#/p/${ref}/overview`);
    await help(page, 'cost_complete').tap();
    const pop = popover(page);
    await expect(pop).toBeVisible();
    const box = await pop.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    await expect(pop.getByRole('link', { name: 'Go there' })).toBeVisible();
    await pop.getByRole('link', { name: 'Go there' }).tap();
    await expect(page).toHaveURL(new RegExp(`#/p/${ref}/money\\?focus=new_cost_line$`));
    await expect(page.locator('[data-propose="new_cost_line"]')).toBeFocused();
  });

  test('17 · waiting for Finance: Account sees the handoff, Finance gets the review link, and the approval completes the check', async ({ browser }) => {
    const account = await as(browser, 'Bao Nguyen');
    await account.goto(`/#/p/${ref}/money`);
    await account.locator('[data-propose="new_service_line"]').click();
    const form = account.locator('#proposal-form');
    await form.getByLabel('Description').fill('Handover programme, as contracted');
    await form.getByLabel(/Proposed amount/).fill('120000000');
    await form.getByLabel('Reason', { exact: true }).fill('The contract value as signed');
    await form.getByLabel(/Evidence link/).fill('https://example.com/kumquat-demo/evidence/guided-handover-contract');
    await form.getByRole('button', { name: 'Send to Finance' }).click();
    await expect(account.locator('.toast').last()).toContainText(/Sent CR-\d+ to Finance/);
    const cr = (await account.locator('.toast').last().innerText()).match(/CR-\d+/)[0];
    await account.goto(`/#/p/${ref}/overview`);
    await expect(row(account, 'approved_revenue')).toHaveAttribute('data-state', 'pending');
    await expect(row(account, 'approved_revenue').locator('[data-role=status]')).toHaveText(`Waiting for Finance · ${cr}`);
    await help(account, 'approved_revenue').click();
    await expect(popover(account).locator('[data-step="prepare"]')).toHaveAttribute('data-step-state', 'done');
    await expect(popover(account).locator('[data-step="approve"]')).toHaveAttribute('data-step-state', 'current');
    await expect(popover(account).locator('[data-role=your-part]')).toContainText(`You submitted ${cr}. It now waits for Finance`);
    await expect(popover(account).getByRole('link', { name: 'Open the review' })).toHaveCount(0);

    const finance = await as(browser, 'Mai Le');
    await finance.goto(`/#/p/${ref}/overview`);
    await help(finance, 'approved_revenue').click();
    await expect(popover(finance).locator('[data-role=your-part]')).toContainText('You can do this');
    await popover(finance).getByRole('link', { name: 'Open the review' }).click();
    await expect(finance).toHaveURL(/#\/finance\?cr=/);
    await expect(finance.locator('#decide')).toBeVisible();
    await expect(finance.locator('#view')).toContainText(cr);
    await finance.locator('#decide textarea[name=comment]').fill('Matches the signed contract');
    await finance.getByRole('button', { name: /^Approve/ }).click();
    await expect(finance.locator('#decide .banner.ok')).toContainText(/Saved the new revision REV-\d+/);
    await finance.goto(`/#/p/${ref}/overview`);
    await expect(row(finance, 'approved_revenue')).toHaveAttribute('data-state', 'done');
    await help(finance, 'approved_revenue').click();
    await expect(popover(finance)).toContainText('Approved revenue: 120,000,000 VND.');
    await expect(popover(finance).getByRole('link')).toHaveCount(0);
  });

  test('17 · acceptance: Account submits the evidence from the help\'s link, and Finance gets the verification link', async ({ browser }) => {
    const account = await as(browser, 'Bao Nguyen');
    await account.goto(`/#/p/${ref}/overview`);
    await account.locator('#update-form select[name=delivery_state]').selectOption('delivered');
    await account.getByRole('button', { name: 'Save update' }).click();
    await expect(account.locator('.toast').last()).toContainText(/Saved NP-\d+/);
    await expect(row(account, 'acceptance')).toHaveAttribute('data-state', 'prepare');
    await help(account, 'acceptance').click();
    await popover(account).getByRole('link', { name: 'Go there' }).click();
    await expect(account).toHaveURL(new RegExp(`#/p/${ref}/money\\?focus=acceptance$`));
    const what = account.locator('#acc-form input[name=description]');
    await expect(what).toBeFocused();
    await what.fill('Handover programme delivered and accepted by the client');
    await account.locator('#acc-form input[name=amount]').fill('120000000');
    await account.locator('#acc-form input[name=evidence_url]').fill('https://example.com/kumquat-demo/evidence/guided-handover-acceptance');
    await account.getByRole('button', { name: 'Send to Finance for verification' }).click();
    await expect(account.locator('.toast').last()).toContainText(/Submitted AC-\d+/);
    const ac = (await account.locator('.toast').last().innerText()).match(/AC-\d+/)[0];
    await account.goto(`/#/p/${ref}/overview`);
    await expect(row(account, 'acceptance').locator('[data-role=status]')).toHaveText(`Waiting for Finance · ${ac}`);

    const finance = await as(browser, 'Mai Le');
    await finance.goto(`/#/p/${ref}/overview`);
    await help(finance, 'acceptance').click();
    await expect(popover(finance).locator('[data-step="approve"]')).toContainText('Check the evidence and the amount');
    await popover(finance).getByRole('link', { name: 'Open the review' }).click();
    await expect(finance).toHaveURL(/#\/finance\?ac=/);
    await expect(finance.locator('#view')).toContainText(ac);
  });

  test('17 · a phone held sideways: the help fits the short screen and its link still works', async ({ browser }) => {
    const page = await as(browser, 'Bao Nguyen', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    await page.goto(`/#/p/${ref}/overview`);
    await help(page, 'cost_complete').tap();
    const pop = popover(page);
    await expect(pop).toBeVisible();
    const box = await pop.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(390);
    await pop.getByRole('link', { name: 'Go there' }).tap();
    await expect(page).toHaveURL(new RegExp(`#/p/${ref}/money\\?focus=new_cost_line$`));
  });
});
