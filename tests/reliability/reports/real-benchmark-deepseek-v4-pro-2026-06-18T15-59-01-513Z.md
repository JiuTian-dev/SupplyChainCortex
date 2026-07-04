# 工具调用可靠性基准测试报告

**生成时间**: 2026-06-18T15:59:01.511Z
**Provider**: deepseek
**模式**: 真实 API
**测试用例数**: 121

## 核心指标

| 指标 | 值 |
|------|----|
| 成功率 | **92.6%** |
| 通过/失败 | 112/9 |
| 平均延迟 | 2621ms |
| P50 延迟 | 2483ms |
| P95 延迟 | 3523ms |
| 最小/最大延迟 | 1602ms / 4380ms |
| 总耗时 | 106409ms |

## 失败模式分析报告

**总失败数**: 9

### 按失败类别分布

| 类别 | 数量 | 占比 |
|------|------|------|
| 工具选择错误 (WRONG_TOOL) | 7 | 77.8% |
| 参数值不匹配 (PARAM_MISMATCH) | 2 | 22.2% |

### 按工具家族分布

| 家族 | 失败数 |
|------|--------|
| intelligence | 7 |
| operations | 2 |

### 按难度分布

| 难度 | 失败数 |
|------|--------|
| medium | 6 |
| hard | 2 |
| easy | 1 |

**主要失败模式**: 工具选择错误 (WRONG_TOOL)

## 改进建议

- WRONG_TOOL (7次): 改进工具描述，增加区分性关键词。考虑在 system prompt 中添加工具选择示例（few-shot）。
- PARAM_MISMATCH (2次): 工具正确但参数值与期望不符。检查 LLM 是否正确理解了用户输入中的数值/名称，可能需要在 prompt 中强化信息提取。

## 详细结果

| 用例 ID | 工具 | 结果 | 延迟 | 失败类别 |
|---------|------|------|------|----------|
| crud-inv-001 | - | ✅ 通过 | 3372ms |  |
| crud-inv-002 | - | ✅ 通过 | 2942ms |  |
| crud-inv-003 | - | ✅ 通过 | 3433ms |  |
| crud-inv-004 | - | ✅ 通过 | 2333ms |  |
| crud-inv-005 | - | ✅ 通过 | 2249ms |  |
| crud-cost-001 | - | ✅ 通过 | 2365ms |  |
| crud-cost-002 | - | ✅ 通过 | 2243ms |  |
| crud-cost-003 | - | ✅ 通过 | 2228ms |  |
| crud-cost-004 | - | ✅ 通过 | 2082ms |  |
| crud-sales-001 | - | ✅ 通过 | 2163ms |  |
| crud-sales-002 | - | ✅ 通过 | 3082ms |  |
| crud-sales-003 | - | ✅ 通过 | 2972ms |  |
| crud-log-001 | - | ✅ 通过 | 2221ms |  |
| crud-log-002 | - | ✅ 通过 | 2882ms |  |
| crud-log-003 | - | ✅ 通过 | 2259ms |  |
| crud-sup-001 | - | ✅ 通过 | 2264ms |  |
| crud-sup-002 | - | ✅ 通过 | 2292ms |  |
| crud-dash-001 | - | ✅ 通过 | 2281ms |  |
| crud-dash-002 | - | ✅ 通过 | 2009ms |  |
| crud-dash-003 | - | ✅ 通过 | 2508ms |  |
| crud-trend-001 | - | ✅ 通过 | 2236ms |  |
| crud-proc-001 | - | ✅ 通过 | 2827ms |  |
| crud-proc-002 | - | ✅ 通过 | 2000ms |  |
| crud-risk-001 | - | ✅ 通过 | 2116ms |  |
| crud-risk-002 | - | ✅ 通过 | 2342ms |  |
| crud-loc-001 | - | ✅ 通过 | 2311ms |  |
| crud-wh-001 | - | ✅ 通过 | 1931ms |  |
| op-reorder-001 | - | ✅ 通过 | 2762ms |  |
| op-reorder-002 | - | ✅ 通过 | 2447ms |  |
| op-batch-001 | - | ✅ 通过 | 2570ms |  |
| op-ship-001 | - | ✅ 通过 | 2274ms |  |
| op-ship-002 | - | ✅ 通过 | 2312ms |  |
| op-adjust-001 | - | ✅ 通过 | 2302ms |  |
| op-adjust-002 | - | ✅ 通过 | 2336ms |  |
| op-transfer-001 | query_inventory | ❌ 失败 | 2443ms | WRONG_TOOL |
| op-cost-001 | - | ✅ 通过 | 2204ms |  |
| op-cost-002 | - | ✅ 通过 | 2223ms |  |
| op-note-001 | - | ✅ 通过 | 2468ms |  |
| op-note-002 | create_note | ❌ 失败 | 2979ms | PARAM_MISMATCH |
| op-alert-001 | - | ✅ 通过 | 2022ms |  |
| op-alert-002 | - | ✅ 通过 | 2217ms |  |
| op-sup-status-001 | - | ✅ 通过 | 2483ms |  |
| op-sup-status-002 | - | ✅ 通过 | 2331ms |  |
| op-sup-create-001 | - | ✅ 通过 | 2504ms |  |
| op-sup-update-001 | - | ✅ 通过 | 2761ms |  |
| op-sup-update-002 | - | ✅ 通过 | 2215ms |  |
| intel-analytics-001 | query_suppliers | ❌ 失败 | 3313ms | WRONG_TOOL |
| intel-analytics-002 | - | ✅ 通过 | 1956ms |  |
| intel-analytics-003 | - | ✅ 通过 | 3523ms |  |
| intel-analytics-004 | query_sales | ❌ 失败 | 2715ms | WRONG_TOOL |
| intel-fx-001 | - | ✅ 通过 | 2056ms |  |
| intel-fx-002 | - | ✅ 通过 | 2916ms |  |
| intel-weather-001 | - | ✅ 通过 | 2255ms |  |
| intel-weather-002 | - | ✅ 通过 | 2364ms |  |
| intel-comm-001 | - | ✅ 通过 | 1835ms |  |
| intel-scfis-001 | - | ✅ 通过 | 2038ms |  |
| intel-carbon-001 | - | ✅ 通过 | 2177ms |  |
| intel-fin-001 | - | ✅ 通过 | 2190ms |  |
| intel-amz-001 | - | ✅ 通过 | 3468ms |  |
| intel-amz-002 | - | ✅ 通过 | 2928ms |  |
| intel-sentiment-001 | query_brand_sentiment | ❌ 失败 | 2635ms | PARAM_MISMATCH |
| intel-sentiment-002 | - | ✅ 通过 | 2577ms |  |
| intel-cascade-001 | query_port_congestion | ❌ 失败 | 2551ms | WRONG_TOOL |
| intel-cascade-002 | query_exchange_rates | ❌ 失败 | 4380ms | WRONG_TOOL |
| intel-cascade-003 | query_weather | ❌ 失败 | 2689ms | WRONG_TOOL |
| intel-cpsc-001 | - | ✅ 通过 | 1602ms |  |
| intel-port-001 | - | ✅ 通过 | 1885ms |  |
| intel-coherence-001 | - | ✅ 通过 | 2163ms |  |
| intel-recall-001 | - | ✅ 通过 | 3584ms |  |
| intel-decision-001 | query_dashboard | ❌ 失败 | 3153ms | WRONG_TOOL |
| intel-decision-002 | - | ✅ 通过 | 3583ms |  |
| intel-wf-001 | - | ✅ 通过 | 2477ms |  |
| intel-wf-002 | - | ✅ 通过 | 2553ms |  |
| intel-tariff-001 | - | ✅ 通过 | 1919ms |  |
| intel-tariff-002 | - | ✅ 通过 | 3253ms |  |
| intel-tariff-003 | - | ✅ 通过 | 3266ms |  |
| intel-sandbox-001 | - | ✅ 通过 | 2501ms |  |
| intel-compliance-001 | - | ✅ 通过 | 2058ms |  |
| intel-compliance-002 | - | ✅ 通过 | 2525ms |  |
| intel-finsim-001 | - | ✅ 通过 | 3261ms |  |
| intel-feed-001 | - | ✅ 通过 | 4147ms |  |
| intel-arb-001 | - | ✅ 通过 | 3186ms |  |
| intel-disc-001 | - | ✅ 通过 | 2746ms |  |
| intel-web-001 | - | ✅ 通过 | 2217ms |  |
| intel-chart-001 | - | ✅ 通过 | 3395ms |  |
| intel-analyze-chart-001 | - | ✅ 通过 | 2504ms |  |
| intel-report-001 | - | ✅ 通过 | 2056ms |  |
| sc-eoq-001 | - | ✅ 通过 | 2603ms |  |
| sc-ss-001 | - | ✅ 通过 | 4218ms |  |
| sc-rop-001 | - | ✅ 通过 | 2786ms |  |
| sc-abc-001 | - | ✅ 通过 | 2968ms |  |
| sc-forecast-001 | - | ✅ 通过 | 3348ms |  |
| sc-seasonal-001 | - | ✅ 通过 | 2671ms |  |
| sc-mc-001 | - | ✅ 通过 | 2652ms |  |
| sc-ww-001 | - | ✅ 通过 | 2614ms |  |
| sc-nv-001 | - | ✅ 通过 | 2699ms |  |
| sc-drp-001 | - | ✅ 通过 | 3106ms |  |
| sc-wh-001 | - | ✅ 通过 | 2994ms |  |
| sc-route-001 | - | ✅ 通过 | 3150ms |  |
| sc-multi-001 | - | ✅ 通过 | 3027ms |  |
| sc-kpi-001 | - | ✅ 通过 | 3163ms |  |
| sc-fill-001 | - | ✅ 通过 | 3436ms |  |
| sc-lt-001 | - | ✅ 通过 | 2712ms |  |
| sc-pv-001 | - | ✅ 通过 | 2444ms |  |
| sc-tc-001 | - | ✅ 通过 | 3361ms |  |
| sc-score-001 | - | ✅ 通过 | 2393ms |  |
| sc-lc-001 | - | ✅ 通过 | 3199ms |  |
| sc-be-001 | - | ✅ 通过 | 3840ms |  |
| sc-price-001 | - | ✅ 通过 | 3000ms |  |
| sc-jrp-001 | - | ✅ 通过 | 2423ms |  |
| sc-fa-001 | - | ✅ 通过 | 2684ms |  |
| sg-graph-001 | - | ✅ 通过 | 2342ms |  |
| sg-graph-002 | - | ✅ 通过 | 2349ms |  |
| sg-dep-001 | - | ✅ 通过 | 2461ms |  |
| sg-impact-001 | - | ✅ 通过 | 2257ms |  |
| sg-choke-001 | - | ✅ 通过 | 2177ms |  |
| sg-geo-001 | - | ✅ 通过 | 2812ms |  |
| sg-tiers-001 | - | ✅ 通过 | 2246ms |  |
| sg-health-001 | - | ✅ 通过 | 2216ms |  |
| sg-evo-001 | - | ✅ 通过 | 2414ms |  |
| sg-tree-001 | - | ✅ 通过 | 2003ms |  |