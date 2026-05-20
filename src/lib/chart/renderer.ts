/**
 * ECharts SSR Chart Renderer — zero browser dependency.
 *
 * Renders ECharts to SVG server-side via echarts SSR mode,
 * optionally converts to PNG via sharp (already a project dep).
 * Output saved to public/charts/, accessible via /charts/filename.
 */

import * as echarts from 'echarts';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { EChartsOption } from 'echarts';

const OUTPUT_DIR = join(process.cwd(), 'public', 'charts');

async function ensureDir() {
  try { await mkdir(OUTPUT_DIR, { recursive: true }); } catch { /* exists */ }
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  width?: number;
  height?: number;
  categories?: string[];
  series: Array<{
    name: string;
    data: number[];
    type?: string;
  }>;
}

function buildOption(spec: ChartSpec): EChartsOption {
  const typeMap: Record<string, string> = { bar: 'bar', line: 'line', scatter: 'scatter' };
  const seriesType = spec.type === 'pie' ? 'pie' : typeMap[spec.type] || 'bar';

  const baseOption: EChartsOption = {
    title: { text: spec.title, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: spec.type === 'pie' ? 'item' : 'axis' },
    legend: { bottom: 0, textStyle: { fontSize: 10 } },
    grid: spec.type === 'pie' ? undefined : { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    series: [],
  };

  if (spec.type === 'pie') {
    baseOption.series = [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: spec.series[0]?.data.map((v, i) => ({
        value: v,
        name: spec.categories?.[i] || `项目${i + 1}`,
      })) || [],
      label: { fontSize: 10 },
    }];
  } else {
    baseOption.xAxis = {
      type: 'category',
      data: spec.categories || [],
      axisLabel: { fontSize: 9, rotate: spec.categories && spec.categories.length > 6 ? 45 : 0 },
    };
    baseOption.yAxis = { type: 'value', axisLabel: { fontSize: 9 } };
    baseOption.series = spec.series.map(s => ({
      name: s.name,
      type: s.type || seriesType,
      data: s.data,
      smooth: spec.type === 'line',
    }));
  }

  return baseOption;
}

export async function renderChart(spec: ChartSpec): Promise<{ svgPath: string; url: string }> {
  await ensureDir();

  const option = buildOption(spec);
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: spec.width || 700,
    height: spec.height || 400,
  });
  chart.setOption(option);
  const svg = chart.renderToSVGString();

  const filename = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.svg`;
  const filepath = join(OUTPUT_DIR, filename);
  await writeFile(filepath, svg, 'utf-8');

  return {
    svgPath: filepath,
    url: `/charts/${filename}`,
  };
}

/**
 * Render multiple charts in parallel — used for report generation.
 */
export async function renderCharts(specs: ChartSpec[]): Promise<Array<{ url: string; title: string }>> {
  const results = await Promise.all(specs.map(s => renderChart(s)));
  return results.map((r, i) => ({ url: r.url, title: specs[i].title }));
}
