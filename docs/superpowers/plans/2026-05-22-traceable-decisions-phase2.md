# Traceable Decisions Phase 2 — Frontend Audit Panel

> Implementation plan for Phase 2 of traceable decisions: AuditTab, TraceList, TraceDetail, CausalGraph

**Goal:** Visualize persisted decision traces in a new Audit tab, with FSM state transition graph and tool call details.

**Architecture:** New AuditTab component fetches from `/api/audit/traces`. Left panel = TraceList (filterable history). Right panel = TraceDetail with embedded CausalGraph (FSM states + tool calls). Reuses existing dashboard tab layout pattern.

**Tech Stack:** React 19, Tailwind CSS 4, Recharts (already in project), TanStack React Query (already in project)

---

### Task P2.1: AuditTab Container + TraceList

**Files:**
- Create: `src/components/audit/AuditTab.tsx`
- Create: `src/components/audit/TraceList.tsx`

AuditTab: two-column layout (left: TraceList, right: detail placeholder or TraceDetail).
TraceList: fetch `/api/audit/traces`, render scrollable list, intent filter dropdown, click to select.

### Task P2.2: TraceDetail Panel

**Files:**
- Create: `src/components/audit/TraceDetail.tsx`

Shows full trace: query, intent badge, confidence score, duration, tools used list, and embedded CausalGraph. Fetch from `/api/audit/traces/:id`.

### Task P2.3: CausalGraph Visualization

**Files:**
- Create: `src/components/audit/CausalGraph.tsx`

Custom SVG/Recharts visualization of FSM state flow. Nodes = states (classify→plan→execute→observe→decide→synthesize), colored by state type. Tool calls as sub-nodes on execute. Claims as sub-nodes on synthesize. Click node → expand detail.

### Task P2.4: Wire into Dashboard

**Files:**
- Modify: `src/components/dashboard/DashboardTab.tsx` (or wherever tabs are registered)

Register "审计" tab pointing to AuditTab component.

### Task P2.5: Phase 2 Audit

Full tsc + test + live UI check.
