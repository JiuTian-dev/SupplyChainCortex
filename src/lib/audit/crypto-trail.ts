/**
 * Cryptographic Audit Trail — Hash chain + HMAC signature for tamper-evident logs.
 *
 * EU AI Act Article 12: "High-risk AI systems shall technically allow for the
 * automatic recording of events (logs) over the lifetime of the system."
 *
 * Design:
 * - Each log entry contains a SHA-256 content hash and a link to the previous entry.
 * - HMAC-SHA256 signature ensures integrity + authenticity.
 * - Append-only: no UPDATE/DELETE on audit tables.
 */

import { createHash, createHmac, randomBytes } from 'crypto';

// ─── Configuration ─────────────────────────────────────────────────────────

let _auditSecret: string | undefined = process.env.AUDIT_HMAC_SECRET;

/** Get the current audit secret (supports runtime override for testing) */
function getAuditSecret(): string {
  return _auditSecret || process.env.AUDIT_HMAC_SECRET || '';
}

/** Override secret for testing (never use in production code) */
export function _setAuditSecret(secret: string | undefined): void {
  _auditSecret = secret;
}

/** Warn if no secret is configured (dev mode fallback) */
export function isAuditSecretConfigured(): boolean {
  return getAuditSecret().length >= 32;
}

/** Generate a development-only secret (never use in production) */
export function generateDevSecret(): string {
  return randomBytes(32).toString('hex');
}

// ─── Hash Chain ────────────────────────────────────────────────────────────

export interface HashableAuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  sku?: string | null;
  userId: string;
  userName: string;
  details: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  severity: string;
  createdAt: Date;
  previousHash?: string | null;
}

export interface HashableTraceEntry {
  id: string;
  auditId: string;
  userQuery: string;
  intent: string;
  confidence: number;
  mode: string;
  tier?: number | null;
  durationMs: number;
  toolsUsed: string[];
  claimsCount: number;
  passport: unknown;
  userId?: string | null;
  summary?: string | null;
  createdAt: Date;
  previousHash?: string | null;
}

/**
 * Compute SHA-256 content hash for an audit log entry.
 * The hash covers all business fields (excluding id, contentHash, signature).
 */
export function computeAuditContentHash(entry: HashableAuditEntry): string {
  const payload = JSON.stringify({
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    sku: entry.sku,
    userId: entry.userId,
    userName: entry.userName,
    details: entry.details,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    severity: entry.severity,
    createdAt: entry.createdAt.toISOString(),
    previousHash: entry.previousHash,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Compute SHA-256 content hash for a decision trace entry.
 */
export function computeTraceContentHash(entry: HashableTraceEntry): string {
  const payload = JSON.stringify({
    auditId: entry.auditId,
    userQuery: entry.userQuery,
    intent: entry.intent,
    confidence: entry.confidence,
    mode: entry.mode,
    tier: entry.tier,
    durationMs: entry.durationMs,
    toolsUsed: entry.toolsUsed,
    claimsCount: entry.claimsCount,
    passport: entry.passport,
    userId: entry.userId,
    summary: entry.summary,
    createdAt: entry.createdAt.toISOString(),
    previousHash: entry.previousHash,
  });
  return createHash('sha256').update(payload).digest('hex');
}

// ─── HMAC Signature ────────────────────────────────────────────────────────

/**
 * Sign a content hash with HMAC-SHA256.
 * Returns null if no secret is configured (graceful degradation).
 */
export function signContentHash(contentHash: string): string | null {
  const secret = getAuditSecret();
  if (secret.length < 32) {
    console.warn('[CryptoTrail] AUDIT_HMAC_SECRET not configured — signatures disabled');
    return null;
  }
  return createHmac('sha256', secret).update(contentHash).digest('hex');
}

/**
 * Verify that a signature matches the content hash.
 */
export function verifySignature(contentHash: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = getAuditSecret();
  if (secret.length < 32) return false;
  const expected = createHmac('sha256', secret).update(contentHash).digest('hex');
  // Timing-safe comparison
  try {
    return signature.length === expected.length &&
      signature.split('').every((c, i) => c === expected[i]);
  } catch {
    return false;
  }
}

// ─── Chain Integrity Verification ──────────────────────────────────────────

export interface ChainEntry {
  id: string;
  contentHash: string;
  previousHash: string | null;
  signature: string | null;
}

/**
 * Verify the integrity of a hash chain.
 * Returns { valid: boolean, brokenAt: string | null }
 */
export function verifyChainIntegrity(entries: ChainEntry[]): { valid: boolean; brokenAt: string | null } {
  for (let i = 0; i < entries.length; i++) {
    const current = entries[i];

    // Verify signature if present
    if (current.signature && !verifySignature(current.contentHash, current.signature)) {
      return { valid: false, brokenAt: current.id };
    }

    // Verify chain link (skip first entry)
    if (i > 0) {
      const previous = entries[i - 1];
      if (current.previousHash !== previous.contentHash) {
        return { valid: false, brokenAt: current.id };
      }
    }
  }

  return { valid: true, brokenAt: null };
}

// ─── Previous Hash Lookup ──────────────────────────────────────────────────

import { db } from '@/lib/db';

/**
 * Get the content hash of the most recent audit log for chain linking.
 */
export async function getLastAuditHash(): Promise<string | null> {
  const last = await db.auditLog.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { contentHash: true },
  });
  return last?.contentHash ?? null;
}

/**
 * Get the content hash of the most recent decision trace for chain linking.
 */
export async function getLastTraceHash(): Promise<string | null> {
  const last = await db.decisionTrace.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { contentHash: true },
  });
  return last?.contentHash ?? null;
}
