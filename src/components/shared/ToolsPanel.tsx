'use client';

import {
  Search, RefreshCw, Download, Upload, Timer,
} from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

interface ToolsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Status
  wsConnected: boolean;
  isRefreshing: boolean;
  refreshCountdown: number;
  riskScore: number | null;
  // Actions
  onSearch: () => void;
  onRefresh: () => void;
  onExport: () => void;
  onImport: () => void;
  onReconnect: () => void;
  onOpenNotes: () => void;
  notesCount: number;
}

export function ToolsPanel({
  open, onOpenChange,
  wsConnected, isRefreshing, refreshCountdown, riskScore,
  onSearch, onRefresh, onExport, onImport, onReconnect,
  onOpenNotes, notesCount,
}: ToolsPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72 p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="text-sm">工具箱</SheetTitle>
        </SheetHeader>

        <div className="px-5 py-4 space-y-5">
          {/* 快捷操作 */}
          <section className="space-y-1">
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">快捷操作</span>
            <button onClick={onSearch} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5 transition-colors">
              <Search className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-sm">全局搜索</span>
              <span className="ml-auto text-[10px] text-zinc-400">Ctrl+K</span>
            </button>
            <button onClick={onRefresh} disabled={isRefreshing} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5 transition-colors disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 text-zinc-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm">刷新数据</span>
            </button>
            <button onClick={onExport} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5 transition-colors">
              <Download className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-sm">导出数据</span>
            </button>
            {onImport && (
              <button onClick={onImport} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5 transition-colors">
                <Upload className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-sm">导入数据</span>
              </button>
            )}
          </section>

          {/* 系统状态 */}
          <section className="space-y-1">
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">系统状态</span>
            <div className="px-3 py-2 rounded-lg flex items-center justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">MCP 引擎</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isRefreshing ? 'bg-yellow-500' : 'bg-green-500'}`} />
            </div>
            <div
              className="px-3 py-2 rounded-lg flex items-center justify-between text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
              onClick={() => { if (!wsConnected) onReconnect(); }}
            >
              <span className="text-zinc-600 dark:text-zinc-400">SSE 连接</span>
              {wsConnected ? (
                <span className="text-green-500 text-xs">实时</span>
              ) : (
                <button onClick={onReconnect} className="text-red-500 text-xs hover:underline">离线 · 重连</button>
              )}
            </div>
            <div className="px-3 py-2 rounded-lg flex items-center justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">数据刷新</span>
              <span className="text-xs text-zinc-400 tabular-nums">
                {wsConnected ? '实时' : `${refreshCountdown}s`}
              </span>
            </div>
            {riskScore !== null && (
              <div className="px-3 py-2 rounded-lg flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">风险评分</span>
                <span className={`text-xs font-medium ${
                  riskScore < 30 ? 'text-green-500' : riskScore < 60 ? 'text-yellow-500' : 'text-red-500'
                }`}>{riskScore}/100</span>
              </div>
            )}
          </section>

          {/* 管理 */}
          <section className="space-y-1">
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">管理</span>
            <button onClick={onOpenNotes} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5 transition-colors">
              <Timer className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-sm">备注中心</span>
              {notesCount > 0 && (
                <span className="ml-auto text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">{notesCount}</span>
              )}
            </button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
