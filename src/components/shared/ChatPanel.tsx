'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Send, Package, DollarSign, Ship, Shield, BarChart3,
  Loader2, X, ArrowRight, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  loadMessages, saveMessages,
  renderMarkdown, CopyButton, TypingIndicator,
} from './ChatPanel.helpers';
import type { ChatMessage } from './ChatPanel.helpers';
import { ClaimLabel, parseClaimsFromText, type ClaimData, type ClaimVerdict, type FeedbackClaimsMap } from './ClaimLabel';
import { ActionCard, type ConfirmationCardData } from './ActionCard';

// ─── Quick Actions ─────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: Package, label: '库存健康', query: '帮我做库存健康检查' },
  { icon: DollarSign, label: '成本分析', query: '帮我做成本优化分析' },
  { icon: Ship, label: '供应商评估', query: '帮我做供应商风险评估' },
  { icon: Shield, label: '合规审计', query: '帮我做合规审计' },
  { icon: BarChart3, label: '全健康报告', query: '生成全健康报告' },
];

// ─── MARC Badge ───────────────────────────────────────────────────

function MARCBadges({ text }: { text: string }) {
  const badges: Array<{ label: string; color: string }> = [];

  // Extract [T1-MCP], [T2-KB], etc.
  const sourceMatch = text.match(/\[T\d-(MCP|KB|Search|LLM)\]/g);
  if (sourceMatch) {
    sourceMatch.forEach(s => {
      const [, source] = s.replace(/[\[\]]/g, '').split('-');
      const colorMap: Record<string, string> = {
        MCP: 'bg-amber-100 text-amber-800 border-amber-300',
        KB: 'bg-blue-100 text-blue-800 border-blue-300',
        Search: 'bg-purple-100 text-purple-800 border-purple-300',
        LLM: 'bg-zinc-100 text-zinc-600 border-zinc-300',
      };
      badges.push({ label: s.replace(/[\[\]]/g, ''), color: colorMap[source] || '' });
    });
  }

  // Extract confidence [高] [中] [低]
  const confMatch = text.match(/\[(高|中|低)\]/g);
  if (confMatch) {
    confMatch.forEach(c => {
      const level = c.replace(/[\[\]]/g, '');
      const colorMap: Record<string, string> = {
        '高': 'bg-green-100 text-green-700 border-green-300',
        '中': 'bg-yellow-100 text-yellow-700 border-yellow-300',
        '低': 'bg-red-100 text-red-700 border-red-300',
      };
      badges.push({ label: level, color: colorMap[level] || '' });
    });
  }

  if (badges.length === 0) return null;

  return (
    <span className="inline-flex gap-1 ml-1 align-middle">
      {badges.map((b, i) => (
        <span key={i} className={`text-[10px] px-1 py-0 rounded border ${b.color} font-mono leading-none`}>
          {b.label}
        </span>
      ))}
    </span>
  );
}

// ─── Tool Call Chain ────────────────────────────────────────────────

interface ToolEvent {
  tool: string;
  params?: Record<string, unknown>;
  result?: string;
  error?: string;
}

const TOOL_ICONS: Record<string, string> = {
  query: '\u{1F4CA}', calculate: '\u{1F9EE}', create: '\u{1F4DD}', update: '\u{270F}️',
  execute: '\u{2699}️', generate: '\u{1F3A8}', analyze: '\u{1F50D}', run: '\u{1F680}',
  forecast: '\u{1F4C8}', classify: '\u{1F3F7}', web_search: '\u{1F310}',
};

function toolIcon(name: string): string {
  for (const [prefix, icon] of Object.entries(TOOL_ICONS)) {
    if (name.startsWith(prefix)) return icon;
  }
  return '\u{1F527}';
}

const TOOL_LABELS: Record<string, string> = {
  query_inventory: '库存查询',
  query_cost: '成本查询',
  query_suppliers: '供应商查询',
  query_logistics: '物流查询',
  query_risk: '风险评估',
  query_dashboard: '仪表盘',
  query_analytics: '数据分析',
  query_commodities: '大宗商品',
  query_tariff: '关税查询',
  query_exchange_rates: '汇率查询',
  query_cascade_risk: '级联风险',
  query_supplier_trend: '供应商趋势',
  query_procurement: '采购计划',
  query_warehouse_capacity: '仓库容量',
  query_supplier_location: '供应商分布',
  execute_workflow: '工作流',
  run_sandbox: '沙箱仿真',
  web_search: '联网搜索',
  create_reorder: '创建补货单',
  create_transfer: '库存调拨',
  batch_create_reorder: '批量补货',
  generate_report: '生成报告',
  calculate_eoq: 'EOQ 计算',
  calculate_safety_stock: '安全库存',
  calculate_break_even: '盈亏平衡',
  calculate_total_cost: '到岸成本',
  calculate_supplier_scoring: '供应商评分',
  classify_abc_xyz: 'ABC-XYZ 分类',
  forecast_demand: '需求预测',
};

function ToolCallChain({ calls }: { calls: ToolEvent[] }) {
  if (calls.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 my-2">
      {calls.map((tc, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <ArrowRight className="h-3 w-3 text-zinc-400" />}
          <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-1">
            <span>{toolIcon(tc.tool)}</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {TOOL_LABELS[tc.tool] || tc.tool}
            </span>
            {tc.error && <span className="text-red-500 text-[10px]">失败</span>}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─── Data Panel ──────────────────────────────────────────────────────

function DataPanel({ tools, onClose }: { tools: ToolEvent[]; onClose: () => void }) {
  if (tools.length === 0) return null;

  return (
    <div className="w-80 shrink-0 border-l bg-white dark:bg-zinc-900 overflow-auto transition-all duration-300 animate-in slide-in-from-right">
      <div className="sticky top-0 flex items-center justify-between p-3 border-b bg-zinc-50 dark:bg-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">数据来源</h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3 space-y-3">
        {tools.map((tc, i) => (
          <div
            key={i}
            className="border rounded-lg p-2 transition-all duration-300"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{toolIcon(tc.tool)}</span>
              <span className="text-xs font-semibold">{TOOL_LABELS[tc.tool] || tc.tool}</span>
              {tc.error ? (
                <span className="text-[10px] text-red-500 ml-auto">失败</span>
              ) : (
                <span className="text-[10px] text-green-600 ml-auto">完成</span>
              )}
            </div>
            {tc.params && Object.keys(tc.params).length > 0 && (
              <div className="text-[10px] text-zinc-500 mb-1">
                {Object.entries(tc.params).filter(([,v]) => v !== undefined && v !== '').map(([k, v]) => (
                  <span key={k} className="mr-2">{k}: {String(v).slice(0, 40)}</span>
                ))}
              </div>
            )}
            {tc.result && (
              <pre className="text-[10px] text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded p-1.5 max-h-32 overflow-auto font-mono leading-relaxed">
                {tc.result.slice(0, 500)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ChatPanel ──────────────────────────────────────────────────

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<FeedbackClaimsMap>({});
  const [confirmationCards, setConfirmationCards] = useState<Record<string, ConfirmationCardData[]>>({});
  const [showDataPanel, setShowDataPanel] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate messages from localStorage
  useEffect(() => {
    const saved = loadMessages();
    if (saved.length > 0) setMessages(saved);
    setHydrated(true);
  }, []);

  // Save messages on change
  useEffect(() => {
    if (hydrated && messages.length > 0) saveMessages(messages);
  }, [messages, hydrated]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const handleClaimVerdict = useCallback(async (_msgId: string, _claims: ClaimData[], claimId: string, verdict: ClaimVerdict) => {
    setFeedbackMap(prev => ({ ...prev, [claimId]: verdict }));
    try {
      await fetch('/api/engine-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditId: `chat-${_msgId}`, engine: 'chat-agent', action: verdict === 'accurate' ? 'accepted' : 'modified' }),
      });
    } catch { /* non-blocking */ }
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const query = text || input.trim();
    if (!query || isLoading) return;

    setInput('');
    setStreamingContent('');
    setStreamingToolCalls([]);
    setShowDataPanel(false);
    setIsLoading(true);
    setStreaming(true);

    const userMsg: ChatMessage = {
      role: 'user', content: query, id: Date.now().toString(),
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          stream: true,
          provider: 'deepseek',
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      const tools: ToolEvent[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'token' || (parsed.status && typeof parsed.content === 'string')) {
              if (parsed.content) {
                fullContent += parsed.content;
                setStreamingContent(prev => prev + parsed.content);
              }
            }

            if (parsed.tool && parsed.params) {
              const evt: ToolEvent = { tool: parsed.tool, params: parsed.params };
              tools.push(evt);
              setStreamingToolCalls([...tools]);
              setShowDataPanel(true);
            }

            if (parsed.tool && (parsed.result || parsed.error)) {
              const existing = tools.find(t => t.tool === parsed.tool && !t.result && !t.error);
              if (existing) {
                existing.result = parsed.result;
                existing.error = parsed.error;
              } else {
                tools.push({ tool: parsed.tool, result: parsed.result, error: parsed.error });
              }
              setStreamingToolCalls([...tools]);
            }
          } catch { /* skip malformed */ }
        }
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: fullContent,
        id: (Date.now() + 1).toString(),
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (tools.length > 0) {
        setStreamingToolCalls(tools);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error('请求失败');
      }
    } finally {
      setIsLoading(false);
      setStreaming(false);
      setStreamingContent('');
      abortRef.current = null;
    }
  }, [input, isLoading, messages]);

  const handleQuickAction = (query: string) => {
    setInput(query);
    setTimeout(() => handleSend(query), 50);
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar" ref={scrollRef}>
          <div className="max-w-2xl mx-auto px-6 py-8">
            {/* Empty state */}
            {messages.length === 0 && !isLoading && (
              <div className="text-center py-20">
                <h2 className="text-2xl font-light text-zinc-800 dark:text-zinc-200 mb-2">
                  SupplyChain Cortex
                </h2>
                <p className="text-sm text-zinc-500 mb-8">
                  智能供应链决策助手 &mdash; 74 个专业工具为你分析
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK_ACTIONS.map(a => (
                    <button
                      key={a.label}
                      onClick={() => handleQuickAction(a.query)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-300 transition-all"
                    >
                      <a.icon className="h-4 w-4" />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map(msg => (
              <div key={msg.id} className={`mb-6 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                {msg.role === 'user' ? (
                  <div className="bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-2xl px-4 py-2.5 max-w-[80%] text-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="group">
                    <div className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                      {renderMarkdown(msg.content)}
                    </div>

                    {/* Copy button */}
                    {msg.content && <CopyButton text={msg.content} />}

                    {/* Claims */}
                    {msg.content && (() => {
                      const claims = parseClaimsFromText(msg.content);
                      if (claims.length === 0) return null;
                      return (
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] text-zinc-500 mb-1">分析声明 (点击标注准确性):</p>
                          <div className="flex flex-wrap gap-1">
                            {claims.map(claim => (
                              <ClaimLabel key={`${msg.id}-${claim.id}`} claim={{ ...claim, verdict: feedbackMap[claim.id] }} onVerdict={(claimId, verdict) => handleClaimVerdict(msg.id, claims, claimId, verdict)} />
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Confirmation cards */}
                    {confirmationCards[msg.id] && confirmationCards[msg.id].length > 0 && (
                      <div className="mt-2 space-y-2">
                        <p className="text-[10px] text-zinc-500">待确认操作:</p>
                        {confirmationCards[msg.id].map((card, i) => (
                          <ActionCard key={`${msg.id}-action-${i}`} card={card} msgId={msg.id} />
                        ))}
                      </div>
                    )}

                    {/* Regenerate */}
                    {msg.content && !streaming && msg.id === messages[messages.length - 1]?.id && (
                      <button
                        onClick={() => {
                          const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                          if (lastUserMsg) {
                            setMessages(prev => prev.slice(0, -1));
                            setInput(lastUserMsg.content);
                          }
                        }}
                        className="text-[10px] text-zinc-400 hover:text-zinc-600 mt-1 flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" /> 重新生成
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Streaming content */}
            {streaming && streamingContent && (
              <div className="mb-6">
                <TypingIndicator />
                <div className="mt-2 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                  {renderMarkdown(streamingContent)}
                </div>
              </div>
            )}

            {/* Tool call chain during streaming */}
            {streaming && streamingToolCalls.length > 0 && (
              <div className="mb-6">
                <ToolCallChain calls={streamingToolCalls} />
              </div>
            )}

            {isLoading && !streaming && (
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                思考中...
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t bg-white dark:bg-zinc-900 px-6 py-4">
          <div className="max-w-2xl mx-auto">
            {/* Quick actions (compact, above input) */}
            {messages.length > 0 && (
              <div className="flex gap-1 mb-3 overflow-x-auto">
                {QUICK_ACTIONS.slice(0, 3).map(a => (
                  <button
                    key={a.label}
                    onClick={() => handleQuickAction(a.query)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <a.icon className="h-3 w-3" />
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                  placeholder="输入问题，例如：库存情况如何、成本优化建议、供应商风险分析..."
                  className="w-full h-11 text-sm border-zinc-200 dark:border-zinc-700 rounded-xl"
                  disabled={isLoading}
                />
              </div>
              <Button
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="h-11 w-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-out data panel */}
      {showDataPanel && streamingToolCalls.length > 0 && (
        <DataPanel
          tools={streamingToolCalls}
          onClose={() => setShowDataPanel(false)}
        />
      )}
    </div>
  );
}
