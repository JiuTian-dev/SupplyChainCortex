/**
 * CRUD Query Tools — thin barrel. Tool definitions live in ./crud/.
 * Public import path preserved: tools.ts imports { crudTools } from './tools-crud'.
 * Tool order preserved EXACTLY from the original monolithic file.
 */

import type { MCPTool } from './tools';
import { queryInventoryTool, queryWarehouseCapacityTool } from './crud/inventory';
import { queryCostTool, querySalesTool, queryProcurementTool } from './crud/cost-sales';
import {
  queryLogisticsTool, querySuppliersTool, querySupplierTrendTool,
  querySupplierLocationTool,
} from './crud/logistics-suppliers';
import { queryDashboardTool, queryRiskTool } from './crud/dashboard-risk';

export const crudTools: MCPTool[] = [
  queryInventoryTool,
  queryCostTool,
  querySalesTool,
  queryLogisticsTool,
  querySuppliersTool,
  queryDashboardTool,
  querySupplierTrendTool,
  queryProcurementTool,
  queryRiskTool,
  querySupplierLocationTool,
  queryWarehouseCapacityTool,
];
