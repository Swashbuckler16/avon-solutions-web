ALTER TABLE shipments ADD COLUMN expected_delivery_at INTEGER;
ALTER TABLE report_definitions ADD COLUMN format TEXT NOT NULL DEFAULT 'csv' CHECK(format IN ('csv','xlsx'));
ALTER TABLE report_runs ADD COLUMN format TEXT NOT NULL DEFAULT 'csv' CHECK(format IN ('csv','xlsx'));
ALTER TABLE report_runs ADD COLUMN workbook TEXT NOT NULL DEFAULT '';
ALTER TABLE freight_entries ADD COLUMN resolution TEXT NOT NULL DEFAULT 'open' CHECK(resolution IN ('open','disputed','resolved'));
ALTER TABLE freight_entries ADD COLUMN resolution_note TEXT NOT NULL DEFAULT '';
CREATE TABLE freight_imports (
 event_key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, shipment_id TEXT NOT NULL REFERENCES shipments(id), created_at INTEGER NOT NULL
);
CREATE TABLE workspace_brand (
 id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, initials TEXT NOT NULL, accent TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO workspace_brand(id,name,initials,accent) VALUES(1,'Avon Solutions & Logistics','A','teal');
CREATE TABLE user_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id), theme TEXT NOT NULL CHECK(theme IN ('light','dark','system')),
 density TEXT NOT NULL CHECK(density IN ('comfortable','compact')), revision INTEGER NOT NULL DEFAULT 1
);
