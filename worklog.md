# Supply MCP Tool - 项目交接文档

## 项目当前状态描述/判断

**状态：稳定运行，v0.7.2+，MCP连接器卡片已恢复**

小家电供应链管理工具，基于 Next.js 16 App Router + TypeScript + Tailwind CSS + shadcn/ui + Prisma + Recharts。9个业务标签页、14个MCP工具、SSE实时推送、AI对话面板。

## 当前目标/已完成的修改/验证结果

### 本轮修改（v0.7.3）
1. **恢复MCP连接器状态卡片** — 创建 `MCPConnectorCard.tsx` 组件并重新集成到仪表盘
   - 紧凑型连接器状态网格（1/2/3列响应式）
   - SSE连接状态指示 + 重连按钮
   - 汇总统计（在线数、平均延迟、最近同步时间）
   - 每个连接器：状态脉冲点、名称、状态徽章、延迟、同步记录数
   - Tooltip 显示完整详情
   - 橙色主题匹配仪表盘风格

### 验证结果
- ✅ ESLint 0 错误
- ✅ Dev 服务器编译成功
- ✅ MCP连接器卡片渲染正常

---

## 项目重要迭代历程

### v0.1.x — 项目初始化
- Next.js 16 App Router 脚手架搭建
- 基础供应链仪表盘布局
- Mock 数据层

### v0.2.x — 核心业务模块
- 库存优化标签页（库存列表、预警、安全库存、再订购点）
- 成本监控标签页（成本结构、到岸成本、毛利分析）
- 物流追踪标签页（货运地图、状态追踪、延误风险）
- 销售分析标签页（销售汇总、品类对比、日历热力图）
- 供应商管理标签页（评分体系、履约跟踪）

### v0.3.x — MCP 数据管道 & AI
- 14个 MCP 工具注册（查询类8个 + 操作类6个）
- Chat AI 多模型接入（SSE 流式 + 关键词 fallback）
- MCP REST API（GET 工具列表 / POST 执行工具）
- API 限流 + RBAC 权限控制

### v0.4.x — 数据库 & 实时
- Prisma ORM + SQLite 集成
- SSE 实时推送（替代 WebSocket）
- 数据库种子脚本 + 迁移
- 25+ API 路由

### v0.5.x — 质量与安全
- 用户认证 + RBAC 权限体系
- 全局 Error Boundary + 离线提示
- 安全头部加固（X-Frame-Options、CSP）
- API 限流 + 输入验证（Zod）

### v0.6.x — 新增业务板块
- 质量管理标签页（缺陷分析、退货帕累托）
- 合规资质标签页（认证追踪、法规预警）
- 风险采购标签页（风险矩阵、场景模拟）

### v0.7.0 — 代码质量 & 部署
- 45个 TypeScript 编译错误修复 → 0个
- Docker 3阶段生产构建配置
- GitHub Actions CI Pipeline
- 代码分割与懒加载优化
- 环境变量与部署配置

### v0.7.1 — 浏览器访问修复（关键里程碑）
- **根因1**: `X-Frame-Options: DENY` → 改为 `ALLOWALL`
- **根因2**: CSP `frame-ancestors none` → 允许 `.z.ai`
- **根因3**: 跨域策略 `same-origin` → 注释过严策略
- 开发服务器 double-fork 启动脚本解决进程崩溃
- Git 推送 commit `ceabe93`

### v0.7.2 — UI 精简优化
- 仪表盘从968行→~280行，移除7个冗余区块
- 保留核心：评分卡、风险摘要、指标卡片、流向图、趋势图、操作记录
- 新增快速导航卡片
- 库存标签页仓库面板合并
- MCP连接器卡片被移除（本轮恢复）

### v0.7.3 — MCP 连接器恢复（当前）
- 恢复 MCP 连接器状态卡片（紧凑版，带SSE连接状态）
- 重建工作日志

---

## 技术架构概要

| 层次 | 技术 |
|------|------|
| 框架 | Next.js 16 App Router |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 数据库 | Prisma ORM + SQLite |
| 状态 | Zustand + TanStack Query |
| 图表 | Recharts |
| 实时 | SSE（替代WebSocket） |
| AI | z-ai-web-dev-sdk（LLM/VLM/TTS/ASR） |
| 认证 | NextAuth.js v4 + RBAC |
| 部署 | Docker + GitHub Actions |

### 关键文件

| 文件 | 作用 |
|------|------|
| `src/app/page.tsx` | 单页应用入口（9标签页） |
| `src/components/dashboard/DashboardTab.tsx` | 仪表盘标签页 |
| `src/components/dashboard/MCPConnectorCard.tsx` | MCP连接器状态卡片 |
| `src/components/dashboard/DashboardLayoutManager.tsx` | 可拖拽排序布局 |
| `src/lib/mcp/tools.ts` | 14个MCP工具注册 |
| `src/lib/constants.ts` | MCP_CONNECTORS等常量 |
| `src/lib/types.ts` | 全局类型定义 |
| `src/stores/connection-store.ts` | 连接器状态Zustand store |
| `src/app/api/chat/route.ts` | AI对话API（SSE流式） |
| `src/app/api/mcp/route.ts` | MCP工具执行API |
| `src/middleware.ts` | 安全头部配置 |

---

## 未解决问题或风险，建议下一阶段优先事项

### 遗留风险
1. **开发服务器进程稳定性**：需 `(bun run dev &)&` double-fork 启动
2. **安全头部过于宽松**：生产环境应恢复更严格策略
3. **MCP连接器数据为静态**：`MCP_CONNECTORS` 常量数据未接入真实监控

### 待办任务（优先级排序）
1. **Docker 部署验证**
2. **质量管理板块增强**（退货原因帕累托、质保成本、缺陷分析深化）
3. **销售分析**（季节性指数功能）
4. **库存优化**（库存资金占用分析）
5. **合规资质模块**（合规认证追踪 + 法规变更预警）
6. **MCP连接器真实数据接入**（替换静态常量为动态监控）
7. **分类销售趋势对比卡片**（按实际业务逻辑重新优化）

### v0.7.4 — AI 代码质量重构（2026-04-27）
- ESLint 规则恢复：启用 `no-unused-vars`(warn)、`react-hooks/exhaustive-deps`(error)、`prefer-const`(warn) 等核心规则
- 类型定义统一：`mock-data.ts` 中的 `InventoryRecord`/`CostRecord`/`DashboardMetrics`/`ShipmentRecord` 改为从 `@/lib/types` 导入
- Zustand Store 拆分：新建 `useSupplierUIStore`、`useInventoryUIStore`、`useDashboardUIStore` 领域 store，原 `ui-store.ts` 标记为 deprecated
- CSV 解析器重构：手动解析 → papaparse 库，修复多行引号字段 bug
- `any` 类型清理：`auth.ts`/`auth-helpers.ts` 移除 `as any`，新建 `api-unwrap.ts` 工具函数
- `revenueGrowth` 动态计算：`dashboard.service.ts` 和 `mock-data.ts` 不再硬编码 12.5
- 安全头收紧：`X-Frame-Options: SAMEORIGIN`，CSP 移除 `.z.ai` 白名单
- `SupplyChainFlowChart` 新增 `nodes`/`links` props 支持动态数据
- 关键函数补充 JSDoc（`calculateSafetyStock`、`forecastDemand`、`detectSalesAnomaly` 等）

### 版本
- 当前版本：v0.7.4
- Git 仓库：`https://github.com/JiuTian-dev/SupplyChainCortex.git` main 分支
