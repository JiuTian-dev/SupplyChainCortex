'use client';

import { useState, useMemo } from 'react';
import { Shield, AlertTriangle, X, Package, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useRiskMatrix } from '@/hooks/use-supply-chain-data';

// ==================== Types ====================

interface MatrixProduct {
  sku: string;
  productName: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  category: string;
  inventoryStatus: string;
  margin: number;
  sellingPrice: number;
  quantity: number;
  safetyStock: number;
  warehouse: string;
  hasDelayedShipment: boolean;
  category2: string;
}

interface RiskMatrixData {
  matrix: MatrixProduct[];
  grid: Record<string, number>;
  overallRiskScore: number;
  totalProducts: number;
  riskDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

// ==================== Color Helpers ====================

function getCellColor(likelihood: number, impact: number): string {
  const score = likelihood * impact;
  if (score >= 20) return 'bg-red-500/80 dark:bg-red-600/80';
  if (score >= 12) return 'bg-orange-500/70 dark:bg-orange-600/70';
  if (score >= 6) return 'bg-yellow-400/60 dark:bg-yellow-500/50';
  if (score >= 3) return 'bg-lime-400/40 dark:bg-lime-500/30';
  return 'bg-green-400/30 dark:bg-green-500/25';
}

function getCellBorderColor(likelihood: number, impact: number): string {
  const score = likelihood * impact;
  if (score >= 20) return 'border-red-400/50 dark:border-red-500/50';
  if (score >= 12) return 'border-orange-400/50 dark:border-orange-500/50';
  if (score >= 6) return 'border-yellow-400/40 dark:border-yellow-500/40';
  if (score >= 3) return 'border-lime-400/30 dark:border-lime-500/30';
  return 'border-green-400/25 dark:border-green-500/25';
}

function getRiskLabel(score: number): string {
  if (score >= 20) return '严重';
  if (score >= 12) return '高';
  if (score >= 6) return '中';
  if (score >= 3) return '低';
  return '极低';
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    critical: { label: '紧急', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    warning: { label: '预警', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    overstock: { label: '积压', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    healthy: { label: '正常', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  };
  const m = map[status] || map.healthy;
  return <Badge className={`text-[9px] px-1 py-0 ${m.cls}`}>{m.label}</Badge>;
}

// ==================== Component ====================

export function RiskMatrixHeatmap() {
  const { data, isLoading } = useRiskMatrix();
  const [expandedCell, setExpandedCell] = useState<{ likelihood: number; impact: number } | null>(null);

  const matrixData = data as RiskMatrixData | undefined;
  const matrixItems = useMemo(() => matrixData?.matrix ?? [], [matrixData?.matrix]);

  // Group products by cell
  const productsByCell = useMemo(() => {
    if (matrixItems.length === 0) return {};
    const map: Record<string, MatrixProduct[]> = {};
    matrixItems.forEach((p) => {
      const key = `${p.likelihood}-${p.impact}`;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [matrixItems]);

  // Expanded cell products
  const expandedProducts = useMemo(() => {
    if (!expandedCell || matrixItems.length === 0) return [];
    return matrixItems.filter(
      (p) => p.likelihood === expandedCell.likelihood && p.impact === expandedCell.impact
    );
  }, [expandedCell, matrixItems]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!matrixData) return null;

  const LIKELIHOOD_LABELS = ['', '极低', '低', '中', '高', '极高'];
  const IMPACT_LABELS = ['', '极低', '低', '中', '高', '极高'];

  return (
    <TooltipProvider delayDuration={200}>
      {/* Overall Risk Score */}
      <div className="flex items-center justify-center gap-4 mb-4 bg-red-50 dark:bg-red-950/20 rounded-xl px-6 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-500" />
          <span className="text-sm font-semibold text-muted-foreground">矩阵风险指数</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span key={matrixData.overallRiskScore} className="text-2xl font-bold text-red-600 dark:text-red-400">
            {matrixData.overallRiskScore}
          </span>
          <span className="text-xs text-muted-foreground">/ 25</span>
        </div>
        <Badge
          className={`text-xs ${
            matrixData.overallRiskScore >= 15
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : matrixData.overallRiskScore >= 8
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          }`}
        >
          {matrixData.overallRiskScore >= 15 ? '高风险' : matrixData.overallRiskScore >= 8 ? '中风险' : '低风险'}
        </Badge>
      </div>

      {/* Risk Distribution Animated Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-center gap-3 mb-2 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            严重 {matrixData.riskDistribution.critical}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            高 {matrixData.riskDistribution.high}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            中 {matrixData.riskDistribution.medium}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            低 {matrixData.riskDistribution.low}
          </span>
        </div>
        {/* Animated distribution bar */}
        <div className="h-2 rounded-full bg-muted/40 overflow-hidden flex">
          <div
            className="h-full bg-red-500"
            style={{ width: `${(matrixData.riskDistribution.critical / matrixData.totalProducts) * 100}%` }}
          />
          <div
            className="h-full bg-orange-500"
            style={{ width: `${(matrixData.riskDistribution.high / matrixData.totalProducts) * 100}%`, transitionDelay: '0.1s' }}
          />
          <div
            className="h-full bg-yellow-400"
            style={{ width: `${(matrixData.riskDistribution.medium / matrixData.totalProducts) * 100}%`, transitionDelay: '0.2s' }}
          />
          <div
            className="h-full bg-green-400"
            style={{ width: `${(matrixData.riskDistribution.low / matrixData.totalProducts) * 100}%`, transitionDelay: '0.3s' }}
          />
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto custom-scrollbar -mx-2 px-2">
        <div className="min-w-[300px] max-w-[480px] mx-auto">
          {/* Y-axis label */}
          <div className="flex items-end mb-1">
            <div className="w-14 shrink-0" />
            <div className="flex-1 text-center">
              <span className="text-xs font-semibold text-muted-foreground tracking-wider">
                影响程度 →
              </span>
            </div>
          </div>

          {/* Grid rows (likelihood 5 → 1, top to bottom) */}
          {[5, 4, 3, 2, 1].map((likelihood, rowIdx) => (
            <div key={likelihood} className="flex items-stretch mb-0.5">
              {/* Y-axis label */}
              <div className="w-14 shrink-0 flex items-center justify-end pr-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-muted-foreground font-medium cursor-default">
                      {LIKELIHOOD_LABELS[likelihood]}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    可能性等级 {likelihood}/5
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Cells */}
              <div className="flex-1 grid grid-cols-5 gap-0.5">
                {[1, 2, 3, 4, 5].map((impact) => {
                  const key = `${likelihood}-${impact}`;
                  const products = productsByCell[key] || [];
                  const count = products.length;
                  const cellScore = likelihood * impact;

                  return (
                    <Tooltip key={key} disableHoverableContent>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            if (count > 0) {
                              setExpandedCell({ likelihood, impact });
                            }
                          }}
                          className={`
                            relative flex flex-col items-center justify-center
                            min-h-[52px] rounded-md border transition-all duration-300
                            ${getCellColor(likelihood, impact)}
                            ${getCellBorderColor(likelihood, impact)}
                            ${count > 0 ? 'cursor-pointer hover:ring-2 hover:ring-offset-1' : 'cursor-default'}
                            ${cellScore >= 20 ? 'ring-2 ring-red-400/50' : ''}
                            animate-[fadeScaleIn_0.4s_ease-out_both]
                          `}
                          style={{ animationDelay: `${(rowIdx * 5 + impact - 1) * 40}ms` }}
                        >
                          {/* Count */}
                          {count > 0 && (
                            <span className="text-sm font-bold text-white drop-shadow-sm">
                              {count}
                            </span>
                          )}

                          {/* Product dots */}
                          {count > 0 && count <= 5 && (
                            <div className="flex gap-0.5 mt-0.5">
                              {products.map((p) => (
                                <span
                                  key={p.sku}
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    p.category === 'critical'
                                      ? 'bg-white'
                                      : p.category === 'high'
                                        ? 'bg-white/80'
                                        : 'bg-white/60'
                                  }`}
                                />
                              ))}
                            </div>
                          )}

                          {/* Score label for empty cells */}
                          {count === 0 && (
                            <span className="text-[9px] text-muted-foreground/40">{cellScore}</span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-[260px] text-xs"
                      >
                        <div className="font-semibold mb-1">
                          可能性 {likelihood} × 影响 {impact} = {cellScore} ({getRiskLabel(cellScore)})
                        </div>
                        {count > 0 ? (
                          <div>
                            <div className="text-muted-foreground mb-1">{count} 个产品：</div>
                            {products.slice(0, 3).map((p) => (
                              <div key={p.sku} className="flex items-center gap-1.5 py-0.5">
                                <span className="font-medium">{p.productName}</span>
                                <span className="text-muted-foreground">{p.sku}</span>
                              </div>
                            ))}
                            {count > 3 && (
                              <div className="text-muted-foreground mt-0.5">...还有 {count - 3} 个产品</div>
                            )}
                            <div className="text-muted-foreground mt-1">点击查看详情</div>
                          </div>
                        ) : (
                          <div className="text-muted-foreground">暂无产品</div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}

          {/* X-axis labels */}
          <div className="flex items-start mt-1">
            <div className="w-14 shrink-0" />
            <div className="flex-1 grid grid-cols-5 gap-0.5">
              {[1, 2, 3, 4, 5].map((impact) => (
                <div key={impact} className="text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] text-muted-foreground font-medium cursor-default">
                        {IMPACT_LABELS[impact]}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      影响等级 {impact}/5
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </div>

          {/* Y-axis rotated label */}
          <div className="mt-2 text-center">
            <span className="text-xs font-semibold text-muted-foreground tracking-wider">
              ← 可能性
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
        <span className="text-[10px] text-muted-foreground mr-1">风险等级：</span>
        {[
          { label: '极低 (1-2)', cls: 'bg-green-400/40 dark:bg-green-500/30', border: 'border-green-400/25' },
          { label: '低 (3-5)', cls: 'bg-lime-400/40 dark:bg-lime-500/30', border: 'border-lime-400/30' },
          { label: '中 (6-11)', cls: 'bg-yellow-400/60 dark:bg-yellow-500/50', border: 'border-yellow-400/40' },
          { label: '高 (12-19)', cls: 'bg-orange-500/70 dark:bg-orange-600/70', border: 'border-orange-400/50' },
          { label: '严重 (20-25)', cls: 'bg-red-500/80 dark:bg-red-600/80', border: 'border-red-400/50' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-sm border ${item.cls} ${item.border}`} />
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Cell Expand Dialog */}
      <Dialog
        open={expandedCell !== null}
        onOpenChange={(open) => {
          if (!open) setExpandedCell(null);
        }}
      >
        <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              {expandedCell && (
                <>
                  可能性 {expandedCell.likelihood} × 影响 {expandedCell.impact}
                  <Badge
                    className={`text-xs ml-1 ${
                      expandedCell.likelihood * expandedCell.impact >= 20
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : expandedCell.likelihood * expandedCell.impact >= 12
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          : expandedCell.likelihood * expandedCell.impact >= 6
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}
                  >
                    {getRiskLabel(expandedCell.likelihood * expandedCell.impact)}
                  </Badge>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {expandedProducts.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {expandedProducts.map((product) => (
                <div
                  key={product.sku}
                  className="p-3 rounded-lg border hover:shadow-md transition-all duration-200 bg-muted/30"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold">{product.productName}</span>
                    </div>
                    {getStatusBadge(product.inventoryStatus)}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">SKU</span>
                      <span className="font-mono">{product.sku}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">品类</span>
                      <span>{product.category2}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">毛利率</span>
                      <span className={product.margin < 45 ? 'text-red-600 font-semibold' : ''}>
                        {product.margin.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">售价</span>
                      <span>¥{product.sellingPrice}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">库存</span>
                      <span
                        className={
                          product.quantity < product.safetyStock
                            ? 'text-red-600 font-semibold'
                            : ''
                        }
                      >
                        {product.quantity} / {product.safetyStock}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">仓库</span>
                      <span>{product.warehouse}</span>
                    </div>
                  </div>
                  {product.hasDelayedShipment && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-orange-600 dark:text-orange-400">
                      <TrendingDown className="h-3 w-3" />
                      <span>存在延误货运</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CSS for staggered entrance animation */}
      <style jsx>{`
        @keyframes fadeScaleIn {
          from {
            opacity: 0;
            transform: scale(0.85);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </TooltipProvider>
  );
}
