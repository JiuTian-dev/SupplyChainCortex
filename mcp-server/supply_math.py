"""supply_math.py — Backward-compatible facade.

Delegates to supply_math/ package submodules.
All existing imports continue to work.
"""

from supply_math._helpers import Z_SCORE_MAP, STRATEGY_MAP
from supply_math.inventory import (
    calculate_eoq,
    calculate_safety_stock,
    calculate_reorder_point,
    classify_abc_xyz,
)
from supply_math.forecasting import (
    forecast_demand,
    calculate_seasonal_decompose,
)
from supply_math.simulation import (
    monte_carlo_inventory,
)
from supply_math.optimization import (
    calculate_wagner_whitin,
    calculate_newsvendor,
)
from supply_math.network import (
    calculate_drp,
    calculate_warehouse_location,
    calculate_transport_route,
    calculate_multi_echelon_ss,
)
from supply_math.metrics import (
    calculate_inventory_kpi,
    calculate_fill_rate,
    calculate_lead_time_analysis,
    calculate_purchase_variance,
)
from supply_math.finance import (
    calculate_total_cost,
    calculate_supplier_scoring,
)

from supply_math.production import (
    calculate_learning_curve,
    calculate_break_even,
)

from supply_math.pricing import (
    calculate_optimal_pricing,
)

from supply_math.planning import (
    calculate_joint_replenishment,
    calculate_forecast_accuracy,
)
