# SupplyChain Cortex — 项目交接文档

> 最后更新: 2026-05-20  
> 当前版本: v1.1.0  
> 状态: 零 tsc 错误, 32 测试文件 647 测试 100% 通过

---

## 当前项目状态

| 指标 | 数值 |
|------|------|
| 源文件 (TS/TSX) | 387 |
| 测试文件 | 32 |
| 测试通过 | 647 |
| TypeScript 错误 | 0 |
| Prisma 模型 | 28 |
| Prisma 版本 | 7.8.0 |
| API 端点 | 62 |
| 数据库 | PostgreSQL 16 |
| Git 提交 | 133+ |

---

## 最近会话完成的工作

### 会话 2 — 2026-05-20（文件拆分 + 缓存抽象 + 性能优化）

#### Phase 1: 文件拆分
- `CostSimulatorEnhanced.tsx`: 1206 → 686 行，抽 types/constants/compute
- `web-search.service.ts`: 1100 → 570 行，10 个搜索供应商函数 → providers.ts
- `ComplianceTab.tsx`: 1011 → 845 行，抽 helpers.tsx
- `CostTab.tsx`: 1049 → 957 行，抽 helpers.tsx
- 新建 8 个 helper 文件，零 tsc 错误

#### Phase 2: 缓存层抽象化
- `ICacheBackend` 接口（get/set/invalidate/invalidateExact/clear/stats + backendType）
- `MemoryCacheBackend` — 进程内 Map（默认）
- `PostgresCacheBackend` — PostgreSQL UNLOGGED 表（`cache_entries`）
- `CACHE_BACKEND` 环境变量切换（memory | postgres | redis planned）
- `ensureCacheBackend()` 通过 `instrumentation.ts` 启动时激活
- web-search 孤立 Map 缓存 → 全局 serverCache 统一
- 演进路径: memory → postgres → redis

#### Phase 3: 性能优化
- `next.config.ts`: reactCompiler + cacheComponents + optimizePackageImports(24 packages) + useLightningcss + clientSegmentCache + viewTransition + images(avif/webp)
- Prisma v6.19 → v7.8: `prisma.config.ts` 新建，`PrismaPg` adapter
- CostTab: CostSimulatorEnhanced/ExchangeRateMatrix/CostOptimizationPanel → dynamic import
- Query: 16 处 `include: { product: true }` 移除（14 处死代码 + 2 处 select 替代）

#### Phase 4: 文档更新
- README: v1.0/v1.1 Release Notes 分层，版本号统一
- CLAUDE.md: 项目概要、技术栈、目录结构、命令速查
- HANDOVER.md: 项目根目录（本文档）

### 会话 1 — 2026-05-19（v1.1.0 全面冲刺）

详见 `docs/handovers/2026-05-19_20_SupplyChain-Cortex-全面优化交接文档.md`

- 数据库统一: PostgreSQL 唯一化，5 外键级联，5 新模型
- Chat+Search: Anthropic Provider、搜索缓存、MARC 置信度、多源并行搜索
- 文件拆分: InventoryTab/SupplierTab/cascade-risk/chat-route
- 用户端: 批量操作工具栏、dnd-kit 仪表板、一键导出
- 成本模块: 利润模拟器、成本追踪 5 图表、测试 356→647

---

## 关键命令

```bash
# 启动
docker compose up -d postgres   # 或本地 PG
bun run dev

# 质量检查
bun run test                     # 647 tests
npx tsc --noEmit                 # 0 errors

# 数据库
bun run db:push                  # 推送 schema
bun run db:generate              # 重新生成 Prisma Client
bun run db:seed                  # 200 产品 + 67K 销售记录

# 备份
./scripts/backup-db.sh           # Linux/Mac
.\scripts\backup-db.ps1          # Windows
```

---

## 重要文件索引

| 文件 | 用途 |
|------|------|
| `prisma.config.ts` | Prisma v7 配置（数据库连接、迁移路径） |
| `src/lib/cache.ts` | 缓存抽象层（ICacheBackend + MemoryCacheBackend） |
| `src/lib/cache-postgres.ts` | PostgreSQL 缓存后端 |
| `src/lib/db.ts` | PrismaClient 初始化（PrismaPg adapter） |
| `src/instrumentation.ts` | 启动钩子（scheduler + ensureCacheBackend） |
| `next.config.ts` | 全功能性能配置 |

---

## 开发工作流（已建立）

每次会话按三步节奏：
1. 干活前写一行目标（目标、范围、验证方式）
2. 每改完独立单元跑 `tsc --noEmit` + `bun run test`
3. 改完后审计自查，不蔓延新问题
