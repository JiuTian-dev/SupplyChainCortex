/**
 * MCP Tools: Intelligence (analytics, exchange rates, weather, cascade risk, decision graph, workflow, tariff, sandbox).
 * Extracted from tools.ts.
 */

import type { MCPTool } from './tools';
import { summarize } from './helpers';

import {
  getSupplierPerformanceAnalytics, getCostOptimizationAnalytics,
  getInventoryForecastAnalytics, getSupplyChainRiskAnalytics,
  getSalesForecastAnalytics, getInventoryOptimizationAnalytics,
} from '@/lib/queries/analytics.queries';

import { getLatestRates, getRateHistory } from '@/lib/queries/exchange-rate.queries';

import { getAllPortsWeather, getPortWeatherSummary, getRouteMarineConditions } from '@/lib/services/weather.service';

import { getCascadeRisk } from '@/lib/services/cascade-risk.service';

import { executeDecisionGraph, getDecisionDomains } from '@/lib/services/decision-graph.service';

import { executeWorkflow, detectWorkflows, getWorkflows } from '@/lib/services/mcp-orchestration.service';

import { computeTariff, getTariffOverview, simulateTariffScenario } from '@/lib/services/tariff.service';

import { runSandbox } from '@/lib/services/agent-sandbox.service';

// ─── Tool Definitions ───────────────────────────────────────────────────────────

export const intelligenceTools: MCPTool[] = [
  {
    name: 'query_analytics',
    description: '获取深度分析数据，包括库存周转分析、成本趋势、销售预测、供应商绩效和供应链风险等高级分析。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '分析类型: supplier_performance(供应商绩效), cost_optimization(成本优化), inventory_forecast(库存预测), risk_analysis(风险分析), sales_forecast(销售预测), inventory_optimization(库存优化)',
          enum: ['supplier_performance', 'cost_optimization', 'inventory_forecast', 'risk_analysis', 'sales_forecast', 'inventory_optimization'],
        },
        forecastDays: {
          type: 'number',
          description: '预测天数，默认14(用于inventory_forecast和sales_forecast)',
        },
      },
      required: ['action'],
    },
    handler: async (params) => {
      const { action, forecastDays } = params;
      switch (action) {
        case 'supplier_performance':
          return summarize(await getSupplierPerformanceAnalytics());
        case 'cost_optimization':
          return summarize(await getCostOptimizationAnalytics());
        case 'inventory_forecast':
          return summarize(await getInventoryForecastAnalytics((forecastDays as number) || 14));
        case 'risk_analysis':
          return summarize(await getSupplyChainRiskAnalytics());
        case 'sales_forecast':
          return summarize(await getSalesForecastAnalytics((forecastDays as number) || 30));
        case 'inventory_optimization':
          return summarize(await getInventoryOptimizationAnalytics());
        default:
          throw new Error(`未知的分析类型: ${action}`);
      }
    },
  },

  // ── Exchange Rates (Frankfurter API) ──
  {
    name: 'query_exchange_rates',
    description: '查询实时人民币汇率数据（来源：Frankfurter API）。支持最新汇率、历史趋势、货币转换。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['latest', 'history'],
          description: 'latest=最新汇率, history=历史趋势',
        },
        base: {
          type: 'string',
          description: '基准货币代码，默认 CNY',
        },
        target: {
          type: 'string',
          description: '目标货币代码（history 模式必需），如 USD/EUR/JPY/KRW',
        },
        days: {
          type: 'number',
          description: '历史天数（history 模式），默认 90',
        },
      },
      required: ['action'],
    },
    handler: async (params) => {
      const action = (params.action as string) || 'latest';
      switch (action) {
        case 'latest':
          return await getLatestRates((params.base as string) || 'CNY');
        case 'history':
          return await getRateHistory(
            (params.base as string) || 'CNY',
            (params.target as string) || 'USD',
            (params.days as number) || 90
          );
        default:
          throw new Error(`未知的汇率操作: ${action}`);
      }
    },
  },

  // ── Port Weather (Open-Meteo API) ──
  {
    name: 'query_weather',
    description: '查询全球主要港口的实时天气和海况数据（来源：Open-Meteo API）。支持全港口天气、摘要、航线海况。航线海况可用于评估天气延误风险。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['all', 'summary', 'marine'],
          description: 'all=所有港口详细天气+预警, summary=中文摘要, marine=航线海况评估(需fromLat/fromLon/toLat/toLon)',
        },
        fromLat: { type: 'number', description: '起点纬度 (marine模式)' },
        fromLon: { type: 'number', description: '起点经度 (marine模式)' },
        toLat: { type: 'number', description: '终点纬度 (marine模式)' },
        toLon: { type: 'number', description: '终点经度 (marine模式)' },
      },
      required: ['action'],
    },
    handler: async (params) => {
      const action = (params.action as string) || 'summary';
      switch (action) {
        case 'all':
          return await getAllPortsWeather();
        case 'summary':
          return await getPortWeatherSummary();
        case 'marine': {
          const { fromLat, fromLon, toLat, toLon } = params;
          if ([fromLat, fromLon, toLat, toLon].some(v => typeof v !== 'number')) {
            throw new Error('marine 模式需要 fromLat, fromLon, toLat, toLon 参数');
          }
          return await getRouteMarineConditions(fromLat as number, fromLon as number, toLat as number, toLon as number);
        }
        default:
          throw new Error(`未知的天气操作: ${action}`);
      }
    },
  },

  // ── 17. query_cascade_risk ──────────────────────────────────────────────────
  {
    name: 'query_cascade_risk',
    description: '供应链级联风险传播模拟。情景驱动式仿真，模拟风险事件（供应中断、汇率冲击、关税上调、天气恶劣、港口拥堵、供应商故障等）如何沿供应链依赖关系（港口→货运→仓库→产品→客户）逐级传播，计算受影响产品排名、传播路径和预估收入影响。这是本项目的核心创新算法。如需仅查询风险状态和数据（风险仪表盘、矩阵、缓解措施、预警），请使用 query_risk 工具。',
    parameters: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['weather_disruption', 'port_congestion', 'exchange_shock', 'exchange_rate_shock', 'supplier_failure', 'supply_disruption', 'demand_spike', 'tariff_increase', 'tariff_escalation', 'auto'],
          description: '模拟场景: weather_disruption(天气,使用实时Open-Meteo数据), port_congestion(港口拥堵), exchange_shock/exchange_rate_shock(汇率冲击,使用实时Frankfurter数据), supplier_failure(供应商故障), supply_disruption(供应中断), demand_spike(需求激增), tariff_increase/tariff_escalation(关税上调,使用实时关税数据), auto(自动检测)',
        },
        sourcePort: {
          type: 'string',
          description: '当scenario=port_congestion时，指定拥堵的港口名称',
        },
      },
      required: [],
    },
    handler: async (params) => {
      const rawScenario = (params.scenario as string) || 'auto';
      const sourcePort = params.sourcePort as string | undefined;

      // Map user-facing scenario names to engine-compatible names
      const scenarioMap: Record<string, string> = {
        'exchange_rate_shock': 'exchange_shock',
        'supply_disruption': 'supplier_failure',
        'tariff_increase': 'tariff_escalation',
        'demand_spike': 'auto',
      };
      const mappedScenario = scenarioMap[rawScenario] || rawScenario;

      return await getCascadeRisk({
        scenario: mappedScenario as 'weather_disruption' | 'port_congestion' | 'exchange_shock' | 'supplier_failure' | 'tariff_escalation' | 'auto',
        sourcePort,
      });
    },
  },

  // ── 18. query_decision_graph ──────────────────────────────────────────────
  {
    name: 'query_decision_graph',
    description: '供应链决策形式化推理引擎。基于实时数据（汇率、天气、库存、风险），遍历预定义的决策图，输出结构化的行动建议。支持: inventory/cost/logistics/cross_domain 领域。这是"告诉我该怎么做"而非"告诉我数据是什么"。',
    parameters: {
      type: 'object',
      properties: {
        domains: {
          type: 'string',
          description: '决策领域，逗号分隔。可选: inventory(补货), cost(汇率/利润), logistics(货运/延误), supplier, cross_domain(综合)。默认自动检测',
        },
        query: {
          type: 'string',
          description: '用户原始查询，用于自动检测相关领域',
        },
        includeAll: {
          type: 'boolean',
          description: '是否包含所有领域（默认 false，只自动检测相关领域）',
        },
      },
      required: [],
    },
    handler: async (params) => {
      const domainsStr = params.domains as string | undefined;
      const domains = domainsStr ? domainsStr.split(',').map(s => s.trim()) as Array<'inventory' | 'cost' | 'logistics' | 'supplier' | 'cross_domain'> : undefined;
      const query = (params.query as string) || '';
      const includeAll = params.includeAll === true || params.includeAll === 'true';
      return await executeDecisionGraph({ query, domains, includeAll });
    },
  },

  // ── 19. execute_workflow ──────────────────────────────────────────────────
  {
    name: 'execute_workflow',
    description: 'MCP工具多步骤编排引擎。将多个MCP工具串联为自动化工作流，支持共享上下文和条件分支。可用工作流: wf-fx-impact(汇率冲击分析), wf-weather-disruption(天气中断评估), wf-inventory-health(库存健康检查), wf-full-health(全面体检), wf-product-deep-dive(产品深度分析)。自动根据用户查询检测合适的工作流。',
    parameters: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: '工作流ID。可选: wf-fx-impact, wf-weather-disruption, wf-inventory-health, wf-full-health, wf-product-deep-dive。留空则自动检测',
        },
        query: {
          type: 'string',
          description: '用户原始查询，用于自动检测合适的工作流',
        },
        autoDetect: {
          type: 'boolean',
          description: '是否自动检测并运行最匹配的工作流（默认 true）',
        },
      },
      required: [],
    },
    handler: async (params) => {
      const query = (params.query as string) || '';
      const autoDetect = params.autoDetect !== false && params.autoDetect !== 'false';

      if (autoDetect && !params.workflowId) {
        const workflows = detectWorkflows(query);
        if (workflows.length > 0) {
          return await executeWorkflow(workflows[0].id, { query });
        }
        // Fallback: run full health check
        return await executeWorkflow('wf-full-health', { query });
      }

      const workflowId = (params.workflowId as string) || 'wf-full-health';
      return await executeWorkflow(workflowId, { query });
    },
  },

  // ── 20. query_tariff ──────────────────────────────────────────────────────
  {
    name: 'query_tariff',
    description: '查询动态关税数据并模拟关税情景。基于真实HS编码、WTO MFN税率、Section 301、EU CBAM、RCEP、USMCA等贸易协定。支持关税计算、概览、情景模拟（如US加征至25%、墨西哥转口等）。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['overview', 'compute', 'simulate'],
          description: 'overview=关税全景, compute=计算特定产品关税, simulate=关税情景模拟',
        },
        category: { type: 'string', description: '产品品类 (compute模式)' },
        countryCode: { type: 'string', description: '目的国代码 e.g. US/EU/JP (compute模式)' },
        sellingPrice: { type: 'number', description: '售价USD (compute模式)' },
        scenario: { type: 'string', description: '情景名称 (simulate模式)。可用: US Section 301 escalation, EU CBAM full enforcement, RCEP tariff elimination, Mexico transshipment route, De minimis elimination' },
      },
      required: ['action'],
    },
    handler: async (params) => {
      switch (params.action) {
        case 'overview': return await getTariffOverview();
        case 'compute': {
          if (!params.category || !params.countryCode) throw new Error('compute 需要 category 和 countryCode');
          return await computeTariff({ category: params.category as string, countryCode: params.countryCode as string, sellingPrice: (params.sellingPrice as number) || 39.99 });
        }
        case 'simulate': {
          if (!params.scenario) throw new Error('simulate 需要 scenario');
          return await simulateTariffScenario(params.scenario as string);
        }
        default: throw new Error(`未知操作: ${params.action}`);
      }
    },
  },

  // ── 21. run_sandbox ──────────────────────────────────────────────────────
  {
    name: 'run_sandbox',
    description: '多Agent供应链沙盒模拟。4个角色Agent（仓库经理/供应商/货代/市场）在共享环境中交互N轮，测试供应链韧性。支持baseline/trade_war/typhoon_season/perfect_storm场景。纯规则驱动，无需LLM调用。',
    parameters: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['baseline', 'trade_war', 'typhoon_season', 'perfect_storm'],
          description: '模拟场景: baseline(正常), trade_war(关税战), typhoon_season(台风季), perfect_storm(完美风暴-三重冲击)',
        },
        rounds: {
          type: 'number',
          description: '模拟轮数 (默认100, 最大200)',
        },
      },
      required: [],
    },
    handler: async (params) => {
      return await runSandbox({
        scenario: (params.scenario as 'baseline' | 'trade_war' | 'typhoon_season' | 'perfect_storm') || 'perfect_storm',
        rounds: Math.min((params.rounds as number) || 100, 200),
      });
    },
  },

  // ── 22. web_search ───────────────────────────────────────────────────────
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

  // ── 23. query_commodities ────────────────────────────────────────────────
  {
    name: 'query_commodities',
    description: '查询大宗商品日度价格：铜(Copper)、铝(Aluminum)、螺纹钢(Steel Rebar)、PP聚丙烯、LLDPE聚乙烯、PVC聚氯乙烯。数据来源: Alpha Vantage + SHFE/DCE期货交易所。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { fetchDailyCommodities } = await import('@/lib/sources/alphavantage-commodities');
      const commodities = await fetchDailyCommodities();
      return {
        count: commodities.length,
        commodities: commodities.map(c => ({
          name: c.name, code: c.code, price: c.price, unit: c.unit,
          changePct: c.changePct, date: c.date, source: c.source,
        })),
        summary: commodities.map(c => `${c.name}: ${c.price} ${c.unit} (${c.changePct > 0 ? '+' : ''}${c.changePct}%)`).join(' | '),
      };
    },
  },

  // ── 24. query_scfis ──────────────────────────────────────────────────────
  {
    name: 'query_scfis',
    description: '查询SCFIS欧洲航线集装箱运价指数期货(INE上海国际能源交易中心)。可推算上海→欧洲集装箱运费。公开数据，无需密钥。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { fetchSCFISPrice, scfisToFreightRate } = await import('@/lib/sources/scfis-futures');
      const data = await fetchSCFISPrice();
      if (!data) return { error: 'SCFIS数据暂不可用（非交易时间或合约未找到）' };
      const freight = scfisToFreightRate(data.price);
      return {
        index: data.price,
        contract: data.contract,
        date: data.date,
        changePct: data.changePct,
        estimatedFreightUSD: freight.rateUSD,
        route: freight.route,
        source: data.source,
      };
    },
  },

  // ── 25. query_carbon_price ───────────────────────────────────────────────
  {
    name: 'query_carbon_price',
    description: '查询欧盟碳排放配额(EUA)实时价格。ICE欧洲期货交易所公开数据，通过新浪全球期货接口。用于CBAM碳关税成本计算。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { fetchCarbonPrice, estimateCBAMCost } = await import('@/lib/sources/carbon-price');
      const data = await fetchCarbonPrice();
      if (!data) return { error: '碳价数据暂不可用（非交易时间）' };
      return {
        euaPrice: data.price,
        unit: 'EUR/吨 CO2',
        changePct: data.changePct,
        date: data.date,
        source: data.source,
        cbamExample: `一台3kg咖啡机(碳足迹7.5kg CO2)的CBAM成本约为 €${estimateCBAMCost(data.price, 3).toFixed(2)}/台（2026年10%付费比例）`,
      };
    },
  },

  // ── 26. query_cpsc_recalls ───────────────────────────────────────────────
  {
    name: 'query_cpsc_recalls',
    description: '查询美国CPSC消费品召回数据(中国产小家电)。数据来源: 江苏省公平贸易预警平台(CCPIT贸促会)，每日更新。用于合规风险评估。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { fetchProductRecalls } = await import('@/lib/sources/cpsc-recall');
      const recalls = await fetchProductRecalls();
      if (recalls.length === 0) return { message: '近期无小家电相关CPSC召回', totalChecked: 'CCPIT最近30天数据' };
      return {
        totalRecalls: recalls.length,
        recalls: recalls.map(r => ({
          title: r.title, date: r.date, hazard: r.hazard,
          country: r.country, productName: r.productName, remedy: r.remedy,
        })),
        riskSummary: recalls.map(r => `[${r.hazard}] ${r.title}`).join('\n'),
        complianceNote: '以上召回涉及中国产小家电，请检查自有产品是否涉及类似缺陷',
      };
    },
  },

  // ── 27. query_port_congestion ────────────────────────────────────────────
  {
    name: 'query_port_congestion',
    description: '查询全球10大港口拥堵状况。综合GSCPI(纽约联储供应链压力指数)和公开港口报告。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { getPortCongestion } = await import('@/lib/sources/port-congestion');
      const data = await getPortCongestion();
      return {
        globalLevel: data.globalLevel,
        affectedRoutes: data.affectedRoutes,
        source: data.source,
        ports: data.ports.map(p => ({
          port: p.port, country: p.country,
          congestion: p.congestionLevel, waitDays: p.avgWaitDays,
          vesselsWaiting: p.vesselsWaiting, trend: p.trend,
        })),
      };
    },
  },

  // ── 28. query_financial_index ───────────────────────────────────────────
  {
    name: 'query_financial_index',
    description: '查询金融市场指数：纳斯达克100(QQQ)、标普500(SPY)、半导体指数(SMH)、纳斯达克综合(^IXIC)。可用于分析科技股/芯片股走势对供应链的影响。',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: '指数代码列表，默认全部: QQQ, SPY, SMH, ^IXIC',
        },
      },
      required: [],
    },
    handler: async (params) => {
      const { queryFinancialIndices, formatIndexSummary } = await import('@/lib/sources/financial-indices');
      const symbols = params.symbols as string[] | undefined;
      const results = await queryFinancialIndices(symbols);
      return {
        indices: results,
        summary: formatIndexSummary(results),
        note: '数据来源 Alpha Vantage，缓存30分钟。免费层限25次/天。',
      };
    },
  },

  // ── Amazon Competitor Intelligence ──────────────────────────────────────────
  {
    name: 'query_amazon_competitors',
    description: '查询亚马逊竞品数据 — 品类价格趋势、竞争对手价格区间、产品信息。数据源: PricePilot MCP(免费) + 联网搜索。适用于了解竞品定价和市场格局。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '产品关键词，如 "coffee maker" 或 "vacuum cleaner"' },
        category: { type: 'string', description: '亚马逊品类名，如 "coffee-makers" "vacuums" "blenders"' },
        action: { type: 'string', description: 'overview(竞品总览) | trends(品类趋势) | lookup(单品查询)' },
      },
      required: [],
    },
    handler: async (params) => {
      const { fetchCompetitorPrices, fetchCategoryTrends, lookupProduct } = await import('@/lib/sources/amazon-competitor');
      const action = params.action as string || 'overview';
      const keyword = params.keyword as string || 'small kitchen appliance';
      const category = params.category as string;

      if (action === 'trends') {
        const cats = category ? [category] : ['coffee-makers', 'vacuums', 'blenders', 'air-fryers'];
        const trends = await fetchCategoryTrends(cats);
        return { trends, note: '数据源: PricePilot MCP(免费) + Web Search fallback' };
      }

      if (action === 'lookup') {
        const product = await lookupProduct(keyword);
        return { product, note: '数据源: Web Search(免费)' };
      }

      const prices = await fetchCompetitorPrices(keyword, category);
      return { prices, keyword, category, note: '数据源: PricePilot MCP(免费) + Web Search fallback。价格区间为估算值，精确数据需接入Keepa/JungleScout API。' };
    },
  },

  // ── Brand Sentiment & Social Monitoring ─────────────────────────────────────
  {
    name: 'query_brand_sentiment',
    description: '查询品牌/产品的社交媒体舆情 — Reddit、Twitter/X、论坛的提及、情感分析、风险信号检测。免费，基于联网搜索。适用于监控产品口碑、竞品动态、质量风险预警。',
    parameters: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: '品牌或产品名称，如 "Cosori air fryer" 或 "Govee humidifier"' },
        action: { type: 'string', description: 'full(完整报告) | quick(快速风险扫描) | reviews(差评监控)' },
      },
      required: ['brand'],
    },
    handler: async (params) => {
      const { generateSentimentReport, quickRiskScan, monitorProductReviews } = await import('@/lib/sources/social-sentiment');
      const brand = params.brand as string;
      const action = params.action as string || 'full';

      if (action === 'quick') {
        const scan = await quickRiskScan(brand);
        return { ...scan, note: '快速风险扫描基于搜索摘要，完整报告需进一步分析。' };
      }

      if (action === 'reviews') {
        const signals = await monitorProductReviews(brand);
        return {
          product: brand,
          negativeSignalCount: signals.length,
          signals: signals.slice(0, 10),
          riskFlags: [...new Set(signals.flatMap(s => {
            const lower = (s.title + ' ' + s.snippet).toLowerCase();
            const flags = ['recall', 'fire', 'defective', 'dangerous', 'shock', 'broke'];
            return flags.filter(f => lower.includes(f));
          }))],
          note: '基于搜索结果提取的负面信号。建议结合CPSC召回数据库交叉验证。',
        };
      }

      const report = await generateSentimentReport(brand);
      return {
        ...report,
        note: `情感评分: ${report.sentimentScore} (范围 -1到+1)。数据源: 联网搜索(免费)。`,
      };
    },
  },

  // ── Compliance Auto-Check ──────────────────────────────────────────────────
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

  // ── Financial Simulator ─────────────────────────────────────────────────────
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

  // ── Product Feed Generator ──────────────────────────────────────────────────
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

  // ── Cross-Platform Arbitrage Engine ────────────────────────────────────────
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

  // ── Decision Coherence Audit ───────────────────────────────────────────────
  {
    name: 'query_coherence_audit',
    description: '决策一致性审计 — 扫描全部SKU，检测跨系统矛盾: HS编码vs关税不匹配、安全库存vs实际交货期脱节、认证缺失或过期、产地vs关税率冲突、售价无法覆盖成本。输出审计评分和修复建议。这是市场上独有的功能。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { runCoherenceAudit } = await import('@/lib/engine/coherence-audit');
      const report = await runCoherenceAudit();
      return {
        ...report,
        note: '决策一致性审计是SupplyChain Cortex独有功能。30-40%的跨境物流延误来自跨系统数据不一致(Forbes 2026)。定期审计可避免海关稽查、平台下架和资金损失。',
      };
    },
  },

  // ── Product Recall Early Warning ───────────────────────────────────────────
  {
    name: 'query_recall_risk',
    description: '产品召回风险预警 — 基于CPSC历史召回数据+产品品类模式匹配，分析你的SKU是否存在召回隐患。输出风险评分、匹配的召回模式、建议的预防性修复措施及成本估算。提前预警，防止成为下一个召回。',
    parameters: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: '可选: 只分析特定SKU' },
      },
      required: [],
    },
    handler: async (params) => {
      const { runRecallRiskAnalysis } = await import('@/lib/engine/recall-early-warning');
      const report = await runRecallRiskAnalysis();
      if (params.sku) {
        const product = report.products.find(p => p.sku === params.sku);
        return {
          product,
          allSkusCount: report.totalSkusAnalyzed,
          note: product
            ? `${product.sku} 召回风险: ${product.riskLevel}, 评分 ${product.riskScore}/100`
            : `未找到SKU ${params.sku}`,
        };
      }
      return {
        ...report,
        note: '召回模式基于CPSC 2024-2026历史数据。预防性修复措施的成本为行业估算值。高危SKU建议优先安排工厂审核。',
      };
    },
  },

  // ── AI Supplier Discovery ──────────────────────────────────────────────────
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

  // ─── Chart Generation ────────────────────────────────────────────────────────
  {
    name: 'generate_chart',
    description: `生成数据可视化图表（柱状图/折线图/饼图/散点图），返回可嵌入回复的图片URL。
使用场景：用户要求"画图"、"做图表"、"可视化"、"生成报告"时调用。
支持类型: bar(柱状图), line(折线图), pie(饼图), scatter(散点图)。
数据格式: categories(横轴标签数组) + series(系列数据，每项包含 name 和 data 数组)。`,
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bar', 'line', 'pie', 'scatter'], description: '图表类型' },
        title: { type: 'string', description: '图表标题（中文）' },
        categories: { type: 'array', items: { type: 'string' }, description: '横轴分类标签，饼图为扇区名称' },
        series: { type: 'array', items: {
          type: 'object', properties: {
            name: { type: 'string', description: '系列名称' },
            data: { type: 'array', items: { type: 'number' }, description: '数据值数组' },
          }
        }, description: '数据系列数组' },
      },
      required: ['type', 'title', 'series'],
    },
    handler: async (params: Record<string, unknown>) => {
      const { renderChart } = await import('@/lib/chart/renderer');
      const result = await renderChart({
        type: params.type as 'bar' | 'line' | 'pie' | 'scatter',
        title: params.title as string,
        categories: params.categories as string[] | undefined,
        series: params.series as Array<{ name: string; data: number[] }>,
      });
      return {
        url: result.url,
        chartType: params.type,
        title: params.title,
        hint: '将图片URL嵌入回复: ![图表](URL) 或 <img src="URL" />',
      };
    },
  },

  // ─── analyze_and_chart: One-click DB query + chart ─────────────────────────
  {
    name: 'analyze_and_chart',
    description: `一键数据分析+图表生成。选择指标和维度，自动查询数据库、计算聚合、生成可视化图表。返回图片URL。
指标: grossMargin(毛利率) | turnoverDays(周转天数) | quantity(库存数量) | revenue(销售额) | totalLanded(到岸成本)
维度: category(品类) | warehouse(仓库) | platform(平台) | category_sub(子品类)
图表: bar(柱状图) | pie(饼图，默认)`,
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['grossMargin','turnoverDays','quantity','revenue','totalLanded','delayDays'], description: '分析指标' },
        dimension: { type: 'string', enum: ['category','warehouse','platform','category_sub'], description: '分组维度，默认 category' },
        chartType: { type: 'string', enum: ['bar','pie'], description: '图表类型，默认 bar' },
        title: { type: 'string', description: '自定义标题，留空自动生成' },
      },
      required: ['metric'],
    },
    handler: async (params: Record<string, unknown>) => {
      const { analyzeAndChart } = await import('@/lib/chart/analyze-chart');
      return analyzeAndChart({
        metric: params.metric as any,
        dimension: (params.dimension as any) || 'category',
        chartType: (params.chartType as any) || 'bar',
        title: params.title as string | undefined,
      });
    },
  },

  // ─── generate_report: Batch chart report ───────────────────────────────────
  {
    name: 'generate_report',
    description: `一键生成供应链分析报告（含2-5张图表+摘要）。自动查询DB并生成多张可视化图表。
报告类型: inventory_health(库存健康+仓库分布), cost_analysis(毛利率+成本区间), sales_overview(平台销售+订单), full_health(综合报告)
用户说"生成报告"、"出个报告"时直接调用。`,
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['inventory_health','cost_analysis','sales_overview','full_health'], description: '报告类型' },
      },
      required: ['type'],
    },
    handler: async (params: Record<string, unknown>) => {
      const { generateReport } = await import('@/lib/chart/report-generator');
      return generateReport(params.type as any);
    },
  },
];
