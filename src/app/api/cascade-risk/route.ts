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
import { db } from '@/lib/db';
import { withErrorHandler, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import {
  getCascadeRisk,
  calibrateAttenuationFactors,
  backtest,
  sensitivityAnalysis,
  boundaryTest,
  propagateSEIR,
} from '@/lib/services/cascade-risk.service';
import { runDeepCounterfactual } from '@/lib/engine';
import type { CounterfactualQuery } from '@/lib/engine';
import {
  getRiskDashboard,
  getRiskMatrix,
  getRiskMitigations,
  getRiskAlerts,
  runRiskSimulation,
} from '@/lib/services/risk.service';
import { createAuditLog } from '@/lib/services/audit.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
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
      const includeCausal = searchParams.get('includeCausal') !== 'false';
      const forceCalibration = searchParams.get('forceCalibration') === 'true';

      const validScenarios = [
        'weather_disruption',
        'exchange_shock',
        'supplier_failure',
        'port_congestion',
        'tariff_escalation',
        'commodity_shock',
        'cbam_enforcement',
        'competitor_pressure',
        'auto',
      ] as const;
      if (!validScenarios.includes(scenario as typeof validScenarios[number])) {
        throw new AppError(`无效场景: ${scenario}`, 400);
      }

      const report = await getCascadeRisk({
        scenario: scenario as 'weather_disruption' | 'exchange_shock' | 'supplier_failure' | 'port_congestion' | 'tariff_escalation' | 'commodity_shock' | 'cbam_enforcement' | 'competitor_pressure' | 'auto',
        sourcePort, sourceSupplier, fusionStrategy,
        includeForwardProjection, includeCounterfactuals, forceCalibration,
      });

      // Strip causal data if not requested (to keep response size small)
      if (!includeCausal && report) {
        delete (report as any).causalEdges;
        delete (report as any).causalSummary;
      }
      // Keep SEIR available; only causal payload should be removed by this flag.
      if (!includeCausal && report) {
        delete (report as any).causalCounterfactuals;
      }

      return NextResponse.json({ success: true, ...report });
    }

    case 'dashboard': {
      const result = await getRiskDashboard();
      return NextResponse.json(result);
    }

    case 'matrix': {
      const result = await getRiskMatrix();
      return NextResponse.json(result);
    }

    case 'mitigation': {
      const result = await getRiskMitigations();
      return NextResponse.json(result);
    }

    case 'alerts': {
      const result = await getRiskAlerts();
      return NextResponse.json(result);
    }

    case 'simulation': {
      const scenario = searchParams.get('scenario') || 'supply_disruption';
      try {
        const result = await runRiskSimulation(scenario);
        await createAuditLog({
          action: 'SIMULATE',
          entity: 'forecast',
          details: { scenario, scenarioName: result.scenarioName },
        });
        return NextResponse.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知场景';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    default:
      throw new AppError(`未知操作: ${action}。支持: analyze, calibrate, backtest, sensitivity, boundary, dashboard, matrix, mitigation, alerts, simulation`, 400);
  }
}));

/**
 * POST /api/cascade-risk
 *
 * Counterfactual query: "what if we change one node/edge?"
 *
 * Body:
 *   { action: 'counterfactual', intervention: 'switch_supplier'|'add_safety_stock'|'reroute_shipment',
 *     target: 'nodeId', newValue: { ... } }
 *
 * Returns baseline vs intervened comparison.
 */
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const body = await request.json().catch(() => ({}));
  const { action, intervention, target, newValue } = body;

  if (action !== 'counterfactual') {
    throw new AppError(`未知操作: ${action}。支持: counterfactual`, 400);
  }

  // Run a fresh baseline analysis
  const originalReport = await getCascadeRisk({ scenario: 'auto' });

  const query: CounterfactualQuery = {
    intervention: intervention || 'switch_supplier',
    target: target || '',
    newValue: newValue || {},
  };

  const result = await runDeepCounterfactual(originalReport, query);

  // Log the counterfactual query
  try {
    await db.auditLog.create({
      data: {
        action: 'ANALYZE' as any,
        entity: 'cascade-risk' as any,
        userId: 'system',
        userName: '因果推理引擎',
        severity: 'info',
        details: {
          subAction: 'counterfactual',
          intervention: query.intervention,
          target: query.target,
          delta: result.delta,
          explanation: result.explanation,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch { /* non-critical */ }

  return NextResponse.json({
    success: true,
    action: 'counterfactual',
    intervention: query.intervention,
    target: query.target,
    baseline: result.baseline,
    intervened: result.intervened,
    delta: result.delta,
    explanation: result.explanation,
  });
}));
