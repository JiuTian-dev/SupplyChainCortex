/**
 * Environment Variable Validation Module
 *
 * Validates all required and optional environment variables at startup
 * using zod. Only runs on the server side — safe for API routes,
 * server components, and middleware.
 *
 * Usage:
 *   import { env } from '@/lib/env';
 *   console.log(env.DATABASE_URL);
 */

import { z } from 'zod';

const envSchema = z.object({
  // ─── Database ─────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required. Set it in .env or your deployment environment.'),

  // ─── Authentication ───────────────────────────────────────────────────
  NEXTAUTH_SECRET: z
    .string()
    .min(1, 'NEXTAUTH_SECRET is required.')
    .refine(
      (val) => process.env.NODE_ENV !== 'production' || val.length >= 32,
      'NEXTAUTH_SECRET must be at least 32 characters in production.',
    ),

  NEXTAUTH_URL: z
    .string()
    .min(1, 'NEXTAUTH_URL is required. Example: http://localhost:3000')
    .url('NEXTAUTH_URL must be a valid URL.'),

  // ─── Server ───────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3000),

});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables.
 *
 * We wrap in a function so we can catch and present clear error
 * messages instead of opaque zod stack traces.
 */
function validateEnv(): Env {
  // Only validate on the server side
  if (typeof window !== 'undefined') {
    // Client-side: return a safe subset / defaults.
    // The client should never read secrets from env directly.
    return {
      DATABASE_URL: '',
      NEXTAUTH_SECRET: '',
      NEXTAUTH_URL: 'http://localhost:3000',
      NODE_ENV: 'development',
      PORT: 3000,
    };
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `  • ${issue.path.join('.')}: ${issue.message}`,
    );
    console.error(
      '\n❌ Environment variable validation failed:\n' +
      errors.join('\n') +
      '\n\nPlease check your .env file or deployment configuration.\n',
    );
    // In development, we throw to surface the error immediately.
    // In production, we also throw — missing env vars are a hard failure.
    // In test, we allow it to continue (test environments may not have all vars).
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    // Fallback for test
    return {
      DATABASE_URL: process.env.DATABASE_URL || 'file:./test.db',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'test-secret-key-not-for-production-use',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      NODE_ENV: (process.env.NODE_ENV as Env['NODE_ENV']) || 'test',
      PORT: Number(process.env.PORT) || 3000,
    };
  }

  return result.data;
}

/**
 * Validated, type-safe environment variables object.
 *
 * Import this wherever you need env access on the server:
 *   import { env } from '@/lib/env';
 *   const dbUrl = env.DATABASE_URL;
 */
export const env = validateEnv();
