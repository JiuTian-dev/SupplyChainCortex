/**
 * Observability barrel — OpenTelemetry config + Prometheus metrics registry.
 *
 * Import from `@/lib/observability` to access metric primitives and OTLP
 * exporter configuration.
 */

export {
  registry,
  exposeMetrics,
  observeDuration,
  fsmStateTransitions,
  toolCalls,
  toolCallDuration,
  providerRequests,
  providerRequestDuration,
  providerCostUsd,
  tenantQuotaUsage,
  stripeWebhookEvents,
  cascadeRiskComputations,
  cascadeRiskComputationDuration,
} from './metrics';

export type { Labels } from './metrics';

export {
  resolveOtlpConfig,
  createTraceExporter,
} from './otel-config';

export type { OtlpExporterConfig, OtlpProtocol } from './otel-config';
