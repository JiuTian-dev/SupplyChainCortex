-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT NOT NULL,
    "unitCost" REAL NOT NULL,
    "sellingPrice" REAL NOT NULL,
    "weight" REAL NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'CN',
    "abcClass" TEXT NOT NULL DEFAULT 'C',
    "fsnClass" TEXT NOT NULL DEFAULT 'N',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "safetyStock" INTEGER NOT NULL,
    "reorderPoint" INTEGER NOT NULL,
    "inTransit" INTEGER NOT NULL DEFAULT 0,
    "turnoverRate" REAL NOT NULL DEFAULT 0,
    "turnoverDays" INTEGER NOT NULL DEFAULT 0,
    "stockStatus" TEXT NOT NULL DEFAULT 'healthy',
    "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "revenue" REAL NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "eta" TEXT,
    "actualDelivery" TEXT,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "events" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShipmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "rawMaterial" REAL NOT NULL,
    "labor" REAL NOT NULL,
    "logistics" REAL NOT NULL,
    "tariff" REAL NOT NULL,
    "platformFee" REAL NOT NULL,
    "exchangeRate" REAL NOT NULL DEFAULT 7.25,
    "destination" TEXT NOT NULL DEFAULT 'US',
    "totalLanded" REAL NOT NULL,
    "sellingPrice" REAL NOT NULL,
    "grossMargin" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupplyChainEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📦',
    "color" TEXT NOT NULL DEFAULT '#f97316',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "sku" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReorderOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "warehouse" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT '常规',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupplyChainNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '系统用户',
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "region" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "leadTime" INTEGER NOT NULL DEFAULT 14,
    "rating" REAL NOT NULL DEFAULT 0,
    "ratingDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "sku" TEXT,
    "userId" TEXT NOT NULL DEFAULT 'system',
    "userName" TEXT NOT NULL DEFAULT '系统用户',
    "details" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "avatar" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_subCategory_idx" ON "Product"("subCategory");

-- CreateIndex
CREATE INDEX "Product_category_subCategory_idx" ON "Product"("category", "subCategory");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_productId_key" ON "Inventory"("productId");

-- CreateIndex
CREATE INDEX "Inventory_sku_idx" ON "Inventory"("sku");

-- CreateIndex
CREATE INDEX "Inventory_warehouse_idx" ON "Inventory"("warehouse");

-- CreateIndex
CREATE INDEX "Inventory_stockStatus_idx" ON "Inventory"("stockStatus");

-- CreateIndex
CREATE INDEX "Inventory_warehouse_stockStatus_idx" ON "Inventory"("warehouse", "stockStatus");

-- CreateIndex
CREATE INDEX "SalesRecord_productId_idx" ON "SalesRecord"("productId");

-- CreateIndex
CREATE INDEX "SalesRecord_date_idx" ON "SalesRecord"("date");

-- CreateIndex
CREATE INDEX "SalesRecord_platform_idx" ON "SalesRecord"("platform");

-- CreateIndex
CREATE INDEX "SalesRecord_sku_idx" ON "SalesRecord"("sku");

-- CreateIndex
CREATE INDEX "SalesRecord_productId_date_idx" ON "SalesRecord"("productId", "date");

-- CreateIndex
CREATE INDEX "SalesRecord_platform_date_idx" ON "SalesRecord"("platform", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentItem_trackingNumber_key" ON "ShipmentItem"("trackingNumber");

-- CreateIndex
CREATE INDEX "ShipmentItem_productId_idx" ON "ShipmentItem"("productId");

-- CreateIndex
CREATE INDEX "ShipmentItem_status_idx" ON "ShipmentItem"("status");

-- CreateIndex
CREATE INDEX "ShipmentItem_riskLevel_idx" ON "ShipmentItem"("riskLevel");

-- CreateIndex
CREATE INDEX "ShipmentItem_sku_idx" ON "ShipmentItem"("sku");

-- CreateIndex
CREATE INDEX "ShipmentItem_status_riskLevel_idx" ON "ShipmentItem"("status", "riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "CostRecord_productId_key" ON "CostRecord"("productId");

-- CreateIndex
CREATE INDEX "CostRecord_sku_idx" ON "CostRecord"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRule_ruleId_key" ON "AlertRule"("ruleId");

-- CreateIndex
CREATE INDEX "AlertRule_enabled_idx" ON "AlertRule"("enabled");

-- CreateIndex
CREATE INDEX "SupplyChainEvent_type_idx" ON "SupplyChainEvent"("type");

-- CreateIndex
CREATE INDEX "SupplyChainEvent_sku_idx" ON "SupplyChainEvent"("sku");

-- CreateIndex
CREATE INDEX "SupplyChainEvent_isRead_idx" ON "SupplyChainEvent"("isRead");

-- CreateIndex
CREATE INDEX "SupplyChainEvent_createdAt_idx" ON "SupplyChainEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ReorderOrder_sku_idx" ON "ReorderOrder"("sku");

-- CreateIndex
CREATE INDEX "ReorderOrder_status_idx" ON "ReorderOrder"("status");

-- CreateIndex
CREATE INDEX "ReorderOrder_priority_idx" ON "ReorderOrder"("priority");

-- CreateIndex
CREATE INDEX "SupplyChainNote_sku_idx" ON "SupplyChainNote"("sku");

-- CreateIndex
CREATE INDEX "SupplyChainNote_category_idx" ON "SupplyChainNote"("category");

-- CreateIndex
CREATE INDEX "SupplyChainNote_priority_idx" ON "SupplyChainNote"("priority");

-- CreateIndex
CREATE INDEX "SupplyChainNote_isResolved_idx" ON "SupplyChainNote"("isResolved");

-- CreateIndex
CREATE INDEX "SupplyChainNote_isResolved_priority_idx" ON "SupplyChainNote"("isResolved", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "Supplier_region_idx" ON "Supplier"("region");

-- CreateIndex
CREATE INDEX "Supplier_category_idx" ON "Supplier"("category");

-- CreateIndex
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_sku_idx" ON "AuditLog"("sku");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_action_idx" ON "AuditLog"("entity", "action");

-- CreateIndex
CREATE INDEX "AuditLog_severity_createdAt_idx" ON "AuditLog"("severity", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

