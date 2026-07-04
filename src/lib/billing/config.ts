/**
 * Billing configuration — subscription plans, limits, and feature flags.
 *
 * The billing system is disabled by default. Set BILLING_ENABLED=true to enable.
 * Stripe keys are read from environment variables and never hardcoded.
 */

// ─── Plan Definitions ────────────────────────────────────────────────────────

export type Plan = 'free' | 'starter' | 'pro' | 'enterprise';

export type ResourceType = 'api_calls' | 'tools' | 'storage';

export interface PlanConfig {
  name: string;
  priceId: string; // Stripe Price ID (env-injected)
  monthlyPrice: number; // USD
  description: string;
  limits: {
    maxUsers: number;
    maxApiCallsPerMonth: number;
    maxToolsPerDay: number;
    maxDataRetentionDays: number;
    features: string[];
  };
}

/**
 * Subscription plan catalogue.
 * Price IDs are read from environment variables so secrets stay out of source.
 * Falls back to placeholder strings when env vars are absent (scaffold mode).
 */
function priceId(plan: Plan): string {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}`;
  return process.env[envKey] || `price_placeholder_${plan}`;
}

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    name: 'Free',
    priceId: priceId('free'),
    monthlyPrice: 0,
    description: '适合个人试用和小规模评估',
    limits: {
      maxUsers: 1,
      maxApiCallsPerMonth: 1000,
      maxToolsPerDay: 50,
      maxDataRetentionDays: 30,
      features: [
        '基础供应链仪表盘',
        '库存查看',
        '社区支持',
      ],
    },
  },
  starter: {
    name: 'Starter',
    priceId: priceId('starter'),
    monthlyPrice: 49,
    description: '适合小型团队起步',
    limits: {
      maxUsers: 5,
      maxApiCallsPerMonth: 50000,
      maxToolsPerDay: 500,
      maxDataRetentionDays: 90,
      features: [
        'Free 全部功能',
        '多用户协作',
        '供应商管理',
        '成本分析',
        '邮件支持',
      ],
    },
  },
  pro: {
    name: 'Pro',
    priceId: priceId('pro'),
    monthlyPrice: 199,
    description: '适合成长型企业',
    limits: {
      maxUsers: 20,
      maxApiCallsPerMonth: 500000,
      maxToolsPerDay: 5000,
      maxDataRetentionDays: 365,
      features: [
        'Starter 全部功能',
        'AI 智能决策引擎',
        '级联风险分析',
        '高级审计追踪',
        '优先支持',
      ],
    },
  },
  enterprise: {
    name: 'Enterprise',
    priceId: priceId('enterprise'),
    monthlyPrice: 0, // 联系销售
    description: '适合大型企业定制需求',
    limits: {
      maxUsers: -1, // 无限
      maxApiCallsPerMonth: -1,
      maxToolsPerDay: -1,
      maxDataRetentionDays: -1,
      features: [
        'Pro 全部功能',
        'SSO 单点登录',
        '专属客户成功经理',
        'SLA 保障',
        '私有部署',
        '定制集成',
      ],
    },
  },
};

// ─── Plan Helpers ────────────────────────────────────────────────────────────

/** Ordered list of plans for upgrade/downgrade comparisons. */
export const PLAN_TIER_ORDER: Plan[] = ['free', 'starter', 'pro', 'enterprise'];

/** Returns true if planA is a higher tier than planB. */
export function isPlanUpgrade(planA: Plan, planB: Plan): boolean {
  return PLAN_TIER_ORDER.indexOf(planA) > PLAN_TIER_ORDER.indexOf(planB);
}

/** Get plan config or throw if invalid. */
export function getPlanConfig(plan: Plan): PlanConfig {
  const config = PLANS[plan];
  if (!config) {
    throw new Error(`Unknown plan: ${plan}`);
  }
  return config;
}

/** Check if a plan is valid. */
export function isValidPlan(plan: string): plan is Plan {
  return plan in PLANS;
}

/** Get the limit for a specific resource on a plan. */
export function getResourceLimit(plan: Plan, resource: ResourceType): number {
  const config = getPlanConfig(plan);
  switch (resource) {
    case 'api_calls':
      return config.limits.maxApiCallsPerMonth;
    case 'tools':
      return config.limits.maxToolsPerDay;
    case 'storage':
      return config.limits.maxDataRetentionDays;
    default:
      return 0;
  }
}

// ─── Feature Flags ───────────────────────────────────────────────────────────

/** Whether the billing system is enabled. When false, all quota checks pass. */
export function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED === 'true';
}

/** Stripe secret key from environment. */
export function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || '';
}

/** Stripe webhook secret from environment. */
export function getStripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

/** Whether Stripe is configured (has secret key). */
export function isStripeConfigured(): boolean {
  return getStripeSecretKey().length > 0;
}

// ─── Period Helpers ──────────────────────────────────────────────────────────

/** Returns current period string in YYYY-MM format. */
export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns the period for a given date in YYYY-MM format. */
export function getPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
