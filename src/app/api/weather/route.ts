/**
 * Weather API — Open-Meteo real-time port weather data
 * GET /api/weather          → all ports weather
 * GET /api/weather?action=summary → lightweight dashboard summary
 * GET /api/weather?action=marine&fromLat=31&fromLon=121&toLat=33&toLon=-118 → marine conditions
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import {
  getAllPortsWeather,
  getPortWeatherSummary,
  getRouteMarineConditions,
} from '@/lib/services/weather.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'all';

  switch (action) {
    case 'all': {
      const data = await getAllPortsWeather();
      return NextResponse.json(data);
    }

    case 'summary': {
      const data = await getPortWeatherSummary();
      return NextResponse.json(data);
    }

    case 'marine': {
      const fromLat = parseFloat(searchParams.get('fromLat') || '');
      const fromLon = parseFloat(searchParams.get('fromLon') || '');
      const toLat = parseFloat(searchParams.get('toLat') || '');
      const toLon = parseFloat(searchParams.get('toLon') || '');

      if ([fromLat, fromLon, toLat, toLon].some(isNaN)) {
        throw new AppError('缺少或无效的坐标参数 (fromLat, fromLon, toLat, toLon)', 422);
      }

      const data = await getRouteMarineConditions(fromLat, fromLon, toLat, toLon);
      return NextResponse.json(data);
    }

    default:
      throw new AppError(`未知操作: ${action}`, 400);
  }
}));
