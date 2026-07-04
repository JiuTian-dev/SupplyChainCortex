import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-protection', () => ({
  withApiRateLimit: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth-helpers', () => ({
  optionalRequireAuth: vi.fn().mockResolvedValue(null),
  requireAdmin: vi.fn().mockResolvedValue(null),
  requireAuth: vi.fn().mockResolvedValue(null),
  getAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock('@/lib/services/tariff.service', () => ({
  computeTariff: vi.fn(),
  getTariffOverview: vi.fn(),
  simulateTariffScenario: vi.fn(),
  TARIFF_SCENARIOS: [
    {
      name: 'US Section 301 escalation',
      description: '美国对中国小家电关税从 7.5% → 25%',
      changes: [{ countryCode: 'US', newRate: 25, tradeAgreement: 'Section301-escalated' }],
    },
    {
      name: 'EU CBAM full enforcement',
      description: '欧盟碳边境税全面实施',
      changes: [{ countryCode: 'EU', newRate: 7.7, tradeAgreement: 'CBAM-full' }],
      cbamEnabled: true,
      cbamPhaseOutPct: 10,
    },
  ],
}));

import { GET } from './route';
import {
  computeTariff,
  getTariffOverview,
  simulateTariffScenario,
} from '@/lib/services/tariff.service';

const mockComputeTariff = vi.mocked(computeTariff);
const mockGetTariffOverview = vi.mocked(getTariffOverview);
const mockSimulateTariffScenario = vi.mocked(simulateTariffScenario);

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('/api/tariff route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('action=overview returns tariff overview with availableScenarios', async () => {
    mockGetTariffOverview.mockResolvedValue({
      countries: [{ code: 'US', name: 'United States', ruleCount: 5 }],
      tradeAgreements: [{ name: 'MFN', ruleCount: 10 }],
      highRateRules: [],
    });

    const request = makeRequest('/api/tariff?action=overview');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.countries).toHaveLength(1);
    expect(json.tradeAgreements).toHaveLength(1);
    expect(json.availableScenarios).toHaveLength(2);
    expect(json.availableScenarios[0]).toEqual({
      name: 'US Section 301 escalation',
      description: '美国对中国小家电关税从 7.5% → 25%',
    });
    expect(mockGetTariffOverview).toHaveBeenCalledTimes(1);
  });

  it('defaults to overview when no action provided', async () => {
    mockGetTariffOverview.mockResolvedValue({
      countries: [],
      tradeAgreements: [],
      highRateRules: [],
    });

    const request = makeRequest('/api/tariff');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.availableScenarios).toBeDefined();
    expect(mockGetTariffOverview).toHaveBeenCalledTimes(1);
  });

  it('action=compute with valid params returns tariff computation', async () => {
    mockComputeTariff.mockResolvedValue({
      rate: 25,
      rules: [],
      dutyAmount: 10.0,
    });

    const request = makeRequest(
      '/api/tariff?action=compute&category=厨房电器&countryCode=US&sellingPrice=39.99',
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.rate).toBe(25);
    expect(json.dutyAmount).toBe(10.0);
    expect(mockComputeTariff).toHaveBeenCalledWith({
      category: '厨房电器',
      subCategory: undefined,
      countryCode: 'US',
      sellingPrice: 39.99,
    });
  });

  it('action=compute missing category returns 422', async () => {
    const request = makeRequest('/api/tariff?action=compute&countryCode=US');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.error).toContain('category');
    expect(mockComputeTariff).not.toHaveBeenCalled();
  });

  it('action=compute missing countryCode returns 422', async () => {
    const request = makeRequest('/api/tariff?action=compute&category=厨房电器');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.error).toContain('countryCode');
    expect(mockComputeTariff).not.toHaveBeenCalled();
  });

  it('action=compute with subCategory passes it through', async () => {
    mockComputeTariff.mockResolvedValue({ rate: 7.5, rules: [], dutyAmount: 3.0 });

    const request = makeRequest(
      '/api/tariff?action=compute&category=厨房电器&subCategory=电饭煲&countryCode=US&sellingPrice=40',
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockComputeTariff).toHaveBeenCalledWith({
      category: '厨房电器',
      subCategory: '电饭煲',
      countryCode: 'US',
      sellingPrice: 40,
    });
  });

  it('action=compute without sellingPrice defaults to 0', async () => {
    mockComputeTariff.mockResolvedValue({ rate: 0, rules: [], dutyAmount: 0 });

    const request = makeRequest('/api/tariff?action=compute&category=厨房电器&countryCode=US');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockComputeTariff).toHaveBeenCalledWith(
      expect.objectContaining({ sellingPrice: 0 }),
    );
  });

  it('action=simulate with valid scenario returns simulation result', async () => {
    const simulationResult = {
      scenario: {
        name: 'US Section 301 escalation',
        description: 'desc',
        changes: [],
      },
      productImpacts: [],
      summary: {
        productsBelowMargin: 0,
        totalRevenueImpact: 0,
        worstAffected: 'N/A',
        recommendedActions: [],
      },
    };
    mockSimulateTariffScenario.mockResolvedValue(simulationResult);

    const request = makeRequest(
      '/api/tariff?action=simulate&scenario=US%20Section%20301%20escalation',
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.scenario).toBeDefined();
    expect(json.summary).toBeDefined();
    expect(mockSimulateTariffScenario).toHaveBeenCalledWith('US Section 301 escalation');
  });

  it('action=simulate missing scenario returns 422', async () => {
    const request = makeRequest('/api/tariff?action=simulate');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.error).toContain('scenario');
    expect(mockSimulateTariffScenario).not.toHaveBeenCalled();
  });

  it('action=scenarios returns scenarios list', async () => {
    const request = makeRequest('/api/tariff?action=scenarios');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scenarios).toHaveLength(2);
    expect(json.scenarios[0].name).toBe('US Section 301 escalation');
    expect(json.scenarios[1].name).toBe('EU CBAM full enforcement');
  });

  it('unknown action returns 400', async () => {
    const request = makeRequest('/api/tariff?action=unknown');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('未知操作');
    expect(json.error).toContain('unknown');
  });

  it('service error is handled by withErrorHandler and returns 500', async () => {
    mockGetTariffOverview.mockRejectedValue(new Error('DB connection failed'));

    const request = makeRequest('/api/tariff?action=overview');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain('DB connection failed');
  });
});
