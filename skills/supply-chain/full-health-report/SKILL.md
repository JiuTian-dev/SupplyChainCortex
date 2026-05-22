---
name: full-health-report
description: 全健康报告生成 SOP。用户说"全健康报告"、"综合报告"、"供应链体检"、"整体情况"、"full health"、"完整报告" 时触发。从库存/成本/供应商/物流/风险5个维度+图表生成完整报告。
---

# Skill: 全健康报告

## Triggers
- 全健康报告
- 综合报告
- 供应链体检
- 整体情况
- full health
- 完整报告
- 全面分析
- 供应链总览
- 全局总览

## Required MCP Tools
- `query_dashboard`: 仪表盘概览、核心指标、紧急预警
- `query_analytics`: 供应商绩效分析、成本优化分析、库存预测分析
- `query_risk`: 风险仪表盘
- `query_cascade_risk`: 自动检测级联风险
- `generate_report`: 一键生成多图表报告（full_health类型）
- `query_inventory`: 库存概览
- `query_logistics`: 物流统计
- `query_suppliers`: 供应商列表与绩效

## Procedure
### Step 1: 仪表盘概览
Call `query_dashboard(action='summary')` with no params.

What to look for:
- 总体健康评分
- 关键指标：库存、销售、成本、物流
- 主要预警
- 数据时效性

### Step 2: 核心指标
Call `query_dashboard(action='metrics')` with no params.

What to look for:
- 库存周转天数
- 订单满足率
- 供应商准时率
- 毛利率趋势
- 对比基准值

### Step 3: 供应商绩效
Call `query_analytics(action='supplier_performance')` with no params.

What to look for:
- 供应商绩效总评
- 各品类供应商表现
- 优化建议

### Step 4: 成本趋势
Call `query_analytics(action='cost_optimization')` with no params.

What to look for:
- 整体成本趋势
- 降本空间
- 低毛利品类分布

### Step 5: 库存健康
Call `query_analytics(action='inventory_forecast')` with `forecastDays=30`.

What to look for:
- 库存预测
- 缺货风险
- 补货建议

### Step 6: 风险仪表盘
Call `query_risk(action='dashboard')` with no params.

What to look for:
- 整体风险评分
- 风险热区
- 主要风险类型

### Step 7: 级联风险检测
Call `query_cascade_risk(scenario='auto')` to auto-detect any cascade risks.

What to look for:
- 自动检测到的风险事件
- 受影响产品
- 预估影响金额

### Step 8: 紧急预警
Call `query_dashboard(action='alerts')` with no params.

What to look for:
- 紧急预警列表
- 严重级别
- 影响范围

### Step 9: 生成图表报告
Call `generate_report(type='full_health')` with no params.

What to look for:
- 自动生成的多图表报告
- 每张图表的标题和URL
- 嵌入到回复中

### Step 10: 合成结论
Synthesize all 5 dimensions into a cohesive report.

## Validation
- [ ] 5个维度各至少有一个数据来源
- [ ] 图表报告已嵌入（图片URL）
- [ ] 预警按严重级别排序
- [ ] 有总体健康评分/结论
- [ ] 标注数据的时间范围

## Output Format
## 供应链全健康报告
**报告日期**: [日期] | **数据时间范围**: [起止]

### 总体健康评分：[A/B/C/D]（[X]/100）
- 库存：[X]/100 | 成本：[X]/100 | 供应商：[X]/100 | 物流：[X]/100 | 风险：[X]/100

### 一、库存维度
- 总SKU数、库存量、周转天数
- ABC分类
- 缺货/滞销率
- [图表]

### 二、成本维度
- 加权平均毛利率
- 成本构成比例
- 降本空间
- [图表]

### 三、供应商维度
- 活跃供应商数
- 准时率/质量评分
- 绩效排名
- [图表]

### 四、物流维度
- 在途/延迟/已完成
- 准时率
- 港口状况
- [图表]

### 五、风险维度
- 风险评分
- 主要风险事件
- 级联风险
- 预警清单

### 六、综合建议
- 🔴 紧急：[N] 条
- 🟡 短期：[N] 条
- 🟢 长期：[N] 条

## Notes
- 本报告是大而全的综合报告，通常需要8-10个工具调用
- 如果某个维度的数据调取失败，在报告中注明"数据暂不可用"并跳过该维度
- generate_report(type='full_health') 自动生成图表，无需单独调用 generate_chart
- 级联风险自动检测可能为"未发现风险"，正常显示即可
- 报告较长时，开头给出"30秒速览"摘要
- 首次生成全报告后，后续可只更新部分维度
