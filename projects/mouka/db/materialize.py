"""Precompute the heaviest facts as tables in the synthetic DuckDB.

db/.venv/bin/python -I db/materialize.py        (anfra serve must be stopped: it holds the DuckDB lock)

fct_position_days, fct_account_days and fct_portfolio_days cross every position and account with every day and run window
functions over the result; fct_cash_ahead projects 30 days from the ledger, the recurring series and the card statements.
As query models they were rebuilt inside every query that touched them: 2-4 GB and 1.5-22 s each, and canal-query kept the
memory (20 GB locally; an OOM-killed pod on proto, 19 Oct 2026). The data only changes when db/build_duckdb.py runs, so they
are computed here once, into mat_<name>, and the models read those tables. Their SQL is in db/sql/, moved verbatim from the
models; fct_cash_ahead's inputs stay query models, so they come in as temporary views of their own AML. build_duckdb.py calls
materialize() before it closes the new database.
"""
import re
from pathlib import Path

import duckdb

HERE = Path(__file__).resolve().parent
DB = HERE / "finance.duckdb"
MODELS = HERE.parent / "models" / "facts"
ORDER = ["position_days", "account_days", "portfolio_days", "cash_ahead"]   # each may read the ones before it
VIEWS = ["ledger", "recurring", "card_statements"]                            # query models fct_cash_ahead reads


def model_sql(name: str) -> str:
    """A query model's SQL, as its AML has it, with {{ #fct_x }} references as plain names (the temporary views)."""
    aml = (MODELS / f"fct_{name}.model.aml").read_text()
    start = aml.index("  query: @sql\n") + len("  query: @sql\n")
    return re.sub(r"\{\{ #(fct_[a-z_]+) \}\}", r"\1", aml[start:aml.index(";;", start)])


def materialize(con: duckdb.DuckDBPyConnection) -> None:
    # canal-query, which runs these models' queries, opens DuckDB in UTC; the SQL's casts to local dates depend on the
    # session time zone, so the tables are built in the same one, or every day near midnight would shift
    con.execute("SET TimeZone = 'UTC'")
    for name in VIEWS:
        con.execute(f"CREATE OR REPLACE TEMP VIEW fct_{name} AS {model_sql(name)}")
    for name in ORDER:
        sql = (HERE / "sql" / f"fct_{name}.sql").read_text()
        con.execute(f"CREATE OR REPLACE TABLE mat_{name} AS {sql}")
        print(f"mat_{name}: {con.execute(f'SELECT count(*) FROM mat_{name}').fetchone()[0]} rows")


if __name__ == "__main__":
    con = duckdb.connect(str(DB))
    materialize(con)
    con.close()
