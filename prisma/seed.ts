// 小家电供应链 - 数据库种子脚本
// 将 Mock 数据初始化到 SQLite 数据库

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始种子数据...');

  // 清除现有数据
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

  // ==================== 1. 产品数据 ====================
  const products = await Promise.all([
    prisma.product.create({ data: { sku: "KA-BK2001", name: "智能电热水壶", category: "厨房电器", subCategory: "电水壶", unitCost: 12.5, sellingPrice: 39.99, weight: 1.2, origin: "CN", abcClass: "A", fsnClass: "F" } }),
    prisma.product.create({ data: { sku: "KA-CF3002", name: "便携式咖啡机", category: "厨房电器", subCategory: "咖啡机", unitCost: 28.0, sellingPrice: 79.99, weight: 2.5, origin: "CN", abcClass: "A", fsnClass: "F" } }),
    prisma.product.create({ data: { sku: "CL-VC4003", name: "无线手持吸尘器", category: "清洁电器", subCategory: "吸尘器", unitCost: 35.0, sellingPrice: 99.99, weight: 3.0, origin: "CN", abcClass: "A", fsnClass: "F" } }),
    prisma.product.create({ data: { sku: "CL-HM5004", name: "智能加湿器", category: "清洁电器", subCategory: "加湿器", unitCost: 8.5, sellingPrice: 29.99, weight: 1.0, origin: "CN", abcClass: "B", fsnClass: "F" } }),
    prisma.product.create({ data: { sku: "PC-HD6005", name: "负离子吹风机", category: "个人护理", subCategory: "吹风机", unitCost: 15.0, sellingPrice: 49.99, weight: 0.8, origin: "CN", abcClass: "B", fsnClass: "S" } }),
    prisma.product.create({ data: { sku: "PC-MS7006", name: "电动按摩仪", category: "个人护理", subCategory: "按摩器", unitCost: 22.0, sellingPrice: 59.99, weight: 1.5, origin: "CN", abcClass: "B", fsnClass: "S" } }),
    prisma.product.create({ data: { sku: "KA-TS8007", name: "多功能烤面包机", category: "厨房电器", subCategory: "面包机", unitCost: 18.0, sellingPrice: 54.99, weight: 2.0, origin: "CN", abcClass: "B", fsnClass: "S" } }),
    prisma.product.create({ data: { sku: "CL-AP9008", name: "HEPA 空气净化器", category: "清洁电器", subCategory: "净化器", unitCost: 45.0, sellingPrice: 129.99, weight: 5.5, origin: "CN", abcClass: "A", fsnClass: "F" } }),
    prisma.product.create({ data: { sku: "PC-ES1009", name: "电动牙刷套装", category: "个人护理", subCategory: "牙刷", unitCost: 6.0, sellingPrice: 24.99, weight: 0.3, origin: "CN", abcClass: "C", fsnClass: "N" } }),
    prisma.product.create({ data: { sku: "KA-JB1010", name: "便携榨汁杯", category: "厨房电器", subCategory: "榨汁机", unitCost: 5.5, sellingPrice: 19.99, weight: 0.5, origin: "CN", abcClass: "C", fsnClass: "N" } }),
    prisma.product.create({ data: { sku: "CL-IR1101", name: "蒸汽挂烫机", category: "清洁电器", subCategory: "熨烫", unitCost: 14.0, sellingPrice: 44.99, weight: 1.8, origin: "CN", abcClass: "C", fsnClass: "N" } }),
    prisma.product.create({ data: { sku: "PC-SK1201", name: "电子秤", category: "个人护理", subCategory: "体重秤", unitCost: 4.0, sellingPrice: 15.99, weight: 1.2, origin: "CN", abcClass: "C", fsnClass: "N" } }),
  ]);
  console.log(`✅ 创建 ${products.length} 个产品`);

  // ==================== 2. 库存数据 ====================
  const inventoryData = [
    { productId: products[0].id, sku: "KA-BK2001", productName: "智能电热水壶", warehouse: "深圳仓", quantity: 2500, safetyStock: 500, reorderPoint: 800, inTransit: 300, turnoverRate: 8.5, turnoverDays: 43, stockStatus: "healthy" },
    { productId: products[1].id, sku: "KA-CF3002", productName: "便携式咖啡机", warehouse: "深圳仓", quantity: 800, safetyStock: 300, reorderPoint: 500, inTransit: 200, turnoverRate: 6.2, turnoverDays: 59, stockStatus: "healthy" },
    { productId: products[2].id, sku: "CL-VC4003", productName: "无线手持吸尘器", warehouse: "深圳仓", quantity: 350, safetyStock: 400, reorderPoint: 600, inTransit: 150, turnoverRate: 5.1, turnoverDays: 72, stockStatus: "warning" },
    { productId: products[3].id, sku: "CL-HM5004", productName: "智能加湿器", warehouse: "义乌仓", quantity: 180, safetyStock: 600, reorderPoint: 900, inTransit: 50, turnoverRate: 3.8, turnoverDays: 97, stockStatus: "critical" },
    { productId: products[4].id, sku: "PC-HD6005", productName: "负离子吹风机", warehouse: "义乌仓", quantity: 1200, safetyStock: 350, reorderPoint: 500, inTransit: 100, turnoverRate: 4.5, turnoverDays: 81, stockStatus: "healthy" },
    { productId: products[5].id, sku: "PC-MS7006", productName: "电动按摩仪", warehouse: "义乌仓", quantity: 900, safetyStock: 250, reorderPoint: 400, inTransit: 80, turnoverRate: 3.2, turnoverDays: 114, stockStatus: "overstock" },
    { productId: products[6].id, sku: "KA-TS8007", productName: "多功能烤面包机", warehouse: "深圳仓", quantity: 450, safetyStock: 200, reorderPoint: 350, inTransit: 0, turnoverRate: 2.8, turnoverDays: 131, stockStatus: "overstock" },
    { productId: products[7].id, sku: "CL-AP9008", productName: "HEPA 空气净化器", warehouse: "深圳仓", quantity: 520, safetyStock: 300, reorderPoint: 450, inTransit: 250, turnoverRate: 7.1, turnoverDays: 51, stockStatus: "healthy" },
    { productId: products[8].id, sku: "PC-ES1009", productName: "电动牙刷套装", warehouse: "义乌仓", quantity: 5000, safetyStock: 800, reorderPoint: 1200, inTransit: 0, turnoverRate: 1.5, turnoverDays: 244, stockStatus: "overstock" },
    { productId: products[9].id, sku: "KA-JB1010", productName: "便携榨汁杯", warehouse: "义乌仓", quantity: 60, safetyStock: 400, reorderPoint: 600, inTransit: 0, turnoverRate: 1.2, turnoverDays: 305, stockStatus: "critical" },
    { productId: products[10].id, sku: "CL-IR1101", productName: "蒸汽挂烫机", warehouse: "深圳仓", quantity: 780, safetyStock: 250, reorderPoint: 400, inTransit: 50, turnoverRate: 2.0, turnoverDays: 183, stockStatus: "overstock" },
    { productId: products[11].id, sku: "PC-SK1201", productName: "电子秤", warehouse: "义乌仓", quantity: 3200, safetyStock: 500, reorderPoint: 800, inTransit: 0, turnoverRate: 0.8, turnoverDays: 457, stockStatus: "overstock" },
  ];
  const inventories = await Promise.all(inventoryData.map(d => prisma.inventory.create({ data: d })));
  console.log(`✅ 创建 ${inventories.length} 条库存记录`);

  // ==================== 3. 成本数据 ====================
  const costData = [
    { productId: products[0].id, sku: "KA-BK2001", productName: "智能电热水壶", rawMaterial: 5.5, labor: 2.8, logistics: 2.1, tariff: 1.5, platformFee: 4.0, exchangeRate: 7.25, destination: "US", totalLanded: 18.34, sellingPrice: 39.99, grossMargin: 54.2 },
    { productId: products[1].id, sku: "KA-CF3002", productName: "便携式咖啡机", rawMaterial: 12.0, labor: 5.5, logistics: 4.8, tariff: 3.5, platformFee: 8.0, exchangeRate: 7.25, destination: "US", totalLanded: 41.13, sellingPrice: 79.99, grossMargin: 48.6 },
    { productId: products[2].id, sku: "CL-VC4003", productName: "无线手持吸尘器", rawMaterial: 15.0, labor: 7.0, logistics: 6.5, tariff: 4.2, platformFee: 10.0, exchangeRate: 7.25, destination: "US", totalLanded: 52.05, sellingPrice: 99.99, grossMargin: 47.9 },
    { productId: products[3].id, sku: "CL-HM5004", productName: "智能加湿器", rawMaterial: 3.2, labor: 1.8, logistics: 1.5, tariff: 0.9, platformFee: 3.0, exchangeRate: 7.25, destination: "US", totalLanded: 12.23, sellingPrice: 29.99, grossMargin: 59.2 },
    { productId: products[4].id, sku: "PC-HD6005", productName: "负离子吹风机", rawMaterial: 6.5, labor: 3.2, logistics: 2.0, tariff: 1.8, platformFee: 5.0, exchangeRate: 7.25, destination: "US", totalLanded: 22.18, sellingPrice: 49.99, grossMargin: 55.6 },
    { productId: products[5].id, sku: "PC-MS7006", productName: "电动按摩仪", rawMaterial: 9.0, labor: 4.5, logistics: 3.0, tariff: 2.5, platformFee: 6.0, exchangeRate: 7.25, destination: "US", totalLanded: 31.83, sellingPrice: 59.99, grossMargin: 46.9 },
    { productId: products[6].id, sku: "KA-TS8007", productName: "多功能烤面包机", rawMaterial: 7.5, labor: 3.8, logistics: 3.2, tariff: 2.0, platformFee: 5.5, exchangeRate: 7.25, destination: "US", totalLanded: 27.77, sellingPrice: 54.99, grossMargin: 49.5 },
    { productId: products[7].id, sku: "CL-AP9008", productName: "HEPA 空气净化器", rawMaterial: 20.0, labor: 8.5, logistics: 8.0, tariff: 5.5, platformFee: 13.0, exchangeRate: 7.25, destination: "US", totalLanded: 71.79, sellingPrice: 129.99, grossMargin: 44.8 },
    { productId: products[8].id, sku: "PC-ES1009", productName: "电动牙刷套装", rawMaterial: 2.5, labor: 1.0, logistics: 0.8, tariff: 0.5, platformFee: 2.5, exchangeRate: 7.25, destination: "US", totalLanded: 8.62, sellingPrice: 24.99, grossMargin: 65.5 },
    { productId: products[9].id, sku: "KA-JB1010", productName: "便携榨汁杯", rawMaterial: 2.2, labor: 0.8, logistics: 0.7, tariff: 0.4, platformFee: 2.0, exchangeRate: 7.25, destination: "US", totalLanded: 7.27, sellingPrice: 19.99, grossMargin: 63.6 },
    { productId: products[10].id, sku: "CL-IR1101", productName: "蒸汽挂烫机", rawMaterial: 5.8, labor: 2.5, logistics: 2.2, tariff: 1.2, platformFee: 4.5, exchangeRate: 7.25, destination: "US", totalLanded: 19.95, sellingPrice: 44.99, grossMargin: 55.7 },
    { productId: products[11].id, sku: "PC-SK1201", productName: "电子秤", rawMaterial: 1.5, labor: 0.6, logistics: 0.5, tariff: 0.3, platformFee: 1.6, exchangeRate: 7.25, destination: "US", totalLanded: 5.35, sellingPrice: 15.99, grossMargin: 66.5 },
  ];
  const costs = await Promise.all(costData.map(d => prisma.costRecord.create({ data: d })));
  console.log(`✅ 创建 ${costs.length} 条成本记录`);

  // ==================== 4. 物流货运数据 ====================
  const shipmentData = [
    { productId: products[0].id, sku: "KA-BK2001", productName: "智能电热水壶", trackingNumber: "SF20250115001", origin: "深圳", destination: "洛杉矶", carrier: "顺丰国际", status: "in_transit", eta: "2025-01-25T00:00:00Z", delayDays: 0, riskLevel: "low", events: [{ eventTime: "2025-01-15T08:00:00Z", location: "深圳", description: "包裹已揽收", status: "picked_up" }, { eventTime: "2025-01-15T14:00:00Z", location: "深圳机场", description: "已离开发件地", status: "in_transit" }, { eventTime: "2025-01-16T06:00:00Z", location: "香港转运中心", description: "到达中转站", status: "in_transit" }] },
    { productId: products[2].id, sku: "CL-VC4003", productName: "无线手持吸尘器", trackingNumber: "SF20250113002", origin: "深圳", destination: "纽约", carrier: "顺丰国际", status: "customs", eta: "2025-01-22T00:00:00Z", delayDays: 2, riskLevel: "medium", events: [{ eventTime: "2025-01-13T09:00:00Z", location: "深圳", description: "包裹已揽收", status: "picked_up" }, { eventTime: "2025-01-14T12:00:00Z", location: "香港转运中心", description: "已转运", status: "in_transit" }, { eventTime: "2025-01-17T08:00:00Z", location: "纽约海关", description: "海关清关中，预计延迟2天", status: "customs" }] },
    { productId: products[7].id, sku: "CL-AP9008", productName: "HEPA 空气净化器", trackingNumber: "YTO20250114003", origin: "深圳", destination: "伦敦", carrier: "圆通国际", status: "delayed", eta: "2025-01-28T00:00:00Z", delayDays: 5, riskLevel: "high", events: [{ eventTime: "2025-01-14T10:00:00Z", location: "深圳", description: "包裹已揽收", status: "picked_up" }, { eventTime: "2025-01-16T18:00:00Z", location: "迪拜中转站", description: "航班延误，等待中转", status: "delayed" }, { eventTime: "2025-01-18T10:00:00Z", location: "迪拜中转站", description: "因天气原因继续延误", status: "delayed" }] },
    { productId: products[1].id, sku: "KA-CF3002", productName: "便携式咖啡机", trackingNumber: "ZTO20250112004", origin: "义乌", destination: "法兰克福", carrier: "中通国际", status: "delivered", eta: "2025-01-20T00:00:00Z", actualDelivery: "2025-01-19T14:00:00Z", delayDays: 0, riskLevel: "low", events: [{ eventTime: "2025-01-12T08:00:00Z", location: "义乌", description: "包裹已揽收", status: "picked_up" }, { eventTime: "2025-01-18T10:00:00Z", location: "法兰克福", description: "已送达", status: "delivered" }] },
    { productId: products[3].id, sku: "CL-HM5004", productName: "智能加湿器", trackingNumber: "SF20250116005", origin: "义乌", destination: "东京", carrier: "顺丰国际", status: "exception", eta: "2025-01-26T00:00:00Z", delayDays: 8, riskLevel: "critical", events: [{ eventTime: "2025-01-16T07:00:00Z", location: "义乌", description: "包裹已揽收", status: "picked_up" }, { eventTime: "2025-01-17T16:00:00Z", location: "上海浦东", description: "出口查验中", status: "customs" }, { eventTime: "2025-01-19T09:00:00Z", location: "上海浦东", description: "异常：包裹在查验中受损，需要重新包装", status: "exception" }] },
    { productId: products[4].id, sku: "PC-HD6005", productName: "负离子吹风机", trackingNumber: "YTO20250117006", origin: "义乌", destination: "洛杉矶", carrier: "圆通国际", status: "in_transit", eta: "2025-01-27T00:00:00Z", delayDays: 0, riskLevel: "low", events: [{ eventTime: "2025-01-17T11:00:00Z", location: "义乌", description: "包裹已揽收", status: "picked_up" }, { eventTime: "2025-01-18T14:00:00Z", location: "上海转运", description: "已转运至国际航线", status: "in_transit" }] },
    { productId: products[0].id, sku: "KA-BK2001", productName: "智能电热水壶", trackingNumber: "SF20250110007", origin: "深圳", destination: "多伦多", carrier: "顺丰国际", status: "delivered", eta: "2025-01-18T00:00:00Z", actualDelivery: "2025-01-17T09:00:00Z", delayDays: 0, riskLevel: "low", events: [{ eventTime: "2025-01-10T08:00:00Z", location: "深圳", description: "包裹已揽收", status: "picked_up" }, { eventTime: "2025-01-17T09:00:00Z", location: "多伦多", description: "已送达", status: "delivered" }] },
    { productId: products[7].id, sku: "CL-AP9008", productName: "HEPA 空气净化器", trackingNumber: "ZTO20250111008", origin: "深圳", destination: "悉尼", carrier: "中通国际", status: "in_transit", eta: "2025-01-24T00:00:00Z", delayDays: 1, riskLevel: "medium", events: [{ eventTime: "2025-01-11T09:00:00Z", location: "深圳", description: "包裹已揽收", status: "picked_up" }, { eventTime: "2025-01-14T16:00:00Z", location: "新加坡中转", description: "到达中转站，预计延误1天", status: "in_transit" }] },
  ];
  const shipments = await Promise.all(shipmentData.map(d => prisma.shipmentItem.create({ data: d })));
  console.log(`✅ 创建 ${shipments.length} 条货运记录`);

  // ==================== 5. 销售记录（90天） ====================
  const platforms = ["Amazon", "Shopify", "Walmart", "eBay"];
  const today = new Date();
  const salesRecords: { productId: string; sku: string; productName: string; date: string; quantity: number; revenue: number; platform: string }[] = [];

  for (const product of products) {
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      let baseQty: number;
      if (product.abcClass === "A") baseQty = 30 + Math.floor(Math.random() * 40);
      else if (product.abcClass === "B") baseQty = 10 + Math.floor(Math.random() * 25);
      else baseQty = 2 + Math.floor(Math.random() * 10);

      if (date.getDay() === 0 || date.getDay() === 6) baseQty = Math.floor(baseQty * 1.3);
      if (Math.random() < 0.03) baseQty = Math.floor(baseQty * (2 + Math.random() * 2));

      const quantity = Math.max(0, baseQty);
      const platform = platforms[Math.floor(Math.random() * platforms.length)];

      salesRecords.push({
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        date: date.toISOString().split("T")[0],
        quantity,
        revenue: Math.round(quantity * product.sellingPrice * 100) / 100,
        platform,
      });
    }
  }

  // Batch insert sales records
  const BATCH_SIZE = 500;
  let salesCount = 0;
  for (let i = 0; i < salesRecords.length; i += BATCH_SIZE) {
    const batch = salesRecords.slice(i, i + BATCH_SIZE);
    const result = await prisma.salesRecord.createMany({ data: batch });
    salesCount += result.count;
  }
  console.log(`✅ 创建 ${salesCount} 条销售记录`);

  // ==================== 6. 预警规则 ====================
  const alertRules = await Promise.all([
    prisma.alertRule.create({ data: { ruleId: "low-stock", name: "低库存预警", field: "quantity", operator: "<", threshold: 0.5, unit: "安全库存倍数", enabled: true, severity: "critical" } }),
    prisma.alertRule.create({ data: { ruleId: "overstock", name: "库存积压预警", field: "turnoverDays", operator: ">", threshold: 120, unit: "天", enabled: true, severity: "warning" } }),
    prisma.alertRule.create({ data: { ruleId: "slow-moving", name: "滞销产品预警", field: "turnoverDays", operator: ">", threshold: 90, unit: "天", enabled: true, severity: "warning" } }),
    prisma.alertRule.create({ data: { ruleId: "low-margin", name: "低毛利预警", field: "grossMargin", operator: "<", threshold: 48, unit: "%", enabled: true, severity: "critical" } }),
  ]);
  console.log(`✅ 创建 ${alertRules.length} 条预警规则`);

  // ==================== 7. 供应链事件 ====================
  const events = await Promise.all([
    prisma.supplyChainEvent.create({ data: { type: "补货订单", title: "补货订单已下单", description: "KA-BK2001 补货 500 件已下单", icon: "📦", color: "#f97316", severity: "info", sku: "KA-BK2001" } }),
    prisma.supplyChainEvent.create({ data: { type: "货运更新", title: "货运状态更新", description: "SF20250115001 已完成清关", icon: "🚢", color: "#3b82f6", severity: "info" } }),
    prisma.supplyChainEvent.create({ data: { type: "库存预警", title: "库存低于安全线", description: "CL-HM5004 库存低于安全线", icon: "⚠️", color: "#f59e0b", severity: "warning", sku: "CL-HM5004" } }),
    prisma.supplyChainEvent.create({ data: { type: "成本变更", title: "汇率变动", description: "汇率变动: 7.25 → 7.22", icon: "💰", color: "#22c55e", severity: "info" } }),
    prisma.supplyChainEvent.create({ data: { type: "销售里程碑", title: "月销量突破", description: "KA-CF3002 月销量突破 1500", icon: "📊", color: "#06b6d4", severity: "info", sku: "KA-CF3002" } }),
    prisma.supplyChainEvent.create({ data: { type: "补货订单", title: "补货入库完成", description: "KA-TP1003 补货 300 件已入库", icon: "📦", color: "#f97316", severity: "info" } }),
    prisma.supplyChainEvent.create({ data: { type: "货运更新", title: "货物抵达目的港", description: "SF20250115001 已抵达洛杉矶港", icon: "🚢", color: "#3b82f6", severity: "info" } }),
    prisma.supplyChainEvent.create({ data: { type: "库存预警", title: "库存积压预警", description: "PE-HM2005 库存积压超 180 天", icon: "⚠️", color: "#f59e0b", severity: "warning" } }),
    prisma.supplyChainEvent.create({ data: { type: "成本变更", title: "关税调整通知", description: "US 对华小家电关税下调 2%", icon: "💰", color: "#22c55e", severity: "info" } }),
    prisma.supplyChainEvent.create({ data: { type: "销售里程碑", title: "季度目标达成", description: "厨房电器品类 Q1 销售达成 105%", icon: "📊", color: "#06b6d4", severity: "info" } }),
  ]);
  console.log(`✅ 创建 ${events.length} 条供应链事件`);

  // ==================== 8. 供应商数据 ====================
  const suppliers = await Promise.all([
    prisma.supplier.create({ data: { code: "SUP-DG001", name: "东莞精密模具厂", contact: "张经理", email: "zhang@dg-precision.com", phone: "+86-769-8888001", region: "华南", category: "塑料/五金件", leadTime: 10, rating: 4.5, status: "active" } }),
    prisma.supplier.create({ data: { code: "SUP-SH002", name: "上海电子科技", contact: "李总", email: "li@sh-electro.com", phone: "+86-21-66002200", region: "华东", category: "电子元器件", leadTime: 7, rating: 4.8, status: "active" } }),
    prisma.supplier.create({ data: { code: "SUP-YW003", name: "义乌日用品有限公司", contact: "王经理", email: "wang@yw-daily.com", phone: "+86-579-85003000", region: "华东", category: "包装材料", leadTime: 5, rating: 4.2, status: "active" } }),
    prisma.supplier.create({ data: { code: "SUP-SZ004", name: "深圳顺达物流", contact: "陈总", email: "chen@sz-shunda.com", phone: "+86-755-26004000", region: "华南", category: "物流运输", leadTime: 3, rating: 3.9, status: "active" } }),
    prisma.supplier.create({ data: { code: "SUP-FS005", name: "佛山小家电制造", contact: "赵经理", email: "zhao@fs-appliance.com", phone: "+86-757-82005000", region: "华南", category: "成品代工", leadTime: 21, rating: 4.6, status: "active" } }),
    prisma.supplier.create({ data: { code: "SUP-NB006", name: "宁波海关代理", contact: "刘经理", email: "liu@nb-customs.com", phone: "+86-574-87006000", region: "华东", category: "清关服务", leadTime: 2, rating: 4.0, status: "active" } }),
  ]);
  console.log(`✅ 创建 ${suppliers.length} 个供应商`);

  // ==================== 9. 退货记录 ====================
  const returnData = [
    // 质量 - most common (Pareto: ~40%)
    { sku: "KA-BK2001", productName: "智能电热水壶", quantity: 25, reason: "质量", reasonDetail: "温控失灵，无法达到设定温度", platform: "Amazon", costImpact: 312.5, status: "processed" },
    { sku: "KA-CF3002", productName: "便携式咖啡机", quantity: 18, reason: "质量", reasonDetail: "水泵漏水，使用一周后出现故障", platform: "Amazon", costImpact: 504.0, status: "refunded" },
    { sku: "CL-VC4003", productName: "无线手持吸尘器", quantity: 12, reason: "质量", reasonDetail: "电池续航不足，无法达到标注时间", platform: "Shopify", costImpact: 420.0, status: "processed" },
    { sku: "CL-AP9008", productName: "HEPA 空气净化器", quantity: 8, reason: "质量", reasonDetail: "滤芯安装位松动，异响", platform: "Amazon", costImpact: 360.0, status: "processed" },
    { sku: "PC-HD6005", productName: "负离子吹风机", quantity: 15, reason: "质量", reasonDetail: "发热不均匀，温度过高", platform: "Walmart", costImpact: 225.0, status: "refunded" },
    { sku: "KA-BK2001", productName: "智能电热水壶", quantity: 10, reason: "质量", reasonDetail: "壶身出现锈斑", platform: "eBay", costImpact: 125.0, status: "pending" },
    { sku: "PC-ES1009", productName: "电动牙刷套装", quantity: 20, reason: "质量", reasonDetail: "刷头松动，容易脱落", platform: "Amazon", costImpact: 60.0, status: "rejected" },
    // 物流 - ~25%
    { sku: "CL-HM5004", productName: "智能加湿器", quantity: 30, reason: "物流", reasonDetail: "外包装破损，产品外壳裂开", platform: "Walmart", costImpact: 255.0, status: "refunded" },
    { sku: "KA-TS8007", productName: "多功能烤面包机", quantity: 10, reason: "物流", reasonDetail: "运输途中受损，面包机变形", platform: "Amazon", costImpact: 180.0, status: "processed" },
    { sku: "PC-MS7006", productName: "电动按摩仪", quantity: 8, reason: "物流", reasonDetail: "配送延迟超过14天，客户拒收", platform: "Shopify", costImpact: 176.0, status: "refunded" },
    { sku: "CL-IR1101", productName: "蒸汽挂烫机", quantity: 6, reason: "物流", reasonDetail: "快递丢失", platform: "Temu", costImpact: 84.0, status: "pending" },
    // 规格 - ~20%
    { sku: "KA-CF3002", productName: "便携式咖啡机", quantity: 14, reason: "规格", reasonDetail: "实际容量与描述不符，标注300ml实际仅200ml", platform: "Amazon", costImpact: 392.0, status: "processed" },
    { sku: "CL-AP9008", productName: "HEPA 空气净化器", quantity: 5, reason: "规格", reasonDetail: "适用面积与宣传不一致", platform: "Shopify", costImpact: 225.0, status: "rejected" },
    { sku: "PC-SK1201", productName: "电子秤", quantity: 12, reason: "规格", reasonDetail: "称重精度不达标，误差超过±0.1kg", platform: "Walmart", costImpact: 48.0, status: "processed" },
    // 其他 - ~15%
    { sku: "KA-JB1010", productName: "便携榨汁杯", quantity: 22, reason: "其他", reasonDetail: "客户改变主意，不想要了", platform: "Temu", costImpact: 110.0, status: "refunded" },
    { sku: "PC-HD6005", productName: "负离子吹风机", quantity: 7, reason: "其他", reasonDetail: "重复下单", platform: "Amazon", costImpact: 105.0, status: "processed" },
    { sku: "CL-HM5004", productName: "智能加湿器", quantity: 9, reason: "其他", reasonDetail: "客户购买后降价，要求退货重买", platform: "eBay", costImpact: 76.5, status: "pending" },
  ];
  const returnRecords = await Promise.all(returnData.map(d => prisma.returnRecord.create({ data: d })));
  console.log(`✅ 创建 ${returnRecords.length} 条退货记录`);

  // ==================== 10. 缺陷记录 ====================
  const defectData = [
    { sku: "KA-BK2001", productName: "智能电热水壶", defectType: "功能", severity: "major", quantity: 3, detectedAt: "in-process", rootCause: "温控器供应商批次不良", correctiveAction: "更换温控器供应商，加强来料检测", status: "resolved" },
    { sku: "KA-CF3002", productName: "便携式咖啡机", defectType: "功能", severity: "critical", quantity: 2, detectedAt: "customer", rootCause: "水泵密封圈设计缺陷", correctiveAction: "重新设计密封结构，召回受影响批次", status: "investigating" },
    { sku: "CL-VC4003", productName: "无线手持吸尘器", defectType: "外观", severity: "minor", quantity: 8, detectedAt: "outgoing", rootCause: "外壳注塑工艺参数偏差", correctiveAction: "调整注塑温度和压力参数", status: "open" },
    { sku: "CL-AP9008", productName: "HEPA 空气净化器", defectType: "功能", severity: "major", quantity: 1, detectedAt: "customer", rootCause: "主板焊接虚焊", correctiveAction: "增加焊接检测工序", status: "resolved" },
    { sku: "PC-HD6005", productName: "负离子吹风机", defectType: "安全", severity: "critical", quantity: 1, detectedAt: "customer", rootCause: "过热保护装置失效", correctiveAction: "更换过热保护元件型号，增加双保险设计", status: "investigating" },
    { sku: "KA-TS8007", productName: "多功能烤面包机", defectType: "外观", severity: "minor", quantity: 5, detectedAt: "incoming", rootCause: "外壳运输刮擦", correctiveAction: "改进包装缓冲设计", status: "closed" },
    { sku: "CL-HM5004", productName: "智能加湿器", defectType: "包装", severity: "minor", quantity: 12, detectedAt: "outgoing", rootCause: "包装盒印刷色差", correctiveAction: "更换包装印刷供应商", status: "resolved" },
    { sku: "PC-ES1009", productName: "电动牙刷套装", defectType: "功能", severity: "major", quantity: 4, detectedAt: "in-process", rootCause: "马达装配不到位", correctiveAction: "加强装配线质检", status: "open" },
    { sku: "KA-JB1010", productName: "便携榨汁杯", defectType: "安全", severity: "major", quantity: 2, detectedAt: "customer", rootCause: "刀片固定螺丝松动风险", correctiveAction: "增加螺丝扭力检测，增加螺纹胶", status: "investigating" },
    { sku: "CL-IR1101", productName: "蒸汽挂烫机", defectType: "包装", severity: "minor", quantity: 6, detectedAt: "incoming", rootCause: "说明书版本错误", correctiveAction: "更新说明书并重新印制", status: "closed" },
    { sku: "PC-SK1201", productName: "电子秤", defectType: "功能", severity: "minor", quantity: 3, detectedAt: "in-process", rootCause: "传感器校准偏移", correctiveAction: "增加出厂前二次校准", status: "open" },
  ];
  const defectRecords = await Promise.all(defectData.map(d => prisma.defectRecord.create({ data: d })));
  console.log(`✅ 创建 ${defectRecords.length} 条缺陷记录`);

  // ==================== 11. 质保成本记录 ====================
  const warrantyData = [
    { sku: "KA-BK2001", productName: "智能电热水壶", category: "replacement", cost: 625.0, description: "温控器故障批量更换", claimDate: "2025-01-05", resolvedDate: "2025-01-20", status: "completed" },
    { sku: "KA-CF3002", productName: "便携式咖啡机", category: "refund", cost: 1120.0, description: "水泵漏水退货退款", claimDate: "2025-01-10", status: "approved" },
    { sku: "CL-VC4003", productName: "无线手持吸尘器", category: "repair", cost: 360.0, description: "电池更换维修", claimDate: "2025-01-08", resolvedDate: "2025-01-22", status: "completed" },
    { sku: "CL-AP9008", productName: "HEPA 空气净化器", category: "replacement", cost: 650.0, description: "主板故障更换", claimDate: "2025-01-12", status: "approved" },
    { sku: "PC-HD6005", productName: "负离子吹风机", category: "refund", cost: 350.0, description: "过热保护失效退货", claimDate: "2025-01-15", status: "submitted" },
    { sku: "PC-ES1009", productName: "电动牙刷套装", category: "support", cost: 45.0, description: "客户咨询刷头更换问题", claimDate: "2025-01-18", resolvedDate: "2025-01-19", status: "completed" },
    { sku: "KA-JB1010", productName: "便携榨汁杯", category: "replacement", cost: 110.0, description: "刀片松动风险产品更换", claimDate: "2025-01-20", status: "submitted" },
    { sku: "CL-HM5004", productName: "智能加湿器", category: "repair", cost: 150.0, description: "雾化片更换", claimDate: "2025-01-22", status: "approved" },
  ];
  const warrantyRecords = await Promise.all(warrantyData.map(d => prisma.warrantyCost.create({ data: d })));
  console.log(`✅ 创建 ${warrantyRecords.length} 条质保成本记录`);

  // ==================== 12. 合规证书 ====================
  const now = new Date();
  const futureDate = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };
  const pastDate = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  };

  const certData = [
    { certName: "CE", certNumber: "CE-2024-0891", issuer: "TÜV莱茵", sku: null, productName: null, category: "safety", issueDate: pastDate(180), expiryDate: futureDate(185), status: "active", scope: "小家电产品线欧盟安全认证", notes: "覆盖全品类欧盟市场准入" },
    { certName: "FCC", certNumber: "FCC-2024-3A22", issuer: "FCC实验室", sku: null, productName: null, category: "emc", issueDate: pastDate(200), expiryDate: futureDate(165), status: "active", scope: "电磁兼容认证 - 美国市场" },
    { certName: "CCC", certNumber: "CCC-20230789", issuer: "CQC认证中心", sku: null, productName: null, category: "safety", issueDate: pastDate(365), expiryDate: futureDate(25), status: "expiring", scope: "中国强制性产品认证", notes: "即将到期，已提交续证申请" },
    { certName: "RoHS", certNumber: "RoHS-2024-GF01", issuer: "SGS", sku: null, productName: null, category: "environmental", issueDate: pastDate(120), expiryDate: futureDate(245), status: "active", scope: "有害物质限制 - 全产品线" },
    { certName: "UL", certNumber: "UL-E456789", issuer: "UL Solutions", sku: "CL-AP9008", productName: "HEPA 空气净化器", category: "safety", issueDate: pastDate(90), expiryDate: futureDate(275), status: "active", scope: "美国安全认证 - 空气净化器" },
    { certName: "ETL", certNumber: "ETL-789012", issuer: "Intertek", sku: "KA-CF3002", productName: "便携式咖啡机", category: "safety", issueDate: pastDate(150), expiryDate: futureDate(-10), status: "expired", scope: "北美安全认证 - 咖啡机", notes: "已过期，需重新认证" },
    { certName: "PSE", certNumber: "PSE-2024-JP03", issuer: "JET日本电气安全环境研究所", sku: "KA-BK2001", productName: "智能电热水壶", category: "safety", issueDate: pastDate(60), expiryDate: futureDate(305), status: "active", scope: "日本电气用品安全法认证" },
    { certName: "SAA", certNumber: "SAA-AU20241", issuer: "SAI Global", sku: "PC-HD6005", productName: "负离子吹风机", category: "safety", issueDate: pastDate(300), expiryDate: pastDate(5), status: "expired", scope: "澳大利亚安全认证 - 吹风机", notes: "已过期，需紧急续证" },
  ];
  const certRecords = await Promise.all(certData.map(d => prisma.complianceCert.create({ data: d })));
  console.log(`✅ 创建 ${certRecords.length} 条合规证书`);

  // ==================== 13. 法规变更 ====================
  const regulationData = [
    { title: "EU Ecodesign 2025新规", source: "EU", category: "environmental", description: "欧盟生态设计指令2025年修订版，对家电产品能效标签和待机功耗提出更严格要求", impactLevel: "high", effectiveDate: futureDate(60), deadline: futureDate(180), affectedSkus: JSON.stringify(["KA-BK2001", "KA-CF3002", "KA-TS8007", "KA-JB1010"]), affectedCerts: JSON.stringify([certRecords[0].id]), actionRequired: "更新能效标签，降低待机功耗至0.5W以下", status: "action_required", sourceUrl: "https://ec.europa.eu/ecodesign-2025" },
    { title: "FCC Part 15B测试标准更新", source: "FDA", category: "emc", description: "美国FCC更新电磁兼容测试标准，新增5GHz频段辐射限制", impactLevel: "medium", effectiveDate: futureDate(90), deadline: futureDate(270), affectedSkus: JSON.stringify(["CL-AP9008", "PC-HD6005"]), affectedCerts: JSON.stringify([certRecords[1].id]), actionRequired: "重新进行EMC测试，更新FCC认证", status: "reviewing", sourceUrl: "https://fcc.gov/part15b-update" },
    { title: "GB 4706.1-2025 家电安全标准修订", source: "GB", category: "safety", description: "国标GB 4706.1家用和类似用途电器安全第1部分：通用要求2025修订版", impactLevel: "high", effectiveDate: futureDate(120), deadline: futureDate(365), affectedSkus: JSON.stringify(["KA-BK2001", "KA-CF3002", "CL-VC4003", "CL-HM5004", "PC-HD6005", "PC-MS7006", "KA-TS8007", "CL-AP9008"]), affectedCerts: JSON.stringify([certRecords[2].id]), actionRequired: "按新标准重新测试，更新CCC认证", status: "new" },
    { title: "SAA认证流程变更通知", source: "SAA", category: "safety", description: "澳大利亚SAA认证机构更新申请流程，新增年度工厂检查要求", impactLevel: "low", effectiveDate: futureDate(30), deadline: futureDate(90), affectedSkus: JSON.stringify(["PC-HD6005"]), affectedCerts: JSON.stringify([certRecords[7].id]), actionRequired: "安排年度工厂检查，更新认证", status: "compliant", sourceUrl: "https://saa.gov.au/process-update" },
    { title: "EU RoHS新增限制物质", source: "EU", category: "environmental", description: "欧盟RoHS指令附录II新增限制物质：邻苯二甲酸二异丁酯(DIBP)限值调整", impactLevel: "medium", effectiveDate: futureDate(45), deadline: futureDate(150), affectedSkus: JSON.stringify([]), affectedCerts: JSON.stringify([certRecords[3].id]), actionRequired: "核查供应链原材料是否含DIBP，如含则需替换", status: "reviewing" },
  ];
  const regulationRecords = await Promise.all(regulationData.map(d => prisma.regulationChange.create({ data: d })));
  console.log(`✅ 创建 ${regulationRecords.length} 条法规变更记录`);

  console.log('🎉 种子数据完成!');
}

main()
  .catch((e) => {
    console.error('❌ 种子失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
