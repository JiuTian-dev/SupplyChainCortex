'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Send, Package, DollarSign, Ship, Shield, BarChart3,
  Loader2, X, ArrowRight, RotateCcw,
  ChevronDown, Globe, Brain, Clock, Copy, Download,
  Settings, Eye, EyeOff, Paperclip,
} from 'lucide-react';
import {
  loadMessages, saveMessages, clearStoredMessages,
  renderMarkdown, CopyButton, TypingIndicator,
  fetchOllamaModels, fmtBytes,
} from './ChatPanel.helpers';
import type { ChatMessage } from './ChatPanel.helpers';
import { ClaimLabel, parseClaimsFromText, type ClaimData, type ClaimVerdict, type FeedbackClaimsMap } from './ClaimLabel';
import { ActionCard, type ConfirmationCardData } from './ActionCard';
import { SettingsSheet } from '@/components/shared/SettingsSheet';

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
  /** 工具返回结果（已序列化为字符串，兼容对象/数组/原始值） */
  result?: string;
  error?: string;
}

/**
 * 将任意类型的工具结果安全序列化为字符串，并截断到指定长度。
 * 解决 Harness 返回对象/数组导致 .slice is not a function 的问题。
 */
function safeStringifyResult(value: unknown, maxLen = 2000): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, maxLen);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const str = JSON.stringify(value, null, 2);
    return str.length > maxLen ? str.slice(0, maxLen) + '\n…(截断)' : str;
  } catch {
    return String(value).slice(0, maxLen);
  }
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

// ─── Tool → Panel mapping ──────────────────────────────────────────

const TOOL_PANEL_MAP: Record<string, { panelId: string; label: string }> = {
  query_inventory: { panelId: 'inventory', label: '库存面板' },
  query_cost: { panelId: 'cost', label: '成本面板' },
  query_suppliers: { panelId: 'supplier', label: '供应商面板' },
  query_logistics: { panelId: 'logistics', label: '物流面板' },
  query_risk: { panelId: 'risk', label: '风险面板' },
  query_cascade_risk: { panelId: 'cascade-risk', label: '级联风险' },
  query_dashboard: { panelId: 'sales', label: '销售面板' },
  query_analytics: { panelId: 'sales', label: '销售面板' },
};

// ─── Data Panel ──────────────────────────────────────────────────────

function DataPanel({ tools, onClose, onJump }: {
  tools: ToolEvent[];
  onClose: () => void;
  onJump?: (panelId: string) => void;
}) {
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
        {tools.map((tc, i) => {
          const panelLink = TOOL_PANEL_MAP[tc.tool];
          return (
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
                  {safeStringifyResult(tc.result, 500)}
                </pre>
              )}
              {panelLink && onJump && !tc.error && (
                <button
                  onClick={() => onJump(panelLink.panelId)}
                  className="mt-1.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  {panelLink.label}
                  <ArrowRight className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Token estimation ──────────────────────────────────────────────────

function estimateTokens(text: string): number {
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk / 3 + other / 4);
}

// ─── Thinking Status Formatting ────────────────────────────────────────
// Convert technical thinking status to user-friendly Chinese descriptions

const THINKING_STATUS_MAP: Record<string, string> = {
  'context': '理解上下文',
  'classifying': '分析需求意图',
  'planning': '规划分析方案',
  'executing': '执行数据分析',
  'observing': '整理分析结果',
  'deciding': '生成决策建议',
  'synthesizing': '撰写回答',
  'searching': '联网搜索信息',
  'evaluating': '评估回答质量',
  'adjusting': '优化分析方案',
};

function formatThinkingStatus(status: string): string {
  // Handle evaluation scores - convert to user-friendly descriptions
  if (status.includes('评估')) {
    if (status.includes('3.5/10')) {
      return '评估回答：需要调整优化';
    }
    if (status.includes('/10')) {
      const match = status.match(/(\d+\.?\d*)\/10/);
      if (match) {
        const score = parseFloat(match[1]);
        if (score >= 8) return '评估回答：质量优秀';
        if (score >= 6) return '评估回答：符合要求';
        if (score >= 4) return '评估回答：需要改进';
        return '评估回答：需要重新分析';
      }
    }
    return '评估回答质量';
  }
  
  // Handle productDepth, functionalCompleteness, dataAccuracy, answerQuality
  if (status.includes('productDepth')) {
    return '分析需求深度';
  }
  if (status.includes('functionalCompleteness')) {
    return '检查功能完整性';
  }
  if (status.includes('dataAccuracy')) {
    return '验证数据准确性';
  }
  if (status.includes('answerQuality')) {
    return '评估回答质量';
  }
  
  // Handle step numbers like "Step 1/5"
  if (status.match(/Step \d+\/\d+/)) {
    return `分析步骤 ${status.split(' ')[1]}`;
  }
  
  // Handle "thought" or "thinking" statuses
  if (status.includes('thought')) {
    const match = status.match(/thought (\d+)/);
    return match ? `思考 ${match[1]}` : '深度思考';
  }
  
  // Return mapped status or clean version of original
  return THINKING_STATUS_MAP[status] || status.replace(/_/g, ' ');
}

// ─── Main ChatPanel ──────────────────────────────────────────────────

export function ChatPanel({ settingsOpen, onSettingsOpenChange, onJumpToPanel }: {
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  onJumpToPanel?: (panelId: string) => void;
}) {
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
  const [lastError, setLastError] = useState<string | null>(null);
  const [persistentTools, setPersistentTools] = useState<{ messageId: string; tools: ToolEvent[] } | null>(null);

  // ─── Feature 1: Provider/Model ──────────────────────────────────────
  const [selectedProvider, setSelectedProvider] = useState('deepseek');
  const [selectedModel, setSelectedModel] = useState('deepseek-v4-flash');

  // ─── Feature 2: Memory Mode Toggle ───────────────────────────────────
  const [memoryMode, setMemoryMode] = useState(true);

  // ─── Feature 3: Web Search Toggle ───────────────────────────────────
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean | undefined>(undefined);

  // ─── Feature 3: Thinking Process Panel ──────────────────────────────
  const [thinkingSteps, setThinkingSteps] = useState<Array<{ status: string; durationMs?: number }>>([]);
  const [thinkingOpen, setThinkingOpen] = useState(false);

  // ─── Feature 4: Conversation History ────────────────────────────────
  const [convList, setConvList] = useState<Array<{ id: string; title: string; messageCount: number }>>([]);
  const [showConvList, setShowConvList] = useState(false);

  // ─── Feature 7: Settings / API Key ──────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // ─── Feature 8: Token Usage ──────────────────────────────────────────
  const [tokenUsage, setTokenUsage] = useState<Record<string, { input: number; output: number }>>({});

  // ─── Feature 9: File Upload ──────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // ─── Feature 10: Ollama Scanner ──────────────────────────────────────
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string; size: string }>>([]);
  const [scanningOllama, setScanningOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'scanning' | 'found' | 'error'>('idle');

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

  // If no messages loaded from main storage, try loading from conversation history
  useEffect(() => {
    if (hydrated && messages.length === 0) {
      try {
        const convs = JSON.parse(localStorage.getItem('chat-conversations') || '[]');
        if (convs.length > 0) {
          const latest = convs[0];
          const raw = localStorage.getItem(`chat-msgs-${latest.id}`);
          if (raw) {
            const msgs = JSON.parse(raw);
            setMessages(msgs);
            saveMessages(msgs);
          }
        }
      } catch {}
    }
  }, [hydrated, messages.length]);

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

  // Load conversation list from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('chat-conversations');
      if (stored) setConvList(JSON.parse(stored));
    } catch {}
  }, []);

  // Save current conversation to localStorage (append, not overwrite)
  const saveCurrentConversation = useCallback(() => {
    if (messages.length === 0) return;
    const firstUserMsg = messages.find(m => m.role === 'user');
    const title = firstUserMsg?.content?.slice(0, 40) || '新对话';
    const convs = JSON.parse(localStorage.getItem('chat-conversations') || '[]');
    const entry = {
      id: Date.now().toString(),
      title,
      messageCount: messages.length,
      updatedAt: new Date().toISOString()
    };
    convs.unshift(entry);
    localStorage.setItem('chat-conversations', JSON.stringify(convs.slice(0, 50)));
    // Also save messages under this conversation ID
    localStorage.setItem(`chat-msgs-${entry.id}`, JSON.stringify(messages.slice(-50)));
    return entry.id;
  }, [messages]);

  const loadConversation = (convId: string) => {
    // Save current first
    saveCurrentConversation();
    // Load the selected one
    try {
      const raw = localStorage.getItem(`chat-msgs-${convId}`);
      if (raw) {
        const msgs = JSON.parse(raw);
        setMessages(msgs);
        // Also restore to main storage so loadMessages works on next mount
        saveMessages(msgs);
      }
    } catch {}
    setShowConvList(false);
  };

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
    setThinkingSteps([]);
    setThinkingOpen(false);
    setIsLoading(true);
    const startTime = Date.now();
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
          provider: selectedProvider,
          model: selectedModel,
          webSearch: webSearchEnabled,
          memoryMode: memoryMode,
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

            // Token/content event: {"content":"text"} or {"status":"Intent: ..."}
            if (parsed.content && typeof parsed.content === 'string' && !parsed.tool && !parsed.result && !parsed.error) {
              fullContent += parsed.content;
              setStreamingContent(prev => prev + parsed.content);
            }

            // Thinking event: {"status":"..."} with no content/tool
            if (parsed.status && typeof parsed.status === 'string' && !parsed.content && !parsed.tool) {
              setThinkingSteps(prev => [...prev, { status: parsed.status, durationMs: Date.now() - startTime }]);
            }

            // Tool call: {"tool":"name","params":{...}}
            if (parsed.tool && parsed.params) {
              const evt: ToolEvent = { tool: parsed.tool, params: parsed.params };
              tools.push(evt);
              setStreamingToolCalls([...tools]);
              setShowDataPanel(true);
            }

            if (parsed.tool && (parsed.result !== undefined || parsed.error)) {
              const resultStr = parsed.result !== undefined ? safeStringifyResult(parsed.result) : undefined;
              const existing = tools.find(t => t.tool === parsed.tool && !t.result && !t.error);
              if (existing) {
                existing.result = resultStr;
                existing.error = parsed.error;
              } else {
                tools.push({ tool: parsed.tool, result: resultStr, error: parsed.error });
              }
              setStreamingToolCalls([...tools]);
            }
          } catch { /* skip malformed */ }
        }
      }

      const assistantId = (Date.now() + 1).toString();

      // Estimate token usage from response content
      if (fullContent) {
        setTokenUsage(prev => ({ ...prev, [assistantId]: { input: estimateTokens(query), output: estimateTokens(fullContent) } }));
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: fullContent,
        id: assistantId,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (tools.length > 0) {
        setStreamingToolCalls(tools);
        setPersistentTools({ messageId: assistantId, tools });
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : '请求失败';
        setLastError(msg);
      }
    } finally {
      setIsLoading(false);
      setStreaming(false);
      setStreamingContent('');
      if (streamingToolCalls.length > 0) {
        setShowDataPanel(true);
      }
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
        <div className="flex-1 overflow-y-auto custom-scrollbar relative" ref={scrollRef}>
          {/* Feature 4: Conversation history toggle */}
          <button
            onClick={() => setShowConvList(!showConvList)}
            className="fixed top-[7.5rem] left-6 h-7 w-7 rounded-lg border border-zinc-200/80 dark:border-zinc-700/80 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm shadow-sm flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-20"
            title="对话历史"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>

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
              <div key={msg.id} className={`mb-6 ${msg.role === 'user' ? 'flex justify-end' : ''}`} data-testid="chat-message">
                {msg.role === 'user' ? (
                  <div className="bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-2xl px-4 py-2.5 max-w-[80%] text-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="group">
                    <div className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                      {renderMarkdown(msg.content)}
                    </div>

                    {/* Feature 5: Copy + Export buttons */}
                    {msg.content && (
                      <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyButton text={msg.content} />
                        <button
                          onClick={() => {
                            const blob = new Blob([msg.content], { type: 'text/markdown' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a'); a.href = url; a.download = `chat-${Date.now()}.md`; a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400"
                          title="导出 Markdown"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

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

                    {/* Token usage whisper */}
                    {(() => {
                      const usage = tokenUsage[msg.id];
                      const display = usage
                        ? `↑${usage.output >= 1000 ? (usage.output / 1000).toFixed(1) + 'k' : usage.output} ↓${usage.input >= 1000 ? (usage.input / 1000).toFixed(1) + 'k' : usage.input}`
                        : `↑${estimateTokens(msg.content) >= 1000 ? (estimateTokens(msg.content) / 1000).toFixed(1) + 'k' : estimateTokens(msg.content)}`;
                      return (
                        <div className="flex items-center justify-end mt-1">
                          <span className="text-[10px] text-zinc-400 font-mono tabular-nums">{display}</span>
                        </div>
                      );
                    })()}
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

            {/* Feature 3: Thinking Process Panel */}
            {thinkingSteps.length > 0 && (
              <div className="mb-6">
                <button
                  onClick={() => setThinkingOpen(!thinkingOpen)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <Brain className="h-3 w-3" />
                  思考过程 ({thinkingSteps.length}步)
                  <ChevronDown className={`h-3 w-3 transition-transform ${thinkingOpen ? 'rotate-180' : ''}`} />
                </button>
                {thinkingOpen && (
                  <div className="mt-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 text-xs space-y-1">
                    {thinkingSteps.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-zinc-500">
                        <span>{formatThinkingStatus(s.status)}</span>
                        {s.durationMs ? <span className="font-mono text-zinc-400">{s.durationMs}ms</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isLoading && !streaming && (
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                思考中...
              </div>
            )}

            {/* Error recovery suggestions */}
            {lastError && !isLoading && (
              <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
                <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300 mb-2">
                  <X className="h-4 w-4" />
                  <span className="font-medium">请求失败: {lastError}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setLastError(null);
                      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                      if (lastUserMsg) {
                        setInput(lastUserMsg.content);
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    重试上一条
                  </button>
                  <button
                    onClick={() => {
                      setSelectedProvider(prev => prev === 'deepseek' ? 'openai' : 'deepseek');
                      setLastError(null);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    切换 Provider ({selectedProvider === 'deepseek' ? 'OpenAI' : 'DeepSeek'})
                  </button>
                  <button
                    onClick={() => setLastError(null)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    忽略
                  </button>
                </div>
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
              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.md,.json,.log"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadedFileName(file.name);
                  const reader = new FileReader();
                  reader.onload = () => {
                    const text = reader.result as string;
                    setInput(prev => prev + (prev ? '\n\n--- ' + file.name + ' ---\n' : '') + text.slice(0, 3000));
                    setUploadedFileName(null);
                  };
                  reader.readAsText(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-11 w-11 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="上传文件"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                  placeholder="输入问题，例如：库存情况如何、成本优化建议、供应商风险分析..."
                  className="w-full h-11 text-sm border-zinc-200 dark:border-zinc-700 rounded-xl"
                  disabled={isLoading}
                  data-testid="chat-input"
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
      {showDataPanel && (persistentTools?.tools.length ?? 0) > 0 && (
        <DataPanel
          tools={persistentTools!.tools}
          onClose={() => setShowDataPanel(false)}
          onJump={onJumpToPanel}
        />
      )}

      {/* Feature 4: Conversation History slide-out */}
      {showConvList && (
        <div className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-zinc-900 border-r shadow-lg z-50 p-4 overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">对话历史</h3>
            <button onClick={() => setShowConvList(false)}><X className="h-4 w-4" /></button>
          </div>
          <button
            onClick={() => {
              saveCurrentConversation();
              clearStoredMessages();
              setMessages([]);
              setStreamingContent('');
              setStreamingToolCalls([]);
              setThinkingSteps([]);
              setShowConvList(false);
              // Reload convList from localStorage
              try {
                const stored = localStorage.getItem('chat-conversations');
                if (stored) setConvList(JSON.parse(stored));
              } catch {}
            }}
            className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 mb-2 border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500"
          >
            + 新对话
          </button>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {convList.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-4">暂无历史对话</p>
            )}
            {convList.map(c => (
              <div key={c.id} className="group flex items-center px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer text-xs">
                <div className="flex-1 min-w-0" onClick={() => loadConversation(c.id)}>
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="text-zinc-400">{c.messageCount} 条消息</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const convs = convList.filter(item => item.id !== c.id);
                    setConvList(convs);
                    localStorage.setItem('chat-conversations', JSON.stringify(convs));
                    localStorage.removeItem(`chat-msgs-${c.id}`);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition-all"
                  title="删除"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          {convList.length > 0 && (
            <button
              onClick={() => {
                if (confirm('清除全部对话历史？此操作不可撤销。')) {
                  setConvList([]);
                  localStorage.removeItem('chat-conversations');
                  // Clear all chat-msgs-* keys
                  for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key?.startsWith('chat-msgs-')) localStorage.removeItem(key);
                  }
                  setMessages([]);
                }
              }}
              className="w-full text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg mt-2 transition-colors"
            >
              清除全部历史
            </button>
          )}
        </div>
      )}

      {onSettingsOpenChange && (
        <SettingsSheet
          open={settingsOpen ?? false}
          onOpenChange={onSettingsOpenChange}
          memoryMode={memoryMode}
          onMemoryModeChange={setMemoryMode}
          webSearchMode={webSearchEnabled}
          onWebSearchModeChange={setWebSearchEnabled}
          provider={selectedProvider}
          model={selectedModel}
          onProviderChange={(p, m) => { setSelectedProvider(p as 'deepseek' | 'openai' | 'anthropic' | 'ollama'); setSelectedModel(m); }}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
        />
      )}
    </div>
  );
}
