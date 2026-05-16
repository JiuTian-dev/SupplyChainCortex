"""
server.py — 供应链数学 MCP Server

使用 FastMCP 注册 5 个供应链计算工具，通过 stdio 传输与 MCP 客户端通信。
启动方式: python server.py
MCP 客户端通过子进程调用本文件，自动发现所有 @mcp.tool 注册的工具。
"""

from fastmcp import FastMCP

from supply_math import (
    calculate_eoq,
    calculate_safety_stock,
    classify_abc_xyz,
    forecast_demand,
)

mcp = FastMCP(
    "supply-math",
    instructions="供应链核心数学计算 MCP Server，提供 EOQ、安全库存、ABC-XYZ 分类、需求预测。",
)


@mcp.tool()
def calculate_eoq_tool(
    annual_demand: float,
    order_cost: float,
    holding_cost_per_unit: float,
) -> dict:
    """经济订货批量计算 (EOQ)
    输入: annual_demand(年需求量), order_cost(每次订货成本), holding_cost_per_unit(单位年持有成本)
    公式: Q* = sqrt(2DS/H)
    输出: eoq, annual_orders, annual_total_cost, formula
    """
    return calculate_eoq(annual_demand, order_cost, holding_cost_per_unit)


@mcp.tool()
def calculate_safety_stock_tool(
    service_level: float,
    demand_std: float,
    lead_time_days: float,
    avg_daily_demand: float = 0.0,
) -> dict:
    """安全库存计算
    输入: service_level(0.90/0.95/0.99), demand_std(日需求标准差), lead_time_days(提前期天数), avg_daily_demand(日均需求,默认0)
    公式: SS = Z × σ × √LT
    输出: safety_stock, reorder_point, z_score, formula
    """
    return calculate_safety_stock(service_level, demand_std, lead_time_days, avg_daily_demand)


@mcp.tool()
def classify_abc_xyz_tool(records: list[dict]) -> dict:
    """ABC-XYZ 联合分类
    输入: records 数组，每项含 sku, revenue, demand_std, avg_demand
    ABC 按收入累计占比(80%/95%分界)，XYZ 按变异系数 CV(0.5/1.0分界)
    输出: classification 数组，每项含 sku, abc_class, xyz_class, strategy
    """
    return classify_abc_xyz(records)


@mcp.tool()
def forecast_demand_tool(demand_history: list[float], periods: int) -> dict:
    """需求预测
    输入: demand_history(历史需求序列,至少3个), periods(预测期数)
    方法: 简单移动平均(窗口3), 指数平滑(α=0.3), 线性回归趋势
    输出: moving_average, exponential_smoothing, linear_trend, errors(MAD, MAPE)
    """
    return forecast_demand(demand_history, periods)


if __name__ == "__main__":
    mcp.run(transport="stdio")
