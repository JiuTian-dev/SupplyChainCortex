---
name: procurement-planning
description: 采购计划生成 SOP。用户说"采购计划"、"补货计划"、"下单"、"采购"、"procurement"、"reorder plan" 时触发。自动计算最优订货量并生成补货单。
---

# Skill: 采购计划生成

## Triggers
- 采购计划
- 补货计划
- 下单
- 采购
- procurement
- reorder plan
- 补货
- 订货
- 采购建议
- 什么该补货

## Required MCP Tools
- `query_inventory`: 需补货品清单
- `query_procurement`: 当前采购计划、汇总统计
- `calculate_eoq`: 经济订货批量
- `calculate_reorder_point`: 再订货点
- `query_suppliers`: 供应商匹配
- `calculate_drp`: 分销需求计划（多周期多级补货）
- `batch_create_reorder`: 批量创建补货单
- `create_reorder`: 单个创建补货单
- `calculate_safety_stock`: 安全库存计算

## Procedure
### Step 1: 获取需补货品清单
Call `query_inventory(action='reorder')` with no additional params.

What to look for:
- 建议补货的SKU列表
- 每项的推荐补货量
- 当前库存量
- 安全库存水平
- 紧急程度

### Step 2: 查看当前采购计划
Call `query_procurement(action='plan')` with no params.

What to look for:
- 已在计划中的订单
- 待处理数量
- 按优先级排序
- 避免重复下单

### Step 3: 计算最优订货量（逐个SKU）
For each SKU needing replenishment, call:
- `calculate_eoq` with params: `annual_demand`, `order_cost`, `holding_cost_per_unit`
- `calculate_reorder_point` with params: `avg_daily_demand`, `demand_std`, `lead_time_days`, `service_level=0.95`
- `calculate_safety_stock` with params: `service_level=0.95`, `demand_std`, `lead_time_days`, `avg_daily_demand`

What to look for:
- EOQ经济订货批量
- ROP再订货点
- 安全库存量
- 取 EOQ 和 ROP 交叉验证

### Step 4: 匹配供应商
Call `query_suppliers(action='list')` with optional `category` filter matching the product's category.

What to look for:
- 合适的供应商列表
- 供应商产能
- 交期（影响安全库存计算）

### Step 5: 分销需求计划
For multi-warehouse scenarios, call `calculate_drp` with params:
- `initial_inventory`, `scheduled_receipts`, `demand_schedule`, `lead_time_days`, `order_quantity`, `safety_stock`

What to look for:
- 各期净需求
- 计划订单接收和下达
- 多级补货时间线

### Step 6: 批量创建补货单
Call `batch_create_reorder(items=[...])` with the calculated items:
- Each item: `{ sku, productName, quantity, warehouse, priority }`
- Set priority based on stockStatus: 'critical'→'紧急', 'warning'→'常规'

What to look for:
- 创建成功的订单数
- 失败的订单及原因
- 订单ID列表

### Step 7: 汇总确认
Call `query_procurement(action='summary')` with no params.

What to look for:
- 补货后总订单数
- 按优先级/状态分布
- 预估总成本
- 确认所有补货已创建

### Step 8: 合成结论
Synthesize the complete procurement plan.

## Validation
- [ ] 每个SKU的补货量有EOQ/ROP计算支撑
- [ ] 避免重复下单（对比现有采购计划）
- [ ] 紧急品标记为"紧急"优先级
- [ ] 确认仓库可用容量（调用 query_warehouse_capacity）
- [ ] 预估总成本标注
- [ ] 提供供应商选择建议

## Output Format
## 采购计划报告
### 一、计划摘要
- 需补货SKU：[N] 个
- 创建补货单：[N] 个（成功 [X]，失败 [Y]）
- 预估总成本：[￥X]
- 紧急采购：[N] 个（优先处理）

### 二、补货明细
| SKU | 产品名 | 计算EOQ | 计算ROP | 建议补货量 | 供应商 | 优先级 | 目标仓库 |
|-----|--------|---------|---------|------------|--------|--------|----------|

### 三、成本估算
- 各SKU单位到岸成本
- 总预估成本明细
- 预算对比（如有）

### 四、时间线
- DRP分销需求计划时间线
- 各SKU预计到货日期

### 五、已创建补货单
- 订单ID列表
- 状态：pending（等待审批）

## Notes
- 优先处理 stockStatus='critical' 的SKU（设置为"紧急"优先级）
- EOQ计算需要年需求量，可从销售数据推算（月销量×12）
- 如果无法获取到岸成本，使用估算价格，在报告中注明"估算"
- 单SKU超过补货量上限（如10000件）时，拆分为多个批次
- 补货单创建后状态为 pending，需要人工审批
- 如果 calculate_drp 因参数不足无法运行，跳过该步骤，使用 EOQ+ROP 两段式
