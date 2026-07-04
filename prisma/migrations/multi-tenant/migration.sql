-- ============================================================
-- Multi-Tenant Migration
-- Adds tenant_id to all business tables and enables PostgreSQL
-- Row Level Security (RLS) for tenant data isolation.
-- ============================================================

-- ==================== Tenant Table ====================
CREATE TABLE IF NOT EXISTS "tenants" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "name"      TEXT NOT NULL,
    "slug"      TEXT NOT NULL UNIQUE,
    "plan"      TEXT NOT NULL DEFAULT 'starter',
    "status"    TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "tenants_slug_idx" ON "tenants"("slug");
CREATE INDEX IF NOT EXISTS "tenants_status_idx" ON "tenants"("status");

-- ==================== Default Tenant ====================
-- Ensures existing data remains accessible after migration.
INSERT INTO "tenants" ("id", "name", "slug", "plan", "status")
VALUES ('default', 'Default Tenant', 'default', 'enterprise', 'active')
ON CONFLICT ("id") DO NOTHING;

-- ==================== Add tenant_id to business tables ====================
-- Each ALTER adds a nullable column first, backfills with 'default',
-- then enforces NOT NULL so existing rows are preserved.

-- products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "products" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "products" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "products_tenant_id_idx" ON "products"("tenant_id");

-- inventories
ALTER TABLE "inventories" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "inventories" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "inventories" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "inventories" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "inventories_tenant_id_idx" ON "inventories"("tenant_id");

-- sales_records
ALTER TABLE "sales_records" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "sales_records" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "sales_records" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sales_records" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "sales_records_tenant_id_idx" ON "sales_records"("tenant_id");

-- shipment_items
ALTER TABLE "shipment_items" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "shipment_items" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "shipment_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "shipment_items" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "shipment_items_tenant_id_idx" ON "shipment_items"("tenant_id");

-- cost_records
ALTER TABLE "cost_records" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "cost_records" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "cost_records" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "cost_records" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "cost_records_tenant_id_idx" ON "cost_records"("tenant_id");

-- alert_rules
ALTER TABLE "alert_rules" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "alert_rules" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "alert_rules" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "alert_rules" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "alert_rules_tenant_id_idx" ON "alert_rules"("tenant_id");

-- supply_chain_events
ALTER TABLE "supply_chain_events" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "supply_chain_events" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "supply_chain_events" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "supply_chain_events" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "supply_chain_events_tenant_id_idx" ON "supply_chain_events"("tenant_id");

-- reorder_orders
ALTER TABLE "reorder_orders" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "reorder_orders" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "reorder_orders" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "reorder_orders" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "reorder_orders_tenant_id_idx" ON "reorder_orders"("tenant_id");

-- supply_chain_notes
ALTER TABLE "supply_chain_notes" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "supply_chain_notes" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "supply_chain_notes" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "supply_chain_notes" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "supply_chain_notes_tenant_id_idx" ON "supply_chain_notes"("tenant_id");

-- suppliers
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "suppliers" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "suppliers" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- audit_logs
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "audit_logs" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "users" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "users_tenant_id_idx" ON "users"("tenant_id");

-- sessions
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "sessions" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "sessions" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "sessions_tenant_id_idx" ON "sessions"("tenant_id");

-- return_records
ALTER TABLE "return_records" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "return_records" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "return_records" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "return_records" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "return_records_tenant_id_idx" ON "return_records"("tenant_id");

-- defect_records
ALTER TABLE "defect_records" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "defect_records" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "defect_records" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "defect_records" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "defect_records_tenant_id_idx" ON "defect_records"("tenant_id");

-- warranty_costs
ALTER TABLE "warranty_costs" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "warranty_costs" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "warranty_costs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "warranty_costs" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "warranty_costs_tenant_id_idx" ON "warranty_costs"("tenant_id");

-- compliance_certs
ALTER TABLE "compliance_certs" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "compliance_certs" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "compliance_certs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "compliance_certs" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "compliance_certs_tenant_id_idx" ON "compliance_certs"("tenant_id");

-- regulation_changes
ALTER TABLE "regulation_changes" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "regulation_changes" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "regulation_changes" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "regulation_changes" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "regulation_changes_tenant_id_idx" ON "regulation_changes"("tenant_id");

-- product_hs_codes
ALTER TABLE "product_hs_codes" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "product_hs_codes" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "product_hs_codes" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "product_hs_codes" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "product_hs_codes_tenant_id_idx" ON "product_hs_codes"("tenant_id");

-- tariff_rules
ALTER TABLE "tariff_rules" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "tariff_rules" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "tariff_rules" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "tariff_rules" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "tariff_rules_tenant_id_idx" ON "tariff_rules"("tenant_id");

-- decision_logs
ALTER TABLE "decision_logs" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "decision_logs" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "decision_logs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "decision_logs" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "decision_logs_tenant_id_idx" ON "decision_logs"("tenant_id");

-- feedback_logs
ALTER TABLE "feedback_logs" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "feedback_logs" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "feedback_logs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "feedback_logs" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "feedback_logs_tenant_id_idx" ON "feedback_logs"("tenant_id");

-- engine_weights
ALTER TABLE "engine_weights" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "engine_weights" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "engine_weights" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "engine_weights" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "engine_weights_tenant_id_idx" ON "engine_weights"("tenant_id");

-- "DecisionTrace"
ALTER TABLE "DecisionTrace" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "DecisionTrace" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "DecisionTrace" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "DecisionTrace" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "DecisionTrace_tenant_id_idx" ON "DecisionTrace"("tenant_id");

-- "TraceStep"
ALTER TABLE "TraceStep" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "TraceStep" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "TraceStep" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "TraceStep" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "TraceStep_tenant_id_idx" ON "TraceStep"("tenant_id");

-- "TraceToolCall"
ALTER TABLE "TraceToolCall" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "TraceToolCall" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "TraceToolCall" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "TraceToolCall" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "TraceToolCall_tenant_id_idx" ON "TraceToolCall"("tenant_id");

-- "TracedClaim"
ALTER TABLE "TracedClaim" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
UPDATE "TracedClaim" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "TracedClaim" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "TracedClaim" ALTER COLUMN "tenant_id" SET DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "TracedClaim_tenant_id_idx" ON "TracedClaim"("tenant_id");

-- ==================== Foreign Keys ====================
ALTER TABLE "products"           ADD CONSTRAINT "products_tenant_id_fkey"           FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventories"        ADD CONSTRAINT "inventories_tenant_id_fkey"        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_records"      ADD CONSTRAINT "sales_records_tenant_id_fkey"      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment_items"     ADD CONSTRAINT "shipment_items_tenant_id_fkey"     FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_records"       ADD CONSTRAINT "cost_records_tenant_id_fkey"       FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alert_rules"        ADD CONSTRAINT "alert_rules_tenant_id_fkey"        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supply_chain_events" ADD CONSTRAINT "supply_chain_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reorder_orders"     ADD CONSTRAINT "reorder_orders_tenant_id_fkey"     FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supply_chain_notes" ADD CONSTRAINT "supply_chain_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers"          ADD CONSTRAINT "suppliers_tenant_id_fkey"          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs"         ADD CONSTRAINT "audit_logs_tenant_id_fkey"         FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users"              ADD CONSTRAINT "users_tenant_id_fkey"              FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions"           ADD CONSTRAINT "sessions_tenant_id_fkey"           FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_records"     ADD CONSTRAINT "return_records_tenant_id_fkey"     FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "defect_records"     ADD CONSTRAINT "defect_records_tenant_id_fkey"     FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warranty_costs"     ADD CONSTRAINT "warranty_costs_tenant_id_fkey"     FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_certs"   ADD CONSTRAINT "compliance_certs_tenant_id_fkey"   FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "regulation_changes" ADD CONSTRAINT "regulation_changes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_hs_codes"   ADD CONSTRAINT "product_hs_codes_tenant_id_fkey"   FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tariff_rules"       ADD CONSTRAINT "tariff_rules_tenant_id_fkey"       FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_logs"      ADD CONSTRAINT "decision_logs_tenant_id_fkey"      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feedback_logs"      ADD CONSTRAINT "feedback_logs_tenant_id_fkey"      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "engine_weights"     ADD CONSTRAINT "engine_weights_tenant_id_fkey"     FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionTrace"      ADD CONSTRAINT "DecisionTrace_tenant_id_fkey"      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TraceStep"          ADD CONSTRAINT "TraceStep_tenant_id_fkey"          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TraceToolCall"      ADD CONSTRAINT "TraceToolCall_tenant_id_fkey"      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TracedClaim"        ADD CONSTRAINT "TracedClaim_tenant_id_fkey"        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==================== Row Level Security (PostgreSQL) ====================
-- RLS enforces tenant isolation at the database layer. Each policy
-- compares the row's tenant_id against the current session setting
-- `app.tenant_id`. Bypassed by superusers / roles with BYPASSRLS.

DO $$
DECLARE
    t TEXT;
    business_tables TEXT[] := ARRAY[
        'products','inventories','sales_records','shipment_items','cost_records',
        'alert_rules','supply_chain_events','reorder_orders','supply_chain_notes',
        'suppliers','audit_logs','users','sessions','return_records','defect_records',
        'warranty_costs','compliance_certs','regulation_changes','product_hs_codes',
        'tariff_rules','decision_logs','feedback_logs','engine_weights',
        'DecisionTrace','TraceStep','TraceToolCall','TracedClaim'
    ];
BEGIN
    FOREACH t IN ARRAY business_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'DROP POLICY IF EXISTS tenant_isolation ON %I',
            t
        );
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::text)',
            t
        );
        EXECUTE format(
            'CREATE POLICY tenant_isolation_with_check ON %I WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::text)',
            t
        );
    END LOOP;
END $$;

-- Allow the application role to bypass RLS for tenant management operations
-- (e.g., creating new tenants). Adjust role name as needed.
-- GRANT BYPASSRLS TO "supply_chain_app";
