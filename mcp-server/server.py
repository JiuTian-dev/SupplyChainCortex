"""server.py — 供应链数学 FastAPI 常驻服务

替代 bridge.py 的 execFile 模式，通过 HTTP 暴露所有供应链计算工具。
启动方式:
    python -m uvicorn server:app --host 0.0.0.0 --port 8765 --reload
或:
    python server.py
端口可通过环境变量 PYTHON_BRIDGE_PORT 配置（默认 8765）。
"""

from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

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

# ─── Pydantic Request Models ──────────────────────────────────────────────────


# ── Inventory ──


class EoqRequest(BaseModel):
    annual_demand: float
    order_cost: float
    holding_cost_per_unit: float
    discount_schedule: Optional[list[dict[str, Any]]] = None
    discount_type: Optional[str] = None


class SafetyStockRequest(BaseModel):
    service_level: float
    demand_std: float
    lead_time_days: float
    avg_daily_demand: Optional[float] = None
    order_quantity: Optional[float] = None


class ReorderPointRequest(BaseModel):
    avg_daily_demand: float
    demand_std: float
    lead_time_days: float
    lead_time_std: Optional[float] = None
    service_level: Optional[float] = None
    review_period_days: Optional[float] = None


class AbcXyzRequest(BaseModel):
    records: list[dict[str, Any]]
    abc_thresholds: Optional[list[float]] = None
    xyz_thresholds: Optional[list[float]] = None


# ── Forecasting ──


class ForecastDemandRequest(BaseModel):
    demand_history: list[float]
    periods: int
    alpha: Optional[float] = None
    beta: Optional[float] = None
    gamma: Optional[float] = None
    season_length: Optional[int] = None
    method: Optional[str] = None
    confidence_levels: Optional[list[float]] = None


class SeasonalDecomposeRequest(BaseModel):
    demand_history: list[float]
    period_length: int


# ── Simulation ──


class MonteCarloInventoryRequest(BaseModel):
    avg_daily_demand: float
    demand_std: float
    lead_time_days: float
    lead_time_std: float
    reorder_point: float
    order_qty: float
    simulations: Optional[int] = None
    days: Optional[int] = None


# ── Optimization ──


class WagnerWhitinRequest(BaseModel):
    demands: list[float]
    order_cost: float
    holding_cost_per_unit: float


class NewsvendorRequest(BaseModel):
    selling_price: float
    purchase_cost: float
    salvage_value: float
    demand_mean: float
    demand_std: float


# ── Network ──


class DrpRequest(BaseModel):
    initial_inventory: float
    scheduled_receipts: list[float]
    demand_schedule: list[float]
    lead_time_days: float
    order_quantity: float
    safety_stock: float


class WarehouseLocationRequest(BaseModel):
    locations: list[dict[str, Any]]


class TransportRouteRequest(BaseModel):
    points: list[dict[str, Any]]
    start_point: Optional[str] = None


class MultiEchelonSsRequest(BaseModel):
    demand_per_period: float
    demand_std: float
    lead_time: float
    lead_time_std: float
    service_level: float
    echelons: Optional[int] = None


# ── Metrics ──


class InventoryKpiRequest(BaseModel):
    annual_cogs: float
    avg_inventory: float
    annual_demand: float
    orders_filled: float
    total_orders: float
    lead_time_days: float
    avg_daily_demand: float


class FillRateRequest(BaseModel):
    service_level: float
    demand_std: float
    lead_time_days: float
    order_quantity: float
    avg_daily_demand: float


class LeadTimeAnalysisRequest(BaseModel):
    lead_times: list[float]
    demand_rate: float
    service_level: float


class PurchaseVarianceRequest(BaseModel):
    actual_price: float
    standard_price: float
    actual_qty: float
    standard_qty: float


# ── Finance ──


class TotalCostRequest(BaseModel):
    annual_demand: float
    order_cost: float
    holding_cost_per_unit: float
    unit_cost: float
    stockout_cost_per_unit: Optional[float] = None
    service_level: Optional[float] = None
    demand_std: Optional[float] = None
    lead_time_days: Optional[float] = None


class SupplierScoringRequest(BaseModel):
    suppliers: list[dict[str, Any]]


# ── Production ──


class LearningCurveRequest(BaseModel):
    first_unit_cost: float
    cumulative_units: float
    learning_rate: float
    current_cumulative: Optional[float] = None
    detailed: Optional[bool] = None


class BreakEvenRequest(BaseModel):
    fixed_costs: float
    unit_price: float
    unit_variable_cost: float
    target_profit: Optional[float] = None
    depreciation: Optional[float] = None
    tax_rate: Optional[float] = None
    scenarios: Optional[list[dict[str, Any]]] = None


# ── Pricing ──


class OptimalPricingRequest(BaseModel):
    unit_cost: float
    current_price: float
    current_demand: float
    elasticity: Optional[float] = None
    demand_at_zero_price: Optional[float] = None
    model: Optional[str] = None
    detailed: Optional[bool] = None


# ── Planning ──


class JointReplenishmentRequest(BaseModel):
    items: list[dict[str, Any]]
    major_setup_cost: float
    interest_rate: Optional[float] = None
    detailed: Optional[bool] = None


class ForecastAccuracyRequest(BaseModel):
    forecasts: list[dict[str, Any]]
    actuals: list[float]
    period_labels: Optional[list[str]] = None


# ─── Tool Registry ─────────────────────────────────────────────────────────────

TOOL_REGISTRY: dict[str, Any] = {
    "calculate_eoq": calculate_eoq,
    "calculate_safety_stock": calculate_safety_stock,
    "calculate_reorder_point": calculate_reorder_point,
    "classify_abc_xyz": classify_abc_xyz,
    "forecast_demand": forecast_demand,
    "calculate_seasonal_decompose": calculate_seasonal_decompose,
    "monte_carlo_inventory": monte_carlo_inventory,
    "calculate_wagner_whitin": calculate_wagner_whitin,
    "calculate_newsvendor": calculate_newsvendor,
    "calculate_drp": calculate_drp,
    "calculate_warehouse_location": calculate_warehouse_location,
    "calculate_transport_route": calculate_transport_route,
    "calculate_multi_echelon_ss": calculate_multi_echelon_ss,
    "calculate_inventory_kpi": calculate_inventory_kpi,
    "calculate_fill_rate": calculate_fill_rate,
    "calculate_lead_time_analysis": calculate_lead_time_analysis,
    "calculate_purchase_variance": calculate_purchase_variance,
    "calculate_total_cost": calculate_total_cost,
    "calculate_supplier_scoring": calculate_supplier_scoring,
    "calculate_learning_curve": calculate_learning_curve,
    "calculate_break_even": calculate_break_even,
    "calculate_optimal_pricing": calculate_optimal_pricing,
    "calculate_joint_replenishment": calculate_joint_replenishment,
    "calculate_forecast_accuracy": calculate_forecast_accuracy,
}

# ─── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Supply Chain Math Bridge",
    description="FastAPI 常驻服务，替代 execFile('python3', ...) 模式，提供 24 个供应链计算工具的 HTTP 端点。",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_tool(func: Any, params: dict[str, Any]) -> JSONResponse:
    """调用工具函数，处理返回值中的 error 字段。"""
    try:
        result = func(**params)
    except TypeError as e:
        return JSONResponse(status_code=400, content={"error": f"参数错误: {e}"})
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": f"内部错误: {e}"})

    if isinstance(result, dict) and result.get("error"):
        return JSONResponse(status_code=400, content=result)
    return JSONResponse(status_code=200, content=result)


def _dump(model: BaseModel) -> dict[str, Any]:
    """序列化 Pydantic 模型，排除 None 值以保留 Python 函数默认参数。"""
    return model.model_dump(exclude_none=True)


# ─── Health Check ──────────────────────────────────────────────────────────────


@app.get("/health")
def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "supply-chain-math-bridge",
        "tools_available": len(TOOL_REGISTRY),
        "tool_names": list(TOOL_REGISTRY.keys()),
    }


# ─── Generic Bridge Endpoint ──────────────────────────────────────────────────


@app.post("/api/bridge/{tool_name}")
async def bridge(tool_name: str, body: dict[str, Any]) -> JSONResponse:
    """通用桥接端点，与 bridge.py 接口一致，Node.js 客户端可直接调用。"""
    func = TOOL_REGISTRY.get(tool_name)
    if func is None:
        raise HTTPException(
            status_code=404,
            detail=f"未知工具: {tool_name}, 可用: {list(TOOL_REGISTRY.keys())}",
        )
    return _run_tool(func, body)


# ─── RESTful Endpoints ─────────────────────────────────────────────────────────

# ── Inventory ──


@app.post("/api/inventory/eoq")
async def api_eoq(req: EoqRequest) -> JSONResponse:
    return _run_tool(calculate_eoq, _dump(req))


@app.post("/api/inventory/safety-stock")
async def api_safety_stock(req: SafetyStockRequest) -> JSONResponse:
    return _run_tool(calculate_safety_stock, _dump(req))


@app.post("/api/inventory/reorder-point")
async def api_reorder_point(req: ReorderPointRequest) -> JSONResponse:
    return _run_tool(calculate_reorder_point, _dump(req))


@app.post("/api/inventory/abc-xyz")
async def api_abc_xyz(req: AbcXyzRequest) -> JSONResponse:
    return _run_tool(classify_abc_xyz, _dump(req))


# ── Forecasting ──


@app.post("/api/forecasting/demand")
async def api_forecast_demand(req: ForecastDemandRequest) -> JSONResponse:
    return _run_tool(forecast_demand, _dump(req))


@app.post("/api/forecasting/seasonal-decompose")
async def api_seasonal_decompose(req: SeasonalDecomposeRequest) -> JSONResponse:
    return _run_tool(calculate_seasonal_decompose, _dump(req))


# ── Simulation ──


@app.post("/api/simulation/monte-carlo-inventory")
async def api_monte_carlo_inventory(req: MonteCarloInventoryRequest) -> JSONResponse:
    return _run_tool(monte_carlo_inventory, _dump(req))


# ── Optimization ──


@app.post("/api/optimization/wagner-whitin")
async def api_wagner_whitin(req: WagnerWhitinRequest) -> JSONResponse:
    return _run_tool(calculate_wagner_whitin, _dump(req))


@app.post("/api/optimization/newsvendor")
async def api_newsvendor(req: NewsvendorRequest) -> JSONResponse:
    return _run_tool(calculate_newsvendor, _dump(req))


# ── Network ──


@app.post("/api/network/drp")
async def api_drp(req: DrpRequest) -> JSONResponse:
    return _run_tool(calculate_drp, _dump(req))


@app.post("/api/network/warehouse-location")
async def api_warehouse_location(req: WarehouseLocationRequest) -> JSONResponse:
    return _run_tool(calculate_warehouse_location, _dump(req))


@app.post("/api/network/transport-route")
async def api_transport_route(req: TransportRouteRequest) -> JSONResponse:
    return _run_tool(calculate_transport_route, _dump(req))


@app.post("/api/network/multi-echelon-ss")
async def api_multi_echelon_ss(req: MultiEchelonSsRequest) -> JSONResponse:
    return _run_tool(calculate_multi_echelon_ss, _dump(req))


# ── Metrics ──


@app.post("/api/metrics/inventory-kpi")
async def api_inventory_kpi(req: InventoryKpiRequest) -> JSONResponse:
    return _run_tool(calculate_inventory_kpi, _dump(req))


@app.post("/api/metrics/fill-rate")
async def api_fill_rate(req: FillRateRequest) -> JSONResponse:
    return _run_tool(calculate_fill_rate, _dump(req))


@app.post("/api/metrics/lead-time-analysis")
async def api_lead_time_analysis(req: LeadTimeAnalysisRequest) -> JSONResponse:
    return _run_tool(calculate_lead_time_analysis, _dump(req))


@app.post("/api/metrics/purchase-variance")
async def api_purchase_variance(req: PurchaseVarianceRequest) -> JSONResponse:
    return _run_tool(calculate_purchase_variance, _dump(req))


# ── Finance ──


@app.post("/api/finance/total-cost")
async def api_total_cost(req: TotalCostRequest) -> JSONResponse:
    return _run_tool(calculate_total_cost, _dump(req))


@app.post("/api/finance/supplier-scoring")
async def api_supplier_scoring(req: SupplierScoringRequest) -> JSONResponse:
    return _run_tool(calculate_supplier_scoring, _dump(req))


# ── Production ──


@app.post("/api/production/learning-curve")
async def api_learning_curve(req: LearningCurveRequest) -> JSONResponse:
    return _run_tool(calculate_learning_curve, _dump(req))


@app.post("/api/production/break-even")
async def api_break_even(req: BreakEvenRequest) -> JSONResponse:
    return _run_tool(calculate_break_even, _dump(req))


# ── Pricing ──


@app.post("/api/pricing/optimal-pricing")
async def api_optimal_pricing(req: OptimalPricingRequest) -> JSONResponse:
    return _run_tool(calculate_optimal_pricing, _dump(req))


# ── Planning ──


@app.post("/api/planning/joint-replenishment")
async def api_joint_replenishment(req: JointReplenishmentRequest) -> JSONResponse:
    return _run_tool(calculate_joint_replenishment, _dump(req))


@app.post("/api/planning/forecast-accuracy")
async def api_forecast_accuracy(req: ForecastAccuracyRequest) -> JSONResponse:
    return _run_tool(calculate_forecast_accuracy, _dump(req))


# ─── Main Entry ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PYTHON_BRIDGE_PORT", "8765"))
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )
