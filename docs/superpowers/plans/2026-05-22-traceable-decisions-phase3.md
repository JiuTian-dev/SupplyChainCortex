# Traceable Decisions Phase 3 — Replay + Compliance Report

**Goal:** Counterfactual replay engine + compliance report generation.

**Architecture:**
- ReplayEngine: clone trace, modify tool params, re-execute tool, re-synthesize via LLM, compare diffs
- ReplayPanel: UI for selecting trace, modifying params, viewing replay results side-by-side
- ComplianceReport: stats dashboard with EU AI Act checklist, JSON export

**Tasks:**

### P3.1: Replay Engine (src/lib/audit/replay-engine.ts)
Clone a trace, re-execute modified tools, call adapter for re-synthesis, return diff.

### P3.2: Replay API (POST /api/audit/traces/[id]/replay)
Endpoint that accepts modifications array, runs replay engine, returns new trace + diff.

### P3.3: ReplayPanel + ComplianceReport frontend
ReplayPanel: modify params form, side-by-side diff view.
ComplianceReport: stats cards, checklist, JSON download.

### P3.4: Phase 3 Audit
Full tsc + test + live verification.
