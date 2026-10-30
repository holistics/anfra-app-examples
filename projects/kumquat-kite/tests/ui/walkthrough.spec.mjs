// run are saved per person in the database; its progress is read from the sample project's saved state.
import { test, expect } from '@playwright/test';
import { signIn, watchConsole } from './helpers.mjs';

const dock = (page) => page.locator('[data-kk="walkthrough"]');
const invite = (page) => page.locator('[data-kk="walkthrough-invite"]');
const atStep = (page, id) => expect(dock(page)).toHaveAttribute('data-step', id, { timeout: 60000 });
// Choosing a persona reads their records and walkthrough state first; the page marks when that is done.
const loaded = (page) => expect(page.locator('body[data-wt-ready]')).toHaveCount(1, { timeout: 90000 });
async function fresh(browser, options = {}) { const c = await browser.newContext(options); return c.newPage(); }
// A role change, as the walkthrough asks for it: one click switches to that demo persona, and the page reloads as them.
async function switchVia(page, name) {
  const reloaded = page.waitForEvent('load');
  await dock(page).getByRole('button', { name: new RegExp(`Switch to ${name}`) }).click();
  await reloaded;
  await expect(page.locator('#who')).toContainText(name);
  await loaded(page);
}
const versionOf = async (page, ref) => { await page.goto(`/#/p/${ref}/overview`); return (await page.locator('.right', { hasText: 'Version v' }).first().innerText()).match(/Version v\d+/)[0]; };

test.describe.serial('Ticket 19 · walkthrough', () => {
  test('19 · a sample user\'s first sign-in offers it, "Maybe later" is remembered, and the profile control still starts it', async ({ browser }) => {
    const page = await fresh(browser);
    await signIn(page, 'Khoi Dang');
    await expect(invite(page)).toBeVisible();
    await expect(invite(page).getByRole('button', { name: 'Start walkthrough' })).toBeVisible();
    await invite(page).getByRole('button', { name: 'Maybe later' }).click();
    await expect(invite(page)).toHaveCount(0);
    await page.reload();
    await loaded(page);
    await expect(invite(page)).toHaveCount(0);
    const again = await fresh(browser);
    await signIn(again, 'Khoi Dang');
    await loaded(again);
    await expect(invite(again)).toHaveCount(0);
    await again.locator('.appbar [data-wt-start]').click();
    await atStep(again, 'open');
    await expect(dock(again).locator('[data-role=switch]')).toContainText('This step is for BD');
    await dock(again).getByRole('button', { name: 'Exit' }).click();
    await expect(dock(again)).toHaveCount(0);
  });

  test('19 · the whole lifecycle on one sample project, across four role changes, synchronised with the saved state', async ({ browser }) => {
    test.setTimeout(480000);
    const page = await fresh(browser, { viewport: { width: 1366, height: 900 } });
    const errors = watchConsole(page);
    await signIn(page, 'Duong Trinh');
    const before = await versionOf(page, 'NP-0001');
    await page.goto('/#/home');
    await loaded(page);
    await invite(page).getByRole('button', { name: 'Start walkthrough' }).focus();
    await page.keyboard.press('Enter');
    await atStep(page, 'open');
    await expect(page).toHaveURL(/#\/crm\/new$/);
    const save = page.locator('#intake button[type=submit]');
    await expect(save).toBeFocused();
    await expect(save).toHaveClass(/wt-target/);
    await expect(page.locator('#intake [name=title]')).toHaveValue('Walkthrough: launch livestream (sample)');
    await expect(page.locator('#intake [name=new_client_name]')).toHaveValue(/^Walkthrough client \d+ \(sample\)$/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/p\/NP-\d+\/overview/);
    const ref = page.url().match(/NP-\d+/)[0];

    await atStep(page, 'win');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    const form = page.locator('#update-form');
    await expect(form.locator('[name=commercial_stage]')).toBeFocused();
    await form.locator('[name=commercial_stage]').selectOption('won');
    await form.locator('[name=account_owner_id]').selectOption({ label: 'Bao Nguyen (Account)' });
    await expect(form.locator('[name=contract_reference]')).toHaveValue(/^CT-WT-/);
    await form.getByRole('button', { name: 'Save update' }).click();

    await atStep(page, 'brief');
    await expect(dock(page).locator('[data-role=switch]')).toContainText('This step is for Account');
    await expect(dock(page).getByRole('button', { name: 'Take me there' })).toHaveCount(0);
    await switchVia(page, 'Bao Nguyen');
    await atStep(page, 'brief');
    await expect(dock(page)).toContainText(ref);
    await expect(page).toHaveURL(new RegExp(`#/p/${ref}/overview`));
    // Pause, reload, resume: the place is kept.
    await dock(page).getByRole('button', { name: 'Pause' }).click();
    await expect(dock(page)).toHaveAttribute('data-status', 'paused');
    await page.reload();
    await loaded(page);
    await expect(dock(page)).toHaveAttribute('data-status', 'paused');
    await dock(page).getByRole('button', { name: 'Resume' }).click();
    await expect(dock(page)).toHaveAttribute('data-status', 'active');
    await atStep(page, 'brief');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    // The screen is drawn again, then the walkthrough fills the sample link and puts the focus on the step's control.
    await expect(form.locator('[name=brief_status]')).toBeFocused();
    await expect(form.locator('[name=brief_url]')).toHaveValue(/walkthrough-/);
    await form.locator('[name=brief_status]').selectOption('ready');
    await form.getByRole('button', { name: 'Save update' }).click();

    await atStep(page, 'revenue');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    await expect(page.locator('[data-propose="new_service_line"]')).toBeFocused();
    await page.keyboard.press('Enter');
    const pf = page.locator('#proposal-form');
    await expect(pf.locator('[name=amount]')).toHaveValue('150000000');
    await pf.getByRole('button', { name: 'Send to Finance' }).click();
    await atStep(page, 'cost');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    await expect(page.locator('[data-propose="new_cost_line"]')).toBeFocused();
    await page.locator('[data-propose="new_cost_line"]').click();
    await expect(pf.locator('[name=amount]')).toHaveValue('60000000');
    await pf.getByRole('button', { name: 'Send to Finance' }).click();

    await atStep(page, 'job_code');
    await switchVia(page, 'Mai Le');
    await atStep(page, 'job_code');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    await expect(page.locator('#jobcode-form [name=job_code]')).toHaveValue(/^KK-WT\d+$/);
    await page.getByRole('button', { name: 'Issue job code' }).click();
    await atStep(page, 'approve');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    await expect(page.locator('#lists a.item.wt-target')).toBeFocused();
    for (let i = 0; i < 2; i++) {
      const item = page.locator('#lists a.item.wt-target');
      await expect(item).toContainText(ref);
      await item.click();
      const approve = page.locator('#decide button.primary');
      await expect(approve).toHaveClass(/wt-target/);
      await expect(page.locator('#decide [name=comment]')).toHaveValue('Checked against the evidence (walkthrough)');
      await approve.click();
      await expect(page.locator('#decide .banner.ok')).toContainText(/Saved the new revision/);
    }

    await atStep(page, 'deliver');
    await switchVia(page, 'Bao Nguyen');
    await atStep(page, 'deliver');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    await expect(form.locator('[name=delivery_state]')).toBeFocused();
    await form.locator('[name=delivery_state]').selectOption('delivered');
    await form.getByRole('button', { name: 'Save update' }).click();
    await atStep(page, 'acceptance');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    await expect(page.locator('#acceptance-slot summary')).toBeFocused();
    await page.locator('#acceptance-slot summary').click();
    await expect(page.locator('#acc-form [name=amount]')).toHaveValue('150000000');
    await page.getByRole('button', { name: 'Send to Finance for verification' }).click();

    await atStep(page, 'verify');
    await switchVia(page, 'Mai Le');
    await atStep(page, 'verify');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    await expect(page.locator('#lists a.item.wt-target')).toBeFocused();
    await page.locator('#lists a.item.wt-target').click();
    await expect(page.locator('#ac-decide button.primary')).toHaveClass(/wt-target/);
    await page.locator('#ac-decide button.primary').click();
    const done = page.getByRole('dialog', { name: 'Walkthrough complete' });
    await expect(done).toBeVisible({ timeout: 60000 });
    await expect(dock(page)).toHaveCount(0);
    await expect(done).toContainText(ref);
    const next = done.getByRole('button', { name: 'Check My Next Actions' });
    const story = done.getByRole('button', { name: 'Read Case Study' });
    await expect(done.getByRole('button'), 'the two ways on, and the dialog\'s own close button').toHaveCount(3);
    await expect(next).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(story).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(next, 'the focus stays in the dialog').toBeFocused();
    await next.click();
    await expect(done).toHaveCount(0);
    await expect(page).toHaveURL(/#\/home$/);
    // It does not come back: not on another screen, not after a reload.
    await page.goto(`/#/p/${ref}/overview`);
    await expect(page.locator('#readiness h2')).toContainText('ready');
    await page.reload();
    await loaded(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(dock(page)).toHaveCount(0);
    // The others who took part see it once, the next time they are chosen: Account reads the case study, BD closes it
    // with Escape. (While it is open, the page behind it is hidden from assistive technology, so this waits for it.)
    const signInTo = async (p, name) => { await p.goto('/'); await p.getByRole('button', { name: new RegExp(name) }).click(); await loaded(p); };
    const account = await fresh(browser, { viewport: { width: 1366, height: 900 } });
    await signInTo(account, 'Bao Nguyen');
    const theirs = account.getByRole('dialog', { name: 'Walkthrough complete' });
    await expect(theirs).toBeVisible();
    await theirs.getByRole('button', { name: 'Read Case Study' }).press('Enter');
    await expect(theirs).toHaveCount(0);
    await expect(account).toHaveURL(/#\/welcome\?section=why$/);
    await expect(account.locator('#cs-why')).toBeInViewport();
    // BD, on a phone: the dialog fits the screen and its two ways on stack in reading order.
    const bd = await fresh(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await signInTo(bd, 'Duong Trinh');
    const bds = bd.getByRole('dialog', { name: 'Walkthrough complete' });
    await expect(bds).toBeVisible();
    const box = await bds.boundingBox();
    expect(box.x >= 0 && box.x + box.width <= 375 && box.y >= 0 && box.y + box.height <= 812, 'the dialog fits a phone screen').toBe(true);
    const first = await bds.getByRole('button', { name: 'Check My Next Actions' }).boundingBox();
    const second = await bds.getByRole('button', { name: 'Read Case Study' }).boundingBox();
    expect(first.y + first.height <= second.y, 'the first way on comes first').toBe(true);
    await bd.screenshot({ path: 'test-results/ticket26/walkthrough-complete-375.png' });
    await bd.keyboard.press('Escape');
    await expect(bd.getByRole('dialog')).toHaveCount(0);
    await expect(bd).toHaveURL(/#\/home$/);
    await bd.reload();
    await loaded(bd);
    await expect(bd.getByRole('dialog')).toHaveCount(0);
    // Only the walkthrough's own sample project changed.
    expect(await versionOf(page, 'NP-0001')).toBe(before);
    expect(errors).toEqual([]);
  });

  test('19 · on a phone: it starts from the top bar, works by touch, stays above the bottom navigation, and starts again from the same control', async ({ browser }) => {
    const page = await fresh(browser, { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    await signIn(page, 'Kim Ho');
    await loaded(page);
    const start = page.locator('.appbar [data-wt-start]');
    await expect(start).toBeVisible();
    await start.tap();
    await atStep(page, 'open');
    await expect(dock(page).locator('[data-role=switch]')).toContainText('This step is for BD');
    const box = await dock(page).boundingBox();
    const nav = await page.locator('.appbar .nav').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(nav.y + 1);
    await dock(page).getByRole('button', { name: 'Hide' }).tap();
    await expect(dock(page).getByRole('button', { name: 'Show' })).toBeVisible();
    await dock(page).getByRole('button', { name: 'Show' }).tap();
    // The same control with a run under way: resume it, or start again with a new sample project.
    await start.tap();
    await expect(dock(page)).toHaveAttribute('data-status', 'choose');
    await dock(page).getByRole('button', { name: 'Start again with a new sample project' }).tap();
    await atStep(page, 'open');
    await expect(dock(page)).toHaveAttribute('data-status', 'active');
    await dock(page).getByRole('button', { name: 'Exit' }).tap();
    await expect(dock(page)).toHaveCount(0);
  });
  // from the form as it is: a click or a wrong value moves nothing, a value changed back brings it back, values already
  // right are passed over, a failed save keeps the step, and only a save that succeeds completes it.
  test('24 · the highlight follows the next required action: Commercial stage, then Account owner, then Save update', async ({ browser }) => {
    test.setTimeout(300000);
    const page = await fresh(browser, { viewport: { width: 1366, height: 900 } });
    const errors = watchConsole(page);
    await signIn(page, 'Duong Trinh');
    await loaded(page);
    await page.locator('.appbar [data-wt-start]').click();
    if (await dock(page).getAttribute('data-status') === 'choose') await dock(page).getByRole('button', { name: 'Start again with a new sample project' }).click();
    await atStep(page, 'open');
    // Values already right are passed over: the sample values fill Quick intake, so its save is the action left.
    const intake = page.locator('#intake button[type=submit]');
    await expect(intake).toHaveClass(/wt-target/);
    await intake.click();
    await atStep(page, 'win');
    await dock(page).getByRole('button', { name: 'Take me there' }).click();
    const form = page.locator('#update-form');
    const stage = form.locator('[name=commercial_stage]');
    const owner = form.locator('[name=account_owner_id]');
    const submit = form.getByRole('button', { name: 'Save update' });
    const marked = page.locator('.wt-target');
    await expect(stage).toHaveClass(/wt-target/);
    await expect(marked).toHaveCount(1);
    // Opening the dropdown, or choosing a wrong stage, moves nothing.
    await stage.click();
    await page.keyboard.press('Escape');
    await stage.selectOption('contract_sent');
    await expect(stage).toHaveClass(/wt-target/);
    // "Contract signed": the sample contract reference and date are already there, so Account owner comes next.
    await stage.selectOption('won');
    await expect(owner).toHaveClass(/wt-target/);
    await expect(marked).toHaveCount(1);
    await expect(form.locator('[name=contract_reference]')).toHaveValue(/^CT-WT-/);
    // A wrong owner keeps it there; Bao Nguyen moves it to Save update, on screen and clear of the card.
    await owner.selectOption({ label: '— not assigned —' });
    await expect(owner).toHaveClass(/wt-target/);
    await owner.selectOption({ label: 'Bao Nguyen (Account)' });
    await expect(submit).toHaveClass(/wt-target/);
    await expect(marked).toHaveCount(1);
    const clear = async () => {
      const b = await submit.boundingBox(); const c = await dock(page).boundingBox(); const vh = page.viewportSize().height;
      return { onScreen: b.y >= 0 && b.y + b.height <= vh, underCard: Boolean(c && b.x < c.x + c.width && b.x + b.width > c.x && b.y < c.y + c.height && b.y + b.height > c.y) };
    };
    await expect.poll(clear).toEqual({ onScreen: true, underCard: false });
    // A value changed back brings the highlight back; set again, it moves on again.
    await stage.selectOption('lead');
    await expect(stage).toHaveClass(/wt-target/);
    await stage.selectOption('won');
    await expect(submit).toHaveClass(/wt-target/);
    // A save that fails keeps the step: the form keeps its values and the highlight stays on Save update.
    const failing = (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Unavailable (test)' } }) });
    await page.route('**/api/data/updateProject', failing);
    await submit.click();
    await expect(form.locator('[data-role=result] .banner')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(dock(page)).toHaveAttribute('data-step', 'win');
    await expect(submit).toHaveClass(/wt-target/);
    await expect(stage).toHaveValue('won');
    await page.unroute('**/api/data/updateProject', failing);
    // Paused and resumed with the values already right: the step starts at Save update.
    await dock(page).getByRole('button', { name: 'Pause' }).click();
    await expect(dock(page)).toHaveAttribute('data-status', 'paused');
    await expect(marked).toHaveCount(0);
    await dock(page).getByRole('button', { name: 'Resume' }).click();
    await expect(submit).toHaveClass(/wt-target/);
    // Another width: the highlight stays on its control, and the card moves clear of it.
    await page.setViewportSize({ width: 900, height: 800 });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toHaveClass(/wt-target/);
    await expect.poll(clear).toEqual({ onScreen: true, underCard: false });
    await page.setViewportSize({ width: 1366, height: 900 });
    // Only a save that succeeds completes the step.
    await submit.click();
    await atStep(page, 'brief');
    await expect(marked).toHaveCount(0);
    await dock(page).getByRole('button', { name: 'Exit' }).click();
    expect(errors.filter((e) => !/503|Unavailable \(test\)/.test(e))).toEqual([]);
  });
});
