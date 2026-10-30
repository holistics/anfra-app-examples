# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.4.2"]
# ///
"""Print each story beat of data/hiring.duckdb, straight from SQL, to check the seed and the app.

    uv run scripts/hiring-board/check.py
"""
from pathlib import Path

import duckdb

DB = Path(__file__).resolve().parents[2] / "data" / "hiring.duckdb"
con = duckdb.connect(str(DB), read_only=True)


def show(title, sql):
    print(f"\n{title}")
    for row in con.execute(sql).fetchall():
        print("  ", " | ".join(str(v) for v in row))


show("Rule: exactly one of status and outcome (expect 0 breaks)", """
select count(*) filter (where (status is null) = (outcome is null))
     + count(*) filter (where status = 'Scheduled' and stage in ('Applied', 'Offer')) as breaks from candidates""")
show("Funnel: applied, screening, technical, culture, final, offer, hired", """
select count(*), sum(reached_screening::int), sum(reached_technical::int), sum(reached_culture::int),
       sum(reached_final::int), sum(offer_sent::int), sum(hired::int) from candidates""")
show("1. Technical round: Engineering vs others (pass rate, median wait)", """
select p.department = 'Engineering' as eng,
       round(avg((r.result = 'Pass')::int) filter (where r.result in ('Pass', 'Fail')), 2) as pass_rate,
       median(r.wait_days) filter (where not r.withdrew) as median_wait
from interview_rounds r join candidates c using (candidate_id) join positions p using (position_id)
where r.round_type = 'Technical' group by 1 order by 1""")
show("2. Interviewers: average score and median feedback days (lowest scores first)", """
select interviewer, round(avg(score), 2) as avg_score, count(score) as n, median(feedback_days) as fb_days
from interview_rounds where score is not null group by 1 having count(score) >= 5 order by 2 limit 5""")
show("3. Withdrawal rate by wait", """
select wait_bucket, round(avg(withdrew::int), 2) as withdrew, count(*) as waits from interview_rounds group by 1 order by min(wait_days)""")
show("4. Qualified (reached Final) by source: qualified, decided, rate", """
select source, sum(is_qualified::int), sum(is_decided::int), round(sum(is_qualified::int) / sum(is_decided::int), 2)
from candidates group by 1 order by 4 desc""")
for trait in ["key_skills", "degree", "location_fit", "gender"]:
    show(f"5/6. Qualified rate by {trait}", f"""
select {trait}, sum(is_qualified::int), sum(is_decided::int), round(sum(is_qualified::int) / sum(is_decided::int), 3)
from candidates group by 1 order by 1""")
show("7. Headcount by department: on team, signed, plan, to hire, roles open, expected, attrition a year", """
with e as (
  select department, sum(is_active::int) as now, sum(is_signed::int) as signed, sum(left_since_apr1::int) as leavers,
         sum(active_apr1::int) as apr1
  from employees group by 1)
select p.department, e.now, e.signed, p.plan_dec31, p.plan_dec31 - e.now - e.signed as to_hire, p.open_seats,
       round(x.expected, 1) as expected, round(e.leavers / ((e.apr1 + e.now) / 2.0) * 365 / 201, 2) as attrition
from headcount_plan p join e using (department) join (select department, sum(expected) as expected from expected_hires group by 1) x using (department)
order by p.dept_order""")
show("7. Backfill vs growth (hires)", """
select department, sum(is_backfill::int) as backfill, sum((not is_backfill)::int) as growth from employees where from_hire group by 1 order by 1""")
show("7. Dec 31: plan vs forecast", """
select series, round(sum(headcount), 1) from headcount_series where as_of = date '2026-12-31' group by 1""")
