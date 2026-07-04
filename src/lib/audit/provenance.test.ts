/**
 * W3C PROV-O Provenance Layer — Tests
 */

import { describe, it, expect } from 'vitest';
import {
  auditToProvenance,
  traceToProvenance,
  combinedProvenance,
  toJsonLd,
  fromJsonLd,
  getEntityIds,
  getAgentIds,
  PROV,
  SCHEMA,
  SCC,
} from './provenance';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const sampleAuditLog = {
  id: 'audit-001',
  action: 'CREATE',
  entity: 'product',
  entityId: 'prod-123',
  sku: 'SKU-001',
  userId: 'user-1',
  userName: 'Test User',
  details: { sku: 'SKU-001', qty: 10 },
  severity: 'info',
  contentHash: 'a'.repeat(64),
  previousHash: 'b'.repeat(64),
  signature: 'c'.repeat(64),
  createdAt: new Date('2026-06-08T10:00:00Z'),
};

const sampleTrace = {
  id: 'trace-001',
  auditId: 'audit-001',
  userQuery: '库存健康检查',
  intent: 'inventory-health-check',
  confidence: 0.95,
  mode: 'fsm-v2',
  tier: 1,
  durationMs: 1200,
  toolsUsed: ['query_inventory', 'classify_abc_xyz'],
  claimsCount: 3,
  passport: { engine: 'fsm-agent-v2' },
  summary: '库存整体健康',
  contentHash: 'd'.repeat(64),
  previousHash: null,
  signature: null,
  createdAt: new Date('2026-06-08T10:00:01Z'),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Provenance', () => {
  describe('auditToProvenance', () => {
    it('should map audit log to PROV Entity', () => {
      const record = auditToProvenance(sampleAuditLog);

      expect(record.entity).toHaveLength(1);
      const entity = record.entity[0];
      expect(entity['@id']).toBe(`${SCC}audit/audit-001`);
      expect(entity['@type']).toBe(`${PROV}Entity`);
      expect(entity.label).toContain('CREATE');
      expect(entity.label).toContain('product');
      expect(entity.generatedAtTime).toBe('2026-06-08T10:00:00.000Z');
      expect(entity.contentHash).toBe('a'.repeat(64));
      expect(entity.signature).toBe('c'.repeat(64));
    });

    it('should map audit log to PROV Activity', () => {
      const record = auditToProvenance(sampleAuditLog);

      expect(record.activity).toHaveLength(1);
      const activity = record.activity[0];
      expect(activity['@type']).toBe(`${PROV}Activity`);
      expect(activity.label).toContain('CREATE');
      expect(activity.wasAssociatedWith).toBeDefined();
    });

    it('should map user to PROV Agent', () => {
      const record = auditToProvenance(sampleAuditLog);

      expect(record.agent).toHaveLength(1);
      const agent = record.agent[0];
      expect(agent['@id']).toBe(`${SCC}agent/user/user-1`);
      expect(agent['@type']).toBe(`${SCHEMA}Person`);
      expect(agent.label).toBe('Test User');
    });

    it('should map system user to AIModel agent', () => {
      const systemLog = { ...sampleAuditLog, userId: 'system', userName: '系统' };
      const record = auditToProvenance(systemLog);

      const agent = record.agent[0];
      expect(agent['@id']).toBe(`${SCC}agent/system`);
      expect(agent['@type']).toBe(`${SCC}AIModel`);
    });

    it('should include wasDerivedFrom when previousHash exists', () => {
      const record = auditToProvenance(sampleAuditLog);
      expect(record.entity[0].wasDerivedFrom).toBeDefined();
    });

    it('should not include wasDerivedFrom when no previousHash', () => {
      const noPrevLog = { ...sampleAuditLog, previousHash: null };
      const record = auditToProvenance(noPrevLog);
      expect(record.entity[0].wasDerivedFrom).toBeUndefined();
    });

    it('should have PROV Bundle type', () => {
      const record = auditToProvenance(sampleAuditLog);
      expect(record['@type']).toBe(`${PROV}Bundle`);
      expect(record['@id']).toContain('bundle');
    });

    it('should have JSON-LD context', () => {
      const record = auditToProvenance(sampleAuditLog);
      expect(record['@context']).toBeDefined();
      expect(record['@context'].prov).toBe(PROV);
    });
  });

  describe('traceToProvenance', () => {
    it('should map trace to PROV Entity with intent info', () => {
      const record = traceToProvenance(sampleTrace);

      expect(record.entity).toHaveLength(1);
      const entity = record.entity[0];
      expect(entity['@id']).toBe(`${SCC}trace/trace-001`);
      expect(entity.label).toContain('inventory-health-check');
      expect(entity.label).toContain('95%');
    });

    it('should map trace to PROV Activity with duration', () => {
      const record = traceToProvenance(sampleTrace);

      const mainActivity = record.activity.find(
        a => a['@id'].includes('inference'),
      );
      expect(mainActivity).toBeDefined();
      expect(mainActivity!.label).toContain('fsm-v2');
      expect(mainActivity!.label).toContain('1200ms');
    });

    it('should create sub-activities for tool usage', () => {
      const record = traceToProvenance(sampleTrace);

      // Main activity + 2 tool activities
      expect(record.activity).toHaveLength(3);

      const toolActivities = record.activity.filter(
        a => a.label.startsWith('Tool execution:'),
      );
      expect(toolActivities).toHaveLength(2);
      expect(toolActivities[0].label).toContain('query_inventory');
      expect(toolActivities[1].label).toContain('classify_abc_xyz');
    });

    it('should map model as AIModel agent', () => {
      const record = traceToProvenance(sampleTrace);

      const modelAgent = record.agent.find(a => a['@id'].includes('model'));
      expect(modelAgent).toBeDefined();
      expect(modelAgent!['@type']).toBe(`${SCC}AIModel`);
      expect(modelAgent!.actedOnBehalfOf).toBeDefined();
    });

    it('should map user as Person agent', () => {
      const traceWithUser = { ...sampleTrace, userId: 'user-1' };
      const record = traceToProvenance(traceWithUser);

      const userAgent = record.agent.find(a => a['@id'].includes('user/user'));
      expect(userAgent).toBeDefined();
      expect(userAgent!['@type']).toBe(`${SCHEMA}Person`);
    });

    it('should link trace entity to audit entity via wasDerivedFrom', () => {
      const record = traceToProvenance(sampleTrace);
      expect(record.entity[0].wasDerivedFrom).toBe(`${SCC}audit/audit-001`);
    });

    it('should handle trace without tools', () => {
      const noToolsTrace = { ...sampleTrace, toolsUsed: [] };
      const record = traceToProvenance(noToolsTrace);

      expect(record.activity).toHaveLength(1); // Only main activity
    });
  });

  describe('combinedProvenance', () => {
    it('should merge audit and trace provenance', () => {
      const record = combinedProvenance(sampleAuditLog, sampleTrace);

      // 2 entities (audit + trace)
      expect(record.entity).toHaveLength(2);

      // Multiple activities (audit activity + inference + tools)
      expect(record.activity.length).toBeGreaterThanOrEqual(3);

      // Agents should be deduplicated
      const agentIds = record.agent.map(a => a['@id']);
      const uniqueIds = new Set(agentIds);
      expect(agentIds.length).toBe(uniqueIds.size);
    });

    it('should work with audit log only (no trace)', () => {
      const record = combinedProvenance(sampleAuditLog, null);

      expect(record.entity).toHaveLength(1);
      expect(record.activity).toHaveLength(1);
      expect(record.agent).toHaveLength(1);
    });
  });

  describe('JSON-LD serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const record = auditToProvenance(sampleAuditLog);
      const jsonLd = toJsonLd(record);
      const parsed = fromJsonLd(jsonLd);

      expect(parsed['@id']).toBe(record['@id']);
      expect(parsed.entity).toEqual(record.entity);
      expect(parsed.activity).toEqual(record.activity);
      expect(parsed.agent).toEqual(record.agent);
    });

    it('should produce valid JSON', () => {
      const record = auditToProvenance(sampleAuditLog);
      const jsonLd = toJsonLd(record);
      expect(() => JSON.parse(jsonLd)).not.toThrow();
    });

    it('should include @context in serialized output', () => {
      const record = auditToProvenance(sampleAuditLog);
      const jsonLd = toJsonLd(record);
      const parsed = JSON.parse(jsonLd);
      expect(parsed['@context']).toBeDefined();
      expect(parsed['@context'].prov).toBe(PROV);
    });
  });

  describe('utility functions', () => {
    it('getEntityIds should return all entity IDs', () => {
      const record = auditToProvenance(sampleAuditLog);
      const ids = getEntityIds(record);
      expect(ids).toHaveLength(1);
      expect(ids[0]).toContain('audit');
    });

    it('getAgentIds should return all agent IDs', () => {
      const record = traceToProvenance(sampleTrace);
      const ids = getAgentIds(record);
      expect(ids.length).toBeGreaterThanOrEqual(2);
    });
  });
});
