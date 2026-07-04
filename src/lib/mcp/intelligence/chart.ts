/**
 * MCP Tools: Chart Intelligence (generate_chart, analyze_and_chart, generate_report).
 * Extracted from tools-intelligence.ts.
 */

import type { MCPTool } from '../tools';

export const chartIntelligence: MCPTool[] = [
  // ─── Chart Generation ──
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

  // ── analyze_and_chart: One-click DB query + chart ──
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
      const result = await analyzeAndChart({
        metric: params.metric as any,
        dimension: (params.dimension as any) || 'category',
        chartType: (params.chartType as any) || 'bar',
        title: params.title as string | undefined,
      });
      return {
        ...result,
        embedHint: `在回复中嵌入图片: ![${result.title}](${result.url})`,
      };
    },
  },

  // ── generate_report: Batch chart report ──
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
