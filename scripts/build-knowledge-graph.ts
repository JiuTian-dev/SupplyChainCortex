/**
 * Build Knowledge Graph — 从现有业务数据 + 领域知识库构建知识图谱.
 *
 * 数据源:
 *   1. Prisma Supplier → KnowledgeEntity (SUPPLIER)
 *   2. Prisma Product → KnowledgeEntity (PRODUCT)
 *   3. Prisma TariffRule → KnowledgeEntity (TARIFF_RULE)
 *   4. Prisma ProductHSCode → KnowledgeEntity (HS_CODE)
 *   5. Prisma ComplianceCert → KnowledgeEntity (REGULATION)
 *   6. 领域知识库 (domain-knowledge.ts) → 补充实体
 *
 * 关系:
 *   - SUPPLIER → SUPPLIES → PRODUCT (按 category 匹配)
 *   - PRODUCT → SUBJECT_TO → HS_CODE (按 category 匹配)
 *   - HS_CODE → SUBJECT_TO → TARIFF_RULE (按 hsCode 匹配)
 *   - PRODUCT → AFFECTED_BY → REGULATION (按 category/sku 匹配)
 *
 * 增量更新: 默认跳过已存在的 externalId 实体 (除非 --force).
 *
 * Run: npx tsx scripts/build-knowledge-graph.ts [--force] [--tenant=default]
 */

import { db } from '@/lib/db';
import {
  addEntity,
  addRelation,
  queryGraph,
  type KnowledgeEntityType,
  type KnowledgeRelationType,
} from '@/lib/knowledge/graph.service';
import {
  getAllDomainKnowledge,
  HS_CODE_CATEGORIES,
  TARIFF_RULES,
  LOGISTICS_LANES,
  REGULATIONS,
  SUPPLIER_RISK_FACTORS,
} from '@/lib/knowledge/domain-knowledge';

// ─── CLI Args ─────────────────────────────────────────────────────────────

interface CliOptions {
  force: boolean;
  tenantId: string;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force'),
    tenantId: args.find(a => a.startsWith('--tenant='))?.split('=')[1] || 'default',
    dryRun: args.includes('--dry-run'),
  };
}

// ─── Stats ────────────────────────────────────────────────────────────────

interface BuildStats {
  suppliersAdded: number;
  productsAdded: number;
  tariffRulesAdded: number;
  hsCodesAdded: number;
  regulationsAdded: number;
  logisticsLanesAdded: number;
  riskEventsAdded: number;
  relationsAdded: number;
  skipped: number;
  errors: number;
}

function emptyStats(): BuildStats {
  return {
    suppliersAdded: 0, productsAdded: 0, tariffRulesAdded: 0, hsCodesAdded: 0,
    regulationsAdded: 0, logisticsLanesAdded: 0, riskEventsAdded: 0,
    relationsAdded: 0, skipped: 0, errors: 0,
  };
}

// ─── Entity Cache (避免重复创建) ──────────────────────────────────────────

class EntityCache {
  private byExternalId = new Map<string, string>(); // externalId → entityId
  private byName = new Map<string, string>(); // name → entityId

  set(externalId: string | null, name: string, entityId: string): void {
    if (externalId) this.byExternalId.set(externalId, entityId);
    this.byName.set(name, entityId);
  }

  get(externalId: string | null, name?: string): string | undefined {
    if (externalId) return this.byExternalId.get(externalId);
    if (name) return this.byName.get(name);
    return undefined;
  }

  has(externalId: string | null, name?: string): boolean {
    return this.get(externalId, name) !== undefined;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  console.log('=== Knowledge Graph Builder ===');
  console.log(`Options: force=${opts.force}, tenant=${opts.tenantId}, dryRun=${opts.dryRun}`);

  if (opts.dryRun) {
    console.log('\n[DRY RUN] 仅模拟, 不写入数据库.');
  }

  const stats = emptyStats();
  const cache = new EntityCache();

  // 预加载已有实体 (增量更新)
  if (!opts.force) {
    await preloadCache(cache, opts.tenantId);
    console.log(`Preloaded ${cache['byExternalId'].size} existing entities (incremental mode).`);
  }

  try {
    // ── 1. 从 Prisma 业务数据构建实体 ──────────────────────────────────────
    console.log('\n--- Building from Prisma business data ---');
    await buildFromSuppliers(opts, cache, stats);
    await buildFromProducts(opts, cache, stats);
    await buildFromTariffRules(opts, cache, stats);
    await buildFromHSCodes(opts, cache, stats);
    await buildFromComplianceCerts(opts, cache, stats);

    // ── 2. 从领域知识库补充实体 ────────────────────────────────────────────
    console.log('\n--- Building from domain knowledge base ---');
    await buildFromDomainKnowledge(opts, cache, stats);

    // ── 3. 构建关系 ────────────────────────────────────────────────────────
    console.log('\n--- Building relations ---');
    await buildRelations(opts, cache, stats);

  } catch (err) {
    console.error('Build failed:', err);
    stats.errors++;
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n=== Build Summary ===');
  console.log(`Suppliers added:       ${stats.suppliersAdded}`);
  console.log(`Products added:        ${stats.productsAdded}`);
  console.log(`Tariff rules added:    ${stats.tariffRulesAdded}`);
  console.log(`HS codes added:        ${stats.hsCodesAdded}`);
  console.log(`Regulations added:     ${stats.regulationsAdded}`);
  console.log(`Logistics lanes added: ${stats.logisticsLanesAdded}`);
  console.log(`Risk events added:     ${stats.riskEventsAdded}`);
  console.log(`Relations added:       ${stats.relationsAdded}`);
  console.log(`Skipped (existing):    ${stats.skipped}`);
  console.log(`Errors:                ${stats.errors}`);

  const totalAdded = stats.suppliersAdded + stats.productsAdded + stats.tariffRulesAdded +
    stats.hsCodesAdded + stats.regulationsAdded + stats.logisticsLanesAdded +
    stats.riskEventsAdded + stats.relationsAdded;
  console.log(`\nTotal entities/relations added: ${totalAdded}`);

  if (stats.errors > 0) {
    process.exit(1);
  }

  console.log('\n✓ Knowledge graph build complete.');
}

// ─── Preload Cache ────────────────────────────────────────────────────────

async function preloadCache(cache: EntityCache, tenantId: string): Promise<void> {
  const existing = await db.knowledgeEntity.findMany({
    where: { tenantId },
    select: { id: true, externalId: true, name: true },
  });
  for (const e of existing) {
    cache.set(e.externalId, e.name, e.id);
  }
}

// ─── Build From Suppliers ─────────────────────────────────────────────────

async function buildFromSuppliers(
  opts: CliOptions,
  cache: EntityCache,
  stats: BuildStats,
): Promise<void> {
  const suppliers = await db.supplier.findMany({
    where: { tenantId: opts.tenantId },
  });
  console.log(`Found ${suppliers.length} suppliers in DB.`);

  for (const s of suppliers) {
    const externalId = `supplier:${s.id}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }

    if (opts.dryRun) {
      stats.suppliersAdded++;
      continue;
    }

    try {
      const entity = await addEntity({
        type: 'SUPPLIER',
        name: `${s.code}: ${s.name}`,
        description: `供应商 (${s.region}, ${s.category}), 评分 ${s.rating}, 交期 ${s.leadTime} 天, 状态 ${s.status}`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          code: s.code, region: s.region, category: s.category,
          rating: s.rating, leadTime: s.leadTime, status: s.status,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.suppliersAdded++;
    } catch (err) {
      console.warn(`Failed to add supplier ${s.code}:`, (err as Error).message);
      stats.errors++;
    }
  }
}

// ─── Build From Products ──────────────────────────────────────────────────

async function buildFromProducts(
  opts: CliOptions,
  cache: EntityCache,
  stats: BuildStats,
): Promise<void> {
  const products = await db.product.findMany({
    where: { tenantId: opts.tenantId },
  });
  console.log(`Found ${products.length} products in DB.`);

  for (const p of products) {
    const externalId = `product:${p.id}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }

    if (opts.dryRun) {
      stats.productsAdded++;
      continue;
    }

    try {
      const entity = await addEntity({
        type: 'PRODUCT',
        name: `${p.sku}: ${p.name}`,
        description: `产品 (${p.category}/${p.subCategory}), 单价 $${p.sellingPrice}, 成本 $${p.unitCost}, 产地 ${p.origin}`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          sku: p.sku, category: p.category, subCategory: p.subCategory,
          unitCost: p.unitCost, sellingPrice: p.sellingPrice, origin: p.origin,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.productsAdded++;
    } catch (err) {
      console.warn(`Failed to add product ${p.sku}:`, (err as Error).message);
      stats.errors++;
    }
  }
}

// ─── Build From Tariff Rules ──────────────────────────────────────────────

async function buildFromTariffRules(
  opts: CliOptions,
  cache: EntityCache,
  stats: BuildStats,
): Promise<void> {
  const rules = await db.tariffRule.findMany({
    where: { tenantId: opts.tenantId },
  });
  console.log(`Found ${rules.length} tariff rules in DB.`);

  for (const r of rules) {
    const externalId = `tariff:${r.id}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }

    if (opts.dryRun) {
      stats.tariffRulesAdded++;
      continue;
    }

    try {
      const entity = await addEntity({
        type: 'TARIFF_RULE',
        name: `${r.countryName} ${r.hsCode} ${r.rateType} ${r.rate}%`,
        description: `关税规则: ${r.countryName} (HS ${r.hsCode}), 税率 ${r.rate}%, 类型 ${r.rateType}, 协定 ${r.tradeAgreement || 'N/A'}, 原产国 ${r.originCountry}`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          countryCode: r.countryCode, hsCode: r.hsCode, rate: r.rate,
          rateType: r.rateType, tradeAgreement: r.tradeAgreement,
          originCountry: r.originCountry, effectiveFrom: r.effectiveFrom,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.tariffRulesAdded++;
    } catch (err) {
      console.warn(`Failed to add tariff rule ${r.id}:`, (err as Error).message);
      stats.errors++;
    }
  }
}

// ─── Build From HS Codes ──────────────────────────────────────────────────

async function buildFromHSCodes(
  opts: CliOptions,
  cache: EntityCache,
  stats: BuildStats,
): Promise<void> {
  const hsCodes = await db.productHSCode.findMany({
    where: { tenantId: opts.tenantId },
  });
  console.log(`Found ${hsCodes.length} HS codes in DB.`);

  for (const h of hsCodes) {
    const externalId = `hscode:${h.hsCode}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }

    if (opts.dryRun) {
      stats.hsCodesAdded++;
      continue;
    }

    try {
      const entity = await addEntity({
        type: 'HS_CODE',
        name: `HS ${h.hsCode}`,
        description: `HS 编码 ${h.hsCode}: ${h.description || h.category}${h.subCategory ? ` / ${h.subCategory}` : ''}${h.section ? ` (${h.section})` : ''}`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          hsCode: h.hsCode, category: h.category,
          subCategory: h.subCategory, section: h.section,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.hsCodesAdded++;
    } catch (err) {
      console.warn(`Failed to add HS code ${h.hsCode}:`, (err as Error).message);
      stats.errors++;
    }
  }
}

// ─── Build From Compliance Certs ──────────────────────────────────────────

async function buildFromComplianceCerts(
  opts: CliOptions,
  cache: EntityCache,
  stats: BuildStats,
): Promise<void> {
  const certs = await db.complianceCert.findMany({
    where: { tenantId: opts.tenantId },
  });
  console.log(`Found ${certs.length} compliance certs in DB.`);

  for (const c of certs) {
    const externalId = `regulation:${c.id}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }

    if (opts.dryRun) {
      stats.regulationsAdded++;
      continue;
    }

    try {
      const entity = await addEntity({
        type: 'REGULATION',
        name: c.certName,
        description: `合规认证 ${c.certName} (${c.category}), 状态 ${c.status}, 到期 ${c.expiryDate}${c.sku ? `, SKU ${c.sku}` : ''}`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          certName: c.certName, certNumber: c.certNumber,
          category: c.category, status: c.status, expiryDate: c.expiryDate,
          sku: c.sku,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.regulationsAdded++;
    } catch (err) {
      console.warn(`Failed to add cert ${c.certName}:`, (err as Error).message);
      stats.errors++;
    }
  }
}

// ─── Build From Domain Knowledge ──────────────────────────────────────────

async function buildFromDomainKnowledge(
  opts: CliOptions,
  cache: EntityCache,
  stats: BuildStats,
): Promise<void> {
  const dk = getAllDomainKnowledge();

  // HS Codes (补充 DB 中没有的)
  for (const h of dk.hsCodes) {
    const externalId = `hscode:${h.hsCode}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }
    if (opts.dryRun) { stats.hsCodesAdded++; continue; }
    try {
      const entity = await addEntity({
        type: 'HS_CODE',
        name: `HS ${h.hsCode}`,
        description: `${h.description} (美国 MFN ${h.usMFNRate}%, 欧盟 ${h.euRate}%, 出口退税 ${h.exportRebateRate}%)`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          hsCode: h.hsCode, category: h.category,
          exportRebateRate: h.exportRebateRate, usMFNRate: h.usMFNRate, euRate: h.euRate,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.hsCodesAdded++;
    } catch (err) {
      console.warn(`Failed to add HS code ${h.hsCode}:`, (err as Error).message);
      stats.errors++;
    }
  }

  // Tariff Rules (领域知识)
  for (const r of dk.tariffRules) {
    const externalId = `tariff-rule:${r.ruleId}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }
    if (opts.dryRun) { stats.tariffRulesAdded++; continue; }
    try {
      const entity = await addEntity({
        type: 'TARIFF_RULE',
        name: r.name,
        description: `${r.description} (${r.rateRange})${r.section ? ` [${r.section}]` : ''}. ${r.notes}`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          ruleId: r.ruleId, countries: r.countries, rateRange: r.rateRange,
          section: r.section,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.tariffRulesAdded++;
    } catch (err) {
      console.warn(`Failed to add tariff rule ${r.ruleId}:`, (err as Error).message);
      stats.errors++;
    }
  }

  // Logistics Lanes
  for (const l of dk.logisticsLanes) {
    const externalId = `logistics:${l.laneId}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }
    if (opts.dryRun) { stats.logisticsLanesAdded++; continue; }
    try {
      const entity = await addEntity({
        type: 'LOGISTICS_LANE',
        name: l.name,
        description: `${l.origin} → ${l.destination} (${l.mode}), 时效 ${l.transitDays.min}-${l.transitDays.max} 天, 成本 ${l.costRange}, 可靠性 ${l.reliability}. ${l.notes}`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          laneId: l.laneId, origin: l.origin, destination: l.destination,
          mode: l.mode, transitDays: l.transitDays, costRange: l.costRange,
          reliability: l.reliability,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.logisticsLanesAdded++;
    } catch (err) {
      console.warn(`Failed to add logistics lane ${l.laneId}:`, (err as Error).message);
      stats.errors++;
    }
  }

  // Regulations (领域知识)
  for (const reg of dk.regulations) {
    const externalId = `regulation-rule:${reg.regId}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }
    if (opts.dryRun) { stats.regulationsAdded++; continue; }
    try {
      const entity = await addEntity({
        type: 'REGULATION',
        name: reg.name,
        description: `${reg.description} (${reg.region}, ${reg.category}, ${reg.mandatory ? '强制' : '自愿'}). 成本 ${reg.cost}, 周期 ${reg.timeline}.`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          regId: reg.regId, region: reg.region, category: reg.category,
          mandatory: reg.mandatory, cost: reg.cost, timeline: reg.timeline,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.regulationsAdded++;
    } catch (err) {
      console.warn(`Failed to add regulation ${reg.regId}:`, (err as Error).message);
      stats.errors++;
    }
  }

  // Risk Events (供应商风险因子)
  for (const rf of dk.riskFactors) {
    const externalId = `risk:${rf.factorId}`;
    if (cache.has(externalId)) {
      stats.skipped++;
      continue;
    }
    if (opts.dryRun) { stats.riskEventsAdded++; continue; }
    try {
      const entity = await addEntity({
        type: 'RISK_EVENT',
        name: rf.name,
        description: `${rf.description} (类别 ${rf.category}, 权重 ${rf.weight}). 缓解: ${rf.mitigation}`,
        externalId,
        tenantId: opts.tenantId,
        metadata: {
          factorId: rf.factorId, category: rf.category,
          weight: rf.weight, mitigation: rf.mitigation,
        },
      });
      cache.set(externalId, entity.name, entity.id);
      stats.riskEventsAdded++;
    } catch (err) {
      console.warn(`Failed to add risk factor ${rf.factorId}:`, (err as Error).message);
      stats.errors++;
    }
  }
}

// ─── Build Relations ──────────────────────────────────────────────────────

async function buildRelations(
  opts: CliOptions,
  cache: EntityCache,
  stats: BuildStats,
): Promise<void> {
  if (opts.dryRun) {
    console.log('[DRY RUN] Skipping relations build.');
    return;
  }

  // 1. SUPPLIER → SUPPLIES → PRODUCT (按 category 匹配)
  const suppliers = await db.supplier.findMany({ where: { tenantId: opts.tenantId } });
  const products = await db.product.findMany({ where: { tenantId: opts.tenantId } });

  for (const s of suppliers) {
    const supplierEntityId = cache.get(`supplier:${s.id}`);
    if (!supplierEntityId) continue;

    for (const p of products) {
      if (p.category === s.category || p.subCategory === s.category) {
        const productEntityId = cache.get(`product:${p.id}`);
        if (!productEntityId) continue;
        try {
          await addRelation({
            sourceId: supplierEntityId,
            targetId: productEntityId,
            type: 'SUPPLIES',
            weight: s.rating < 3 ? 0.8 : s.rating < 4 ? 0.5 : 0.3,
            tenantId: opts.tenantId,
            metadata: { supplierCode: s.code, productSku: p.sku },
          });
          stats.relationsAdded++;
        } catch (err) {
          // 关系可能已存在, 忽略
        }
      }
    }
  }

  // 2. PRODUCT → SUBJECT_TO → HS_CODE (按 category 匹配)
  const hsCodes = await db.productHSCode.findMany({ where: { tenantId: opts.tenantId } });
  for (const p of products) {
    const productEntityId = cache.get(`product:${p.id}`);
    if (!productEntityId) continue;
    const matchingHs = hsCodes.find(h => h.category === p.category);
    if (matchingHs) {
      const hsEntityId = cache.get(`hscode:${matchingHs.hsCode}`);
      if (hsEntityId) {
        try {
          await addRelation({
            sourceId: productEntityId,
            targetId: hsEntityId,
            type: 'SUBJECT_TO',
            weight: 0.7,
            tenantId: opts.tenantId,
            metadata: { category: p.category },
          });
          stats.relationsAdded++;
        } catch { /* ignore */ }
      }
    }
  }

  // 3. HS_CODE → SUBJECT_TO → TARIFF_RULE (按 hsCode 匹配)
  const tariffRules = await db.tariffRule.findMany({ where: { tenantId: opts.tenantId } });
  for (const h of hsCodes) {
    const hsEntityId = cache.get(`hscode:${h.hsCode}`);
    if (!hsEntityId) continue;
    for (const t of tariffRules) {
      if (t.hsCode === h.hsCode) {
        const tariffEntityId = cache.get(`tariff:${t.id}`);
        if (tariffEntityId) {
          try {
            await addRelation({
              sourceId: hsEntityId,
              targetId: tariffEntityId,
              type: 'SUBJECT_TO',
              weight: 0.8,
              tenantId: opts.tenantId,
              metadata: { hsCode: h.hsCode, rate: t.rate },
            });
            stats.relationsAdded++;
          } catch { /* ignore */ }
        }
      }
    }
  }

  // 4. PRODUCT → AFFECTED_BY → REGULATION (按 sku 匹配合规证书)
  const certs = await db.complianceCert.findMany({ where: { tenantId: opts.tenantId } });
  for (const c of certs) {
    if (!c.sku) continue;
    const product = products.find(p => p.sku === c.sku);
    if (!product) continue;
    const productEntityId = cache.get(`product:${product.id}`);
    const regEntityId = cache.get(`regulation:${c.id}`);
    if (!productEntityId || !regEntityId) continue;
    try {
      await addRelation({
        sourceId: productEntityId,
        targetId: regEntityId,
        type: 'AFFECTED_BY',
        weight: c.status === 'expired' ? 0.9 : c.status === 'active' ? 0.3 : 0.6,
        tenantId: opts.tenantId,
        metadata: { certName: c.certName, status: c.status },
      });
      stats.relationsAdded++;
    } catch { /* ignore */ }
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
