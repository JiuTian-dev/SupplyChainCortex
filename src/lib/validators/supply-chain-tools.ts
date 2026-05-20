/**
 * Zod schemas for all 24 supply-chain Python math tools.
 * Validates user input before passing to subprocess.
 */
import { z } from 'zod';

const positiveNumber = z.number().positive().max(1_000_000_000);
const nonNegativeNumber = z.number().min(0).max(1_000_000_000);

// ─── Inventory ─────────────────────────────────────────────────────────────

export const eoqSchema = z.object({
  annual_demand: positiveNumber,
  ordering_cost: positiveNumber,
  holding_cost_per_unit: positiveNumber,
  discount_rate: z.number().min(0).max(1).optional(),
  discount_threshold: positiveNumber.optional(),
});

export const safetyStockSchema = z.object({
  service_level: z.number().min(0.5).max(0.9999),
  lead_time_days: positiveNumber,
  demand_stddev: nonNegativeNumber,
  avg_daily_demand: nonNegativeNumber.optional(),
});

export const reorderPointSchema = z.object({
  avg_daily_demand: nonNegativeNumber,
  lead_time_days: positiveNumber,
  safety_stock: nonNegativeNumber.optional(),
});

export const abcXyzSchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().max(100),
        annual_revenue: nonNegativeNumber,
        demand_variability: nonNegativeNumber.optional(),
      }),
    )
    .min(1)
    .max(10000),
});

// ─── Forecasting ───────────────────────────────────────────────────────────

export const forecastDemandSchema = z.object({
  demand_history: z.array(nonNegativeNumber).min(2).max(1000),
  horizon: z.number().int().min(1).max(365),
  method: z.enum(['sma', 'ses', 'linear', 'winters', 'croston']).optional(),
  alpha: z.number().min(0).max(1).optional(),
  seasonal_periods: z.number().int().min(2).max(52).optional(),
});

export const seasonalDecomposeSchema = z.object({
  demand_history: z.array(nonNegativeNumber).min(4).max(1000),
  period: z.number().int().min(2).max(52),
});

// ─── Simulation ────────────────────────────────────────────────────────────

export const monteCarloInventorySchema = z.object({
  avg_daily_demand: positiveNumber,
  demand_stddev: nonNegativeNumber,
  lead_time_days: positiveNumber,
  lead_time_stddev: nonNegativeNumber.optional(),
  reorder_point: nonNegativeNumber,
  order_quantity: positiveNumber,
  simulation_days: z.number().int().min(7).max(3650),
  iterations: z.number().int().min(100).max(100000).optional(),
});

// ─── Optimization ──────────────────────────────────────────────────────────

export const wagnerWhitinSchema = z.object({
  demands: z.array(nonNegativeNumber).min(1).max(365),
  setup_cost: positiveNumber,
  holding_cost_per_unit: positiveNumber,
});

export const newsvendorSchema = z.object({
  selling_price: positiveNumber,
  cost_price: positiveNumber,
  salvage_value: nonNegativeNumber,
  demand_mean: positiveNumber,
  demand_stddev: nonNegativeNumber,
});

// ─── Network ───────────────────────────────────────────────────────────────

export const drpSchema = z.object({
  initial_inventory: nonNegativeNumber,
  demands: z.array(nonNegativeNumber).min(1).max(365),
  lead_time: z.number().int().min(0).max(365),
  order_cost: positiveNumber,
  holding_cost: positiveNumber,
  safety_stock: nonNegativeNumber.optional(),
});

export const warehouseLocationSchema = z.object({
  locations: z
    .array(
      z.object({
        name: z.string().max(100),
        x: z.number(),
        y: z.number(),
        demand_weight: positiveNumber.optional(),
      }),
    )
    .min(2)
    .max(1000),
});

export const transportRouteSchema = z.object({
  points: z
    .array(
      z.object({
        name: z.string().max(100),
        x: z.number(),
        y: z.number(),
      }),
    )
    .min(2)
    .max(100),
  start_point: z.string().max(100).optional(),
});

export const multiEchelonSsSchema = z.object({
  demand_per_period: positiveNumber,
  demand_stddev: nonNegativeNumber,
  lead_times: z.array(nonNegativeNumber).min(1).max(10),
  service_level: z.number().min(0.5).max(0.9999),
  stages: z.number().int().min(2).max(10).optional(),
});

// ─── Metrics ───────────────────────────────────────────────────────────────

export const inventoryKpiSchema = z.object({
  annual_cogs: positiveNumber,
  avg_inventory_value: positiveNumber,
  annual_sales: positiveNumber.optional(),
  stockout_count: z.number().int().min(0).optional(),
  total_orders: z.number().int().min(1).optional(),
});

export const fillRateSchema = z.object({
  service_level: z.number().min(0.5).max(0.9999),
  demand_stddev: nonNegativeNumber,
  avg_demand: positiveNumber,
  lead_time_days: positiveNumber.optional(),
});

export const leadTimeAnalysisSchema = z.object({
  lead_times: z.array(nonNegativeNumber).min(1).max(1000),
});

export const purchaseVarianceSchema = z.object({
  actual_price: nonNegativeNumber,
  standard_price: nonNegativeNumber,
  quantity: positiveNumber.optional(),
});

// ─── Finance ───────────────────────────────────────────────────────────────

export const totalCostSchema = z.object({
  annual_demand: positiveNumber,
  unit_cost: positiveNumber,
  ordering_cost: positiveNumber,
  holding_rate: z.number().min(0).max(1),
  shipping_cost_per_unit: nonNegativeNumber.optional(),
  tariff_rate: z.number().min(0).max(1).optional(),
});

export const supplierScoringSchema = z.object({
  suppliers: z
    .array(
      z.object({
        name: z.string().max(100),
        quality_score: z.number().min(0).max(10).optional(),
        delivery_score: z.number().min(0).max(10).optional(),
        cost_score: z.number().min(0).max(10).optional(),
        service_score: z.number().min(0).max(10).optional(),
        flexibility_score: z.number().min(0).max(10).optional(),
      }),
    )
    .min(1)
    .max(500),
});

// ─── Production ────────────────────────────────────────────────────────────

export const learningCurveSchema = z.object({
  first_unit_cost: positiveNumber,
  cumulative_units: z.number().int().min(2).max(1000000),
  learning_rate: z.number().min(0.5).max(0.99),
});

export const breakEvenSchema = z.object({
  fixed_costs: nonNegativeNumber,
  unit_price: positiveNumber,
  unit_variable_cost: nonNegativeNumber,
});

// ─── Pricing ───────────────────────────────────────────────────────────────

export const optimalPricingSchema = z.object({
  unit_cost: positiveNumber,
  price_elasticity: z.number().min(-10).max(0),
  current_price: positiveNumber,
  market_cap_price: positiveNumber.optional(),
});

// ─── Planning ──────────────────────────────────────────────────────────────

export const jointReplenishmentSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().max(100).optional(),
        annual_demand: positiveNumber,
        unit_cost: positiveNumber,
        holding_rate: z.number().min(0).max(1).optional(),
        individual_order_cost: nonNegativeNumber.optional(),
      }),
    )
    .min(1)
    .max(500),
  major_setup_cost: positiveNumber.optional(),
});

export const forecastAccuracySchema = z.object({
  forecasts: z
    .array(
      z.object({
        actual: nonNegativeNumber,
        predicted: nonNegativeNumber,
        period: z.string().max(20).optional(),
      }),
    )
    .min(1)
    .max(10000),
});

// ─── Schema Registry ───────────────────────────────────────────────────────

export const TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  calculate_eoq: eoqSchema,
  calculate_safety_stock: safetyStockSchema,
  calculate_reorder_point: reorderPointSchema,
  classify_abc_xyz: abcXyzSchema,
  forecast_demand: forecastDemandSchema,
  calculate_seasonal_decompose: seasonalDecomposeSchema,
  monte_carlo_inventory: monteCarloInventorySchema,
  calculate_wagner_whitin: wagnerWhitinSchema,
  calculate_newsvendor: newsvendorSchema,
  calculate_drp: drpSchema,
  calculate_warehouse_location: warehouseLocationSchema,
  calculate_transport_route: transportRouteSchema,
  calculate_multi_echelon_ss: multiEchelonSsSchema,
  calculate_inventory_kpi: inventoryKpiSchema,
  calculate_fill_rate: fillRateSchema,
  calculate_lead_time_analysis: leadTimeAnalysisSchema,
  calculate_purchase_variance: purchaseVarianceSchema,
  calculate_total_cost: totalCostSchema,
  calculate_supplier_scoring: supplierScoringSchema,
  calculate_learning_curve: learningCurveSchema,
  calculate_break_even: breakEvenSchema,
  calculate_optimal_pricing: optimalPricingSchema,
  calculate_joint_replenishment: jointReplenishmentSchema,
  calculate_forecast_accuracy: forecastAccuracySchema,
};

/** Validate tool arguments against the registered schema */
export function validateToolArgs(
  tool: string,
  args: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = TOOL_SCHEMAS[tool];
  if (!schema) {
    return { success: false, error: `Unknown tool: ${tool}` };
  }
  const result = schema.safeParse(args);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const messages = result.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  return { success: false, error: messages };
}
