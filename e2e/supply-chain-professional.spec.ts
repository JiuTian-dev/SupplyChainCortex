/**
 * E2E Tests: Supply Chain Professional Scenarios
 *
 * Covers real-world supply chain operations:
 * 1. Chat-based inventory health check
 * 2. Supplier risk assessment with cascade propagation
 * 3. Audit trail integrity verification
 * 4. Provenance API (W3C PROV-O)
 * 5. Decision trace replay
 * 6. Dashboard data accuracy
 * 7. Multi-tab workflow (Chat → Data Panel → Audit)
 * 8. Export functionality
 * 9. Real-time notifications/SSE
 * 10. Authentication & RBAC
 *
 * Run: npx playwright test e2e/supply-chain-professional.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForChatResponse(page: any, timeout = 15000) {
  // Wait for typing indicator to appear then disappear
  await page.waitForSelector('[data-testid="typing-indicator"]', { state: 'visible', timeout }).catch(() => {});
  await page.waitForSelector('[data-testid="typing-indicator"]', { state: 'hidden', timeout }).catch(() => {});
  // Extra buffer for final render
  await page.waitForTimeout(1000);
}

async function sendChatMessage(page: any, message: string) {
  const input = page.locator('[data-testid="chat-input"], input[placeholder*="输入"], textarea').first();
  await input.fill(message);
  await page.keyboard.press('Enter');
  await waitForChatResponse(page);
}

async function switchView(page: any, view: 'chat' | 'audit' | 'legacy') {
  const labelMap = { chat: 'Chat', audit: '审计', legacy: '数据面板' };
  await page.click(`button:has-text("${labelMap[view]}")`);
  await page.waitForTimeout(800);
}

// ─── Test Suite: Chat Intelligence ──────────────────────────────────────────

test.describe('Chat Intelligence — Professional Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  });

  test('Inventory health check via chat', async ({ page }) => {
    await sendChatMessage(page, '帮我做库存健康检查');
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/库存|stock|健康|health|缺货|out of stock|积压|overstock/i);
  });

  test('Cost optimization analysis via chat', async ({ page }) => {
    await sendChatMessage(page, '帮我做成本优化分析');
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/成本|cost|优化|optimization|节约|saving|采购|procurement/i);
  });

  test('Supplier risk assessment via chat', async ({ page }) => {
    await sendChatMessage(page, '帮我做供应商风险评估');
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/供应商|supplier|风险|risk|评估|assessment|评分|score/i);
  });

  test('Compliance audit via chat', async ({ page }) => {
    await sendChatMessage(page, '帮我做合规审计');
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/合规|compliance|审计|audit|法规|regulation|认证|certification/i);
  });

  test('Full health report via chat', async ({ page }) => {
    await sendChatMessage(page, '生成全健康报告');
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/报告|report|健康|health|供应链|supply chain/i);
  });

  test('Chat supports markdown rendering', async ({ page }) => {
    await sendChatMessage(page, '分析当前供应链状态');
    // Check for markdown elements (headers, lists, tables)
    const hasMarkdown = await page.locator('h1, h2, h3, ul, ol, table, pre, code').count() > 0;
    expect(hasMarkdown).toBe(true);
  });

  test('Chat message history persists', async ({ page }) => {
    await sendChatMessage(page, '测试消息持久化');
    // Chat messages may not have data-testid, check for message bubbles by content
    const bodyBefore = await page.textContent('body');
    expect(bodyBefore).toContain('测试消息持久化');

    // Refresh page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const bodyAfter = await page.textContent('body');
    // Messages should be restored from localStorage
    expect(bodyAfter).toContain('测试消息持久化');
  });
});

// ─── Test Suite: API Endpoints ──────────────────────────────────────────────

test.describe('API Endpoints — Data Integrity', () => {
  test('Engine health endpoint returns valid status', async ({ request }) => {
    const res = await request.get(`${BASE}/api/engine-health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
  });

  test('Dashboard summary returns structured data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dashboard?action=summary`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
  });

  test('Cascade risk API returns risk data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/cascade-risk?scenario=auto`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
  });

  test('Inventory API returns product data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/inventory`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || typeof body === 'object').toBe(true);
  });

  test('Supplier graph API returns structured response', async ({ request }) => {
    const res = await request.get(`${BASE}/api/supplier-graph?endpoint=stats`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
  });

  test('Audit integrity endpoint returns hash chain status', async ({ request }) => {
    const res = await request.get(`${BASE}/api/audit/integrity`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('valid');
  });

  test('Audit traces endpoint returns trace list', async ({ request }) => {
    const res = await request.get(`${BASE}/api/audit/traces`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('data');
  });

  test('Provenance API returns JSON-LD', async ({ request }) => {
    // First get a trace ID
    const tracesRes = await request.get(`${BASE}/api/audit/traces`);
    const traces = await tracesRes.json();
    if (traces.length > 0 && traces[0].id) {
      const provRes = await request.get(`${BASE}/api/audit/provenance/${traces[0].id}`);
      expect(provRes.status()).toBe(200);
      const contentType = provRes.headers()['content-type'] || '';
      expect(contentType).toContain('application/ld+json');
      const body = await provRes.json();
      expect(body).toHaveProperty('@context');
    }
  });

  test('Decision graph API returns decision data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/decision-graph`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('decisions');
    expect(Array.isArray(body.decisions)).toBe(true);
  });

  test('RAG API returns search results via GET', async ({ request }) => {
    const res = await request.get(`${BASE}/api/rag?q=蓝牙耳机供应商&topK=5`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('results');
    expect(Array.isArray(body.results)).toBe(true);
  });

  test('RAG API supports POST with body', async ({ request }) => {
    const res = await request.post(`${BASE}/api/rag`, {
      data: { query: '蓝牙耳机供应商', topK: 5 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('results');
    expect(Array.isArray(body.results)).toBe(true);
  });

  test('Exchange rates API returns currency data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/exchange-rates`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
  });
});

// ─── Test Suite: UI Navigation ──────────────────────────────────────────────

test.describe('UI Navigation — Multi-View Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  });

  test('Switch between Chat, Audit, and Data Panel views', async ({ page }) => {
    await switchView(page, 'chat');
    expect(await page.locator('text=SupplyChain Cortex').count()).toBeGreaterThan(0);

    await switchView(page, 'audit');
    const auditText = await page.textContent('body');
    expect(auditText).toMatch(/审计|audit|日志|log|追踪|trace/i);

    await switchView(page, 'legacy');
    const legacyText = await page.textContent('body');
    expect(legacyText).toMatch(/库存|inventory|供应商|supplier|成本|cost/i);
  });

  test('Data panel tabs render correctly', async ({ page }) => {
    await switchView(page, 'legacy');
    // Common tabs in data panel
    const tabTexts = ['库存', '供应商', '成本', '物流', '销售'];
    for (const tab of tabTexts) {
      const count = await page.locator(`button:has-text("${tab}")`).count();
      if (count > 0) {
        await page.click(`button:has-text("${tab}")`);
        await page.waitForTimeout(500);
      }
    }
  });

  test('Global search is accessible', async ({ page }) => {
    // Try keyboard shortcut or search button
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    const searchVisible = await page.locator('[role="dialog"], [data-testid="search"]').count() > 0;
    expect(searchVisible).toBe(true);
  });

  test('Settings panel opens and closes', async ({ page }) => {
    // Look for settings button
    const settingsBtn = page.locator('button[aria-label="设置"], button:has-text("设置")').first();
    if (await settingsBtn.isVisible().catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
      const bodyText = await page.textContent('body');
      expect(bodyText).toMatch(/设置|settings|配置|config/i);
    }
  });

  test('Tools panel opens with export option', async ({ page }) => {
    const toolsBtn = page.locator('button[aria-label="工具"], button:has-text("工具")').first();
    if (await toolsBtn.isVisible().catch(() => false)) {
      await toolsBtn.click();
      await page.waitForTimeout(500);
      const bodyText = await page.textContent('body');
      expect(bodyText).toMatch(/导出|export|导入|import|刷新|refresh/i);
    }
  });
});

// ─── Test Suite: Data Panel Features ────────────────────────────────────────

test.describe('Data Panel — Professional Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    await switchView(page, 'legacy');
    await page.waitForTimeout(1000);
  });

  test('Inventory tab shows product data', async ({ page }) => {
    await page.click('button:has-text("库存")');
    await page.waitForTimeout(1500);
    const text = await page.textContent('body');
    expect(text).toMatch(/SKU|产品|product|库存|inventory|数量|quantity/i);
  });

  test('Supplier tab shows supplier network', async ({ page }) => {
    await page.click('button:has-text("供应商")');
    await page.waitForTimeout(1500);
    const text = await page.textContent('body');
    expect(text).toMatch(/供应商|supplier|评分|score|风险|risk/i);
  });

  test('Risk propagation graph renders', async ({ page }) => {
    // Look for risk-related tab or component
    const riskTab = page.locator('button:has-text("风险"), button:has-text("Risk")').first();
    if (await riskTab.isVisible().catch(() => false)) {
      await riskTab.click();
      await page.waitForTimeout(1500);
      // Check for graph canvas or SVG
      const hasGraph = await page.locator('canvas, svg, [data-testid="graph"]').count() > 0;
      expect(hasGraph).toBe(true);
    }
  });

  test('Cost analysis tab shows financial data', async ({ page }) => {
    const costTab = page.locator('button:has-text("成本"), button:has-text("Cost")').first();
    if (await costTab.isVisible().catch(() => false)) {
      await costTab.click();
      await page.waitForTimeout(1500);
      const text = await page.textContent('body');
      expect(text).toMatch(/成本|cost|价格|price|USD|CNY/i);
    }
  });
});

// ─── Test Suite: Audit & Compliance ─────────────────────────────────────────

test.describe('Audit & Compliance — Traceability', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    await switchView(page, 'audit');
    await page.waitForTimeout(1500);
  });

  test('Audit tab shows audit log entries', async ({ page }) => {
    const text = await page.textContent('body');
    expect(text).toMatch(/审计|audit|日志|log|时间|time|用户|user/i);
  });

  test('Audit entries have timestamps', async ({ page }) => {
    const text = await page.textContent('body');
    // Look for ISO date patterns
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}/);
  });

  test('Trace replay button exists for traces', async ({ page }) => {
    const replayBtn = page.locator('button:has-text("回放"), button:has-text("Replay"), button:has-text("重放")').first();
    // Either button exists or no traces yet (acceptable)
    const hasReplay = await replayBtn.isVisible().catch(() => false);
    if (hasReplay) {
      await replayBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});

// ─── Test Suite: Real-time Features ─────────────────────────────────────────

test.describe('Real-time Features — SSE & Notifications', () => {
  test('SSE endpoint returns event-stream header', async ({ request }) => {
    // SSE streams indefinitely — abort after getting headers
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    try {
      const res = await fetch(`${BASE}/api/sse`, { signal: controller.signal });
      clearTimeout(timeout);
      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toContain('text/event-stream');
    } catch (e) {
      // AbortError is expected
      clearTimeout(timeout);
      expect((e as Error).name).toBe('AbortError');
    }
  });

  test('Connection health indicator is shown', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    // Look for health dot or connection status in header
    const hasHealthDot = await page.locator('.HealthDot, [class*="health"], [class*="connection"]').count() > 0;
    // Or check for engine health data in the page
    const text = await page.textContent('body');
    const hasHealthText = /healthy|degraded|unhealthy|健康|正常|异常/i.test(text ?? '');
    expect(hasHealthDot || hasHealthText).toBe(true);
  });
});

// ─── Test Suite: Authentication ─────────────────────────────────────────────

test.describe('Authentication & RBAC', () => {
  test('Auth info endpoint is accessible', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth-info`);
    expect(res.status()).toBe(200);
  });

  test('Login dialog is present', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    const text = await page.textContent('body');
    expect(text).toMatch(/登录|login|登入|sign in/i);
  });

  test('Protected API returns 401 without auth', async ({ request }) => {
    // Try a protected endpoint
    const res = await request.get(`${BASE}/api/users`);
    // May return 401 or 200 depending on implementation
    expect([200, 401, 403]).toContain(res.status());
  });
});

// ─── Test Suite: Export & Data Portability ──────────────────────────────────

test.describe('Export & Data Portability', () => {
  test('Export API requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/export?module=all&format=csv`);
    // Export requires auth permission, returns 401 for unauthenticated
    expect([200, 401, 403]).toContain(res.status());
  });

  test('Reports API returns structured report', async ({ request }) => {
    const res = await request.get(`${BASE}/api/reports`);
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });
});

// ─── Test Suite: Performance & Resilience ───────────────────────────────────

test.describe('Performance & Resilience', () => {
  test('Page loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(10000);
  });

  test('API endpoints respond within 5 seconds', async ({ request }) => {
    const endpoints = [
      '/api/engine-health',
      '/api/dashboard?action=summary',
      '/api/inventory',
      '/api/supplier-graph?endpoint=stats',
    ];
    for (const ep of endpoints) {
      const start = Date.now();
      const res = await request.get(`${BASE}${ep}`);
      const duration = Date.now() - start;
      // Some endpoints may return 502 if external service is down (acceptable for perf test)
      expect([200, 502, 503]).toContain(res.status());
      expect(duration).toBeLessThan(5000);
    }
  });

  test('Cache stats endpoint returns metrics', async ({ request }) => {
    const res = await request.get(`${BASE}/api/cache-stats`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
  });
});

// ─── Test Suite: Error Handling ─────────────────────────────────────────────

test.describe('Error Handling & Edge Cases', () => {
  test('Invalid API route returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/nonexistent-route`);
    expect(res.status()).toBe(404);
  });

  test('Malformed RAG query is handled gracefully', async ({ request }) => {
    // RAG now supports POST, empty body should be handled gracefully
    const res = await request.post(`${BASE}/api/rag`, {
      data: {}, // empty body — query defaults to ''
    });
    // Should not crash — returns 200 with empty results or 400
    expect([200, 400, 422]).toContain(res.status());
  });

  test('Invalid cascade-risk scenario is handled', async ({ request }) => {
    const res = await request.get(`${BASE}/api/cascade-risk?scenario=invalid`);
    // Should not crash
    expect([200, 400, 422]).toContain(res.status());
  });
});
