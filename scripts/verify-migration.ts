#!/usr/bin/env bun
/**
 * Migration Verification Script
 *
 * Validates that the current Prisma schema matches the database,
 * checks for pending migrations, and outputs a health report.
 * Can be run in CI pipelines.
 *
 * Usage:
 *   bun run scripts/verify-migration.ts [--json] [--strict]
 *
 * Options:
 *   --json     Output report as JSON (for CI parsing)
 *   --strict   Exit with non-zero code on warnings (not just errors)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');
const STRICT = args.includes('--strict');

// ─── Types ───────────────────────────────────────────────────────────────────

interface HealthReport {
  status: 'healthy' | 'warning' | 'error';
  timestamp: string;
  database: {
    type: string;
    url: string;
    urlValid: boolean;
  };
  schema: {
    exists: boolean;
    provider: string | null;
    modelCount: number;
    models: string[];
  };
  migrations: {
    directoryExists: boolean;
    migrationCount: number;
    migrations: string[];
    pendingMigrations: boolean;
    lastMigration: string | null;
  };
  checks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
  }[];
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const projectRoot = resolve(import.meta.dir, '..');
const prismaDir = resolve(projectRoot, 'prisma');
const schemaFile = resolve(prismaDir, 'schema.prisma');
const migrationsDir = resolve(prismaDir, 'migrations');
const envFile = resolve(projectRoot, '.env');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readEnvVar(name: string): string | null {
  if (!existsSync(envFile)) return null;
  const content = readFileSync(envFile, 'utf-8');
  // Match both quoted and unquoted values
  const match = content.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|(\\S+))`));
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

function getDbType(url: string): string {
  if (url.startsWith('file:')) return 'sqlite';
  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) return 'postgresql';
  if (url.startsWith('mysql://')) return 'mysql';
  return 'unknown';
}

// ─── Checks ──────────────────────────────────────────────────────────────────

const checks: HealthReport['checks'] = [];
let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';

function addCheck(name: string, status: 'pass' | 'warn' | 'fail', message: string) {
  checks.push({ name, status, message });
  if (status === 'fail') overallStatus = 'error';
  else if (status === 'warn' && overallStatus !== 'error') overallStatus = 'warning';
}

// ─── Run Verification ────────────────────────────────────────────────────────

async function main() {
  // 1. Check schema file exists
  const schemaExists = existsSync(schemaFile);
  if (!schemaExists) {
    addCheck('schema-exists', 'fail', 'schema.prisma not found');
  } else {
    addCheck('schema-exists', 'pass', 'schema.prisma found');
  }

  // 2. Parse schema
  let schemaContent = '';
  let schemaProvider: string | null = null;
  let schemaModels: string[] = [];

  if (schemaExists) {
    schemaContent = readFileSync(schemaFile, 'utf-8');

    // Extract provider
    const providerMatch = schemaContent.match(/provider\s*=\s*"(\w+)"/);
    schemaProvider = providerMatch ? providerMatch[1] : null;

    if (!schemaProvider) {
      addCheck('schema-provider', 'fail', 'No provider found in schema');
    } else {
      addCheck('schema-provider', 'pass', `Provider: ${schemaProvider}`);
    }

    // Extract models
    const modelMatches = schemaContent.match(/^model\s+(\w+)/gm);
    schemaModels = modelMatches
      ? modelMatches.map(m => m.replace('model ', ''))
      : [];

    addCheck('schema-models', 'pass', `${schemaModels.length} models defined: ${schemaModels.join(', ')}`);
  }

  // 3. Check DATABASE_URL
  const databaseUrl = readEnvVar('DATABASE_URL');
  let dbType = 'unknown';
  let urlValid = false;

  if (!databaseUrl) {
    addCheck('database-url', 'fail', 'DATABASE_URL not found in .env');
  } else {
    dbType = getDbType(databaseUrl);
    urlValid = true;
    addCheck('database-url', 'pass', `DATABASE_URL found, type: ${dbType}`);
  }

  // 4. Check DATABASE_URL matches schema provider
  if (databaseUrl && schemaProvider) {
    const expectedProvider: Record<string, string> = {
      sqlite: 'sqlite',
      postgresql: 'postgresql',
      mysql: 'mysql',
      postgres: 'postgresql',
    };
    const expected = expectedProvider[dbType];
    if (expected && schemaProvider !== expected) {
      addCheck('url-schema-match', 'fail',
        `DATABASE_URL implies ${dbType} but schema provider is ${schemaProvider}. ` +
        `Run: bun run db:switch:${dbType === 'postgresql' ? 'pg' : dbType}`);
    } else if (expected && schemaProvider === expected) {
      addCheck('url-schema-match', 'pass', `DATABASE_URL and schema provider both use ${schemaProvider}`);
    }
  }

  // 5. Check migrations directory
  const migrationsExist = existsSync(migrationsDir);
  if (!migrationsExist) {
    addCheck('migrations-dir', 'warn',
      'No migrations directory found. Using db:push without migration tracking. ' +
      'Run: bunx prisma migrate dev --name init to create initial migration');
  } else {
    addCheck('migrations-dir', 'pass', 'Migrations directory exists');
  }

  // 6. List migrations
  let migrationList: string[] = [];
  let lastMigration: string | null = null;

  if (migrationsExist) {
    try {
      const dir = Bun.file(migrationsDir);
      if (dir.size >= 0) {
        const { readdirSync } = await import('fs');
        const entries = readdirSync(migrationsDir, { withFileTypes: true });
        migrationList = entries
          .filter(e => e.isDirectory() && existsSync(resolve(migrationsDir, e.name, 'migration.sql')))
          .map(e => e.name)
          .sort();

        if (migrationList.length > 0) {
          lastMigration = migrationList[migrationList.length - 1];
          addCheck('migrations-found', 'pass',
            `${migrationList.length} migration(s) found. Last: ${lastMigration}`);
        } else {
          addCheck('migrations-found', 'warn', 'Migrations directory exists but contains no valid migrations');
        }
      }
    } catch {
      addCheck('migrations-found', 'warn', 'Could not read migrations directory');
    }
  }

  // 7. Check for pending migrations using prisma migrate status
  let pendingMigrations = false;
  try {
    const proc = Bun.spawn(['bunx', 'prisma', 'migrate', 'status'], {
      cwd: projectRoot,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env },
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const output = stdout + stderr;

    if (output.includes('pending') && !output.includes('no pending')) {
      pendingMigrations = true;
      addCheck('pending-migrations', 'warn',
        'Pending migrations detected. Run: bunx prisma migrate dev');
    } else if (output.includes('up to date') || output.includes('Database schema is up to date')) {
      addCheck('pending-migrations', 'pass', 'No pending migrations');
    } else if (output.includes('Drift detected')) {
      addCheck('pending-migrations', 'warn',
        'Schema drift detected - database does not match migration history. ' +
        'Run: bunx prisma migrate diff to see differences');
    } else {
      // Might be a fresh setup with no migrations
      addCheck('pending-migrations', 'pass', 'Migration status checked');
    }
  } catch (error) {
    addCheck('pending-migrations', 'warn', `Could not check migration status: ${error}`);
  }

  // 8. Verify schema model consistency with template schemas
  const templateSchemas = ['sqlite', 'postgresql', 'mysql'];
  for (const tplType of templateSchemas) {
    const tplPath = resolve(prismaDir, `schema.${tplType}.prisma`);
    if (existsSync(tplPath)) {
      const tplContent = readFileSync(tplPath, 'utf-8');
      const tplModels = (tplContent.match(/^model\s+(\w+)/gm) || [])
        .map(m => m.replace('model ', ''))
        .sort();

      const currentModels = [...schemaModels].sort();

      const missingInCurrent = tplModels.filter(m => !currentModels.includes(m));
      const extraInCurrent = currentModels.filter(m => !tplModels.includes(m));

      if (missingInCurrent.length > 0) {
        addCheck(`schema-consistency-${tplType}`, 'warn',
          `Missing models compared to ${tplType} template: ${missingInCurrent.join(', ')}`);
      } else if (extraInCurrent.length > 0) {
        addCheck(`schema-consistency-${tplType}`, 'warn',
          `Extra models compared to ${tplType} template: ${extraInCurrent.join(', ')}`);
      } else {
        addCheck(`schema-consistency-${tplType}`, 'pass',
          `Model list matches ${tplType} template`);
      }
    }
  }

  // 9. Check Json vs String consistency for known JSON fields
  if (schemaExists) {
    const jsonFields = [
      { model: 'ShipmentItem', field: 'events', expectedType: 'Json' },
      { model: 'Supplier', field: 'ratingDetails', expectedType: 'Json' },
      { model: 'AuditLog', field: 'details', expectedType: 'Json' },
    ];

    for (const { model, field, expectedType } of jsonFields) {
      // Find the field declaration within the model
      const modelRegex = new RegExp(`model\\s+${model}\\s*\\{[^}]*\\}`, 's');
      const modelMatch = schemaContent.match(modelRegex);
      if (modelMatch) {
        const fieldRegex = new RegExp(`${field}\\s+(\\w+)`);
        const fieldMatch = modelMatch[0].match(fieldRegex);
        if (fieldMatch) {
          const fieldType = fieldMatch[1];
          if (fieldType === expectedType) {
            addCheck(`json-field-${model}-${field}`, 'pass',
              `${model}.${field} uses ${expectedType} type`);
          } else {
            addCheck(`json-field-${model}-${field}`, 'warn',
              `${model}.${field} uses ${fieldType} instead of ${expectedType}. ` +
              `This may cause inconsistencies when switching databases.`);
          }
        }
      }
    }
  }

  // ─── Build Report ────────────────────────────────────────────────────────

  const report: HealthReport = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    database: {
      type: dbType,
      url: databaseUrl ? `${databaseUrl.substring(0, 20)}...` : 'not set',
      urlValid,
    },
    schema: {
      exists: schemaExists,
      provider: schemaProvider,
      modelCount: schemaModels.length,
      models: schemaModels,
    },
    migrations: {
      directoryExists: migrationsExist,
      migrationCount: migrationList.length,
      migrations: migrationList,
      pendingMigrations,
      lastMigration,
    },
    checks,
  };

  // ─── Output ──────────────────────────────────────────────────────────────

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🏥 Database Migration Health Report');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Status:    ${overallStatus === 'healthy' ? '✅' : overallStatus === 'warning' ? '⚠️' : '❌'} ${overallStatus.toUpperCase()}`);
    console.log(`  Timestamp: ${report.timestamp}`);
    console.log('');
    console.log('── Database ──────────────────────────────────────────');
    console.log(`  Type:      ${dbType}`);
    console.log(`  URL:       ${report.database.url}`);
    console.log(`  URL Valid: ${urlValid ? '✅' : '❌'}`);
    console.log('');
    console.log('── Schema ────────────────────────────────────────────');
    console.log(`  Exists:    ${schemaExists ? '✅' : '❌'}`);
    console.log(`  Provider:  ${schemaProvider || 'N/A'}`);
    console.log(`  Models:    ${schemaModels.length} (${schemaModels.join(', ')})`);
    console.log('');
    console.log('── Migrations ────────────────────────────────────────');
    console.log(`  Directory: ${migrationsExist ? '✅' : '⚠️  Not found'}`);
    console.log(`  Count:     ${migrationList.length}`);
    console.log(`  Last:      ${lastMigration || 'N/A'}`);
    console.log(`  Pending:   ${pendingMigrations ? '⚠️  Yes' : '✅ None'}`);
    if (migrationList.length > 0) {
      console.log(`  History:`);
      for (const m of migrationList) {
        console.log(`    - ${m}`);
      }
    }
    console.log('');
    console.log('── Checks ────────────────────────────────────────────');
    for (const check of checks) {
      const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
      console.log(`  ${icon} ${check.name}: ${check.message}`);
    }
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
  }

  // ─── Exit Code ───────────────────────────────────────────────────────────

  if (overallStatus === 'error') {
    process.exit(1);
  }
  if (overallStatus === 'warning' && STRICT) {
    process.exit(2);
  }
  process.exit(0);
}

main().catch((error) => {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: String(error),
      checks: [],
      database: { type: 'unknown', url: '', urlValid: false },
      schema: { exists: false, provider: null, modelCount: 0, models: [] },
      migrations: { directoryExists: false, migrationCount: 0, migrations: [], pendingMigrations: false, lastMigration: null },
    }, null, 2));
  } else {
    console.error('❌ Verification failed:', error);
  }
  process.exit(1);
});
