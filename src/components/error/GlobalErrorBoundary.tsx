'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, Copy, WifiOff, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useErrorReport } from './ErrorReportContext';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  level?: 'page' | 'section' | 'component';
  sectionName?: string;
  autoRetry?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorCount: number;
  isRetrying: boolean;
  copied: boolean;
  isOnline: boolean;
}

class GlobalErrorBoundaryInner extends React.Component<
  ErrorBoundaryProps & { reportError: (error: Error, info?: { level?: string; sectionName?: string; errorInfo?: React.ErrorInfo }) => void },
  ErrorBoundaryState
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor(props: ErrorBoundaryProps & { reportError: (error: Error, info?: { level?: string; sectionName?: string; errorInfo?: React.ErrorInfo }) => void }) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      isRetrying: false,
      copied: false,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };
  }

  componentDidMount() {
    this.onlineHandler = () => this.setState({ isOnline: true });
    this.offlineHandler = () => this.setState({ isOnline: false });
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
    if (this.offlineHandler) window.removeEventListener('offline', this.offlineHandler);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const newCount = this.state.errorCount + 1;
    this.setState({ errorInfo, errorCount: newCount });

    // Report to ErrorReportContext
    this.props.reportError(error, {
      level: this.props.level,
      sectionName: this.props.sectionName,
      errorInfo,
    });

    this.props.onError?.(error, errorInfo);
    if (process.env.NODE_ENV === 'development') console.error('[ErrorBoundary]', error, errorInfo);

    // Auto-retry with exponential backoff
    if (this.props.autoRetry && newCount <= 3) {
      this.setState({ isRetrying: true });
      const delay = Math.min(1000 * Math.pow(2, newCount - 1) + Math.random() * 500, 10000);
      this.retryTimer = setTimeout(() => {
        this.setState({ hasError: false, error: null, errorInfo: null, isRetrying: false });
      }, delay);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, isRetrying: false });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleCopyError = async () => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    const details = [
      `错误信息: ${error.message}`,
      `错误类型: ${error.name}`,
      `级别: ${this.props.level || 'section'}`,
      this.props.sectionName ? `区块: ${this.props.sectionName}` : '',
      `时间: ${new Date().toLocaleString('zh-CN')}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : 'unknown'}`,
      `UserAgent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
      '',
      'Stack:',
      error.stack || 'No stack trace',
      '',
      'Component Stack:',
      errorInfo?.componentStack || 'No component stack',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Silently fail - clipboard may not be available
    }
  };

  render() {
    if (this.state.isRetrying) {
      return (
        <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">正在自动重试...</span>
        </div>
      );
    }

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const level = this.props.level || 'section';
      const isPageLevel = level === 'page';
      const isComponentLevel = level === 'component';
      const consecutiveErrors = this.state.errorCount >= 3;

      return (
        <Card
          className={`${isPageLevel ? 'min-h-[400px]' : isComponentLevel ? '' : 'min-h-[200px]'} border-red-200 dark:border-red-800`}
        >
          <CardHeader className={`${isComponentLevel ? 'p-3' : ''}`}>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className={isComponentLevel ? 'h-4 w-4' : 'h-5 w-5'} />
              {consecutiveErrors
                ? '持续出错'
                : isPageLevel
                ? '页面加载出错'
                : isComponentLevel
                ? '组件异常'
                : '区块加载出错'}
            </CardTitle>
          </CardHeader>
          <CardContent className={`${isComponentLevel ? 'p-3 pt-0' : ''}`}>
            {/* Consecutive error warning */}
            {consecutiveErrors && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                  此区域已连续出错 {this.state.errorCount} 次，建议刷新页面或检查网络连接。
                </p>
              </div>
            )}

            {/* Network status warning */}
            {!this.state.isOnline && (
              <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
                <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  当前网络不可用，请检查网络连接后重试。
                </p>
              </div>
            )}

            {/* Standard message */}
            {!consecutiveErrors && (
              <p className="text-sm text-muted-foreground mb-3">
                {isPageLevel
                  ? '当前页面遇到了一个错误，请尝试刷新页面或返回首页。'
                  : isComponentLevel
                  ? '此组件暂时无法显示，不影响其他功能使用。'
                  : '此区块数据加载异常，您可以继续使用其他功能。'}
              </p>
            )}

            {this.state.error && (
              <details className="mb-3">
                <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1 hover:text-foreground">
                  <Bug className="h-3 w-3" />
                  错误详情
                </summary>
                <pre className="mt-2 text-xs bg-muted/50 p-2 rounded overflow-auto max-h-32 text-red-600 dark:text-red-400">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button size={isComponentLevel ? 'sm' : 'default'} variant="outline" onClick={this.handleRetry}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                重试
              </Button>
              {isPageLevel && (
                <Button size="default" variant="ghost" onClick={this.handleGoHome}>
                  <Home className="h-3.5 w-3.5 mr-1.5" />
                  返回首页
                </Button>
              )}
              <Button
                size={isComponentLevel ? 'sm' : 'default'}
                variant="ghost"
                onClick={this.handleCopyError}
                className="text-muted-foreground"
              >
                {this.state.copied ? (
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                )}
                {this.state.copied ? '已复制' : '复制错误信息'}
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

// Wrapper that connects ErrorReportContext to the class component
export function GlobalErrorBoundary(props: ErrorBoundaryProps) {
  const { reportError } = useErrorReport();
  return <GlobalErrorBoundaryInner {...props} reportError={reportError} />;
}
