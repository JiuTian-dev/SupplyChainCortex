# SupplyChain Cortex v1.1.0

**MCP-driven supply chain decision intelligence for cross-border small-appliance e-commerce.**

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-0%20errors-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-356%20passed-brightgreen)]()
[![Version](https://img.shields.io/badge/version-1.1.0-orange)]()
[![MCP Tools](https://img.shields.io/badge/MCP%20tools-61-blueviolet)]()
[![Python Math](https://img.shields.io/badge/Python%20math-24%20engines-green)]()

**6-layer supply chain intelligence: Clean real-time data → Algorithmic prediction → Mathematical optimization → Expert chat agent → Semi-automated decision → Closed-loop learning.**

---

## Why

Cross-border supply chains face compounded risks: weather disruptions at ports, exchange rate shocks, tariff escalations, and supplier failures. Most tools only show you data. SupplyChain Cortex tells you **what will happen** (cascade risk), **what you should do** (decision graph), **calculates the optimal answer** (math engines), and **gets smarter with every decision** (Bayesian calibration).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   Frontend (Next.js 16)                           │
│    MonitorStrip → Dashboard Tabs → Chat Drawer → Decision Flow   │
├──────────────────────────────────────────────────────────────────┤
│                   MCP Protocol Layer                              │
│         61 tools (33 query + 24 math + 4 action)                  │
├──────────────────────────────────────────────────────────────────┤
│          Decision Engines (Hybrid Determinism)                    │
│  ┌────────────┬──────────────┬──────────────┬────────────────┐  │
│  │Cascade Risk│ Decision     │ Tariff/Cost  │ Supply Chain   │  │
│  │Propagation │ Graph        │ Simulation   │ Math (Python)  │  │
│  └────────────┴──────────────┴──────────────┴────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│      2026 Agent Layer (ReAct + Dynamic Context + Policy)         │
│  ┌────────────┬──────────────┬──────────────┬────────────────┐  │
│  │ReAct Loop  │ Evidence-    │ Policy-as-   │ 24 Math Calc  │  │
│  │            │ Level Feedb. │ Code Autonomy│ Engines        │  │
│  └────────────┴──────────────┴──────────────┴────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│              Enterprise Resilience                                │
│   CircuitBreaker · Timeout · Retry · Fallback · Cache            │
├──────────────────────────────────────────────────────────────────┤
│              Self-Evolving Pipeline                               │
│   Feedback → Bayesian Posterior → Weight Calibration             │
├──────────────────────────────────────────────────────────────────┤
│         Data Layer (Prisma + PostgreSQL / SQLite)                │
│   23 models · 9 external sources · 60+ API endpoints             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Six-Layer Decision Intelligence

### Layer 1: Clean Real-Time Data

| Source | Type | Data |
|--------|------|------|
| **Internal DB** | Products, Inventory, Sales, Shipments, Costs | 23 Prisma models, 170+ products, 62K+ sales records |
| **Exchange Rates** | Frankfurter API + PBOC ALAPI | USD/CNY, EUR/CNY, JPY/CNY |
| **Commodities** | Alpha Vantage + FRED | Copper, Aluminum, Steel, PP, LLDPE, PVC |
| **Freight** | SCFIS Futures | Shanghai-Europe container freight index |
| **Carbon** | EU ETS | EUA carbon price + CBAM calculation |
| **Tariffs** | USTR Scraper | Section 301 + HS code duty rates |
| **Recalls** | CPSC Scraper | US consumer product safety recalls |
| **Weather** | Open-Meteo | 10 global port marine weather |
| **Financial** | Yahoo Finance | QQQ, SPY, SMH, ^IXIC |

### Layer 2: Mathematical Optimization (NEW in v1.0, enhanced in v1.1)

24 Python-powered supply chain math engines accessible via MCP tools. Each is a rigorously implemented operations research model.

| Category | Tools |
|----------|-------|
| **Inventory** | `calculate_eoq` (with discount models), `calculate_safety_stock`, `calculate_reorder_point`, `classify_abc_xyz` |
| **Forecasting** | `forecast_demand` (SMA/ES/Linear/Winters/Croston + confidence intervals), `calculate_seasonal_decompose` |
| **Simulation** | `monte_carlo_inventory` (Q,R policy, N iterations) |
| **Optimization** | `calculate_wagner_whitin` (optimal lot sizing), `calculate_newsvendor` (single-period) |
| **Network** | `calculate_drp` (distribution planning), `calculate_warehouse_location`, `calculate_transport_route`, `calculate_multi_echelon_ss` |
| **Metrics** | `calculate_inventory_kpi`, `calculate_fill_rate`, `calculate_lead_time_analysis`, `calculate_purchase_variance` |
| **Finance** | `calculate_total_cost`, `calculate_supplier_scoring` |
| **Production** | `calculate_learning_curve`, `calculate_break_even` |
| **Pricing** | `calculate_optimal_pricing` (elasticity-based) |
| **Planning** | `calculate_joint_replenishment`, `calculate_forecast_accuracy` |

All engines are pure Python functions with thorough input validation, accessed through `mcp-server/bridge.py`. Modular package structure under `mcp-server/supply_math/` with 10 domain-grouped modules.

### Layer 3: Algorithmic Prediction

| Engine | Technique | Output |
|--------|-----------|--------|
| **Cascade Risk** | Directed graph propagation + multi-source anomaly fusion | 4D risk score (depth × breadth × criticality × centrality) |
| **Decision Graph** | Traversable decision trees | Actions with confidence + urgency + expected impact |
| **Tariff Simulation** | Scenario-based (baseline / trade_war / typhoon / perfect_storm) | Per-product duty + landed cost |
| **Anomaly Detection** | Z-score on 7-day rolling window | Auto-rollback recommendation |
| **Deterministic Engine** | mulberry32 seeded PRNG | Seed-replay for reproducibility + audit |

### Layer 4: Expert Chat Agent

| Capability | Implementation |
|------------|---------------|
| **ReAct Reasoning** | Multi-round think → call tools → observe → analyze loop |
| **Dynamic Context** | Live supply chain state injected per-request |
| **MCP Tool Suite** | **61 tools** (33 query + 24 math + 4 action) queryable in natural language |
| **Right-Side Drawer** | 460-900px resizable drawer with backdrop, keyboard Esc close |
| **RAG Knowledge Base** | 50+ hand-curated domain chunks |
| **Multi-Provider** | DeepSeek / OpenAI / Anthropic / Ollama |
| **Evidence Feedback** | `[claim-N]` tags link every claim to its data source |

### Layer 5: Semi-Automated Decision

| Level | Description | Status |
|-------|-------------|--------|
| **Assisted** | Agent recommends with data provenance + confidence | ✅ Live |
| **Automated** | Agent executes within policy guardrails | ✅ Policy-as-Code |
| **Autonomous** | End-to-end with human-on-the-loop oversight | 🔄 Planned |

Every decision carries a **Decision Passport**: audit ID → 5-source provenance chain → confidence score → alternative comparison → execution trace.

### Layer 6: Closed-Loop Learning

```
Agent suggestion → User accept/reject/modify → Evidence-level feedback
    → Source reliability update (Bayesian) → Knowledge weight calibration
    → Next suggestion improved
```

---

## v1.1.0 Release Notes

### New in v1.1

| Module | Description |
|--------|-------------|
| **24 Math Engines** | Python-powered OR models: EOQ, Wagner-Whitin, Newsvendor, DRP, Monte Carlo, learning curve, break-even, optimal pricing, joint replenishment, forecast accuracy, and more |
| **Right-Side Chat Drawer** | 460-900px resizable drawer replacing floating modal. Side-by-side data view |
| **MonitorStrip Real-Time** | Live health score, port risks, commodity prices, FX rates in header strip |
| **Data Consistency** | All health/risk scores unified across `/api/supply-chain-score`, `/api/brief`, and `/api/supply-chain-score?action=history` |
| **Stress-Tested Seed** | 170 products × 365 days = 62,050 sales records, realistic inventory distribution |
| **Smart Reorder** | Safety-gap-aware reorder recommendations with URGENT/HIGH/MEDIUM/LOW priority |
| **Product Compare** | Multi-dimensional radar chart comparison via ProductCompareDialog |
| **Unified UI Colors** | Gold (#b8860b) utilization text, white circle indicators, consistent badges |

### Changes from v0.8.x

| Area | v0.8.x | v1.1.0 |
|------|--------|--------|
| MCP Tools | 27 | **61** (+24 math + 10 query) |
| Chat Layout | Floating draggable modal | **Right-side drawer** (resizable) |
| Math Engines | None | **24 Python engines** (modular) |
| Health Score Consistency | 3 different values | **Single source of truth** |
| Seed Data | 12 products, 1K sales | **170 products, 62K sales** |
| Reorder Logic | All qty=0 | **Safety-gap-aware** |
| MonitorStrip | Ad-hoc scores | **Live API-driven** |

---

## Getting Started

### Prerequisites

- Node.js 20+ / Bun
- Python 3.10+ (for math engines)
- PostgreSQL (or Docker)
- Docker (optional, for SearXNG)

### Quick Start

```bash
git clone git@github.com:JiuTian-dev/SupplyChainCortex.git
cd SupplyChainCortex

# Install
bun install
pip install numpy  # for Python math engines

# Configure
cp .env.example .env
# Edit .env — set DEEPSEEK_API_KEY at minimum

# Start PostgreSQL
docker compose up -d postgres
# Or use your local PostgreSQL (set DATABASE_URL in .env)

# Setup database
bun run db:push
bun run db:seed        # 170 products, 62K sales records

# Optional: start self-hosted search engine
docker compose up -d searxng

# Run
bun run dev
# Open http://localhost:3000
```

### Health Check

```bash
curl http://localhost:3000/api/engine-health
curl http://localhost:3000/api/supply-chain-score     # Health score
curl http://localhost:3000/api/mcp                    # 61 tools
```

### Run Tests

```bash
bun test                    # 356 unit tests (Vitest)
npx playwright test         # end-to-end tests
```

---

## API Quick Reference

### Supply Chain Math (NEW)

| Endpoint | Description |
|----------|-------------|
| `POST /api/supply-chain/calculate_eoq` | Economic Order Quantity (with discounts) |
| `POST /api/supply-chain/calculate_break_even` | Break-even analysis with scenarios |
| `POST /api/supply-chain/calculate_optimal_pricing` | Price-elasticity optimal pricing |
| `POST /api/supply-chain/calculate_wagner_whitin` | Optimal lot sizing (dynamic programming) |
| `POST /api/supply-chain/calculate_joint_replenishment` | Multi-product joint ordering |
| `POST /api/supply-chain/monte_carlo_inventory` | Monte Carlo inventory simulation |
| `POST /api/supply-chain/[tool]` | Dynamic route — all 24 math tools |

### Decision Engines

| Endpoint | Description |
|----------|-------------|
| `POST /api/chat` | ReAct agent chat (streaming SSE) |
| `GET /api/cascade-risk?scenario=auto` | Risk propagation with passport |
| `GET /api/decision-graph?query=库存` | Decision recommendations |
| `GET /api/sandbox?scenario=perfect_storm&seed=42` | Deterministic simulation |

### Core Data

| Endpoint | Description |
|----------|-------------|
| `GET /api/supply-chain-score` | Authoritative health score (62/100 scale) |
| `GET /api/brief` | Weekly intelligence brief (health + risk + events) |
| `GET /api/inventory?action=list` | Inventory list with pagination |
| `GET /api/inventory?action=reorder_recommendations` | Smart reorder suggestions |
| `GET /api/cost?action=trend` | Cost change tracking (6-month) |
| `GET /api/warehouse?action=aging` | Inventory aging analysis |

### Feedback & Learning

| Endpoint | Description |
|----------|-------------|
| `POST /api/engine-feedback` | Record user feedback (evidence-level with `claims` array) |
| `POST /api/engine-feedback/extract-claims` | Parse `[claim-N]` tags from agent response |
| `GET /api/engine-calibrate?action=apply` | Trigger Bayesian weight calibration |
| `GET /api/engine-health?action=audit&format=csv` | Export full audit trail |

### MCP Tools

| Endpoint | Description |
|----------|-------------|
| `GET /api/mcp` | List all 61 MCP tools with schemas |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict, 0 errors) + Python 3.10+ |
| Database | PostgreSQL 16 (SQLite/MySQL schemas available) |
| ORM | Prisma 6 |
| AI Providers | DeepSeek V4 Pro / OpenAI / Anthropic / Ollama |
| Math Engines | Python 3 + NumPy + SciPy (24 OR models) |
| State | Zustand 5 + TanStack React Query 5 |
| UI | shadcn/ui + Tailwind CSS 4 + Recharts 2 |
| Testing | Vitest 4 (356 tests) + Playwright |
| Container | Docker + Caddy + docker-compose |
| Search | SearXNG (self-hosted, 70+ engines) |

---

## Project Structure

```
SupplyChainCortex/
├── mcp-server/
│   ├── bridge.py                  # Node.js → Python bridge (24 engines)
│   ├── server.py                  # FastMCP stdio server
│   └── supply_math/               # Modular math engine package
│       ├── __init__.py            # Unified exports
│       ├── _helpers.py            # Normal distribution, constants
│       ├── inventory.py           # EOQ, safety stock, ROP, ABC-XYZ
│       ├── forecasting.py         # Demand forecast, seasonal decompose
│       ├── simulation.py          # Monte Carlo simulation
│       ├── optimization.py        # Wagner-Whitin, Newsvendor
│       ├── network.py             # DRP, warehouse, transport, multi-echelon
│       ├── metrics.py             # KPI, fill rate, lead time, PPV
│       ├── finance.py             # Total cost, supplier scoring
│       ├── production.py          # Learning curve, break-even
│       ├── pricing.py             # Optimal pricing
│       └── planning.py            # Joint replenishment, forecast accuracy
├── src/
│   ├── app/api/
│   │   ├── chat/                  # ReAct agent endpoint
│   │   ├── supply-chain/[tool]/   # Dynamic math tool API
│   │   ├── supply-chain-score/    # Health score endpoint
│   │   ├── brief/                 # Weekly intelligence brief
│   │   ├── cascade-risk/          # Risk propagation
│   │   ├── decision-graph/        # Decision recommendations
│   │   ├── sandbox/               # Simulation sandbox
│   │   └── ...                    # 60+ API route handlers
│   ├── lib/
│   │   ├── engine/
│   │   │   ├── react-agent.ts     # ReAct reasoning loop
│   │   │   ├── context-builder.ts # Dynamic system prompt
│   │   │   ├── passport.ts        # Decision provenance
│   │   │   ├── calibration.ts     # Bayesian weight calibration
│   │   │   ├── rag.ts             # Domain knowledge base
│   │   │   └── ...
│   │   ├── services/              # Business logic services
│   │   ├── sources/               # External data scrapers
│   │   ├── mcp/                   # 61 MCP tools (5 domain files)
│   │   └── dashboard/             # Config-driven metrics
│   ├── components/
│   │   ├── dashboard/             # MonitorStrip, DecisionCenter, Passport
│   │   ├── inventory/             # InventoryTab, ReorderPanel, WarehouseZones
│   │   ├── cost/                  # CostTab, CostImpactHeatmap, CostWaterfall
│   │   ├── logistics/             # LogisticsTab, ShipmentRouteMap
│   │   ├── risk/                  # RiskTab, RiskPropagationGraph
│   │   ├── supplier/              # SupplierTab, SupplierGeoMap
│   │   ├── sales/                 # SalesTab, SalesForecastEnhanced
│   │   ├── quality/               # QualityTab, returns, defects, warranty
│   │   └── shared/                # ChatPanel (drawer), ScrollToTop, etc.
│   └── hooks/                     # React Query hooks
├── prisma/
│   ├── schema.prisma              # 23 models
│   └── seed.ts                    # Stress-test seed (170 products × 365 days)
├── docker-compose.yml
├── Caddyfile
└── vitest.config.ts
```

---

## Roadmap

### ✅ Completed

| Phase | Feature |
|-------|---------|
| **v0.1–0.4** | Core engines: cascade risk, decision graph, tariff simulation, workflow |
| **v0.5** | Enterprise resilience: circuit breaker, retry, cache, passport |
| **v0.6** | Self-evolving pipeline: feedback, Bayesian calibration, anomaly detection |
| **v0.7** | Frontend: 4-layer decision flow, 6 operational tabs, sandbox replay |
| **v0.8** | 2026 upgrades: ReAct agent, dynamic context, evidence feedback, policy-as-code |
| **v1.0.0** | Math engines, chat drawer, data consistency, stress-tested seed, 61 tools |
| **v1.1.0** | Database unification, security hardening, cost module upgrade, batch ops, drag-drop dashboard, 647 tests |

### 📋 Planned

| Feature | Description |
|---------|-------------|
| **Multi-tenant RBAC** | Role-based access control for team deployments |
| **Real-time alerts** | WebSocket push notifications for critical events |
| **Graph-RAG** | Supply chain relationship reasoning (Neo4j) |
| **Mobile PWA** | Progressive web app for on-the-go monitoring |
| **Integration hub** | Native connectors for Amazon Seller Central, Shopify, ERP |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[CC BY-NC 4.0](LICENSE) — 自由用于学习、研究、非商业用途。商业使用需单独授权。

---

**SupplyChain Cortex v1.1.0** — Built by [JiuTian-dev](https://github.com/JiuTian-dev)
