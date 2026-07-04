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

// Graph-RAG (v0.11)
export {
  buildGraph, getGraph, refreshGraph, searchNodes,
  getNeighbors, getUpstream, summarizeGraph,
} from './graph-store';
export type { SupplyChainGraph, GraphNode, GraphEdge } from './graph-store';
export {
  cascadePropagation, betweennessCentrality, findPath, impactRadius,
} from './graph-algorithms';
export type { CascadeResult, CentralityResult, PathResult } from './graph-algorithms';
export {
  buildGraphContext, formatGraphContext,
} from './graph-rag';
export type { GraphContext } from './graph-rag';

// Episodic Memory (v0.12)
export {
  episodeStore, formatEpisodeContext,
} from './episode-store';
export type { Episode, ConsolidatedFact } from './episode-store';
export {
  runConsolidation, formatConsolidatedFactsContext,
} from './memory-consolidation';
export type { ConsolidationReport } from './memory-consolidation';

// Strategy Engine (v0.13)
export {
  recommendStrategies, formatStrategyContext,
} from './strategy-engine';
export type { StrategyOption, StrategyRecommendation, RiskContext } from './strategy-engine';

// Data Source Health (v0.13)
export {
  recordSourceSuccess, recordSourceFailure,
  getSourceHealth, getAllSourceHealths, getSourceHealthSummary, getDegradedSources,
  registerSource,
} from './connector-health';
export type { SourceHealth } from './connector-health';

// Query Cache (v0.18)
export { queryCache, CACHE_TTL } from './query-cache';
export type { CacheStats } from './query-cache';

// Push Hub (v0.14)
export { pushHub } from './push-hub';
export type { PushNotification, GraphChangeEvent, PushEvent } from './push-hub';

// Compliance Check (v0.16)
export { checkCompliance, checkMultiMarketCompliance } from './compliance-check';
export type { ComplianceRequirement, ComplianceCheckResult } from './compliance-check';

// Financial Simulator (v0.16)
export { runSimulation, quickCheck } from './financial-simulator';
export type { SimInput, SimResult, ScenarioResult } from './financial-simulator';

// Product Feed (v0.16)
export { generateProductFeed, getProductAgentCard } from './product-feed';
export type { AgentProductFeed, AgentProductEntry } from './product-feed';

// Arbitrage Engine (v0.17)
export { findArbitrageOpportunity } from './arbitrage-engine';
export type { ArbitrageOpportunity, ArbitrageRequest } from './arbitrage-engine';

// Coherence Audit (v0.17)
export { runCoherenceAudit } from './coherence-audit';
export type { CoherenceIssue, CoherenceAuditReport } from './coherence-audit';

// Recall Early Warning (v0.17)
export { runRecallRiskAnalysis } from './recall-early-warning';
export type { RecallPattern, ProductRecallRisk, RecallWarningReport } from './recall-early-warning';

// Supplier Discovery (v0.17)
export { discoverSuppliers } from './supplier-discovery';
export type { DiscoveredSupplier, SupplierDiscoveryResult } from './supplier-discovery';
