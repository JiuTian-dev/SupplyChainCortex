# SupplyChain Cortex 联网搜索 —— 全面升级方案

## 问题诊断

当前 `web-search.service.ts` 的 3 个源（Wikipedia API、Google News RSS、DuckDuckGo Lite）完全不可用，多次修复无效。这三个本质上是 2010 年代的方案，不是为 AI Agent 设计的。

---

## 核心设计：多提供者架构

不绑定单一搜索后端。通过环境变量切换 Provider，适配不同部署场景：

```
用户查询 → Provider Router → 当前 Provider → 搜索结果
                                    │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
          SearXNG               Brave Search             Tavily
      (自托管/无限量)          (API Key/2000月)        (API Key/1000月)
```

### Provider 对比

| Provider | 免费额度 | 需要 Docker | 客户要做什么 | 中文支持 |
|----------|---------|------------|-------------|---------|
| **SearXNG** | 无限 | ✅ | 无，`docker compose up -d` 一条命令 | ✅（可配百度/Bing中文） |
| **Brave Search** | 2000次/月 | ❌ | 申请免费 API Key 填 `.env` | ⚠️ 有限 |
| **Tavily** | 1000次/月 | ❌ | 申请免费 API Key 填 `.env` | ⚠️ 有限 |
| **Jina Search** | 免费层 | ❌ | 无需配置 | ✅ 较好 |

### 部署场景

```
场景 A：你自己开发
  → SEARCH_PROVIDER=searxng（免费，无限量，无 API Key）
  → docker compose up -d 连 PostgreSQL 一起启动

场景 B：客户自部署
  → SEARCH_PROVIDER=searxng（同上，docker compose 全自动）
  → 客户无需申请任何外部 API Key

场景 C：客户不想跑额外容器
  → SEARCH_PROVIDER=brave
  → BRAVE_API_KEY=xxx（客户去 brave.com/api 免费申请，30 秒搞定）
  → 无需 SearXNG 容器
```

---

## 实施计划

### Step 1：Docker Compose 增加 SearXNG（可选服务）

```yaml
  # 在现有 docker-compose.yml 增加
  searxng:
    image: searxng/searxng:latest
    container_name: supply-chain-searxng
    restart: unless-stopped
    ports:
      - "8081:8080"
    volumes:
      - ./searxng/settings.yml:/etc/searxng/settings.yml:ro
    environment:
      - SEARXNG_SECRET=${SEARXNG_SECRET:-change-me}
    networks:
      - supply-chain-network
```

配置文件 `searxng/settings.yml`：

```yaml
use_default_settings: true
server:
  secret_key: "${SEARXNG_SECRET}"
  limiter: false
search:
  formats:
    - html
    - json
```

### Step 2：重写 web-search.service.ts

**文件**: `src/lib/services/web-search.service.ts`（完全重写，~250 行）

```
架构：

  searchProvider(config)
    ├── searxng  → searchSearXNG(query)  → JSON API
    ├── brave    → searchBrave(query)    → Brave Search API
    ├── tavily   → searchTavily(query)   → Tavily API
    └── jina     → searchJina(query)     → Jina Search API

  fetchPage(url)
    └── Jina Reader → r.jina.ai/{url} → Markdown（所有 provider 共用）

  webSearch(query)
    ├── 1. Provider Router → 调用当前 provider 搜索
    ├── 2. Jina Reader → 并发取前 3 个结果的全文
    └── 3. 合并摘要 + 全文 → 返回
```

核心接口保持不变：`webSearch(query)` → `{results, source}`，`chat/route.ts` 无需改动。

`.env` 配置：

```bash
# 搜索 Provider 选择
SEARCH_PROVIDER=searxng        # searxng | brave | tavily | jina
SEARXNG_BASE_URL=http://localhost:8081
BRAVE_API_KEY=                 # 仅 provider=brave 时需要
TAVILY_API_KEY=                # 仅 provider=tavily 时需要
```

### Step 3：补充直接源

作为 SearXNG 的补充，增加几个免 Key 的直接搜索源：

| 源 | API | 用途 |
|----|-----|------|
| **Reddit** | `reddit.com/search.json?q=...` | 社区讨论、产品口碑 |
| **GitHub** | `api.github.com/search/repositories?q=...` | 开源供应链工具 |
| **Hacker News** | `hn.algolia.com/api/v1/search?query=...` | 技术/创业讨论 |
| **B站** | `api.bilibili.com/x/web-interface/search` | 中文视频内容 |
| **知乎** | 网页解析 | 深度中文分析 |

> 这些直接源是所有 Provider 的 fallback/补充，不依赖 SearXNG。

### Step 4：新增 /api/search 路由

**新建**: `src/app/api/search/route.ts`

```
POST /api/search
{
  "query": "Section 301 关税最新动态",
  "mode": "fast" | "deep",
  "language": "auto"
}
```

- `fast`：仅摘要（<1s）
- `deep`：摘要 + Jina Reader 全文（3-5s）

### Step 5：Chat Agent 搜索策略增强

**修改**: `src/app/api/chat/route.ts`

- 自动检测用户是否在问"实时信息"
- 自动触发搜索（无需前端显式传 `webSearch: true`）
- 无结果时自动换搜索策略

---

## 新旧对比

| | 旧方案 | 新方案 |
|---|--------|--------|
| **架构** | 3 个源硬编码，逐个试 | 多 Provider 可切换 |
| **API** | 各自解析 HTML/XML | 统一 JSON（SearXNG/Brave/Tavily 都是标准 API） |
| **可用性** | ❌ 不可用 | ✅ 当前 provider 挂了可切另一个 |
| **全文阅读** | 无 | Jina Reader（所有 provider 共用） |
| **客户部署** | — | Docker 自动启动 或 填 API Key |
| **费用** | 免费但不可用 | 自托管=免费无限；云 API=有免费额度 |
| **代码改动** | — | 重写 web-search.service.ts + 新增 search route + docker-compose 加一个可选服务 |

---

## 实施工作量

| 步骤 | 时间 | 产出 |
|------|------|------|
| Step 1: SearXNG 容器 | 30min | `docker-compose.yml` + `searxng/settings.yml` |
| Step 2: 重写搜索服务 | 2h | `web-search.service.ts`（Provider Router + 4 个 provider） |
| Step 3: 补充直接源 | 1h | Reddit / GitHub / HN / B站 / 知乎 5 个直接源 |
| Step 4: 搜索 API | 1h | `/api/search` route |
| Step 5: Chat 搜索策略 | 1h | `chat/route.ts` 自动搜索触发 |
| **合计** | **5.5h** | |

---

## 客户部署文档（未来需要）

只需在 README 加一段：

```markdown
## 联网搜索配置

### 方式一：自托管（推荐，无限量）
docker compose up -d  # SearXNG 随 PostgreSQL 一起启动
# .env 中设置 SEARCH_PROVIDER=searxng 即可

### 方式二：API Key（无需额外容器）
1. 访问 https://brave.com/search/api/ 申请免费 API Key（2000次/月）
2. .env 中设置：
   SEARCH_PROVIDER=brave
   BRAVE_API_KEY=你的key
```
