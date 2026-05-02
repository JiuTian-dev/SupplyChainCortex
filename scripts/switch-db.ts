#!/usr/bin/env bun
/**
 * Switch Prisma schema between SQLite, PostgreSQL, and MySQL
 *
 * Usage:
 *   bun run scripts/switch-db.ts [sqlite|postgresql|mysql] [options]
 *
 * Options:
 *   --migrate    Run prisma migrate dev after switching (default: uses db:push)
 *   --verify     Validate the target schema is valid before switching
 *   --seed       Run the seed script after switching
 *
 * Examples:
 *   bun run scripts/switch-db.ts sqlite
 *   bun run scripts/switch-db.ts postgresql --migrate
 *   bun run scripts/switch-db.ts mysql --verify --seed
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ─── Parse Arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DB_TYPE = args.find(a => !a.startsWith('--')) || 'sqlite';
const validTypes = ['sqlite', 'postgresql', 'mysql'];

const FLAGS = {
  migrate: args.includes('--migrate'),
  verify: args.includes('--verify'),
  seed: args.includes('--seed'),
};

if (!validTypes.includes(DB_TYPE)) {
  console.error(`❌ Invalid database type: ${DB_TYPE}`);
  console.error(`   Must be one of: ${validTypes.join(', ')}`);
  process.exit(1);
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const projectRoot = resolve(import.meta.dir, '..');
const prismaDir = resolve(projectRoot, 'prisma');
const schemaFile = resolve(prismaDir, 'schema.prisma');
const sourceFile = resolve(prismaDir, `schema.${DB_TYPE}.prisma`);
const envFile = resolve(projectRoot, '.env');

// ─── Helper: Run shell command ───────────────────────────────────────────────

async function runCommand(command: string, label: string): Promise<boolean> {
  console.log(`⚙️  Running: ${command}`);
  const proc = Bun.spawn(command.split(' '), {
    cwd: projectRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim() && exitCode !== 0) console.error(stderr.trim());

  if (exitCode !== 0) {
    console.error(`❌ ${label} failed (exit code ${exitCode})`);
    return false;
  }

  console.log(`✅ ${label} completed`);
  return true;
}

// ─── Helper: Validate schema syntax ──────────────────────────────────────────

async function validateSchema(schemaPath: string): Promise<boolean> {
  console.log(`🔍 Validating schema: ${schemaPath}`);

  // Check file exists
  if (!existsSync(schemaPath)) {
    console.error(`❌ Schema file not found: ${schemaPath}`);
    return false;
  }

  // Read and check basic structure
  const content = readFileSync(schemaPath, 'utf-8');

  // Must have generator and datasource
  if (!content.includes('generator client')) {
    console.error(`❌ Schema missing 'generator client' block`);
    return false;
  }
  if (!content.includes('datasource db')) {
    console.error(`❌ Schema missing 'datasource db' block`);
    return false;
  }

  // Check provider matches target
  const providerMatch = content.match(/provider\s*=\s*"(\w+)"/);
  if (!providerMatch) {
    console.error(`❌ Cannot determine provider from schema`);
    return false;
  }

  const provider = providerMatch[1];
  const expectedProvider = DB_TYPE === 'postgresql' ? 'postgresql' : DB_TYPE;
  if (provider !== expectedProvider) {
    console.error(`❌ Schema provider "${provider}" does not match target "${expectedProvider}"`);
    return false;
  }

  // Count models
  const modelMatches = content.match(/^model\s+\w+/gm);
  if (!modelMatches || modelMatches.length === 0) {
    console.error(`❌ No models found in schema`);
    return false;
  }

  console.log(`✅ Schema valid: ${modelMatches.length} models, provider=${provider}`);
  return true;
}

// ─── Helper: Check DATABASE_URL ──────────────────────────────────────────────

function checkDatabaseUrl(): boolean {
  if (!existsSync(envFile)) {
    console.warn(`⚠️  No .env file found at ${envFile}`);
    return false;
  }

  const envContent = readFileSync(envFile, 'utf-8');
  const urlMatch = envContent.match(/DATABASE_URL\s*=\s*"([^"]+)"/);
  if (!urlMatch) {
    console.warn(`⚠️  No DATABASE_URL found in .env`);
    return false;
  }

  const url = urlMatch[1];
  const expectedPrefix: Record<string, string> = {
    sqlite: 'file:',
    postgresql: 'postgresql://',
    mysql: 'mysql://',
  };

  const prefix = expectedPrefix[DB_TYPE];
  if (!url.startsWith(prefix)) {
    console.warn(`⚠️  DATABASE_URL does not match ${DB_TYPE} (expected prefix: ${prefix})`);
    console.warn(`   Current: ${url}`);
    return false;
  }

  console.log(`✅ DATABASE_URL matches ${DB_TYPE}: ${url}`);
  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔄 Switching Prisma schema to ${DB_TYPE.toUpperCase()}...`);
  console.log(`   Flags: migrate=${FLAGS.migrate}, verify=${FLAGS.verify}, seed=${FLAGS.seed}`);
  console.log('');

  // Step 1: Verify source schema exists
  if (!existsSync(sourceFile)) {
    console.error(`❌ Schema file not found: ${sourceFile}`);
    console.error(`   Make sure schema.${DB_TYPE}.prisma exists in the prisma directory.`);
    process.exit(1);
  }

  // Step 2: Validate source schema (if --verify flag)
  if (FLAGS.verify) {
    const isValid = await validateSchema(sourceFile);
    if (!isValid) {
      console.error(`❌ Schema validation failed. Aborting switch.`);
      process.exit(1);
    }
    console.log('');
  }

  // Step 3: Backup current schema
  const backupFile = resolve(prismaDir, 'schema.prisma.backup');
  try {
    copyFileSync(schemaFile, backupFile);
    console.log(`📋 Current schema backed up to schema.prisma.backup`);
  } catch {
    console.log(`📋 No existing schema to backup`);
  }

  // Step 4: Copy the target schema
  copyFileSync(sourceFile, schemaFile);
  console.log(`✅ Schema switched to ${DB_TYPE.toUpperCase()}`);
  console.log('');

  // Step 5: Check DATABASE_URL compatibility
  const urlOk = checkDatabaseUrl();
  if (!urlOk) {
    console.log('');
    console.log(`📝 Please update your .env file with the correct DATABASE_URL:`);
    switch (DB_TYPE) {
      case 'sqlite':
        console.log(`      DATABASE_URL="file:./dev.db"`);
        break;
      case 'postgresql':
        console.log(`      DATABASE_URL="postgresql://user:password@localhost:5432/supply_chain?schema=public"`);
        break;
      case 'mysql':
        console.log(`      DATABASE_URL="mysql://user:password@localhost:3306/supply_chain"`);
        break;
    }
    console.log('');
    console.log(`⚠️  Cannot proceed with generate/migrate until DATABASE_URL is correct.`);
    console.log(`   Re-run this script with --migrate after updating .env`);
    console.log('');
    console.log(`💡 To restore the previous schema, rename schema.prisma.backup back to schema.prisma`);
    return;
  }

  // Step 6: Run prisma generate (always)
  console.log('');
  const generateOk = await runCommand('bunx prisma generate', 'Prisma generate');
  if (!generateOk) {
    console.error(`❌ Prisma generate failed. Check schema for errors.`);
    process.exit(1);
  }

  // Step 7: Run migrate or push
  if (FLAGS.migrate) {
    console.log('');
    const migrateOk = await runCommand('bunx prisma migrate dev --name init', 'Prisma migrate dev');
    if (!migrateOk) {
      console.error(`❌ Prisma migrate failed. You may need to reset the database first.`);
      console.error(`   Run: bunx prisma migrate reset`);
      process.exit(1);
    }
  } else {
    console.log('');
    const pushOk = await runCommand('bunx prisma db push --accept-data-loss', 'Prisma db push');
    if (!pushOk) {
      console.error(`❌ Prisma db push failed. Check your DATABASE_URL and schema.`);
      process.exit(1);
    }
  }

  // Step 8: Run seed (if --seed flag)
  if (FLAGS.seed) {
    console.log('');
    const seedOk = await runCommand('bunx prisma db seed', 'Database seed');
    if (!seedOk) {
      console.warn(`⚠️  Seed failed. You can run it manually: bunx prisma db seed`);
    }
  }

  console.log('');
  console.log(`🎉 Successfully switched to ${DB_TYPE.toUpperCase()}!`);
  console.log('');
  console.log(`📋 Summary:`);
  console.log(`   - Schema: schema.${DB_TYPE}.prisma → schema.prisma`);
  console.log(`   - Generate: ✅`);
  console.log(`   - ${FLAGS.migrate ? 'Migrate: ✅' : 'Push: ✅ (use --migrate for migration-based)'}`);
  if (FLAGS.seed) console.log(`   - Seed: ✅`);
  console.log('');
  console.log(`💡 To restore the previous schema, rename schema.prisma.backup back to schema.prisma`);
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
