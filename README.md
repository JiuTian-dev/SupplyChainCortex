# SupplyChain Cortex v0.8.0

**MCP-driven supply chain decision intelligence for cross-border small-appliance e-commerce.**

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-0%20errors-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-356%20passed-brightgreen)]()
[![Version](https://img.shields.io/badge/version-0.8.0-orange)]()

**Five-layer supply chain intelligence: Clean real-time data → Algorithmic prediction → Expert chat agent → Semi-automated decision → Closed-loop learning.**

---

## Why

Cross-border supply chains face compounded risks: weather disruptions at ports, exchange rate shocks, tariff escalations, and supplier failures. Most tools only show you data. SupplyChain Cortex tells you **what will happen** (cascade risk), **what you should do** (decision graph), and **gets smarter with every decision** (Bayesian calibration).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16)                      │
│     Monitor → Analysis → Decision → Simulation               │
├──────────────────────────────────────────────────────────────┤
│                    MCP Protocol Layer                         │
│           27 tools (inventory, cost, risk, FX...)             │
├──────────────────────────────────────────────────────────────┤
│           Decision Engines (Hybrid Determinism)               │
│  ┌─────────────┬──────────────┬──────────────────────────┐  │
│  │ Cascade Risk│ Decision     │ Tariff/Cost Simulation   │  │
│  │ Propagation │ Graph        │                          │  │
│  └─────────────┴──────────────┴──────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│      2026 Agent Layer (ReAct + Dynamic Context + Policy)     │
│  ┌─────────────┬──────────────┬──────────────────────────┐  │
│  │ ReAct Loop  │ Evidence-    │ Policy-as-Code           │  │
│  │             │ Level Feedb. │ Bounded Autonomy         │  │
│  └─────────────┴──────────────┴──────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│               Enterprise Resilience                          │
│   CircuitBreaker · Timeout · Retry · Fallback · Cache        │
├──────────────────────────────────────────────────────────────┤
│               Self-Evolving Pipeline                         │
│   Feedback → Bayesian Posterior → Weight Calibration         │
├──────────────────────────────────────────────────────────────┤
│          Data Layer (Prisma + PostgreSQL / SQLite)           │
│   23 models · 9 external data sources · 50+ API endpoints    │
└──────────────────────────────────────────────────────────────┘
```

---

## Five-Layer Decision Intelligence

### Layer 1: Clean Real-Time Data

| Source | Type | Data |
|--------|------|------|
| **Internal DB** | Products, Inventory, Sales, Shipments, Costs | 23 Prisma models |
| **Exchange Rates** | Frankfurter API + PBOC ALAPI | USD/CNY, EUR/CNY, JPY/CNY |
| **Commodities** | Alpha Vantage + FRED | Copper, Aluminum, Steel, PP, LLDPE, PVC |
| **Freight** | SCFIS Futures | Shanghai-Europe container freight index |
| **Carbon** | EU ETS | EUA carbon price + CBAM calculation |
| **Tariffs** | USTR Scraper | Section 301 + HS code duty rates |
| **Recalls** | CPSC Scraper | US consumer product safety recalls |
| **Weather** | Open-Meteo | 10 global port marine weather |
| **Financial** | Yahoo Finance | QQQ, SPY, SMH, ^IXIC |

### Layer 2: Algorithmic Prediction

| Engine | Technique | Output |
|--------|-----------|--------|
| **Cascade Risk** | Directed graph propagation + multi-source anomaly fusion | 4D risk score (depth × breadth × criticality × centrality) |
| **Decision Graph** | Traversable decision trees | Actions with confidence + urgency + expected impact |
| **Tariff Simulation** | Scenario-based (baseline / trade_war / typhoon / perfect_storm) | Per-product duty + landed cost |
| **Anomaly Detection** | Z-score on 7-day rolling window | Auto-rollback recommendation |
| **Deterministic Engine** | mulberry32 seeded PRNG | Seed-replay for reproducibility + audit |

### Layer 3: Expert Chat Agent

| Capability | Implementation |
|------------|---------------|
| **ReAct Reasoning** | Multi-round think → call tools → observe → analyze loop |
| **Dynamic Context** | Live supply chain state injected per-request (alerts, inventory, shipments, compliance) |
| **MCP Tool Suite** | 27 domain tools queryable by the agent in natural language |
| **RAG Knowledge Base** | 50+ hand-curated domain chunks (tariff, logistics, compliance, safety, payments) |
| **Multi-Provider** | DeepSeek / OpenAI / Anthropic / Ollama via unified abstraction |
| **Progressive Disclosure** | Skills loaded on-demand; 50+ available, only relevant ones consume context |

### Layer 4: Semi-Automated Decision

| Level | Description | Status |
|-------|-------------|--------|
| **Assisted** | Agent recommends with data provenance + confidence | ✅ Live |
| **Automated** | Agent executes within policy guardrails | ✅ Policy-as-Code |
| **Autonomous** | End-to-end with human-on-the-loop oversight | 🔄 Planned |

Every decision carries a **Decision Passport**: audit ID → 5-source provenance chain → confidence score → alternative comparison → execution trace.

### Layer 5: Closed-Loop Learning

```
Agent suggestion → User accept/reject/modify → Evidence-level feedback
    → Source reliability update (Bayesian) → Knowledge weight calibration
    → Next suggestion improved
```

---

## 2026 Upgrades (v0.8.0)

| Module | What it replaces | Key innovation |
|--------|-----------------|----------------|
| **ReAct Agent Loop** | Keyword-based `matchToolsToQuery()` | LLM decides which tools to call. `<tool>/<params>` XML protocol avoids DeepSeek function-calling bugs. Up to 5 reasoning rounds. |
| **Dynamic System Context** | Static 50-line system prompt | Real-time DB query builds context: critical alerts, inventory warnings, shipment delays, compliance deadlines, supplier risks. |
| **Evidence-Level Feedback** | Response-level accept/reject | `[claim-N]` tags link every claim to its data source. Users mark individual claims. Bayesian source-reliability tracking. |
| **Policy-as-Code** | No guardrails | `auto` / `confirm` / `forbid` per tool. Value limits, daily caps, confirmation cards. Read ops auto, write ops confirm. |

---

## Getting Started

### Prerequisites

- Node.js 20+ / Bun
- Docker (for PostgreSQL + SearXNG)

### Quick Start

```bash
git clone git@github.com:JiuTian-dev/SupplyChainCortex.git
cd SupplyChainCortex

# Install
bun install

# Configure
cp .env.example .env
# Edit .env — set DEEPSEEK_API_KEY at minimum

# Start infrastructure
docker compose up -d postgres

# Setup database
bun run db:push
bun run db:seed

# Optional: start self-hosted search engine
docker compose up -d searxng

# Run
bun run dev
# Open http://localhost:3000
```

### Health Check

```bash
curl http://localhost:3000/api/engine-health
# {"status":"healthy","timestamp":"...","checks":{...}}
```

### Run Tests

```bash
bun test                    # 356 unit tests (Vitest)
npx playwright test         # end-to-end tests
```

---

## API Quick Reference

### Decision Engines

| Endpoint | Description |
|----------|-------------|
| `POST /api/chat` | ReAct agent chat (streaming SSE supported) |
| `GET /api/cascade-risk?scenario=auto` | Risk propagation with passport |
| `GET /api/decision-graph?query=库存` | Decision recommendations |
| `GET /api/sandbox?scenario=perfect_storm&seed=42` | Deterministic simulation |

### Feedback & Learning

| Endpoint | Description |
|----------|-------------|
| `POST /api/engine-feedback` | Record user feedback (response-level or evidence-level with `claims` array) |
| `POST /api/engine-feedback/extract-claims` | Parse `[claim-N]` tags from agent response |
| `GET /api/engine-feedback?action=evidence-stats` | Per-source reliability scores |
| `GET /api/engine-calibrate?action=apply` | Trigger Bayesian weight calibration |
| `GET /api/engine-health?action=quality` | Decision quality anomaly detection |
| `GET /api/engine-health?action=audit&format=csv` | Export full audit trail |

### Autonomy Policy

| Endpoint | Description |
|----------|-------------|
| `GET /api/autonomy-policy` | Current policy configuration |
| `GET /api/autonomy-policy?action=stats` | Daily execution counts by tool |
| `PATCH /api/autonomy-policy` | Update policy levels and limits |

### MCP Tools

| Endpoint | Description |
|----------|-------------|
| `GET /api/mcp` | List all 27 MCP tools with schemas |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict, 0 errors) |
| Database | PostgreSQL 16 (SQLite/MySQL schemas available) |
| ORM | Prisma 6 |
| AI Providers | DeepSeek V4 Pro / OpenAI / Anthropic / Ollama |
| State | Zustand 5 + TanStack React Query 5 |
| UI | shadcn/ui + Tailwind CSS 4 + Recharts 2 |
| Testing | Vitest 4 (356 tests) + Playwright |
| Container | Docker + Caddy + docker-compose |
| Search | SearXNG (self-hosted, 70+ engines) |

---

## Project Structure

```
src/
├── app/api/
│   ├── chat/                    # ReAct agent endpoint
│   ├── autonomy-policy/         # Policy-as-code API
│   ├── engine-feedback/         # Evidence-level feedback API
│   ├── engine-calibrate/        # Bayesian calibration API
│   ├── engine-health/           # Engine health + audit API
│   ├── cascade-risk/            # Risk propagation
│   ├── decision-graph/          # Decision recommendations
│   ├── sandbox/                 # Simulation sandbox
│   └── ...                      # 50+ API route handlers
├── lib/
│   ├── engine/
│   │   ├── react-agent.ts       # ReAct reasoning loop (NEW v0.8)
│   │   ├── context-builder.ts   # Dynamic system prompt (NEW v0.8)
│   │   ├── evidence-feedback.ts # Claim-level feedback (NEW v0.8)
│   │   ├── autonomy-policy.ts   # Bounded autonomy (NEW v0.8)
│   │   ├── passport.ts          # Decision provenance
│   │   ├── deterministic.ts     # Seeded PRNG simulation
│   │   ├── calibration.ts       # Bayesian weight calibration
│   │   ├── resilience.ts        # Circuit breaker, retry, timeout
│   │   ├── feedback.ts          # Response-level feedback
│   │   ├── memory.ts            # Agent shared context
│   │   ├── rag.ts               # 50-chunk domain knowledge base
│   │   ├── causal-reasoning.ts  # Counterfactual analysis
│   │   └── ...
│   ├── services/                # 24 business logic services
│   ├── sources/                 # 9 external data source scrapers
│   ├── mcp/                     # 27 MCP tools in 4 domain files
│   └── dashboard/               # Config-driven metrics system
├── components/
│   ├── dashboard/               # Decision flow (Monitor → Analysis → Decision → Simulation)
│   ├── inventory/               # Inventory management
│   ├── cost/                    # Cost simulation + waterfall
│   ├── logistics/               # Shipment tracking + route maps
│   ├── risk/                    # Cascade risk + matrix heatmap
│   ├── supplier/                # Supplier analytics + comparison
│   ├── sales/                   # Demand forecasting
│   ├── quality/                 # Returns + defects + warranty
│   └── shared/                  # ChatPanel, Search, Notifications, etc.
└── hooks/                       # React hooks
```

---

## Roadmap

### ✅ Completed

| Phase | Feature |
|-------|---------|
| **v0.1–0.4** | Core engines: cascade risk, decision graph, tariff simulation, workflow |
| **v0.5** | Enterprise resilience: circuit breaker, retry, cache, passport, deterministic engine |
| **v0.6** | Self-evolving pipeline: feedback loop, Bayesian calibration, anomaly detection |
| **v0.7** | Frontend: 4-layer decision flow, 6 operational tabs, passport panel, sandbox replay |
| **v0.7.2** | AI provider integration: DeepSeek, OpenAI, Anthropic, Ollama. Streaming chat. 27 MCP tools. |
| **v0.8.0** | 2026 upgrades: ReAct agent loop, dynamic context, evidence feedback, policy-as-code autonomy |

### 🔄 In Progress

| Priority | Feature |
|----------|---------|
| **High** | Multi-turn conversation memory in chat agent |
| **High** | Knowledge base auto-evolution from evidence feedback |
| **Medium** | Graph-RAG for supply chain relationship reasoning (Neo4j) |
| **Medium** | Graduated autonomy: Stage 3 (Autonomous) for low-risk decisions |

### 📋 Planned

| Feature | Description |
|---------|-------------|
| **Multi-tenant RBAC** | Role-based access control for team deployments |
| **Real-time alerts** | WebSocket push notifications for critical supply chain events |
| **Supplier discovery** | AI-driven alternative supplier search and evaluation |
| **Mobile PWA** | Progressive web app for on-the-go monitoring |
| **Integration hub** | Native connectors for Amazon Seller Central, Shopify, ERP systems |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[CC BY-NC 4.0](LICENSE) — 自由用于学习、研究、非商业用途。商业使用需单独授权。
