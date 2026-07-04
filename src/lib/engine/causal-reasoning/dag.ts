/**
 * Causal DAG Builder — enriches propagation edges with causal chain
 * explanations pulled from real database data.
 *
 * Edge types: DEPARTS_FROM, ARRIVES_AT, CARRIES, STORED_IN, SUPPLIED_BY
 */

import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface CausalFactor {
  /** Variable name, e.g. "weather_delay_shanghai" */
  variable: string;
  /** Whether this factor increases or decreases risk */
  direction: 'increases' | 'decreases';
  /** Effect magnitude (0–1) */
  magnitude: number;
  /** Human-readable explanation pulled from DB, e.g. "上海港出发16/27票延误(平均3天)" */
  evidence: string;
  /** Where the evidence came from */
  evidenceSource: 'db' | 'api' | 'model';
}

export interface CausalEdge {
  from: string;
  to: string;
  edgeType: string;
  attenuation: number;
  /** The key addition: causal chain explaining why this edge transmits risk */
  causalChain: CausalFactor[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Causal Edge Builder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enrich propagation edges with causal chain explanations pulled from
 * real database data.
 *
 * @param propagation - The BFS propagation steps from cascade-risk.service
 * @param edges       - The graph edges from buildGraph()
 * @param nodes       - The graph nodes from buildGraph()
 * @returns An array of CausalEdge objects with causal chains populated
 */
export async function buildCausalEdges(
  propagation: Array<{
    nodeId?: string;
    type?: string;
    label?: string;
    path?: string[];
    riskScore?: number;
    initialRisk?: number;
    propagatedRisk?: number;
    depth?: number;
    explanation?: string;
    metadata?: Record<string, unknown>;
    from?: string;
  }>,
  edges: Array<{
    id?: string;
    source?: string;
    target?: string;
    from?: string;
    to?: string;
    type?: string;
    edgeType?: string;
    attenuation?: number;
    metadata?: Record<string, unknown>;
  }>,
  nodes: Map<string, { id?: string; type?: string; label?: string; metadata?: Record<string, unknown> }>,
): Promise<CausalEdge[]> {
  const causalEdges: CausalEdge[] = [];

  // Collect all unique edge keys from propagation paths
  const edgeKeySet = new Set<string>();
  for (const step of propagation) {
    if (!step.path || step.path.length < 2) continue;
    for (let i = 0; i < step.path.length - 1; i++) {
      edgeKeySet.add(`${step.path[i]}||${step.path[i + 1]}`);
    }
  }

  // Pre-fetch bulk DB data to avoid N+1 queries
  const [allShipments, allInventories, allSuppliers, allWeatherData] = await Promise.all([
    db.shipmentItem.findMany({ take: 500 }).catch(() => []),
    db.inventory.findMany({ take: 500 }).catch(() => []),
    db.supplier.findMany({ take: 200 }).catch(() => []),
    db.shipmentItem.findMany({ where: { delayDays: { gt: 0 } }, take: 200 }).catch(() => []),
  ]);

  // Build lookup maps
  const shipmentsBySku = new Map<string, typeof allShipments>();
  const inventoriesBySku = new Map<string, typeof allInventories[0]>();
  const suppliersByCode = new Map<string, typeof allSuppliers[0]>();

  for (const s of allShipments) {
    const list = shipmentsBySku.get(s.sku) || [];
    list.push(s);
    shipmentsBySku.set(s.sku, list);
  }
  for (const inv of allInventories) {
    if (!inventoriesBySku.has(inv.sku)) inventoriesBySku.set(inv.sku, inv);
  }
  for (const sup of allSuppliers) {
    suppliersByCode.set(sup.code, sup);
  }

  // Process each unique edge
  for (const edgeKey of edgeKeySet) {
    const [fromId, toId] = edgeKey.split('||');
    const fromNode = nodes.get(fromId);
    const toNode = nodes.get(toId);

    // Find matching graph edge
    const graphEdge = edges.find(
      (e) =>
        (e.from === fromId && e.to === toId) ||
        (e.source === fromId && e.target === toId),
    );
    if (!graphEdge) continue;

    const edgeType: string = (graphEdge.type || graphEdge.edgeType || 'UNKNOWN') as string;
    const attenuation = graphEdge.attenuation ?? 0.5;
    const causalChain: CausalFactor[] = [];

    // Build causal factors based on edge type
    switch (edgeType) {
      case 'DEPARTS_FROM': {
        // Look up port congestion via shipments departing from this port
        const portLabel = fromNode?.label || '';
        const portName = extractPortName(portLabel);
        const departingShipments = allShipments.filter(
          (s) => s.origin === portName || (fromNode?.metadata?.location && s.origin === fromNode.metadata.location),
        );
        const delayedDepartures = departingShipments.filter(
          (s) => s.status === 'delayed' || s.delayDays > 0,
        );
        const totalDepartures = departingShipments.length || 1;
        const delayRatio = delayedDepartures.length / totalDepartures;

        if (delayedDepartures.length > 0) {
          const avgDelay = Math.round(
            delayedDepartures.reduce((s, sh) => s + (sh.delayDays || 0), 0) /
              delayedDepartures.length,
          );
          causalChain.push({
            variable: `port_delay_${portName || fromId}`,
            direction: 'increases',
            magnitude: Math.min(delayRatio + (avgDelay / 20) * 0.3, 1),
            evidence: `${portName || fromId}出发${delayedDepartures.length}/${departingShipments.length}票延误(平均${avgDelay}天)`,
            evidenceSource: 'db',
          });
        }

        // Weather impact
        const weatherDelayed = allWeatherData.filter(
          (s) => s.origin === portName && s.delayDays > 0 && s.events,
        );
        if (weatherDelayed.length > 0) {
          const weatherRatio = weatherDelayed.length / Math.max(departingShipments.length, 1);
          causalChain.push({
            variable: `weather_${portName || fromId}`,
            direction: 'increases',
            magnitude: Math.min(weatherRatio * 0.5, 0.8),
            evidence: `${portName || fromId}近期${weatherDelayed.length}票受天气影响延误`,
            evidenceSource: 'db',
          });
        }
        break;
      }

      case 'ARRIVES_AT': {
        const portLabel = toNode?.label || '';
        const portName = extractPortName(portLabel);
        const arrivingShipments = allShipments.filter(
          (s) => s.destination === portName,
        );
        const delayedArrivals = arrivingShipments.filter(
          (s) => s.status === 'delayed' || s.delayDays > 0,
        );
        if (delayedArrivals.length > 0) {
          const avgDelay = Math.round(
            delayedArrivals.reduce((s, sh) => s + (sh.delayDays || 0), 0) /
              delayedArrivals.length,
          );
          causalChain.push({
            variable: `dest_congestion_${portName || toId}`,
            direction: 'increases',
            magnitude: Math.min(delayedArrivals.length / Math.max(arrivingShipments.length, 1) + 0.1, 1),
            evidence: `${portName || toId}目的港${delayedArrivals.length}/${arrivingShipments.length}票延误(平均${avgDelay}天)`,
            evidenceSource: 'db',
          });
        }
        break;
      }

      case 'CARRIES': {
        // Shipment delay data
        const sku = toNode?.metadata?.sku as string || fromNode?.metadata?.sku as string;
        const shipmentsForSku = sku ? shipmentsBySku.get(sku) || [] : [];

        // Find the specific shipment that triggered this edge
        const shipmentMeta = graphEdge.metadata || fromNode?.metadata || toNode?.metadata || {};
        const delayDays = (shipmentMeta.delayDays as number) || 0;

        if (delayDays > 0) {
          const trackingNumber = shipmentMeta.trackingNumber as string || sku || '未知单号';
          causalChain.push({
            variable: `shipment_delay_${trackingNumber}`,
            direction: 'increases',
            magnitude: Math.min(delayDays / 14, 1), // 14+ days = max magnitude
            evidence: `货运延误${delayDays}天 (${trackingNumber})`,
            evidenceSource: 'db',
          });
        }

        // Overall carrier performance for this SKU
        const delayedForSku = shipmentsForSku.filter((s) => s.delayDays > 0);
        if (delayedForSku.length > 0 && shipmentsForSku.length > 1) {
          const avgDelaySku = Math.round(
            delayedForSku.reduce((s, sh) => s + (sh.delayDays || 0), 0) /
              delayedForSku.length,
          );
          const delayRate = Math.round((delayedForSku.length / shipmentsForSku.length) * 100);
          causalChain.push({
            variable: `carrier_performance_${sku}`,
            direction: 'increases',
            magnitude: Math.min(delayRate / 100 + avgDelaySku / 30 * 0.3, 1),
            evidence: `${shipmentsForSku.length}票货运中${delayedForSku.length}票延误(延误率${delayRate}%, 平均${avgDelaySku}天)`,
            evidenceSource: 'db',
          });
        }
        break;
      }

      case 'STORED_IN': {
        // Inventory health
        const sku = toNode?.metadata?.sku as string || fromNode?.metadata?.sku as string;
        const inventory = sku ? inventoriesBySku.get(sku) : undefined;

        if (inventory) {
          const stockLevel = inventory.quantity || 0;
          const safetyStock = inventory.safetyStock || 50;
          const stockRatio = stockLevel / Math.max(safetyStock, 1);

          if (stockRatio < 1) {
            // Below safety stock = risk increases
            causalChain.push({
              variable: `safety_stock_shortfall_${sku}`,
              direction: 'increases',
              magnitude: Math.min(1 - stockRatio, 1),
              evidence: `库存${stockLevel}件低于安全库存${safetyStock}件 (覆盖率${Math.round(stockRatio * 100)}%)`,
              evidenceSource: 'db',
            });
          }

          if (inventory.stockStatus === 'critical' || inventory.stockStatus === 'warning') {
            causalChain.push({
              variable: `stock_status_${sku}`,
              direction: 'increases',
              magnitude: inventory.stockStatus === 'critical' ? 0.9 : 0.6,
              evidence: `库存状态: ${inventory.stockStatus === 'critical' ? '紧急' : '警告'} (仓库: ${inventory.warehouse || '未知'})`,
              evidenceSource: 'db',
            });
          }

          // Low turnover = stagnant risk
          if ((inventory.turnoverDays || 0) > 90) {
            causalChain.push({
              variable: `low_turnover_${sku}`,
              direction: 'increases',
              magnitude: Math.min((inventory.turnoverDays || 0) / 365, 0.7),
              evidence: `库存周转${inventory.turnoverDays}天 (>90天滞销风险)`,
              evidenceSource: 'db',
            });
          }

          // High in-transit = incoming stock, reduces risk
          if ((inventory.inTransit || 0) > stockLevel * 0.5) {
            causalChain.push({
              variable: `incoming_stock_${sku}`,
              direction: 'decreases',
              magnitude: Math.min((inventory.inTransit || 0) / (stockLevel + 1) * 0.3, 0.5),
              evidence: `在途${inventory.inTransit}件即将到仓 (可缓解库存压力)`,
              evidenceSource: 'db',
            });
          }
        }
        break;
      }

      case 'SUPPLIED_BY': {
        // Supplier performance
        const fromNodeId = fromId;
        const supplierCode = fromNodeId?.replace('SUPPLIER:', '') || '';
        const supplier = suppliersByCode.get(supplierCode);

        if (supplier) {
          // Rating-based factors
          const rating = supplier.rating || 3;
          if (rating < 3.5) {
            causalChain.push({
              variable: `supplier_rating_${supplier.code}`,
              direction: 'increases',
              magnitude: Math.min((3.5 - rating) / 3.5, 1),
              evidence: `供应商评分 ${rating}/5 (${supplier.name} — ${supplier.region})`,
              evidenceSource: 'db',
            });
          } else if (rating > 4.5) {
            causalChain.push({
              variable: `supplier_rating_${supplier.code}`,
              direction: 'decreases',
              magnitude: Math.min((rating - 4) / 1, 0.5),
              evidence: `供应商评分 ${rating}/5 — 优质供应商 (${supplier.name})`,
              evidenceSource: 'db',
            });
          }

          // Lead time risk
          const leadTime = supplier.leadTime || 14;
          if (leadTime > 20) {
            causalChain.push({
              variable: `lead_time_${supplier.code}`,
              direction: 'increases',
              magnitude: Math.min((leadTime - 14) / 30, 0.8),
              evidence: `交货周期${leadTime}天 (超过平均14天基准)`,
              evidenceSource: 'db',
            });
          }

          // Region-based risk
          const highRiskRegions = ['中东', '东欧', '俄罗斯', '乌克兰', '缅甸'];
          const regionMatch = highRiskRegions.find((r) => (supplier.region || '').includes(r));
          if (regionMatch) {
            causalChain.push({
              variable: `region_risk_${supplier.region}`,
              direction: 'increases',
              magnitude: 0.5,
              evidence: `供应商位于${supplier.region} — 地缘政治风险区域`,
              evidenceSource: 'db',
            });
          }

          // Shipment defect rate from this supplier via SKU linkage
          const sku = toNode?.metadata?.sku as string;
          if (sku) {
            const supplierShipments = allShipments.filter((s) => s.sku === sku);
            const defectiveShipments = supplierShipments.filter(
              (s) => s.status === 'exception' || (s.riskLevel === 'high' || s.riskLevel === 'critical'),
            );
            if (defectiveShipments.length > 0 && supplierShipments.length > 0) {
              const defectRate = defectiveShipments.length / supplierShipments.length;
              causalChain.push({
                variable: `supplier_defect_rate_${supplier.code}`,
                direction: 'increases',
                magnitude: Math.min(defectRate * 1.5, 0.9),
                evidence: `该供应商供货${supplierShipments.length}票中${defectiveShipments.length}票异常 (异常率${Math.round(defectRate * 100)}%)`,
                evidenceSource: 'db',
              });
            }
          }
        }
        break;
      }
    }

    // If no specific DB data found, add a model-based default
    if (causalChain.length === 0) {
      causalChain.push({
        variable: `default_${edgeType.toLowerCase()}`,
        direction: 'increases',
        magnitude: 0.3,
        evidence: `${edgeType} 边传播 (衰减因子 ${attenuation})`,
        evidenceSource: 'model',
      });
    }

    causalEdges.push({
      from: fromId,
      to: toId,
      edgeType,
      attenuation,
      causalChain,
    });
  }

  return causalEdges;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract a clean port name from a node label like "上海港 (出发)" or "Shanghai Port (origin)".
 */
function extractPortName(label: string): string {
  // Remove parenthetical suffixes like "(出发)", "(orig)", etc.
  return label.replace(/[（(].*[）)]/g, '').trim();
}
