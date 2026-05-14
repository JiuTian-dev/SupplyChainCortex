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

// Agent Memory (Dimension 5)
export { agentMemory } from './memory';
export type {
  SharedContext,
  CascadeRiskContext,
  DecisionGraphContext,
  SandboxContext,
  MCPOrchestratorContext,
} from './memory';

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

// Causal Reasoning (Direction A)
export {
  buildCausalEdges,
  runCounterfactual as runDeepCounterfactual,
  generateCausalSummary,
} from './causal-reasoning';
export type {
  CausalEdge,
  CausalFactor,
  CounterfactualQuery,
  CounterfactualResult,
} from './causal-reasoning';

// ReAct Agent (2026 upgrade)
export {
  runReActAgent,
  runReActAgentSync,
  parseToolCalls as parseReActToolCalls,
} from './react-agent';
export type {
  ReActStep,
  ReActResult,
  ReActOptions,
} from './react-agent';

// Dynamic Context Builder (2026 upgrade)
export {
  gatherBriefing,
  formatBriefingContext,
  buildDynamicSystemContext,
} from './context-builder';
export type { AgentBriefing } from './context-builder';

// Evidence-Level Feedback (2026 upgrade)
export {
  evidenceTracker,
  recordEvidenceFeedback,
  extractClaims,
  getSourceReliabilityMap,
  buildFeedbackInsight,
} from './evidence-feedback';
export type {
  ClaimVerdict,
  ClaimAnnotation,
  SourceWeight,
  EvidenceFeedbackStats,
} from './evidence-feedback';

// Policy-as-Code Bounded Autonomy (2026 upgrade)
export {
  DEFAULT_POLICY,
  autonomyPolicy,
  executeWithPolicy,
} from './autonomy-policy';
export type {
  AutonomyLevel,
  ToolPolicy,
  AutonomyPolicy,
} from './autonomy-policy';

// RAG Knowledge Evolution (v0.9)
export {
  evolveFromFeedback,
  updateChunkScore,
  getKnowledgeHealth,
  getChunksNeedingReview,
} from './rag';
