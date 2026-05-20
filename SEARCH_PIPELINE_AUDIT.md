# 搜索管道深度审计报告

> 审计日期: 2026-05-19 | 范围: web-search 全链路

---

## 一、端到端流程

```
POST /api/search
  │
  ├─ JSON 解析 (无 Zod 校验)
  ├─ normalizeQuery — 无 sanitizeQuery 清洗
  │
  ├─ 简单路径: webSearch(q)
  │    ├─ sanitizeQuery(q) — 去 <>'" 截断500
  │    ├─ tryAllSources → 顺序回退链 (32s 最坏)
  │    │    Main → Reddit → GitHub → HN
  │    └─ guardResults → 过滤空结果时静默退回原始数据
  │
  └─ 高级路径: webSearchWithQuality(q, history)
       ├─ injectContext — 从历史提取实体前置
       ├─ rewriteQuery — 4 种策略变体
       ├─ classifyQueryForSearch — 仅为 SearXNG 分类(其他 provider 忽略)
       ├─ 4 路 Promise.allSettled 并行
       │    SearXNG │ DDG HTML │ Wikipedia │ Public Pool
       ├─ 变体展开 (结果<15时)
       ├─ 自适应召回循环 (最多2次)
       │    ├─ guardResults + rerankResults
       │    ├─ <10 → 放宽参数重查
       │    └─ ≥10 → crossValidate
       └─ QualitySearchResult
```

---

## 二、安全审计

### 🔴 高危

| ID | 问题 | 位置 | 说明 |
|----|------|------|------|
| S1 | **公共 SearXNG 池 SSRF** | `service.ts:375` | 从 `searx.space` 获取的外部 URL 直接传给 `fetch()`，未过 `isSafeUrl`。被篡改的实例列表可导致 SSRF 扫描内网 |
| S2 | **速率限制器竞态条件** | `rate-limit.ts:83` | `store.get()` → `entry.tokens -= 1` 不是原子操作。并发下 2 个请求同时读到 tokens=2，各扣到 1，绕过限制 |
| S3 | **IP 伪造绕过限流** | `rate-limit.ts:47` | 信任 `x-forwarded-for` 头部，客户端可控 |
| S4 | **守卫静默退化** | `service.ts:587` | `guarded.passed = false` 时完全忽略，退回未过滤的原始结果 |

### 🟡 中危

| ID | 问题 | 位置 | 说明 |
|----|------|------|------|
| S5 | **normalizeQuery 在 sanitizeQuery 前运行** | `route.ts:19` | 注入 payload 可经此绕过清洗 |
| S6 | **交叉验证器仅分析第一个结果** | `cross-validator.ts:98` | `extractClaim(results[0].snippet)` 忽略其余 9+ 个结果 |
| S7 | **硬编码年份 2026** | `rewriter.ts` | broaden 策略的 `2026` 到明年即过期 |
| S8 | **Tavily API key 在 POST body 中明文** | `service.ts:194` | 若 Tavily server 记录请求体会泄露 |

---

## 三、性能审计

| 问题 | 影响 | 说明 |
|------|------|------|
| **`tryAllSources` 顺序回退** | 最坏 32s | Main→Reddit→GitHub→HN 串行各 8s，与 `webSearchWithQuality` 的并行策略不一致 |
| **守卫 URL 重复解析** | 3次/结果 | `filterBlacklistedDomains` + `scoreResultQuality` + `crossValidate` 各自 `new URL()` |
| **`formatSearchContext` 重复过滤** | O(n) | 独立再做一遍域名过滤+新鲜度排序 |
| **`getConfig()` 每次调 env** | N 次重复读 | 环境变量在进程中不变，模块级缓存即可 |
| **mergeResults 副作用** | 维护风险 | 按引用修改 `existing` 数组，返回值被忽略 |
| **公共池洗牌有偏** | 小偏差 | `.sort(() => Math.random() - 0.5)` 非 Fisher-Yates |
| **无结果缓存** | 重复 API 调用 | 同一 query 调用两次→两次完整流程 |

---

## 四、查询处理深度分析

### 重写策略

| 策略 | 行为 | 问题 |
|------|------|------|
| `original` | 直传 | 无 |
| `specific` | 实体+"最新" | 字符串拼接冗长 |
| `broaden` | 主题词+"趋势分析2026" | 硬编码年份 |
| `english` | 中→英翻译追加 | 翻译映射缺失 `贸易战`/`汇率`/`合规` 等 13 个术语 |

### 上下文注入

- 无时间衰减：5 轮前的实体和最近实体权重相同
- 仅处理 `role: 'user'` 轮次，忽略助手回复中的实体
- `maxContextTerms=4` 限制去重前就截断

### 中英关键词映射缺失

在 `extractEnglishKeywords`(service.ts) 中存在但 `extractKeywords`(rewriter.ts) 中缺失：
`贸易战`、`港口`、`汇率`、`合规`、`出口`、`碳价`、`库存`、`物流`、`供应商`、`销售`、`成本`、`风险`、`认证`

---

## 五、质量管道分析

### 重排序器

```
finalScore = simScore*0.55 + authBoost*0.25 + freshBoost*0.10 + 0.10
```

- 0.10 基础分保证最低 ~6% 正向分，即使完全无关
- `computeSemanticSimilarity` 空查询返回 0.3 而非 0

### 交叉验证器

- 仅分析 `results[0].snippet` 的声明
- `extractClaim` 正则只能捕获百分比和年份格式，遗漏货币金额(`$50亿`)、比较级(`"比去年更多"`)

### 守卫

- 域名白名单是站点级别的，不区分该站点上的文章/观点
- HTTPS vs HTTP 无区分

---

## 六、测试覆盖

| 文件 | 测试数 | 缺失 |
|------|--------|------|
| `web-search.service.ts` | **0** | 核心编排零测试 |
| `rewriter.test.ts` | 6 | 缺少空历史/超长历史/特殊字符/注入payload |
| `reranker.test.ts` | 6 | 缺少空查询/混合中英/边界分数 |
| `guard.test.ts` | 8 | 缺少 HTTPS处理/国际域名/未来日期 |
| `cross-validator.test.ts` | 5 | 缺少多语言声明/空片段/URL解析失败 |

---

## 七、修复优先级

| 优先级 | 项目 | 影响 |
|--------|------|------|
| **P0** | S1 公共池 SSRF 防护 | 内网扫描风险 |
| **P0** | S2 速率限制器竞态条件 | 限流绕过 |
| **P1** | S4 守卫静默退化 | 质量过滤失效 |
| **P1** | `tryAllSources` 并行化 | 最坏延迟 32s→8s |
| **P1** | `webSearchWithQuality` 单元测试 | 核心逻辑无回归保护 |
| **P2** | S5 normalizeQuery 清洗顺序 | 注入防御 |
| **P2** | S6 交叉验证器范围 | 质量评估准确性 |
| **P2** | 重复 URL 解析合并 | 性能 |
| **P3** | S7 硬编码年份 | 到 2027 过期 |
| **P3** | 中英关键词映射合并 | 翻译完整性 |
| **P3** | Provider 响应缓存 | 减少 API 调用 |
