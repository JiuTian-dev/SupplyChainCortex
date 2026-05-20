// @ts-nocheck
/**
 * Enhanced Seed Script — Large-Scale Realistic Supply Chain Data
 * Optimized: createMany 批量写入替代单条 create
 *
 * Usage: bun run prisma/seed-enhanced.ts
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const uuid = () => crypto.randomUUID();

const CATEGORIES = ['厨房电器', '清洁电器', '个人护理', '生活电器', '环境电器'];
const SUBCATEGORIES: Record<string, string[]> = {
  '厨房电器': ['电水壶', '咖啡机', '面包机', '榨汁机', '电饭煲', '电磁炉', '空气炸锅', '厨师机', '搅拌机', '电蒸锅'],
  '清洁电器': ['吸尘器', '加湿器', '净化器', '熨烫', '扫地机', '洗地机', '除螨仪', '蒸汽拖把'],
  '个人护理': ['吹风机', '按摩器', '牙刷', '体重秤', '剃须刀', '美容仪', '卷发棒', '洁面仪'],
  '生活电器': ['电风扇', '取暖器', '饮水机', '净水器', '酸奶机', '除湿机'],
  '环境电器': ['空调扇', '新风系统', '消毒柜', '烘干机'],
};

const WAREHOUSES = ['深圳仓', '义乌仓', '上海仓', '宁波仓'];
const CARRIERS = ['顺丰国际', '圆通国际', '中通国际', 'DHL', 'FedEx', 'UPS'];
const ORIGINS = ['深圳', '义乌', '上海', '宁波', '广州'];
const DESTINATIONS = [
  { name: '洛杉矶', code: 'US', rate: 7.25 },
  { name: '纽约', code: 'US', rate: 7.25 },
  { name: '伦敦', code: 'GB', rate: 9.18 },
  { name: '法兰克福', code: 'EU', rate: 7.85 },
  { name: '东京', code: 'JP', rate: 0.048 },
  { name: '悉尼', code: 'AU', rate: 4.77 },
  { name: '新加坡', code: 'SG', rate: 5.40 },
  { name: '多伦多', code: 'CA', rate: 5.30 },
  { name: '迪拜', code: 'AE', rate: 3.67 },
  { name: '首尔', code: 'KR', rate: 0.0054 },
];

const PLATFORMS = ['Amazon', 'Shopify', 'Walmart', 'eBay', 'Temu', 'TikTok Shop'];

function weatherSeverity(dayOfYear: number, portIndex: number): number {
  const seasonal = 20 + 15 * Math.sin((dayOfYear - 120) * Math.PI / 180);
  const portBase = [30, 28, 25, 35, 22, 32, 40, 35, 28, 25][portIndex % 10];
  const noise = (Math.sin(dayOfYear * portIndex * 0.7) * 0.5 + 0.5) * 25;
  return Math.min(Math.round(seasonal + noise * 0.3 + portBase * 0.3), 100);
}

function delayProbability(weatherScore: number): number {
  if (weatherScore > 70) return 0.65;
  if (weatherScore > 40) return 0.35;
  if (weatherScore > 15) return 0.12;
  return 0.03;
}

function delayDays(weatherScore: number): number {
  if (weatherScore > 70) return 3 + Math.floor(Math.random() * 6);
  if (weatherScore > 40) return 1 + Math.floor(Math.random() * 3);
  if (weatherScore > 15) return Math.random() < 0.3 ? 1 : 0;
  return 0;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

async function main() {
  console.log('🌱 Enhanced Seed: Generating large-scale realistic data...\n');

  console.log('Clearing existing data...');
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.regulationChange.deleteMany();
  await prisma.complianceCert.deleteMany();
  await prisma.warrantyCost.deleteMany();
  await prisma.defectRecord.deleteMany();
  await prisma.returnRecord.deleteMany();
  await prisma.supplyChainNote.deleteMany();
  await prisma.reorderOrder.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.supplyChainEvent.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.salesRecord.deleteMany();
  await prisma.shipmentItem.deleteMany();
  await prisma.costRecord.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.productHSCode.deleteMany();
  await prisma.tariffRule.deleteMany();
  await prisma.product.deleteMany();

  // ═══════════════════════════════════════════════════════════════════════════
  // 100 Products (pre-generate IDs + createMany)
  // ═══════════════════════════════════════════════════════════════════════════
  const totalProducts = 100;
  const productModels: Array<{
    id: string; sku: string; name: string; category: string; subCategory: string;
    unitCost: number; sellingPrice: number; weight: number;
    origin: string; abcClass: string; fsnClass: string;
  }> = [];

  const productNames: Record<string, string[]> = {
    '厨房电器': ['智能电热水壶', '便携式咖啡机', '多功能烤面包机', '便携榨汁杯', 'IH电饭煲', '双灶电磁炉', '智能空气炸锅', '多功能厨师机', '高速搅拌机', '不锈钢电蒸锅', '迷你电煮锅', '陶瓷电炖锅', '折叠电火锅', '智能温奶器', '早餐三明治机', '电动研磨机', '保温电热水瓶', '台式电烤箱', '胶囊咖啡机', '破壁料理机'],
    '清洁电器': ['无线手持吸尘器', '智能加湿器', 'HEPA空气净化器', '蒸汽挂烫机', '激光扫地机', '无线洗地机', 'UV除螨仪', '手持蒸汽拖把', '迷你吸尘器', '桌面净化器', '超声波清洗机', '电动擦窗机', '地毯清洗机', '高温蒸汽清洁机', '宠物吸毛器', '卫生间除霉器'],
    '个人护理': ['负离子吹风机', '电动按摩仪', '电动牙刷套装', '电子秤', '5刀头剃须刀', 'RF射频美容仪', '自动卷发棒', '超声波洁面仪', '眼部按摩仪', '筋膜枪', '红外额温枪', '电动修脚器', '热敷眼罩', '电动剃毛器', '水牙线', '颈椎按摩枕'],
    '生活电器': ['遥控落地风扇', 'PTC取暖器', '台式饮水机', 'RO反渗透净水器', '酸奶发酵机', '除湿干燥机', '暖风机', '迷你冰箱', '电热毯', '驱蚊器', '烘鞋器', '干衣机', '暖手宝充电宝'],
    '环境电器': ['移动空调扇', '壁挂新风机', '紫外线消毒柜', '热泵烘干机', '香薰加湿器', '桌面空调', '负离子发生器'],
  };

  let productIdx = 0;
  for (const cat of CATEGORIES) {
    const names = productNames[cat] || [];
    const subs = SUBCATEGORIES[cat] || [cat];
    for (let i = 0; i < names.length && productIdx < totalProducts; i++) {
      const abcClass = i < names.length * 0.3 ? 'A' : i < names.length * 0.7 ? 'B' : 'C';
      const fsnClass = i < names.length * 0.4 ? 'F' : i < names.length * 0.7 ? 'S' : 'N';
      const baseCost = 3 + productIdx * 0.8;
      productModels.push({
        id: uuid(), sku: `SKU-${String(productIdx + 1).padStart(4, '0')}`,
        name: names[i], category: cat, subCategory: subs[i % subs.length],
        unitCost: Math.round(baseCost * 100) / 100,
        sellingPrice: Math.round(baseCost * 3.2 * 100) / 100,
        weight: 0.3 + (productIdx % 20) * 0.25, origin: 'CN',
        abcClass, fsnClass,
      });
      productIdx++;
    }
  }

  await prisma.product.createMany({ data: productModels });
  console.log(`✅ ${productModels.length} 产品`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Inventory (createMany)
  // ═══════════════════════════════════════════════════════════════════════════
  const inventoryData = productModels.map((p, i) => {
    const warehouse = WAREHOUSES[i % 4];
    const isA = p.abcClass === 'A';
    const baseQty = isA ? 2000 : p.abcClass === 'B' ? 800 : 300;
    const safetyStock = Math.round(baseQty * 0.25);
    const reorderPoint = Math.round(baseQty * 0.35);
    const qty = Math.round(baseQty * (0.3 + seededRandom(i * 7) * 1.4));
    const turnoverRate = isA ? 6 + seededRandom(i * 13) * 4 : 2 + seededRandom(i * 17) * 3;

    let stockStatus = 'healthy';
    if (qty < safetyStock * 0.7) stockStatus = 'critical';
    else if (qty < safetyStock) stockStatus = 'warning';
    else if (turnoverRate < 2) stockStatus = 'overstock';

    return {
      id: uuid(), productId: p.id, sku: p.sku, productName: p.name, warehouse,
      quantity: qty, safetyStock, reorderPoint,
      inTransit: Math.round(qty * 0.1 * seededRandom(i * 19)),
      turnoverRate: Math.round(turnoverRate * 10) / 10,
      turnoverDays: Math.round(365 / Math.max(turnoverRate, 0.5)),
      stockStatus,
    };
  });

  const criticalCount = inventoryData.filter(i => i.stockStatus === 'critical').length;
  const warningCount = inventoryData.filter(i => i.stockStatus === 'warning').length;
  await prisma.inventory.createMany({ data: inventoryData });
  console.log(`✅ ${inventoryData.length} 库存记录 (${criticalCount} critical, ${warningCount} warning)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Cost Records (createMany)
  // ═══════════════════════════════════════════════════════════════════════════
  let criticalMargins = 0;
  let lowMargins = 0;
  const costData = productModels.map((p, i) => {
    const dest = DESTINATIONS[i % DESTINATIONS.length];
    const rawMaterial = Math.round(p.unitCost * 0.4 * 100) / 100;
    const labor = Math.round(p.unitCost * 0.2 * 100) / 100;
    const logistics = Math.round(p.weight * 3.5 * 100) / 100;
    const tariff = Math.round(p.sellingPrice * 0.06 * 100) / 100;
    const platformFee = Math.round(p.sellingPrice * 0.12 * 100) / 100;
    const exchangeRate = dest.rate + (seededRandom(i * 23) - 0.5) * 1.5;

    const cnyCost = (rawMaterial + labor) / exchangeRate;
    const usdCost = logistics + tariff + platformFee;
    const totalLanded = Math.round((cnyCost + usdCost) * 100) / 100;
    const grossMargin = Math.round(((p.sellingPrice - totalLanded) / p.sellingPrice) * 1000) / 10;

    if (grossMargin < 40) criticalMargins++;
    else if (grossMargin < 48) lowMargins++;

    return {
      id: uuid(), productId: p.id, sku: p.sku, productName: p.name,
      rawMaterial, labor, logistics, tariff, platformFee,
      exchangeRate: Math.round(exchangeRate * 10000) / 10000,
      destination: dest.code,
      totalLanded, sellingPrice: p.sellingPrice, grossMargin,
    };
  });
  await prisma.costRecord.createMany({ data: costData });
  console.log(`✅ ${costData.length} 成本记录 (${criticalMargins} 毛利<40%, ${lowMargins} 毛利40-48%)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 200+ Shipments with weather-correlated delays (createMany)
  // ═══════════════════════════════════════════════════════════════════════════
  const totalShipments = 220;
  const statuses = ['pending', 'in_transit', 'customs', 'delivered', 'delayed', 'exception'] as const;
  let delayedShipments = 0;
  let weatherCorrelatedDelays = 0;

  const shipmentData: Array<{
    id: string; trackingNumber: string; productId: string; sku: string;
    productName: string; origin: string; destination: string; carrier: string;
    status: string; eta: Date; actualDelivery: Date | null;
    delayDays: number; riskLevel: string; events: string;
  }> = [];

  for (let i = 0; i < totalShipments; i++) {
    const product = productModels[i % productModels.length];
    const origin = ORIGINS[i % ORIGINS.length];
    const dest = DESTINATIONS[i % DESTINATIONS.length];

    const dayOfYear = (i * 3 + 90) % 365;
    const portIdx = ORIGINS.indexOf(origin) + i % DESTINATIONS.length;
    const wScore = weatherSeverity(dayOfYear, portIdx);

    const willDelay = seededRandom(i * 41 + dayOfYear) < delayProbability(wScore);
    const delay = willDelay ? delayDays(wScore) : 0;

    let status: typeof statuses[number] = 'delivered';
    if (delay > 3) status = delay > 6 ? 'exception' : 'delayed';
    else if (delay > 1) status = seededRandom(i) < 0.3 ? 'customs' : 'delayed';
    else if (delay > 0) status = 'in_transit';

    if (status === 'delayed' || status === 'exception') delayedShipments++;
    if (willDelay && delay > 0) weatherCorrelatedDelays++;

    const etaDate = new Date(Date.now() + (10 + delay + i % 5) * 86400000);
    const actualDelivery = status === 'delivered'
      ? new Date(Date.now() - (3 + i % 5) * 86400000)
      : null;

    shipmentData.push({
      id: uuid(), trackingNumber: `TRK-${String(i + 1000).padStart(8, '0')}`,
      productId: product.id, sku: product.sku, productName: product.name,
      origin, destination: dest.name, carrier: CARRIERS[i % CARRIERS.length],
      status, eta: etaDate, actualDelivery,
      delayDays: delay, riskLevel: delay > 5 ? 'high' : delay > 2 ? 'medium' : 'low',
      events: JSON.stringify([]),
    });
  }

  await prisma.shipmentItem.createMany({ data: shipmentData });
  console.log(`✅ ${shipmentData.length} 货运记录 (${delayedShipments} 延迟, ${weatherCorrelatedDelays} 天气相关)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 365 Days Sales (createMany batches)
  // ═══════════════════════════════════════════════════════════════════════════
  const totalSalesDays = 365;
  let totalSalesRecords = 0;

  const salesBatch: Array<{
    id: string; productId: string; sku: string; productName: string;
    date: Date; quantity: number; revenue: number; platform: string;
  }> = [];

  for (let day = 0; day < totalSalesDays; day++) {
    const date = new Date(Date.now() - (totalSalesDays - day) * 86400000);
    date.setHours(0, 0, 0, 0);
    const dayOfYear = date.getFullYear() === 2026
      ? Math.floor((date.getTime() - new Date('2026-01-01').getTime()) / 86400000)
      : day;

    for (const product of productModels) {
      const prodIdx = productModels.indexOf(product);
      const abcMultiplier = product.abcClass === 'A' ? 3 : product.abcClass === 'B' ? 1.5 : 0.5;
      const seasonal = 1 + 0.3 * Math.sin((dayOfYear - 300) * Math.PI / 180);
      const weekly = 1 + 0.3 * (day % 7 === 0 || day % 7 === 6 ? 1 : 0);
      const fxSim = 1 + 0.15 * Math.sin(dayOfYear * 0.05 + prodIdx * 0.3);
      const baseQty = Math.round(
        abcMultiplier * seasonal * weekly * fxSim * (2 + seededRandom(prodIdx * 1000 + day) * 4)
      );

      if (baseQty > 0) {
        salesBatch.push({
          id: uuid(), productId: product.id, sku: product.sku, productName: product.name,
          date, quantity: baseQty,
          revenue: Math.round(baseQty * product.sellingPrice * 100) / 100,
          platform: PLATFORMS[prodIdx % PLATFORMS.length],
        });
        totalSalesRecords++;
      }
    }

    if (salesBatch.length > 3000) {
      await prisma.salesRecord.createMany({ data: salesBatch });
      salesBatch.length = 0;
    }
  }

  if (salesBatch.length > 0) {
    await prisma.salesRecord.createMany({ data: salesBatch });
  }
  console.log(`✅ ${totalSalesRecords} 销售记录 (${totalSalesDays} 天)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 20 Suppliers (createMany)
  // ═══════════════════════════════════════════════════════════════════════════
  const supplierNames = [
    '东莞精密模具厂', '深圳电子元器件公司', '宁波小家电制造', '佛山注塑工艺厂',
    '中山电机供应商', '惠州五金加工', '温州电器配件', '苏州精密制造',
    '厦门模具科技', '顺德家电配件', '杭州传感器公司', '无锡开关面板',
    '绍兴发热元件', '潮州陶瓷配件', '揭阳不锈钢制品', '汕头包装材料',
    '珠海电路板厂', '江门马达制造', '肇庆温度控制器', '茂名电线电缆',
  ];

  await prisma.supplier.createMany({
    data: supplierNames.map((name, i) => {
      const region = ['广东', '浙江', '江苏', '福建'][i % 4];
      const rating = Math.round((2.5 + seededRandom(i * 31) * 2.5) * 10) / 10;
      const leadTime = 7 + Math.round(seededRandom(i * 47) * 21);
      return {
        id: uuid(), code: `SUP-${String(i + 1).padStart(3, '0')}`,
        name, region, rating, leadTime,
        category: CATEGORIES[i % CATEGORIES.length],
        contact: `联系人${i + 1}`, email: `supplier${i + 1}@example.com`,
        status: rating < 3 ? 'inactive' : 'active',
      };
    }),
  });
  console.log(`✅ ${supplierNames.length} 供应商`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Basic Alert Rules
  // ═══════════════════════════════════════════════════════════════════════════
  await prisma.alertRule.createMany({
    data: [
      { id: uuid(), ruleId: 'rule-001', name: '库存紧急预警', field: 'quantity', operator: 'lt', threshold: 0.3, unit: 'ratio', enabled: true, severity: 'critical' },
      { id: uuid(), ruleId: 'rule-002', name: '毛利过低预警', field: 'grossMargin', operator: 'lt', threshold: 40, unit: '%', enabled: true, severity: 'high' },
      { id: uuid(), ruleId: 'rule-003', name: '货运严重延迟', field: 'delayDays', operator: 'gt', threshold: 5, unit: 'days', enabled: true, severity: 'high' },
      { id: uuid(), ruleId: 'rule-004', name: '库存积压预警', field: 'turnoverDays', operator: 'gt', threshold: 180, unit: 'days', enabled: true, severity: 'warning' },
    ],
  });
  console.log('✅ 4 预警规则');

  // ═══════════════════════════════════════════════════════════════════════════
  // HS Code Mappings + Tariff Rules (createMany)
  // ═══════════════════════════════════════════════════════════════════════════
  const hsCodeData = [
    { category: '厨房电器', subCategory: '电水壶', hsCode: '8516.79', description: '电热器具-电水壶', section: 'XVI-85' },
    { category: '厨房电器', subCategory: '咖啡机', hsCode: '8419.81', description: '加热器具-咖啡机', section: 'XVI-84' },
    { category: '厨房电器', subCategory: '面包机', hsCode: '8516.72', description: '电热器具-烤面包机', section: 'XVI-85' },
    { category: '厨房电器', subCategory: '榨汁机', hsCode: '8509.40', description: '食品研磨搅拌机', section: 'XVI-85' },
    { category: '厨房电器', subCategory: '电饭煲', hsCode: '8516.60', description: '电热器具-电饭锅', section: 'XVI-85' },
    { category: '厨房电器', subCategory: '电磁炉', hsCode: '8516.60', description: '电热器具-电磁炉', section: 'XVI-85' },
    { category: '厨房电器', subCategory: '空气炸锅', hsCode: '8516.60', description: '电热器具-炸锅', section: 'XVI-85' },
    { category: '厨房电器', subCategory: null, hsCode: '8516.79', description: '厨房电热器具（其他）', section: 'XVI-85' },
    { category: '清洁电器', subCategory: '吸尘器', hsCode: '8508.11', description: '真空吸尘器≤1500W', section: 'XVI-85' },
    { category: '清洁电器', subCategory: '加湿器', hsCode: '8509.80', description: '家用电器-加湿器', section: 'XVI-85' },
    { category: '清洁电器', subCategory: '净化器', hsCode: '8421.39', description: '空气过滤净化器', section: 'XVI-84' },
    { category: '清洁电器', subCategory: '扫地机', hsCode: '8508.60', description: '自动扫地机器人', section: 'XVI-85' },
    { category: '清洁电器', subCategory: null, hsCode: '8509.80', description: '家用电动器具（其他）', section: 'XVI-85' },
    { category: '个人护理', subCategory: '吹风机', hsCode: '8516.31', description: '电热美发器具-吹风机', section: 'XVI-85' },
    { category: '个人护理', subCategory: '按摩器', hsCode: '9019.10', description: '按摩器具', section: 'XX-90' },
    { category: '个人护理', subCategory: '牙刷', hsCode: '8509.80', description: '电动牙刷', section: 'XVI-85' },
    { category: '个人护理', subCategory: '剃须刀', hsCode: '8510.10', description: '电动剃须刀', section: 'XVI-85' },
    { category: '个人护理', subCategory: null, hsCode: '8509.80', description: '个人护理电动器具', section: 'XVI-85' },
    { category: '生活电器', subCategory: null, hsCode: '8414.51', description: '电风扇', section: 'XVI-84' },
    { category: '环境电器', subCategory: null, hsCode: '8415.10', description: '空调设备', section: 'XVI-84' },
  ];

  await prisma.productHSCode.createMany({
    data: hsCodeData.map(hs => ({ id: uuid(), ...hs })),
    skipDuplicates: true,
  });
  console.log(`✅ ${hsCodeData.length} HS编码映射`);

  // Tariff Rules
  const tariffRuleData = [
    { countryCode: 'US', countryName: '美国', hsCode: '8516.79', rate: 0, tradeAgreement: 'Section301-List3', effectiveFrom: '2018-09-24', effectiveTo: null, priority: 100, notes: 'LIST3最初25%，2020降至7.5%，2024复审后维持', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8516.72', rate: 7.5, tradeAgreement: 'Section301-List3', effectiveFrom: '2020-02-14', effectiveTo: null, priority: 100, notes: 'LIST3：面包机', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8509.40', rate: 25, tradeAgreement: 'Section301-List1', effectiveFrom: '2018-07-06', effectiveTo: null, priority: 100, notes: 'LIST1：食品加工机', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8508.11', rate: 25, tradeAgreement: 'Section301-List3', effectiveFrom: '2018-09-24', effectiveTo: null, priority: 100, notes: 'LIST3：吸尘器（2024复审维持25%）', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8421.39', rate: 25, tradeAgreement: 'Section301-List1', effectiveFrom: '2018-07-06', effectiveTo: null, priority: 100, notes: 'LIST1：空气净化器', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8516.31', rate: 25, tradeAgreement: 'Section301-List3', effectiveFrom: '2018-09-24', effectiveTo: null, priority: 100, notes: 'LIST3：吹风机/美发器具', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '9019.10', rate: 25, tradeAgreement: 'Section301-List3', effectiveFrom: '2018-09-24', effectiveTo: null, priority: 100, notes: 'LIST3：按摩器具', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8508.60', rate: 0, tradeAgreement: 'Section301-List4A', effectiveFrom: '2019-09-01', effectiveTo: null, priority: 100, notes: 'LIST4A：扫地机器人（暂未加征）', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8516.79', rate: 2.7, tradeAgreement: 'MFN', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 50, notes: 'WTO MFN rate for electric heating appliances', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8509.40', rate: 4.2, tradeAgreement: 'MFN', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 50, notes: 'WTO MFN food grinders', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8508.11', rate: 2.8, tradeAgreement: 'MFN', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 50, notes: 'WTO MFN vacuum cleaners', rateType: 'ad_valorem' },
    { countryCode: 'EU', countryName: '欧盟', hsCode: '8516.79', rate: 2.7, tradeAgreement: 'MFN', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 50, notes: 'EU TARIC: electro-thermic appliances', rateType: 'ad_valorem' },
    { countryCode: 'EU', countryName: '欧盟', hsCode: '8508.11', rate: 2.2, tradeAgreement: 'MFN', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 50, notes: 'EU TARIC: vacuum cleaners', rateType: 'ad_valorem' },
    { countryCode: 'EU', countryName: '欧盟', hsCode: '8414.51', rate: 3.2, tradeAgreement: 'MFN', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 50, notes: 'EU TARIC: fans', rateType: 'ad_valorem' },
    { countryCode: 'EU', countryName: '欧盟', hsCode: '8516.79', rate: 2.7 + 3.0, tradeAgreement: 'CBAM-2026', effectiveFrom: '2026-01-01', effectiveTo: null, priority: 80, notes: 'CBAM phase-in: 基本关税 + 碳边境调整（基于隐含碳排放）', rateType: 'compound' },
    { countryCode: 'EU', countryName: '欧盟', hsCode: '8421.39', rate: 1.7 + 2.5, tradeAgreement: 'CBAM-2026', effectiveFrom: '2026-01-01', effectiveTo: null, priority: 80, notes: 'CBAM: 净化器/过滤器', rateType: 'compound' },
    { countryCode: 'JP', countryName: '日本', hsCode: '8516.79', rate: 0, tradeAgreement: 'RCEP', effectiveFrom: '2022-01-01', effectiveTo: null, priority: 80, notes: 'RCEP: 第5年降至0%（2026年）', rateType: 'ad_valorem' },
    { countryCode: 'JP', countryName: '日本', hsCode: '8508.11', rate: 0, tradeAgreement: 'RCEP', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 80, notes: 'RCEP: 吸尘器已零关税', rateType: 'ad_valorem' },
    { countryCode: 'JP', countryName: '日本', hsCode: '8509.40', rate: 1.2, tradeAgreement: 'RCEP', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 80, notes: 'RCEP: 食品加工机逐步降税', rateType: 'ad_valorem' },
    { countryCode: 'KR', countryName: '韩国', hsCode: '8516.79', rate: 0, tradeAgreement: 'RCEP', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 80, notes: 'RCEP: 电热器具已零关税', rateType: 'ad_valorem' },
    { countryCode: 'KR', countryName: '韩国', hsCode: '8508.11', rate: 2.0, tradeAgreement: 'RCEP', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 80, notes: 'RCEP: 吸尘器逐步降至0%', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8516.79', rate: 0, tradeAgreement: 'USMCA', effectiveFrom: '2020-07-01', effectiveTo: null, priority: 110, notes: 'USMCA: 墨西哥/加拿大原产享零关税（需满足原产地规则）', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8508.11', rate: 0, tradeAgreement: 'USMCA', effectiveFrom: '2020-07-01', effectiveTo: null, priority: 110, notes: 'USMCA: 吸尘器零关税', rateType: 'ad_valorem' },
    { countryCode: 'US', countryName: '美国', hsCode: '8421.39', rate: 0, tradeAgreement: 'USMCA', effectiveFrom: '2020-07-01', effectiveTo: null, priority: 110, notes: 'USMCA: 空气净化器零关税', rateType: 'ad_valorem' },
    { countryCode: 'AU', countryName: '澳大利亚', hsCode: '8516.79', rate: 0, tradeAgreement: 'FTA', effectiveFrom: '2015-12-20', effectiveTo: null, priority: 80, notes: '中澳FTA: 小家电已全部零关税', rateType: 'ad_valorem' },
    { countryCode: 'GB', countryName: '英国', hsCode: '8516.79', rate: 2.0, tradeAgreement: 'UKGT', effectiveFrom: '2024-01-01', effectiveTo: null, priority: 50, notes: 'UK Global Tariff: post-Brexit applied rate', rateType: 'ad_valorem' },
  ];

  await prisma.tariffRule.createMany({
    data: tariffRuleData.map(r => ({ id: uuid(), ...r })),
  });
  console.log(`✅ ${tariffRuleData.length} 关税规则 (${new Set(tariffRuleData.map(r => r.tradeAgreement)).size} 个贸易协定)`);

  console.log('\n📊 数据质量报告:');
  console.log(`   产品: ${productModels.length}`);
  console.log(`   库存: ${inventoryData.length} (critical: ${criticalCount})`);
  console.log(`   货运: ${shipmentData.length} (延迟: ${delayedShipments})`);
  console.log(`   天气-延迟关联: ${delayedShipments} 条可用于校准`);
  console.log(`   销售: ${totalSalesRecords} 条 (${totalSalesDays}天)`);
  console.log(`   供应商: ${supplierNames.length}`);
  console.log(`   成本-汇率关联: ${costData.length} 条`);

  console.log('\n🎉 增强种子数据完成!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
