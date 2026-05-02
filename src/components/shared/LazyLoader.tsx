'use client';

import { Card, CardContent } from '@/components/ui/card';

interface LazyLoaderProps {
  type: 'tab' | 'card' | 'chart' | 'dialog';
  count?: number;
  className?: string;
  height?: number | string;
  width?: number | string;
}

export function LazyLoader({ type, count = 1, className = '', height, width }: LazyLoaderProps) {
  const style = height || width ? { height, width } : undefined;

  if (type === 'tab') {
    return (
      <div className={`space-y-6 ${className}`} style={style}>
        {/* Metric card row skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={`metric-${i}`} className="overflow-hidden">
              <div className="h-[2px] bg-muted" />
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div
                    className="h-3 bg-muted rounded shimmer-loading"
                    style={{ width: `${50 + i * 8}%`, animationDelay: `${i * 100}ms` }}
                  />
                  <div
                    className="h-7 bg-muted rounded shimmer-loading"
                    style={{ width: `${60 + i * 5}%`, animationDelay: `${i * 100 + 50}ms` }}
                  />
                  <div
                    className="h-2 bg-muted rounded shimmer-loading"
                    style={{ width: `${40 + i * 10}%`, animationDelay: `${i * 100 + 100}ms` }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Main chart area skeleton */}
        <Card>
          <CardContent className="p-6">
            <div className="h-4 bg-muted rounded shimmer-loading w-1/4 mb-4" />
            <div className="h-[200px] bg-muted/50 rounded shimmer-loading" />
          </CardContent>
        </Card>
        {/* Secondary panels skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={`panel-${i}`}>
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded shimmer-loading w-1/3 mb-4" />
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-muted rounded-full shimmer-loading" />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 bg-muted rounded shimmer-loading w-3/4" />
                        <div className="h-2 bg-muted rounded shimmer-loading w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={`grid gap-4 ${className}`} style={style}>
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div
                  className="h-3 bg-muted rounded shimmer-loading"
                  style={{ width: `${60 + (i % 3) * 15}%`, animationDelay: `${i * 80}ms` }}
                />
                <div
                  className="h-6 bg-muted rounded shimmer-loading"
                  style={{ width: `${50 + (i % 2) * 20}%`, animationDelay: `${i * 80 + 40}ms` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (type === 'chart') {
    return (
      <Card className={`overflow-hidden ${className}`} style={style}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 bg-muted rounded shimmer-loading w-1/4" />
            <div className="h-6 w-6 bg-muted rounded shimmer-loading" />
          </div>
          <div className="h-[200px] bg-muted/30 rounded flex items-end gap-1 p-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-muted/60 rounded-t shimmer-loading"
                style={{ height: `${20 + Math.sin(i * 0.8) * 30 + 30}%`, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-2 bg-muted rounded shimmer-loading w-10" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (type === 'dialog') {
    return (
      <div className={`space-y-4 ${className}`} style={style}>
        <div className="h-6 bg-muted rounded shimmer-loading w-1/3" />
        <div className="space-y-3">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-muted rounded shimmer-loading w-1/4" style={{ animationDelay: `${i * 60}ms` }} />
              <div className="h-10 bg-muted rounded shimmer-loading" style={{ animationDelay: `${i * 60 + 30}ms` }} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <div className="h-9 w-20 bg-muted rounded shimmer-loading" />
          <div className="h-9 w-20 bg-muted rounded shimmer-loading" />
        </div>
      </div>
    );
  }

  return null;
}
