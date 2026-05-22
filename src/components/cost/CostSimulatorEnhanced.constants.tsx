import type { SimParams, ScenarioPresetDef, SliderConfig } from './CostSimulatorEnhanced.types';

export const DEFAULT_PARAMS: SimParams = {
  exchangeRateChange: 0,
  freightChange: 0,
  rawMaterialChange: 0,
  tariffChange: 0,
  laborChange: 0,
  platformFeeChange: 0,
};

export const SCENARIO_PRESETS: ScenarioPresetDef[] = [
  { key: 'tradeWar', label: '贸易战', params: { tariffChange: 25, exchangeRateChange: 10, freightChange: 15 } },
  { key: 'rawMaterialCrisis', label: '原材料危机', params: { rawMaterialChange: 20, freightChange: 10 } },
  { key: 'rmbAppreciation', label: '人民币升值', params: { exchangeRateChange: 15, platformFeeChange: 5 } },
  { key: 'freightSurge', label: '运费飙升', params: { freightChange: 40, rawMaterialChange: 5 } },
  { key: 'fullPressure', label: '全面压力', params: { exchangeRateChange: 15, freightChange: 15, rawMaterialChange: 15, tariffChange: 15, laborChange: 15, platformFeeChange: 15 } },
];

export const FACTOR_ORDER: { key: keyof SimParams; label: string; color: string }[] = [
  { key: 'exchangeRateChange', label: '汇率', color: '#06b6d4' },
  { key: 'freightChange', label: '运费', color: '#8b5cf6' },
  { key: 'rawMaterialChange', label: '原材料', color: '#f97316' },
  { key: 'tariffChange', label: '关税', color: '#f43f5e' },
  { key: 'laborChange', label: '人工', color: '#f59e0b' },
  { key: 'platformFeeChange', label: '平台费', color: '#10b981' },
];

export const SLIDER_CONFIGS: SliderConfig[] = [
  {
    key: 'exchangeRateChange', label: '汇率变化', min: -20, max: 20, step: 1,
    lowLabel: '人民币贬值 -20%', highLabel: '人民币升值 +20%',
    icon: <span className="text-sm">💱</span>, color: 'cyan',
  },
  {
    key: 'freightChange', label: '运费/物流变化', min: -30, max: 50, step: 1,
    lowLabel: '运费下降 -30%', highLabel: '运费上涨 +50%',
    icon: <span className="text-sm">🚢</span>, color: 'violet',
  },
  {
    key: 'rawMaterialChange', label: '原材料成本变化', min: -15, max: 25, step: 1,
    lowLabel: '原材料下降 -15%', highLabel: '原材料上涨 +25%',
    icon: <span className="text-sm">🏭</span>, color: 'orange',
  },
  {
    key: 'tariffChange', label: '关税变化', min: -50, max: 100, step: 1,
    lowLabel: '关税下降 -50%', highLabel: '关税上涨 +100%',
    icon: <span className="text-sm">🏛️</span>, color: 'rose',
  },
  {
    key: 'laborChange', label: '人工成本变化', min: -10, max: 30, step: 1,
    lowLabel: '人工下降 -10%', highLabel: '人工上涨 +30%',
    icon: <span className="text-sm">👷</span>, color: 'amber',
  },
  {
    key: 'platformFeeChange', label: '平台费变化', min: -20, max: 20, step: 1,
    lowLabel: '平台费下降 -20%', highLabel: '平台费上涨 +20%',
    icon: <span className="text-sm">🛒</span>, color: 'emerald',
  },
];

export const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};
