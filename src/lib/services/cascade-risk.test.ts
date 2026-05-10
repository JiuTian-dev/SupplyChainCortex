/**
 * E2E integration tests for cascade-risk engine.
 * Tests the full risk pipeline: detection → fusion → propagation → report.
 */

import { describe, it, expect } from 'vitest';
import {
  sensitivityAnalysis,
  runCounterfactual,
  boundaryTest,
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
      expect(r.perturbations.length).toBeGreaterThan(0);
    }
  });

  it('handles empty propagation', () => {
    const results = sensitivityAnalysis({ baseAttenuation, propagation: [] });
    for (const r of results) {
      expect(r.perturbations.length).toBeGreaterThan(0);
    }
  });

  it('handles empty baseAttenuation', () => {
    const results = sensitivityAnalysis({ baseAttenuation: {} as Record<string, number>, propagation: samplePropagation });
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
    const results = await runCounterfactual(baseReport, alternatives);
    expect(results.length).toBe(1);
    expect(results[0].scenario).toBe('Reroute via Busan');
    expect(results[0].improvement).toBeGreaterThan(0);
    expect(results[0].originalImpact.affectedProducts).toBe(2);
    expect(results[0].alternativeImpact.affectedProducts).toBeLessThanOrEqual(2);
  });

  it('handles empty alternatives array', async () => {
    const results = await runCounterfactual(baseReport, []);
    expect(results).toEqual([]);
  });

  it('handles report with zero affected nodes', async () => {
    const results = await runCounterfactual(emptyReport, [
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
