'use client';

import { useState } from 'react';
import { TraceList } from './TraceList';
import { TraceDetail } from './TraceDetail';

export function AuditTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-full gap-4 p-4">
      {/* Left: Trace list */}
      <div className="w-80 shrink-0">
        <TraceList selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Right: Detail */}
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <TraceDetail traceId={selectedId} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="text-4xl mb-2">📋</div>
              <p>选择左侧的决策记录查看详情</p>
              <p className="text-xs mt-1">包含因果链路图与工具调用追溯</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
