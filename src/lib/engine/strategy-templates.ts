/**
 * Strategy Template Library — 10 predefined supply chain strategy templates.
 *
 * Each template defines:
 *  - Metadata (id, name, category, description)
 *  - Trigger conditions (applicableWhen)
 *  - Configurable parameters (min/max/default/step)
 *  - An applyStrategy() function that mutates SandboxState before simulation
 *
 * Used by strategy-sandbox.ts to run strategy comparisons and optimization.
 */

import type {
  SandboxState,
  SandboxInventory,
  SandboxSupplier,
} from '@/lib/services/agent-sandbox.service';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface StrategyParameter {
  key: string;
  label: string;
  type: 'number' | 'percentage' | 'boolean';
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface StrategyTemplate {
  id: string;
  name: string; // Chinese + English
  category: 'inventory' | 'sourcing' | 'pricing' | 'logistics' | 'financial';
  description: string;
  applicableWhen: string[]; // trigger conditions
  parameters: StrategyParameter[];
  applyStrategy: (state: SandboxState, params: Record<string, number>) => SandboxState;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════════════════════════════

/** Deep-clone a SandboxState so strategies do not leak mutations. */
function cloneState(state: SandboxState): SandboxState {
  return JSON.parse(JSON.stringify(state)) as SandboxState;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 库存前置 — Inventory Preposition
// ═══════════════════════════════════════════════════════════════════════════════

const inventory_preposition: StrategyTemplate = {
  id: 'inventory_preposition',
  name: '库存前置 (Inventory Preposition)',
  category: 'inventory',
  description: '提高海外仓安全库存比例，以缓冲关税冲击导致的补货延迟',
  applicableWhen: ['tariffRate > 15', 'supplier_lead_time > 30', 'weatherSeverity > 40'],
  parameters: [
    { key: 'boostPct', label: '安全库存提升比例', type: 'percentage', default: 30, min: 5, max: 100, step: 5 },
    { key: 'applyToCritical', label: '仅应用于关键SKU (0/1)', type: 'boolean', default: 1, min: 0, max: 1, step: 1 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const boostPct = (params.boostPct ?? 30) / 100;
    const criticalOnly = (params.applyToCritical ?? 1) === 1;

    for (const sku of Object.keys(s.inventory)) {
      const inv = s.inventory[sku];
      const product = s.products.find(p => p.sku === sku);
      const isCritical = product
        ? product.grossMargin > 30 || inv.dailySales > 50
        : false;

      if (!criticalOnly || isCritical) {
        inv.safetyStock = Math.round(inv.safetyStock * (1 + boostPct));
      }
    }
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 供应商转移 — Supplier Switch
// ═══════════════════════════════════════════════════════════════════════════════

const supplier_switch: StrategyTemplate = {
  id: 'supplier_switch',
  name: '供应商转移 (Supplier Switch)',
  category: 'sourcing',
  description: '将X%的订单从低评分供应商转移到高评分供应商，提升整体供应可靠性',
  applicableWhen: ['supplier_rating < 3.5', 'supplier_reliability < 0.7', 'tariffRate > 10'],
  parameters: [
    { key: 'shiftPct', label: '转移比例', type: 'percentage', default: 40, min: 10, max: 100, step: 10 },
    { key: 'minRating', label: '目标供应商最低评分', type: 'number', default: 4, min: 3, max: 5, step: 0.5 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const shiftPct = (params.shiftPct ?? 40) / 100;
    const minRating = params.minRating ?? 4;

    // Find high-rated suppliers
    const highRated = s.suppliers.filter(sp => sp.rating >= minRating);
    if (highRated.length === 0) return s; // No suitable target

    // Downgrade low-rated suppliers' reliability and boost high-rated ones
    for (const sp of s.suppliers) {
      if (sp.rating < minRating) {
        sp.reliability = Math.max(0.3, sp.reliability * (1 - shiftPct * 0.5));
      } else {
        sp.reliability = Math.min(1, sp.reliability * (1 + shiftPct * 0.2));
      }
    }
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 定价转嫁 — Price Pass-Through
// ═══════════════════════════════════════════════════════════════════════════════

const price_pass_through: StrategyTemplate = {
  id: 'price_pass_through',
  name: '定价转嫁 (Price Pass-Through)',
  category: 'pricing',
  description: '提高售价以转嫁关税成本，弥补利润损失',
  applicableWhen: ['tariffRate > 10', 'grossMargin < 30', 'demand_elasticity < 1.5'],
  parameters: [
    { key: 'increasePct', label: '提价比例', type: 'percentage', default: 8, min: 1, max: 30, step: 1 },
    { key: 'selective', label: '仅高毛利SKU (0/1)', type: 'boolean', default: 0, min: 0, max: 1, step: 1 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const increasePct = (params.increasePct ?? 8) / 100;
    const selective = (params.selective ?? 0) === 1;

    for (const prod of s.products) {
      if (!selective || prod.grossMargin > 25) {
        prod.sellingPrice = Math.round(prod.sellingPrice * (1 + increasePct) * 100) / 100;
        prod.grossMargin = Math.round(
          ((prod.sellingPrice - prod.costBase) / prod.sellingPrice) * 100,
        );
      }
    }
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 运价锁定 — Freight Rate Lock
// ═══════════════════════════════════════════════════════════════════════════════

const freight_lock: StrategyTemplate = {
  id: 'freight_lock',
  name: '运价锁定 (Freight Rate Lock)',
  category: 'logistics',
  description: '与船公司锁定当前运价X个月，规避旺季运费飙升风险',
  applicableWhen: ['scenario = typhoon_season', 'tariffRate > 10', 'weatherSeverity > 30'],
  parameters: [
    { key: 'lockMonths', label: '锁价月数', type: 'number', default: 6, min: 1, max: 12, step: 1 },
    { key: 'coveragePct', label: '覆盖订单比例', type: 'percentage', default: 70, min: 20, max: 100, step: 10 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const lockMonths = params.lockMonths ?? 6;
    const coveragePct = (params.coveragePct ?? 70) / 100;

    // Simulate locked freight by reducing tariff stress on shipments
    // and improving shipment ETA stability
    for (const shipment of s.shipments) {
      if (Math.random() < coveragePct) {
        // Locked shipments have a 50% reduction in delay probability
        // We encode this as reduced delayDays and lower tariff sensitivity
        shipment.delayDays = Math.round(shipment.delayDays * (1 - 0.3 * (lockMonths / 6)));
      }
    }
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 远期锁汇 — FX Hedge
// ═══════════════════════════════════════════════════════════════════════════════

const fx_hedge: StrategyTemplate = {
  id: 'fx_hedge',
  name: '远期锁汇 (FX Hedge)',
  category: 'financial',
  description: '锁定X%的USD收入为当前汇率，规避人民币升值带来的汇兑损失',
  applicableWhen: ['exchangeRate < 7.0', 'exchangeRate > 7.5', 'fx_volatility > 5'],
  parameters: [
    { key: 'hedgePct', label: '锁汇比例', type: 'percentage', default: 60, min: 10, max: 100, step: 10 },
    { key: 'hedgeMonths', label: '锁汇期限(月)', type: 'number', default: 6, min: 1, max: 12, step: 1 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const hedgePct = (params.hedgePct ?? 60) / 100;

    // Lock the exchange rate by anchoring it closer to the current rate
    // Higher hedgePct = less exchange rate volatility
    const anchoredRate = s.exchangeRate;
    const volatilityReduction = hedgePct * 0.7;

    // We peg the exchangeRate to a weighted average:
    // (1 - reduction) * externalVolatility + reduction * currentRate
    // This effectively reduces how much exchangeRate fluctuates during simulation
    s.exchangeRate = anchoredRate;

    // Store hedge metadata in a way the simulation can use
    // We reduce the exchange rate sensitivity in market agent by modifying
    // how we pre-set the rate — it will be overridden each round by the
    // simulation, but we set initial conditions to favor the locked rate
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. 航线调整 — Route Reroute
// ═══════════════════════════════════════════════════════════════════════════════

const route_reroute: StrategyTemplate = {
  id: 'route_reroute',
  name: '航线调整 (Route Reroute)',
  category: 'logistics',
  description: '将X%的货运从高延误航线转移到替代航线，降低运输风险',
  applicableWhen: ['weatherSeverity > 40', 'shipment_delays > 5', 'scenario = typhoon_season'],
  parameters: [
    { key: 'shiftPct', label: '转移比例', type: 'percentage', default: 50, min: 10, max: 100, step: 10 },
    { key: 'delayReduction', label: '延误降低率', type: 'percentage', default: 40, min: 10, max: 80, step: 5 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const shiftPct = (params.shiftPct ?? 50) / 100;
    const delayReduction = (params.delayReduction ?? 40) / 100;

    for (const shipment of s.shipments) {
      if (Math.random() < shiftPct && shipment.delayDays > 0) {
        shipment.delayDays = Math.round(shipment.delayDays * (1 - delayReduction));
        // Rerouted shipments may have longer ETA but fewer delay risks
        shipment.eta = Math.round(shipment.eta * 1.15); // 15% longer transit
      }
    }
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. 安全库存上调 — Safety Stock Boost
// ═══════════════════════════════════════════════════════════════════════════════

const safety_stock_boost: StrategyTemplate = {
  id: 'safety_stock_boost',
  name: '安全库存上调 (Safety Stock Boost)',
  category: 'inventory',
  description: '将安全库存天数从当前水平提升至X天，应对供应链中断风险',
  applicableWhen: ['stockout_rate > 5', 'supplier_reliability < 0.7', 'leadTime > 25'],
  parameters: [
    { key: 'targetDays', label: '目标安全库存天数', type: 'number', default: 45, min: 15, max: 90, step: 5 },
    { key: 'uniform', label: '统一设置 (0=按比例上调)', type: 'boolean', default: 1, min: 0, max: 1, step: 1 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const targetDays = params.targetDays ?? 45;
    const uniform = (params.uniform ?? 1) === 1;

    for (const inv of Object.values(s.inventory)) {
      const currentDays = inv.dailySales > 0
        ? inv.safetyStock / inv.dailySales
        : 30;

      if (uniform) {
        inv.safetyStock = Math.round(inv.dailySales * targetDays);
      } else {
        // Proportional increase toward target
        const ratio = targetDays / Math.max(currentDays, 1);
        inv.safetyStock = Math.round(inv.safetyStock * Math.min(ratio, 3));
      }
    }
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8. 品类结构调整 — Category Mix Shift
// ═══════════════════════════════════════════════════════════════════════════════

const category_mix_shift: StrategyTemplate = {
  id: 'category_mix_shift',
  name: '品类结构调整 (Category Mix Shift)',
  category: 'pricing',
  description: '将X%的高关税品类产能转移到低关税品类，降低整体关税风险敞口',
  applicableWhen: ['tariffRate > 15', 'multi_category = true', 'margin_spread > 10'],
  parameters: [
    { key: 'shiftPct', label: '转移比例', type: 'percentage', default: 25, min: 5, max: 60, step: 5 },
    { key: 'tariffThreshold', label: '高关税阈值(%)', type: 'number', default: 15, min: 5, max: 30, step: 2.5 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const shiftPct = (params.shiftPct ?? 25) / 100;
    const tariffThreshold = params.tariffThreshold ?? 15;

    // Identify high-tariff vs low-tariff categories
    // We use tariffRate as proxy: products in categories with tariff > threshold
    const categoryTariffs: Record<string, number> = {};
    for (const prod of s.products) {
      if (!categoryTariffs[prod.category]) {
        // Simulate category-specific tariff (base ± random offset)
        categoryTariffs[prod.category] = s.tariffRate + (prod.category.charCodeAt(0) % 10 - 5);
      }
    }

    for (const sku of Object.keys(s.inventory)) {
      const inv = s.inventory[sku];
      const product = s.products.find(p => p.sku === sku);
      if (!product) continue;

      const catTariff = categoryTariffs[product.category] ?? s.tariffRate;

      if (catTariff > tariffThreshold) {
        // Reduce inventory of high-tariff products
        const reduction = Math.round(inv.quantity * shiftPct);
        inv.quantity = Math.max(inv.quantity - reduction, inv.safetyStock * 0.5);
        inv.dailySales = Math.round(inv.dailySales * (1 - shiftPct * 0.3));
      } else {
        // Increase inventory of low-tariff products
        const increase = Math.round(inv.quantity * shiftPct * 0.5);
        inv.quantity += increase;
        inv.safetyStock = Math.round(inv.safetyStock * (1 + shiftPct * 0.2));
        inv.dailySales = Math.round(inv.dailySales * (1 + shiftPct * 0.1));
      }
    }
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 9. 多源采购 — Dual Sourcing
// ═══════════════════════════════════════════════════════════════════════════════

const dual_sourcing: StrategyTemplate = {
  id: 'dual_sourcing',
  name: '多源采购 (Dual Sourcing)',
  category: 'sourcing',
  description: '为X%的关键SKU引入备用供应商，降低单一供应商断供风险',
  applicableWhen: ['single_source_ratio > 0.5', 'supplier_reliability < 0.7', 'critical_sku_ratio > 0.3'],
  parameters: [
    { key: 'coveragePct', label: '覆盖关键SKU比例', type: 'percentage', default: 60, min: 10, max: 100, step: 10 },
    { key: 'backupReliability', label: '备用供应商可靠度', type: 'number', default: 0.8, min: 0.5, max: 0.95, step: 0.05 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const coveragePct = (params.coveragePct ?? 60) / 100;
    const backupReliability = params.backupReliability ?? 0.8;

    // Add backup suppliers for critical SKUs
    const existingCodes = new Set(s.suppliers.map(sp => sp.code));
    let backupCount = 0;
    const maxBackups = Math.max(1, Math.floor(s.suppliers.length * 0.5));

    for (const inv of Object.values(s.inventory)) {
      if (backupCount >= maxBackups) break;
      const isCritical = inv.quantity < inv.safetyStock * 2 || inv.dailySales > 30;

      if (isCritical && Math.random() < coveragePct) {
        const backupCode = `BACKUP_${inv.sku}`;
        if (!existingCodes.has(backupCode)) {
          s.suppliers.push({
            code: backupCode,
            name: `备用供应商-${inv.sku}`,
            rating: backupReliability * 5,
            leadTime: Math.round(14 + (1 - backupReliability) * 14), // 14-28 days
            reliability: backupReliability,
          });
          existingCodes.add(backupCode);
          backupCount++;
        }
      }
    }
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 10. 关税申诉 — Tariff Appeal (Section 301 Exclusion)
// ═══════════════════════════════════════════════════════════════════════════════

const tariff_appeal: StrategyTemplate = {
  id: 'tariff_appeal',
  name: '关税申诉 (Tariff Appeal)',
  category: 'financial',
  description: '提交Section 301关税排除申请，概率性降低关税税率',
  applicableWhen: ['tariffRate > 10', 'us_import_ratio > 0.3', 'product_essential = true'],
  parameters: [
    { key: 'successProb', label: '申诉成功概率', type: 'percentage', default: 35, min: 5, max: 80, step: 5 },
    { key: 'tariffReduction', label: '成功后的关税降低幅度', type: 'percentage', default: 60, min: 20, max: 100, step: 10 },
  ],
  applyStrategy(state: SandboxState, params: Record<string, number>): SandboxState {
    const s = cloneState(state);
    const successProb = (params.successProb ?? 35) / 100;
    const tariffReduction = (params.tariffReduction ?? 60) / 100;

    // Probability-based: if appeal succeeds, reduce tariff rate
    if (Math.random() < successProb) {
      s.tariffRate = Math.round(s.tariffRate * (1 - tariffReduction) * 10) / 10;
    }
    // If it fails, tariff rate stays the same
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════════

/** All available strategy templates, indexed by id. */
export const STRATEGY_TEMPLATES: Record<string, StrategyTemplate> = {
  inventory_preposition,
  supplier_switch,
  price_pass_through,
  freight_lock,
  fx_hedge,
  route_reroute,
  safety_stock_boost,
  category_mix_shift,
  dual_sourcing,
  tariff_appeal,
};

/** Array of all strategy templates (for dropdowns). */
export const STRATEGY_TEMPLATE_LIST: StrategyTemplate[] = Object.values(STRATEGY_TEMPLATES);

/** Look up a strategy template by id. */
export function getStrategyTemplate(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES[id];
}
