"""python -m etl.load_logistics: load the generated freight data into schema `logistics` (run db/logistics.sql first)."""
import os

import psycopg

from etl.logistics import ANCHOR, generate

DSN = os.environ.get("ETA_DSN", "postgresql://eta:eta@localhost:5442/eta")  # the Postgres in docker-compose.yml
COLUMNS = {  # in load order
    "customers": ["id", "name", "segment", "region"],
    "ports": ["code", "name", "country", "region", "lat", "lon"],
    "stage_nominal": ["mode", "stage", "hours"],
    "shipments": ["id", "order_ref", "customer_id", "mode", "carrier", "origin_port", "dest_port", "goods_value_usd",
                  "booked_at", "promised_at", "original_eta", "current_eta", "current_stage", "delivered_at"],
    "stage_events": ["id", "shipment_id", "stage", "entered_at", "exited_at"],
    "risk_events": ["id", "shipment_id", "raised_at", "stage", "risk_factor", "previous_eta", "new_eta", "slip_hours"],
}


def load(conn, data):
    with conn.cursor() as cur:
        cur.execute("TRUNCATE logistics.risk_events, logistics.stage_events, logistics.shipments, "
                    "logistics.stage_nominal, logistics.ports, logistics.customers, logistics.meta")
        cur.execute("INSERT INTO logistics.meta (anchor_at) VALUES (%s)", (ANCHOR,))
        for table, cols in COLUMNS.items():
            with cur.copy(f"COPY logistics.{table} ({', '.join(cols)}) FROM STDIN") as copy:
                for row in data[table]:
                    copy.write_row([row[c] for c in cols])


def main():
    data = generate()
    with psycopg.connect(DSN) as conn:
        load(conn, data)
    for table in COLUMNS:
        print(table, len(data[table]))


if __name__ == "__main__":
    main()
