"""Optimization: Wagner-Whitin and Newsvendor models."""

import math
from typing import Any
from ._helpers import inv_norm, norm_cdf, norm_pdf


def calculate_wagner_whitin(
    demands: list[float],
    order_cost: float,
    holding_cost_per_unit: float,
) -> dict[str, Any]:
    """Wagner-Whitin dynamic lot sizing (optimal). Forward recursion with DP."""
    if not demands:
        return {"error": "demands 不能为空"}
    if order_cost <= 0:
        return {"error": "order_cost 必须大于 0"}
    if holding_cost_per_unit < 0:
        return {"error": "holding_cost_per_unit 不能为负"}
    for i, d in enumerate(demands):
        if d < 0:
            return {"error": f"demands[{i}] 不能为负"}

    n = len(demands)
    D = [float(d) for d in demands]

    def holding_cost(i: int, j: int) -> float:
        return sum(holding_cost_per_unit * D[k] * (k - i) for k in range(i + 1, j + 1))

    F = [float("inf")] * n
    F[0] = order_cost
    prev = [-1] * n

    for t in range(n):
        for j in range(t + 1):
            cost_jt = order_cost + holding_cost(j, t)
            total = cost_jt if j == 0 else F[j - 1] + cost_jt
            if total < F[t]:
                F[t] = total
                prev[t] = j

    # Reconstruct schedule
    order_periods = []
    t = n - 1
    while t >= 0:
        order_periods.append(prev[t])
        t = prev[t] - 1
    order_periods.reverse()

    order_qty = [0.0] * n
    for idx, op in enumerate(order_periods):
        end = order_periods[idx + 1] - 1 if idx < len(order_periods) - 1 else n - 1
        order_qty[op] = sum(D[op:end + 1])

    schedule = []
    inventory = 0.0
    for t in range(n):
        if order_qty[t] > 0:
            inventory += order_qty[t]
        ending_inv = inventory - D[t]
        schedule.append({
            "period": t + 1, "demand": round(D[t], 2),
            "order_quantity": round(order_qty[t], 2),
            "starting_inventory": round(inventory, 2),
            "ending_inventory": round(ending_inv, 2),
        })
        inventory = ending_inv

    total_ordering = sum(order_cost for q in order_qty if q > 0)
    total_holding = sum(holding_cost_per_unit * schedule[t]["ending_inventory"] for t in range(n))

    return {
        "order_quantities": [round(q, 2) for q in order_qty],
        "total_cost": round(F[n - 1], 2),
        "total_ordering_cost": round(total_ordering, 2),
        "total_holding_cost": round(total_holding, 2),
        "number_of_orders": sum(1 for q in order_qty if q > 0),
        "schedule": schedule,
        "formula": "Wagner-Whitin: F(t)=min_{j≤t}[F(j-1)+S+h(j,t)], 前向递推最优解",
    }


def calculate_newsvendor(
    selling_price: float,
    purchase_cost: float,
    salvage_value: float,
    demand_mean: float,
    demand_std: float,
) -> dict[str, Any]:
    """Newsvendor model. Optimal order: Cu/(Cu+Co) = service level."""
    if selling_price <= 0:
        return {"error": "selling_price 必须大于 0"}
    if purchase_cost <= 0:
        return {"error": "purchase_cost 必须大于 0"}
    if salvage_value < 0:
        return {"error": "salvage_value 不能为负"}
    if demand_std <= 0:
        return {"error": "demand_std 必须大于 0"}
    if demand_mean <= 0:
        return {"error": "demand_mean 必须大于 0"}

    co = purchase_cost - salvage_value
    cu = selling_price - purchase_cost
    if co + cu == 0:
        return {"error": "过剩成本与缺货成本之和不能为 0"}

    cr = cu / (co + cu)
    z = inv_norm(cr)
    q_star = demand_mean + z * demand_std
    exp_sales = demand_mean * norm_cdf(z) + demand_std * norm_pdf(z)
    exp_left = q_star - exp_sales
    exp_profit = cu * exp_sales - co * exp_left

    return {
        "optimal_order": round(q_star, 2),
        "critical_ratio": round(cr, 4),
        "overage_cost": round(co, 2),
        "underage_cost": round(cu, 2),
        "expected_sales": round(exp_sales, 2),
        "expected_leftover": round(exp_left, 2),
        "expected_profit": round(exp_profit, 2),
        "z_score": round(z, 4),
        "formula": f"Q*=μ({demand_mean})+Z({round(z, 4)})×σ({demand_std}), CR={round(cr, 4)}",
    }
