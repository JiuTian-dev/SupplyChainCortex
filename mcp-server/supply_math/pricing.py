"""Pricing optimization: optimal price from demand elasticity."""

import math
from typing import Any


def calculate_optimal_pricing(
    unit_cost: float,
    current_price: float,
    current_demand: float,
    elasticity: float = 0,
    demand_at_zero_price: float = 0,
    model: str = "elasticity",
    price_range: list[float] = [],
    detailed: bool = True,
) -> dict[str, Any]:
    """Optimal pricing using price elasticity of demand.

    Two models:
    - "elasticity": constant elasticity model. P* = C × ε/(ε-1) where ε > 1.
      Requires: elasticity (must be > 1 for profit maximum to exist).
    - "linear": linear demand D = a - bP. Optimal P* = (a + bC)/(2b).
      Requires: demand_at_zero_price (a). b = current_demand / (demand_at_zero_price - current_price).

    Parameters
    ----------
    unit_cost : float
        Unit cost per item.
    current_price : float
        Current selling price.
    current_demand : float
        Current demand at current_price.
    elasticity : float
        Price elasticity of demand (absolute value). > 1 for normal goods.
        E.g., 2.5 means 1% price increase → 2.5% demand decrease.
    demand_at_zero_price : float
        Theoretical demand if price were 0 (intercept of linear demand).
        Required for linear model.
    model : str
        "elasticity" (default) or "linear".
    price_range : list[float]
        Price points to evaluate (for the revenue/profit table).
        If empty, auto-generate around optimal price.
    detailed : bool
        If True, include profit curve data points.

    Returns
    -------
    dict with optimal_price, optimal_demand, max_profit, revenue, price sensitivity.
    """
    if unit_cost < 0:
        return {"error": "unit_cost 不能为负"}
    if current_price <= 0:
        return {"error": "current_price 必须大于 0"}
    if current_demand <= 0:
        return {"error": "current_demand 必须大于 0"}

    result: dict[str, Any] = {}

    if model == "elasticity":
        if elasticity <= 1:
            return {"error": f"elasticity 必须 > 1 才存在利润最大值（当前: {elasticity}）。弹性不足: 涨价总是有利的"}

        # Constant elasticity demand: D = k × P^(-ε)
        # k = current_demand × current_price^elasticity
        k = current_demand * (current_price ** elasticity)

        # Optimal price: P* = C × ε/(ε-1)
        optimal_price = unit_cost * elasticity / (elasticity - 1)
        optimal_demand = k * (optimal_price ** (-elasticity))

        # Revenue and profit
        current_revenue = current_price * current_demand
        current_profit = (current_price - unit_cost) * current_demand
        optimal_revenue = optimal_price * optimal_demand
        optimal_profit = (optimal_price - unit_cost) * optimal_demand

        # Lerner index: (P - C) / P = 1/ε (markup over marginal cost)
        lerner_index = 1 / elasticity
        optimal_markup_pct = (optimal_price - unit_cost) / unit_cost * 100

        result = {
            "model": "constant_elasticity",
            "elasticity": elasticity,
            "optimal_price": round(optimal_price, 2),
            "optimal_demand": round(optimal_demand, 2),
            "optimal_revenue": round(optimal_revenue, 2),
            "optimal_profit": round(optimal_profit, 2),
            "optimal_markup_pct": round(optimal_markup_pct, 2),
            "lerner_index": round(lerner_index, 4),
            "current_profit": round(current_profit, 2),
            "current_revenue": round(current_revenue, 2),
            "profit_improvement": round(optimal_profit - current_profit, 2),
            "profit_improvement_pct": round((optimal_profit - current_profit) / abs(current_profit) * 100, 2) if current_profit != 0 else 0,
            "formula": f"P*=C×ε/(ε-1)={unit_cost}×{elasticity}/{elasticity-1}={round(optimal_price, 2)}, 勒纳指数=1/ε={round(lerner_index, 4)}",
        }

        # Price sensitivity analysis around optimal
        if detailed:
            price_points = []
            multipliers = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3]
            for mult in multipliers:
                p = optimal_price * mult
                d = k * (p ** (-elasticity))
                r = p * d
                profit = (p - unit_cost) * d
                profit_pct_of_opt = profit / optimal_profit * 100 if optimal_profit > 0 else 0
                price_points.append({
                    "price": round(p, 2),
                    "demand": round(d, 2),
                    "revenue": round(r, 2),
                    "profit": round(profit, 2),
                    "profit_pct_of_optimal": round(profit_pct_of_opt, 2),
                    "is_optimal": mult == 1.0,
                })
            result["price_sensitivity"] = price_points

            # What-if: 5% price increase
            p_up = current_price * 1.05
            d_up = k * (p_up ** (-elasticity))
            result["what_if_price_up_5pct"] = {
                "new_price": round(p_up, 2),
                "new_demand": round(d_up, 2),
                "new_revenue": round(p_up * d_up, 2),
                "new_profit": round((p_up - unit_cost) * d_up, 2),
                "demand_change_pct": round((d_up - current_demand) / current_demand * 100, 2),
                "profit_change_pct": round(((p_up - unit_cost) * d_up - current_profit) / abs(current_profit) * 100, 2) if current_profit != 0 else 0,
            }

            # What-if: 5% price decrease
            p_down = current_price * 0.95
            d_down = k * (p_down ** (-elasticity))
            result["what_if_price_down_5pct"] = {
                "new_price": round(p_down, 2),
                "new_demand": round(d_down, 2),
                "new_revenue": round(p_down * d_down, 2),
                "new_profit": round((p_down - unit_cost) * d_down, 2),
                "demand_change_pct": round((d_down - current_demand) / current_demand * 100, 2),
                "profit_change_pct": round(((p_down - unit_cost) * d_down - current_profit) / abs(current_profit) * 100, 2) if current_profit != 0 else 0,
            }

    elif model == "linear":
        if demand_at_zero_price <= 0:
            return {"error": "线性模型需要 demand_at_zero_price > 0（即截距 a）"}

        # D = a - bP
        a = demand_at_zero_price
        b = current_demand / max(0.01, a - current_price) if a > current_price else 0

        if b <= 0:
            return {"error": f"无法计算斜率b: a({a}) <= current_price({current_price})"}

        # Optimal: P* = (a + bC) / (2b)
        optimal_price = (a + b * unit_cost) / (2 * b)
        optimal_demand = max(0, a - b * optimal_price)
        optimal_revenue = optimal_price * optimal_demand
        optimal_profit = (optimal_price - unit_cost) * optimal_demand

        current_revenue = current_price * current_demand
        current_profit = (current_price - unit_cost) * current_demand

        result = {
            "model": "linear_demand",
            "demand_intercept_a": round(a, 2),
            "demand_slope_b": round(b, 4),
            "optimal_price": round(optimal_price, 2),
            "optimal_demand": round(optimal_demand, 2),
            "optimal_revenue": round(optimal_revenue, 2),
            "optimal_profit": round(optimal_profit, 2),
            "current_profit": round(current_profit, 2),
            "profit_improvement": round(optimal_profit - current_profit, 2),
            "profit_improvement_pct": round((optimal_profit - current_profit) / abs(current_profit) * 100, 2) if current_profit != 0 else 0,
            "revenue_maximizing_price": round(a / (2 * b), 2),  # P where MR = 0
            "formula": f"D=a-bP={a}-{round(b,4)}P, P*=(a+bC)/(2b)=({a}+{round(b,4)}×{unit_cost})/(2×{round(b,4)})={round(optimal_price,2)}",
        }

        if detailed:
            price_points = []
            for pct in range(50, 155, 5):
                p = a * pct / 100 / (2 * b) * optimal_price / (a / (2 * b)) if optimal_price > 0 else a / (2 * b) * pct / 100
                # Simpler: generate around optimal
                p_min = max(unit_cost * 1.05, optimal_price * 0.5)
                p_max = optimal_price * 1.5
                p = p_min + (p_max - p_min) * (pct - 50) / 100
                d = max(0, a - b * p)
                profit = (p - unit_cost) * d
                price_points.append({
                    "price": round(p, 2),
                    "demand": round(d, 2),
                    "revenue": round(p * d, 2),
                    "profit": round(profit, 2),
                })
            result["price_sensitivity"] = price_points

    else:
        return {"error": f"model 必须是 'elasticity' 或 'linear'，当前: {model}"}

    return result
