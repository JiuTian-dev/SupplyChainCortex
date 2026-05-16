"""Advanced planning: joint replenishment and forecast accuracy tracking."""

import math
from typing import Any
import numpy as np


def calculate_joint_replenishment(
    items: list[dict[str, float]],
    major_setup_cost: float,
    interest_rate: float = 0.25,
    detailed: bool = True,
) -> dict[str, Any]:
    """Joint Replenishment Problem (JRP): multiple items sharing a major setup cost.

    Each item i has: demand D_i, unit_cost C_i, minor_setup_cost A_i.
    All items share major_setup_cost S.
    Total holding cost rate r (annual interest rate).

    Optimal cycle: T* = sqrt(2(S + ΣA_i × m_i) / (r × Σ(C_i × D_i)))
    where m_i is the multiplier for item i (how many cycles between orders).

    Uses Goyal's iterative heuristic for the multiplier m_i.

    Parameters
    ----------
    items : list[dict]
        Each item: {"name": str, "annual_demand": float, "unit_cost": float,
                     "minor_setup_cost": float (optional, default 0)}.
    major_setup_cost : float
        Fixed cost per replenishment cycle shared by all items (S).
        E.g., truck dispatch, order processing.
    interest_rate : float
        Annual holding cost rate (0.20-0.35 typical). Default 0.25 = 25%.
    detailed : bool
        If True, show per-item breakdown.

    Returns
    -------
    dict with optimal_cycle, total_cost, joint vs independent comparison.
    """
    if not items:
        return {"error": "items 不能为空"}
    if major_setup_cost <= 0:
        return {"error": "major_setup_cost 必须大于 0"}
    if not (0.05 <= interest_rate <= 1.0):
        return {"error": "interest_rate 必须在 0.05 到 1.0 之间"}

    for i, item in enumerate(items):
        if "annual_demand" not in item or item["annual_demand"] <= 0:
            return {"error": f"items[{i}] 需要 annual_demand > 0"}
        if "unit_cost" not in item or item["unit_cost"] <= 0:
            return {"error": f"items[{i}] 需要 unit_cost > 0"}
        item.setdefault("minor_setup_cost", 0)
        item.setdefault("name", f"产品{i+1}")

    n = len(items)
    S = major_setup_cost
    r = interest_rate

    # Build arrays
    D = np.array([it["annual_demand"] for it in items], dtype=float)
    C = np.array([it["unit_cost"] for it in items], dtype=float)
    A = np.array([it.get("minor_setup_cost", 0) for it in items], dtype=float)
    names = [it.get("name", f"产品{i+1}") for i, it in enumerate(items)]

    # ─── Independent replenishment (each item alone) ───
    independent = []
    total_independent_cost = 0.0
    for i in range(n):
        setup_i = S + A[i]  # If ordered alone, bears all major + its minor
        h_i = r * C[i]
        eoq_i = math.sqrt(2 * D[i] * setup_i / h_i)
        order_cost_i = D[i] / eoq_i * setup_i
        holding_cost_i = eoq_i / 2 * h_i
        purchase_cost_i = D[i] * C[i]
        tc_i = order_cost_i + holding_cost_i
        total_independent_cost += tc_i
        independent.append({
            "name": names[i],
            "eoq": round(eoq_i, 2),
            "orders_per_year": round(D[i] / eoq_i, 2),
            "order_cost": round(order_cost_i, 2),
            "holding_cost": round(holding_cost_i, 2),
            "total_relevant_cost": round(tc_i, 2),
        })

    # ─── Joint replenishment — Goyal's heuristic ───
    # Step 1: Initialize m_i = 1 for all items
    m = np.ones(n, dtype=int)
    best_T = float("inf")
    best_m = m.copy()
    best_tc = float("inf")

    # Step 2: Iterate to convergence
    for iteration in range(20):
        # Compute optimal T given current m
        numerator = 2 * (S + np.sum(A / m))
        denominator = r * np.sum(D * C * m)
        if denominator > 0:
            T = math.sqrt(numerator / denominator)
        else:
            T = 1.0

        # Step 3: Update m_i for each item
        # For item i, the cost per unit time if ordered every k_i cycles:
        # TC_i(k_i) = (A_i / (k_i × T)) + (r × C_i × D_i × k_i × T / 2)
        # Optimal k_i: k* = sqrt(2A_i / (r × C_i × D_i × T²))
        changed = False
        for i in range(n):
            if A[i] > 0 and T > 0:
                k_star = math.sqrt(2 * A[i] / (r * C[i] * D[i] * T * T))
                # Round to nearest integer ≥ 1
                new_m = max(1, round(k_star))
                if new_m != m[i]:
                    m[i] = new_m
                    changed = True
            else:
                m[i] = 1

        # Compute total relevant cost with current m, T
        # TC = S/T + Σ[A_i/(m_i·T) + r·C_i·D_i·m_i·T/2]
        tc = S / T
        for i in range(n):
            tc += A[i] / (m[i] * T) + r * C[i] * D[i] * m[i] * T / 2

        if tc < best_tc:
            best_tc = tc
            best_T = T
            best_m = m.copy()

        if not changed:
            break

    T_opt = best_T

    # ─── Build per-item joint results ───
    joint_items = []
    total_joint_order_cost = S / T_opt
    total_joint_holding = 0.0
    for i in range(n):
        ki = int(best_m[i])
        item_order_cost = A[i] / (ki * T_opt)
        item_holding = r * C[i] * D[i] * ki * T_opt / 2
        order_qty = D[i] * ki * T_opt
        total_joint_holding += item_holding

        joint_items.append({
            "name": names[i],
            "multiplier_ki": ki,
            "order_every_n_cycles": ki,
            "order_quantity": round(order_qty, 2),
            "order_interval_days": round(ki * T_opt * 365, 1),
            "order_cost": round(item_order_cost, 2),
            "holding_cost": round(item_holding, 2),
            "total_relevant_cost": round(item_order_cost + item_holding, 2),
        })

    total_joint_cost = S / T_opt + total_joint_holding
    for i in range(n):
        total_joint_cost += A[i] / (best_m[i] * T_opt)

    # ─── Comparison ───
    savings = total_independent_cost - total_joint_cost
    savings_pct = (savings / total_independent_cost * 100) if total_independent_cost > 0 else 0
    # Adjustment: independent total already includes order cost, so subtract total_purchase
    # But actually independent_relevant = order_cost + holding_cost, same structure
    # Our independent correctly uses S + A_i per item

    result: dict[str, Any] = {
        "optimal_cycle_time_years": round(T_opt, 6),
        "optimal_cycle_time_days": round(T_opt * 365, 1),
        "major_setup_cost": S,
        "interest_rate": r,
        "num_items": n,
        "joint_total_relevant_cost": round(total_joint_cost, 2),
        "independent_total_relevant_cost": round(total_independent_cost, 2),
        "cost_savings": round(savings, 2),
        "cost_savings_pct": round(savings_pct, 2),
        "formula": f"JRP T*=√(2(S+ΣA_i/m_i)/(r·Σ(C_i·D_i·m_i)))={round(T_opt,6)}年, 节省{savings_pct:.1f}%",
    }

    if detailed:
        result["joint_items"] = joint_items
        result["independent_items"] = independent
        result["comparison_note"] = (
            f"联合补货每年总相关成本 ¥{round(total_joint_cost,2)}，"
            f"独立补货 ¥{round(total_independent_cost,2)}，"
            f"节省 ¥{round(savings,2)} ({savings_pct:.1f}%)"
        )

    return result


def calculate_forecast_accuracy(
    forecasts: list[dict[str, Any]],
    actuals: list[float],
    period_labels: list[str] = [],
) -> dict[str, Any]:
    """Multi-dimensional forecast accuracy tracking and diagnostics.

    Tracks accuracy over time, by SKU, detects bias trends, and identifies
    worst-performing items.

    Parameters
    ----------
    forecasts : list[dict]
        Each dict: {"sku": str, "category": str (optional),
                     "period_values": list[float]}  (forecast for each period).
        All must have same number of periods.
    actuals : list[float]
        Actual demand for each period (global, or per-SKU if sku-level).
        If per-SKU, use the "period_values" approach above.
    period_labels : list[str]
        Labels for each period (e.g., ["Jan", "Feb", ...]).

    Returns
    -------
    dict with overall accuracy, per-period tracking, bias analysis,
    worst performers, trending direction, and method recommendations.
    """
    if not forecasts:
        return {"error": "forecasts 不能为空"}
    if not actuals:
        return {"error": "actuals 不能为空"}

    arr_actuals = np.array(actuals, dtype=float)
    n_periods = len(arr_actuals)

    # Validate all forecasts have correct length
    for i, fc in enumerate(forecasts):
        if "period_values" not in fc:
            return {"error": f"forecasts[{i}] 缺少 period_values"}
        if len(fc["period_values"]) != n_periods:
            return {"error": f"forecasts[{i}]({fc.get('sku','?')}) period_values 长度({len(fc['period_values'])})与 actuals({n_periods})不匹配"}
        fc.setdefault("sku", f"SKU-{i+1}")
        fc.setdefault("category", "未分类")

    if not period_labels:
        period_labels = [f"期{t+1}" for t in range(n_periods)]

    # ─── Aggregate forecast (sum across all SKUs per period) ───
    agg_forecast = np.zeros(n_periods)
    for fc in forecasts:
        agg_forecast += np.array(fc["period_values"], dtype=float)

    # ─── Overall metrics ───
    residuals = arr_actuals - agg_forecast
    abs_residuals = np.abs(residuals)
    mad = float(np.mean(abs_residuals))
    rmse = float(np.sqrt(np.mean(residuals ** 2)))
    bias = float(np.mean(residuals))  # positive = forecast too low
    bias_pct = bias / float(np.mean(arr_actuals)) * 100 if np.mean(arr_actuals) > 0 else 0

    mask = arr_actuals > 0
    mape = float(np.mean(abs_residuals[mask] / arr_actuals[mask])) * 100 if mask.any() else 0.0

    # MASE: MAE / MAE of naive forecast
    if n_periods > 1:
        naive_errors = np.abs(np.diff(arr_actuals))
        mae_naive = float(np.mean(naive_errors))
        mase = mad / mae_naive if mae_naive > 0 else float("inf")
    else:
        mase = float("inf")

    # Weighted MAPE (wMAPE): sum of absolute errors / sum of actuals
    wmape = float(np.sum(abs_residuals) / np.sum(arr_actuals)) * 100 if np.sum(arr_actuals) > 0 else 0

    # ─── Per-period tracking ───
    period_details = []
    cum_mad = 0.0
    for t in range(n_periods):
        err = residuals[t]
        ape = abs(err) / arr_actuals[t] * 100 if arr_actuals[t] > 0 else 0
        cum_mad += abs(err)

        period_details.append({
            "period": period_labels[t],
            "actual": round(float(arr_actuals[t]), 2),
            "forecast": round(float(agg_forecast[t]), 2),
            "error": round(float(err), 2),
            "abs_pct_error": round(ape, 2),
            "direction": "偏高(FC>实际)" if err < 0 else ("偏低(FC<实际)" if err > 0 else "准确"),
            "cumulative_mad": round(cum_mad, 2),
        })

    # ─── Bias trend detection (using last ~30% of periods vs first ~30%) ───
    split = max(2, n_periods // 3)
    early_bias = float(np.mean(residuals[:split])) if split > 0 else 0.0
    late_bias = float(np.mean(residuals[max(split*2, split+1):])) if n_periods > split + 1 else early_bias

    bias_trend = "稳定" if abs(late_bias - early_bias) < mad * 0.2 else (
        "恶化中" if abs(late_bias) > abs(early_bias) else "改善中"
    )

    # ─── Tracking signal (cumulative error / MAD) ───
    tracking_signals = []
    cum_err = 0.0
    cum_mad_val = 0.0
    for t in range(n_periods):
        cum_err += residuals[t]
        cum_mad_val += abs(residuals[t])
        ts = cum_err / (cum_mad_val / (t + 1)) if cum_mad_val > 0 else 0
        tracking_signals.append(round(float(ts), 4))
    latest_ts = tracking_signals[-1] if tracking_signals else 0

    # ─── Per-SKU accuracy ───
    sku_accuracy = []
    for fc in forecasts:
        vals = np.array(fc["period_values"], dtype=float)
        sku_res = arr_actuals - vals
        sku_mad = float(np.mean(np.abs(sku_res))) if len(sku_res) > 0 else 0.0
        sku_mask = arr_actuals > 0
        sku_mape = float(np.mean(np.abs(sku_res[sku_mask]) / arr_actuals[sku_mask])) * 100 if sku_mask.any() and len(sku_res[sku_mask]) > 0 else 0.0
        sku_bias = float(np.mean(sku_res)) if len(sku_res) > 0 else 0.0

        sku_accuracy.append({
            "sku": fc["sku"],
            "category": fc.get("category", ""),
            "mad": round(sku_mad, 2),
            "mape": round(sku_mape, 2),
            "bias": round(sku_bias, 2),
            "bias_direction": "系统性低估" if sku_bias > mad * 0.5 else (
                "系统性高估" if sku_bias < -mad * 0.5 else "无明显偏差"
            ),
            "accuracy_grade": "A-优秀" if sku_mape < 10 else (
                "B-良好" if sku_mape < 20 else (
                    "C-一般" if sku_mape < 30 else "D-需改进"
                )
            ),
        })

    # Sort: worst accuracy first
    sku_accuracy.sort(key=lambda x: x["mape"], reverse=True)

    # ─── Method recommendation ───
    recommendation = ""
    if mape < 10 and mase < 0.5:
        recommendation = "预测非常准确(综合MAPE<10%, MASE<0.5)。当前方法表现优秀，建议保持并定期监控。"
    elif bias_trend == "恶化中":
        recommendation = f"预测偏差在恶化(tracking signal={latest_ts:.2f})。建议: (1)检查需求模式是否发生结构性变化，(2)考虑Winters季节方法捕捉季节性，(3)对间歇性SKU使用Croston方法。"
    elif abs(latest_ts) > 4:
        recommendation = f"追踪信号(TS={latest_ts:.1f})超出±4阈值！预测存在系统性偏差，建议立即审查: (1)数据是否有离群值，(2)模型是否需要重新训练。"
    elif mape < 20:
        recommendation = "预测质量可接受(MAPE<20%)。建议: 对MAPE>20%的SKU尝试不同方法(ES vs Winters)，并关注追踪信号趋势。"
    else:
        recommendation = f"预测误差较大(MAPE={mape:.1f}%)。建议: (1)分SKU分析偏差来源，(2)尝试多方法对比选最优，(3)缩短预测周期降低不确定性。"

    worst_skus = [s for s in sku_accuracy if s["mape"] >= 30][:5]

    return {
        "overall_metrics": {
            "mad": round(mad, 2),
            "mape": round(mape, 2),
            "wmape": round(wmape, 2),
            "rmse": round(rmse, 2),
            "mase": round(mase, 4),
            "bias": round(bias, 2),
            "bias_pct": round(bias_pct, 2),
        },
        "num_periods": n_periods,
        "num_skus": len(forecasts),
        "bias_trend": bias_trend,
        "bias_trend_detail": f"早期偏差均值: {round(early_bias,2)}, 近期偏差均值: {round(late_bias,2)}",
        "tracking_signal": round(latest_ts, 4),
        "tracking_signal_alert": abs(latest_ts) > 4,
        "tracking_signal_history": tracking_signals,
        "period_details": period_details,
        "sku_accuracy": sku_accuracy,
        "worst_performing_skus": worst_skus,
        "worst_skus_count": len(worst_skus),
        "accuracy_distribution": {
            "A_优秀": sum(1 for s in sku_accuracy if s["accuracy_grade"].startswith("A")),
            "B_良好": sum(1 for s in sku_accuracy if s["accuracy_grade"].startswith("B")),
            "C_一般": sum(1 for s in sku_accuracy if s["accuracy_grade"].startswith("C")),
            "D_需改进": sum(1 for s in sku_accuracy if s["accuracy_grade"].startswith("D")),
        },
        "recommendation": recommendation,
        "formula": "MAD/MAPE/RMSE/MASE/Bias/WMAPE, 追踪信号TS=累计偏差/MAD, |TS|>4=报警",
    }
