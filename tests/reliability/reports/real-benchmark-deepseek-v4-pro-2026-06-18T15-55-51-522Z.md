# 工具调用可靠性基准测试报告

**生成时间**: 2026-06-18T15:55:51.520Z
**Provider**: deepseek
**模式**: 真实 API
**测试用例数**: 121

## 核心指标

| 指标 | 值 |
|------|----|
| 成功率 | **80.2%** |
| 通过/失败 | 97/24 |
| 平均延迟 | 2697ms |
| P50 延迟 | 2542ms |
| P95 延迟 | 3757ms |
| 最小/最大延迟 | 1899ms / 5723ms |
| 总耗时 | 109163ms |

## 失败模式分析报告

**总失败数**: 24

### 按失败类别分布

| 类别 | 数量 | 占比 |
|------|------|------|
| 未知错误 (UNKNOWN) | 15 | 62.5% |
| 工具选择错误 (WRONG_TOOL) | 7 | 29.2% |
| 参数值不匹配 (PARAM_MISMATCH) | 2 | 8.3% |

### 按工具家族分布

| 家族 | 失败数 |
|------|--------|
| supply-chain | 11 |
| intelligence | 10 |
| operations | 3 |

### 按难度分布

| 难度 | 失败数 |
|------|--------|
| hard | 16 |
| medium | 7 |
| easy | 1 |

**主要失败模式**: 未知错误 (UNKNOWN)

## 改进建议

- WRONG_TOOL (7次): 改进工具描述，增加区分性关键词。考虑在 system prompt 中添加工具选择示例（few-shot）。
- PARAM_MISMATCH (2次): 工具正确但参数值与期望不符。检查 LLM 是否正确理解了用户输入中的数值/名称，可能需要在 prompt 中强化信息提取。

## 详细结果

| 用例 ID | 工具 | 结果 | 延迟 | 失败类别 |
|---------|------|------|------|----------|
| crud-inv-001 | - | ✅ 通过 | 3308ms |  |
| crud-inv-002 | - | ✅ 通过 | 4451ms |  |
| crud-inv-003 | - | ✅ 通过 | 5723ms |  |
| crud-inv-004 | - | ✅ 通过 | 2991ms |  |
| crud-inv-005 | - | ✅ 通过 | 2216ms |  |
| crud-cost-001 | - | ✅ 通过 | 4767ms |  |
| crud-cost-002 | - | ✅ 通过 | 2250ms |  |
| crud-cost-003 | - | ✅ 通过 | 2264ms |  |
| crud-cost-004 | - | ✅ 通过 | 2495ms |  |
| crud-sales-001 | - | ✅ 通过 | 2143ms |  |
| crud-sales-002 | - | ✅ 通过 | 2514ms |  |
| crud-sales-003 | - | ✅ 通过 | 2816ms |  |
| crud-log-001 | - | ✅ 通过 | 3254ms |  |
| crud-log-002 | - | ✅ 通过 | 3182ms |  |
| crud-log-003 | - | ✅ 通过 | 2104ms |  |
| crud-sup-001 | - | ✅ 通过 | 2497ms |  |
| crud-sup-002 | - | ✅ 通过 | 2105ms |  |
| crud-dash-001 | - | ✅ 通过 | 2224ms |  |
| crud-dash-002 | - | ✅ 通过 | 2490ms |  |
| crud-dash-003 | - | ✅ 通过 | 2176ms |  |
| crud-trend-001 | - | ✅ 通过 | 1904ms |  |
| crud-proc-001 | - | ✅ 通过 | 2019ms |  |
| crud-proc-002 | - | ✅ 通过 | 2509ms |  |
| crud-risk-001 | - | ✅ 通过 | 2019ms |  |
| crud-risk-002 | - | ✅ 通过 | 2182ms |  |
| crud-loc-001 | - | ✅ 通过 | 2877ms |  |
| crud-wh-001 | - | ✅ 通过 | 2225ms |  |
| op-reorder-001 | - | ✅ 通过 | 2518ms |  |
| op-reorder-002 | create_reorder | ❌ 失败 | 2587ms | PARAM_MISMATCH |
| op-batch-001 | batch_create_reorder | ❌ 失败 | 2568ms | UNKNOWN |
| op-ship-001 | - | ✅ 通过 | 3142ms |  |
| op-ship-002 | - | ✅ 通过 | 2529ms |  |
| op-adjust-001 | - | ✅ 通过 | 2160ms |  |
| op-adjust-002 | - | ✅ 通过 | 2990ms |  |
| op-transfer-001 | query_inventory | ❌ 失败 | 2492ms | WRONG_TOOL |
| op-cost-001 | - | ✅ 通过 | 2572ms |  |
| op-cost-002 | - | ✅ 通过 | 2442ms |  |
| op-note-001 | - | ✅ 通过 | 2513ms |  |
| op-note-002 | - | ✅ 通过 | 2415ms |  |
| op-alert-001 | - | ✅ 通过 | 2600ms |  |
| op-alert-002 | - | ✅ 通过 | 2422ms |  |
| op-sup-status-001 | - | ✅ 通过 | 2590ms |  |
| op-sup-status-002 | - | ✅ 通过 | 2239ms |  |
| op-sup-create-001 | - | ✅ 通过 | 3163ms |  |
| op-sup-update-001 | - | ✅ 通过 | 2482ms |  |
| op-sup-update-002 | - | ✅ 通过 | 2784ms |  |
| intel-analytics-001 | - | ✅ 通过 | 2775ms |  |
| intel-analytics-002 | - | ✅ 通过 | 2467ms |  |
| intel-analytics-003 | - | ✅ 通过 | 2900ms |  |
| intel-analytics-004 | query_sales | ❌ 失败 | 2930ms | WRONG_TOOL |
| intel-fx-001 | - | ✅ 通过 | 3064ms |  |
| intel-fx-002 | - | ✅ 通过 | 2340ms |  |
| intel-weather-001 | - | ✅ 通过 | 1959ms |  |
| intel-weather-002 | - | ✅ 通过 | 1922ms |  |
| intel-comm-001 | - | ✅ 通过 | 2455ms |  |
| intel-scfis-001 | - | ✅ 通过 | 2006ms |  |
| intel-carbon-001 | - | ✅ 通过 | 2537ms |  |
| intel-fin-001 | query_financial_index | ❌ 失败 | 2407ms | UNKNOWN |
| intel-amz-001 | - | ✅ 通过 | 3171ms |  |
| intel-amz-002 | - | ✅ 通过 | 3079ms |  |
| intel-sentiment-001 | query_brand_sentiment | ❌ 失败 | 3202ms | PARAM_MISMATCH |
| intel-sentiment-002 | - | ✅ 通过 | 2624ms |  |
| intel-cascade-001 | query_port_congestion | ❌ 失败 | 2585ms | WRONG_TOOL |
| intel-cascade-002 | - | ✅ 通过 | 3772ms |  |
| intel-cascade-003 | query_weather | ❌ 失败 | 2711ms | WRONG_TOOL |
| intel-cpsc-001 | - | ✅ 通过 | 2099ms |  |
| intel-port-001 | - | ✅ 通过 | 2719ms |  |
| intel-coherence-001 | - | ✅ 通过 | 2763ms |  |
| intel-recall-001 | - | ✅ 通过 | 2595ms |  |
| intel-decision-001 | query_dashboard | ❌ 失败 | 3151ms | WRONG_TOOL |
| intel-decision-002 | - | ✅ 通过 | 3651ms |  |
| intel-wf-001 | - | ✅ 通过 | 3041ms |  |
| intel-wf-002 | query_exchange_rates | ❌ 失败 | 2821ms | WRONG_TOOL |
| intel-tariff-001 | - | ✅ 通过 | 2024ms |  |
| intel-tariff-002 | - | ✅ 通过 | 2660ms |  |
| intel-tariff-003 | run_sandbox | ❌ 失败 | 2922ms | WRONG_TOOL |
| intel-sandbox-001 | - | ✅ 通过 | 2397ms |  |
| intel-compliance-001 | - | ✅ 通过 | 2411ms |  |
| intel-compliance-002 | - | ✅ 通过 | 2433ms |  |
| intel-finsim-001 | - | ✅ 通过 | 3371ms |  |
| intel-feed-001 | - | ✅ 通过 | 2069ms |  |
| intel-arb-001 | query_arbitrage | ❌ 失败 | 3833ms | UNKNOWN |
| intel-disc-001 | query_supplier_discovery | ❌ 失败 | 2941ms | UNKNOWN |
| intel-web-001 | - | ✅ 通过 | 3028ms |  |
| intel-chart-001 | - | ✅ 通过 | 2546ms |  |
| intel-analyze-chart-001 | - | ✅ 通过 | 2318ms |  |
| intel-report-001 | - | ✅ 通过 | 2237ms |  |
| sc-eoq-001 | - | ✅ 通过 | 2687ms |  |
| sc-ss-001 | - | ✅ 通过 | 3757ms |  |
| sc-rop-001 | - | ✅ 通过 | 2932ms |  |
| sc-abc-001 | classify_abc_xyz | ❌ 失败 | 2414ms | UNKNOWN |
| sc-forecast-001 | forecast_demand | ❌ 失败 | 2945ms | UNKNOWN |
| sc-seasonal-001 | calculate_seasonal_decompose | ❌ 失败 | 2375ms | UNKNOWN |
| sc-mc-001 | - | ✅ 通过 | 2728ms |  |
| sc-ww-001 | calculate_wagner_whitin | ❌ 失败 | 2392ms | UNKNOWN |
| sc-nv-001 | - | ✅ 通过 | 2368ms |  |
| sc-drp-001 | calculate_drp | ❌ 失败 | 2922ms | UNKNOWN |
| sc-wh-001 | calculate_warehouse_location | ❌ 失败 | 2408ms | UNKNOWN |
| sc-route-001 | calculate_transport_route | ❌ 失败 | 2521ms | UNKNOWN |
| sc-multi-001 | - | ✅ 通过 | 3319ms |  |
| sc-kpi-001 | - | ✅ 通过 | 3269ms |  |
| sc-fill-001 | - | ✅ 通过 | 3021ms |  |
| sc-lt-001 | calculate_lead_time_analysis | ❌ 失败 | 2919ms | UNKNOWN |
| sc-pv-001 | - | ✅ 通过 | 3097ms |  |
| sc-tc-001 | - | ✅ 通过 | 3668ms |  |
| sc-score-001 | calculate_supplier_scoring | ❌ 失败 | 2430ms | UNKNOWN |
| sc-lc-001 | - | ✅ 通过 | 2455ms |  |
| sc-be-001 | - | ✅ 通过 | 3660ms |  |
| sc-price-001 | - | ✅ 通过 | 2977ms |  |
| sc-jrp-001 | calculate_joint_replenishment | ❌ 失败 | 4182ms | UNKNOWN |
| sc-fa-001 | calculate_forecast_accuracy | ❌ 失败 | 2443ms | UNKNOWN |
| sg-graph-001 | - | ✅ 通过 | 2066ms |  |
| sg-graph-002 | - | ✅ 通过 | 2542ms |  |
| sg-dep-001 | - | ✅ 通过 | 2756ms |  |
| sg-impact-001 | - | ✅ 通过 | 2418ms |  |
| sg-choke-001 | - | ✅ 通过 | 2038ms |  |
| sg-geo-001 | - | ✅ 通过 | 2012ms |  |
| sg-tiers-001 | - | ✅ 通过 | 2137ms |  |
| sg-health-001 | - | ✅ 通过 | 1899ms |  |
| sg-evo-001 | - | ✅ 通过 | 2712ms |  |
| sg-tree-001 | - | ✅ 通过 | 1976ms |  |