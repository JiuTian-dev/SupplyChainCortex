/**
 * Multi-Agent Supply Chain Sandbox
 *
 * Lightweight rule-driven simulation: 4 agent roles interact in a shared state
 * over N rounds to stress-test supply chain resilience.
 *
 * NOT LLM-driven — each agent is a pure decision function. No API calls.
 * Runtime: ~100ms for 100 rounds. Memory: ~20MB.
 *
 * Purpose: validate DecisionGraph recommendations before real-world execution.
 */

import { db } from '@/lib/db';
import { DeterministicRandom, seedFromString } from '@/lib/engine/deterministic';
import { agentMemory } from '@/lib/engine/memory';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SandboxState {
  round: number;
  products: SandboxProduct[];
  inventory: Record<string, SandboxInventory>;
  shipments: SandboxShipment[];
  suppliers: SandboxSupplier[];
  marketDemand: number;        // 0-200 (100 = baseline)
  exchangeRate: number;        // CNY/USD
  weatherSeverity: number;     // 0-100
  tariffRate: number;          // %
  totalRevenueLost: number;
  totalDelays: number;
  stockoutEvents: number;
}

export interface SandboxProduct {
  sku: string; name: string; category: string;
  sellingPrice: number; costBase: number; grossMargin: number;
}

export interface SandboxInventory {
  sku: string; quantity: number; safetyStock: number;
  dailySales: number; inTransit: number; stockStatus: string;
}

export interface SandboxShipment {
  id: string; sku: string; origin: string; destination: string;
  delayDays: number; status: string; eta: number; // days from now
}

export interface SandboxSupplier {
  code: string; name: string; rating: number;
  leadTime: number; // days
  reliability: number; // 0-1
}

export interface AgentAction {
  type: string;
  description: string;
  impact: Record<string, number>;
}

export interface SandboxRoundResult {
  round: number;
  demand: number;
  weather: number;
  fxRate: number;
  tariffRate: number;
  shipmentsDelayed: number;
  stockouts: number;
  revenueLost: number;
  agentActions: string[];
}

export interface SandboxReport {
  config: { rounds: number; scenario: string };
  agents: string[];
  rounds: SandboxRoundResult[];
  summary: {
    totalRounds: number;
    totalStockouts: number;
    totalRevenueLost: number;
    totalDelays: number;
    avgDemand: number;
    maxSingleRoundLoss: number;
    resilienceScore: number;     // 0-100, higher = more resilient
    worstRound: number;
    survivalRate: number;        // % of products that never stocked out
    recommendation: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent 1: Warehouse Manager
// ═══════════════════════════════════════════════════════════════════════════════

export function warehouseAgent(state: SandboxState): AgentAction {
  const actions: string[] = [];
  let totalReplenished = 0;

  for (const [sku, inv] of Object.entries(state.inventory)) {
    const product = state.products.find(p => p.sku === sku);
    if (!product) continue;

    // Reorder logic: if below safety stock, place order
    if (inv.quantity < inv.safetyStock) {
      const orderQty = Math.round(inv.safetyStock * 2 - inv.quantity);
      inv.quantity += orderQty;
      totalReplenished += orderQty;
      actions.push(`补货 ${sku}: +${orderQty}`);
    }

    // Daily sales consumption
    const sold = Math.round(inv.dailySales * (state.marketDemand / 100));
    inv.quantity = Math.max(0, inv.quantity - sold);

    // Check stockout
    if (inv.quantity <= 0) {
      inv.stockStatus = 'critical';
      state.stockoutEvents++;
      state.totalRevenueLost += product.sellingPrice * inv.dailySales;
    } else if (inv.quantity < inv.safetyStock * 0.5) {
      inv.stockStatus = 'warning';
    } else {
      inv.stockStatus = 'healthy';
    }
  }

  return { type: 'warehouse', description: actions.join('; ') || '库存正常', impact: { replenished: totalReplenished } };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent 2: Supplier
// ═══════════════════════════════════════════════════════════════════════════════

export function supplierAgent(state: SandboxState, rng: DeterministicRandom): AgentAction {
  const delays: string[] = [];
  let totalDelay = 0;

  for (const supplier of state.suppliers) {
    const baseReliability = supplier.reliability;
    const stressFactor = 0.3 * (state.weatherSeverity / 100) + 0.2 * (Math.abs(state.exchangeRate - 7.25) / 7.25);
    const effectiveReliability = Math.max(0.3, baseReliability - stressFactor);

    if (rng.chance(1 - effectiveReliability)) {
      const delay = Math.round((1 - effectiveReliability) * supplier.leadTime * 1.5);
      totalDelay += delay;
      delays.push(`${supplier.name}: 延迟 ${delay} 天`);
    }
  }

  return { type: 'supplier', description: delays.join('; ') || '供应商正常', impact: { totalDelay } };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent 3: Freight Forwarder
// ═══════════════════════════════════════════════════════════════════════════════

export function forwarderAgent(state: SandboxState, rng: DeterministicRandom): AgentAction {
  let totalDelays = 0;
  const delayed: string[] = [];

  for (const shipment of state.shipments) {
    const weatherDelayProb = (state.weatherSeverity / 100) * 0.43;
    const tariffStress = state.tariffRate > 15 ? 0.2 : state.tariffRate > 7 ? 0.1 : 0;

    if (rng.chance(weatherDelayProb + tariffStress)) {
      const extraDays = Math.round(state.weatherSeverity * 0.08 + rng.nextFloat(0, 3));
      shipment.delayDays += extraDays;
      shipment.eta += extraDays;
      totalDelays += extraDays;
      delayed.push(`${shipment.id}: +${extraDays}天`);
      state.totalDelays++;
    }

    // Shipment arrival reduces inTransit and adds to inventory
    shipment.eta--;
    if (shipment.eta <= 0 && shipment.status === 'in_transit') {
      shipment.status = 'delivered';
      const inv = state.inventory[shipment.sku];
      if (inv) inv.inTransit = Math.max(0, inv.inTransit - 1);
    }
  }

  return { type: 'forwarder', description: delayed.join('; ') || '货运正常', impact: { totalDelays } };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent 4: Market
// ═══════════════════════════════════════════════════════════════════════════════

export function marketAgent(state: SandboxState, rng: DeterministicRandom): AgentAction {
  const seasonal = Math.sin((state.round / 50) * Math.PI) * 15;
  const fxEffect = (7.25 - state.exchangeRate) / 7.25 * 20;
  const tariffEffect = state.tariffRate > 10 ? -10 : 0;
  const noise = (rng.next() - 0.5) * 10;

  const newDemand = Math.max(50, Math.min(150, 100 + seasonal + fxEffect + tariffEffect + noise));
  state.marketDemand = Math.round(newDemand);

  return { type: 'market', description: `需求指数: ${state.marketDemand}`, impact: { demand: state.marketDemand } };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scenarios
// ═══════════════════════════════════════════════════════════════════════════════

const SCENARIOS: Record<string, (state: SandboxState, round: number, rng: DeterministicRandom) => void> = {
  baseline: () => { /* no external shock */ },
  trade_war: (state, round, rng) => {
    if (round === 30) state.tariffRate = 25;
    if (round === 60) state.tariffRate = 7.5;
    state.exchangeRate += (rng.next() - 0.5) * 0.3;
  },
  typhoon_season: (state, round, rng) => {
    if (round > 20 && round < 50) state.weatherSeverity = 50 + rng.nextFloat(0, 40);
    else state.weatherSeverity = 10 + rng.nextFloat(0, 20);
  },
  perfect_storm: (state, round, rng) => {
    if (round === 20) { state.weatherSeverity = 80; state.tariffRate = 25; }
    if (round > 20 && round < 60) state.weatherSeverity = 60 + rng.nextFloat(0, 30);
    if (round === 40) state.exchangeRate = 6.2;
    state.exchangeRate += (rng.next() - 0.5) * 0.5;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Initialization from DB
// ═══════════════════════════════════════════════════════════════════════════════

export async function initState(): Promise<SandboxState> {
  const [products, inventories, shipments, suppliers] = await Promise.all([
    db.product.findMany({ take: 50 }),
    db.inventory.findMany({ take: 50 }),
    db.shipmentItem.findMany({ where: { status: { in: ['in_transit', 'pending', 'customs'] } }, take: 30 }),
    db.supplier.findMany({ take: 10 }),
  ]);

  const invMap: Record<string, SandboxInventory> = {};
  for (const inv of inventories) {
    invMap[inv.sku] = {
      sku: inv.sku, quantity: inv.quantity, safetyStock: inv.safetyStock,
      dailySales: Math.round(inv.quantity / Math.max(inv.turnoverDays, 1)),
      inTransit: inv.inTransit, stockStatus: inv.stockStatus,
    };
  }

  return {
    round: 0,
    products: products.map(p => ({
      sku: p.sku, name: p.name, category: p.category,
      sellingPrice: p.sellingPrice, costBase: p.unitCost,
      grossMargin: 50, // Will be recalculated
    })),
    inventory: invMap,
    shipments: shipments.map(s => ({
      id: s.id, sku: s.sku, origin: s.origin, destination: s.destination,
      delayDays: s.delayDays, status: s.status,
      eta: s.eta ? Math.round((new Date(s.eta).getTime() - Date.now()) / 86400000) : 14,
    })),
    suppliers: suppliers.map(s => ({
      code: s.code, name: s.name, rating: s.rating,
      leadTime: s.leadTime, reliability: s.rating / 5,
    })),
    marketDemand: 100,
    exchangeRate: 7.25,
    weatherSeverity: 15,
    tariffRate: 7.5,
    totalRevenueLost: 0,
    totalDelays: 0,
    stockoutEvents: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Engine
// ═══════════════════════════════════════════════════════════════════════════════

export async function runSandbox(options?: {
  scenario?: 'baseline' | 'trade_war' | 'typhoon_season' | 'perfect_storm';
  rounds?: number;
  seed?: number | string;
}): Promise<SandboxReport> {
  const scenario = options?.scenario || 'perfect_storm';
  const totalRounds = options?.rounds || 100;
  const seed = options?.seed ?? seedFromString(`${scenario}-${Date.now()}`);
  const scenarioFn = SCENARIOS[scenario] || SCENARIOS.baseline;
  const rng = new DeterministicRandom(typeof seed === 'string' ? seedFromString(seed) : seed);

  const state = await initState();
  const roundResults: SandboxRoundResult[] = [];
  const agents = ['warehouse', 'supplier', 'forwarder', 'market'];

  for (let round = 1; round <= totalRounds; round++) {
    state.round = round;
    const beforeStockouts = state.stockoutEvents;

    // Apply external scenario
    scenarioFn(state, round, rng);

    // Agents act in order
    const forwarderAction = forwarderAgent(state, rng);
    const supplierAction = supplierAgent(state, rng);
    const marketAction = marketAgent(state, rng);
    const warehouseAction = warehouseAgent(state);

    const agentActions = [
      forwarderAction.description,
      supplierAction.description,
      marketAction.description,
      warehouseAction.description,
    ].filter(a => a && a !== '货运正常' && a !== '供应商正常' && a !== '库存正常');

    roundResults.push({
      round,
      demand: state.marketDemand,
      weather: state.weatherSeverity,
      fxRate: Math.round(state.exchangeRate * 100) / 100,
      tariffRate: state.tariffRate,
      shipmentsDelayed: state.totalDelays,
      stockouts: state.stockoutEvents - beforeStockouts,
      revenueLost: Math.round(state.totalRevenueLost),
      agentActions,
    });
  }

  // Calculate resilience metrics
  const stockoutRounds = roundResults.filter(r => r.stockouts > 0);
  const maxLoss = roundResults.reduce((max, r) => Math.max(max, r.revenueLost), 0);
  const worstRound = roundResults.reduce((worst, r) => r.revenueLost > (roundResults[worst]?.revenueLost || 0) ? r.round - 1 : worst, 0);
  const productsNeverStockedOut = Object.values(state.inventory).filter(i => i.stockStatus !== 'critical').length;
  const totalProducts = Object.keys(state.inventory).length;
  const resilienceScore = Math.round(
    (1 - stockoutRounds.length / totalRounds) * 40 +  // Fewer stockout rounds = better
    (productsNeverStockedOut / Math.max(totalProducts, 1)) * 30 +  // More surviving products = better
    (1 - state.totalRevenueLost / Math.max(state.totalRevenueLost + 100000, 1)) * 30  // Less loss = better
  );

  const resilienceScoreFinal = Math.min(resilienceScore, 100);
  const survivalRateFinal = Math.round(productsNeverStockedOut / Math.max(totalProducts, 1) * 100);
  const recommendationText = resilienceScoreFinal >= 70
    ? '供应链韧性良好，可承受中度冲击'
    : resilienceScoreFinal >= 40
      ? '供应链存在脆弱点，建议增加安全库存和供应商多元化'
      : '供应链韧性不足，需要系统性加固（多源供应商 + 替代路线 + 安全库存提升）';

  const report = {
    config: { rounds: totalRounds, scenario },
    agents,
    rounds: roundResults,
    summary: {
      totalRounds,
      totalStockouts: state.stockoutEvents,
      totalRevenueLost: Math.round(state.totalRevenueLost),
      totalDelays: state.totalDelays,
      avgDemand: Math.round(roundResults.reduce((s, r) => s + r.demand, 0) / totalRounds),
      maxSingleRoundLoss: maxLoss,
      resilienceScore: resilienceScoreFinal,
      worstRound,
      survivalRate: survivalRateFinal,
      recommendation: recommendationText,
    },
  };

  // Write to shared agent memory
  agentMemory.updateShared('sandbox', {
    lastRun: new Date().toISOString(),
    scenario: scenario || 'baseline',
    resilienceScore: resilienceScoreFinal,
    survivalRate: survivalRateFinal,
    totalStockouts: state.stockoutEvents,
    totalDelays: state.totalDelays,
    summary: recommendationText,
  });
  return report;
}

export { SCENARIOS };
