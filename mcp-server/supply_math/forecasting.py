"""Demand forecasting: SMA, exponential smoothing, linear trend, Winters, Croston."""

import math
from typing import Any, Optional
import numpy as np
from ._helpers import inv_norm


def forecast_demand(
    demand_history: list[float],
    periods: int,
    alpha: float = 0.3,
    beta: float = 0.1,
    gamma: float = 0.2,
    season_length: int = 0,
    method: str = "all",
    confidence_levels: Optional[list[float]] = None,
) -> dict[str, Any]:
    """Multi-method demand forecasting with error metrics and confidence intervals."""
    if len(demand_history) < 3:
        return {"error": "demand_history 至少需要 3 个数据点"}
    if periods < 1:
        return {"error": "periods 必须为正整数"}
    if not (0 < alpha < 1):
        return {"error": "alpha 必须在 (0, 1) 之间"}
    if not (0 < beta < 1):
        return {"error": "beta 必须在 (0, 1) 之间"}
    if not (0 < gamma < 1):
        return {"error": "gamma 必须在 (0, 1) 之间"}
    if confidence_levels is None:
        confidence_levels = [0.80, 0.90, 0.95]

    arr = np.array(demand_history, dtype=float)
    n = len(arr)
    result: dict[str, Any] = {}

    def compute_metrics(actuals: np.ndarray, fitted: np.ndarray) -> dict[str, float]:
        residuals = actuals - fitted
        mad = float(np.mean(np.abs(residuals)))
        mask = actuals != 0
        mape = float(np.mean(np.abs(residuals[mask] / actuals[mask]))) * 100 if mask.any() else 0.0
        rmse = float(np.sqrt(np.mean(residuals ** 2)))
        bias = float(np.mean(residuals))
        if n > 1:
            naive_errors = np.abs(np.diff(arr))
            mae_naive = float(np.mean(naive_errors)) if len(naive_errors) > 0 else 1.0
            mase = mad / mae_naive if mae_naive > 0 else float("inf")
        else:
            mase = float("inf")
        return {"mad": round(mad, 4), "mape": round(mape, 4), "rmse": round(rmse, 4),
                "mase": round(mase, 4), "bias": round(bias, 4)}

    def compute_ci(fc_values: list[float], stderr: float) -> dict[str, list[list[float]]]:
        ci_result: dict[str, list[list[float]]] = {}
        for cl in confidence_levels:
            z_val = inv_norm(0.5 + cl / 2)
            label = f"ci_{int(cl * 100)}"
            ci_result[label] = [[round(fc - z_val * stderr, 2), round(fc + z_val * stderr, 2)] for fc in fc_values]
        return ci_result

    # --- Simple Moving Average ---
    if method in ("all", "sma"):
        last_ma = float(np.mean(arr[-3:]))
        ma_fc = [round(last_ma, 2)] * periods
        fitted_ma = np.full(n, np.nan)
        for i in range(2, n):
            fitted_ma[i] = float(np.mean(arr[i - 2:i + 1]))
        valid = ~np.isnan(fitted_ma)
        metrics_ma = compute_metrics(arr[valid], fitted_ma[valid]) if valid.sum() > 1 else {}
        stderr_ma = float(np.std(arr[valid] - fitted_ma[valid])) if valid.sum() > 1 else float(np.std(arr))
        result["moving_average"] = {
            "forecast": ma_fc, "method": "SMA(3)", "metrics": metrics_ma,
            "confidence_intervals": compute_ci(ma_fc, stderr_ma),
        }

    # --- Exponential Smoothing ---
    if method in ("all", "es"):
        es = float(arr[0])
        es_vals = np.empty(n)
        es_vals[0] = arr[0]
        for i in range(1, n):
            es = alpha * arr[i] + (1 - alpha) * es
            es_vals[i] = es
        es_fc = [round(float(es), 2)] * periods
        metrics_es = compute_metrics(arr[1:], es_vals[1:])
        stderr_es = float(np.std(arr[1:] - es_vals[1:]))
        result["exponential_smoothing"] = {
            "forecast": es_fc, "method": f"ES(α={alpha})", "alpha": alpha,
            "metrics": metrics_es, "confidence_intervals": compute_ci(es_fc, stderr_es),
        }

    # --- Linear Trend ---
    if method in ("all", "linear_trend"):
        x = np.arange(n, dtype=float)
        a, b = np.polyfit(x, arr, 1)
        lt_fc = [round(float(a * (n + i) + b), 2) for i in range(periods)]
        fitted_lt = a * x + b
        metrics_lt = compute_metrics(arr, fitted_lt)
        stderr_lt = float(np.std(arr - fitted_lt))
        result["linear_trend"] = {
            "forecast": lt_fc, "method": "Linear Regression",
            "slope": round(float(a), 4), "intercept": round(float(b), 4),
            "metrics": metrics_lt, "confidence_intervals": compute_ci(lt_fc, stderr_lt),
        }

    # --- Winters Triple Exponential Smoothing ---
    if method in ("all", "winters") and season_length > 0:
        if n < 2 * season_length:
            result["winters"] = {"error": f"Winters 需要至少 {2 * season_length} 个数据点"}
        else:
            winters_result = _winters_forecast(arr, alpha, beta, gamma, season_length, periods)
            if "error" not in winters_result:
                w_fc = winters_result["forecast"]
                fitted_w = winters_result["fitted"]
                metrics_w = compute_metrics(arr[season_length:], fitted_w[season_length:])
                stderr_w = float(np.std(arr[season_length:] - fitted_w[season_length:]))
                result["winters"] = {
                    "forecast": w_fc, "method": f"Winters(α={alpha}, β={beta}, γ={gamma}, season={season_length})",
                    "seasonal_indices": winters_result["seasonal_indices"],
                    "metrics": metrics_w, "confidence_intervals": compute_ci(w_fc, stderr_w),
                }
            else:
                result["winters"] = winters_result
    elif method == "winters" and season_length <= 0:
        result["winters"] = {"error": "Winters 方法需要 season_length > 0"}

    # --- Croston's Method ---
    if method in ("all", "croston"):
        croston_result = _croston_forecast(arr, alpha)
        c_fc = [round(croston_result["forecast"], 2)] * periods
        metrics_c = croston_result["metrics"]
        stderr_c = croston_result.get("stderr", float(np.std(arr)))
        result["croston"] = {
            "forecast": c_fc, "method": f"Croston(α={alpha})",
            "intermittent_ratio": round(croston_result["intermittent_ratio"], 4),
            "metrics": metrics_c, "confidence_intervals": compute_ci(c_fc, stderr_c),
        }

    result["periods_forecasted"] = periods
    result["data_points"] = n
    result["confidence_levels"] = confidence_levels
    result["formula"] = "SMA(3), ES(α), Linear Trend, Winters(α,β,γ), Croston(α); 误差: MAD/MAPE/RMSE/MASE/Bias"
    return result


def _winters_forecast(
    arr: np.ndarray, alpha: float, beta: float, gamma: float,
    season_length: int, periods: int,
) -> dict[str, Any]:
    """Winters Triple Exponential Smoothing (multiplicative seasonality)."""
    n = len(arr)
    season_avgs = [float(np.mean(arr[s * season_length:(s + 1) * season_length]))
                   for s in range(n // season_length)]

    seasonal_indices = np.ones(season_length)
    for j in range(season_length):
        si_sum = 0.0
        count = 0
        for s in range(len(season_avgs)):
            idx = s * season_length + j
            if idx < n and season_avgs[s] > 0:
                si_sum += arr[idx] / season_avgs[s]
                count += 1
        if count > 0:
            seasonal_indices[j] = si_sum / count

    si_mean = float(np.mean(seasonal_indices))
    if si_mean > 0:
        seasonal_indices = seasonal_indices / si_mean

    level = float(arr[0]) / seasonal_indices[0] if seasonal_indices[0] != 0 else float(arr[0])
    trend = 0.0
    if n >= 2 * season_length:
        level2 = float(np.mean(arr[season_length:2 * season_length])) / float(np.mean(seasonal_indices))
        level1 = float(np.mean(arr[:season_length])) / float(np.mean(seasonal_indices))
        trend = (level2 - level1) / season_length

    fitted = np.zeros(n)
    si_list = list(seasonal_indices)

    for t in range(n):
        s_idx = t % season_length
        fitted[t] = (level + trend) * si_list[s_idx]
        if t < n:
            new_level = alpha * (arr[t] / si_list[s_idx] if si_list[s_idx] != 0 else arr[t]) + (1 - alpha) * (level + trend)
            new_trend = beta * (new_level - level) + (1 - beta) * trend
            new_si = gamma * (arr[t] / new_level if new_level != 0 else 0) + (1 - gamma) * si_list[s_idx]
            level = new_level
            trend = new_trend
            si_list[s_idx] = new_si

    fc = [(level + m * trend) * si_list[(n + m - 1) % season_length] for m in range(1, periods + 1)]
    return {
        "forecast": [round(float(max(0, v)), 2) for v in fc],
        "fitted": fitted,
        "seasonal_indices": [round(float(si), 4) for si in seasonal_indices],
    }


def _croston_forecast(arr: np.ndarray, alpha: float) -> dict[str, Any]:
    """Croston's method for intermittent demand forecasting."""
    n = len(arr)
    nonzero_mask = arr > 0
    nonzero_count = int(np.sum(nonzero_mask))
    intermittent_ratio = 1 - (nonzero_count / n) if n > 0 else 0

    z = float(arr[0]) if arr[0] > 0 else 0.0
    p = 1.0
    q = 1
    fitted = np.zeros(n)
    fitted[0] = z / p if p > 0 else 0.0

    for t in range(1, n):
        q += 1
        if arr[t] > 0:
            z = alpha * arr[t] + (1 - alpha) * z
            p = alpha * q + (1 - alpha) * p
            q = 0
        fitted[t] = z / p if p > 0 else 0.0

    forecast_val = z / p if p > 0 else 0.0
    residuals = arr - fitted
    mad = float(np.mean(np.abs(residuals)))
    mask = arr != 0
    mape = float(np.mean(np.abs(residuals[mask] / arr[mask]))) * 100 if mask.any() else 0.0
    rmse = float(np.sqrt(np.mean(residuals ** 2)))
    bias = float(np.mean(residuals))
    if n > 1:
        naive_errors = np.abs(np.diff(arr))
        mae_naive = float(np.mean(naive_errors))
        mase = mad / mae_naive if mae_naive > 0 else float("inf")
    else:
        mase = float("inf")

    return {
        "forecast": round(forecast_val, 4),
        "intermittent_ratio": intermittent_ratio,
        "metrics": {"mad": round(mad, 4), "mape": round(mape, 4), "rmse": round(rmse, 4),
                    "mase": round(mase, 4), "bias": round(bias, 4)},
        "stderr": float(np.std(residuals)),
    }


def calculate_seasonal_decompose(
    demand_history: list[float],
    period_length: int,
) -> dict[str, Any]:
    """Seasonal decomposition using ratio-to-moving-average method."""
    if not demand_history:
        return {"error": "demand_history 不能为空"}
    if period_length < 2:
        return {"error": "period_length 必须大于 1"}
    if len(demand_history) < 2 * period_length:
        return {"error": f"demand_history 至少需要 {2 * period_length} 个数据点"}
    for i, d in enumerate(demand_history):
        if d < 0:
            return {"error": f"demand_history[{i}] 不能为负"}

    arr = np.array(demand_history, dtype=float)
    n = len(arr)

    # Step 1: Centered moving average
    if period_length % 2 == 0:
        ma = np.full(n, np.nan)
        half = period_length // 2
        for t in range(half, n - half):
            ma[t] = np.mean(arr[t - half:t + half])
        cma = np.full(n, np.nan)
        for t in range(half, n - half):
            cma[t] = (ma[t] + ma[t + 1]) / 2 if not np.isnan(ma[t + 1]) else ma[t]
    else:
        half = period_length // 2
        cma = np.full(n, np.nan)
        for t in range(half, n - half):
            cma[t] = np.mean(arr[t - half:t + half + 1])

    # Step 2: Ratios
    ratios = np.full(n, np.nan)
    for t in range(n):
        if not np.isnan(cma[t]) and cma[t] != 0:
            ratios[t] = arr[t] / cma[t]

    # Step 3: Average seasonal indices
    seasonal_indices = np.ones(period_length)
    for s in range(period_length):
        values = [ratios[t] for t in range(s, n, period_length) if not np.isnan(ratios[t])]
        if values:
            seasonal_indices[s] = np.mean(values)

    si_mean = float(np.mean(seasonal_indices))
    if si_mean > 0:
        seasonal_indices = seasonal_indices / si_mean

    # Step 4: Deseasonalize
    deseasonalized = np.zeros(n)
    for t in range(n):
        s = t % period_length
        deseasonalized[t] = arr[t] / seasonal_indices[s] if seasonal_indices[s] != 0 else arr[t]

    # Step 5: Trend
    x = np.arange(n, dtype=float)
    slope, intercept = np.polyfit(x, deseasonalized, 1)
    trend = slope * x + intercept

    # Step 6: Forecast next cycle
    next_cycle_forecast = []
    for m in range(period_length):
        t_future = n + m
        trend_val = slope * t_future + intercept
        forecast_val = trend_val * seasonal_indices[m % period_length]
        next_cycle_forecast.append(round(float(max(0, forecast_val)), 2))

    return {
        "trend": [round(float(v), 2) for v in trend],
        "seasonal_indices": [round(float(si), 4) for si in seasonal_indices],
        "deseasonalized_demand": [round(float(v), 2) for v in deseasonalized],
        "centered_moving_avg": [round(float(v), 2) if not np.isnan(v) else None for v in cma],
        "trend_slope": round(float(slope), 4),
        "trend_intercept": round(float(intercept), 4),
        "next_cycle_forecast": next_cycle_forecast,
        "period_length": period_length,
        "data_points": n,
        "seasons_available": n // period_length,
        "formula": "季节分解(比率移动平均法): CMA→比率→平均季节指数→去季节化→趋势回归→预测=趋势×季节指数",
    }
