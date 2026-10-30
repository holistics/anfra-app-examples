"""python -m etl.load_ecommerce: load the generated store data into schema `ecommerce` (run db/ecommerce.sql first)."""
import os

import psycopg

from etl.ecommerce import generate

DSN = os.environ.get("STORE_DSN", "postgresql://store:store@localhost:5441/store")  # the Postgres in docker-compose.yml
COLUMNS = {  # in load order
    "countries": ["id", "name", "code"],
    "cities": ["id", "name", "country_id"],
    "categories": ["id", "name"],
    "merchants": ["id", "name"],
    "products": ["id", "category_id", "name", "merchant_id", "created_at", "price", "cost", "product_image_url"],
    "users": ["id", "sign_up_date", "sign_up_at", "first_name", "last_name", "full_name", "email", "birth_date", "gender", "city_id"],
    "orders": ["id", "status", "created_at", "user_id", "discount", "delivery_attempts"],
    "order_items": ["id", "order_id", "product_id", "quantity"],
}


def load(conn, data):
    with conn.cursor() as cur:
        cur.execute("TRUNCATE " + ", ".join(f"ecommerce.{t}" for t in reversed(COLUMNS)))
        for table, cols in COLUMNS.items():
            with cur.copy(f"COPY ecommerce.{table} ({', '.join(cols)}) FROM STDIN") as copy:
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
