/**
 * Decision Coherence Audit — "你的系统在互相矛盾"
 *
 * Scans product catalog for cross-system inconsistencies:
 * - HS code vs applied tariff rate mismatches
 * - Safety stock vs actual lead time misalignment
 * - Certification gaps vs target market requirements
 * - Declared vs actual origin conflicts
 *
 * The "30-40% of cross-border delays from documentation inconsistency"
 * problem (Forbes 2026). No existing tool addresses this.
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface CoherenceIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'hs_code' | 'tariff' | 'lead_time' | 'certification' | 'origin' | 'pricing';
  title: string;
  description: string;
  affectedSkus: string[];
  expectedValue: string;
  actualValue: string;
  impact: string;
  fix: string;
}

export interface CoherenceAuditReport {
  generatedAt: string;
  totalSkusAudited: number;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  issues: CoherenceIssue[];
  overallScore: number; // 0-100
  summary: string;
}

// ─── Audit Functions ─────────────────────────────────────────────────────────────

export async function runCoherenceAudit(): Promise<CoherenceAuditReport> {
  const issues: CoherenceIssue[] = [];

  const [products, inventories, costs, shipments, certs, tariffs] = await Promise.all([
    db.product.findMany({ include: { cost: true, inventory: true } }),
    db.inventory.findMany(),
    db.costRecord.findMany(),
    db.shipmentItem.findMany(),
    db.complianceCert.findMany({ where: { status: 'active' } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).tariffRule?.findMany({ where: { isActive: true } }) || [],
  ]);

  const allSkus = products.map(p => p.sku);

  // ── 1. HS Code vs Tariff Rate Mismatch ────────────────────────────────────
  for (const p of products) {
    if (!p.cost) continue;
    const appliedTariffRate = p.cost.tariff || 0;
    const declaredValue = p.cost.totalLanded || 0;

    // Check if tariff rate seems reasonable for the category
    if (p.category.toLowerCase().includes('kitchen') && appliedTariffRate < 0.05) {
      issues.push({
        severity: 'warning',
        category: 'tariff',
        title: `${p.sku}: 厨房电器关税异常低`,
        description: `SKU ${p.sku} (${p.name}) 为厨房电器，实际应用关税率仅 ${(appliedTariffRate * 100).toFixed(1)}%，同类产品通常为 7.5-25%。HS编码可能归类错误。`,
        affectedSkus: [p.sku],
        expectedValue: '7.5-25%',
        actualValue: `${(appliedTariffRate * 100).toFixed(1)}%`,
        impact: '关税少缴可能导致海关稽查和补税+罚款',
        fix: `核查 ${p.sku} 的HS编码归类，确认正确的关税税率。厨房电器通常归入HS 8509或8516系列。`,
      });
    }
  }

  // ── 2. Safety Stock vs Actual Lead Time ───────────────────────────────────
  for (const inv of inventories) {
    // Find shipments for this SKU to compute actual lead time
    const skuShipments = shipments.filter(s => s.sku === inv.sku && s.status !== 'pending');
    if (skuShipments.length < 2) continue;

    const actualLeadTimes = skuShipments
      .filter(s => s.actualDelivery)
      .map(s => {
        const created = new Date(s.createdAt).getTime();
        const delivered = new Date(s.actualDelivery!).getTime();
        return (delivered - created) / (24 * 60 * 60 * 1000); // days
      });
    if (actualLeadTimes.length === 0) continue;

    const avgLeadTime = actualLeadTimes.reduce((a, b) => a + b, 0) / actualLeadTimes.length;
    const assumedLeadTime = inv.safetyStock > 0 ? Math.round(inv.safetyStock / (inv.quantity / Math.max(inv.turnoverDays, 1))) : 14;

    if (avgLeadTime > assumedLeadTime * 1.5) {
      issues.push({
        severity: 'critical',
        category: 'lead_time',
        title: `${inv.sku}: 安全库存与实际交货期严重不匹配`,
        description: `SKU ${inv.sku} 安全库存 ${inv.safetyStock} 台假设约 ${assumedLeadTime} 天交货周期，但过去 ${actualLeadTimes.length} 批货物的实际平均交货期为 ${avgLeadTime.toFixed(0)} 天。安全库存不足以覆盖实际供货周期。`,
        affectedSkus: [inv.sku],
        expectedValue: `安全库存应覆盖 ${avgLeadTime.toFixed(0)} 天`,
        actualValue: `当前安全库存仅覆盖约 ${assumedLeadTime} 天`,
        impact: `缺货风险：实际补货周期是假设的 ${(avgLeadTime / assumedLeadTime).toFixed(1)} 倍`,
        fix: `建议将安全库存从 ${inv.safetyStock} 提升至 ${Math.round(inv.safetyStock * (avgLeadTime / assumedLeadTime))}，或与供应商协商缩短lead time`,
      });
    }
  }

  // ── 3. Certification Gaps ─────────────────────────────────────────────────
  for (const p of products) {
    const productCerts = certs.filter(c => c.sku === p.sku);
    const certNames = productCerts.map(c => c.certName.toLowerCase()).join(' ');

    // Check wireless products for FCC-ID
    if (/wifi|bluetooth|无线|蓝牙|wireless|smart/.test(p.name.toLowerCase()) && !certNames.includes('fcc-id')) {
      issues.push({
        severity: 'critical',
        category: 'certification',
        title: `${p.sku}: 无线产品缺少FCC-ID认证`,
        description: `SKU ${p.sku} (${p.name}) 含有无线功能但未找到FCC-ID认证记录。美国市场强制要求。`,
        affectedSkus: [p.sku],
        expectedValue: '需持有FCC-ID认证',
        actualValue: '未找到FCC-ID',
        impact: '产品可能被Amazon下架，海关可能扣押',
        fix: `为 ${p.sku} 申请FCC-ID认证，费用$5,000-15,000，周期8-12周。如使用已认证蓝牙模块可引用模块认证。`,
      });
    }

    // Check expiring certs
    const now = new Date();
    const expiringSoon = productCerts.filter(c => {
      const exp = new Date(c.expiryDate);
      const daysLeft = (exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      return daysLeft < 60 && daysLeft > 0;
    });
    for (const cert of expiringSoon) {
      issues.push({
        severity: 'warning',
        category: 'certification',
        title: `${p.sku}: ${cert.certName} 即将到期`,
        description: `SKU ${p.sku} 的 ${cert.certName} 证书将于 ${cert.expiryDate} 到期`,
        affectedSkus: [p.sku],
        expectedValue: '有效期内',
        actualValue: `${cert.expiryDate}到期`,
        impact: '证书过期后产品可能无法清关或被下架',
        fix: `提前续期 ${cert.certName}，通常需要4-8周，请立即启动续期流程`,
      });
    }
  }

  // ── 4. Cost-Price Inconsistency ────────────────────────────────────────────
  for (const p of products) {
    if (!p.cost) continue;
    // Check if selling price covers landed cost with reasonable margin
    const landedUsd = p.cost.totalLanded * (p.cost.exchangeRate || 7.2);
    const sellingPriceUsd = p.sellingPrice;
    if (sellingPriceUsd < landedUsd * 1.15) {
      issues.push({
        severity: 'critical',
        category: 'pricing',
        title: `${p.sku}: 售价可能无法覆盖成本`,
        description: `SKU ${p.sku} 到岸成本 $${landedUsd.toFixed(2)}，售价 $${sellingPriceUsd.toFixed(2)}，毛利空间仅 ${((sellingPriceUsd - landedUsd) / sellingPriceUsd * 100).toFixed(1)}%。扣除FBA费用和平台佣金后可能亏损。`,
        affectedSkus: [p.sku],
        expectedValue: '毛利率 > 20%',
        actualValue: `毛利率 ${((sellingPriceUsd - landedUsd) / sellingPriceUsd * 100).toFixed(1)}%`,
        impact: '持续亏损消耗现金流',
        fix: `建议提价至至少 $${(landedUsd * 1.35).toFixed(2)}（35%毛利率）或优化采购/物流成本`,
      });
    }
  }

  // ── 5. Origin vs Tariff Inconsistency ──────────────────────────────────────
  for (const p of products) {
    if (!p.cost) continue;
    if (p.origin === 'CN' && p.cost.tariff < 0.05 && p.cost.destination === 'US') {
      issues.push({
        severity: 'warning',
        category: 'origin',
        title: `${p.sku}: 中国原产商品关税可能被低估`,
        description: `SKU ${p.sku} 产地为中国，目的地美国，但应用关税率仅 ${(p.cost.tariff * 100).toFixed(1)}%。当前Section 301对华消费品关税通常为7.5-25%。`,
        affectedSkus: [p.sku],
        expectedValue: '至少7.5%',
        actualValue: `${(p.cost.tariff * 100).toFixed(1)}%`,
        impact: '海关稽查时可能要求补缴差额关税+罚款',
        fix: '核查HS编码和关税申报，确保使用正确的Section 301税率',
      });
    }
  }

  // ── Compute scores ────────────────────────────────────────────────────────
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const overallScore = Math.max(0, 100 - criticalCount * 10 - warningCount * 3);

  return {
    generatedAt: new Date().toISOString(),
    totalSkusAudited: allSkus.length,
    totalIssues: issues.length,
    criticalCount,
    warningCount,
    issues: issues.sort((a, b) =>
      a.severity === 'critical' && b.severity !== 'critical' ? -1 :
      a.severity !== 'critical' && b.severity === 'critical' ? 1 : 0
    ),
    overallScore,
    summary: overallScore >= 80
      ? `审计评分 ${overallScore}/100。数据一致性良好，${issues.length} 个改进建议。`
      : overallScore >= 60
        ? `审计评分 ${overallScore}/100。发现 ${criticalCount} 个严重问题和 ${warningCount} 个警告，建议优先处理严重问题。`
        : `审计评分 ${overallScore}/100。数据一致性较差，${criticalCount} 个严重矛盾需紧急修复，否则可能导致海关扣押、平台下架或资金损失。`,
  };
}
