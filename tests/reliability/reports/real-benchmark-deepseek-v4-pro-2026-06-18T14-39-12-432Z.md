# 工具调用可靠性基准测试报告

**生成时间**: 2026-06-18T14:39:12.431Z
**Provider**: deepseek
**模式**: 真实 API
**测试用例数**: 5

## 核心指标

| 指标 | 值 |
|------|----|
| 成功率 | **0%** |
| 通过/失败 | 0/5 |
| 平均延迟 | 2020ms |
| P50 延迟 | 1835ms |
| P95 延迟 | 4071ms |
| 最小/最大延迟 | 838ms / 4071ms |
| 总耗时 | 5542ms |

## 失败模式分析报告

**总失败数**: 5

### 按失败类别分布

| 类别 | 数量 | 占比 |
|------|------|------|
| JSON解析错误 (JSON_PARSE_ERROR) | 5 | 100% |

### 按工具家族分布

| 家族 | 失败数 |
|------|--------|
| crud | 5 |

### 按难度分布

| 难度 | 失败数 |
|------|--------|
| easy | 3 |
| medium | 2 |

**主要失败模式**: JSON解析错误 (JSON_PARSE_ERROR)

## 改进建议

- JSON_PARSE_ERROR (5次): LLM 输出无法解析。增强 text-fallback 解析逻辑，或使用 response_format: json_object。

## 详细结果

| 用例 ID | 工具 | 结果 | 延迟 | 失败类别 |
|---------|------|------|------|----------|
| crud-inv-001 | query_inventory | ❌ 失败 | 1889ms | JSON_PARSE_ERROR |
| crud-inv-002 | query_inventory | ❌ 失败 | 4071ms | JSON_PARSE_ERROR |
| crud-inv-003 | query_inventory | ❌ 失败 | 1835ms | JSON_PARSE_ERROR |
| crud-inv-004 | query_inventory | ❌ 失败 | 838ms | JSON_PARSE_ERROR |
| crud-inv-005 | query_inventory | ❌ 失败 | 1465ms | JSON_PARSE_ERROR |