"""Simulation: Monte Carlo inventory simulation."""

from typing import Any
import numpy as np


def monte_carlo_inventory(
    avg_daily_demand: float,
    demand_std: float,
    lead_time_days: float,
    lead_time_std: float,
    reorder_point: float,
    order_qty: float,
    simulations: int = 1000,
    days: int = 365,
) -> dict[str, Any]:
    """Monte Carlo inventory simulation. (Q,R) continuous review."""
    if min(avg_daily_demand, lead_time_days, reorder_point, order_qty) <= 0 or \
       min(demand_std, lead_time_std) < 0 or simulations < 100 or days < 30:
        return {"error": "参数无效: 正向>0, std≥0, sim≥100, days≥30"}

    rng = np.random.default_rng(42)
    sd = []
    ei = []
    op = []

    for _ in range(simulations):
        inv = reorder_point
        p = -1
        s = 0
        c = 0
        for _ in range(days):
            if p > 0 and (p := p - 1) == 0:
                inv += order_qty
                p = -1
            inv -= max(0, float(rng.normal(avg_daily_demand, demand_std)))
            if inv <= reorder_point and p < 0:
                p = max(1, round(float(rng.normal(lead_time_days, lead_time_std))))
                c += 1
            if inv < 0:
                s += 1
        sd.append(s)
        ei.append(max(0, inv))
        op.append(c)

    a = round(float(np.mean(sd)), 2)
    return {
        "avg_stockout_days": a,
        "avg_service_level": round((1 - a / days) * 100, 2),
        "stockout_probability": round(sum(1 for x in sd if x > 0) / simulations * 100, 2),
        "avg_end_inventory": round(float(np.mean(ei)), 2),
        "avg_orders_placed": round(float(np.mean(op)), 2),
        "formula": "蒙特卡洛(Q,R)连续盘点仿真",
    }
