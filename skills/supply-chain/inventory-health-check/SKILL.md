---
name: inventory-health-check
description: 库存健康检查 SOP。用户说"库存健康"、"缺货风险"、"库存周转"、"SKU健康"、"库存情况"、"inventory health" 时触发。检测缺货、滞销、ABC分类，生成三级建议。
---

# Skill: 库存健康检查

## Triggers
- 库存健康
- 库存情况
- 缺货风险
- 库存周转
- SKU健康
- inventory health
- 库存状态
- 库存分析
- 库存概览

## Required MCP Tools
- `query_inventory`: 全局库存概览、滞销品、风险分析、单品详情、补货建议
- `classify_abc_xyz`: ABC-XYZ联合分类（按收入累计占比+需求变异系数）
- `calculate_inventory_kpi`: 库存KPI仪表板（周转率、供货天数、GMROI、持有成本率）
- `generate_chart`: 可视化库存分布和趋势

## Procedure
### Step 1: 全局库存概览
Call `query_inventory(action='overview')` with no additional params.

What to look for:
- 总SKU数、总库存量
- 各仓库分布
- 库存状态分布：healthy / warning / critical
- 低库存告警数、缺货风险品类

### Step 2: ABC-XYZ分类
Call `classify_abc_xyz` with `records` parameter containing sku-level revenue and demand data from Step 1.

What to look for:
- A类（收入累计80%）：重点SKU，需精细化管理
- B类（收入累计80-95%）：常规管理
- C类（收入累计95-100%）：简化管理
- X/Y/Z 类：按需求波动分，X稳定/Z高度波动

### Step 3: 滞销品分析
Call `query_inventory(action='slow_moving')` with `days=90`.

What to look for:
- 周转天数超过90天的SKU清单
- 各品类滞销占比
- 滞销库存金额估计
- 清仓/促销建议

### Step 4: 风险品分析
Call `query_inventory(action='risk')` without additional filters.

What to look for:
- 低于安全库存的SKU（stockStatus='warning'）
- 严重缺货的SKU（stockStatus='critical'）
- 推荐补货量

### Step 5: KPI计算
Call `calculate_inventory_kpi` with params:
- `annual_cogs`, `avg_inventory`, `annual_demand`, `orders_filled`, `total_orders`, `lead_time_days`, `avg_daily_demand`

What to look for:
- 库存周转率（行业参考：小家电4-8次/年）
- 供货天数/周数
- GMROI（毛利存货回报率）
- 持有成本率
- 满足率

### Step 6: 单品深度分析（危机品）
If any SKU has `stockStatus='critical'`, call `query_inventory(action='detail', sku=X)` for each critical SKU.

What to look for:
- 当前库存量 vs 安全库存
- 最近销售速度
- 是否有在途补货
- 上次到货日期

### Step 7: 合成结论
Synthesize findings into a prioritized action plan.

## Validation
- [ ] 每个数字有来源标签（哪个工具调用）
- [ ] 置信度标注（数据是否完整）
- [ ] 结论在前，数据在后
- [ ] ABC分类需说明阈值设置
- [ ] 所有建议按优先级排序

## Output Format
## 库存健康检查报告
### 一、核心发现
- 总体健康评分：[高/中/低]，关键指标摘要
- 需立即关注：critical SKU数量 + 滞销金额

### 二、详细数据
1. **ABC分类**
   - A类SKU数量及占比
   - B类SKU数量及占比
   - C类SKU数量及占比
2. **滞销品清单**（前5 SKU + 金额）
3. **缺货风险品**（warning + critical，含当前量/安全库存）
4. **KPI仪表板**（表格）

### 三、建议（按优先级）
- 🔴 紧急（本周）：危机品补货建议
- 🟡 短期（本月）：滞销品清仓/促销方案
- 🟢 中期（本季）：ABC分类管理策略调整

## Notes
- 首次运行默认全局查询，已有数据后可缩小范围到特定品类/仓库
- 如果 query_inventory(action='overview') 返回数据为空，提示"库存数据暂不可用"
- ABC分类需传递实际数据（收入+需求），不可跳过 Step 1 直接调用
- `calculate_inventory_kpi` 数据可从 dashboard 和 cost 数据获取，如果缺参数则跳过
- 危机品超过3个时，按缺货严重程度排序，只深入分析前3
