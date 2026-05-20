/**
 * Dynamic System Prompt Builder — injects real-time supply chain state
 * into the agent's system prompt so it starts each conversation aware of
 * current alerts, warnings, and priorities.
 *
 * Architecture:
 *   DB query (Prisma) → AgentBriefing → buildDynamicSystemContext()
 *   → injected into ReAct system prompt as contextual preamble
 */

import { db } from '@/lib/db';
import { agentMemory, type SharedContext } from '@/lib/engine/memory';
import { buildGraphContext, formatGraphContext } from '@/lib/engine/graph-rag';
import { episodeStore, formatEpisodeContext } from '@/lib/engine/episode-store';
import { formatConsolidatedFactsContext } from '@/lib/engine/memory-consolidation';
import { recommendStrategies, formatStrategyContext, type RiskContext } from '@/lib/engine/strategy-engine';
import { getSourceHealthSummary } from '@/lib/engine/connector-health';
import type { FeedbackLog } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface AgentBriefing {
  /** ISO timestamp of briefing generation */
  generatedAt: string;
  /** Overall supply chain health score */
  healthScore: number;
  /** Critical alerts needing immediate attention */
  criticalAlerts: string[];
  /** SKUs below safety stock */
  inventoryWarnings: Array<{ sku: string; name: string; quantity: number; safetyStock: number }>;
  /** Shipments with high/critical risk or significant delays */
  shipmentConcerns: Array<{ tracking: string; status: string; delayDays: number; riskLevel: string }>;
  /** Products with gross margin drop >5% recently */
  costAnomalies: Array<{ sku: string; name: string; margin: number; change: number }>;
  /** Certificates expiring within 30 days */
  complianceDeadlines: Array<{ certName: string; sku: string; expiryDate: string; daysLeft: number }>;
  /** Suppliers with rating drop or status change */
  supplierRisks: Array<{ name: string; rating: number; status: string }>;
  /** Recent user feedback patterns */
  feedbackInsight: string;
  /** Active regulation changes with high impact */
  regulationChanges: string[];
}

// ─── Briefing Builder ────────────────────────────────────────────────────────────

export async function gatherBriefing(): Promise<AgentBriefing> {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    inventoryWarnings,
    shipmentConcerns,
    complianceDeadlines,
    supplierRisks,
    criticalEvents,
    costData,
    regulationChanges,
  ] = await Promise.all([
    // Low stock inventory
    db.inventory.findMany({
      where: {
        stockStatus: { in: ['warning', 'critical'] },
      },
      select: { sku: true, productName: true, quantity: true, safetyStock: true },
      take: 10,
    }),

    // High risk or delayed shipments
    db.shipmentItem.findMany({
      where: {
        OR: [
          { riskLevel: { in: ['high', 'critical'] } },
          { delayDays: { gte: 3 } },
        ],
      },
      select: { trackingNumber: true, status: true, delayDays: true, riskLevel: true },
      take: 10,
    }),

    // Expiring compliance certs
    db.complianceCert.findMany({
      where: {
        expiryDate: { lte: thirtyDaysFromNow.toISOString().split('T')[0] },
        status: 'active',
      },
      select: { certName: true, sku: true, expiryDate: true },
      take: 10,
    }),

    // Supplier issues
    db.supplier.findMany({
      where: {
        OR: [
          { rating: { lt: 3.0 } },
          { status: { in: ['suspended', 'inactive'] } },
        ],
      },
      select: { name: true, rating: true, status: true },
      take: 10,
    }),

    // Recent critical events (last 24h)
    db.supplyChainEvent.findMany({
      where: {
        severity: 'critical',
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        isRead: false,
      },
      select: { title: true, description: true },
      take: 10,
    }),

    // Cost anomalies — products with low margin
    db.costRecord.findMany({
      where: {
        grossMargin: { lt: 0.15 },
      },
      select: { sku: true, productName: true, grossMargin: true },
      take: 10,
    }),

    // High impact regulation changes
    db.regulationChange.findMany({
      where: {
        impactLevel: 'high',
        status: 'new',
      },
      select: { title: true },
      take: 5,
    }),
  ]);

  // ── Build health score (4-component: inventory, cost, logistics, sales) ────
  // Uses same 4×25 formula as getDashboardSummary() for consistency
  const totalInventoryItems = inventoryWarnings.length > 0
    ? (await db.inventory.count()) : 12;
  const totalShipments = shipmentConcerns.length > 0
    ? (await db.shipmentItem.count()) : 8;

  const invHealth = Math.max(0, Math.round(((totalInventoryItems - inventoryWarnings.length) / Math.max(totalInventoryItems, 1)) * 25));
  const avgMargin = costData.length > 0
    ? costData.reduce((s, c) => s + c.grossMargin, 0) / costData.length
    : 0.5;
  const costHealth = Math.min(25, Math.round((avgMargin / 0.5) * 25));
  const problemShipments = shipmentConcerns.filter(s => s.riskLevel === 'critical' || s.riskLevel === 'high').length;
  const logHealth = Math.max(0, Math.round(((totalShipments - problemShipments) / Math.max(totalShipments, 1)) * 25));
  const revenuePerProduct = 200000; // reasonable default for SMB
  const salesHealth = Math.min(25, Math.round((revenuePerProduct / 100000) * 25));

  let healthScore = invHealth + costHealth + logHealth + salesHealth;
  // Cap floor at 10 (never 0 — 0 means everything is broken, which is unrealistic)
  healthScore = Math.max(10, Math.min(100, healthScore));

  // ── Critical alerts ─────────────────────────────────────────────────────────
  const criticalAlerts: string[] = [];

  for (const evt of criticalEvents) {
    criticalAlerts.push(`${evt.title}: ${evt.description}`);
  }

  if (inventoryWarnings.filter(i => i.quantity === 0).length > 0) {
    criticalAlerts.push('存在零库存SKU，需紧急补货');
  }

  if (shipmentConcerns.filter(s => s.riskLevel === 'critical').length > 0) {
    criticalAlerts.push('存在严重风险货运批次');
  }

  // ── Compliance deadlines ────────────────────────────────────────────────────
  const nowStr = now.toISOString().split('T')[0];
  const deadlineList = complianceDeadlines.map(c => {
    const daysLeft = Math.ceil(
      (new Date(c.expiryDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    return { certName: c.certName, sku: c.sku || 'N/A', expiryDate: c.expiryDate, daysLeft };
  });

  // ── Cost anomalies ──────────────────────────────────────────────────────────
  const costAnomaliesList = costData.map(c => ({
    sku: c.sku,
    name: c.productName,
    margin: c.grossMargin,
    change: 0, // would need historical comparison
  }));

  // ── Regulation changes ──────────────────────────────────────────────────────
  const regulationChangeList = regulationChanges.map(r => r.title);

  // ── Feedback insight ────────────────────────────────────────────────────────
  let feedbackInsight = '暂无足够的反馈数据来总结模式。';
  try {
     
    const recentFeedback = await (db as any).feedbackLog?.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { action: true, userNotes: true, engine: true },
    }) as Pick<FeedbackLog, 'action' | 'userNotes' | 'engine'>[];

    const rejected = recentFeedback.filter(f => f.action === 'rejected');
    if (rejected.length > 0) {
      const rejectReasons = rejected
        .filter(f => f.userNotes)
        .map(f => f.userNotes)
        .slice(0, 5);
      if (rejectReasons.length > 0) {
        feedbackInsight = `最近被拒绝的建议及原因: ${rejectReasons.join('; ')}`;
      } else {
        feedbackInsight = `最近 ${rejected.length} 条建议被拒绝（未注明原因），建议优化对应引擎的置信度判断。`;
      }
    } else {
      feedbackInsight = `最近 ${recentFeedback.length} 条建议均被接受，引擎表现良好。`;
    }
  } catch {
    // FeedbackLog table may not exist in all DB configs
  }

  return {
    generatedAt: now.toISOString(),
    healthScore,
    criticalAlerts,
    inventoryWarnings: inventoryWarnings.map(i => ({
      sku: i.sku,
      name: i.productName,
      quantity: i.quantity,
      safetyStock: i.safetyStock,
    })),
    shipmentConcerns: shipmentConcerns.map(s => ({
      tracking: s.trackingNumber,
      status: s.status,
      delayDays: s.delayDays,
      riskLevel: s.riskLevel,
    })),
    costAnomalies: costAnomaliesList,
    complianceDeadlines: deadlineList,
    supplierRisks: supplierRisks.map(s => ({
      name: s.name,
      rating: s.rating,
      status: s.status,
    })),
    feedbackInsight,
    regulationChanges: regulationChangeList,
  };
}

// ─── Context Formatter ───────────────────────────────────────────────────────────

/**
 * Build a compact context string from a briefing for injection into
 * the agent's system prompt. Kept concise to minimize token usage.
 */
export function formatBriefingContext(briefing: AgentBriefing): string {
  const lines: string[] = [];

  lines.push(`\n## 当前系统状态 (${new Date(briefing.generatedAt).toLocaleString('zh-CN')})`);
  lines.push(`供应链健康评分: ${briefing.healthScore}/100`);

  if (briefing.criticalAlerts.length > 0) {
    lines.push(`\n### ⚠️ 紧急事项`);
    for (const alert of briefing.criticalAlerts.slice(0, 5)) {
      lines.push(`- ${alert}`);
    }
  }

  if (briefing.inventoryWarnings.length > 0) {
    lines.push(`\n### 📦 库存预警 (${briefing.inventoryWarnings.length} SKU)`);
    for (const inv of briefing.inventoryWarnings.slice(0, 5)) {
      lines.push(`- ${inv.sku} ${inv.name}: 库存${inv.quantity}, 安全库存${inv.safetyStock}`);
    }
  }

  if (briefing.shipmentConcerns.length > 0) {
    lines.push(`\n### 🚢 货运关注 (${briefing.shipmentConcerns.length} 批)`);
    for (const sh of briefing.shipmentConcerns.slice(0, 5)) {
      lines.push(`- ${sh.tracking}: ${sh.status}, 延误${sh.delayDays}天, 风险${sh.riskLevel}`);
    }
  }

  if (briefing.costAnomalies.length > 0) {
    lines.push(`\n### 💰 成本异常 (${briefing.costAnomalies.length} 产品)`);
    for (const co of briefing.costAnomalies.slice(0, 5)) {
      lines.push(`- ${co.sku} ${co.name}: 毛利率${(co.margin * 100).toFixed(1)}%`);
    }
  }

  if (briefing.complianceDeadlines.length > 0) {
    lines.push(`\n### 📋 合规提醒 (${briefing.complianceDeadlines.length} 项)`);
    for (const dl of briefing.complianceDeadlines.slice(0, 5)) {
      lines.push(`- ${dl.certName}: ${dl.sku}, ${dl.expiryDate}到期 (剩余${dl.daysLeft}天)`);
    }
  }

  if (briefing.supplierRisks.length > 0) {
    lines.push(`\n### 🏭 供应商风险 (${briefing.supplierRisks.length} 家)`);
    for (const sr of briefing.supplierRisks.slice(0, 5)) {
      lines.push(`- ${sr.name}: 评分${sr.rating}/5, ${sr.status}`);
    }
  }

  if (briefing.regulationChanges.length > 0) {
    lines.push(`\n### ⚖️ 法规变更`);
    for (const rc of briefing.regulationChanges.slice(0, 3)) {
      lines.push(`- ${rc}`);
    }
  }

  if (briefing.feedbackInsight) {
    lines.push(`\n### 🔄 最近学习`);
    lines.push(briefing.feedbackInsight);
  }

  // ── Conversation memory from agentMemory ────────────────────────────────────
  const recentTopics = agentMemory.get<string[]>('conversation', 'recentTopics') || [];
  const recentEntities = agentMemory.get<string[]>('conversation', 'recentEntities') || [];
  const lastConclusion = agentMemory.get<string>('conversation', 'lastConclusion');

  if (recentTopics.length > 0 || recentEntities.length > 0) {
    lines.push(`\n### 💬 最近对话上下文`);
    if (recentTopics.length > 0) {
      lines.push(`讨论主题: ${recentTopics.join(', ')}`);
    }
    if (recentEntities.length > 0) {
      lines.push(`涉及SKU/实体: ${recentEntities.join(', ')}`);
    }
    if (lastConclusion) {
      lines.push(`上轮结论: ${lastConclusion.slice(0, 200)}`);
    }
  }

  return lines.join('\n');
}

/**
 * One-shot: gather briefing + graph context and format for prompt injection.
 * The query parameter enables entity extraction for targeted graph analysis.
 */
export async function buildDynamicSystemContext(query?: string): Promise<string> {
  try {
    const briefing = await gatherBriefing();
    let context = formatBriefingContext(briefing);

    // Add graph context if query mentions supply chain entities
    if (query) {
      try {
        const graphCtx = await buildGraphContext(query);
        context += '\n' + formatGraphContext(graphCtx);
      } catch { /* graph is best-effort */ }
    }

    // Add episodic memory — relevant past conversations
    if (query) {
      try {
        const relatedEpisodes = episodeStore.retrieve(query, 3);
        if (relatedEpisodes.length > 0) {
          context += formatEpisodeContext(relatedEpisodes);
        }
      } catch { /* memory is best-effort */ }
    }

    // Add consolidated facts (top 5)
    try {
      const factsCtx = formatConsolidatedFactsContext(5);
      if (factsCtx) context += factsCtx;
    } catch { /* facts are best-effort */ }

    // Add strategy recommendations if risk is detected
    if (briefing.criticalAlerts.length > 0 || briefing.healthScore < 70) {
      try {
        const risk: RiskContext = {
          type: briefing.criticalAlerts.length > 0 ? 'supplier_failure' : 'demand_drop',
          severity: briefing.healthScore < 50 ? 'critical' : briefing.healthScore < 70 ? 'high' : 'medium',
          affectedEntities: [
            ...briefing.inventoryWarnings.map(i => i.sku),
            ...briefing.shipmentConcerns.map(s => s.tracking),
          ],
          cascadeDepth: briefing.supplierRisks.length > 0 ? 2 : 1,
          estimatedLossCny: briefing.costAnomalies.reduce((s, c) => s + 10000, 0) || 50000,
        };
        context += formatStrategyContext(risk, 3);
      } catch { /* strategies are best-effort */ }
    }

    // Add data source quality
    try {
      const healthSummary = getSourceHealthSummary();
      if (healthSummary) context += '\n## 📡 数据源健康\n' + healthSummary;
    } catch { /* health is best-effort */ }

    return context;
  } catch (err) {
    console.error('[ContextBuilder] Failed to gather briefing:', err);
    return '';
  }
}

// ─── Conversation Memory Extraction ───────────────────────────────────────────────

/**
 * Extract key entities, topics, and conclusions from an agent response
 * and store them in agentMemory for the next conversation turn.
 */
export function rememberConversationTurn(userQuery: string, agentResponse: string): void {
  // Extract SKUs (SKU-XXX pattern)
  const skuMatches = agentResponse.match(/(?:SKU|sku)[-：:\s]*([A-Z]{2,4}-\d{3,5})/g) || [];
  const skus = skuMatches.map(s => s.replace(/SKU[-：:\s]*/i, 'SKU-')).slice(0, 5);

  // Extract product names (Chinese + English common patterns)
  const productMatches = agentResponse.match(/(?:智能|便携|无线|多功能|蒸汽|超声波)(?:[一-鿿\w]{2,8}[器锅机杯壶])/g) || [];
  const products = productMatches.slice(0, 5);

  // Extract key topics from user query
  const topicKeywords: Record<string, string> = {
    '库存': '库存管理', '成本': '成本分析', '物流': '物流货运', '货运': '物流货运',
    '供应商': '供应商管理', '风险': '风险分析', '销售': '销售分析', '关税': '关税合规',
    '合规': '合规认证', '汇率': '汇率风险', '铜': '大宗商品', '碳': '碳排放',
  };

  const topics: string[] = [];
  for (const [keyword, topic] of Object.entries(topicKeywords)) {
    if (userQuery.includes(keyword) && !topics.includes(topic)) {
      topics.push(topic);
    }
  }
  if (topics.length === 0) topics.push('综合查询');

  // Extract last conclusion (first 200 chars after "结论" or "建议" section)
  const conclusionMatch = agentResponse.match(/(?:##\s*结论|##\s*建议|综合分析)[\s\S]*?(?=##|$)/);
  const conclusion = conclusionMatch
    ? conclusionMatch[0].replace(/[#*\n]/g, ' ').trim().slice(0, 300)
    : agentResponse.slice(0, 200);

  const entities = [...new Set([...skus, ...products])].slice(0, 8);

  // Store in agentMemory with 30-minute TTL
  agentMemory.set('conversation', 'recentTopics', topics, 30 * 60 * 1000);
  agentMemory.set('conversation', 'recentEntities', entities, 30 * 60 * 1000);
  agentMemory.set('conversation', 'lastConclusion', conclusion, 30 * 60 * 1000);
}
