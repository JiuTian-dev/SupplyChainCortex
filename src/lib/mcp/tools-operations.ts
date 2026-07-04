/**
 * MCP Tools: Operations (reorder, shipment status, inventory adjust, cost update, notes, alerts).
 *
 * Refactored: tool definitions now live in ./operations/ subdirectory.
 * This file remains as a thin barrel to preserve the public import path
 * (tools.ts imports { operationsTools } from './tools-operations').
 */

import type { MCPTool } from './tools';
import { reorderOperations, batchReorderOperations } from './operations/reorder';
import { shipmentOperations } from './operations/shipment';
import { inventoryOperations } from './operations/inventory';
import { costNoteOperations } from './operations/cost-note';
import { supplierOperations } from './operations/supplier';

export const operationsTools: MCPTool[] = [
  ...reorderOperations,
  ...shipmentOperations,
  ...inventoryOperations,
  ...costNoteOperations,
  ...supplierOperations,
  ...batchReorderOperations,
];
