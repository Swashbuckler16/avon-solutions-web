ALTER TABLE orders ADD COLUMN creation_seq INTEGER NOT NULL DEFAULT 0;
UPDATE orders SET creation_seq=rowid;
CREATE INDEX order_creation_sequence ON orders(creation_seq);
