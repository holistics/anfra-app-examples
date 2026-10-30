# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.4.2"]
# ///
"""Print every story beat in docs/love-line/plan.md section 1 next to its target.

    uv run scripts/love-line/check.py
"""
from pathlib import Path

import duckdb

DB = Path(__file__).resolve().parents[2] / "data" / "loveline.duckdb"
con = duckdb.connect(str(DB), read_only=True)


def q(sql):
    return con.execute(sql).fetchall()


def table(title, rows, head):
    print(f"\n## {title}")
    print("  " + " | ".join(f"{h:>14}" for h in head))
    for r in rows:
        print("  " + " | ".join(f"{(round(v, 1) if isinstance(v, float) else v)!s:>14}" for v in r))


FUNNEL = """
  SELECT {seg} AS seg, count(*) AS seen,
    1000.0 * count_if(is_right) / count(*) AS rights,
    1000.0 * count_if(s.match_id IS NOT NULL) / count(*) AS matched,
    1000.0 * count_if(m.first_message_at IS NOT NULL) / count(*) AS messaged,
    1000.0 * count_if(m.reached_5) / count(*) AS real_chats,
    1000.0 * count_if(m.off_app_at IS NOT NULL) / count(*) AS off_app
  FROM swipes s JOIN users u ON u.user_id = s.swiper_id LEFT JOIN matches m USING (match_id)
  GROUP BY ALL ORDER BY 1"""
table("Funnel per 1,000 seen · target 1000 → 380 → 95 → 57 → 23 → 7",
      q(FUNNEL.format(seg="'All'")) + q(FUNNEL.format(seg="u.gender")) + q(FUNNEL.format(seg="u.city")) + q(FUNNEL.format(seg="u.age_band")),
      ["segment", "seen", "rights", "matched", "messaged", "real chats", "off app"])

T = {"Cooking a meal": (7, "rising"), "Dog photo": (6, ""), "Reading a book": (5, ""), "Asks a question": (3, ""), "Travel photo": (1, ""),
     "Gym selfie": (-4, ""), "Sunglasses everywhere": (-6, ""), "Group photo first": (-8, ""), "Heavy filter": (-9, ""), "Holding a fish": (-12, "sinking")}
avg = q("SELECT avg(is_right::int) FROM swipes")[0][0]
last = "swiped_at >= TIMESTAMP '2026-10-15' - INTERVAL 28 DAY"
prior = "swiped_at < TIMESTAMP '2026-10-15' - INTERVAL 28 DAY AND swiped_at >= TIMESTAMP '2026-10-15' - INTERVAL 56 DAY"
avg_l = q(f"SELECT avg(is_right::int) FROM swipes WHERE {last}")[0][0]
avg_p = q(f"SELECT avg(is_right::int) FROM swipes WHERE {prior}")[0][0]
rows = q(f"""SELECT trait, 100 * (avg(is_right::int) - {avg}),
  100 * ((avg(is_right::int) FILTER ({last}) - {avg_l}) - (avg(is_right::int) FILTER ({prior}) - {avg_p}))
  FROM swipe_traits GROUP BY 1""")
table(f"Trait lift, pts vs average ({100 * avg:.1f}%)", sorted([(t, T[t][0], l, tr, T[t][1]) for t, l, tr in rows], key=lambda r: -r[1]),
      ["trait", "target", "lift", "4w trend", "story"])

table("Says vs. Swipes: % of right swipes breaking each rule · target any 30–35%, age most",
      q("""SELECT u.gender, 100 * avg(breaks_any::int), 100 * avg(breaks_age::int), 100 * avg(breaks_height::int),
             100 * avg(breaks_distance::int), 100 * avg(breaks_smoking::int), 100 * avg(breaks_education::int)
           FROM swipes s JOIN users u ON u.user_id = s.swiper_id WHERE is_right GROUP BY ROLLUP (1) ORDER BY 1 NULLS FIRST"""),
      ["gender", "any", "age", "height", "distance", "smoking", "education"])
table("Seen profiles outside the stated height rule · women strictest",
      q("""SELECT u.gender, 100 * avg(breaks_height::int), median(coalesce(u.pref_height_min, u.pref_height_max))
           FROM swipes s JOIN users u ON u.user_id = s.swiper_id GROUP BY 1 ORDER BY 1"""), ["gender", "% seen outside", "median rule"])

hm = q("""SELECT u.age_group, s.target_age_group, 100 * count_if(match_id IS NOT NULL) / count(*)
          FROM swipes s JOIN users u ON u.user_id = s.swiper_id WHERE is_right GROUP BY 1, 2""")
G = ["18–22", "23–26", "27–30", "31–35", "36+"]
cell = {(a, b): v for a, b, v in hm}
table("Match rate heatmap · swiper (rows) × liked (cols) · diagonal, younger = lower",
      [(a, *[cell.get((a, b), 0.0) for b in G]) for a in G], ["swiper", *G])

table("Pickiness → match rate · story 45 / 35 / 25 / 15 (was 31 … 6)",
      q("""SELECT u.right_rate_bucket, count(DISTINCT u.user_id), 100 * count_if(match_id IS NOT NULL) / count_if(is_right)
           FROM swipes s JOIN users u ON u.user_id = s.swiper_id GROUP BY 1 ORDER BY 1"""), ["bucket", "users", "match rate"])

table("Never said hi · who said hi first, from the swiper's side · men send ~64% of first messages",
      q("""SELECT u.gender, 100 * avg((first_message_by = 'you')::int), 100 * avg((first_message_by = 'them')::int),
             100 * avg((first_message_by IS NULL)::int)
           FROM swipes s JOIN users u ON u.user_id = s.swiper_id WHERE s.match_id IS NOT NULL GROUP BY ROLLUP (1) ORDER BY 1 NULLS FIRST"""),
      ["gender", "you %", "them %", "nobody %"])
table("Never said hi · message rate by the swiper's pile of matches · falls as the pile grows",
      q("""SELECT u.match_pile, count(DISTINCT u.user_id), 100 * avg((m.first_message_at IS NOT NULL)::int)
           FROM swipes s JOIN users u ON u.user_id = s.swiper_id JOIN matches m USING (match_id) GROUP BY 1 ORDER BY min(u.match_count)"""),
      ["pile", "people", "messaged %"])
table("Never said hi · chance a silent match still gets a hello, by how long it has been silent",
      q("""WITH b AS (SELECT hours_to_first_bucket AS w, count(*) AS n FROM matches GROUP BY 1),
             o AS (SELECT *, CASE w WHEN 'Within 1 hour' THEN 1 WHEN '1–6 hours' THEN 2 WHEN '6–24 hours' THEN 3 WHEN '1–3 days' THEN 4 WHEN '3+ days' THEN 5 END AS k FROM b)
           SELECT t.k, 100 * sum(n) FILTER (WHERE o.k > t.k) / (sum(n) FILTER (WHERE o.k > t.k) + sum(n) FILTER (WHERE o.k IS NULL))
           FROM o, (VALUES (0), (1), (2), (3), (4)) t(k) GROUP BY 1 ORDER BY 1"""),
      ["silent past", "hello %"])

table("Openers · reply rate (story 81 75 66 45 37 28 18, photo ≈ 4.5× hey) · alive at 10",
      q("""SELECT opener_type, count(*), 100 * avg(got_reply::int), 100 * avg(alive_at_10::int)
           FROM matches WHERE first_message_at IS NOT NULL GROUP BY 1 ORDER BY 3 DESC"""), ["opener", "chats", "reply %", "alive@10 %"])
table("Wait → reply rate · story ~70 / 60 / 45 / 28 / 12",
      q("""SELECT hours_to_first_bucket, 100 * avg(got_reply::int) FROM matches WHERE first_message_at IS NOT NULL
           GROUP BY 1 ORDER BY 2 DESC"""), ["wait", "reply %"])
table("Overall · reply rate, real chats / messaged, off / real",
      q("""SELECT 100 * avg(got_reply::int), 100 * avg(reached_5::int), 100 * count_if(off_app_at IS NOT NULL) / count_if(reached_5)
           FROM matches WHERE first_message_at IS NOT NULL"""), ["reply", "reach 5", "off/real"])

table("Ghost Town · last message count of chats that died after a reply (mode should be 3)",
      q("""SELECT message_count, count(*) FROM matches WHERE got_reply AND off_app_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 5"""),
      ["messages", "chats"])
table("Last words · story haha 24, double 19, plan 18, insta 14, voice 9, wall 7, other 9",
      q("""SELECT last_message_type, 100 * count(*) / sum(count(*)) OVER () FROM matches
           WHERE got_reply AND off_app_at IS NULL GROUP BY 1 ORDER BY 2 DESC"""), ["type", "%"])
table("Double texts answered · story 19%; fast-reply chats last 3× longer",
      q("""SELECT 100 * avg(double_text_answered::int) FILTER (WHERE double_texted),
             avg(message_count) FILTER (WHERE reply_within_hour) / avg(message_count) FILTER (WHERE NOT reply_within_hour)
           FROM matches"""), ["answered %", "fast/slow len"])

table("Off the app · days to swap (story 12 / 34 / 29 / 17 / 8)",
      q("""SELECT days_to_off_app_bucket, 100 * count(*) / sum(count(*)) OVER () FROM matches
           WHERE off_app_at IS NOT NULL GROUP BY 1 ORDER BY min(days_to_off_app)"""), ["bucket", "%"])
table("Median days to swap (story 4) · men ask first (story 62%) · date rate woman/man (story 1.6×)",
      q("""SELECT median(days_to_off_app), 100 * avg((asked_by_gender = 'man')::int),
             avg(led_to_date::int) FILTER (WHERE asked_by_gender = 'woman') / avg(led_to_date::int) FILTER (WHERE asked_by_gender = 'man')
           FROM matches WHERE off_app_at IS NOT NULL"""), ["median days", "men ask %", "ratio"])
table("Deletion reasons · story tired 44, met someone 31, break 25",
      q("SELECT delete_reason, 100 * count(*) / sum(count(*)) OVER () FROM users WHERE deleted_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC"),
      ["reason", "%"])
table("Sizes", q("""SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM user_traits), (SELECT count(*) FROM swipes),
                           (SELECT count(*) FROM swipe_traits), (SELECT count(*) FROM matches)"""),
      ["users", "user_traits", "swipes", "swipe_traits", "matches"])
