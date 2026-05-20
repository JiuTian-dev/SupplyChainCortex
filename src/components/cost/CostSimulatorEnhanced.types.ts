import type { CostRecord } from '@prisma/client';

export interface SimParams {
  exchangeRateChange: number;
  freightChange: number;
  rawMaterialChange: number;
  tariffChange: number;
  laborChange: number;
  platformFeeChange: number;
}

export interface SimulatedProductResult {
  product: string;
  sku: string;
  currentMargin: number;
  simulatedMargin: number;
  marginChange: number;
}

export interface PreviewResult {
  currentAvgMargin: number;
  estimatedAvgMargin: number;
  marginChange: number;
  productsAtRisk: number;
  totalProducts: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  simulatedMargins: SimulatedProductResult[];
}

export interface TornadoItem {
  name: string;
  lowImpact: number;
  highImpact: number;
  totalRange: number;
}

export interface WaterfallItem {
  name: string;
  base: number;
  value: number;
  fill: string;
  isTotal: boolean;
}

export interface ScenarioPresetDef {
  key: string;
  label: string;
  params: Partial<SimParams>;
}

export interface SavedScenario {
  params: SimParams;
  preview: PreviewResult;
  worstProduct: { product: string; marginChange: number } | null;
  bestProduct: { product: string; marginChange: number } | null;
  timestamp: number;
}

export interface SliderConfig {
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

export interface DetailRow {
  product: string;
  sku: string;
  currentMargin: number;
  simulatedMargin: number;
  marginChange: number;
  currentTotalLanded: number;
  simulatedTotalLanded: number;
  totalLandedChange: number;
}
