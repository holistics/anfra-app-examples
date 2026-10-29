"""Scaffold one AML model per Nether ledger table, read off the built DuckDB.

One-shot scaffold, not a build step. The emitted `models/nether_*.model.aml`
files are the source of truth and may be hand-edited; re-running overwrites
them, so re-run only when the schema itself changes.

Datasets (the seven Books, plus the hidden nether_mint) are hand-written in `datasets/nether_*.dataset.aml`
because relationships and the metric catalogue are design decisions, not
schema facts.

Conventions it follows:
  - Model name `nether_<table>`, singular, per the architecture spine.
  - Every column becomes a dimension; FK columns stay visible so a dataset
    can join on them and the player can follow a key.
  - The first column is the primary key (the data generator writes it first).
  - Models hold dimensions only. No model `measure`: a model measure is a SQL
    aggregation of one raw column. Every number the game reads is a dataset
    metric written in AQL, with its source model on the many side
    (`nether_x | count(nether_x.x_id)`), so the fan-out guard (AD-11) lives in
    the metric and `check_nether_metrics.py` proves it.
"""

import duckdb
import pathlib
import re

REPO = pathlib.Path(__file__).resolve().parent.parent
DB = REPO / "data" / "nether.duckdb"
OUT = REPO / "models"

# The claims side is never a Book (AD-4), so it is never modelled.
SKIP = {"game_build", "game_case", "game_document"}

TYPES = {
    "VARCHAR": "text",
    "DATE": "date",
    "TIMESTAMP": "datetime",
    "BOOLEAN": "truefalse",
    "DOUBLE": "number",
    "INTEGER": "number",
    "BIGINT": "number",
}

def label(name):
    return name.replace("_", " ").title()


def model_aml(table, columns):
    pk = columns[0][0]
    lines = [
        f"Model nether_{table} {{",
        "  type: 'table'",
        f"  label: '{label(table)}'",
        "  data_source_name: 'nether'",
        f"  table_name: '{table}'",
        "",
    ]
    for col, db_type in columns:
        kind = TYPES.get(db_type)
        if kind is None:
            raise SystemExit(f"unmapped column type {db_type} on {table}.{col}")
        lines.append(f"  dimension {col} {{")
        lines.append(f"    label: '{label(col)}'")
        lines.append(f"    type: '{kind}'")
        if col == pk:
            lines.append("    primary_key: true")
        lines.append(f"    definition: @sql {{{{ #SOURCE.{col} }}}} ;;")
        lines.append("  }")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main():
    con = duckdb.connect(str(DB), read_only=True)
    tables = [
        t for (t,) in con.execute(
            "select table_name from information_schema.tables order by 1"
        ).fetchall()
        if t not in SKIP
    ]
    written = 0
    for table in tables:
        columns = con.execute(
            "select column_name, data_type from information_schema.columns "
            "where table_name = ? order by ordinal_position",
            [table],
        ).fetchall()
        path = OUT / f"nether_{table}.model.aml"
        path.write_text(model_aml(table, columns))
        written += 1
        print(f"  {path.relative_to(REPO)}")
    con.close()
    print(f"\n{written} models written to {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
