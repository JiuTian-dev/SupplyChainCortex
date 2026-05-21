/**
 * Supplier Reports — getSupplierReport, getSupplierSummary, getSupplierReportEnhanced.
 * Extracted from services/reports.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';
import type { SupplierReportResult, SupplierSummaryResult, SupplierReportEnhancedResult } from './reports-types';

// ─── Legacy: Supplier Report ────────────────────────────────────────────────────

export async function getSupplierReport(): Promise<SupplierReportResult> {
  return cachedFetch(
    cacheKey('reports', 'supplier-report'),
    async () => {
      const suppliers = await db.supplier.findMany();

      const regionSummary: Record<string, { region: string; count: number; avgRating: number; avgLeadTime: number }> = {};
      suppliers.forEach(s => {
        if (!regionSummary[s.region]) regionSummary[s.region] = { region: s.region, count: 0, avgRating: 0, avgLeadTime: 0 };
        regionSummary[s.region].count += 1;
        regionSummary[s.region].avgRating += s.rating;
        regionSummary[s.region].avgLeadTime += s.leadTime;
      });
      Object.values(regionSummary).forEach(r => {
        r.avgRating = roundTo(r.avgRating / r.count, 1);
        r.avgLeadTime = Math.round(r.avgLeadTime / r.count);
      });

      return {
        title: '供应商报告',
        generatedAt: new Date().toISOString(),
        summary: {
          totalSuppliers: suppliers.length,
          activeSuppliers: suppliers.filter(s => s.status === 'active').length,
          avgRating: suppliers.length > 0 ? roundTo(suppliers.reduce((s, sup) => s + sup.rating, 0) / suppliers.length, 1) : 0,
          avgLeadTime: suppliers.length > 0 ? Math.round(suppliers.reduce((s, sup) => s + sup.leadTime, 0) / suppliers.length) : 0,
        },
        byRegion: Object.values(regionSummary),
        suppliers: suppliers.map(s => ({ code: s.code, name: s.name, region: s.region, category: s.category, leadTime: s.leadTime, rating: s.rating, status: s.status })),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Enhanced: Supplier Summary ─────────────────────────────────────────────────

export async function getSupplierSummary(): Promise<SupplierSummaryResult> {
  return cachedFetch(
    cacheKey('reports', 'supplier-summary'),
    async () => {
      const [suppliers, shipments, costRecords, products] = await Promise.all([
        db.supplier.findMany(),
        db.shipmentItem.findMany(),
        db.costRecord.findMany(),
        db.product.findMany(),
      ]);

      const totalSuppliers = suppliers.length;
      const activeSuppliers = suppliers.filter(s => s.status === 'active');
      const activeCount = activeSuppliers.length;

      const avgRating = suppliers.length > 0
        ? roundTo(suppliers.reduce((s, sup) => s + sup.rating, 0) / suppliers.length, 1)
        : 0;

      const deliveredShipments = shipments.filter(s => s.status === 'delivered');
      const onTimeDeliveries = deliveredShipments.filter(s => s.delayDays === 0);
      const onTimeDeliveryRate = deliveredShipments.length > 0
        ? Math.round(onTimeDeliveries.length / deliveredShipments.length * 100)
        : 0;

      const supplierRiskAnalysis = activeSuppliers.map(supplier => {
        const relatedShipments = shipments.filter(s => s.origin === supplier.region || s.carrier.includes(supplier.code));
        const supplierOnTime = relatedShipments.length > 0
          ? Math.round(relatedShipments.filter(s => s.delayDays === 0).length / relatedShipments.length * 100)
          : 85 + Math.round(supplier.rating * 3);

        const categoryProducts = costRecords.filter(c => products.find(p => p.sku === c.sku)?.category === supplier.category);
        const avgMargin = categoryProducts.length > 0
          ? categoryProducts.reduce((sum, c) => sum + c.grossMargin, 0) / categoryProducts.length
          : 50;

        const riskScore = Math.round(
          (100 - supplierOnTime) * 0.3 + (100 - Math.min(100, avgMargin * 1.5)) * 0.3 + Math.max(0, (supplier.leadTime - 7) * 3) * 0.2 + (supplier.rating < 3 ? 15 : 0)
        );
        const riskLevel = riskScore > 60 ? 'high' : riskScore > 35 ? 'medium' : 'low';

        return { code: supplier.code, name: supplier.name, region: supplier.region, category: supplier.category, rating: supplier.rating, leadTime: supplier.leadTime, onTimeRate: supplierOnTime, riskScore: Math.min(100, riskScore), riskLevel };
      });

      const riskDistribution = {
        high: supplierRiskAnalysis.filter(s => s.riskLevel === 'high').length,
        medium: supplierRiskAnalysis.filter(s => s.riskLevel === 'medium').length,
        low: supplierRiskAnalysis.filter(s => s.riskLevel === 'low').length,
      };

      const topPerformers = [...supplierRiskAnalysis].sort((a, b) => b.rating - a.rating || b.onTimeRate - a.onTimeRate).slice(0, 5);
      const worstPerformers = [...supplierRiskAnalysis].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);

      const categoryDistribution: Record<string, number> = {};
      suppliers.forEach(s => { categoryDistribution[s.category] = (categoryDistribution[s.category] || 0) + 1; });

      const regionDistribution: Record<string, number> = {};
      suppliers.forEach(s => { regionDistribution[s.region] = (regionDistribution[s.region] || 0) + 1; });

      return {
        title: '供应商汇总报告',
        generatedAt: new Date().toISOString(),
        summary: { totalSuppliers, activeCount, avgRating, onTimeDeliveryRate },
        riskDistribution, topPerformers, worstPerformers,
        categoryDistribution, regionDistribution,
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Type-param: Supplier Report Enhanced ───────────────────────────────────────

export async function getSupplierReportEnhanced(): Promise<SupplierReportEnhancedResult> {
  return cachedFetch(
    cacheKey('reports', 'supplier-report-enhanced'),
    async () => {
      const [suppliers, products, shipments] = await Promise.all([
        db.supplier.findMany(), db.product.findMany(), db.shipmentItem.findMany(),
      ]);

      const ratingDistribution = {
        excellent: suppliers.filter(s => s.rating >= 4.5).length,
        good: suppliers.filter(s => s.rating >= 3.5 && s.rating < 4.5).length,
        average: suppliers.filter(s => s.rating >= 2.5 && s.rating < 3.5).length,
        poor: suppliers.filter(s => s.rating < 2.5).length,
      };

      const leadTimeAnalysis = {
        avgLeadTime: suppliers.length > 0 ? Math.round(suppliers.reduce((s, sup) => s + sup.leadTime, 0) / suppliers.length) : 0,
        minLeadTime: suppliers.length > 0 ? Math.min(...suppliers.map(s => s.leadTime)) : 0,
        maxLeadTime: suppliers.length > 0 ? Math.max(...suppliers.map(s => s.leadTime)) : 0,
        shortTerm: suppliers.filter(s => s.leadTime <= 7).length,
        mediumTerm: suppliers.filter(s => s.leadTime > 7 && s.leadTime <= 14).length,
        longTerm: suppliers.filter(s => s.leadTime > 14).length,
      };

      const categoryCoverage: Record<string, { category: string; supplierCount: number; suppliers: Array<{ code: string; name: string; rating: number }> }> = {};
      suppliers.forEach(s => {
        if (!categoryCoverage[s.category]) categoryCoverage[s.category] = { category: s.category, supplierCount: 0, suppliers: [] };
        categoryCoverage[s.category].supplierCount++;
        categoryCoverage[s.category].suppliers.push({ code: s.code, name: s.name, rating: s.rating });
      });

      const regionalDistribution: Record<string, { region: string; count: number; avgRating: number; avgLeadTime: number; productCategories: string[] }> = {};
      suppliers.forEach(s => {
        if (!regionalDistribution[s.region]) regionalDistribution[s.region] = { region: s.region, count: 0, avgRating: 0, avgLeadTime: 0, productCategories: [] };
        regionalDistribution[s.region].count++;
        regionalDistribution[s.region].avgRating += s.rating;
        regionalDistribution[s.region].avgLeadTime += s.leadTime;
        if (!regionalDistribution[s.region].productCategories.includes(s.category)) {
          regionalDistribution[s.region].productCategories.push(s.category);
        }
      });
      Object.values(regionalDistribution).forEach(r => {
        r.avgRating = r.count > 0 ? roundTo(r.avgRating / r.count, 1) : 0;
        r.avgLeadTime = r.count > 0 ? Math.round(r.avgLeadTime / r.count) : 0;
      });

      return {
        title: '供应商报告',
        generatedAt: new Date().toISOString(),
        ratingDistribution, leadTimeAnalysis,
        categoryCoverage: Object.values(categoryCoverage),
        regionalDistribution: Object.values(regionalDistribution),
        totalSuppliers: suppliers.length,
        activeSuppliers: suppliers.filter(s => s.status === 'active').length,
      };
    },
    CACHE_TTL.VERY_LONG
  );
}
