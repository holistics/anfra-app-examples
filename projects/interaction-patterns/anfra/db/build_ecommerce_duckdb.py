"""Build db/duckdb/ecommerce.duckdb, the `ecommerce_duckdb` data source, from db/seed.dump.sql.

Run from the repository root (stop any `anfra serve` that has the file open first):

    uv run --with duckdb==1.4.2 python db/build_ecommerce_duckdb.py

DuckDB 1.4.2 is the version bundled with anfra 0.8.0. The dump's CREATE TABLE and INSERT
statements are loaded into schema `public`, so the models keep `table_name: 'public.<table>'`.
db/seed.sql is not read directly: it generates rows with Postgres's random(), so the dump is the
fixed copy of the data. The file is written to a temporary path and renamed into place, then
stamped by db/duckdb_stamps.sh.
"""
import os
import re
import subprocess
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'db' / 'seed.dump.sql'
DST = ROOT / 'db' / 'duckdb' / 'ecommerce.duckdb'
EXPECTED = {'customers': 200, 'products': 8, 'orders': 1500, 'order_items': 3020, 'countries': 6, 'sessions': 13500}


def main():
    sql = SRC.read_text()
    DST.parent.mkdir(parents=True, exist_ok=True)
    tmp = DST.with_name(DST.name + '.tmp')
    for p in (tmp, Path(str(tmp) + '.wal')):
        p.unlink(missing_ok=True)

    con = duckdb.connect(str(tmp))
    con.execute('CREATE SCHEMA IF NOT EXISTS public')
    tables = re.findall(r'^CREATE TABLE (public\.\w+) \((.*?)\);', sql, re.S | re.M)
    for name, cols in tables:
        con.execute(f'CREATE TABLE {name} ({cols})')
    con.execute('BEGIN')
    for line in sql.splitlines():
        if line.startswith('INSERT INTO public.'):
            con.execute(line)
    con.execute('COMMIT')
    for t, n in EXPECTED.items():
        got = con.execute(f'SELECT count(*) FROM public.{t}').fetchone()[0]
        if got != n:
            raise SystemExit(f'public.{t}: {got} rows, expected {n}')
    con.execute('CHECKPOINT')
    con.close()

    os.replace(tmp, DST)
    print(f'{DST.relative_to(ROOT)}: {DST.stat().st_size} bytes, duckdb {duckdb.__version__}')
    subprocess.run(['sh', str(ROOT / 'db' / 'duckdb_stamps.sh'), 'write'], check=True)


if __name__ == '__main__':
    main()
