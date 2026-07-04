/**
 * Suppliers Service - Shared helper functions
 * Used by both queries.ts and analytics.ts.
 * Extracted from suppliers.service.ts for modularity.
 */

/** Parse ratingDetails (handles both Json object and string types) */
export function parseRatingDetails(ratingDetails: unknown): unknown {
  if (!ratingDetails) return null;
  if (typeof ratingDetails === 'object') return ratingDetails;
  if (typeof ratingDetails === 'string') {
    try {
      return JSON.parse(ratingDetails);
    } catch {
      return null;
    }
  }
  return null;
}
