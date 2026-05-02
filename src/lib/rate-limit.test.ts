import { describe, it, expect } from 'vitest';
import { rateLimit } from './rate-limit';

describe('Rate Limiter', () => {
  it('allows requests within limit', () => {
    const limiter = rateLimit({ maxTokens: 5, windowMs: 60_000 });
    const mockRequest = new Request('http://localhost:3000/api/test', {
      headers: { 'x-forwarded-for': 'test-client-1' },
    });

    const result = limiter(mockRequest);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks requests when limit exceeded', () => {
    const limiter = rateLimit({ maxTokens: 2, windowMs: 60_000 });
    const mockRequest = new Request('http://localhost:3000/api/test', {
      headers: { 'x-forwarded-for': 'test-client-2' },
    });

    limiter(mockRequest); // 1st request
    limiter(mockRequest); // 2nd request
    const result = limiter(mockRequest); // 3rd request - should be blocked

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeDefined();
  });

  it('tracks remaining tokens correctly', () => {
    const limiter = rateLimit({ maxTokens: 5, windowMs: 60_000 });
    const mockRequest = new Request('http://localhost:3000/api/test', {
      headers: { 'x-forwarded-for': 'test-client-3' },
    });

    const r1 = limiter(mockRequest);
    expect(r1.remaining).toBe(4);

    const r2 = limiter(mockRequest);
    expect(r2.remaining).toBe(3);
  });
});
