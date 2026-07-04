/**
 * Shared E2E fixtures: mock data, page objects, and route helpers.
 *
 * Import { test, expect } from './fixtures' in spec files to access the
 * extended fixtures. Mock data is centralised here so spec files stay
 * focused on user behaviour assertions.
 */

import { test as base, expect, type Page, type Route } from '@playwright/test';
import { endpoints } from './helpers/selectors';

// ─── Mock Data ─────────────────────────────────────────────────────────────

export const mockInventory = [
  {
    sku: 'SKU-001',
    productName: '蓝牙耳机 Pro',
    warehouse: '北京仓',
    quantity: 1200,
    safetyStock: 300,
    inTransit: 200,
    turnoverDays: 18,
    turnoverRate: 5.2,
    stockStatus: 'healthy',
    abcClass: 'A',
    aging: { '0-30天': 800, '31-60天': 300, '61-90天': 100, '90+天': 0 },
  },
  {
    sku: 'SKU-002',
    productName: '无线充电器',
    warehouse: '上海仓',
    quantity: 80,
    safetyStock: 200,
    inTransit: 0,
    turnoverDays: 45,
    turnoverRate: 1.1,
    stockStatus: 'critical',
    abcClass: 'B',
    aging: { '0-30天': 20, '31-60天': 30, '61-90天': 30, '90+天': 0 },
  },
  {
    sku: 'SKU-003',
    productName: 'USB-C 数据线',
    warehouse: '深圳仓',
    quantity: 5000,
    safetyStock: 500,
    inTransit: 1000,
    turnoverDays: 8,
    turnoverRate: 12.5,
    stockStatus: 'overstock',
    abcClass: 'A',
    aging: { '0-30天': 1000, '31-60天': 1500, '61-90天': 1500, '90+天': 1000 },
  },
  {
    sku: 'SKU-004',
    productName: '智能手环',
    warehouse: '北京仓',
    quantity: 280,
    safetyStock: 300,
    inTransit: 50,
    turnoverDays: 22,
    turnoverRate: 3.8,
    stockStatus: 'warning',
    abcClass: 'B',
    aging: { '0-30天': 150, '31-60天': 80, '61-90天': 50, '90+天': 0 },
  },
];

export const mockInventoryHealthSummary = {
  total: 4,
  healthy: 1,
  warning: 1,
  critical: 1,
  overstock: 1,
  healthScore: 72,
  totalValue: 1280000,
  currency: 'CNY',
};

export const mockSuppliers = {
  suppliers: [
    {
      id: 'sup-001',
      code: 'SUP-A001',
      name: '华东电子元件厂',
      contact: '张经理',
      email: 'zhang@huadong.cn',
      phone: '13800138001',
      region: '华东',
      category: '电子元件',
      leadTime: 14,
      rating: 4.5,
      status: 'active',
    },
    {
      id: 'sup-002',
      code: 'SUP-B002',
      name: '深圳精密模具有限公司',
      contact: '李工',
      email: 'li@sz-mold.com',
      phone: '13900139002',
      region: '华南',
      category: '模具',
      leadTime: 21,
      rating: 4.2,
      status: 'active',
    },
    {
      id: 'sup-003',
      code: 'SUP-C003',
      name: '北方塑料原料供应商',
      contact: '王总',
      email: 'wang@northplas.cn',
      phone: '13700137003',
      region: '华北',
      category: '原材料',
      leadTime: 10,
      rating: 3.8,
      status: 'suspended',
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 3, totalPages: 1 },
};

export const mockSupplierPerformance = {
  suppliers: [
    {
      code: 'SUP-A001',
      name: '华东电子元件厂',
      riskLevel: 'low',
      leadTime: 14,
      metrics: {
        onTimeDeliveryRate: 95,
        qualityScore: 92,
        overallScore: 88,
        leadTimeConsistency: 90,
        responseTime: 85,
        flexibility: 80,
      },
      recommendation: '保持合作',
    },
    {
      code: 'SUP-B002',
      name: '深圳精密模具有限公司',
      riskLevel: 'medium',
      leadTime: 21,
      metrics: {
        onTimeDeliveryRate: 82,
        qualityScore: 78,
        overallScore: 75,
        leadTimeConsistency: 70,
        responseTime: 72,
        flexibility: 68,
      },
      recommendation: '关注交货期',
    },
  ],
};

export const mockSupplierDetail = {
  id: 'sup-001',
  code: 'SUP-A001',
  name: '华东电子元件厂',
  contact: '张经理',
  email: 'zhang@huadong.cn',
  phone: '13800138001',
  region: '华东',
  category: '电子元件',
  leadTime: 14,
  rating: 4.5,
  status: 'active',
  ratingDetails: {
    deliveryScore: 92,
    qualityScore: 90,
    priceScore: 85,
    communicationScore: 88,
  },
};

export const mockReports = {
  'inventory-report': {
    summary: { totalSkus: 4, totalValue: 1280000, currency: 'CNY' },
    items: mockInventory,
  },
  'cost-report': {
    summary: { totalCost: 980000, currency: 'CNY', savings: 45000 },
    categories: [
      { name: '原材料', value: 420000 },
      { name: '物流', value: 180000 },
      { name: '仓储', value: 120000 },
    ],
  },
  'supplier-report': {
    summary: { totalSuppliers: 3, avgRating: 4.17 },
    suppliers: mockSupplierPerformance.suppliers,
  },
  'full-report': {
    generatedAt: '2026-06-18T00:00:00.000Z',
    inventory: { totalSkus: 4, totalValue: 1280000 },
    cost: { totalCost: 980000 },
    suppliers: { totalSuppliers: 3 },
  },
};

export const mockBillingSubscription = {
  subscription: {
    id: 'sub_123',
    tenantId: 'default',
    plan: 'starter',
    status: 'active',
    currentPeriodStart: '2026-06-01T00:00:00.000Z',
    currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
  },
  plans: [
    { id: 'free', name: 'Free', monthlyPrice: 0, description: '适合个人试用' },
    { id: 'starter', name: 'Starter', monthlyPrice: 49, description: '适合小型团队' },
    { id: 'pro', name: 'Pro', monthlyPrice: 199, description: '适合成长型企业' },
    { id: 'enterprise', name: 'Enterprise', monthlyPrice: 0, description: '适合大型企业' },
  ],
};

export const mockBillingUsage = {
  period: '2026-06',
  stats: {
    apiCalls: { used: 12500, limit: 50000, percentage: 25 },
    tools: { used: 320, limit: 500, percentage: 64 },
    storage: { used: 45, limit: 90, percentage: 50 },
    users: { used: 3, limit: 5, percentage: 60 },
  },
};

export const mockBillingPortal = {
  url: 'https://billing.stripe.com/session/portal_123',
};

export const mockBillingCheckout = {
  sessionId: 'cs_test_123',
  url: 'https://checkout.stripe.com/c/cs_test_123',
};

// ─── SSE Chat Mock ─────────────────────────────────────────────────────────

/**
 * Build a fake SSE response body for /api/chat that streams a few tokens,
 * emits a tool_call event, then a done event. Mirrors the real route's
 * event format (event: <name>\ndata: <json>\n\n).
 */
export function buildChatSseBody(opts?: {
  content?: string;
  tool?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: string;
}): string {
  const content = opts?.content ?? '已为你完成库存健康检查。当前 4 个 SKU 中，1 个健康、1 个预警、1 个紧急、1 个积压。建议优先补货 SKU-002。';
  const tool = opts?.tool ?? 'inventory_health_check';
  const toolParams = opts?.toolParams ?? { warehouse: 'all' };
  const toolResult = opts?.toolResult ?? JSON.stringify(mockInventoryHealthSummary);

  const events: Array<[string, unknown]> = [
    ['thinking', { status: 'context' }],
    ['thinking', { status: 'classifying' }],
    ['thinking', { status: 'planning' }],
    ['tool_call', { tool, params: toolParams }],
    ['tool_result', { tool, result: toolResult }],
    ['token', { content: content.slice(0, 20) }],
    ['token', { content: content.slice(20) }],
    ['done', { content, tokens: { input: 120, output: 80 } }],
  ];

  return events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

// ─── Route Mocking Helpers ─────────────────────────────────────────────────

/**
 * Intercept and mock an API GET endpoint with JSON payload.
 * Returns the route handler so callers can extend behaviour if needed.
 */
export async function mockGetApi(
  page: Page,
  url: string | RegExp,
  payload: unknown,
  status = 200,
): Promise<Route> {
  let captured: Route | undefined;
  await page.route(url, async (route) => {
    captured = route;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
  // The route handler is registered; return a placeholder. Playwright's
  // page.route doesn't expose the handler, so we return undefined cast.
  return captured as unknown as Route;
}

/** Mock the chat SSE endpoint with a streaming body. */
export async function mockChatSse(page: Page, body?: string): Promise<void> {
  await page.route(endpoints.chat, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: body ?? buildChatSseBody(),
      headers: { 'cache-control': 'no-cache', connection: 'keep-alive' },
    });
  });
}

/** Mock the full inventory API surface used by the inventory tab. */
export async function mockInventoryApi(page: Page): Promise<void> {
  await page.route(new RegExp(`${endpoints.inventory}(\\?|$)`), async (route) => {
    const url = route.request().url();
    if (url.includes('action=health')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockInventoryHealthSummary }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: mockInventory, total: mockInventory.length } }),
    });
  });
}

/** Mock the suppliers + supplier-performance endpoints. */
export async function mockSupplierApi(page: Page): Promise<void> {
  await page.route(new RegExp(`${endpoints.suppliers}(\\?|$)`), async (route) => {
    const url = route.request().url();
    if (url.includes('action=performance')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSupplierPerformance),
      });
      return;
    }
    if (url.includes('action=detail')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSupplierDetail),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSuppliers),
    });
  });

  await page.route(endpoints.supplierPerformance, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSupplierPerformance),
    });
  });
}

/** Mock the analytics / reports endpoints. */
export async function mockReportsApi(page: Page): Promise<void> {
  await page.route(new RegExp(`${endpoints.analytics}(\\?|$)`), async (route) => {
    const url = route.request().url();
    let payload: unknown = { success: true, data: mockReports['full-report'] };
    if (url.includes('inventory-report') || url.includes('inventory_report')) {
      payload = mockReports['inventory-report'];
    } else if (url.includes('cost-report') || url.includes('cost_report')) {
      payload = mockReports['cost-report'];
    } else if (url.includes('supplier-report') || url.includes('supplier_report')) {
      payload = mockReports['supplier-report'];
    } else if (url.includes('full-report')) {
      payload = mockReports['full-report'];
    } else if (url.includes('supplier-performance')) {
      payload = mockSupplierPerformance;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  // /api/reports delegates to /api/analytics but mock it explicitly too.
  await page.route(new RegExp(`${endpoints.reports}(\\?|$)`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReports['full-report']),
    });
  });
}

/** Mock the export endpoint. */
export async function mockExportApi(page: Page): Promise<void> {
  await page.route(new RegExp(`${endpoints.export}(\\?|$)`), async (route) => {
    const url = route.request().url();
    const isJson = url.includes('format=json');
    if (isJson) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reportType: 'inventory_report', data: mockInventory }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'SKU,产品名称,仓库,数量\nSKU-001,蓝牙耳机 Pro,北京仓,1200\n',
      });
    }
  });
}

/** Mock all billing endpoints. */
export async function mockBillingApi(page: Page): Promise<void> {
  await page.route(endpoints.billingSubscription, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockBillingSubscription }),
      });
    } else if (method === 'PATCH') {
      const body = route.request().postDataJSON() as { plan?: string };
      const updated = {
        ...mockBillingSubscription.subscription,
        plan: body?.plan ?? 'pro',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: updated }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockBillingSubscription.subscription }),
      });
    }
  });

  await page.route(endpoints.billingUsage, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockBillingUsage }),
    });
  });

  await page.route(endpoints.billingPortal, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockBillingPortal }),
    });
  });

  await page.route(endpoints.billingCheckout, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockBillingCheckout }),
    });
  });
}

// ─── Page Objects ──────────────────────────────────────────────────────────

/** Page object for the main navigation between Chat / Audit / Legacy views. */
export class Navigation {
  constructor(private readonly page: Page) {}

  async gotoHome(timeout = 15000): Promise<void> {
    await this.page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout });
    // Allow React hydration + initial data fetch
    await this.page.waitForTimeout(1500);
  }

  async switchToChat(): Promise<void> {
    await this.page.click('button:has-text("Chat")');
    await this.page.waitForTimeout(500);
  }

  async switchToAudit(): Promise<void> {
    await this.page.click('button:has-text("审计")');
    await this.page.waitForTimeout(500);
  }

  async switchToLegacy(): Promise<void> {
    await this.page.click('button:has-text("数据面板")');
    await this.page.waitForTimeout(800);
  }

  async switchToLegacyTab(tabLabel: string): Promise<void> {
    await this.switchToLegacy();
    await this.page.click(`button:has-text("${tabLabel}")`);
    await this.page.waitForTimeout(1000);
  }
}

/** Page object for the Chat panel. */
export class ChatPanelPage {
  constructor(private readonly page: Page) {}

  async sendMessage(text: string): Promise<void> {
    const input = this.page.locator('[data-testid="chat-input"]').first();
    await input.fill(text);
    await this.page.keyboard.press('Enter');
  }

  async clickQuickAction(label: string): Promise<void> {
    await this.page.click(`button:has-text("${label}")`);
  }

  async waitForResponse(timeout = 15000): Promise<void> {
    // Wait for typing indicator to appear then disappear
    await this.page.waitForSelector('[data-testid="typing-indicator"]', { state: 'visible', timeout }).catch(() => {});
    await this.page.waitForSelector('[data-testid="typing-indicator"]', { state: 'hidden', timeout }).catch(() => {});
    await this.page.waitForTimeout(800);
  }

  getMessageCount(): Promise<number> {
    return this.page.locator('[data-testid="chat-message"]').count();
  }

  getLastMessageText(): Promise<string | null> {
    return this.page.locator('[data-testid="chat-message"]').last().textContent();
  }
}

// ─── Extended Test Fixture ─────────────────────────────────────────────────

/**
 * Extended Playwright test fixture exposing page objects and mock helpers.
 * Spec files import { test, expect } from '../fixtures' to use them.
 */
export const test = base.extend<{
  navigation: Navigation;
  chatPanel: ChatPanelPage;
  mockData: {
    inventory: typeof mockInventory;
    suppliers: typeof mockSuppliers;
    supplierPerformance: typeof mockSupplierPerformance;
    reports: typeof mockReports;
    billing: typeof mockBillingSubscription;
    billingUsage: typeof mockBillingUsage;
  };
}>({
  navigation: async ({ page }, use) => {
    await use(new Navigation(page));
  },
  chatPanel: async ({ page }, use) => {
    await use(new ChatPanelPage(page));
  },
  mockData: async ({}, use) => {
    await use({
      inventory: mockInventory,
      suppliers: mockSuppliers,
      supplierPerformance: mockSupplierPerformance,
      reports: mockReports,
      billing: mockBillingSubscription,
      billingUsage: mockBillingUsage,
    });
  },
});

export { expect };
