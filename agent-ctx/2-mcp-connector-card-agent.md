# Task 2 - MCP Connector Status Card Agent

## Task
Create a new MCP Connector Status Card component and integrate it into the dashboard.

## Summary
Restored the MCP Connector Status Card that was removed in v0.7.2. Created a new compact, professional `MCPConnectorCard` component and integrated it back into the dashboard.

## Files Created
- `/home/z/my-project/src/components/dashboard/MCPConnectorCard.tsx` — New component with SSE connection indicator, connector summary, responsive grid layout, status dots with pulse animation, tooltips, reconnect button

## Files Modified
- `/home/z/my-project/src/components/dashboard/DashboardTab.tsx` — Added import and `<SortableSection sectionId="mcp-connectors">` block between metric-cards and flow-chart

## Verification
- `bun run lint` passes with zero errors
- Dev server compiles successfully
- `mcp-connectors` SectionId confirmed present in DashboardLayoutManager DEFAULT_SECTION_ORDER
