"""The `sales` tables (db/sales.sql) and the columns etl.build_duckdb writes, in load order."""
COLUMNS = {  # in load order
    "reports": ["week", "generated_on", "window_start", "window_end", "month", "counts_won", "counts_lost",
                "counts_promising", "counts_new", "counts_highlight", "counts_quiet", "counts_ok", "source_path"],
    "deals": ["slug", "name", "owner", "deal_stage", "amount", "currency", "amount_period", "deal_created",
              "first_call", "close_date", "last_responded", "trial_status", "trial_builders", "trial_active_users",
              "trial_expiry", "health", "win_probability_text", "assessment", "next_steps", "key_contacts",
              "file_path", "location"],
    "deal_weeks": ["week", "slug", "name_shown", "owner", "status", "sub_status", "paragraph", "win_pct",
                   "source_path"],
    "feedback": ["id", "week", "text", "slugs", "deal_count"],
    "quotes": ["id", "week", "slug", "quote"],
    "reps": ["name", "photo"],
}

