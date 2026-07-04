# Progress

## 2026-06-08

- 完成三大核心能力深度研究（Graph RAG、级联风险、审计追溯）
- 创建升级计划 task_plan.md，排除数字孪生
- 确定优先级：审计合规 > 因果推断 > Graph RAG
- 技术选型：pgvector、OpenAI embedding、OTel SDK、TypeScript DML

### 阶段 1：审计追溯 — 密码学审计轨迹 ✅
- SHA-256 哈希链 + HMAC-SHA256 签名
- `src/lib/audit/crypto-trail.ts` + test (11 tests)
- `scripts/backfill-audit-hashes.ts` 回填脚本

### 阶段 2：审计追溯 — OpenTelemetry 标准化 ✅
- GenAI Semantic Conventions (gen_ai.client.inference/tool, agent.orchestration)
- `src/lib/audit/otel-tracing.ts` + test (10 tests)
- `src/lib/audit/otel-sdk.ts` SDK 初始化

### 阶段 3：因果推断 — PSM → DML/Causal Forest ✅
- CausalEstimator 接口 (psm/dml/causal_forest)
- DML 交叉拟合 + Neyman-正交得分
- Causal Forest 异质性处理效应
- `src/lib/services/causal-estimator.ts` + test (12 tests)

### 阶段 4：Graph RAG — 向量语义检索 ✅
- pgvector 向量存储 + HNSW 索引
- Embedding 生成 (单位向量 fallback + OpenAI API)
- 图谱→向量索引同步器
- `src/lib/engine/vector-store.ts` + test (21 tests)
- `src/lib/engine/vector-index-builder.ts` + test (9 tests)
- `scripts/build-vector-index.ts` 独立脚本

### 阶段 5：Graph RAG — Hybrid RAG ✅
- BM25 关键词检索 (k1=1.5, b=0.75, CJK unigram+bigram+trigram)
- 三路召回：向量 + 图 + BM25
- RRF 融合排序 (k=60)
- graph-rag.ts 升级集成 Hybrid RAG
- `src/lib/engine/hybrid-rag.ts` + test (21 tests)

### 阶段 6：审计追溯 — W3C PROV 语义层 ✅
- PROV-O 本体映射 (Entity/Activity/Agent)
- JSON-LD 序列化/反序列化
- `/api/audit/provenance/[id]` 端点 (application/ld+json)
- `src/lib/audit/provenance.ts` + test (22 tests)

### 阶段 7：审计追溯 — Agent 决策深度追溯 ✅
- DecisionTracer 累积式追踪器
- Prompt/Response 捕获 + Memory Snapshot
- 因果 DAG 构建 + 环检测 + 路径查找
- FSM 集成 (每个状态转换记录决策节点)
- `src/lib/audit/decision-tracer.ts` + test (14 tests)

### 阶段 8：级联风险 — SEIRS + R₀ ✅
- SEIR → SEIRS 升级 (R→S 循环, xi=0.05 waning immunity)
- R₀ = (β/γ) × (σ/(σ+ξ)) 基本再生数计算
- Rₜ = R₀ × (S_t/N) 有效再生数
- 慢性脆弱检测 (isChronic)
- `src/lib/services/cascade-risk.types.ts` + `cascade-risk.propagation.ts` 修改

### 阶段 9：级联风险 — Dynamic Bayesian Network ✅
- BNNode/CPT/BayesianNetwork 类型定义
- createDefaultCPT() Noisy-OR 默认 CPT
- buildBayesianNetwork() 含拓扑排序 (Kahn's algorithm)
- forwardInference() 前向推断 (变量消除 + 拓扑序)
- doIntervention() Do-Calculus 反事实分析 (截断父边 + 重新推断)
- learnCPT() MLE + Laplace 平滑 CPT 学习
- getCriticalNodes() / formatInferenceResults() 工具函数
- 修复 doIntervention CPT 丢失问题 (深拷贝替代重建)
- `src/lib/services/bayesian-network.ts` + test (43 tests)

### 全量测试
- 746/748 通过 (2 个预存 deepseek 模型名问题，与本次改动无关)

## 下一步
- 所有 9 个阶段已完成，可提交 git commit
