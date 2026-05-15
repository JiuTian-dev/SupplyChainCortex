'use client';

import { ArrowUp } from 'lucide-react';
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';

export function ScrollToTop() {
  const showScrollTop = useDashboardUIStore((s) => s.showScrollTop);

  if (!showScrollTop) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-50 h-10 w-10 rounded-full bg-orange-500 text-white shadow-lg hover:bg-orange-600 hover:shadow-xl transition-all duration-200 flex items-center justify-center hover:scale-110"
      aria-label="回到顶部"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
