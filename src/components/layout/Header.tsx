'use client';

import { useState, useEffect } from 'react';
import {
  Bell,
  Settings2,
  Wrench,
} from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';
import { useNotificationStore } from '@/stores/notification-store';
import { HealthDot } from './HealthDot';

export interface HeaderProps {
  /** Callback to open settings sheet */
  onOpenSettings?: () => void;
  /** Callback to open tools panel */
  onOpenTools?: () => void;
  /** User menu component (from auth system) */
  userMenu?: React.ReactNode;
}

export function Header({
  onOpenSettings,
  onOpenTools,
  userMenu,
}: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  const refreshCountdown = useDashboardUIStore((s) => s.refreshCountdown);
  const setGlobalSearchOpen = useDashboardUIStore((s) => s.setGlobalSearchOpen);

  const unreadCount = useNotificationStore((s) => s.unreadCount());

  // Bell shake key: changes when unreadCount increases, re-triggers CSS animation
  const bellShakeKey = unreadCount;

  // Track scroll for header shadow & blur
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const setNotificationOpen = useDashboardUIStore((s) => s.setNotificationOpen);
  const notificationOpen = useDashboardUIStore((s) => s.notificationOpen);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          const exportBtn = document.querySelector('[aria-label="批量导出"]') as HTMLButtonElement | null;
          exportBtn?.click();
        }
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          setNotificationOpen(!notificationOpen);
        }
        if (e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          setGlobalSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setNotificationOpen, notificationOpen, setGlobalSearchOpen]);

  // Progress bar width: 0% at 60s (full countdown), 100% at 0s (about to refresh)
  const progressWidth = ((60 - refreshCountdown) / 60) * 100;

  return (
    <header
      className={`sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b transition-all duration-300 ${isScrolled ? 'header-scrolled' : ''}`}
    >
      {/* Auto-refresh countdown progress bar */}
      <div
        className="header-progress-bar-v2"
        style={{ width: `${progressWidth}%` }}
      />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
              <span className="text-white dark:text-zinc-900 text-xs font-bold tracking-tight">SC</span>
            </div>
            <h1 className="text-sm font-semibold tracking-tight">
              SupplyChain Cortex
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Notification bell */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors relative"
                    aria-label="通知中心"
                    onClick={() => setNotificationOpen(!notificationOpen)}
                  >
                    {unreadCount > 0 ? (
                      <Bell key={`bell-${bellShakeKey}`} className="h-3.5 w-3.5 text-orange-500" />
                    ) : (
                      <Bell className="h-3.5 w-3.5 text-zinc-500" />
                    )}
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>通知中心{unreadCount > 0 ? ` (${unreadCount} 未读)` : ''}</TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* Tools panel */}
            {onOpenTools && (
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      onClick={onOpenTools}
                      aria-label="工具箱"
                    >
                      <Wrench className="h-4 w-4 text-zinc-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>工具箱</TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}

            {/* Settings gear */}
            {onOpenSettings && (
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      onClick={onOpenSettings}
                      aria-label="设置"
                    >
                      <Settings2 className="h-4 w-4 text-zinc-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>设置</TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}

            <HealthDot />
            {userMenu}
          </div>
        </div>
      </div>
    </header>
  );
}
