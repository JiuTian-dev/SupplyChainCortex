'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useCascadeRiskSummary } from '@/hooks/use-cascade-risk';
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
  portRisks: { total: number; high: number; medium: number; normal: number; hotSpots: string[] };
  inventoryHealth: { criticalSkus: number; warningSkus: number; healthyRate: number };
  commodity: { trend: string; avgChangePct: number; topMover: string };
  freight: { trend: string; avgRate: number; routeCount: number };
  estimatedLoss: number;
  estimatedSaving: number;
  topCounterfactual: string;
  updatedAt: string;
}

const RISK_COUNTS: { key: 'high' | 'medium' | 'normal'; label: string; color: string }[] = [
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
      const [dashRes, cascadeRes, commodityRes, freightRes, fxRes, inventoryRes] = await Promise.all([
        fetch('/api/dashboard?action=summary'),
        fetch('/api/cascade-risk?scenario=auto'),
        fetch('/api/commodity'),
        fetch('/api/freight'),
        fetch('/api/exchange-rates?action=latest'),
        fetch('/api/inventory?action=health'),
      ]);
      const dash = await dashRes.json();
      const risk = await cascadeRes.json();
      const commodity = await commodityRes.json().catch(() => ({}));
      const freight = await freightRes.json().catch(() => ({}));
      const fx = await fxRes.json().catch(() => ({}));
      const inv = await inventoryRes.json().catch(() => ({}));

      // Extract real exchange rate
      const usdRate = fx?.rates?.USD
        ? 1 / fx.rates.USD
        : fx?.data?.rates?.USD
          ? 1 / fx.data.rates.USD
          : 7.25;
      const fxSpread = fx?.midpoints?.USD?.spread || 0;

      // Extract port risks with actual port names
      const portSourceNodes = risk?.sourceNodes?.filter((n: any) => n.category === 'weather') || [];
      const portRisks = {
        total: portSourceNodes.length || 12,
        high: portSourceNodes.filter((n: any) => n.riskScore >= 70).length,
        medium: portSourceNodes.filter((n: any) => n.riskScore >= 40 && n.riskScore < 70).length,
        normal: (12 - portSourceNodes.length),
        hotSpots: portSourceNodes.filter((n: any) => n.riskScore >= 40).map((n: any) => n.cause?.split(':')[1]?.trim() || n.nodeId).slice(0, 2),
      };

      // Real inventory breakdown
      const inventoryHealth = {
        criticalSkus: inv?.critical?.length || inv?.data?.critical?.length || dash?.healthBreakdown?.inventory || 0,
        warningSkus: inv?.warning?.length || inv?.data?.warning?.length || 0,
        healthyRate: inv?.healthyRate || inv?.data?.healthyRate || dash?.healthScore || 100,
      };

      // Monetary loss: use cascade engine's computed totalMonthlyLoss
      const estimatedLoss = risk?.summary?.totalMonthlyLoss
        || (risk?.propagation || []).reduce((s: number, p: any) => s + (p.monetaryImpact || 0), 0)
        || 0;

      // Real saving from top counterfactual
      const topCF = risk?.counterfactuals?.[0];
      const estimatedSaving = topCF?.riskReduction
        ? Math.round(estimatedLoss * (topCF.riskReduction / 100))
        : 0;

      setSnapshot({
        exchangeRate: { usdCny: Math.round(usdRate * 100) / 100, deviation: Math.abs(fxSpread) },
        portRisks: { ...portRisks, normal: Math.max(0, portRisks.normal) },
        inventoryHealth,
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
        estimatedLoss,
        estimatedSaving,
        topCounterfactual: topCF?.name || '',
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
  const healthScore = useMemo(() => Math.round(
    Math.max(0, Math.min(100,
      100
      - Math.min(snapshot.portRisks.high * 6 + snapshot.portRisks.medium * 3, 25)
      - Math.max(0, 100 - snapshot.inventoryHealth.healthyRate) * 0.2
      - (snapshot.commodity.trend === 'rising' ? 12 : snapshot.commodity.trend === 'falling' ? 5 : 0)
      - (snapshot.freight.trend === 'rising' ? 8 : 0)
      - (snapshot.estimatedLoss > snapshot.estimatedSaving && snapshot.estimatedLoss > 0 ? 15 : 0)
    ))
  ), [snapshot]);

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
                  <span className="text-xs">{snapshot.portRisks[key] || 0}</span>
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-red-500">
              {snapshot.portRisks.hotSpots?.length > 0
                ? `⚠ ${snapshot.portRisks.hotSpots.join(', ')}`
                : snapshot.portRisks.high > 0 ? `${snapshot.portRisks.high}港报警` : '全港正常'}
            </div>
          </div>

          {/* Inventory Health */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Activity className="h-3 w-3" />库存健康</div>
            <div className="text-lg font-bold font-mono">{snapshot.inventoryHealth.healthyRate.toFixed(0)}%</div>
            <div className="text-[10px] text-muted-foreground">
              {snapshot.inventoryHealth.criticalSkus > 0
                ? `🔴 ${snapshot.inventoryHealth.criticalSkus} 紧急 · ${snapshot.inventoryHealth.warningSkus || 0} 预警`
                : snapshot.inventoryHealth.warningSkus > 0
                  ? `🟡 ${snapshot.inventoryHealth.warningSkus} 需关注`
                  : '库存水平正常'}
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
            <div className="text-lg font-bold font-mono text-red-600 dark:text-red-400">
              {snapshot.estimatedLoss > 0 ? m.formatCurrency(snapshot.estimatedLoss) : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {snapshot.estimatedLoss > 0 ? '级联传播 × 月出货量 × 落地成本' : '未检测到显著风险'}
            </div>
          </div>

          {/* Estimated Saving */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><DollarSign className="h-3 w-3" />可挽回损失</div>
            <div className="text-lg font-bold font-mono text-green-600 dark:text-green-400">
              {snapshot.estimatedSaving > 0 ? m.formatCurrency(snapshot.estimatedSaving) : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {snapshot.topCounterfactual || '暂无建议方案'}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
