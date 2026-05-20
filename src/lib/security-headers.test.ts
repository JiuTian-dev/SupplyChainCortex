import { describe, it, expect } from 'vitest';
import { SECURITY_HEADERS, rateLimitHeaders } from './security-headers';

describe('Security Headers', () => {
  it('has X-Frame-Options header', () => {
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('has X-Content-Type-Options header', () => {
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });

  it('has X-XSS-Protection header', () => {
    expect(SECURITY_HEADERS['X-XSS-Protection']).toBe('1; mode=block');
  });

  it('has Referrer-Policy header', () => {
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('has Content-Security-Policy header', () => {
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain("default-src 'self'");
  });

  it('has Permissions-Policy header', () => {
    expect(SECURITY_HEADERS['Permissions-Policy']).toContain('camera=()');
  });

  it('skips Cross-Origin headers for preview panel compatibility', () => {
    // These are intentionally omitted for z.ai preview panel compatibility
    const secHeaders = SECURITY_HEADERS as Record<string, string | undefined>;
    expect(secHeaders['Cross-Origin-Opener-Policy']).toBeUndefined();
    expect(secHeaders['Cross-Origin-Resource-Policy']).toBeUndefined();
  });

  describe('rateLimitHeaders', () => {
    it('generates correct headers', () => {
      const headers = rateLimitHeaders({
        remaining: 50,
        resetAt: Date.now() + 60_000,
      });
      expect(headers['X-RateLimit-Remaining']).toBe('50');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('includes Retry-After when provided', () => {
      const headers = rateLimitHeaders({
        remaining: 0,
        resetAt: Date.now() + 60_000,
        retryAfter: 30,
      });
      expect(headers['Retry-After']).toBe('30');
    });
  });
});
