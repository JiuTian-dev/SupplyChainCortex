/**
 * Causal Effect Identification — generates natural-language summaries of
 * causal chains, highlighting the most impactful causal paths and
 * mitigating factors.
 */

import type { CausalEdge } from './dag';

/**
 * Generate a natural-language summary of the causal chains found in the
 * propagation, highlighting the most impactful causal paths.
 */
export function generateCausalSummary(
  report: {
    propagation?: Array<{
      nodeId?: string;
      label?: string;
      type?: string;
      riskScore?: number;
      path?: string[];
      explanation?: string;
    }>;
    causalEdges?: CausalEdge[];
    summary?: {
      affectedNodes?: number;
      topAffectedProducts?: Array<{
        productName?: string;
        impactScore?: number;
        propagationPath?: string;
      }>;
    };
  },
): string {
  const parts: string[] = [];
  const edges = report.causalEdges || [];
  const propagation = report.propagation || [];

  if (edges.length === 0) {
    return '无因果链数据可分析。';
  }

  // 1. Overall structural summary
  const totalCausalFactors = edges.reduce((s, e) => s + e.causalChain.length, 0);
  const increasingFactors = edges.reduce(
    (s, e) => s + e.causalChain.filter((f) => f.direction === 'increases').length,
    0,
  );
  const decreasingFactors = edges.reduce(
    (s, e) => s + e.causalChain.filter((f) => f.direction === 'decreases').length,
    0,
  );

  parts.push(
    `因果分析涵盖 ${edges.length} 条传播边，共 ${totalCausalFactors} 个因果因子 ` +
    `(风险增加: ${increasingFactors}, 风险缓解: ${decreasingFactors})。`,
  );

  // 2. Most impactful causal chains (by magnitude)
  const allFactors = edges
    .flatMap((e) =>
      e.causalChain.map((f) => ({ ...f, edgeType: e.edgeType, from: e.from, to: e.to })),
    )
    .filter((f) => f.direction === 'increases')
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 5);

  if (allFactors.length > 0) {
    parts.push('主要风险驱动因素:');
    for (const f of allFactors) {
      const pct = Math.round(f.magnitude * 100);
      parts.push(`  - ${f.evidence} (影响权重 ${pct}%, 边类型 ${f.edgeType})`);
    }
  }

  // 3. Mitigating factors
  const mitigators = edges
    .flatMap((e) =>
      e.causalChain.map((f) => ({ ...f, edgeType: e.edgeType, from: e.from })),
    )
    .filter((f) => f.direction === 'decreases')
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 3);

  if (mitigators.length > 0) {
    parts.push('风险缓解因素:');
    for (const m of mitigators) {
      const pct = Math.round(m.magnitude * 100);
      parts.push(`  - ${m.evidence} (缓解权重 ${pct}%)`);
    }
  }

  // 4. Top affected products and their causal paths
  const topProducts = report.summary?.topAffectedProducts || [];
  if (topProducts.length > 0) {
    parts.push('受影响产品因果路径:');
    for (const p of topProducts.slice(0, 3)) {
      const productEdges = edges.filter(
        (e) => e.to.includes(p.productName || '') || e.to.includes(p.propagationPath || ''),
      );
      const keyFactors = productEdges
        .flatMap((e) => e.causalChain)
        .filter((f) => f.direction === 'increases')
        .sort((a, b) => b.magnitude - a.magnitude)
        .slice(0, 2);

      const factorStr =
        keyFactors.length > 0
          ? keyFactors.map((f) => f.evidence).join('; ')
          : '通过传播链层级传导';

      parts.push(
        `  - ${p.productName || '未知产品'}: 风险 ${p.impactScore || '?'}%. ${factorStr}`,
      );
    }
  }

  return parts.join('\n');
}
