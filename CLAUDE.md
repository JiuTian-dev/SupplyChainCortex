# SupplyChain Cortex — AI 协作指南

## 项目概要

小家电跨境供应链决策智能平台。Next.js 16 App Router 单页应用，9 个业务标签页，61 个 MCP 工具，6 层决策智能架构。

## 技术栈

| 层次 | 技术 |
|------|------|
| 框架 | Next.js 16 App Router + TypeScript 5 |
| UI | Tailwind CSS 4 + shadcn/ui + Recharts |
| 数据库 | PostgreSQL 16 + Prisma ORM（28 模型） |
| 状态 | Zustand 5 + TanStack React Query 5 |
| AI | DeepSeek/OpenAI/Anthropic/Ollama（ReAct Agent） |
| 数学引擎 | Python 3 + NumPy（24 个 OR 模型，通过 `mcp-server/bridge.py` 调用） |
| 搜索 | SearXNG 自托管 + 多源并行竞速 |
| 实时 | SSE（替代 WebSocket） |
| 测试 | Vitest 4（647 测试）+ Playwright |

## 关键目录

```
src/
├── app/api/chat/          # ReAct Agent（route.ts + chat.prompt.ts + chat.helpers.ts）
├── app/api/supply-chain/  # 24 个数学工具动态路由
├── lib/engine/            # 因果推理、ReAct、RAG、校准
├── lib/services/          # 业务服务层（cascade-risk 已拆为 6 模块）
├── lib/sources/           # 外部数据源爬取
├── lib/mcp/               # MCP 工具注册
├── lib/queries/           # Prisma 查询
├── lib/validators/        # Zod schema（含 supply-chain-tools.ts）
├── components/dashboard/  # MonitorStrip, DragDropDashboard, MCPConnectorCard
├── components/inventory/  # InventoryTab + 5 子组件
├── components/cost/       # CostTab, CostSimulatorEnhanced（1204行）
├── components/supplier/   # SupplierTab + 3 子组件
└── components/shared/     # ChatPanel（右侧抽屉）, BatchActionsToolbar, ExportMenu
mcp-server/
├── bridge.py              # Node.js → Python 桥接
└── supply_math/           # 10 个数学模块（inventory/forecasting/simulation/...）
```

## 常用命令

```bash
# 环境启动
docker compose up -d postgres          # 数据库
bun run dev                           # 开发服务器

# 代码质量
bun run test                          # 647 tests
npx tsc --noEmit                      # 类型检查（当前有 node_modules 类型兼容问题）
bun run lint                          # ESLint

# 数据库
bun run db:push                       # 推送 schema
bun run db:seed                       # 170 产品 + 62K 销售记录
bun run db:migrate                    # 迁移

# 备份
./scripts/backup-db.sh                # Linux/Mac
.\scripts\backup-db.ps1               # Windows
```

## 开发约定

- **功能不冗余，前端表达精简实用。** 每新增功能前先检查是否已有类似实现。代码比功能数更值得骄傲。
- 编辑文件前先用 Read 读取，编辑用 Edit（非 sed/awk）
- 提交前确认 `npx tsc --noEmit` 和 `bun run test` 通过
- 大文件严格分层：单文件不超过 600 行业务逻辑，复杂模块拆分子组件/子模块
- 已配置 pre-commit hook（Husky + lint-staged），ESLint max-warnings 999
- 数据库统一用 PostgreSQL，不存在 SQLite/MySQL 分支

## 识图能力

底层模型不具备原生识图能力。遇到图片时不要用 Read 工具读取图片，改用：

```
node ~/.claude/vision/vision.js "<图片路径>" "用中文描述这张图片"
node ~/.claude/vision/vision.js --url "<图片链接>" "用中文描述这张图片"
```

## 版本

当前版本：v1.1.0 · Git: `https://github.com/JiuTian-dev/SupplyChainCortex.git` main 分支
