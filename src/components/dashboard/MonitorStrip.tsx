'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Globe, AlertTriangle, DollarSign,
  TrendingDown, TrendingUp, RefreshCw,
  Package, Ship,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';
import { createMetricsFormatter } from '@/lib/dashboard/metrics';

interface MonitorSnapshot {
  exchangeRate: { usdCny: number; deviation: number };
  portRisks: { total: number; high: number; medium: number; normal: number };
  inventoryHealth: { criticalSkus: number; warningSkus: number; healthyRate: number };
  commodity: { trend: string; avgChangePct: number; topMover: string };
  freight: { trend: string; avgRate: number; routeCount: number };
  estimatedLoss: number;
  estimatedSaving: number;
  updatedAt: string;
}

const RISK_COUNTS: { key: keyof MonitorSnapshot['portRisks']; label: string; color: string }[] = [
  { key: 'high', label: '高危', color: 'bg-red-500' },
  { key: 'medium', label: '预警', color: 'bg-orange-500' },
  { key: 'normal', label: '正常', color: 'bg-green-500' },
];

export function MonitorStrip() {
  const config = useDashboardConfigStore(s => s.config);
  const m = createMetricsFormatter(config);
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const [dashRes, cascadeRes, commodityRes, freightRes] = await Promise.all([
        fetch('/api/dashboard?action=summary'),
        fetch('/api/cascade-risk?scenario=auto'),
        fetch('/api/commodity'),
        fetch('/api/freight'),
      ]);
      const dash = await dashRes.json();
      const risk = await cascadeRes.json();
      const commodity = await commodityRes.json().catch(() => ({}));
      const freight = await freightRes.json().catch(() => ({}));

      const portRisks = risk?.sourceNodes?.reduce(
        (acc: { high: number; medium: number; normal: number }, n: { riskScore: number }) => {
          if (n.riskScore >= 70) acc.high++;
          else if (n.riskScore >= 40) acc.medium++;
          else acc.normal++;
          return acc;
        }, { high: 0, medium: 0, normal: 0 }
      ) ?? { high: 0, medium: 0, normal: 0 };

      setSnapshot({
        exchangeRate: {
          usdCny: risk?.passport?.dataProvenance?.find((p: any) => p.source === 'fx:frankfurter') ? 7.25 : 7.25,
          deviation: 0,
        },
        portRisks: { total: portRisks.high + portRisks.medium + portRisks.normal, ...portRisks },
        inventoryHealth: {
          criticalSkus: dash?.healthBreakdown?.inventory ?? 0,
          warningSkus: 0,
          healthyRate: dash?.healthScore ?? 100,
        },
        commodity: {
          trend: commodity?.overallTrend || 'stable',
          avgChangePct: commodity?.avgChangePct || 0,
          topMover: commodity?.affectedMaterials?.[0] || '—',
        },
        freight: {
          trend: freight?.trend || 'stable',
          avgRate: freight?.avgRate40GP || 0,
          routeCount: freight?.rates?.length || 0,
        },
        estimatedLoss: risk?.summary?.totalRisk ?? 0,
        estimatedSaving: risk?.counterfactuals?.[0]?.riskReduction ? risk.counterfactuals[0].riskReduction * 100000 : 0,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Degraded — show last known state
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchSnapshot());
    const i = setInterval(fetchSnapshot, 30000);
    return () => clearInterval(i);
  }, [fetchSnapshot]);

  if (!snapshot) return null;

  // Supply Chain Health Score (0-100, weighted across all data sources)
  const healthScore = Math.round(
    Math.max(0, Math.min(100,
      100
      - Math.min(snapshot.portRisks.high * 6 + snapshot.portRisks.medium * 3, 25)  // port risks: -25 max
      - Math.max(0, 100 - snapshot.inventoryHealth.healthyRate) * 0.2             // inventory: -20 max
      - (snapshot.commodity.trend === 'rising' ? 12 : snapshot.commodity.trend === 'falling' ? 5 : 0) // commodity: -12 max
      - (snapshot.freight.trend === 'rising' ? 8 : 0)                             // freight: -8 max
      - (snapshot.estimatedLoss > snapshot.estimatedSaving && snapshot.estimatedLoss > 0 ? 15 : 0) // loss>saving: -15
    ))
  );

  const scoreColor = healthScore >= 80 ? 'text-green-600' : healthScore >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = healthScore >= 80 ? 'bg-green-50 dark:bg-green-950/30' : healthScore >= 60 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-red-50 dark:bg-red-950/30';

  return (
    <Card className="border-0 border-b rounded-none bg-gradient-to-r from-slate-50 to-white dark:from-slate-950 dark:to-background">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg px-2.5 py-1 ${scoreBg}`}>
              <span className={`text-lg font-bold font-mono ${scoreColor}`}>{healthScore}</span>
              <span className="text-[10px] text-muted-foreground ml-1">/100</span>
            </div>
            <h2 className="text-sm font-semibold">供应链健康监控</h2>
            <Badge variant="outline" className="text-[10px]">{snapshot.updatedAt.slice(11, 19)}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={fetchSnapshot}>
              <RefreshCw className="h-3 w-3 mr-1" />刷新
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {/* Exchange Rate */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Globe className="h-3 w-3" />汇率 USD/CNY</div>
            <div className="text-lg font-bold font-mono">{snapshot.exchangeRate.usdCny.toFixed(2)}</div>
            <div className={`text-[10px] flex items-center gap-1 ${snapshot.exchangeRate.deviation > 1 ? 'text-red-500' : 'text-green-500'}`}>
              {snapshot.exchangeRate.deviation > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
              {snapshot.exchangeRate.deviation > 1 ? `偏离 ${snapshot.exchangeRate.deviation.toFixed(1)}%` : '正常'}
            </div>
          </div>

          {/* Port Risks */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><AlertTriangle className="h-3 w-3" />港口风险</div>
            <div className="flex items-center gap-2">
              {RISK_COUNTS.map(({ key, label, color }) => (
                <div key={key} className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${color}`} />
                  <span className="text-xs">{snapshot.portRisks[key]}</span>
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Health */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Activity className="h-3 w-3" />库存健康</div>
            <div className="text-lg font-bold font-mono">{snapshot.inventoryHealth.healthyRate}%</div>
            <div className="text-[10px] text-muted-foreground">
              {snapshot.inventoryHealth.criticalSkus > 0 ? `${snapshot.inventoryHealth.criticalSkus} SKU 缺货风险` : '库存水平正常'}
            </div>
          </div>

          {/* Commodity Prices (FRED) */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Package className="h-3 w-3" />大宗商品</div>
            <div className={`text-lg font-bold font-mono ${snapshot.commodity.trend === 'rising' ? 'text-red-600 dark:text-red-400' : snapshot.commodity.trend === 'falling' ? 'text-green-600 dark:text-green-400' : ''}`}>
              {snapshot.commodity.trend === 'rising' ? '↑' : snapshot.commodity.trend === 'falling' ? '↓' : '→'} {snapshot.commodity.avgChangePct > 0 ? '+' : ''}{snapshot.commodity.avgChangePct}%
            </div>
            <div className="text-[10px] text-muted-foreground">{snapshot.commodity.topMover || '价格稳定'}</div>
          </div>

          {/* Freight Rates */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Ship className="h-3 w-3" />海运运费</div>
            <div className="text-lg font-bold font-mono">${snapshot.freight.avgRate}</div>
            <div className="text-[10px] text-muted-foreground">{snapshot.freight.routeCount} 条航线 · {snapshot.freight.trend}</div>
          </div>

          {/* Estimated Loss */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><TrendingUp className="h-3 w-3" />预估风险损失</div>
            <div className="text-lg font-bold font-mono text-red-600 dark:text-red-400">{m.formatCurrency(snapshot.estimatedLoss)}</div>
            <div className="text-[10px] text-muted-foreground">基于当前传播模拟</div>
          </div>

          {/* Estimated Saving */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><DollarSign className="h-3 w-3" />可挽回损失</div>
            <div className="text-lg font-bold font-mono text-green-600 dark:text-green-400">{m.formatCurrency(snapshot.estimatedSaving)}</div>
            <div className="text-[10px] text-muted-foreground">执行建议方案可节省</div>
          </div>
        </div>
      </div>
    </Card>
  );
}
