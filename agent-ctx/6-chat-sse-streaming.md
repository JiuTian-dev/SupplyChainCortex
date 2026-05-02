# Task 6 - Chat API SSE Streaming + WebSocket Cleanup

## Summary

Successfully implemented Chat API SSE streaming response and cleaned up deprecated WebSocket code.

## Part A: Chat API SSE Streaming

### `/src/app/api/chat/route.ts`
- Added `export const dynamic = 'force-dynamic'` for proper streaming support
- Kept existing non-streaming POST handler for backward compatibility
- Added streaming mode: when request body includes `"stream": true`, returns SSE response
- SSE events implemented:
  - `event: thinking` → `{ "status": "processing" }` - sent when starting tool execution
  - `event: tool_call` → `{ "tool": "query_inventory", "parameters": {...} }` - sent when executing a tool
  - `event: tool_result` → `{ "tool": "query_inventory", "result": {...} }` - sent when tool completes
  - `event: token` → `{ "content": "word" }` - for streaming reply text chunk by chunk
  - `event: done` → `{ "toolsUsed": [...], "complete": true }` - when finished
- LLM streaming: chunks response into words/phrases using `splitIntoChunks()` (splits Chinese text every 2-3 chars, English at word boundaries, at punctuation)
- Fallback streaming: splits reply into sentences and sends them as token events with 40ms delays
- Uses `ReadableStream` pattern consistent with the existing SSE route
- Properly handles AbortSignal for connection drops
- Falls back from streaming → non-streaming if SSE fails, and from LLM → rule-based if SDK unavailable

### `/src/components/shared/ChatPanel.tsx`
- Added `streaming`, `thinking`, `streamingToolCalls` state variables
- Uses `fetch` with `"stream": true` in request body
- Processes SSE response by parsing `ReadableStream` with custom `parseSSEChunk()` function
- Shows streaming text progressively (updates assistant message content in real-time)
- Shows blinking cursor during streaming via animated span
- Shows "正在调用工具..." indicator when receiving `thinking` events
- Shows tool call badges with spinner during streaming, static icons after completion
- Uses `AbortController` for proper cleanup on unmount or cancellation
- Falls back to non-streaming mode if SSE connection fails
- Non-streaming mode still works as fallback

## Part B: WebSocket Cleanup

### Deleted `/src/hooks/use-websocket.ts`
- Was already marked as `@deprecated`
- Not imported anywhere (page.tsx uses `useSSE` instead)

### Mini-services note
- `/mini-services/supply-chain-ws/` still exists (Socket.IO server on port 3003)
- No longer referenced by frontend code, but left in place per instructions

### Updated `/src/stores/connection-store.ts`
- Added clarifying comments that `wsConnected`/`setWsConnected` are legacy names now tracking SSE connection state
- The store is already fully compatible with SSE (the SSE hook uses `setWsConnected` and `registerReconnect`)
- No breaking API changes - all existing consumers (Header, Footer, DashboardTab, use-auto-refresh, use-sse) continue to work

## Lint Results
- `bun run lint`: 0 errors, 6 warnings (all pre-existing TanStack library warnings)
- Dev server running successfully with no errors
