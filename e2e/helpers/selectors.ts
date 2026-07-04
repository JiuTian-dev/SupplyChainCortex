/**
 * Unified selectors for E2E tests.
 *
 * Naming convention: data-testid is the primary selector. Where components
 * do not yet expose data-testid, we fall back to accessible selectors
 * (aria-label, placeholder, role) — never to brittle CSS classes.
 *
 * Keep this file as the single source of truth so selector updates only
 * need to happen here when the UI evolves.
 */

export const selectors = {
  // ─── Layout / Navigation ────────────────────────────────────────────────
  nav: {
    chatView: 'button:has-text("Chat")',
    auditView: 'button:has-text("审计")',
    legacyView: 'button:has-text("数据面板")',
  },
  legacyTabs: {
    inventory: 'button:has-text("库存")',
    supplier: 'button:has-text("供应商")',
    cost: 'button:has-text("成本")',
    logistics: 'button:has-text("物流")',
    sales: 'button:has-text("销售")',
    risk: 'button:has-text("风险仪表")',
    monitor: 'button:has-text("监控")',
    cascadeRisk: 'button:has-text("级联风险")',
    decisionCenter: 'button:has-text("决策中心")',
    sandbox: 'button:has-text("沙箱推演")',
  },

  // ─── Chat Panel ─────────────────────────────────────────────────────────
  chat: {
    input: '[data-testid="chat-input"]',
    message: '[data-testid="chat-message"]',
    typingIndicator: '[data-testid="typing-indicator"]',
    sendButton: 'button[type="submit"], button:has(svg.lucide-send)',
    quickAction: (label: string) => `button:has-text("${label}")`,
    conversationHistoryToggle: 'button[title="对话历史"]',
    newConversation: 'button:has-text("+ 新对话")',
    regenerate: 'button:has-text("重新生成")',
    toolCallChain: '[data-testid="tool-call-chain"]',
    thinkingPanel: 'button:has-text("思考过程")',
  },

  // ─── Inventory ──────────────────────────────────────────────────────────
  inventory: {
    searchInput: 'input[placeholder*="搜索 SKU"]',
    warehouseFilter: 'button[role="combobox"]:has-text("仓库"), [role="combobox"]:has-text("仓库")',
    statusFilter: 'button[role="combobox"]:has-text("状态"), [role="combobox"]:has-text("状态")',
    adjustStockMenuItem: 'div[role="menuitem"]:has-text("调整库存")',
    viewDetailMenuItem: 'div[role="menuitem"]:has-text("查看详情")',
    batchAdjust: 'button:has-text("批量调整")',
    metricCard: (title: string) => `div:has(> div:has-text("${title}"))`,
    healthOverview: 'div:has-text("健康库存")',
    warningOverview: 'div:has-text("预警库存")',
    criticalOverview: 'div:has-text("紧急补货")',
    overstockOverview: 'div:has-text("库存积压")',
    adjustmentDialog: {
      root: '[role="dialog"]:has-text("库存调整")',
      skuInput: 'input[placeholder*="SKU"], input[placeholder*="选择"]',
      quantityInput: 'input[type="number"], input[placeholder*="数量"]',
      reasonSelect: 'button[role="combobox"]',
      submitButton: 'button:has-text("确认")',
      cancelButton: 'button:has-text("取消")',
    },
  },

  // ─── Supplier ───────────────────────────────────────────────────────────
  supplier: {
    searchInput: 'input[placeholder*="搜索供应商"]',
    regionFilter: 'button[role="combobox"]:has-text("地区筛选")',
    categoryFilter: 'button[role="combobox"]:has-text("品类筛选")',
    statusFilter: 'button[role="combobox"]:has-text("状态筛选")',
    addSupplierButton: 'button:has-text("添加供应商")',
    detailButton: 'button:has-text("详情")',
    editButton: 'button:has-text("编辑")',
    rateButton: 'button:has-text("评分")',
    detailDialog: {
      root: '[role="dialog"]:has-text("供应商详情")',
      detailsTab: 'button[role="tab"]:has-text("基本信息")',
      ordersTab: 'button[role="tab"]:has-text("订单历史")',
      performanceTab: 'button[role="tab"]:has-text("绩效")',
    },
    comparison: {
      title: 'div:has-text("供应商对比")',
      selectHint: 'p:has-text("选择2-4家供应商进行对比")',
      exportCsv: 'button:has-text("导出对比CSV")',
    },
    performance: {
      title: 'div:has-text("供应商绩效")',
    },
  },

  // ─── Reports / Analytics ────────────────────────────────────────────────
  reports: {
    // Reports are accessed via API; no dedicated UI tab. Selectors below
    // target the cost / inventory tabs that surface report-like content.
    costTab: 'button:has-text("成本")',
    inventoryTab: 'button:has-text("库存")',
    exportMenu: 'button:has-text("导出")',
  },

  // ─── Billing ────────────────────────────────────────────────────────────
  billing: {
    // Billing is API-only in the current build; selectors target any
    // future UI plus the API request layer.
    subscriptionEndpoint: '/api/billing/subscription',
    usageEndpoint: '/api/billing/usage',
    portalEndpoint: '/api/billing/portal',
    checkoutEndpoint: '/api/billing/checkout',
  },

  // ─── Shared UI ──────────────────────────────────────────────────────────
  shared: {
    dialogClose: 'button[aria-label="Close"], button:has(svg.lucide-x)',
    toast: '[data-sonner-toast]',
    loadingSkeleton: '[class*="skeleton"], [class*="Skeleton"]',
  },
} as const;

/** API endpoints used across journeys — centralised for route mocking. */
export const endpoints = {
  chat: '/api/chat',
  chatHistory: '/api/chat-history',
  inventory: '/api/inventory',
  warehouse: '/api/warehouse',
  suppliers: '/api/suppliers',
  supplierGraph: '/api/supplier-graph',
  supplierPerformance: '/api/supplier-performance',
  analytics: '/api/analytics',
  reports: '/api/reports',
  export: '/api/export',
  billingSubscription: '/api/billing/subscription',
  billingUsage: '/api/billing/usage',
  billingPortal: '/api/billing/portal',
  billingCheckout: '/api/billing/checkout',
  billingWebhook: '/api/billing/webhook',
  engineHealth: '/api/engine-health',
  dashboard: '/api/dashboard',
  cascadeRisk: '/api/cascade-risk',
  sse: '/api/sse',
} as const;
