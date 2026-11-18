CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
  role TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')),
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX session_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE TABLE warehouses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE
);
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  destination TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL CHECK(status IN ('new','unprocessed','shipped','cancelled')),
  payment_mode TEXT NOT NULL CHECK(payment_mode IN ('prepaid','cod')),
  amount_paise INTEGER NOT NULL CHECK(amount_paise >= 0),
  created_date TEXT NOT NULL,
  synthetic INTEGER NOT NULL DEFAULT 1 CHECK(synthetic IN (0,1))
);
CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL CHECK(status IN ('info_received','in_transit','out_for_delivery','delivered','exception','rto','cancelled')),
  carrier TEXT NOT NULL,
  created_date TEXT NOT NULL,
  synthetic INTEGER NOT NULL DEFAULT 1 CHECK(synthetic IN (0,1))
);
CREATE INDEX order_date ON orders(created_date);
CREATE INDEX shipment_date ON shipments(created_date);
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
