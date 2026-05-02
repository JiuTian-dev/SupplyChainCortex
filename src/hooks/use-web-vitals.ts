'use client';

import { useEffect, useRef } from 'react';

interface WebVitalsMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
  timestamp: number;
}

/**
 * Hook to track and report Core Web Vitals metrics.
 * Uses the browser Performance API to measure LCP, FID, CLS, TTFB, and INP.
 * Reports to console in development mode; can be extended to send to analytics.
 */
export function useWebVitals() {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;

    const reportMetric = (metric: WebVitalsMetric) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[Web Vitals] %c${metric.name}%c ${metric.value.toFixed(2)}ms (${metric.rating})`,
          'color: #f97316; font-weight: bold;',
          'color: inherit;',
          metric
        );
      }
      // Extend: send to analytics endpoint
      // fetch('/api/analytics/web-vitals', { method: 'POST', body: JSON.stringify(metric) });
    };

    // --- Largest Contentful Paint (LCP) ---
    const observeLCP = () => {
      try {
        const po = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            const value = lastEntry.startTime;
            reportMetric({
              name: 'LCP',
              value,
              rating: value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor',
              delta: value,
              navigationType: performance.getEntriesByType('navigation')[0]
                ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type
                : 'unknown',
              timestamp: Date.now(),
            });
          }
          po.disconnect();
        });
        po.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {
        // PerformanceObserver not supported
      }
    };

    // --- First Input Delay (FID) ---
    const observeFID = () => {
      try {
        const po = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          entries.forEach((entry) => {
            const fidEntry = entry as PerformanceEntry & { processingStart: number };
            if ('processingStart' in fidEntry) {
              const value = fidEntry.processingStart - fidEntry.startTime;
              reportMetric({
                name: 'FID',
                value,
                rating: value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor',
                delta: value,
                navigationType: 'unknown',
                timestamp: Date.now(),
              });
            }
          });
          po.disconnect();
        });
        po.observe({ type: 'first-input', buffered: true });
      } catch {
        // PerformanceObserver not supported
      }
    };

    // --- Cumulative Layout Shift (CLS) ---
    const observeCLS = () => {
      try {
        let clsValue = 0;
        let clsEntries: PerformanceEntry[] = [];
        let sessionValue = 0;
        let sessionEntries: PerformanceEntry[] = [];

        const po = new PerformanceObserver((entryList) => {
          entryList.getEntries().forEach((entry) => {
            const layoutShift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
            if (!layoutShift.hadRecentInput) {
              const firstSessionEntry = sessionEntries[0];
              const lastSessionEntry = sessionEntries[sessionEntries.length - 1];

              if (
                sessionValue &&
                layoutShift.startTime - (lastSessionEntry as PerformanceEntry).startTime < 1000 &&
                layoutShift.startTime - (firstSessionEntry as PerformanceEntry).startTime < 5000
              ) {
                sessionValue += layoutShift.value;
                sessionEntries.push(layoutShift);
              } else {
                sessionValue = layoutShift.value;
                sessionEntries = [layoutShift];
              }

              if (sessionValue > clsValue) {
                clsValue = sessionValue;
                clsEntries = sessionEntries;
              }
            }
          });
        });
        po.observe({ type: 'layout-shift', buffered: true });

        // Report CLS on page hide
        const reportCLS = () => {
          if (clsValue > 0) {
            reportMetric({
              name: 'CLS',
              value: clsValue,
              rating: clsValue <= 0.1 ? 'good' : clsValue <= 0.25 ? 'needs-improvement' : 'poor',
              delta: clsValue,
              navigationType: 'unknown',
              timestamp: Date.now(),
            });
          }
          po.disconnect();
        };

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            reportCLS();
          }
        });
        window.addEventListener('pagehide', reportCLS);
      } catch {
        // PerformanceObserver not supported
      }
    };

    // --- Time to First Byte (TTFB) ---
    const measureTTFB = () => {
      try {
        const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (navEntry) {
          const value = navEntry.responseStart;
          reportMetric({
            name: 'TTFB',
            value,
            rating: value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor',
            delta: value,
            navigationType: navEntry.type,
            timestamp: Date.now(),
          });
        }
      } catch {
        // Navigation timing not supported
      }
    };

    // --- Interaction to Next Paint (INP) ---
    const observeINP = () => {
      try {
        let maxINP = 0;

        const po = new PerformanceObserver((entryList) => {
          entryList.getEntries().forEach((entry) => {
            const eventEntry = entry as PerformanceEntry & { processingStart: number; processingEnd: number; duration: number };
            if ('processingStart' in eventEntry && 'processingEnd' in eventEntry) {
              const duration = eventEntry.processingEnd - eventEntry.startTime;
              if (duration > maxINP) {
                maxINP = duration;
              }
            }
          });
        });
        po.observe({ type: 'event', buffered: true });

        // Report INP on page hide
        const reportINP = () => {
          if (maxINP > 0) {
            reportMetric({
              name: 'INP',
              value: maxINP,
              rating: maxINP <= 200 ? 'good' : maxINP <= 500 ? 'needs-improvement' : 'poor',
              delta: maxINP,
              navigationType: 'unknown',
              timestamp: Date.now(),
            });
          }
          po.disconnect();
        };

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            reportINP();
          }
        });
        window.addEventListener('pagehide', reportINP);
      } catch {
        // PerformanceObserver not supported
      }
    };

    // Only run in browser
    if (typeof window === 'undefined') return;

    // Wait for page to be ready before measuring
    if (document.readyState === 'complete') {
      measureTTFB();
      observeLCP();
      observeFID();
      observeCLS();
      observeINP();
    } else {
      window.addEventListener('load', () => {
        measureTTFB();
        observeLCP();
        observeFID();
        observeCLS();
        observeINP();
      });
    }
  }, []);
}
