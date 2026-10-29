# usage: uv run --no-project --with duckdb==1.4.2 python -I tools/sqlcheck.py anfra/db/duckdb/ecommerce.duckdb gallery/sql/A.json
# Runs each card's hand-written SQL on the sample DuckDB and checks its focus patterns and line width.
import duckdb, json, re, sys
c = duckdb.connect(sys.argv[1], read_only=True)
c.execute("set search_path='public'")
data = json.load(open(sys.argv[2]))
bad = 0
for k, v in data.items():
    sql = v['sql']
    w = max(len(l) for l in sql.split('\n'))
    for f in v.get('focus', []):
        if not any(re.search(f, l) for l in sql.split('\n')): print(f'{k}: focus {f!r} matches no line'); bad += 1
    if w > 64: print(f'{k}: a line is {w} chars (max 64)'); bad += 1
    if v.get('norun'): print(f'{k}: skipped (norun)'); continue
    try:
        for stmt in [s for s in sql.split(';') if s.strip() and not all(l.strip().startswith('--') or not l.strip() for l in s.split('\n'))]:
            r = c.execute(stmt).fetchall()
        print(f'{k}: ok, {len(r)} rows, first {r[:2]}')
    except Exception as e:
        print(f'{k}: ERROR {e}'.split('\n')[0]); bad += 1
sys.exit(1 if bad else 0)
