"""Build samples/usage/data/usage.duckdb, the `usage_duckdb` data source, from usage_seed.py.

    uv run --no-project --with duckdb==1.4.2 python samples/usage/db/build_duckdb.py

Generates the Usage analytics log (see usage_seed.py) twice and stops unless both runs match, loads it, then
runs the checks below: the log reconciles, and each planted story (README) is there. If any check fails
it writes nothing and exits 1. On success it prints the checks and a short summary, renames the file into
place and, inside anfra-demo-data, stamps it with db/duckdb_stamps.sh.

DuckDB 1.4.2 is the version bundled with anfra 0.10.2: keep the pin in step with the anfra version.
Stop any `anfra serve` using this file first: it holds the file open.
"""
import csv
import os
import shutil
import subprocess
import sys
import tempfile

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
OUT = os.path.join(os.path.dirname(HERE), 'data', 'usage.duckdb')
STAMPS = os.path.join(ROOT, 'db', 'duckdb_stamps.sh')
MAX_BYTES = 40 * 1024 * 1024
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # no __pycache__ next to the seed
import usage_seed  # noqa: E402

# The last 90 days of the log: 23 Jul to 20 Oct 2026.
LAST_90 = "timestamp '2026-07-23'"

# Every day of the log, and whether it is a Saturday or Sunday.
CALENDAR = """
    select d::date d, isodow(d) > 5 is_weekend
    from range(timestamp '2026-04-22', timestamp '2026-10-21', interval 1 day) t(d)"""

# Each check is a query returning the rows that break it: zero rows passes.
CHECKS = [
    ('Every foreign key has its parent row, of the right asset type; every dashboard has an owner and no metric does',
     """select 'events', event_id from events where user_id not in (select user_id from users)
          or asset_id not in (select asset_id from assets)
          or parent_dashboard_id not in (select asset_id from assets where asset_type = 'dashboard')
        union all select 'dashboard_metrics', dashboard_asset_id from dashboard_metrics
          where dashboard_asset_id not in (select asset_id from assets where asset_type = 'dashboard')
             or metric_asset_id not in (select asset_id from assets where asset_type = 'metric')
        union all select 'assets', asset_id from assets a
          where (asset_type = 'dashboard') <> (owner_id is not null)
             or owner_id is not null and owner_id not in (select user_id from users)"""),
    ('Names and emails are unique, emails on pulsegym.example; asset names are unique',
     """select name from users group by 1 having count(*) > 1
        union all select email from users group by 1 having count(*) > 1
        union all select email from users where email not like '%@pulsegym.example'
        union all select name from assets group by 1 having count(*) > 1"""),
    ('Actions fit their asset: people view or export a dashboard and query a metric; only queries have a parent',
     """select e.event_id from events e join assets a using (asset_id)
        where e.action not in ('view', 'query', 'export')
           or (e.action in ('view', 'export')) <> (a.asset_type = 'dashboard')
           or e.action <> 'query' and e.parent_dashboard_id is not null"""),
    ('Each query with a parent follows a view of it by the same person within 5 minutes, and the '
     'dashboard shows that metric',
     """select q.event_id from events q where q.parent_dashboard_id is not null and (
          not exists (select 1 from events v where v.action = 'view' and v.user_id = q.user_id
                        and v.asset_id = q.parent_dashboard_id
                        and v.occurred_at between q.occurred_at - interval 300 second and q.occurred_at)
          or not exists (select 1 from dashboard_metrics m
                         where m.dashboard_asset_id = q.parent_dashboard_id and m.metric_asset_id = q.asset_id))"""),
    ('A view logs no queries only when anyone viewed the same dashboard in the 4 hours before',
     """select v.event_id from events v where v.action = 'view'
          and not exists (select 1 from events q where q.parent_dashboard_id = v.asset_id
                            and q.user_id = v.user_id
                            and q.occurred_at between v.occurred_at and v.occurred_at + interval 10 second)
          and not exists (select 1 from events p where p.action = 'view' and p.asset_id = v.asset_id
                            and p.event_id <> v.event_id
                            and p.occurred_at between v.occurred_at - interval 4 hour and v.occurred_at)"""),
    ('Every event falls in the log, after the person joined and the asset was created',
     """select e.event_id from events e join users u using (user_id) join assets a using (asset_id)
        where e.occurred_at < timestamp '2026-04-22' or e.occurred_at >= timestamp '2026-10-21'
           or e.occurred_at::date < u.joined_on or e.occurred_at::date < a.created_on"""),
    ('Totals: 3,000 to 4,000 views; 6,000 to 8,000 metric queries; the top dashboard has 450 to 650 views',
     """select * from (
          select count(*) filter (where action = 'view') n_views, count(*) filter (where action = 'query') n_queries,
                 (select max(n) from (select count(*) n from events where action = 'view' group by asset_id)) n_top
          from events)
        where n_views not between 3000 and 4000 or n_queries not between 6000 and 8000
           or n_top not between 450 and 650"""),
    ('Story 1: 7 or more dashboards have under 100 views; exactly 3 were never opened; exactly 7 metrics '
     'were never queried',
     """with v as (select a.asset_id, count(e.event_id) n from assets a
                   left join events e on e.asset_id = a.asset_id and e.action = 'view'
                   where a.asset_type = 'dashboard' group by 1)
        select * from (
          select (select count(*) from v where n < 100) small, (select count(*) from v where n = 0) never,
                 (select count(*) from assets a where asset_type = 'metric' and not exists (
                    select 1 from events e where e.asset_id = a.asset_id)) unqueried)
        where small < 7 or never <> 3 or unqueried <> 7"""),
    ('Story 2: Weekly Studio Scorecard views a day from 15 Aug are half or less of before',
     """with v as (select occurred_at >= timestamp '2026-08-15' is_after, count(*) n from events e
                   join assets a using (asset_id) where a.label = 'Weekly Studio Scorecard' and action = 'view'
                   group by 1)
        select * from (select (select n from v where is_after) / 67 after_day,
                              (select n from v where not is_after) / 115 before_day)
        where after_day > 0.5 * before_day"""),
    ('Story 3: Towel Fee Revenue is on one dashboard only; nobody opens it or queries the metric after 22 Jun',
     """with m as (select asset_id from assets where name = 'towel_fee_revenue'),
             d as (select dashboard_asset_id asset_id from dashboard_metrics where metric_asset_id in (select * from m))
        select * from (
          select (select count(*) from d) dashboards,
                 (select count(*) from events where occurred_at >= timestamp '2026-06-23'
                    and (asset_id in (select * from d) or asset_id in (select * from m))) later,
                 (select count(*) from events where asset_id in (select * from d)) ever)
        where dashboards <> 1 or later > 0 or ever = 0"""),
    ('Story 4: exactly 6 people were active before but not in the last 90 days; exactly 2 never active',
     """with l as (select u.user_id, max(e.occurred_at) last_at from users u
                   left join events e using (user_id) group by 1)
        select * from (select count(*) filter (where last_at < %s) stopped,
                              count(*) filter (where last_at is null) never from l)
        where stopped <> 6 or never <> 2""" % LAST_90),
    ("Story 5: weekend days carry a quarter or less of a weekday's events",
     """with c as (%s),
             v as (select occurred_at::date d, count(*) n from events group by 1),
             r as (select c.is_weekend, sum(coalesce(v.n, 0)) / count(*) per_day from c left join v using (d) group by 1)
        select * from (select (select per_day from r where is_weekend) we, (select per_day from r where not is_weekend) wd)
        where we > 0.25 * wd""" % CALENDAR),
    ('Story 6: one person exports one dashboard every Monday around 08:00 (at least 15 weeks); no one else exports',
     """with x as (select user_id, asset_id, count(*) n,
                         count(*) filter (where dayofweek(occurred_at) = 1 and hour(occurred_at) = 8) on_rhythm
                  from events where action = 'export' group by 1, 2)
        select * from (select count(*) pairs, count(*) filter (where n >= 15 and on_rhythm = n) loops from x)
        where pairs <> 1 or loops <> 1"""),
]

SUMMARY = [
    ('People', 'select count(*) from users'),
    ('Dashboards / metrics', """select count(*) filter (where asset_type = 'dashboard') || ' / '
                                       || count(*) filter (where asset_type = 'metric') from assets"""),
    ('Views / metric queries (from a dashboard / on their own)',
     """select count(*) filter (where action = 'view') || ' / ' || count(*) filter (where action = 'query')
               || ' (' || count(*) filter (where parent_dashboard_id is not null) || ' / '
               || count(*) filter (where action = 'query' and parent_dashboard_id is null) || ')' from events"""),
    ('Exports (from a dashboard)', "select count(*) from events where action = 'export'"),
    ('Most viewed dashboard',
     """select a.label || ' (' || count(*) || ')' from events e join assets a using (asset_id)
        where e.action = 'view' group by a.label order by count(*) desc limit 1"""),
    ('Active people, last 30 days',
     "select count(distinct user_id) from events where occurred_at >= timestamp '2026-09-21'"),
    ('Dashboards not opened in the last 90 days',
     """select count(*) from assets a where asset_type = 'dashboard' and not exists (
          select 1 from events e where e.asset_id = a.asset_id and e.action = 'view' and e.occurred_at >= %s)"""
     % LAST_90),
]


def load(con, tables, tmpdir):
    for name, (cols, rows) in tables.items():
        path = os.path.join(tmpdir, name + '.csv')
        with open(path, 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            for r in rows:
                w.writerow(['' if v is None else ('true' if v is True else 'false' if v is False else v) for v in r])
        con.execute('create table %s (%s)' % (name, ', '.join('%s %s' % c for c in cols)))
        types = '{%s}' % ', '.join("'%s': '%s'" % c for c in cols)
        con.execute("insert into %s select * from read_csv(?, header = false, columns = %s, nullstr = '', "
                    "quote = '\"', escape = '\"')" % (name, types), [path])
        print('%-18s %8d rows' % (name, con.execute('select count(*) from %s' % name).fetchone()[0]))


def main():
    tables = usage_seed.generate()
    first, second = usage_seed.digest(tables), usage_seed.digest(usage_seed.generate())
    if first != second:
        sys.exit('usage_seed is not deterministic: two runs differ (%s, %s)' % (first[:12], second[:12]))
    print('deterministic: two runs match (sha256 %s)\n' % first[:16])
    tmp = OUT + '.tmp'
    for p in (tmp, tmp + '.wal'):
        if os.path.exists(p):
            os.remove(p)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    con = duckdb.connect(tmp)
    con.execute("set TimeZone = 'UTC'")
    con.execute('create schema if not exists public')
    con.execute('use public')
    tmpdir = tempfile.mkdtemp()
    try:
        load(con, tables, tmpdir)
    finally:
        shutil.rmtree(tmpdir)

    print('\nChecks')
    failed = 0
    for label, sql in CHECKS:
        bad = con.execute(sql).fetchall()
        print('  %s  %s' % ('ok  ' if not bad else 'FAIL', label))
        if bad:
            failed += 1
            for r in bad[:5]:
                print('        ', r)
    print('\nSummary')
    for label, sql in SUMMARY:
        print('  %-56s %s' % (label, con.execute(sql).fetchone()[0]))
    con.execute('checkpoint')
    con.close()
    size = os.path.getsize(tmp)
    print('  %s  File is under 40 MB (%s bytes)' % ('ok  ' if size < MAX_BYTES else 'FAIL', format(size, ',')))
    failed += size >= MAX_BYTES
    if failed:
        os.remove(tmp)
        sys.exit('\n%d check(s) failed: %s not written' % (failed, os.path.relpath(OUT, ROOT)))
    os.replace(tmp, OUT)
    print('\nwrote %s (%s bytes, duckdb %s)' % (os.path.relpath(OUT, ROOT), format(os.path.getsize(OUT), ','),
                                                 duckdb.__version__))
    if os.path.exists(STAMPS):
        subprocess.run(['sh', STAMPS, 'write', 'usage'], check=True)


if __name__ == '__main__':
    main()
