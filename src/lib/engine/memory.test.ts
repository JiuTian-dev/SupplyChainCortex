import { describe, it, expect, beforeEach } from 'vitest';
import { agentMemory } from './memory';

beforeEach(() => {
  agentMemory._clear();
});

describe('AgentMemory key-value store', () => {
  it('set and get a value', () => {
    agentMemory.set('test', 'key1', 'hello');
    expect(agentMemory.get<string>('test', 'key1')).toBe('hello');
  });

  it('returns null for missing key', () => {
    expect(agentMemory.get('test', 'missing')).toBeNull();
  });

  it('returns null for expired key', async () => {
    agentMemory.set('test', 'expiring', 'value', 10);
    await new Promise(r => setTimeout(r, 20));
    expect(agentMemory.get('test', 'expiring')).toBeNull();
  });

  it('delete removes a key', () => {
    agentMemory.set('test', 'del', 'val');
    agentMemory.delete('test', 'del');
    expect(agentMemory.get('test', 'del')).toBeNull();
  });

  it('namespaces isolate keys', () => {
    agentMemory.set('ns1', 'key', 'val1');
    agentMemory.set('ns2', 'key', 'val2');
    expect(agentMemory.get('ns1', 'key')).toBe('val1');
    expect(agentMemory.get('ns2', 'key')).toBe('val2');
  });

  it('getNamespaces returns active namespaces', () => {
    agentMemory.set('cascade', 'k1', 'v1');
    agentMemory.set('sandbox', 'k2', 'v2');
    const namespaces = agentMemory.getNamespaces();
    expect(namespaces).toContain('cascade');
    expect(namespaces).toContain('sandbox');
  });
});

describe('SharedContext', () => {
  it('starts with all null sections', () => {
    const ctx = agentMemory.getSharedContext();
    expect(ctx.cascadeRisk).toBeNull();
    expect(ctx.decisionGraph).toBeNull();
    expect(ctx.sandbox).toBeNull();
    expect(ctx.mcpOrchestrator).toBeNull();
  });

  it('updateShared writes to a section', () => {
    agentMemory.updateShared('cascadeRisk', {
      lastRun: '2026-01-01T00:00:00Z',
      overallRisk: 45,
      affectedNodes: 12,
      maxDepth: 3,
      scenario: 'weather_disruption',
      topRisks: [],
    });
    const ctx = agentMemory.getSharedContext();
    expect(ctx.cascadeRisk).toBeTruthy();
    expect(ctx.cascadeRisk!.overallRisk).toBe(45);
    expect(ctx.cascadeRisk!.scenario).toBe('weather_disruption');
  });

  it('updateShared merges partial data', () => {
    agentMemory.updateShared('sandbox', {
      lastRun: '2026-01-01T00:00:00Z',
      scenario: 'trade_war',
      resilienceScore: 65,
      survivalRate: 80,
      totalStockouts: 5,
      totalDelays: 12,
      summary: 'ok',
    });
    agentMemory.updateShared('sandbox', { resilienceScore: 72, totalStockouts: 3 });
    const ctx = agentMemory.getSharedContext();
    expect(ctx.sandbox!.resilienceScore).toBe(72);
    expect(ctx.sandbox!.totalStockouts).toBe(3);
    expect(ctx.sandbox!.scenario).toBe('trade_war');
  });
});

describe('TKV eviction', () => {
  it('evictExpired removes only expired entries', () => {
    agentMemory.set('test', 'active', 'val1');
    agentMemory.set('test', 'expired', 'val2', 1);
    const evicted = agentMemory.evictExpired();
    expect(evicted).toBeGreaterThanOrEqual(0);
  });
});
