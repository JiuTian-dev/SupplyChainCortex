/**
 * 九天记忆适配器 — JiuTian Memory Bridge ↔ SupplyChain Cortex
 *
 * 将九天记忆模块的持久化能力注入到现有 agent 管线。
 * 替代内存 episode-store 为持久化存储（SQLite + Qdrant + Mem0）。
 *
 * 架构:
 *   SupplyChain Cortex → memory-adapter.ts → HTTP → Python bridge → JiuTian memory_service
 *
 * 用法:
 *   import { jiutianMemory } from './memory-adapter';
 *   await jiutianMemory.record(userQuery, agentResponse, userId);
 *   const result = await jiutianMemory.retrieve(query, userId);
 */

const BRIDGE_URL = process.env.JIUTIAN_MEMORY_URL || "http://127.0.0.1:8765";

interface RetrieveResult {
  status: string;
  response?: string;
  hard_facts?: string[];
  memories?: string[];
  benchmark?: {
    mode?: string;
    path?: string;
    hard_facts_count?: number;
    memories_count?: number;
  };
  error?: string;
}

interface RecordResult {
  status: string;
  hard_facts_count?: number;
  memories_count?: number;
  error?: string;
}

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Memory bridge error: ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export const jiutianMemory = {
  /** 检查桥接服务是否存活 */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${BRIDGE_URL}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  /** 记录一轮对话，触发异步提取 + 写入 */
  async record(
    userQuery: string,
    agentResponse: string,
    userId = "supply-chain-user"
  ): Promise<RecordResult> {
    return post("/record", {
      user_input: userQuery,
      response: agentResponse,
      user_id: userId,
    }) as unknown as RecordResult;
  },

  /**
   * 检索记忆并获取 LLM 回答。
   * 如果只需要原始记忆数据，用 retrieveMemories()。
   */
  async retrieve(
    query: string,
    userId = "supply-chain-user"
  ): Promise<RetrieveResult> {
    return post("/retrieve", {
      query,
      user_id: userId,
    }) as unknown as RetrieveResult;
  },

  /**
   * 仅检索记忆（不生成 LLM 回答）。
   * 用于上下文注入场景，比 retrieve() 更快更省。
   */
  async retrieveMemories(
    query: string,
    userId = "supply-chain-user"
  ): Promise<RetrieveResult> {
    // Use /retrieve but we only care about hard_facts + memories
    const result = (await post("/retrieve", {
      query,
      user_id: userId,
    })) as unknown as RetrieveResult;
    return result;
  },

  /** 批量注入历史对话（用于冷启动/迁移） */
  async ingest(
    conversationText: string,
    userId = "supply-chain-user"
  ): Promise<Record<string, unknown>> {
    return post("/ingest", {
      conversation_text: conversationText,
      user_id: userId,
    });
  },
};
