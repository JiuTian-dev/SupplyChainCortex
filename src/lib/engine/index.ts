/**
 * Engine Core — resilience, caching, observability for enterprise production.
 *
 * Usage:
 *   import { withTimeout, withFallback, getCircuitBreaker, engineCache, logDecision } from '@/lib/engine';
 */

// Resilience
export {
  withTimeout,
  withPromiseTimeout,
  withRetry,
  withFallback,
  CircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  getAllCircuitBreakers,
  TimeoutError,
} from './resilience';
export type {
  RetryOptions,
  CircuitBreakerState,
  CircuitBreakerOptions,
  FallbackResult,
  EngineHealth,
} from './resilience';

// Cache
export {
  engineCache,
  engineCached,
  engineCacheKey,
  versionedCachedFetch,
  computeConfigVersion,
  getConfigVersion,
  setConfigVersion,
} from './cache';
export type { CacheEntry, EngineCacheStats } from './cache';

// Observability
export {
  decisionLogger,
  createDecisionLog,
  logDecision,
  runHealthProbe,
  getEngineMetrics,
} from './observability';
export type {
  DecisionLogEntry,
  HealthProbeResult,
  EngineMetrics,
} from './observability';

// Passport (Dimension 2)
export {
  createPassport,
  provenanceEntry,
  degradedProvenance,
  unavailableProvenance,
  computeConfidence,
  serializeForFrontend,
} from './passport';
export type {
  DecisionPassport,
  DataProvenanceEntry,
  AlternativeOption,
  PassportInput,
} from './passport';

// Deterministic Simulation (Dimension 3)
export {
  DeterministicRandom,
  SlidingWindow,
  SimulationContext,
  seedFromString,
  seedFromDate,
} from './deterministic';
export type { StateSnapshot, SimulationRunConfig } from './deterministic';

// Feedback Loop (Dimension 4)
export {
  feedbackStore,
  recordFeedback,
  recordOutcome,
  getFeedbackStats,
} from './feedback';
export type {
  DecisionFeedback,
  BusinessOutcome,
  FeedbackStats,
  FeedbackAction,
} from './feedback';
