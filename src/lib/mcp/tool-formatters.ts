/**
 * Shared Tool Formatters — consolidated from duplicated copies in
 * chat.helpers.ts and react-agent.ts.
 *
 * Single source of truth for formatToolResult() and DEFAULT_TOOL_ACTIONS.
 */

// ─── Default Tool Actions ─────────────────────────────────────────────────────

export const DEFAULT_TOOL_ACTIONS: Record<string, string> = {
  query_inventory: 'overview',
  query_cost: 'overview',
  query_sales: 'overview',
  query_logistics: 'stats',
  query_suppliers: 'list',
  query_dashboard: 'summary',
  query_risk: 'dashboard',
  query_exchange_rates: 'latest',
  query_weather: 'summary',
  query_analytics: 'supplier_performance',
  query_tariff: 'overview',
  query_cascade_risk: 'auto',
  query_decision_graph: 'cross_domain',
  query_commodities: '',
  query_scfis: '',
  query_carbon_price: '',
  query_amazon_competitors: 'overview',
  query_cpsc_recalls: '',
  query_port_congestion: '',
  execute_workflow: 'wf-full-health',
  web_search: '',
};

// ─── Tool Result Formatting ───────────────────────────────────────────────────

export function formatToolResult(tool: string, action: string, result: unknown): string {
  if (!result || typeof result !== 'object') return '查询完成，但没有找到相关数据。';
  const data = result as Record<string, unknown>;

  switch (tool) {
    // ── Inventory ──────────────────────────────────────────────────────
    case 'query_inventory': {
      if (action === 'overview') return `📦 库存概览: 总产品${data.totalItems}项, 总库存${data.totalQuantity}, 低库存预警${data.lowStockAlerts}项, 平均周转${data.avgTurnoverDays}天`;
      if (action === 'reorder') {
        const s = data.summary as Record<string, unknown> | undefined;
        return `📋 补货建议: ${s?.totalRecommendations}项, 紧急${s?.urgentCount}项, 预估成本¥${s?.totalEstimatedCost}`;
      }
      return `📦 库存查询完成: ${JSON.stringify(data).substring(0, 400)}`;
    }

    // ── Cost ───────────────────────────────────────────────────────────
    case 'query_cost': {
      if (action === 'overview') return `💰 成本概览: ${data.totalProducts}产品, 平均毛利率${data.avgGrossMargin}%`;
      if (action === 'detail') return `💰 成本明细: ${JSON.stringify(data).substring(0, 600)}`;
      return `💰 成本查询完成: ${JSON.stringify(data).substring(0, 400)}`;
    }

    // ── Sales ──────────────────────────────────────────────────────────
    case 'query_sales': {
      if (action === 'overview') return `📈 销售概览(${data.period}): 总收入¥${data.totalRevenue}`;
      return `📈 销售查询完成: ${JSON.stringify(data).substring(0, 400)}`;
    }

    // ── Logistics ──────────────────────────────────────────────────────
    case 'query_logistics': {
      if (action === 'stats') return `🚢 物流统计: ${data.totalShipments}批, 准时率${data.onTimeDeliveryRate}%, 高风险${data.highRiskCount}批`;
      return `🚢 物流查询完成: ${JSON.stringify(data).substring(0, 400)}`;
    }

    // ── Dashboard ──────────────────────────────────────────────────────
    case 'query_dashboard': {
      if (action === 'summary') return `📊 供应链概览: ${data.totalProducts}产品, 收入¥${data.totalRevenue}, 健康评分${data.healthScore}/100`;
      return `📊 仪表盘查询完成`;
    }

    // ── Risk ───────────────────────────────────────────────────────────
    case 'query_risk': {
      if (action === 'dashboard') return `⚠️ 风险评估: 评分${data.overallRisk}/100, 等级${data.riskLevel}`;
      return `⚠️ 风险查询完成`;
    }

    // ── Suppliers ──────────────────────────────────────────────────────
    case 'query_suppliers': return `🏭 供应商查询完成: ${JSON.stringify(data).substring(0, 400)}`;

    // ── Analytics ──────────────────────────────────────────────────────
    case 'query_analytics': return `🔬 分析完成: ${JSON.stringify(data).substring(0, 400)}`;

    // ── Adjust Inventory ───────────────────────────────────────────────
    case 'adjust_inventory': {
      const adj = data.adjustment as Record<string, unknown> | undefined;
      return adj
        ? `📦 库存调整: ${adj.productName} ${adj.adjustment}件, ${adj.previousQuantity}→${adj.newQuantity}`
        : `📦 调整完成`;
    }

    // ── Create Note ────────────────────────────────────────────────────
    case 'create_note': return `📝 备注已创建`;

    // ── Create Reorder ─────────────────────────────────────────────────
    case 'create_reorder': return `📋 补货订单: ${JSON.stringify(data).substring(0, 400)}`;

    // ── Update Shipment Status ─────────────────────────────────────────
    case 'update_shipment_status': return `🚢 货运状态已更新`;

    // ── Exchange Rates ─────────────────────────────────────────────────
    case 'query_exchange_rates': {
      if (action === 'latest') {
        const rates = data.rates as Record<string, number> | undefined;
        const trend = data.trend as Record<string, { direction: string; change: number }> | undefined;
        if (rates) {
          const parts = Object.entries(rates).map(([c, r]) => {
            const t = trend?.[c];
            const arrow = t?.direction === 'up' ? '↑' : t?.direction === 'down' ? '↓' : '→';
            return `${c}: ${r} ${arrow}${t?.change || 0}%`;
          });
          return `💱 人民币汇率 (${data.base}): ${parts.join(', ')}`;
        }
      }
      return `💱 汇率查询完成`;
    }

    // ── Weather ────────────────────────────────────────────────────────
    case 'query_weather': {
      const alerts = data.activeAlerts as Array<{ port: string; type: string; severity: string }> | undefined;
      if (alerts?.length) {
        return `🌤 港口天气预警: ${alerts.map(a => `${a.port}(${a.type}/${a.severity})`).join(', ')}`;
      }
      return `🌤 港口天气: 所有港口海况正常，无恶劣天气预警`;
    }

    // ── Web Search ─────────────────────────────────────────────────────
    case 'web_search': {
      if (data.error === 'search_engine_requires_english') {
        return `⚠️ 搜索失败: ${data.message}\n请用英文关键词重新搜索。例如: ${data.example || '将中文翻译为英文'}`;
      }
      const ctx = data.formattedContext as string | undefined;
      return `🔍 联网搜索结果 (${data.source}):\n${ctx || JSON.stringify(data.results).substring(0, 1000)}`;
    }

    // ── Commodities ────────────────────────────────────────────────────
    case 'query_commodities': {
      const summary = data.summary as string | undefined;
      return `🧱 大宗商品: ${summary || `共${data.count}种商品`}`;
    }

    // ── SCFIS ──────────────────────────────────────────────────────────
    case 'query_scfis': {
      if (data.error) return `📦 SCFIS: ${data.error}`;
      return `📦 SCFIS运价: ${data.index}点, 约$${data.estimatedFreightUSD}/FEU, ${data.route}`;
    }

    // ── Carbon Price ───────────────────────────────────────────────────
    case 'query_carbon_price': {
      if (data.error) return `🌍 碳价: ${data.error}`;
      return `🌍 EU碳价: €${data.euaPrice}/t CO2, ${data.cbamExample || ''}`;
    }

    // ── CPSC Recalls ───────────────────────────────────────────────────
    case 'query_cpsc_recalls': {
      if (data.message) return `⚠️ CPSC召回: ${data.message}`;
      const risk = data.riskSummary as string | undefined;
      return `⚠️ CPSC召回(${data.totalRecalls}条):\n${risk || ''}`;
    }

    // ── Port Congestion ────────────────────────────────────────────────
    case 'query_port_congestion': {
      return `⚓ 港口拥堵: 全球${data.globalLevel}级, 热点: ${(data.affectedRoutes as string[])?.join(', ') || '无'}`;
    }

    // ── Amazon Competitors ──────────────────────────────────────────────
    case 'query_amazon_competitors': {
      const d = data as Record<string, unknown>;
      const snapshot = (d.competitorSnapshot || d) as Record<string, unknown>;
      if (!snapshot || (snapshot.competitorCount as number) === 0) {
        return `🏪 竞品数据暂不可用 [T3-Search][低]
当前无法获取 Amazon 实时数据（PricePilot MCP 和 Web Search 均失败）。
建议: 1. 手动浏览 amazon.com 搜索品类对比 2. 基于历史DB数据做竞品分析 3. 使用已知的供应商报价做参考`;
      }
      return `🏪 Amazon竞品分析 [T3-Search]
品类: ${snapshot.keyword as string}
竞品数量: ${snapshot.competitorCount as number}个
均价: $${(snapshot.avgPrice as number)?.toFixed(2)} | 最低: $${(snapshot.minPrice as number)?.toFixed(2)} | 最高: $${(snapshot.maxPrice as number)?.toFixed(2)}
平均评分: ${(snapshot.avgRating as number) || 'N/A'}★ | 平均评论: ${(snapshot.avgReviews as number) || 0}条
数据来源: ${snapshot.source as string}`;
    }

    // ── Financial Index ────────────────────────────────────────────────
    case 'query_financial_index': {
      return `📈 金融指数:\n${(data.summary as string) || JSON.stringify(data.indices)}`;
    }

    // ── Tariff ─────────────────────────────────────────────────────────
    case 'query_tariff': {
      return `💰 关税查询: ${JSON.stringify(data).substring(0, 500)}`;
    }

    // ── Cascade Risk ───────────────────────────────────────────────────
    case 'query_cascade_risk': {
      return `⚠️ 级联风险: ${JSON.stringify(data).substring(0, 500)}`;
    }

    // ── Decision Graph ─────────────────────────────────────────────────
    case 'query_decision_graph': {
      return `🔗 决策图: ${JSON.stringify(data).substring(0, 500)}`;
    }

    // ── Execute Workflow ───────────────────────────────────────────────
    case 'execute_workflow': {
      return `⚙️ 工作流: ${JSON.stringify(data).substring(0, 500)}`;
    }

    // ── Run Sandbox ────────────────────────────────────────────────────
    case 'run_sandbox': {
      return `🧪 仿真结果: ${JSON.stringify(data).substring(0, 500)}`;
    }

    // ── Default ────────────────────────────────────────────────────────
    default: return `查询完成: ${JSON.stringify(data).substring(0, 800)}`;
  }
}
