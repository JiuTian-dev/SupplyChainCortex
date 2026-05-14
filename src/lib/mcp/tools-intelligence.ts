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
];
