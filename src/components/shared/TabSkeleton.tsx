'use client';

import { LazyLoader } from '@/components/shared/LazyLoader';

interface TabSkeletonProps {
  /** Optional tab name to customize the skeleton appearance */
  tabName?: string;
}

export function TabSkeleton({ tabName }: TabSkeletonProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Metric card row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-card p-4 space-y-2 overflow-hidden"
          >
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
        ))}
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Large chart area */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 bg-muted rounded shimmer-loading w-1/3" />
            <div className="h-8 w-20 bg-muted rounded shimmer-loading" />
          </div>
          <div className="h-[220px] bg-muted/30 rounded-lg shimmer-loading flex items-end gap-1 p-4">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-muted/50 rounded-t shimmer-loading"
                style={{
                  height: `${15 + Math.sin(i * 0.7) * 25 + 30}%`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="h-5 bg-muted rounded shimmer-loading w-2/3" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted shimmer-loading" />
                <div className="flex-1 space-y-1.5">
                  <div
                    className="h-3 bg-muted rounded shimmer-loading"
                    style={{ width: `${70 + (i % 3) * 10}%`, animationDelay: `${i * 80}ms` }}
                  />
                  <div
                    className="h-2 bg-muted rounded shimmer-loading"
                    style={{ width: `${50 + (i % 2) * 20}%`, animationDelay: `${i * 80 + 40}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LazyLoader type="card" count={2} />
        <LazyLoader type="chart" />
      </div>

      {tabName && (
        <div className="sr-only" aria-live="polite">
          Loading {tabName} content...
        </div>
      )}
    </div>
  );
}
