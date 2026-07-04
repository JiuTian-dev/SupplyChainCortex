/**
 * OpenTelemetry Exporter Configuration
 *
 * Centralizes OTLP exporter setup (HTTP + gRPC) so tracing/metrics/logging
 * exporters share a single source of truth for endpoint + headers.
 *
 * Environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT  Base OTLP endpoint (e.g. http://otel-collector:4318)
 * - OTEL_EXPORTER_OTLP_PROTOCOL  "http/protobuf" | "grpc" (default: http/protobuf)
 * - OTEL_EXPORTER_OTLP_HEADERS   Comma-separated key=value headers
 * - OTEL_SERVICE_NAME            Service name (default: supply-chain-cortex)
 */

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export type OtlpProtocol = 'http/protobuf' | 'grpc';

export interface OtlpExporterConfig {
  /** Full traces endpoint URL */
  tracesEndpoint: string;
  /** Full metrics endpoint URL (HTTP) */
  metricsEndpoint: string;
  /** Full logs endpoint URL (HTTP) */
  logsEndpoint: string;
  /** Protocol selection */
  protocol: OtlpProtocol;
  /** Optional headers (auth tokens, etc.) */
  headers?: Record<string, string>;
  /** Service name */
  serviceName: string;
}

/**
 * Resolve OTLP exporter configuration from environment variables.
 *
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is treated as the base URL. Per-signal paths
 * (`/v1/traces`, `/v1/metrics`, `/v1/logs`) are appended automatically for
 * HTTP/protobuf. If the env var already ends with a `/v1/<signal>` path it is
 * used as-is for traces and the base is derived for the other signals.
 */
export function resolveOtlpConfig(): OtlpExporterConfig {
  const rawEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '';
  const protocol = (process.env.OTEL_EXPORTER_OTLP_PROTOCOL as OtlpProtocol) || 'http/protobuf';
  const serviceName = process.env.OTEL_SERVICE_NAME || 'supply-chain-cortex';

  const headers = parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);

  // Normalize: strip trailing slash
  const base = rawEndpoint.replace(/\/+$/, '');

  let tracesEndpoint: string;
  let metricsEndpoint: string;
  let logsEndpoint: string;

  if (base.endsWith('/v1/traces')) {
    tracesEndpoint = base;
    const root = base.slice(0, -'/v1/traces'.length);
    metricsEndpoint = `${root}/v1/metrics`;
    logsEndpoint = `${root}/v1/logs`;
  } else if (base) {
    tracesEndpoint = `${base}/v1/traces`;
    metricsEndpoint = `${base}/v1/metrics`;
    logsEndpoint = `${base}/v1/logs`;
  } else {
    // Sensible dev defaults pointing at a local OTLP collector
    tracesEndpoint = 'http://localhost:4318/v1/traces';
    metricsEndpoint = 'http://localhost:4318/v1/metrics';
    logsEndpoint = 'http://localhost:4318/v1/logs';
  }

  return {
    tracesEndpoint,
    metricsEndpoint,
    logsEndpoint,
    protocol,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    serviceName,
  };
}

/** Build an OTLP HTTP trace exporter from resolved config. */
export function createTraceExporter(): OTLPTraceExporter {
  const cfg = resolveOtlpConfig();
  return new OTLPTraceExporter({
    url: cfg.tracesEndpoint,
    headers: cfg.headers,
  });
}

function parseHeaders(raw?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}
