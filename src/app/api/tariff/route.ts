/**
 * Tariff API — Dynamic tariff computation + scenario simulation
 * GET /api/tariff?action=overview
 * GET /api/tariff?action=compute&category=厨房电器&countryCode=US&sellingPrice=39.99
 * GET /api/tariff?action=simulate&scenario=US Section 301 escalation
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { computeTariff, getTariffOverview, simulateTariffScenario, TARIFF_SCENARIOS } from '@/lib/services/tariff.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'overview';

  switch (action) {
    case 'overview': {
      const data = await getTariffOverview();
      return NextResponse.json({ success: true, ...data, availableScenarios: TARIFF_SCENARIOS.map(s => ({ name: s.name, description: s.description })) });
    }

    case 'compute': {
      const category = searchParams.get('category');
      const subCategory = searchParams.get('subCategory') || undefined;
      const countryCode = searchParams.get('countryCode');
      const sellingPrice = parseFloat(searchParams.get('sellingPrice') || '0');
      if (!category || !countryCode) throw new AppError('缺少 category 或 countryCode', 422);
      const result = await computeTariff({ category, subCategory, countryCode, sellingPrice });
      return NextResponse.json({ success: true, ...result });
    }

    case 'simulate': {
      const scenario = searchParams.get('scenario');
      if (!scenario) throw new AppError(`缺少 scenario。可用: ${TARIFF_SCENARIOS.map(s => s.name).join(', ')}`, 422);
      const result = await simulateTariffScenario(scenario);
      return NextResponse.json({ success: true, ...result });
    }

    case 'scenarios': {
      return NextResponse.json({ scenarios: TARIFF_SCENARIOS });
    }

    default:
      throw new AppError(`未知操作: ${action}`, 400);
  }
}));
