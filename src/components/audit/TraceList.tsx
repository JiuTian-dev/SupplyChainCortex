'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Trash2 } from 'lucide-react';

interface TraceItem {
  id: string;
  auditId: string;
  userQuery: string;
  intent: string;
  confidence: number;
  durationMs: number;
  toolsUsed: string[];
  claimsCount: number;
  createdAt: string;
}

const INTENT_LABELS: Record<string, string> = {
  supply_chain_data: '供应链数据',
  supply_chain_knowledge: '专业知识',
  news_event: '新闻事件',
  general_knowledge: '通用知识',
  opinion_recommendation: '意见推荐',
  chat_greeting: '闲聊',
};

const INTENT_COLORS: Record<string, string> = {
  supply_chain_data: 'bg-blue-100 text-blue-800',
  supply_chain_knowledge: 'bg-green-100 text-green-800',
  news_event: 'bg-orange-100 text-orange-800',
  general_knowledge: 'bg-purple-100 text-purple-800',
  opinion_recommendation: 'bg-yellow-100 text-yellow-800',
  chat_greeting: 'bg-gray-100 text-gray-600',
};

export function TraceList({ selectedId, onSelect }: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [traces, setTraces] = useState<TraceItem[]>([]);
  const [intentFilter, setIntentFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (intentFilter) params.set('intent', intentFilter);
      const res = await fetch(`/api/audit/traces?${params}`);
      const data = await res.json();
      if (data.success) setTraces(data.data.traces);
    } catch (err) {
      console.error('Failed to fetch traces:', err);
    } finally {
      setLoading(false);
    }
  }, [intentFilter]);

  useEffect(() => { fetchTraces(); }, [fetchTraces]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('删除此决策记录？')) return;
    await fetch(`/api/audit/traces/${id}`, { method: 'DELETE' });
    if (selectedId === id) onSelect('');
    fetchTraces();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">决策历史</h3>
        <Button variant="ghost" size="icon" onClick={fetchTraces} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Intent filter */}
      <select
        className="mb-3 w-full rounded-md border px-2 py-1 text-xs"
        value={intentFilter}
        onChange={e => setIntentFilter(e.target.value)}
      >
        <option value="">全部意图</option>
        {Object.entries(INTENT_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 pr-2">
          {traces.map(t => (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`cursor-pointer rounded-md border p-2 text-xs transition-colors hover:bg-accent ${
                selectedId === t.id ? 'border-primary bg-accent' : 'border-transparent'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Badge variant="secondary" className={`text-[10px] px-1.5 ${INTENT_COLORS[t.intent] || ''}`}>
                  {INTENT_LABELS[t.intent] || t.intent}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(t.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="truncate mb-1">{t.userQuery}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>⏱ {(t.durationMs / 1000).toFixed(1)}s</span>
                <span>🔧 {t.toolsUsed.length} tools</span>
                <span>📝 {t.claimsCount} claims</span>
                <span className="ml-auto">
                  {t.confidence >= 0.9 ? '🟢' : t.confidence >= 0.7 ? '🟡' : '🔴'}
                </span>
                <button onClick={(e) => handleDelete(t.id, e)} className="hover:text-red-500">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          {traces.length === 0 && !loading && (
            <p className="text-center text-xs text-muted-foreground py-8">暂无决策记录</p>
          )}
        </div>
      </div>
    </div>
  );
}
