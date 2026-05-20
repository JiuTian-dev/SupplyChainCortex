'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Calculator, Zap, RotateCcw, ArrowUp, ArrowDown, Minus,
  AlertTriangle, TrendingUp, Shield, Target,
  Save, Trash2, Filter, BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { useCost } from '@/hooks/use-supply-chain-data';
import type { CostRecord } from '@prisma/client';
import { useExchangeRate } from '@/hooks/use-exchange-rate';
import { ExportMenu } from '@/components/shared/ExportMenu';
import type { ExportColumn } from '@/lib/services/report-export.service';

// ==================== Types ====================
interface SimParams {
  exchangeRateChange: number;
  freightChange: number;
  rawMaterialChange: number;
  tariffChange: number;
  laborChange: number;
  platformFeeChange: number;
}

interface SimulatedProductResult {
  product: string;
  sku: string;
  currentMargin: number;
  simulatedMargin: number;
  marginChange: number;
}

interface PreviewResult {
  currentAvgMargin: number;
  estimatedAvgMargin: number;
  marginChange: number;
  productsAtRisk: number;
  totalProducts: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  simulatedMargins: SimulatedProductResult[];
}

interface TornadoItem {
  name: string;
  lowImpact: number;
  highImpact: number;
  totalRange: number;
}

interface WaterfallItem {
  name: string;
  base: number;
  value: number;
  fill: string;
  isTotal: boolean;
}

interface ScenarioPresetDef {
  key: string;
  label: string;
  params: Partial<SimParams>;
}

interface SavedScenario {
  params: SimParams;
  preview: PreviewResult;
  worstProduct: { product: string; marginChange: number } | null;
  bestProduct: { product: string; marginChange: number } | null;
  timestamp: number;
}

interface SliderConfig {
  key: keyof SimParams;
  label: string;
  min: number;
  max: number;
  step: number;
  lowLabel: string;
  highLabel: string;
  icon: React.ReactNode;
  color: string;
}

interface DetailRow {
  product: string;
  sku: string;
  currentMargin: number;
  simulatedMargin: number;
  marginChange: number;
  currentTotalLanded: number;
  simulatedTotalLanded: number;
  totalLandedChange: number;
}

// ==================== Constants ====================
const DEFAULT_PARAMS: SimParams = {
  exchangeRateChange: 0,
  freightChange: 0,
  rawMaterialChange: 0,
  tariffChange: 0,
  laborChange: 0,
  platformFeeChange: 0,
};

const SCENARIO_PRESETS: ScenarioPresetDef[] = [
  { key: 'tradeWar', label: '贸易战', params: { tariffChange: 25, exchangeRateChange: 10, freightChange: 15 } },
  { key: 'rawMaterialCrisis', label: '原材料危机', params: { rawMaterialChange: 20, freightChange: 10 } },
  { key: 'rmbAppreciation', label: '人民币升值', params: { exchangeRateChange: 15, platformFeeChange: 5 } },
  { key: 'freightSurge', label: '运费飙升', params: { freightChange: 40, rawMaterialChange: 5 } },
  { key: 'fullPressure', label: '全面压力', params: { exchangeRateChange: 15, freightChange: 15, rawMaterialChange: 15, tariffChange: 15, laborChange: 15, platformFeeChange: 15 } },
];

const FACTOR_ORDER: { key: keyof SimParams; label: string; color: string }[] = [
  { key: 'exchangeRateChange', label: '汇率', color: '#06b6d4' },
  { key: 'freightChange', label: '运费', color: '#8b5cf6' },
  { key: 'rawMaterialChange', label: '原材料', color: '#f97316' },
  { key: 'tariffChange', label: '关税', color: '#f43f5e' },
  { key: 'laborChange', label: '人工', color: '#f59e0b' },
  { key: 'platformFeeChange', label: '平台费', color: '#10b981' },
];

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    key: 'exchangeRateChange',
    label: '汇率变化',
    min: -20,
    max: 20,
    step: 1,
    lowLabel: '人民币贬值 -20%',
    highLabel: '人民币升值 +20%',
    icon: <span className="text-sm">💱</span>,
    color: 'cyan',
  },
  {
    key: 'freightChange',
    label: '运费/物流变化',
    min: -30,
    max: 50,
    step: 1,
    lowLabel: '运费下降 -30%',
    highLabel: '运费上涨 +50%',
    icon: <span className="text-sm">🚢</span>,
    color: 'violet',
  },
  {
    key: 'rawMaterialChange',
    label: '原材料成本变化',
    min: -15,
    max: 25,
    step: 1,
    lowLabel: '原材料下降 -15%',
    highLabel: '原材料上涨 +25%',
    icon: <span className="text-sm">🏭</span>,
    color: 'orange',
  },
  {
    key: 'tariffChange',
    label: '关税变化',
    min: -50,
    max: 100,
    step: 1,
    lowLabel: '关税下降 -50%',
    highLabel: '关税上涨 +100%',
    icon: <span className="text-sm">🏛️</span>,
    color: 'rose',
  },
  {
    key: 'laborChange',
    label: '人工成本变化',
    min: -10,
    max: 30,
    step: 1,
    lowLabel: '人工下降 -10%',
    highLabel: '人工上涨 +30%',
    icon: <span className="text-sm">👷</span>,
    color: 'amber',
  },
  {
    key: 'platformFeeChange',
    label: '平台费变化',
    min: -20,
    max: 20,
    step: 1,
    lowLabel: '平台费下降 -20%',
    highLabel: '平台费上涨 +20%',
    icon: <span className="text-sm">🛒</span>,
    color: 'emerald',
  },
];

const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

// ==================== Computation Functions ====================

function computeLocalPreview(costs: CostRecord[], params: SimParams): PreviewResult | null {
  if (!costs || costs.length === 0) return null;

  const cnyRatio = 0.6;
  const fxRate = params.exchangeRateChange / 100;
  const freightRate = params.freightChange / 100;
  const rawMatRate = params.rawMaterialChange / 100;
  const tariffRate = params.tariffChange / 100;
  const laborRate = params.laborChange / 100;
  const platformFeeRate = params.platformFeeChange / 100;

  const currentAvgMargin = costs.reduce((s, c) => s + c.grossMargin, 0) / costs.length;

  const simulatedMargins = costs.map(cost => {
    const newRawMaterial = cost.rawMaterial * (1 + rawMatRate);
    const newLabor = cost.labor * (1 + laborRate);
    const newLogistics = cost.logistics * (1 + freightRate);
    const newTariff = cost.tariff * (1 + tariffRate);
    const newPlatformFee = cost.platformFee * (1 + platformFeeRate);

    const newCnyTotal = (newRawMaterial + newLabor) / (cost.exchangeRate * (1 + fxRate));
    const newUsdTotal = newLogistics + newTariff + newPlatformFee;
    const newTotalLanded = newCnyTotal + newUsdTotal;
    const newMargin = ((cost.sellingPrice - newTotalLanded) / cost.sellingPrice) * 100;

    return {
      product: cost.productName,
      sku: cost.sku,
      currentMargin: cost.grossMargin,
      simulatedMargin: Math.round(newMargin * 10) / 10,
      marginChange: Math.round((newMargin - cost.grossMargin) * 10) / 10,
    };
  });

  const estimatedAvgMargin = simulatedMargins.reduce((s, r) => s + r.simulatedMargin, 0) / simulatedMargins.length;
  const productsAtRisk = simulatedMargins.filter(r => r.simulatedMargin < 48).length;

  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  const avgChange = estimatedAvgMargin - currentAvgMargin;
  if (avgChange >= -2 && productsAtRisk <= 1) riskLevel = 'low';
  else if (avgChange >= -5 && productsAtRisk <= 3) riskLevel = 'medium';
  else if (avgChange >= -10) riskLevel = 'high';
  else riskLevel = 'critical';

  return {
    currentAvgMargin: Math.round(currentAvgMargin * 10) / 10,
    estimatedAvgMargin: Math.round(estimatedAvgMargin * 10) / 10,
    marginChange: Math.round((estimatedAvgMargin - currentAvgMargin) * 10) / 10,
    productsAtRisk,
    totalProducts: costs.length,
    riskLevel,
    simulatedMargins,
  };
}

function computeTornadoData(costs: CostRecord[]): TornadoItem[] {
  if (!costs || costs.length === 0) return [];

  const baseline = computeLocalPreview(costs, DEFAULT_PARAMS);
  if (!baseline) return [];

  const baselineMargin = baseline.estimatedAvgMargin;

  const items: TornadoItem[] = FACTOR_ORDER.map(factor => {
    const paramsLow: SimParams = { ...DEFAULT_PARAMS, [factor.key]: -10 };
    const paramsHigh: SimParams = { ...DEFAULT_PARAMS, [factor.key]: 10 };

    const previewLow = computeLocalPreview(costs, paramsLow);
    const previewHigh = computeLocalPreview(costs, paramsHigh);

    const lowMargin = previewLow?.estimatedAvgMargin ?? baselineMargin;
    const highMargin = previewHigh?.estimatedAvgMargin ?? baselineMargin;

    const impactLow = Math.round((lowMargin - baselineMargin) * 10) / 10;
    const impactHigh = Math.round((highMargin - baselineMargin) * 10) / 10;

    return {
      name: factor.label,
      lowImpact: impactLow,
      highImpact: impactHigh,
      totalRange: Math.round(Math.abs(impactHigh - impactLow) * 10) / 10,
    };
  });

  return items.sort((a, b) => b.totalRange - a.totalRange);
}

function computeWaterfallData(costs: CostRecord[], params: SimParams, preview: PreviewResult | null): WaterfallItem[] {
  if (!costs || costs.length === 0) return [];

  const baselinePreview = computeLocalPreview(costs, DEFAULT_PARAMS);
  if (!baselinePreview) return [];

  const items: WaterfallItem[] = [];
  const startMargin = baselinePreview.estimatedAvgMargin;

  items.push({
    name: '起始毛利率',
    base: 0,
    value: startMargin,
    fill: '#94a3b8',
    isTotal: true,
  });

  let runningTotal = startMargin;

  // Only apply factors with non-zero changes
  const activeFactors = FACTOR_ORDER.filter(f => params[f.key] !== 0);

  if (activeFactors.length > 0) {
    const cumParams = { ...DEFAULT_PARAMS };

    for (const factor of activeFactors) {
      cumParams[factor.key] = params[factor.key];
      const currentPreview = computeLocalPreview(costs, cumParams);
      if (!currentPreview) continue;

      const currentMargin = currentPreview.estimatedAvgMargin;
      const delta = currentMargin - runningTotal;
      const absDelta = Math.abs(delta);

      if (absDelta < 0.05) continue;

      const isPositive = delta > 0;

      items.push({
        name: factor.label,
        base: isPositive ? runningTotal : runningTotal + delta,
        value: absDelta,
        fill: isPositive ? '#22c55e' : '#ef4444',
        isTotal: false,
      });

      runningTotal = currentMargin;
    }
  }

  const endMargin = preview?.estimatedAvgMargin ?? runningTotal;

  items.push({
    name: '最终毛利率',
    base: 0,
    value: endMargin,
    fill: '#6366f1',
    isTotal: true,
  });

  return items;
}

function getWorstBestFromMargins(simulatedMargins: SimulatedProductResult[]): {
  worst: { product: string; marginChange: number } | null;
  best: { product: string; marginChange: number } | null;
} {
  if (!simulatedMargins || simulatedMargins.length === 0) {
    return { worst: null, best: null };
  }
  const sorted = [...simulatedMargins].sort((a, b) => a.marginChange - b.marginChange);
  return {
    worst: { product: sorted[0].product, marginChange: sorted[0].marginChange },
    best: { product: sorted[sorted.length - 1].product, marginChange: sorted[sorted.length - 1].marginChange },
  };
}

function isPresetActive(preset: ScenarioPresetDef, params: SimParams): boolean {
  const keys = Object.keys(DEFAULT_PARAMS) as (keyof SimParams)[];
  return keys.every(key => params[key] === (preset.params[key] ?? 0));
}

function getActivePresetKey(params: SimParams): string | null {
  for (const preset of SCENARIO_PRESETS) {
    if (isPresetActive(preset, params)) return preset.key;
  }
  return null;
}

// ==================== UI Helpers ====================

function getSliderValueColor(value: number): string {
  if (value > 0) return 'text-red-600 dark:text-red-400';
  if (value < 0) return 'text-green-600 dark:text-green-400';
  return 'text-muted-foreground';
}

function getSliderTrackColor(key: string): string {
  const map: Record<string, string> = {
    exchangeRateChange: '[&_[data-slot=slider-range]]:bg-cyan-500',
    freightChange: '[&_[data-slot=slider-range]]:bg-violet-500',
    rawMaterialChange: '[&_[data-slot=slider-range]]:bg-orange-500',
    tariffChange: '[&_[data-slot=slider-range]]:bg-rose-500',
    laborChange: '[&_[data-slot=slider-range]]:bg-amber-500',
    platformFeeChange: '[&_[data-slot=slider-range]]:bg-emerald-500',
  };
  return map[key] || '';
}

// ==================== Sub-Components ====================

function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' | 'critical' }) {
  const config = {
    low: { label: '低风险', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', icon: <Shield className="h-3 w-3" /> },
    medium: { label: '中风险', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300', icon: <AlertTriangle className="h-3 w-3" /> },
    high: { label: '高风险', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', icon: <AlertTriangle className="h-3 w-3" /> },
    critical: { label: '极高风险', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', icon: <AlertTriangle className="h-3 w-3" /> },
  };
  const c = config[level];
  return (
    <Badge className={`${c.color} gap-1 text-xs font-medium`}>
      {c.icon} {c.label}
    </Badge>
  );
}

function TornadoTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TornadoItem & { negImpact: number; posImpact: number } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-popover text-popover-foreground border shadow-lg rounded-lg px-3 py-2 text-xs max-w-[200px]">
      <p className="font-semibold mb-1">{d.name}</p>
      <div className="space-y-0.5">
        <p className="flex justify-between gap-3">
          <span className="text-red-500">−10% 变动:</span>
          <span className="font-medium">{d.lowImpact >= 0 ? '+' : ''}{d.lowImpact}%</span>
        </p>
        <p className="flex justify-between gap-3">
          <span className="text-green-500">+10% 变动:</span>
          <span className="font-medium">{d.highImpact >= 0 ? '+' : ''}{d.highImpact}%</span>
        </p>
        <p className="flex justify-between gap-3 border-t pt-0.5 mt-0.5">
          <span className="text-muted-foreground">波动幅度:</span>
          <span className="font-semibold">{d.totalRange}%</span>
        </p>
      </div>
    </div>
  );
}

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WaterfallItem & { name: string; value: number } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-popover text-popover-foreground border shadow-lg rounded-lg px-3 py-2 text-xs">
      <p className="font-semibold mb-1">{d.name}</p>
      <p className="text-muted-foreground">
        {d.isTotal ? '毛利率' : '贡献'}:
        <span className="font-medium text-foreground ml-1">{d.value.toFixed(1)}%</span>
      </p>
    </div>
  );
}

// ==================== Props ====================
interface CostSimulatorEnhancedProps {
  costs: CostRecord[];
}

// ==================== Main Component ====================
export function CostSimulatorEnhanced({ costs }: CostSimulatorEnhancedProps) {
  const { rate: usdStatic, liveRate: usdLive, source: fxSource } = useExchangeRate('USD');
  const usdDisplayRate = usdLive ?? usdStatic?.rate ?? 7.25;

  const [params, setParams] = useState<SimParams>({ ...DEFAULT_PARAMS });
  const [apiParams, setApiParams] = useState<SimParams | null>(null);
  const [sortField, setSortField] = useState<'marginChange' | 'simulatedMargin' | 'currentMargin'>('marginChange');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [savedScenario, setSavedScenario] = useState<SavedScenario | null>(null);
  const [showHighRiskOnly, setShowHighRiskOnly] = useState(false);

  // React Query for API simulation
  const costSimulateQuery = useCost(
    'simulate',
    apiParams
      ? {
          exchangeRateChange: apiParams.exchangeRateChange,
          freightChange: apiParams.freightChange,
          rawMaterialChange: apiParams.rawMaterialChange,
          tariffChange: apiParams.tariffChange,
          laborChange: apiParams.laborChange,
          platformFeeChange: apiParams.platformFeeChange,
        }
      : undefined,
  );

  // Local real-time preview
  const preview = useMemo(() => computeLocalPreview(costs, params), [costs, params]);

  // Tornado data (always visible, based on baseline ±10%)
  const tornadoData = useMemo(() => {
    const raw = computeTornadoData(costs);
    return raw.map(item => ({
      name: item.name,
      negImpact: Math.min(item.lowImpact, 0),
      posImpact: Math.max(item.highImpact, 0),
      lowImpact: item.lowImpact,
      highImpact: item.highImpact,
      totalRange: item.totalRange,
    }));
  }, [costs]);

  // Waterfall data
  const waterfallData = useMemo(
    () => computeWaterfallData(costs, params, preview),
    [costs, params, preview],
  );

  // API result
  const apiResult = useMemo(() => {
    if (costSimulateQuery.data) return costSimulateQuery.data as Record<string, unknown>;
    return null;
  }, [costSimulateQuery.data]);

  // Check if any slider is non-zero
  const hasChanges = Object.values(params).some(v => v !== 0);

  // Active preset key
  const activePreset = useMemo(() => getActivePresetKey(params), [params]);

  // Build comparison chart data from API result
  const chartData = useMemo(() => {
    if (!apiResult) return [];
    const results = (apiResult.results as Array<Record<string, unknown>>) || [];
    return results.map(r => ({
      name: String(r.product).length > 6 ? String(r.product).slice(0, 6) + '...' : String(r.product),
      fullName: String(r.product),
      当前毛利率: Number(r.currentMargin),
      模拟毛利率: Number(r.simulatedMargin),
    }));
  }, [apiResult]);

  // Sorted results for table
  const sortedResults = useMemo(() => {
    if (!apiResult) return [];
    const results = ((apiResult.results as Array<Record<string, unknown>>) || []).map(r => ({
      product: String(r.product),
      sku: String(r.sku),
      currentMargin: Number(r.currentMargin),
      simulatedMargin: Number(r.simulatedMargin),
      marginChange: Number(r.marginChange),
      currentTotalLanded: Number(r.currentTotalLanded),
      simulatedTotalLanded: Number(r.simulatedTotalLanded),
      totalLandedChange: Number(r.totalLandedChange),
    }));
    return results.sort((a: DetailRow, b: DetailRow) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [apiResult, sortField, sortDir]);

  // Filtered results for high-risk toggle
  const filteredResults = useMemo(() => {
    if (!showHighRiskOnly) return sortedResults;
    return sortedResults.filter(r => r.simulatedMargin < 48);
  }, [sortedResults, showHighRiskOnly]);

  // Export columns and data
  const exportColumns: ExportColumn[] = [
    { key: 'product', label: '产品' },
    { key: 'sku', label: 'SKU' },
    { key: 'currentMargin', label: '当前毛利率(%)' },
    { key: 'simulatedMargin', label: '模拟毛利率(%)' },
    { key: 'marginChange', label: '毛利变化(%)' },
    { key: 'currentTotalLanded', label: '当前总成本($)' },
    { key: 'simulatedTotalLanded', label: '模拟总成本($)' },
    { key: 'totalLandedChange', label: '总成本变化($)' },
  ];

  const exportData = useMemo(() =>
    sortedResults.map(r => ({
      product: r.product,
      sku: r.sku,
      currentMargin: r.currentMargin,
      simulatedMargin: r.simulatedMargin,
      marginChange: r.marginChange,
      currentTotalLanded: r.currentTotalLanded,
      simulatedTotalLanded: r.simulatedTotalLanded,
      totalLandedChange: r.totalLandedChange,
    })),
    [sortedResults],
  );

  // Summary from API
  const summary = useMemo(() => {
    if (!apiResult) return null;
    return apiResult.summary as Record<string, unknown>;
  }, [apiResult]);

  // Local worst/best from preview (for comparison without API)
  const currentWorstBest = useMemo(() => {
    if (!preview) return { worst: null, best: null };
    return getWorstBestFromMargins(preview.simulatedMargins);
  }, [preview]);

  // ==================== Handlers ====================

  const handleSliderChange = useCallback((key: keyof SimParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleRunSimulation = useCallback(() => {
    setApiParams({ ...params });
  }, [params]);

  const handleReset = useCallback(() => {
    setParams({ ...DEFAULT_PARAMS });
    setApiParams(null);
    setShowHighRiskOnly(false);
  }, []);

  const handlePresetClick = useCallback((preset: ScenarioPresetDef) => {
    const newParams: SimParams = { ...DEFAULT_PARAMS, ...preset.params };
    setParams(newParams);
    setApiParams(newParams);
  }, []);

  const handleSaveScenario = useCallback(() => {
    if (!preview) return;
    const { worst, best } = getWorstBestFromMargins(preview.simulatedMargins);
    setSavedScenario({
      params: { ...params },
      preview: { ...preview },
      worstProduct: worst,
      bestProduct: best,
      timestamp: Date.now(),
    });
  }, [preview, params]);

  const handleClearComparison = useCallback(() => {
    setSavedScenario(null);
  }, []);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // ==================== Render ====================
  return (
    <Card className="card-dashboard border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Calculator className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          利润影响模拟器
          <Badge variant="outline" className="text-[10px] ml-1">6 维参数</Badge>
        </CardTitle>
        <CardDescription>模拟汇率、运费、原材料、关税、人工和平台费波动对毛利率的影响</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* ===== Left: Tornado + Presets + Sliders ===== */}
          <div className="lg:col-span-1 space-y-4">
            {/* --- Tornado Sensitivity Chart --- */}
            {tornadoData.length > 0 && (
              <div className="bg-card rounded-lg border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart3 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                  <h4 className="text-xs font-semibold">敏感度分析</h4>
                </div>
                <p className="text-[9px] text-muted-foreground mb-2 leading-tight">各因素 ±10% 变动对整体毛利率的影响</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={tornadoData}
                    layout="vertical"
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                    barCategoryGap="25%"
                    barGap={0}
                    barSize={8}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 9 }}
                      tickFormatter={(v: number) => `${v}%`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={52}
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      content={<TornadoTooltip />}
                      cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                    />
                    <Bar
                      dataKey="negImpact"
                      fill="#ef4444"
                      radius={[4, 0, 0, 4]}
                      label={{ position: 'left', fontSize: 9, fill: '#ef4444', formatter: (v: number) => `${v.toFixed(1)}%` }}
                    />
                    <Bar
                      dataKey="posImpact"
                      fill="#22c55e"
                      radius={[0, 4, 4, 0]}
                      label={{ position: 'right', fontSize: 9, fill: '#22c55e', formatter: (v: number) => `+${v.toFixed(1)}%` }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* --- Scenario Presets --- */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">场景预设</p>
              <div className="flex flex-wrap gap-1.5">
                {SCENARIO_PRESETS.map(preset => (
                  <Button
                    key={preset.key}
                    variant={activePreset === preset.key ? 'default' : 'outline'}
                    size="sm"
                    className={`text-[10px] h-6 px-2 transition-all ${
                      activePreset === preset.key
                        ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                        : 'hover:border-cyan-300'
                    }`}
                    onClick={() => handlePresetClick(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* --- Sliders --- */}
            {SLIDER_CONFIGS.map((cfg) => {
              const isFxSlider = cfg.key === 'exchangeRateChange';
              return (
              <div key={cfg.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium flex items-center gap-1.5">
                    {cfg.icon}
                    {cfg.label}
                    {isFxSlider && (
                      <span className="text-[10px] text-muted-foreground font-normal ml-1">
                        (参考 1 USD = {usdDisplayRate.toFixed(2)} CNY{fxSource === 'frankfurter' ? ' · 实时' : ''})
                      </span>
                    )}
                  </span>
                  <span className={`font-bold tabular-nums transition-colors duration-200 ${getSliderValueColor(params[cfg.key])}`}>
                    {params[cfg.key] > 0 ? '+' : ''}{params[cfg.key]}%
                  </span>
                </div>
                <Slider
                  value={[params[cfg.key]]}
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  onValueChange={([v]) => handleSliderChange(cfg.key, v)}
                  className={`transition-all duration-200 slider-thumb-glow ${getSliderTrackColor(cfg.key)}`}
                  style={{ '--slider-glow-color': cfg.color === 'cyan' ? 'rgba(6, 182, 212, 0.4)' : cfg.color === 'violet' ? 'rgba(139, 92, 246, 0.4)' : cfg.color === 'orange' ? 'rgba(249, 115, 22, 0.4)' : cfg.color === 'rose' ? 'rgba(244, 63, 94, 0.4)' : cfg.color === 'amber' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)' } as React.CSSProperties}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{cfg.lowLabel}</span>
                  <span>{cfg.highLabel}</span>
                </div>
              </div>
              );
            })}

            {/* --- Action Buttons --- */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleRunSimulation}
                className="flex-1 btn-gradient-animated"
                disabled={costSimulateQuery.isFetching || !hasChanges}
              >
                <Zap className="h-4 w-4 mr-2" />
                {costSimulateQuery.isFetching ? '模拟中...' : '运行模拟'}
              </Button>
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges && !apiResult}
                className="shrink-0"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            {/* --- Save / Compare Buttons --- */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-7"
                onClick={handleSaveScenario}
                disabled={!preview || !hasChanges}
              >
                <Save className="h-3 w-3 mr-1" />
                保存场景
              </Button>
              {savedScenario && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs h-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                  onClick={handleClearComparison}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  清除对比
                </Button>
              )}
            </div>
            {savedScenario && (
              <p className="text-[9px] text-muted-foreground text-center">
                场景已保存 ({new Date(savedScenario.timestamp).toLocaleTimeString()})
              </p>
            )}
          </div>

          {/* ===== Middle + Right: Preview & Results ===== */}
          <div className="lg:col-span-2 space-y-4">
            {/* Simulation progress indicator */}
            {costSimulateQuery.isFetching && (
              <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden mb-3">
                <div className="h-full progress-bar-animated sim-progress-bar" style={{ width: '60%', '--progress-color-from': '#06b6d4', '--progress-color-to': '#8b5cf6' } as React.CSSProperties} />
              </div>
            )}

            {/* Real-time Preview Card */}
            {preview && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-card rounded-lg p-3 border shadow-sm transition-all duration-300">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">当前平均毛利</p>
                  <p className="text-lg font-bold tabular-nums">{preview.currentAvgMargin}%</p>
                </div>
                <div className="bg-card rounded-lg p-3 border shadow-sm transition-all duration-300">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">预估新毛利</p>
                  <p className={`text-lg font-bold tabular-nums transition-colors duration-300 ${
                    preview.marginChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {preview.estimatedAvgMargin}%
                  </p>
                </div>
                <div className="bg-card rounded-lg p-3 border shadow-sm transition-all duration-300">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">受影响产品</p>
                  <p className="text-lg font-bold tabular-nums">
                    <span className={preview.productsAtRisk > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {preview.productsAtRisk}
                    </span>
                    <span className="text-xs text-muted-foreground">/{preview.totalProducts}</span>
                  </p>
                </div>
                <div className="bg-card rounded-lg p-3 border shadow-sm transition-all duration-300">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">风险等级</p>
                  <div className="mt-1">
                    <RiskBadge level={preview.riskLevel} />
                  </div>
                </div>
              </div>
            )}

            {/* --- Waterfall / Bridge Chart --- */}
            {waterfallData.length > 1 && hasChanges && (
              <div className="bg-card rounded-lg border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                  <h4 className="text-xs font-semibold">毛利率瀑布图</h4>
                  <Badge variant="outline" className="text-[9px] h-4 ml-1">Bridge</Badge>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={waterfallData}
                    margin={{ top: 18, right: 10, left: 0, bottom: 5 }}
                    barCategoryGap="25%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) => `${v}%`}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <RechartsTooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                    {/* Invisible base bar for float effect */}
                    <Bar dataKey="base" stackId="wf" fill="transparent" />
                    {/* Visible value bar */}
                    <Bar
                      dataKey="value"
                      stackId="wf"
                      radius={[3, 3, 0, 0]}
                      label={{
                        position: 'top',
                        fontSize: 9,
                        fill: '#6b7280',
                        formatter: (v: number) => `${v.toFixed(1)}%`,
                      }}
                    >
                      {waterfallData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* --- Scenario Comparison Table --- */}
            {savedScenario && preview && (
              <div className="bg-card rounded-lg border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart3 className="h-3.5 w-3.5 text-violet-500" />
                  <h4 className="text-xs font-semibold">场景对比</h4>
                  <Badge variant="outline" className="text-[9px] h-4">A: 已保存 / B: 当前</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wider w-[120px]">指标</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-center">场景 A (已保存)</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-center">场景 B (当前)</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-center">差异</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* 平均毛利率 */}
                    <TableRow className="text-xs">
                      <TableCell className="font-medium">平均毛利率</TableCell>
                      <TableCell className="text-center tabular-nums">{savedScenario.preview.estimatedAvgMargin}%</TableCell>
                      <TableCell className="text-center tabular-nums">{preview.estimatedAvgMargin}%</TableCell>
                      <TableCell className={`text-center tabular-nums font-semibold ${
                        preview.estimatedAvgMargin >= savedScenario.preview.estimatedAvgMargin
                          ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {preview.estimatedAvgMargin >= savedScenario.preview.estimatedAvgMargin ? '+' : ''}
                        {(preview.estimatedAvgMargin - savedScenario.preview.estimatedAvgMargin).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                    {/* 受影响产品数 */}
                    <TableRow className="text-xs">
                      <TableCell className="font-medium">受影响产品数</TableCell>
                      <TableCell className="text-center tabular-nums">{savedScenario.preview.productsAtRisk}/{savedScenario.preview.totalProducts}</TableCell>
                      <TableCell className="text-center tabular-nums">{preview.productsAtRisk}/{preview.totalProducts}</TableCell>
                      <TableCell className={`text-center tabular-nums font-semibold ${
                        preview.productsAtRisk <= savedScenario.preview.productsAtRisk
                          ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {preview.productsAtRisk - savedScenario.preview.productsAtRisk > 0 ? '+' : ''}
                        {preview.productsAtRisk - savedScenario.preview.productsAtRisk}
                      </TableCell>
                    </TableRow>
                    {/* 风险等级 */}
                    <TableRow className="text-xs">
                      <TableCell className="font-medium">风险等级</TableCell>
                      <TableCell className="text-center"><RiskBadge level={savedScenario.preview.riskLevel} /></TableCell>
                      <TableCell className="text-center"><RiskBadge level={preview.riskLevel} /></TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                    </TableRow>
                    {/* 最差产品 */}
                    <TableRow className="text-xs">
                      <TableCell className="font-medium">最差产品</TableCell>
                      <TableCell className="text-center">
                        {savedScenario.worstProduct ? (
                          <span className="text-red-600">{savedScenario.worstProduct.product} ({savedScenario.worstProduct.marginChange >= 0 ? '+' : ''}{savedScenario.worstProduct.marginChange}%)</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {currentWorstBest.worst ? (
                          <span className="text-red-600">{currentWorstBest.worst.product} ({currentWorstBest.worst.marginChange >= 0 ? '+' : ''}{currentWorstBest.worst.marginChange}%)</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                    </TableRow>
                    {/* 最佳产品 */}
                    <TableRow className="text-xs">
                      <TableCell className="font-medium">最佳产品</TableCell>
                      <TableCell className="text-center">
                        {savedScenario.bestProduct ? (
                          <span className="text-green-600">{savedScenario.bestProduct.product} ({savedScenario.bestProduct.marginChange >= 0 ? '+' : ''}{savedScenario.bestProduct.marginChange}%)</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {currentWorstBest.best ? (
                          <span className="text-green-600">{currentWorstBest.best.product} ({currentWorstBest.best.marginChange >= 0 ? '+' : ''}{currentWorstBest.best.marginChange}%)</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {/* API Results */}
            {apiResult ? (
              <div className="space-y-4 results-appear">
                {/* Impact Summary Cards */}
                {summary && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-rose-50 dark:bg-rose-950/30 rounded-lg p-3 border border-rose-200 dark:border-rose-800">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">平均毛利变化</p>
                      <p className={`text-xl font-bold tabular-nums ${
                        Number(summary.avgMarginChange) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {Number(summary.avgMarginChange) >= 0 ? '+' : ''}{String(summary.avgMarginChange)}%
                      </p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">最差影响产品</p>
                      <p className="text-sm font-bold truncate mt-0.5" title={String(summary.worstAffected)}>
                        {String(summary.worstAffected)}
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                        {Number(summary.worstAffectedChange) >= 0 ? '+' : ''}{String(summary.worstAffectedChange)}%
                      </p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">最佳位置产品</p>
                      <p className="text-sm font-bold truncate mt-0.5" title={String(summary.bestPositioned)}>
                        {String(summary.bestPositioned)}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                        {Number(summary.bestPositionedChange) >= 0 ? '+' : ''}{String(summary.bestPositionedChange)}%
                      </p>
                    </div>
                  </div>
                )}

                {/* Before/After Comparison Bar Chart */}
                {chartData.length > 0 && (
                  <div className="bg-card rounded-lg border p-4">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-cyan-600" />
                      模拟前后毛利率对比
                    </h4>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={chartData} barGap={2} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 80]} />
                        <RechartsTooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number, name: string) => [`${value}%`, name]}
                          labelFormatter={(label: string) => {
                            const item = chartData.find(d => d.name === label);
                            return item?.fullName || label;
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="当前毛利率" radius={[3, 3, 0, 0]} maxBarSize={24}>
                          {chartData.map((_, i) => (
                            <Cell key={`curr-${i}`} fill="#94a3b8" />
                          ))}
                        </Bar>
                        <Bar dataKey="模拟毛利率" radius={[3, 3, 0, 0]} maxBarSize={24}>
                          {chartData.map((entry, i) => (
                            <Cell
                              key={`sim-${i}`}
                              fill={entry.模拟毛利率 < 48 ? '#ef4444' : entry.模拟毛利率 >= entry.当前毛利率 ? '#22c55e' : '#f59e0b'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Sortable Results Table with Filter + Export */}
                {sortedResults.length > 0 && (
                  <div className="bg-card rounded-lg border">
                    <div className="p-3 border-b flex items-center justify-between flex-wrap gap-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Target className="h-4 w-4 text-violet-600" />
                        产品模拟结果明细
                      </h4>
                      <div className="flex items-center gap-2">
                        <Toggle
                          pressed={showHighRiskOnly}
                          onPressedChange={setShowHighRiskOnly}
                          size="sm"
                          className="text-[10px] h-7 gap-1 data-[state=on]:bg-red-100 data-[state=on]:text-red-700 dark:data-[state=on]:bg-red-950/30 dark:data-[state=on]:text-red-400"
                        >
                          <Filter className="h-3 w-3" />
                          仅高风险
                        </Toggle>
                        <ExportMenu
                          data={exportData}
                          columns={exportColumns}
                          filename="模拟结果"
                          variant="outline"
                          size="sm"
                          label=""
                        />
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto overflow-x-auto custom-scrollbar">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-[10px] uppercase tracking-wider">产品</TableHead>
                            <TableHead
                              className="text-[10px] uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                              onClick={() => handleSort('currentMargin')}
                            >
                              <div className="flex items-center gap-1">当前 {sortField !== 'currentMargin' ? <Minus className="h-3 w-3 text-muted-foreground/40" /> : sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}</div>
                            </TableHead>
                            <TableHead
                              className="text-[10px] uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                              onClick={() => handleSort('simulatedMargin')}
                            >
                              <div className="flex items-center gap-1">模拟 {sortField !== 'simulatedMargin' ? <Minus className="h-3 w-3 text-muted-foreground/40" /> : sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}</div>
                            </TableHead>
                            <TableHead
                              className="text-[10px] uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                              onClick={() => handleSort('marginChange')}
                            >
                              <div className="flex items-center gap-1">变化 {sortField !== 'marginChange' ? <Minus className="h-3 w-3 text-muted-foreground/40" /> : sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}</div>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredResults.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                                {showHighRiskOnly ? '没有高风险产品 (模拟毛利率 < 48%)' : '暂无数据'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredResults.map((r) => (
                              <TableRow key={r.sku} className="hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-colors">
                                <TableCell className="text-sm font-medium truncate max-w-[140px]" title={r.product}>
                                  {r.product}
                                </TableCell>
                                <TableCell className="text-sm tabular-nums">{r.currentMargin}%</TableCell>
                                <TableCell className="text-sm tabular-nums font-medium">
                                  <span className={r.simulatedMargin < 48 ? 'text-red-600 dark:text-red-400' : ''}>
                                    {r.simulatedMargin}%
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm tabular-nums">
                                  <div className="flex items-center gap-1">
                                    {r.marginChange > 0 ? (
                                      <ArrowUp className="h-3 w-3 text-green-600 dark:text-green-400" />
                                    ) : r.marginChange < 0 ? (
                                      <ArrowDown className="h-3 w-3 text-red-600 dark:text-red-400" />
                                    ) : (
                                      <Minus className="h-3 w-3 text-muted-foreground" />
                                    )}
                                    <span className={`font-semibold ${
                                      r.marginChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                    }`}>
                                      {r.marginChange >= 0 ? '+' : ''}{r.marginChange}%
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {showHighRiskOnly && filteredResults.length > 0 && (
                      <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground">
                        显示 {filteredResults.length}/{sortedResults.length} 个高风险产品
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Target className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">调整参数后点击 &quot;运行模拟&quot; 查看详细结果</p>
                  {preview && hasChanges && (
                    <p className="text-xs mt-1 text-cyan-600 dark:text-cyan-400">
                      预估毛利变化: {preview.marginChange >= 0 ? '+' : ''}{preview.marginChange}%
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
