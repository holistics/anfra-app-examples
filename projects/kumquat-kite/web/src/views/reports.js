// Reports: six governed Anfra reports, one tab each (#/reports/<id>), and the Holistics reports the team connected
// (#/reports/holistics). The period and client chosen in one governed report carry to the next: the host reads the
// panel's applied filter conditions from the SDK's inspection snapshots and passes them in the next report's context.
// "Add report" (a React island built with shadcn/ui components) creates a report in Holistics or connects one, and
// keeps the link with the CRM record it is about.
import { esc, errorBanner, qs, tip } from '../ui.js';
import { mountPanel } from '../anfra-host.js';
import { mountIsland } from '../islands.js';

export const REPORTS = [
  { id: 'overview', title: 'Overview', app: 'reports/overview', blurb: 'Totals, gross profit by month, top projects' },
  { id: 'monthly', title: 'Monthly trend', app: 'reports/monthly', blurb: 'Each month versus the one before' },
  { id: 'ranking', title: 'Project ranking', app: 'reports/ranking', blurb: 'Ranked by gross profit, with drill-down' },
  { id: 'pipeline', title: 'Pipeline', app: 'reports/pipeline', blurb: 'Open opportunities and estimates' },
  { id: 'cash', title: 'Cash & acceptance', app: 'reports/cash', blurb: 'Accepted work and cash received' },
  { id: 'quality', title: 'Data quality', app: 'reports/quality', blurb: 'What keeps numbers out of margin' },
];
const HOLISTICS = { id: 'holistics', title: 'Holistics reports', blurb: 'Built in Holistics, kept with CRM records' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const carried = { period: null, client: null };

let panel = null;
let islands = [];
export async function leave() {
  panel?.unmount(); panel = null;
  islands.forEach((i) => i.unmount()); islands = [];
}

export async function render(el, ctx, [id = 'overview'], params) {
  await leave();
  if (!ctx.has('bd', 'account', 'finance', 'admin')) { el.innerHTML = errorBanner({ kind: 'forbidden', message: 'Finance reports are for BD, Account, Finance and Admin.' }); return; }
  const holistics = id === HOLISTICS.id;
  const report = holistics ? null : REPORTS.find((r) => r.id === id) ?? REPORTS[0];
  el.innerHTML = `<div class="row spread"><div><h1>Reports ${tip('Every governed figure here is computed by Anfra from the same definitions as Job 360 and the Finance review. Open "Why this number?" at the bottom of a report for its definition, date basis, filters and records. "Add report" builds a report in Holistics, or connects one, next to the CRM record it is about.', { step: 6 })}</h1>
      <p class="sub">Governed figures from the shared AML definitions, and the reports your team built in Holistics. Your period and client follow you from one governed report to the next.</p></div>
      <div class="page-actions" id="report-actions"></div></div>
    <nav class="report-nav" aria-label="Reports">${REPORTS.map((r) => `<a href="#/reports/${esc(r.id)}" ${report?.id === r.id ? 'aria-current="page"' : ''}><b>${esc(r.title)}</b><span>${esc(r.blurb)}</span></a>`).join('')}
      <a class="holistics" href="#/reports/holistics" ${holistics ? 'aria-current="page"' : ''}><b>${esc(HOLISTICS.title)}</b><span>${esc(HOLISTICS.blurb)}</span></a></nav>
    <div id="report-body"></div>`;
  const body = qs('#report-body', el);
  mountIsland(qs('#report-actions', el), 'add-report', { ctx, nav: ctx.nav }).then((i) => islands.push(i)).catch((e) => console.error(e));
  if (holistics) {
    body.innerHTML = '<h2>Holistics reports</h2><div id="report-library"></div>';
    islands.push(await mountIsland(qs('#report-library', el), 'report-library', { ctx, showStatus: true, highlight: params?.get('highlight') ?? undefined }));
    return;
  }
  const filters = {};
  if (carried.period) filters.period = carried.period;
  if (carried.client) filters.client = carried.client;
  panel = await mountPanel(body, { app: report.app, scope: { report: report.id, filters }, session: ctx.session,
    getToken: ctx.getToken, height: 640, label: `${report.title} — Anfra`,
    onControls: (controls) => {
      const p = controls.period?.appliedCondition;
      if (p?.operator === 'between' && p.values?.length === 2 && p.values.every((v) => DATE.test(String(v)))) carried.period = { from: String(p.values[0]), to: String(p.values[1]) };
      const c = controls.client?.appliedCondition;
      if (c) carried.client = c.values?.length === 1 && String(c.values[0]).length <= 200 ? String(c.values[0]) : null;
    } });
}
