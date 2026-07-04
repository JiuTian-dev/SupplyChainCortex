/**
 * MCP Tools: Intelligence (analytics, exchange rates, weather, cascade risk, decision graph, workflow, tariff, sandbox).
 *
 * Refactored: tool definitions now live in ./intelligence/ subdirectory.
 * This file remains as a thin barrel to preserve the public import path
 * (tools.ts imports { intelligenceTools } from './tools-intelligence').
 */

import type { MCPTool } from './tools';
import { analyticsIntelligence } from './intelligence/analytics';
import { marketIntelligence } from './intelligence/market';
import { riskIntelligence } from './intelligence/risk';
import { decisionIntelligence } from './intelligence/decision';
import { businessIntelligence } from './intelligence/business';
import { chartIntelligence } from './intelligence/chart';

export const intelligenceTools: MCPTool[] = [
  ...analyticsIntelligence,
  ...marketIntelligence,
  ...riskIntelligence,
  ...decisionIntelligence,
  ...businessIntelligence,
  ...chartIntelligence,
];
