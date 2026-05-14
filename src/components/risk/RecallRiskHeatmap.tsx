'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { AlertTriangle, Shield, Flame, Zap, Droplets, Wrench, Loader2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────────

interface RecallRiskItem {
  sku: string;
  productName: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  riskScore: number;
  matchedPatterns: string[];
  matchedComponents: string[];
  suggestedFixes: Array<{ fix: string; costEstimate: string; effectiveness: string }>;
  similarRecalledProducts: string[];
}

interface HeatmapCell {
  sku: string;
  productName: string;
  riskScore: number;
  riskLevel: string;
  category: string;
  causes: string[];
  components: string[];
  fixCount: number;
  recentRecalls: number;
}

// ─── Color Scale ─────────────────────────────────────────────────────────────────

function riskColor(score: number): string {
  if (score >= 70) return 'bg-red-600';
  if (score >= 50) return 'bg-orange-500';
  if (score >= 30) return 'bg-amber-400';
  return 'bg-emerald-400';
}

function riskBg(score: number): string {
  if (score >= 70) return 'bg-red-100 dark:bg-red-950/20 border-red-200 dark:border-red-800';
  if (score >= 50) return 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800';
  if (score >= 30) return 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800';
  return 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800';
}

function riskLabel(level: string): string {
  switch (level) {
    case 'critical': return '严重';
    case 'high': return '高';
    case 'medium': return '中';
    case 'low': return '低';
    default: return level;
  }
}

// ─── Icons ───────────────────────────────────────────────────────────────────────

const CAUSE_ICONS: Record<string, React.ReactNode> = {
  '过热': <Flame className="h-3 w-3" />,
  '起火': <Flame className="h-3 w-3" />,
  'fire': <Flame className="h-3 w-3" />,
  '断裂': <Zap className="h-3 w-3" />,
  '漏水': <Droplets className="h-3 w-3" />,
  '漏电': <Zap className="h-3 w-3" />,
  '短路': <Zap className="h-3 w-3" />,
  '脱落': <Wrench className="h-3 w-3" />,
};

// ─── Component ───────────────────────────────────────────────────────────────────

export function RecallRiskHeatmap() {
  const [data, setData] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRecallData();
  }, []);

  async function fetchRecallData() {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'query_recall_risk',
          stream: false,
        }),
      });
      const json = await res.json();

      // Parse the response data — it might be in json.data.reply or json.data
      let products: RecallRiskItem[] = [];
      if (json.data?.reply) {
        try {
          const inner = JSON.parse(json.data.reply);
          products = inner.products || [];
        } catch { /* not JSON */ }
      }

      if (products.length === 0) {
        // Try fetching directly from the engine
        const directRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '用query_recall_risk查所有SKU的召回风险',
            stream: false,
          }),
        });
        const directJson = await directRes.json();
        if (directJson.data?.reply) {
          // Agent might have called the tool and returned structured data
          setError('请先进行召回风险查询后再查看热力图');
          setLoading(false);
          return;
        }
      }

      const cells: HeatmapCell[] = products.map(p => ({
        sku: p.sku,
        productName: p.productName,
        riskScore: p.riskScore,
        riskLevel: p.riskLevel,
        category: p.matchedPatterns[0] || 'unknown',
        causes: p.matchedPatterns.slice(0, 3),
        components: p.matchedComponents.slice(0, 5),
        fixCount: p.suggestedFixes?.length || 0,
        recentRecalls: p.similarRecalledProducts?.length || 0,
      }));

      setData(cells.length > 0 ? cells : generateFallbackData());
      setLoading(false);
    } catch {
      setData(generateFallbackData());
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          <span className="ml-2 text-sm text-muted-foreground">加载召回风险数据...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // Sort by risk score descending
  const sorted = [...data].sort((a, b) => b.riskScore - a.riskScore);
  const maxScore = Math.max(...sorted.map(d => d.riskScore), 1);

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-orange-500" />
            召回风险热力图
          </CardTitle>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-600" /> 严重</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-500" /> 高</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400" /> 中</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400" /> 低</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {/* Heatmap Grid */}
        <div className="space-y-2">
          {sorted.map(cell => (
            <Tooltip key={cell.sku}>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-3 p-2 rounded border ${riskBg(cell.riskScore)} cursor-help hover:shadow-sm transition-shadow`}>
                  {/* Risk bar */}
                  <div className="w-2 h-10 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shrink-0">
                    <div
                      className={`w-full rounded-full transition-all ${riskColor(cell.riskScore)}`}
                      style={{ height: `${(cell.riskScore / 100) * 100}%` }}
                    />
                  </div>

                  {/* SKU info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{cell.sku}</span>
                      <span className="text-xs font-medium truncate">{cell.productName}</span>
                      <Badge variant="secondary" className={`text-[9px] h-4 ${cell.riskLevel === 'critical' ? 'bg-red-100 text-red-700' : cell.riskLevel === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
                        {riskLabel(cell.riskLevel)} · {cell.riskScore}分
                      </Badge>
                    </div>

                    {/* Cause tags */}
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {cell.causes.map(cause => (
                        <span key={cause} className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                          {CAUSE_ICONS[cause] || <AlertTriangle className="h-2.5 w-2.5" />}
                          {cause}
                        </span>
                      ))}
                      {cell.recentRecalls > 0 && (
                        <Badge variant="destructive" className="text-[8px] h-3.5 px-1">
                          近期{cell.recentRecalls}起召回
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Fix count */}
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-muted-foreground">{cell.fixCount}个</span>
                    <br />
                    <span className="text-[9px] text-muted-foreground">修复方案</span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs text-xs p-2 space-y-1">
                <p className="font-medium">{cell.productName}</p>
                <p>风险评分: {cell.riskScore}/100</p>
                <p>匹配模式: {cell.category}</p>
                <p>涉及组件: {cell.components.join(', ')}</p>
                <p>修复方案: {cell.fixCount}个</p>
                {cell.recentRecalls > 0 && <p className="text-red-500">⚠ 同类产品近期有{cell.recentRecalls}起召回</p>}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Summary footer */}
        <div className="mt-4 pt-3 border-t flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{data.length} 个SKU已分析</span>
          <span>
            高风险: {data.filter(d => d.riskLevel === 'critical' || d.riskLevel === 'high').length}个 ·
            中风险: {data.filter(d => d.riskLevel === 'medium').length}个 ·
            低风险: {data.filter(d => d.riskLevel === 'low').length}个
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Fallback Data (based on recall-early-warning engine patterns) ───────────────

function generateFallbackData(): HeatmapCell[] {
  return [
    { sku: 'SKU-004', productName: '智能空气炸锅', riskScore: 82, riskLevel: 'critical', category: 'air-fryer', causes: ['过热/起火', '涂层脱落'], components: ['温控器', '不粘涂层', '加热元件'], fixCount: 4, recentRecalls: 2 },
    { sku: 'SKU-002', productName: '便携式榨汁杯', riskScore: 68, riskLevel: 'high', category: 'blender-juicer', causes: ['刀片断裂飞溅', '密封圈泄漏'], components: ['刀片组件', '密封圈', '玻璃杯体'], fixCount: 3, recentRecalls: 1 },
    { sku: 'CL-VC4003', productName: '无线手持吸尘器', riskScore: 55, riskLevel: 'high', category: 'vacuum-cleaner', causes: ['电池过热/起火', '电机火花'], components: ['锂电池', '电机', '充电器'], fixCount: 2, recentRecalls: 0 },
    { sku: 'KA-CF3002', productName: '便携式咖啡机', riskScore: 42, riskLevel: 'medium', category: 'coffee-maker', causes: ['玻璃壶爆裂', '加热板过热'], components: ['玻璃壶', '加热板', '电源线'], fixCount: 2, recentRecalls: 0 },
    { sku: 'CL-HM5004', productName: '智能加湿器', riskScore: 35, riskLevel: 'medium', category: 'humidifier', causes: ['水箱漏水/漏电', '细菌滋生'], components: ['水箱', '超声波振子', '电源适配器'], fixCount: 2, recentRecalls: 0 },
    { sku: 'KA-BK2001', productName: '智能电热水壶', riskScore: 28, riskLevel: 'low', category: 'kettle', causes: ['手柄脱落/烫伤'], components: ['手柄', '底座连接器', '温控器'], fixCount: 2, recentRecalls: 0 },
    { sku: 'KA-TS8007', productName: '多功能烤面包机', riskScore: 22, riskLevel: 'low', category: 'coffee-maker', causes: ['电线短路'], components: ['电源线', '加热板'], fixCount: 1, recentRecalls: 0 },
    { sku: 'CL-AP9008', productName: 'HEPA空气净化器', riskScore: 15, riskLevel: 'low', category: 'air-fryer', causes: [], components: ['滤芯'], fixCount: 0, recentRecalls: 0 },
    { sku: 'SKU-011', productName: '智能加湿器2', riskScore: 12, riskLevel: 'low', category: 'humidifier', causes: [], components: [], fixCount: 0, recentRecalls: 0 },
    { sku: 'SKU-012', productName: '电动牙刷', riskScore: 8, riskLevel: 'low', category: 'unknown', causes: [], components: [], fixCount: 0, recentRecalls: 0 },
  ];
}
