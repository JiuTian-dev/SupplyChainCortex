/**
 * Tenant Context Management
 *
 * Uses AsyncLocalStorage to propagate the active tenant id through the
 * asynchronous call chain without passing it explicitly to every function.
 *
 * When MULTI_TENANT_ENABLED is not "true", the context falls back to the
 * default tenant id ("default") so existing single-tenant code keeps working.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The default tenant id used when no tenant context is active.
 *
 * Reads the `DEFAULT_TENANT_ID` env var so operators can align the default
 * tenant with the row seeded in the `tenants` table (e.g. a stable UUID).
 * Falls back to the literal `'default'` for backward compatibility with
 * existing single-tenant deployments that never set the env var.
 *
 * NOTE: this is evaluated lazily inside a getter so that test suites which
 * mutate `process.env.DEFAULT_TENANT_ID` (or rely on the fallback) always
 * observe the current value. Exporting the value directly would capture it
 * at module-load time and miss later env changes.
 */
export function getDefaultTenantId(): string {
  return process.env.DEFAULT_TENANT_ID || 'default';
}

export const DEFAULT_TENANT_ID = getDefaultTenantId();

const tenantStorage = new AsyncLocalStorage<string | null>();

/** Error thrown when a tenant context is required but missing. */
export class TenantContextError extends Error {
  constructor(message = 'Tenant context is required but not set') {
    super(message);
    this.name = 'TenantContextError';
  }
}

/**
 * TenantContext — static facade over the AsyncLocalStorage-backed store.
 *
 * Provides both a class API (TenantContext.set / .get) and module-level
 * function exports (setTenantContext / getTenantContext / …) so callers can
 * use whichever style they prefer.
 */
export class TenantContext {
  /** Set the tenant id for the current async execution context. */
  static set(tenantId: string): void {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new TenantContextError('tenantId must be a non-empty string');
    }
    tenantStorage.enterWith(tenantId);
  }

  /** Get the current tenant id, or null when none is set. */
  static get(): string | null {
    return tenantStorage.getStore() ?? null;
  }

  /** Get the current tenant id, throwing if it is missing. */
  static require(): string {
    const id = tenantStorage.getStore();
    if (!id) {
      throw new TenantContextError();
    }
    return id;
  }

  /** Clear the tenant id for the current async execution context. */
  static clear(): void {
    tenantStorage.enterWith(null);
  }

  /** Returns true when a tenant context is active. */
  static isSet(): boolean {
    return tenantStorage.getStore() != null;
  }

  /**
   * Run `fn` inside an isolated tenant context. The context is scoped to the
   * callback and does not leak to sibling async operations.
   */
  static async run<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return tenantStorage.run(tenantId, fn);
  }
}

/** Set the tenant id for the current async execution context. */
export function setTenantContext(tenantId: string): void {
  TenantContext.set(tenantId);
}

/** Get the current tenant id, or null when none is set. */
export function getTenantContext(): string | null {
  return TenantContext.get();
}

/** Get the current tenant id, throwing if it is missing. */
export function requireTenantContext(): string {
  return TenantContext.require();
}

/** Clear the tenant id for the current async execution context. */
export function clearTenantContext(): void {
  TenantContext.clear();
}

/**
 * Run `fn` inside an isolated tenant context. The context is scoped to the
 * callback and does not leak to sibling async operations.
 */
export async function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContext.run(tenantId, fn);
}

/**
 * Resolve the effective tenant id for the current context.
 *
 * - When multi-tenant mode is disabled, always returns the default tenant.
 * - When enabled, returns the active context tenant or the default fallback.
 */
export function getEffectiveTenantId(): string {
  if (!isMultiTenantEnabled()) {
    return DEFAULT_TENANT_ID;
  }
  return getTenantContext() ?? DEFAULT_TENANT_ID;
}

/** Whether multi-tenant mode is enabled via the MULTI_TENANT_ENABLED env var. */
export function isMultiTenantEnabled(): boolean {
  return process.env.MULTI_TENANT_ENABLED === 'true';
}
