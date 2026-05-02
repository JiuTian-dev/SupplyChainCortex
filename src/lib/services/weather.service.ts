/**
 * Weather & Port Conditions Service — Open-Meteo API (free, no key required)
 * Base URL: https://api.open-meteo.com/v1
 *
 * Provides:
 *  - Current weather at major ports on shipping routes
 *  - Marine weather (wave height, wind speed) for route risk assessment
 *  - 7-day forecast for logistics planning
 */

import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PortWeather {
  port: string;
  country: string;
  coordinates: { lat: number; lon: number };
  current: {
    temperature: number;
    windSpeed: number;
    windDirection: number;
    weatherCode: number;
    visibility: number;
  };
  forecast: DayForecast[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DayForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  windSpeedMax: number;
  precipitation: number;
  weatherCode: number;
}

export interface MarineConditions {
  waveHeight: number;
  waveDirection: number;
  windSpeed: number;
  riskSummary: string;
}

export interface WeatherAlert {
  port: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: string;
}

// ─── Config ────────────────────────────────────────────────────────────────────

// Major ports on China→Global trade routes
const MAJOR_PORTS: Array<{ name: string; country: string; lat: number; lon: number }> = [
  { name: '上海港', country: 'CN', lat: 31.23, lon: 121.47 },
  { name: '深圳港', country: 'CN', lat: 22.54, lon: 114.06 },
  { name: '宁波港', country: 'CN', lat: 29.87, lon: 121.55 },
  { name: '香港港', country: 'HK', lat: 22.30, lon: 114.17 },
  { name: '洛杉矶港', country: 'US', lat: 33.73, lon: -118.26 },
  { name: '纽约港', country: 'US', lat: 40.66, lon: -74.01 },
  { name: '鹿特丹港', country: 'NL', lat: 51.91, lon: 4.48 },
  { name: '汉堡港', country: 'DE', lat: 53.54, lon: 9.97 },
  { name: '东京港', country: 'JP', lat: 35.63, lon: 139.77 },
  { name: '釜山港', country: 'KR', lat: 35.10, lon: 129.04 },
  { name: '新加坡港', country: 'SG', lat: 1.27, lon: 103.84 },
  { name: '迪拜港', country: 'AE', lat: 25.07, lon: 55.14 },
];

// WMO Weather code → human-readable
function weatherDesc(code: number): string {
  if (code <= 1) return '晴天';
  if (code <= 3) return '多云';
  if (code <= 48) return '雾/霾';
  if (code <= 57) return '毛毛雨';
  if (code <= 67) return '降雨';
  if (code <= 77) return '降雪';
  if (code <= 82) return '阵雨';
  if (code <= 86) return '阵雪';
  return '雷暴';
}

// ─── Core Functions ─────────────────────────────────────────────────────────────

/** Fetch current + 7-day forecast for a single port */
async function fetchPortData(lat: number, lon: number): Promise<{
  current: PortWeather['current'];
  forecast: DayForecast[];
}> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,visibility',
    daily: 'temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum,weather_code',
    timezone: 'auto',
    forecast_days: '7',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);

  const data = (await res.json()) as {
    current: {
      temperature_2m: number;
      wind_speed_10m: number;
      wind_direction_10m: number;
      weather_code: number;
      visibility?: number;
    };
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      wind_speed_10m_max: number[];
      precipitation_sum: number[];
      weather_code: number[];
    };
  };

  return {
    current: {
      temperature: Math.round(data.current.temperature_2m),
      windSpeed: Math.round(data.current.wind_speed_10m * 10) / 10,
      windDirection: data.current.wind_direction_10m,
      weatherCode: data.current.weather_code,
      visibility: data.current.visibility ? Math.round(data.current.visibility) : 10000,
    },
    forecast: data.daily.time.map((date, i) => ({
      date,
      temperatureMax: Math.round(data.daily.temperature_2m_max[i]),
      temperatureMin: Math.round(data.daily.temperature_2m_min[i]),
      windSpeedMax: Math.round(data.daily.wind_speed_10m_max[i] * 10) / 10,
      precipitation: Math.round(data.daily.precipitation_sum[i] * 10) / 10,
      weatherCode: data.daily.weather_code[i],
    })),
  };
}

/** Weather risk assessment for logistics */
function assessRisk(current: PortWeather['current'], forecast: DayForecast[]): 'low' | 'medium' | 'high' | 'critical' {
  const maxWind = Math.max(current.windSpeed, ...forecast.map(f => f.windSpeedMax));
  const maxPrecip = Math.max(0, ...forecast.map(f => f.precipitation));
  const lowVis = current.visibility < 2000;

  if (maxWind > 20 || lowVis || current.weatherCode >= 95) return 'critical';
  if (maxWind > 15 || maxPrecip > 20 || current.weatherCode >= 80) return 'high';
  if (maxWind > 10 || maxPrecip > 10 || current.weatherCode >= 60) return 'medium';
  return 'low';
}

/** Get weather data for all major ports */
export async function getAllPortsWeather(): Promise<{
  ports: PortWeather[];
  alerts: WeatherAlert[];
  summary: { totalPorts: number; riskyPorts: number; criticalPorts: number; avgWindSpeed: number };
  timestamp: string;
}> {
  return cachedFetch(
    cacheKey('weather', 'all-ports'),
    async () => {
      const results = await Promise.allSettled(
        MAJOR_PORTS.map(async (port) => {
          const data = await fetchPortData(port.lat, port.lon);
          const risk = assessRisk(data.current, data.forecast);
          return {
            port: port.name,
            country: port.country,
            coordinates: { lat: port.lat, lon: port.lon },
            current: data.current,
            forecast: data.forecast,
            riskLevel: risk,
          } satisfies PortWeather;
        })
      );

      const ports = results
        .filter((r): r is PromiseFulfilledResult<PortWeather> => r.status === 'fulfilled')
        .map(r => r.value);

      // Generate alerts for high-risk ports
      const alerts: WeatherAlert[] = ports
        .filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical')
        .map(p => ({
          port: p.port,
          type: p.current.windSpeed > 15 ? '强风' : p.current.weatherCode >= 80 ? '暴雨' : '低能见度',
          severity: p.riskLevel,
          description: `${p.port}: 风速${p.current.windSpeed}m/s, ${weatherDesc(p.current.weatherCode)}, 能见度${p.current.visibility}m`,
          timestamp: new Date().toISOString(),
        }));

      const riskyPorts = ports.filter(p => p.riskLevel !== 'low').length;
      const criticalPorts = ports.filter(p => p.riskLevel === 'critical').length;
      const avgWindSpeed = ports.length > 0
        ? Math.round((ports.reduce((s, p) => s + p.current.windSpeed, 0) / ports.length) * 10) / 10
        : 0;

      return {
        ports,
        alerts,
        summary: { totalPorts: ports.length, riskyPorts, criticalPorts, avgWindSpeed },
        timestamp: new Date().toISOString(),
      };
    },
    CACHE_TTL.MEDIUM // 60s cache
  );
}

/** Get marine conditions for a specific route (wave height proxy via wind) */
export async function getRouteMarineConditions(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number
): Promise<MarineConditions> {
  // Use midpoint and fetch marine-specific data
  const midLat = (fromLat + toLat) / 2;
  const midLon = (fromLon + toLon) / 2;

  const params = new URLSearchParams({
    latitude: String(midLat),
    longitude: String(midLon),
    current: 'wind_speed_10m,wind_direction_10m,wave_height',
    timezone: 'auto',
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

  if (!res.ok) throw new Error(`Open-Meteo marine error: ${res.status}`);
  const data = (await res.json()) as { current: { wind_speed_10m: number; wind_direction_10m: number } };
  const windSpeed = data.current.wind_speed_10m;
  // Wave height ≈ 0.025 * wind_speed² (simplified empirical formula)
  const estWaveHeight = Math.round(0.025 * windSpeed * windSpeed * 10) / 10;

  let riskSummary: string;
  if (windSpeed < 10) riskSummary = '海况良好，适合航行';
  else if (windSpeed < 15) riskSummary = '海况一般，注意航速调整';
  else if (windSpeed < 20) riskSummary = '海况较差，建议评估延误风险';
  else riskSummary = '海况恶劣，建议改道或延期';

  return {
    waveHeight: estWaveHeight,
    waveDirection: data.current.wind_direction_10m, // proxy: wave direction ≈ wind direction
    windSpeed,
    riskSummary,
  };
}

/** Get a concise port weather summary (lightweight, for dashboard) */
export async function getPortWeatherSummary(): Promise<{
  chinaPorts: Array<{ name: string; temp: number; wind: number; desc: string }>;
  overseasPorts: Array<{ name: string; temp: number; wind: number; desc: string }>;
  activeAlerts: WeatherAlert[];
  updatedAt: string;
}> {
  const { ports, alerts } = await getAllPortsWeather();
  return {
    chinaPorts: ports
      .filter(p => p.country === 'CN' || p.country === 'HK')
      .map(p => ({ name: p.port, temp: p.current.temperature, wind: p.current.windSpeed, desc: weatherDesc(p.current.weatherCode) })),
    overseasPorts: ports
      .filter(p => p.country !== 'CN' && p.country !== 'HK')
      .map(p => ({ name: p.port, temp: p.current.temperature, wind: p.current.windSpeed, desc: weatherDesc(p.current.weatherCode) })),
    activeAlerts: alerts,
    updatedAt: new Date().toISOString(),
  };
}
