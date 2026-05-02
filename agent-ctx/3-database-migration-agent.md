# Task 3 - Database Migration Support (SQLite/PostgreSQL/MySQL)

## Agent: Database Migration Agent
## Date: 2025-01-01

## Summary
Implemented multi-database support for the supply chain management project, enabling switching between SQLite (development), PostgreSQL (production), and MySQL (production) via Prisma schema files and a switching script.

## Work Completed

### 1. PostgreSQL Schema (`prisma/schema.postgresql.prisma`)
- Changed provider to `postgresql`
- Changed all `@default(cuid())` IDs to `@default(uuid())` for native PostgreSQL UUID support
- Added `@map("snake_case")` annotations to all camelCase field names for PostgreSQL convention
- Added `@@map("snake_case_table_name")` for all model table names
- Converted JSON string fields to proper `Json` type:
  - `ShipmentItem.events`: `String @default("[]")` → `Json @default("[]")`
  - `Supplier.ratingDetails`: `String?` → `Json?`
  - `AuditLog.details`: `String` → `Json`

### 2. MySQL Schema (`prisma/schema.mysql.prisma`)
- Changed provider to `mysql`
- Kept `@default(cuid())` for IDs (compatible with MySQL)
- Added `@map("snake_case")` annotations to all camelCase field names
- Added `@@map("snake_case_table_name")` for all model table names
- Converted JSON string fields to `Json` type (same as PostgreSQL)
- Added `@db.VarChar(N)` constraints for string fields (e.g., `@db.VarChar(191)` for unique/indexed fields)
- Added `@db.Text` for long string fields (descriptions, content, notes, user agents)

### 3. SQLite Schema Backup (`prisma/schema.sqlite.prisma`)
- Created exact copy of existing `schema.prisma` for the switching script to reference

### 4. Database Switching Script (`scripts/switch-db.ts`)
- Accepts `sqlite`, `postgresql`, or `mysql` as argument
- Backs up current schema to `schema.prisma.backup`
- Copies the appropriate schema file to `schema.prisma`
- Provides clear next-step instructions with database-specific connection URL examples

### 5. Environment Configuration (`.env.example`)
- Documented all three database connection URL formats
- Included NextAuth configuration placeholders
- Added instructions for using the switching script

### 6. Package.json Scripts
- Added `db:switch:pg` → `bun run scripts/switch-db.ts postgresql`
- Added `db:switch:mysql` → `bun run scripts/switch-db.ts mysql`
- Added `db:switch:sqlite` → `bun run scripts/switch-db.ts sqlite`

### 7. Database Configuration API (`src/app/api/db-config/route.ts`)
- GET endpoint returns current database type, connection info, and supported types
- Parses DATABASE_URL to detect SQLite/PostgreSQL/MySQL
- Masks sensitive information (only shows host, port, database, user for PG/MySQL)
- Tested and confirmed working: returns `{"type":"sqlite","info":{"file":"/home/z/my-project/db/custom.db"},"supportedTypes":["sqlite","postgresql","mysql"]}`

### 8. Database Config Panel Component (`src/components/admin/DatabaseConfigPanel.tsx`)
- Client component using TanStack Query for data fetching
- Displays current database type with emoji icons (🗃️ SQLite, 🐘 PostgreSQL, 🐬 MySQL)
- Shows connection status badge with color coding per database type
- Displays connection details (host, port, database, file path)
- Lists supported database types
- Loading skeleton and error states handled

## Files Created/Modified
- **Created**: `prisma/schema.postgresql.prisma`
- **Created**: `prisma/schema.mysql.prisma`
- **Created**: `prisma/schema.sqlite.prisma`
- **Created**: `scripts/switch-db.ts`
- **Created**: `.env.example`
- **Created**: `src/app/api/db-config/route.ts`
- **Created**: `src/components/admin/DatabaseConfigPanel.tsx`
- **Modified**: `package.json` (added db:switch scripts)

## Key Design Decisions
1. **Separate schema files** instead of dynamic generation — simpler, more maintainable, and allows Prisma's type system to work correctly for each provider
2. **PostgreSQL uses uuid()** for IDs — PostgreSQL has native UUID support making it more efficient
3. **MySQL uses cuid()** for IDs — MySQL doesn't have native UUID function support in Prisma
4. **JSON type for PG/MySQL** — Both support native JSON columns, which is more efficient than storing JSON as strings
5. **@db.VarChar(191)** for MySQL unique fields — MySQL has index length limits on utf8mb4 columns
6. **Snake_case mapping** — Follows PostgreSQL and MySQL naming conventions with @map/@@map

## Verification
- ESLint: 0 errors, 6 warnings (pre-existing TanStack Virtual compatibility warnings)
- API endpoint tested: `/api/db-config` returns correct SQLite configuration
- Dev server running without issues
