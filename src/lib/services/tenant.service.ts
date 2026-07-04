/**
 * Tenant Management Service
 *
 * Admin-level CRUD for tenants. These operations intentionally use the raw
 * `db` client (not the tenant-scoped extension) because tenant management is
 * cross-tenant by nature.
 */
import { db } from '@/lib/db';

export interface TenantInput {
  name: string;
  slug: string;
  plan?: string;
  status?: string;
}

export interface TenantUpdate {
  name?: string;
  slug?: string;
  plan?: string;
  status?: string;
}

const TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  plan: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Create a new tenant. */
export async function createTenant(data: TenantInput) {
  return db.tenants.create({
    data: {
      name: data.name,
      slug: data.slug,
      plan: data.plan ?? 'starter',
      status: data.status ?? 'active',
    },
    select: TENANT_SELECT,
  });
}

/** Get a tenant by id. */
export async function getTenant(id: string) {
  return db.tenants.findUnique({
    where: { id },
    select: TENANT_SELECT,
  });
}

/** Get a tenant by its slug. */
export async function getTenantBySlug(slug: string) {
  return db.tenants.findUnique({
    where: { slug },
    select: TENANT_SELECT,
  });
}

/** Update a tenant. */
export async function updateTenant(id: string, data: TenantUpdate) {
  return db.tenants.update({
    where: { id },
    data,
    select: TENANT_SELECT,
  });
}

/** Deactivate a tenant (sets status to "inactive"). */
export async function deactivateTenant(id: string) {
  return db.tenants.update({
    where: { id },
    data: { status: 'inactive' },
    select: TENANT_SELECT,
  });
}

/** List all tenants (admin only). */
export async function listTenants() {
  return db.tenants.findMany({
    select: TENANT_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

/** Ensure the default tenant exists (used during bootstrap / migration). */
export async function ensureDefaultTenant() {
  const existing = await db.tenants.findUnique({ where: { id: 'default' } });
  if (!existing) {
    await db.tenants.create({
      data: {
        id: 'default',
        name: 'Default Tenant',
        slug: 'default',
        plan: 'enterprise',
        status: 'active',
      },
    });
    return true;
  }
  return false;
}
