/**
 * Test utilities for component testing
 * Provides custom render with providers and mock data factories
 */
import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Custom Render with Providers ──────────────────────────────────────────────

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

// ─── Mock Data Factories ───────────────────────────────────────────────────────

export function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'admin@supply-chain.com',
    name: '测试管理员',
    role: 'admin',
    avatar: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    sku: 'SKU-001',
    name: '便携式咖啡机',
    category: '厨房电器',
    subCategory: '咖啡设备',
    unitCost: 199.99,
    sellingPrice: 399.99,
    weight: 2.5,
    origin: '中国',
    abcClass: 'A',
    fsnClass: 'F',
    topPlatform: 'Amazon',
    ...overrides,
  };
}

export function createMockInventory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    productId: 'prod-1',
    sku: 'SKU-001',
    productName: '便携式咖啡机',
    warehouse: '华东仓',
    quantity: 500,
    safetyStock: 100,
    reorderPoint: 150,
    inTransit: 50,
    turnoverRate: 3.5,
    turnoverDays: 45,
    stockStatus: 'healthy',
    lastSyncAt: new Date('2024-06-01'),
    ...overrides,
  };
}

export function createMockShipment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ship-1',
    trackingNumber: 'TN-2024-001',
    carrier: '顺丰速运',
    origin: '深圳',
    destination: '上海',
    status: 'in_transit',
    eta: '2024-07-15',
    progress: 60,
    events: [],
    ...overrides,
  };
}

export function createMockNote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    sku: 'SKU-001',
    author: 'Admin',
    content: '这是一个测试备注',
    category: 'general',
    priority: 'normal',
    isResolved: false,
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2024-06-01'),
    ...overrides,
  };
}

export function createMockSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sup-1',
    name: '东莞精密制造',
    category: '电子元器件',
    contactPerson: '张经理',
    email: 'zhang@dg-precision.com',
    phone: '138-0000-0001',
    leadTime: 14,
    status: 'active',
    rating: 4.5,
    ...overrides,
  };
}

// ─── Mock API Response Helper ──────────────────────────────────────────────────

export function createMockApiResponse<T>(data: T, success = true) {
  return {
    success,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function createMockPaginatedResponse<T>(items: T[], page = 1, pageSize = 20, total?: number) {
  return {
    success: true,
    data: items,
    pagination: {
      page,
      pageSize,
      total: total ?? items.length,
      totalPages: Math.ceil((total ?? items.length) / pageSize),
    },
    timestamp: new Date().toISOString(),
  };
}

// ─── Wait Helper ───────────────────────────────────────────────────────────────

/**
 * Wait for a condition to be true, polling every 50ms up to a timeout.
 * Useful for waiting for async state updates in tests.
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout = 3000
): Promise<void> {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!condition()) {
    throw new Error('Condition not met within timeout');
  }
}
