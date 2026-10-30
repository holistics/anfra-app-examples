"""Generates the Usage analytics log: a fictional 180-day record of who at Pulse Gym opened which
dashboard and queried which metric.

    python3 samples/usage/db/usage_seed.py          # prints a summary; the build imports generate()

Deterministic: no clock, no hash-ordered iteration, one seeded RNG per run, so the same script always
writes the same rows. Pure Python, standard library only.

How it works. Pulse Gym (the company in samples/pulse) has 40 people on its analytics. Its 14
dashboards are Data Apps (a dashboard's name is the app's path under apps/) and its 45 metrics are
Dataset metrics: the 33 in datasets/pulse.dataset.aml keep their names, the other 12 belong to two
datasets this repo does not have (pulse_marketing, pulse_ops). On a weekday a person may open a few
sessions; a session opens one or more dashboards. Opening a dashboard queries each of its metrics,
unless anyone opened the same dashboard in the last 4 hours: the server answers from its cache
then and logs no query. The data team also queries metrics on their own, outside any dashboard. The
planted stories (README) are layered on top: the long tail and the dashboards nobody opens, the
scorecard that fades, the metric whose only dashboard went quiet, the people who stop coming, and
quiet weekends.

Times are local (Asia/Ho_Chi_Minh) without a zone. The log runs Wed 22 Apr to Tue 20 Oct 2026.
"""
import hashlib
import math
import random
from datetime import date, datetime, timedelta

SEED = 20261021
START = date(2026, 4, 22)
END = date(2026, 10, 20)            # today: the last day of the log
DAY = timedelta(days=1)
SCORECARD_FADE = date(2026, 8, 15)  # Weekly Studio Scorecard starts to fade
CACHE = timedelta(hours=4)          # a dashboard opened again within this logs no queries

FIRST = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'James', 'Sophia', 'Oliver', 'Isabella', 'Lucas',
         'Mia', 'Ethan', 'Charlotte', 'Henry', 'Amelia', 'Jack', 'Harper', 'Daniel', 'Grace', 'Samuel',
         'Chloe', 'Thomas', 'Ella', 'Ryan', 'Lily', 'Nathan', 'Hannah', 'Owen', 'Zoe', 'Adam', 'Ruby',
         'Caleb', 'Sarah', 'Ben', 'Megan', 'Luke']
LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor',
        'Collins', 'Moore', 'Martin', 'Jackson', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson',
        'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Hill', 'Green', 'Adams', 'Baker',
        'Nelson', 'Carter', 'Mitchell', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards']

# key, group, persona, joined_on (None: before the log). The group only steers which dashboards a
# person opens; the log does not carry it. Personas: heavy, regular and light differ in how often they
# come; stopper comes like a regular, then stops for good between late May and mid July; never has
# access and has done nothing.
USERS = [
    ('data_1', 'data', 'heavy', None),
    ('data_2', 'data', 'heavy', None),
    ('data_3', 'data', 'regular', None),
    ('data_4', 'data', 'regular', date(2026, 7, 13)),
    ('data_5', 'data', 'light', None),
    ('studio_1', 'studio', 'heavy', None),
    ('studio_2', 'studio', 'regular', None),
    ('studio_3', 'studio', 'regular', None),
    ('studio_4', 'studio', 'regular', None),
    ('studio_5', 'studio', 'regular', None),
    ('studio_6', 'studio', 'light', None),
    ('studio_7', 'studio', 'light', None),
    ('studio_8', 'studio', 'light', None),
    ('studio_9', 'studio', 'stopper', None),
    ('studio_10', 'studio', 'stopper', None),
    ('studio_11', 'studio', 'regular', None),
    ('studio_12', 'studio', 'light', None),
    ('fin_1', 'finance', 'heavy', None),
    ('fin_2', 'finance', 'regular', None),
    ('fin_3', 'finance', 'regular', None),
    ('fin_4', 'finance', 'stopper', None),
    ('fin_5', 'finance', 'light', None),
    ('mkt_1', 'marketing', 'regular', None),
    ('mkt_2', 'marketing', 'regular', None),
    ('mkt_3', 'marketing', 'light', None),
    ('mkt_4', 'marketing', 'stopper', None),
    ('mkt_5', 'marketing', 'never', None),
    ('mkt_6', 'marketing', 'regular', date(2026, 8, 17)),
    ('exec_1', 'exec', 'regular', None),
    ('exec_2', 'exec', 'light', None),
    ('exec_3', 'exec', 'stopper', None),
    ('exec_4', 'exec', 'never', None),
    ('ops_1', 'ops', 'regular', None),
    ('ops_2', 'ops', 'regular', None),
    ('ops_3', 'ops', 'light', None),
    ('ops_4', 'ops', 'light', None),
    ('ops_5', 'ops', 'stopper', None),
    ('ops_6', 'ops', 'regular', None),
    ('ops_7', 'ops', 'light', None),
    ('ops_8', 'ops', 'light', None),
]

# Sessions a weekday; a session opens 1 + Poisson(0.35) dashboards.
SESSIONS = {'heavy': 1.5, 'regular': 0.6, 'light': 0.22, 'stopper': 0.6, 'never': 0}
WEEKEND = 0.06  # share of a weekday's sessions on a Saturday or Sunday

# The 33 metrics of datasets/pulse.dataset.aml, with their labels there.
PULSE_METRICS = [
    ('active_members_paying', 'Active Members (paying)'),
    ('active_members_engaged', 'Active Members (engaged)'),
    ('active_members_booking', 'Active Members (booking)'),
    ('active_members', 'Active Members'),
    ('new_members', 'New Members'),
    ('cancelled_members', 'Cancelled Members'),
    ('churned_members', 'Churned Members (by last charge)'),
    ('churn_rate', 'Churn Rate'),
    ('member_retention', 'Member Retention'),
    ('at_risk_members', 'Members at Risk'),
    ('revenue', 'Revenue'),
    ('revenue_target', 'Revenue Target'),
    ('revenue_vs_target', 'Revenue vs Target'),
    ('arpm', 'Revenue per Paying Member'),
    ('revenue_ytd', 'Revenue YTD'),
    ('revenue_prev_year', 'Revenue, Prior Year'),
    ('revenue_yoy', 'Revenue YoY'),
    ('revenue_prev_month', 'Revenue, Prior Month'),
    ('new_members_prior_month', 'New Members, Prior Month'),
    ('new_members_vs_prior_month', 'New Members vs Prior Month'),
    ('new_members_target', 'New Members Target'),
    ('classes_held', 'Classes Held'),
    ('class_capacity', 'Class Capacity'),
    ('bookings', 'Bookings'),
    ('attended', 'Attended'),
    ('no_shows', 'No-shows'),
    ('late_cancellations', 'Cancelled Bookings'),
    ('fill_rate', 'Fill Rate'),
    ('no_show_rate', 'No-show Rate'),
    ('attendance_target', 'Attendance Target'),
    ('attended_prev_year', 'Attended, Prior Year'),
    ('check_ins', 'Check-ins'),
    ('visits_per_member', 'Visits per Engaged Member'),
]
PULSE_CREATED = date(2025, 2, 3)
# Metrics outside this repo's catalog: name, label, dataset, created.
OTHER_METRICS = [
    ('campaign_leads', 'Campaign Leads', 'pulse_marketing', date(2025, 5, 12)),
    ('cost_per_lead', 'Cost per Lead', 'pulse_marketing', date(2025, 5, 12)),
    ('trial_signups', 'Trial Sign-ups', 'pulse_marketing', date(2025, 5, 12)),
    ('trial_conversion_rate', 'Trial Conversion Rate', 'pulse_marketing', date(2025, 5, 12)),
    ('lead_to_member_rate', 'Lead to Member Rate', 'pulse_marketing', date(2025, 5, 12)),
    ('promo_redemptions', 'Promo Redemptions', 'pulse_marketing', date(2026, 1, 12)),
    ('trainer_hours', 'Trainer Hours', 'pulse_ops', date(2025, 3, 3)),
    ('waitlist_size', 'Waitlist Size', 'pulse_ops', date(2025, 3, 3)),
    ('pilates_waitlist', 'Pilates Waitlist', 'pulse_ops', date(2026, 3, 2)),
    ('payroll_hours_draft', 'Payroll Hours (draft)', 'pulse_ops', date(2025, 11, 17)),
    ('towel_fee_revenue', 'Towel Fee Revenue', 'pulse_ops', date(2025, 7, 7)),
    ('amenity_revenue', 'Amenity Revenue', 'pulse_ops', date(2025, 7, 7)),
]

# label, app path, created, base weight, last day anyone opens it (None: still open), metrics.
# Weights set each dashboard's share of views; 0 means nobody opens it.
DASHBOARDS = [
    ('Studio Overview', 'pulse-gym/studio-overview', date(2025, 3, 10), 8.5, None,
     ['active_members_paying', 'revenue', 'check_ins', 'fill_rate', 'new_members']),
    ('Class Performance', 'pulse-gym/class-performance', date(2025, 3, 10), 7.5, None,
     ['classes_held', 'bookings', 'attended', 'fill_rate']),
    ('Revenue by Studio', 'pulse-gym/revenue-by-studio', date(2025, 4, 14), 6.5, None,
     ['revenue', 'revenue_target', 'revenue_vs_target', 'arpm']),
    ('Member Retention', 'pulse-gym/member-retention', date(2026, 6, 1), 9, None,
     ['member_retention', 'churn_rate', 'churned_members', 'at_risk_members']),
    ('Weekly Studio Scorecard', 'pulse-gym/weekly-studio-scorecard', date(2025, 6, 9), 7.5, None,
     ['active_members_paying', 'fill_rate', 'revenue_vs_target', 'no_show_rate']),
    ('Exec Summary', 'pulse-gym/exec-summary', date(2025, 5, 5), 3.5, None,
     ['active_members', 'revenue', 'revenue_yoy', 'churn_rate', 'new_members_vs_prior_month']),
    ('Bookings & No-shows', 'pulse-gym/bookings-no-shows', date(2025, 3, 17), 2.2, None,
     ['bookings', 'no_shows', 'no_show_rate', 'late_cancellations', 'waitlist_size']),
    ('Membership Funnel', 'marketing/membership-funnel', date(2025, 5, 19), 1.4, None,
     ['trial_signups', 'trial_conversion_rate', 'lead_to_member_rate', 'new_members']),
    ('Marketing Campaigns', 'marketing/campaigns', date(2025, 5, 19), 1.3, None,
     ['campaign_leads', 'cost_per_lead', 'promo_redemptions']),
    ('Summer Promo Tracker', 'marketing/summer-promo-tracker', date(2026, 6, 1), 4, date(2026, 7, 10),
     ['promo_redemptions', 'trial_signups']),
    ('Towel & Amenity Fees', 'finance/towel-amenity-fees', date(2025, 7, 7), 1.2, date(2026, 6, 22),
     ['towel_fee_revenue', 'amenity_revenue']),
    ('Old KPI Board', 'archive/old-kpi-board', date(2024, 11, 11), 0, None,
     ['revenue_prev_year', 'attended_prev_year', 'visits_per_member']),
    ('Pilates Waitlist', 'ops/pilates-waitlist', date(2026, 3, 2), 0, None,
     ['pilates_waitlist', 'waitlist_size']),
    ('Trainer Payroll Draft', 'ops/trainer-payroll-draft', date(2025, 11, 17), 0, None,
     ['payroll_hours_draft', 'trainer_hours']),
]

# Who owns each dashboard (a person's key). Fixed, so it takes nothing from the random stream; an owner
# may have joined after the dashboard was created, as when it is handed over. Metrics have no owner.
OWNERS = {
    'Studio Overview': 'data_3', 'Class Performance': 'data_3', 'Revenue by Studio': 'fin_1',
    'Member Retention': 'data_2', 'Weekly Studio Scorecard': 'studio_1', 'Exec Summary': 'data_1',
    'Bookings & No-shows': 'ops_1', 'Membership Funnel': 'mkt_1', 'Marketing Campaigns': 'mkt_1',
    'Summer Promo Tracker': 'mkt_2', 'Towel & Amenity Fees': 'fin_2', 'Old KPI Board': 'data_1',
    'Pilates Waitlist': 'ops_2', 'Trainer Payroll Draft': 'fin_1',
}

# How much more (or less) each group opens a dashboard than the base weight says.
GROUP_BOOST = {
    'studio': {'Studio Overview': 2, 'Class Performance': 2, 'Weekly Studio Scorecard': 2.5,
               'Bookings & No-shows': 2, 'Revenue by Studio': 0.4, 'Exec Summary': 0.1,
               'Membership Funnel': 0.1, 'Marketing Campaigns': 0, 'Summer Promo Tracker': 0.2,
               'Towel & Amenity Fees': 0},
    'finance': {'Revenue by Studio': 4, 'Towel & Amenity Fees': 5, 'Exec Summary': 1, 'Studio Overview': 0.6,
                'Class Performance': 0.2, 'Marketing Campaigns': 0.2, 'Bookings & No-shows': 0.3},
    'marketing': {'Membership Funnel': 6, 'Marketing Campaigns': 7, 'Summer Promo Tracker': 6,
                  'Studio Overview': 0.5, 'Class Performance': 0.3, 'Member Retention': 1.5,
                  'Towel & Amenity Fees': 0},
    'exec': {'Exec Summary': 6, 'Revenue by Studio': 1.5, 'Class Performance': 0.3, 'Bookings & No-shows': 0.2,
             'Towel & Amenity Fees': 0},
    'ops': {'Weekly Studio Scorecard': 2, 'Class Performance': 1.5, 'Bookings & No-shows': 2,
            'Studio Overview': 1.5, 'Marketing Campaigns': 0.2, 'Towel & Amenity Fees': 0},
    'data': {},
}

# Metrics the data team queries on its own, outside any dashboard, by weight. Towel Fee Revenue is not
# one of them: once its dashboard goes quiet, nobody queries it.
AD_HOC = [('revenue', 6), ('active_members_paying', 5), ('churn_rate', 4), ('fill_rate', 3),
          ('active_members_engaged', 3), ('cancelled_members', 3), ('bookings', 2), ('new_members', 2),
          ('revenue_ytd', 2), ('revenue_prev_month', 2), ('new_members_prior_month', 1.5),
          ('class_capacity', 1.5), ('new_members_target', 1), ('active_members_booking', 1), ('arpm', 1),
          ('amenity_revenue', 0.6)]
AD_HOC_SESSIONS = {'heavy': 0.7, 'regular': 0.4, 'light': 0.15}

HOURS = [(7, 2), (8, 9), (9, 8), (10, 6), (11, 5), (12, 2), (13, 4), (14, 5), (15, 5), (16, 4), (17, 3),
         (18, 1.2), (19, 0.6), (20, 0.4), (21, 0.2)]
WEEKEND_HOURS = [(9, 2), (10, 3), (11, 3), (12, 2), (14, 2), (15, 2), (16, 2), (17, 1), (20, 1)]
DOW = [1.2, 1.05, 1.0, 0.95, 0.8]  # Mon..Fri


def pick(rng, pairs):
    total = sum(w for _, w in pairs)
    x = rng.random() * total
    for v, w in pairs:
        x -= w
        if x < 0:
            return v
    return pairs[-1][0]


def poisson(rng, lam):
    if lam <= 0:
        return 0
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p < limit:
            return k
        k += 1


def at(d, hour, rng):
    return datetime(d.year, d.month, d.day, hour) + timedelta(seconds=rng.randrange(3600))


def ts(dt):
    return dt.strftime('%Y-%m-%d %H:%M:%S')


def scorecard_factor(d):
    if d < SCORECARD_FADE:
        return 1.0
    return max(0.3, 1.0 - 0.7 * (d - SCORECARD_FADE).days / 14)


def generate():
    rng = random.Random(SEED)
    days = [START + DAY * i for i in range((END - START).days + 1)]

    # People. Names pair a common English first name with a common surname.
    firsts, lasts = FIRST[:], LAST[:]
    rng.shuffle(firsts)
    rng.shuffle(lasts)
    users, uid, joined_on, last_day = [], {}, {}, {}
    for i, (key, _group, kind, joined) in enumerate(USERS):
        first, last = firsts[i % len(firsts)], lasts[(i * 7) % len(lasts)]
        joined = joined or date(2024, 9, 2) + DAY * rng.randrange(560)
        uid[key], joined_on[key] = i + 1, joined
        last_day[key] = date(2026, 5, 25) + DAY * rng.randrange(50) if kind == 'stopper' else END
        users.append((i + 1, '%s %s' % (first, last), '%s.%s@pulsegym.example' % (first.lower(), last.lower()),
                      joined.isoformat()))

    # Assets: dashboards 1 to 14, metrics from 101.
    aid, assets = {}, []
    metric_rows = [(n, l, 'pulse', PULSE_CREATED) for n, l in PULSE_METRICS] + OTHER_METRICS
    for i, (label, path, created, *_rest) in enumerate(DASHBOARDS):
        aid[label] = i + 1
        owner = uid[OWNERS[label]]
        assets.append((i + 1, 'dashboard', path, label, None, created.isoformat(), owner))
    for i, (name, label, dataset, created) in enumerate(metric_rows):
        aid[name] = 101 + i
        assets.append((101 + i, 'metric', name, label, dataset, created.isoformat(), None))
    metrics_of = {label: [aid[m] for m in mets] for label, *_r, mets in DASHBOARDS}
    dashboard_metrics = [(aid[label], m) for label, *_r in DASHBOARDS for m in metrics_of[label]]

    # Each person's taste: base weight x group x a personal factor, fixed for the whole log.
    taste = {key: {label: w * GROUP_BOOST[group].get(label, 1) * rng.uniform(0.6, 1.4)
                   for label, _p, _c, w, _s, _m in DASHBOARDS}
             for key, group, _k, _j in USERS}

    def options(key, d):
        out = []
        for label, _p, created, _w, stop, _m in DASHBOARDS:
            w = taste[key][label]
            if w <= 0 or d < created or (stop and d > stop):
                continue
            if label == 'Weekly Studio Scorecard':
                w *= scorecard_factor(d)
            out.append((label, w))
        return out

    # Views first; queries follow once every view is known, in time order, so the cache sees them right.
    views, ad_hoc = [], []
    for d in days:
        weekend = d.weekday() >= 5
        hours = WEEKEND_HOURS if weekend else HOURS
        for key, _group, kind, _j in USERS:
            if d < joined_on[key] or d > last_day[key] or kind == 'never':
                continue
            rate = SESSIONS[kind] * (WEEKEND if weekend else DOW[d.weekday()])
            opts = options(key, d)
            for _ in range(poisson(rng, rate)):
                dt = at(d, pick(rng, hours), rng)
                for _ in range(1 + poisson(rng, 0.35)):
                    views.append((dt, key, pick(rng, opts)))
                    dt += timedelta(seconds=rng.randint(40, 600))
            if _group == 'data' and not weekend:
                for _ in range(poisson(rng, AD_HOC_SESSIONS[kind])):
                    dt = at(d, pick(rng, hours), rng)
                    for _ in range(1 + poisson(rng, 0.8)):
                        ad_hoc.append((dt, key, pick(rng, AD_HOC)))
                        dt += timedelta(seconds=rng.randint(5, 120))

    events, cached_until = [], {}
    for dt, key, label in sorted(views):
        events.append((dt, uid[key], aid[label], 'view', None))
        if cached_until.get(label, datetime.min) > dt:
            continue
        cached_until[label] = dt + CACHE
        for m in metrics_of[label]:
            events.append((dt + timedelta(seconds=rng.randint(1, 8)), uid[key], m, 'query', aid[label]))
    events += [(dt, uid[key], aid[m], 'query', None) for dt, key, m in ad_hoc]

    # Story 6: one person exports one dashboard to a spreadsheet every Monday around 08:00, as a manual workflow.
    EXPORTER, EXPORTED = 'ops_1', 'Member Retention'
    export_from = max(joined_on[EXPORTER], date(2026, 6, 1))
    for d in days:
        if d.weekday() == 0 and export_from <= d <= last_day[EXPORTER]:
            dt = datetime(d.year, d.month, d.day, 8) + timedelta(minutes=rng.randint(0, 9), seconds=rng.randint(0, 59))
            events.append((dt, uid[EXPORTER], aid[EXPORTED], 'export', None))

    # Nothing after the end of today.
    cutoff = datetime(END.year, END.month, END.day) + DAY
    events = sorted((e for e in events if e[0] < cutoff), key=lambda e: tuple(-1 if v is None else v for v in e))
    event_rows = [(i + 1, ts(e[0])) + e[1:] for i, e in enumerate(events)]

    return {
        'users': ([('user_id', 'INTEGER'), ('name', 'VARCHAR'), ('email', 'VARCHAR'), ('joined_on', 'DATE')],
                  users),
        'assets': ([('asset_id', 'INTEGER'), ('asset_type', 'VARCHAR'), ('name', 'VARCHAR'), ('label', 'VARCHAR'),
                    ('dataset', 'VARCHAR'), ('created_on', 'DATE'), ('owner_id', 'INTEGER')], assets),
        'dashboard_metrics': ([('dashboard_asset_id', 'INTEGER'), ('metric_asset_id', 'INTEGER')], dashboard_metrics),
        'events': ([('event_id', 'BIGINT'), ('occurred_at', 'TIMESTAMP'), ('user_id', 'INTEGER'),
                    ('asset_id', 'INTEGER'), ('action', 'VARCHAR'), ('parent_dashboard_id', 'INTEGER')],
                   event_rows),
    }


def digest(tables):
    h = hashlib.sha256()
    for name in sorted(tables):
        cols, rows = tables[name]
        h.update(repr((name, cols)).encode())
        for r in rows:
            h.update(repr(r).encode())
    return h.hexdigest()


if __name__ == '__main__':
    out = generate()
    for name, (_cols, rows) in out.items():
        print('%-18s %8d rows' % (name, len(rows)))
    print('sha256', digest(out)[:16])
