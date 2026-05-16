"""Finance: total cost model and supplier scoring."""

import math
from typing import Any
from ._helpers import inv_norm


def calculate_total_cost(
    annual_demand: float,
    order_cost: float,
    holding_cost_per_unit: float,
    unit_cost: float,
    stockout_cost_per_unit: float = 0,
    service_level: float = 0.95,
    demand_std: float = 0,
    lead_time_days: float = 0,
) -> dict[str, Any]:
    """Total supply chain cost model. EOQ = √(2DS/H)."""
    if annual_demand <= 0 or order_cost <= 0 or holding_cost_per_unit <= 0 or unit_cost <= 0:
        return {"error": "annual_demand/order_cost/holding_cost/unit_cost 必须大于 0"}

    eoq = math.sqrt(2 * annual_demand * order_cost / holding_cost_per_unit)
    oc = annual_demand / eoq * order_cost
    hc = eoq / 2 * holding_cost_per_unit
    pc = annual_demand * unit_cost
    ss = 0.0
    sc = 0.0
    if demand_std > 0 and lead_time_days > 0:
        z = inv_norm(service_level)
        ss = z * demand_std * math.sqrt(lead_time_days)
    if stockout_cost_per_unit > 0:
        sc = (1 - service_level) * annual_demand * stockout_cost_per_unit
    tc = oc + hc + pc + sc
    bp = {k: round(v / tc * 100, 2) for k, v in [("ordering", oc), ("holding", hc), ("purchase", pc), ("stockout", sc)] if v > 0}

    return {
        "eoq": round(eoq, 2),
        "ordering_cost": round(oc, 2),
        "holding_cost": round(hc, 2),
        "purchase_cost": round(pc, 2),
        "safety_stock": round(ss, 2),
        "stockout_cost": round(sc, 2),
        "total_cost": round(tc, 2),
        "cost_breakdown": bp,
        "formula": "EOQ=√(2DS/H), TC=订货+持有+采购+缺货",
    }


def calculate_supplier_scoring(suppliers: list[dict[str, Any]]) -> dict[str, Any]:
    """Supplier scoring. Weighted: quality 0.30 / delivery 0.25 / cost 0.20 / service 0.15 / flexibility 0.10."""
    if not suppliers:
        return {"error": "suppliers 不能为空"}

    dims = ["quality_score", "delivery_score", "cost_score", "service_score", "flexibility_score"]
    labels = {"quality_score": "质量", "delivery_score": "交付", "cost_score": "成本", "service_score": "服务", "flexibility_score": "柔性"}
    w = {"quality_score": 0.30, "delivery_score": 0.25, "cost_score": 0.20, "service_score": 0.15, "flexibility_score": 0.10}

    for i, s in enumerate(suppliers):
        if "name" not in s or not s["name"]:
            return {"error": f"供应商{i}缺少 name"}
        for d in dims:
            if d not in s:
                return {"error": f"供应商{i}({s.get('name', '?')})缺少 {d}"}
            if not (0 <= s[d] <= 100):
                return {"error": f"供应商{i}({s['name']})的 {d} 必须在0-100之间"}

    results = [
        {
            "name": s["name"],
            "total_score": round(sum(s[d] * w[d] for d in dims), 2),
            "grade": "A" if sum(s[d] * w[d] for d in dims) >= 85 else ("B" if sum(s[d] * w[d] for d in dims) >= 70 else ("C" if sum(s[d] * w[d] for d in dims) >= 55 else "D")),
            "strength": labels[max(dims, key=lambda d: s[d])],
            "weakness": labels[min(dims, key=lambda d: s[d])],
        }
        for s in suppliers
    ]

    for rank, (idx, _) in enumerate(sorted(enumerate(results), key=lambda x: x[1]["total_score"], reverse=True), 1):
        results[idx]["rank"] = rank

    best = max(results, key=lambda x: x["total_score"])["name"]
    avg = round(sum(r["total_score"] for r in results) / len(results), 2)
    dist = {"A": 0, "B": 0, "C": 0, "D": 0}
    for r in results:
        dist[r["grade"]] += 1

    a_c = dist["A"]
    rec = (
        "所有供应商均为A级，建议维持现有合作并定期复评" if a_c == len(suppliers)
        else (f"存在{dist['D']}个D级供应商，建议评估替换或改进计划" if dist["D"] > 0
              else ("过半供应商为A级，可考虑增加采购集中度以获批量折扣" if a_c >= len(suppliers) // 2
                    else "供应商水平参差，建议制定差异化管理策略并加强B/C级供应商考核"))
    )

    return {
        "suppliers": results,
        "best_supplier": best,
        "average_score": avg,
        "score_distribution": dist,
        "recommendation": rec,
        "formula": "加权评分: 质量×0.30+交付×0.25+成本×0.20+服务×0.15+柔性×0.10",
    }
