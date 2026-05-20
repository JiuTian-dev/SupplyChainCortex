# Chat 助手 & 搜索系统 — 全面审计报告

> 审计日期: 2026-05-19 | 范围: chat + search 全链路

---

## 一、系统架构总览

```
用户输入
  │
  ├─ 意图分类 (information-router) ── 6 种意图 × 4 层级
  │
  ├─ 上下文构建 (context-builder) ── 7 层动态上下文
  │     ├─ Agent 简报 (7表并行查询)
  │     ├─ 知识图谱
  │     ├─ 情景记忆
  │     └─ 策略建议
  │
  ├─ RAG 检索 (rag.ts) ── TF-IDF, 80+ 知识块, 9 领域
  │
  ├─ Web 搜索 (web-search.service) ── 5 提供商, 4 重写策略
  │     ├─ Guard → Rerank → Cross-validate → Recall loop
  │     └─ SearXNG / DDG / Wikipedia / Brave / Tavily
  │
  └─ ReAct Agent (react-agent.ts) ── 最大 8 轮推理
        ├─ XML 工具调用协议
        ├─ Autonomy Policy (写保护)
        └─ Passport (审计溯源)
```

---

## 二、关键发现

### 🔴 P0 — 必须立即修复

#### 2.1 Anthropic Provider 完全不可用

**文件**: `src/lib/services/ai-providers.service.ts`

代码中 `baseURL` 设为 `https://api.anthropic.com/v1`，但请求路径是 `${baseURL}/chat/completions`，拼接后为 `https://api.anthropic.com/v1/chat/completions`。Anthropic 的真实端点是 `https://api.anthropic.com/v1/messages`，且请求格式完全不同（`messages` 而非 `model`/`max_tokens`/`stream`）。

**结论：选择 Anthropic 作为 provider 时，100% 会失败。** 代码注释说"Anthropic is translated on-the-fly"但翻译逻辑根本未实现。

**建议**: 要么实现 Anthropic Messages API 格式翻译，要么在 UI 中禁用 Anthropic 选项并给出明确提示。

---

#### 2.2 Chat + Search 系统零单元测试

| 模块 | 纯函数 | 测试 |
|------|--------|------|
| `react-agent.ts` | parseToolCalls, stripToolCalls, formatToolResult | **0** |
| `chat.helpers.ts` | formatSSE, extractToolCallsFromText, matchToolsToQuery | **0** |
| `information-router.ts` | classifyIntent, hasKeyword | **0** |
| `web-search-rewriter.ts` | extractKeywords, rewriteQuery | **0** |
| `web-search-reranker.ts` | rerankResults, computeSimilarity | **0** |
| `web-search-cross-validator.ts` | extractClaim, computeSourceAgreement | **0** |
| `web-search-guard.ts` | scoreResultQuality, filterByLanguage | **0** |
| `ai-providers.service.ts` | getProvider, chatCompletion | **0** |
| `context-builder.ts` | buildDynamicSystemContext, gatherBriefing | **0** |
| `episode-store.ts` | consolidateEpisode | **0** |

这些都是可独立测试的纯函数，但没有测试。XML 解析、SSE 格式化、意图分类如果出错，没有任何自动化检测。

**建议**: 优先为 `parseToolCalls`、`extractToolCallsFromText`、`classifyIntent`、`rewriteQuery`、`rerankResults` 补充测试。

---

### 🟡 P1 — 高优先级

#### 2.3 系统提示词重复维护

两份独立的系统提示词：

| 位置 | 用途 | 行数 |
|------|------|------|
| `chat.prompt.ts` → `SYSTEM_PROMPT` | 传统流式 | ~87 行 |
| `react-agent.ts` → `buildReActSystemPrompt` | ReAct Agent | ~70 行 |

两份内容有差异（措辞、工具列表格式、输出指令）。任一修改需要同步两份。

#### 2.4 `formatToolResult` + `DEFAULT_TOOL_ACTIONS` 双份维护

| 位置 | 说明 |
|------|------|
| `chat.helpers.ts:22-113` | 传统流的工具结果格式化 |
| `react-agent.ts:248-311` | ReAct Agent 的工具结果格式化 |

同一套 switch/case，两个文件各自维护。改一个工具的输出格式需要改两处。

#### 2.5 ReAct 上下文窗口膨胀

每一轮 ReAct 推理都会把「完整的助手输出 + 完整的工具结果」追加到 `messages` 数组。8 轮后可能积累上万 token，没有中间摘要或截断机制。虽然单条工具结果被截断到 2000 字符，但轮次累积无上限。

#### 2.6 DDG HTML 抓取极度脆弱

`searchDuckDuckGoHTML` 用硬编码正则 `<a rel="nofollow" class="result__a"` 匹配 DDG 的 HTML 结构。DDG 改一次模板，整个搜索静默返回空数组，没有任何错误提示。

---

### 🟠 P2 — 中优先级

#### 2.7 中英文关键词映射重复维护

| 位置 | 说明 |
|------|------|
| `web-search-rewriter.ts` | query 重写的中英映射 |
| `web-search.service.ts:extractEnglishKeywords` | 搜索关键词的中英映射 |

部分映射不一致（如 `small home appliances` vs `small appliance`）。

#### 2.8 3 字符流式发送反模式

`react-agent.ts:434-437` — 每次只发 3 个字符 + 5ms 延迟。对于中文，3 字节可能切在多字节字符中间。600 char/s 的速度和数千次 React 状态更新会导致前端卡顿。

#### 2.9 Done 事件 JSON 解析隐患

`route.ts:113` — `JSON.parse(event.content).claimsExtracted` 假设 `event.content` 一定是合法 JSON。如果流式响应格式变化，直接崩溃。

#### 2.10 无搜索缓存

同一查询执行两次会重新发起所有 API 调用。搜索引擎 30-60s 的短期 LRU 缓存可以大幅减少 API 调用。

#### 2.11 API Key 明文存储在 localStorage

`ChatPanel.tsx` — `SETTINGS_KEY = 'ai-provider-settings'` 明文存储 API Key。任何 XSS 漏洞都可以读取。

#### 2.12 无 Provider 故障转移和重试

当前 provider 出错直接返回给用户。不会自动切换到其它已配置的 provider，也不会重试。

#### 2.13 搜索结果无 prompt injection 防护

外部搜索结果的 snippet 和 title 直接注入 LLM 上下文中。如果某个搜索结果包含 "ignore previous instructions" 类 payload，会影响 LLM 行为。

---

### 🟢 P3 — 低优先级

| 问题 | 说明 |
|------|------|
| 知识库硬编码在源码中 | 80+ 条知识块是 `const` 数组，更新需要部署代码 |
| TF-IDF 每查询重算 | 80 条知识块的 O(N*T) 每查询计算一次 |
| 本地模式有人工延迟 | `handleLocalModeStream` 每次 15ms sleep |
| 搜索过滤策略不可配置 | 所有用户同一套过滤规则 |
| 搜索失败静默吞错 | Reddit/GitHub/HN 失败无日志，无用户提示 |

---

## 三、评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构设计 | **92** | 多层级 Agent + 搜索管道设计优秀 |
| 流式处理 | **78** | 双协议支持好，但 3-char 反模式拖分 |
| 工具调用 | **75** | ReAct 循环安全，但 XML 解析脆弱 |
| 上下文管理 | **70** | 7 层动态上下文出色，但无窗口预算 |
| 搜索管道 | **82** | 多源并行 + 质量控制完整，缺缓存 |
| RAG 系统 | **72** | 知识覆盖面广，但硬编码 + 无向量化 |
| Provider 抽象 | **55** | Anthropic 完全不可用拖低分数 |
| 安全性 | **68** | 限流/SSRF 好，但 API Key 明文 + 搜索注入 |
| 可观测性 | **65** | Passport 优秀，但搜索静默失败 |
| 测试覆盖 | **20** | 全系统零测试 |
| **综合** | **67/100** | 扣分集中在测试缺失和 Provider 缺陷 |

---

## 四、修复优先级

| 优先级 | 项目 | 影响 | 工作量 |
|--------|------|------|--------|
| **P0** | Anthropic provider 修复或禁用 | 用户选 Claude 必然失败 | 中 |
| **P0** | 核心纯函数单元测试 (parseToolCalls 等 6 个) | 回归保护 | 中 |
| **P1** | 合并重复代码 (prompt/formatTool/keyword maps) | 维护性 | 中 |
| **P1** | ReAct 上下文窗口预算追踪 | 长对话 OOM | 中 |
| **P1** | DDG HTML 抓取替换为 API 或移除 | 搜索可靠性 | 低 |
| **P2** | 搜索结果缓存 (30s LRU) | 减少 API 调用 | 低 |
| **P2** | 修复 3-char 流式 → 大块发送 | 前端性能 | 低 |
| **P2** | Provider 故障转移 + 重试 | 可用性 | 中 |
| **P2** | 搜索结果 prompt injection 净化 | LLM 安全 | 低 |
| **P2** | API Key 存储加密或警告 | 安全 | 低 |
| **P3** | 知识库外部化 (JSON 文件) | 可维护性 | 低 |
| **P3** | 搜索过滤可配置 | 灵活性 | 低 |
| **P3** | 搜索失败日志 | 可观测性 | 低 |
