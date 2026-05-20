// @ts-nocheck
/**
 * Cascade Risk — Propagation Engine Module (Phases 2, 3, 5)
 *
 * Multi-source risk fusion, graph construction, BFS propagation,
 * time-dimension forward projection, and explainability.
 * Extracted from cascade-risk.service.ts for modularity.
 */
import { db } from '@/lib/db';
import { getAllPortsWeather } from '@/lib/services/weather.service';
import { DEFAULT_ATTENUATION, getAttenuation } from './cascade-risk.calibration';
import type { EdgeType, FusionStrategy, CascadeNode, CascadeEdge, PropagationStep, DayProjection, PropagationRule } from './cascade-risk.types';

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 2: Multi-Source Risk Fusion
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnomalySource {
  nodeId: string; riskScore: number; cause: string; category: string;
}

export function fuseMultiSourceRisks(
  sources: AnomalySource[],
  strategy: FusionStrategy = 'weighted_sum',
): Array<{ nodeId: string; riskScore: number; cause: string }> {
  if (strategy === 'max_impact') {
    // Take the max risk per node
    const byNode = new Map<string, { riskScore: number; cause: string }>();
    for (const s of sources) {
      const existing = byNode.get(s.nodeId);
      if (!existing || s.riskScore > existing.riskScore) {
        byNode.set(s.nodeId, { riskScore: s.riskScore, cause: s.cause });
      }
    }
    return [...byNode.entries()].map(([nodeId, v]) => ({ nodeId, ...v }));
  }

  if (strategy === 'threshold_lower') {
    // When multiple categories overlap, lower the risk threshold
    const categories = new Set(sources.map(s => s.category));
    const multiplier = categories.size > 1 ? 1.3 : 1.0; // Multi-category = 30% more sensitive
    const byNode = new Map<string, { riskScore: number; causes: string[] }>();
    for (const s of sources) {
      const existing = byNode.get(s.nodeId);
      const adjustedRisk = Math.min(s.riskScore * multiplier, 100);
      if (!existing) {
        byNode.set(s.nodeId, { riskScore: adjustedRisk, causes: [s.cause] });
      } else {
        existing.riskScore = Math.max(existing.riskScore, adjustedRisk);
        existing.causes.push(s.cause);
      }
    }
    return [...byNode.entries()].map(([nodeId, v]) => ({ nodeId, riskScore: Math.round(v.riskScore), cause: v.causes.join('; ') }));
  }

  // weighted_sum (default): accumulate risks with diminishing returns
  const byNode = new Map<string, { accumulatedRisk: number; count: number; causes: string[] }>();
  for (const s of sources) {
    const existing = byNode.get(s.nodeId);
    if (!existing) {
      byNode.set(s.nodeId, { accumulatedRisk: s.riskScore, count: 1, causes: [s.cause] });
    } else {
      // Diminishing returns: each additional source adds less
      existing.accumulatedRisk = existing.accumulatedRisk + s.riskScore * (1 / (existing.count + 1));
      existing.count++;
      existing.causes.push(s.cause);
    }
  }
  return [...byNode.entries()].map(([nodeId, v]) => ({
    nodeId,
    riskScore: Math.min(Math.round(v.accumulatedRisk), 100),
    cause: v.causes.join(' | '),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3: Time-Dimension Forward Projection
// ═══════════════════════════════════════════════════════════════════════════════

export async function projectForward(
  propagation: PropagationStep[],
  weatherData: Awaited<ReturnType<typeof getAllPortsWeather>> | null,
): Promise<DayProjection[]> {
  const projections: DayProjection[] = [];
  const today = new Date();
  const affectedProducts = propagation.filter(p => p.type === 'PRODUCT' && p.riskScore > 10);

  for (let day = 0; day < 7; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];

    // Weather forecast risk (use forecast data if available)
    const portRisks: DayProjection['portRisks'] = [];
    if (weatherData) {
      for (const port of weatherData.ports) {
        const dayForecast = port.forecast[Math.min(day, port.forecast.length - 1)];
        if (dayForecast) {
          const forecastRisk = dayForecast.windSpeedMax > 20 || dayForecast.precipitation > 20 ? 'high'
            : dayForecast.windSpeedMax > 12 || dayForecast.precipitation > 10 ? 'medium' : 'low';
          portRisks.push({
            port: port.port,
            risk: forecastRisk === 'high' ? 70 : forecastRisk === 'medium' ? 40 : 10,
            weather: `风速${dayForecast.windSpeedMax}m/s 降水${dayForecast.precipitation}mm`,
          });
        }
      }
    }

    // Inventory depletion risk
    const depletionRisks: DayProjection['inventoryDepletionRisk'] = [];
    for (const p of affectedProducts) {
      const sku = p.metadata.sku as string;
      if (!sku) continue;

      const inventory = await db.inventory.findFirst({ where: { sku } }).catch(() => null);
      if (!inventory) continue;

      const sales = await db.salesRecord.findMany({
        where: { sku, date: { gte: new Date(Date.now() - 30 * 86400000) } },
        take: 200,
      }).catch(() => []);

      const avgDailySales = sales.length > 0
        ? sales.reduce((s, r) => s + r.quantity, 0) / 30
        : 5;
      const effectiveStock = inventory.quantity + inventory.inTransit;
      const daysUntilDepletion = avgDailySales > 0
        ? Math.round((effectiveStock - inventory.safetyStock) / avgDailySales)
        : 999;

      if (daysUntilDepletion <= day + 3) {
        depletionRisks.push({
          sku: inventory.sku,
          productName: inventory.productName,
          daysUntilDepletion,
          riskLevel: daysUntilDepletion <= day ? 'critical' : daysUntilDepletion <= day + 3 ? 'warning' : 'healthy',
        });
      }
    }

    // Cumulative revenue impact
    const cumulativeRevenueImpact = affectedProducts
      .filter(p => {
        const stock = depletionRisks.find(d => d.sku === p.metadata.sku);
        return stock && stock.daysUntilDepletion <= day + 3;
      })
      .reduce((sum, p) => {
        const price = (p.metadata.sellingPrice as number) || 50;
        const qty = (p.metadata.quantity as number) || 100;
        return sum + price * qty * (p.riskScore / 100) * 0.3 * (1 + day * 0.1);
      }, 0);

    projections.push({
      day,
      date: dateStr,
      portRisks: portRisks.slice(0, 6),
      affectedShipments: propagation.filter(p => p.type === 'SHIPMENT' && p.riskScore > 10).length,
      inventoryDepletionRisk: depletionRisks,
      cumulativeRevenueImpact: Math.round(cumulativeRevenueImpact),
    });
  }

  return projections;
}

export function generatePreventiveActions(
  product: { sku: string; productName: string; impactScore: number },
  propagationPath: string,
): string | undefined {
  const actions: string[] = [];
  if (propagationPath.includes('港')) {
    actions.push('评估替代港口路线');
  }
  if (product.impactScore > 50) {
    actions.push(`紧急补充 ${product.productName} 安全库存`);
  }
  if (propagationPath.includes('供应商')) {
    actions.push('联系备选供应商');
  }
  return actions.length > 0 ? actions.join('; ') : undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Custom Propagation Rules (DSL)
// ═══════════════════════════════════════════════════════════════════════════════

let customRules: PropagationRule[] = [];
export function setPropagationRules(rules: PropagationRule[]) {
  customRules = rules;
}

export function applyCustomRules(edge: CascadeEdge, nodeData: Record<string, unknown>): number {
  let attenuation = edge.attenuation;
  for (const rule of customRules) {
    if (rule.edgeType !== edge.type) continue;
    if (rule.condition) {
      const fieldValue = nodeData[rule.condition.field];
      const match = rule.condition.operator === 'gt' ? Number(fieldValue) > Number(rule.condition.value)
        : rule.condition.operator === 'lt' ? Number(fieldValue) < Number(rule.condition.value)
        : fieldValue === rule.condition.value;
      if (match && rule.overrideAttenuation !== undefined) {
        attenuation = rule.overrideAttenuation;
      }
    } else if (rule.overrideAttenuation !== undefined) {
      attenuation = rule.overrideAttenuation;
    }
  }
  return attenuation;
}

export function generateExplanation(
  nodeId: string, edgeType: EdgeType, fromLabel: string, toLabel: string,
  incomingRisk: number, attenuation: number, propagatedRisk: number,
  metadata: Record<string, unknown>,
): string {
  const delayDays = metadata.delayDays as number | undefined;
  const stockStatus = metadata.stockStatus as string | undefined;

  let reason = `${fromLabel} → ${toLabel}: 风险 ${incomingRisk}% × 衰减 ${attenuation} = 传播风险 ${propagatedRisk}%`;

  if (edgeType === 'CARRIES' && delayDays !== undefined) {
    reason += ` | 货运已延误 ${delayDays} 天`;
  }
  if (edgeType === 'STORED_IN' && stockStatus) {
    reason += ` | 库存状态: ${stockStatus}`;
  }
  if (attenuation !== DEFAULT_ATTENUATION[edgeType]) {
    reason += ` | 校准后衰减 (原始: ${DEFAULT_ATTENUATION[edgeType]})`;
  }

  return reason;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Graph Construction (shared core)
// ═══════════════════════════════════════════════════════════════════════════════

/** In-memory graph cache (Phase 5: persistence) */
let graphCache: { nodes: Map<string, CascadeNode>; edges: CascadeEdge[]; builtAt: number } | null = null;
const GRAPH_CACHE_TTL = 300000; // 5 minutes

function buildNodeId(type: string, id: string): string { return `${type}:${id}`; }

export async function buildGraph(forceRefresh = false): Promise<{ nodes: Map<string, CascadeNode>; edges: CascadeEdge[] }> {
  if (!forceRefresh && graphCache && Date.now() - graphCache.builtAt < GRAPH_CACHE_TTL) {
    return { nodes: graphCache.nodes, edges: graphCache.edges };
  }

  const nodes = new Map<string, CascadeNode>();
  const edges: CascadeEdge[] = [];

  const [products, inventories, shipments, suppliers, costRecords] = await Promise.all([
    db.product.findMany({ take: 5000 }),
    db.inventory.findMany({ take: 5000 }),
    db.shipmentItem.findMany({ take: 5000 }),
    db.supplier.findMany({ take: 500 }),
    db.costRecord.findMany({ take: 5000 }),
  ]);

  const warehouseNames = [...new Set(inventories.map(i => i.warehouse).filter(Boolean))];
  const warehouses = warehouseNames.map((name, i) => ({ id: `wh-${i}`, name: name || '未知仓', location: '未知' }));

  // Build nodes and edges
  for (const p of products) {
    nodes.set(buildNodeId('PRODUCT', p.sku), {
      id: buildNodeId('PRODUCT', p.sku), type: 'PRODUCT', label: p.name,
      riskScore: 0, initialRisk: 0,
      metadata: { sku: p.sku, category: p.category, sellingPrice: p.sellingPrice },
    });
  }

  for (const w of warehouses) {
    nodes.set(buildNodeId('WAREHOUSE', w.id), {
      id: buildNodeId('WAREHOUSE', w.id), type: 'WAREHOUSE', label: w.name,
      riskScore: 0, initialRisk: 0, metadata: { name: w.name, location: w.location },
    });
  }

  for (const s of suppliers) {
    nodes.set(buildNodeId('SUPPLIER', s.code || s.id), {
      id: buildNodeId('SUPPLIER', s.code || s.id), type: 'SUPPLIER', label: s.name,
      riskScore: 0, initialRisk: 0,
      metadata: { code: s.code, region: s.region, rating: s.rating, leadTime: s.leadTime },
    });
  }

  const portSet = new Set<string>();
  for (const s of shipments) {
    const shipId = buildNodeId('SHIPMENT', s.id);
    const isDelayed = s.status === 'delayed' || s.delayDays > 0;
    nodes.set(shipId, {
      id: shipId, type: 'SHIPMENT', label: `${s.productName} (${s.trackingNumber})`,
      riskScore: isDelayed ? 30 : 0, initialRisk: isDelayed ? 30 : 0,
      metadata: { trackingNumber: s.trackingNumber, sku: s.sku, origin: s.origin, destination: s.destination, status: s.status, delayDays: s.delayDays, riskLevel: s.riskLevel },
    });

    const originId = buildNodeId('PORT', `origin:${s.origin}`);
    if (!portSet.has(originId)) {
      portSet.add(originId);
      nodes.set(originId, { id: originId, type: 'PORT', label: `${s.origin}港 (出发)`, riskScore: 0, initialRisk: 0, metadata: { location: s.origin, role: 'origin' } });
    }
    edges.push({ id: `e-origin-${s.id}`, from: originId, to: shipId, type: 'DEPARTS_FROM', attenuation: getAttenuation('DEPARTS_FROM'), metadata: {} });

    const destId = buildNodeId('PORT', `dest:${s.destination}`);
    if (!portSet.has(destId)) {
      portSet.add(destId);
      nodes.set(destId, { id: destId, type: 'PORT', label: `${s.destination}港 (目的)`, riskScore: 0, initialRisk: 0, metadata: { location: s.destination, role: 'destination' } });
    }
    edges.push({ id: `e-dest-${s.id}`, from: destId, to: shipId, type: 'ARRIVES_AT', attenuation: getAttenuation('ARRIVES_AT'), metadata: {} });
  }

  for (const inv of inventories) {
    const pId = buildNodeId('PRODUCT', inv.sku);
    const wId = buildNodeId('WAREHOUSE', inv.warehouse || 'unknown');
    if (!nodes.has(pId)) {
      nodes.set(pId, { id: pId, type: 'PRODUCT', label: inv.productName || inv.sku, riskScore: 0, initialRisk: 0, metadata: { sku: inv.sku, stockStatus: inv.stockStatus, quantity: inv.quantity } });
    }
    if (!nodes.has(wId)) {
      nodes.set(wId, { id: wId, type: 'WAREHOUSE', label: inv.warehouse || '未知仓', riskScore: 0, initialRisk: 0, metadata: { name: inv.warehouse } });
    }
    edges.push({ id: `e-stock-${inv.id}`, from: wId, to: pId, type: 'STORED_IN', attenuation: getAttenuation('STORED_IN'), metadata: { quantity: inv.quantity, safetyStock: inv.safetyStock, stockStatus: inv.stockStatus } });
  }

  for (const s of shipments) {
    const shipId = buildNodeId('SHIPMENT', s.id);
    const pId = buildNodeId('PRODUCT', s.sku);
    if (nodes.has(pId)) {
      edges.push({ id: `e-carries-${s.id}`, from: shipId, to: pId, type: 'CARRIES', attenuation: getAttenuation('CARRIES'), metadata: { trackingNumber: s.trackingNumber, status: s.status, delayDays: s.delayDays } });
    }
  }

  const supplierCosts = costRecords.filter(c => c.productId);
  for (const c of supplierCosts) {
    const matchingSupplier = suppliers.find(s => {
      const product = products.find(p => p.sku === c.sku);
      return product && s.category === product.category;
    }) || suppliers[0];
    if (matchingSupplier) {
      const pId = buildNodeId('PRODUCT', c.sku);
      const sId = buildNodeId('SUPPLIER', matchingSupplier.code || matchingSupplier.id);
      if (nodes.has(pId) && nodes.has(sId)) {
        const alreadyExists = edges.some(e => e.from === sId && e.to === pId && e.type === 'SUPPLIED_BY');
        if (!alreadyExists) {
          edges.push({ id: `e-supply-${c.sku}-${matchingSupplier.code}`, from: sId, to: pId, type: 'SUPPLIED_BY', attenuation: getAttenuation('SUPPLIED_BY'), metadata: { leadTime: matchingSupplier.leadTime, rating: matchingSupplier.rating } });
        }
      }
    }
  }

  graphCache = { nodes, edges, builtAt: Date.now() };
  return { nodes, edges };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BFS Propagation with explainability
// ═══════════════════════════════════════════════════════════════════════════════

interface PropagationEntry {
  risk: number; path: string[]; depth?: number; cause: string;
  explanation: string; edgeType?: EdgeType;
}

export function propagate(
  nodes: Map<string, CascadeNode>, edges: CascadeEdge[],
  sources: Array<{ nodeId: string; riskScore: number; cause: string }>,
): PropagationStep[] {
  const adjacency = new Map<string, CascadeEdge[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from) || [];
    list.push(e);
    adjacency.set(e.from, list);
  }

  const visited = new Map<string, PropagationEntry>();
  const queue: Array<{ nodeId: string; incomingRisk: number; path: string[]; depth?: number; cause: string; explanation: string; edgeType?: EdgeType }> = [];

  for (const src of sources) {
    const srcNode = nodes.get(src.nodeId);
    const explanation = `风险源: ${src.cause}`;
    queue.push({ nodeId: src.nodeId, incomingRisk: src.riskScore, path: [src.nodeId], depth: 0, cause: src.cause, explanation });
    visited.set(src.nodeId, { risk: src.riskScore, path: [src.nodeId], depth: 0, cause: src.cause, explanation });
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const outEdges = adjacency.get(current.nodeId) || [];

    for (const edge of outEdges) {
      const fromNode = nodes.get(edge.from);
      const toNode = nodes.get(edge.to);

      // Apply custom DSL rules
      const effectiveAttenuation = applyCustomRules(edge, toNode?.metadata || {});

      const propagatedRisk = Math.round(current.incomingRisk * effectiveAttenuation * 10) / 10;
      if (propagatedRisk < 0.5) continue;

      const existing = visited.get(edge.to);
      const newPath = [...current.path, edge.to];
      const explanation = generateExplanation(
        edge.to, edge.type,
        fromNode?.label || edge.from, toNode?.label || edge.to,
        current.incomingRisk, effectiveAttenuation, propagatedRisk, toNode?.metadata || {},
      );

      if (!existing) {
        visited.set(edge.to, { risk: propagatedRisk, path: newPath, depth: current.depth + 1, cause: current.cause, explanation, edgeType: edge.type });
        queue.push({ nodeId: edge.to, incomingRisk: propagatedRisk, path: newPath, depth: current.depth + 1, cause: current.cause, explanation, edgeType: edge.type });
      } else {
        // Multi-source accumulation
        const accumulated = existing.risk + propagatedRisk * 0.5;
        const mergedCause = `${existing.cause}; ${current.cause}`;
        const mergedExplanation = `${existing.explanation} | 多源叠加: ${propagatedRisk}%`;
        visited.set(edge.to, { risk: Math.min(Math.round(accumulated * 10) / 10, 100), path: existing.path, depth: existing.depth, cause: mergedCause, explanation: mergedExplanation, edgeType: existing.edgeType });
      }
    }
  }

  // Build cost context for monetary impact estimation
  const costContext = Array.from(nodes.values())
    .filter(n => n.type === 'PRODUCT')
    .reduce<Record<string, { monthlyVolume: number; unitCost: number }>>((acc, n) => {
      acc[n.id] = {
        monthlyVolume: (n.metadata?.monthlyVolume as number) || 500,
        unitCost: (n.metadata?.unitCost as number) || 45,
      };
      return acc;
    }, {});

  const results: PropagationStep[] = [];
  for (const [nodeId, v] of visited) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    const initialRisk = sources.find(s => s.nodeId === nodeId)?.riskScore ?? 0;

    // Monetary impact: risk % × monthly volume × unit cost × damage ratio
    const costs = costContext[nodeId] || { monthlyVolume: 500, unitCost: 45 };
    const monthlyVolume = costs.monthlyVolume;
    const unitCost = costs.unitCost;
    const damageRatio = 0.15 + (v.risk / 100) * 0.35; // 15%-50% of revenue at risk based on severity
    const monetaryImpact = Math.round(monthlyVolume * unitCost * damageRatio * (v.risk / 100));
    const impactBreakdown = `${monthlyVolume}台 × $${unitCost}/台 × ${(damageRatio * 100).toFixed(0)}% × ${v.risk}%`;

    results.push({
      nodeId, label: node.label, type: node.type,
      riskScore: v.risk, initialRisk, propagatedRisk: Math.round((v.risk - initialRisk) * 10) / 10,
      path: v.path.map(p => nodes.get(p)?.label || p),
      depth: v.depth, explanation: v.explanation,
      metadata: node.metadata,
      monetaryImpact,
      impactBreakdown,
    });
  }

  return results;
}

// Helper for weather description
export function weatherDesc(code: number): string {
  if (code <= 1) return '晴天'; if (code <= 3) return '多云';
  if (code <= 48) return '雾/霾'; if (code <= 57) return '毛毛雨';
  if (code <= 67) return '降雨'; if (code <= 77) return '降雪';
  if (code <= 86) return '阵雨'; return '雷暴';
}
