/**
 * Cascade Risk — Graph Injection Module
 *
 * Injects Neo4j graph analytics results as additional risk sources
 * into the cascade risk engine, enriching the anomaly detection
 * with structural supply chain insights:
 *
 * 1. Chokepoint injection: single points of failure → supplier risks
 * 2. Impact analysis: suppliers that affect many downstream companies
 * 3. Geographic concentration: hub-level concentration risks
 *
 * Called between anomalySource collection and fuseMultiSourceRisks
 * in cascade-risk.main.ts → getCascadeRisk().
 */

import { supplierApi } from './supplier-api.client';
import type { AnomalySource } from './cascade-risk.propagation';

export interface GraphRiskInjection {
  sources: AnomalySource[];
  graphInsights: {
    chokepointCount: number;
    geoConcentrationRisk: 'high' | 'medium' | 'low' | 'unavailable';
    geoHhi: number | null;
    impactedSupplierCount: number;
    tierDepth: number;
  };
  degraded: boolean;
  warnings: string[];
}

/**
 * Inject graph-derived risks into the existing anomaly source list.
 *
 * Gracefully degrades: if the Supplier API is unreachable, returns
 * the original sources unchanged with warnings.
 *
 * @param ticker      Company ticker symbol (e.g., "MIDE")
 * @param existingSources  Already-collected anomaly sources
 * @param portNodeId       ID of the logistics port node (for geo-risk → logistics linkage)
 */
export async function injectGraphRiskSources(
  ticker: string,
  existingSources: AnomalySource[],
  portNodeId?: string,
): Promise<GraphRiskInjection> {
  const warnings: string[] = [];
  const sources = [...existingSources];

  // ── Default insights (will be updated as data comes in) ──
  const insights = {
    chokepointCount: 0,
    geoConcentrationRisk: 'unavailable' as 'high' | 'medium' | 'low' | 'unavailable',
    geoHhi: null as number | null,
    impactedSupplierCount: 0,
    tierDepth: 0,
  };

  // If Supplier API key not configured, skip injection silently
  if (!process.env.SUPPLIER_API_KEY) {
    return { sources, graphInsights: insights, degraded: true, warnings: [] };
  }

  // ── 1. Chokepoint detection ────────────────────────────────────────
  try {
    const chokepoints = await supplierApi.getChokepoints(1, 10);
    insights.chokepointCount = chokepoints.count;

    if (chokepoints.chokepoints.length > 0) {
      // Each chokepoint that supplies 3+ companies is a structural risk
      const criticalChokepoints = chokepoints.chokepoints.filter(c => c.companies_supplied >= 3);

      for (const cp of criticalChokepoints.slice(0, 3)) {
        sources.push({
          nodeId: `supplier:${cp.code}`,
          riskScore: Math.min(40 + cp.companies_supplied * 8, 80),
          cause: `卡脖子供应商: ${cp.supplier} 供应 ${cp.companies_supplied} 家企业，为行业共享瓶颈`,
          category: 'supplier',
        });
      }
    }
  } catch (err) {
    warnings.push(`Chokepoint injection failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 2. Geographic concentration ────────────────────────────────────
  try {
    const geoRisk = await supplierApi.getGeoRisk(ticker);
    insights.geoConcentrationRisk = geoRisk.concentration_risk;
    insights.geoHhi = geoRisk.geo_hhi;

    if (geoRisk.concentration_risk === 'high') {
      const dominantHub = geoRisk.hubs[0];
      if (dominantHub) {
        const nodeId = portNodeId || dominantHub.hub;
        const naturalRisks = dominantHub.natural_risks.join('、');
        sources.push({
          nodeId,
          riskScore: 60 + Math.round(geoRisk.geo_hhi * 50),
          cause: `地理集中度风险: ${dominantHub.hub} 集中 ${dominantHub.percentage}% 供应商${naturalRisks ? `（自然灾害: ${naturalRisks}）` : ''}`,
          category: 'logistics',
        });
      }
    } else if (geoRisk.concentration_risk === 'medium') {
      // Flag the most concentrated hub as a moderate risk
      const topHub = geoRisk.hubs[0];
      if (topHub && topHub.percentage > 35) {
        sources.push({
          nodeId: portNodeId || topHub.hub,
          riskScore: 35,
          cause: `地理集中度: ${topHub.hub} 占 ${topHub.percentage}% 供应商`,
          category: 'logistics',
        });
      }
    }

    // Flag at-risk suppliers from the graph
    for (const s of geoRisk.at_risk_suppliers.slice(0, 5)) {
      sources.push({
        nodeId: `supplier:${s.code}`,
        riskScore: 45,
        cause: `风险供应商: ${s.name}${s.hub ? ` (${s.hub})` : ''}${s.risk_type ? ` — ${s.risk_type}` : ''}`,
        category: 'supplier',
      });
    }
  } catch (err) {
    warnings.push(`Geo-risk injection failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Tier structure insight ──────────────────────────────────────
  try {
    const tiers = await supplierApi.getTiers(ticker);
    insights.tierDepth = tiers.deepest_tier;
    // Deep supply chains (3+ tiers) carry hidden disruption risk
    if (tiers.deepest_tier >= 3) {
      const tier2Suppliers = (tiers.tier_counts.tier_2 || 0) + (tiers.tier_counts.tier_3 || 0);
      sources.push({
        nodeId: ticker,
        riskScore: 30 + tiers.deepest_tier * 5,
        cause: `供应链深度: ${tiers.deepest_tier} 层，${tier2Suppliers} 个间接供应商存在隐性中断风险`,
        category: 'supplier',
      });
    }
  } catch (err) {
    warnings.push(`Tier structure injection failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    sources,
    graphInsights: insights,
    degraded: warnings.length > 0,
    warnings,
  };
}
