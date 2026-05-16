"""Inventory management: EOQ, safety stock, reorder point, ABC-XYZ classification."""

import math
from typing import Any, Optional
from ._helpers import inv_norm, STRATEGY_MAP


def calculate_eoq(
    annual_demand: float,
    order_cost: float,
    holding_cost_per_unit: float,
    discount_schedule: Optional[list[dict[str, float]]] = None,
    discount_type: str = "all_units",
) -> dict[str, Any]:
    """Economic Order Quantity with optional quantity discount models.

    Parameters
    ----------
    annual_demand : float
        Annual demand D.
    order_cost : float
        Fixed cost per order S.
    holding_cost_per_unit : float
        Annual holding cost per unit H.
    discount_schedule : list[dict], optional
        Each entry: {"break_qty": float, "unit_cost": float}.
        Must be sorted ascending by break_qty.
    discount_type : str
        "all_units" (default) or "incremental".

    Returns
    -------
    dict with eoq, annual_orders, annual_total_cost, and optionally discount analysis.
    """
    if annual_demand <= 0:
        return {"error": "annual_demand 必须大于 0"}
    if order_cost <= 0:
        return {"error": "order_cost 必须大于 0"}
    if holding_cost_per_unit <= 0:
        return {"error": "holding_cost_per_unit 必须大于 0"}

    eoq_base = math.sqrt(2 * annual_demand * order_cost / holding_cost_per_unit)
    ao_base = annual_demand / eoq_base
    tc_base = ao_base * order_cost + (eoq_base / 2) * holding_cost_per_unit

    result: dict[str, Any] = {
        "eoq": round(eoq_base, 2),
        "annual_orders": round(ao_base, 2),
        "annual_total_cost": round(tc_base, 2),
        "formula": "Q*=sqrt(2×D×S/H)",
    }

    if not discount_schedule:
        return result

    if discount_type not in ("all_units", "incremental"):
        return {"error": "discount_type 必须是 'all_units' 或 'incremental'"}
    for i, tier in enumerate(discount_schedule):
        if "break_qty" not in tier or "unit_cost" not in tier:
            return {"error": f"discount_schedule[{i}] 必须包含 break_qty 和 unit_cost"}
        if tier["break_qty"] < 0:
            return {"error": f"discount_schedule[{i}].break_qty 不能为负"}
        if tier["unit_cost"] <= 0:
            return {"error": f"discount_schedule[{i}].unit_cost 必须大于 0"}

    schedule = sorted(discount_schedule, key=lambda x: x["break_qty"])

    if discount_type == "all_units":
        return _eoq_all_units_discount(annual_demand, order_cost, holding_cost_per_unit, schedule, result)
    else:
        return _eoq_incremental_discount(annual_demand, order_cost, holding_cost_per_unit, schedule, result)


def _eoq_all_units_discount(
    D: float, S: float, H: float, schedule: list[dict], base_result: dict
) -> dict[str, Any]:
    best_q = None
    best_tc = float("inf")
    best_unit_cost = schedule[0]["unit_cost"]
    candidates = []

    for i, tier in enumerate(schedule):
        h_eff = H
        q_star = math.sqrt(2 * D * S / h_eff)
        if q_star < tier["break_qty"]:
            q_candidate = tier["break_qty"]
        else:
            q_candidate = q_star
        if i < len(schedule) - 1 and q_candidate >= schedule[i + 1]["break_qty"]:
            continue
        tc = (D / q_candidate) * S + (q_candidate / 2) * h_eff + D * tier["unit_cost"]
        candidates.append({
            "tier_index": i,
            "unit_cost": tier["unit_cost"],
            "order_quantity": round(q_candidate, 2),
            "total_cost": round(tc, 2),
        })
        if tc < best_tc:
            best_tc = tc
            best_q = q_candidate
            best_unit_cost = tier["unit_cost"]

    base_result["discount_type"] = "all_units"
    base_result["optimal_order_qty"] = round(best_q, 2) if best_q else round(math.sqrt(2 * D * S / H), 2)
    base_result["optimal_unit_cost"] = best_unit_cost
    base_result["optimal_total_cost"] = round(best_tc, 2) if best_q else base_result["annual_total_cost"]
    base_result["candidates_evaluated"] = candidates
    base_result["formula"] = "All-units discount: evaluate TC at each price break, pick minimum"
    return base_result


def _eoq_incremental_discount(
    D: float, S: float, H: float, schedule: list[dict], base_result: dict
) -> dict[str, Any]:
    best_q = None
    best_tc = float("inf")
    candidates = []

    for i, tier in enumerate(schedule):
        b_i = tier["break_qty"]
        c_i = tier["unit_cost"]
        q_star = math.sqrt(2 * D * S / H)

        if q_star < b_i:
            q_candidate = b_i
        else:
            q_candidate = q_star

        purchase_cost = _incremental_purchase_cost(q_candidate, schedule)
        tc = (D / q_candidate) * S + (q_candidate / 2) * H + D * (purchase_cost / q_candidate)
        candidates.append({
            "tier_index": i,
            "unit_cost_at_tier": c_i,
            "avg_unit_cost": round(purchase_cost / q_candidate, 4),
            "order_quantity": round(q_candidate, 2),
            "total_cost": round(tc, 2),
        })
        if tc < best_tc:
            best_tc = tc
            best_q = q_candidate

    base_result["discount_type"] = "incremental"
    base_result["optimal_order_qty"] = round(best_q, 2) if best_q else round(math.sqrt(2 * D * S / H), 2)
    base_result["optimal_total_cost"] = round(best_tc, 2) if best_q else base_result["annual_total_cost"]
    base_result["candidates_evaluated"] = candidates
    base_result["formula"] = "Incremental discount: evaluate TC at each tier boundary, pick minimum"
    return base_result


def _incremental_purchase_cost(Q: float, schedule: list[dict]) -> float:
    total = 0.0
    for i, tier in enumerate(schedule):
        b_i = tier["break_qty"]
        c_i = tier["unit_cost"]
        if i < len(schedule) - 1:
            b_next = schedule[i + 1]["break_qty"]
        else:
            b_next = float("inf")
        units_in_tier = max(0, min(Q, b_next) - b_i)
        total += units_in_tier * c_i
    if Q > 0 and Q < schedule[0]["break_qty"]:
        total = Q * schedule[0]["unit_cost"]
    return total


def calculate_safety_stock(
    service_level: float,
    demand_std: float,
    lead_time_days: float,
    avg_daily_demand: float = 0.0,
    order_quantity: float = 0.0,
) -> dict[str, Any]:
    """Safety stock with flexible service level and Type 2 fill rate."""
    from ._helpers import norm_pdf, norm_cdf

    if not (0.50 <= service_level <= 0.9999):
        return {"error": "service_level 必须在 0.50 到 0.9999 之间"}
    if demand_std < 0:
        return {"error": "demand_std 不能为负"}
    if lead_time_days <= 0:
        return {"error": "lead_time_days 必须大于 0"}
    if avg_daily_demand < 0:
        return {"error": "avg_daily_demand 不能为负"}
    if order_quantity < 0:
        return {"error": "order_quantity 不能为负"}

    z = inv_norm(service_level)
    ss = z * demand_std * math.sqrt(lead_time_days)
    rop = avg_daily_demand * lead_time_days + ss

    result: dict[str, Any] = {
        "safety_stock": round(ss, 2),
        "reorder_point": round(rop, 2),
        "z_score": round(z, 4),
        "service_level": service_level,
        "formula": f"SS=Z({round(z, 4)})×σ({demand_std})×√LT({lead_time_days})",
    }

    if order_quantity > 0 and avg_daily_demand > 0:
        sigma_lt = demand_std * math.sqrt(lead_time_days)
        loss_z = norm_pdf(z) - z * (1 - norm_cdf(z))
        expected_shortage = sigma_lt * loss_z
        fill_rate = 1 - expected_shortage / order_quantity
        fill_rate = max(0.0, min(1.0, fill_rate))
        result["fill_rate_type2"] = round(fill_rate, 6)
        result["expected_shortage_per_cycle"] = round(expected_shortage, 4)
        result["expected_demand_per_cycle"] = round(order_quantity, 2)
        result["loss_function_z"] = round(loss_z, 6)
        result["sigma_lead_time"] = round(sigma_lt, 4)

    return result


def calculate_reorder_point(
    avg_daily_demand: float,
    demand_std: float,
    lead_time_days: float,
    lead_time_std: float = 0,
    service_level: float = 0.95,
    review_period_days: float = 0,
) -> dict[str, Any]:
    """Reorder point optimization. ROP = d̄×LT + SS."""
    if not (0.50 <= service_level <= 0.9999):
        return {"error": "service_level 必须在 0.50 到 0.9999 之间"}
    if avg_daily_demand <= 0:
        return {"error": "avg_daily_demand 必须大于 0"}
    if demand_std < 0:
        return {"error": "demand_std 不能为负"}
    if lead_time_days <= 0:
        return {"error": "lead_time_days 必须大于 0"}
    if lead_time_std < 0:
        return {"error": "lead_time_std 不能为负"}

    z = inv_norm(service_level)
    slt = math.sqrt(lead_time_days * demand_std ** 2 + avg_daily_demand ** 2 * lead_time_std ** 2)
    ss = z * slt
    dlt = avg_daily_demand * lead_time_days
    dr = avg_daily_demand * review_period_days
    rop = dlt + dr + ss
    out_val = dlt + dr + ss if review_period_days > 0 else 0

    return {
        "reorder_point": round(rop, 2),
        "safety_stock": round(ss, 2),
        "sigma_lt": round(slt, 2),
        "demand_during_lt": round(dlt, 2),
        "z_score": round(z, 4),
        "review_type": "定期盘点" if review_period_days > 0 else "连续盘点",
        "order_up_to": round(out_val, 2) if review_period_days > 0 else None,
        "formula": f"ROP=d̄×LT+d̄×R+Z×√(LT×σ_d²+d̄²×σ_LT²), Z={round(z, 4)}",
    }


def classify_abc_xyz(
    records: list[dict[str, Any]],
    abc_thresholds: Optional[list[float]] = None,
    xyz_thresholds: Optional[list[float]] = None,
) -> dict[str, Any]:
    """ABC-XYZ joint classification with customizable breakpoints."""
    if not records:
        return {"error": "records 不能为空"}

    if abc_thresholds is None:
        abc_thresholds = [0.80, 0.95]
    if xyz_thresholds is None:
        xyz_thresholds = [0.5, 1.0]

    if len(abc_thresholds) != 2:
        return {"error": "abc_thresholds 必须包含恰好 2 个值 (A/B, B/C 分界)"}
    if len(xyz_thresholds) != 2:
        return {"error": "xyz_thresholds 必须包含恰好 2 个值 (X/Y, Y/Z 分界)"}
    if not (0 < abc_thresholds[0] < abc_thresholds[1] < 1):
        return {"error": "abc_thresholds 必须 0 < t1 < t2 < 1"}
    if not (0 <= xyz_thresholds[0] < xyz_thresholds[1]):
        return {"error": "xyz_thresholds 必须 0 ≤ t1 < t2"}

    req = {"sku", "revenue", "demand_std", "avg_demand"}
    for r in records:
        m = req - set(r.keys())
        if m:
            return {"error": f"记录缺少字段: {m}, sku={r.get('sku', '?')}"}

    sr = sorted(records, key=lambda x: x["revenue"], reverse=True)
    tr = sum(r["revenue"] for r in sr)
    if tr <= 0:
        return {"error": "总 revenue 必须大于 0"}

    cum = 0.0
    for r in sr:
        cum += r["revenue"]
        ratio = cum / tr
        if ratio <= abc_thresholds[0]:
            r["_abc"] = "A"
        elif ratio <= abc_thresholds[1]:
            r["_abc"] = "B"
        else:
            r["_abc"] = "C"

    for r in sr:
        avg = r["avg_demand"]
        if avg <= 0:
            r["_xyz"] = "Z"
            continue
        cv = r["demand_std"] / avg
        if cv < xyz_thresholds[0]:
            r["_xyz"] = "X"
        elif cv < xyz_thresholds[1]:
            r["_xyz"] = "Y"
        else:
            r["_xyz"] = "Z"

    classification = [
        {
            "sku": r["sku"],
            "abc_class": r["_abc"],
            "xyz_class": r["_xyz"],
            "strategy": STRATEGY_MAP.get(r["_abc"] + r["_xyz"], "未定义"),
        }
        for r in sr
    ]

    return {
        "classification": classification,
        "abc_thresholds_used": abc_thresholds,
        "xyz_thresholds_used": xyz_thresholds,
        "formula": f"ABC按收入累计: A≤{abc_thresholds[0]*100:.0f}%, B≤{abc_thresholds[1]*100:.0f}%, C=其余; XYZ按CV: X<{xyz_thresholds[0]}, Y<{xyz_thresholds[1]}, Z=其余",
    }
