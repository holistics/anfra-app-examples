// The demo's workflows through the real interface, in order: they share one freshly seeded database.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { signIn, panel, watchConsole } from './helpers.mjs';

test.describe.serial('Kumquat Kite POC', () => {
  test('1 · BD creates an opportunity in the UI; Account opens the same record after a reload', async ({ browser }) => {
    const bdCtx = await browser.newContext(); const bd = await bdCtx.newPage();
    const errors = watchConsole(bd);
    await signIn(bd, 'Duong Trinh');
    await bd.goto('/#/crm/new');
    await bd.getByLabel('New client name').fill('Tidewater Teas (sample)');
    await bd.getByLabel('Project / opportunity').fill('Autumn tea livestream (sample)');
    await bd.locator('#intake textarea[name=note]').fill('Client wants two livestreams before the autumn sale.');
    await bd.locator('#intake input[name=next_action]').fill('Send the credentials deck');
    await bd.locator('#intake input[name=next_action_due]').fill('2026-10-21');
    await bd.getByRole('button', { name: 'Save opportunity' }).click();
    await expect(bd).toHaveURL(/#\/p\/NP-\d+\/overview/);
    const ref = bd.url().match(/NP-\d+/)[0];
    await expect(bd.getByRole('heading', { name: 'Autumn tea livestream (sample)' })).toBeVisible();

    const accountCtx = await browser.newContext(); const account = await accountCtx.newPage();
    await signIn(account, 'Bao Nguyen');
    await account.goto(`/#/p/${ref}/overview`);
    await account.reload();
    await expect(account.getByRole('heading', { name: 'Autumn tea livestream (sample)' })).toBeVisible();
    await expect(account.locator('.sub').first()).toContainText(ref);
    await expect(account.locator('#next-action')).toContainText('Send the credentials deck');
    await expect(account.locator('#next-action')).toContainText('21 Oct 2026');
    expect(errors).toEqual([]);
    await bdCtx.close(); await accountCtx.close();
  });

  test('2 · Account links a brief and assigns Design work; the designer sees it in My work', async ({ browser }) => {
    const accountCtx = await browser.newContext(); const account = await accountCtx.newPage();
    await signIn(account, 'Bao Nguyen');
    await account.goto('/#/p/NP-0001/overview');
    await account.locator('#update-form select[name=brief_status]').selectOption('ready');
    await account.locator('#update-form input[name=brief_url]').fill('https://example.com/kumquat-demo/briefs/np-0001');
    await account.getByRole('button', { name: 'Save update' }).click();
    await expect(account.locator('.toast').last()).toContainText(/Saved NP-0001/);
    await account.goto('/#/p/NP-0001/work');
    const form = account.locator('#work-form');
    await form.locator('select[name=assignee_id]').selectOption({ label: 'Khai Vo (Design)' });
    await form.locator('input[name=title]').fill('Livestream frame for the sample setup');
    // Due in two weeks, so it is under "My other next actions" on the designer's home whatever day the test runs.
    const due = new Date(Date.now() + 14 * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    await form.locator('input[name=due_at]').fill(`${due}T17:00`);
    await form.getByRole('button', { name: 'Assign' }).click();
    await expect(account.locator('.toast').last()).toContainText(/Assigned WI-\d+ to Khai Vo/);

    const designCtx = await browser.newContext(); const design = await designCtx.newPage();
    await signIn(design, 'Khai Vo');
    await expect(design.locator('section', { hasText: 'My other next actions' })).toContainText('Livestream frame for the sample setup');
    await design.goto('/#/tasks/mine');
    const card = design.locator('article.item', { hasText: 'Livestream frame for the sample setup' });
    await card.getByRole('button', { name: 'Start' }).click();
    await expect(design.locator('.toast').last()).toContainText(/In progress/);
    await accountCtx.close(); await designCtx.close();
  });

  test('3 · Account proposes 70m: a failed save keeps the draft; then the scenario shows 30% while approved stays 40%', async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page, 'Bao Nguyen');
    await page.goto('/#/p/NP-0001/money');
    await expect(panel(page).locator('[data-kk=approved-margin]')).toHaveText('40%');
    await expect(panel(page).locator('[data-kk=scenario-margin]')).toHaveText('40%');
    await page.locator('tr', { hasText: 'CO-0003' }).getByRole('button', { name: 'Propose a change' }).click();
    const form = page.locator('#proposal-form');
    await form.getByLabel(/Proposed amount/).fill('70000000');
    await form.getByLabel('Reason', { exact: true }).fill('The set supplier raised its material prices');
    await form.getByLabel(/Evidence link/).fill('https://example.com/kumquat-demo/evidence/np-0001-new-quote');
    await page.route('**/api/data/submitChange', (route) => route.abort('internetdisconnected'));
    await form.getByRole('button', { name: 'Send to Finance' }).click();
    await expect(form.getByRole('alert')).toContainText('Cannot reach the server');
    await expect(form.getByLabel(/Proposed amount/)).toHaveValue('70000000');
    await expect(form.getByLabel('Reason', { exact: true })).toHaveValue('The set supplier raised its material prices');
    await page.unroute('**/api/data/submitChange');
    await form.getByRole('button', { name: 'Send to Finance' }).click();
    await expect(page.locator('.toast').last()).toContainText(/Sent CR-\d+ to Finance/);
    await expect(panel(page).locator('[data-kk=scenario-margin]')).toHaveText('30%');
    await expect(panel(page).locator('[data-kk=approved-margin]')).toHaveText('40%');
    await expect(panel(page).locator('#expect')).toContainText('The scenario includes proposal');
    await expect(page.locator('section', { hasText: 'Proposed changes' }).first()).toContainText('Waiting for Finance');
    expect(errors.filter((e) => !/Failed to fetch|ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
  });

  test('4 · BD cannot approve: the database refuses it and the proposal stays pending', async ({ page }) => {
    await signIn(page, 'Duong Trinh');
    await page.goto('/#/finance');
    await page.locator('a.item', { hasText: 'NP-0001' }).click();
    await page.getByRole('button', { name: /^Approve/ }).click();
    await expect(page.locator('#decide [role=alert]')).toContainText('Not allowed');
    await page.reload();
    await expect(page.locator('a.item', { hasText: 'NP-0001' })).toBeVisible();
  });

  test('5 · Finance approves: a new revision is saved, Anfra shows 30%, a reload keeps it, and history explains the 40%', async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page, 'Mai Le');
    await page.goto('/#/finance');
    await page.locator('a.item', { hasText: 'NP-0001' }).click();
    await expect(panel(page).locator('[data-kk=approved-margin]')).toHaveText('40%');
    await expect(panel(page).locator('[data-kk=scenario-margin]')).toHaveText('30%');
    await page.locator('#decide textarea[name=comment]').fill('Checked against the new quotation');
    await page.getByRole('button', { name: /^Approve/ }).click();
    await expect(page.locator('#decide .banner.ok')).toContainText(/Saved the new revision REV-\d+/);
    await expect(panel(page).locator('[data-kk=approved-margin]')).toHaveText('30%');
    await expect(panel(page).locator('#expect')).toContainText(/Showing revision REV-\d+/);

    await page.goto('/#/p/NP-0001/money');
    await page.reload();
    await expect(panel(page).locator('[data-kk=approved-margin]')).toHaveText('30%');
    await expect(page.locator('tr', { hasText: 'CO-0003' }).first()).toContainText('70,000,000 VND');
    await expect(panel(page).locator('#versions')).toContainText('40%');
    await expect(panel(page).locator('#versions')).toContainText('30%');
    await page.goto('/#/p/NP-0001/history');
    await expect(page.locator('.timeline').first()).toContainText(/Finance approved CR-\d+: CO-0003 60,000,000 → 70,000,000 VND/);
    await expect(page.locator('table').first()).toContainText('Superseded');
    expect(errors).toEqual([]);
  });

  test('6 · A stale edit becomes a recoverable conflict, never an overwrite', async ({ browser }) => {
    const ctxA = await browser.newContext(); const ctxB = await browser.newContext();
    const a = await ctxA.newPage(); const b = await ctxB.newPage();
    await signIn(a, 'Bao Nguyen');
    await signIn(b, 'Duong Trinh');
    await a.goto('/#/p/NP-0005/overview');
    await b.goto('/#/p/NP-0005/overview');
    await a.locator('#update-form textarea[name=latest_note]').fill('Account: schedule sent again for approval.');
    await a.getByRole('button', { name: 'Save update' }).click();
    await expect(a.locator('.toast').last()).toContainText(/Saved NP-0005/);
    await b.locator('#update-form input[name=next_action_due]').fill('2026-10-21');
    await b.getByRole('button', { name: 'Save update' }).click();
    await expect(b.locator('#update-form [role=alert]')).toContainText('Someone else saved');
    await expect(b.locator('#update-form table.diff')).toContainText('2026-10-21');
    await b.getByRole('button', { name: 'Apply my changes to the latest version' }).click();
    await expect(b.locator('.toast').last()).toContainText(/Applied your changes to the latest version/);
    await expect(b.locator('#next-action')).toContainText('21 Oct 2026');
    await ctxA.close(); await ctxB.close();
  });

  test('7 · Keyboard: open a project from the CRM list with Enter', async ({ page }) => {
    await signIn(page, 'Duong Trinh');
    await page.goto('/#/crm');
    await page.locator('tr[data-ref="NP-0013"]').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/p\/NP-0013\/overview/);
  });

  test('8 · Studio records a session on a phone-sized screen, with no sideways scrolling', async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await phone.newPage();
    await signIn(page, 'Khoi Dang');
    await page.goto('/#/tasks/mine');
    const card = page.locator('article.item', { hasText: 'Livestream 7' });
    await card.getByRole('button', { name: 'Record actual times' }).click();
    await card.locator('input[name=actual_start]').fill('2026-10-16T19:02');
    await card.locator('input[name=actual_end]').fill('2026-10-16T21:58');
    await card.locator('input[name=session_note]').fill('Started 2 minutes late; no incidents.');
    await card.getByRole('button', { name: 'Save actual times' }).click();
    await expect(page.locator('.toast').last()).toContainText(/Saved WI-\d+/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await phone.close();
  });

  test('9 · Design sees no finance figures, and the Anfra proxy refuses their token', async ({ page }) => {
    await signIn(page, 'Khai Vo');
    await page.goto('/#/reports');
    await expect(page.getByRole('alert')).toContainText('Finance reports are for BD, Account, Finance and Admin');
    await page.goto('/#/p/NP-0004/money');
    await expect(page.locator('.banner.warn').first()).toContainText('Governed finance figures are shown to');
    const status = await page.evaluate(async () => {
      const s = JSON.parse(sessionStorage.getItem('kk-auth'));
      const r = await fetch('/anfra/api/core.query', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ dataset: 'kumquat_finance', query: 'explore { measures { m: approved_gross_margin } }' }) });
      return r.status;
    });
    expect(status).toBe(403);
  });

  test('10 · Reports: governed totals after the approval, the monthly trend, ties in the ranking, and a selection that opens Job 360', async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page, 'Mai Le');
    await page.goto('/#/reports');
    const f = panel(page);
    await expect(f.locator('#k-gp')).toHaveText('330,000,000 VND');
    await expect(f.locator('#k-gm')).toHaveText('44%');
    await expect(f.locator('#c-monthly[data-drawn="true"]')).toBeVisible();
    await page.locator('.report-nav').getByRole('link', { name: /Monthly trend/ }).click();
    await expect(page).toHaveURL(/#\/reports\/monthly/);
    await expect(panel(page).locator('#monthly')).toContainText('October 2026');
    await page.locator('.report-nav').getByRole('link', { name: /Project ranking/ }).click();
    const r = panel(page);
    await expect(r.locator('#ranking')).toContainText('tied');
    await r.locator('#ranking tr[data-i="0"]').click();
    await expect(page.locator('.panel-selection')).toContainText('NP-0004');
    await expect(r.locator('#support-scope')).toContainText('NP-0004');
    await page.getByRole('link', { name: /Open Job 360 NP-0004/ }).click();
    await expect(page).toHaveURL(/#\/p\/NP-0004\/money/);
    expect(errors).toEqual([]);
  });

  test('11 · Reports: the chosen client follows you to the next report, and long tables page through every row', async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page, 'Mai Le');
    await page.goto('/#/reports/ranking');
    const f = panel(page);
    await expect(f.locator('#support .pager')).toContainText('Rows 1–10 of 29');
    await f.locator('#support [data-pg="next"]').click();
    await expect(f.locator('#support .pager')).toContainText('Rows 11–20 of 29');
    await f.locator('#support [data-pg="next"]').click();
    await expect(f.locator('#support .pager')).toContainText('Rows 21–29 of 29');
    await expect(f.locator('#support [data-pg="next"]')).toBeDisabled();
    await f.locator('#client').selectOption('Calm Nut Milk (sample)');
    await expect(f.locator('#ranking')).not.toContainText('NP-0004');
    await expect(f.locator('#ranking')).toContainText('NP-0009');
    await page.locator('.report-nav').getByRole('link', { name: /Cash & acceptance/ }).click();
    const c = panel(page);
    await expect(c.locator('#client')).toHaveValue('Calm Nut Milk (sample)');
    await expect(c.locator('#projects')).toContainText('NP-0009');
    await expect(c.locator('#projects')).not.toContainText('NP-0011');
    expect(errors).toEqual([]);
  });

  test('12 · Bring your data: download the template, see the fixes it needs, import it, and import it again with no change', async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page, 'Kim Ho');
    await page.goto('/#/admin/import');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download the template (CSV)' }).click();
    const template = fs.readFileSync(await (await downloading).path(), 'utf8');
    expect(template).toContain('record_id,client_id,client_name');
    const sheet = `${template}DEAL-004,CL-NEW,New Client (sample),brand,A row with a bad stage (sample),event,hot,bd.demo@example.com,,,,,,,,,,,,,synthetic\r\n`;
    await page.getByLabel(/Where is this sheet kept/).fill('UI test sheet');
    await page.getByLabel('Filled template (CSV)').setInputFiles({ name: 'deals.csv', mimeType: 'text/csv', buffer: Buffer.from(sheet) });
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const out = page.locator('#template-result');
    await expect(out).toContainText('1 fix(es) needed');
    await expect(out).toContainText('stage "hot" is not one of');
    await expect(out).toContainText('preview: nothing written yet');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(out).toContainText('— imported');
    await expect(out.locator('tbody tr', { hasText: 'Project' }).first().locator('td').nth(2)).toHaveText('3');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(out.locator('tbody tr', { hasText: 'Project' }).first().locator('td').nth(2)).toHaveText('0');
    await page.goto('/#/crm?q=Holiday livestream');
    await expect(page.locator('#view')).toContainText('Holiday livestream series (sample)');
    // A long table in Import & access pages through every row: the bundled snapshot's import run has 16 rows.
    await page.goto('/#/admin/snapshot');
    await page.locator('[data-batch]', { hasText: 'IMP-0002' }).click();
    await expect(page.locator('[data-run-rows] .pager')).toContainText('Rows 1–15 of 16');
    await page.locator('[data-run-rows] [data-pg="next"]').click();
    await expect(page.locator('[data-run-rows] .pager')).toContainText('Rows 16–16 of 16');
    await expect(page.locator('[data-run-rows] [data-pg="next"]')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('13 · Admin resets the demo to its starting state; it asks for confirmation and logs who did it', async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page, 'Kim Ho');
    await page.goto('/#/admin/demo');
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await expect(page.locator('#reset-result')).toContainText('Tick the box');
    await page.getByLabel(/I understand that changes made since the demo started will be lost/).check();
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await expect(page.locator('#reset-result')).toContainText('Demo data reset');
    await expect(page.locator('[data-resets]')).toContainText('Kim Ho');
    await page.goto('/#/p/NP-0001/money');
    await expect(panel(page).locator('[data-kk=approved-margin]')).toHaveText('40%');
    await page.goto('/#/crm?q=Holiday livestream');
    await expect(page.locator('#view')).not.toContainText('Holiday livestream series (sample)');
    expect(errors).toEqual([]);
  });

  test('14 · A new user finds the welcome guide in their own menu, and the tips explain each step', async ({ page }) => {
    await signIn(page, 'Khai Vo');
    await expect(page.locator('#welcome-banner')).toBeVisible();
    await page.locator('[data-kk="user-menu"]').click();
    await page.getByRole('menuitem', { name: /Welcome guide/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: /One record for every job/ })).toBeVisible();
    await expect(page.locator('[data-kk=how] > li')).toHaveCount(8);
    await page.goto('/#/home');
    await expect(page.locator('#welcome-banner')).toHaveCount(0);
    const help = page.locator('.title-row [data-tip]').first();
    await help.focus();
    await expect(help.locator('.tip-text')).toBeVisible();
    await expect(help.locator('.tip-text')).toContainText('Step 2.');
    await page.keyboard.press('Escape');
    await expect(help.locator('.tip-text')).toBeHidden();
    await page.locator('[data-kk="user-menu"]').click();
    await page.getByRole('menuitemcheckbox', { name: /Help tips/ }).click();
    await expect(help).toBeHidden();
    await page.locator('[data-kk="user-menu"]').click();
    await expect(page.getByRole('menuitemcheckbox', { name: /Help tips/ })).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');
  });

  test('15 · Tables and figures stay inside their cards on a small laptop and on a phone', async ({ browser }) => {
    for (const viewport of [{ width: 1024, height: 800 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, locale: 'en-GB', timezoneId: 'Asia/Ho_Chi_Minh' });
      const page = await context.newPage();
      await signIn(page, 'Mai Le');
      for (const [hash, ready] of [['#/p/NP-0008/money', '[data-kk=approved-margin]'], ['#/reports/monthly', '#monthly table'], ['#/reports/ranking', '#ranking table'], ['#/reports/cash', '#projects table']]) {
        await page.goto(`/${hash}`);
        const f = panel(page);
        await expect(f.locator(ready).first()).toBeVisible();
        const problems = await f.locator('body').evaluate(() => {
          const out = [];
          for (const t of document.querySelectorAll('table')) {
            if (!t.getClientRects().length || t.closest('details:not([open])')) continue;
            const wrap = t.closest('.table-wrap'); const block = t.closest('.block');
            if (!wrap) out.push('a table without a scroll container');
            else if (block && wrap.getBoundingClientRect().right > block.getBoundingClientRect().right + 1) out.push('a table container past its card');
          }
          for (const v of document.querySelectorAll('dl.kpi dd, .figure')) {
            const card = v.closest('.block').getBoundingClientRect(); const r = v.getBoundingClientRect();
            if (r.right > card.right + 1) out.push(`"${v.textContent.trim()}" past its card`);
          }
          for (const dd of document.querySelectorAll('dl.kpi dd')) {
            const range = document.createRange(); range.selectNodeContents(dd.previousElementSibling); const v = dd.getBoundingClientRect();
            if ([...range.getClientRects()].some((t) => Math.min(t.right, v.right) - Math.max(t.left, v.left) > 1 && Math.min(t.bottom, v.bottom) - Math.max(t.top, v.top) > 1)) out.push(`"${dd.previousElementSibling.textContent.trim()}" runs into its value`);
          }
          if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push('the panel scrolls sideways');
          return out;
        });
        expect(problems, `${viewport.width}px ${hash}`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${viewport.width}px ${hash}: the page scrolls sideways`).toBe(true);
      }
      await context.close();
    }
  });

  // Label/value rows of the money panel: the label's painted text never runs into its value (bug 11).
  const panelOverlaps = (page) => panel(page).locator('body').evaluate(() => {
    const out = [];
    for (const dd of document.querySelectorAll('dl.kpi dd')) {
      const range = document.createRange(); range.selectNodeContents(dd.previousElementSibling); const v = dd.getBoundingClientRect();
      if ([...range.getClientRects()].some((t) => Math.min(t.right, v.right) - Math.max(t.left, v.left) > 1 && Math.min(t.bottom, v.bottom) - Math.max(t.top, v.top) > 1)) out.push(dd.previousElementSibling.textContent.trim());
    }
    return out;
  });

  test('16 · Finance Review: the detail uses the whole workspace, and stays readable and usable when the window is resized', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'en-GB', timezoneId: 'Asia/Ho_Chi_Minh' });
    const page = await context.newPage();
    const errors = watchConsole(page);
    await signIn(page, 'Mai Le');
    await page.goto('/#/finance');
    await page.locator('a.item[href*="cr="]').first().click();
    await expect(panel(page).locator('[data-kk=approved-margin]')).toContainText('%');
    const geometry = () => page.evaluate(() => {
      const view = document.querySelector('#view'); const cs = getComputedStyle(view);
      const inner = view.getBoundingClientRect().right - parseFloat(cs.paddingRight);
      const shown = (sel) => getComputedStyle(document.querySelector(sel)).display !== 'none';
      const approve = [...document.querySelectorAll('#decide button')].find((b) => /Approve/.test(b.textContent)).getBoundingClientRect();
      return { gap: Math.round(inner - document.querySelector('.split-detail').getBoundingClientRect().right), sideways: document.documentElement.scrollWidth - window.innerWidth,
        list: shown('.split-list'), back: shown('.split-back'), approveInside: approve.right <= window.innerWidth && approve.left >= 0 };
    });
    for (const width of [1920, 375, 1366, 2560, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(400);
      const g = await geometry();
      expect(Math.abs(g.gap), `${width}px: the detail reaches the content's right edge`).toBeLessThanOrEqual(1);
      expect(g.sideways, `${width}px: no sideways scrolling`).toBeLessThanOrEqual(0);
      expect(g.list, `${width}px: the list beside the detail only on a wide screen`).toBe(width > 1100);
      expect(g.back, `${width}px: a way back to the inbox on a narrow screen`).toBe(width <= 1100);
      expect(g.approveInside, `${width}px: the Approve button is fully on screen`).toBe(true);
      expect(await panelOverlaps(page), `${width}px: label/value rows`).toEqual([]);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('link', { name: /Back to the review inbox/ }).click();
    await expect(page).toHaveURL(/#\/finance$/);
    await expect(page.locator('.split-list')).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  });

  test('17 · Reports: "Add report" opens Holistics or connects a report, which is saved, reopened and leads back to its project', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    const errors = watchConsole(page);
    await signIn(page, 'Mai Le');
    await page.goto('/#/reports/overview');
    await page.locator('[data-kk=add-report]').click();
    const dlg = page.getByRole('dialog');
    const open = dlg.getByRole('link', { name: /Open Holistics/ });
    await expect(open).toHaveAttribute('href', 'https://bi.holistics.io/');
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(dlg.getByText('Opens Holistics only')).toBeVisible();
    await dlg.getByLabel('CRM record').selectOption('project');
    const project = dlg.getByLabel('Project');
    await expect(project.locator('option')).not.toHaveCount(1);
    await project.selectOption(await project.evaluate((s) => [...s.options].find((o) => o.text.startsWith('NP-0003')).value));
    await dlg.getByRole('button', { name: /I have the report link/ }).click();
    await dlg.getByLabel('Report address').fill('https://reports.example.com/weekly');
    await dlg.getByLabel('Title').fill('Weekly pipeline (sample)');
    await dlg.getByRole('button', { name: 'Save report link' }).click();
    await expect(dlg.getByText(/not a Holistics address/)).toBeVisible();
    await expect(dlg.getByLabel('Title')).toHaveValue('Weekly pipeline (sample)');
    await dlg.getByLabel('Report address').fill('https://bi.holistics.io/dashboards/v4/0003-ui-test-sample');
    await dlg.getByRole('button', { name: 'Save report link' }).click();
    await expect(page).toHaveURL(/#\/reports\/holistics\?highlight=RP-\d{4}/);
    const ref = page.url().match(/RP-\d{4}/)[0];
    const card = page.locator(`[data-report-ref="${ref}"]`);
    await expect(card.getByRole('link', { name: /Open in Holistics/ })).toHaveAttribute('href', 'https://bi.holistics.io/dashboards/v4/0003-ui-test-sample');
    await expect(page.getByText('Kumquat Kite sends it no data')).toBeVisible();
    await expect(page.getByText(/Not configured|Not connected/), 'only what works in this copy is listed').toHaveCount(0);
    await page.reload();
    await expect(card).toBeVisible();
    await card.getByRole('link', { name: /Back to NP-0003/ }).click();
    await expect(page).toHaveURL(/#\/p\/NP-0003\/overview/);
    await expect(page.locator(`#project-reports [data-report-ref="${ref}"]`)).toBeVisible();

    const other = await browser.newContext(); const account = await other.newPage();
    await signIn(account, 'Bao Nguyen');
    await account.goto('/#/reports/holistics');
    const theirs = account.locator(`[data-report-ref="${ref}"]`);
    await expect(theirs).toBeVisible();
    await expect(theirs.getByRole('button', { name: /Edit|Remove/ })).toHaveCount(0);
    await other.close();

    await card.getByRole('button', { name: /Remove/ }).click();
    await card.getByRole('button', { name: /Yes, remove/ }).click();
    await expect(page.locator(`#project-reports [data-report-ref="${ref}"]`)).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('18 · Welcome: the TP Production Studio case study says why, what and how, with dated sources and readable documents, on a phone and a large monitor', async ({ browser }) => {
    for (const viewport of [{ width: 375, height: 812 }, { width: 2560, height: 1440 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = watchConsole(page);
      await signIn(page, 'Khai Vo');
      await page.goto('/#/welcome');
      const cs = page.locator('[data-kk=case-study]');
      await expect(cs.getByRole('heading', { level: 1 })).toContainText('One record for every job');
      await expect(cs.locator('[data-pain]')).toHaveCount(10);
      await expect(cs.locator('[data-role=latest]')).toContainText('invented demonstrations of app features');
      for (const gone of ['In the first session, a representative', 'Raised, but outside this proof of concept', 'Results so far', 'Measured: nothing yet']) {
        await expect(cs.getByText(gone), `${viewport.width}px: no "${gone}"`).toHaveCount(0);
      }
      await expect(cs.locator('[data-kk=impact]')).toHaveCount(0);
      await expect(cs.locator('[data-capability]')).toHaveCount(14);
      await expect(cs.locator('[data-capability]:not([data-capability="implemented"])'), 'only what this copy does').toHaveCount(0);
      await expect(cs.locator('[data-kk=how] > li')).toHaveCount(8);
      const docs = cs.locator('[data-doc]');
      expect(await docs.count(), 'documents are published').toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${viewport.width}px: no sideways scrolling`).toBeLessThanOrEqual(0);
      const first = docs.first();
      const id = await first.getAttribute('data-doc');
      const download = page.waitForEvent('download');
      await first.getByRole('button', { name: /Download/ }).click();
      expect((await download).suggestedFilename()).toBe(`tp-production-studio-${id}.md`);
      await first.getByRole('link', { name: /Read/ }).click();
      await expect(page).toHaveURL(new RegExp(`#/welcome/doc/${id}$`));
      await expect(page.locator('[data-kk=case-study-doc] h2').first()).toBeVisible();
      expect(await page.locator('body').innerText()).not.toContain('Kumquat Kite Studio');
      await page.getByRole('link', { name: /Back to the Welcome guide/ }).click();
      await expect(cs).toBeVisible();
      expect(errors).toEqual([]);
      await context.close();
    }
  });

  test('19 · Touch and keyboard: tips and questions work by tap on a phone; dialogs open, trap and return focus from the keyboard', async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await phone.newPage();
    await signIn(page, 'Mai Le');
    await page.goto('/#/reports/holistics');
    const tipButton = page.locator('.title-row [data-tip], h1 [data-tip]').first();
    await tipButton.tap();
    await expect(tipButton.locator('.tip-text')).toBeVisible();
    await page.goto('/#/welcome');
    await page.locator('[data-kk=faq]').getByRole('button', { name: /real customer data/ }).tap();
    await expect(page.locator('[data-kk=faq]')).toContainText('The records, screenshots and guide use synthetic examples');
    await phone.close();

    const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const p2 = await desk.newPage();
    await signIn(p2, 'Mai Le');
    await p2.goto('/#/reports/holistics');
    const add = p2.locator('[data-kk=add-report]');
    await add.focus();
    await p2.keyboard.press('Enter');
    const dlg = p2.getByRole('dialog');
    await expect(dlg).toBeVisible();
    for (let i = 0; i < 12; i += 1) await p2.keyboard.press('Tab');
    expect(await dlg.evaluate((d) => d.contains(document.activeElement)), 'focus stays inside the dialog').toBe(true);
    await p2.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(add).toBeFocused();
    await desk.close();
  });
});
