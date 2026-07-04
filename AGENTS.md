# AGENTS.md — SupplyChain Cortex Agent 行为规则（棘轮机制）

> 本文件是 Agent 的行为宪法。每条规则都溯源到一次真实失败（A/B 测试、基准测试、生产 incident）。
> 模型变强到不再犯某错时，删除对应规则。新增失败时，追加规则。棘轮，不脑暴。

## 工具选择规则

### RULE-001: 级联风险综合评估必须用 query_cascade_risk
- **溯源**: A/B 测试 v6，intel-cascade-001/002/003 在 Baseline 中 WRONG_TOOL（选了 query_weather/query_exchange_rates）
- **规则**: 当用户请求"级联风险""风险传播""综合风险""连锁影响"时，必须调用 `query_cascade_risk`，不要调用单一因子查询（weather/exchange_rates/port_congestion）
- **例外**: 用户明确只要单一因子当前状态时，用对应单因子工具

### RULE-002: 库存转移操作必须用 create_transfer
- **溯源**: A/B 测试 v6，op-transfer-001 在 Baseline 中 WRONG_TOOL（选了 adjust_inventory）
- **规则**: 当用户请求"转移""调拨""从A仓转到B仓"时，必须调用 `create_transfer`，不要调用 `adjust_inventory`
- **区分**: adjust_inventory 是单仓库数量增减；create_transfer 是两仓库间转移

### RULE-003: 决策推理必须用 query_decision_graph
- **溯源**: 基准测试，模型混淆 query_dashboard 和 query_decision_graph
- **规则**: 当用户请求"决策图""因果分析""反事实""推理链"时，必须调用 `query_decision_graph`
- **区分**: query_dashboard 是原始指标概览；query_analytics 是洞察结论；query_decision_graph 是行动建议

### RULE-004: 综合分析必须用 query_analytics
- **溯源**: 基准测试，模型用 query_dashboard 回答分析请求
- **规则**: 当用户请求"分析报告""综合评估""趋势分析""深度分析"时，必须调用 `query_analytics`
- **区分**: query_dashboard 返回原始指标；query_analytics 返回洞察+建议

### RULE-005: 执行工作流必须用 execute_workflow
- **溯源**: 基准测试，模型混淆 execute_workflow 和 query_decision_graph
- **规则**: 当用户请求"执行工作流""自动化流程""批量操作"时，必须调用 `execute_workflow`

### RULE-006: 供应商业务档案 vs 网络图谱
- **溯源**: 工具重复性分析，15 个供应商工具跨 4 层
- **规则**: 查评分/交货期/状态 → `query_suppliers`（DB）；查关系网络/依赖/层级 → `query_supplier_graph`（Neo4j）

### RULE-007: 供应商地理分布 vs 地理风险
- **溯源**: 工具重复性分析
- **规则**: 查按地区分组统计 → `query_supplier_location`（DB）；查制造带风险聚类 → `query_supplier_geo_risk`（Neo4j）

## 参数规范规则

### RULE-008: query_inventory 的 action 参数必须匹配意图
- **溯源**: 基准测试 PARAM_MISMATCH
- **规则**: overview=概览, list=列表, forecast=预测, risk=风险, detail=详情, slow_moving=呆滞, reorder=补货建议
- **禁止**: 用户要"呆滞库存"时传 action=overview

### RULE-009: query_cost 的 action 参数必须匹配意图
- **溯源**: 基准测试 PARAM_MISMATCH
- **规则**: overview=概览, list=列表, detail=详情, benchmark=基准对比, optimization=优化建议, trend=趋势

### RULE-010: JSON 数组参数必须用数组类型
- **溯源**: 基准测试，模型传字符串而非数组
- **规则**: 当参数类型为 `string[]` 时，必须传 JSON 数组 `["a","b"]`，不要传逗号分隔字符串 `"a,b"`

## 输出规范规则

### RULE-011: 必须调用工具，不要只输出文本
- **溯源**: A/B 测试 v6 策略 B，16 个 NO_TOOL_CALL 失败
- **规则**: 当有可用工具时，必须至少调用一个工具。不要只输出"我建议您..."而不调用工具

### RULE-012: 工具调用失败时不要假装成功
- **溯源**: Harness Engineering 最佳实践
- **规则**: 若工具返回错误，必须如实报告错误，不要编造结果

## 确认规则

### RULE-013: 写操作需要用户确认
- **溯源**: autonomy-policy.ts 三级自治
- **规则**: create_reorder / batch_create_reorder / adjust_inventory / create_transfer / update_shipment_status / update_cost_record / create_supplier / update_supplier / update_supplier_status / resolve_alert / create_note 均为写操作，执行前需确认
