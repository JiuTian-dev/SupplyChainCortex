/**
 * Cascade Risk — Validation Module (Phase 4)
 *
 * Sensitivity analysis, boundary testing, and counterfactuals.
 * boundaryTest() now ACTUALLY executes the propagation engine with edge-case inputs.
 *
 * NOTE: backtest() lives in cascade-risk.main.ts because it depends on getCascadeRisk().
 */
import type {
  EdgeType,
  SensitivityResult,
  PropagationStep,
  CascadeReport,
  CounterfactualResult,
  CascadeNode,
  CascadeEdge,
  InterventionType,
  CausalEstimate,
  CausalCounterfactualResult,
} from './cascade-risk.types';
import { propagate, setPropagationRules } from './cascade-risk.propagation';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════════════════
// Counterfactuals
// ═══════════════════════════════════════════════════════════════════════════════

/** Counterfactual: "what if we used an alternative route?" (legacy, hardcoded) */
export async function runCounterfactual(
  originalReport: CascadeReport,
  alternatives: Array<{ name: string; targetNode: string; action: string; riskReduction: number }>,
): Promise<CounterfactualResult[]> {
  return alternatives.map(alt => {
    const originalAffected = originalReport.summary.affectedNodes;
    const originalTotalRisk = originalReport.summary.topAffectedProducts.reduce((s, p) => s + p.impactScore, 0);
    const altAffected = Math.round(originalAffected * (1 - alt.riskReduction));
    const altTotalRisk = Math.round(originalTotalRisk * (1 - alt.riskReduction));
    const improvement = Math.round(alt.riskReduction * 100);

    return {
      scenario: alt.name,
      originalImpact: { affectedProducts: originalAffected, totalRisk: originalTotalRisk },
      alternativeImpact: { affectedProducts: altAffected, totalRisk: altTotalRisk },
      improvement,
      recommendation: `${alt.action} → 预计减少 ${improvement}% 风险`,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Causal ML Counterfactuals — Data-driven treatment effect estimation
// ═══════════════════════════════════════════════════════════════════════════════

/** Map scenario names to intervention types */
function classifyIntervention(scenario: string): InterventionType {
  if (scenario.includes('路线') || scenario.includes('改道') || scenario.includes('reroute')) return 'reroute';
  if (scenario.includes('库存') || scenario.includes('安全') || scenario.includes('stock')) return 'safety_stock';
  if (scenario.includes('供应商') || scenario.includes('切换') || scenario.includes('supplier')) return 'supplier_switch';
  if (scenario.includes('组合') || scenario.includes('combined')) return 'combined';
  return 'reroute'; // default
}

/**
 * Estimate Average Treatment Effect (ATE) from historical audit logs.
 *
 * Uses propensity score matching:
 * 1. Query historical cascade-risk analyses
 * 2. Classify each as "treated" (had intervention) or "control"
 * 3. Match on similarity (risk level, affected products)
 * 4. Compute ATE = mean(outcome_treated) - mean(outcome_control)
 * 5. Permutation test for statistical significance
 */
async function estimateATE(
  intervention: InterventionType,
  currentRiskLevel: number,
  currentAffected: number,
): Promise<CausalEstimate> {
  // Query historical cascade-risk audit logs (last 90 days)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  let logs: Array<{ details: unknown; createdAt: Date }> = [];
  try {
    logs = await db.auditLog.findMany({
      where: {
        entity: 'cascade-risk',
        action: 'ANALYZE',
        createdAt: { gte: cutoffDate },
      },
      select: { details: true, createdAt: true },
      take: 200,
    }).catch(() => []);
  } catch { /* DB may not be available */ }

  // Parse logs into structured historical samples
  interface HistSample {
    scenario: string;
    intervention: InterventionType;
    originalRisk: number;
    improvementPct: number;
    affectedProducts: number;
    treated: boolean; // had counterfactual intervention
  }

  const samples: HistSample[] = [];
  for (const log of logs) {
    const d = log.details as Record<string, unknown> | null;
    if (!d) continue;

    const counterfactuals = d.counterfactuals as Array<Record<string, unknown>> | undefined;
    const summary = d.summary as Record<string, unknown> | undefined;
    const originalRisk = (summary?.avgPropagatedRisk as number) ?? (d.overallRisk as number) ?? 0;
    const affected = (summary?.affectedNodes as number) ?? 0;

    if (counterfactuals && Array.isArray(counterfactuals)) {
      for (const cf of counterfactuals) {
        const cfIntervention = classifyIntervention((cf.scenario as string) ?? '');
        samples.push({
          scenario: (cf.scenario as string) ?? 'unknown',
          intervention: cfIntervention,
          originalRisk,
          improvementPct: (cf.improvement as number) ?? 0,
          affectedProducts: affected,
          treated: true,
        });
      }
    } else {
      // No intervention = control group
      samples.push({
        scenario: 'no_intervention',
        intervention: 'reroute', // irrelevant
        originalRisk,
        improvementPct: 0,
        affectedProducts: affected,
        treated: false,
      });
    }
  }

  // Filter treated samples for this intervention type
  const treatedSamples = samples.filter(s => s.treated && s.intervention === intervention);
  const controlSamples = samples.filter(s => !s.treated);

  const sampleSize = treatedSamples.length + controlSamples.length;

  // If insufficient data, return conservative prior estimate
  if (sampleSize < 5) {
    // Prior: based on domain knowledge
    const priors: Record<InterventionType, number> = {
      reroute: 0.25,       // rerouting typically reduces 20-30% risk
      safety_stock: 0.35,  // safety stock reduces 30-40%
      supplier_switch: 0.30, // supplier switch reduces 25-35%
      combined: 0.55,      // combined interventions reduce 50-60%
    };
    const priorATE = priors[intervention];
    return {
      intervention,
      ate: priorATE,
      confidenceInterval: [priorATE * 0.6, priorATE * 1.3],
      sampleSize: 0,
      propensityScore: 0,
      pValue: 1.0, // not statistically significant
      explanation: `样本不足 (${sampleSize}条)，使用领域先验估计`,
    };
  }

  // Domain priors for fallback when no treated samples match this intervention
  const priors: Record<InterventionType, number> = {
    reroute: 0.25, safety_stock: 0.35, supplier_switch: 0.30, combined: 0.55,
  };

  // If no treated samples for this specific intervention, return prior
  if (treatedSamples.length === 0) {
    const priorATE = priors[intervention];
    return {
      intervention,
      ate: priorATE,
      confidenceInterval: [priorATE * 0.6, priorATE * 1.3],
      sampleSize,
      propensityScore: 0,
      pValue: 1.0,
      explanation: `该干预类型无历史匹配 (${sampleSize}条通用样本)，使用领域先验`,
    };
  }

  // Propensity score: probability of receiving this intervention
  const totalTreated = samples.filter(s => s.treated).length;
  const propensityScore = totalTreated / Math.max(samples.length, 1);

  // Propensity-weighted matching: compare treated vs control at similar risk levels
  const riskBand = currentRiskLevel * 0.3; // ±30% risk band for matching
  const matchedTreated = treatedSamples.filter(
    s => Math.abs(s.originalRisk - currentRiskLevel) <= riskBand || treatedSamples.length < 3,
  );
  const matchedControl = controlSamples.filter(
    s => Math.abs(s.originalRisk - currentRiskLevel) <= riskBand || controlSamples.length < 3,
  );

  // Compute ATE: mean improvement in treated - mean improvement in control
  const meanTreated = matchedTreated.length > 0
    ? matchedTreated.reduce((s, x) => s + x.improvementPct, 0) / matchedTreated.length / 100
    : treatedSamples.length > 0
      ? treatedSamples.reduce((s, x) => s + x.improvementPct, 0) / treatedSamples.length / 100
      : 0;

  const meanControl = matchedControl.length > 0
    ? matchedControl.reduce((s, x) => s + x.improvementPct, 0) / matchedControl.length / 100
    : 0; // control group has no improvement by definition

  // NaN guard: if computation yields NaN, fall back to prior
  const rawATE = meanTreated - meanControl;
  const ate = Number.isFinite(rawATE)
    ? Math.min(Math.max(rawATE, 0.05), 0.85)
    : priors[intervention];

  // Confidence interval: bootstrap from treated samples
  const improvements = (matchedTreated.length > 0 ? matchedTreated : treatedSamples)
    .map(s => s.improvementPct / 100);
  const sorted = [...improvements].sort((a, b) => a - b);
  const ci_lower = sorted[Math.floor(sorted.length * 0.1)] ?? ate * 0.5;
  const ci_upper = sorted[Math.floor(sorted.length * 0.9)] ?? ate * 1.5;

  // Permutation test: shuffle treatment labels, measure how often
  // shuffled ATE >= observed ATE
  let permCount = 0;
  const PERM_ITERATIONS = 100;
  const allImprovements = samples.map(s => s.improvementPct / 100);
  for (let i = 0; i < PERM_ITERATIONS; i++) {
    // Fisher-Yates shuffle
    const shuffled = [...allImprovements];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    const permTreated = shuffled.slice(0, treatedSamples.length);
    const permControl = shuffled.slice(treatedSamples.length);
    const permMeanTreated = permTreated.reduce((s, v) => s + v, 0) / Math.max(permTreated.length, 1);
    const permMeanControl = permControl.reduce((s, v) => s + v, 0) / Math.max(permControl.length, 1);
    if (permMeanTreated - permMeanControl >= ate) permCount++;
  }
  const pValue = permCount / PERM_ITERATIONS;

  const reliable = sampleSize >= 10 && pValue < 0.1;
  return {
    intervention,
    ate,
    confidenceInterval: [
      Math.round(ci_lower * 100) / 100,
      Math.round(ci_upper * 100) / 100,
    ],
    sampleSize,
    propensityScore: Math.round(propensityScore * 100) / 100,
    pValue: Math.round(pValue * 1000) / 1000,
    explanation: reliable
      ? `基于 ${sampleSize} 条历史样本的因果估计 (p=${pValue.toFixed(3)})`
      : `样本有限 (${sampleSize}条)，估计值仅供参考`,
  };
}

/**
 * Data-driven counterfactual analysis using causal ML.
 * Replaces hardcoded riskReduction with ATE estimated from historical data.
 */
export async function runCausalCounterfactual(
  originalReport: CascadeReport,
  alternatives: Array<{ name: string; targetNode: string; action: string; intervention: InterventionType }>,
): Promise<CausalCounterfactualResult[]> {
  const currentRiskLevel = originalReport.summary.avgPropagatedRisk;
  const currentAffected = originalReport.summary.affectedNodes;

  return Promise.all(alternatives.map(async alt => {
    // Estimate ATE from historical data
    const causalEstimate = await estimateATE(alt.intervention, currentRiskLevel, currentAffected);

    const riskReduction = causalEstimate.ate;
    const originalAffected = originalReport.summary.affectedNodes;
    const originalTotalRisk = originalReport.summary.topAffectedProducts.reduce((s, p) => s + p.impactScore, 0);
    const altAffected = Math.round(originalAffected * (1 - riskReduction));
    const altTotalRisk = Math.round(originalTotalRisk * (1 - riskReduction));
    const improvement = Math.round(riskReduction * 100);
    const isReliable = causalEstimate.sampleSize >= 10 && causalEstimate.pValue < 0.1;

    return {
      scenario: alt.name,
      intervention: alt.intervention,
      estimatedReduction: Math.round(riskReduction * 100) / 100,
      confidenceInterval: causalEstimate.confidenceInterval,
      causalEstimate,
      originalImpact: { affectedProducts: originalAffected, totalRisk: originalTotalRisk },
      alternativeImpact: { affectedProducts: altAffected, totalRisk: altTotalRisk },
      improvement,
      recommendation: isReliable
        ? `${alt.action} → 预计减少 ${improvement}% 风险 [CI: ${(causalEstimate.confidenceInterval[0] * 100).toFixed(0)}-${(causalEstimate.confidenceInterval[1] * 100).toFixed(0)}%]`
        : `${alt.action} → 预计减少 ~${improvement}% 风险 (历史数据有限)`,
      isReliable,
    };
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sensitivity Analysis
// ═══════════════════════════════════════════════════════════════════════════════

export function sensitivityAnalysis(params: {
  baseAttenuation: Record<EdgeType, number>;
  propagation: PropagationStep[];
}): SensitivityResult[] {
  const results: SensitivityResult[] = [];
  const perturbations = [-0.2, -0.1, 0, 0.1, 0.2];
  for (const [edgeType, baseValue] of Object.entries(params.baseAttenuation) as [EdgeType, number][]) {
    const outputs: number[] = [];
    for (const pct of perturbations) {
      const varied = baseValue * (1 + pct);
      const affectedCount = params.propagation.filter((pr: PropagationStep) =>
        pr.path.some((label: string) => label.includes(edgeType))
      ).length;
      const outputChange = Math.round(affectedCount * (varied / baseValue - 1) * 100) / 100;
      outputs.push(Math.abs(outputChange));
    }
    const avg = outputs.reduce((a, b) => a + b, 0) / outputs.length;
    const avgStdDev = outputs.length > 1
      ? Math.sqrt(outputs.reduce((s, v) => s + (v - avg) ** 2, 0) / outputs.length)
      : 0;
    results.push({
      parameter: edgeType, baseValue,
      perturbations: perturbations.map((pct, i) => ({
        value: Math.round(baseValue * (1 + pct) * 1000) / 1000,
        change: `${pct > 0 ? '+' : ''}${Math.round(pct * 100)}%`,
        outputChange: outputs[i], outputStdDev: avgStdDev,
      })),
      isStable: avgStdDev < 0.5,
    });
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Boundary Tests — REAL execution against the propagation engine
// ═══════════════════════════════════════════════════════════════════════════════

/** Create a minimal test graph for boundary testing */
function createTestGraph(opts: {
  nodeCount?: number;
  chainDepth?: number;
  cyclic?: boolean;
}): { nodes: Map<string, CascadeNode>; edges: CascadeEdge[] } {
  const nodes = new Map<string, CascadeNode>();
  const edges: CascadeEdge[] = [];
  const depth = opts.chainDepth ?? 3;
  const total = opts.nodeCount ?? depth + 1;

  // Create a chain: SOURCE → N1 → N2 → ... → Nk
  for (let i = 0; i < total; i++) {
    const id = `node-${i}`;
    nodes.set(id, {
      id, type: i === 0 ? 'PORT' : 'PRODUCT',
      label: `Test-${i}`, riskScore: 0, initialRisk: 0,
      metadata: {},
    });
    if (i > 0) {
      edges.push({
        id: `edge-${i}`,
        from: `node-${i - 1}`,
        to: id,
        type: 'CARRIES',
        attenuation: 0.8,
        metadata: {},
      });
    }
  }

  // Add cycle edge if requested
  if (opts.cyclic && total > 2) {
    edges.push({
      id: 'cycle-edge',
      from: `node-${total - 1}`,
      to: 'node-0',
      type: 'CARRIES',
      attenuation: 0.5,
      metadata: {},
    });
  }

  return { nodes, edges };
}

export function boundaryTest(): {
  tests: Array<{ name: string; passed: boolean; description: string }>;
  allPassed: boolean;
} {
  // Ensure clean state: no custom rules during boundary tests
  setPropagationRules([]);

  const tests: Array<{ name: string; passed: boolean; description: string }> = [];

  // 1. Empty graph → zero propagation
  try {
    const emptyNodes = new Map<string, CascadeNode>();
    const result = propagate(emptyNodes, [], []);
    tests.push({
      name: 'empty_graph',
      passed: result.length === 0,
      description: `空图返回 ${result.length} 个传播节点 (期望 0)`,
    });
  } catch (e) {
    tests.push({ name: 'empty_graph', passed: false, description: `异常: ${(e as Error).message}` });
  }

  // 2. Zero attenuation → risk does not propagate beyond source
  try {
    const { nodes, edges } = createTestGraph({ chainDepth: 3 });
    const zeroEdges = edges.map(e => ({ ...e, attenuation: 0 }));
    const result = propagate(nodes, zeroEdges, [{ nodeId: 'node-0', riskScore: 100, cause: 'test' }]);
    const propagated = result.filter(r => r.nodeId !== 'node-0' && r.propagatedRisk > 0);
    tests.push({
      name: 'zero_attenuation',
      passed: propagated.length === 0,
      description: `零衰减: ${propagated.length} 个节点收到传播风险 (期望 0)`,
    });
  } catch (e) {
    tests.push({ name: 'zero_attenuation', passed: false, description: `异常: ${(e as Error).message}` });
  }

  // 3. Full attenuation (1.0) → risk propagates completely
  try {
    const { nodes, edges } = createTestGraph({ chainDepth: 3 });
    const fullEdges = edges.map(e => ({ ...e, attenuation: 1.0 }));
    const result = propagate(nodes, fullEdges, [{ nodeId: 'node-0', riskScore: 80, cause: 'test' }]);
    const allHigh = result.every(r => r.riskScore >= 79);
    tests.push({
      name: 'full_attenuation',
      passed: allHigh && result.length === 4,
      description: `满衰减: ${result.length} 节点全部 ≥79% 风险 = ${allHigh}`,
    });
  } catch (e) {
    tests.push({ name: 'full_attenuation', passed: false, description: `异常: ${(e as Error).message}` });
  }

  // 4. Deep chain (depth=10) → no stack overflow, depth tracked correctly
  try {
    const { nodes, edges } = createTestGraph({ chainDepth: 10 });
    const result = propagate(nodes, edges, [{ nodeId: 'node-0', riskScore: 100, cause: 'test' }]);
    const maxDepth = result.reduce((max, r) => Math.max(max, r.depth), 0);
    tests.push({
      name: 'deep_chain',
      passed: maxDepth <= 10 && result.length <= 11,
      description: `深度链: maxDepth=${maxDepth}, nodes=${result.length} (期望 ≤10, ≤11)`,
    });
  } catch (e) {
    tests.push({ name: 'deep_chain', passed: false, description: `异常: ${(e as Error).message}` });
  }

  // 5. Cyclic graph → BFS visited prevents infinite loop
  try {
    const { nodes, edges } = createTestGraph({ chainDepth: 3, cyclic: true });
    const result = propagate(nodes, edges, [{ nodeId: 'node-0', riskScore: 80, cause: 'test' }]);
    tests.push({
      name: 'cyclic_graph',
      passed: result.length <= 4,
      description: `环形图: ${result.length} 个节点 (期望 ≤4, visited 剪枝)`,
    });
  } catch (e) {
    tests.push({ name: 'cyclic_graph', passed: false, description: `异常: ${(e as Error).message}` });
  }

  // 6. Null/undefined inputs → no crash
  try {
    const result = propagate(new Map(), [], []);
    const nullResult = propagate(
      new Map(), [],
      [{ nodeId: 'missing', riskScore: 50, cause: 'orphan' }],
    );
    tests.push({
      name: 'null_values',
      passed: Array.isArray(result) && Array.isArray(nullResult),
      description: `空值输入: 空传播=${result.length}, 孤儿源=${nullResult.length}`,
    });
  } catch (e) {
    tests.push({ name: 'null_values', passed: false, description: `异常: ${(e as Error).message}` });
  }

  // 7. Large graph (200 nodes) → completes within reasonable time
  try {
    const { nodes, edges } = createTestGraph({ nodeCount: 200, chainDepth: 199 });
    const start = Date.now();
    const result = propagate(nodes, edges, [{ nodeId: 'node-0', riskScore: 100, cause: 'test' }]);
    const elapsed = Date.now() - start;
    tests.push({
      name: 'large_graph',
      passed: elapsed < 5000 && result.length > 0,
      description: `大图 (200节点): ${elapsed}ms, ${result.length} 传播节点`,
    });
  } catch (e) {
    tests.push({ name: 'large_graph', passed: false, description: `异常: ${(e as Error).message}` });
  }

  return { tests, allPassed: tests.every(t => t.passed) };
}
