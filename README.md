# SupplyChain Cortex v2.0

**An AI Agent that analyzes your supply chain. 74 specialized tools. 8 SOP skills. Persistent memory. Full audit trail.**

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-0%20errors%20(new)-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-583%20passed-brightgreen)]()
[![MCP Tools](https://img.shields.io/badge/MCP%20tools-74-blueviolet)]()
[![Agent](https://img.shields.io/badge/Agent-FSM%20v2-orange)]()
[![Skills](https://img.shields.io/badge/Skills-8%20SOPs-purple)]()
[![Memory](https://img.shields.io/badge/Memory-JiuTian%20persistent-green)]()

**Ask questions. Agent analyzes data across inventory, cost, supplier, logistics, and risk. Every decision is traced and replayable. Now remembers you across sessions.**

---

## What It Does

You type: "库存健康检查" (check inventory health). The Agent:

1. Classifies your intent (semantic router)
2. Loads the inventory SOP skill
3. Calls the right MCP tools (query_inventory → classify_abc_xyz → calculate_eoq)
4. Synthesizes a structured report with [source][confidence] tags
5. Persists the entire decision trace (auditable, replayable)

**Not a dashboard. Not a chatbot. An Agent that does supply chain analysis.**

---

## UI (2026-05-27 重构)

极简大厂风格 — 设置和工具箱收入右侧滑出面板。

```
Header:   [SC] [Chat] [审计] [数据]           [🔔] [🔧] [⚙] [👤]
                                             通知  工具  设置  用户

输入区:                            [📎] [__________输入__________] [发送]
```

- **🔧 工具箱**：全局搜索(Cmd+K)、导出数据、数据导入、MCP/SSE 状态、刷新、备注中心
- **⚙ 设置**：记忆开关、模型选择、联网搜索、外观主题、API Key

---

## 记忆系统

集成 [九天记忆模块](https://github.com) — 6 Phase 全栈持久记忆。

| 能力 | 实现 |
|------|------|
| 分层存储 | SQLite 硬事实 + Qdrant 语义 + Mem0 软偏好 |
| 跨会话持久 | 对话记忆和偏好不因重启丢失 |
| 记忆/干净模式 | 设置面板一键切换，干净模式不引用不记录 |
| 衰老淘汰 | TTL 自动过期 + strength 衰减 + LLM 仲裁 |
| 动态检索路由 | BM25 置信度决定是否启动语义检索 |
| Reranker 精排 | bge-reranker-v2-m3 Cross-Encoder |

**启动记忆桥接**（另开终端）：
```bash
cd mini-services/memory-bridge
python server.py --port 8765
```

桥接未启动时自动降级到内存版 `episodeStore`，零影响。

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/JiuTian-dev/SupplyChainCortex.git
cd SupplyChainCortex

# 2. Start
./start.sh

# 3. Open http://localhost:3000
# 4. Set DEEPSEEK_API_KEY in settings (gear icon)
# 5. Ask: "帮我做库存健康检查"
```

---

## What Makes It Different

| Capability | Why It Matters |
|---|---|
| **74 MCP Tools** | Not just CRUD — EOQ with quantity discounts, Wagner-Whitin DP, Monte Carlo inventory simulation, multi-echelon safety stock, cascade risk propagation |
| **FSM v2 Agent Engine** | 6-state explicit state machine (classify→plan→execute→observe→decide→synthesize). No free-form LLM loops that drift |
| **Progressive Tool Loading** | 74 tools but only context-relevant ones sent to LLM. 60-80% token reduction |
| **Knowledge Injection** | Graph RAG (supply chain knowledge graph) + Agent Skills (8 SOP markdown files) loaded on trigger |
| **Provider Adapters** | DeepSeek V4 Flash, OpenAI GPT-4o, Anthropic Claude Sonnet 4.6, local Ollama — hot-swap one line |
| **Full Audit Trail** | Every decision traced: classify→plan→tools→synthesize. Replay from any node. EU AI Act + China AI compliance checklist |
| **3-View Layout** | Chat-first interface with slide-out data panel. Legacy dashboard panels preserved for quick reference |

---

## Architecture

```
User Query
  ↓
Semantic Router (LLM-based intent classification)
  ↓
FSM v2 Agent Engine (6-state explicit state machine)
  ↓
Provider Adapter Layer (DeepSeek / OpenAI / Anthropic / Ollama)
  ↓
Progressive Tool Filter (74 tools → intent-relevant subset)
  ↓
Knowledge Injection (Graph RAG + 8 SOP Skills)
  ↓
MCP Tool Execution (parallel, with autonomy policy)
  ↓
Trace Persistence (DecisionTrace → TraceStep → TraceToolCall + TracedClaim)
  ↓
Synthesize + Done (MARC-tagged, source-labeled, audit-traced)
```

---

## Supply Chain Coverage

| Domain | MCP Tools | What Agent Can Do |
|---|---|---|
| **Inventory** | 20 tools | ABC-XYZ classification, EOQ with discounts, safety stock, Monte Carlo simulation, DRP, Wagner-Whitin, newsvendor model, fill rate analysis, warehouse capacity |
| **Cost** | 11 tools | Landed cost breakdown, commodity price tracking (copper/aluminum/steel/plastics), SCFIS freight rates, carbon pricing, exchange rates, break-even analysis, optimal pricing |
| **Supplier** | 8 tools | Performance scoring, 6-month trend analysis, geographic distribution, cascade risk from supplier failure, 1688/Alibaba discovery |
| **Logistics** | 5 tools | Shipment tracking, port congestion monitoring, marine weather, transport route optimization, status updates |
| **Risk** | 5 tools | Cascade risk propagation (8 scenarios), CPSC recall monitoring, coherence audit, weather risk, recall risk prediction |
| **Market** | 8 tools | Amazon competitor analysis, brand sentiment, cross-platform arbitrage, product feed generation |
| **Operations** | 7 tools | Reorder creation (batch), stock transfer, inventory adjustment, supplier CRUD, shipment status workflow |
| **Universal** | 10 tools | Dashboard metrics, analytics, decision graph, financial simulation, sandbox simulation, workflow execution, web search, chart generation |

---

## 8 Agent Skills (SOPs)

Progressive-disclosure markdown skills that encode supply chain expertise. Triggered when the user's query matches:

| Skill | Trigger | What It Does |
|---|---|---|
| `inventory-health-check` | "库存健康" | Overview → ABC → slow-moving → risk → KPIs → recommendations |
| `cost-optimization` | "成本优化" | Commodities → FX → freight → tariff → landed cost → break-even |
| `supplier-risk-assessment` | "供应商风险" | Performance → trends → geography → cascade → scoring |
| `logistics-port-monitor` | "物流" "货运" | Stats → shipments → port congestion → weather → ETA risks |
| `tariff-trade-war-sim` | "关税" "贸易战" | Current tariffs → simulate → carbon price → financial impact → sandbox |
| `full-health-report` | "全健康报告" | Dashboard → analytics → risk → cascade → charts |
| `procurement-planning` | "采购计划" | Reorder list → EOQ → DRP → batch reorder |
| `compliance-audit` | "合规" "认证" | Compliance check → CPSC → recall risk → carbon → coherence audit |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| Database | PostgreSQL 16 + Prisma ORM (28 models) |
| Agent Engine | FSM v2 (6-state, model-agnostic) |
| Math Engines | Python 3 + NumPy (24 OR models) via bridge |
| Search | SearXNG self-hosted (70+ engines) |
| Streaming | SSE (Server-Sent Events) |
| UI | Tailwind CSS 4 + shadcn/ui + Recharts |
| Testing | Vitest (583 tests) + Playwright |
| Skills | 8 SKILL.md files (progressive disclosure) |
| Cache | ICacheBackend (Memory + PostgreSQL backends) |

---

## Requirements

- **Node.js** 20+ / **Bun** 1.0+
- **PostgreSQL** 16 (Docker: `docker compose up -d postgres`)
- **Python** 3.8+ (for math engines)
- **DeepSeek API Key** (or OpenAI / Anthropic / local Ollama)

---

## Development

```bash
bun install
bun run dev            # http://localhost:3000
bun run test           # 583 tests
npx tsc --noEmit       # zero new errors
bun run db:push        # sync Prisma schema
bun run db:seed        # seed 50 products + 11K sales records
```

---

## License

CC BY-NC 4.0 — Free for non-commercial use. Commercial licensing available.
