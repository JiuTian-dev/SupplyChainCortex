'use client';

import { ShoppingCart, CheckCircle2, Ship, PackageCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ==================== Reorder Orders Management ====================

interface SupplierReorderOrdersProps {
  reorderOrders: Record<string, unknown>[];
  onReorderStatusUpdate: (orderId: string, newStatus: string, sku: string, quantity: number) => void;
}

export function SupplierReorderOrders({ reorderOrders, onReorderStatusUpdate }: SupplierReorderOrdersProps) {
  return (
    <Card className="card-dashboard">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-amber-500" />
          补货订单管理
          <Badge variant="outline" className="ml-auto text-xs font-normal">{reorderOrders.length} 笔</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {reorderOrders.length > 0 ? (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wider">SKU</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">产品</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">数量</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">仓库</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">优先级</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">状态</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">创建时间</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reorderOrders.map((o: Record<string, unknown>) => (
                  <TableRow key={String(o.id)} className="hover:bg-muted/30 border-l-[3px] hover:border-l-amber-400 transition-all">
                    <TableCell className="font-mono text-xs">{String(o.sku)}</TableCell>
                    <TableCell className="text-sm">{String(o.productName)}</TableCell>
                    <TableCell className="text-sm font-medium">{String(o.quantity)}</TableCell>
                    <TableCell className="text-xs">{String(o.warehouse)}</TableCell>
                    <TableCell>
                      <Badge className={cn('text-[10px]', o.priority === '紧急' ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300')}>
                        {String(o.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('text-[10px]',
                        o.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' :
                        o.status === 'approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' :
                        o.status === 'shipped' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300' :
                        o.status === 'delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-950/30 dark:text-gray-300'
                      )}>
                        {o.status === 'pending' ? '待审批' : o.status === 'approved' ? '已审批' : o.status === 'shipped' ? '运输中' : o.status === 'delivered' ? '已送达' : '已取消'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(String(o.createdAt)).toLocaleDateString('zh-CN')}</TableCell>
                    <TableCell>
                      {o.status === 'pending' && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => onReorderStatusUpdate(String(o.id), 'approved', String(o.sku), Number(o.quantity))}>
                          <CheckCircle2 className="h-3 w-3" />审批
                        </Button>
                      )}
                      {o.status === 'approved' && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => onReorderStatusUpdate(String(o.id), 'shipped', String(o.sku), Number(o.quantity))}>
                          <Ship className="h-3 w-3" />发货
                        </Button>
                      )}
                      {o.status === 'shipped' && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => onReorderStatusUpdate(String(o.id), 'delivered', String(o.sku), Number(o.quantity))}>
                          <PackageCheck className="h-3 w-3" />签收
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <PackageCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">暂无补货订单</p>
            <p className="text-xs mt-1">在库存优化模块中点击&ldquo;确认下单&rdquo;创建补货订单</p>
          </div>
        )}
        {/* 补货订单统计 */}
        {reorderOrders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{reorderOrders.length}</p>
              <p className="text-[10px] text-muted-foreground">总订单</p>
            </div>
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 p-3 text-center">
              <p className="text-lg font-bold text-yellow-600">{reorderOrders.filter((o) => o.status === 'pending').length}</p>
              <p className="text-[10px] text-muted-foreground">待审批</p>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 text-center">
              <p className="text-lg font-bold text-blue-600">{reorderOrders.filter((o) => o.status === 'approved' || o.status === 'shipped').length}</p>
              <p className="text-[10px] text-muted-foreground">进行中</p>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3 text-center">
              <p className="text-lg font-bold text-emerald-600">{reorderOrders.filter((o) => o.status === 'delivered').length}</p>
              <p className="text-[10px] text-muted-foreground">已完成</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
