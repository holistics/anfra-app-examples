-- DuckDB port of cspipeline's src/cspipeline/schema.sql: the 8 tables an
-- analytics app reads, with identical column names, plus its 4 views and one
-- derived view (account_movements_resolved).
--
-- Differences from Postgres, all mechanical:
--   BIGSERIAL -> BIGINT (ids are written explicitly); CHAR(3) -> VARCHAR;
--   NUMERIC(18,6) -> DECIMAL(18,6); no FOREIGN KEYs and no partial unique
--   indexes (DuckDB has neither) -- build_duckdb.py asserts both as invariants;
--   substring(... from regex) -> regexp_extract.
-- Placeholders {{...}} are filled from persona.py by build_duckdb.py.
-- Removed on purpose: annotations.split/split_source and the settlements table
-- (the persona has no shared household, so there is no chi chung to split).
-- Skipped on purpose (pipeline plumbing, not analytics): wf_sync, wf_mirror,
-- alerts, alert_seen, parse_failures, push_subscriptions, budget_alerts.

CREATE TABLE statements (
    id                        BIGINT PRIMARY KEY,
    gmail_msg_id              VARCHAR UNIQUE NOT NULL,
    bank                      VARCHAR NOT NULL,
    card_last4                VARCHAR NOT NULL,
    period_start              DATE NOT NULL,
    period_end                DATE NOT NULL,
    pdf_path                  VARCHAR NOT NULL,
    fetched_at                TIMESTAMPTZ NOT NULL,
    parsed_at                 TIMESTAMPTZ,
    outstanding_balance_minor BIGINT,
    min_payment_minor         BIGINT,
    payment_due_date          DATE,
    synthetic                 BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE transactions (
    id               BIGINT PRIMARY KEY,
    statement_id     BIGINT NOT NULL,          -- -> statements.id
    row_hash         VARCHAR NOT NULL,
    txn_date         DATE NOT NULL,
    posted_date      DATE,
    description      VARCHAR NOT NULL,
    merchant         VARCHAR,
    amount_minor     BIGINT NOT NULL,          -- native minor units; + = spend, - = credit
    currency         VARCHAR NOT NULL,
    amount_vnd_minor BIGINT,                   -- non-VND rows only
    fx_rate          DECIMAL(18,6),
    fx_rate_date     DATE,
    category         VARCHAR,                  -- legacy 12-value auto category
    category_source  VARCHAR,
    categorized_at   TIMESTAMPTZ,
    source           VARCHAR,                  -- NULL = TCB PDF; vib_email | vib_reward
    external_id      VARCHAR,
    occurred_at      TIMESTAMPTZ,
    UNIQUE (statement_id, row_hash)
);

CREATE TABLE fx_rates (
    currency     VARCHAR NOT NULL,
    rate_date    DATE NOT NULL,
    vnd_per_unit DECIMAL(18,6) NOT NULL,
    source       VARCHAR NOT NULL,
    PRIMARY KEY (currency, rate_date)
);

CREATE TABLE bank_movements (
    id                    BIGINT PRIMARY KEY,
    source                VARCHAR NOT NULL,    -- tcb_sms | timo_email
    external_id           VARCHAR NOT NULL,
    account_ref           VARCHAR,
    occurred_at           TIMESTAMPTZ NOT NULL,
    direction             VARCHAR NOT NULL CHECK (direction IN ('D', 'C')),
    amount_minor          BIGINT NOT NULL,     -- always positive; sign is `direction`
    currency              VARCHAR NOT NULL DEFAULT 'VND',
    running_balance_minor BIGINT,
    counterparty          VARCHAR,
    description           VARCHAR NOT NULL,
    raw_body              VARCHAR NOT NULL,
    parser_version        VARCHAR NOT NULL,
    category              VARCHAR,
    category_source       VARCHAR,
    categorized_at        TIMESTAMPTZ,
    UNIQUE (source, external_id)
);

CREATE TABLE annotations (
    id              BIGINT PRIMARY KEY,
    target_kind     VARCHAR NOT NULL CHECK (target_kind IN ('card', 'account')),
    statement_id    BIGINT,
    row_hash        VARCHAR,
    source          VARCHAR,
    external_id     VARCHAR,
    flow            VARCHAR,
    note            VARCHAR,
    updated_at      TIMESTAMPTZ NOT NULL,
    category        VARCHAR,                   -- the 11-tag taxonomy, or 'Đã hoàn'
    category_source VARCHAR NOT NULL DEFAULT 'user'
);

CREATE TABLE budgets (
    id              BIGINT PRIMARY KEY,
    scope_type      VARCHAR NOT NULL,
    scope_value     VARCHAR NOT NULL,
    period          VARCHAR NOT NULL DEFAULT 'monthly',
    limit_minor     BIGINT NOT NULL,
    warn_pct        INTEGER NOT NULL DEFAULT 80,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL,
    overflow_buffer BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (scope_type, scope_value, period)
);

CREATE TABLE cashback_milestones (
    id              BIGINT PRIMARY KEY,
    src             VARCHAR NOT NULL,
    ordinal         INTEGER NOT NULL,
    threshold_minor BIGINT NOT NULL,
    reward_minor    BIGINT NOT NULL,           -- TOTAL reward at this rung
    period          VARCHAR NOT NULL DEFAULT 'monthly',
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL,
    cycle_close_day SMALLINT CHECK (cycle_close_day BETWEEN 1 AND 28),
    accrual         VARCHAR NOT NULL DEFAULT 'step' CHECK (accrual IN ('step', 'rate')),
    valid_through   DATE,
    plan_name       VARCHAR,
    UNIQUE (src, ordinal, period)
);

-- ---------------------------------------------------------------- views (ported)

CREATE VIEW unified_movements AS
    SELECT
        'card'                                  AS kind,
        t.txn_date::TIMESTAMPTZ                 AS occurred_at,
        t.description,
        t.merchant,
        t.category,
        t.amount_minor,
        t.currency,
        t.amount_vnd_minor,
        NULL::BIGINT                            AS running_balance_minor,
        NULL::VARCHAR                           AS account_ref,
        NULL::VARCHAR                           AS counterparty,
        NULL::VARCHAR                           AS direction
    FROM transactions t
    WHERE NOT EXISTS (SELECT 1 FROM annotations a
                      WHERE a.target_kind = 'card' AND a.statement_id = t.statement_id
                        AND a.row_hash = t.row_hash AND a.category = 'Đã hoàn')
    UNION ALL
    SELECT
        'account'                               AS kind,
        bm.occurred_at,
        bm.description,
        bm.counterparty                         AS merchant,
        bm.category,
        bm.amount_minor,
        bm.currency,
        CASE WHEN bm.currency = 'VND' THEN bm.amount_minor ELSE NULL END AS amount_vnd_minor,
        bm.running_balance_minor,
        bm.account_ref,
        bm.counterparty,
        bm.direction
    FROM bank_movements bm;

CREATE VIEW jar_movements AS
SELECT
    bm.id,
    bm.occurred_at,
    bm.amount_minor,
    bm.direction,
    regexp_extract(bm.description,
                   '(?:Money|Shared) Pot - (?:Withdraw from|Contribute to) (.+)$', 1) AS jar_name,
    CASE
        WHEN bm.description ILIKE '%Pot - Contribute to%' THEN 'in'
        WHEN bm.description ILIKE '%Pot - Withdraw from%'  THEN 'out'
    END AS jar_direction
FROM bank_movements bm
WHERE bm.source = 'timo_email'
  AND (bm.description ILIKE '%Pot - Contribute to%'
       OR bm.description ILIKE '%Pot - Withdraw from%');

CREATE VIEW card_transactions_tagged AS
SELECT
    t.id,
    t.statement_id,
    t.row_hash,
    t.txn_date,
    t.description,
    t.merchant,
    COALESCE(t.amount_vnd_minor, t.amount_minor) AS amount_minor,   -- VND
    t.amount_minor AS native_amount_minor,
    t.currency,
    t.amount_vnd_minor,
    t.category AS legacy_category,
    s.bank,
    s.card_last4,
    s.period_start,
    s.period_end,
    a.note,
    a.category,
    a.category_source
FROM transactions t
JOIN statements s ON s.id = t.statement_id
LEFT JOIN annotations a
    ON a.target_kind = 'card'
   AND a.statement_id = t.statement_id
   AND a.row_hash = t.row_hash
WHERE a.category IS DISTINCT FROM 'Đã hoàn';

CREATE VIEW account_movements_tagged AS
SELECT
    bm.id,
    bm.source,
    bm.external_id,
    bm.occurred_at,
    bm.direction,
    bm.amount_minor,
    CASE WHEN bm.direction = 'D' THEN bm.amount_minor ELSE 0 END AS spend_minor,
    bm.currency,
    bm.category AS legacy_category,
    bm.counterparty,
    bm.description,
    bm.account_ref,
    a.note,
    a.category,
    a.category_source,
    a.flow AS flow_tag
FROM bank_movements bm
LEFT JOIN annotations a
    ON a.target_kind = 'account'
   AND a.source = bm.source
   AND a.external_id = bm.external_id;

-- ---------------------------------------------------------------- derived view (new)
-- cspipeline keeps its flow rules in Python (store._flow_case_sql). This is that
-- CASE, same rule order, with the persona's literals, so the data layer carries
-- the rules for apps: `flow` = manual tag else rule; `is_spend` = the one
-- definition of account spend (store._ACCOUNT_NON_SPEND_PATTERNS + _TRANSFER_FLOWS).
CREATE VIEW account_movements_resolved AS
WITH f AS (
    SELECT
        m.*,
        CASE m.source WHEN 'tcb_sms' THEN 'tcb_debit' WHEN 'timo_email' THEN 'timo' ELSE m.source END AS src,
        COALESCE(m.flow_tag, CASE
            WHEN m.description ILIKE '%thanh toan no the tin dung%'
              OR m.description ILIKE '%trich no sao ke%' THEN 'settlement'
            WHEN m.source = 'timo_email'
             AND (m.description ILIKE '%tra no credit%' OR m.description ILIKE '%thanh toan credit%'
                  OR lower(trim(m.description)) = 'credit') THEN 'settlement'
            WHEN m.source = 'timo_email'
             AND (m.description ILIKE '%Pot - Contribute%' OR m.description ILIKE '%Pot - Withdraw%'
                  OR m.description ILIKE '%Transfer from Spend to TD%'
                  OR m.description ILIKE '%TAT TOAN TIET KIEM%') THEN 'internal'
            WHEN m.source = 'tcb_sms'
             AND (m.description ILIKE '%gui me%' OR m.description ILIKE '%cho me%'
                  OR (m.amount_minor = {{MOM_AMOUNT}} AND m.description ILIKE '%{{PERSONA_NAME}}%')) THEN 'mom'
            WHEN m.source = 'tcb_sms'
             AND m.amount_minor = {{TIMO_TOPUP}} AND m.description ILIKE '%{{PERSONA_NAME}}%' THEN 'timo'
            ELSE 'other'
        END) AS flow
    FROM account_movements_tagged m
)
SELECT
    f.*,
    (f.direction = 'D'
     AND NOT (f.description ILIKE '%Pot - Contribute to%' OR f.description ILIKE '%Pot - Withdraw from%'
              OR f.description ILIKE '%thanh toan no the tin dung%' OR f.description ILIKE '%trich no sao ke%')
     AND f.flow NOT IN ('settlement', 'timo', 'internal', 'othercard', 'savings', 'investment')) AS is_spend
FROM f;

-- ---------------------------------------------------------------- investment layer (new)
-- Not in cspipeline: shaped like Wealthfolio's own tables (accounts, assets, quotes,
-- activities), so the Wealthfolio clone reads what Wealthfolio would store. Built by
-- db/invest.py. Amounts are minor units of `currency` (VND đồng; USD cents).
CREATE TABLE assets (
    symbol          VARCHAR PRIMARY KEY,
    name            VARCHAR NOT NULL,
    asset_class     VARCHAR NOT NULL,          -- EQUITY | FIXED_INCOME | COMMODITY | INDEX
    asset_sub_class VARCHAR NOT NULL,          -- Stock | ETF | Bond fund | Gold | Benchmark
    currency        VARCHAR NOT NULL,
    sector          VARCHAR,
    country         VARCHAR
);

CREATE TABLE quotes (
    symbol     VARCHAR NOT NULL,               -- -> assets.symbol
    quote_date DATE NOT NULL,                  -- business days only
    close      DECIMAL(18, 2) NOT NULL,
    currency   VARCHAR NOT NULL,
    source     VARCHAR NOT NULL,
    PRIMARY KEY (symbol, quote_date)
);

CREATE TABLE accounts (
    id            VARCHAR PRIMARY KEY,
    name          VARCHAR NOT NULL,
    account_type  VARCHAR NOT NULL CHECK (account_type IN ('CASH', 'SECURITIES', 'CREDIT_CARD')),
    account_group VARCHAR NOT NULL,            -- Investments | Cash | Liabilities
    currency      VARCHAR NOT NULL,
    src           VARCHAR,                     -- the ledger's src for bank and card accounts
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE activities (
    id                 VARCHAR PRIMARY KEY,
    account_id         VARCHAR NOT NULL,       -- -> accounts.id
    symbol             VARCHAR,                -- -> assets.symbol; NULL for cash activities
    activity_type      VARCHAR NOT NULL CHECK (activity_type IN
                         ('ADD_HOLDING', 'BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL')),
    activity_date      TIMESTAMPTZ NOT NULL,
    quantity           DECIMAL(18, 4),
    unit_price         DECIMAL(18, 2),
    amount_minor       BIGINT NOT NULL,        -- gross; BUY/SELL/ADD_HOLDING = quantity × unit_price
    fee_minor          BIGINT NOT NULL DEFAULT 0,
    currency           VARCHAR NOT NULL,
    comment            VARCHAR,
    source_movement_id BIGINT,                 -- -> bank_movements.id that funded or received it
    is_opening         BOOLEAN NOT NULL DEFAULT false  -- the state on the first data day, not a flow
);
