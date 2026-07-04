# 工具调用可靠性基准测试报告

**生成时间**: 2026-06-18T14:42:08.322Z
**Provider**: deepseek
**模式**: 真实 API
**测试用例数**: 121

## 核心指标

| 指标 | 值 |
|------|----|
| 成功率 | **82.6%** |
| 通过/失败 | 100/21 |
| 平均延迟 | 2748ms |
| P50 延迟 | 2619ms |
| P95 延迟 | 3733ms |
| 最小/最大延迟 | 1884ms / 4928ms |
| 总耗时 | 111654ms |

## 失败模式分析报告

**总失败数**: 21

### 按失败类别分布

| 类别 | 数量 | 占比 |
|------|------|------|
| 工具选择错误 (WRONG_TOOL) | 10 | 47.6% |
| 参数值不匹配 (PARAM_MISMATCH) | 10 | 47.6% |
| 参数类型错误 (INVALID_TYPE) | 1 | 4.8% |

### 按工具家族分布

| 家族 | 失败数 |
|------|--------|
| intelligence | 12 |
| supply-chain | 4 |
| crud | 3 |
| operations | 2 |

### 按难度分布

| 难度 | 失败数 |
|------|--------|
| medium | 10 |
| hard | 10 |
| easy | 1 |

**主要失败模式**: 工具选择错误 (WRONG_TOOL)

## 改进建议

- WRONG_TOOL (10次): 改进工具描述，增加区分性关键词。考虑在 system prompt 中添加工具选择示例（few-shot）。
- INVALID_TYPE (1次): 参数类型错误。在描述中添加类型示例，如 "quantity: 数字，如 100"。
- PARAM_MISMATCH (10次): 工具正确但参数值与期望不符。检查 LLM 是否正确理解了用户输入中的数值/名称，可能需要在 prompt 中强化信息提取。

## 详细结果

| 用例 ID | 工具 | 结果 | 延迟 | 失败类别 |
|---------|------|------|------|----------|
| crud-inv-001 | - | ✅ 通过 | 3346ms |  |
| crud-inv-002 | - | ✅ 通过 | 4825ms |  |
| crud-inv-003 | - | ✅ 通过 | 3966ms |  |
| crud-inv-004 | - | ✅ 通过 | 2741ms |  |
| crud-inv-005 | - | ✅ 通过 | 2409ms |  |
| crud-cost-001 | - | ✅ 通过 | 2176ms |  |
| crud-cost-002 | query_cost | ❌ 失败 | 3759ms | PARAM_MISMATCH |
| crud-cost-003 | - | ✅ 通过 | 2900ms |  |
| crud-cost-004 | - | ✅ 通过 | 2290ms |  |
| crud-sales-001 | - | ✅ 通过 | 2101ms |  |
| crud-sales-002 | - | ✅ 通过 | 2974ms |  |
| crud-sales-003 | - | ✅ 通过 | 2743ms |  |
| crud-log-001 | - | ✅ 通过 | 2388ms |  |
| crud-log-002 | - | ✅ 通过 | 2328ms |  |
| crud-log-003 | - | ✅ 通过 | 2024ms |  |
| crud-sup-001 | query_supplier_location | ❌ 失败 | 2181ms | WRONG_TOOL |
| crud-sup-002 | query_suppliers | ❌ 失败 | 3244ms | PARAM_MISMATCH |
| crud-dash-001 | - | ✅ 通过 | 2374ms |  |
| crud-dash-002 | - | ✅ 通过 | 2619ms |  |
| crud-dash-003 | - | ✅ 通过 | 2155ms |  |
| crud-trend-001 | - | ✅ 通过 | 2331ms |  |
| crud-proc-001 | - | ✅ 通过 | 2327ms |  |
| crud-proc-002 | - | ✅ 通过 | 2549ms |  |
| crud-risk-001 | - | ✅ 通过 | 2011ms |  |
| crud-risk-002 | - | ✅ 通过 | 2838ms |  |
| crud-loc-001 | - | ✅ 通过 | 1948ms |  |
| crud-wh-001 | - | ✅ 通过 | 2852ms |  |
| op-reorder-001 | - | ✅ 通过 | 2586ms |  |
| op-reorder-002 | - | ✅ 通过 | 2762ms |  |
| op-batch-001 | batch_create_reorder | ❌ 失败 | 2718ms | PARAM_MISMATCH |
| op-ship-001 | - | ✅ 通过 | 2249ms |  |
| op-ship-002 | - | ✅ 通过 | 2382ms |  |
| op-adjust-001 | - | ✅ 通过 | 2280ms |  |
| op-adjust-002 | - | ✅ 通过 | 2104ms |  |
| op-transfer-001 | - | ✅ 通过 | 3201ms |  |
| op-cost-001 | - | ✅ 通过 | 2381ms |  |
| op-cost-002 | - | ✅ 通过 | 2455ms |  |
| op-note-001 | - | ✅ 通过 | 2379ms |  |
| op-note-002 | create_note | ❌ 失败 | 2956ms | PARAM_MISMATCH |
| op-alert-001 | - | ✅ 通过 | 2253ms |  |
| op-alert-002 | - | ✅ 通过 | 2389ms |  |
| op-sup-status-001 | - | ✅ 通过 | 2594ms |  |
| op-sup-status-002 | - | ✅ 通过 | 2235ms |  |
| op-sup-create-001 | - | ✅ 通过 | 3549ms |  |
| op-sup-update-001 | - | ✅ 通过 | 2321ms |  |
| op-sup-update-002 | - | ✅ 通过 | 2916ms |  |
| intel-analytics-001 | query_suppliers | ❌ 失败 | 3142ms | WRONG_TOOL |
| intel-analytics-002 | query_cost | ❌ 失败 | 2739ms | WRONG_TOOL |
| intel-analytics-003 | - | ✅ 通过 | 3208ms |  |
| intel-analytics-004 | query_sales | ❌ 失败 | 3203ms | WRONG_TOOL |
| intel-fx-001 | - | ✅ 通过 | 2247ms |  |
| intel-fx-002 | - | ✅ 通过 | 2655ms |  |
| intel-weather-001 | - | ✅ 通过 | 2057ms |  |
| intel-weather-002 | - | ✅ 通过 | 2374ms |  |
| intel-comm-001 | - | ✅ 通过 | 2269ms |  |
| intel-scfis-001 | - | ✅ 通过 | 2184ms |  |
| intel-carbon-001 | - | ✅ 通过 | 2564ms |  |
| intel-fin-001 | query_financial_index | ❌ 失败 | 2352ms | PARAM_MISMATCH |
| intel-amz-001 | - | ✅ 通过 | 3263ms |  |
| intel-amz-002 | - | ✅ 通过 | 3641ms |  |
| intel-sentiment-001 | - | ✅ 通过 | 3310ms |  |
| intel-sentiment-002 | - | ✅ 通过 | 2548ms |  |
| intel-cascade-001 | - | ✅ 通过 | 3118ms |  |
| intel-cascade-002 | query_exchange_rates | ❌ 失败 | 3595ms | WRONG_TOOL |
| intel-cascade-003 | query_weather | ❌ 失败 | 3350ms | WRONG_TOOL |
| intel-cpsc-001 | - | ✅ 通过 | 1884ms |  |
| intel-port-001 | - | ✅ 通过 | 3358ms |  |
| intel-coherence-001 | - | ✅ 通过 | 2589ms |  |
| intel-recall-001 | - | ✅ 通过 | 2060ms |  |
| intel-decision-001 | query_dashboard | ❌ 失败 | 3419ms | WRONG_TOOL |
| intel-decision-002 | query_dashboard | ❌ 失败 | 4058ms | WRONG_TOOL |
| intel-wf-001 | query_dashboard | ❌ 失败 | 2995ms | WRONG_TOOL |
| intel-wf-002 | query_exchange_rates | ❌ 失败 | 2963ms | WRONG_TOOL |
| intel-tariff-001 | - | ✅ 通过 | 2444ms |  |
| intel-tariff-002 | - | ✅ 通过 | 2603ms |  |
| intel-tariff-003 | - | ✅ 通过 | 3733ms |  |
| intel-sandbox-001 | - | ✅ 通过 | 2205ms |  |
| intel-compliance-001 | - | ✅ 通过 | 3066ms |  |
| intel-compliance-002 | - | ✅ 通过 | 2775ms |  |
| intel-finsim-001 | - | ✅ 通过 | 3456ms |  |
| intel-feed-001 | - | ✅ 通过 | 2569ms |  |
| intel-arb-001 | query_arbitrage | ❌ 失败 | 3651ms | PARAM_MISMATCH |
| intel-disc-001 | query_supplier_discovery | ❌ 失败 | 3143ms | PARAM_MISMATCH |
| intel-web-001 | - | ✅ 通过 | 2435ms |  |
| intel-chart-001 | - | ✅ 通过 | 3032ms |  |
| intel-analyze-chart-001 | - | ✅ 通过 | 2532ms |  |
| intel-report-001 | - | ✅ 通过 | 2158ms |  |
| sc-eoq-001 | - | ✅ 通过 | 2668ms |  |
| sc-ss-001 | - | ✅ 通过 | 3176ms |  |
| sc-rop-001 | - | ✅ 通过 | 3611ms |  |
| sc-abc-001 | - | ✅ 通过 | 2357ms |  |
| sc-forecast-001 | forecast_demand | ❌ 失败 | 2748ms | INVALID_TYPE |
| sc-seasonal-001 | - | ✅ 通过 | 2364ms |  |
| sc-mc-001 | - | ✅ 通过 | 3073ms |  |
| sc-ww-001 | calculate_wagner_whitin | ❌ 失败 | 2696ms | PARAM_MISMATCH |
| sc-nv-001 | - | ✅ 通过 | 2729ms |  |
| sc-drp-001 | calculate_drp | ❌ 失败 | 3115ms | PARAM_MISMATCH |
| sc-wh-001 | - | ✅ 通过 | 2708ms |  |
| sc-route-001 | - | ✅ 通过 | 2823ms |  |
| sc-multi-001 | - | ✅ 通过 | 2908ms |  |
| sc-kpi-001 | - | ✅ 通过 | 3076ms |  |
| sc-fill-001 | - | ✅ 通过 | 2940ms |  |
| sc-lt-001 | calculate_lead_time_analysis | ❌ 失败 | 2386ms | PARAM_MISMATCH |
| sc-pv-001 | - | ✅ 通过 | 2560ms |  |
| sc-tc-001 | - | ✅ 通过 | 3778ms |  |
| sc-score-001 | - | ✅ 通过 | 2460ms |  |
| sc-lc-001 | - | ✅ 通过 | 4928ms |  |
| sc-be-001 | - | ✅ 通过 | 2720ms |  |
| sc-price-001 | - | ✅ 通过 | 3207ms |  |
| sc-jrp-001 | - | ✅ 通过 | 3543ms |  |
| sc-fa-001 | - | ✅ 通过 | 2382ms |  |
| sg-graph-001 | - | ✅ 通过 | 2291ms |  |
| sg-graph-002 | - | ✅ 通过 | 2469ms |  |
| sg-dep-001 | - | ✅ 通过 | 1921ms |  |
| sg-impact-001 | - | ✅ 通过 | 3144ms |  |
| sg-choke-001 | - | ✅ 通过 | 2014ms |  |
| sg-geo-001 | - | ✅ 通过 | 2213ms |  |
| sg-tiers-001 | - | ✅ 通过 | 3039ms |  |
| sg-health-001 | - | ✅ 通过 | 2004ms |  |
| sg-evo-001 | - | ✅ 通过 | 2401ms |  |
| sg-tree-001 | - | ✅ 通过 | 1999ms |  |