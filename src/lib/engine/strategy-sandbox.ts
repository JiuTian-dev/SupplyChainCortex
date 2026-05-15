/**
 * Strategy Sandbox Engine — compares, optimizes, and recommends supply chain
 * strategies using the rule-based agent simulation as a backend.
 *
 * Architecture:
 *   strategy-templates.ts  →  strategy-sandbox.ts  →  agent-sandbox.service.ts
 *         (templates)              (orchestrator)         (simulation engine)
 *
 * Each strategy comparison:
 *   1. Initialise state from DB (via agent-sandbox initState)
 *   2. Clone state × N (one per strategy + baseline)
 *   3. Apply strategy modifications to each clone
 *   4. Run N-round simulation on each clone
 *   5. Collect & compare metrics
 */

import {
  type SandboxState,
  type SandboxReport,
  type SandboxRoundResult,
  initState,
  warehouseAgent,
  supplierAgent,
  forwarderAgent,
  marketAgent,
  SCENARIOS,
} from '@/lib/services/agent-sandbox.service';
import { DeterministicRandom, seedFromString } from '@/lib/engine/deterministic';
import {
  type StrategyTemplate,
  type StrategyParameter,
  STRATEGY_TEMPLATES,
  getStrategyTemplate,
} from '@/lib/engine/strategy-templates';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface StrategyResult {
  strategyId: string;
  strategyName: string;
  scenario: string;
  params: Record<string, number>;
  summary: {
    totalStockouts: number;
    totalRevenueLost: number;
    totalDelays: number;
    avgDemand: number;
    resilienceScore: number;
    survivalRate: number;
    maxSingleRoundLoss: number;
    /** Estimated profit (higher = better). Negative of revenueLost. */
    profit: number;
    /** Composite risk score 0-100 (higher = riskier). */
    risk: number;
  };
  roundCount: number;
}

export interface ComparisonDelta {
  strategyId: string;
  profitDelta: number;       // Positive = better profit than baseline
  riskDelta: number;         // Negative = less risk than baseline (good)
  serviceLevelDelta: number; // Positive = better survival rate
  costDelta: number;         // Negative = lower cost than baseline (good)
}

export interface StrategyComparisonResults {
  scenario: string;
  rounds: number;
  baseline: StrategyResult;
  strategies: StrategyResult[];
  deltas: ComparisonDelta[];
  recommended: string | null;
}

export interface ParetoPoint {
  params: Record<string, number>;
  risk: number;
  profit: number;
}

export interface ParamOptimizationResult {
  strategyId: string;
  scenario: string;
  paramRanges: Record<string, [number, number]>;
  paretoFrontier: ParetoPoint[];
  bestParams: Record<string, number>;
  gridSize: number; // number of runs performed
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal: Run N-round simulation on a pre-initialised state
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mirrors `runSandbox()` from agent-sandbox.service.ts but accepts an
 * externally-provided initial state (already modified by strategy).
 */
async function runSimulationWithState(
  initialState: SandboxState,
  scenario: string,
  totalRounds: number,
  seed?: number,
): Promise<SandboxReport> {
  const seedVal = seed ?? seedFromString(`${scenario}-${Date.now()}`);
  const scenarioFn = SCENARIOS[scenario] || SCENARIOS.baseline;
  const rng = new DeterministicRandom(seedVal);

  // Deep clone so we don't mutate the caller's state
  const state = JSON.parse(JSON.stringify(initialState)) as SandboxState;
  const roundResults: SandboxRoundResult[] = [];
  const agents = ['warehouse', 'supplier', 'forwarder', 'market'];

  for (let round = 1; round <= totalRounds; round++) {
    state.round = round;
    const beforeStockouts = state.stockoutEvents;

    scenarioFn(state, round, rng);
    forwarderAgent(state, rng);
    supplierAgent(state, rng);
    marketAgent(state, rng);
    warehouseAgent(state);

    roundResults.push({
      round,
      demand: state.marketDemand,
      weather: state.weatherSeverity,
      fxRate: Math.round(state.exchangeRate * 100) / 100,
      tariffRate: state.tariffRate,
      shipmentsDelayed: state.totalDelays,
      stockouts: state.stockoutEvents - beforeStockouts,
      revenueLost: Math.round(state.totalRevenueLost),
      agentActions: [],
    });
  }

  // Calculate resilience metrics (mirrors runSandbox logic)
  const stockoutRounds = roundResults.filter(r => r.stockouts > 0);
  const maxLoss = roundResults.reduce((max, r) => Math.max(max, r.revenueLost), 0);
  const productsNeverStockedOut = Object.values(state.inventory).filter(i => i.stockStatus !== 'critical').length;
  const totalProducts = Object.keys(state.inventory).length;

  const resilienceScore = Math.min(
    Math.round(
      (1 - stockoutRounds.length / totalRounds) * 40 +
      (productsNeverStockedOut / Math.max(totalProducts, 1)) * 30 +
      (1 - state.totalRevenueLost / Math.max(state.totalRevenueLost + 100000, 1)) * 30,
    ),
    100,
  );

  const survivalRateFinal = Math.round(productsNeverStockedOut / Math.max(totalProducts, 1) * 100);

  return {
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
      resilienceScore,
      worstRound: roundResults.reduce((worst, r, i) =>
        r.revenueLost > (roundResults[worst]?.revenueLost || 0) ? i : worst, 0),
      survivalRate: survivalRateFinal,
      recommendation: '',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. runStrategyComparison
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the same scenario with different strategies and return a comparison matrix.
 *
 * @param scenario  - scenario name (baseline / trade_war / typhoon_season / perfect_storm)
 * @param strategies - list of strategy IDs to compare
 * @param params     - list of param overrides (one per strategy, same order)
 * @param options    - rounds, seed, includeBaseline
 */
export async function runStrategyComparison(
  scenario: string,
  strategies: string[],
  params: Record<string, number>[],
  options?: {
    rounds?: number;
    seed?: number;
    includeBaseline?: boolean;
  },
): Promise<StrategyComparisonResults> {
  const rounds = options?.rounds ?? 100;
  const seed = options?.seed ?? seedFromString(`${scenario}-strategy-${Date.now()}`);
  const rng = new DeterministicRandom(seed);
  const includeBaseline = options?.includeBaseline ?? true;

  // 1. Init fresh state from DB
  const baseState = await initState();

  // Shared seed for fair comparison — all strategies see same random sequence
  const sharedSeed = seed;

  // 2. Run baseline (no strategy)
  let baselineResult: StrategyResult | null = null;
  if (includeBaseline) {
    const baselineReport = await runSimulationWithState(baseState, scenario, rounds, sharedSeed);
    baselineResult = toStrategyResult('baseline', '无策略 (Baseline)', scenario, {}, baselineReport);
  }

  // 3. Run each strategy
  const results: StrategyResult[] = [];
  for (let i = 0; i < strategies.length; i++) {
    const strategyId = strategies[i];
    const strategyParams = params[i] || {};
    const template = getStrategyTemplate(strategyId);

    if (!template) {
      throw new Error(`Unknown strategy: ${strategyId}`);
    }

    // Clone base state and apply strategy
    const modifiedState = template.applyStrategy(baseState, strategyParams);

    // Run simulation with same seed
    const report = await runSimulationWithState(modifiedState, scenario, rounds, sharedSeed);
    results.push(toStrategyResult(strategyId, template.name, scenario, strategyParams, report));
  }

  // 4. Compute deltas
  const deltas = baselineResult
    ? results.map(r => computeDelta(r, baselineResult!))
    : [];

  // 5. Recommend best
  const recommended = deltas.length > 0
    ? getRecommendedStrategy(
        results.map(r => ({
          strategyId: r.strategyId,
          risk: r.summary.risk,
          profit: r.summary.profit,
        })),
        0.5, // moderate risk tolerance
      )
    : null;

  return {
    scenario,
    rounds,
    baseline: baselineResult!,
    strategies: results,
    deltas,
    recommended,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. compareStrategies
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Given an array of StrategyResult, compute pairwise deltas against the
 * first entry (treated as baseline) or against a named baseline strategy.
 */
export function compareStrategies(
  results: StrategyResult[],
  baselineId?: string,
): ComparisonDelta[] {
  if (results.length < 2) return [];

  const baseline = baselineId
    ? results.find(r => r.strategyId === baselineId)
    : results[0];

  if (!baseline) return [];

  return results
    .filter(r => r.strategyId !== baseline.strategyId)
    .map(r => computeDelta(r, baseline));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. getRecommendedStrategy
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Picks the best strategy based on risk/reward profile.
 *
 * Uses a simple scoring function:
 *   score = profit * (1 - riskTolerance) - risk * riskTolerance
 *
 * Higher score = better fit for the given risk tolerance.
 */
export interface RiskRewardItem {
  strategyId: string;
  risk: number;   // 0-100 (higher = riskier)
  profit: number; // monetary value (higher = better)
}

export function getRecommendedStrategy(
  items: RiskRewardItem[],
  riskTolerance: number, // 0 = no risk allowed, 1 = maximum risk appetite
): string | null {
  if (items.length === 0) return null;

  // Normalise profit to 0-1 range for balanced scoring
  const profits = items.map(i => i.profit);
  const minProfit = Math.min(...profits);
  const maxProfit = Math.max(...profits);
  const profitRange = maxProfit - minProfit || 1;

  const risks = items.map(i => i.risk);
  const maxRisk = Math.max(...risks) || 1;

  let bestId = items[0].strategyId;
  let bestScore = -Infinity;

  for (const item of items) {
    const normalisedProfit = (item.profit - minProfit) / profitRange;
    const normalisedRisk = item.risk / maxRisk;

    // score: weighted combination of profit (reward) and inverse risk
    const score = normalisedProfit * (1 - riskTolerance) - normalisedRisk * riskTolerance;

    if (score > bestScore) {
      bestScore = score;
      bestId = item.strategyId;
    }
  }

  return bestId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. optimizeStrategyParams — Grid Search + Pareto Frontier
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple grid search over parameter ranges to find optimal parameter values.
 * Returns the Pareto frontier of (risk, profit).
 *
 * Samples each parameter at `samplesPerDim` points (default 4).
 */
export async function optimizeStrategyParams(
  strategyId: string,
  scenario: string,
  paramRanges: Record<string, [number, number]>,
  options?: {
    samplesPerDim?: number;
    rounds?: number;
    seed?: number;
  },
): Promise<ParamOptimizationResult> {
  const template = getStrategyTemplate(strategyId);
  if (!template) throw new Error(`Unknown strategy: ${strategyId}`);

  const samplesPerDim = options?.samplesPerDim ?? 4;
  const rounds = options?.rounds ?? 30; // fewer rounds for speed during optimization
  const seed = options?.seed ?? seedFromString(`${strategyId}-optimize-${Date.now()}`);
  const baseState = await initState();

  // Build grid of parameter value combinations
  const paramKeys = Object.keys(paramRanges);
  const grids: number[][] = paramKeys.map(key => {
    const [min, max] = paramRanges[key];
    const values: number[] = [];
    for (let i = 0; i < samplesPerDim; i++) {
      const t = samplesPerDim > 1 ? i / (samplesPerDim - 1) : 0.5;
      values.push(Math.round((min + t * (max - min)) * 100) / 100);
    }
    return values;
  });

  // Generate all combinations
  const combinations = cartesianProduct(grids);
  const points: ParetoPoint[] = [];

  // Run simulation for each combination
  for (const combo of combinations) {
    const paramObj: Record<string, number> = {};
    paramKeys.forEach((key, i) => { paramObj[key] = combo[i]; });

    const modifiedState = template.applyStrategy(baseState, paramObj);
    const report = await runSimulationWithState(modifiedState, scenario, rounds, seed);

    const profit = -report.summary.totalRevenueLost;
    const risk = 1 - report.summary.resilienceScore / 100;

    points.push({ params: { ...paramObj }, risk, profit });
  }

  // Find Pareto frontier (non-dominated points)
  const frontier = findParetoFrontier(points);

  // Pick best point: lowest risk among those with profit >= median
  const profits = frontier.map(p => p.profit).sort((a, b) => a - b);
  const medianProfit = profits[Math.floor(profits.length / 2)] || 0;
  const bestPoint = frontier
    .filter(p => p.profit >= medianProfit)
    .sort((a, b) => a.risk - b.risk)[0] || frontier[0];

  return {
    strategyId,
    scenario,
    paramRanges,
    paretoFrontier: frontier,
    bestParams: bestPoint?.params ?? {},
    gridSize: combinations.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. LLM-assisted parameter suggestion
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Uses the project's AI provider to suggest optimal strategy parameters
 * based on current supply chain state.
 *
 * The LLM receives:
 *  - Current inventory levels, costs, supplier ratings
 *  - Strategy description and parameter ranges
 *  - Returns suggested parameter values as JSON
 */
export async function suggestStrategyParams(
  strategy: StrategyTemplate,
  sandboxState: SandboxState,
  options?: {
    provider?: string;
    model?: string;
  },
): Promise<Record<string, number>> {
  const provider = options?.provider ?? 'deepseek';
  const model = options?.model ?? 'deepseek-chat';

  const { chatCompletion } = await import('@/lib/services/ai-providers.service');

  const stateSummary = formatStateForLLM(sandboxState);
  const paramDescriptions = strategy.parameters
    .map(p => `  - ${p.key}: ${p.label} (type=${p.type}, default=${p.default}, range=[${p.min}, ${p.max}], step=${p.step})`)
    .join('\n');

  const systemPrompt = `你是一位供应链优化专家。你的任务是根据当前供应链状态，为一组策略参数推荐最优值。

输出格式：仅返回一个JSON对象，不要包含任何解释或markdown。JSON的key为参数名，value为推荐数值。

示例输出: {"boostPct": 35, "applyToCritical": 1}`;

  const userPrompt = `## 策略
ID: ${strategy.id}
名称: ${strategy.name}
描述: ${strategy.description}
类别: ${strategy.category}

## 可用参数
${paramDescriptions}

## 当前供应链状态
${stateSummary}

## 任务
基于当前状态，为上述策略参数推荐最优值。考虑贸易战/关税/天气等外部因素。
仅返回JSON对象。`;

  try {
    const result = await chatCompletion({
      provider,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 1024,
    });

    const parsed = parseLLMResponse(result.content);
    if (parsed && validateParams(parsed, strategy.parameters)) {
      return parsed;
    }
  } catch {
    // Fall through to default params on error
  }

  // Fallback: return default parameter values
  const defaults: Record<string, number> = {};
  for (const p of strategy.parameters) {
    defaults[p.key] = p.default;
  }
  return defaults;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════════

function toStrategyResult(
  strategyId: string,
  strategyName: string,
  scenario: string,
  params: Record<string, number>,
  report: SandboxReport,
): StrategyResult {
  return {
    strategyId,
    strategyName,
    scenario,
    params,
    summary: {
      totalStockouts: report.summary.totalStockouts,
      totalRevenueLost: report.summary.totalRevenueLost,
      totalDelays: report.summary.totalDelays,
      avgDemand: report.summary.avgDemand,
      resilienceScore: report.summary.resilienceScore,
      survivalRate: report.summary.survivalRate,
      maxSingleRoundLoss: report.summary.maxSingleRoundLoss,
      profit: -report.summary.totalRevenueLost,
      risk: 1 - report.summary.resilienceScore / 100,
    },
    roundCount: report.summary.totalRounds,
  };
}

function computeDelta(result: StrategyResult, baseline: StrategyResult): ComparisonDelta {
  return {
    strategyId: result.strategyId,
    profitDelta: result.summary.profit - baseline.summary.profit,
    riskDelta: result.summary.risk - baseline.summary.risk,
    serviceLevelDelta: result.summary.survivalRate - baseline.summary.survivalRate,
    costDelta: result.summary.totalRevenueLost - baseline.summary.totalRevenueLost,
  };
}

/** Cartesian product of arrays (for grid search). */
function cartesianProduct(arrays: number[][]): number[][] {
  if (arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);
  const result: number[][] = [];
  for (const f of first) {
    for (const rp of restProduct) {
      result.push([f, ...rp]);
    }
  }
  return result;
}

/** Find Pareto frontier: points not dominated by any other point. */
function findParetoFrontier(points: ParetoPoint[]): ParetoPoint[] {
  return points.filter(point =>
    !points.some(other =>
      other !== point &&
      other.profit >= point.profit &&
      other.risk <= point.risk &&
      (other.profit > point.profit || other.risk < point.risk),
    ),
  );
}

/** Format SandboxState as a compact text summary for the LLM. */
function formatStateForLLM(state: SandboxState): string {
  const lines: string[] = [
    `轮次: ${state.round}`,
    `市场需求指数: ${state.marketDemand} (100=基准)`,
    `汇率(CNY/USD): ${state.exchangeRate}`,
    `关税率: ${state.tariffRate}%`,
    `天气严重度: ${state.weatherSeverity}/100`,
    `产品数: ${state.products.length}`,
    `SKU数: ${Object.keys(state.inventory).length}`,
    `供应商数: ${state.suppliers.length}`,
    `货运批次: ${state.shipments.length}`,
    `累计收入损失: ${state.totalRevenueLost}`,
    `累计断货: ${state.stockoutEvents}`,
    `累计延误: ${state.totalDelays}`,
  ];

  // Add inventory summary
  const invValues = Object.values(state.inventory);
  if (invValues.length > 0) {
    const avgStock = invValues.reduce((s, i) => s + i.quantity, 0) / invValues.length;
    const avgSafety = invValues.reduce((s, i) => s + i.safetyStock, 0) / invValues.length;
    const criticalCount = invValues.filter(i => i.stockStatus === 'critical').length;
    lines.push(`平均库存: ${Math.round(avgStock)}, 平均安全库存: ${Math.round(avgSafety)}, 告急SKU: ${criticalCount}`);
  }

  // Add supplier summary
  const avgRating = state.suppliers.reduce((s, sp) => s + sp.rating, 0) / (state.suppliers.length || 1);
  const avgReliability = state.suppliers.reduce((s, sp) => s + sp.reliability, 0) / (state.suppliers.length || 1);
  lines.push(`供应商平均评分: ${avgRating.toFixed(2)}/5, 平均可靠性: ${(avgReliability * 100).toFixed(0)}%`);

  return lines.join('\n');
}

/** Parse JSON from LLM response. */
function parseLLMResponse(text: string): Record<string, number> | null {
  try {
    // Strip markdown fences
    const cleaned = text.replace(/```(?:json)?\s*/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    // Coerce all values to numbers
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      result[key] = Number(value);
    }
    return result;
  } catch {
    return null;
  }
}

/** Validate LLM-suggested params against parameter definitions. */
function validateParams(
  params: Record<string, number>,
  paramDefs: StrategyParameter[],
): boolean {
  for (const def of paramDefs) {
    const value = params[def.key];
    if (value === undefined || value === null) return false;
    if (typeof value !== 'number' || isNaN(value)) return false;
    if (value < def.min || value > def.max) return false;
  }
  return true;
}
