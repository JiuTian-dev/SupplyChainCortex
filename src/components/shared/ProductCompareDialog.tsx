'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';
import { CHART_COLORS, STATUS_LABELS } from '@/lib/constants';
import type { SalesSummary } from '@/lib/types';
import type { Inventory, CostRecord } from '@prisma/client';
import { fetchProducts } from '@/lib/api-client';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { GitCompare, Loader2 } from 'lucide-react';

interface CompareProduct {
  sku: string;
  name: string;
  category: string;
}

export interface ProductCompareDialogProps {
  inventoryData?: { inventory?: Inventory[] } | null;
  costData?: { costs?: CostRecord[] } | null;
  salesData?: { productSummaries?: SalesSummary[] } | null;
}

export function ProductCompareDialog({
  inventoryData,
  costData,
  salesData,
}: ProductCompareDialogProps) {
  const compareOpen = useDashboardUIStore((s) => s.compareOpen);
  const setCompareOpen = useDashboardUIStore((s) => s.setCompareOpen);
  const compareProducts = useDashboardUIStore((s) => s.compareProducts);
  const setCompareProducts = useDashboardUIStore((s) => s.setCompareProducts);

  // Fetch products from live API instead of mock data
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'compare-list'],
    queryFn: async () => {
      const result = await fetchProducts({ pageSize: 100 });
      return result as { products: CompareProduct[] };
    },
  });
  const PRODUCTS: CompareProduct[] = productsData?.products ?? [];

  const getInv = (sku: string) =>
    inventoryData?.inventory?.find((i) => i.sku === sku);
  const getCost = (sku: string) =>
    costData?.costs?.find((c) => c.sku === sku);
  const getSales = (sku: string) =>
    salesData?.productSummaries?.find((s) => s.sku === sku);

  return (
    <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto backdrop-blur-sm border shadow-2xl dialog-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-orange-500" />
            产品对比分析
          </DialogTitle>
          <DialogDescription>
            选择 2-4 个产品进行多维度对比分析
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Product Selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium">选择对比产品</p>
            {productsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载产品列表...
              </div>
            ) : PRODUCTS.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">暂无可对比的产品</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {PRODUCTS.map((p, idx) => {
                  const isSelected = compareProducts.includes(p.sku);
                  return (
                    <button
                      key={p.sku}
                      onClick={() => {
                        if (isSelected) {
                          setCompareProducts(
                            compareProducts.filter((s) => s !== p.sku)
                          );
                        } else if (compareProducts.length < 4) {
                          setCompareProducts([...compareProducts, p.sku]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
                        isSelected
                          ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-600'
                          : compareProducts.length >= 4
                            ? 'border-muted bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50'
                            : 'border-border bg-background hover:border-orange-300 hover:bg-orange-50/50 dark:hover:bg-orange-950/20'
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{
                          backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                        }}
                      />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
            {compareProducts.length < 2 && !productsLoading && (
              <p className="text-xs text-muted-foreground">
                请至少选择 2 个产品进行对比
              </p>
            )}
          </div>

          {compareProducts.length >= 2 &&
            (() => {
              const selectedProducts = compareProducts
                .map((sku) => PRODUCTS.find((p) => p.sku === sku)!)
                .filter(Boolean);

              // Build radar data
              const radarData = [
                {
                  subject: '库存充足度',
                  ...Object.fromEntries(
                    selectedProducts.map((p, i) => {
                      const inv = getInv(p.sku);
                      return [
                        `p${i}`,
                        inv
                          ? Math.min(
                              100,
                              Math.round((inv.quantity / inv.safetyStock) * 50)
                            )
                          : 0,
                      ];
                    })
                  ),
                },
                {
                  subject: '周转效率',
                  ...Object.fromEntries(
                    selectedProducts.map((p, i) => {
                      const inv = getInv(p.sku);
                      return [`p${i}`, inv ? Math.max(0, 100 - inv.turnoverDays) : 0];
                    })
                  ),
                },
                {
                  subject: '利润率',
                  ...Object.fromEntries(
                    selectedProducts.map((p, i) => {
                      const cost = getCost(p.sku);
                      return [`p${i}`, cost ? Math.round(cost.grossMargin) : 0];
                    })
                  ),
                },
                {
                  subject: '销售增长',
                  ...Object.fromEntries(
                    selectedProducts.map((p, i) => {
                      const sales = getSales(p.sku);
                      return [
                        `p${i}`,
                        sales
                          ? Math.max(0, Math.min(100, 50 + sales.momGrowth * 2))
                          : 0,
                      ];
                    })
                  ),
                },
                {
                  subject: '销量表现',
                  ...Object.fromEntries(
                    selectedProducts.map((p, i) => {
                      const sales = getSales(p.sku);
                      return [
                        `p${i}`,
                        sales
                          ? Math.min(100, Math.round(sales.avgDailySales * 1.5))
                          : 0,
                      ];
                    })
                  ),
                },
              ];

              // Find best values for highlighting
              const getVal = (sku: string, metric: string) => {
                const inv = getInv(sku);
                const cost = getCost(sku);
                const sales = getSales(sku);
                if (metric === 'quantity') return inv?.quantity ?? 0;
                if (metric === 'turnoverDays') return inv?.turnoverDays ?? 999;
                if (metric === 'grossMargin') return cost?.grossMargin ?? 0;
                if (metric === 'totalRevenue') return sales?.totalRevenue ?? 0;
                if (metric === 'avgDailySales') return sales?.avgDailySales ?? 0;
                return 0;
              };

              return (
                <div className="space-y-4">
                  {/* Radar Chart Comparison */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">
                        多维度雷达对比
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <RadarChart data={radarData}>
                          <PolarGrid
                            stroke="#e5e7eb"
                            className="dark:opacity-20"
                          />
                          <PolarAngleAxis
                            dataKey="subject"
                            tick={{ fontSize: 11 }}
                          />
                          <PolarRadiusAxis
                            angle={90}
                            domain={[0, 100]}
                            tick={{ fontSize: 9 }}
                          />
                          {selectedProducts.map((p, i) => (
                            <Radar
                              key={p.sku}
                              name={p.name}
                              dataKey={`p${i}`}
                              stroke={CHART_COLORS[i]}
                              fill={CHART_COLORS[i]}
                              fillOpacity={0.1}
                              strokeWidth={2}
                            />
                          ))}
                          <Legend />
                          <Tooltip
                            contentStyle={{
                              borderRadius: '10px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              border: '1px solid #e5e7eb',
                              fontSize: '12px',
                              backgroundColor: 'var(--tooltip-bg, #fff)',
                            }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Comparison Table */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">
                        指标对比明细
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-32 text-[10px] uppercase tracking-wider text-muted-foreground">
                              指标
                            </TableHead>
                            {selectedProducts.map((p, i) => (
                              <TableHead
                                key={p.sku}
                                className="text-center text-[10px] uppercase tracking-wider text-muted-foreground"
                              >
                                <div className="flex items-center justify-center gap-1.5">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                      backgroundColor: CHART_COLORS[i],
                                    }}
                                  />
                                  <span className="text-xs">{p.name}</span>
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            { label: 'SKU', getV: (sku: string) => sku },
                            {
                              label: '分类',
                              getV: (sku: string) =>
                                PRODUCTS.find((p) => p.sku === sku)?.category ||
                                '-',
                            },
                            {
                              label: '仓库',
                              getV: (sku: string) =>
                                getInv(sku)?.warehouse || '-',
                            },
                            {
                              label: '当前库存',
                              getV: (sku: string) =>
                                getInv(sku)?.quantity?.toLocaleString() || '-',
                              metric: 'quantity',
                            },
                            {
                              label: '安全库存',
                              getV: (sku: string) =>
                                getInv(sku)?.safetyStock?.toLocaleString() ||
                                '-',
                            },
                            {
                              label: '周转天数',
                              getV: (sku: string) =>
                                getInv(sku)?.turnoverDays
                                  ? `${getInv(sku)?.turnoverDays}天`
                                  : '-',
                              metric: 'turnoverDays',
                              lower: true,
                            },
                            {
                              label: '库存状态',
                              getV: (sku: string) => {
                                const inv = getInv(sku);
                                return inv
                                  ? STATUS_LABELS[inv.stockStatus]
                                  : '-';
                              },
                            },
                            {
                              label: '到岸成本',
                              getV: (sku: string) =>
                                getCost(sku)?.totalLanded
                                  ? `$${getCost(sku)?.totalLanded.toFixed(2)}`
                                  : '-',
                            },
                            {
                              label: '毛利率',
                              getV: (sku: string) =>
                                getCost(sku)?.grossMargin
                                  ? `${getCost(sku)?.grossMargin}%`
                                  : '-',
                              metric: 'grossMargin',
                            },
                            {
                              label: '日均销量',
                              getV: (sku: string) =>
                                getSales(sku)?.avgDailySales?.toFixed(1) || '-',
                              metric: 'avgDailySales',
                            },
                            {
                              label: '总销售额',
                              getV: (sku: string) =>
                                getSales(sku)?.totalRevenue
                                  ? `$${getSales(sku)?.totalRevenue.toLocaleString()}`
                                  : '-',
                              metric: 'totalRevenue',
                            },
                            {
                              label: '环比增长',
                              getV: (sku: string) =>
                                getSales(sku)?.momGrowth !== undefined
                                  ? `${getSales(sku)!.momGrowth > 0 ? '+' : ''}${getSales(sku)!.momGrowth}%`
                                  : '-',
                            },
                            {
                              label: '最佳平台',
                              getV: (sku: string) =>
                                getSales(sku)?.topPlatform || '-',
                            },
                          ].map((row) => {
                            const values = compareProducts.map((sku) =>
                              row.getV(sku)
                            );
                            const numValues = compareProducts.map((sku) => {
                              const v = getVal(sku, row.metric || '');
                              return v === 0 && !row.metric ? null : v;
                            });
                            const bestIdx =
                              row.metric && row.lower
                                ? numValues.reduce<number>(
                                    (best, val, i) =>
                                      val !== null &&
                                      (best === -1 ||
                                      val < (numValues[best] ?? Infinity))
                                        ? i
                                        : best,
                                    -1
                                  )
                                : row.metric
                                  ? numValues.reduce<number>(
                                      (best, val, i) =>
                                        val !== null &&
                                        (best === -1 ||
                                          val > (numValues[best] ?? -Infinity))
                                          ? i
                                          : best,
                                      -1
                                    )
                                  : -1;
                            return (
                              <TableRow key={row.label}>
                                <TableCell className="font-medium text-xs text-muted-foreground">
                                  {row.label}
                                </TableCell>
                                {values.map((val, i) => (
                                  <TableCell
                                    key={i}
                                    className={`text-center text-sm ${
                                      i === bestIdx
                                        ? 'font-bold text-green-600 dark:text-green-400'
                                        : ''
                                    }`}
                                  >
                                    {String(val)}
                                    {i === bestIdx && row.metric && (
                                      <span className="ml-1 text-[10px]">
                                        🏆
                                      </span>
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
