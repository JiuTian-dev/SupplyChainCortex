# Python LangGraph 多 Agent 编排 —— 演进方案

## 架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js 16 (TypeScript) — 不变                                      │
│                                                                      │
│  /api/chat/route.ts ──→ 轻量查询 → FSM Agent v2（保留）              │
│                      ──→ 复杂多步  → HTTP → Python agent-server       │
│                                                                      │
│  61 MCP 工具 ◄──────────────────────────── MCP 协议                   │
│  9 业务标签页 + SSE 实时交互（不变）                                   │
│  PostgreSQL 28 模型（不变）                                           │
└──────────────────────────────────────────────────────────────────────┘
          │
          │ HTTP (POST /analyze) + SSE 流式返回
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  agent-server/ (Python 3.12 + FastAPI + LangGraph)                    │
│                                                                      │
│  ┌──────────────────┐                                                │
│  │  Supervisor Node │  ← LLM 动态路由（Pydantic 结构化输出）          │
│  └───┬────┬────┬────┘                                                │
│      │    │    │                                                     │
│  ┌───▼─┐┌─▼──┐┌▼───┐                                                │
│  │关税 ││物流││库存 │  ← 4 专业 Agent，各绑 MCP 工具子集               │
│  │Agent││Agent││Agent│                                               │
│  └─────┘└────┘└──┬──┘                                                │
│              ┌───▼──┐                                                │
│              │定价   │                                                │
│              │Agent  │                                                │
│              └──────┘                                                │
│                                                                      │
│  能力：StateGraph DAG、Checkpoint 持久化、人在回路、MCP 动态工具发现   │
└──────────────────────────────────────────────────────────────────────┘
          │
          │ MCP 协议（localhost:8001）
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  mcp-server/ (Python — 现有，不动)                                    │
│  bridge.py + supply_math/  (24 OR 模型)                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 技术选型

| 项 | 选择 | 理由 |
|----|------|------|
| Web 框架 | FastAPI | SSE 原生支持，async 一等公民，Pydantic 深度集成 |
| LLM 编排 | LangGraph 1.1.x | StateGraph + Checkpoint + 条件边 |
| Supervisor | **手写**（不用 langgraph-supervisor 库） | 官方新项目推荐，context 完全可控 |
| Agent | `create_react_agent`（LangGraph prebuilt） | Agent + 工具绑定标准方式 |
| MCP 集成 | `langchain-mcp-adapters` 0.2.x | 动态工具发现，无需手动注册 |
| 依赖管理 | `uv`（pip 替代） | 速度快，lock 文件可靠 |
| 部署 | 独立进程，uvicorn 运行 | 与 Next.js 解耦，独立扩缩容 |

---

## 目录结构

```
agent-server/
├── pyproject.toml              # uv 项目配置 + 依赖
├── uv.lock
├── .env.example
├── README.md
├── src/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app 入口，SSE endpoint
│   ├── config.py               # 环境变量、模型配置
│   ├── models/
│   │   ├── __init__.py
│   │   ├── schemas.py          # Pydantic 请求/响应模型
│   │   └── routing.py          # RoutingDecision（Supervisor 结构化输出）
│   ├── graph/
│   │   ├── __init__.py
│   │   ├── state.py            # AgentState TypedDict
│   │   ├── supervisor.py       # 手写 Supervisor 节点
│   │   ├── agents.py           # 4 专业 Agent 创建
│   │   ├── edges.py            # 条件边 + 路由逻辑
│   │   └── graph.py            # compile() 入口，组装完整图
│   ├── tools/
│   │   ├── __init__.py
│   │   └── mcp_client.py       # MCP 客户端封装，动态工具发现
│   ├── checkpoint/
│   │   ├── __init__.py
│   │   └── store.py            # SqliteSaver / PostgresSaver 持久化
│   └── prompts/
│       ├── __init__.py
│       ├── supervisor.py       # Supervisor system prompt
│       ├── tariff.py
│       ├── logistics.py
│       ├── inventory.py
│       └── pricing.py
└── tests/
    ├── __init__.py
    ├── test_graph.py
    ├── test_agents.py
    └── test_mcp.py
```

---

## 分阶段执行

### Phase 1：最小验证原型（目标：2 周跑通全链路）

**不做的事：** Checkpoint、人在回路、完整 4 agent、性能优化

**要做的事：**

1. `agent-server/` 项目初始化
   ```bash
   uv init agent-server
   cd agent-server
   uv add fastapi uvicorn langgraph langchain-openai langchain-mcp-adapters
   ```

2. 手写 Supervisor 图（2 个 agent 即可）
   - `graph/state.py` — AgentState（messages + analysis_result + current_agent + iteration_count）
   - `graph/agents.py` — tariff_agent + logistics_agent（各绑 2-3 个 MCP 工具）
   - `graph/supervisor.py` — supervisor_node()，Pydantic RoutingDecision
   - `graph/edges.py` — 条件边：路由到 agent 还是 END
   - `graph/graph.py` — 组装 StateGraph → compile()

3. FastAPI SSE endpoint
   ```python
   @app.post("/analyze")
   async def analyze(request: AnalyzeRequest):
       """流式返回 Agent 执行过程"""
       async def event_stream():
           async for event in graph.astream_events(...):
               yield f"data: {json.dumps(event)}\n\n"
       return StreamingResponse(event_stream(), media_type="text/event-stream")
   ```

4. Next.js 端最小接入
   - `/api/chat/route.ts` 加 `provider: "langgraph-python"` 分流
   - 或前端 ChatPanel 加一个"深度分析"按钮，触发 POST 到 Python 端

**验证标准：**
- 用户发送"分析 SKU-001 的关税影响并推荐物流方案"
- Supervisor 路由到 tariff_agent → 完成 → 路由到 logistics_agent → 完成
- SSE 流式返回到前端 ChatPanel
- 工具调用来自 MCP 动态发现（不硬编码）

---

### Phase 2：补齐 4 Agent + Checkpoint（目标：2-4 周）

**新增：**
1. 补齐 inventory_agent + pricing_agent
2. DAG 并行验证：关税 + 物流并行 → 汇总 → 定价
   ```
   关税 ──┬──→ 综合报价
   物流 ──┘
   ```
3. SqliteSaver checkpoint
   - 长任务中断后可从最后一个成功节点恢复
   - 支持 `interrupt_before=["pricing_agent"]` 暂停等待人工确认
4. 路由防循环：supervisor 上下文注入 `resolved_topics` 防止重复派发

**验证标准：**
- 4 agent 全跑通，supervisor 动态决定调用顺序
- 手动杀掉进程，重启后从 checkpoint 恢复
- "成本超 15%"场景触发人在回路暂停

---

### Phase 3：人在回路 + 生产加固（目标：4-6 周）

**新增：**
1. 人在回路完整流程
   - Supervisor 生成确认卡片 → SSE 推前端 → 用户确认/修改 → 继续执行
   - 与现有 `confirm_required` SSE 事件格式对齐
2. 容错三层
   - Agent 级：retry 3 次指数退避
   - 图级：checkpoint 回滚
   - 系统级：降级到 FSM Agent v2
3. 可观测性
   - 每节点延迟、路由准确率、token 消耗
4. 与现有 FSM 的流量分配策略
   - 简单查询 → FSM（~80% 流量）
   - 多步分析 → LangGraph（~20% 流量）
   - 关键字/意图判断走哪个路径

---

## 核心代码骨架

### AgentState

```python
# graph/state.py
from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    analysis_result: dict          # 各 agent 产出汇总
    current_task: str              # 当前需要处理的子任务
    resolved_topics: list[str]     # 已处理的话题，防循环
    iteration_count: int           # 当前迭代次数
    final_report: str              # 最终报告
```

### RoutingDecision（Pydantic 结构化输出）

```python
# models/routing.py
from pydantic import BaseModel, Field
from typing import Literal

class RoutingDecision(BaseModel):
    """Supervisor 的路由决策，LLM 用 with_structured_output 生成"""
    next_agent: Literal[
        "tariff_expert",
        "logistics_expert",
        "inventory_expert",
        "pricing_expert",
        "FINISH",
    ]
    reasoning: str = Field(description="为什么路由到这个 agent")
    task: str = Field(description="分配给该 agent 的具体任务描述")
```

### Supervisor 节点（手写，不用库）

```python
# graph/supervisor.py
from langgraph.types import Command
from models.routing import RoutingDecision

async def supervisor_node(state: AgentState) -> Command:
    """手写 supervisor，完全控制 context engineering"""
    system_prompt = f"""你是供应链决策协调者。当前分析进度：
- 已处理: {state['resolved_topics']}
- 当前迭代: {state['iteration_count']}

基于用户问题和已完成的子任务，决定下一步：
- 关税问题 → tariff_expert
- 物流/货运 → logistics_expert
- 库存/补货 → inventory_expert
- 定价/利润率 → pricing_expert
- 所有子任务完成 → FINISH

禁止重复派发给已处理的专家。"""
    
    messages = [{"role": "system", "content": system_prompt}, *state["messages"][-10:]]
    decision = model.with_structured_output(RoutingDecision).invoke(messages)
    
    if decision.next_agent == "FINISH":
        return Command(goto="synthesizer", update={"resolved_topics": [...], "iteration_count": state["iteration_count"] + 1})
    
    return Command(
        goto=decision.next_agent,
        update={"current_task": decision.task, "iteration_count": state["iteration_count"] + 1}
    )
```

### 图组装

```python
# graph/graph.py
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

def build_graph(model, tariff_agent, logistics_agent, inventory_agent, pricing_agent):
    builder = StateGraph(AgentState)
    
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("tariff_expert", tariff_agent)
    builder.add_node("logistics_expert", logistics_agent)
    builder.add_node("inventory_expert", inventory_agent)
    builder.add_node("pricing_expert", pricing_agent)
    builder.add_node("synthesizer", synthesizer_node)
    
    builder.set_entry_point("supervisor")
    
    # 所有 agent 完成后回到 supervisor 判断
    for agent_name in ["tariff_expert", "logistics_expert", "inventory_expert", "pricing_expert"]:
        builder.add_edge(agent_name, "supervisor")
    
    # 条件边：supervisor → 某个 agent 或 synthesizer 或 END
    # 由 supervisor_node 的 Command(goto=...) 控制
    
    builder.add_edge("synthesizer", END)
    
    checkpointer = MemorySaver()  # 开发阶段，生产换 SqliteSaver/PostgresSaver
    return builder.compile(checkpointer=checkpointer)
```

### MCP 工具动态绑定

```python
# tools/mcp_client.py
from langchain_mcp_adapters.client import MultiServerMCPClient

async def create_agent_with_mcp_tools(model, agent_name: str, tool_filters: list[str]):
    """从你现有的 mcp-server 动态拉取工具，按 agent 角色过滤"""
    async with MultiServerMCPClient({
        "supply_chain": {
            "transport": "streamable_http",
            "url": "http://localhost:8001/mcp",
        }
    }) as client:
        all_tools = client.get_tools()
        # 按 agent 职责过滤工具子集
        filtered = [t for t in all_tools if any(f in t.name for f in tool_filters)]
        return create_react_agent(model, filtered, name=agent_name)
```

### FastAPI SSE 端点

```python
# main.py
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import json

app = FastAPI()

@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    graph = build_graph(model, ...)
    config = {"configurable": {"thread_id": request.thread_id}}
    
    async def event_generator():
        async for event in graph.astream_events(
            {"messages": [{"role": "user", "content": request.query}]},
            config=config,
            version="v2",
        ):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                yield f"data: {json.dumps({'type': 'token', 'content': event['data']['chunk'].content})}\n\n"
            elif kind == "on_tool_start":
                yield f"data: {json.dumps({'type': 'tool_call', 'tool': event['name'], 'params': event['data'].get('input')})}\n\n"
            elif kind == "on_tool_end":
                yield f"data: {json.dumps({'type': 'tool_result', 'tool': event['name'], 'result': event['data'].get('output')})}\n\n"
            # ... 其他事件类型
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

---

## Next.js 端改动（最小化）

`src/app/api/chat/route.ts` 加一个 provider 分流：

```typescript
// 当 provider 为 "langgraph-python" 时，转发到 Python agent-server
if (providerId === 'langgraph-python') {
  const pythonRes = await fetch('http://localhost:8800/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: message, thread_id: uuid() }),
  });
  // 透传 SSE 流
  return new Response(pythonRes.body, {
    headers: { 'Content-Type': 'text/event-stream', ... },
  });
}
```

---

## 依赖清单

```toml
# pyproject.toml
[project]
name = "supplychain-agent-server"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "langgraph>=1.1.10",
    "langchain>=1.0.0",
    "langchain-openai>=1.0.0",      # 你已有的 provider
    "langchain-anthropic>=1.0.0",   # 你已有的 provider
    "langchain-mcp-adapters>=0.2.2",
    "mcp>=1.27.0",
    "pydantic>=2.0",
    "python-dotenv>=1.0",
]
```

---

## 关键决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| Supervisor 实现方式 | **手写**，不引入 `langgraph-supervisor` 库 | 官方 2025 年底新推荐，context 完全可控 |
| Checkpoint 后端 | 开发阶段 MemorySaver，生产 SqliteSaver | PostgreSQL 用你现有的 DB |
| Agent 创建方式 | `create_react_agent`（LangGraph prebuilt） | 官方标准方式，ReAct 循环内置 |
| MCP 传输 | Streamable HTTP（你现有的 mcp-server） | 不动现有 MCP 基础设施 |
| 语言边界 | HTTP + SSE（不引入 gRPC/message queue） | 先简单，瓶颈时再升级 |
| 流量分配 | 关键字 + 意图判断分流 | 简单查询不过 Python 端 |

---

## 下一步

1. 在 `mcp-server/` 同级创建 `agent-server/` 目录
2. `uv init` + 安装依赖
3. 写 `graph/state.py` + `graph/supervisor.py` + `graph/agents.py`
4. 跑通 2 agent + MCP 工具动态发现
5. FastAPI SSE endpoint + Next.js 分流
