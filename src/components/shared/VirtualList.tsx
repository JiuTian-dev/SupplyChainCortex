'use client';

/* eslint-disable react-hooks/incompatible-library */
// TanStack Virtual's useVirtualizer is incompatible with React Compiler.
// Disable the incompatible-library warning for this file to avoid noise.

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, type ReactNode } from 'react';

// ==================== VirtualList ====================

interface VirtualListProps<T> {
  /** The items to render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** Estimated row height in pixels */
  estimateSize: number;
  /** Number of items to render outside viewport (default 5) */
  overscan?: number;
  /** Additional class names for the scroll container */
  className?: string;
  /** Max height of the scroll container (default 400px) */
  maxHeight?: number | string;
  /** Message when items is empty */
  emptyMessage?: string;
  /** Empty state icon element */
  emptyIcon?: ReactNode;
  /** Callback to measure actual element size for dynamic heights */
  measureElement?: (el: HTMLDivElement | null, index: number) => void;
}

export function VirtualList<T>({
  items,
  renderItem,
  estimateSize,
  overscan = 5,
  className = '',
  maxHeight = 400,
  emptyMessage = '暂无数据',
  emptyIcon,
  measureElement,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        {emptyIcon && <div className="mb-3 opacity-30">{emptyIcon}</div>}
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const maxHeightStyle = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

  return (
    <div
      ref={parentRef}
      className={`overflow-y-auto overflow-x-hidden custom-scrollbar ${className}`}
      style={{ maxHeight: maxHeightStyle }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={(el) => measureElement?.(el, virtualItem.index)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== VirtualTableList ====================
// Specialized version for table rows that works with HTML table elements.
// Renders virtualized tbody content inside a scrollable container.

interface VirtualTableListProps<T> {
  items: T[];
  renderRow: (item: T, index: number) => ReactNode;
  estimateSize: number;
  overscan?: number;
  className?: string;
  maxHeight?: number | string;
  emptyMessage?: string;
  /** Column count for empty state colSpan */
  colSpan?: number;
}

export function VirtualTableList<T>({
  items,
  renderRow,
  estimateSize,
  overscan = 5,
  className = '',
  maxHeight = 400,
  emptyMessage = '暂无数据',
  colSpan = 1,
}: VirtualTableListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const maxHeightStyle = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

  return (
    <div
      ref={parentRef}
      className={`overflow-y-auto overflow-x-auto custom-scrollbar ${className}`}
      style={{ maxHeight: maxHeightStyle }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderRow(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
