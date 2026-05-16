// 小家电供应链 - 压测种子（大规模真实数据）
// 200 产品 × 365 天销售 × 4 仓库存 × 完整链路

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Seeded PRNG for reproducible "randomness"
function createRNG(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const rng = createRNG(42);

// ─── Data catalogs ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { cat: '厨房电器', subs: ['电水壶','咖啡机','面包机','榨汁机','电饭煲','空气炸锅','料理机','电烤盘'] },
  { cat: '清洁电器', subs: ['吸尘器','加湿器','净化器','蒸汽拖把','除螨仪','扫地机','洗地机'] },
  { cat: '个人护理', subs: ['吹风机','按摩器','牙刷','体重秤','美容仪','剃须刀','直发器'] },
  { cat: '户外用品', subs: ['露营灯','户外电源','便携风扇','烧烤炉'] },
  { cat: '车载电器', subs: ['车载吸尘器','空气净化器','冰箱','充电器'] },
];

const WAREHOUSES = ['深圳仓','义乌仓','宁波仓','越南仓'];

const SUPPLIERS = [
  { code:'SUP-DG001', name:'东莞精密模具厂', region:'华南', cat:'塑料五金件', lt:10, rating:4.5 },
  { code:'SUP-SH002', name:'上海电子科技', region:'华东', cat:'电子元器件', lt:7, rating:4.8 },
  { code:'SUP-YW003', name:'义乌日用品有限公司', region:'华东', cat:'包装材料', lt:5, rating:4.2 },
  { code:'SUP-SZ004', name:'深圳顺达物流', region:'华南', cat:'物流运输', lt:3, rating:3.9 },
  { code:'SUP-FS005', name:'佛山小家电制造', region:'华南', cat:'成品代工', lt:21, rating:4.6 },
  { code:'SUP-NB006', name:'宁波海关代理', region:'华东', cat:'清关服务', lt:2, rating:4.0 },
  { code:'SUP-GZ007', name:'广州电机厂', region:'华南', cat:'电机马达', lt:14, rating:4.3 },
  { code:'SUP-WX008', name:'无锡传感器科技', region:'华东', cat:'传感器', lt:9, rating:4.7 },
  { code:'SUP-CD009', name:'成都线束厂', region:'西南', cat:'电子线束', lt:11, rating:4.1 },
  { code:'SUP-TJ010', name:'天津阀门厂', region:'华北', cat:'阀门管件', lt:8, rating:4.4 },
  { code:'SUP-HZ011', name:'杭州电路板', region:'华东', cat:'PCB电路板', lt:12, rating:4.6 },
  { code:'SUP-XM012', name:'厦门注塑厂', region:'华南', cat:'注塑外壳', lt:6, rating:4.5 },
  { code:'SUP-CQ013', name:'重庆热处理', region:'西南', cat:'热处理加工', lt:15, rating:3.8 },
  { code:'SUP-QD014', name:'青岛包装印刷', region:'华北', cat:'包装印刷', lt:4, rating:4.2 },
  { code:'SUP-ZZ015', name:'郑州物流仓储', region:'华中', cat:'仓储物流', lt:2, rating:4.0 },
];

const PLATFORMS = ['Amazon','Shopify','Walmart','eBay','Temu','TikTok Shop'];

const CARRIERS = ['顺丰国际','圆通国际','中通国际','DHL','FedEx','UPS'];

const DESTINATIONS = [
  { dest:'洛杉矶', port:'USLAX' },{ dest:'纽约', port:'USNYC' },{ dest:'伦敦', port:'GBLON' },
  { dest:'法兰克福', port:'DEFRA' },{ dest:'东京', port:'JPTYO' },{ dest:'悉尼', port:'AUSYD' },
  { dest:'多伦多', port:'CATOR' },{ dest:'迪拜', port:'AEDXB' },
];

// ─── Product name builder ───────────────────────────────────────────────────

const BRANDS = ['Pro','Max','Lite','Plus','Ultra','Mini','Smart','Eco'];
const MATERIALS = ['不锈钢','陶瓷','食品级塑料','铝合金','钢化玻璃','硅胶','ABS'];

function buildProductName(sub: string, idx: number): string {
  const brand = BRANDS[idx % BRANDS.length];
  return `${sub} ${brand}`;
}

// ─── Pricing model ──────────────────────────────────────────────────────────

function buildCost(sub: string, idx: number) {
  const baseCost = 3 + idx * 1.2 + rng() * 40;
  const rawPct = 0.35 + rng() * 0.15;
  const laborPct = 0.12 + rng() * 0.12;
  const logPct = 0.08 + rng() * 0.12;
  const tariffPct = 0.06 + rng() * 0.1;
  const platPct = 0.08 + rng() * 0.07;

  const rawMaterial = Math.round(baseCost * rawPct * 100) / 100;
  const labor = Math.round(baseCost * laborPct * 100) / 100;
  const logistics = Math.round(baseCost * logPct * 100) / 100;
  const tariff = Math.round(baseCost * tariffPct * 100) / 100;
  const platformFee = Math.round(baseCost * platPct * 100) / 100;
  const exchangeRate = 6.8 + rng() * 1.2;
  const totalLanded = Math.round((rawMaterial + labor + logistics + tariff + platformFee) * 100) / 100;
  const sellingPrice = Math.round(totalLanded * (1.8 + rng() * 1.2) * 100) / 100;
  const grossMargin = Math.round((1 - totalLanded / sellingPrice) * 1000) / 10;

  return { rawMaterial, labor, logistics, tariff, platformFee, exchangeRate, totalLanded, sellingPrice, grossMargin };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 开始压测种子（200产品 × 365天销售）...');
  const t0 = Date.now();

  // Clear
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
  await prisma.product.deleteMany();
  console.log('  清空完成');

  // ── 1. Products + Cost + Inventory ──────────────────────────────────────────
  const PRODUCT_COUNT = 200;
  const products: any[] = [];
  const allSubs: string[] = [];

  for (const cat of CATEGORIES) {
    for (const sub of cat.subs) {
      allSubs.push(sub);
      for (let i = 0; i < 4 + Math.floor(rng() * 8); i++) {
        const sku = `${cat.cat.substring(0,2)}-${sub.substring(0,2)}${String(products.length + 1).padStart(4,'0')}`;
        const name = buildProductName(sub, products.length);
        const pricing = buildCost(sub, products.length);
        const abc = products.length < PRODUCT_COUNT * 0.15 ? 'A' : products.length < PRODUCT_COUNT * 0.45 ? 'B' : 'C';
        products.push({ sku, name, category: cat.cat, subCategory: sub, pricing, abcClass: abc });
        if (products.length >= PRODUCT_COUNT) break;
      }
    }
    if (products.length >= PRODUCT_COUNT) break;
  }

  // Batch product create
  const createdProducts = await Promise.all(
    products.map(p => prisma.product.create({
      data: {
        sku: p.sku, name: p.name, category: p.category, subCategory: p.subCategory,
        unitCost: p.pricing.rawMaterial + p.pricing.labor,
        sellingPrice: p.pricing.sellingPrice, weight: 0.3 + rng() * 6,
        origin: rng() > 0.3 ? 'CN' : 'VN', abcClass: p.abcClass, fsnClass: 'F',
      },
    }))
  );
  console.log(`✅ ${createdProducts.length} 产品`);

  // Inventory
  const inventories = createdProducts.map((prod, idx) => {
    const baseStock = prod.abcClass === 'A' ? 300 + rng() * 800 : prod.abcClass === 'B' ? 200 + rng() * 600 : 100 + rng() * 400;
    const safetyStock = Math.round(baseStock * (0.2 + rng() * 0.4));
    let quantity = Math.round(baseStock * (0.5 + rng() * 1.5));
    const turnoverRate = Math.round((3 + rng() * 10) * 100) / 100;
    let turnoverDays = Math.round(365 / Math.max(0.5, turnoverRate));
    // Force realistic distribution: ~12% critical, ~8% warning, ~75% healthy, ~5% overstock
    const statusRoll = rng();
    let stockStatus = 'healthy';
    if (statusRoll < 0.12) {
      stockStatus = 'critical';
      quantity = Math.round(safetyStock * (0.3 + rng() * 0.5)); // force below safety
    } else if (statusRoll < 0.20) {
      stockStatus = 'warning';
      quantity = Math.round(safetyStock * (0.7 + rng() * 0.3));
    } else if (statusRoll < 0.25) {
      stockStatus = 'overstock';
      quantity = Math.round(baseStock * 2.5 + rng() * baseStock);
      turnoverDays = 121 + Math.round(rng() * 200);
    }

    return {
      productId: prod.id, sku: prod.sku, productName: prod.name,
      warehouse: WAREHOUSES[Math.floor(rng() * WAREHOUSES.length)],
      quantity, safetyStock,
      reorderPoint: Math.round(safetyStock * 1.5),
      inTransit: Math.round(rng() * safetyStock * 0.3),
      turnoverRate, turnoverDays, stockStatus,
    };
  });
  await Promise.all(inventories.map(d => prisma.inventory.create({ data: d })));
  console.log(`✅ ${inventories.length} 库存`);

  // Cost records
  const costRecords = createdProducts.map(prod => {
    const idx = products.findIndex(p => p.sku === prod.sku);
    const p = products[idx]?.pricing || buildCost(prod.subCategory, idx);
    return {
      productId: prod.id, sku: prod.sku, productName: prod.name,
      rawMaterial: p.rawMaterial, labor: p.labor, logistics: p.logistics,
      tariff: p.tariff, platformFee: p.platformFee,
      exchangeRate: p.exchangeRate, destination: 'US',
      totalLanded: p.totalLanded, sellingPrice: p.sellingPrice, grossMargin: p.grossMargin,
    };
  });
  await Promise.all(costRecords.map(d => prisma.costRecord.create({ data: d })));
  console.log(`✅ ${costRecords.length} 成本记录`);

  // ── 2. Sales Records — 365 days per product ───────────────────────────────
  const today = new Date();
  const salesBatch: any[] = [];
  const BATCH = 2000;

  for (const prod of createdProducts) {
    const idx = products.findIndex(p => p.sku === prod.sku);
    const isA = prod.abcClass === 'A';
    const isB = prod.abcClass === 'B';
    let baseQty = isA ? 15 + rng() * 30 : isB ? 5 + rng() * 20 : 1 + rng() * 8;

    for (let d = 0; d < 365; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];

      // Weekend boost, seasonal boost (Nov-Dec)
      let qty = baseQty;
      if (date.getDay() === 0 || date.getDay() === 6) qty *= 1.2 + rng() * 0.6;
      const month = date.getMonth();
      if (month === 10 || month === 11) qty *= 1.3 + rng() * 0.8; // holiday season
      if (month === 1 || month === 7) qty *= 0.7 + rng() * 0.4;   // low season

      // Random spike (5% chance)
      if (rng() < 0.05) qty *= 1.5 + rng() * 3;

      qty = Math.max(0, Math.round(qty));
      if (qty === 0) continue;

      salesBatch.push({
        productId: prod.id, sku: prod.sku, productName: prod.name,
        date: dateStr, quantity: qty,
        revenue: Math.round(qty * (prod.sellingPrice || 50) * 100) / 100,
        platform: PLATFORMS[Math.floor(rng() * PLATFORMS.length)],
      });

      if (salesBatch.length >= BATCH) {
        await prisma.salesRecord.createMany({ data: salesBatch });
        salesBatch.length = 0;
      }
    }
  }
  if (salesBatch.length > 0) {
    await prisma.salesRecord.createMany({ data: salesBatch });
  }
  const salesCount = await prisma.salesRecord.count();
  console.log(`✅ ${salesCount.toLocaleString()} 销售记录`);

  // ── 3. Shipments ──────────────────────────────────────────────────────────
  const shipmentData: any[] = [];
  const statuses = ['in_transit','in_transit','customs','delivered','delayed','exception'];
  const riskLevels = ['low','low','low','medium','medium','high','critical'];

  for (let i = 0; i < 120; i++) {
    const prod = createdProducts[Math.floor(rng() * createdProducts.length)];
    const dest = DESTINATIONS[Math.floor(rng() * DESTINATIONS.length)];
    const status = statuses[Math.floor(rng() * statuses.length)];
    const delayDays = status === 'delayed' ? 1 + Math.floor(rng() * 12) : status === 'exception' ? 5 + Math.floor(rng() * 15) : 0;
    const riskLevel = delayDays > 7 ? 'critical' : delayDays > 3 ? 'high' : delayDays > 1 ? 'medium' : 'low';

    const events: any[] = [
      { eventTime: new Date(Date.now() - (14 + rng() * 20) * 86400000).toISOString(), location: prod.warehouse || '深圳', description: '包裹已揽收', status: 'picked_up' },
    ];
    if (status !== 'delivered') {
      events.push({ eventTime: new Date(Date.now() - (7 + rng() * 10) * 86400000).toISOString(), location: '中转站', description: '已转运', status: 'in_transit' });
    }
    if (status === 'delayed' || status === 'exception') {
      events.push({ eventTime: new Date(Date.now() - (2 + rng() * 5) * 86400000).toISOString(), location: dest.port, description: status === 'delayed' ? '航班延误' : '查验异常', status });
    }
    if (status === 'delivered') {
      events.push({ eventTime: new Date(Date.now() - rng() * 3 * 86400000).toISOString(), location: dest.dest, description: '已送达', status: 'delivered' });
    }

    shipmentData.push({
      productId: prod.id, sku: prod.sku, productName: prod.name,
      trackingNumber: `TRK${String(i).padStart(6,'0')}${Date.now().toString(36)}`,
      origin: prod.warehouse || '深圳', destination: dest.dest,
      carrier: CARRIERS[Math.floor(rng() * CARRIERS.length)],
      status, eta: new Date(Date.now() + (7 + rng() * 14) * 86400000).toISOString(),
      delayDays, riskLevel,
      events: JSON.stringify(events),
    });
  }

  for (let i = 0; i < shipmentData.length; i += 200) {
    await prisma.shipmentItem.createMany({ data: shipmentData.slice(i, i + 200) });
  }
  console.log(`✅ ${shipmentData.length} 货运记录`);

  // ── 4. Suppliers ──────────────────────────────────────────────────────────
  await Promise.all(SUPPLIERS.map(s => prisma.supplier.create({ data: {
    code: s.code, name: s.name, region: s.region, category: s.cat,
    leadTime: s.lt, rating: s.rating, status: 'active',
  }})));
  console.log(`✅ ${SUPPLIERS.length} 供应商`);

  // ── 5. Alert Rules ────────────────────────────────────────────────────────
  await Promise.all([
    prisma.alertRule.create({ data: { ruleId:'low-stock', name:'低库存预警', field:'quantity', operator:'<', threshold:0.5, unit:'安全库存倍数', enabled:true, severity:'critical' }}),
    prisma.alertRule.create({ data: { ruleId:'overstock', name:'库存积压预警', field:'turnoverDays', operator:'>', threshold:120, unit:'天', enabled:true, severity:'warning' }}),
    prisma.alertRule.create({ data: { ruleId:'slow-moving', name:'滞销预警', field:'turnoverDays', operator:'>', threshold:90, unit:'天', enabled:true, severity:'warning' }}),
    prisma.alertRule.create({ data: { ruleId:'low-margin', name:'低毛利预警', field:'grossMargin', operator:'<', threshold:40, unit:'%', enabled:true, severity:'critical' }}),
  ]);
  console.log('✅ 预警规则');

  // ── 6. Return Records ─────────────────────────────────────────────────────
  const reasons = ['质量','物流','规格','其他'];
  const returnData: any[] = [];
  for (let i = 0; i < 80; i++) {
    const prod = createdProducts[Math.floor(rng() * createdProducts.length)];
    const reason = reasons[Math.floor(rng() * reasons.length)];
    const qty = 1 + Math.floor(rng() * 30);
    returnData.push({
      sku: prod.sku, productName: prod.name, quantity: qty, reason,
      reasonDetail: `${reason}相关问题 - 批次${Math.floor(rng()*100)}`,
      platform: PLATFORMS[Math.floor(rng() * PLATFORMS.length)],
      costImpact: Math.round(qty * (prod.sellingPrice || 50) * 0.6 * 100) / 100,
      status: ['processed','refunded','pending'][Math.floor(rng() * 3)],
    });
  }
  await Promise.all(returnData.map(d => prisma.returnRecord.create({ data: d })));
  console.log(`✅ ${returnData.length} 退货记录`);

  // ── 7. Defect Records ─────────────────────────────────────────────────────
  const defectData: any[] = [];
  const defectTypes = ['功能','外观','安全','包装'];
  const severities = ['minor','minor','minor','major','major','critical'];
  for (let i = 0; i < 60; i++) {
    const prod = createdProducts[Math.floor(rng() * createdProducts.length)];
    defectData.push({
      sku: prod.sku, productName: prod.name,
      defectType: defectTypes[Math.floor(rng() * defectTypes.length)],
      severity: severities[Math.floor(rng() * severities.length)],
      quantity: 1 + Math.floor(rng() * 10),
      detectedAt: ['in-process','outgoing','customer'][Math.floor(rng() * 3)],
      rootCause: `工序${Math.floor(rng()*10+1)}异常`,
      correctiveAction: '已采取纠正措施',
      status: ['open','investigating','resolved','closed'][Math.floor(rng() * 4)],
    });
  }
  await Promise.all(defectData.map(d => prisma.defectRecord.create({ data: d })));
  console.log(`✅ ${defectData.length} 缺陷记录`);

  // ── 8. Warranty Costs ─────────────────────────────────────────────────────
  const warrantyData: any[] = [];
  const wCategories = ['replacement','refund','repair','support'];
  for (let i = 0; i < 50; i++) {
    const prod = createdProducts[Math.floor(rng() * createdProducts.length)];
    warrantyData.push({
      sku: prod.sku, productName: prod.name,
      category: wCategories[Math.floor(rng() * wCategories.length)],
      cost: Math.round((50 + rng() * 800) * 100) / 100,
      description: `质保${wCategories[0]}申请`,
      claimDate: new Date(Date.now() - rng() * 180 * 86400000).toISOString().split('T')[0],
      status: ['submitted','approved','completed'][Math.floor(rng() * 3)],
    });
  }
  await Promise.all(warrantyData.map(d => prisma.warrantyCost.create({ data: d })));
  console.log(`✅ ${warrantyData.length} 质保记录`);

  // ── 9. Compliance Certs ───────────────────────────────────────────────────
  const now = new Date();
  const future = (d: number) => { const dt = new Date(now); dt.setDate(dt.getDate()+d); return dt.toISOString().split('T')[0]; };
  const past = (d: number) => { const dt = new Date(now); dt.setDate(dt.getDate()-d); return dt.toISOString().split('T')[0]; };

  const certs = [
    { certName:'CE', issuer:'TÜV莱茵', cat:'safety', expiry:future(185) },
    { certName:'FCC', issuer:'FCC实验室', cat:'emc', expiry:future(165) },
    { certName:'CCC', issuer:'CQC认证中心', cat:'safety', expiry:future(25) },
    { certName:'RoHS', issuer:'SGS', cat:'environmental', expiry:future(245) },
    { certName:'UL', issuer:'UL Solutions', cat:'safety', expiry:future(275) },
    { certName:'ETL', issuer:'Intertek', cat:'safety', expiry:past(10) },
    { certName:'PSE', issuer:'JET日本', cat:'safety', expiry:future(305) },
    { certName:'SAA', issuer:'SAI Global', cat:'safety', expiry:past(5) },
    { certName:'UKCA', issuer:'BSI', cat:'safety', expiry:future(200) },
    { certName:'KC', issuer:'KTL', cat:'safety', expiry:future(150) },
    { certName:'BSMI', issuer:'台湾BSMI', cat:'safety', expiry:future(120) },
    { certName:'GCC', issuer:'SGS海湾', cat:'safety', expiry:future(90) },
  ];

  await Promise.all(certs.map((c, i) => prisma.complianceCert.create({ data: {
    certName: c.certName, certNumber: `${c.certName}-${past(100+i*20)}`,
    issuer: c.issuer, category: c.cat,
    issueDate: past(60 + i * 30), expiryDate: c.expiry,
    status: new Date(c.expiry) < now ? 'expired' : new Date(c.expiry) < new Date(now.getTime()+30*86400000) ? 'expiring' : 'active',
    scope: `${c.certName} - 小家电产品线`,
  }})));
  console.log(`✅ ${certs.length} 合规证书`);

  // ── 10. Regulation Changes ─────────────────────────────────────────────────
  const regulations = [
    { title:'EU Ecodesign 2025', source:'EU', cat:'environmental', impact:'high', eff:future(60), dead:future(180) },
    { title:'FCC Part 15B更新', source:'FDA', cat:'emc', impact:'medium', eff:future(90), dead:future(270) },
    { title:'GB 4706.1-2025修订', source:'GB', cat:'safety', impact:'high', eff:future(120), dead:future(365) },
    { title:'SAA流程变更', source:'SAA', cat:'safety', impact:'low', eff:future(30), dead:future(90) },
    { title:'RoHS新增DIBP', source:'EU', cat:'environmental', impact:'medium', eff:future(45), dead:future(150) },
  ];
  await Promise.all(regulations.map(r => prisma.regulationChange.create({ data: {
    title: r.title, source: r.source, category: r.cat, description: `${r.source} ${r.cat} 法规更新`,
    impactLevel: r.impact, effectiveDate: r.eff, deadline: r.dead,
    affectedSkus: '[]', affectedCerts: '[]',
    actionRequired: `按${r.source}新规执行`, status: ['new','reviewing','action_required'][Math.floor(rng()*3)],
  }})));
  console.log(`✅ ${regulations.length} 法规变更`);

  // ── 11. Supply Chain Events ────────────────────────────────────────────────
  const eventsData = [
    { type:'补货订单', title:'批量补货已下单', description:'A类产品安全库存补充', icon:'📦', color:'#f97316', severity:'info' },
    { type:'货运更新', title:'多票货物清关中', description:'洛杉矶港拥堵，预计延误2-3天', icon:'🚢', color:'#3b82f6', severity:'warning' },
    { type:'库存预警', title:'季节性产品库存告急', description:'智能加湿器库存不足，需紧急补货', icon:'⚠️', color:'#f59e0b', severity:'warning' },
    { type:'成本变更', title:'汇率波动', description:'USD/CNY 汇率变动至 6.81', icon:'💰', color:'#22c55e', severity:'info' },
    { type:'销售里程碑', title:'Q4销售额突破目标', description:'厨房电器品类同比增长 35%', icon:'📊', color:'#06b6d4', severity:'info' },
    { type:'补货订单', title:'紧急补货入库', description:'吸尘器电机补货 2000 件已入库', icon:'📦', color:'#f97316', severity:'info' },
    { type:'货运更新', title:'欧洲线运价下降', description:'SCFIS欧线期货跌 2.3%，运费成本降低', icon:'🚢', color:'#22c55e', severity:'info' },
    { type:'库存预警', title:'库存积压提醒', description:'电子秤库存积压超 180 天，建议促销', icon:'⚠️', color:'#f59e0b', severity:'warning' },
    { type:'成本变更', title:'铜价大幅波动', description:'铜价单日跌 3.3%，含铜产品BOM成本下降', icon:'💰', color:'#22c55e', severity:'info' },
    { type:'销售里程碑', title:'黑五销售破纪录', description:'亚马逊平台单日销售突破 $50,000', icon:'📊', color:'#06b6d4', severity:'info' },
  ];
  await Promise.all(eventsData.map(e => prisma.supplyChainEvent.create({ data: e })));
  console.log(`✅ ${eventsData.length} 供应链事件`);

  // ── 12. Users ──────────────────────────────────────────────────────────────
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash('admin123', 10);
  const hash2 = await bcrypt.hash('manager123', 10);
  const hash3 = await bcrypt.hash('viewer123', 10);
  await prisma.user.create({
    data: { email:'admin@supply-chain.com', name:'管理员', password:hash, role:'admin' },
  });
  await prisma.user.create({
    data: { email:'manager@supply-chain.com', name:'经理', password:hash2, role:'manager' },
  });
  await prisma.user.create({
    data: { email:'viewer@supply-chain.com', name:'查看者', password:hash3, role:'viewer' },
  });
  console.log('✅ 3 用户 (admin/manager/viewer)');

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`🎉 压测种子完成! 耗时 ${elapsed}s`);
  console.log(`   数据量: ${PRODUCT_COUNT}产品 | ${salesCount.toLocaleString()}销售 | ${shipmentData.length}货运 | ${returnData.length}退货`);
}

main()
  .catch(e => { console.error('❌ 种子失败:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
