/**
 * Prometheus Metrics Endpoint — GET /api/metrics
 *
 * Exposes all registered metrics in the Prometheus 0.0.4 text exposition
 * format so a Prometheus server can scrape them.
 *
 * Security: optionally protected by HTTP Basic Auth. Set
 * `METRICS_BASIC_AUTH` to `user:password` to enable. When unset, the endpoint
 * is open (suitable for scraping from inside a private Docker network).
 *
 * The route is forced to run in the Node.js runtime (not Edge) because the
 * metrics registry is an in-process singleton.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exposeMetrics } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

export function GET(request: NextRequest): NextResponse {
  const auth = process.env.METRICS_BASIC_AUTH;
  if (auth) {
    const header = request.headers.get('authorization') || '';
    if (!checkBasicAuth(header, auth)) {
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="metrics"' },
      });
    }
  }

  const body = exposeMetrics();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': PROMETHEUS_CONTENT_TYPE,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * Validate an `Authorization: Basic <base64>` header against an expected
 * `user:password` string. Uses a constant-time comparison to avoid timing
 * leaks of the expected credential length.
 */
function checkBasicAuth(header: string, expected: string): boolean {
  const prefix = 'Basic ';
  if (!header.startsWith(prefix)) return false;
  const encoded = header.slice(prefix.length).trim();
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return false;
  }
  return constantTimeEqual(decoded, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still compare to keep timing roughly uniform
    b = a;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0 && a.length === b.length;
}
