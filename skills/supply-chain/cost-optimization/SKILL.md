---
name: cost-optimization
description: 成本优化分析 SOP。用户说"成本优化"、"降低成本"、"到岸成本"、"毛利分析"、"怎么降本"、"cost optimization"、"margin" 时触发。从原材料/汇率/运费/关税四维分析降本空间。
---

# Skill: 成本优化分析

## Triggers
- 成本优化
- 降低成本
- 到岸成本
- 毛利分析
- 怎么降本
- cost optimization
- margin
- 毛利率
- 成本构成
- 降本方案

## Required MCP Tools
- `query_cost`: 全局成本概览、单品详情、趋势、优化建议
- `query_commodities`: 大宗商品价格（铜铝钢塑）
- `query_exchange_rates`: 人民币汇率
- `query_scfis`: SCFIS欧洲航线运价指数
- `query_tariff`: 关税概览
- `calculate_total_cost`: 总供应链成本模型
- `calculate_break_even`: 盈亏平衡分析
- `query_financial_sim`: What-If财务模拟器
- `generate_chart`: 可视化成本构成

## Procedure
### Step 1: 全局成本概览
Call `query_cost(action='overview')` with optional `category` filter.

What to look for:
- 平均毛利率（参考线：小家电30-40%）
- 低毛利品数量（毛利率<20%）
- 各品类毛利分布
- 成本构成比例

### Step 2: 大宗商品价格压力
Call `query_commodities()` with no params.

What to look for:
- 铜、铝、螺纹钢、PP、PE、PVC 价格
- 环比变动% — 判断原材料成本压力
- 重点关注铜（电机、线材）和塑料（外壳）

### Step 3: 汇率影响评估
Call `query_exchange_rates(action='latest')` with `base='CNY'`.

What to look for:
- CNY/USD, CNY/EUR, CNY/JPY 汇率
- 人民币强弱对出口成本的影响
- 人民币贬值→到岸成本降低（以人民币计价的采购成本不变，美元售价不变则毛利上升）

### Step 4: 物流成本趋势
Call `query_scfis()` with no params.

What to look for:
- SCFIS指数及变动%
- 估算的海运费（USD/container）
- 趋势判断：运价上行/下行/平稳

### Step 5: 关税压力
Call `query_tariff(action='overview')` with no params.

What to look for:
- 各品类关税税率
- 高关税品类（>20%）识别
- 贸易协定优惠情况

### Step 6: 低毛利SKU深度分析
Pick the 3 lowest-margin SKUs from Step 1 results. For each, call `query_cost(action='detail', sku=X)`.

What to look for:
- 成本构成明细：原材料/人工/物流/关税/平台费
- 各成本项占比
- 与品类基准对比

### Step 7: 到岸成本模型（典型SKU）
Pick one representative SKU. Call `calculate_total_cost` with params:
- `annual_demand`, `order_cost`, `holding_cost_per_unit`, `unit_cost`
- Optional: `stockout_cost_per_unit`, `service_level`, `demand_std`, `lead_time_days`

What to look for:
- 总成本构成（EOQ+持有+采购+缺货）
- 各成本项百分比
- 优化空间

### Step 8: 盈亏平衡分析
Call `calculate_break_even` with params from the same SKU:
- `fixed_costs`, `unit_price`, `unit_variable_cost`
- Set `scenarios` with what-if params for price changes and cost reductions

What to look for:
- BEP销量和收入
- 安全边际
- 经营杠杆
- What-if场景对比

### Step 9: 合成结论
Synthesize findings into a four-dimension cost reduction plan.

## Validation
- [ ] 每个降本建议有数据支撑
- [ ] 区分可控成本（采购/物流）和不可控成本（汇率/大宗）
- [ ] 量化建议的预期降本幅度
- [ ] 标注数据时效性
- [ ] 盈亏平衡分析需注明假设

## Output Format
## 成本优化分析报告
### 一、核心发现
- 当前加权平均毛利率：[X%]，比基准 [高/低] [Y%]
- 降本空间估计：[Z%]，主要来自 [维度]
- 紧急关注：[低毛利SKU数] 个SKU毛利率<20%

### 二、四维降本分析
1. **原材料**：铜[涨/跌]X%、铝[涨/跌]Y%，影响[低/中/高]
2. **汇率**：人民币[升/贬]值X%，影响[正面/负面]
3. **运费**：SCFIS [涨/跌]至 [X]，趋势 [上行/下行]
4. **关税**：高关税品类：[列表]，机会：[贸易协定]

### 三、SKU级深度分析
- 最低毛利TOP3对比（表格）
- 典型SKU到岸成本构成（图表）
- 盈亏平衡分析（图表）

### 四、建议（按优先级）
1. **快速见效**（1个月内）：[具体行动+预期节省]
2. **中期优化**（1-3月）：[具体行动+预期节省]
3. **战略调整**（3月+）：[具体行动]

## Notes
- 大宗商品价格和汇率是实时数据，每次调用结果不同
- SCFIS数据非交易时间不可用，需提示用户
- 如果 query_commodities 或 query_scfis 不可用，使用 web_search 搜索最新数据作为备选
- 盈亏平衡分析中的固定成本可从成本记录中推算
- 不要混淆 query_cost (服务层查询) 和 calculate_total_cost (供应链数学模型)
