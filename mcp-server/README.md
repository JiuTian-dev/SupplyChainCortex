# Supply Math MCP Server

供应链核心数学计算 MCP Server，提供 5 个专业工具。

## 工具列表

| 工具名 | 功能 | 核心公式 |
|--------|------|----------|
| `calculate_eoq_tool` | 经济订货批量 | Q* = √(2DS/H) |
| `calculate_safety_stock_tool` | 安全库存 & 再订货点 | SS = Z × σ × √LT |
| `classify_abc_xyz_tool` | ABC-XYZ 联合分类 | ABC按收入占比, XYZ按变异系数 |
| `forecast_demand_tool` | 需求预测(3种方法) | SMA(3), ES(α=0.3), 线性回归 |
| `simulate_bullwhip_tool` | 牛鞭效应仿真 | MA(4) + order-up-to 策略 |

## 安装

```bash
cd mcp-server
pip install -r requirements.txt
```

## 单独运行

```bash
python server.py
```

服务器通过 **stdio** 传输，不监听端口，由 MCP 客户端通过子进程调用。

## 集成到 Next.js 项目

在项目根目录的 `.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "supply-math": {
      "command": "python",
      "args": ["mcp-server/server.py"]
    }
  }
}
```

MCP Agent 会自动发现以上 5 个工具，用户提问时直接调用。

## 输入校验

所有工具对输入参数做严格校验，非法输入返回 `{"error": "描述信息"}`。

## 输出格式

每个工具的输出都包含 `formula` 字段，显示使用的数学公式，便于审计和文档化。
