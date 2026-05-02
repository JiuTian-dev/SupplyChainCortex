#!/usr/bin/env bun
/**
 * Health Check Script
 *
 * Verifies application health for Docker HEALTHCHECK, Kubernetes
 * liveness/readiness probes, or manual diagnostics.
 *
 * Usage:
 *   bun run scripts/health-check.ts
 *
 * Exit codes:
 *   0 = healthy
 *   1 = unhealthy
 */

// ─── Configuration ─────────────────────────────────────────────────────
const APP_URL = process.env.HEALTH_CHECK_URL || 'http://localhost:3000';
const TIMEOUT_MS = 10_000;

interface HealthResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  durationMs?: number;
}

const results: HealthResult[] = [];

function addResult(name: string, status: HealthResult['status'], message: string, durationMs?: number) {
  results.push({ name, status, message, durationMs });
}

// ─── 1. Check Required Environment Variables ───────────────────────────
function checkEnvironmentVariables(): void {
  const required = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'];
  const recommended = ['NODE_ENV', 'DB_TYPE'];

  for (const varName of required) {
    const value = process.env[varName];
    if (!value || value.trim() === '') {
      addResult(varName, 'fail', `Required environment variable is missing or empty.`);
    } else {
      // Mask sensitive values
      const display = varName === 'NEXTAUTH_SECRET'
        ? `${value.substring(0, 4)}...(${value.length} chars)`
        : value;
      addResult(varName, 'pass', `Set: ${display}`);
    }
  }

  for (const varName of recommended) {
    const value = process.env[varName];
    if (!value) {
      addResult(varName, 'warn', `Optional environment variable not set (uses default).`);
    } else {
      addResult(varName, 'pass', `Set: ${value}`);
    }
  }

  // Validate NEXTAUTH_SECRET length in production
  const nodeEnv = process.env.NODE_ENV || 'development';
  const secret = process.env.NEXTAUTH_SECRET;
  if (nodeEnv === 'production' && secret && secret.length < 32) {
    addResult('NEXTAUTH_SECRET_LENGTH', 'fail',
      `In production, NEXTAUTH_SECRET must be ≥32 characters (currently ${secret.length}).`);
  }
}

// ─── 2. Check Database Connection ──────────────────────────────────────
async function checkDatabaseConnection(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    addResult('database', 'fail', 'Cannot check: DATABASE_URL is not set.');
    return;
  }

  const start = Date.now();

  try {
    // Determine DB type from URL prefix
    if (dbUrl.startsWith('file:')) {
      // SQLite: try to read the file
      const fs = await import('fs/promises');
      const filePath = dbUrl.replace('file:', '');
      try {
        await fs.access(filePath, fs.constants.R_OK | fs.constants.W_OK);
        const stat = await fs.stat(filePath);
        addResult('database', 'pass',
          `SQLite: file accessible (${(stat.size / 1024).toFixed(1)} KB)`,
          Date.now() - start);
      } catch {
        // File might not exist yet (first run), check if directory is writable
        const path = await import('path');
        const dir = path.dirname(filePath);
        try {
          await fs.access(dir, fs.constants.W_OK);
          addResult('database', 'warn',
            `SQLite: database file not found but directory is writable (${filePath})`,
            Date.now() - start);
        } catch {
          addResult('database', 'fail',
            `SQLite: directory not writable: ${dir}`,
            Date.now() - start);
        }
      }
    } else if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
      // PostgreSQL: attempt connection via HTTP health check of API
      await checkApiEndpoint('/api/db-config', 'database');
    } else if (dbUrl.startsWith('mysql://')) {
      // MySQL: attempt connection via HTTP health check of API
      await checkApiEndpoint('/api/db-config', 'database');
    } else {
      addResult('database', 'warn', `Unknown DATABASE_URL format: ${dbUrl.substring(0, 20)}...`);
    }
  } catch (err) {
    addResult('database', 'fail', `Connection error: ${(err as Error).message}`, Date.now() - start);
  }
}

// ─── 3. Check API Endpoints ────────────────────────────────────────────
async function checkApiEndpoint(path: string, name: string): Promise<void> {
  const start = Date.now();
  const url = `${APP_URL}${path}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);

    if (res.ok) {
      addResult(name, 'pass', `HTTP ${res.status} - ${url}`, Date.now() - start);
    } else {
      addResult(name, 'fail', `HTTP ${res.status} - ${url}`, Date.now() - start);
    }
  } catch (err) {
    const msg = (err as Error).name === 'AbortError'
      ? `Timeout after ${TIMEOUT_MS}ms`
      : (err as Error).message;
    addResult(name, 'fail', `Connection failed: ${msg} - ${url}`, Date.now() - start);
  }
}

async function checkApiEndpoints(): Promise<void> {
  const endpoints = [
    { path: '/', name: 'app_homepage' },
    { path: '/api/dashboard', name: 'api_dashboard' },
    { path: '/api/db-config', name: 'api_db_config' },
  ];

  for (const ep of endpoints) {
    await checkApiEndpoint(ep.path, ep.name);
  }
}

// ─── Report & Exit ─────────────────────────────────────────────────────
function reportAndExit(): never {
  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const warnCount = results.filter((r) => r.status === 'warn').length;

  console.log('\n═══════════════════════════════════════════');
  console.log('  Health Check Report');
  console.log('═══════════════════════════════════════════\n');

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
    const duration = r.durationMs ? ` (${r.durationMs}ms)` : '';
    console.log(`  ${icon} ${r.name}: ${r.message}${duration}`);
  }

  console.log('\n───────────────────────────────────────────');
  console.log(`  Total: ${results.length} | Pass: ${passCount} | Fail: ${failCount} | Warn: ${warnCount}`);
  console.log('═══════════════════════════════════════════\n');

  if (failCount > 0) {
    console.log('❌ Health check FAILED — one or more critical checks did not pass.\n');
    process.exit(1);
  }

  console.log('✅ Health check PASSED — all critical checks are healthy.\n');
  process.exit(0);
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('Running health check...\n');

  // 1. Environment variables (synchronous)
  checkEnvironmentVariables();

  // 2. Database connection
  await checkDatabaseConnection();

  // 3. API endpoints
  await checkApiEndpoints();

  // Report and exit
  reportAndExit();
}

main().catch((err) => {
  console.error('Health check script crashed:', err);
  process.exit(1);
});
