'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, CheckCircle, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

function getErrorTypeMessage(error: Error): { title: string; description: string; icon: 'error' | 'network' | 'auth' } {
  const msg = error.message?.toLowerCase() || '';
  const name = error.name?.toLowerCase() || '';

  if (name.includes('chunkloaderror') || msg.includes('loading chunk') || msg.includes('dynamically imported module')) {
    return {
      title: '资源加载失败',
      description: '页面资源加载失败，可能是网络不稳定或应用已更新。请尝试刷新页面。',
      icon: 'network',
    };
  }

  if (name === 'typeerror' && (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch'))) {
    return {
      title: '网络请求失败',
      description: '无法连接到服务器，请检查您的网络连接后重试。',
      icon: 'network',
    };
  }

  if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('authentication')) {
    return {
      title: '登录已过期',
      description: '您的登录状态已过期，请重新登录后继续使用。',
      icon: 'auth',
    };
  }

  if (msg.includes('forbidden') || msg.includes('403')) {
    return {
      title: '访问受限',
      description: '您没有权限访问此资源，请确认账号权限或联系管理员。',
      icon: 'auth',
    };
  }

  if (msg.includes('not found') || msg.includes('404')) {
    return {
      title: '资源未找到',
      description: '请求的资源不存在或已被移除。',
      icon: 'error',
    };
  }

  if (msg.includes('timeout') || msg.includes('timed out')) {
    return {
      title: '请求超时',
      description: '服务器响应超时，请稍后重试或检查网络连接。',
      icon: 'network',
    };
  }

  if (msg.includes('server') || msg.includes('500') || msg.includes('internal')) {
    return {
      title: '服务器错误',
      description: '服务器遇到了一个内部错误，技术团队已收到通知。请稍后重试。',
      icon: 'error',
    };
  }

  return {
    title: '页面出现错误',
    description: '应用遇到了一个意外错误，请尝试刷新页面。',
    icon: 'error',
  };
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator !== 'undefined') return navigator.onLine;
    return true;
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') console.error('[GlobalError]', error);
  }, [error]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { title, description, icon } = getErrorTypeMessage(error);

  const handleCopyError = async () => {
    const details = [
      `错误信息: ${error.message}`,
      `错误类型: ${error.name}`,
      `时间: ${new Date().toLocaleString('zh-CN')}`,
      `URL: ${window.location.href}`,
      `UserAgent: ${navigator.userAgent}`,
      error.digest ? `Digest: ${error.digest}` : '',
      '',
      'Stack:',
      error.stack || 'No stack trace',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail - clipboard may not be available
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-red-50/30 dark:to-red-950/10 p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/20 flex items-center justify-center shadow-lg shadow-red-200/50 dark:shadow-red-900/30">
            {icon === 'network' ? (
              <WifiOff className="h-10 w-10 text-red-600 dark:text-red-400" />
            ) : (
              <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
            )}
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>

        {/* Network warning */}
        {!isOnline && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            当前网络不可用，请检查网络连接
          </div>
        )}

        {/* Error details */}
        {error.message && (
          <div className="bg-muted/50 rounded-lg p-3 text-left">
            <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground mt-1">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-center flex-wrap">
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            重试
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/'} className="gap-2">
            <Home className="h-4 w-4" />
            返回首页
          </Button>
          <Button variant="ghost" onClick={handleCopyError} className="gap-2 text-muted-foreground">
            {copied ? (
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? '已复制' : '复制错误信息'}
          </Button>
        </div>
      </div>
    </div>
  );
}
