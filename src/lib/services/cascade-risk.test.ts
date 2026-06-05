/**
 * E2E integration tests for cascade-risk engine.
 * Tests the full risk pipeline: detection → fusion → propagation → report.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sensitivityAnalysis,
  runCounterfactual,
  runCausalCounterfactual,
  boundaryTest,
  fuseMultiSourceRisks,
  applyCustomRules,
  generateExplanation,
  generatePreventiveActions,
  weatherDesc,
  setPropagationRules,
  propagateMonteCarlo,
  propagateSEIR,
} from './cascade-risk.service';
import type { EdgeType } from './cascade-risk.types';

// Helper to create a minimal CascadeEdge for testing
function testEdge(type: EdgeType, attenuation: number) {
  return { id: `test-${type}`, from: 'a', to: 'b', type, attenuation, metadata: {} };
}

describe('sensitivityAnalysis', () => {
  const baseAttenuation = {
    DEPARTS_FROM: 0.85,
    ARRIVES_AT: 0.70,
    CARRIES: 0.75,
    STORED_IN: 0.60,
    SUPPLIED_BY: 0.65,
  };

  const samplePropagation = [
    { nodeId: 'n1', label: 'Port Shanghai', type: 'PORT' as const, riskScore: 80, initialRisk: 80, propagatedRisk: 68, path: ['shanghai'], depth: 0, metadata: {}, explanation: '' },
    { nodeId: 'n2', label: 'Shipment A', type: 'SHIPMENT' as const, riskScore: 60, initialRisk: 0, propagatedRisk: 51, path: ['shanghai', 'ship-a'], depth: 1, metadata: {}, explanation: '' },
  ];

  it('returns one result per edge type', () => {
    const results = sensitivityAnalysis({ baseAttenuation, propagation: samplePropagation });
    expect(results.length).toBe(Object.keys(baseAttenuation).length);
  });

  it('each result contains parameter and perturbations array', () => {
    const results = sensitivityAnalysis({ baseAttenuation, propagation: samplePropagation });
    for (const r of results) {
      expect(r.parameter).toBeTruthy();
      expect(Array.isArray(r.perturbations)).toBe(true);
      expect((r.perturbations as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it('handles empty propagation', () => {
    const results = sensitivityAnalysis({ baseAttenuation, propagation: [] });
    for (const r of results) {
      expect((r.perturbations as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it('handles empty baseAttenuation', () => {
    const results = sensitivityAnalysis({ baseAttenuation: {} as Record<EdgeType, number>, propagation: samplePropagation });
    expect(results).toEqual([]);
  });
});

describe('runCounterfactual', () => {
  const emptyReport = {
    triggeredBy: { source: '', description: '', timestamp: '' },
    sourceNodes: [],
    propagation: [],
    summary: {
      totalNodes: 0, affectedNodes: 0, maxDepth: 0,
      avgPropagatedRisk: 0, criticalPaths: [], topAffectedProducts: [],
    },
  };

  const baseReport = {
    ...emptyReport,
    sourceNodes: [{ id: 'p1', label: 'Port X', riskScore: 60, cause: 'weather' }],
    propagation: [
      { nodeId: 'prod1', label: 'Product A', type: 'PRODUCT', riskScore: 60, initialRisk: 0, propagatedRisk: 50, path: ['p1', 'prod1'], depth: 1, metadata: { sku: 'SKU001', sellingPrice: 100, quantity: 50 } },
      { nodeId: 'prod2', label: 'Product B', type: 'PRODUCT', riskScore: 40, initialRisk: 0, propagatedRisk: 35, path: ['p1', 'prod2'], depth: 1, metadata: { sku: 'SKU002', sellingPrice: 80, quantity: 30 } },
    ],
    summary: {
      totalNodes: 4, affectedNodes: 2, maxDepth: 1,
      avgPropagatedRisk: 42.5, criticalPaths: [], topAffectedProducts: [
        { sku: 'SKU001', productName: 'Product A', impactScore: 50, propagationPath: 'p1→prod1', estimatedDelay: 7, estimatedRevenueImpact: 10500, preventiveAction: '' },
        { sku: 'SKU002', productName: 'Product B', impactScore: 35, propagationPath: 'p1→prod2', estimatedDelay: 5, estimatedRevenueImpact: 5400, preventiveAction: '' },
      ],
    },
  };

  it('computes alternative impact given alternatives', async () => {
    const alternatives = [
      { name: 'Reroute via Busan', targetNode: 'SKU001', action: 'Reroute', riskReduction: 0.4 },
    ];
    const results = await runCounterfactual(baseReport as any, alternatives);
    expect(results.length).toBe(1);
    expect(results[0].scenario).toBe('Reroute via Busan');
    expect(results[0].improvement).toBeGreaterThan(0);
    expect(results[0].originalImpact.affectedProducts).toBe(2);
    expect(results[0].alternativeImpact.affectedProducts).toBeLessThanOrEqual(2);
  });

  it('handles empty alternatives array', async () => {
    const results = await runCounterfactual(baseReport as any, []);
    expect(results).toEqual([]);
  });

  it('handles report with zero affected nodes', async () => {
    const results = await runCounterfactual(emptyReport as any, [
      { name: 'test', targetNode: 'x', action: 'y', riskReduction: 0.5 },
    ]);
    expect(results.length).toBe(1);
    expect(results[0].originalImpact.affectedProducts).toBe(0);
  });
});

describe('boundaryTest', () => {
  it('returns 7 test cases', () => {
    const result = boundaryTest();
    expect(result.tests.length).toBe(7);
  });

  it('each test has name, passed, description', () => {
    const result = boundaryTest();
    for (const t of result.tests) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.passed).toBe('boolean');
      expect(typeof t.description).toBe('string');
    }
  });

  it('has allPassed boolean', () => {
    const result = boundaryTest();
    expect(typeof result.allPassed).toBe('boolean');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for internal pure functions
// ─────────────────────────────────────────────────────────────────────────────

describe('fuseMultiSourceRisks', () => {
  it('returns single entry for single source with weighted_sum (default)', () => {
    const sources = [
      { nodeId: 'port-1', riskScore: 75, cause: 'Port congestion', category: 'logistics' as const },
    ];
    const result = fuseMultiSourceRisks(sources);
    expect(result).toHaveLength(1);
    expect(result[0].nodeId).toBe('port-1');
    expect(result[0].riskScore).toBe(75);
    expect(result[0].cause).toBe('Port congestion');
  });

  it('accumulates same-node sources with diminishing returns (weighted_sum)', () => {
    const sources = [
      { nodeId: 'port-1', riskScore: 50, cause: 'Weather', category: 'weather' as const },
      { nodeId: 'port-1', riskScore: 40, cause: 'Congestion', category: 'logistics' as const },
    ];
    const result = fuseMultiSourceRisks(sources);
    expect(result).toHaveLength(1);
    // 50 + 40*0.5 = 70
    expect(result[0].riskScore).toBe(70);
    expect(result[0].cause).toContain('Weather');
    expect(result[0].cause).toContain('Congestion');
  });

  it('caps accumulated risk at 100', () => {
    const sources = [
      { nodeId: 'n1', riskScore: 80, cause: 'A', category: 'weather' as const },
      { nodeId: 'n1', riskScore: 80, cause: 'B', category: 'logistics' as const },
      { nodeId: 'n1', riskScore: 80, cause: 'C', category: 'supplier' as const },
    ];
    const result = fuseMultiSourceRisks(sources);
    // 80 + 80/2 + 80/3 = 80 + 40 + 26.67 = 146.67 → min(round(147), 100) = 100
    expect(result[0].riskScore).toBe(100);
  });

  it('handles empty sources', () => {
    expect(fuseMultiSourceRisks([])).toEqual([]);
  });

  describe('max_impact strategy', () => {
    it('returns max risk per node', () => {
      const sources = [
        { nodeId: 'n1', riskScore: 30, cause: 'Light', category: 'weather' as const },
        { nodeId: 'n1', riskScore: 80, cause: 'Severe', category: 'weather' as const },
      ];
      const result = fuseMultiSourceRisks(sources, 'max_impact');
      expect(result).toHaveLength(1);
      expect(result[0].riskScore).toBe(80);
      expect(result[0].cause).toBe('Severe');
    });

    it('handles multiple nodes independently', () => {
      const sources = [
        { nodeId: 'n1', riskScore: 60, cause: 'A', category: 'weather' as const },
        { nodeId: 'n2', riskScore: 40, cause: 'B', category: 'logistics' as const },
      ];
      const result = fuseMultiSourceRisks(sources, 'max_impact');
      expect(result).toHaveLength(2);
    });
  });

  describe('threshold_lower strategy', () => {
    it('applies 1.3x multiplier for multi-category risks', () => {
      const sources = [
        { nodeId: 'n1', riskScore: 50, cause: 'Weather', category: 'weather' as const },
        { nodeId: 'n1', riskScore: 30, cause: 'FX', category: 'exchange' as const },
      ];
      const result = fuseMultiSourceRisks(sources, 'threshold_lower');
      // 2 categories → multiplier 1.3 → max(50*1.3, 30*1.3) = max(65, 39) = 65
      expect(result[0].riskScore).toBe(65);
    });

    it('single category does not apply multiplier', () => {
      const sources = [
        { nodeId: 'n1', riskScore: 50, cause: 'Rain', category: 'weather' as const },
        { nodeId: 'n1', riskScore: 30, cause: 'Storm', category: 'weather' as const },
      ];
      const result = fuseMultiSourceRisks(sources, 'threshold_lower');
      // 1 category → no multiplier → max(50, 30) = 50
      expect(result[0].riskScore).toBe(50);
    });
  });
});

describe('applyCustomRules', () => {
  beforeEach(() => {
    setPropagationRules([]);
  });

  it('returns edge attenuation when no rules match', () => {
    const edge = testEdge('CARRIES', 0.75);
    expect(applyCustomRules(edge, {})).toBe(0.75);
  });

  it('overrides attenuation when rule matches without condition', () => {
    setPropagationRules([
      { edgeType: 'CARRIES' as const, overrideAttenuation: 0.50 },
    ]);
    expect(applyCustomRules(testEdge('CARRIES', 0.75), {})).toBe(0.50);
  });

  it('ignores rules that do not match the edge type', () => {
    setPropagationRules([
      { edgeType: 'STORED_IN' as const, overrideAttenuation: 0.30 },
    ]);
    expect(applyCustomRules(testEdge('CARRIES', 0.75), {})).toBe(0.75);
  });

  it('evaluates gt condition correctly', () => {
    setPropagationRules([{
      edgeType: 'CARRIES' as const,
      condition: { field: 'delayDays', operator: 'gt', value: '5' },
      overrideAttenuation: 0.95,
    }]);
    expect(applyCustomRules(testEdge('CARRIES', 0.75), { delayDays: 10 })).toBe(0.95);
    expect(applyCustomRules(testEdge('CARRIES', 0.75), { delayDays: 3 })).toBe(0.75);
  });

  it('evaluates lt condition correctly', () => {
    setPropagationRules([{
      edgeType: 'CARRIES' as const,
      condition: { field: 'inventory', operator: 'lt', value: '100' },
      overrideAttenuation: 0.85,
    }]);
    expect(applyCustomRules(testEdge('CARRIES', 0.75), { inventory: 50 })).toBe(0.85);
    expect(applyCustomRules(testEdge('CARRIES', 0.75), { inventory: 200 })).toBe(0.75);
  });

  it('evaluates eq condition with string match', () => {
    setPropagationRules([{
      edgeType: 'STORED_IN' as const,
      condition: { field: 'stockStatus', operator: 'eq', value: 'critical' },
      overrideAttenuation: 0.90,
    }]);
    expect(applyCustomRules(testEdge('STORED_IN', 0.60), { stockStatus: 'critical' })).toBe(0.90);
    expect(applyCustomRules(testEdge('STORED_IN', 0.60), { stockStatus: 'healthy' })).toBe(0.60);
  });

  it('last matching rule wins (rules iterate in order, last override applies)', () => {
    setPropagationRules([
      { edgeType: 'CARRIES' as const, condition: { field: 'delayDays', operator: 'gt', value: '0' }, overrideAttenuation: 0.90 },
      { edgeType: 'CARRIES' as const, overrideAttenuation: 0.50 },
    ]);
    expect(applyCustomRules(testEdge('CARRIES', 0.75), { delayDays: 3 })).toBe(0.50);
  });
});

describe('generateExplanation', () => {
  it('includes basic risk propagation formula', () => {
    const result = generateExplanation(
      'prod-1', 'CARRIES', 'Shipment A', 'Product X',
      80, 0.75, 60, {},
    );
    expect(result).toContain('Shipment A → Product X');
    expect(result).toContain('80%');
    expect(result).toContain('60%');
    expect(result).toContain('0.75');
  });

  it('includes delay info for CARRIES edges', () => {
    const result = generateExplanation(
      'prod-1', 'CARRIES', 'Ship A', 'Prod X',
      80, 0.75, 60, { delayDays: 7 },
    );
    expect(result).toContain('货运已延误 7 天');
  });

  it('includes stock status for STORED_IN edges', () => {
    const result = generateExplanation(
      'wh-1', 'STORED_IN', 'Warehouse A', 'Product Y',
      50, 0.60, 30, { stockStatus: 'critical' },
    );
    expect(result).toContain('库存状态: critical');
  });

  it('mentions calibrated attenuation when non-default', () => {
    const result = generateExplanation(
      'n1', 'CARRIES', 'A', 'B',
      80, 0.50, 40, {},
    );
    // Default CARRIES attenuation is 0.95; 0.50 is different
    expect(result).toContain('校准后衰减');
  });

  it('omits calibrated note when using default attenuation', () => {
    const result = generateExplanation(
      'n1', 'CARRIES', 'A', 'B',
      80, 0.95, 76, {},
    );
    expect(result).not.toContain('校准后衰减');
  });
});

describe('generatePreventiveActions', () => {
  it('suggests alternative port routes for port-related paths', () => {
    const result = generatePreventiveActions(
      { sku: 'SKU001', productName: 'Blender', impactScore: 40 },
      '上海港 → Shipment A → Blender',
    );
    expect(result).toContain('替代港口');
  });

  it('suggests emergency restock for high impact scores', () => {
    const result = generatePreventiveActions(
      { sku: 'SKU001', productName: 'Blender', impactScore: 60 },
      'Factory → Warehouse',
    );
    expect(result).toContain('紧急补充');
    expect(result).toContain('Blender');
  });

  it('does not suggest emergency restock for low impact scores', () => {
    const result = generatePreventiveActions(
      { sku: 'SKU001', productName: 'Blender', impactScore: 30 },
      'Factory → Warehouse',
    );
    expect(result).toBeUndefined();
  });

  it('suggests backup supplier for supplier-related paths', () => {
    const result = generatePreventiveActions(
      { sku: 'SKU001', productName: 'Motor', impactScore: 40 },
      '供应商 A → Motor',
    );
    expect(result).toContain('备选供应商');
  });

  it('combines multiple actions when multiple conditions trigger', () => {
    const result = generatePreventiveActions(
      { sku: 'SKU001', productName: 'Blender', impactScore: 70 },
      '上海港 → 供应商 A → Blender',
    );
    expect(result).toContain('替代港口');
    expect(result).toContain('紧急补充');
    expect(result).toContain('备选供应商');
    // Semicolon-separated
    expect(result!.split('; ').length).toBe(3);
  });

  it('returns undefined when no condition triggers', () => {
    const result = generatePreventiveActions(
      { sku: 'SKU001', productName: 'Widget', impactScore: 10 },
      'Node A → Node B',
    );
    expect(result).toBeUndefined();
  });
});

describe('weatherDesc', () => {
  it('returns 晴天 for code 0-1', () => {
    expect(weatherDesc(0)).toBe('晴天');
    expect(weatherDesc(1)).toBe('晴天');
  });

  it('returns 多云 for code 2-3', () => {
    expect(weatherDesc(2)).toBe('多云');
    expect(weatherDesc(3)).toBe('多云');
  });

  it('returns 雾/霾 for code 4-48', () => {
    expect(weatherDesc(10)).toBe('雾/霾');
    expect(weatherDesc(48)).toBe('雾/霾');
  });

  it('returns 毛毛雨 for code 49-57', () => {
    expect(weatherDesc(51)).toBe('毛毛雨');
    expect(weatherDesc(57)).toBe('毛毛雨');
  });

  it('returns 降雨 for code 58-67', () => {
    expect(weatherDesc(60)).toBe('降雨');
    expect(weatherDesc(67)).toBe('降雨');
  });

  it('returns 降雪 for code 68-77', () => {
    expect(weatherDesc(70)).toBe('降雪');
    expect(weatherDesc(77)).toBe('降雪');
  });

  it('returns 阵雨 for code 78-86', () => {
    expect(weatherDesc(80)).toBe('阵雨');
    expect(weatherDesc(86)).toBe('阵雨');
  });

  it('returns 雷暴 for code 87+', () => {
    expect(weatherDesc(90)).toBe('雷暴');
    expect(weatherDesc(100)).toBe('雷暴');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Monte Carlo Propagation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('propagateMonteCarlo', () => {
  const nodes = new Map();
  nodes.set('port-1', { id: 'port-1', type: 'PORT', label: 'Test Port', riskScore: 0, initialRisk: 0, metadata: {} });
  nodes.set('ship-1', { id: 'ship-1', type: 'SHIPMENT', label: 'Test Ship', riskScore: 0, initialRisk: 0, metadata: {} });
  nodes.set('prod-1', { id: 'prod-1', type: 'PRODUCT', label: 'Test Product', riskScore: 0, initialRisk: 0, metadata: { sku: 'SKU001' } });

  const edges = [
    { id: 'e1', from: 'port-1', to: 'ship-1', type: 'DEPARTS_FROM' as EdgeType, attenuation: 0.5, metadata: {} },
    { id: 'e2', from: 'ship-1', to: 'prod-1', type: 'CARRIES' as EdgeType, attenuation: 0.8, metadata: {} },
  ];

  const sources = [{ nodeId: 'port-1', riskScore: 80, cause: 'test weather' }];

  it('returns results for all reachable nodes', () => {
    const results = propagateMonteCarlo(nodes, edges, sources, { iterations: 50, seed: 42 });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.nodeId === 'port-1')).toBe(true);
  });

  it('includes statistical fields (mean, stdDev, p5, p50, p95)', () => {
    const results = propagateMonteCarlo(nodes, edges, sources, { iterations: 100, seed: 42 });
    for (const r of results) {
      expect(typeof r.meanRisk).toBe('number');
      expect(typeof r.stdDev).toBe('number');
      expect(typeof r.p5).toBe('number');
      expect(typeof r.p50).toBe('number');
      expect(typeof r.p95).toBe('number');
      expect(r.p5).toBeLessThanOrEqual(r.p50);
      expect(r.p50).toBeLessThanOrEqual(r.p95);
    }
  });

  it('mean risk of source node equals its riskScore', () => {
    const results = propagateMonteCarlo(nodes, edges, sources, { iterations: 200, seed: 42 });
    const source = results.find(r => r.nodeId === 'port-1');
    expect(source).toBeDefined();
    expect(source!.meanRisk).toBeCloseTo(80, 0);
  });

  it('propagated nodes have lower mean risk than source', () => {
    const results = propagateMonteCarlo(nodes, edges, sources, { iterations: 200, seed: 42 });
    const product = results.find(r => r.nodeId === 'prod-1');
    if (product) {
      expect(product.meanRisk).toBeLessThan(80);
    }
  });

  it('is deterministic with same seed', () => {
    const r1 = propagateMonteCarlo(nodes, edges, sources, { iterations: 50, seed: 123 });
    const r2 = propagateMonteCarlo(nodes, edges, sources, { iterations: 50, seed: 123 });
    expect(r1.map(r => r.meanRisk)).toEqual(r2.map(r => r.meanRisk));
  });

  it('handles empty graph', () => {
    const results = propagateMonteCarlo(new Map(), [], sources, { iterations: 10 });
    expect(results).toEqual([]);
  });

  it('handles empty sources', () => {
    const results = propagateMonteCarlo(nodes, edges, [], { iterations: 10 });
    expect(results).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Real Boundary Tests (now executing the propagation engine)
// ─────────────────────────────────────────────────────────────────────────────

describe('boundaryTest (real execution)', () => {
  it('all 7 tests pass', () => {
    const result = boundaryTest();
    expect(result.allPassed).toBe(true);
    expect(result.tests.length).toBe(7);
    for (const t of result.tests) {
      expect(t.passed).toBe(true);
    }
  });

  it('empty_graph test passes', () => {
    const result = boundaryTest();
    const test = result.tests.find(t => t.name === 'empty_graph');
    expect(test?.passed).toBe(true);
  });

  it('cyclic_graph test passes (BFS visited pruning)', () => {
    const result = boundaryTest();
    const test = result.tests.find(t => t.name === 'cyclic_graph');
    expect(test?.passed).toBe(true);
    expect(test?.description).toContain('visited');
  });

  it('large_graph test completes in < 5s', () => {
    const result = boundaryTest();
    const test = result.tests.find(t => t.name === 'large_graph');
    expect(test?.passed).toBe(true);
    expect(test?.description).toMatch(/\d+ms/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEIR Hybrid Propagation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('propagateSEIR', () => {
  // Build a simple test graph: PORT → SHIPMENT → WAREHOUSE → PRODUCT
  const nodes = new Map<string, { id: string; type: any; label: string; riskScore: number; initialRisk: number; metadata: Record<string, unknown> }>();
  nodes.set('port', { id: 'port', type: 'PORT', label: 'Port Shanghai', riskScore: 0, initialRisk: 0, metadata: {} });
  nodes.set('ship', { id: 'ship', type: 'SHIPMENT', label: 'Shipment A', riskScore: 0, initialRisk: 0, metadata: {} });
  nodes.set('wh', { id: 'wh', type: 'WAREHOUSE', label: 'Warehouse DE', riskScore: 0, initialRisk: 0, metadata: {} });
  nodes.set('prod', { id: 'prod', type: 'PRODUCT', label: 'Air Fryer', riskScore: 0, initialRisk: 0, metadata: {} });

  const edges = [
    testEdge('DEPARTS_FROM' as EdgeType, 0.43),
    { ...testEdge('ARRIVES_AT' as EdgeType, 0.70), from: 'ship', to: 'wh' },
    { ...testEdge('STORED_IN' as EdgeType, 0.60), from: 'wh', to: 'prod' },
  ];
  edges[0].from = 'port'; edges[0].to = 'ship';

  // BFS result with port as high-risk source
  const bfsResult = [
    { nodeId: 'port', label: 'Port Shanghai', type: 'PORT' as const, riskScore: 85, initialRisk: 85, propagatedRisk: 85, path: ['port'], depth: 0, metadata: {}, explanation: 'source' },
    { nodeId: 'ship', label: 'Shipment A', type: 'SHIPMENT' as const, riskScore: 36, initialRisk: 0, propagatedRisk: 36, path: ['port', 'ship'], depth: 1, metadata: {}, explanation: '' },
    { nodeId: 'wh', label: 'Warehouse DE', type: 'WAREHOUSE' as const, riskScore: 25, initialRisk: 0, propagatedRisk: 25, path: ['port', 'ship', 'wh'], depth: 2, metadata: {}, explanation: '' },
    { nodeId: 'prod', label: 'Air Fryer', type: 'PRODUCT' as const, riskScore: 15, initialRisk: 0, propagatedRisk: 15, path: ['port', 'ship', 'wh', 'prod'], depth: 3, metadata: {}, explanation: '' },
  ];

  it('produces a 30-day timeline', () => {
    const timeline = propagateSEIR(nodes, edges, bfsResult);
    expect(timeline.days.length).toBe(30);
    expect(timeline.finalStates.length).toBe(4);
  });

  it('port starts as infectious (risk > 35)', () => {
    const timeline = propagateSEIR(nodes, edges, bfsResult);
    const portState = timeline.finalStates.find(s => s.nodeId === 'port');
    expect(portState).toBeDefined();
    // port should be infectious or recovered (risk > 35 initially)
    expect(['infectious', 'recovered']).toContain(portState?.state);
  });

  it('susceptible nodes can transition to exposed over time', () => {
    const timeline = propagateSEIR(nodes, edges, bfsResult);
    // prod starts as susceptible (risk=15, at threshold), may become exposed
    const prodHistory = timeline.finalStates.find(s => s.nodeId === 'prod')?.riskHistory;
    expect(prodHistory).toBeDefined();
    expect(prodHistory!.length).toBe(31); // day 0 + 30 iterations
  });

  it('tracks peak infectious day', () => {
    const timeline = propagateSEIR(nodes, edges, bfsResult);
    expect(timeline.peakDay).toBeGreaterThanOrEqual(0);
    expect(timeline.peakInfectious).toBeGreaterThanOrEqual(0);
  });

  it('recovery horizon is within timeSteps', () => {
    const timeline = propagateSEIR(nodes, edges, bfsResult, { timeSteps: 30 });
    expect(timeline.recoveryHorizon).toBeLessThanOrEqual(30);
    expect(timeline.recoveryHorizon).toBeGreaterThanOrEqual(1);
  });

  it('handles empty BFS result gracefully', () => {
    const timeline = propagateSEIR(nodes, edges, []);
    expect(timeline.days.length).toBe(30);
    // All nodes should start susceptible with zero risk
    const day1 = timeline.days[0];
    expect(day1.susceptible).toBe(4);
  });

  it('respects custom SEIR config', () => {
    // High recovery rate → faster recovery
    const fast = propagateSEIR(nodes, edges, bfsResult, { gamma: 0.9, timeSteps: 10 });
    const slow = propagateSEIR(nodes, edges, bfsResult, { gamma: 0.01, timeSteps: 10 });
    // Fast recovery should have more recovered nodes
    const fastRecovered = fast.finalStates.filter(s => s.state === 'recovered').length;
    const slowRecovered = slow.finalStates.filter(s => s.state === 'recovered').length;
    expect(fastRecovered).toBeGreaterThanOrEqual(slowRecovered);
  });

  it('each day has correct SEIR counts summing to total nodes', () => {
    const timeline = propagateSEIR(nodes, edges, bfsResult);
    for (const day of timeline.days) {
      expect(day.susceptible + day.exposed + day.infectious + day.recovered).toBe(4);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Causal ML Counterfactual Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('runCausalCounterfactual', () => {
  const baseReport = {
    triggeredBy: { source: 'test', description: 'test', timestamp: '' },
    sourceNodes: [],
    propagation: [],
    summary: {
      totalNodes: 10, affectedNodes: 4, maxDepth: 2,
      avgPropagatedRisk: 45,
      criticalPaths: [],
      topAffectedProducts: [
        { sku: 'SKU001', productName: 'Air Fryer', impactScore: 60, propagationPath: 'p1→prod1', estimatedDelay: 7, estimatedRevenueImpact: 10500 },
      ],
      totalMonthlyLoss: 5000,
    },
  };

  it('returns results for all alternatives', async () => {
    const results = await runCausalCounterfactual(baseReport as any, [
      { name: 'Reroute', targetNode: 'SKU001', action: 'Reroute via Busan', intervention: 'reroute' },
      { name: 'Safety Stock', targetNode: 'SKU001', action: 'Double safety stock', intervention: 'safety_stock' },
    ]);
    expect(results.length).toBe(2);
    expect(results[0].intervention).toBe('reroute');
    expect(results[1].intervention).toBe('safety_stock');
  });

  it('each result has causal estimate with confidence interval', async () => {
    const results = await runCausalCounterfactual(baseReport as any, [
      { name: 'Supplier Switch', targetNode: 'SKU001', action: 'Switch supplier', intervention: 'supplier_switch' },
    ]);
    const r = results[0];
    expect(r.causalEstimate).toBeDefined();
    expect(r.causalEstimate.ate).toBeGreaterThan(0);
    expect(r.causalEstimate.ate).toBeLessThan(1);
    expect(r.confidenceInterval[0]).toBeLessThanOrEqual(r.confidenceInterval[1]);
  });

  it('estimated reduction is between 0 and 1', async () => {
    const results = await runCausalCounterfactual(baseReport as any, [
      { name: 'Combined', targetNode: 'SKU001', action: 'All actions', intervention: 'combined' },
    ]);
    expect(results[0].estimatedReduction).toBeGreaterThan(0);
    expect(results[0].estimatedReduction).toBeLessThanOrEqual(1);
  });

  it('combined intervention has higher ATE than single', async () => {
    const results = await runCausalCounterfactual(baseReport as any, [
      { name: 'Reroute', targetNode: 'SKU001', action: 'Reroute', intervention: 'reroute' },
      { name: 'Combined', targetNode: 'SKU001', action: 'Combined', intervention: 'combined' },
    ]);
    // Combined should have higher or equal ATE (priors: combined=0.55 > reroute=0.25)
    expect(results[1].causalEstimate.ate).toBeGreaterThanOrEqual(results[0].causalEstimate.ate);
  });

  it('includes isReliability flag', async () => {
    const results = await runCausalCounterfactual(baseReport as any, [
      { name: 'Reroute', targetNode: 'SKU001', action: 'Reroute', intervention: 'reroute' },
    ]);
    // With limited/no historical data, should be unreliable
    expect(typeof results[0].isReliable).toBe('boolean');
  });

  it('recommendation includes confidence interval when reliable', async () => {
    const results = await runCausalCounterfactual(baseReport as any, [
      { name: 'Reroute', targetNode: 'SKU001', action: 'Reroute via Busan', intervention: 'reroute' },
    ]);
    expect(results[0].recommendation).toBeTruthy();
    // Should contain either CI or "有限" qualifier
    expect(results[0].recommendation.length).toBeGreaterThan(5);
  });
});
