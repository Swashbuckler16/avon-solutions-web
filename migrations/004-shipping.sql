ALTER TABLE shipments ADD COLUMN mode TEXT NOT NULL DEFAULT 'fixture' CHECK(mode IN ('fixture','simulator'));
ALTER TABLE shipments ADD COLUMN direction TEXT NOT NULL DEFAULT 'forward' CHECK(direction IN ('forward','reverse'));
ALTER TABLE shipments ADD COLUMN parent_id TEXT REFERENCES shipments(id);
ALTER TABLE shipments ADD COLUMN awb TEXT;
ALTER TABLE shipments ADD COLUMN service TEXT NOT NULL DEFAULT '';
ALTER TABLE shipments ADD COLUMN price_paise INTEGER NOT NULL DEFAULT 0 CHECK(price_paise>=0);
ALTER TABLE shipments ADD COLUMN snapshot TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(snapshot));
ALTER TABLE shipments ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN last_event_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shipments ADD COLUMN qa_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK(qa_status IN ('not_applicable','pending','accepted','rejected'));
ALTER TABLE shipments ADD COLUMN qa_note TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX shipment_awb ON shipments(awb) WHERE awb IS NOT NULL;
CREATE UNIQUE INDEX active_forward_order ON shipments(order_id) WHERE direction='forward' AND status<>'cancelled';
CREATE UNIQUE INDEX active_reverse_parent ON shipments(parent_id) WHERE direction='reverse' AND status<>'cancelled';
CREATE TABLE shipping_quotes (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), parent_id TEXT REFERENCES shipments(id),
 order_revision INTEGER NOT NULL, warehouse_revision INTEGER NOT NULL,
 carrier TEXT NOT NULL, service TEXT NOT NULL, price_paise INTEGER NOT NULL,
 chargeable_kg REAL NOT NULL, eta_days INTEGER NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), expires_at INTEGER NOT NULL
);
CREATE TABLE booking_attempts (
 user_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
 quote_id TEXT NOT NULL REFERENCES shipping_quotes(id), scenario TEXT NOT NULL,
 attempts INTEGER NOT NULL, outcome TEXT NOT NULL,
 shipment_id TEXT REFERENCES shipments(id), created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_key)
);
CREATE TABLE tracking_events (
 id INTEGER PRIMARY KEY, shipment_id TEXT NOT NULL REFERENCES shipments(id), event_key TEXT NOT NULL,
 status TEXT NOT NULL, location TEXT NOT NULL, note TEXT NOT NULL,
 occurred_at INTEGER NOT NULL, received_at INTEGER NOT NULL,
 applied INTEGER NOT NULL CHECK(applied IN (0,1)), disposition TEXT NOT NULL,
 raw TEXT NOT NULL CHECK(json_valid(raw)), UNIQUE(shipment_id,event_key)
);
CREATE INDEX tracking_timeline ON tracking_events(shipment_id,occurred_at,id);
CREATE TABLE shipment_audit (
 id INTEGER PRIMARY KEY, shipment_id TEXT NOT NULL REFERENCES shipments(id),
 user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE delivery_proofs (
 id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL REFERENCES shipments(id),
 uploaded_by TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL,
 content BLOB NOT NULL, sha256 TEXT NOT NULL, created_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
 reviewed_by TEXT REFERENCES users(id), reviewed_at INTEGER, review_note TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX proof_shipment ON delivery_proofs(shipment_id,created_at);
