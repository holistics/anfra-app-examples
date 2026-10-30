#!/usr/bin/env node
// Reconciles every governed number the app shows against an independent SQL computation on the operational tables
// (Admin connection), not on the reporting views Anfra reads. Each check names the AQL it ran.
// Writes test-results/reconciliation.json and exits non-zero when a check fails.
//   node scripts/reconcile.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import { ownerClient } from './lib/db.mjs';
import { startAnfra } from './lib/anfra.mjs';
import { ROOT } from './lib/env.mjs';

const DATASET = 'kumquat_finance';
const checks = [];
const num = (v) => (v === null || v === undefined ? null : Number(v));
const same = (a, b, tol = 1e-6) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)));
function record(name, ok, detail) { checks.push({ name, ok, ...detail }); }
function compareRows(name, aql, aqlRows, sqlRows, key, fields) {
  const byKey = new Map(sqlRows.map((r) => [String(r[key]), r]));
  const mismatches = [];
  for (const a of aqlRows) {
    const s = byKey.get(String(a[key]));
    if (!s) { mismatches.push({ [key]: a[key], problem: 'only in AQL' }); continue; }
    for (const [af, sf, tol] of fields) {
      if (!same(num(a[af]), num(s[sf]), tol)) mismatches.push({ [key]: a[key], field: af, aql: a[af], sql: s[sf] });
    }
    byKey.delete(String(a[key]));
  }
  for (const k of byKey.keys()) mismatches.push({ [key]: k, problem: 'only in SQL' });
  record(name, mismatches.length === 0, { aql, rows: aqlRows.length, mismatches });
}

// Approved money per project, from the operational tables.
const PER_PROJECT_SQL = `
with rev as (
  select coalesce(s.project_id, c.project_id) as project_id, r.line_type, r.amount, r.amount_status
  from public.money_revisions r
  left join public.service_lines s on s.id = r.service_line_id
  left join public.cost_lines c on c.id = r.cost_line_id
  where r.status = 'approved'
), per as (
  select project_id, sum(amount) filter (where line_type = 'revenue') as revenue,
         sum(amount) filter (where line_type = 'cost') as cost_known,
         count(*) filter (where line_type = 'revenue') as rev_lines, count(*) filter (where line_type = 'cost') as cost_lines,
         count(*) filter (where amount_status = 'unknown') as unknown
  from rev group by project_id
)
select p.project_ref, to_char(p.contract_signed_date, 'YYYY-MM') as contract_month, per.revenue, per.cost_known, per.unknown,
       (per.rev_lines > 0 and per.cost_lines > 0 and per.unknown = 0) as complete,
       case when per.rev_lines > 0 and per.cost_lines > 0 and per.unknown = 0 then per.revenue end as matching_revenue,
       case when per.rev_lines > 0 and per.cost_lines > 0 and per.unknown = 0 then per.cost_known end as complete_cost,
       case when per.rev_lines > 0 and per.cost_lines > 0 and per.unknown = 0 then per.revenue - per.cost_known end as gross_profit,
       case when per.rev_lines > 0 and per.cost_lines > 0 and per.unknown = 0 and per.revenue > 0
            then (per.revenue - per.cost_known) / per.revenue end as gross_margin
from per join public.projects p on p.id = per.project_id`;

const SCENARIO_SQL = `
with appr as (
  select coalesce(s.project_id, c.project_id) as project_id, coalesce(r.service_line_id, r.cost_line_id) as line_id, r.line_type,
         r.amount, r.amount_status
  from public.money_revisions r
  left join public.service_lines s on s.id = r.service_line_id
  left join public.cost_lines c on c.id = r.cost_line_id
  where r.status = 'approved'
), pend as (select * from public.change_requests where status = 'pending'),
scen as (
  select a.project_id, a.line_type, case when p.id is not null then p.proposed_amount else a.amount end as amount,
         case when p.id is not null then p.proposed_amount_status else a.amount_status end as amount_status
  from appr a left join pend p on (a.line_type = 'cost' and p.cost_line_id = a.line_id) or (a.line_type = 'revenue' and p.service_line_id = a.line_id)
  union all
  select project_id, case when target_type = 'new_service_line' then 'revenue' else 'cost' end, proposed_amount, proposed_amount_status
  from pend where target_type in ('new_cost_line', 'new_service_line')
), per as (
  select project_id, sum(amount) filter (where line_type = 'revenue') as revenue, sum(amount) filter (where line_type = 'cost') as cost_known,
         count(*) filter (where line_type = 'revenue') as rev_lines, count(*) filter (where line_type = 'cost') as cost_lines,
         count(*) filter (where amount_status = 'unknown') as unknown
  from scen group by project_id
)
select p.project_ref, per.revenue,
       case when rev_lines > 0 and cost_lines > 0 and unknown = 0 then revenue - cost_known end as gross_profit,
       case when rev_lines > 0 and cost_lines > 0 and unknown = 0 and revenue > 0 then (revenue - cost_known) / revenue end as gross_margin
from per join public.projects p on p.id = per.project_id`;

const VERSIONS_SQL = `
with revs as (
  select r.*, coalesce(s.project_id, c.project_id) as project_id, coalesce(r.service_line_id, r.cost_line_id) as line_id
  from public.money_revisions r left join public.service_lines s on s.id = r.service_line_id left join public.cost_lines c on c.id = r.cost_line_id
), t as (
  select project_id, approved_at, row_number() over (partition by project_id order by approved_at) as version_no
  from (select distinct project_id, approved_at from revs) x
), v as (
  select t.project_id, t.version_no, l.line_type, l.amount, l.amount_status
  from t cross join lateral (select distinct on (r.line_id) r.line_type, r.amount, r.amount_status from revs r
                             where r.project_id = t.project_id and r.approved_at <= t.approved_at order by r.line_id, r.revision_no desc) l
), per as (
  select project_id, version_no, sum(amount) filter (where line_type = 'revenue') as revenue, sum(amount) filter (where line_type = 'cost') as cost_known,
         count(*) filter (where line_type = 'revenue') as rev_lines, count(*) filter (where line_type = 'cost') as cost_lines,
         count(*) filter (where amount_status = 'unknown') as unknown
  from v group by 1, 2
)
select per.version_no, case when rev_lines > 0 and cost_lines > 0 and unknown = 0 then revenue - cost_known end as gross_profit,
       case when rev_lines > 0 and cost_lines > 0 and unknown = 0 and revenue > 0 then (revenue - cost_known) / revenue end as gross_margin
from per join public.projects p on p.id = per.project_id where p.project_ref = $1`;

const RECORDED_SQL = `
select p.project_ref,
  (select sum(amount) from public.acceptance_milestones m where m.project_id = p.id and m.status = 'verified') as verified_acceptance,
  (select sum(a.amount) from public.receipt_allocations a join public.receipts r on r.id = a.receipt_id where a.project_id = p.id and r.tax_basis = 'net_of_vat') as receipts_net,
  (select sum(a.amount) from public.receipt_allocations a join public.receipts r on r.id = a.receipt_id where a.project_id = p.id and r.tax_basis = 'gross_incl_vat') as receipts_gross
from public.projects p`;

const anfra = await startAnfra();
const db = await ownerClient();
try {
  const sql = async (q, params) => (await db.query(q, params)).rows;
  const per = await sql(PER_PROJECT_SQL);

  // 1. Per project, approved: matching revenue → complete cost → gross profit → margin; unknown stays unknown.
  let aql = `explore { dimensions { ref: projects.project_ref } measures { revenue: approved_revenue, mr: approved_matching_revenue,
    cc: approved_complete_cost, gp: approved_gross_profit, gm: approved_gross_margin } sorts { ref asc } }`;
  compareRows('Per project — approved margin chain', aql, await anfra.rows(DATASET, aql), per, 'ref' in per[0] ? 'ref' : 'project_ref',
    [['revenue', 'revenue'], ['mr', 'matching_revenue'], ['cc', 'complete_cost'], ['gp', 'gross_profit'], ['gm', 'gross_margin', 1e-6]]);
  // compareRows keys on the AQL alias; align the SQL key name.
  checks.pop();
  const perByRef = per.map((r) => ({ ref: r.project_ref, ...r }));
  compareRows('Per project — approved margin chain', aql, await anfra.rows(DATASET, aql), perByRef, 'ref',
    [['revenue', 'revenue'], ['mr', 'matching_revenue'], ['cc', 'complete_cost'], ['gp', 'gross_profit'], ['gm', 'gross_margin', 1e-6]]);

  // 2. Portfolio, approved, with its exclusions.
  aql = `explore { measures { mr: approved_matching_revenue, cc: approved_complete_cost, gp: approved_gross_profit, gm: approved_gross_margin,
    excluded: approved_incomplete_projects, excluded_revenue: approved_excluded_revenue, included: approved_complete_projects,
    unknown: approved_unknown_lines } }`;
  const [portfolio] = await anfra.rows(DATASET, aql);
  const complete = per.filter((r) => r.complete);
  const mr = complete.reduce((s, r) => s + Number(r.matching_revenue), 0);
  const cc = complete.reduce((s, r) => s + Number(r.complete_cost), 0);
  const expected = { mr, cc, gp: mr - cc, gm: mr > 0 ? (mr - cc) / mr : null, excluded: per.filter((r) => !r.complete).length,
    excluded_revenue: per.filter((r) => !r.complete).reduce((s, r) => s + Number(r.revenue ?? 0), 0), included: complete.length,
    unknown: per.reduce((s, r) => s + Number(r.unknown), 0) };
  const bad = Object.entries(expected).filter(([k, v]) => !same(num(portfolio[k]), v));
  record('Portfolio — approved totals and exclusions', bad.length === 0, { aql, aql_result: portfolio, sql_result: expected,
    mismatches: bad.map(([k, v]) => ({ field: k, aql: portfolio[k], sql: v })) });

  // 3. Scenario per project (pending proposals substituted), never mixed with approved.
  aql = `explore { dimensions { ref: projects.project_ref } measures { revenue: scenario_revenue, gp: scenario_gross_profit, gm: scenario_gross_margin } sorts { ref asc } }`;
  compareRows('Per project — scenario margin', aql, await anfra.rows(DATASET, aql), (await sql(SCENARIO_SQL)).map((r) => ({ ref: r.project_ref, ...r })), 'ref',
    [['revenue', 'revenue'], ['gp', 'gross_profit'], ['gm', 'gross_margin', 1e-6]]);

  // 4. Committed versions of the project with an approved and a rejected change (history explains earlier results).
  const historyRef = (await sql(`select project_ref from public.projects where title like 'New nut-milk flavour launch%'`))[0]?.project_ref;
  aql = `explore { dimensions { v: money_facts.version_no } measures { lines: version_line_count, gp: version_gross_profit, gm: version_gross_margin }
    filters { projects.project_ref == '${historyRef}' } sorts { v asc } }`;
  compareRows(`Versions of ${historyRef} — gross profit and margin per committed version`, aql, await anfra.rows(DATASET, aql),
    (await sql(VERSIONS_SQL, [historyRef])).map((r) => ({ v: r.version_no, ...r })), 'v', [['gp', 'gross_profit'], ['gm', 'gross_margin', 1e-6]]);

  // 5. Comparable periods: contract-signed month vs the previous month (approved basis, complete inputs only).
  aql = `explore { dimensions { month: projects.contract_signed_date | month() } measures { gp: approved_gross_profit,
    prev_gp: approved_gross_profit_prev_month, mr: approved_matching_revenue, gm: approved_gross_margin, prev_gm: approved_gross_margin_prev_month }
    filters { projects.contract_signed_date matches @(2026-07-01 - 2026-10-31) } sorts { month asc } }`;
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const monthAgg = months.map((m) => {
    const rows = per.filter((r) => r.complete && r.contract_month === m);
    const mrm = rows.reduce((s, r) => s + Number(r.matching_revenue), 0); const gpm = rows.reduce((s, r) => s + Number(r.gross_profit), 0);
    return { m, gp: rows.length ? gpm : null, mr: rows.length ? mrm : null, gm: rows.length && mrm > 0 ? gpm / mrm : null };
  });
  const monthSql = monthAgg.slice(1).map((x, i) => ({ month: `${x.m}-01`, gp: x.gp, mr: x.mr, gm: x.gm, prev_gp: monthAgg[i].gp, prev_gm: monthAgg[i].gm }));
  const monthAql = (await anfra.rows(DATASET, aql)).map((r) => ({ ...r, month: String(r.month).slice(0, 10) }));
  compareRows('Monthly — gross profit vs previous contract month', aql, monthAql, monthSql, 'month',
    [['gp', 'gp'], ['prev_gp', 'prev_gp'], ['mr', 'mr'], ['gm', 'gm', 1e-6], ['prev_gm', 'prev_gm', 1e-6]]);

  // 6. Ranking: population = projects with complete approved inputs; ties share a rank and are ordered by project ID.
  aql = `explore { dimensions { ref: projects.project_ref } measures { gp: approved_gross_profit, rank: gross_profit_rank }
    filters { projects.approved_inputs_complete is true } sorts { gp desc, ref asc } }`;
  const ranked = await anfra.rows(DATASET, aql);
  const pop = per.filter((r) => r.complete).map((r) => ({ ref: r.project_ref, gp: Number(r.gross_profit) }))
    .sort((a, b) => b.gp - a.gp || a.ref.localeCompare(b.ref));
  const sqlRanks = pop.map((r) => ({ ...r, rank: 1 + pop.filter((o) => o.gp > r.gp).length }));
  const orderOk = ranked.map((r) => r.ref).join(',') === sqlRanks.map((r) => r.ref).join(',');
  compareRows('Ranking — rank by approved gross profit (deterministic ties)', aql, ranked, sqlRanks, 'ref', [['gp', 'gp'], ['rank', 'rank']]);
  checks.at(-1).ok = checks.at(-1).ok && orderOk;
  checks.at(-1).order = { aql: ranked.map((r) => `${r.rank}:${r.ref}`), expected: sqlRanks.map((r) => `${r.rank}:${r.ref}`) };

  // 7. Level of detail: client → project → service line. Service lines add up to their project, projects to their client.
  aql = `explore { dimensions { client: clients.display_name, ref: projects.project_ref, service: services.name }
    measures { revenue: approved_revenue, share_of_project: safe_divide(approved_revenue, approved_revenue | exclude_grains(services.name)),
               share_of_client: safe_divide(approved_revenue, approved_revenue | exclude_grains(projects.project_ref, services.name)) }
    filters { money_facts.fact_kind == 'revenue' } sorts { client asc, ref asc, service asc } }`;
  const lod = await anfra.rows(DATASET, aql);
  const lodProblems = [];
  const byProject = new Map(); const byClient = new Map();
  for (const r of lod) {
    byProject.set(r.ref, (byProject.get(r.ref) ?? { rev: 0, share: 0 })); const p = byProject.get(r.ref); p.rev += Number(r.revenue); p.share += Number(r.share_of_project ?? 0);
    byClient.set(r.client, (byClient.get(r.client) ?? { share: 0 })); byClient.get(r.client).share += Number(r.share_of_client ?? 0);
  }
  for (const [ref, p] of byProject) {
    const s = perByRef.find((x) => x.ref === ref);
    if (!same(p.rev, Number(s?.revenue ?? 0))) lodProblems.push({ ref, problem: 'service lines do not add up to the project', aql: p.rev, sql: s?.revenue });
    if (p.rev > 0 && !same(p.share, 1, 1e-6)) lodProblems.push({ ref, problem: 'shares of project do not add up to 100%', share: p.share });
  }
  const clientAql = await anfra.rows(DATASET, `explore { dimensions { client: clients.display_name } measures { revenue: approved_revenue } sorts { client asc } }`);
  for (const c of clientAql) {
    const sum = lod.filter((r) => r.client === c.client).reduce((s, r) => s + Number(r.revenue), 0);
    if (!same(Number(c.revenue), sum)) lodProblems.push({ client: c.client, problem: 'client total differs from its service lines', client_total: c.revenue, lines: sum });
    if (Number(c.revenue) > 0 && !same(byClient.get(c.client)?.share ?? 0, 1, 1e-6)) lodProblems.push({ client: c.client, problem: 'shares of client do not add up to 100%' });
  }
  record('Level of detail — client → project → service line', lodProblems.length === 0, { aql, rows: lod.length, mismatches: lodProblems });

  // 8. Acceptance and cash: separate from revenue; the residual only on a matching (net of VAT) basis.
  aql = `explore { dimensions { ref: projects.project_ref } measures { acc: verified_acceptance, net: receipts_net, gross: receipts_gross,
    residual: management_residual } having { project_count > 0 } sorts { ref asc } }`;
  const recorded = (await sql(RECORDED_SQL)).filter((r) => r.verified_acceptance !== null || r.receipts_net !== null || r.receipts_gross !== null)
    .map((r) => ({ ref: r.project_ref, ...r, residual: r.receipts_gross !== null ? null : Number(r.verified_acceptance ?? 0) - Number(r.receipts_net ?? 0) }));
  const recordedAql = (await anfra.rows(DATASET, aql)).filter((r) => r.acc !== null || r.net !== null || r.gross !== null);
  compareRows('Acceptance and cash — verified acceptance, receipts by tax basis, residual', aql, recordedAql, recorded, 'ref',
    [['acc', 'verified_acceptance'], ['net', 'receipts_net'], ['gross', 'receipts_gross'], ['residual', 'residual']]);

  // 9. Distinct project count and freshness.
  aql = `explore { measures { projects: project_count, last: last_committed_at } }`;
  const [counts] = await anfra.rows(DATASET, aql);
  const [truth] = await sql(`select (select count(*) from public.projects)::int as projects, greatest(
      (select max(approved_at) from public.money_revisions where status = 'approved'),
      (select max(coalesce(verified_at, submitted_at)) from public.acceptance_milestones),
      (select max(r.recorded_at) from public.receipts r join public.receipt_allocations a on a.receipt_id = r.id)) as last`);
  const lastOk = Math.abs(new Date(counts.last).getTime() - new Date(truth.last).getTime()) < 1000;
  record('Distinct projects and freshness', Number(counts.projects) === truth.projects && lastOk,
    { aql, aql_result: counts, sql_result: { projects: truth.projects, last: truth.last } });

  // 10. Why tasks are never joined to money: the naive join a spreadsheet or SQL view would do multiplies revenue.
  const [naive] = await sql(`select sum(r.amount) as naive, (select sum(amount) from public.money_revisions where status = 'approved' and line_type = 'revenue') as governed
    from public.money_revisions r join public.service_lines s on s.id = r.service_line_id join public.work_items w on w.project_id = s.project_id
    where r.status = 'approved'`);
  const governed = await anfra.rows(DATASET, `explore { measures { revenue: approved_revenue } }`);
  record('Fan-out guard — revenue is not multiplied by tasks', same(num(governed[0].revenue), Number(naive.governed)) && Number(naive.naive) > Number(naive.governed),
    { governed_revenue_aql: governed[0].revenue, governed_revenue_sql: naive.governed, naive_join_with_tasks_sql: naive.naive,
      note: 'Work items are not in the finance dataset, so no panel can join them to money.' });

  // Pipeline: open opportunities by stage, and their estimates kept by basis (never added together, never revenue).
  {
    const aql = `explore { dimensions { stage: projects.commercial_stage } measures { n: project_count, open: pipeline_opportunities,
      total: pipeline_estimate_total, monthly: pipeline_estimate_monthly, low: pipeline_estimate_range_low, high: pipeline_estimate_range_high,
      without: pipeline_without_estimate } sorts { stage asc } }`;
    const open = "('lead', 'qualified', 'meeting', 'proposal', 'negotiation', 'contract_sent', 'on_hold')";
    const sqlRows = await sql(`select commercial_stage as stage, count(*)::int as n,
        count(*) filter (where commercial_stage in ${open})::int as open,
        sum(estimated_amount) filter (where estimate_basis = 'total' and commercial_stage in ${open}) as total,
        sum(estimated_amount) filter (where estimate_basis = 'monthly' and commercial_stage in ${open}) as monthly,
        sum(estimate_low) filter (where estimate_basis = 'range' and commercial_stage in ${open}) as low,
        sum(estimate_high) filter (where estimate_basis = 'range' and commercial_stage in ${open}) as high,
        count(*) filter (where estimate_basis is null and commercial_stage in ${open})::int as without
      from public.projects group by 1 order by 1`);
    const zeroToNull = (rows, fields) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fields.includes(k) && (v === null || Number(v) === 0) ? null : v])));
    const counts = ['open', 'without'];
    compareRows('Pipeline — open opportunities by stage, estimates kept by basis', aql, zeroToNull(await anfra.rows(DATASET, aql), counts), zeroToNull(sqlRows, counts), 'stage',
      [['n', 'n'], ['open', 'open'], ['total', 'total'], ['monthly', 'monthly'], ['low', 'low'], ['high', 'high'], ['without', 'without']]);
  }
} finally {
  await db.end();
  await anfra.stop();
}

fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
const out = { ran_at: new Date().toISOString(), dataset: DATASET, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length, checks };
fs.writeFileSync(path.join(ROOT, 'test-results', 'reconciliation.json'), JSON.stringify(out, null, 2));
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else {
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.rows !== undefined ? ` (${c.rows} rows)` : ''}`);
    if (!c.ok) console.log('      ', JSON.stringify(c.mismatches ?? c, null, 0).slice(0, 1500));
  }
  console.log(`${out.passed} passed, ${out.failed} failed — details in test-results/reconciliation.json`);
}
process.exit(out.failed ? 1 : 0);
