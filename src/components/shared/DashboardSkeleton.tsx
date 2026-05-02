'use client';

import { Card, CardContent } from '@/components/ui/card';
import { CHART_COLORS } from '@/lib/constants';

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
