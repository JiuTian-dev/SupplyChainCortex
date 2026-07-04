/**
 * MCP Tools: Market Intelligence (exchange rates, weather, commodities, financial indices, competitor analysis).
 * Extracted from tools-intelligence.ts.
 */

import type { MCPTool } from '../tools';
import { getLatestRates, getRateHistory } from '@/lib/queries/exchange-rate.queries';
import { getAllPortsWeather, getPortWeatherSummary, getRouteMarineConditions } from '@/lib/services/weather.service';

export const marketIntelligence: MCPTool[] = [
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

  // ── query_commodities ──
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

  // ── query_scfis ──
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

  // ── query_carbon_price ──
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

  // ── query_financial_index ──
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

  // ── Amazon Competitor Intelligence ──
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

  // ── Brand Sentiment & Social Monitoring ──
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
