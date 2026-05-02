/**
 * Security headers configuration for responses
 * Follows OWASP best practices with adjustments for dashboard use
 */

export const SECURITY_HEADERS = {
  // Restrict iframe embedding to same origin
  // NOTE: If preview panel (.z.ai) requires embedding, override per-route
  'X-Frame-Options': 'SAMEORIGIN',
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // XSS Protection (legacy but still useful for older browsers)
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Content Security Policy - permissive for development, tighten for production
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Needed for Next.js
    "style-src 'self' 'unsafe-inline'", // Needed for Tailwind
    "img-src 'self' data: blob: https: http:", // Allow external images, data URIs, and blobs
    "font-src 'self' data:",
    "connect-src 'self' https: wss: ws:", // API calls, WebSocket, and external APIs
    "frame-ancestors 'self'", // Restrict to same origin; override per-route if preview panel needed
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:", // Web workers from self and blob URLs
  ].join('; '),
  
  // Permissions policy - restrict browser features
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', '),
  
  // HSTS - Force HTTPS (only set in production with HTTPS)
  // 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  
  // Cross-Origin policies
  // Cross-Origin policies - relaxed for dashboard preview panel compatibility
  // 'Cross-Origin-Opener-Policy': 'same-origin',  // Too restrictive for preview panel
  // 'Cross-Origin-Resource-Policy': 'same-origin',  // Blocks cross-origin API calls from preview
  // 'Cross-Origin-Embedder-Policy': 'credentialless',  // Can cause issues with cross-origin iframes
};

/** Apply security headers to a response */
export function withSecurityHeaders(headers: Headers): Headers {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return headers;
}

/** Create rate limit headers */
export function rateLimitHeaders(result: {
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
  
  if (result.retryAfter) {
    headers['Retry-After'] = String(result.retryAfter);
  }
  
  return headers;
}
