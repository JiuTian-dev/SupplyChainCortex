/**
 * Multi-Tenant Module Tests
 *
 * Covers:
 *  - TenantContext (AsyncLocalStorage-backed set/get/require/clear/run)
 *  - Prisma extension (auto-inject tenantId into where/data)
 *  - Tenant middleware (header/JWT extraction, validation, response header)
 *  - Tenant management service (CRUD)
 *  - Cross-tenant isolation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.mock factories run before imports, so the mock fns must be
// defined with vi.hoisted to be available inside the factory.
// ---------------------------------------------------------------------------
const {
  mockTenantFindUnique,
  mockTenantFindMany,
  mockTenantCreate,
  mockTenantUpdate,
} = vi.hoisted(() => ({
  mockTenantFindUnique: vi.fn(),
  mockTenantFindMany: vi.fn(),
  mockTenantCreate: vi.fn(),
  mockTenantUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    tenants: {
      findUnique: mockTenantFindUnique,
      findMany: mockTenantFindMany,
      create: mockTenantCreate,
      update: mockTenantUpdate,
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------
import {
  TenantContext,
  TenantContextError,
  setTenantContext,
  getTenantContext,
  requireTenantContext,
  clearTenantContext,
  runWithTenant,
  getEffectiveTenantId,
  isMultiTenantEnabled,
  DEFAULT_TENANT_ID,
} from './context';
import {
  injectTenantFilter,
  injectTenantCreate,
  applyTenantToArgs,
  applyTenantExtension,
  resolveTenantIdForQuery,
} from './prisma-extension';
import {
  withTenant,
  resolveTenantId,
  validateTenant,
} from './middleware';
import {
  createTenant,
  getTenant,
  getTenantBySlug,
  updateTenant,
  deactivateTenant,
  listTenants,
  ensureDefaultTenant,
} from '@/lib/services/tenant.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ORIGINAL_ENV = { ...process.env };

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { headers });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TenantContext', () => {
  beforeEach(() => {
    clearTenantContext();
    setEnv('MULTI_TENANT_ENABLED', undefined);
  });
  afterEach(() => {
    clearTenantContext();
    process.env = { ...ORIGINAL_ENV };
  });

  it('get returns null when no context is set', () => {
    expect(getTenantContext()).toBeNull();
    expect(TenantContext.get()).toBeNull();
  });

  it('set and get round-trips the tenant id', () => {
    setTenantContext('tenant-001');
    expect(getTenantContext()).toBe('tenant-001');
    expect(TenantContext.get()).toBe('tenant-001');
  });

  it('require throws TenantContextError when not set', () => {
    expect(() => requireTenantContext()).toThrow(TenantContextError);
    expect(() => TenantContext.require()).toThrow(TenantContextError);
  });

  it('require returns the tenant id when set', () => {
    setTenantContext('tenant-002');
    expect(requireTenantContext()).toBe('tenant-002');
  });

  it('clear removes the tenant context', () => {
    setTenantContext('tenant-003');
    expect(getTenantContext()).toBe('tenant-003');
    clearTenantContext();
    expect(getTenantContext()).toBeNull();
  });

  it('set throws on empty or non-string tenant id', () => {
    expect(() => setTenantContext('')).toThrow(TenantContextError);
    // @ts-expect-error — testing runtime guard against non-strings
    expect(() => setTenantContext(null)).toThrow(TenantContextError);
  });

  it('isSet returns true when context active, false otherwise', () => {
    expect(TenantContext.isSet()).toBe(false);
    setTenantContext('tenant-004');
    expect(TenantContext.isSet()).toBe(true);
  });

  it('run scopes the context to the callback only', async () => {
    expect(getTenantContext()).toBeNull();
    const inner = await runWithTenant('scoped-tenant', async () => {
      return getTenantContext();
    });
    expect(inner).toBe('scoped-tenant');
    // After run completes, the outer context is unaffected.
    expect(getTenantContext()).toBeNull();
  });

  it('run does not leak context to sibling async operations', async () => {
    const results = await Promise.all([
      runWithTenant('tenant-a', async () => getTenantContext()),
      runWithTenant('tenant-b', async () => getTenantContext()),
    ]);
    expect(results).toEqual(['tenant-a', 'tenant-b']);
  });

  it('getEffectiveTenantId returns default when multi-tenant disabled', () => {
    setEnv('MULTI_TENANT_ENABLED', undefined);
    expect(getEffectiveTenantId()).toBe(DEFAULT_TENANT_ID);
  });

  it('getEffectiveTenantId returns context tenant when multi-tenant enabled', () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    setTenantContext('tenant-005');
    expect(getEffectiveTenantId()).toBe('tenant-005');
  });

  it('getEffectiveTenantId falls back to default when enabled but no context', () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    expect(getEffectiveTenantId()).toBe(DEFAULT_TENANT_ID);
  });

  it('isMultiTenantEnabled reflects the env var', () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    expect(isMultiTenantEnabled()).toBe(true);
    setEnv('MULTI_TENANT_ENABLED', 'false');
    expect(isMultiTenantEnabled()).toBe(false);
    setEnv('MULTI_TENANT_ENABLED', undefined);
    expect(isMultiTenantEnabled()).toBe(false);
  });
});

describe('Prisma Extension — pure helpers', () => {
  it('injectTenantFilter adds a where clause when none exists', () => {
    const result = injectTenantFilter({ select: { id: true } }, 't1') as any;
    expect(result.where).toEqual({ tenantId: 't1' });
    expect(result.select).toEqual({ id: true });
  });

  it('injectTenantFilter merges with an existing where clause', () => {
    const result = injectTenantFilter({ where: { sku: 'ABC' } }, 't1');
    expect(result.where).toEqual({ sku: 'ABC', tenantId: 't1' });
  });

  it('injectTenantFilter handles undefined args', () => {
    const result = injectTenantFilter(undefined, 't1');
    expect(result.where).toEqual({ tenantId: 't1' });
  });

  it('injectTenantCreate injects tenantId into data', () => {
    const result = injectTenantCreate({ data: { name: 'Widget' } }, 't1');
    expect(result.data).toEqual({ name: 'Widget', tenantId: 't1' });
  });

  it('injectTenantCreate handles batch (array) data', () => {
    const result = injectTenantCreate(
      { data: [{ name: 'A' }, { name: 'B' }] },
      't1',
    );
    expect(result.data).toEqual([
      { name: 'A', tenantId: 't1' },
      { name: 'B', tenantId: 't1' },
    ]);
  });

  it('applyTenantToArgs filters findMany', () => {
    const result = applyTenantToArgs('findMany', { where: { sku: 'X' } }, 't1');
    expect(result.where).toEqual({ sku: 'X', tenantId: 't1' });
  });

  it('applyTenantToArgs injects data on create', () => {
    const result = applyTenantToArgs('create', { data: { name: 'N' } }, 't1') as any;
    expect(result.data).toEqual({ name: 'N', tenantId: 't1' });
    // create should NOT add a where clause
    expect(result.where).toBeUndefined();
  });

  it('applyTenantToArgs filters update without injecting data', () => {
    const result = applyTenantToArgs('update', { where: { id: '1' }, data: { name: 'N' } }, 't1');
    expect(result.where).toEqual({ id: '1', tenantId: 't1' });
    // update data should be untouched (no tenantId added)
    expect(result.data).toEqual({ name: 'N' });
  });

  it('applyTenantToArgs filters delete', () => {
    const result = applyTenantToArgs('delete', { where: { id: '1' } }, 't1');
    expect(result.where).toEqual({ id: '1', tenantId: 't1' });
  });

  it('applyTenantToArgs handles upsert (where + create)', () => {
    const result = applyTenantToArgs(
      'upsert',
      { where: { id: '1' }, create: { name: 'N' }, update: { name: 'N2' } },
      't1',
    );
    expect(result.where).toEqual({ id: '1', tenantId: 't1' });
    expect(result.create).toEqual({ name: 'N', tenantId: 't1' });
  });

  it('applyTenantToArgs injects data on createMany (batch)', () => {
    const result = applyTenantToArgs(
      'createMany',
      { data: [{ a: 1 }, { a: 2 }] },
      't1',
    );
    expect(result.data).toEqual([
      { a: 1, tenantId: 't1' },
      { a: 2, tenantId: 't1' },
    ]);
  });

  it('applyTenantToArgs leaves unrelated operations untouched', () => {
    const args = { foo: 'bar' };
    const result = applyTenantToArgs('aggregateRaw', args, 't1');
    expect(result).toBe(args);
  });
});

describe('Prisma Extension — applyTenantExtension', () => {
  beforeEach(() => {
    clearTenantContext();
    setEnv('MULTI_TENANT_ENABLED', undefined);
  });
  afterEach(() => {
    clearTenantContext();
    process.env = { ...ORIGINAL_ENV };
  });

  it('is a no-op (passes args through) when multi-tenant disabled', async () => {
    const capturedQuery = vi.fn().mockResolvedValue('result');
    let capturedExtension: any;
    const mockPrisma = {
      $extends(ext: any) {
        capturedExtension = ext;
        return {};
      },
    };

    applyTenantExtension(mockPrisma as any);
    const handler = capturedExtension.query.$allModels.$allOperations;

    await handler({
      model: 'Product',
      operation: 'findMany',
      args: { where: { sku: 'ABC' } },
      query: capturedQuery,
    });

    // When disabled, args are passed through unmodified.
    expect(capturedQuery).toHaveBeenCalledWith({ where: { sku: 'ABC' } });
  });

  it('injects tenantId into where when multi-tenant enabled', async () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    setTenantContext('tenant-ext-1');

    const capturedQuery = vi.fn().mockResolvedValue('result');
    let capturedExtension: any;
    const mockPrisma = {
      $extends(ext: any) {
        capturedExtension = ext;
        return {};
      },
    };

    applyTenantExtension(mockPrisma as any);
    const handler = capturedExtension.query.$allModels.$allOperations;

    await handler({
      model: 'Product',
      operation: 'findMany',
      args: { where: { sku: 'ABC' } },
      query: capturedQuery,
    });

    expect(capturedQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sku: 'ABC', tenantId: 'tenant-ext-1' }),
      }),
    );
  });

  it('injects tenantId into create data when enabled', async () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    setTenantContext('tenant-ext-2');

    const capturedQuery = vi.fn().mockResolvedValue('result');
    let capturedExtension: any;
    const mockPrisma = {
      $extends(ext: any) {
        capturedExtension = ext;
        return {};
      },
    };

    applyTenantExtension(mockPrisma as any);
    const handler = capturedExtension.query.$allModels.$allOperations;

    await handler({
      model: 'Product',
      operation: 'create',
      args: { data: { name: 'Widget' } },
      query: capturedQuery,
    });

    expect(capturedQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Widget', tenantId: 'tenant-ext-2' }),
      }),
    );
  });

  it('resolveTenantIdForQuery falls back to default when no context', () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    clearTenantContext();
    expect(resolveTenantIdForQuery()).toBe(DEFAULT_TENANT_ID);
  });
});

describe('Tenant Middleware', () => {
  beforeEach(() => {
    clearTenantContext();
    setEnv('MULTI_TENANT_ENABLED', undefined);
    vi.clearAllMocks();
  });
  afterEach(() => {
    clearTenantContext();
    process.env = { ...ORIGINAL_ENV };
  });

  it('resolveTenantId returns default when multi-tenant disabled', () => {
    const req = makeRequest({ 'x-tenant-id': 't1' });
    expect(resolveTenantId(req)).toBe(DEFAULT_TENANT_ID);
  });

  it('resolveTenantId reads X-Tenant-Id header when enabled', () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    const req = makeRequest({ 'x-tenant-id': 'header-tenant' });
    expect(resolveTenantId(req)).toBe('header-tenant');
  });

  it('resolveTenantId falls back to default when header missing', () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    const req = makeRequest();
    expect(resolveTenantId(req)).toBe(DEFAULT_TENANT_ID);
  });

  it('resolveTenantId extracts tenantId from JWT bearer token', () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    const token = makeJwt({ tenantId: 'jwt-tenant' });
    const req = makeRequest({ authorization: `Bearer ${token}` });
    expect(resolveTenantId(req)).toBe('jwt-tenant');
  });

  it('resolveTenantId prefers header over JWT', () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    const token = makeJwt({ tenantId: 'jwt-tenant' });
    const req = makeRequest({
      'x-tenant-id': 'header-tenant',
      authorization: `Bearer ${token}`,
    });
    expect(resolveTenantId(req)).toBe('header-tenant');
  });

  it('resolveTenantId ignores malformed JWT', () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    const req = makeRequest({ authorization: 'Bearer not.a.valid' });
    expect(resolveTenantId(req)).toBe(DEFAULT_TENANT_ID);
  });

  it('validateTenant returns true for default tenant', async () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    expect(await validateTenant(DEFAULT_TENANT_ID)).toBe(true);
  });

  it('validateTenant returns true when multi-tenant disabled', async () => {
    setEnv('MULTI_TENANT_ENABLED', undefined);
    expect(await validateTenant('any-tenant')).toBe(true);
  });

  it('validateTenant returns true for active tenant', async () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    mockTenantFindUnique.mockResolvedValue({ id: 't1', status: 'active' });
    expect(await validateTenant('t1')).toBe(true);
    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: { id: true, status: true },
    });
  });

  it('validateTenant returns false for inactive tenant', async () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    mockTenantFindUnique.mockResolvedValue({ id: 't2', status: 'inactive' });
    expect(await validateTenant('t2')).toBe(false);
  });

  it('validateTenant returns false for non-existent tenant', async () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    mockTenantFindUnique.mockResolvedValue(null);
    expect(await validateTenant('ghost')).toBe(false);
  });

  it('withTenant sets context and adds X-Tenant-Id response header', async () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    mockTenantFindUnique.mockResolvedValue({ id: 't1', status: 'active' });

    const handler = vi.fn(async (_req: Request, ctx: { tenantId: string }) => {
      // Inside the handler the tenant context should be active.
      expect(getTenantContext()).toBe('t1');
      return new Response(JSON.stringify({ ok: true, tenantId: ctx.tenantId }), {
        headers: { 'content-type': 'application/json' },
      });
    });

    const wrapped = withTenant(handler);
    const req = makeRequest({ 'x-tenant-id': 't1' });
    const res = await wrapped(req);

    expect(res.headers.get('x-tenant-id')).toBe('t1');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('withTenant returns 403 for inactive tenant', async () => {
    setEnv('MULTI_TENANT_ENABLED', 'true');
    mockTenantFindUnique.mockResolvedValue({ id: 't2', status: 'inactive' });

    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withTenant(handler);
    const req = makeRequest({ 'x-tenant-id': 't2' });
    const res = await wrapped(req);

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('withTenant uses default tenant when multi-tenant disabled (no validation)', async () => {
    setEnv('MULTI_TENANT_ENABLED', undefined);
    const handler = vi.fn(async (_req: Request, ctx: { tenantId: string }) => {
      return new Response(ctx.tenantId);
    });
    const wrapped = withTenant(handler);
    const res = await wrapped(makeRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get('x-tenant-id')).toBe(DEFAULT_TENANT_ID);
    expect(await res.text()).toBe(DEFAULT_TENANT_ID);
  });
});

describe('Tenant Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createTenant calls db.tenants.create with defaults', async () => {
    const created = { id: 't1', name: 'Acme', slug: 'acme', plan: 'starter', status: 'active', createdAt: new Date(), updatedAt: new Date() };
    mockTenantCreate.mockResolvedValue(created);

    const result = await createTenant({ name: 'Acme', slug: 'acme' });
    expect(result).toEqual(created);
    expect(mockTenantCreate).toHaveBeenCalledWith({
      data: { name: 'Acme', slug: 'acme', plan: 'starter', status: 'active' },
      select: expect.objectContaining({ id: true, name: true, slug: true }),
    });
  });

  it('createTenant honours explicit plan and status', async () => {
    mockTenantCreate.mockResolvedValue({ id: 't2' });
    await createTenant({ name: 'Pro', slug: 'pro', plan: 'pro', status: 'suspended' });
    expect(mockTenantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: 'pro', status: 'suspended' }),
      }),
    );
  });

  it('getTenant calls findUnique by id', async () => {
    mockTenantFindUnique.mockResolvedValue({ id: 't1', name: 'Acme' });
    const result = await getTenant('t1');
    expect(result).toEqual({ id: 't1', name: 'Acme' });
    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: expect.any(Object),
    });
  });

  it('getTenant returns null when not found', async () => {
    mockTenantFindUnique.mockResolvedValue(null);
    const result = await getTenant('ghost');
    expect(result).toBeNull();
  });

  it('getTenantBySlug calls findUnique by slug', async () => {
    mockTenantFindUnique.mockResolvedValue({ id: 't1', slug: 'acme' });
    await getTenantBySlug('acme');
    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { slug: 'acme' },
      select: expect.any(Object),
    });
  });

  it('updateTenant calls update with provided fields', async () => {
    mockTenantUpdate.mockResolvedValue({ id: 't1', name: 'New' });
    await updateTenant('t1', { name: 'New' });
    expect(mockTenantUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { name: 'New' },
      select: expect.any(Object),
    });
  });

  it('deactivateTenant sets status to inactive', async () => {
    mockTenantUpdate.mockResolvedValue({ id: 't1', status: 'inactive' });
    await deactivateTenant('t1');
    expect(mockTenantUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'inactive' },
      select: expect.any(Object),
    });
  });

  it('listTenants calls findMany ordered by createdAt desc', async () => {
    const tenants = [{ id: 't1' }, { id: 't2' }];
    mockTenantFindMany.mockResolvedValue(tenants);
    const result = await listTenants();
    expect(result).toEqual(tenants);
    expect(mockTenantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('ensureDefaultTenant creates default when missing', async () => {
    mockTenantFindUnique.mockResolvedValue(null);
    mockTenantCreate.mockResolvedValue({ id: 'default' });
    const created = await ensureDefaultTenant();
    expect(created).toBe(true);
    expect(mockTenantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'default', slug: 'default' }),
      }),
    );
  });

  it('ensureDefaultTenant does nothing when default exists', async () => {
    mockTenantFindUnique.mockResolvedValue({ id: 'default' });
    const created = await ensureDefaultTenant();
    expect(created).toBe(false);
    expect(mockTenantCreate).not.toHaveBeenCalled();
  });
});

describe('Cross-Tenant Isolation', () => {
  beforeEach(() => {
    clearTenantContext();
    setEnv('MULTI_TENANT_ENABLED', 'true');
  });
  afterEach(() => {
    clearTenantContext();
    process.env = { ...ORIGINAL_ENV };
  });

  it('two concurrent contexts produce different tenant filters', async () => {
    const filters = await Promise.all([
      runWithTenant('tenant-x', async () =>
        applyTenantToArgs('findMany', { where: { sku: 'S' } }, resolveTenantIdForQuery()),
      ),
      runWithTenant('tenant-y', async () =>
        applyTenantToArgs('findMany', { where: { sku: 'S' } }, resolveTenantIdForQuery()),
      ),
    ]);

    expect(filters[0].where).toEqual({ sku: 'S', tenantId: 'tenant-x' });
    expect(filters[1].where).toEqual({ sku: 'S', tenantId: 'tenant-y' });
  });

  it('extension uses the context tenant, not a stale value', async () => {
    const seen: string[] = [];

    const mockPrisma = {
      $extends(ext: any) {
        const handler = ext.query.$allModels.$allOperations;
        return {
          async runOp(operation: string, args: any) {
            return handler({
              model: 'Product',
              operation,
              args,
              query: async (a: any) => {
                seen.push(a.where?.tenantId);
                return a;
              },
            });
          },
        };
      },
    };

    const extended = applyTenantExtension(mockPrisma as any);

    await runWithTenant('ctx-a', async () => {
      await (extended as any).runOp('findMany', { where: { sku: 'A' } });
    });
    await runWithTenant('ctx-b', async () => {
      await (extended as any).runOp('findMany', { where: { sku: 'B' } });
    });

    expect(seen).toEqual(['ctx-a', 'ctx-b']);
  });

  it('create operations are scoped to the active tenant', async () => {
    const result = await runWithTenant('creator-tenant', async () => {
      return applyTenantToArgs('create', { data: { name: 'N' } }, resolveTenantIdForQuery());
    });
    expect(result.data).toEqual({ name: 'N', tenantId: 'creator-tenant' });
  });

  it('delete is filtered so a tenant cannot delete another tenant rows', async () => {
    const result = await runWithTenant('deleter-tenant', async () => {
      return applyTenantToArgs('delete', { where: { id: 'some-id' } }, resolveTenantIdForQuery());
    });
    expect(result.where).toEqual({ id: 'some-id', tenantId: 'deleter-tenant' });
  });
});
