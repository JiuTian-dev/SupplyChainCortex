# SupplyChain Cortex — 全面优化交接文档

> 日期: 2026-05-19 ~ 2026-05-20  
> 范围: 全项目数据库/类型/安全/测试/前端/UX/分析  
> 状态: 零 tsc 错误, 32 测试文件 647 测试 100% 通过

---

## 一、项目最终状态

| 指标 | 数值 |
|------|------|
| 源文件 (TS/TSX) | 387 |
| 测试文件 | 32 |
| 测试通过 | 647 |
| TypeScript 错误 | 0 |
| Prisma 模型 | 28 |
| API 端点 | 62 |
| 数据库 | PostgreSQL 16 (唯一方案) |
| 前端交互组件 | 34 (已减 10) |

---

## 二、本次会话完成的所有工作

### 阶段 1: 数据库统一 + 类型安全
- **PostgreSQL 唯一化**: 删除 SQLite/MySQL schema (3个文件, ~1200行), switch-db.ts (269行), DB_TYPE 变量
- **DateTime 迁移**: SalesRecord.date / ShipmentItem.eta/actualDelivery / DefectRecord.detectedAt String→DateTime
- **外键级联**: 5 个 onDelete: Cascade (Product→Inventory/CostRecord/SalesRecord/ShipmentItem/CostRecord)
- **连接池**: PrismaClient 自动注入 connection_limit=5
- **新增 5 个 Prisma 模型**: ProductHSCode, TariffRule, DecisionLog, FeedbackLog, EngineWeight
- **tsconfig**: noImplicitAny: true
- **ESLint**: no-unused-vars: warn

### 阶段 2: 安全 + 输入净化
- **sanitize.ts 集成**: getStringParam/getNumberParam/sanitizeObject 等 8 个净化函数加入 api-utils
- **validateBody 自动净化**: 所有 POST/PUT 路由自动 sanitize 请求体
- **Python bridge 校验**: 24 个工具的 Zod schema (src/lib/validators/supply-chain-tools.ts)
- **Docker Python**: 生产镜像安装 python3 + py3-numpy + 复制 mcp-server/
- **docker-compose**: PG 端口绑定 127.0.0.1, 移除 MySQL 服务
- **备份**: scripts/backup-db.sh + backup-db.ps1

### 阶段 3: Chat + Search 系统修复
- **Anthropic Provider**: 完整实现 Messages API 翻译层 (流式+非流式)
- **代码去重**: formatToolResult/DEFAULT_TOOL_ACTIONS→shared tool-formatters.ts
- **系统提示词合并**: react-agent.ts 导入 chat.prompt.ts
- **中英关键词映射合并**: web-search-keywords.ts
- **ReAct 上下文窗口预算**: 64K 阈值自动摘要
- **3字符流式→200字符**: CJK 安全
- **搜索缓存**: 60s TTL LRU, 100 条
- **Prompt injection 防护**: sanitizeForLLM 过滤 14 种注入模式
- **搜索失败日志**: SearchDiagnostics 追踪
- **新增 108+ 测试**: chat.helpers, information-router, web-search-rewriter/reranker/guard/cross-validator, episode-store

### 阶段 4: 巨型文件拆分
- **InventoryTab** 70KB → 571行 + 5 个子组件
- **SupplierTab** 60KB → 608行 + 3 个子组件
- **cascade-risk** 66KB → 18行 barrel + 6 个模块文件
- **chat/route** 50KB → 829行 + chat.prompt.ts + chat.helpers.ts

### 阶段 5: 用户端三大功能
- **批量操作**: use-batch-selection hook + BatchActionsToolbar + 库存/供应商表复选框
- **自定义仪表板**: @dnd-kit 拖拽排序 + ConfigToolbar 布局 Sheet + localStorage 持久化
- **一键导出报告**: report-export.service (CSV/Excel/PDF) + ExportMenu + Dashboard 综合报告

### 阶段 6: 成本模块专业升级
- **利润影响模拟器** (603→1204行):
  - 龙卷风敏感度图 (各因素 ±10% 弹性)
  - 6 个场景预设 (贸易战/原材料危机/RMB升值/运费飙升/全面压力)
  - 场景对比模式 (Baseline vs Scenario B)
  - 毛利桥接瀑布图
  - 筛选+导出
- **成本变动追踪** (5 个新图表):
  - 堆叠面积趋势图 (12月5层)
  - 差异瀑布图
  - 驱动因素环图 + 点击下钻
  - 产品×月份热力图 + 自定义阈值
  - Top 变动排行榜
- **KPI 摘要条** + 快跳导航
- **减法**: 删除 CostWaterfallChart(第3个瀑布图), 3 个区块默认折叠

### 阶段 7: 减法审计 + CI/工具
- **前端减法**: 删除 6 个死代码组件, 修复 QualityTab/ComplianceTab 注册
- **pre-commit**: Husky + lint-staged (tsc --noEmit + eslint --fix)
- **MARC 后处理验证**: marc-validator.ts 自动检测+修复缺失的来源/置信度标签
- **僵尸依赖**: 移除 z-ai-web-dev-sdk

### 阶段 8: 全面审计报告 (9 份)
1. `AUDIT_REPORT.md` — 全项目 v1.0→v1.1 审计 (72→89分)
2. `CHAT_SEARCH_AUDIT.md` — Chat+Search 安全审计 (67分)
3. `SEARCH_PIPELINE_AUDIT.md` — 搜索管道深度审计
4. `CHAT_CAPABILITY_REPORT.md` — AI 助手 30 场景能力评估 (86分)
5. `SEARCH_CAPABILITY_REPORT.md` — 联网搜索 25 场景评估 (87分)
6. `VISUAL_UX_REPORT.md` — 前端视觉 22 场景评估 (82分)
7. `USER_UX_REPORT.md` — 四角色用户视角评估 (73分)
8. `SUBDUCTION_AUDIT.md` — 前端减法审计
9. `COST_MODULE_EVAL.md` — 成本模块专业评估 (79分)

---

## 三、当前评分卡

| 审计维度 | v1.0 | v1.1 (本次后) |
|---------|------|--------------|
| 全项目综合 | 72 | **89** |
| 安全性 | 55 | **78** |
| 代码质量 | 75 | **90** |
| 类型安全 | 60 | **90** |
| 可维护性 | 70 | **85** |
| Chat+Search | N/A | **67** (待升) |
| 前端开发者视角 | N/A | **82** |
| 前端用户视角 | N/A | **73** |
| 联网搜索能力 | N/A | **87** |
| 成本模块专业性 | 56 | **88** (冲刺后) |

---

## 四、下一步建议

### 立即 (P0)
- [ ] 轮换 .env 中的真实 API 密钥 (DeepSeek/Fred/AlphaVantage/NEXTAUTH_SECRET)
- [ ] 将 .env 加入 .gitignore 确认已生效

### 短期 (P1)
- [ ] 公共 SearXNG 池添加 isSafeUrl SSRF 防护
- [ ] 速率限制器竞态条件修复 (原子扣减)
- [ ] CSP 移除 unsafe-inline (改用 nonce)
- [ ] Bootstrap 认证绕过限制 localhost

### 中期 (P2)
- [ ] UserManagementPanel 移到独立 /admin 路由
- [ ] 移动端表格溢出 → 卡片布局
- [ ] ARIA 无障碍标签
- [ ] 404 页面品牌化
- [ ] E2E 测试补充

---

## 五、关键命令

```bash
# 启动
docker compose up -d postgres
bun run dev

# 测试
bun run test                    # 647 tests
npx tsc --noEmit                # 0 errors

# 数据库
bun run db:push                 # 推送 schema
bun run db:seed                 # 种子数据
bun run db:migrate              # 迁移

# 备份
./scripts/backup-db.sh          # Linux/Mac
.\scripts\backup-db.ps1          # Windows

# 提交 (pre-commit hook 自动运行)
git commit

# 评估脚本
bun run scripts/evaluate-chat.ts      # AI 助手能力评估
bun run scripts/evaluate-search.ts    # 联网搜索评估
node scripts/visual-eval.js            # 前端截图评估
```

---

## 六、新增/修改的关键文件索引

### 新建文件 (本次会话)
| 文件 | 用途 |
|------|------|
| `src/lib/validators/supply-chain-tools.ts` | 24 个 Python 工具 Zod 校验 |
| `src/lib/mcp/tool-formatters.ts` | formatToolResult 共享模块 |
| `src/lib/services/marc-validator.ts` | MARC 协议后处理验证 |
| `src/lib/services/report-export.service.ts` | CSV/Excel/PDF 导出 |
| `src/lib/services/batch-export.service.ts` | 批量导出 |
| `src/lib/services/web-search-keywords.ts` | 中英关键词映射 |
| `src/hooks/use-batch-selection.ts` | 批量选择 Hook |
| `src/components/shared/BatchActionsToolbar.tsx` | 浮动批量操作栏 |
| `src/components/shared/ExportMenu.tsx` | 导出下拉菜单 |
| `src/components/dashboard/DragDropDashboard.tsx` | 拖拽排序仪表板 |
| `src/components/inventory/InventoryDetailDialog.tsx` | 库存详情 |
| `src/components/inventory/InventoryProcurementSection.tsx` | 采购模块 |
| `src/components/inventory/InventoryWarehouseCapacity.tsx` | 仓库容量 |
| `src/components/inventory/InventorySlowMovingAlert.tsx` | 慢动预警 |
| `src/components/supplier/SupplierPerformancePanel.tsx` | 供应商绩效 |
| `src/components/supplier/SupplierReorderOrders.tsx` | 补货订单 |
| `src/components/supplier/SupplierDetailDialog.tsx` | 供应商详情 |
| `src/lib/services/cascade-risk.types.ts` | 级联风险类型 |
| `src/lib/services/cascade-risk.calibration.ts` | 校准模块 |
| `src/lib/services/cascade-risk.propagation.ts` | 传播模块 |
| `src/lib/services/cascade-risk.validation.ts` | 验证模块 |
| `src/lib/services/cascade-risk.main.ts` | 主编排 |
| `src/app/api/chat/chat.prompt.ts` | 系统提示词 |
| `src/app/api/chat/chat.helpers.ts` | 聊天助手函数 |
| `prisma/migrations/1_date_fields_and_cascades/migration.sql` | 日期+级联迁移 |
| `scripts/backup-db.sh` | 备份脚本 (Linux) |
| `scripts/backup-db.ps1` | 备份脚本 (Windows) |
| `scripts/evaluate-chat.ts` | AI 评估脚本 |
| `scripts/evaluate-search.ts` | 搜索评估脚本 |
| `scripts/visual-eval.js` | 前端视觉评估 |
| `.husky/pre-commit` | Git hook |

### 新增测试文件 (108+ 测试)
| 文件 | 测试数 |
|------|--------|
| `src/lib/services/cascade-risk.test.ts` | +35 (新增敏感性/自定义规则/解释/预防/天气) |
| `src/lib/engine/rag.test.ts` | +30 (新增 tokenize/getScore/evolveFromFeedback) |
| `src/lib/engine/react-agent.test.ts` | +34 (新增 parseToolCalls/stripToolCalls/formatToolResult) |
| `src/lib/engine/episode-store.test.ts` | +16 |
| `src/app/api/chat/chat.helpers.test.ts` | +17 |
| `src/lib/services/information-router.test.ts` | +17 |
| `src/lib/services/web-search-rewriter.test.ts` | +14 |
| `src/lib/services/web-search-reranker.test.ts` | +13 |
| `src/lib/services/web-search-cross-validator.test.ts` | +13 |
| `src/lib/services/web-search-guard.test.ts` | +18 |

### 删除文件 (~1600行)
- `prisma/schema.sqlite.prisma` (413行)
- `prisma/schema.mysql.prisma` (~400行)
- `prisma/schema.postgresql.prisma` (~430行)
- `scripts/switch-db.ts` (269行)
- `src/components/dashboard/PassportPanel.tsx`
- `src/components/shared/SupplyChainScoreCard.tsx`
- `src/components/shared/QuickActions.tsx`
- `src/components/shared/ProductCompareDialog.tsx`
- `src/components/admin/DatabaseConfigPanel.tsx`
- `src/components/layout/Footer.tsx`
- `src/components/cost/CostWaterfallChart.tsx`

---

## 七、下次打开时的验证步骤

```bash
# 1. 确认环境
docker compose up -d postgres
curl http://localhost:3000          # 应返回 200

# 2. 确认代码健康
npx tsc --noEmit                    # 应返回 0 错误
bun run test                        # 应返回 647 passed

# 3. 打开浏览器
http://localhost:3000
# 检查: 仪表板加载, 成本标签页有新图表, 聊天面板可用

# 4. 查看报告
ls docs/handovers/                  # 本交接文档
ls *.md                             # 9 份审计报告
```
