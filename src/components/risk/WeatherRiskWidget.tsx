'use client';

import { useEffect, useState } from 'react';
import { Cloud, Wind, Thermometer, AlertTriangle, Anchor, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface PortWeatherItem {
  name: string;
  temp: number;
  wind: number;
  desc: string;
}

interface WeatherAlert {
  port: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

interface WeatherSummary {
  chinaPorts: PortWeatherItem[];
  overseasPorts: PortWeatherItem[];
  activeAlerts: WeatherAlert[];
  updatedAt: string;
}

const severityColor: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

export function WeatherRiskWidget() {
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchWeather = () => {
    setLoading(true);
    setError(false);
    fetch('/api/weather?action=summary')
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(data => { setWeather(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchWeather(); }, []);

  if (loading) {
    return (
      <Card className="card-entrance border-sky-200 dark:border-sky-900">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) {
    return (
      <Card className="card-entrance border-sky-200 dark:border-sky-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Cloud className="h-4 w-4 text-sky-500" />
            港口天气监控
          </CardTitle>
          <CardDescription>Open-Meteo API 暂时不可用</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-16 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 mr-2 cursor-pointer hover:text-foreground" onClick={fetchWeather} />
            点击刷新重试
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-entrance border-sky-200 dark:border-sky-900 hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Cloud className="h-4 w-4 text-sky-500" />
              港口天气监控
              <Badge variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                <RefreshCw className="h-2.5 w-2.5" />
                Open-Meteo
              </Badge>
            </CardTitle>
            <CardDescription>
              更新于 {new Date(weather.updatedAt).toLocaleTimeString('zh-CN')} | {weather.chinaPorts.length + weather.overseasPorts.length} 个港口
              {weather.activeAlerts.length > 0 && (
                <span className="text-red-500 ml-2">| {weather.activeAlerts.length} 个天气警报</span>
              )}
            </CardDescription>
          </div>
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground" onClick={fetchWeather} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Weather Alerts */}
        {weather.activeAlerts.length > 0 && (
          <div className="space-y-1.5">
            {weather.activeAlerts.map((a, i) => (
              <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs ${severityColor[a.severity]}`}>
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="font-medium">{a.port}:</span>
                <span className="truncate">{a.description}</span>
              </div>
            ))}
          </div>
        )}

        {/* China Ports — compact row */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
          <Anchor className="h-3 w-3 shrink-0" />
          {weather.chinaPorts.slice(0, 3).map(p => (
            <span key={p.name} className="px-1.5 py-0.5 rounded bg-muted/30">{p.name} {p.temp}° {p.wind}m/s</span>
          ))}
          {weather.chinaPorts.length > 3 && <span className="text-muted-foreground/50">+{weather.chinaPorts.length - 3}</span>}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
          <Anchor className="h-3 w-3 shrink-0" />
          {weather.overseasPorts.slice(0, 3).map(p => (
            <span key={p.name} className="px-1.5 py-0.5 rounded bg-muted/30">{p.name} {p.temp}° {p.wind}m/s</span>
          ))}
          {weather.overseasPorts.length > 3 && <span className="text-muted-foreground/50">+{weather.overseasPorts.length - 3}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
