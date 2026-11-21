CREATE TABLE dispatch_profiles (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
 kind TEXT NOT NULL CHECK(kind IN ('rate','packing')), name TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), priority INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, config TEXT NOT NULL CHECK(json_valid(config))
);
CREATE INDEX dispatch_customer ON dispatch_profiles(customer_id,kind,active,priority);
CREATE TABLE order_links (
 source_id TEXT NOT NULL REFERENCES orders(id), target_id TEXT NOT NULL REFERENCES orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('split','merge')), created_at INTEGER NOT NULL,
 PRIMARY KEY(source_id,target_id)
);
