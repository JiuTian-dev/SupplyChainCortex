# Findings

## 2026-06-08 — 三大核心能力深度研究

### Graph RAG 差距
- 当前：正则实体抽取 + BFS + 固定 2 层邻域
- 前沿：LLM NER + Hybrid RAG（向量+图+关键词）+ 社区检测
- 推荐：先引入 pgvector 向量检索，再逐步构建 Hybrid RAG

### 级联风险差距
- 当前：PSM + SEIR + Monte Carlo
- 前沿：DML + SEIRS + DBN + Do-Calculus
- 推荐：优先升级因果推断（DML），再扩展 SEIRS 和 BN

### 审计追溯差距
- 当前：FSM trace + DecisionPassport + AuditLog（无密码学保护）
- 前沿：哈希链 + OTel GenAI SemConv + W3C PROV-AGENT
- 推荐：EU AI Act 8 月 deadline，密码学审计轨迹和 OTel 最紧迫

## 技术选型建议

| 组件 | 推荐方案 | 理由 |
|------|---------|------|
| 向量数据库 | pgvector | 已有 PostgreSQL，零额外部署 |
| Embedding | OpenAI text-embedding-3-small | 成本低，效果好 |
| OTel SDK | @opentelemetry/api + sdk-node | 行业标准 |
| DML 实现 | TypeScript 简化版（交叉拟合+正交得分） | 避免 Python 桥接复杂度 |
| 哈希链 | SHA-256 + 锚定到外部 TSA | 简单有效 |
