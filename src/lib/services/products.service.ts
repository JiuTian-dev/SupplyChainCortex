/**
 * Products Service - Business logic for product operations
 * Extracted from API routes for reusability and testability
 */

import { db } from '@/lib/db';
import type { SalesRecord } from '@prisma/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Valid ABC classes */
export const ABC_CLASSES = ['A', 'B', 'C'] as const;
export type AbcClass = (typeof ABC_CLASSES)[number];

/** Valid FSN classes */
export const FSN_CLASSES = ['F', 'S', 'N'] as const;
export type FsnClass = (typeof FSN_CLASSES)[number];

/** Product list filters */
export interface ProductListFilters {
  category?: string;
  abcClass?: string;
  fsnClass?: string;
  sku?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Product search parameters */
export interface ProductSearchParams {
  query: string;
  page?: number;
  pageSize?: number;
}

/** Product detail lookup mode */
export type ProductLookupBy = 'id' | 'sku';

/** Product detail result */
export interface ProductDetailResult {
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    subCategory: string;
    unitCost: number;
    sellingPrice: number;
    weight: number;
    origin: string;
    abcClass: string;
    fsnClass: string;
    createdAt: Date;
    updatedAt: Date;
  };
  inventory: Awaited<ReturnType<typeof db.inventory.findUnique>> | null;
  cost: Awaited<ReturnType<typeof db.costRecord.findUnique>> | null;
  recentSales: Awaited<ReturnType<typeof db.salesRecord.findMany>>;
  recentShipments: Awaited<ReturnType<typeof db.shipmentItem.findMany>>;
  stats: {
    totalRevenue: number;
    totalQuantity: number;
    avgDailySales: number;
    grossMargin: number;
    currentStock: number;
    stockStatus: string;
  };
}

/** Formatted product list item */
export interface FormattedProductItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  subCategory: string;
  unitCost: number;
  sellingPrice: number;
  weight: number;
  origin: string;
  abcClass: string;
  fsnClass: string;
  inventory: {
    quantity: number;
    safetyStock: number;
    stockStatus: string;
    turnoverDays: number;
    warehouse: string;
  } | null;
  cost: {
    totalLanded: number;
    grossMargin: number;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Product list result */
export interface ProductListResult {
  products: FormattedProductItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    category: string | null;
    abcClass: string | null;
    fsnClass: string | null;
    search: string | null;
  };
  categoryBreakdown: Record<string, number>;
}

/** Product search result */
export interface ProductSearchResult {
  query: string;
  products: FormattedProductItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  totalMatches: number;
}

/** Create product data */
export interface CreateProductData {
  sku: string;
  name: string;
  category: string;
  subCategory?: string;
  unitCost: number;
  sellingPrice: number;
  weight: number;
  origin?: string;
  abcClass?: AbcClass;
  fsnClass?: FsnClass;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Safe decode a URL-encoded string */
export function safeDecode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Paginate an array of items */
export function paginate<T>(items: T[], page: number, pageSize: number): {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
} {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return { data, pagination: { page, pageSize, total, totalPages } };
}

/** Format a product with its inventory and cost relations */
export function formatProductItem(product: {
  id: string;
  sku: string;
  name: string;
  category: string;
  subCategory: string;
  unitCost: number;
  sellingPrice: number;
  weight: number;
  origin: string;
  abcClass: string;
  fsnClass: string;
  createdAt: Date;
  updatedAt: Date;
  inventory: {
    quantity: number;
    safetyStock: number;
    stockStatus: string;
    turnoverDays: number;
    warehouse: string;
  } | null;
  cost: {
    totalLanded: number;
    grossMargin: number;
  } | null;
}): FormattedProductItem {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    subCategory: product.subCategory,
    unitCost: product.unitCost,
    sellingPrice: product.sellingPrice,
    weight: product.weight,
    origin: product.origin,
    abcClass: product.abcClass,
    fsnClass: product.fsnClass,
    inventory: product.inventory
      ? {
          quantity: product.inventory.quantity,
          safetyStock: product.inventory.safetyStock,
          stockStatus: product.inventory.stockStatus,
          turnoverDays: product.inventory.turnoverDays,
          warehouse: product.inventory.warehouse,
        }
      : null,
    cost: product.cost
      ? {
          totalLanded: product.cost.totalLanded,
          grossMargin: product.cost.grossMargin,
        }
      : null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// ─── Core Business Logic ───────────────────────────────────────────────────────

/** Get filtered/paginated products with inventory/cost */
export async function getProductsList(filters: ProductListFilters = {}): Promise<ProductListResult> {
  const { category, abcClass, fsnClass, sku, search, page = 1, pageSize = 20 } = filters;

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (abcClass) where.abcClass = abcClass;
  if (fsnClass) where.fsnClass = fsnClass;
  if (sku) where.sku = sku;

  let products = await db.product.findMany({
    where,
    include: {
      inventory: true,
      cost: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Text search on name or SKU
  if (search) {
    const searchLower = search.toLowerCase();
    products = products.filter(
      p => p.name.toLowerCase().includes(searchLower) || p.sku.toLowerCase().includes(searchLower)
    );
  }

  // Format response
  const formatted = products.map(p => formatProductItem(p));

  const paginated = paginate(formatted, page, pageSize);

  // Category breakdown
  const categoryBreakdown: Record<string, number> = {};
  products.forEach(p => {
    categoryBreakdown[p.category] = (categoryBreakdown[p.category] || 0) + 1;
  });

  return {
    products: paginated.data,
    pagination: paginated.pagination,
    filters: { category: category || null, abcClass: abcClass || null, fsnClass: fsnClass || null, search: search || null },
    categoryBreakdown,
  };
}

/** Search products by name/SKU/category/subCategory */
export async function searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
  const { query, page = 1, pageSize = 20 } = params;

  if (!query.trim()) {
    throw new Error('搜索关键词不能为空');
  }

  const queryLower = query.toLowerCase();

  const allProducts = await db.product.findMany({
    include: {
      inventory: true,
      cost: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Search across name, SKU, category, and subCategory
  const results = allProducts.filter(
    p =>
      p.name.toLowerCase().includes(queryLower) ||
      p.sku.toLowerCase().includes(queryLower) ||
      p.category.toLowerCase().includes(queryLower) ||
      p.subCategory.toLowerCase().includes(queryLower)
  );

  const formatted = results.map(p => formatProductItem(p));
  const paginated = paginate(formatted, page, pageSize);

  return {
    query,
    products: paginated.data,
    pagination: paginated.pagination,
    totalMatches: results.length,
  };
}

/** Get detailed product info with all relations */
export async function getProductDetail(
  idOrSku: string,
  by: ProductLookupBy = 'sku'
): Promise<ProductDetailResult | null> {
  let product: any = null;

  if (by === 'id') {
    product = await db.product.findUnique({
      where: { id: idOrSku },
      include: {
        inventory: true,
        cost: true,
        salesRecords: { orderBy: { date: 'desc' }, take: 30 },
        shipments: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  } else {
    product = await db.product.findUnique({
      where: { sku: idOrSku },
      include: {
        inventory: true,
        cost: true,
        salesRecords: { orderBy: { date: 'desc' }, take: 30 },
        shipments: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  }

  if (!product) return null;

  // Compute summary stats
  const totalSales = product.salesRecords.reduce((sum: number, r: SalesRecord) => sum + r.revenue, 0);
  const totalQty = product.salesRecords.reduce((sum: number, r: SalesRecord) => sum + r.quantity, 0);
  const avgDailySales = product.salesRecords.length > 0
    ? Math.round((totalQty / product.salesRecords.length) * 10) / 10
    : 0;

  return {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      subCategory: product.subCategory,
      unitCost: product.unitCost,
      sellingPrice: product.sellingPrice,
      weight: product.weight,
      origin: product.origin,
      abcClass: product.abcClass,
      fsnClass: product.fsnClass,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    },
    inventory: product.inventory,
    cost: product.cost,
    recentSales: product.salesRecords.slice(0, 10),
    recentShipments: product.shipments,
    stats: {
      totalRevenue: Math.round(totalSales),
      totalQuantity: totalQty,
      avgDailySales,
      grossMargin: product.cost?.grossMargin || 0,
      currentStock: product.inventory?.quantity || 0,
      stockStatus: product.inventory?.stockStatus || 'unknown',
    },
  };
}

/** Get products by category */
export async function getProductsByCategory(category: string, page = 1, pageSize = 20): Promise<ProductListResult> {
  return getProductsList({ category, page, pageSize });
}

/** Create a new product */
export async function createProduct(data: CreateProductData): Promise<{
  product: Awaited<ReturnType<typeof db.product.create>>;
}> {
  // Check if SKU already exists
  const existing = await db.product.findUnique({ where: { sku: data.sku } });
  if (existing) {
    throw new Error(`SKU 已存在: ${data.sku}`);
  }

  // Validate numeric fields
  if (data.unitCost < 0 || data.sellingPrice < 0 || data.weight < 0) {
    throw new Error('unitCost, sellingPrice, weight 不能为负数');
  }

  const product = await db.product.create({
    data: {
      sku: data.sku,
      name: data.name,
      category: data.category,
      subCategory: data.subCategory || '',
      unitCost: Number(data.unitCost),
      sellingPrice: Number(data.sellingPrice),
      weight: Number(data.weight),
      origin: data.origin || 'CN',
      abcClass: data.abcClass || 'C',
      fsnClass: data.fsnClass || 'N',
    },
  });

  // Create associated SupplyChainEvent
  await db.supplyChainEvent.create({
    data: {
      type: '新品添加',
      title: `新产品上架: ${data.name}`,
      description: `SKU ${data.sku} 已添加到产品库，品类: ${data.category}`,
      icon: '🆕',
      color: '#22c55e',
      severity: 'info',
      sku: data.sku,
      isRead: false,
    },
  });

  return { product };
}

/** Update product data */
export interface UpdateProductData {
  id: string;
  name?: string;
  category?: string;
  subCategory?: string;
  unitCost?: number;
  sellingPrice?: number;
  weight?: number;
  origin?: string;
  abcClass?: AbcClass;
  fsnClass?: FsnClass;
}

/** Update an existing product */
export async function updateProduct(data: UpdateProductData): Promise<{
  product: Awaited<ReturnType<typeof db.product.update>>;
}> {
  const { id, ...fields } = data;

  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('未找到该产品');
  }

  // Build update data from provided fields
  const allowedFields = ['name', 'category', 'subCategory', 'unitCost', 'sellingPrice', 'weight', 'origin', 'abcClass', 'fsnClass'];
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if ((fields as Record<string, unknown>)[field] !== undefined) {
      updateData[field] = (fields as Record<string, unknown>)[field];
    }
  }

  // Validate numeric fields
  if (updateData.unitCost !== undefined && Number(updateData.unitCost) < 0) {
    throw new Error('unitCost 不能为负数');
  }
  if (updateData.sellingPrice !== undefined && Number(updateData.sellingPrice) < 0) {
    throw new Error('sellingPrice 不能为负数');
  }
  if (updateData.weight !== undefined && Number(updateData.weight) < 0) {
    throw new Error('weight 不能为负数');
  }

  // Validate abcClass if provided
  if (updateData.abcClass && !ABC_CLASSES.includes(updateData.abcClass as AbcClass)) {
    throw new Error('abcClass 必须为 A, B, 或 C');
  }

  // Validate fsnClass if provided
  if (updateData.fsnClass && !FSN_CLASSES.includes(updateData.fsnClass as FsnClass)) {
    throw new Error('fsnClass 必须为 F, S, 或 N');
  }

  const product = await db.product.update({
    where: { id },
    data: updateData,
  });

  return { product };
}

/** Delete a product (with related record checks) */
export async function deleteProduct(id: string): Promise<{
  success: boolean;
  message: string;
  sku: string;
}> {
  const existing = await db.product.findUnique({
    where: { id },
    include: {
      inventory: true,
      cost: true,
      salesRecords: { take: 1 },
      shipments: { take: 1 },
    },
  });

  if (!existing) {
    throw new Error('未找到该产品');
  }

  // Check for related records
  const relatedRecords: string[] = [];
  if (existing.inventory) relatedRecords.push('库存记录');
  if (existing.cost) relatedRecords.push('成本记录');
  if (existing.salesRecords.length > 0) relatedRecords.push('销售记录');
  if (existing.shipments.length > 0) relatedRecords.push('货运记录');

  if (relatedRecords.length > 0) {
    throw new Error(`该产品存在关联${relatedRecords.join('、')}，无法删除`);
  }

  await db.product.delete({ where: { id } });

  return { success: true, message: `产品 ${existing.sku} 已删除`, sku: existing.sku };
}
