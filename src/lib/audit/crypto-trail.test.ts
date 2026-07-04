/**
 * Cryptographic Audit Trail — Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  computeAuditContentHash,
  computeTraceContentHash,
  signContentHash,
  verifySignature,
  verifyChainIntegrity,
  isAuditSecretConfigured,
  generateDevSecret,
  _setAuditSecret,
} from './crypto-trail';

describe('CryptoTrail', () => {
  describe('computeAuditContentHash', () => {
    it('should produce deterministic SHA-256 hash', () => {
      const entry = {
        id: 'test-1',
        action: 'CREATE',
        entity: 'product',
        userId: 'user-1',
        userName: 'Test User',
        details: { sku: 'ABC-123', qty: 10 },
        severity: 'info',
        createdAt: new Date('2026-06-08T10:00:00Z'),
      };

      const hash1 = computeAuditContentHash(entry);
      const hash2 = computeAuditContentHash(entry);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different entries', () => {
      const entry1 = {
        id: 'test-1',
        action: 'CREATE',
        entity: 'product',
        userId: 'user-1',
        userName: 'Test User',
        details: { sku: 'ABC-123' },
        severity: 'info',
        createdAt: new Date('2026-06-08T10:00:00Z'),
      };

      const entry2 = {
        id: 'test-2',
        action: 'UPDATE',
        entity: 'product',
        userId: 'user-1',
        userName: 'Test User',
        details: { sku: 'ABC-123' },
        severity: 'info',
        createdAt: new Date('2026-06-08T10:00:00Z'),
      };

      const hash1 = computeAuditContentHash(entry1);
      const hash2 = computeAuditContentHash(entry2);

      expect(hash1).not.toBe(hash2);
    });

    it('should include previousHash in the hash computation', () => {
      const base = {
        id: 'test-1',
        action: 'CREATE',
        entity: 'product',
        userId: 'user-1',
        userName: 'Test User',
        details: {},
        severity: 'info',
        createdAt: new Date('2026-06-08T10:00:00Z'),
      };

      const hashWithoutPrev = computeAuditContentHash(base);
      const hashWithPrev = computeAuditContentHash({
        ...base,
        previousHash: 'abc123',
      });

      expect(hashWithoutPrev).not.toBe(hashWithPrev);
    });
  });

  describe('computeTraceContentHash', () => {
    it('should produce deterministic SHA-256 hash', () => {
      const entry = {
        id: 'trace-1',
        auditId: 'audit-1',
        userQuery: '库存健康检查',
        intent: 'inventory-health-check',
        confidence: 0.95,
        mode: 'fsm-v2',
        durationMs: 1200,
        toolsUsed: ['query_inventory', 'classify_abc_xyz'],
        claimsCount: 3,
        passport: { engine: 'fsm-agent-v2' },
        createdAt: new Date('2026-06-08T10:00:00Z'),
      };

      const hash = computeTraceContentHash(entry);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('signContentHash / verifySignature', () => {
    let originalSecret: string | undefined;

    beforeEach(() => {
      originalSecret = process.env.AUDIT_HMAC_SECRET;
    });

    afterEach(() => {
      _setAuditSecret(originalSecret);
      process.env.AUDIT_HMAC_SECRET = originalSecret;
    });

    it('should sign and verify correctly when secret is configured', () => {
      const secret = generateDevSecret();
      _setAuditSecret(secret);

      expect(isAuditSecretConfigured()).toBe(true);

      const hash = 'a'.repeat(64);
      const sig = signContentHash(hash);
      expect(sig).not.toBeNull();
      expect(sig).toMatch(/^[a-f0-9]{64}$/);

      expect(verifySignature(hash, sig)).toBe(true);
      expect(verifySignature(hash, 'wrong')).toBe(false);
      expect(verifySignature(hash, null)).toBe(false);
    });

    it('should return null signature when secret is not configured', () => {
      _setAuditSecret('');
      process.env.AUDIT_HMAC_SECRET = '';

      expect(isAuditSecretConfigured()).toBe(false);
      const sig = signContentHash('any-hash');
      expect(sig).toBeNull();
    });
  });

  describe('verifyChainIntegrity', () => {
    it('should validate a correct chain', () => {
      const entries = [
        { id: '1', contentHash: 'hash1', previousHash: null, signature: null },
        { id: '2', contentHash: 'hash2', previousHash: 'hash1', signature: null },
        { id: '3', contentHash: 'hash3', previousHash: 'hash2', signature: null },
      ];

      const result = verifyChainIntegrity(entries);
      expect(result.valid).toBe(true);
      expect(result.brokenAt).toBeNull();
    });

    it('should detect a broken chain link', () => {
      const entries = [
        { id: '1', contentHash: 'hash1', previousHash: null, signature: null },
        { id: '2', contentHash: 'hash2', previousHash: 'wrong', signature: null },
        { id: '3', contentHash: 'hash3', previousHash: 'hash2', signature: null },
      ];

      const result = verifyChainIntegrity(entries);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('2');
    });

    it('should detect an invalid signature', () => {
      const secret = generateDevSecret();
      _setAuditSecret(secret);

      const entries = [
        { id: '1', contentHash: 'hash1', previousHash: null, signature: 'invalid-sig' },
      ];

      const result = verifyChainIntegrity(entries);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('1');
    });
  });

  describe('generateDevSecret', () => {
    it('should generate a 64-char hex string', () => {
      const secret = generateDevSecret();
      expect(secret).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique secrets', () => {
      const s1 = generateDevSecret();
      const s2 = generateDevSecret();
      expect(s1).not.toBe(s2);
    });
  });
});
