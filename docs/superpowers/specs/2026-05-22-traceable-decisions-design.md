# Traceable Decisions — Design Spec

> 2026-05-22 | 决策可追溯审计系统（因果图 + 反事实回放 + 合规报告）

## 1. 问题陈述

FSM v2 产出了结构化的决策数据（auditId, passport, provenance, tool calls），但这些数据仅存在于 SSE 事件流和内存中。没有任何持久化、查询、可视化能力。合规审计需要的事后追溯、声明溯源、反事实分析全部缺失。

## 2. 架构总览

```
FSM synthesize (done event)
    │
    ▼
TraceWriter (src/lib/audit/trace-writer.ts)
    │
    ▼
Prisma: DecisionTrace → TraceStep → TraceToolCall + TracedClaim
    │
    ▼
API: /api/audit/traces (GET list / GET detail / POST replay / DELETE)
    │
    ▼
前端: AuditTab (审计面板，新 Tab 页)
    ├── TraceList        — 历史决策列表（筛选/搜索/排序）
    ├── TraceDetail      — 单次决策详情
    ├── CausalGraph      — FSM 状态 + 工具调用的因果链路可视化
    ├── ReplayPanel      — 反事实回放（克隆 trace → 修改参数 → 重执行）
    └── ComplianceReport — 合规报告导出（EU AI Act / 中国生成式AI管理）
```

## 3. 数据模型（Prisma）

### 3.1 DecisionTrace

```prisma
model DecisionTrace {
  id          String   @id @default(cuid())
  auditId     String   @unique
  userQuery   String
  intent      String
  confidence  Float
  mode        String   // "fsm-v2"
  tier        Int?
  durationMs  Int
  toolsUsed   String[] // ["query_inventory", "query_risk"]
  claimsCount Int      @default(0)
  passport    Json     // DecisionPassport snapshot
  userId      String?
  createdAt   DateTime @default(now())
  
  steps   TraceStep[]
  summary String?   // LLM 生成的决策摘要（异步）
  
  @@index([createdAt])
  @@index([intent])
  @@index([userId])
}
```

### 3.2 TraceStep

```prisma
model TraceStep {
  id          String   @id @default(cuid())
  traceId     String
  trace       DecisionTrace @relation(fields: [traceId], references: [id])
  stepIndex   Int      // 0-based order
  state       String   // classify | plan | execute | observe | decide | synthesize
  confidence  Float?
  findings    String?  // State-specific notes
  nextState   String?
  durationMs  Int      @default(0)
  
  toolCalls TraceToolCall[]
  claims    TracedClaim[]
  
  @@index([traceId])
  @@index([traceId, stepIndex])
}
```

### 3.3 TraceToolCall

```prisma
model TraceToolCall {
  id        String   @id @default(cuid())
  stepId    String
  step      TraceStep @relation(fields: [stepId], references: [id])
  toolName  String
  params    Json     // { action: "overview" }
  result    Json?    // Tool output (truncated to 16KB)
  success   Boolean
  latencyMs Int
  error     String?
  
  @@index([stepId])
}
```

### 3.4 TracedClaim

```prisma
model TracedClaim {
  id          String   @id @default(cuid())
  stepId      String
  step        TraceStep @relation(fields: [stepId], references: [id])
  claimIndex  Int      // N in [claim-N]
  text        String   // Claim text (≤500 chars)
  source      String   // MCP | KB | Search | LLM
  confidence  String   // high | medium | low
  
  @@index([stepId])
  @@index([source])
  @@index([confidence])
}
```

## 4. API 设计

### 4.1 GET /api/audit/traces

查询历史决策列表。

```
Query: ?intent=supply_chain_data&from=2026-05-20&to=2026-05-22&page=1&limit=20
Response: {
  traces: [{ id, auditId, userQuery, intent, confidence, durationMs, toolsUsed, createdAt }],
  total: 150,
  page: 1
}
```

### 4.2 GET /api/audit/traces/:id

获取单次决策完整详情（包含所有 steps、toolCalls、claims）。

### 4.3 POST /api/audit/traces/:id/replay

反事实回放。克隆一个 trace，修改指定 step 的 tool params，重新执行工具调用和 synthesization。

```
Body: {
  modifications: [{
    stepIndex: 1,
    toolName: "query_inventory",
    newParams: { action: "forecast", days: 60 }
  }]
}
Response: { newTraceId, diff: { claimsChanged: 3, confidenceDelta: +0.15 } }
```

### 4.4 GET /api/audit/report

生成合规报告。

```
Query: ?from=2026-05-01&to=2026-05-22&format=json|pdf
Response: {
  period: { from, to },
  stats: { totalTraces, avgConfidence, claimSourceDistribution, intentDistribution },
  topRisks: [{ traceId, userQuery, lowConfidenceClaims }],
  complianceChecklist: [EU AI Act items, 中国生成式AI管理 items]
}
```

## 5. 前端组件

### 5.1 AuditTab（新文件）

新建 `src/components/audit/AuditTab.tsx`。替代现有的空白 Tab，提供：
- 左侧：TraceList（可筛选的决策历史）
- 右侧：TraceDetail（选中 trace 的详情）

### 5.2 CausalGraph

```tsx
// src/components/audit/CausalGraph.tsx
```

基于 Recharts/自定义 SVG 的因果链路图：
- 节点 = FSM 状态（classify → plan → execute → observe → decide → synthesize）
- 边 = 状态转移
- 工具调用 = 子节点，展示 toolName + params summary
- 声明 = synthesize 节点下的子节点，按置信度着色（绿/黄/红）
- 点击节点 → 展开详情面板（params, result, claims）

### 5.3 ReplayPanel

```tsx
// src/components/audit/ReplayPanel.tsx
```

- 左侧：原始 trace 的因果图
- 右侧：修改面板（选择 step/tool → 修改 params → 点击 Replay）
- 下方：Diff 面板（原始 vs 回放结果对比）

### 5.4 ComplianceReport

```tsx
// src/components/audit/ComplianceReport.tsx
```

统计卡片 + 风险清单 + EU AI Act 检查清单 + 导出按钮。

## 6. TraceWriter（后端）

```typescript
// src/lib/audit/trace-writer.ts

export async function writeTrace(
  ctx: FSMContext,
  finalResponse: string,
  passport: DecisionPassport,
): Promise<DecisionTrace>
```

在 FSM `handleSynthesize` 的 `done` 事件之前调用。将 FSMContext 中的所有状态（routing, rounds, toolCalls, toolResults, observations, claims）反序列化为 Prisma 模型并写入。

## 7. 文件变更清单

### 新增

| 路径 | 职责 |
|------|------|
| `prisma/schema.prisma` | 新增 4 个 model |
| `src/lib/audit/trace-writer.ts` | FSM trace → Prisma 写入 |
| `src/lib/audit/trace-reader.ts` | Prisma trace → API 响应 |
| `src/lib/audit/replay-engine.ts` | 反事实回放引擎 |
| `src/app/api/audit/traces/route.ts` | GET list |
| `src/app/api/audit/traces/[id]/route.ts` | GET detail + POST replay |
| `src/app/api/audit/report/route.ts` | GET compliance report |
| `src/components/audit/AuditTab.tsx` | 审计面板主入口 |
| `src/components/audit/TraceList.tsx` | 决策历史列表 |
| `src/components/audit/TraceDetail.tsx` | 决策详情面板 |
| `src/components/audit/CausalGraph.tsx` | 因果链路图可视化 |
| `src/components/audit/ReplayPanel.tsx` | 反事实回放 |
| `src/components/audit/ComplianceReport.tsx` | 合规报告 |

### 修改

| 路径 | 变更 |
|------|------|
| `src/lib/agent/fsm.ts` | handleSynthesize 调用 writeTrace |
| `src/components/dashboard/DashboardTab.tsx` | 注册 AuditTab |

## 8. 不做的

- 不引入外部 OLAP/时序数据库 — Prisma + PostgreSQL 够用
- 不做实时协作审计 — 单用户系统
- 不做 PDF 二进制生成 — JSON 导出即可，PDF 由浏览器打印
- 不做 RBAC 权限控制 — 单用户，不需要
- 不修改 ChatPanel — 只在 done 事件加 traceId link
- 不做 SAML/OIDC 集成 — 企业级合规留到以后
