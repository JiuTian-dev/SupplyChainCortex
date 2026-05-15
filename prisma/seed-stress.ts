/**
 * Stress Test Seed — year-level data with 60 products for performance testing.
 *
 * Generates:
 * - 60 products across 10 categories
 * - 60 inventory records across 3 warehouses
 * - 60 cost records
 * - 30 shipment records
 * - 3,650 sales records (10/day × 365 days)
 * - 20 suppliers
 * - 30 supply chain events
 *
 * Run: bun run prisma/seed-stress.ts
 * After: prisma db push && bun run prisma/seed-stress.ts
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// ─── Product Catalog ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  { cat: '厨房小家电', sub: '榨汁机', origin: 'CN', unitCost: 55, price: 199, weight: 1.2 },
  { cat: '厨房小家电', sub: '咖啡机', origin: 'CN', unitCost: 85, price: 299, weight: 1.8 },
  { cat: '厨房小家电', sub: '空气炸锅', origin: 'CN', unitCost: 95, price: 349, weight: 3.5 },
  { cat: '厨房小家电', sub: '电热水壶', origin: 'CN', unitCost: 25, price: 99, weight: 0.8 },
  { cat: '厨房小家电', sub: '烤面包机', origin: 'CN', unitCost: 30, price: 119, weight: 1.1 },
  { cat: '厨房小家电', sub: '多功能料理锅', origin: 'CN', unitCost: 75, price: 269, weight: 2.5 },
  { cat: '清洁家电', sub: '无线吸尘器', origin: 'CN', unitCost: 120, price: 449, weight: 2.0 },
  { cat: '清洁家电', sub: '扫地机器人', origin: 'CN', unitCost: 350, price: 999, weight: 4.0 },
  { cat: '清洁家电', sub: '蒸汽拖把', origin: 'CN', unitCost: 65, price: 229, weight: 1.9 },
  { cat: '清洁家电', sub: '除螨仪', origin: 'CN', unitCost: 55, price: 199, weight: 1.3 },
  { cat: '环境家电', sub: '加湿器', origin: 'CN', unitCost: 35, price: 149, weight: 1.0 },
  { cat: '环境家电', sub: '空气净化器', origin: 'CN', unitCost: 200, price: 699, weight: 5.0 },
  { cat: '环境家电', sub: '除湿机', origin: 'CN', unitCost: 180, price: 599, weight: 6.0 },
  { cat: '环境家电', sub: '香薰机', origin: 'CN', unitCost: 20, price: 89, weight: 0.5 },
  { cat: '个人护理', sub: '吹风机', origin: 'CN', unitCost: 45, price: 179, weight: 0.6 },
  { cat: '个人护理', sub: '电动牙刷', origin: 'CN', unitCost: 22, price: 89, weight: 0.2 },
  { cat: '个人护理', sub: '美容仪', origin: 'CN', unitCost: 80, price: 299, weight: 0.4 },
  { cat: '个人护理', sub: '直发器', origin: 'CN', unitCost: 28, price: 109, weight: 0.5 },
  { cat: '音频设备', sub: '蓝牙音箱', origin: 'CN', unitCost: 55, price: 199, weight: 0.7 },
  { cat: '音频设备', sub: '无线耳机', origin: 'CN', unitCost: 35, price: 149, weight: 0.1 },
  { cat: '智能家居', sub: '智能插座', origin: 'CN', unitCost: 15, price: 59, weight: 0.15 },
  { cat: '智能家居', sub: '智能灯泡', origin: 'CN', unitCost: 12, price: 49, weight: 0.1 },
  { cat: '智能家居', sub: '智能门锁', origin: 'CN', unitCost: 180, price: 599, weight: 2.0 },
  { cat: '智能家居', sub: '智能摄像头', origin: 'CN', unitCost: 65, price: 249, weight: 0.3 },
  { cat: '户外用品', sub: '便携风扇', origin: 'CN', unitCost: 18, price: 69, weight: 0.3 },
  { cat: '户外用品', sub: '露营灯', origin: 'CN', unitCost: 22, price: 89, weight: 0.4 },
  { cat: '户外用品', sub: '户外电源', origin: 'CN', unitCost: 280, price: 899, weight: 4.5 },
  { cat: '车载电器', sub: '车载吸尘器', origin: 'CN', unitCost: 40, price: 159, weight: 0.8 },
  { cat: '车载电器', sub: '车载冰箱', origin: 'CN', unitCost: 150, price: 499, weight: 3.0 },
  { cat: '车载电器', sub: '车载空气净化器', origin: 'CN', unitCost: 35, price: 139, weight: 0.5 },
];

const WAREHOUSES = ['深圳仓', '宁波仓', '越南仓'];
const SUPPLIER_REGIONS = ['广东深圳', '广东东莞', '浙江宁波', '浙江义乌', '安徽合肥', '福建厦门'];
const PLATFORMS = ['Amazon', 'Shopify', 'Walmart', 'eBay', 'Temu'];
const CARRIERS = ['Matson', 'COSCO', 'MSC', 'CMA-CGM', 'Evergreen'];

// ─── Seed Function ───────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Stress test seed starting...');
  const start = Date.now();

  // 1. Products (60)
  const products: Array<{ id: string; sku: string; name: string; category: string }> = [];
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    // 2 variants per category = 60 products
    for (let v = 0; v < 2; v++) {
      const sku = `SKU-${String(i * 2 + v + 1).padStart(3, '0')}`;
      const suffix = v === 0 ? '' : ' Pro';
      const p = await db.product.create({
        data: {
          sku,
          name: `${c.sub}${suffix}`,
          category: c.cat,
          subCategory: c.sub,
          unitCost: c.unitCost * (v === 0 ? 1 : 1.3),
          sellingPrice: c.price * (v === 0 ? 1 : 1.3),
          weight: c.weight,
          origin: c.origin,
          abcClass: i < 10 ? 'A' : i < 25 ? 'B' : 'C',
          fsnClass: i < 20 ? 'F' : 'N',
        },
      });
      products.push({ id: p.id, sku: p.sku, name: p.name, category: c.cat });
    }
  }
  console.log(`✅ ${products.length} products`);

  // 2. Inventory
  let invCount = 0;
  for (const p of products) {
    const wh = WAREHOUSES[invCount % WAREHOUSES.length];
    const qty = 100 + Math.floor(Math.random() * 2000);
    const safety = 200 + Math.floor(Math.random() * 400);
    await db.inventory.create({
      data: {
        productId: p.id, sku: p.sku, productName: p.name,
        warehouse: wh, quantity: qty, safetyStock: safety,
        reorderPoint: Math.floor(safety * 1.3),
        inTransit: Math.floor(Math.random() * 100),
        turnoverRate: Math.random() * 8,
        turnoverDays: 10 + Math.floor(Math.random() * 120),
        stockStatus: qty < safety ? 'critical' : qty < safety * 1.3 ? 'warning' : 'healthy',
      },
    });
    invCount++;
  }
  console.log(`✅ ${invCount} inventory records`);

  // 3. Cost records
  for (const p of products) {
    const landed = p.name.includes('Pro')
      ? CATEGORIES[Math.floor((products.indexOf(p)) / 2)]?.unitCost * 1.3 * 1.8
      : CATEGORIES[Math.floor((products.indexOf(p)) / 2)]?.unitCost * 1.8;
    await db.costRecord.create({
      data: {
        productId: p.id, sku: p.sku, productName: p.name,
        rawMaterial: (landed || 50) * 0.4,
        labor: (landed || 50) * 0.15,
        logistics: (landed || 50) * 0.15,
        tariff: (landed || 50) * 0.12,
        platformFee: (landed || 50) * 0.10,
        exchangeRate: 7.25,
        destination: 'US',
        totalLanded: landed || 50,
        sellingPrice: (landed || 50) * 3.5,
        grossMargin: Math.random() * 0.4 + 0.3,
      },
    });
  }
  console.log(`✅ ${products.length} cost records`);

  // 4. Shipments (30)
  for (let i = 0; i < 30; i++) {
    const p = products[i % products.length];
    await db.shipmentItem.create({
      data: {
        trackingNumber: `STRESS-${Date.now()}-${String(i).padStart(3, '0')}`,
        productId: p.id, sku: p.sku, productName: p.name,
        origin: 'CN', destination: 'US',
        carrier: CARRIERS[i % CARRIERS.length],
        status: i < 20 ? 'delivered' : i < 25 ? 'in_transit' : 'delayed',
        delayDays: i >= 25 ? Math.floor(Math.random() * 10) : 0,
        riskLevel: i >= 25 ? 'high' : 'low',
        events: JSON.stringify([]),
      },
    });
  }
  console.log('✅ 30 shipments');

  // 5. Sales records (365 days × batch)
  const now = new Date();
  let salesCount = 0;
  for (let dayOffset = 365; dayOffset >= 0; dayOffset--) {
    const d = new Date(now);
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().split('T')[0];

    // 5-15 sales per day across different products
    const dailySales = 5 + Math.floor(Math.random() * 10);
    for (let s = 0; s < dailySales; s++) {
      const p = products[Math.floor(Math.random() * products.length)];
      await db.salesRecord.create({
        data: {
          productId: p.id, sku: p.sku, productName: p.name,
          date: dateStr,
          quantity: 1 + Math.floor(Math.random() * 5),
          revenue: Math.round((CATEGORIES.find(c => c.sub === products.find(pp => pp.id === p.id)?.name?.replace(' Pro', ''))?.price || 199) * (0.7 + Math.random() * 0.6)),
          platform: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
        },
      });
      salesCount++;
    }
  }
  console.log(`✅ ${salesCount} sales records (365 days)`);

  // 6. Suppliers (20)
  for (let i = 0; i < 20; i++) {
    await db.supplier.create({
      data: {
        code: `SUP-${String(i + 1).padStart(3, '0')}`,
        name: `${SUPPLIER_REGIONS[i % SUPPLIER_REGIONS.length]}电器${i < 10 ? '厂' : '有限公司'}`,
        region: SUPPLIER_REGIONS[i % SUPPLIER_REGIONS.length],
        category: CATEGORIES[i % CATEGORIES.length].cat,
        leadTime: 10 + Math.floor(Math.random() * 20),
        rating: Math.round((2 + Math.random() * 3) * 10) / 10,
        status: 'active',
      },
    });
  }
  console.log('✅ 20 suppliers');

  // 7. Supply chain events
  for (let i = 0; i < 30; i++) {
    await db.supplyChainEvent.create({
      data: {
        type: ['补货订单', '货运更新', '库存预警', '成本变更', '销售里程碑'][i % 5],
        title: `压力测试事件 #${i + 1}`,
        description: `${CATEGORIES[i % CATEGORIES.length].sub} ${i % 3 === 0 ? '库存低于安全线' : i % 3 === 1 ? '新供应商报价' : '货运延误'}`,
        icon: ['📦', '🚢', '⚠️', '💰', '📈'][i % 5],
        color: ['#f97316', '#3b82f6', '#ef4444', '#22c55e', '#8b5cf6'][i % 5],
        severity: i % 3 === 0 ? 'critical' : i % 3 === 1 ? 'warning' : 'info',
      },
    });
  }
  console.log('✅ 30 events');

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉 Stress test seed complete in ${elapsed}s`);
  console.log(`   ${products.length} products | ${invCount} inventory | ${salesCount} sales | 30 shipments | 20 suppliers`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
