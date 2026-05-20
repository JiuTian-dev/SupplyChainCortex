# SupplyChain Cortex — 前端交互功能减法审计

> 审计日期: 2026-05-20 | 方法: 逐组件阅读 + 依赖追踪 | 结论: **应该做减法**

---

## 一、全景

| 分类 | 数量 |
|------|------|
| 入口/布局 | 2 |
| 仪表板面板 (决策区) | 7 |
| Ops 标签页 | 8 |
| 全局弹窗/抽屉 | 10 |
| 共享 UI 组件 | 10 |
| 认证/管理 | 5 |
| 布局 (Header/Footer) | 2 |
| **总计** | **44** |

---

## 二、应该砍掉的 6 个组件

### 1. PassportPanel — 死代码
- **位置**: `src/components/dashboard/PassportPanel.tsx`
- **现状**: 已导出、已在 panel-registry 注册，但 **page.tsx 中没有任何地方渲染它**
- **替代**: ChatPanel 在 AI 响应中内联显示完全相同的决策护照数据
- **建议**: 🔴 **删除**

### 2. SupplyChainScoreCard — 死代码
- **位置**: `src/components/shared/SupplyChainScoreCard.tsx`
- **现状**: 功能完整的健康评分环形仪表，但 **page.tsx 中未渲染**
- **替代**: MonitorStrip 已经在页面顶部显示健康评分
- **建议**: 🔴 **删除**

### 3. DatabaseConfigPanel — 对用户无价值
- **位置**: `src/components/admin/DatabaseConfigPanel.tsx`
- **现状**: 只读卡片，显示 "当前数据库类型: PostgreSQL"
- **问题**: 这是运维信息，不应该在前端给用户看
- **建议**: 🔴 **删除**（运维信息放在管理后台或环境变量中）

### 4. UserManagementPanel — 位置不对
- **位置**: `src/components/admin/UserManagementPanel.tsx`
- **现状**: 作为侧边抽屉覆盖层嵌入仪表板
- **问题**: 用户管理应该是独立的管理页面，不是覆盖层
- **建议**: 🟡 **保留但移到 `/admin/users` 路由**（本次不做，标记为技术债）

### 5 & 6. QualityTab + ComplianceTab — 无法访问
- **位置**: `src/components/quality/QualityTab.tsx` + `src/components/compliance/ComplianceTab.tsx`
- **现状**: 两个功能完整的标签页，但都不在 `TabbedSection.tsx` 的 `PANEL_COMPONENTS` 映射中
- **问题**: 用户无法通过任何导航路径访问这两个标签页
- **建议**: 🟡 **修复注册** → 加入 TabbedSection（本次做）

---

## 三、应该合并的 3 组重叠功能

### 1. QuickActions 浮动栏 ↔ Header 工具栏
| QuickActions | Header |
|-------------|--------|
| 刷新 | ✅ Header 已有刷新按钮 |
| 导出 | ✅ Header 已有导出下拉菜单 |
| 通知 | ✅ Header 已有通知铃铛 |
| 搜索 | ✅ Header 已有搜索按钮 (Ctrl+K) |
| 对比 | ⚠️ ProductCompareDialog 未正常传参 |

**结论**: QuickActions 100% 重复。建议 🔴 **删除 QuickActions**。

### 2. DragDropDashboard ↔ ConfigToolbar 布局 Sheet
- 两者都用 @dnd-kit 做拖拽排序
- 两者都控制面板的可见性和顺序
- ConfigToolbar 的 Sheet 已经是一个完整的布局编辑器

**结论**: DragDropDashboard 的拖拽交互增加了一层复杂度，但 ConfigToolbar 的 Sheet 已经解决同样的问题。建议 🟡 **保留 DragDropDashboard**（主页面快速拖拽有独立价值），但移除 ConfigToolbar Sheet 中重复的拖拽排序。

### 3. ProductCompareDialog — props 空洞
- `ProductCompareDialog` 接受 `inventoryData`/`costData`/`salesData` props
- **page.tsx 不传递任何这些 props** — 组件以空数据渲染
- QuickActions 中的"对比"按钮会打开一个有雷达图但无数据的对话框

**建议**: 🔴 **删除 ProductCompareDialog**（或者修复数据传递，但考虑到复杂度，删除是更好的选择）

---

## 四、建议保留但需要注意的组件

| 组件 | 保留理由 | 风险 |
|------|---------|------|
| SandboxReplay | 仿真回放是差异化功能 | 使用频率低，可折叠默认收起 |
| NotesPanel | 唯一笔记管理入口 | 确保入口可见 |
| CSVImportDialog | 数据迁移必要 | 确保模板下载链接有效 |
| AlertRulesDialog | 预警规则配置 | 入口不明显（齿轮图标） |

---

## 五、减法后的结构

```
保留 34 个组件 (↓10)

入口/布局 (2): layout, page
决策面板 (6): ConfigToolbar, MonitorStrip, DecisionCenter, MCPConnector, SandboxReplay, DragDropDashboard
Ops标签 (8): Inventory, Cost, Logistics, Sales, Supplier, Risk, Quality, Compliance ← 后两个修复注册
全局弹窗 (7): ChatPanel, NotificationCenter, ProductDetailSheet, NotesPanel, CSVImport, GlobalSearch, AlertRules
共享组件 (8): ExportMenu, BatchActionsToolbar, FilterChips, VirtualList, MetricCard, ActionCard, ScrollToTop
认证 (3): LoginDialog, UserMenu, PasswordChangeDialog
布局 (1): Header
管理 (1): UserManagementPanel → 未来移到独立路由

删除 (10): PassportPanel, SupplyChainScoreCard, DatabaseConfigPanel, QuickActions, ProductCompareDialog, Footer, UserManagementPanel(移路由)
```

---

## 六、结论

**应该做减法。** 44 个交互组件中有 10 个可以移除或合并：

| 操作 | 数量 | 组件 |
|------|------|------|
| 🔴 立即删除 | 6 | PassportPanel, SupplyChainScoreCard, DatabaseConfigPanel, QuickActions, ProductCompareDialog, Footer |
| 🟡 修复注册 | 2 | QualityTab, ComplianceTab → 加入 TabbedSection |
| 🟡 未来移路由 | 1 | UserManagementPanel → /admin/users |
| 🟢 保留 | 34 | 其余全部 |

预期效果：代码行数减少 ~1500 行，用户界面更干净，无死代码、无重复入口。
