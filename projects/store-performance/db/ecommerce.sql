-- Store performance demo: schema `ecommerce`. Rebuilt by scripts/load_data.sh.
DROP SCHEMA IF EXISTS ecommerce CASCADE;
CREATE SCHEMA ecommerce;

CREATE TABLE ecommerce.countries (id int PRIMARY KEY, name text NOT NULL, code text NOT NULL);
CREATE TABLE ecommerce.cities (id int PRIMARY KEY, name text NOT NULL, country_id int NOT NULL REFERENCES ecommerce.countries);
CREATE TABLE ecommerce.categories (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE ecommerce.merchants (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE ecommerce.products (
  id int PRIMARY KEY,
  category_id int NOT NULL REFERENCES ecommerce.categories,
  name text NOT NULL,
  merchant_id int NOT NULL REFERENCES ecommerce.merchants,
  created_at timestamptz NOT NULL,
  price numeric(10, 2) NOT NULL CHECK (price > 0),
  cost numeric(10, 2) NOT NULL CHECK (cost > 0),
  product_image_url text
);
CREATE TABLE ecommerce.users (
  id int PRIMARY KEY,
  sign_up_date date NOT NULL,
  sign_up_at timestamptz NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  birth_date date NOT NULL,
  gender text NOT NULL,
  city_id int NOT NULL REFERENCES ecommerce.cities
);
CREATE TABLE ecommerce.orders (
  id int PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  created_at timestamptz NOT NULL,
  user_id int NOT NULL REFERENCES ecommerce.users,
  discount numeric(4, 2) NOT NULL CHECK (discount >= 0 AND discount < 1),
  delivery_attempts int NOT NULL
);
CREATE TABLE ecommerce.order_items (
  id int PRIMARY KEY,
  order_id int NOT NULL REFERENCES ecommerce.orders,
  product_id int NOT NULL REFERENCES ecommerce.products,
  quantity int NOT NULL CHECK (quantity > 0)
);
CREATE INDEX ON ecommerce.orders (created_at);
CREATE INDEX ON ecommerce.order_items (order_id);
CREATE INDEX ON ecommerce.order_items (product_id);
CREATE INDEX ON ecommerce.users (sign_up_at);
