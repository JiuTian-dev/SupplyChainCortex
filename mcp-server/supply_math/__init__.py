"""Supply chain math engine — re-exports all functions from submodules.

Modules:
  _helpers      — Normal distribution, constants
  inventory     — EOQ, safety stock, reorder point, ABC-XYZ
  forecasting   — Demand forecast, seasonal decomposition
  simulation    — Monte Carlo simulation
  optimization  — Wagner-Whitin, Newsvendor
  network       — DRP, warehouse location, transport route, multi-echelon SS
  metrics       — Inventory KPI, fill rate, lead time, purchase variance
  finance       — Total cost, supplier scoring
  production    — Learning curve, break-even analysis
  pricing       — Optimal pricing from elasticity
  planning      — Joint replenishment, forecast accuracy
"""

from ._helpers import norm_cdf, norm_pdf, inv_norm, Z_SCORE_MAP, STRATEGY_MAP

from .inventory import (
    calculate_eoq,
    calculate_safety_stock,
    calculate_reorder_point,
    classify_abc_xyz,
)

from .forecasting import (
    forecast_demand,
    calculate_seasonal_decompose,
)

from .simulation import (
    monte_carlo_inventory,
)

from .optimization import (
    calculate_wagner_whitin,
    calculate_newsvendor,
)

from .network import (
    calculate_drp,
    calculate_warehouse_location,
    calculate_transport_route,
    calculate_multi_echelon_ss,
)

from .metrics import (
    calculate_inventory_kpi,
    calculate_fill_rate,
    calculate_lead_time_analysis,
    calculate_purchase_variance,
)

from .finance import (
    calculate_total_cost,
    calculate_supplier_scoring,
)

from .production import (
    calculate_learning_curve,
    calculate_break_even,
)

from .pricing import (
    calculate_optimal_pricing,
)

from .planning import (
    calculate_joint_replenishment,
    calculate_forecast_accuracy,
)
