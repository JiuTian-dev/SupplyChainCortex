'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BatchActionsToolbarProps {
  /** Number of currently selected items. */
  selectedCount: number;
  /** Called when the user clicks "批量补货". */
  onBatchReorder?: () => void;
  /** Called when the user clicks "批量导出CSV". */
  onBatchExport?: () => void;
  /** Called when the user clicks "取消选择". */
  onClearSelection: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * A floating toolbar that appears at the bottom of the screen when items are
 * selected in a data table. Animates in/out using Framer Motion spring.
 */
export function BatchActionsToolbar({
  selectedCount,
  onBatchReorder,
  onBatchExport,
  onClearSelection,
}: BatchActionsToolbarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          key="batch-actions-toolbar"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="flex items-center gap-3 rounded-xl border bg-background/95 px-5 py-3 shadow-2xl backdrop-blur-md">
            {/* Selected count badge */}
            <span className="whitespace-nowrap text-sm font-semibold text-orange-600 dark:text-orange-400">
              已选择 {selectedCount} 项
            </span>

            <div className="h-5 w-px bg-border" />

            {/* Batch reorder — only shown when callback is provided */}
            {onBatchReorder && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={onBatchReorder}
              >
                <Package className="h-3.5 w-3.5" />
                批量补货
              </Button>
            )}

            {/* Batch CSV export — only shown when callback is provided */}
            {onBatchExport && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={onBatchExport}
              >
                <Download className="h-3.5 w-3.5" />
                批量导出CSV
              </Button>
            )}

            {/* Clear selection */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={onClearSelection}
            >
              <X className="h-3.5 w-3.5" />
              取消选择
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
