# 工具调用可靠性基准测试套件

本目录包含 DeepSeek（及其他 Provider）工具调用可靠性的基准测试套件，用于评估和提升 LLM 在供应链场景下的工具调用准确率。

## 目录结构

```
tests/reliability/
├── tool-cases.ts              # 测试用例集（100+ 真实供应链场景）
├── tool-schema-validator.ts   # 工具调用验证器（schema 校验）
├── failure-analyzer.ts        # 失败模式分析器（分类+报告）
├── provider-benchmark.ts      # Provider 基准测试运行器
├── run-benchmark.ts           # CLI 入口脚本
├── benchmark.test.ts          # Meta-tests（测试套件自身的测试）
├── README.md                  # 本文档
└── reports/                   # 生成的报告（运行时创建）
```

## 快速开始

### 运行 Meta-Tests（CI 友好）

```bash
# 运行基准测试套件自身的测试（mock 模式，不调用真实 API）
npx vitest run tests/reliability/benchmark.test.ts
```

### 运行基准测试（Mock 模式）

```bash
# 默认 mock 模式，测试 DeepSeek
npx tsx tests/reliability/run-benchmark.ts --provider deepseek --limit 50

# 按工具家族筛选
npx tsx tests/reliability/run-benchmark.ts --family crud

# 测试所有用例
npx tsx tests/reliability/run-benchmark.ts
```

### 运行基准测试（真实 API 模式）

```bash
# 通过环境变量启用真实 API
RUN_REAL_BENCHMARK=true npx tsx tests/reliability/run-benchmark.ts --provider deepseek

# 或通过 --real 标志
npx tsx tests/reliability/run-benchmark.ts --provider openai --real
```

> **注意**: 真实 API 模式需要设置对应的 API key 环境变量（`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`）。

## CLI 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--provider <id>` | Provider: `deepseek` \| `openai` \| `anthropic` | `deepseek` |
| `--limit <n>` | 最大测试用例数（0=全部） | `0` |
| `--family <name>` | 按家族筛选: `crud` \| `operations` \| `intelligence` \| `supply-chain` \| `supplier-graph` | 全部 |
| `--output <dir>` | 报告输出目录 | `./tests/reliability/reports` |
| `--concurrency <n>` | 并发数 | `3` |
| `--real` | 启用真实 API 调用 | `false`（mock 模式） |
| `--timeout <ms>` | 请求超时（毫秒） | `30000` |

## 测试用例

### 用例结构

每个测试用例包含以下字段：

```typescript
{
  id: 'crud-inv-001',              // 唯一标识
  family: 'crud',                  // 工具家族
  userInput: '帮我查一下 KA-RC4001 的库存情况',  // 用户输入
  expectedTool: 'query_inventory', // 期望调用的工具
  expectedParams: {                // 期望的关键参数（部分匹配）
    action: 'detail',
    sku: 'KA-RC4001'
  },
  forbiddenParams: ['priority'],   // 不应出现的参数（可选）
  description: '查询单品库存详情',   // 用例描述
  difficulty: 'easy',              // 难度: easy | medium | hard
  multiToolOk: false               // 是否允许多工具（可选）
}
```

### 用例分布

| 家族 | 工具数 | 用例数 | 说明 |
|------|--------|--------|------|
| crud | 11 | ~24 | 库存、成本、销售、物流、供应商、仪表盘、风险查询 |
| operations | 11 | ~22 | 补货、货运、库存调整、成本更新、备注、预警、供应商管理 |
| intelligence | 27 | ~35 | 分析、汇率、天气、大宗商品、风险、决策、合规、套利 |
| supply-chain | 24 | ~24 | EOQ、安全库存、预测、优化、网络、指标、财务、生产、定价 |
| supplier-graph | 9 | ~12 | 图谱、依赖度、影响、卡脖子、地理风险、层级、健康 |
| **合计** | **82** | **~117** | |

### 难度分布

- **easy**: 直接映射（用户明确说了工具名或动作）
- **medium**: 需要上下文理解（用户描述场景，LLM 需推断工具）
- **hard**: 模糊或复杂场景（多参数、多工具可能、需信息提取）

## 添加新测试用例

1. 打开 `tool-cases.ts`
2. 找到对应的工具家族数组（如 `crudCases`、`operationsCases`）
3. 添加新的 `ToolTestCase` 对象：

```typescript
{
  id: 'crud-inv-006',  // 命名规则: 家族-工具-序号
  family: 'crud',
  userInput: '你的用户输入',
  expectedTool: 'query_inventory',
  expectedParams: { action: 'list' },
  description: '测试场景描述',
  difficulty: 'medium',
}
```

4. 运行 meta-tests 确认格式正确：
```bash
npx vitest run tests/reliability/benchmark.test.ts
```

## 失败模式分类

| 类别 | 说明 | 示例 |
|------|------|------|
| `TOOL_NOT_FOUND` | LLM 选择了不存在的工具 | 调用 `query_stock`（不存在） |
| `WRONG_TOOL` | LLM 选择了错误的工具 | 期望 `query_inventory`，实际调用 `query_cost` |
| `MISSING_REQUIRED_PARAM` | 缺少必填参数 | `create_reorder` 缺少 `quantity` |
| `INVALID_TYPE` | 参数类型错误 | `quantity: "100"`（应为 number） |
| `INVALID_ENUM` | 枚举值非法 | `action: "invalid"` |
| `HALLUCINATED_PARAM` | 编造了 schema 外的参数 | 添加了 `priority_level`（不存在） |
| `JSON_PARSE_ERROR` | 工具调用无法解析为 JSON | LLM 输出格式错误 |
| `NO_TOOL_CALL` | LLM 未调用任何工具 | 仅返回文本回复 |
| `PARAM_MISMATCH` | 工具正确但参数值不匹配 | `warehouse: "北京仓"` vs 期望 `"深圳仓"` |

## 报告格式

运行基准测试后，会在 `reports/` 目录生成两个文件：

### JSON 报告

```json
{
  "generatedAt": "2026-06-18T10:00:00.000Z",
  "config": { "provider": "deepseek", "realApi": false, ... },
  "stats": {
    "totalCases": 117,
    "passed": 100,
    "failed": 17,
    "successRate": 85.5,
    "avgLatencyMs": 120,
    "p50LatencyMs": 100,
    "p95LatencyMs": 300,
    "failureDistribution": { ... },
    "caseResults": [ ... ]
  },
  "suggestions": [ ... ],
  "failureReport": "## 失败模式分析报告\n..."
}
```

### Markdown 报告

包含核心指标表格、失败模式分布、改进建议和详细用例结果。

## 解读结果

### 成功率

- **90%+**: 达到目标，可以投入生产
- **80-90%**: 需要改进，关注主要失败模式
- **<80%**: 严重问题，需要系统性优化

### 主要失败模式

查看 `dominantCategory` 字段，结合改进建议进行针对性优化：

- `WRONG_TOOL` → 改进工具描述，增加 few-shot 示例
- `MISSING_REQUIRED_PARAM` → 在描述中强调必填参数
- `HALLUCINATED_PARAM` → 检查是否有旧版参数名残留
- `NO_TOOL_CALL` → 使用 `tool_choice: "required"`
- `JSON_PARSE_ERROR` → 增强 text-fallback 解析逻辑

### 延迟指标

- `avgLatencyMs`: 平均延迟（mock 模式下应 <10ms）
- `p50LatencyMs`: 中位数延迟
- `p95LatencyMs`: 95 分位延迟（关注尾部延迟）

## 架构设计

```
┌─────────────────────────────────────────────────────┐
│                  run-benchmark.ts                    │
│                   (CLI 入口)                         │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│               provider-benchmark.ts                  │
│            (基准测试运行器)                          │
│  ┌─────────────┐  ┌──────────────────────────────┐  │
│  │ MockProvider│  │  Real Provider Adapter       │  │
│  │ (默认)      │  │  (RUN_REAL_BENCHMARK=true)   │  │
│  └─────────────┘  └──────────────────────────────┘  │
└──────────┬──────────────────┬───────────────────────┘
           │                  │
           ▼                  ▼
┌─────────────────────┐  ┌──────────────────────────┐
│ tool-schema-validator│  │  failure-analyzer        │
│   (schema 校验)      │  │  (失败分类+报告)         │
└──────────┬──────────┘  └──────────────────────────┘
           │
           ▼
┌─────────────────────┐
│   tool-cases.ts     │
│  (117 测试用例)     │
└─────────────────────┘
```

### Mock 模式 vs 真实 API 模式

- **Mock 模式（默认）**: 使用 `MockProviderAdapter` 模拟 LLM 响应，确定性失败率 ~15%，不调用真实 API。适合 CI 和开发测试。
- **真实 API 模式**: 通过 `RUN_REAL_BENCHMARK=true` 或 `--real` 启用，调用真实 Provider API。适合评估实际可靠性。

### 并发控制

使用信号量模式控制并发数，避免触发 API rate limit。默认并发 3，可通过 `--concurrency` 调整。

### 重试机制

- 网络错误（timeout、429、503 等）自动重试，指数退避
- 工具调用错误（wrong tool、invalid params）不重试
- 默认最大重试 2 次
