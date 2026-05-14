/**
 * Product Compliance Auto-Check — "一键上架合规"
 *
 * Maps product category + target market → required certifications,
 * estimated costs, timelines, and regulatory risks.
 *
 * Uses existing DB models: ComplianceCert, RegulationChange, ProductHSCode, TariffRule.
 * Falls back to RAG knowledge base for certification details.
 *
 * Data sources:
 *   - Prisma: compliance_certs, regulation_changes, product_hs_codes, tariff_rules
 *   - RAG: compliance, safety, tariff knowledge chunks
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ComplianceRequirement {
  certName: string;
  certCode: string;        // FCC, CE, UL, RoHS, etc.
  mandatory: boolean;
  estimatedCostLow: number;
  estimatedCostHigh: number;
  timelineWeeks: number;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  notes: string;
}

export interface ComplianceCheckResult {
  productCategory: string;
  targetMarket: string;
  hsCode: string | null;
  requirements: ComplianceRequirement[];
  totalCostLow: number;
  totalCostHigh: number;
  totalTimelineWeeks: number;
  warnings: string[];
  existingCerts: string[];
  missingCerts: string[];
  regulatoryRisks: string[];
}

// ─── Compliance Database ─────────────────────────────────────────────────────────

interface MarketRequirement {
  market: string;
  category: string;
  certs: ComplianceRequirement[];
}

const COMPLIANCE_DB: MarketRequirement[] = [
  // ── USA ────────────────────────────────────────────────────────────────────
  {
    market: 'US', category: 'small-appliance-general',
    certs: [
      { certName: 'FCC-SDOC', certCode: 'FCC', mandatory: true, estimatedCostLow: 1000, estimatedCostHigh: 3000, timelineWeeks: 4, description: 'FCC符合性声明。无无线功能的普通电子设备适用。', riskLevel: 'low', notes: '标签须印FCC logo，用户手册含合规声明。' },
      { certName: 'UL安全认证', certCode: 'UL', mandatory: false, estimatedCostLow: 8000, estimatedCostHigh: 25000, timelineWeeks: 12, description: '虽然法律上非强制，但Amazon/Walmart等平台必须NRTL认证。', riskLevel: 'high', notes: '可用ETL(Intertek)或CSA替代，费用低20-30%。' },
      { certName: 'CPSIA GCC', certCode: 'GCC', mandatory: true, estimatedCostLow: 200, estimatedCostHigh: 500, timelineWeeks: 1, description: '一般合规证书。基于合理的测试计划声明产品符合安全标准。', riskLevel: 'low', notes: '亚马逊要求所有消费品提供GCC。' },
      { certName: '加州Proposition 65', certCode: 'Prop65', mandatory: true, estimatedCostLow: 200, estimatedCostHigh: 500, timelineWeeks: 2, description: '含铅/邻苯二甲酸酯/BPA等物质须贴警告标签。', riskLevel: 'medium', notes: '小家电常见Prop65物质: 铅(焊点/PVC线缆)、邻苯二甲酸酯(软塑料)。' },
    ],
  },
  {
    market: 'US', category: 'small-appliance-wireless',
    certs: [
      { certName: 'FCC-ID', certCode: 'FCC-ID', mandatory: true, estimatedCostLow: 5000, estimatedCostHigh: 15000, timelineWeeks: 12, description: '含WiFi/蓝牙无线模块的设备强制认证。TCB审核。', riskLevel: 'high', notes: '蓝牙模块如已有模块认证可引用，节省40-50%。' },
      { certName: 'UL安全认证', certCode: 'UL', mandatory: false, estimatedCostLow: 8000, estimatedCostHigh: 25000, timelineWeeks: 12, description: '平台必须。可用ETL替代。', riskLevel: 'high', notes: '' },
      { certName: 'CPSIA GCC', certCode: 'GCC', mandatory: true, estimatedCostLow: 200, estimatedCostHigh: 500, timelineWeeks: 1, description: '一般合规证书。', riskLevel: 'low', notes: '' },
      { certName: '加州Proposition 65', certCode: 'Prop65', mandatory: true, estimatedCostLow: 200, estimatedCostHigh: 500, timelineWeeks: 2, description: '有害物质警告标签。', riskLevel: 'medium', notes: '' },
    ],
  },
  {
    market: 'US', category: 'kitchen-appliance',
    certs: [
      { certName: 'FCC-SDOC', certCode: 'FCC', mandatory: true, estimatedCostLow: 1000, estimatedCostHigh: 3000, timelineWeeks: 4, description: 'FCC符合性声明。', riskLevel: 'low', notes: '' },
      { certName: 'UL 982/1082/1005', certCode: 'UL', mandatory: false, estimatedCostLow: 8000, estimatedCostHigh: 25000, timelineWeeks: 12, description: '厨房电器UL标准。UL982食品加工器 / UL1082咖啡机 / UL1005电热毯。', riskLevel: 'high', notes: '接触食品的部件需额外FDA 21 CFR检测。' },
      { certName: 'FDA食品接触材料', certCode: 'FDA', mandatory: true, estimatedCostLow: 500, estimatedCostHigh: 1500, timelineWeeks: 3, description: '接触食品的部件(榨汁杯/搅拌杯/密封圈)须FDA 21 CFR检测。', riskLevel: 'high', notes: '硅胶密封圈、不粘涂层是最常见不合规点。' },
      { certName: 'CPSIA GCC', certCode: 'GCC', mandatory: true, estimatedCostLow: 200, estimatedCostHigh: 500, timelineWeeks: 1, description: '一般合规证书。', riskLevel: 'low', notes: '' },
      { certName: '加州Proposition 65', certCode: 'Prop65', mandatory: true, estimatedCostLow: 200, estimatedCostHigh: 500, timelineWeeks: 2, description: '有害物质警告标签。', riskLevel: 'medium', notes: '' },
    ],
  },
  {
    market: 'US', category: 'battery-product',
    certs: [
      { certName: 'UN38.3', certCode: 'UN38.3', mandatory: true, estimatedCostLow: 2000, estimatedCostHigh: 4000, timelineWeeks: 3, description: '锂电池运输安全检测。8项测试。', riskLevel: 'high', notes: '>100Wh需按Class9危险品申报(+20-40%运费)。空运限每件≤2块锂电池。' },
      { certName: 'FCC-ID', certCode: 'FCC-ID', mandatory: true, estimatedCostLow: 5000, estimatedCostHigh: 15000, timelineWeeks: 12, description: '无线设备FCC认证。', riskLevel: 'high', notes: '' },
      { certName: 'UL安全认证', certCode: 'UL', mandatory: false, estimatedCostLow: 10000, estimatedCostHigh: 25000, timelineWeeks: 12, description: '含锂电池产品UL安全认证。', riskLevel: 'high', notes: '' },
    ],
  },

  // ── EU ─────────────────────────────────────────────────────────────────────
  {
    market: 'EU', category: 'small-appliance-general',
    certs: [
      { certName: 'CE-LVD', certCode: 'CE-LVD', mandatory: true, estimatedCostLow: 1500, estimatedCostHigh: 4000, timelineWeeks: 6, description: '低电压指令2014/35/EU。所有交流电器必须。', riskLevel: 'low', notes: '需EU境内授权代表。' },
      { certName: 'CE-EMC', certCode: 'CE-EMC', mandatory: true, estimatedCostLow: 1500, estimatedCostHigh: 3000, timelineWeeks: 4, description: '电磁兼容指令2014/30/EU。', riskLevel: 'low', notes: '通常与LVD一起做。' },
      { certName: 'RoHS 2.0', certCode: 'RoHS', mandatory: true, estimatedCostLow: 500, estimatedCostHigh: 1000, timelineWeeks: 2, description: '限制10项有害物质。均质材料限量0.1%(镉0.01%)。', riskLevel: 'medium', notes: '每批次需供应商提供RoHS合规声明。' },
      { certName: 'WEEE注册', certCode: 'WEEE', mandatory: true, estimatedCostLow: 100, estimatedCostHigh: 200, timelineWeeks: 2, description: '电子废弃物回收注册。德国EAR/WEEE注册€100-200/年。', riskLevel: 'low', notes: '按投放量支付回收费用。各国独立注册。' },
      { certName: 'CE-RED', certCode: 'CE-RED', mandatory: false, estimatedCostLow: 3000, estimatedCostHigh: 6000, timelineWeeks: 8, description: '无线设备指令2014/53/EU。只有含WiFi/蓝牙时需要。', riskLevel: 'high', notes: '' },
      { certName: 'EU 1935/2004', certCode: 'FDA-EU', mandatory: false, estimatedCostLow: 1000, estimatedCostHigh: 2500, timelineWeeks: 4, description: '食品接触材料法规。只有厨房电器需要。', riskLevel: 'high', notes: '' },
    ],
  },
  {
    market: 'EU', category: 'energy-label',
    certs: [
      { certName: 'ERP能效标签', certCode: 'ERP', mandatory: true, estimatedCostLow: 2000, estimatedCostHigh: 5000, timelineWeeks: 4, description: '能效标签A-G等级(EU 2017/1369)。覆盖空调/冰箱/吸尘器等60+品类。', riskLevel: 'medium', notes: '2021年起新等级不含A+/A++/A+++旧标签。库存旧标签产品限期18个月售完。' },
      { certName: 'CE-LVD', certCode: 'CE-LVD', mandatory: true, estimatedCostLow: 1500, estimatedCostHigh: 4000, timelineWeeks: 6, description: '低电压指令。', riskLevel: 'low', notes: '' },
      { certName: 'CE-EMC', certCode: 'CE-EMC', mandatory: true, estimatedCostLow: 1500, estimatedCostHigh: 3000, timelineWeeks: 4, description: '电磁兼容指令。', riskLevel: 'low', notes: '' },
      { certName: 'RoHS 2.0', certCode: 'RoHS', mandatory: true, estimatedCostLow: 500, estimatedCostHigh: 1000, timelineWeeks: 2, description: '有害物质限制。', riskLevel: 'medium', notes: '' },
    ],
  },

  // ── UK ─────────────────────────────────────────────────────────────────────
  {
    market: 'UK', category: 'small-appliance-general',
    certs: [
      { certName: 'UKCA', certCode: 'UKCA', mandatory: true, estimatedCostLow: 1500, estimatedCostHigh: 4000, timelineWeeks: 6, description: 'UK合规标志。2025年起强制执行，不再接受CE。', riskLevel: 'high', notes: '需UK境内负责人。过渡期已结束。' },
      { certName: 'RoHS UK', certCode: 'RoHS', mandatory: true, estimatedCostLow: 500, estimatedCostHigh: 1000, timelineWeeks: 2, description: 'UK版RoHS。', riskLevel: 'medium', notes: '' },
    ],
  },

  // ── Japan ──────────────────────────────────────────────────────────────────
  {
    market: 'JP', category: 'small-appliance-general',
    certs: [
      { certName: 'PSE', certCode: 'PSE', mandatory: true, estimatedCostLow: 2000, estimatedCostHigh: 6000, timelineWeeks: 8, description: '電気用品安全法。A类(116项)需METI注册+工厂审查, B类(225项)仅需自我声明。小家电多为B类。', riskLevel: 'high', notes: '电压需适配100V/50-60Hz。插头为A型(二脚扁插)。' },
      { certName: 'MIC无线技适', certCode: 'MIC', mandatory: false, estimatedCostLow: 3000, estimatedCostHigh: 8000, timelineWeeks: 8, description: '无线设备技适认证。只有含WiFi/蓝牙时需要。', riskLevel: 'high', notes: '' },
    ],
  },
];

// ─── Category Classifier ─────────────────────────────────────────────────────────

function classifyCategory(productName: string, description?: string): string[] {
  const text = (productName + ' ' + (description || '')).toLowerCase();
  const categories: string[] = [];

  // Check for wireless
  if (/wifi|wi-fi|bluetooth|蓝牙|无线|wireless|smart|智能|app\b|remote/.test(text)) {
    categories.push('small-appliance-wireless');
  }

  // Check for kitchen
  if (/coffee|咖啡|blender|榨汁|juicer|cooker|锅|grill|烤|toaster|面包|kettle|水壶|mixer|搅拌|food processor|chopper|steamer|蒸/.test(text)) {
    categories.push('kitchen-appliance');
  }

  // Check for battery
  if (/battery|电池|rechargeable|充电|锂|lithium|cordless|无线/.test(text)) {
    categories.push('battery-product');
  }

  // Check for energy label products
  if (/air conditioner|空调|refrigerator|冰箱|freezer|dishwasher|洗碗|washer|洗衣|dryer|烘干|vacuum|吸尘|hood|油烟/.test(text)) {
    categories.push('energy-label');
  }

  // Default
  if (categories.length === 0) {
    categories.push('small-appliance-general');
  }

  return [...new Set(categories)];
}

// ─── Main Check Function ────────────────────────────────────────────────────────

export async function checkCompliance(
  productName: string,
  targetMarket: string,
  description?: string,
): Promise<ComplianceCheckResult> {
  const marketUpper = targetMarket.toUpperCase();
  const categories = classifyCategory(productName, description);

  // Gather all requirements for the product's categories in the target market
  const requirements: ComplianceRequirement[] = [];
  const seenCerts = new Set<string>();

  for (const cat of categories) {
    const marketRules = COMPLIANCE_DB.filter(r =>
      r.market === marketUpper && r.category === cat
    );
    for (const rule of marketRules) {
      for (const cert of rule.certs) {
        if (!seenCerts.has(cert.certCode)) {
          seenCerts.add(cert.certCode);
          requirements.push(cert);
        }
      }
    }
  }

  // Also check general rules for any market match
  if (requirements.length === 0) {
    const generalRules = COMPLIANCE_DB.filter(r => r.market === marketUpper);
    if (generalRules.length === 0) {
      return {
        productCategory: productName,
        targetMarket: marketUpper,
        hsCode: null,
        requirements: [],
        totalCostLow: 0, totalCostHigh: 0, totalTimelineWeeks: 0,
        warnings: [`未找到 ${marketUpper} 市场的合规数据库。建议手动查询当地法规。`],
        existingCerts: [], missingCerts: [], regulatoryRisks: [],
      };
    }
    // Use the first general category for the market
    for (const cert of generalRules[0].certs) {
      if (!seenCerts.has(cert.certCode)) {
        seenCerts.add(cert.certCode);
        requirements.push(cert);
      }
    }
  }

  // Query DB for existing certs
  let existingCerts: string[] = [];
  try {
    const productSku = productName.match(/SKU[-:]\s*(\w+)/i)?.[1];
    if (productSku) {
      const dbCerts = await db.complianceCert.findMany({
        where: { sku: productSku, status: 'active' },
        select: { certName: true },
      });
      existingCerts = dbCerts.map(c => c.certName);
    }
  } catch { /* non-blocking */ }

  // Query HS code
  let hsCode: string | null = null;
  try {
    const words = productName.split(/[\s,，]+/).filter(w => w.length > 2);
    for (const word of words.slice(0, 3)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = await (db as any).productHSCode?.findFirst({
        where: { category: { contains: word, mode: 'insensitive' } },
      });
      if (match) { hsCode = match.hsCode; break; }
    }
  } catch { /* non-blocking */ }

  // Query regulatory risks
  let regulatoryRisks: string[] = [];
  try {
    const activeRegs = await db.regulationChange.findMany({
      where: { status: 'new', impactLevel: { in: ['high', 'medium'] } },
      select: { title: true },
      take: 5,
    });
    regulatoryRisks = activeRegs.map(r => r.title);
  } catch { /* non-blocking */ }

  // Calculate totals
  const totalCostLow = requirements.reduce((s, r) => s + r.estimatedCostLow, 0);
  const totalCostHigh = requirements.reduce((s, r) => s + r.estimatedCostHigh, 0);
  const maxTimeline = requirements.reduce((max, r) => Math.max(max, r.timelineWeeks), 0);

  // Identify missing
  const missingCerts = requirements
    .filter(r => !existingCerts.some(ec => ec.toLowerCase().includes(r.certCode.toLowerCase())))
    .map(r => r.certName);

  // Warnings
  const warnings: string[] = [];
  const highRiskCerts = requirements.filter(r => r.riskLevel === 'high' && r.mandatory);
  if (highRiskCerts.length > 0) {
    warnings.push(`以下认证为高风险强制项，缺失可能导致产品被下架: ${highRiskCerts.map(r => r.certName).join(', ')}`);
  }

  return {
    productCategory: productName,
    targetMarket: marketUpper,
    hsCode,
    requirements,
    totalCostLow,
    totalCostHigh,
    totalTimelineWeeks: maxTimeline,
    warnings,
    existingCerts,
    missingCerts,
    regulatoryRisks,
  };
}

/**
 * Check compliance for multiple markets at once.
 */
export async function checkMultiMarketCompliance(
  productName: string,
  markets: string[],
  description?: string,
): Promise<Record<string, ComplianceCheckResult>> {
  const results: Record<string, ComplianceCheckResult> = {};
  for (const market of markets) {
    results[market] = await checkCompliance(productName, market, description);
  }
  return results;
}
