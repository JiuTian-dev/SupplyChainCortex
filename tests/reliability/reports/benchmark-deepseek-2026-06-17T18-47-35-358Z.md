# 工具调用可靠性基准测试报告

**生成时间**: 2026-06-17T18:47:35.357Z
**Provider**: deepseek
**模式**: Mock（模拟）
**测试用例数**: 10

## 核心指标

| 指标 | 值 |
|------|----|
| 成功率 | **20%** |
| 通过/失败 | 2/8 |
| 平均延迟 | 0ms |
| P50 延迟 | 0ms |
| P95 延迟 | 1ms |
| 最小/最大延迟 | 0ms / 1ms |
| 总耗时 | 8ms |

## 失败模式分析报告

**总失败数**: 8

### 按失败类别分布

| 类别 | 数量 | 占比 |
|------|------|------|
| 缺少必填参数 (MISSING_REQUIRED_PARAM) | 3 | 37.5% |
| 枚举值非法 (INVALID_ENUM) | 2 | 25% |
| 工具选择错误 (WRONG_TOOL) | 1 | 12.5% |
| 编造参数 (HALLUCINATED_PARAM) | 1 | 12.5% |
| 未调用工具 (NO_TOOL_CALL) | 1 | 12.5% |

### 按工具家族分布

| 家族 | 失败数 |
|------|--------|
| crud | 8 |

### 按难度分布

| 难度 | 失败数 |
|------|--------|
| medium | 4 |
| easy | 4 |

**主要失败模式**: 缺少必填参数 (MISSING_REQUIRED_PARAM)

## 改进建议

- NO_TOOL_CALL (1次): 在 system prompt 中强化"必须调用工具"的指令，使用 tool_choice: "required" 强制工具调用。
- WRONG_TOOL (1次): 改进工具描述，增加区分性关键词。考虑在 system prompt 中添加工具选择示例（few-shot）。
- MISSING_REQUIRED_PARAM (3次): 在工具描述中明确标注必填参数，使用 "必须提供X" 的措辞。考虑在 prompt 中重申参数要求。
- HALLUCINATED_PARAM (1次): LLM 编造了 schema 外的参数。检查是否有旧版工具参数被 LLM 记忆，或在描述中明确"仅接受以下参数"。
- INVALID_ENUM (2次): 枚举值不匹配。在工具描述中用自然语言列出所有合法值，而非仅依赖 schema enum。

## 详细结果

| 用例 ID | 工具 | 结果 | 延迟 | 失败类别 |
|---------|------|------|------|----------|
| crud-inv-001 | - | ✅ 通过 | 0ms |  |
| crud-inv-002 | - | ✅ 通过 | 0ms |  |
| crud-inv-003 | query_cost | ❌ 失败 | 0ms | WRONG_TOOL |
| crud-inv-004 | query_inventory | ❌ 失败 | 0ms | MISSING_REQUIRED_PARAM |
| crud-inv-005 | query_inventory | ❌ 失败 | 0ms | INVALID_ENUM |
| crud-cost-001 | query_cost | ❌ 失败 | 1ms | MISSING_REQUIRED_PARAM |
| crud-cost-002 | query_cost | ❌ 失败 | 0ms | INVALID_ENUM |
| crud-cost-003 | query_cost | ❌ 失败 | 0ms | HALLUCINATED_PARAM |
| crud-cost-004 | query_cost | ❌ 失败 | 0ms | NO_TOOL_CALL |
| crud-sales-001 | query_sales | ❌ 失败 | 0ms | MISSING_REQUIRED_PARAM |