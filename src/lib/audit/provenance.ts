/**
 * W3C PROV-O Provenance Layer — Semantic audit trace with PROV ontology mapping.
 *
 * Maps internal audit logs and decision traces to W3C PROV-O concepts:
 *   - Entity: data artifacts (audit logs, decision traces, reports)
 *   - Activity: operations (CREATE, UPDATE, agent inference, tool execution)
 *   - Agent: actors (users, AI models, system processes)
 *
 * Outputs JSON-LD for interoperability with provenance repositories.
 *
 * References:
 *   - W3C PROV-O: https://www.w3.org/TR/prov-o/
 *   - W3C JSON-LD: https://www.w3.org/TR/json-ld11/
 *   - EU AI Act Article 12: logging and traceability requirements
 */

// ─── PROV-O Namespace ───────────────────────────────────────────────────────

const PROV = 'http://www.w3.org/ns/prov#';
const SCHEMA = 'https://schema.org/';
const SCC = 'https://supplychain-cortex.ai/ns/'; // Custom namespace

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProvEntity {
  '@id': string;
  '@type': `${typeof PROV}Entity`;
  label: string;
  generatedAtTime: string;
  wasAttributedTo?: string;
  wasDerivedFrom?: string;
  wasGeneratedBy?: string;
  contentHash?: string;
  signature?: string;
}

export interface ProvActivity {
  '@id': string;
  '@type': `${typeof PROV}Activity`;
  label: string;
  startedAtTime: string;
  endedAtTime: string;
  wasAssociatedWith?: string;
  used?: string | string[];
}

export interface ProvAgent {
  '@id': string;
  '@type': `${typeof PROV}Agent` | `${typeof SCHEMA}Person` | `${typeof SCC}AIModel`;
  label: string;
  actedOnBehalfOf?: string;
}

export interface ProvenanceRecord {
  '@context': typeof PROV_CONTEXT;
  '@id': string;
  '@type': `${typeof PROV}Bundle`;
  entity: ProvEntity[];
  activity: ProvActivity[];
  agent: ProvAgent[];
  hadMember?: Array<{ '@id': string }>;
}

// ─── JSON-LD Context ────────────────────────────────────────────────────────

const PROV_CONTEXT = {
  prov: PROV,
  schema: SCHEMA,
  scc: SCC,
  label: { '@id': 'http://www.w3.org/2000/01/rdf-schema#label' },
  generatedAtTime: { '@id': `${PROV}generatedAtTime`, '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
  startedAtTime: { '@id': `${PROV}startedAtTime`, '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
  endedAtTime: { '@id': `${PROV}endedAtTime`, '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
  wasAttributedTo: { '@id': `${PROV}wasAttributedTo`, '@type': '@id' },
  wasDerivedFrom: { '@id': `${PROV}wasDerivedFrom`, '@type': '@id' },
  wasGeneratedBy: { '@id': `${PROV}wasGeneratedBy`, '@type': '@id' },
  wasAssociatedWith: { '@id': `${PROV}wasAssociatedWith`, '@type': '@id' },
  used: { '@id': `${PROV}used`, '@type': '@id' },
  actedOnBehalfOf: { '@id': `${PROV}actedOnBehalfOf`, '@type': '@id' },
  hadMember: { '@id': `${PROV}hadMember`, '@type': '@id' },
  contentHash: { '@id': `${SCC}contentHash` },
  signature: { '@id': `${SCC}signature` },
};

// ─── Audit Log → PROV Mapping ──────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  sku?: string | null;
  userId: string;
  userName: string;
  details: unknown;
  severity: string;
  contentHash?: string | null;
  previousHash?: string | null;
  signature?: string | null;
  createdAt: Date;
}

interface DecisionTraceEntry {
  id: string;
  auditId: string;
  userQuery: string;
  intent: string;
  confidence: number;
  mode: string;
  tier?: number | null;
  durationMs: number;
  toolsUsed: string[];
  claimsCount: number;
  passport: unknown;
  userId?: string;
  summary?: string | null;
  contentHash?: string | null;
  previousHash?: string | null;
  signature?: string | null;
  createdAt: Date;
}

/**
 * Convert an audit log entry to a PROV-O provenance record.
 */
export function auditToProvenance(log: AuditLogEntry): ProvenanceRecord {
  const entityIri = `${SCC}audit/${log.id}`;
  const activityIri = `${SCC}activity/${log.action.toLowerCase()}-${log.id}`;
  const agentIri = log.userId === 'system'
    ? `${SCC}agent/system`
    : `${SCC}agent/user/${log.userId}`;
  const previousEntityIri = log.previousHash
    ? `${SCC}audit/prev-${log.previousHash.slice(0, 12)}`
    : undefined;

  const entity: ProvEntity = {
    '@id': entityIri,
    '@type': `${PROV}Entity`,
    label: `${log.action} ${log.entity}${log.entityId ? `/${log.entityId}` : ''}`,
    generatedAtTime: log.createdAt.toISOString(),
    wasAttributedTo: agentIri,
    wasGeneratedBy: activityIri,
    ...(log.contentHash && { contentHash: log.contentHash }),
    ...(log.signature && { signature: log.signature }),
    ...(previousEntityIri && { wasDerivedFrom: previousEntityIri }),
  };

  const activity: ProvActivity = {
    '@id': activityIri,
    '@type': `${PROV}Activity`,
    label: `${log.action} on ${log.entity}`,
    startedAtTime: log.createdAt.toISOString(),
    endedAtTime: log.createdAt.toISOString(),
    wasAssociatedWith: agentIri,
  };

  const agent: ProvAgent = {
    '@id': agentIri,
    '@type': log.userId === 'system' ? `${SCC}AIModel` : `${SCHEMA}Person`,
    label: log.userName || log.userId,
  };

  return {
    '@context': PROV_CONTEXT,
    '@id': `${SCC}bundle/audit-${log.id}`,
    '@type': `${PROV}Bundle`,
    entity: [entity],
    activity: [activity],
    agent: [agent],
  };
}

/**
 * Convert a decision trace to a PROV-O provenance record.
 * This is the richer mapping — traces capture the full AI decision pipeline.
 */
export function traceToProvenance(trace: DecisionTraceEntry): ProvenanceRecord {
  const entityIri = `${SCC}trace/${trace.id}`;
  const activityIri = `${SCC}activity/inference-${trace.id}`;
  const auditEntityIri = `${SCC}audit/${trace.auditId}`;
  const modelAgentIri = `${SCC}agent/model/${trace.mode}`;
  const userAgentIri = trace.userId
    ? `${SCC}agent/user/${trace.userId}`
    : `${SCC}agent/anonymous`;

  // Tool usage as sub-activities
  const toolActivities: ProvActivity[] = trace.toolsUsed.map((tool, i) => ({
    '@id': `${SCC}activity/tool-${tool}-${trace.id}`,
    '@type': `${PROV}Activity` as const,
    label: `Tool execution: ${tool}`,
    startedAtTime: trace.createdAt.toISOString(),
    endedAtTime: trace.createdAt.toISOString(),
    wasAssociatedWith: modelAgentIri,
  }));

  const entity: ProvEntity = {
    '@id': entityIri,
    '@type': `${PROV}Entity`,
    label: `Decision: ${trace.intent} (confidence: ${(trace.confidence * 100).toFixed(0)}%)`,
    generatedAtTime: trace.createdAt.toISOString(),
    wasAttributedTo: modelAgentIri,
    wasGeneratedBy: activityIri,
    wasDerivedFrom: auditEntityIri,
    ...(trace.contentHash && { contentHash: trace.contentHash }),
    ...(trace.signature && { signature: trace.signature }),
  };

  const mainActivity: ProvActivity = {
    '@id': activityIri,
    '@type': `${PROV}Activity`,
    label: `AI inference: ${trace.intent} (${trace.mode}, ${trace.durationMs}ms)`,
    startedAtTime: trace.createdAt.toISOString(),
    endedAtTime: new Date(trace.createdAt.getTime() + trace.durationMs).toISOString(),
    wasAssociatedWith: modelAgentIri,
    used: trace.toolsUsed.length > 0
      ? trace.toolsUsed.map(t => `${SCC}activity/tool-${t}-${trace.id}`)
      : undefined,
  };

  const modelAgent: ProvAgent = {
    '@id': modelAgentIri,
    '@type': `${SCC}AIModel`,
    label: `AI Model: ${trace.mode}`,
    actedOnBehalfOf: userAgentIri,
  };

  const userAgent: ProvAgent = {
    '@id': userAgentIri,
    '@type': trace.userId ? `${SCHEMA}Person` : `${PROV}Agent`,
    label: trace.userId || 'Anonymous User',
  };

  return {
    '@context': PROV_CONTEXT,
    '@id': `${SCC}bundle/trace-${trace.id}`,
    '@type': `${PROV}Bundle`,
    entity: [entity],
    activity: [mainActivity, ...toolActivities],
    agent: [modelAgent, userAgent],
  };
}

/**
 * Serialize a provenance record to JSON-LD string.
 */
export function toJsonLd(record: ProvenanceRecord): string {
  return JSON.stringify(record, null, 2);
}

/**
 * Parse a JSON-LD provenance string back to a ProvenanceRecord.
 */
export function fromJsonLd(jsonLd: string): ProvenanceRecord {
  return JSON.parse(jsonLd) as ProvenanceRecord;
}

/**
 * Extract all entity IDs from a provenance record.
 */
export function getEntityIds(record: ProvenanceRecord): string[] {
  return record.entity.map(e => e['@id']);
}

/**
 * Extract all agent IDs from a provenance record.
 */
export function getAgentIds(record: ProvAgent[] | ProvenanceRecord): string[] {
  const agents = Array.isArray(record) ? record : (record as ProvenanceRecord).agent;
  return agents.map(a => a['@id']);
}

/**
 * Build a combined provenance record from an audit log and its associated trace.
 */
export function combinedProvenance(
  log: AuditLogEntry,
  trace: DecisionTraceEntry | null,
): ProvenanceRecord {
  const logProv = auditToProvenance(log);

  if (!trace) return logProv;

  const traceProv = traceToProvenance(trace);

  // Merge entities, activities, and agents
  const allEntities = [...logProv.entity, ...traceProv.entity];
  const allActivities = [...logProv.activity, ...traceProv.activity];
  const allAgents = [...logProv.agent, ...traceProv.agent];

  // Deduplicate agents by @id
  const uniqueAgents = allAgents.filter(
    (agent, i, arr) => arr.findIndex(a => a['@id'] === agent['@id']) === i,
  );

  return {
    '@context': PROV_CONTEXT,
    '@id': `${SCC}bundle/combined-${log.id}`,
    '@type': `${PROV}Bundle`,
    entity: allEntities,
    activity: allActivities,
    agent: uniqueAgents,
  };
}

// ─── Export context for external use ─────────────────────────────────────────

export { PROV_CONTEXT, PROV, SCHEMA, SCC };
