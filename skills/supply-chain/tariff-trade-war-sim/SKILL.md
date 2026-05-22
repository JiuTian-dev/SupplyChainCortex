---
name: tariff-trade-war-sim
description: 关税贸易战情景推演 SOP。用户说"关税"、"贸易战"、"关税影响"、"301关税"、"CBAM"、"碳关税"、"tariff"、"trade war" 时触发。模拟乐观/基准/悲观三种情景的影响。
---

# Skill: 关税贸易战情景推演

## Triggers
- 关税
- 贸易战
- 关税影响
- 301关税
- CBAM
- 碳关税
- tariff
- trade war
- 关税上涨
- 关税模拟
- 对等关税
- 美国关税

## Required MCP Tools
- `query_tariff`: 关税概览、计算、情景模拟
- `query_carbon_price`: EU碳价+CBAM成本估算
- `query_commodities`: 大宗商品价格（贸易战冲击铜钢铝）
- `query_financial_sim`: What-If财务模拟器
- `run_sandbox`: 多Agent沙盒模拟（trade_war场景）
- `web_search`: 搜索最新关税政策和贸易战新闻
- `query_exchange_rates`: 汇率（贸易战影响汇率波动）
- `generate_chart`: 情景对比可视化

## Procedure
### Step 1: 当前关税概览
Call `query_tariff(action='overview')` with no params.

What to look for:
- 各品类当前关税率
- 301关税覆盖范围
- 是否有豁免
- 涉及的主要HS编码

### Step 2: 贸易战关税模拟
Call `query_tariff(action='simulate', scenario='US Section 301 escalation')`.

What to look for:
- 模拟后的关税率
- 受影响SKU数量和金额
- 与当前关税的对比
- 豁免到期时间线

### Step 3: CBAM碳关税评估
Call `query_carbon_price()` with no params.

What to look for:
- EU碳价（EUR/吨 CO2）
- 小家电CBAM成本举例
- 2026年付费比例（10%）
- 趋势预测

### Step 4: 大宗商品冲击
Call `query_commodities()` with no params.

What to look for:
- 铜、铝、钢价格变化（贸易战通常推高）
- 原材料成本传导压力
- 与历史高位对比

### Step 5: 财务情景模拟
Call `query_financial_sim(action='full')` for a representative product. Set `tariff_rate_pct` to current and elevated rates to compare.

What to look for:
- 当前关税下的毛利率
- 加征X%后的毛利率变化
- 盈亏平衡曲线
- 12个月P&L对比

### Step 6: 多Agent沙盒仿真
Call `run_sandbox(scenario='trade_war', rounds=100)`.

What to look for:
- 4个角色Agent的交互结果
- 系统韧性指标
- 库存/物流/财务影响
- 涌现行为

### Step 7: 合成结论
Synthesize three scenarios (optimistic/baseline/pessimistic) with specific recommendations.

## Validation
- [ ] 三种情景有明确假设条件
- [ ] 财务影响有量化数据（$和%）
- [ ] 区分短期冲击和长期结构性影响
- [ ] 标注数据时间戳和来源
- [ ] CBAM部分说明覆盖范围（目前仅EU）

## Output Format
## 关税贸易战情景推演报告
### 一、核心发现
- 当前加权平均关税率：[X]%，301覆盖 [N] 个SKU
- CBAM影响：[高/中/低]，年成本增加约 [$Y]
- 贸易战最坏情景毛利率下降 [Z] 个百分点

### 二、三种情景
| 情景 | 假设 | 关税率 | 毛利影响 | 发生概率 |
|------|------|--------|----------|----------|
| 乐观 | [假设] | [X]% | [Y]% | [P]% |
| 基准 | [假设] | [X]% | [Y]% | [P]% |
| 悲观 | [假设] | [X]% | [Y]% | [P]% |

### 三、详细分析
1. **关税现状**（品类级表格）
2. **CBAM碳关税**（产品级举例）
3. **大宗商品**（铜铝钢趋势）
4. **沙盒仿真**（Agent行为摘要）

### 四、建议
1. **立即行动**：加快出货/申请豁免/调整HS编码归类
2. **短期策略**（1-3月）：墨西哥转口/海外仓提前备货
3. **长期策略**（3月+）：供应链区域化/多元采购

## Notes
- query_tariff(action='simulate') 的可用情景包括: 'US Section 301 escalation', 'EU CBAM full enforcement', 'RCEP tariff elimination', 'Mexico transshipment route', 'De minimis elimination'
- 碳价数据非交易时间不可用，标注数据日期
- run_sandbox(scenario='trade_war') 耗时约10-15秒（100轮仿真），请耐心等待
- web_search 可用于搜索最新关税政策变化（如 Section 301 四年期审查结果）
- 财务模拟需选择一个有代表性的典型SKU，说明选择的理由
- 情景概率标注为估计值，非精确预测
