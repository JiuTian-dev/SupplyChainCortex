/**
 * Cascade Risk API v2 — Supply Chain Cascading Risk Propagation
 *
 * GET /api/cascade-risk                                    → auto scenario
 * GET /api/cascade-risk?scenario=weather_disruption
 * GET /api/cascade-risk?scenario=port_congestion&sourcePort=洛杉矶港
 * GET /api/cascade-risk?scenario=exchange_shock&fusionStrategy=threshold_lower
 * GET /api/cascade-risk?scenario=auto&includeForwardProjection=true&includeCounterfactuals=true
 *
 * Validation endpoints:
 * GET /api/cascade-risk?action=calibrate                   → Phase 1: calibrate attenuation factors
 * GET /api/cascade-risk?action=backtest&days=30            → Phase 4: historical backtesting
 * GET /api/cascade-risk?action=sensitivity                 → Phase 4: sensitivity analysis
 * GET /api/cascade-risk?action=boundary                    → Phase 4: boundary tests
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import {
  getCascadeRisk,
  calibrateAttenuationFactors,
  backtest,
  sensitivityAnalysis,
  boundaryTest,
} from '@/lib/services/cascade-risk.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'analyze';

  switch (action) {
    case 'calibrate': {
      const result = await calibrateAttenuationFactors();
      return NextResponse.json({ success: true, ...result });
    }

    case 'backtest': {
      const days = parseInt(searchParams.get('days') || '30');
      if (days < 1 || days > 90) throw new AppError('days 必须在 1-90 之间', 400);
      const result = await backtest(days);
      return NextResponse.json({ success: true, ...result });
    }

    case 'sensitivity': {
      // Run a base analysis first, then analyze sensitivity
      const baseReport = await getCascadeRisk({ scenario: 'auto' });
      const result = sensitivityAnalysis({
        baseAttenuation: {
          DEPARTS_FROM: 0.85, ARRIVES_AT: 0.70, STORED_IN: 0.60,
          SUPPLIED_BY: 0.50, CARRIES: 0.75,
        },
        propagation: baseReport.propagation || [],
      });
      return NextResponse.json({ success: true, results: result });
    }

    case 'boundary': {
      const result = boundaryTest();
      return NextResponse.json({ success: true, ...result });
    }

    case 'analyze': {
      const scenario = (searchParams.get('scenario') as string) || 'auto';
      const sourcePort = searchParams.get('sourcePort') || undefined;
      const sourceSupplier = searchParams.get('sourceSupplier') || undefined;
      const fusionStrategy = (searchParams.get('fusionStrategy') as 'weighted_sum' | 'max_impact' | 'threshold_lower') || 'weighted_sum';
      const includeForwardProjection = searchParams.get('includeForwardProjection') !== 'false';
      const includeCounterfactuals = searchParams.get('includeCounterfactuals') !== 'false';
      const forceCalibration = searchParams.get('forceCalibration') === 'true';

      const validScenarios = ['weather_disruption', 'exchange_shock', 'supplier_failure', 'port_congestion', 'tariff_escalation', 'auto'];
      if (!validScenarios.includes(scenario)) {
        throw new AppError(`无效场景: ${scenario}`, 400);
      }

      const report = await getCascadeRisk({
        scenario: scenario as 'weather_disruption' | 'exchange_shock' | 'supplier_failure' | 'port_congestion' | 'auto',
        sourcePort, sourceSupplier, fusionStrategy,
        includeForwardProjection, includeCounterfactuals, forceCalibration,
      });
      return NextResponse.json({ success: true, ...report });
    }

    default:
      throw new AppError(`未知操作: ${action}。支持: analyze, calibrate, backtest, sensitivity, boundary`, 400);
  }
}));
