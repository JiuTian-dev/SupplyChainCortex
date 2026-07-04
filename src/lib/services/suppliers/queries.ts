/**
 * Suppliers Service - Query and CRUD functions
 * Extracted from suppliers.service.ts for modularity.
 */

import { db } from '@/lib/db';
import { serverCache } from '@/lib/cache';
import {
  SUPPLIER_STATUSES,
  type SupplierStatus,
  type SupplierListFilters,
  type PaginatedResult,
  type SupplierWithDetails,
  type CreateSupplierData,
  type SupplierRatingData,
} from './types';
import { parseRatingDetails } from './shared';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Paginate an array of items */
export function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return { data, pagination: { page, pageSize, total, totalPages } };
}

/** Format supplier with parsed ratingDetails */
export function formatSupplierWithDetails(supplier: {
  id: string;
  code: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  region: string;
  category: string;
  leadTime: number;
  rating: number;
  ratingDetails: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): SupplierWithDetails {
  return {
    ...supplier,
    ratingDetails: parseRatingDetails(supplier.ratingDetails),
  };
}

// ─── Core Business Logic ───────────────────────────────────────────────────────

/** Get filtered/paginated suppliers list */
export async function getSuppliersList(filters: SupplierListFilters = {}): Promise<PaginatedResult<SupplierWithDetails>> {
  const { region, category, status, page = 1, pageSize = 20 } = filters;

  const where: Record<string, unknown> = {};
  if (region) where.region = region;
  if (category) where.category = category;
  if (status) where.status = status;

  const allSuppliers = await db.supplier.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const paginated = paginate(allSuppliers, page, pageSize);
  const suppliersWithDetails = paginated.data.map(s => formatSupplierWithDetails(s));

  return {
    data: suppliersWithDetails,
    pagination: paginated.pagination,
  };
}

/** Get a single supplier by code */
export async function getSupplierByCode(code: string): Promise<{
  supplier: SupplierWithDetails;
  orderHistory: Awaited<ReturnType<typeof db.reorderOrder.findMany>>;
} | null> {
  const supplier = await db.supplier.findUnique({
    where: { code },
  });

  if (!supplier) return null;

  // Get related reorder orders as order history
  const orderHistory = await db.reorderOrder.findMany({
    where: { sku: { startsWith: supplier.category.substring(0, 2) } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return {
    supplier: formatSupplierWithDetails(supplier),
    orderHistory,
  };
}

/** Rate a supplier with sub-scores */
export async function rateSupplier(ratingData: SupplierRatingData): Promise<SupplierWithDetails> {
  const { id, deliveryScore, qualityScore, priceScore, communicationScore, comments, ...otherFields } = ratingData;

  const existing = await db.supplier.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('未找到该供应商');
  }

  // Validate sub-scores (0-10 range)
  const subScoreFields = { deliveryScore, qualityScore, priceScore, communicationScore };
  for (const [fieldName, fieldValue] of Object.entries(subScoreFields)) {
    if (fieldValue !== undefined) {
      const val = Number(fieldValue);
      if (isNaN(val) || val < 0 || val > 10) {
        throw new Error(`${fieldName} 必须为 0-10 之间的数值`);
      }
    }
  }

  // Build update data from allowed fields
  const allowedFields = ['name', 'contact', 'email', 'phone', 'region', 'category', 'leadTime', 'rating', 'status'];
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if ((otherFields as Record<string, unknown>)[field] !== undefined) {
      updateData[field] = (otherFields as Record<string, unknown>)[field];
    }
  }

  // Validate status if provided
  if (updateData.status && !SUPPLIER_STATUSES.includes(updateData.status as SupplierStatus)) {
    throw new Error(`无效的 status 值，允许: ${SUPPLIER_STATUSES.join(', ')}`);
  }

  // Validate rating if provided
  if (updateData.rating !== undefined) {
    const ratingVal = Number(updateData.rating);
    if (isNaN(ratingVal) || ratingVal < 0 || ratingVal > 5) {
      throw new Error('rating 必须为 0-5 之间的数值');
    }
  }

  // Handle sub-scores: store as JSON in ratingDetails field
  if (deliveryScore !== undefined || qualityScore !== undefined ||
      priceScore !== undefined || communicationScore !== undefined ||
      comments !== undefined) {
    // Merge with existing ratingDetails or create new
    let existingDetails: Record<string, unknown> = {};
    try {
      if (existing.ratingDetails) {
        if (typeof existing.ratingDetails === 'string') {
          existingDetails = JSON.parse(existing.ratingDetails);
        } else if (typeof existing.ratingDetails === 'object') {
          existingDetails = existing.ratingDetails as Record<string, unknown>;
        }
      }
    } catch {
      // ignore parse errors, start fresh
    }

    const ratingDetailsObj: Record<string, unknown> = { ...existingDetails };
    if (deliveryScore !== undefined) ratingDetailsObj.deliveryScore = Number(deliveryScore);
    if (qualityScore !== undefined) ratingDetailsObj.qualityScore = Number(qualityScore);
    if (priceScore !== undefined) ratingDetailsObj.priceScore = Number(priceScore);
    if (communicationScore !== undefined) ratingDetailsObj.communicationScore = Number(communicationScore);
    if (comments !== undefined) ratingDetailsObj.comments = String(comments);
    ratingDetailsObj.ratedAt = new Date().toISOString();

    updateData.ratingDetails = ratingDetailsObj;
  }

  const supplier = await db.supplier.update({
    where: { id },
    data: updateData,
  });

  // Invalidate suppliers cache after rating
  serverCache.invalidate('suppliers');

  return formatSupplierWithDetails(supplier);
}

/** Create a new supplier */
export async function createSupplier(data: CreateSupplierData): Promise<{
  id: string;
  code: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  region: string;
  category: string;
  leadTime: number;
  rating: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  // Check if code already exists
  const existing = await db.supplier.findUnique({ where: { code: data.code } });
  if (existing) {
    throw new Error(`供应商编码已存在: ${data.code}`);
  }

  const supplier = await db.supplier.create({
    data: {
      code: data.code,
      name: data.name,
      contact: data.contact || null,
      email: data.email || null,
      phone: data.phone || null,
      region: data.region,
      category: data.category,
      leadTime: data.leadTime ?? 14,
      rating: data.rating ?? 0,
      status: 'active',
    },
  });

  // Invalidate suppliers cache after creation
  serverCache.invalidate('suppliers');

  return supplier;
}
