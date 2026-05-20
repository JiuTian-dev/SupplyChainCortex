-- Convert date-related String columns to proper DateTime types
-- Backward-compatible: YYYY-MM-DD strings cast cleanly to TIMESTAMP

-- SalesRecord: date String → DateTime
ALTER TABLE sales_records
  ALTER COLUMN date TYPE TIMESTAMP USING date::timestamp;

-- ShipmentItem: eta, actualDelivery String? → DateTime?
ALTER TABLE shipment_items
  ALTER COLUMN eta TYPE TIMESTAMP USING eta::timestamp,
  ALTER COLUMN actual_delivery TYPE TIMESTAMP USING actual_delivery::timestamp;

-- DefectRecord: detectedAt String → DateTime
ALTER TABLE defect_records
  ALTER COLUMN detected_at TYPE TIMESTAMP USING detected_at::timestamp;

-- Foreign key cascades: if a Product is deleted, related records are cleaned up
ALTER TABLE inventories
  DROP CONSTRAINT IF EXISTS inventories_product_id_fkey,
  ADD CONSTRAINT inventories_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE sales_records
  DROP CONSTRAINT IF EXISTS sales_records_product_id_fkey,
  ADD CONSTRAINT sales_records_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE shipment_items
  DROP CONSTRAINT IF EXISTS shipment_items_product_id_fkey,
  ADD CONSTRAINT shipment_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE cost_records
  DROP CONSTRAINT IF EXISTS cost_records_product_id_fkey,
  ADD CONSTRAINT cost_records_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
