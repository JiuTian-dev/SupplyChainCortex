# 三大核心能力升级计划（排除数字孪生）

## 目标
按优先级逐步升级 SupplyChain Cortex 的三大核心能力：
1. 全链路审计追溯（合规紧迫，EU AI Act 2026年8月 deadline）
2. 级联风险因果推断（PSM → DML/Causal Forest）
3. Graph RAG 知识图谱（向量语义检索 + Hybrid RAG）

## 当前范围
- **不做**：数字孪生、ABM 智能体层、MILP 优化层
- **做**：密码学审计轨迹、OTel 标准化、因果推断升级、Graph RAG 向量层

## 阶段

### 阶段 1：审计追溯 — 密码学审计轨迹（高优先级）✅
- [x] 1.1 审计表添加哈希链字段（previousHash、contentHash）
- [x] 1.2 实现 SHA-256 哈希链生成逻辑
- [x] 1.3 添加数字签名（HMAC-SHA256 模拟层）
- [x] 1.4 审计表改为只追加（Append-Only）
- [x] 1.5 验证哈希链完整性

### 阶段 2：审计追溯 — OpenTelemetry 标准化（高优先级）✅
- [x] 2.1 安装 OTel SDK（@opentelemetry/api、sdk-node）
- [x] 2.2 配置 OTLP Exporter
- [x] 2.3 LLM 调用 → gen_ai.client.inference Span
- [x] 2.4 Tool 调用 → gen_ai.client.tool Span
- [x] 2.5 Agent FSM → agent.orchestration Span
- [x] 2.6 统一 trace_id 与现有 auditId
- [x] 2.7 验证全链路追踪

### 阶段 3：因果推断 — PSM → Double Machine Learning（高优先级）✅
- [x] 3.1 调研 EconML/DoubleML 的 TypeScript 替代方案或桥接方案
- [x] 3.2 设计 CausalEstimator 接口（支持 psm/dml/causal_forest）
- [x] 3.3 实现简化版 DML（交叉拟合 + Neyman-正交得分）
- [x] 3.4 样本量 ≥20 时优先 DML，<20 回退 PSM
- [x] 3.5 添加 Causal Forest 异质性处理效应分析
- [x] 3.6 更新测试和文档

### 阶段 4：Graph RAG — 向量语义检索（中优先级）✅
- [x] 4.1 选择向量数据库方案（pgvector）
- [x] 4.2 实现 Embedding 生成（调用 OpenAI/本地模型）
- [x] 4.3 构建向量索引（产品、供应商、港口等节点）
- [x] 4.4 实现向量召回 + 图遍历混合检索
- [x] 4.5 替换正则实体抽取为 LLM NER（保留正则作为补充）

### 阶段 5：Graph RAG — Hybrid RAG（中优先级）✅
- [x] 5.1 实现关键词检索（BM25，k1=1.5, b=0.75）
- [x] 5.2 三路召回：向量 + 图 + 关键词
- [x] 5.3 RRF 融合排序（k=60）
- [x] 5.4 子图动态剪枝（graph-rag.ts 集成升级）

### 阶段 6：审计追溯 — W3C PROV 语义层（中优先级）✅
- [x] 6.1 PROV-O 本体映射（Entity/Activity/Agent）
- [x] 6.2 JSON-LD 序列化
- [x] 6.3 /api/audit/provenance/[id] 端点

### 阶段 7：审计追溯 — Agent 决策深度追溯（中优先级）✅
- [x] 7.1 Prompt/Response 完整捕获
- [x] 7.2 Memory State 追踪
- [x] 7.3 因果图构建（DAG）+ 环检测 + 路径查找
- [x] 7.4 FSM 集成

### 阶段 8：级联风险 — SEIRS + R₀（中优先级）✅
- [x] 8.1 SEIR → SEIRS（R→S 循环，xi=0.05）
- [x] 8.2 计算基本再生数 R₀ = (β/γ) × (σ/(σ+ξ))
- [x] 8.3 判断系统慢性脆弱状态（isChronic）

### 阶段 9：级联风险 — Dynamic Bayesian Network（中优先级）✅
- [x] 9.1 设计 BN 节点和 CPT 结构（Noisy-OR）
- [x] 9.2 从历史数据学习条件概率（MLE + Laplace 平滑）
- [x] 9.3 前向推断更新网络故障概率（变量消除 + 拓扑序）
- [x] 9.4 Do-Calculus 反事实分析（截断父边 + 重新推断）

## 关键文件
- `src/lib/audit/trace-writer.ts`
- `src/lib/engine/passport.ts`
- `src/lib/agent/fsm.ts`
- `src/lib/services/cascade-risk.validation.ts`
- `src/lib/services/cascade-risk.propagation.ts`
- `src/lib/engine/graph-rag.ts`
- `src/lib/engine/graph-store.ts`

## 已知风险
- 当前工作区有未提交改动，需先提交或清理
- `npx tsc --noEmit` 仍被 `.next/dev/types/routes.d.ts` 生成文件阻塞
- 向量数据库选型需考虑部署复杂度（pgvector 最简单）
