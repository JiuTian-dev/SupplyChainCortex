/**
 * Lightweight MCP Client — JSON-RPC 2.0 over HTTP.
 *
 * Calls external MCP servers (like PricePilot) without adding
 * heavy MCP SDK dependencies. Single fetch per tool call.
 *
 * Usage:
 *   const result = await callMCPTool('https://pricepilot-mcp.onrender.com/mcp',
 *     'get_price_position', { category: 'coffee-makers', asin: 'B0XXX' });
 */

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content?: Array<{ type: string; text?: string; data?: string }>;
  };
  error?: { code: number; message: string };
}

let requestId = 0;

/**
 * Call a tool on an external MCP server.
 * Handles initialization on first call (lazy).
 */
export async function callMCPTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown> = {},
  timeoutMs = 10000,
): Promise<string | null> {
  const body = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: ++requestId,
  };

  try {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return null;
    const json = await res.json() as MCPResponse;

    if (json.error) {
      console.warn(`[MCP] ${toolName} error: ${json.error.message}`);
      return null;
    }

    // Extract text content from result
    const content = json.result?.content;
    if (!content || content.length === 0) return null;

    return content.map(c => c.text || c.data || '').join('\n').trim() || null;
  } catch (err) {
    console.warn(`[MCP] ${toolName} fetch failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * List available tools on an MCP server.
 */
export async function listMCPTools(serverUrl: string): Promise<string[]> {
  try {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: ++requestId,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const json = await res.json() as { result?: { tools?: Array<{ name: string }> } };
    return json.result?.tools?.map(t => t.name) || [];
  } catch {
    return [];
  }
}
