# Task: Enhance ChatPanel, SSE Status Indicator, and MCP Write Tools

## Summary

All three tasks were completed successfully with zero lint errors (only pre-existing warnings about TanStack Virtual's incompatible library).

### Task 1: ChatPanel Enhancements

**File: `/home/z/my-project/src/components/shared/ChatPanel.tsx`**

1. **Better Markdown rendering** - Replaced the simple inline markdown parser with a comprehensive `renderMarkdown()` function that handles:
   - `##` → h3, `###` → h4 with proper styling
   - Numbered lists (`1. 2. 3.`) → `<ol>/<li>` elements
   - Bullet lists (`- item`) and sub-bullets (`  - item`) with colored dots
   - Inline code (`` `code` ``) with monospace font and orange background
   - Bold text (`**bold**`) with semibold weight
   - Empty lines as spacing dividers
   - Proper dark mode variants throughout

2. **Conversation history** - Updated `sendMessage()` to:
   - Build a `history` array from the last 10 messages
   - Send it as a `history` field in the POST request body
   - The chat API route now accepts and uses this history for LLM context

3. **Show all 6 quick actions** - Changed `QUICK_ACTIONS.slice(0, 4)` to `QUICK_ACTIONS.map()` to display all 6 quick action buttons after messages.

4. **Typing indicator** - Replaced the old "正在查询数据..." spinner with:
   - "思考中" text with three animated bouncing dots
   - Staggered animation delays (0ms, 150ms, 300ms) for a natural typing feel
   - Orange-colored dots matching the app theme

5. **Dark mode polish** - Added `dark:` variants for:
   - Message bubbles (`dark:bg-muted/80`)
   - Bot and user avatars (`dark:text-orange-400`, `dark:text-blue-400`)
   - Quick action buttons (`dark:hover:bg-orange-950/20`, `dark:hover:border-orange-800`)
   - Card backgrounds (`dark:bg-card`)
   - Input field (`dark:bg-background`)
   - Code inline elements (`dark:bg-orange-950/40`, `dark:text-orange-300`)
   - Tool badges and data expand buttons
   - New tool icon imports: `Trash2`, `StickyNote`, `AlertTriangle`

6. **"清除对话" button** - Added a `Trash2` icon button in the header area (visible when messages exist) that calls `clearMessages()` to reset all messages and expanded data state.

### Task 2: SSE Connection Status in Header

**Files modified:**
- `/home/z/my-project/src/stores/connection-store.ts`
- `/home/z/my-project/src/hooks/use-sse.ts`
- `/home/z/my-project/src/components/layout/Header.tsx`

1. **Connection store** - Added:
   - `_reconnectFn` state to store a reconnect callback
   - `registerReconnect(fn)` action to register the SSE reconnect function
   - `requestReconnect()` action to trigger manual reconnect from UI

2. **SSE hook** - Updated `useSSE()` to:
   - Read `registerReconnect` from the connection store
   - Register a reconnect function that resets attempts and calls `doConnect()`
   - Clean up by setting reconnect to null on unmount

3. **Header** - Enhanced the SSE connection indicator:
   - Changed `cursor-default` to `cursor-pointer`
   - Added `onClick` handler that calls `requestReconnect()` when disconnected
   - Updated tooltip text: "SSE 实时推送已连接" / "SSE 连接断开，点击重连"
   - Added "点击此徽章手动重连" hint in tooltip when disconnected
   - Added `dark:text-red-400` variant for offline WifiOff icon

### Task 3: MCP Write Tools

**Files modified:**
- `/home/z/my-project/src/lib/mcp/tools.ts`
- `/home/z/my-project/src/app/api/chat/route.ts`

1. **`adjust_inventory`** (tool #10) - Adjusts stock quantities:
   - Required: `sku`, `quantity` (positive=inbound, negative=outbound), `reason`
   - Optional: `warehouse`
   - Uses `computeStockStatus()` from inventory service
   - Creates supply chain event for the adjustment
   - Invalidates inventory and dashboard caches

2. **`update_cost_record`** (tool #11) - Updates cost record fields:
   - Required: `sku`
   - Optional: `rawMaterial`, `labor`, `logistics`, `tariff`, `platformFee`, `sellingPrice`, `exchangeRate`
   - Auto-recalculates `totalLanded` and `grossMargin`
   - Invalidates cost and dashboard caches

3. **`create_note`** (tool #12) - Creates supply chain notes:
   - Required: `content`
   - Optional: `sku`, `category` (general/inventory/cost/logistics/sales), `priority` (normal/important/urgent), `author`
   - Delegates to `createNote()` from notes.service.ts

4. **`resolve_alert`** (tool #13) - Modifies alert rules:
   - Required: `ruleId`
   - Optional: `enabled`, `threshold`, `severity` (warning/critical)
   - Delegates to `updateAlertRule()` from alert-rules.service.ts

**Chat API route updates:**
- Updated `SYSTEM_PROMPT` with descriptions for all 4 new tools (now 14 total)
- Updated request body type to accept `history` field
- Added conversation history context to the LLM intent prompt
- Added keyword matching for new tools in `handleWithoutLLM()`
- Added `formatToolResult` cases for `adjust_inventory`, `update_cost_record`, `create_note`, `resolve_alert`
- Fixed a bug where `result` variable was used outside its try-block scope

**Tool icons and labels** were also added to ChatPanel for the 4 new tools.

### Lint Results
- 0 errors, 7 warnings (all pre-existing TanStack Virtual incompatible library warnings)
