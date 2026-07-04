# 工具调用可靠性基准测试报告

**生成时间**: 2026-06-18T16:07:37.165Z
**Provider**: deepseek
**模式**: 真实 API
**测试用例数**: 121

## 核心指标

| 指标 | 值 |
|------|----|
| 成功率 | **95%** |
| 通过/失败 | 115/6 |
| 平均延迟 | 3009ms |
| P50 延迟 | 2923ms |
| P95 延迟 | 4092ms |
| 最小/最大延迟 | 1969ms / 4483ms |
| 总耗时 | 122200ms |

## 失败模式分析报告

**总失败数**: 6

### 按失败类别分布

| 类别 | 数量 | 占比 |
|------|------|------|
| 工具选择错误 (WRONG_TOOL) | 5 | 83.3% |
| 参数值不匹配 (PARAM_MISMATCH) | 1 | 16.7% |

### 按工具家族分布

| 家族 | 失败数 |
|------|--------|
| intelligence | 4 |
| operations | 2 |

### 按难度分布

| 难度 | 失败数 |
|------|--------|
| medium | 3 |
| hard | 2 |
| easy | 1 |

**主要失败模式**: 工具选择错误 (WRONG_TOOL)

## 改进建议

- WRONG_TOOL (5次): 改进工具描述，增加区分性关键词。考虑在 system prompt 中添加工具选择示例（few-shot）。
- PARAM_MISMATCH (1次): 工具正确但参数值与期望不符。检查 LLM 是否正确理解了用户输入中的数值/名称，可能需要在 prompt 中强化信息提取。

## 详细结果

| 用例 ID | 工具 | 结果 | 延迟 | 失败类别 |
|---------|------|------|------|----------|
| crud-inv-001 | - | ✅ 通过 | 3822ms |  |
| crud-inv-002 | - | ✅ 通过 | 4349ms |  |
| crud-inv-003 | - | ✅ 通过 | 4160ms |  |
| crud-inv-004 | - | ✅ 通过 | 2734ms |  |
| crud-inv-005 | - | ✅ 通过 | 2626ms |  |
| crud-cost-001 | - | ✅ 通过 | 2830ms |  |
| crud-cost-002 | - | ✅ 通过 | 2499ms |  |
| crud-cost-003 | - | ✅ 通过 | 2759ms |  |
| crud-cost-004 | - | ✅ 通过 | 2658ms |  |
| crud-sales-001 | - | ✅ 通过 | 2807ms |  |
| crud-sales-002 | - | ✅ 通过 | 2865ms |  |
| crud-sales-003 | - | ✅ 通过 | 2689ms |  |
| crud-log-001 | - | ✅ 通过 | 3149ms |  |
| crud-log-002 | - | ✅ 通过 | 3374ms |  |
| crud-log-003 | - | ✅ 通过 | 2550ms |  |
| crud-sup-001 | - | ✅ 通过 | 3344ms |  |
| crud-sup-002 | - | ✅ 通过 | 2792ms |  |
| crud-dash-001 | - | ✅ 通过 | 3892ms |  |
| crud-dash-002 | - | ✅ 通过 | 3415ms |  |
| crud-dash-003 | - | ✅ 通过 | 2581ms |  |
| crud-trend-001 | - | ✅ 通过 | 2541ms |  |
| crud-proc-001 | - | ✅ 通过 | 2512ms |  |
| crud-proc-002 | - | ✅ 通过 | 2618ms |  |
| crud-risk-001 | - | ✅ 通过 | 2376ms |  |
| crud-risk-002 | - | ✅ 通过 | 2828ms |  |
| crud-loc-001 | - | ✅ 通过 | 2656ms |  |
| crud-wh-001 | - | ✅ 通过 | 2501ms |  |
| op-reorder-001 | - | ✅ 通过 | 3105ms |  |
| op-reorder-002 | - | ✅ 通过 | 3431ms |  |
| op-batch-001 | - | ✅ 通过 | 2896ms |  |
| op-ship-001 | - | ✅ 通过 | 2861ms |  |
| op-ship-002 | - | ✅ 通过 | 3352ms |  |
| op-adjust-001 | - | ✅ 通过 | 3038ms |  |
| op-adjust-002 | - | ✅ 通过 | 3171ms |  |
| op-transfer-001 | query_inventory | ❌ 失败 | 2839ms | WRONG_TOOL |
| op-cost-001 | - | ✅ 通过 | 2793ms |  |
| op-cost-002 | - | ✅ 通过 | 3220ms |  |
| op-note-001 | - | ✅ 通过 | 3131ms |  |
| op-note-002 | create_note | ❌ 失败 | 2927ms | PARAM_MISMATCH |
| op-alert-001 | - | ✅ 通过 | 4418ms |  |
| op-alert-002 | - | ✅ 通过 | 2906ms |  |
| op-sup-status-001 | - | ✅ 通过 | 2981ms |  |
| op-sup-status-002 | - | ✅ 通过 | 2712ms |  |
| op-sup-create-001 | - | ✅ 通过 | 3118ms |  |
| op-sup-update-001 | - | ✅ 通过 | 2846ms |  |
| op-sup-update-002 | - | ✅ 通过 | 2670ms |  |
| intel-analytics-001 | - | ✅ 通过 | 3423ms |  |
| intel-analytics-002 | - | ✅ 通过 | 2698ms |  |
| intel-analytics-003 | - | ✅ 通过 | 2685ms |  |
| intel-analytics-004 | query_sales | ❌ 失败 | 3632ms | WRONG_TOOL |
| intel-fx-001 | - | ✅ 通过 | 2604ms |  |
| intel-fx-002 | - | ✅ 通过 | 3428ms |  |
| intel-weather-001 | - | ✅ 通过 | 2490ms |  |
| intel-weather-002 | - | ✅ 通过 | 2398ms |  |
| intel-comm-001 | - | ✅ 通过 | 2961ms |  |
| intel-scfis-001 | - | ✅ 通过 | 4401ms |  |
| intel-carbon-001 | - | ✅ 通过 | 3058ms |  |
| intel-fin-001 | - | ✅ 通过 | 2923ms |  |
| intel-amz-001 | - | ✅ 通过 | 3400ms |  |
| intel-amz-002 | - | ✅ 通过 | 3725ms |  |
| intel-sentiment-001 | - | ✅ 通过 | 3104ms |  |
| intel-sentiment-002 | - | ✅ 通过 | 2829ms |  |
| intel-cascade-001 | query_port_congestion | ❌ 失败 | 3014ms | WRONG_TOOL |
| intel-cascade-002 | - | ✅ 通过 | 3078ms |  |
| intel-cascade-003 | query_weather | ❌ 失败 | 3082ms | WRONG_TOOL |
| intel-cpsc-001 | - | ✅ 通过 | 2409ms |  |
| intel-port-001 | - | ✅ 通过 | 2427ms |  |
| intel-coherence-001 | - | ✅ 通过 | 2571ms |  |
| intel-recall-001 | - | ✅ 通过 | 2425ms |  |
| intel-decision-001 | query_inventory | ❌ 失败 | 4092ms | WRONG_TOOL |
| intel-decision-002 | - | ✅ 通过 | 2885ms |  |
| intel-wf-001 | - | ✅ 通过 | 3266ms |  |
| intel-wf-002 | - | ✅ 通过 | 3312ms |  |
| intel-tariff-001 | - | ✅ 通过 | 2631ms |  |
| intel-tariff-002 | - | ✅ 通过 | 3091ms |  |
| intel-tariff-003 | - | ✅ 通过 | 3922ms |  |
| intel-sandbox-001 | - | ✅ 通过 | 3051ms |  |
| intel-compliance-001 | - | ✅ 通过 | 3589ms |  |
| intel-compliance-002 | - | ✅ 通过 | 3786ms |  |
| intel-finsim-001 | - | ✅ 通过 | 3827ms |  |
| intel-feed-001 | - | ✅ 通过 | 2452ms |  |
| intel-arb-001 | - | ✅ 通过 | 3707ms |  |
| intel-disc-001 | - | ✅ 通过 | 3652ms |  |
| intel-web-001 | - | ✅ 通过 | 2293ms |  |
| intel-chart-001 | - | ✅ 通过 | 2754ms |  |
| intel-analyze-chart-001 | - | ✅ 通过 | 2996ms |  |
| intel-report-001 | - | ✅ 通过 | 2009ms |  |
| sc-eoq-001 | - | ✅ 通过 | 2626ms |  |
| sc-ss-001 | - | ✅ 通过 | 3053ms |  |
| sc-rop-001 | - | ✅ 通过 | 3895ms |  |
| sc-abc-001 | - | ✅ 通过 | 2444ms |  |
| sc-forecast-001 | - | ✅ 通过 | 3039ms |  |
| sc-seasonal-001 | - | ✅ 通过 | 2559ms |  |
| sc-mc-001 | - | ✅ 通过 | 3526ms |  |
| sc-ww-001 | - | ✅ 通过 | 2928ms |  |
| sc-nv-001 | - | ✅ 通过 | 3248ms |  |
| sc-drp-001 | - | ✅ 通过 | 2865ms |  |
| sc-wh-001 | - | ✅ 通过 | 2494ms |  |
| sc-route-001 | - | ✅ 通过 | 3496ms |  |
| sc-multi-001 | - | ✅ 通过 | 3406ms |  |
| sc-kpi-001 | - | ✅ 通过 | 3302ms |  |
| sc-fill-001 | - | ✅ 通过 | 2990ms |  |
| sc-lt-001 | - | ✅ 通过 | 2623ms |  |
| sc-pv-001 | - | ✅ 通过 | 2297ms |  |
| sc-tc-001 | - | ✅ 通过 | 3132ms |  |
| sc-score-001 | - | ✅ 通过 | 2604ms |  |
| sc-lc-001 | - | ✅ 通过 | 2691ms |  |
| sc-be-001 | - | ✅ 通过 | 2459ms |  |
| sc-price-001 | - | ✅ 通过 | 3792ms |  |
| sc-jrp-001 | - | ✅ 通过 | 3750ms |  |
| sc-fa-001 | - | ✅ 通过 | 4259ms |  |
| sg-graph-001 | - | ✅ 通过 | 2204ms |  |
| sg-graph-002 | - | ✅ 通过 | 3234ms |  |
| sg-dep-001 | - | ✅ 通过 | 2131ms |  |
| sg-impact-001 | - | ✅ 通过 | 2489ms |  |
| sg-choke-001 | - | ✅ 通过 | 2989ms |  |
| sg-geo-001 | - | ✅ 通过 | 2287ms |  |
| sg-tiers-001 | - | ✅ 通过 | 4483ms |  |
| sg-health-001 | - | ✅ 通过 | 2174ms |  |
| sg-evo-001 | - | ✅ 通过 | 2197ms |  |
| sg-tree-001 | - | ✅ 通过 | 1969ms |  |