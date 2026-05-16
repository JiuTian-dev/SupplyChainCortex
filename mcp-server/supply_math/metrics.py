"""Metrics: inventory KPI, fill rate, lead time analysis, purchase variance."""

import math
from typing import Any
import numpy as np
from ._helpers import inv_norm, norm_cdf, norm_pdf


def calculate_inventory_kpi(
    annual_cogs: float,
    avg_inventory: float,
    annual_demand: float,
    orders_filled: float,
    total_orders: float,
    lead_time_days: float,
    avg_daily_demand: float,
    annual_holding_cost: float = 0.0,
    obsolete_inventory: float = 0.0,
    on_time_deliveries: float = 0.0,
    total_deliveries: float = 0.0,
    line_items_shipped_complete: float = 0.0,
    total_line_items: float = 0.0,
) -> dict[str, Any]:
    """Inventory KPI dashboard with comprehensive metrics."""
    if annual_cogs <= 0:
        return {"error": "annual_cogs 必须大于 0"}
    if avg_inventory <= 0:
        return {"error": "avg_inventory 必须大于 0"}
    if annual_demand <= 0:
        return {"error": "annual_demand 必须大于 0"}
    if total_orders <= 0:
        return {"error": "total_orders 必须大于 0"}
    if orders_filled < 0:
        return {"error": "orders_filled 不能为负"}
    if lead_time_days <= 0:
        return {"error": "lead_time_days 必须大于 0"}
    if avg_daily_demand <= 0:
        return {"error": "avg_daily_demand 必须大于 0"}

    turnover = annual_cogs / avg_inventory
    turnover_days = 365 / turnover
    dos = avg_inventory / avg_daily_demand
    wos = dos / 7
    fill_rate = orders_filled / total_orders if total_orders > 0 else 0
    gmroi = annual_cogs * 1.4 / avg_inventory

    result: dict[str, Any] = {
        "turnover_ratio": round(turnover, 2),
        "turnover_days": round(turnover_days, 1),
        "days_of_supply": round(dos, 1),
        "weeks_of_supply": round(wos, 2),
        "fill_rate": round(fill_rate * 100, 2),
        "gmroi": round(gmroi, 2),
    }

    if annual_holding_cost > 0:
        result["carrying_cost_rate"] = round(annual_holding_cost / avg_inventory * 100, 2)
        result["annual_carrying_cost"] = round(annual_holding_cost, 2)

    if obsolete_inventory > 0:
        result["obsolete_inventory_ratio"] = round(obsolete_inventory / avg_inventory * 100, 2)
        result["obsolete_inventory_value"] = round(obsolete_inventory, 2)

    if total_deliveries > 0 and on_time_deliveries >= 0:
        on_time_rate = on_time_deliveries / total_deliveries
        if total_line_items > 0 and line_items_shipped_complete >= 0:
            complete_rate = line_items_shipped_complete / total_line_items
            result["perfect_order_rate"] = round(on_time_rate * fill_rate * complete_rate * 100, 2)
            result["on_time_delivery_rate"] = round(on_time_rate * 100, 2)
            result["line_item_fill_rate"] = round(complete_rate * 100, 2)
        else:
            result["on_time_delivery_rate"] = round(on_time_rate * 100, 2)

    result["formula"] = (
        "周转率=COGS/平均库存, 供货天数=平均库存/日均需求, "
        "满足率=已满足订单/总订单, 完美订单率=准时率×满足率×完整率"
    )
    return result


def calculate_fill_rate(
    service_level: float,
    demand_std: float,
    lead_time_days: float,
    order_quantity: float,
    avg_daily_demand: float,
) -> dict[str, Any]:
    """Calculate Type 1 (Cycle Service Level) and Type 2 (Fill Rate)."""
    if not (0.50 <= service_level <= 0.9999):
        return {"error": "service_level 必须在 0.50 到 0.9999 之间"}
    if demand_std < 0:
        return {"error": "demand_std 不能为负"}
    if lead_time_days <= 0:
        return {"error": "lead_time_days 必须大于 0"}
    if order_quantity <= 0:
        return {"error": "order_quantity 必须大于 0"}
    if avg_daily_demand <= 0:
        return {"error": "avg_daily_demand 必须大于 0"}

    z = inv_norm(service_level)
    sigma_lt = demand_std * math.sqrt(lead_time_days)
    ss = z * sigma_lt
    loss_z = norm_pdf(z) - z * (1 - norm_cdf(z))
    expected_shortage = sigma_lt * loss_z
    type2 = max(0.0, min(1.0, 1 - expected_shortage / order_quantity))

    return {
        "type1_cycle_service_level": round(service_level, 6),
        "type2_fill_rate": round(type2, 6),
        "expected_shortage_per_cycle": round(expected_shortage, 4),
        "expected_demand_per_cycle": round(order_quantity, 2),
        "safety_stock": round(ss, 2),
        "z_score": round(z, 4),
        "sigma_lead_time": round(sigma_lt, 4),
        "loss_function_value": round(loss_z, 6),
        "formula": f"Type1=P(demand≤ROP)={round(service_level, 4)}, Type2=1-E[shortage]/Q=1-{round(expected_shortage, 4)}/{round(order_quantity, 2)}",
    }


def calculate_lead_time_analysis(
    lead_times: list[float],
    demand_rate: float,
    service_level: float,
) -> dict[str, Any]:
    """Lead time variability analysis with CV classification."""
    if len(lead_times) < 2:
        return {"error": "lead_times 至少需要 2 个数据点"}
    if demand_rate <= 0:
        return {"error": "demand_rate 必须大于 0"}
    if not (0.50 <= service_level <= 0.9999):
        return {"error": "service_level 必须在 0.50 到 0.9999 之间"}

    arr = np.array(lead_times, dtype=float)
    mu = float(np.mean(arr))
    sigma = float(np.std(arr, ddof=1))
    cv = sigma / mu if mu > 0 else 0.0
    cls = "稳定" if cv < 0.3 else ("一般" if cv < 0.6 else "不稳定")
    z = inv_norm(service_level)
    ss = z * demand_rate * sigma
    rop = demand_rate * mu + ss
    buf = {"稳定": 0, "一般": 2, "不稳定": 5}[cls]

    return {
        "mean_lead_time": round(mu, 2),
        "std_lead_time": round(sigma, 2),
        "cv": round(cv, 4),
        "min_lead_time": round(float(np.min(arr)), 2),
        "max_lead_time": round(float(np.max(arr)), 2),
        "variability": cls,
        "safety_stock": round(ss, 2),
        "reorder_point": round(rop, 2),
        "z_score": round(z, 4),
        "buffer_days": buf,
        "formula": f"SS=Z({round(z, 4)})×d̄({demand_rate})×σ_LT({round(sigma, 2)}), ROP=d̄×μ_LT+SS",
    }


def calculate_purchase_variance(
    actual_price: float,
    standard_price: float,
    actual_qty: float,
    standard_qty: float,
) -> dict[str, Any]:
    """Purchase Price Variance (PPV) and Usage Variance analysis."""
    if actual_price < 0:
        return {"error": "actual_price 不能为负"}
    if standard_price < 0:
        return {"error": "standard_price 不能为负"}
    if actual_qty < 0:
        return {"error": "actual_qty 不能为负"}
    if standard_qty < 0:
        return {"error": "standard_qty 不能为负"}

    ppv = (actual_price - standard_price) * actual_qty
    usage_variance = (actual_qty - standard_qty) * standard_price
    actual_cost = actual_price * actual_qty
    standard_cost = standard_price * standard_qty
    total_variance = actual_cost - standard_cost

    ppv_pct = (ppv / standard_cost * 100) if standard_cost > 0 else 0
    usage_pct = (usage_variance / standard_cost * 100) if standard_cost > 0 else 0
    total_pct = (total_variance / standard_cost * 100) if standard_cost > 0 else 0

    return {
        "purchase_price_variance": round(ppv, 2),
        "ppv_favorable": ppv <= 0,
        "ppv_label": "有利差异" if ppv <= 0 else "不利差异",
        "usage_variance": round(usage_variance, 2),
        "usage_variance_favorable": usage_variance <= 0,
        "usage_variance_label": "有利差异" if usage_variance <= 0 else "不利差异",
        "total_variance": round(total_variance, 2),
        "total_variance_favorable": total_variance <= 0,
        "total_variance_label": "有利差异" if total_variance <= 0 else "不利差异",
        "actual_cost": round(actual_cost, 2),
        "standard_cost": round(standard_cost, 2),
        "ppv_percentage": round(ppv_pct, 2),
        "usage_variance_percentage": round(usage_pct, 2),
        "total_variance_percentage": round(total_pct, 2),
        "price_difference_per_unit": round(actual_price - standard_price, 4),
        "quantity_difference": round(actual_qty - standard_qty, 4),
        "variance_verification": round(ppv + usage_variance, 2) == round(total_variance, 2),
        "formula": f"PPV=(AP-SP)×AQ=({actual_price}-{standard_price})×{actual_qty}={round(ppv, 2)}, 用量差异=({actual_qty}-{standard_qty})×{standard_price}={round(usage_variance, 2)}, 总差异={round(total_variance, 2)}",
    }
