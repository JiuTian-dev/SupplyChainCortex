/**
 * Tenant Prisma Extension
 *
 * Automatically injects `tenantId` into every query so that application code
 * never has to remember to filter by tenant manually.
 *
 * - Read operations (find*, count, aggregate, groupBy) get a `where.tenantId`
 *   filter injected.
 * - Write operations (create, createMany, upsert) get `data.tenantId` injected.
 * - Update / delete operations get both a `where.tenantId` filter (preventing
 *   cross-tenant mutation) and, for upsert, a `create.tenantId`.
 *
 * The extension is a no-op when `MULTI_TENANT_ENABLED` is not "true", which
 * keeps existing single-tenant behaviour untouched.
 */
import type { PrismaClient } from '@prisma/client';
import {
  getTenantContext,
  isMultiTenantEnabled,
  DEFAULT_TENANT_ID,
} from './context';

/** Operations that accept a `where` clause and should be tenant-filtered. */
const FILTER_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

/** Operations that create rows and should have `tenantId` injected into data. */
const CREATE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'upsert',
]);

/**
 * Pure helper: inject `tenantId` into the `where` clause of a query args
 * object. Returns a new object (does not mutate the original) so callers can
 * safely reuse the original args.
 */
export function injectTenantFilter<T extends Record<string, any>>(
  args: T | undefined,
  tenantId: string,
): T {
  if (!args) {
    return { where: { tenantId } } as unknown as T;
  }
  const where = args.where ? { ...args.where, tenantId } : { tenantId };
  return { ...args, where };
}

/**
 * Pure helper: inject `tenantId` into the `data` payload of a create/upsert.
 * Handles both single-object and batch (`createMany`) data shapes.
 */
export function injectTenantCreate<T extends Record<string, any>>(
  args: T | undefined,
  tenantId: string,
): T {
  if (!args) {
    return { data: { tenantId } } as unknown as T;
  }
  if (!args.data) {
    return { ...args, data: { tenantId } };
  }
  if (Array.isArray(args.data)) {
    return {
      ...args,
      data: args.data.map((item: Record<string, any>) => ({ ...item, tenantId })),
    };
  }
  return { ...args, data: { ...args.data, tenantId } };
}

/**
 * Pure helper: apply tenant scoping to a query args object based on the
 * operation type. This is the single source of truth for how tenant isolation
 * is enforced at the Prisma layer and is unit-tested directly.
 */
export function applyTenantToArgs<T extends Record<string, any>>(
  operation: string,
  args: T | undefined,
  tenantId: string,
): T {
  if (!args || typeof args !== 'object') {
    // Minimal args object — only inject where possible.
    if (FILTER_OPERATIONS.has(operation)) {
      return { where: { tenantId } } as unknown as T;
    }
    if (CREATE_OPERATIONS.has(operation)) {
      return { data: { tenantId } } as unknown as T;
    }
    return args as unknown as T;
  }

  let result = args;

  if (CREATE_OPERATIONS.has(operation)) {
    result = injectTenantCreate(result, tenantId);
    // upsert also needs tenantId in the create payload and the where clause.
    if (operation === 'upsert' && result.create) {
      result = {
        ...result,
        create: { ...result.create, tenantId },
      };
    }
  }

  if (FILTER_OPERATIONS.has(operation)) {
    result = injectTenantFilter(result, tenantId);
  }

  return result;
}

/**
 * Returns the tenant id that should be injected for the current operation.
 * Falls back to the default tenant when no context is active.
 */
export function resolveTenantIdForQuery(): string {
  return getTenantContext() ?? DEFAULT_TENANT_ID;
}

/**
 * Apply the tenant-scoping Prisma extension to a PrismaClient instance.
 *
 * The returned client transparently filters/injects `tenantId` on every model
 * operation. When multi-tenant mode is disabled the extension is a pass-through.
 */
export function applyTenantExtension<T extends PrismaClient>(prisma: T): T {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }: { operation: string; args: Record<string, any>; query: (args: any) => Promise<any> }) {
          if (!isMultiTenantEnabled()) {
            return query(args);
          }
          const tenantId = resolveTenantIdForQuery();
          const scopedArgs = applyTenantToArgs(operation, args as Record<string, any>, tenantId);
          return query(scopedArgs);
        },
      },
    },
  }) as unknown as T;
}
