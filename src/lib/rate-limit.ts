/**
 * Token Bucket Rate Limiter for API endpoints
 * Uses in-memory storage with automatic cleanup
 * Supports user-based keys for higher limits on authenticated users
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  /** Max tokens (requests) per window for anonymous users */
  maxTokens: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Custom key extractor (defaults to IP-based) */
  keyExtractor?: (request: Request) => string;
  /** Higher token limit for authenticated users (key starts with "user:") */
  authenticatedMaxTokens?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

// In-memory store
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      // Remove entries older than 10 minutes
      if (now - entry.lastRefill > 600_000) {
        store.delete(key);
      }
    }
  }, 300_000);
}

/** Extract client IP from request */
function getClientIP(request: Request): string {
  // Check various headers for real IP (behind proxy)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}

/**
 * Resolve the effective max tokens for a given key.
 * If the key starts with "user:" (authenticated) and authenticatedMaxTokens
 * is provided, use the higher limit; otherwise fall back to maxTokens.
 */
function resolveMaxTokens(config: RateLimitConfig, key: string): number {
  if (config.authenticatedMaxTokens && key.startsWith('user:')) {
    return config.authenticatedMaxTokens;
  }
  return config.maxTokens;
}

/** Check rate limit for a request */
export function rateLimit(config: RateLimitConfig): (request: Request) => RateLimitResult {
  return (request: Request): RateLimitResult => {
    const key = config.keyExtractor 
      ? config.keyExtractor(request) 
      : `rl:${getClientIP(request)}`;
    
    const effectiveMaxTokens = resolveMaxTokens(config, key);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry) {
      // First request
      store.set(key, {
        tokens: effectiveMaxTokens - 1,
        lastRefill: now,
      });
      return {
        allowed: true,
        remaining: effectiveMaxTokens - 1,
        resetAt: now + config.windowMs,
      };
    }

    // Calculate tokens to add based on elapsed time
    // Use the effective max tokens for refill calculation
    const elapsed = now - entry.lastRefill;
    const tokensToAdd = Math.floor(elapsed / config.windowMs * effectiveMaxTokens);

    if (tokensToAdd > 0) {
      entry.tokens = Math.min(effectiveMaxTokens, entry.tokens + tokensToAdd);
      entry.lastRefill = now;
    }

    if (entry.tokens <= 0) {
      // Rate limited
      const timeToNextToken = config.windowMs / effectiveMaxTokens;
      const retryAfter = Math.ceil(timeToNextToken / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + (effectiveMaxTokens * timeToNextToken),
        retryAfter,
      };
    }

    // Consume a token
    entry.tokens -= 1;
    return {
      allowed: true,
      remaining: entry.tokens,
      resetAt: now + config.windowMs,
    };
  };
}

// Pre-configured rate limiters
export const apiRateLimit = rateLimit({
  maxTokens: 100,
  windowMs: 60_000, // 100 requests per minute (anonymous)
  authenticatedMaxTokens: 200, // 200 for authenticated users
});

export const strictRateLimit = rateLimit({
  maxTokens: 20,
  windowMs: 60_000, // 20 requests per minute (anonymous)
  authenticatedMaxTokens: 50, // 50 for authenticated users
});

export const authRateLimit = rateLimit({
  maxTokens: 5,
  windowMs: 60_000, // 5 auth attempts per minute
});

export const chatRateLimit = rateLimit({
  maxTokens: 20,
  windowMs: 60_000, // 20 chat messages per minute (anonymous)
  authenticatedMaxTokens: 60, // 60 for authenticated users
});

export const exportRateLimit = rateLimit({
  maxTokens: 10,
  windowMs: 120_000, // 10 exports per 2 minutes (anonymous)
  authenticatedMaxTokens: 30, // 30 for authenticated users
});

export const mcpRateLimit = rateLimit({
  maxTokens: 30,
  windowMs: 60_000, // 30 MCP tool calls per minute (anonymous)
  authenticatedMaxTokens: 60, // 60 for authenticated users
});

/** Create a user-based key extractor that uses the Authorization header */
export function createUserKeyExtractor(): (request: Request) => string {
  return (request: Request): string => {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      // Use a hash prefix of the token as user identifier
      const token = authHeader.substring(7);
      return `user:${token.substring(0, 16)}`;
    }
    // Fall back to IP-based key
    return `rl:${getClientIP(request)}`;
  };
}
