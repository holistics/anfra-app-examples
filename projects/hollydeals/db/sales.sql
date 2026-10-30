-- Sales Funnel Tracker: schema `sales` in a DuckDB file. Same tables and views as the Postgres schema, rebuilt on every build.
DROP SCHEMA IF EXISTS sales CASCADE;
CREATE SCHEMA sales;

-- One row per weekly report (week id = the report folder name, month = first day of the month of `generated`).
CREATE TABLE sales.reports (
  week text PRIMARY KEY,
  generated_on date NOT NULL,
  window_start date,
  window_end date,
  month date NOT NULL,
  counts_won int,
  counts_lost int,
  counts_promising int,
  counts_new int,
  counts_highlight int,
  counts_quiet int,
  counts_ok bool,
  source_path text NOT NULL
);
CREATE TABLE sales.deals (
  slug text PRIMARY KEY,
  name text NOT NULL,
  owner text,
  deal_stage text,
  amount numeric,
  currency text,
  amount_period text CHECK (amount_period IN ('mo', 'yr')),
  deal_created date,
  first_call date,
  close_date date,
  last_responded date,
  trial_status text,
  trial_builders int,
  trial_active_users int,
  trial_expiry date,
  health text,
  win_probability_text text,
  assessment text,
  next_steps text,
  key_contacts text,
  file_path text,
  location text CHECK (location IN ('deals', 'deals-archive', 'customers'))
);
CREATE TABLE sales.deal_weeks (
  week text REFERENCES sales.reports,
  slug text REFERENCES sales.deals,
  PRIMARY KEY (week, slug),
  name_shown text NOT NULL,
  owner text,
  status text NOT NULL CHECK (status IN ('Won', 'Lost', 'Close-lost due', 'New', 'Stuck', 'Good progress',
                                         'Also moving', 'Quiet')),
  sub_status text,
  paragraph text NOT NULL,
  win_pct int,
  source_path text NOT NULL
);
CREATE TABLE sales.feedback (
  id int PRIMARY KEY,
  week text REFERENCES sales.reports,
  text text NOT NULL,
  slugs text[] NOT NULL,
  deal_count int NOT NULL
);
CREATE TABLE sales.quotes (
  id int PRIMARY KEY,
  week text REFERENCES sales.reports,
  slug text REFERENCES sales.deals,
  quote text NOT NULL
);

-- One row per sales rep with a photo (a data: URI), loaded from data/reps/, which is never committed. Matched to a
-- deal's owner by first name; a rep with no photo shows their initials.
CREATE TABLE sales.reps (
  name text PRIMARY KEY,
  photo text NOT NULL
);

CREATE VIEW sales.v_deal_weeks AS
SELECT
  dw.week, dw.slug, dw.name_shown, dw.owner, dw.status, dw.sub_status, dw.paragraph, dw.win_pct, dw.source_path,
  r.month,
  coalesce(dw.status = 'New' AND dw.week = min(dw.week) FILTER (WHERE dw.status = 'New') OVER (PARTITION BY dw.slug), false) AS is_first_new,
  coalesce(dw.status = 'Won' AND dw.week = min(dw.week) FILTER (WHERE dw.status = 'Won') OVER (PARTITION BY dw.slug), false) AS is_first_won,
  coalesce(dw.status = 'Lost' AND dw.week = min(dw.week) FILTER (WHERE dw.status = 'Lost') OVER (PARTITION BY dw.slug), false) AS is_first_lost,
  dw.status NOT IN ('Won', 'Lost') AS is_live,
  r.week_seq,
  left(split_part(dw.paragraph, '. ', 1), 160) AS first_sentence
FROM sales.deal_weeks dw
JOIN (SELECT week, month, rank() OVER (ORDER BY week) AS week_seq FROM sales.reports) r ON r.week = dw.week;

-- One row per deal a feedback bullet names (its slugs), joined to deals in the semantic layer. A slug need not have a
-- deals row, and a bullet naming no deal keeps one row with a null slug, so no bullet is lost.
CREATE VIEW sales.v_feedback_deals AS
SELECT f.id AS feedback_id, f.week, s.slug
FROM sales.feedback f
LEFT JOIN LATERAL unnest(f.slugs) AS s(slug) ON true;

