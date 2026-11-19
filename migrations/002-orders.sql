CREATE TABLE customers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
 phone TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL,
 state TEXT NOT NULL, pincode TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE users ADD COLUMN customer_id TEXT REFERENCES customers(id);
ALTER TABLE warehouses ADD COLUMN customer_id TEXT REFERENCES customers(id);
ALTER TABLE warehouses ADD COLUMN details TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details));
ALTER TABLE warehouses ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
ALTER TABLE warehouses ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES customers(id);
ALTER TABLE orders ADD COLUMN details TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details));
ALTER TABLE orders ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX order_customer ON orders(customer_id,created_date);
CREATE INDEX warehouse_customer ON warehouses(customer_id);
CREATE TABLE order_events (
 id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
 user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE import_mappings (
 user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 mapping TEXT NOT NULL CHECK(json_valid(mapping)), PRIMARY KEY(user_id,name)
);
