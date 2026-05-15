'use client';

import { Card, CardContent } from '@/components/ui/card';
import { CHART_COLORS } from '@/lib/constants';
import { LazyLoader } from '@/components/shared/LazyLoader';

// ─── Dashboard Skeleton — full-page loading state ───────────────────────────

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* 5 small metric card skeletons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={`sm-${i}`} className="overflow-hidden">
            <div
              className="h-[2px]"
              style={{ backgroundColor: CHART_COLORS[i] + '40' }}
            />
            <CardContent className="p-4">
              <div className="space-y-2">
                <div
                  className="h-3 bg-muted rounded skeleton-wave-v2"
                  style={{
                    width: `${50 + i * 8}%`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
                <div
                  className="h-7 bg-muted rounded skeleton-wave-v2"
                  style={{
                    width: `${60 + i * 5}%`,
                    animationDelay: `${i * 100 + 50}ms`,
                  }}
                />
                <div
                  className="h-3 bg-muted rounded skeleton-wave-v2"
                  style={{
                    width: `${45 + i * 6}%`,
                    animationDelay: `${i * 100 + 100}ms`,
                  }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* 1 wide skeleton for health score */}
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div
            className="h-[180px] bg-muted rounded skeleton-wave-v2"
            style={{ animationDelay: '200ms' }}
          />
        </CardContent>
      </Card>
      {/* 2 larger chart card skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={`lg-${i}`} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div
                  className="h-4 bg-muted rounded skeleton-wave-v2 w-32"
                  style={{ animationDelay: `${300 + i * 100}ms` }}
                />
                <div
                  className="h-[260px] bg-muted rounded skeleton-wave-v2"
                  style={{ animationDelay: `${350 + i * 100}ms` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* 2 more chart card skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={`xl-${i}`} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div
                  className="h-4 bg-muted rounded skeleton-wave-v2 w-28"
                  style={{ animationDelay: `${500 + i * 100}ms` }}
                />
                <div
                  className="h-[200px] bg-muted rounded skeleton-wave-v2"
                  style={{ animationDelay: `${550 + i * 100}ms` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-enhanced {
          background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.4) 50%, transparent 75%);
          background-size: 200% 100%;
          animation: shimmer 2s ease-in-out infinite;
        }
        .dark .shimmer-enhanced {
          background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.08) 50%, transparent 75%);
          background-size: 200% 100%;
          animation: shimmer 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ─── Tab Skeleton — tab-specific loading state ──────────────────────────────

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
