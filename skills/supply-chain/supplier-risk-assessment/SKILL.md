---
name: supplier-risk-assessment
description: 供应商风险评估 SOP。用户说"供应商风险"、"供应商评估"、"供应商分析"、"supplier risk"、"评估供应商" 时触发。从绩效、趋势、地理、级联风险四维评估。
---

# Skill: 供应商风险评估

## Triggers
- 供应商风险
- 供应商评估
- 供应商分析
- supplier risk
- 评估供应商
- 供应商绩效
- 供货风险
- 供应商品质

## Required MCP Tools
- `query_suppliers`: 全量供应商列表、绩效数据
- `query_supplier_trend`: 供应商月度绩效趋势
- `query_supplier_location`: 供应商地理分布
- `calculate_supplier_scoring`: 供应商综合评分（质量/交付/成本/服务/柔性）
- `query_cascade_risk`: 级联风险传播模拟
- `generate_chart`: 绩效趋势和风险矩阵可视化

## Procedure
### Step 1: 供应商全景
Call `query_suppliers(action='list')` with no additional filters.

What to look for:
- 总供应商数
- 按品类分布（电子元器件/塑料五金件/成品代工/物流运输/清关服务/包装材料）
- 按状态分布（active/suspended/inactive）
- 各地区分布概览

### Step 2: 绩效数据
Call `query_suppliers(action='performance')` with no params.

What to look for:
- 准时交货率（行业参考：90%+）
- 质量评分
- 平均交期天数
- 各供应商评级

### Step 3: 趋势分析（恶化检测）
Call `query_supplier_trend(months=6)` with no supplierCode to get all suppliers.

What to look for:
- 准时率连续3个月下降的供应商 → 🚩 红色预警
- 准时率波动大的供应商（标准差>15%）
- 平均延误天数趋势
- 货运量变化（可能预示业务调整）

### Step 4: 地理集中风险
Call `query_supplier_location()` with no filters.

What to look for:
- 各区域供应商数量和占比
- 如果某区域占比 > 40% → 区域集中风险
- 海外供应商的国别分布
- 单一地区的依赖风险（如全部在华南）

### Step 5: 综合评分
Call `calculate_supplier_scoring` with `suppliers` param containing rating, delivery, cost, service, flexibility data from previous steps.

What to look for:
- 综合评分排名
- 评级分布（A/B/C/D）
- 各供应商优劣势
- 改进建议

### Step 6: 级联风险模拟
For the highest-risk suppliers (rating C/D or declining trend), call `query_cascade_risk(scenario='supplier_failure')`.

What to look for:
- 受影响产品排名
- 传播路径（供应商→港口→仓库→产品→客户）
- 预估收入影响（$）
- 建议的缓解措施

### Step 7: 合成结论
Synthesize findings into risk levels and actionable recommendations.

## Validation
- [ ] 每个风险等级有明确的量化标准
- [ ] 地理集中风险有具体阈值说明
- [ ] 级联风险数据标注情景假设
- [ ] 区分历史数据和预测数据
- [ ] 绩效趋势有可视化支撑

## Output Format
## 供应商风险评估报告
### 一、核心发现
- 高风险供应商 [N] 家，占总供应商 [X]%
- 区域集中度：[区域名]占比[Y]%（[安全/临界/危险]）
- 级联风险最高影响：[Z]$ 收入

### 二、详细评估
1. **供应商全景**（表格：总数/品类/状态分布）
2. **绩效排名**（TOP5+末5）
3. **趋势恶化预警**（连续下降供应商清单）
4. **地理分布**（饼图+集中度分析）
5. **综合评分矩阵**（评分气泡图）

### 三、级联风险
- 情景：某高风险供应商断供的影响
- 受影响产品TOP5
- 建议替代方案

### 四、建议
#### 高风险（立即行动）
- [供应商名]：[具体行动]
#### 中风险（本月内）
- [供应商名]：[具体行动]
#### 低风险（持续监控）
- [清单]

## Notes
- query_supplier_trend 的数据是月度聚合，当月数据可能不完整
- 如果供应商数量 > 20，只深入分析评分最低的5家和趋势恶化的3家
- query_cascade_risk(scenario='supplier_failure') 需要选择一个具体供应商作为假设来源
- 地理集中风险：单一区域占比>40%为警戒线，>60%为危险线
- 如果趋势数据不足（供应商合作未满3个月），在报告中注明"数据不足以判断趋势"
