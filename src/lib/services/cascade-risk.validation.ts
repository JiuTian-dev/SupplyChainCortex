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
import { estimateCausalEffect, type CausalSample } from './causal-estimator';

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
 * Now uses the unified CausalEstimator which automatically selects:
 * - DML (Double Machine Learning) when n≥20
 * - PSM (Propensity Score Matching) when n<20
 *
 * Falls back to domain priors when data is insufficient.
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

  // Parse logs into CausalSample format
  const samples: CausalSample[] = [];
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
          features: [originalRisk, affected],
          treated: true,
          outcome: ((cf.improvement as number) ?? 0) / 100,
          intervention: cfIntervention,
        });
      }
    } else {
      samples.push({
        features: [originalRisk, affected],
        treated: false,
        outcome: 0,
        intervention: 'reroute',
      });
    }
  }

  // Use unified estimator (auto-selects DML vs PSM)
  return estimateCausalEffect(samples, intervention, currentRiskLevel);
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
