/**
 * E2E integration tests for cascade-risk engine.
 * Tests the full risk pipeline: detection → fusion → propagation → report.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sensitivityAnalysis,
  runCounterfactual,
  boundaryTest,
  fuseMultiSourceRisks,
  applyCustomRules,
  generateExplanation,
  generatePreventiveActions,
  weatherDesc,
  setPropagationRules,
} from './cascade-risk.service';

describe('sensitivityAnalysis', () => {
  const baseAttenuation = {
    DEPARTS_FROM: 0.85,
    ARRIVES_AT: 0.70,
    CARRIES: 0.75,
    STORED_IN: 0.60,
    SUPPLIED_BY: 0.65,
  };

  const samplePropagation = [
    { nodeId: 'n1', label: 'Port Shanghai', type: 'PORT', riskScore: 80, initialRisk: 80, propagatedRisk: 68, path: ['shanghai'], depth: 0, metadata: {} },
    { nodeId: 'n2', label: 'Shipment A', type: 'SHIPMENT', riskScore: 60, initialRisk: 0, propagatedRisk: 51, path: ['shanghai', 'ship-a'], depth: 1, metadata: {} },
  ] as Record<string, unknown>[];

  it('returns one result per edge type', () => {
    const results = sensitivityAnalysis({ baseAttenuation, propagation: samplePropagation as unknown as Record<string, unknown>[] });
    expect(results.length).toBe(Object.keys(baseAttenuation).length);
  });

  it('each result contains parameter and perturbations array', () => {
    const results = sensitivityAnalysis({ baseAttenuation, propagation: samplePropagation as unknown as Record<string, unknown>[] });
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
    const results = sensitivityAnalysis({ baseAttenuation: {} as Record<string, number>, propagation: samplePropagation as any });
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
    const edge = { type: 'CARRIES' as const, attenuation: 0.75 };
    expect(applyCustomRules(edge, {})).toBe(0.75);
  });

  it('overrides attenuation when rule matches without condition', () => {
    setPropagationRules([
      { edgeType: 'CARRIES' as const, overrideAttenuation: 0.50 },
    ]);
    expect(applyCustomRules({ type: 'CARRIES' as const, attenuation: 0.75 }, {})).toBe(0.50);
  });

  it('ignores rules that do not match the edge type', () => {
    setPropagationRules([
      { edgeType: 'STORED_IN' as const, overrideAttenuation: 0.30 },
    ]);
    expect(applyCustomRules({ type: 'CARRIES' as const, attenuation: 0.75 }, {})).toBe(0.75);
  });

  it('evaluates gt condition correctly', () => {
    setPropagationRules([{
      edgeType: 'CARRIES' as const,
      condition: { field: 'delayDays', operator: 'gt', value: '5' },
      overrideAttenuation: 0.95,
    }]);
    const edge = { type: 'CARRIES' as const, attenuation: 0.75 };
    expect(applyCustomRules(edge, { delayDays: 10 })).toBe(0.95);
    expect(applyCustomRules(edge, { delayDays: 3 })).toBe(0.75);
  });

  it('evaluates lt condition correctly', () => {
    setPropagationRules([{
      edgeType: 'CARRIES' as const,
      condition: { field: 'inventory', operator: 'lt', value: '100' },
      overrideAttenuation: 0.85,
    }]);
    expect(applyCustomRules({ type: 'CARRIES' as const, attenuation: 0.75 }, { inventory: 50 })).toBe(0.85);
    expect(applyCustomRules({ type: 'CARRIES' as const, attenuation: 0.75 }, { inventory: 200 })).toBe(0.75);
  });

  it('evaluates eq condition with string match', () => {
    setPropagationRules([{
      edgeType: 'STORED_IN' as const,
      condition: { field: 'stockStatus', operator: 'eq', value: 'critical' },
      overrideAttenuation: 0.90,
    }]);
    expect(applyCustomRules({ type: 'STORED_IN' as const, attenuation: 0.60 }, { stockStatus: 'critical' })).toBe(0.90);
    expect(applyCustomRules({ type: 'STORED_IN' as const, attenuation: 0.60 }, { stockStatus: 'healthy' })).toBe(0.60);
  });

  it('last matching rule wins (rules iterate in order, last override applies)', () => {
    setPropagationRules([
      { edgeType: 'CARRIES' as const, condition: { field: 'delayDays', operator: 'gt', value: '0' }, overrideAttenuation: 0.90 },
      { edgeType: 'CARRIES' as const, overrideAttenuation: 0.50 },
    ]);
    // Both rules match; the second (unconditional) overrides the first
    expect(applyCustomRules({ type: 'CARRIES' as const, attenuation: 0.75 }, { delayDays: 3 })).toBe(0.50);
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
