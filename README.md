# SupplyChain Cortex

**MCP-driven supply chain decision intelligence engine for cross-border e-commerce.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-0%20errors-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-308%20passed-brightgreen)]()

Cascading risk propagation, formalized decision graph, Bayesian self-calibration, and enterprise resilience — all running locally.

---

## Why

Cross-border supply chains face compounded risks: weather disruptions at ports, exchange rate shocks, tariff escalations, and supplier failures. Most tools only show you data. SupplyChain Cortex tells you **what will happen** (cascade risk), **what you should do** (decision graph), and **gets smarter with every decision** (Bayesian calibration).

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Frontend (Next.js 16)               │
│   Monitor → Analysis → Decision → Simulation         │
├──────────────────────────────────────────────────────┤
│                   MCP Protocol Layer                  │
│         21 tools (inventory, cost, risk, FX...)       │
├──────────────────────────────────────────────────────┤
│                  Decision Engines                     │
│  ┌──────────────┬────────────┬───────────────────┐  │
│  │Cascade Risk  │ Decision   │ Tariff/Cost        │  │
│  │Propagation   │ Graph      │ Simulation         │  │
│  └──────────────┴────────────┴───────────────────┘  │
├──────────────────────────────────────────────────────┤
│              Enterprise Resilience                   │
│  CircuitBreaker · Timeout · Retry · Fallback · Cache │
├──────────────────────────────────────────────────────┤
│              Self-Evolving Pipeline                  │
│  Feedback → Bayesian Posterior → Weight Calibration  │
├──────────────────────────────────────────────────────┤
│              Data Layer (Prisma + SQLite)             │
│         23 models · 46 API endpoints                 │
└──────────────────────────────────────────────────────┘
```

## Key Features

### Core Decision Engines

| Engine | Description |
|---|---|
| **Cascade Risk Propagation** | Directed graph propagation with multi-source anomaly fusion (Open-Meteo weather + Frankfurter FX + DB). Calibrated attenuation factors from historical data. |
| **Decision Graph** | Encoded supply chain decisions as traversable decision trees with conditions, outcomes, confidence scoring, and urgency classification. |
| **Tariff Simulation** | HS code lookup, scenario simulation (baseline, trade_war, typhoon_season, perfect_storm), per-product duty calculation. |
| **Workflow Orchestration** | MCP tool execution with skip/abort/fallback failure modes, step-level timing, and context passing. |

### Enterprise Resilience (D1-D4)

- **Circuit Breaker** — auto-open after N failures, half-open probe after cooldown
- **Timeout + Retry** — jittered exponential backoff, AbortController isolation
- **Decision Passport** — every output carries audit ID, 5-source provenance chain, confidence score, alternative comparison
- **Deterministic Simulation** — mulberry32 seeded PRNG, seed-replay for reproducibility
- **Feedback Loop** — user accept/reject → Prisma FeedbackLog → Bayesian weight calibration
- **Anomaly Detection** — Z-score monitoring on 7-day rolling window, auto-rollback recommendation

### Frontend

- **4-layer decision flow**: Monitor → Analysis → Decision → Simulation (tab-based)
- **6 operational tabs**: Inventory, Cost, Logistics, Supplier, Risk, Dashboard
- **Configurable metrics**: Power-BI-style ConfigToolbar (currency, risk thresholds, time horizon)
- **Decision cards**: Accept/Reject with reason, wired to `/api/engine-feedback`
- **Passport panel**: Collapsible provenance chain with 5-source status indicators
- **Sandbox replay**: Seed input for reproducible simulation runs

## Getting Started

### Prerequisites

- Node.js 20+
- npm or bun

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/supplychain-cortex.git
cd supplychain-cortex
npm install
```

### Configure Environment

```bash
cp .env.example .env
# Edit .env — at minimum, set a NEXTAUTH_SECRET
```

### Setup Database

```bash
npx prisma generate
npx prisma db push
npx prisma db seed  # Populate with sample supply chain data
```

### Run

```bash
npm run dev
# Open http://localhost:3000
```

### API Health Check

```bash
curl http://localhost:3000/api/engine-health
# {"status":"healthy","timestamp":"...","checks":{...}}
```

### Run Tests

```bash
npm test              # 308 unit tests
npx playwright test   # 7 e2e tests
```

## API Quick Reference

| Endpoint | Description |
|---|---|
| `GET /api/cascade-risk?scenario=auto` | Risk propagation analysis with passport |
| `GET /api/decision-graph?query=库存` | Structured decision recommendations |
| `GET /api/sandbox?scenario=perfect_storm&seed=42` | Deterministic scenario simulation |
| `POST /api/engine-feedback` | Record user feedback on AI suggestions |
| `GET /api/engine-calibrate?action=apply` | Auto-calibrate Bayesian weights |
| `GET /api/engine-health?action=quality` | Decision quality anomaly detection |
| `GET /api/engine-health?action=audit&format=csv` | Export full audit trail |
| `GET /api/mcp` | List all 21 MCP tools |

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict, 0 errors) |
| Database | SQLite (MySQL/Postgres schemas available) |
| ORM | Prisma 6 |
| State | Zustand 5 + TanStack React Query 5 |
| UI | shadcn/ui + Tailwind CSS 4 + Recharts |
| Testing | Vitest 4 + Playwright |
| Container | Docker + Caddy |

## Project Structure

```
src/
├── app/api/           # 46 API route handlers
├── lib/
│   ├── engine/        # 10 production modules (resilience, passport, calibration...)
│   ├── services/      # 24 business logic services
│   ├── queries/       # 20 query modules (data access)
│   ├── mcp/           # MCP tool registry (21 tools in 4 domain files)
│   ├── utils/         # Shared utilities (date, format)
│   └── dashboard/     # Config-driven metrics system
├── components/
│   ├── dashboard/     # Decision flow (MonitorStrip, DecisionCenter, ConfigToolbar...)
│   ├── inventory/     # Inventory management tab
│   ├── risk/          # Risk analysis (CascadeRiskPanel)
│   └── ...
└── hooks/             # React hooks (use-supply-chain-data, use-filtered-data...)
```

## Roadmap

- [x] Phase 1: Core engines (cascade risk, decision graph, tariff, workflow)
- [x] Phase 2: Enterprise resilience (circuit breaker, passport, deterministic)
- [x] Phase 3: Self-evolving pipeline (feedback, calibration, anomaly detection)
- [ ] Phase 4: Multi-tenant RBAC
- [ ] Phase 5: AI provider integration (DeepSeek, OpenAI, Anthropic, Ollama)
- [ ] Phase 6: K8s Helm chart + monitoring dashboards

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — use it, fork it, build on it.
