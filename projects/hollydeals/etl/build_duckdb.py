"""python -m etl.build_duckdb [--out data/funnel.duckdb]

Build HollyDeals' tables from the seeded fake generator into a fresh DuckDB file, schema `sales`. The file is built
beside --out and moved into place only when complete, so a failed build leaves the old file as it was.
"""
import argparse
import os
from pathlib import Path

import duckdb

from etl.gen_sales import generate
from etl.sales_load import COLUMNS

SCHEMA_SQL = Path(__file__).resolve().parent.parent / "db" / "sales.sql"


def write(path, data):
    conn = duckdb.connect(str(path))
    try:
        conn.execute(SCHEMA_SQL.read_text())
        for table, cols in COLUMNS.items():
            rows = [[row.get(c) for c in cols] for row in data.get(table, [])]
            if rows:
                marks = ", ".join("?" for _ in cols)
                conn.executemany(f"INSERT INTO sales.{table} ({', '.join(cols)}) VALUES ({marks})", rows)
        conn.execute("CHECKPOINT")
    finally:
        conn.close()


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m etl.build_duckdb")
    ap.add_argument("--out", default="data/funnel.duckdb")
    args = ap.parse_args(argv)
    data = generate()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".building")
    tmp.unlink(missing_ok=True)
    try:
        write(tmp, data)
        os.replace(tmp, out)
    finally:
        tmp.unlink(missing_ok=True)
        out.with_name(out.name + ".building.wal").unlink(missing_ok=True)
    for table in COLUMNS:
        print(table, len(data.get(table, [])))


if __name__ == "__main__":
    main()
