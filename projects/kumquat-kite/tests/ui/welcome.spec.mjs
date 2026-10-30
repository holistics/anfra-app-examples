// pointer, keyboard, touch and link, every claim shows its source and date, and nothing it renders or offers for
// download names anything but the anonymized business.
import { test, expect } from '@playwright/test';
import { signIn, watchConsole } from './helpers.mjs';

const cs = (page) => page.locator('[data-kk=case-study]');

test('21 · why, what and how: the calls to action open the walkthrough and the modules', async ({ page }) => {
  const errors = watchConsole(page);
  await signIn(page, 'Mai Le');
  await page.goto('/#/welcome');
  await expect(cs(page).getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  // The hero's call to action starts the walkthrough; its first step is BD's, so it says which persona to switch to.
  await cs(page).locator('[data-kk="hero-walkthrough"]').click();
  await expect(page.locator('[data-kk="walkthrough"]')).toHaveAttribute('data-step', 'open');
  await expect(page.locator('[data-kk="walkthrough"] [data-role=switch]')).toContainText('This step is for BD');
  await expect(page, 'it stays on Welcome instead of opening a screen Finance cannot use').toHaveURL(/#\/welcome$/);
  await page.locator('[data-kk="walkthrough"]').getByRole('button', { name: 'Exit' }).click();
  await expect(page.locator('[data-kk="walkthrough"]')).toHaveCount(0);
  // The secondary call to action is the person's own next step.
  await cs(page).getByRole('link', { name: 'Open Finance review' }).first().click();
  await expect(page).toHaveURL(/#\/finance$/);
  // Each built capability opens its module.
  await page.goto('/#/welcome');
  const open = cs(page).locator('[data-capability="implemented"] a[data-slot="button"]');
  const hrefs = await open.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(8);
  for (const href of hrefs) expect(href).toMatch(/^#\/(crm|home|tasks|finance|reports|admin|p\/NP-\d{4})/);
  await open.filter({ hasText: 'Data quality' }).click();
  await expect(page).toHaveURL(/#\/reports\/quality$/);
  // Each workflow card opens its screen.
  await page.goto('/#/welcome');
  await cs(page).locator('[data-kk=how]').getByRole('link', { name: 'Finance review' }).click();
  await expect(page).toHaveURL(/#\/finance$/);
  expect(errors).toEqual([]);
});

test('21 · sections by pointer, keyboard and link; every claim dated and sourced; nothing names the original business', async ({ page }) => {
  await signIn(page, 'Bao Nguyen');
  await page.goto('/#/welcome');
  const what = cs(page).getByRole('link', { name: /What it does/ });
  await what.click();
  await expect(page).toHaveURL(/#\/welcome\?section=what$/);
  await expect(page.locator('#cs-what')).toBeFocused();
  await expect(page.locator('#cs-what')).toBeInViewport();
  // A link straight to a section.
  await page.goto('/#/welcome?section=sources');
  await expect(page.locator('#cs-sources')).toBeInViewport();
  // Every problem has a level and a dated source, and links to the documents it rests on.
  const pains = cs(page).locator('[data-pain]');
  await expect(pains).toHaveCount(10);
  for (const p of await pains.all()) {
    await expect(p).toContainText(/Example date: \d{1,2} [A-Z][a-z]{2,3} 2026/);
    await expect(p).toContainText('Evidence.');
    expect(await p.locator('a[href^="#/welcome/doc/"]').count()).toBeGreaterThan(0);
  }
  // Questions open with the keyboard.
  const q = cs(page).locator('[data-kk=faq]').getByRole('button', { name: /Who can change a money figure/ });
  await q.focus();
  await page.keyboard.press('Enter');
  await expect(q).toHaveAttribute('aria-expanded', 'true');
  await expect(cs(page).locator('[data-kk=faq]')).toContainText('Finance approves or rejects it, never its own');
  // Pictures are described.
  for (const img of await cs(page).locator('img').all()) expect((await img.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(20);
  // The business is TP Production Studio everywhere the page and its documents speak of it.
  const text = await cs(page).innerText();
  expect(text).toContain('TP Production Studio');
  expect(text).not.toMatch(/Case study: Studio\b|the business is called Studio\b/);
  for (const id of await cs(page).locator('[data-doc]').evaluateAll((els) => els.map((e) => e.dataset.doc))) {
    await page.goto(`/#/welcome/doc/${id}`);
    const doc = page.locator('[data-kk=case-study-doc]');
    await expect(doc.locator('h2').first()).toBeVisible();
    const body = await doc.innerText();
    expect(body, `${id} uses the anonymized name`).not.toMatch(/(?<!TP Production )\bStudio\b(?! sessions| team| work)/);
  }
});
// column count, also when its last row is not full; and nothing in a cell runs past its border.
test('22 · the capability grid keeps every cell closed, with single lines, at every width', async ({ page }) => {
  await signIn(page, 'Bao Nguyen');
  await page.goto('/#/welcome?section=what');
  const grid = page.locator('[data-kk="capabilities"]');
  await expect(grid.locator('[data-capability]').first()).toBeVisible();
  const seen = new Set();
  for (const width of [375, 768, 1240, 1366, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => grid.evaluate((g) => g.getBoundingClientRect().width)).toBeGreaterThan(0);
    const m = await grid.evaluate((g) => {
      const box = g.getBoundingClientRect(); const gs = getComputedStyle(g);
      const inner = { r: box.right - parseFloat(gs.borderRightWidth), b: box.bottom - parseFloat(gs.borderBottomWidth) };
      const cells = [...g.children].map((c) => { const r = c.getBoundingClientRect(); const s = getComputedStyle(c);
        return { el: c, l: r.left, r: r.right, t: r.top, b: r.bottom, bl: parseFloat(s.borderLeftWidth), br: parseFloat(s.borderRightWidth), bt: parseFloat(s.borderTopWidth), bb: parseFloat(s.borderBottomWidth) }; });
      const near = (a, b) => Math.abs(a - b) <= 1.5;
      let open = 0; let doubled = 0; let spilled = 0;
      for (const c of cells) {
        const below = cells.find((o) => o !== c && near(o.t, c.b) && o.l < c.r - 2 && o.r > c.l + 2);
        const right = cells.find((o) => o !== c && near(o.l, c.r) && o.t < c.b - 2 && o.b > c.t + 2);
        if (!(c.bb > 0 || (below && below.bt > 0) || c.b >= inner.b - 1.5)) open += 1;
        if (!(c.br > 0 || (right && right.bl > 0) || c.r >= inner.r - 1.5)) open += 1;
        if ((c.bb > 0 && below?.bt > 0) || (c.br > 0 && right?.bl > 0)) doubled += 1;
        for (const k of c.el.querySelectorAll('*')) { const r = k.getBoundingClientRect(); if (r.width && r.right > c.r + 0.5) spilled += 1; }
      }
      const columns = new Set(cells.map((c) => Math.round(c.l))).size;
      return { columns, full: cells.length % columns === 0, open, doubled, spilled };
    });
    seen.add(m.full ? 'full' : 'partial');
    expect(m, `${width}px (${m.columns} columns)`).toMatchObject({ open: 0, doubled: 0, spilled: 0 });
  }
  expect([...seen].sort(), 'both full and partly filled last rows were checked').toEqual(['full', 'partial']);
});
// option is presented, the named phrases are gone, and nothing removed leaves an empty card, an orphaned problem or a
// dead link behind.
const UNWANTED = [/the source\b/i, /the findings/i, /the what\b/i, /room reservations? with/i, /automatic connections?/i, /planned next/i,
  /planned, not built/i, /not built/i, /coming soon/i, /roadmap/i, /\bnot configured\b/i, /\bnot connected\b/i];
const unwanted = (text) => UNWANTED.filter((re) => re.test(text)).map(String);

test('23 · only what this copy does: no planned features, roadmap or named phrases, and nothing left empty', async ({ browser }) => {
  const as = async (name) => { const context = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const page = await context.newPage(); await signIn(page, name); return { context, page }; };
  const { context, page } = await as('Bao Nguyen');
  const errors = watchConsole(page);
  await page.goto('/#/welcome');
  await expect(cs(page).locator('[data-capability]').first()).toBeVisible();
  const closed = cs(page).locator('[data-kk=faq] button[aria-expanded="false"]');
  while (await closed.count()) await closed.first().click();
  expect(unwanted(await cs(page).innerText()), 'the Welcome guide, every answer open').toEqual([]);
  await expect(cs(page).locator('[data-kk=faq] button')).not.toContainText([/planned/i]);
  // Every capability is built, says what it does, and leads somewhere real; every problem it names is on the page.
  const caps = cs(page).locator('[data-capability]');
  for (const c of await caps.all()) {
    await expect(c).toHaveAttribute('data-capability', 'implemented');
    expect((await c.locator('p').first().innerText()).length, 'a capability says what it does').toBeGreaterThan(30);
  }
  const named = await cs(page).locator('[data-capability] a[href="#/welcome?section=why"] [title]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('title')))]);
  const problems = await cs(page).locator('[data-pain]').evaluateAll((els) => els.map((e) => e.querySelector('[data-slot="card-title"]')?.textContent?.trim()));
  for (const n of named) expect(problems, `"${n}" is a problem on the page`).toContain(n);
  for (const p of problems) expect(named, `"${p}" is answered by a capability`).toContain(p);
  // The tools are the ones this copy works with, each with a sentence that says how.
  for (const t of await cs(page).locator('[data-tool]').all()) { await expect(t).toHaveAttribute('data-tool', 'implemented'); expect((await t.innerText()).length).toBeGreaterThan(40); }
  // Inside the app: the Money tab, Studio sessions and the Holistics screen and dialog say only what works.
  await page.goto('/#/p/NP-0001/money');
  await expect(page.locator('#money-lines')).toContainText('brought in as approved values by an import');
  await expect(page.locator('#money-lines')).toContainText('Imported as approved');
  expect(unwanted(await page.locator('#view').innerText()), 'Job 360 → Money').toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
  const studio = await as('Khai Vo');
  await studio.page.goto('/#/tasks/studio');
  await expect(studio.page.locator('#view .banner')).toContainText('They are records, not room reservations');
  expect(unwanted(await studio.page.locator('#view').innerText()), 'Tasks → Studio sessions').toEqual([]);
  await expect(studio.page.locator('#view')).not.toContainText(/\byet\b/);
  await studio.context.close();
  const admin = await as('Kim Ho');
  await admin.page.goto('/#/reports/holistics');
  await expect(admin.page.getByText('How Kumquat Kite works with Holistics')).toBeVisible();
  expect(unwanted(await admin.page.locator('#view').innerText()), 'Reports → Holistics').toEqual([]);
  await admin.page.locator('[data-kk=report-library] button', { hasText: /Add report|Connect a report/ }).first().click()
    .catch(async () => admin.page.getByRole('button', { name: /Add report/ }).first().click());
  const dlg = admin.page.getByRole('dialog');
  await dlg.getByRole('tab', { name: /Connect a report/ }).click();
  await expect(dlg.getByLabel('Report address')).toBeVisible();
  await expect(dlg.getByText('Embedded dashboard'), 'no embedding option while embedding is not set up').toHaveCount(0);
  await admin.context.close();
});
