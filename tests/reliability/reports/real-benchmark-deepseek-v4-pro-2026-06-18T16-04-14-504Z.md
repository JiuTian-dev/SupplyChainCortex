# 工具调用可靠性基准测试报告

**生成时间**: 2026-06-18T16:04:14.502Z
**Provider**: deepseek
**模式**: 真实 API
**测试用例数**: 121

## 核心指标

| 指标 | 值 |
|------|----|
| 成功率 | **94.2%** |
| 通过/失败 | 114/7 |
| 平均延迟 | 3089ms |
| P50 延迟 | 2919ms |
| P95 延迟 | 4211ms |
| 最小/最大延迟 | 2065ms / 8679ms |
| 总耗时 | 125408ms |

## 失败模式分析报告

**总失败数**: 7

### 按失败类别分布

| 类别 | 数量 | 占比 |
|------|------|------|
| 工具选择错误 (WRONG_TOOL) | 6 | 85.7% |
| 参数值不匹配 (PARAM_MISMATCH) | 1 | 14.3% |

### 按工具家族分布

| 家族 | 失败数 |
|------|--------|
| intelligence | 5 |
| operations | 2 |

### 按难度分布

| 难度 | 失败数 |
|------|--------|
| medium | 4 |
| hard | 2 |
| easy | 1 |

**主要失败模式**: 工具选择错误 (WRONG_TOOL)

## 改进建议

- WRONG_TOOL (6次): 改进工具描述，增加区分性关键词。考虑在 system prompt 中添加工具选择示例（few-shot）。
- PARAM_MISMATCH (1次): 工具正确但参数值与期望不符。检查 LLM 是否正确理解了用户输入中的数值/名称，可能需要在 prompt 中强化信息提取。

## 详细结果

| 用例 ID | 工具 | 结果 | 延迟 | 失败类别 |
|---------|------|------|------|----------|
| crud-inv-001 | - | ✅ 通过 | 5135ms |  |
| crud-inv-002 | - | ✅ 通过 | 8679ms |  |
| crud-inv-003 | - | ✅ 通过 | 6045ms |  |
| crud-inv-004 | - | ✅ 通过 | 2697ms |  |
| crud-inv-005 | - | ✅ 通过 | 2573ms |  |
| crud-cost-001 | - | ✅ 通过 | 2582ms |  |
| crud-cost-002 | - | ✅ 通过 | 2907ms |  |
| crud-cost-003 | - | ✅ 通过 | 2860ms |  |
| crud-cost-004 | - | ✅ 通过 | 2558ms |  |
| crud-sales-001 | - | ✅ 通过 | 2926ms |  |
| crud-sales-002 | - | ✅ 通过 | 3109ms |  |
| crud-sales-003 | - | ✅ 通过 | 2919ms |  |
| crud-log-001 | - | ✅ 通过 | 2766ms |  |
| crud-log-002 | - | ✅ 通过 | 2845ms |  |
| crud-log-003 | - | ✅ 通过 | 2507ms |  |
| crud-sup-001 | - | ✅ 通过 | 2522ms |  |
| crud-sup-002 | - | ✅ 通过 | 2868ms |  |
| crud-dash-001 | - | ✅ 通过 | 2403ms |  |
| crud-dash-002 | - | ✅ 通过 | 2529ms |  |
| crud-dash-003 | - | ✅ 通过 | 2494ms |  |
| crud-trend-001 | - | ✅ 通过 | 3544ms |  |
| crud-proc-001 | - | ✅ 通过 | 2377ms |  |
| crud-proc-002 | - | ✅ 通过 | 2593ms |  |
| crud-risk-001 | - | ✅ 通过 | 2435ms |  |
| crud-risk-002 | - | ✅ 通过 | 2578ms |  |
| crud-loc-001 | - | ✅ 通过 | 3174ms |  |
| crud-wh-001 | - | ✅ 通过 | 2491ms |  |
| op-reorder-001 | - | ✅ 通过 | 2852ms |  |
| op-reorder-002 | - | ✅ 通过 | 3666ms |  |
| op-batch-001 | - | ✅ 通过 | 3225ms |  |
| op-ship-001 | - | ✅ 通过 | 2501ms |  |
| op-ship-002 | - | ✅ 通过 | 2661ms |  |
| op-adjust-001 | - | ✅ 通过 | 3167ms |  |
| op-adjust-002 | - | ✅ 通过 | 3052ms |  |
| op-transfer-001 | query_inventory | ❌ 失败 | 2968ms | WRONG_TOOL |
| op-cost-001 | - | ✅ 通过 | 3124ms |  |
| op-cost-002 | - | ✅ 通过 | 2568ms |  |
| op-note-001 | - | ✅ 通过 | 2917ms |  |
| op-note-002 | create_note | ❌ 失败 | 3224ms | PARAM_MISMATCH |
| op-alert-001 | - | ✅ 通过 | 2941ms |  |
| op-alert-002 | - | ✅ 通过 | 2659ms |  |
| op-sup-status-001 | - | ✅ 通过 | 3905ms |  |
| op-sup-status-002 | - | ✅ 通过 | 2738ms |  |
| op-sup-create-001 | - | ✅ 通过 | 2823ms |  |
| op-sup-update-001 | - | ✅ 通过 | 2646ms |  |
| op-sup-update-002 | - | ✅ 通过 | 2632ms |  |
| intel-analytics-001 | - | ✅ 通过 | 2999ms |  |
| intel-analytics-002 | - | ✅ 通过 | 3349ms |  |
| intel-analytics-003 | - | ✅ 通过 | 2851ms |  |
| intel-analytics-004 | query_sales | ❌ 失败 | 3659ms | WRONG_TOOL |
| intel-fx-001 | - | ✅ 通过 | 2335ms |  |
| intel-fx-002 | - | ✅ 通过 | 2939ms |  |
| intel-weather-001 | - | ✅ 通过 | 4032ms |  |
| intel-weather-002 | - | ✅ 通过 | 2465ms |  |
| intel-comm-001 | - | ✅ 通过 | 2731ms |  |
| intel-scfis-001 | - | ✅ 通过 | 2613ms |  |
| intel-carbon-001 | - | ✅ 通过 | 3118ms |  |
| intel-fin-001 | - | ✅ 通过 | 2532ms |  |
| intel-amz-001 | - | ✅ 通过 | 3306ms |  |
| intel-amz-002 | - | ✅ 通过 | 3577ms |  |
| intel-sentiment-001 | - | ✅ 通过 | 2764ms |  |
| intel-sentiment-002 | - | ✅ 通过 | 3617ms |  |
| intel-cascade-001 | query_port_congestion | ❌ 失败 | 3149ms | WRONG_TOOL |
| intel-cascade-002 | query_exchange_rates | ❌ 失败 | 3529ms | WRONG_TOOL |
| intel-cascade-003 | query_weather | ❌ 失败 | 4355ms | WRONG_TOOL |
| intel-cpsc-001 | - | ✅ 通过 | 2190ms |  |
| intel-port-001 | - | ✅ 通过 | 2065ms |  |
| intel-coherence-001 | - | ✅ 通过 | 2622ms |  |
| intel-recall-001 | - | ✅ 通过 | 2644ms |  |
| intel-decision-001 | query_inventory | ❌ 失败 | 3912ms | WRONG_TOOL |
| intel-decision-002 | - | ✅ 通过 | 3246ms |  |
| intel-wf-001 | - | ✅ 通过 | 2875ms |  |
| intel-wf-002 | - | ✅ 通过 | 4387ms |  |
| intel-tariff-001 | - | ✅ 通过 | 3069ms |  |
| intel-tariff-002 | - | ✅ 通过 | 4211ms |  |
| intel-tariff-003 | - | ✅ 通过 | 3322ms |  |
| intel-sandbox-001 | - | ✅ 通过 | 2877ms |  |
| intel-compliance-001 | - | ✅ 通过 | 3318ms |  |
| intel-compliance-002 | - | ✅ 通过 | 3039ms |  |
| intel-finsim-001 | - | ✅ 通过 | 4141ms |  |
| intel-feed-001 | - | ✅ 通过 | 2439ms |  |
| intel-arb-001 | - | ✅ 通过 | 3565ms |  |
| intel-disc-001 | - | ✅ 通过 | 3234ms |  |
| intel-web-001 | - | ✅ 通过 | 2334ms |  |
| intel-chart-001 | - | ✅ 通过 | 2723ms |  |
| intel-analyze-chart-001 | - | ✅ 通过 | 3023ms |  |
| intel-report-001 | - | ✅ 通过 | 2665ms |  |
| sc-eoq-001 | - | ✅ 通过 | 3340ms |  |
| sc-ss-001 | - | ✅ 通过 | 3145ms |  |
| sc-rop-001 | - | ✅ 通过 | 2898ms |  |
| sc-abc-001 | - | ✅ 通过 | 2664ms |  |
| sc-forecast-001 | - | ✅ 通过 | 3190ms |  |
| sc-seasonal-001 | - | ✅ 通过 | 2794ms |  |
| sc-mc-001 | - | ✅ 通过 | 3556ms |  |
| sc-ww-001 | - | ✅ 通过 | 3062ms |  |
| sc-nv-001 | - | ✅ 通过 | 2957ms |  |
| sc-drp-001 | - | ✅ 通过 | 3539ms |  |
| sc-wh-001 | - | ✅ 通过 | 3407ms |  |
| sc-route-001 | - | ✅ 通过 | 3837ms |  |
| sc-multi-001 | - | ✅ 通过 | 3335ms |  |
| sc-kpi-001 | - | ✅ 通过 | 4407ms |  |
| sc-fill-001 | - | ✅ 通过 | 3293ms |  |
| sc-lt-001 | - | ✅ 通过 | 3565ms |  |
| sc-pv-001 | - | ✅ 通过 | 2832ms |  |
| sc-tc-001 | - | ✅ 通过 | 3388ms |  |
| sc-score-001 | - | ✅ 通过 | 2636ms |  |
| sc-lc-001 | - | ✅ 通过 | 2766ms |  |
| sc-be-001 | - | ✅ 通过 | 3072ms |  |
| sc-price-001 | - | ✅ 通过 | 3300ms |  |
| sc-jrp-001 | - | ✅ 通过 | 3396ms |  |
| sc-fa-001 | - | ✅ 通过 | 3014ms |  |
| sg-graph-001 | - | ✅ 通过 | 2538ms |  |
| sg-graph-002 | - | ✅ 通过 | 2594ms |  |
| sg-dep-001 | - | ✅ 通过 | 3219ms |  |
| sg-impact-001 | - | ✅ 通过 | 2903ms |  |
| sg-choke-001 | - | ✅ 通过 | 2619ms |  |
| sg-geo-001 | - | ✅ 通过 | 3207ms |  |
| sg-tiers-001 | - | ✅ 通过 | 2431ms |  |
| sg-health-001 | - | ✅ 通过 | 2523ms |  |
| sg-evo-001 | - | ✅ 通过 | 2680ms |  |
| sg-tree-001 | - | ✅ 通过 | 2429ms |  |