"""garmin-sync: login | migrate | sync | markers | fit | dev | demo-data

The offline side of Ran: it fills the database the Data Apps read (anfra, through AQL). Nothing
runs at request time: the apps never call it, and nothing they do writes back."""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import time

from dotenv import load_dotenv

from .sync import ROOT, sql_files


def main() -> None:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(prog="garmin-sync")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("login", help="log in to Garmin Connect once and save tokens")
    sub.add_parser("migrate", help="apply db/schema.sql, db/views.sql and their .d folders")
    sub.add_parser("sync", help="fetch everything missing from Garmin into Postgres")
    p_markers = sub.add_parser("markers", help="compute best efforts from stored samples (no Garmin calls)")
    p_markers.add_argument("--all", action="store_true", help="recompute every run, not only new ones")
    sub.add_parser("fit", help="fit the model (heat curve) and check race predictions, from stored data")
    p_dev = sub.add_parser("dev", help="run `anfra serve --no-apps` and the host (host/) together")
    p_dev.add_argument("--builtin", action="store_true", help="use anfra serve's own pages instead of the host")
    p_demo = sub.add_parser("demo-data", help="(re)create a database holding a synthetic runner (see garmin_sync/demo.py)")
    p_demo.add_argument("--db", default="garmin_demo")
    p_demo.add_argument("--seed", type=int, default=7)
    p_demo.add_argument("--goal-weeks", type=int, default=13, help="weeks to the goal marathon (a Sunday)")
    p_demo.add_argument("--next-race-days", type=int, default=None, help="also a 10K this many days out, with no goal time")
    p_demo.add_argument("--goal", default=None, help="goal time for the marathon, h:mm:ss (default: a few minutes under today's true fitness)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    for noisy in ("urllib3", "httpx", "garminconnect"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    if args.cmd == "login":
        from .sync import login_interactive

        login_interactive()
    elif args.cmd == "migrate":
        import psycopg

        from .sync import apply_sql

        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            apply_sql(conn)
        print("Applied " + ", ".join(str(p.relative_to(ROOT)) for p in sql_files()))
    elif args.cmd == "sync":
        from .sync import NotLoggedIn, SyncBusy, run_sync

        try:
            print(run_sync())
        except (NotLoggedIn, SyncBusy) as e:
            sys.exit(str(e))
    elif args.cmd == "markers":
        import psycopg

        from .markers import sync_best_efforts

        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            if args.all:
                conn.execute("delete from garmin.best_effort_done")
                conn.commit()
            print(f"Best efforts computed for {sync_best_efforts(conn, print)} runs")
    elif args.cmd == "fit":
        import json

        from .model import main as fit_main

        print(json.dumps(fit_main(), indent=2, default=str))
    elif args.cmd == "demo-data":
        from .demo import generate

        goal_s = None
        if args.goal:
            h, m, s = (int(x) for x in args.goal.split(":"))
            goal_s = h * 3600 + m * 60 + s
        print(generate(db=args.db, seed=args.seed, goal_weeks=args.goal_weeks, next_race_days=args.next_race_days, goal_time_s=goal_s))
    elif args.cmd == "dev":
        anfra = shutil.which("anfra")
        if not anfra:
            sys.exit("anfra CLI not found on PATH")
        procs = []
        if args.builtin:
            procs.append(subprocess.Popen([anfra, "serve"], cwd=ROOT))
        else:
            pnpm = shutil.which("pnpm")
            if not pnpm:
                sys.exit("pnpm not found on PATH (the host needs Node 22+ and pnpm; or run `garmin-sync dev --builtin`)")
            host = ROOT / "host"
            if not (host / "node_modules").exists():
                subprocess.run([pnpm, "install"], cwd=host, check=True)
            # anfra answers the core API only; export links point at the host, where the browser is
            site = os.getenv("ANFRA_SITE_URL", "http://localhost:5173")
            procs.append(subprocess.Popen([anfra, "serve", "--no-apps"], cwd=ROOT, env={**os.environ, "ANFRA_SITE_URL": site}))
            procs.append(subprocess.Popen([pnpm, "dev"], cwd=host, env={**os.environ, "ANFRA_REPO": str(ROOT)}))
            print("Ran: http://localhost:5173", flush=True)
        try:
            while all(p.poll() is None for p in procs):
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            for p in procs:
                p.terminate()


if __name__ == "__main__":
    main()
