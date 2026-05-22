'use client';

import React from 'react';
import {
  Building2, XCircle, CheckCircle2, Pencil, ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CHART_TOOLTIP_STYLE, StarRating } from './SupplierTab.helpers';

// ==================== Supplier Detail Dialog ====================

interface SupplierDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSupplier: Record<string, unknown> | null;
  detailTab: string;
  onDetailTabChange: (tab: string) => void;
  supplierPerformance: Record<string, unknown> | null;
  reorderOrders: Record<string, unknown>[];
  onToggleStatus: (supplier: Record<string, unknown>) => void;
  onEditClick: (supplier: Record<string, unknown>) => void;
}

export function SupplierDetailDialog({
  open,
  onOpenChange,
  selectedSupplier,
  detailTab,
  onDetailTabChange,
  supplierPerformance,
  reorderOrders,
  onToggleStatus,
  onEditClick,
}: SupplierDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-500" />
            供应商详情
          </DialogTitle>
        </DialogHeader>
        {!!selectedSupplier && (
          <Tabs value={detailTab} onValueChange={onDetailTabChange}>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="details" className="text-xs">基本信息</TabsTrigger>
              <TabsTrigger value="orders" className="text-xs">订单历史</TabsTrigger>
              <TabsTrigger value="performance" className="text-xs">绩效</TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">编码</p><p className="font-mono text-sm">{(selectedSupplier as Record<string, unknown>).code as string}</p></div>
                  <div><p className="text-xs text-muted-foreground">名称</p><p className="font-medium text-sm">{(selectedSupplier as Record<string, unknown>).name as string}</p></div>
                  <div><p className="text-xs text-muted-foreground">联系人</p><p className="text-sm">{((selectedSupplier as Record<string, unknown>).contact as string) || '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground">电话</p><p className="text-sm">{((selectedSupplier as Record<string, unknown>).phone as string) || '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground">邮箱</p><p className="text-sm">{((selectedSupplier as Record<string, unknown>).email as string) || '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground">地区</p><p className="text-sm">{(selectedSupplier as Record<string, unknown>).region as string}</p></div>
                  <div><p className="text-xs text-muted-foreground">品类</p><p className="text-sm">{(selectedSupplier as Record<string, unknown>).category as string}</p></div>
                  <div><p className="text-xs text-muted-foreground">交货期</p><p className="text-sm">{(selectedSupplier as Record<string, unknown>).leadTime as number} 天</p></div>
                  <div>
                    <p className="text-xs text-muted-foreground">评分</p>
                    <StarRating rating={(selectedSupplier as Record<string, unknown>).rating as number} size="md" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">状态</p>
                    <Badge className={cn('text-[10px]', (selectedSupplier as Record<string, unknown>).status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-700')}>
                      {(selectedSupplier as Record<string, unknown>).status === 'active' ? '活跃' : (selectedSupplier as Record<string, unknown>).status === 'suspended' ? '暂停' : '停用'}
                    </Badge>
                  </div>
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => onToggleStatus(selectedSupplier)}>
                    {(selectedSupplier as Record<string, unknown>).status === 'active' ? <><XCircle className="h-3 w-3" />暂停合作</> : <><CheckCircle2 className="h-3 w-3" />恢复合作</>}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => onEditClick(selectedSupplier)}>
                    <Pencil className="h-3 w-3" />编辑信息
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Orders Tab */}
            <TabsContent value="orders" className="mt-4">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">最近与该供应商相关的补货订单</p>
                {reorderOrders.filter(() => {
                  return true; // Show all for now; in production would filter by supplier
                }).slice(0, 5).map((o: Record<string, unknown>) => (
                  <div key={String(o.id)} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{String(o.productName)}</p>
                      <p className="text-xs text-muted-foreground">{String(o.sku)} &middot; {String(o.warehouse)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">x{String(o.quantity)}</p>
                      <Badge className={cn('text-[10px]',
                        o.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' :
                        o.status === 'delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                      )}>
                        {o.status === 'pending' ? '待审批' : o.status === 'approved' ? '已审批' : o.status === 'shipped' ? '运输中' : o.status === 'delivered' ? '已送达' : '已取消'}
                      </Badge>
                    </div>
                  </div>
                ))}
                {reorderOrders.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="text-xs">暂无相关订单</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="mt-4">
              <div className="space-y-3">
                {supplierPerformance && Array.isArray((supplierPerformance as Record<string, unknown>).suppliers) ? (
                  (() => {
                    const matchedPerf = ((supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[]).find(
                      (sp) => sp.code === (selectedSupplier as Record<string, unknown>).code
                    );
                    if (matchedPerf) {
                      const metrics = matchedPerf.metrics as Record<string, number>;
                      const perfRadarData = [
                        { dimension: '综合评分', value: metrics?.overallScore || 0, fullMark: 100 },
                        { dimension: '准时交货', value: metrics?.onTimeDeliveryRate || 0, fullMark: 100 },
                        { dimension: '质量评分', value: metrics?.qualityScore || 0, fullMark: 100 },
                        { dimension: '响应速度', value: metrics?.responseTime || 0, fullMark: 100 },
                        { dimension: '灵活性', value: metrics?.flexibility || 0, fullMark: 100 },
                      ];
                      return (
                        <>
                          <ResponsiveContainer width="100%" height={250}>
                            <RadarChart data={perfRadarData} cx="50%" cy="50%" outerRadius="70%">
                              <PolarGrid stroke="#e5e7eb" className="dark:opacity-20" />
                              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8 }} />
                              <Radar name={String(matchedPerf.name)} dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.25} strokeWidth={2} animationDuration={800} />
                            </RadarChart>
                          </ResponsiveContainer>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {perfRadarData.map((d) => (
                              <div key={d.dimension} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                                <span className="text-xs text-muted-foreground">{d.dimension}</span>
                                <span className="text-sm font-bold">{d.value}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    }
                    return <p className="text-xs text-muted-foreground text-center py-4">暂无该供应商的绩效数据</p>;
                  })()
                ) : (
                  <div className="text-center py-4">
                    <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
                      try {
                        const res = await fetch(`/api/suppliers?action=detail&code=${(selectedSupplier as Record<string, unknown>).code}`);
                        const data = await res.json();
                        if ((data as Record<string, unknown>).supplier) {
                          toast.info('供应商详情已更新', { description: `订单历史: ${((data as Record<string, unknown>).orderHistory as unknown[])?.length || 0} 条` });
                        }
                      } catch {
                        toast.error('获取详情失败');
                      }
                    }}>
                      <ExternalLink className="h-3 w-3" />刷新详情
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
