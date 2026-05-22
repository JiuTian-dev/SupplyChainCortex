---
name: logistics-port-monitor
description: 物流港口监控 SOP。用户说"物流状态"、"货运"、"港口"、"ETA"、"物流延迟"、"logistics"、"shipment" 时触发。检测延迟件、港口拥堵、天气风险，建议替代路线。
---

# Skill: 物流港口监控

## Triggers
- 物流状态
- 货运
- 港口
- ETA
- 物流延迟
- logistics
- shipment
- 货运追踪
- 海运
- 到货时间
- 货在哪

## Required MCP Tools
- `query_logistics`: 货运列表、统计、单号追踪、物流风险
- `query_port_congestion`: 全球10港口拥堵状况
- `query_weather`: 港口天气和海况（marine航线评估）
- `query_cascade_risk`: 港口拥堵级联风险
- `web_search`: 搜索最新港口新闻和替代路线
- `generate_chart`: 延迟分布和趋势可视化

## Procedure
### Step 1: 全局物流统计
Call `query_logistics(action='stats')` with no params.

What to look for:
- 在途/待处理/已交付/延迟/异常件数
- 准时率（行业参考：95%+）
- 平均运输天数
- 各承运商表现

### Step 2: 货运列表（识别异常）
Call `query_logistics(action='list')` with no filters, or filter by `status='delayed'` or `status='exception'`.

What to look for:
- 延迟件和异常件清单
- 延迟天数分布
- 常见延迟节点（清关/港口/内陆运输）
- 涉及的主要承运商

### Step 3: 港口拥堵
Call `query_port_congestion()` with no params.

What to look for:
- 全球GSCPI压力指数
- 各港口拥堵等级、等待天数
- 受影响航线
- 趋势（恶化/改善）

### Step 4: 天气风险评估
Call `query_weather(action='marine')` with relevant route coordinates:
- For China→US West Coast: fromLat=22, fromLon=114, toLat=34, toLon=-118
- For China→EU: fromLat=22, fromLon=114, toLat=52, toLon=4
- Adjust based on actual routes in shipment list

What to look for:
- 航线海况（波高/风速）
- 恶劣天气预警
- 可能导致的延误天数估计

### Step 5: 异常件深度追踪
For 3-5 most delayed/exceptional shipments, call `query_logistics(action='track', trackingNumber=X)`.

What to look for:
- 当前位置
- 状态更新时间线
- 预计到达时间（原ETA vs 新ETA）
- 延迟原因

### Step 6: 级联风险
If port congestion is significant (wait times > 5 days), call `query_cascade_risk(scenario='port_congestion', sourcePort=<port_name>)`.

What to look for:
- 受影响产品/订单
- 预估收入影响
- 传播路径

### Step 7: 合成结论
Synthesize findings into delay list + congestion warning + alternative route suggestions.

## Validation
- [ ] 延迟原因有分类（港口/清关/承运商/天气）
- [ ] 港口拥堵数据标注来源和时效
- [ ] 建议的替代路线有可行性说明
- [ ] ETA变动标注新旧对比
- [ ] 天气数据标注预警级别

## Output Format
## 物流港口监控报告
### 一、核心发现
- 总体准时率：[X]%，延迟件 [N] 件，异常件 [M] 件
- 港口拥堵：[高/中/低]，最拥堵港口：[港口名]（等待 [X] 天）
- 天气风险：[有/无]恶劣天气预警

### 二、延迟件清单
| 追踪号 | 产品 | 承运商 | 状态 | 延迟天数 | 原因 | 新ETA |
|--------|------|--------|------|----------|------|-------|

### 三、港口状况
1. **全球港口拥堵排行**（TOP5）
2. **受影响航线**
3. **趋势判断**

### 四、建议
1. **紧急**（本周）：[延迟件的应急方案]
2. **短期**（本月）：[替代港口/航线建议]
3. **长期**：[承运商策略调整]

## Notes
- query_logistics(action='stats') 是汇总统计，query_logistics(action='list') 返回明细
- 港口天气影响需区分季节性（台风季6-10月）和突发性
- 如果 query_port_congestion 或 query_weather 不可用，使用 web_search 搜索最新港口/天气信息
- 延迟件超过10件时，按延迟天数降序排列，只追踪前5件
- SCFIS运价趋势可与港口拥堵结合分析（拥堵→运价上涨）
