'use client';

import { useState, useEffect } from 'react';
import { Clock, Package, Globe, Zap, Wifi, Database, RefreshCw, Keyboard } from 'lucide-react';
import packageInfo from '../../../package.json';
import { useUIStore } from '@/stores/ui-store';
import { useConnectionStore } from '@/stores/connection-store';

export function Footer() {
  const lastSyncTime = useUIStore((s) => s.lastSyncTime);
  const refreshCountdown = useUIStore((s) => s.refreshCountdown);
  const connectorData = useConnectionStore((s) => s.connectorData);

  // Real-time sync time display - use mounted state to avoid hydration mismatch
  const [currentTime, setCurrentTime] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleString('zh-CN'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(interval); };
  }, []);

  // Compute connector online count
  const onlineCount = connectorData.filter(
    (c) => c.status === 'online' || c.status === 'degraded'
  ).length;
  const hasDegraded = connectorData.some((c) => c.status === 'degraded');
  const hasOffline = connectorData.some((c) => c.status === 'offline');

  return (
    <footer className="border-t bg-background/80 backdrop-blur-md mt-auto">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs text-muted-foreground">
          {/* Column 1: 项目信息 */}
          <div className="space-y-1">
            <p className="font-semibold text-foreground text-sm">
              SupplyChain Cortex v{packageInfo.version}
            </p>
            <p className="hidden sm:block">Next.js 16 + React 19 + TypeScript</p>
            <p className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              最后同步: {mounted ? lastSyncTime.toLocaleString('zh-CN') : '--'}
            </p>
            <p className="flex items-center gap-1.5 text-muted-foreground/60">
              <span className="text-green-500">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
              </span>
              <span>{mounted ? currentTime : '--'}</span>
            </p>
          </div>
          {/* Column 2: 快速统计 */}
          <div className="space-y-1">
            <p className="font-semibold text-foreground text-sm">快速统计</p>
            <p className="flex items-center gap-1.5 footer-stat">
              <Package className="h-3 w-3 text-orange-500" />
              12 SKU 在管
            </p>
            <p className="flex items-center gap-1.5 footer-stat">
              <Globe className="h-3 w-3 text-cyan-500" />
              7 个 API 路由
            </p>
            <p className="flex items-center gap-1.5 footer-stat">
<Zap className="h-3 w-3 text-violet-500" />
              25+ 个操作端点
            </p>
          </div>
          {/* Column 3: 系统状态 & 快捷键 */}
          <div className="space-y-1">
            <p className="font-semibold text-foreground text-sm">系统状态</p>
            <p className="flex items-center gap-1.5 footer-stat">
              <span className={`status-dot ${hasOffline ? 'status-dot-offline' : hasDegraded ? 'status-dot-warning' : 'status-dot-online'}`} />
              连接器 {onlineCount}/{connectorData.length} 在线
            </p>
            <p className="flex items-center gap-1.5 footer-stat">
              <Database className="h-3 w-3 text-amber-500" />
              数据库: SQLite
            </p>
            <p className="flex items-center gap-1.5 footer-stat">
              <RefreshCw className="h-3 w-3 text-emerald-500" />
              自动刷新: {mounted ? `${refreshCountdown}s` : '--'}
            </p>
            {/* Keyboard shortcut hints with physical key styling */}
            <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-border/50">
              <Keyboard className="h-3 w-3 text-muted-foreground/50" />
              <span className="flex items-center gap-0.5">
                <kbd className="kbd-key">Ctrl</kbd>
                <kbd className="kbd-key">K</kbd>
                <span className="text-muted-foreground/50 ml-0.5 text-[10px]">搜索</span>
              </span>
              <span className="flex items-center gap-0.5">
                <kbd className="kbd-key">Ctrl</kbd>
                <kbd className="kbd-key">R</kbd>
                <span className="text-muted-foreground/50 ml-0.5 text-[10px]">刷新</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
