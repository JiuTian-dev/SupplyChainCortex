# Traceable Decisions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persistent trace storage + API + causal graph visualization + counterfactual replay + compliance audit report

**Architecture:** FSM synthesize phase writes traces to Prisma (4 new models). API layer serves trace list/detail/replay/report. New AuditTab component with CausalGraph, ReplayPanel, ComplianceReport.

**Tech Stack:** Prisma 6, PostgreSQL 16, Next.js 16 App Router, Recharts, TypeScript 5

**Phase:** 1/3 — Backend trace capture & API

---

## Phase 1: Backend — Trace Capture + API

### Task 1: Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma` — add 4 models
- Create: none (migration auto-generated)

- [ ] **Step 1: Add models to schema**

Read the current `prisma/schema.prisma`, then append these 4 models at the end:

```prisma
// ─── Decision Trace Models (Agent Engine v2 Audit) ───────────────────────

model DecisionTrace {
  id          String   @id @default(cuid())
  auditId     String   @unique
  userQuery   String
  intent      String
  confidence  Float
  mode        String   @default("fsm-v2")
  tier        Int?
  durationMs  Int
  toolsUsed   String[]
  claimsCount Int      @default(0)
  passport    Json
  userId      String?
  summary     String?
  createdAt   DateTime @default(now())

  steps TraceStep[]

  @@index([createdAt])
  @@index([intent])
}

model TraceStep {
  id         String   @id @default(cuid())
  traceId    String
  trace      DecisionTrace @relation(fields: [traceId], references: [id], onDelete: Cascade)
  stepIndex  Int
  state      String   // classify | plan | execute | observe | decide | synthesize
  confidence Float?
  findings   String?
  nextState  String?
  durationMs Int      @default(0)

  toolCalls TraceToolCall[]
  claims    TracedClaim[]

  @@index([traceId])
  @@index([traceId, stepIndex])
}

model TraceToolCall {
  id        String   @id @default(cuid())
  stepId    String
  step      TraceStep @relation(fields: [stepId], references: [id], onDelete: Cascade)
  toolName  String
  params    Json
  result    Json?
  success   Boolean
  latencyMs Int
  error     String?

  @@index([stepId])
}

model TracedClaim {
  id          String @id @default(cuid())
  stepId      String
  step        TraceStep @relation(fields: [stepId], references: [id], onDelete: Cascade)
  claimIndex  Int
  text        String
  source      String   // MCP | KB | Search | LLM
  confidence  String   // high | medium | low

  @@index([stepId])
  @@index([source])
  @@index([confidence])
}
```

- [ ] **Step 2: Generate migration**

```bash
cd D:\vibe-coding\jiadian_supply\02_LocalDev\2\2.9.3\.worktrees\feat-agent-engine-v2
bun run db:generate
bun run db:push
```

Expected: "Your database is now in sync with your schema."

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(audit): add DecisionTrace, TraceStep, TraceToolCall, TracedClaim models"
```

---

### Task 2: TraceWriter

**Files:**
- Create: `src/lib/audit/trace-writer.ts`
- Create: `src/lib/audit/trace-writer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/audit/trace-writer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeTrace, extractClaims } from './trace-writer';
import type { FSMContext } from '@/lib/agent/fsm-types';
import { DEFAULT_FSM_CONFIG } from '@/lib/agent/fsm-types';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  db: {
    decisionTrace: {
      create: vi.fn().mockResolvedValue({ id: 'trace-1', auditId: 'audit-1' }),
    },
  },
}));

describe('extractClaims', () => {
  it('extracts [claim-N] patterns from text', () => {
    const text = '[claim-1] 当前库存65台 [T1-MCP][高]\n[claim-2] 预计缺货119台 [T1-MCP][中]';
    const claims = extractClaims(text);
    expect(claims).toHaveLength(2);
    expect(claims[0].text).toContain('库存65台');
    expect(claims[0].source).toBe('MCP');
    expect(claims[0].confidence).toBe('high');
  });

  it('returns empty array for text without claims', () => {
    expect(extractClaims('普通文本，没有声明标签')).toHaveLength(0);
  });

  it('handles mixed source/confidence tags', () => {
    const claims = extractClaims('[claim-1] 数据来自知识库 [T2-KB][低]');
    expect(claims[0].source).toBe('KB');
    expect(claims[0].confidence).toBe('low');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/audit/trace-writer.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/audit/trace-writer.ts
import { db } from '@/lib/db';
import type { FSMContext } from '@/lib/agent/fsm-types';
import type { DecisionPassport } from '@/lib/engine/passport';

export function extractClaims(
  text: string,
): Array<{ text: string; source: string; confidence: string }> {
  const results: Array<{ text: string; source: string; confidence: string }> = [];
  const claimRegex = /\[claim-(\d+)\]\s*(.+?)(?=\[claim-\d+\]|$)/gs;
  let match;

  while ((match = claimRegex.exec(text)) !== null) {
    const claimText = match[2].trim();
    // Extract source tag [T1-MCP], [T2-KB], [T3-Search], [T0-LLM]
    const sourceMatch = claimText.match(/\[T\d-(MCP|KB|Search|LLM)\]/);
    const source = sourceMatch ? sourceMatch[1] : 'LLM';
    // Extract confidence tag [高], [中], [低]
    const confMatchEN = claimText.match(/\[(high|medium|low)\]/i);
    const confMatchZH = claimText.match(/\[(高|中|低)\]/);
    const confidence = confMatchEN
      ? confMatchEN[1].toLowerCase()
      : confMatchZH
        ? ({ '高': 'high', '中': 'medium', '低': 'low' }[confMatchZH[1]] || 'medium')
        : 'medium';

    results.push({
      text: claimText.slice(0, 500),
      source,
      confidence,
    });
  }
  return results;
}

export async function writeTrace(
  ctx: FSMContext,
  finalResponse: string,
  passport: DecisionPassport,
): Promise<string | null> {
  try {
    const claims = extractClaims(finalResponse);

    const trace = await db.decisionTrace.create({
      data: {
        auditId: passport.auditId,
        userQuery: ctx.query,
        intent: ctx.routing?.intent || 'unknown',
        confidence: passport.confidence,
        mode: 'fsm-v2',
        tier: ctx.routing?.shouldUseTools ? 1 : ctx.routing?.shouldSearch ? 3 : 0,
        durationMs: Date.now() - ctx.startTimeMs,
        toolsUsed: ctx.toolsUsed,
        claimsCount: claims.length,
        passport: passport as unknown as Record<string, unknown>,
        steps: {
          create: buildStepData(ctx, claims),
        },
      },
      include: { steps: true },
    });

    return trace.id;
  } catch (err) {
    console.error('[TraceWriter] Failed to write trace:', (err as Error).message);
    return null;
  }
}

function buildStepData(ctx: FSMContext, claims: ReturnType<typeof extractClaims>) {
  const stepData: Array<{
    stepIndex: number;
    state: string;
    confidence?: number;
    findings?: string;
    nextState?: string;
    durationMs: number;
    toolCalls: { create: Array<{ toolName: string; params: Record<string, unknown>; result?: Record<string, unknown>; success: boolean; latencyMs: number; error?: string }> };
    claims: { create: Array<{ claimIndex: number; text: string; source: string; confidence: string }> };
  }> = [];

  // Build one step per round + synthesize
  const states = ['classify', 'plan', 'execute', 'observe', 'decide'];
  for (let round = 1; round <= ctx.round; round++) {
    for (const state of states) {
      const toolResults = round === 1
        ? ctx.toolResults
        : []; // Later rounds' tool results are accumulated

      stepData.push({
        stepIndex: stepData.length,
        state,
        confidence: ctx.routing?.confidence,
        findings: state === 'classify'
          ? `Intent: ${ctx.routing?.intent}, Confidence: ${ctx.routing?.confidence}`
          : state === 'observe'
            ? `Valid results: ${ctx.toolResults.filter(r => r.success).length}/${ctx.toolResults.length}`
            : undefined,
        nextState: state === 'decide'
          ? 'synthesize'
          : states[states.indexOf(state) + 1] || 'synthesize',
        durationMs: 0,
        toolCalls: {
          create: (state === 'execute' ? ctx.toolResults.map(r => ({
            toolName: r.tool,
            params: {},
            result: r.success ? (r.data as Record<string, unknown> || {}) : undefined,
            success: r.success,
            latencyMs: r.latencyMs,
            error: r.error,
          })) : []),
        },
        claims: { create: [] },
      });
    }
  }

  // Synthesize step
  stepData.push({
    stepIndex: stepData.length,
    state: 'synthesize',
    confidence: passport.confidence,
    findings: `Produced ${claims.length} claims across ${ctx.toolsUsed.length} tools`,
    durationMs: Date.now() - ctx.startTimeMs,
    toolCalls: { create: [] },
    claims: {
      create: claims.map((c, i) => ({
        claimIndex: i + 1,
        text: c.text,
        source: c.source,
        confidence: c.confidence,
      })),
    },
  });

  return stepData;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/audit/trace-writer.test.ts`
Expected: extractClaims tests pass (3/3). writeTrace test may fail on Prisma mock — adjust if needed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit/
git commit -m "feat(audit): add TraceWriter — FSM context → Prisma trace persistence"
```

---

### Task 3: Integrate TraceWriter into FSM

**Files:**
- Modify: `src/lib/agent/fsm.ts` — call writeTrace in handleSynthesize

- [ ] **Step 1: Add writeTrace call**

In `handleSynthesize`, just before the `yield { type: 'done' ... }` event, add:

```typescript
  // Persist trace for audit
  let traceId: string | null = null;
  try {
    const { writeTrace } = await import('@/lib/audit/trace-writer');
    traceId = await writeTrace(ctx, fullResponse, passport);
  } catch { /* trace persistence is best-effort, never blocks response */ }
```

And include `traceId` in the done event:

```typescript
  yield {
    type: 'done',
    toolsUsed: ctx.toolsUsed,
    steps: ctx.round,
    durationMs: Date.now() - ctx.startTimeMs,
    mode: 'fsm-v2',
    tier: ctx.routing?.shouldUseTools ? 1 : ctx.routing?.shouldSearch ? 3 : 0,
    passport: { ... },
    claimsExtracted,
    traceId,  // ← ADD THIS
  };
```

- [ ] **Step 2: Verify tsc + tests**

Run: `npx tsc --noEmit` — no new errors
Run: `npx vitest run src/lib/agent/fsm.test.ts` — 14 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/fsm.ts
git commit -m "feat(audit): integrate TraceWriter into FSM synthesize phase"
```

---

### Task 4: Trace Reader (API query layer)

**Files:**
- Create: `src/lib/audit/trace-reader.ts`

- [ ] **Step 1: Write trace-reader.ts**

```typescript
// src/lib/audit/trace-reader.ts
import { db } from '@/lib/db';

export async function getTraces(params: {
  intent?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const { intent, from, to, page = 1, limit = 20 } = params;
  const where: Record<string, unknown> = {};

  if (intent) where.intent = intent;
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
  }

  const [traces, total] = await Promise.all([
    db.decisionTrace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        auditId: true,
        userQuery: true,
        intent: true,
        confidence: true,
        durationMs: true,
        toolsUsed: true,
        claimsCount: true,
        createdAt: true,
      },
    }),
    db.decisionTrace.count({ where }),
  ]);

  return { traces, total, page, limit };
}

export async function getTraceById(id: string) {
  return db.decisionTrace.findUnique({
    where: { id },
    include: {
      steps: {
        orderBy: { stepIndex: 'asc' },
        include: {
          toolCalls: true,
          claims: true,
        },
      },
    },
  });
}

export async function deleteTrace(id: string) {
  return db.decisionTrace.delete({ where: { id } });
}

export async function getTraceStats(params: { from?: string; to?: string }) {
  const { from, to } = params;
  const where: Record<string, unknown> = {};
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
  }

  const [total, avgConfidence, intents, sources] = await Promise.all([
    db.decisionTrace.count({ where }),
    db.decisionTrace.aggregate({ where, _avg: { confidence: true } }),
    db.decisionTrace.groupBy({ by: ['intent'], _count: true, where }),
    db.tracedClaim.groupBy({ by: ['source'], _count: true }),
  ]);

  return {
    totalTraces: total,
    avgConfidence: Math.round((avgConfidence._avg.confidence || 0) * 100) / 100,
    intents: Object.fromEntries(intents.map(i => [i.intent, i._count])),
    claimSources: Object.fromEntries(sources.map(s => [s.source, s._count])),
  };
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit` — no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/audit/trace-reader.ts
git commit -m "feat(audit): add TraceReader — Prisma query layer for traces"
```

---

### Task 5: API Routes

**Files:**
- Create: `src/app/api/audit/traces/route.ts`
- Create: `src/app/api/audit/traces/[id]/route.ts`

- [ ] **Step 1: Write GET /api/audit/traces**

```typescript
// src/app/api/audit/traces/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTraces } from '@/lib/audit/trace-reader';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const intent = searchParams.get('intent') || undefined;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'));

  try {
    const data = await getTraces({ intent, from, to, page, limit });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Write GET/DELETE /api/audit/traces/[id]**

```typescript
// src/app/api/audit/traces/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTraceById, deleteTrace } from '@/lib/audit/trace-reader';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const trace = await getTraceById(id);
    if (!trace) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: trace });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteTrace(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify API works**

Start dev server, then:

```bash
# List traces
curl http://localhost:3000/api/audit/traces | python3 -m json.tool | head -10
# Get specific trace
curl http://localhost:3000/api/audit/traces/TRACE_ID | python3 -m json.tool | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/audit/
git commit -m "feat(audit): add trace list/detail API endpoints"
```

---

### Task 6: Phase 1 Audit

- [ ] **Step 1: Full tsc check**

Run: `npx tsc --noEmit 2>&1 | grep "src/lib/audit\|src/app/api/audit" | head -10`
Expected: no output (no errors from our files)

- [ ] **Step 2: Full test suite**

Run: `bun run test`
Expected: no new failures

- [ ] **Step 3: Live integration test**

```bash
# Start dev + send a chat query → check trace is written
curl -s -N "http://localhost:3000/api/chat" -H "Content-Type: application/json" \
  -d '{"message":"query inventory overview","stream":true,"provider":"deepseek"}' \
  --max-time 60 2>&1 | grep "traceId"

# Verify trace exists in API
curl http://localhost:3000/api/audit/traces | python3 -m json.tool 2>/dev/null | grep total
```

Expected: traceId in done event, trace list shows the new entry.

- [ ] **Step 4: Commit HANDOVER update**

```bash
git add HANDOVER.md
git commit -m "docs: update HANDOVER with Phase 1 traceable decisions"
```

---

## Phase 2 & 3 (to be detailed after Phase 1 completion)

Phase 2: Frontend — AuditTab, TraceList, TraceDetail, CausalGraph
Phase 3: Replay — ReplayPanel, ComplianceReport, replay API
