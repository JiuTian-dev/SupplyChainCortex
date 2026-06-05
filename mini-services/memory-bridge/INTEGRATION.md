# 九天记忆桥接 — 集成指南

## 启动

```bash
# 1. 确保 Qdrant 在运行
docker ps | grep qdrant || docker-compose up -d

# 2. 启动记忆桥接服务
cd mini-services/memory-bridge
pip install -r ../../../../JiuTian_memory/requirements.txt
python server.py --port 8765
```

## 接入点（仅需改 3 处，每处 ≤ 3 行）

### 1. context-builder.ts — `buildDynamicSystemContext()`

第 350-358 行，将 `episodeStore.retrieve()` 替换为持久化检索：

```typescript
// 现有代码（内存版）
const relatedEpisodes = episodeStore.retrieve(query, 3);

// 替换为（持久化版）
import { jiutianMemory } from './memory-adapter';
const result = await jiutianMemory.retrieveMemories(query);
const relatedMemories = (result.hard_facts || []).map(f => ({ content: f }));
```

### 2. chat/route.ts — `POST /api/chat`

响应完成后追加持久化记录（第 153-158 行附近）：

```typescript
// 现有代码
episodeStore.record(episode);
rememberConversationTurn(/* ... */);

// 追加（不删现有代码，双写过渡）
import { jiutianMemory } from '@/lib/engine/memory-adapter';
jiutianMemory.record(userMessage, fullResponse, userId).catch(() => {});
```

### 3. docker-compose.yml — 添加记忆桥接服务

```yaml
memory-bridge:
  build: ./mini-services/memory-bridge
  ports:
    - "8765:8765"
  environment:
    - JIUTIAN_MEMORY_URL=http://memory-bridge:8765
    - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
  restart: unless-stopped
```

## 架构

```
SupplyChain Cortex (Next.js)          JiuTian Memory (Python)
┌─────────────────────────┐          ┌──────────────────────────┐
│ context-builder.ts       │  HTTP    │ memory-bridge/server.py  │
│   └─ jiutianMemory      │◄────────►│   └─ memory_service.py   │
│       .retrieveMemories()│  :8765   │       ├─ hard_facts_store │
│                          │          │       ├─ chinese_embedding│
│ chat/route.ts            │          │       ├─ mem0_client      │
│   └─ jiutianMemory      │          │       └─ _build_context   │
│       .record()          │          │                          │
└─────────────────────────┘          └──────────────────────────┘
```

## 双写过渡策略

上线时不删旧的 `episodeStore`，两边同时写：

1. 旧的内存 `episodeStore` 继续工作（零风险）
2. 新的 `jiutianMemory` 并行写入（积累数据）
3. 检索时优先用 `jiutianMemory`，fallback 到 `episodeStore`
4. 验证稳定后（1-2 周），移除旧代码
