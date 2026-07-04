/**
 * Python Bridge HTTP Client
 *
 * 封装对 FastAPI 常驻服务 (mcp-server/server.py) 的 HTTP 调用逻辑。
 * 替代 execFile('python3', ...) 模式，减少进程启动开销。
 *
 * 特性:
 * - 类型安全的调用接口
 * - 可配置超时和自动重试
 * - 健康检查缓存，避免每次调用都探测
 * - 连接失败时抛出 BridgeHttpUnavailableError，供调用方降级到 execFile
 *
 * 环境变量:
 * - PYTHON_BRIDGE_URL: 服务地址（默认 http://localhost:8765）
 * - PYTHON_BRIDGE_TIMEOUT: 默认超时毫秒数（默认 15000）
 * - PYTHON_BRIDGE_TIMEOUT_MC: monte_carlo_inventory 超时毫秒数（默认 60000）
 * - PYTHON_BRIDGE_MAX_RETRIES: 最大重试次数（默认 1）
 */

const DEFAULT_BASE_URL = 'http://localhost:8765';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_TIMEOUT_MC_MS = 60_000;
const DEFAULT_MAX_RETRIES = 1;
const HEALTH_CACHE_TTL_MS = 5_000;

/** 服务不可用错误，调用方可捕获此错误以降级到 execFile */
export class BridgeHttpUnavailableError extends Error {
  constructor(
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'BridgeHttpUnavailableError';
    this.cause = cause;
  }
}

/** 工具执行错误（服务返回了 error 字段或非 2xx 状态码） */
export class BridgeHttpToolError extends Error {
  readonly statusCode: number;
  readonly toolName: string;
  constructor(
    message: string,
    statusCode: number,
    toolName: string,
  ) {
    super(message);
    this.name = 'BridgeHttpToolError';
    this.statusCode = statusCode;
    this.toolName = toolName;
  }
}

interface BridgeHttpConfig {
  baseUrl: string;
  defaultTimeoutMs: number;
  monteCarloTimeoutMs: number;
  maxRetries: number;
}

function loadConfig(): BridgeHttpConfig {
  return {
    baseUrl: process.env.PYTHON_BRIDGE_URL || DEFAULT_BASE_URL,
    defaultTimeoutMs: parseInt(process.env.PYTHON_BRIDGE_TIMEOUT || '', 10) || DEFAULT_TIMEOUT_MS,
    monteCarloTimeoutMs:
      parseInt(process.env.PYTHON_BRIDGE_TIMEOUT_MC || '', 10) || DEFAULT_TIMEOUT_MC_MS,
    maxRetries:
      parseInt(process.env.PYTHON_BRIDGE_MAX_RETRIES || '', 10) || DEFAULT_MAX_RETRIES,
  };
}

// ─── Health Check Cache ─────────────────────────────────────────────────────

let healthCache: { available: boolean; checkedAt: number } | null = null;

/**
 * 检查 FastAPI 服务是否可用（带 TTL 缓存）。
 * 缓存窗口内直接返回上次结果，避免每次调用都发 HTTP 请求。
 */
export async function isBridgeServerAvailable(): Promise<boolean> {
  const now = Date.now();
  if (healthCache && now - healthCache.checkedAt < HEALTH_CACHE_TTL_MS) {
    return healthCache.available;
  }

  const config = loadConfig();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    const res = await fetch(`${config.baseUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const available = res.ok;
    healthCache = { available, checkedAt: now };
    return available;
  } catch {
    healthCache = { available: false, checkedAt: now };
    return false;
  }
}

/** 重置健康检查缓存（用于测试或强制重新探测） */
export function resetHealthCache(): void {
  healthCache = null;
}

// ─── Core HTTP Call ──────────────────────────────────────────────────────────

function getTimeoutForTool(tool: string, config: BridgeHttpConfig): number {
  return tool === 'monte_carlo_inventory' ? config.monteCarloTimeoutMs : config.defaultTimeoutMs;
}

async function fetchWithRetry(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  maxRetries: number,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      // 仅对连接错误重试，不对 4xx/5xx 重试（那些是业务错误）
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }

  throw new BridgeHttpUnavailableError(
    `无法连接到 Python Bridge 服务 (${url})`,
    lastError,
  );
}

/**
 * 通过 HTTP 调用 Python Bridge 服务的工具。
 *
 * @param tool 工具名称（如 'calculate_eoq'）
 * @param params 工具参数
 * @returns 工具返回的计算结果
 * @throws {BridgeHttpUnavailableError} 服务不可用（连接失败/超时）
 * @throws {BridgeHttpToolError} 工具执行返回错误
 */
export async function callBridgeHttp(
  tool: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const config = loadConfig();
  const url = `${config.baseUrl}/api/bridge/${encodeURIComponent(tool)}`;
  const timeoutMs = getTimeoutForTool(tool, config);

  const res = await fetchWithRetry(url, params, timeoutMs, config.maxRetries);

  let result: unknown;
  try {
    result = await res.json();
  } catch {
    throw new BridgeHttpUnavailableError(
      `Python Bridge 返回了无效的 JSON (HTTP ${res.status})`,
    );
  }

  // 检查业务错误（Python 函数返回 {"error": "..."}）
  if (typeof result === 'object' && result !== null && 'error' in result) {
    const errorMsg = String((result as Record<string, unknown>).error);
    throw new BridgeHttpToolError(errorMsg, res.status, tool);
  }

  // 检查 HTTP 错误状态码（如 404 未知工具、500 内部错误）
  if (!res.ok) {
    const detail =
      typeof result === 'object' && result !== null && 'detail' in result
        ? String((result as Record<string, unknown>).detail)
        : `HTTP ${res.status}`;
    throw new BridgeHttpToolError(detail, res.status, tool);
  }

  return result;
}

/**
 * 尝试通过 HTTP 调用工具，如果服务不可用则执行 fallback 函数。
 * 这是 tools-supply-chain.ts 中使用的核心降级逻辑。
 *
 * @param tool 工具名称
 * @param params 工具参数
 * @param fallback 降级函数（通常是 execFile 调用）
 * @returns 工具返回结果
 */
export async function callBridgeWithFallback(
  tool: string,
  params: Record<string, unknown>,
  fallback: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await callBridgeHttp(tool, params);
  } catch (err) {
    if (err instanceof BridgeHttpUnavailableError) {
      // 服务不可用，降级到 execFile
      return fallback();
    }
    // 业务错误（BridgeHttpToolError）直接抛出，不降级
    throw err;
  }
}
