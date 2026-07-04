/**
 * MCP Tools: Business Intelligence (compliance, financial sim, product feed, arbitrage, supplier discovery, web search).
 * Extracted from tools-intelligence.ts.
 */

import type { MCPTool } from '../tools';

export const businessIntelligence: MCPTool[] = [
  // ── Compliance Auto-Check ──
  {
    name: 'query_compliance_check',
    description: '产品合规自动检查 — 输入产品名+目标市场，输出该品类需要的全部认证、费用估算、时间线。覆盖美国/欧盟/英国/日本的小家电品类。数据源: DB合规证书 + 内置合规数据库。',
    parameters: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: '产品名称，如 "蓝牙音箱" 或 "智能咖啡机"' },
        market: { type: 'string', description: '目标市场: US, EU, UK, JP' },
        description: { type: 'string', description: '产品补充描述(可选)' },
        action: { type: 'string', description: 'single(单市场) | multi(多市场对比)' },
      },
      required: ['product_name', 'market'],
    },
    handler: async (params) => {
      const { checkCompliance, checkMultiMarketCompliance } = await import('@/lib/engine/compliance-check');
      const productName = params.product_name as string;
      const market = (params.market as string) || 'US';
      const desc = params.description as string | undefined;
      const action = params.action as string || 'single';

      if (action === 'multi') {
        const results = await checkMultiMarketCompliance(productName, ['US', 'EU', 'UK', 'JP'], desc);
        return {
          product: productName,
          markets: Object.entries(results).map(([m, r]) => ({
            market: m,
            totalCostRange: `$${r.totalCostLow.toLocaleString()} - $${r.totalCostHigh.toLocaleString()}`,
            timelineWeeks: r.totalTimelineWeeks,
            mandatoryCount: r.requirements.filter(req => req.mandatory).length,
            missingCerts: r.missingCerts,
            warnings: r.warnings,
          })),
          note: '多市场合规对比。详细认证清单请按单个市场查询。',
        };
      }

      const result = await checkCompliance(productName, market, desc);
      return {
        ...result,
        note: `认证总费用: $${result.totalCostLow.toLocaleString()} - $${result.totalCostHigh.toLocaleString()}。最长认证周期: ${result.totalTimelineWeeks}周。数据基于行业标准估算，具体费用以检测机构报价为准。`,
      };
    },
  },

  // ── Financial Simulator ──
  {
    name: 'query_financial_sim',
    description: 'What-If财务模拟器 — 输入采购价/售价/销量/市场，输出到岸成本、12月P&L、盈亏平衡点、关税情景分析。帮助判断"这个品能不能做"。',
    parameters: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: '产品名称' },
        procurement_price_cny: { type: 'number', description: '1688/工厂采购价(人民币/台)' },
        selling_price_usd: { type: 'number', description: '平台售价(美元)' },
        monthly_sales: { type: 'number', description: '预估月销量(台)' },
        market: { type: 'string', description: '目标市场: US, EU, UK, JP' },
        weight_kg: { type: 'number', description: '产品重量(kg)' },
        tariff_rate_pct: { type: 'number', description: '关税税率%(可选，默认17.5%)' },
        action: { type: 'string', description: 'full(完整报告) | quick(快速判断)' },
      },
      required: ['procurement_price_cny', 'selling_price_usd', 'monthly_sales'],
    },
    handler: async (params) => {
      const { runSimulation, quickCheck } = await import('@/lib/engine/financial-simulator');
      const action = params.action as string || 'full';

      const input = {
        productName: (params.product_name as string) || '未命名产品',
        procurementPriceCny: params.procurement_price_cny as number,
        sellingPriceUsd: params.selling_price_usd as number,
        monthlySales: (params.monthly_sales as number) || 300,
        market: (params.market as string || 'US') as 'US' | 'EU' | 'UK' | 'JP',
        weightKg: (params.weight_kg as number) || 1.5,
        tariffRatePct: params.tariff_rate_pct as number | undefined,
      };

      if (action === 'quick') {
        const qc = quickCheck(input);
        return { ...qc, input };
      }

      const result = runSimulation(input);
      return {
        ...result,
        note: '本模拟器基于行业标准费用估算(FBA/海运/平台费)。实际费用因货代/季节/平台政策变动而异。建议作为决策参考而非财务承诺。',
      };
    },
  },

  // ── Product Feed Generator ──
  {
    name: 'query_product_feed',
    description: '生成AI代理可读的商品Feed — schema.org JSON-LD格式，用于让ChatGPT/Claude等AI购物代理发现和推荐你的商品。支持json-api/google-merchant/json-ld三种格式。',
    parameters: {
      type: 'object',
      properties: {
        format: { type: 'string', description: '输出格式: json-api | json-ld | google-merchant' },
        sku: { type: 'string', description: '单个SKU查询(可选，留空则输出全部)' },
        max_products: { type: 'number', description: '最大产品数(默认50)' },
      },
      required: [],
    },
    handler: async (params) => {
      const { generateProductFeed, getProductAgentCard } = await import('@/lib/engine/product-feed');
      const format = (params.format as string || 'json-api') as 'json-ld' | 'json-api' | 'google-merchant';
      const sku = params.sku as string | undefined;
      const maxProducts = (params.max_products as number) || 50;

      if (sku) {
        const card = await getProductAgentCard(sku);
        return {
          product: card,
          note: '此Feed格式可被AI购物代理(如ChatGPT/Claude Shopping)直接解析和推荐。',
        };
      }

      const feed = await generateProductFeed(format, maxProducts);
      return {
        format,
        feed: feed.slice(0, 30000), // truncate for chat context
        note: `已生成 ${format} 格式商品Feed。可直接嵌入网站<head>或提交至Google Merchant Center。2026年AI代理购物流量同比+393%，结构化Feed是GEO(生成式引擎优化)的基础。`,
      };
    },
  },

  // ── Cross-Platform Arbitrage Engine ──
  {
    name: 'query_arbitrage',
    description: '跨平台套利分析 — 输入产品描述，自动搜索1688采购价+Amazon竞品价+关税+合规成本，输出完整套利决策：毛利率/年利润/回本周期/合规清单/风险评估/投资建议。帮你判断"这个品能不能做"。',
    parameters: {
      type: 'object',
      properties: {
        product_description: { type: 'string', description: '产品描述，如 "便携榨汁杯 300ml USB充电"' },
        target_market: { type: 'string', description: '目标市场: US, EU, UK, JP (默认US)' },
        source_platform: { type: 'string', description: '采购平台: 1688 (默认), Temu' },
      },
      required: ['product_description'],
    },
    handler: async (params) => {
      const { findArbitrageOpportunity } = await import('@/lib/engine/arbitrage-engine');
      const result = await findArbitrageOpportunity({
        productDescription: params.product_description as string,
        targetMarket: params.target_market as string || 'US',
        sourcePlatform: params.source_platform as string || '1688',
      });
      return {
        ...result,
        note: `评分 ${result.score}/100。价格数据来自公开搜索，精确数据需接入1688/Amazon API。合规费用为行业估算值。`,
      };
    },
  },

  // ── AI Supplier Discovery ──
  {
    name: 'query_supplier_discovery',
    description: 'AI供应商发现 — 输入产品描述，搜索1688/Alibaba/GlobalSources匹配供应商。按价格/MOQ/交期/认证/地理位置综合评分排序。生成中文询盘模板。零API成本，基于联网搜索。',
    parameters: {
      type: 'object',
      properties: {
        product_description: { type: 'string', description: '产品描述，如 "蓝牙音箱 便携防水"' },
        target_market: { type: 'string', description: '目标市场: US, EU (默认US)' },
      },
      required: ['product_description'],
    },
    handler: async (params) => {
      const { discoverSuppliers } = await import('@/lib/engine/supplier-discovery');
      const result = await discoverSuppliers(
        params.product_description as string,
        params.target_market as string || 'US',
      );
      return {
        ...result,
        note: '供应商数据来自公开搜索，评分和报价为AI估算。建议联系供应商确认实际报价、MOQ和交期。询盘模板可直接复制使用。',
      };
    },
  },

  // ── web_search ──
  {
    name: 'web_search',
    description: '联网搜索最新公开信息。搜索引擎覆盖Wikipedia英文百科+Google News英文新闻。支持中英文——中文查询请先翻译为英文关键词再搜索以获得最佳结果。用于获取SCFI运价、LME铜铝钢、EU碳价、CPSC召回、关税政策、港口新闻等实时外部数据。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，如: "SCFI Shanghai container freight index May 2026"',
        },
      },
      required: ['query'],
    },
    handler: async (params) => {
      const { webSearch, formatSearchContext } = await import('@/lib/services/web-search.service');
      const query = (params.query as string) || '';
      // Debug: log the received query to check for encoding issues
      if (query.length > 0) {
        console.log('[web_search] raw query chars:', [...query].map(c => c.codePointAt(0)?.toString(16)).join(' '));
      }
      const { results, source } = await webSearch(query);
      return {
        source,
        query,
        resultCount: results.length,
        results: results.slice(0, 8),
        formattedContext: formatSearchContext(results),
      };
    },
  },
];
