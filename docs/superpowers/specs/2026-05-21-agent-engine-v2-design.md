# Agent Engine v2 — Design Spec

> 2026-05-21 | 替换 ReAct 自由循环为结构化 FSM + 语义路由 + Provider 适配器

## 1. 问题陈述

当前 Agent 引擎三大痛点：

| 问题 | 根因 | 影响 |
|------|------|------|
| 工具调用率 74.3% | ReAct 自由循环，LLM 可任意偏离 | 65 个 MCP 工具大部分调不起来 |
| 路由硬编码 | `information-router.ts` 关键词计数 | 新业务场景需手动加关键词 |
| Provider 耦合 | DeepSeek hack（XML 协议、文本解析）散落在 Agent 核心 | 换模型 = 重写 Agent |

## 2. 架构总览

```
                    POST /api/chat
                         │
              ┌──────────┴──────────┐
              │   Semantic Router   │  ← embedding-based intent
              │  (provider agnostic) │
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │    FSM Engine       │  ← 6-state explicit state machine
              │  (provider agnostic) │     model-agnostic control flow
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │  Provider Adapter   │  ← per-model I/O normalization
              │ ├─ DeepSeek V4 Pro  │     strict mode + text fallback
              │ ├─ OpenAI           │     native function calling
              │ └─ Anthropic        │     native tool use
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │   MCP Tool Layer    │  ← 65 tools, unchanged interface
              └─────────────────────┘
```

**核心原则**：FSM 引擎不知道是谁在回答，Provider Adapter 不知道在什么场景下被调用。

## 3. FSM 状态机

### 3.1 状态定义

```
                    ┌─────────┐
                    │ CLASSIFY│  ← semantic router: intent + confidence
                    └────┬────┘
                         │
                    ┌────┴────┐
                    │  PLAN   │  ← build tool execution plan
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         no tools    has tools  max rounds
              │          │          │
              ▼          ▼          ▼
         SYNTHESIZE  ┌────────┐  SYNTHESIZE
                     │EXECUTE │
                     └────┬───┘
                          │
                     ┌────┴───┐
                     │OBSERVE │  ← validate results, compute confidence
                     └────┬───┘
                          │
                     ┌────┴───┐
                     │ DECIDE │
                     └────┬───┘
                          │
              ┌───────────┼───────────┐
              │           │           │
        need more    confidence    max rounds
        tools         sufficient       │
              │           │           │
              ▼           ▼           ▼
            PLAN     SYNTHESIZE   SYNTHESIZE
```

### 3.2 状态详解

#### CLASSIFY
- 输入：用户 query + 历史对话（最近 6 轮）
- 动作：embedding-based 语义路由 → intent + confidence score
- 输出：`{ intent, confidence, shouldUseTools, shouldSearch, maxRounds }`
- Guard：无（总是进入 PLAN）

#### PLAN
- 输入：路由决策 + 对话上下文
- 动作：LLM 生成工具调用计划（批量、并行化）
- 输出：`ToolCall[]` 或 `null`（无需工具）
- Guard：如果 confidence > 0.95 且 intent 是 chat/opinion → 跳过工具直接 SYNTHESIZE
- Budget：最多生成 6 个并行工具调用

#### EXECUTE
- 输入：`ToolCall[]`
- 动作：
  1. 策略引擎校验（autonomy-policy，关键操作需确认）
  2. 并行执行所有独立调用
  3. 收集结果
- 输出：`ToolResult[]`
- Guard：单次执行超时 30s，失败工具标记 error 不阻塞其他
- Max：每轮最多 6 个工具，总计不超过 3 轮（18 次调用）

#### OBSERVE
- 输入：`ToolResult[]`
- 动作：
  1. 校验每个结果的数据质量（非空、类型正确、来源标签）
  2. MARC 置信度评估
  3. 检测冲突（多源数据不一致）
- 输出：`{ validResults, conflicts, overallConfidence, missingData }`
- Guard：严重数据冲突 → 标记低置信度，但继续到 DECIDE

#### DECIDE
- 输入：`OBSERVE` 输出 + 当前轮次
- 动作：LLM 判断是否需要更多工具调用
- 输出：`{ action: 'continue' | 'finalize', reason, nextTools?: ToolCall[] }`
- Guard：
  - 达到 maxRounds → 强制 finalize
  - overallConfidence > 阈值 → 建议 finalize（可 override）
  - 连续 2 轮无新数据 → 强制 finalize

#### SYNTHESIZE
- 输入：完整上下文字典（query + routing + tool results + observations）
- 动作：LLM 生成最终响应（MARC 格式、来源标注、置信度标签）
- 输出：`{ content, claims, sources, confidence }`
- Guard：响应长度 > 8000 tokens → 分块流式输出

### 3.3 转移表

```
当前状态      条件                        下一状态
──────────────────────────────────────────────────
CLASSIFY      always                       PLAN
PLAN          has_tools && round < max     EXECUTE
PLAN          no_tools || round >= max     SYNTHESIZE
EXECUTE       always                       OBSERVE
OBSERVE       always                       DECIDE
DECIDE        continue && round < max      PLAN
DECIDE        finalize || round >= max     SYNTHESIZE
```

### 3.4 配置

```typescript
interface FSMConfig {
  maxRounds: number;           // default: 3
  maxToolsPerRound: number;    // default: 6
  totalToolCallLimit: number;  // default: 18
  toolTimeoutMs: number;       // default: 30000
  confidenceThreshold: number; // default: 0.7
  maxContextTokens: number;    // default: 64000
}
```

## 4. Semantic Router

替换 `information-router.ts` 的关键词匹配。

### 4.1 方案

**不引入额外 embedding**。利用 LLM 自身做 intent classification，在 CLASSIFY 阶段用一次轻量调用：

```
system: "Classify this query into exactly one intent: ..."
user: query
→ 返回结构化 JSON: { intent, confidence, reason }
```

成本：每次查询多 1 次 LLM 调用（约 50 input tokens + 50 output tokens），DeepSeek V4 Pro 几乎可以忽略。

### 4.2 Intent 定义（保留现有 6 类）

```
supply_chain_data        → Tier 1: MCP tools
supply_chain_knowledge   → Tier 1+2: MCP + KB
news_event               → Tier 3: web search
general_knowledge        → Tier 2: Wikipedia + RAG
opinion_recommendation   → Tier 0: LLM direct
chat_greeting            → Tier 0: LLM direct
```

### 4.3 与旧路由器的兼容

旧 `information-router.ts` 的 `RoutingDecision` 接口保留，作为新路由器的输出格式——上游 `chat/route.ts` 不需要知道路由是怎么做的。

## 5. Provider Adapter 层

### 5.1 接口定义

```typescript
interface ProviderAdapter {
  readonly provider: string;
  readonly defaultModel: string;

  /** Convert internal ChatMessage to provider-specific format */
  normalizeMessages(msgs: ChatMessage[]): unknown[];

  /** Convert MCP tools to provider-specific tool definitions */
  normalizeTools(tools: MCPToolSchema[]): unknown[];

  /** Stream completion (text only, no tools) */
  streamText(messages: ChatMessage[], opts: StreamOpts): AsyncGenerator<TokenChunk>;

  /** Stream completion with tool calling */
  streamWithTools(messages: ChatMessage[], tools: MCPToolSchema[], opts: StreamOpts): AsyncGenerator<ToolCallChunk>;

  /** Non-streaming completion for classification/routing (lightweight) */
  classify(messages: ChatMessage[], labels: string[]): Promise<Classification>;

  /** Parse raw response for tool calls (handles text-leakage fallback) */
  parseToolCalls(raw: string): ToolCall[];
}
```

### 5.2 DeepSeek V4 Pro Adapter

特性：
- `base_url: https://api.deepseek.com/beta`（strict mode）
- 工具定义自动注入 `"strict": true` + `"additionalProperties": false`
- `reasoning_content` 自动保存/回传
- **双重解析器**：优先取 `tool_calls` 字段；fallback 正则解析 `content` 文本中的工具调用（兜底 11% 泄漏）
- JSON Lines 流式 → SSE 转换（`@ai-sdk/deepseek` 已处理）

### 5.3 OpenAI Adapter

- 原生 function calling，无 hack
- `tool_choice: "auto"`
- 标准 SSE 流式

### 5.4 Anthropic Adapter

- 原生 tool use
- extended thinking（1024+ tokens）
- Anthropic → OpenAI 消息格式映射

### 5.5 Adapter 工厂

```typescript
function getAdapter(provider: string, model?: string): ProviderAdapter {
  switch (provider) {
    case 'deepseek': return new DeepSeekAdapter(model);
    case 'openai':   return new OpenAIAdapter(model);
    case 'anthropic': return new AnthropicAdapter(model);
    default:         return new DeepSeekAdapter(model); // fallback
  }
}
```

## 6. 文件变更清单

### 新增文件

| 路径 | 职责 |
|------|------|
| `src/lib/agent/fsm.ts` | FSM 引擎核心（状态定义 + 转移表 + runAgent） |
| `src/lib/agent/fsm-types.ts` | FSM 类型定义（State, Transition, Context, Config） |
| `src/lib/agent/router.ts` | LLM-based 语义路由 |
| `src/lib/agent/adapter.ts` | ProviderAdapter 接口 + 工厂 |
| `src/lib/agent/adapters/deepseek.adapter.ts` | DeepSeek V4 Pro 适配器 |
| `src/lib/agent/adapters/openai.adapter.ts` | OpenAI 适配器 |
| `src/lib/agent/adapters/anthropic.adapter.ts` | Anthropic 适配器 |
| `src/app/api/chat/route.ts` | **重写** — 只做 HTTP 层转发到 FSM |
| `src/lib/services/ai-providers.service.ts` | 新增 V4 Pro strict mode 支持 |

### 删除文件

| 路径 | 原因 |
|------|------|
| `src/lib/engine/react-agent.ts` | 被 FSM 替代 |
| `src/lib/services/information-router.ts` | 被语义路由替代 |

### 保留不变的文件

| 路径 | 原因 |
|------|------|
| `src/lib/mcp/tools.ts` 及所有工具 | MCP 接口不碰 |
| `src/lib/mcp/tools-*.ts` | 同上 |
| `src/lib/engine/rag.ts` | RAG 逻辑复用 |
| `src/lib/services/web-search.service.ts` | 搜索逻辑复用 |
| `src/lib/engine/context-builder.ts` | 上下文构建复用 |
| `src/lib/engine/episode-store.ts` | 记忆存储复用 |
| `src/lib/engine/passport.ts` | 决策护照复用 |
| `src/app/api/chat/chat.prompt.ts` | System prompt 保留（注入到 FSM Context） |
| `src/lib/services/marc-validator.ts` | MARC 校验复用 |
| `src/lib/chart/` | 图表模块不动（等 FSM 提升调用率后自然激活） |
| `src/components/shared/ChatPanel.tsx` | 前端不变 |

## 7. SSE 事件协议

保持现有事件格式兼容，ChatPanel 不需要改：

```
event: thinking      → { status: "classifying" | "planning" | "executing" | "observing" | "synthesizing" }
event: tool_call     → { tool: string, params: object }
event: tool_result   → { tool: string, result?: string, error?: string }
event: token         → { content: string }
event: confirm_required → { confirmationCard: object }
event: done          → { toolsUsed, steps, durationMs, mode: 'fsm-v2', tier, passport, claimsExtracted }
event: error         → { message: string }
```

## 8. 测试策略

### 单元测试（Vitest）

| 测试对象 | 覆盖内容 |
|----------|----------|
| FSM 转移表 | 所有合法转移 + 边界（maxRounds、timeout、confidence） |
| Adapter.parseToolCalls | 正常 tool_calls + 11% 文本泄漏场景 |
| Adapter.normalizeMessages | reasoning_content 回传、消息格式转换 |
| Router.classify | 6 种 intent 识别 + 低置信度 fallback |
| MARC validator | 保留现有测试（已覆盖） |

### 集成测试

- DeepSeek V4 Pro strict mode → 工具调用成功率
- Provider 切换（deepseek ↔ openai ↔ anthropic）同一 query 行为一致
- SSE 事件顺序正确（thinking → tool_call → tool_result → token → done）

### E2E（Playwright，已有）

- Chat 面板：发送消息 → 收到流式响应 → 思考过程面板展开

## 9. 迁移路径

**Git 分支**：`feat/agent-engine-v2`

**Phase 1**：新文件落地，旧代码共存
- 新增 `src/lib/agent/` 目录
- `chat/route.ts` 加环境变量开关 `AGENT_ENGINE=v2`
- `v2` 走新 FSM，默认走旧 ReAct

**Phase 2**：验证后切换
- 默认 `AGENT_ENGINE=v2`
- 观察 1 周无回退

**Phase 3**：清除
- 删除 `react-agent.ts`、`information-router.ts`
- 删除 `chat/route.ts` 中的 Hybrid/Local/Streaming 旧逻辑

## 10. 不做的

- 不引入 Python / LangGraph — 保持 TypeScript 单一技术栈
- 不引入额外 embedding 服务 — 用 LLM 做分类
- 不改 MCP 工具接口 — 维持工具层稳定
- 不改前端 — ChatPanel SSE 协议保持兼容
- 不动图表模块 — 等 FSM 提升调用率后自然激活
