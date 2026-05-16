"""Production economics: learning curve and break-even analysis."""

import math
from typing import Any


def calculate_learning_curve(
    first_unit_cost: float,
    cumulative_units: int,
    learning_rate: float,
    current_cumulative: int = 0,
    detailed: bool = True,
) -> dict[str, Any]:
    """Wright's learning curve model: unit cost decreases as cumulative production grows.

    Y = a × X^b
      where b = log(learning_rate) / log(2)
            a = first unit cost
            X = cumulative units

    Parameters
    ----------
    first_unit_cost : float
        Cost of the very first unit produced.
    cumulative_units : int
        Target cumulative production quantity to project to.
    learning_rate : float
        Learning rate (0.70-0.95). E.g., 0.85 = 85% learning curve,
        meaning each doubling reduces unit cost by 15%.
    current_cumulative : int
        Current cumulative units already produced (for "where are we now").
        0 means starting from the very first unit.
    detailed : bool
        If True, output cost trajectory at key milestones.

    Returns
    -------
    dict with unit cost projections, average costs, total costs, and trajectory.
    """
    if first_unit_cost <= 0:
        return {"error": "first_unit_cost 必须大于 0"}
    if cumulative_units < 1:
        return {"error": "cumulative_units 必须为正整数"}
    if not (0.50 <= learning_rate <= 0.99):
        return {"error": "learning_rate 必须在 0.50 到 0.99 之间，常见值: 0.70-0.95"}
    if current_cumulative < 0:
        return {"error": "current_cumulative 不能为负"}

    b = math.log(learning_rate) / math.log(2)  # learning exponent (negative)

    # Cost of unit X: Y = a * X^b
    def unit_cost(x: int) -> float:
        return first_unit_cost * (x ** b)

    # Average cost of first X units: a * X^b / (1 + b) approximately
    def avg_cost(x: int) -> float:
        if x == 0:
            return first_unit_cost
        # Integral approximation: ∫₀ˣ a·t^b dt / x = a/(1+b) · x^b
        return first_unit_cost / (1 + b) * (x ** b)

    # Total cost of first X units
    def total_cost(x: int) -> float:
        return avg_cost(x) * x

    # If starting from current_cumulative, the Nth unit is current_cumulative + N
    start_x = max(1, current_cumulative)

    # Key projections
    first_unit = unit_cost(max(1, start_x))  # cost of "next" unit
    target_unit_cost = unit_cost(cumulative_units)
    avg_unit_cost = total_cost(cumulative_units) / cumulative_units

    # How many doublings from start to target
    doublings_needed = math.log2(cumulative_units / max(1, start_x)) if start_x > 0 else math.log2(cumulative_units)
    cost_reduction_pct = (1 - target_unit_cost / first_unit) * 100 if first_unit > 0 else 0

    # Learning investment ROI: how much cheaper is unit N vs unit 1
    unit1_cost = unit_cost(1)
    total_without_learning = unit1_cost * cumulative_units
    total_with_learning = total_cost(cumulative_units)
    learning_savings = total_without_learning - total_with_learning

    result: dict[str, Any] = {
        "learning_rate": learning_rate,
        "learning_exponent": round(b, 6),
        "target_cumulative_units": cumulative_units,
        "first_unit_cost": round(first_unit_cost, 2),
        "target_unit_cost": round(target_unit_cost, 2),
        "cost_reduction_pct": round(cost_reduction_pct, 2),
        "average_unit_cost": round(avg_unit_cost, 2),
        "total_production_cost": round(total_with_learning, 2),
        "total_without_learning": round(total_without_learning, 2),
        "learning_savings": round(learning_savings, 2),
        "learning_savings_pct": round(learning_savings / total_without_learning * 100, 2) if total_without_learning > 0 else 0,
        "doublings_needed": round(doublings_needed, 2),
        "formula": f"Y=a·X^b, b=ln({learning_rate})/ln(2)={round(b,4)}, 经验: 每翻倍产量, 单位成本降至原有{learning_rate*100:.0f}%",
    }

    if detailed and cumulative_units >= 2:
        trajectory = []
        # Key milestones: 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, ...
        milestones = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000]
        for m in milestones:
            if m <= cumulative_units:
                uc = unit_cost(m)
                ac = avg_cost(m)
                trajectory.append({
                    "cumulative_units": m,
                    "unit_cost": round(uc, 2),
                    "avg_cost": round(ac, 2),
                    "pct_of_first": round(uc / first_unit_cost * 100, 2),
                    "total_cost": round(ac * m, 2),
                })
        result["trajectory"] = trajectory

    if current_cumulative > 0:
        # Cost of the NEXT unit (current + 1) vs target
        next_unit_cost = unit_cost(current_cumulative + 1)
        result["current_cumulative"] = current_cumulative
        result["current_unit_cost"] = round(unit_cost(current_cumulative), 2)
        result["next_unit_cost"] = round(next_unit_cost, 2)
        result["remaining_to_target"] = cumulative_units - current_cumulative
        result["cost_to_go"] = round(total_cost(cumulative_units) - total_cost(current_cumulative), 2)

    return result


def calculate_break_even(
    fixed_costs: float,
    unit_price: float,
    unit_variable_cost: float,
    target_profit: float = 0,
    depreciation: float = 0,
    tax_rate: float = 0,
    scenarios: list[dict[str, float]] = [],
) -> dict[str, Any]:
    """Break-even analysis with multi-product and scenario support.

    Parameters
    ----------
    fixed_costs : float
        Total fixed costs per period (rent, salaries, depreciation, etc.).
    unit_price : float
        Selling price per unit.
    unit_variable_cost : float
        Variable cost per unit (materials, direct labor, shipping).
    target_profit : float
        Desired profit (after tax if tax_rate > 0). 0 = break-even.
    depreciation : float
        Depreciation included in fixed costs (for cash break-even).
    tax_rate : float
        Tax rate (0-1). 0 = no tax.
    scenarios : list[dict], optional
        What-if scenarios. Each: {"label": str, "price": float, "vc": float, "fc": float}.
        At least one field per scenario.

    Returns
    -------
    dict with BEP units, BEP revenue, cash BEP, margin of safety, scenarios.
    """
    if unit_price <= 0:
        return {"error": "unit_price 必须大于 0"}
    if unit_variable_cost < 0:
        return {"error": "unit_variable_cost 不能为负"}
    if fixed_costs < 0:
        return {"error": "fixed_costs 不能为负"}
    if unit_price <= unit_variable_cost:
        return {"error": f"单价({unit_price})必须大于变动成本({unit_variable_cost})，否则永远无法盈亏平衡"}
    if not (0 <= tax_rate <= 1):
        return {"error": "tax_rate 必须在 0 到 1 之间"}
    if depreciation < 0:
        return {"error": "depreciation 不能为负"}

    cm = unit_price - unit_variable_cost  # contribution margin per unit
    cm_ratio = cm / unit_price  # contribution margin ratio

    # Accounting break-even
    bep_units = fixed_costs / cm
    bep_revenue = bep_units * unit_price

    # Cash break-even (excludes non-cash charges like depreciation)
    cash_fixed = max(0, fixed_costs - depreciation)
    cash_bep_units = cash_fixed / cm if cm > 0 else float("inf")
    cash_bep_revenue = cash_bep_units * unit_price

    # Target profit volume (after tax)
    if tax_rate > 0:
        required_before_tax = target_profit / (1 - tax_rate)
    else:
        required_before_tax = target_profit
    target_units = (fixed_costs + required_before_tax) / cm
    target_revenue = target_units * unit_price

    # Margin of safety (assume some "expected" sales — use target_units × 1.3 as default estimate)
    estimated_sales = target_units * 1.3 if target_units > 0 else bep_units * 1.5
    mos_units = estimated_sales - bep_units
    mos_pct = (mos_units / estimated_sales * 100) if estimated_sales > 0 else 0
    mos_revenue = mos_units * unit_price

    # Operating leverage: contribution margin / operating income
    # At estimated sales level
    operating_income_at_estimate = estimated_sales * cm - fixed_costs
    operating_leverage = (estimated_sales * cm) / operating_income_at_estimate if operating_income_at_estimate > 0 else float("inf")

    result: dict[str, Any] = {
        "break_even_units": round(bep_units, 2),
        "break_even_revenue": round(bep_revenue, 2),
        "contribution_margin_per_unit": round(cm, 2),
        "contribution_margin_ratio": round(cm_ratio * 100, 2),
        "cash_break_even_units": round(cash_bep_units, 2),
        "cash_break_even_revenue": round(cash_bep_revenue, 2),
        "profit_at_1000_units": round(1000 * cm - fixed_costs, 2),
        "profit_at_5000_units": round(5000 * cm - fixed_costs, 2),
        "margin_of_safety_units": round(mos_units, 2),
        "margin_of_safety_pct": round(mos_pct, 2),
        "margin_of_safety_revenue": round(mos_revenue, 2),
        "operating_leverage": round(operating_leverage, 2),
    }

    if target_profit > 0:
        result["target_profit"] = round(target_profit, 2)
        result["target_profit_units"] = round(target_units, 2)
        result["target_profit_revenue"] = round(target_revenue, 2)
        if tax_rate > 0:
            result["tax_rate"] = round(tax_rate * 100, 2)
            result["pretax_profit_required"] = round(required_before_tax, 2)

    result["formula"] = (
        f"BEP=FC/(P-VC)={fixed_costs}/({unit_price}-{unit_variable_cost})={round(bep_units,2)}单位, "
        f"贡献毛利={cm}/单位, 贡献毛利率={round(cm_ratio*100,2)}%"
    )

    # ─── What-if scenarios ───
    if scenarios:
        scenario_results = []
        for i, sc in enumerate(scenarios):
            p = sc.get("price", unit_price)
            vc = sc.get("vc", unit_variable_cost)
            fc = sc.get("fc", fixed_costs)
            label = sc.get("label", f"场景{i+1}")

            if p <= vc:
                scenario_results.append({"label": label, "error": "单价不高于变动成本"})
                continue

            sc_cm = p - vc
            sc_bep = fc / sc_cm
            sc_profit_at_est = estimated_sales * sc_cm - fc

            # Sensitivity: % change from base
            bep_change = (sc_bep - bep_units) / bep_units * 100 if bep_units > 0 else 0

            scenario_results.append({
                "label": label,
                "price": p,
                "variable_cost": vc,
                "fixed_cost": fc,
                "contribution_margin": round(sc_cm, 2),
                "break_even_units": round(sc_bep, 2),
                "bep_change_pct": round(bep_change, 2),
                "profit_at_estimate": round(sc_profit_at_est, 2),
                "worse": sc_bep > bep_units,
            })

        # Find worst and best case
        valid = [s for s in scenario_results if "error" not in s]
        if valid:
            worst = max(valid, key=lambda s: s["break_even_units"])
            best = min(valid, key=lambda s: s["break_even_units"])
            result["worst_case"] = {"label": worst["label"], "bep_units": worst["break_even_units"]}
            result["best_case"] = {"label": best["label"], "bep_units": best["break_even_units"]}

        result["scenarios"] = scenario_results

    return result
