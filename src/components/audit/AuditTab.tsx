'use client';

import { useState } from 'react';
import { TraceList } from './TraceList';
import { TraceDetail } from './TraceDetail';

export function AuditTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-120px)] gap-4 p-4">
      {/* Left: Trace list — fixed width on desktop, collapsible on mobile */}
      <div className="w-full md:w-80 md:shrink-0">
        <TraceList selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Right: Detail */}
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <TraceDetail traceId={selectedId} />
        ) : (
          <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground">
            <div className="text-center space-y-2">
              <div className="text-4xl">📋</div>
              <p className="font-medium">选择左侧的决策记录查看详情</p>
              <p className="text-xs text-muted-foreground">包含因果链路图、工具调用追溯与合规报告</p>
              <p className="text-xs text-muted-foreground mt-4">
                在 Chat 中提问后，决策记录会自动出现在左侧列表
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
