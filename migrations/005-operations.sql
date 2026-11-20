CREATE TABLE exception_cases (
 id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL REFERENCES shipments(id), kind TEXT NOT NULL CHECK(kind IN ('ndr','npr')),
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','requested','resolved')),
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX open_exception ON exception_cases(shipment_id) WHERE status<>'resolved';
CREATE TABLE exception_history (
 id INTEGER PRIMARY KEY, case_id TEXT NOT NULL REFERENCES exception_cases(id), user_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE shipping_rules (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), name TEXT NOT NULL,
 priority INTEGER NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)), revision INTEGER NOT NULL DEFAULT 1,
 config TEXT NOT NULL CHECK(json_valid(config))
);
CREATE TABLE report_definitions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 filters TEXT NOT NULL CHECK(json_valid(filters)), interval_hours INTEGER NOT NULL DEFAULT 0,
 next_run INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE report_runs (
 id TEXT PRIMARY KEY, definition_id TEXT NOT NULL REFERENCES report_definitions(id), user_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('ready','failed')), message TEXT NOT NULL,
 content TEXT NOT NULL DEFAULT '', recipient TEXT NOT NULL, delivery TEXT NOT NULL DEFAULT 'local_only'
);
CREATE TABLE channels (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), name TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)), callbacks INTEGER NOT NULL CHECK(callbacks IN (0,1)), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE channel_events (
 id INTEGER PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES channels(id), event_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('imported','failed')),
 order_id TEXT REFERENCES orders(id), message TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(channel_id,event_key)
);
CREATE TABLE freight_entries (
 shipment_id TEXT PRIMARY KEY REFERENCES shipments(id), quoted_paise INTEGER NOT NULL CHECK(quoted_paise>=0),
 invoiced_paise INTEGER NOT NULL CHECK(invoiced_paise>=0), invoice_ref TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id), revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
CREATE TABLE shipment_feedback (
 shipment_id TEXT PRIMARY KEY REFERENCES shipments(id), score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),
 note TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
