'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface DbConfig {
  type: string;
  info: Record<string, string>;
  supportedTypes: string[];
}

export function DatabaseConfigPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['db-config'],
    queryFn: async () => {
      const res = await fetch('/api/db-config');
      return res.json() as Promise<DbConfig>;
    },
    staleTime: 60000,
  });

  const typeColors: Record<string, string> = {
    sqlite: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    postgresql: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    mysql: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  };

  const typeIcons: Record<string, string> = {
    sqlite: '🗃️',
    postgresql: '🐘',
    mysql: '🐬',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Database className="h-4 w-4 text-orange-500" />
          数据库配置
        </CardTitle>
        <CardDescription>当前数据库连接状态和配置信息</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse h-20 bg-muted rounded" />
        ) : data ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <span className="text-2xl">{typeIcons[data.type] || '💾'}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{data.type.toUpperCase()}</span>
                  <Badge className={typeColors[data.type] || ''}>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    已连接
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {Object.entries(data.info).map(([key, value]) => (
                    <span key={key} className="mr-3">
                      {key}: <span className="font-mono">{value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>支持的数据库: {data.supportedTypes.join(', ')}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">无法获取数据库配置</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
