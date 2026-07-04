/**
 * OpenTelemetry SDK Initialization
 *
 * This file sets up the OTel tracing provider with:
 * - OTLP HTTP exporter (sends to collector / Jaeger / Langfuse)
 * - Auto-instrumentation for HTTP and Prisma
 * - Graceful shutdown
 *
 * Import this file as early as possible in the application lifecycle.
 * In Next.js, this means importing in instrumentation.ts (if using next.config experimental.instrumentationHook)
 * or in a custom server entry point.
 *
 * Environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP collector URL (default: http://localhost:4318/v1/traces)
 * - OTEL_SERVICE_NAME: Service name (default: supply-chain-cortex)
 * - OTEL_TRACES_SAMPLER: Sampling strategy (default: always_on for dev, parentbased_traceidratio for prod)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { AlwaysOnSampler, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { resolveOtlpConfig, createTraceExporter } from '@/lib/observability/otel-config';

const isDev = process.env.NODE_ENV === 'development';

let sdk: NodeSDK | null = null;

export function initOpenTelemetry(): void {
  if (sdk) return; // Already initialized

  const cfg = resolveOtlpConfig();
  const exporter = createTraceExporter();

  const sampler = isDev
    ? new AlwaysOnSampler()
    : new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: cfg.serviceName,
    }),
    traceExporter: exporter,
    sampler,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy instrumentations
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown
  const shutdown = async () => {
    if (sdk) {
      await sdk.shutdown();
      sdk = null;
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  if (isDev) {
    console.log(
      `[OTel] Initialized — service=${cfg.serviceName} endpoint=${cfg.tracesEndpoint} protocol=${cfg.protocol} sampler=${isDev ? 'always_on' : 'parentbased_traceidratio(0.1)'}`,
    );
  }
}

/** Manually shutdown OTel (useful for tests) */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
