# SupplyChain Cortex v2.1

**An AI Agent that analyzes your supply chain. 83 specialized tools. 8 SOP skills. Persistent memory. Full audit trail. Now with cascade risk modeling, multi-tenant SaaS groundwork, and three-tier RBAC.**

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.1.0-blue)]()
[![Next.js](https://img.shields.io/badge/Next.js-16.1.3-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%20strict-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-1627%20passed-brightgreen)]()
[![MCP Tools](https://img.shields.io/badge/MCP%20tools-83-blueviolet)]()
[![Agent](https://img.shields.io/badge/Agent-FSM%20v2-orange)]()
[![Skills](https://img.shields.io/badge/Skills-8%20SOPs-purple)]()
[![Memory](https://img.shields.io/badge/Memory-JiuTian%20persistent-green)]()
[![Risk](https://img.shields.io/badge/Risk-SEIR%2BCausalML-red)]()

> **Ask questions.** The Agent analyzes data across inventory, cost, supplier, logistics, and risk. Every decision is traced and replayable. Cascade risk modeled with SEIR epidemiology + CausalML counterfactuals. **Now remembers you across sessions.**

📖 [Full Changelog](CHANGELOG.md) · 📋 [Contributing](CONTRIBUTING.md) · ⚖️ [License (CC BY-NC 4.0)](LICENSE)

---

## What It Does

You type: "库存健康检查" (check inventory health). The Agent:

1. **Classifies** your intent (semantic router)
2. **Loads** the inventory SOP skill
3. **Plans** which MCP tools to call (progressive tool loading: 83 → intent-relevant subset, 60-80% token reduction)
4. **Executes** the right tools (query_inventory → classify_abc_xyz → calculate_eoq)
5. **Synthesizes** a structured report with `[source][confidence]` tags (MARC protocol)
6. **Persists** the entire decision trace (auditable, replayable)

** An Agent that does supply chain analysis.**

---

## What's New in v2.1 (2026-06-26)

### 🛡️ Cascade Risk Engine v2
- **SEIR 混合模型** — Susceptible-Exposed-Infected-Recovered 传染病模型叠加在原 Agent-based simulation 之上，8 个预定义场景（baseline / cyber / typhoon / tariff / logistics_shock / supplier_bankruptcy / pandemic / perfect_storm）。
- **CausalML 反事实推理** — Causal Forest 模型，支持 do-calculus 查询："如果当初不切换供应商 Y，损失会少多少？"
- **Passport 主链审计** — passport 状态机作为风险审计主链，所有 cascade 事件、SEIR 节点、Causal 推算都汇入。

### 🏢 Multi-Tenant SaaS 基础设施
- 租户识别（subdomain / header / path）
- tenantId 字段从字符串 'default' 迁移到 UUID
- PgBouncer + Redis 集群配置外部化
- 限流分层（global / tenant / user / api / login）

### 🔐 Three-Tier RBAC
- 4 角色：`org_admin` / `team_admin` / `member` / `viewer`
- 25 权限细粒度控制
- 9 个调用方迁移到新 RBAC

### 🧹 架构清理
- 删除 1,500+ 行死代码（3 个 mcp barrel、`mcp-server.ts` 488 行、`permission-middleware.ts` 等）
- 双套 RAG / RBAC 合并到新版，旧版保留为 `@deprecated` 备份
- 破解 `mcp ↔ services/mcp-orchestration` 4 节点循环依赖
- 修复 `lib → app` 反向依赖（system-prompt.ts 迁移）
- tsconfig exclude 80 个测试文件，编译时间显著下降

### 🩺 HealthDot 修复
- 401/403 区分未登录与真故障
- 匿名访问下数据面板 51 个 API 全部 200
- 26 个核心 API 匿名访问 100% 成功

### 💳 Billing 脚手架
- Stripe 包降级到 `optionalDependencies`
- `BILLING_ENABLED=false` 默认放行
- 5 档定价（free / starter / pro / enterprise）配置就绪

📖 **完整变更记录请看 [CHANGELOG.md](CHANGELOG.md)**

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/JiuTian-dev/SupplyChainCortex.git
cd SupplyChainCortex

# 2. One-command start
./start.sh           # macOS / Linux
# 或 Windows
bash start.sh

# 3. Open http://localhost:3000
# 4. Set DEEPSEEK_API_KEY in settings (gear icon)
# 5. Ask: "帮我做库存健康检查"
```

`start.sh` 自动完成：
1. ✅ 检查 Docker / Node / Bun 依赖
2. ✅ 启动 PostgreSQL（`docker compose up -d postgres`）
3. ✅ 创建 `.env`（如果不存在）
4. ✅ `npm install` / `bun install`
5. ✅ `prisma db push` 同步 schema
6. ✅ `npm run dev` 启动服务

---

## UI (极简大厂风格)

```
Header:   [SC] [Chat] [审计] [数据]           [🔔] [🛡] [⚙] [👤]
                                             通知  HealthDot 设置 用户

输入区:                            [📎] [__________输入__________] [发送]
```

- **🛡 HealthDot**: 引擎健康状态（绿/灰/红三色映射：healthy/loading/unhealthy）
- **🔧 工具箱**（旧版滑出面板）：全局搜索(Cmd+K)、导出数据、数据导入、MCP/SSE 状态、刷新、备注中心
- **⚙ 设置**：记忆开关、模型选择、联网搜索、外观主题、API Key
- **🔔 通知**：未读审计事件、决策异常

---

## Architecture

```
User Query
  ↓
Semantic Router (LLM-based intent classification)
  ↓
FSM v2 Agent Engine (6-state: classify→plan→execute→observe→decide→synthesize)
  ↓
Provider Adapter Layer (DeepSeek / OpenAI / Anthropic / Ollama — hot-swap)
  ↓
Progressive Tool Filter (83 tools → intent-relevant subset)
  ↓
Knowledge Injection (Graph RAG + 8 SOP Skills)
  ↓
MCP Tool Execution (parallel, with autonomy policy)
  ↓
Trace Persistence (DecisionTrace → TraceStep → TraceToolCall + TracedClaim)
  ↓
Cascade Risk Modeling (SEIR + CausalML — NEW in v2.1)
  ↓
Passport Audit Chain (NEW in v2.1)
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
| **Risk** | 5 tools | **Cascade risk propagation v2 (SEIR + CausalML)**, CPSC recall monitoring, coherence audit, weather risk, recall risk prediction |
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
| Framework | Next.js 16.1.3 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| UI | React 19 + Tailwind CSS 4 + shadcn/ui + Recharts |
| Database | PostgreSQL 16 + Prisma 5 (28 models, UUID tenantId) |
| Auth | NextAuth.js + 3-tier RBAC (org_admin/team_admin/member/viewer) |
| Agent Engine | FSM v2 (6-state, model-agnostic) |
| Knowledge | Graph RAG (pgvector) + 8 SOP Skills |
| Math Engines | Python 3 + NumPy (24 OR models) via bridge |
| Search | SearXNG self-hosted (70+ engines) |
| Streaming | SSE (Server-Sent Events) |
| Cache | ICacheBackend (Memory / PostgreSQL / Redis) |
| Testing | Vitest 2 (1,627 tests) + Playwright 1.50+ (6 E2E) |
| Billing | Stripe (optional) |
| Monitoring | Sentry + OpenTelemetry |

---

## Project Metrics (v2.1)

| 指标 | 数值 |
|---|---|
| **API 路由** | 69 |
| **MCP 工具** | 83 |
| **客户端组件** | 121 |
| **Services** | 31 |
| **单元测试** | 1,627（全部通过） |
| **E2E 测试** | 6 个 Playwright 场景 |
| **Tracked files** | 1,552 |
| **License** | CC BY-NC 4.0 |

---

## Requirements

- **Node.js** 20+ 或 **Bun** 1.0+
- **PostgreSQL** 16（推荐 Docker：`docker compose up -d postgres`）
- **Python** 3.8+（可选，用于数学引擎）
- **LLM API Key**（DeepSeek / OpenAI / Anthropic 之一，或本地 Ollama）

---

## Development

```bash
# 安装
bun install                # 或 npm install
bun install --no-optional  # 跳过 stripe（不需要 billing 时）

# 开发
bun run dev                # http://localhost:3000
bun run build              # 生产构建

# 测试
bun run test               # 1,627 单元测试
bun run e2e                # 6 个 E2E 场景（需先起服务）

# 数据库
bun run db:push            # 同步 Prisma schema
bun run db:seed            # seed 50 产品 + 11K 销售记录
bun run db:studio          # Prisma Studio

# Lint / Type check
npx tsc --noEmit           # 0 个新错误
```

---

## Configuration

复制 `.env.example` 到 `.env` 并填入你的值。完整配置项：

```bash
# 必须
DATABASE_URL=postgresql://supplychain:supplychain@localhost:5432/supply_chain
NEXTAUTH_SECRET=<random-string>
DEEPSEEK_API_KEY=<your-key>  # 或 OPENAI_API_KEY / ANTHROPIC_API_KEY

# 推荐
CACHE_BACKEND=memory         # memory | postgres | redis
SEARCH_PROVIDER=searxng      # searxng | brave | tavily | jina
LLM_ROUTER_STRATEGY=balanced # simple | balanced | quality

# 可选（多租户 SaaS）
TENANT_MODE=subdomain
BASE_DOMAIN=cortex.app
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000001

# 可选（增强 RBAC）
RBAC_ENABLED=false           # true 启用三层 RBAC

# 可选（Billing）
BILLING_ENABLED=false        # true 启用 Stripe
# STRIPE_SECRET_KEY=...
```

完整配置说明见 `.env.example`。

---

## License

**CC BY-NC 4.0** — Free for non-commercial use.
Commercial licensing available: contact via GitHub Issues.

See [LICENSE](LICENSE) for the full text.

---

## Acknowledgments

- **DeepSeek** for the V3.2 / Reasoner LLM API
- **Anthropic** for the Claude Sonnet 4.6 reference
- **OpenAI** for the GPT-4o fallback
- **Prisma** for the type-safe ORM
- **shadcn/ui** for the component library
- **Next.js team** for the framework
- **All contributors** who submitted issues and PRs

---

## Star History

If SupplyChain Cortex is useful to you, please ⭐ star the repo. It helps others discover the project.

---

Built with ❤️ by [JiuTian](https://github.com/JiuTian-dev) and contributors.
