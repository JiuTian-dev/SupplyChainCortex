# SupplyChain Cortex 深度评估报告

> 评估日期: 2026-06-07  
> 评估版本: v2.9.3  
> 评估方法: 代码全量审计 + 联网竞品调研 + 学术文献对标 + 市场趋势分析

---

## 一、项目画像

| 维度 | 数值 |
|------|------|
| 代码量 | ~88,400 行（79K TypeScript + 2.6K Python + 600 Prisma） |
| API 路由 | 57 个 |
| MCP 工具 | 73 个（CRUD 11 + 操作 11 + 智能 27 + 数学 24） |
| Prisma 模型 | 27 个 |
| 前端组件 | 96 个（9 业务 Tab + 20 共享 + 23 UI 原子） |
| 服务模块 | 37 个 |
| Python OR 模块 | 10 个（24 运筹学函数） |
| 引擎模块 | 42 个（FSM/RAG/Graph/Causal/Passport/Sandbox/Memory） |
| 外部数据源 | 10 个爬虫（SCFI/Amazon/CPSC/大宗商品/汇率/碳价/港口拥堵/社媒情感/GSCPI/金融指数） |
| 测试覆盖 | 32 文件 / 585 测试 |
| 状态管理 | 7 Zustand Store + 15 Custom Hooks |
| 部署方式 | Docker Compose（Next.js + PostgreSQL + SearXNG） |

### 1.1 技术栈全景

| 层次 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js App Router | 16.1.3 |
| 语言 | TypeScript | 5.x |
| UI | Tailwind CSS 4 + shadcn/ui + Recharts + ECharts SSR | - |
| 数据库 | PostgreSQL + Prisma ORM | 16 / 6.19 |
| 状态 | Zustand + TanStack React Query | 5 / 5 |
| AI 引擎 | DeepSeek / OpenAI / Anthropic / Ollama（ReAct Agent FSM v2） | 多 Provider |
| 数学引擎 | Python 3 + NumPy（24 个 OR 模型，bridge.py 调用） | 3.x |
| 搜索 | SearXNG 自托管 + 8 备用源并行竞速 | - |
| 实时 | SSE（Server-Sent Events） | - |
| 测试 | Vitest 4 + Playwright | - |
| 缓存 | ICacheBackend 抽象（Memory / PostgreSQL UNLOGGED / Redis planned） | - |

### 1.2 核心引擎清单

| 引擎 | 文件数 | 总行数 | 核心能力 |
|------|--------|--------|---------|
| FSM v2 Agent | 10 | ~65K | 6 状态机 + LLM 语义路由 + Provider 适配器 + 工具过滤 |
| 级联风险传播 | 6 | ~145K | BFS 图传播 + Monte Carlo + SEIR 传染病模型 + 校准 |
| 因果推理 | 2 | ~48K | 因果边构建 + 反事实查询 + Causal ML 倾向评分 |
| Graph-RAG | 3 | ~38K | 6 节点 8 边供应链图 + 级联算法 + 中心性分析 |
| 决策护照 | 1 | ~6K | 每次决策可审计护照（置信度/溯源/替代方案） |
| MARC 协议 | 1 | ~5K | 多源标注 + 可靠性置信度 + 后处理校验 |
| 策略沙箱 | 2 | ~45K | 4 Agent 博弈仿真 + 种子确定性 + 克隆对比 |
| 情景记忆 | 2 | ~23K | Agent 交互记忆 + 记忆整合 + 稳定事实提取 |
| 证据反馈 | 1 | ~12K | 声明级反馈 → 源可靠性权重 → 贝叶斯校准 |
| 自治策略 | 1 | ~13K | 三级自治（auto/confirm/forbid）+ 速率限制 |
| ECharts SSR | 3 | ~14K | 服务端 SVG 渲染 + sharp PNG + 批量报告 |
| 搜索引擎 | 7 | ~73K | 8 Provider 并行 + 质量守卫 + 重排 + 交叉验证 |

---

## 二、竞争格局分析

### 2.1 三层竞品矩阵

#### 第一层：企业级供应链 AI 平台

| 产品 | 厂商 | 定位 | 年费区间 | 核心差异 |
|------|------|------|---------|---------|
| **Kinaxis Maestro** | Kinaxis（加拿大） | 全球供应链并发计划 | $500K-1M+ | 并发计划引擎，大企业协同，Gartner Leader |
| **Blue Yonder** | Panasonic 旗下 | 端到端供应链 AI | $300K-800K | AI 驱动需求预测 + 库存优化，100+ 零售商使用 |
| **o9 Solutions** | o9（美国） | Enterprise Digital Brain | $200K-500K | "企业数字大脑"，跨职能 AI 决策，增长最快 |
| **SAP IBP** | SAP | 集成业务计划 | $200K-500K | 与 SAP ERP 深度绑定，Joule Agent 2025 H2 发布 |
| **Oracle SCM** | Oracle | 供应链云 | $150K-400K | 50+ AI Agent 嵌入 Fusion Cloud |

**判断**：这些产品面向 Fortune 500 级企业，年费 20-100 万美元，实施周期 6-18 个月，需要专业咨询团队。SupplyChain Cortex 不在这一层竞争，但其 AI 引擎深度（SEIR/Causal ML/MARC）在学术创新性上不逊于这些产品的公开技术文档。

#### 第二层：中国跨境电商 ERP/SaaS

| 产品 | 总部 | 客户量 | 月费区间 | 核心能力 | AI 能力 |
|------|------|--------|---------|---------|---------|
| **易仓 ERP** | 深圳 | 数万 | ¥2K-5K | 13年沉淀，100+ 平台对接，WMS | 无 |
| **积加 ERP** | 深圳 | 数万 | ¥1K-3K | 亚马逊精细化，广告 ROI，竞品追踪 | 无 |
| **领星 ERP** | 深圳 | 数万 | ¥800-2K | 财务管理强，供应链+运营全覆盖 | 无 |
| **马帮 ERP** | 深圳 | 10万+ | ¥500-1.5K | 88 平台对接，1000+ 物流 | 无 |
| **店小秘** | 深圳 | 数万 | ¥300-1K | 多平台铺货，高频刊登 | 无 |

**判断**：这些产品是传统 ERP/OMS，聚焦"订单-库存-财务"的事务处理流程。**没有任何一个具备 AI-native 架构**——没有 LLM Agent、没有因果推理、没有风险传播引擎、没有策略仿真。它们解决的是"管事"（流程自动化），SupplyChain Cortex 解决的是"决策"（智能分析与建议）。

两者不是竞争关系，而是互补关系：ERP 管流程，Cortex 管决策。

#### 第三层：AI 决策智能平台

| 产品/趋势 | 定位 | 状态 | 与本项目的关系 |
|-----------|------|------|--------------|
| **Dynamics 365 Copilot** | 微软供应链 AI 助手 | 已商用 | 绑定 Azure 生态，巨头下沉 |
| **SAP Joule Agent** | SAP 供应链 AI Agent | 2025 H2 发布 | SAP 生态内使用 |
| **Cardinal Operations（杉数）** | 中国决策智能 | B 轮融资 | 聚焦计划优化，非对话式 |
| **ICRON Rhythm** | Agentic 供应链计划 | 2026 发布 | 企业级，非中小企业 |
| **SupplySync AI** | 预测性供应链优化 | Microsoft AppSource | 轻量但功能有限 |

**判断**：巨头正在将 AI Agent 嵌入现有 ERP（"在旧系统上加 Copilot"），但受限于遗留架构，灵活性不如 AI-native 方案。SupplyChain Cortex 是纯 AI-native 架构，但缺少企业级打磨。

### 2.2 定位矩阵图

```
                    高 ←── AI 智能密度 ──→ 低
                    │                        │
  大企业   ┌────────┤                        │
  ($100K+) │Kinaxis │                        │
           │o9 Sol. │                        │
           │Blue Y. │                        │
           ├─────────┼────────────────────────┤
           │         │                        │
  中小卖家 │★Cortex  │  易仓/积加/领星/马帮    │
  ($0-5K)  │         │                        │
           └─────────┴────────────────────────┘
                    │                        │
              高 ←── 价格 ──→ 低
```

**SupplyChain Cortex 占据了一个独特的空白象限：面向中小跨境电商卖家的高智能密度 AI 决策平台。**

- 上层产品（Kinaxis/o9）太贵太重，中小卖家买不起也用不动
- 同层产品（易仓/积加/领星）没有 AI，只解决流程不解决决策
- 巨头 Copilot（SAP Joule/Dynamics 365）绑定自有 ERP 生态，不独立销售

### 2.3 竞品功能深度对比

| 能力维度 | Cortex | Kinaxis | o9 | 易仓 | 积加 |
|---------|--------|---------|-----|------|------|
| Chat 自然语言交互 | 主界面 | 辅助 | 辅助 | 无 | 无 |
| 多 Provider LLM | 4 个 | 1-2 | 1 | 0 | 0 |
| 风险级联传播 | SEIR+MC+BFS | 有 | 有 | 无 | 无 |
| 因果推理/反事实 | Causal ML | 传统 What-if | 传统 What-if | 无 | 无 |
| 策略仿真沙箱 | 4 Agent | 有限 | 有 | 无 | 无 |
| 运筹学模型 | 24 个 | 丰富 | 丰富 | 无 | 基础 |
| 决策可解释性 | MARC+Passport | 部分 | 部分 | 无 | 无 |
| 外部数据源 | 10 个实时 | 丰富 | 丰富 | 平台API | 平台API |
| 多租户 | 无 | 有 | 有 | 有 | 有 |
| 移动端 | 基础响应 | 有 | 有 | App | App |
| 实施成本 | 零（Chat即用） | 极高 | 高 | 低 | 低 |

---

## 三、多维度技术评估

### 3.1 架构成熟度：7.5/10

| 子维度 | 评分 | 优势 | 短板 |
|--------|------|------|------|
| 分层清晰度 | 8/10 | API → Service → Engine → ORM 四层分明 | 部分 Service 层直接调 Prisma，绕过 queries 层 |
| 模块化程度 | 7/10 | cascade-risk 已拆为 6 模块 | CostTab(46KB)、SupplierTab(36KB) 仍偏大 |
| 类型安全 | 8/10 | 源码层 0 TS 错误，Prisma 类型贯穿 | 生成文件（.next/dev/types）有语法错误 |
| 可测试性 | 7/10 | 585 测试覆盖核心引擎和服务 | 前端组件 0 测试，E2E 测试缺失 |
| 性能工程 | 8/10 | 缓存抽象层 + 动态导入 + optimizePackageImports + lightningcss | 无 CDN、无 ISR、cacheComponents 因冲突禁用 |
| 部署就绪度 | 6/10 | Docker Compose 完整（app+postgres+searxng） | 无 CI/CD 流水线、无 K8s、无 Staging |

**亮点**：
- 缓存层 `ICacheBackend` 抽象（Memory/Postgres/Redis），`cachedFetch()` 三级检查（cache → in-flight → execute）
- Provider Adapter 工厂模式，DeepSeek/OpenAI/Anthropic 三个适配器共享接口
- FSM v2 模型无关设计，所有 Provider 差异封装在 Adapter 层

**短板**：
- 缺少 CI/CD 自动化（无 GitHub Actions、无自动部署）
- 无 Staging 环境、无灰度发布
- 无 APM 监控（无 Sentry/Datadog/自研告警）
- cacheComponents 与 8 个 force-dynamic 路由冲突，被迫禁用

### 3.2 AI 引擎创新度：8.5/10

#### 3.2.1 FSM v2 Agent 引擎

| 特性 | Cortex FSM v2 | LangGraph | CrewAI | AutoGen |
|------|--------------|-----------|--------|---------|
| 状态模型 | 6 状态显式 FSM | 图/节点 | 角色/任务 | 对话/轮次 |
| Provider 适配 | 原生 Adapter 层 | 绑定特定 LLM | 绑定特定 LLM | 绑定 OpenAI |
| 工具过滤 | 意图路由 + 渐进暴露 | 全量暴露 | 全量暴露 | 全量暴露 |
| SSE 流式 | 原生支持 | 需自行实现 | 需自行实现 | 需自行实现 |
| 决策追踪 | 全链路 TraceWriter | 部分 | 无 | 无 |
| 最大轮次 | 3 轮 / 18 工具 | 无限制 | 无限制 | 无限制 |

**评价**：FSM v2 的设计哲学是"有限轮次 + 精准路由"，而非"无限对话 + 暴力搜索"。这在供应链场景下是正确的——用户问的是"库存怎么样"而不是开放式探索。工具过滤（意图 → 子集）显著降低 LLM 上下文消耗。

#### 3.2.2 SEIR 供应链风险传播

**学术对标**：
- 青岛大学《复杂系统与复杂性科学》2025 年发表"复杂供应链网络中断风险传播趋势建模与仿真"，使用改进 SEIR 模型
- MDPI Mathematics 2025 年发表"Risk Contagion Mechanism and Control Strategies in Supply Chain Networks"
- 电子科技大学学报发表"新冠肺炎疫情影响下区域产业网络风险传导效应"

**Cortex 实现**：
- S→E→I→R 四仓模型，参数 β=0.30（传播率）、σ=0.50（潜伏率）、γ=0.10（恢复率）
- 30 天时序模拟，输出每日 S/E/I/R 计数 + 峰值日 + 恢复周期
- 场景：恐慌性缺货、囤货、供应链冲击传播

**评价**：将学术论文的 SEIR 传染病模型落地为工程实现，在商业供应链产品中**极为罕见**。多数商业产品（包括 Kinaxis/o9）使用的是传统 Monte Carlo 或确定性场景分析，不涉及传染病动力学。

#### 3.2.3 Causal ML 反事实引擎

| 特性 | Cortex | o9 What-if | Kinaxis Scenario | 传统 BI |
|------|--------|-----------|-----------------|---------|
| 方法论 | 倾向评分匹配 + Bootstrap CI | 参数化场景 | 预设情景 | 静态报表 |
| 因果估计 | ATE + CI + p-value + 样本量 | 无 | 无 | 无 |
| 自动回退 | 数据不足 → 领域先验 | N/A | N/A | N/A |
| 干预类型 | 4 种（reroute/safety_stock/supplier_switch/combined） | 自定义 | 预设 | 无 |
| 可靠性标记 | isReliable + sampleSize + pValue | 无 | 无 | 无 |

**评价**：Causal ML 反事实是供应链决策的"圣杯"——不只告诉你"如果 X 会怎样"，而是基于历史证据告诉你"根据过去的数据，执行 Y 干预大概能降低 Z% 风险"。Cortex 的实现质量（倾向评分 + Bootstrap + 自动回退先验）已经超过同层所有竞品。

#### 3.2.4 独创设计

| 设计 | 独创性 | 说明 |
|------|--------|------|
| **Decision Passport** | 首创 | 每次 AI 决策生成可审计护照：置信度分数、数据溯源链、替代方案对比、执行追踪、规则版本哈希 |
| **MARC 协议** | 首创 | Multi-source Annotation with Reliability Confidence：`[T1-MCP][高]` 标注每个数据来源和可信度 |
| **Evidence-Level Feedback** | 超越主流 | 超越 RLHF 的响应级反馈，做到声明级反馈 → 源可靠性权重更新 → 贝叶斯校准闭环 |
| **Policy-as-Code** | 领域创新 | 三级自治（auto/confirm/forbid）+ 工具级速率限制 + 金额上限，实现"渐进自治" |

### 3.3 数据能力：7/10

| 子维度 | 评分 | 详情 |
|--------|------|------|
| 外部数据源丰富度 | 8/10 | 10 个实时爬虫覆盖运价/汇率/大宗商品/碳价/港口/竞品/召回/情感/金融指数/GSCPI |
| 搜索管线质量 | 8/10 | SearXNG + 8 备用源并行竞速 + URL 安全守卫 + 重排 + 交叉验证 + 注入检测 |
| 数据新鲜度 | 6/10 | TTL 分层（SHORT 15s / MEDIUM 60s / LONG 5min / VERY_LONG 15min），缺少实时推送 |
| 数据治理 | 5/10 | 无数据血缘追踪、无 data quality dashboard、无 schema evolution 管理 |
| 多语言 | 4/10 | 仅中英双语，无 i18n 框架，MARC 标签中英混合 |
| 数据爬取稳定性 | 5/10 | 10 个爬虫依赖外部网站 HTML 结构，无 fallback SLA，无结构变更告警 |

### 3.4 产品完成度：6.5/10

| 子维度 | 评分 | 详情 |
|--------|------|------|
| Chat 交互体验 | 8/10 | 主流式 + 工具链可视化 + MARC 徽章 + 数据面板滑出 + 思考过程面板 |
| 数据面板深度 | 7/10 | 9 个业务 Tab 覆盖库存/成本/销售/供应商/物流/风险/合规/审计/级联风险 |
| 操作闭环 | 6/10 | 有 CRUD + 补货单 + 库存调拨 + 供应商状态变更，缺少审批流和多级确认 |
| 多用户/RBAC | 5/10 | 有 User 模型和 admin/manager/viewer 三角色，缺少多租户和组织层级 |
| 移动端适配 | 3/10 | 响应式基础适配，无 PWA、无离线模式、无原生 App |
| 用户文档/帮助 | 3/10 | 无用户手册、无 onboarding 引导、无 API 文档、无 in-app tooltip |
| 可观测性 | 4/10 | 有审计日志 + 决策追踪 + 回放，但无 APM、无错误追踪、无 usage analytics |

### 3.5 商业化就绪度：4/10

| 子维度 | 评分 | 详情 |
|--------|------|------|
| 多租户隔离 | 2/10 | 无租户概念，数据全局共享，无 Row-Level Security |
| 计费系统 | 1/10 | 无订阅、无用量计量、无付费墙、无 Stripe/支付宝集成 |
| SLA/高可用 | 3/10 | 单机 Docker 部署，无 HA、无自动扩缩、无灾备 |
| 安全合规 | 5/10 | NextAuth + RBAC + 安全头 + rate limit + CORS，但无 SOC2/GDPR/等保 |
| 客户成功体系 | 1/10 | 无 onboarding 流程、无 usage analytics、无 customer feedback loop |
| 国际化 | 3/10 | UI 中英混合，无 locale 切换，货币仅支持 CNY/USD |

---

## 四、SWOT 分析

### Strengths（优势）

1. **AI 密度碾压同层竞品**：73 个 MCP 工具 + 24 个 OR 模型 + SEIR + Causal ML，中国跨境电商 ERP 领域无出其右
2. **独创的可信 AI 审计体系**：MARC 协议 + Decision Passport + 声明级反馈 + 贝叶斯校准，形成"AI 决策可解释性"完整闭环
3. **前沿学术方法论的工程化**：SEIR 传染病模型用于供应链风险传播、Causal ML 反事实用于策略评估，在商业产品中极为罕见
4. **Chat-native 交互范式**：不是"旧系统加 Copilot"，而是从底层以对话为核心设计，工具链可视化 + 数据面板自动滑出
5. **技术栈现代且统一**：Next.js 16 + Prisma + Zustand + Vitest，单一技术栈降低维护成本
6. **完整的搜索引擎管线**：8 Provider 并行竞速 + 质量守卫 + 重排 + 交叉验证 + 注入检测，搜索质量远超简单 API 调用
7. **策略仿真能力**：4 Agent 博弈沙箱 + 种子确定性 + 克隆对比，在中小卖家工具中独一无二

### Weaknesses（劣势）

1. **单人/小团队开发痕迹**：~88K 行代码无外部贡献者，bus factor = 1，知识集中度高
2. **产品化程度低**：无多租户、无计费、无 onboarding、无用户文档，处于"高级原型"阶段
3. **前端组件体量不均**：CostTab 46KB vs AuditTab 1.3KB，部分组件过度膨胀
4. **数据依赖脆弱**：10 个爬虫依赖外部网站 HTML 结构，无 fallback SLA，一旦目标网站改版即断
5. **测试盲区**：核心引擎测试充分（585 passed），但前端组件 0 测试，E2E 测试完全缺失
6. **DeepSeek 工具调用可靠性**：74.3% 成功率（FSM v2 评估），生产环境可能因模型问题导致体验下降
7. **无实时协作**：单用户设计，无多人协同、无评论、无分享

### Opportunities（机会）

1. **Gartner 预测窗口**：到 2030 年 50% 成熟供应链部门将集成 Agentic AI。2025-2028 是最佳进入窗口
2. **中国跨境电商爆发**：2024 年进出口 2.38 万亿元，同比 +15.6%，卖家对智能化工具需求强烈
3. **AI Agent 供应链空白期**：巨头 Copilot 刚发布（SAP Joule 2025 H2），中小卖家市场尚无可用产品
4. **产业带数字化**：顺德/慈溪/中山小家电产业带正在从"卖货"转向"管供应链"，地方政府有补贴
5. **开源商业化**：可作为"供应链 AI 引擎"开源，通过 SaaS 托管或企业定制变现
6. **跨境电商 ERP 合作**：与易仓/积加等 ERP 合作，作为"AI 决策层"嵌入，互补而非竞争
7. **2026 关税战**：中美贸易摩擦加剧，关税场景分析（tariff_escalation）需求激增

### Threats（威胁）

1. **巨头下沉**：SAP Joule / Dynamics Copilot 一旦成熟并降价到中小企业区间，可能直接碾压
2. **跨境电商 ERP 加 AI**：易仓/积加/领星一旦加入 LLM 功能，凭借 10 万+客户基础可快速追赶
3. **LLM 成本波动**：DeepSeek/OpenAI 定价变化可能影响运营成本，尤其高频工具调用场景
4. **数据源封锁**：爬虫依赖的外部网站（Amazon/CPSC/SCFI）可能加强反爬或转为付费 API
5. **合规风险**：跨境数据获取涉及多国法规（GDPR/CCPA/中国数据出境），爬虫合法性需专项审计
6. **AI 幻觉风险**：即使有 MARC 校准，LLM 仍可能在关键决策中产生幻觉，导致用户损失
7. **技术债务**：88K 行代码单人维护，长期不可持续

---

## 五、项目定位结论

### 5.1 定位声明

> **SupplyChain Cortex 是中国首个面向中小跨境电商卖家的 AI-native 供应链决策智能平台。** 它以 Chat 为主界面，集成了 73 个专业工具、24 个运筹学模型和独创的可信 AI 审计体系（MARC + Decision Passport），为供应链运营经理提供"对话即决策"的体验——从库存补货到级联风险传播到策略仿真，一问即得。

### 5.2 品类定义

```
不是：跨境电商 ERP（对标易仓/积加/领星）
不是：企业级供应链规划平台（对标 Kinaxis/o9/Blue Yonder）
不是：通用 AI 助手（对标 ChatGPT/通义千问/文心一言）
不是：BI 报表工具（对标 Metabase/Superset/FineBI）

是：垂直领域 AI Decision Copilot
     x 供应链运筹学引擎
     x 可信 AI 审计体系
     x 实时外部数据融合
```

### 5.3 目标用户画像

| 层级 | 用户角色 | 痛点 | Cortex 价值 |
|------|---------|------|------------|
| **一级** | 小家电跨境供应链经理 | 50-500 SKU 管理复杂，风险响应慢 | 自然语言查询 + 风险预警 + 补货建议 |
| **二级** | 跨境电商 CEO/COO | 需要全局供应链健康视图 | 一键全健康报告 + 策略仿真 |
| **三级** | 供应链咨询顾问 | 快速分析 + 报告生成 | Chat 即出报告 + ECharts 可视化 |
| **四级** | 产业带外贸企业 | 缺乏专业供应链人才 | AI 替代专家经验，降低门槛 |

### 5.4 差异化壁垒

| 壁垒层 | 具体内容 | 可复制性 |
|--------|---------|---------|
| **算法壁垒** | SEIR 传播 + Causal ML + 24 OR 模型 | 低（需供应链+ML 双重专业知识） |
| **数据壁垒** | 10 个实时外部数据源 + 历史审计积累 | 中（爬虫可复制，数据积累需时间） |
| **协议壁垒** | MARC + Passport + Evidence Feedback | 中（设计可借鉴，实现需投入） |
| **工具壁垒** | 73 MCP 工具 + 完整搜索管线 | 中（工程量大，但无技术黑箱） |
| **体验壁垒** | Chat-native + 工具链可视化 + 数据面板 | 高（需端到端产品设计能力） |

---

## 六、技术深度专题

### 6.1 SEIR 模型：从学术论文到工程实现

传统供应链风险管理使用 Monte Carlo 模拟或确定性场景分析。Cortex 创新性地引入流行病学 SEIR（Susceptible-Exposed-Infectious-Recovered）模型：

```
S( susceptible ) ──β──> E( exposed ) ──σ──> I( infectious ) ──γ──> R( recovered )
     未受影响节点          潜伏风险节点         活跃风险节点           已恢复节点
```

| 参数 | 含义 | Cortex 默认值 |
|------|------|-------------|
| β (beta) | 传播率：风险从 I 节点传染给 S 邻居的概率 | 0.30 |
| σ (sigma) | 潜伏率：暴露节点转化为活跃风险的速度 | 0.50 |
| γ (gamma) | 恢复率：风险节点自然恢复的速度 | 0.10 |

输出：30 天时序 S/E/I/R 曲线 + 峰值日 + 恢复 horizon。

**学术创新性**：2025 年中国学术界刚发表多篇 SEIR 供应链论文（青岛大学、电子科大），但均为纯学术研究。Cortex 是目前已知的**唯一将 SEIR 供应链模型工程化为可调用 API 的商业产品**。

### 6.2 MARC 协议：AI 可信度的"营养标签"

MARC（Multi-source Annotation with Reliability Confidence）是 Cortex 独创的数据可信度标注协议：

```
来源标签：[T0-LLM] [T1-MCP] [T2-KB] [T3-Search]
置信标签：[高] [中] [低]

示例输出：
"根据库存数据[T1-MCP][高]，SKU-A123 的周转天数为 45 天，
 高于行业基准[T2-KB][中]。建议补货 200 件。"
```

**类比**：如同食品的"营养标签"，MARC 让用户一眼看出 AI 回答中每个数据点的来源和可信度。这在企业级 AI 应用中是刚需（Gartner 将"可解释 AI"列为 2026 年关键趋势），但几乎没有商业产品做到如此细粒度的标注。

### 6.3 Decision Passport：决策的"护照"

每次 AI 决策都会生成一份 Decision Passport：

```json
{
  "confidence": 0.82,
  "provenance": [
    { "source": "inventory_api", "latency_ms": 45, "status": "ok" },
    { "source": "fx_api", "latency_ms": 120, "status": "ok" },
    { "source": "weather_api", "latency_ms": 800, "status": "degraded" }
  ],
  "alternatives": [
    { "action": "切换供应商", "impact": "风险降低 31.0%", "confidence": 0.31 },
    { "action": "增加安全库存", "impact": "风险降低 25.0%", "confidence": 0.25 }
  ],
  "execution": { "steps": 3, "tools": 5, "duration_ms": 2340 },
  "ruleVersion": "abc123"
}
```

**价值**：决策可追溯、可回放、可审计。当 AI 建议导致损失时，可以回溯决策过程，找到哪个数据源出了问题、哪个替代方案被忽略。这是企业级合规的刚需。

### 6.4 策略沙箱：4 Agent 博弈仿真

Cortex 的策略沙箱使用 4 个 Agent 模拟供应链各方行为：

| Agent | 角色 | 行为逻辑 |
|-------|------|---------|
| Warehouse Agent | 仓库管理者 | 容量约束 + 存储成本优化 |
| Supplier Agent | 供应商 | 交期波动 + 价格谈判 |
| Forwarder Agent | 物流商 | 路线选择 + 运费波动 |
| Market Agent | 市场/需求 | 需求随机性 + 季节性 |

用户可以"克隆"当前状态，施加不同策略（如"切换供应商" vs "增加安全库存"），运行 N 轮仿真后对比结果。种子确定性确保结果可复现。

---

## 七、下一步方向深度建议

### 方向 A：产品化冲刺（优先级最高）

**当前瓶颈不是 AI 能力（已 8.5/10），而是产品化程度（仅 4/10）。**

| 任务 | 说明 | 前置条件 |
|------|------|---------|
| **多租户 + 数据隔离** | Row-Level Security（Prisma middleware）或 schema-per-tenant | 先确定租户模型（subdomain / path / header） |
| **用量计量 + 计费** | Token 消耗 + API 调用计数 + 月费套餐 + Stripe/支付宝集成 | 先确定计费维度（按 Token / 按工具调用 / 按 SKU 数） |
| **客户 Onboarding** | Setup Wizard：连接店铺 → 导入产品 → 首次全健康分析 → 结果展示 | 先有 demo 租户 |
| **预置行业模板** | "小家电出海" / "消费电子出海" / "家居用品出海" 预设配置 | 先有行业客户验证 |
| **In-App 引导** | 首次使用 tooltip、空态引导、功能发现 | 先确定核心使用路径 |

### 方向 B：强化数据护城河

| 任务 | 说明 | 优先级 |
|------|------|--------|
| **正式 API 替代爬虫** | SCFI 官方 API、Freightos API、WCO 关税数据库、Alphavantage Premium | 高（降低断链风险） |
| **历史数据沉淀** | 每日自动快照 → 回测基准 → 预测准确率追踪 dashboard | 高（形成数据壁垒） |
| **行业 Benchmark 库** | 小家电行业库存周转天数基准、退货率基准、物流时效基准（按品类/目的地） | 中 |
| **数据质量监控** | 爬虫健康 dashboard + 结构变更告警 + 自动 fallback 链 | 中 |

### 方向 C：DeepSeek 可靠性突破

| 任务 | 说明 |
|------|------|
| **多 Provider 自动 failover** | DeepSeek 失败 → OpenAI → Anthropic → Ollama，逐层自动降级，用户无感 |
| **工具调用格式强化** | JSON Schema 强制输出 + 输出修复层（已有文本兜底，需增加结构化修复） |
| **Prompt Engineering 专项** | 针对 DeepSeek V4 Pro 的供应链领域 prompt 优化（few-shot + chain-of-thought） |
| **工具调用缓存** | 相同参数的工具调用短期缓存，减少 LLM 重复调用 |

### 方向 D：商业化路径选择

| 路径 | 目标客户 | 收入模型 | 优势 | 风险 |
|------|---------|---------|------|------|
| **SaaS 托管版** | 中小卖家 | ¥299-999/月订阅 | 低门槛获客，规模化收入 | 需要多租户+运维能力 |
| **企业定制版** | 中型品牌 | ¥5-20 万/年 + 实施费 | 高客单价，深度绑定 | 交付周期长 |
| **开源引擎 + SaaS** | 开发者 + 企业 | 引擎免费，托管收费 | 社区获客，技术品牌 | 开源后可能被白嫖 |
| **产业带合作** | 家电协会成员 | 团购价 + 政府补贴 | 批量获客，政策红利 | 依赖关系网络 |
| **ERP 插件** | 易仓/积加用户 | 按功能模块收费 | 借现有渠道 | 受制于 ERP 平台策略 |

**建议路径**：先做 SaaS 托管版（验证 PMF），同时与 1-2 家产业带合作（种子客户），积累行业数据后再推企业定制版。

### 方向 E：技术纵深（学术 → 产品转化）

| 方向 | 学术对标 | 产品化路径 | 价值 |
|------|---------|-----------|------|
| **Digital Twin** | 数字孪生供应链 | 已有 Sandbox 基础 → 接入实时数据 → 全真仿真 | 高级客户核心卖点 |
| **Federated Learning** | 联邦学习 | 多家小家电企业联合训练风险模型，保护商业数据 | 解决数据隐私顾虑 |
| **Reinforcement Learning** | 自动补货策略 | 从"建议补货"进化到"自动执行补货"（Policy-as-Code 控制） | 真正的自动化闭环 |
| **Temporal Graph** | 时序图网络 | 供应链关系随时间演化，捕捉季节性/趋势性结构变化 | 更精准的风险预测 |
| **Multimodal RAG** | 多模态检索 | 产品图片 + 规格书 + 合规证书 → 统一知识检索 | 扩展数据输入维度 |

### 方向 F：测试与质量补齐

| 任务 | 说明 | 优先级 |
|------|------|--------|
| **前端组件测试** | ChatPanel / CascadeRiskPanel / CostTab 等核心组件 Vitest + Testing Library | 高 |
| **E2E 测试** | Playwright 覆盖 Chat 主流程（发送 → 流式响应 → 工具调用 → 数据面板） | 高 |
| **CI/CD 流水线** | GitHub Actions：lint → typecheck → test → build → deploy（staging） | 高 |
| **性能基线** | Lighthouse CI + Web Vitals 自动化追踪 + 预算告警 | 中 |
| **安全审计** | OWASP Top 10 检查 + 依赖漏洞扫描 + 爬虫合规审计 | 中 |

---

## 八、评分总览

| 维度 | 评分 | 业界对标 |
|------|------|---------|
| 架构成熟度 | **7.5/10** | 优于多数初创产品，接近中型 SaaS 水平 |
| AI 引擎创新度 | **8.5/10** | 超越同层所有竞品，部分特性达到企业级平台水平 |
| 数据能力 | **7/10** | 外部数据源丰富，但数据治理和稳定性待加强 |
| 产品完成度 | **6.5/10** | Chat 体验优秀，但缺少产品化包装 |
| 商业化就绪度 | **4/10** | 高级原型阶段，离可卖产品有明确差距 |
| 测试与质量 | **6/10** | 引擎测试充分，前端和 E2E 缺失 |
| 文档与生态 | **3/10** | 内部文档完善（HANDOVER/CLAUDE.md），无外部文档 |
| **综合评分** | **6.1/10** | **"技术 8 分，产品 4 分"——AI 能力天花板，产品化地板** |

---

## 九、结论

### 一句话总结

> **SupplyChain Cortex 在 AI 引擎深度上做到了中国跨境电商供应链领域的天花板，但在产品化程度上还处于"高级原型"阶段。最紧迫的不是加更多 AI 能力，而是把已有的 8.5/10 智能引擎包装成可卖的产品。**

### 核心建议

1. **停止堆功能，开始做产品**：多租户 + 计费 + Onboarding 比新增第 74 个工具更重要
2. **找到第一个付费客户**：顺德/慈溪小家电企业，用定制化换真实使用数据和反馈
3. **建立数据护城河**：正式 API 替代爬虫 + 历史数据沉淀 + 行业 Benchmark
4. **解决 DeepSeek 可靠性**：多 Provider failover 是上线前的必做项
5. **补齐测试和 CI/CD**：前端测试 + E2E + 自动化部署，降低单人维护风险

### 时间窗口

Gartner 预测 2028-2030 年 Agentic AI 将进入主流供应链。当前 2026 年是最佳验证期——巨头尚未下沉，中小卖家尚未被教育，但需求已经存在。**窗口期约 18-24 个月。**

---

> 来源引用：
> - Fortune Business Insights, Supply Chain Analytics Market 2034
> - Gartner, 2026 供应链 AI 战略预测（巴塞罗那研讨会）
> - MDPI Mathematics, "Risk Contagion Mechanism and Control Strategies in Supply Chain Networks" 2025
> - 青岛大学《复杂系统与复杂性科学》, "复杂供应链网络中断风险传播趋势建模与仿真" 2025
> - 2026 跨境电商十大 ERP 排名（跨境眼/搜狐）
> - Stravito, "19 Best Decision Intelligence Platforms 2026"
> - ICRON, "How Agentic AI is Shaping Supply Chain Planning in 2026"
> - 中国日报, "南京企业 AI 实践入选《2026 数智供应链全球化发展报告》"
