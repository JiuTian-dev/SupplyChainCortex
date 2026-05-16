#!/usr/bin/env python3
"""bridge.py — Node.js → Python 桥接脚本

用法: python bridge.py <tool_name> '<json_args>'
输出: JSON 结果到 stdout

所有供应链数学工具通过 bridge 统一调用。
"""

import sys
import json

# Force UTF-8 stdout for cross-platform compatibility
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, ".")

from supply_math import (
    # Inventory
    calculate_eoq,
    calculate_safety_stock,
    calculate_reorder_point,
    classify_abc_xyz,
    # Forecasting
    forecast_demand,
    calculate_seasonal_decompose,
    # Simulation
    monte_carlo_inventory,
    # Optimization
    calculate_wagner_whitin,
    calculate_newsvendor,
    # Network
    calculate_drp,
    calculate_warehouse_location,
    calculate_transport_route,
    calculate_multi_echelon_ss,
    # Metrics
    calculate_inventory_kpi,
    calculate_fill_rate,
    calculate_lead_time_analysis,
    calculate_purchase_variance,
    # Finance
    calculate_total_cost,
    calculate_supplier_scoring,
    # Production
    calculate_learning_curve,
    calculate_break_even,
    # Pricing
    calculate_optimal_pricing,
    # Planning
    calculate_joint_replenishment,
    calculate_forecast_accuracy,
)

TOOLS = {
    # ─── Inventory ───
    "calculate_eoq": calculate_eoq,
    "calculate_safety_stock": calculate_safety_stock,
    "calculate_reorder_point": calculate_reorder_point,
    "classify_abc_xyz": classify_abc_xyz,
    # ─── Forecasting ───
    "forecast_demand": forecast_demand,
    "calculate_seasonal_decompose": calculate_seasonal_decompose,
    # ─── Simulation ───
    "monte_carlo_inventory": monte_carlo_inventory,
    # ─── Optimization ───
    "calculate_wagner_whitin": calculate_wagner_whitin,
    "calculate_newsvendor": calculate_newsvendor,
    # ─── Network ───
    "calculate_drp": calculate_drp,
    "calculate_warehouse_location": calculate_warehouse_location,
    "calculate_transport_route": calculate_transport_route,
    "calculate_multi_echelon_ss": calculate_multi_echelon_ss,
    # ─── Metrics ───
    "calculate_inventory_kpi": calculate_inventory_kpi,
    "calculate_fill_rate": calculate_fill_rate,
    "calculate_lead_time_analysis": calculate_lead_time_analysis,
    "calculate_purchase_variance": calculate_purchase_variance,
    # ─── Finance ───
    "calculate_total_cost": calculate_total_cost,
    "calculate_supplier_scoring": calculate_supplier_scoring,
    # ─── Production ───
    "calculate_learning_curve": calculate_learning_curve,
    "calculate_break_even": calculate_break_even,
    # ─── Pricing ───
    "calculate_optimal_pricing": calculate_optimal_pricing,
    # ─── Planning ───
    "calculate_joint_replenishment": calculate_joint_replenishment,
    "calculate_forecast_accuracy": calculate_forecast_accuracy,
}


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "用法: bridge.py <tool_name> '<json_args>'"}, ensure_ascii=False))
        sys.exit(1)

    tool_name = sys.argv[1]
    if tool_name not in TOOLS:
        print(json.dumps({"error": f"未知工具: {tool_name}, 可用: {list(TOOLS.keys())}"}, ensure_ascii=False))
        sys.exit(1)

    try:
        args = json.loads(sys.argv[2])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON 解析失败: {e}"}, ensure_ascii=False))
        sys.exit(1)

    try:
        result = TOOLS[tool_name](**args)
    except TypeError as e:
        print(json.dumps({"error": f"参数错误: {e}"}, ensure_ascii=False))
        sys.exit(0)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
