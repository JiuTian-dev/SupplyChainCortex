---
name: compliance-audit
description: 合规审计 SOP。用户说"合规"、"认证"、"召回"、"CPSC"、"CE"、"RoHS"、"REACH"、"compliance"、"audit" 时触发。检查认证缺口、召回风险、CBAM影响、系统数据一致性。
---

# Skill: 合规审计

## Triggers
- 合规
- 认证
- 召回
- CPSC
- CE
- RoHS
- REACH
- compliance
- audit
- 合规检查
- 产品认证
- 合规风险
- FCC
- UL
- ETL
- FDA

## Required MCP Tools
- `query_compliance_check`: 产品合规检查（按产品+市场→认证清单）
- `query_cpsc_recalls`: CPSC召回查询（中国产小家电）
- `query_recall_risk`: 召回风险预警（模式匹配）
- `query_carbon_price`: EU碳价+CBAM合规成本
- `query_tariff`: HS编码关税计算
- `query_coherence_audit`: 决策一致性审计（跨系统矛盾扫描）
- `web_search`: 搜索最新法规变化
- `query_suppliers`: 供应商信息（认证相关）

## Procedure
### Step 1: 合规检查（产品×市场）
Call `query_compliance_check` with params:
- `product_name`: 产品名称（如"智能咖啡机"）
- `market`: 目标市场（US / EU / UK / JP）
- If multi-market, set `action='multi'`

What to look for:
- 强制性认证清单及状态
- 每项认证的预估费用和时间
- 已取得 vs 缺失的认证
- 认证缺口

### Step 2: CPSC召回查询
Call `query_cpsc_recalls()` with no params.

What to look for:
- 近期小家电相关召回
- 召回原因分类（火灾/电击/割伤/窒息）
- 涉及的产品品类
- 与中国产相关的模式

### Step 3: 召回风险预警
Call `query_recall_risk()` with no params, or filter by specific SKU with `sku=...`.

What to look for:
- 各SKU的召回风险评分
- 风险等级（高/中/低）
- 匹配的CPSC召回模式
- 建议的预防性修复措施
- 修复成本估算

### Step 4: CBAM合规成本
Call `query_carbon_price()` with no params.

What to look for:
- EU碳价
- 对出口欧盟的CBAM成本影响
- 碳排放数据需求（2026年起需报告）

### Step 5: HS编码关税
Call `query_tariff(action='compute')` with `category`, `countryCode`, `sellingPrice`.

What to look for:
- 关税率
- HS编码归类
- 是否有贸易协定优惠
- 与成本记录中的关税对比

### Step 6: 决策一致性审计
Call `query_coherence_audit()` with no params.

What to look for:
- 审计总评分
- 矛盾发现清单：
  - HS编码vs关税不匹配
  - 安全库存vs实际交货期脱节
  - 认证缺失/过期
  - 产地vs关税率冲突
  - 售价无法覆盖成本
- 修复建议

### Step 7: 合成结论
Synthesize findings into a compliance gap list + recall risk level + CBAM impact + discrepancy findings.

## Validation
- [ ] 认证缺口清单明确标注已取得/缺失
- [ ] 召回风险等级有CPSC数据支撑
- [ ] CBAM影响区分2026年过渡期和2027年正式期
- [ ] 一致性审计问题按严重程度排序
- [ ] 所有建议量化（费用/时间）

## Output Format
## 合规审计报告
### 一、核心发现
- 认证缺口：[N] 项缺失，预估补齐费用 [$X]，时间 [Y] 周
- 召回风险：[高/中/低]，高危SKU [N] 个
- CBAM影响：[有/无]，年成本约 [$Z]
- 数据矛盾：[N] 处，最严重：[描述]

### 二、详细审计
1. **认证状态**
   | 产品 | 市场 | 已取得 | 缺失 | 费用 | 周期 |
   |------|------|--------|------|------|------|
2. **召回风险**
   - CPSC最新召回列表
   - 本产品召回风险评分
   - 预防建议
3. **CBAM合规**
   - 碳价趋势
   - 产品碳足迹估算
   - CBAM成本
4. **HS编码关税**
   - 当前归类正确性
   - 优惠税率机会
5. **数据一致性**
   - 矛盾清单
   - 修复优先级

### 三、建议
1. **紧急**（本周）：解决数据矛盾+补齐紧急认证
2. **短期**（本月）：补齐缺失认证+召回预防措施
3. **长期**（本季）：CBAM数据准备+HS编码优化

## Notes
- query_compliance_check 支持 single 和 multi 两种模式，single单市场/multi多市场对比
- CPSC召回数据来自江苏省贸促会预警平台，每日更新
- 召回风险预警是预测性分析，非100%准确
- CBAM 2026年过渡期仅10%付费比例，2027年将升至100%
- 决策一致性审计是供应链特有的跨系统扫描，30-40%的跨境物流延误来自数据不一致
- 如果查询特定产品合规时产品名未知，提示用户提供产品名称
