# SupplyChain Cortex — 项目交接文档

> 最后更新: 2026-05-22  
> 当前版本: v2.0.0 (Agent Engine v2 + Audit + Skills)  
> 状态: 2 tsc 预存错误, 32 测试文件 583 测试通过, 1 DB 依赖失败

---

## ⏭️ 下一步任务：前端重设计（Chat 中心 + 数据滑出）

### 当前状态
- 两个设计 Skill 已安排安装（ui-ux-pro-max + frontend-design）
- 用户刚重启 Claude Code，Skill 已加载
- 代码在 main 分支，最新

### 设计方案（已确认）

**布局：A 为主（Chat 中心），B 为辅（数据滑出）**

```
┌──────────────────────────────────────┐
│  SupplyChain Cortex       📋审计    │
├──────────────────────────────────────┤
│                                      │
│    💬 需要了解什么？                  │
│    ┌───────────────────────────┐     │
│    │ 输入问题...                │     │
│    └───────────────────────────┘     │
│                                      │
│    快捷：📦库存 💰成本 🚢供应商 ⚠️风险 │
│                                      │
│    ─── Agent 回复区 ───              │
│    (流式token + MARC徽章 + 工具链)   │
│                                      │
│                      ┌─数据面板(滑出) │
│                      │ 实时数据      │
└──────────────────────────────────────┘
```

**核心体验：**
- 页面 = Chat，其他全部退让
- Agent 调工具时，右侧自动滑出数据面板（工具名 + 参数 + 实时结果）
- 数据面板里的数字可以点，跳回 Chat 里的引用行
- MARC 标签 `[T1-MCP][高]` 变成彩色小徽章
- 工具调用链可视化："查了库存 → 发现21个危机品 → 推荐补货"
- 3 个快捷按钮代替旧搜索框（"库存检查" "成本分析" "供应商评估"）
- 空态：3 个示例问题
- 加载态：流式 token 骨架
- 错误态：API 故障时显示恢复建议
- 审计入口：右上角图标 → 独立历史页面
- 旧面板（inventory/cost/supplier）保留但通过数据面板链接跳转

### 技术要点
- 现有 ChatPanel.tsx 需要完全重写（目前是右侧抽屉，要改成主界面）
- SSE 事件协议保持不变
- page.tsx 布局要从 DragDropDashboard + TabbedSection 改成单页面 Chat + 滑出面板
- 审计 Tab 已注册但不可见（DEFAULT_CONFIG 迁移代码未提交）
- `src/lib/dashboard/config.ts` 和 `src/stores/dashboard-config-store.ts` 有未提交的 audit 修复

### 未提交改动
```
M src/lib/dashboard/config.ts              — audit 加入 DEFAULT_CONFIG
M src/stores/dashboard-config-store.ts     — localStorage 迁移 audit
```

### 启动命令
```bash
docker start supply-chain-postgres
cd D:\vibe-coding\jiadian_supply\02_LocalDev\2\2.9.3
bun run dev
```

---

## 当前项目状态

| 指标 | 数值 |
|------|------|
| 源文件 (TS/TSX) | 385 |
| 测试文件 | 32 |
| 测试通过 | 530 |
| Agent 引擎 | FSM v2 (6 状态) |
| Provider 适配器 | DeepSeek V4 Pro / OpenAI / Anthropic |
| TypeScript 预存错误 | 5（非 v2 引入） |
| Prisma 模型 | 28 |
| MCP 工具 | 65 |
| TypeScript 错误 | 0 |
| Prisma 模型 | 28 |
| Prisma 版本 | 6.19.3 |
| API 端点 | 62 |
| 数据库 | PostgreSQL 16 |
| MCP 工具 | 65（新增 4 个图表工具） |
| Git 提交 | 150+ |

---

## 最近会话完成的工作（2026-05-21）

### Agent Engine v2 (Phase 10): FSM 状态机 + 语义路由 + Provider 适配器

**架构升级**：ReAct 自由循环 → 6 状态显式 FSM + LLM 语义路由 + Provider 适配器层

**新增模块** `src/lib/agent/`:
- `fsm-types.ts`: FSM 状态、Context、Config、SSE 事件类型定义
- `fsm.ts`: 6 状态机核心 (classify→plan→execute→observe→decide→synthesize) + runAgent 生成器
- `router.ts`: LLM-based 语义路由（替换关键词匹配）
- `adapter.ts`: ProviderAdapter 接口（10 方法）
- `adapter-factory.ts`: 适配器工厂
- `adapters/deepseek.adapter.ts`: DeepSeek V4 Pro（strict mode + 文本回退解析，兜底 11% 泄漏）
- `adapters/openai.adapter.ts`: OpenAI（原生 function calling）
- `adapters/anthropic.adapter.ts`: Anthropic（原生 tool_use + extended thinking）
- `deepseek.adapter.test.ts` (11 tests), `router.test.ts` (7 tests), `fsm.test.ts` (12 tests)

**删除文件**:
- `src/lib/engine/react-agent.ts`（被 FSM 替代）
- `src/lib/services/information-router.ts`（被语义路由替代）
- 相关测试文件

**chat/route.ts**：从 862 行缩减为 130 行，薄 HTTP 层转发到 FSM

**关键设计决策**:
- FSM 模型无关 — 所有 provider 差异在 Adapter 层
- DeepSeek strict mode: `base_url=https://api.deepseek.com/beta`，自动注入 `"strict": true`
- 双重解析器：优先 `tool_calls` 字段，fallback 正则解析文本（兜底 ~11% 泄漏）
- SSE 事件协议保持兼容 — ChatPanel 前端无需改动
- MCP 工具层零改动

**待验证**: FSM v2 在生产环境中对 DeepSeek V4 Pro 的工具调用成功率提升幅度

### Phase 1: 文件拆分 + 硬编码清理

**巨型文件拆分**:
- CostSimulatorEnhanced: 1206 → 686 行，抽 types/constants/compute
- web-search.service: 1100 → 570 行，10 个搜索供应商函数 → providers.ts
- ComplianceTab: 1011 → 845 行，抽 helpers.tsx
- CostTab: 1049 → 957 行，抽 helpers.tsx

**硬编码数据清除**:
- 库存模块 ABC 分类分布卡片（A类3项/B类4项/C类5项全是写死的）→ 已删除
- 库存明细表（与 InventoryDataTable 功能重叠）→ 已删除
- 产品毛利率对比图（50 产品柱状图，无洞察价值）→ 已删除
- 产品周转天数图（取前 8 个不排序，无分析意义）→ 已删除
- 供应商地图：6 供应商坐标 + 2 仓库 + 6 连线 → API 数据驱动
- 销售品类趋势：硬编码 3 品类 → 动态提取 5 品类
- 供应商分析月份：写死 1-6 月 → 当前日期动态生成

### Phase 2: 性能优化

- `next.config.ts`: reactCompiler(已禁用) + optimizePackageImports(24 packages) + useLightningcss + viewTransition + images(avif/webp)
- Prisma v7 尝试 → 回退 v6.19（Turbopack 无法处理 @prisma/adapter-pg → pg → dns 客户端链）
- CostTab 重型组件动态导入（CostSimulatorEnhanced/ExchangeRateMatrix/CostOptimizationPanel）
- Prisma include→select: 16 处 `include: { product: true }` → 移除死 weight（14 处完全不用 product 字段）

### Phase 3: 缓存层抽象化

- `ICacheBackend` 接口（get/set/invalidate/invalidateExact/clear/stats + backendType）
- `MemoryCacheBackend` — 进程内 Map（默认）
- `PostgresCacheBackend` — PostgreSQL UNLOGGED 表（cache_entries）
- `CACHE_BACKEND` 环境变量（memory | postgres | redis planned）
- `ensureCacheBackend()` 通过 `instrumentation.ts` 启动激活
- web-search 孤立 Map 缓存 → 全局 serverCache 统一

### Phase 4: AI 图表生成（ECharts SSR）

**新增模块**: `src/lib/chart/`
- `renderer.ts`: ECharts v6 SSR 渲染引擎，SVG 输出 + sharp PNG 转换
- `analyze-chart.ts`: 复合工具——选指标+维度 → 自动查 DB → 返回图表 URL
- `report-generator.ts`: 4 种报告模板（inventory_health/cost_analysis/sales_overview/full_health），一键 2-6 图

**新增 MCP 工具** (3 个):
- `generate_chart`: 手工指定数据画图（bar/line/pie/scatter）
- `analyze_and_chart`: 选指标+维度自动查库出图
- `generate_report`: 一键生成含 2-6 图的分析报告

**已知问题**: DeepSeek V4 工具调用可靠性 74.3%，图表请求时可能编造 URL 而非调 MCP 工具。已实现服务器端预生成+响应后注入（`chat/route.ts`），待验证。

### Phase 5: Chat 面板增强

- **思考过程面板**: 可展开的 🧠 面板，显示耗时、工具调用链、ReAct 步数、Tier 层级
- **图片渲染**: 支持 `![alt](url)` 和 `/charts/` URL 自动渲染为 `<img>` 标签
- **工具引用格式**: Prompt 改为中文功能描述（"安全库存计算" 替代 `calculate_safety_stock`）

### Phase 6: 搜索 + 路由器修复

- webSearch() 降级链: DDG/Wikipedia 加入 fallback（原来只有 Reddit/GitHub/HN）
- information-router: "走势/趋势/预测/forecast/trend" → news_event (Tier 3)，触发搜索
- Tie-breaking: Tier 3 优先于 Tier 1（同分时）

### Phase 7: Date 类型 Bug 修复

多个文件用 `toISOString().split('T')[0]` 生成字符串传给 Prisma DateTime 字段：
- `inventory.service.ts`: cutoffDate → Date
- `cascade-risk.main.ts`: expiryDate lte → Date
- `cascade-risk.propagation.ts`: date gte → Date
- `context-builder.ts`: expiryDate lte → String（反向修复）
- `stats.queries.ts`: startDateStr/endDateStr → new Date()

### Phase 8: 数据库 + 种子数据

- PostgreSQL 部署（D 盘 Pgsql）
- 50 产品精简种子：4 品类 × 5 子类，价格 8-1299 元，库存状态覆盖 healthy/warning/critical/overstock
- 11248 销售记录、238 货运、20 缺陷、30 合规证书

### Phase 9: 开发流程建立

三步工作流（已存入 memory）:
1. 干活前写一行目标
2. 每改完独立单元跑 tsc + test
3. 改完后审计自查，不蔓延新问题

---

## 关键命令

```bash
# 启动
bun run dev                     # 自动启动 SearXNG + Next.js

# 质量检查
bun run test                     # 647 tests
npx tsc --noEmit                 # 0 errors

# 数据库
bun run db:push                  # 推送 schema
bun run db:generate              # 重新生成 Prisma Client
PGPASSWORD=supplychain /d/Pgsql/pgsql/bin/psql -h localhost -U supplychain -d supply_chain
# PostgreSQL 启动: /d/Pgsql/pgsql/bin/postgres -D /d/Pgsql/pgsql/data -p 5432 &

# 种子数据
bun run prisma/seed-compact.ts   # 50 产品精简种子（需先清表）
```

---

## 重要文件索引

| 文件 | 用途 |
|------|------|
| `next.config.ts` | 性能配置（optimizePackageImports, useLightningcss, viewTransition） |
| `prisma/schema.prisma` | 28 模型，PostgreSQL |
| `src/lib/cache.ts` | 缓存抽象层（ICacheBackend + MemoryCacheBackend） |
| `src/lib/cache-postgres.ts` | PostgreSQL 缓存后端 |
| `src/lib/chart/renderer.ts` | ECharts SSR 渲染引擎 |
| `src/lib/chart/analyze-chart.ts` | 自动查库+出图 |
| `src/lib/chart/report-generator.ts` | 报告模板 |
| `src/lib/db.ts` | PrismaClient 初始化 |
| `src/instrumentation.ts` | 启动钩子（scheduler + ensureCacheBackend） |
| `src/app/api/chat/route.ts` | Chat API（ReAct + 图表预生成） |
| `src/app/api/chat/chat.prompt.ts` | 系统提示词（MARC 协议 + 工具声明） |
| `src/lib/services/information-router.ts` | 意图分类 + 路由 |
| `src/lib/services/web-search.service.ts` | 多源搜索 |
| `src/components/shared/ChatPanel.tsx` | Chat 面板（思考过程 + 图片渲染） |
| `src/components/shared/ChatPanel.helpers.tsx` | Markdown 渲染 + 图片支持 |

---

## 已知的坑

1. **DeepSeek 图表工具调用不可靠**（74.3% 成功率）→ 已实现服务器预生成作为 workaround
2. **Prisma v7 无法升级** → Turbopack 把 `@prisma/adapter-pg → pg → dns` 追踪到客户端 bundle
3. **cacheComponents 与 8 个 force-dynamic 路由冲突** → 已禁用，待迁移 `'use cache'` 后启用
4. **ComplianceCert.expiryDate 是 String 而非 DateTime** → 所有日期比较需用 `.toISOString().split('T')[0]`
5. **canvas npm 包 Windows 编译困难** → 用 ECharts SSR（SVG）+ sharp（PNG）替代
