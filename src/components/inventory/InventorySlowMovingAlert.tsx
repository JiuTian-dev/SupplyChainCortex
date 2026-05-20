'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Inventory } from '@prisma/client';

// ==================== Slow-Moving Products Alert ====================

interface InventorySlowMovingAlertProps {
  slowMoving: Inventory[];
}

export function InventorySlowMovingAlert({ slowMoving }: InventorySlowMovingAlertProps) {
  if (slowMoving.length === 0) return null;

  return (
    <Card className="card-dashboard border-amber-200 bg-amber-50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          滞销产品预警（周转 {'>'} 90 天）
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {slowMoving.map((inv: Inventory) => (
            <div key={inv.id} className="bg-card rounded-lg p-3 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{inv.productName}</span>
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">{inv.turnoverDays}天</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">库存 {inv.quantity} | 安全库存 {inv.safetyStock}</p>
              <p className="text-xs text-amber-600 mt-1">
                {inv.turnoverDays > 180 ? '⚠ 建议清仓促销' : inv.turnoverDays > 120 ? '⚡ 建议减少采购' : '📊 关注趋势'}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
