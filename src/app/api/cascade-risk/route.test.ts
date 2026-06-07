import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-protection', () => ({
  withApiRateLimit: (handler: unknown) => handler,
}));

vi.mock('@/lib/db', () => ({
  db: {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  },
}));

vi.mock('@/lib/services/audit.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-service-1' }),
}));

vi.mock('@/lib/engine', () => ({
  runDeepCounterfactual: vi.fn(),
}));

vi.mock('@/lib/services/risk.service', () => ({
  getRiskDashboard: vi.fn(),
  getRiskMatrix: vi.fn(),
  getRiskMitigations: vi.fn(),
  getRiskAlerts: vi.fn(),
  runRiskSimulation: vi.fn(),
}));

vi.mock('@/lib/services/cascade-risk.service', () => ({
  getCascadeRisk: vi.fn(),
  calibrateAttenuationFactors: vi.fn(),
  backtest: vi.fn(),
  sensitivityAnalysis: vi.fn(),
  boundaryTest: vi.fn(),
  propagateSEIR: vi.fn(),
}));

import { GET } from './route';
import { getCascadeRisk } from '@/lib/services/cascade-risk.service';

const mockGetCascadeRisk = vi.mocked(getCascadeRisk);

function buildReport() {
  return {
    triggeredBy: { source: 'auto', description: 'test', timestamp: new Date().toISOString() },
    sourceNodes: [],
    propagation: [],
    seirTimeline: {
      peakDay: 4,
      peakInfectious: 3,
      recoveryHorizon: 12,
      days: [{ day: 0, susceptible: 5, exposed: 1, infectious: 0, recovered: 0 }],
    },
    causalEdges: [{ from: 'a', to: 'b', weight: 0.8 }],
    causalSummary: 'summary',
    causalCounterfactuals: [
      {
        scenario: '替代路线',
        intervention: 'reroute',
        estimatedReduction: 0.25,
        confidenceInterval: [0.2, 0.3],
        causalEstimate: { ate: 0.25, ci: [0.2, 0.3], pValue: 0.08, sampleSize: 3, method: 'prior' },
        recommendation: '可优先尝试',
        isReliable: false,
      },
    ],
    summary: {
      totalNodes: 10,
      affectedNodes: 2,
      maxDepth: 1,
      avgPropagatedRisk: 42,
      criticalPaths: [],
      topAffectedProducts: [],
      totalMonthlyLoss: 1200,
    },
  };
}

describe('/api/cascade-risk route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts advanced cascade scenarios exposed by the frontend', async () => {
    mockGetCascadeRisk.mockResolvedValue(buildReport() as any);

    const request = new NextRequest('http://localhost:3000/api/cascade-risk?scenario=commodity_shock');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockGetCascadeRisk).toHaveBeenCalledWith(expect.objectContaining({ scenario: 'commodity_shock' }));
  });

  it('keeps seirTimeline when includeCausal=false but strips causal fields', async () => {
    mockGetCascadeRisk.mockResolvedValue(buildReport() as any);

    const request = new NextRequest('http://localhost:3000/api/cascade-risk?scenario=auto&includeCausal=false');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.seirTimeline).toBeDefined();
    expect(json.causalCounterfactuals).toBeUndefined();
    expect(json.causalEdges).toBeUndefined();
    expect(json.causalSummary).toBeUndefined();
  });
});
