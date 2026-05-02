/**
 * Input sanitization utilities for common input patterns
 * These helpers provide defense-in-depth beyond TypeScript type checking.
 */

/** Sanitize string input - trim, remove null bytes, limit length */
export function sanitizeString(input: string, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\0/g, '')           // Remove null bytes
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
    .trim()
    .substring(0, maxLength);
}

/** Sanitize SQL-like query input - prevent basic injection patterns */
export function sanitizeQuery(input: string): string {
  if (typeof input !== 'string') return '';
  // Remove common SQL injection patterns (defense-in-depth, not a replacement for parameterized queries)
  return input
    .replace(/--/g, '')           // Remove SQL comments
    .replace(/;.*$/gm, '')        // Remove statement separators
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\b(DROP|DELETE|TRUNCATE|ALTER|EXEC|EXECUTE|xp_|sp_)\b/gi, '') // Remove dangerous keywords
    .trim()
    .substring(0, 500);
}

/** Validate and sanitize email */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') return '';
  const trimmed = email.trim().toLowerCase();
  // Basic email pattern check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) return '';
  return trimmed.substring(0, 254); // RFC 5321 max length
}

/** Sanitize URL - allow only http/https protocols */
export function sanitizeURL(url: string): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  // Only allow http: and https: protocols
  if (!/^https?:\/\//i.test(trimmed)) return '';
  // Block javascript:, data:, vbscript: etc.
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

/** Strip HTML tags from input */
export function stripHTML(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')      // Remove HTML tags
    .replace(/&[a-zA-Z0-9#]+;/g, ' ') // Replace HTML entities with space
    .replace(/\s+/g, ' ')          // Collapse whitespace
    .trim();
}

/** Sanitize a filename - remove path traversal and special characters */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove invalid chars
    .replace(/\.\./g, '')                     // Remove path traversal
    .replace(/^\s+|\s+$/g, '')                // Trim
    .substring(0, 255);
}

/** Sanitize a JSON string input - validate it's parseable */
export function sanitizeJSON(input: string): unknown | null {
  if (typeof input !== 'string') return null;
  try {
    const parsed = JSON.parse(input);
    // Limit depth to prevent deeply nested attacks
    const maxDepth = 10;
    const checkDepth = (obj: unknown, depth: number): boolean => {
      if (depth > maxDepth) return false;
      if (typeof obj !== 'object' || obj === null) return true;
      for (const val of Object.values(obj as Record<string, unknown>)) {
        if (!checkDepth(val, depth + 1)) return false;
      }
      return true;
    };
    if (!checkDepth(parsed, 0)) return null;
    return parsed;
  } catch {
    return null;
  }
}
