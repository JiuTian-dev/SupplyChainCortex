'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare, Send, Bot, User, Sparkles, ChevronDown,
  Package, DollarSign, TrendingUp, Ship, Building2, Shield, BarChart3,
  Trash2, StickyNote, AlertTriangle, Settings, Key, Globe, Cpu,
  Wifi, RefreshCw, CircleDot, Loader2, Check, Square,
  MoreHorizontal, Paperclip, FileDown, FolderOpen, HardDrive, FileText, RotateCcw,
  PanelRightClose, Eye, EyeOff, Brain, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { AI_PROVIDERS, getProviderModels, getDefaultModel } from '@/lib/services/ai-providers.service';
import {
  ChatMessage, OllamaModel,
  SETTINGS_KEY,
  TOOL_ICONS, TOOL_LABELS, QUICK_ACTIONS,
  loadMessages, saveMessages, clearStoredMessages,
  parseSSEChunk,
  renderMarkdown, CopyButton, TypingIndicator,
  fetchOllamaModels, fmtBytes,
} from './ChatPanel.helpers';
import { ClaimLabel, parseClaimsFromText, type ClaimData, type ClaimVerdict, type FeedbackClaimsMap } from './ClaimLabel';
import { ActionCard, type ConfirmationCardData } from './ActionCard';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';

// ─── Constants ────────────────────────────────────────────────────────────────

const DRAWER_WIDTH = 460; // px — default drawer width
const DRAWER_MIN = 400;
const DRAWER_MAX = 900;
const WIDTH_STORAGE_KEY = 'chat-panel-width';

// ─── ChatPanel Component — Right-Side Drawer ─────────────────────────────────

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streamingToolCalls, setStreamingToolCalls] = useState<string[]>([]);
  const [expandedData, setExpandedData] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('deepseek');
  const [selectedModel, setSelectedModel] = useState<string>('deepseek-chat');
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean | undefined>(undefined);
  const [tokenUsage, setTokenUsage] = useState({ input: 0, output: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedbackMap, setFeedbackMap] = useState<FeedbackClaimsMap>({});
  const [confirmationCards, setConfirmationCards] = useState<Record<string, ConfirmationCardData[]>>({});
  const [passports, setPassports] = useState<Record<string, Record<string, unknown>>>({});
  const [expandedPassports, setExpandedPassports] = useState<Record<string, boolean>>({});
  const dashConfig = useDashboardConfigStore(s => s.config);
  const [testingConnection, setTestingConnection] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [scanningOllama, setScanningOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'scanning' | 'found' | 'error'>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [convList, setConvList] = useState<Array<{ id: string; title: string; messageCount: number }>>([]);
  const [showConvList, setShowConvList] = useState(false);

  // Drawer width — persisted & draggable
  const [drawerWidth, setDrawerWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(WIDTH_STORAGE_KEY);
      if (saved) { const w = parseInt(saved, 10); if (w >= DRAWER_MIN && w <= DRAWER_MAX) return w; }
    } catch { /* ignore */ }
    return DRAWER_WIDTH;
  });
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, w: 0 });

  const onResizeStart = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizingRef.current = true;
    resizeStartRef.current = { x: e.clientX, w: drawerWidth };
    e.preventDefault();
  }, [drawerWidth]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    const dx = resizeStartRef.current.x - e.clientX;
    const newW = Math.min(DRAWER_MAX, Math.max(DRAWER_MIN, resizeStartRef.current.w + dx));
    setDrawerWidth(newW);
  }, []);

  const onResizeEnd = useCallback(() => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    try { localStorage.setItem(WIDTH_STORAGE_KEY, String(drawerWidth)); } catch { /* ignore */ }
  }, [drawerWidth]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Ollama scanner
  const scanOllama = useCallback(async () => {
    setScanningOllama(true);
    setOllamaStatus('scanning');
    try {
      const baseUrl = AI_PROVIDERS.local?.baseURL || 'http://localhost:11434/v1';
      const models = await fetchOllamaModels(baseUrl);
      setOllamaModels(models);
      setOllamaStatus(models.length > 0 ? 'found' : 'error');
      if (models.length > 0) {
        toast.success(`发现 ${models.length} 个本地模型`);
      } else {
        toast.warning('未发现已安装的模型，请运行 ollama pull <model>');
      }
    } catch {
      setOllamaStatus('error');
      toast.error('无法连接 Ollama，请确认已启动 ollama serve');
    }
    setScanningOllama(false);
  }, []);

  useEffect(() => {
    if (selectedProvider === 'local' && ollamaModels.length === 0 && ollamaStatus === 'idle') {
      scanOllama();
    }
  }, [selectedProvider, ollamaModels.length, ollamaStatus, scanOllama]);

  // Load messages from localStorage
  useEffect(() => {
    const stored = loadMessages();
    if (stored.length > 0) setMessages(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveMessages(messages);
  }, [messages, hydrated]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 50);
    }
  }, [messages, isLoading, streaming]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 200);
  }, [isOpen]);

  useEffect(() => { return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  // Load provider settings from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored) as { provider?: string; model?: string; apiKey?: string };
        if (settings.provider && AI_PROVIDERS[settings.provider]) setSelectedProvider(settings.provider);
        if (settings.model) setSelectedModel(settings.model);
        if (settings.apiKey) setApiKey(settings.apiKey);
      }
    } catch { /* ignore */ }
  }, []);

  const saveSettings = useCallback((provider: string, model: string, key: string) => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ provider, model, apiKey: key })); } catch { /* ignore */ }
  }, []);

  const providerModels = getProviderModels(selectedProvider);
  const currentProvider = AI_PROVIDERS[selectedProvider];
  const currentModel = providerModels.find(m => m.id === selectedModel) || providerModels[0];

  const clearMessages = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setMessages([]); setExpandedData(null); setStreaming(false);
    setThinking(false); setStreamingToolCalls([]); setIsLoading(false);
    clearStoredMessages();
    toast.success('聊天记录已清除');
  }, []);

  // Server-side conversation save/load
  const saveToServer = useCallback(async () => {
    if (messages.length === 0) { toast.error('无对话可保存'); return; }
    try {
      const title = messages.find(m => m.role === 'user')?.content.slice(0, 30) || '新对话';
      const res = await fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })) }),
      });
      if (res.ok) toast.success('对话已保存到服务器');
    } catch { toast.error('保存失败'); }
  }, [messages]);

  const loadFromServer = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/chat-history?id=' + id);
      if (!res.ok) { toast.error('加载失败'); return; }
      const conv = await res.json();
      setMessages(conv.messages.slice(-20));
      saveMessages(conv.messages.slice(-20));
      setShowConvList(false);
      toast.success('对话已加载');
    } catch { toast.error('加载失败'); }
  }, []);

  const loadConvList = useCallback(async () => {
    try {
      const res = await fetch('/api/chat-history');
      const list = await res.json();
      setConvList(list);
      setShowConvList(true);
    } catch { toast.error('获取列表失败'); }
  }, []);

  // File upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    if (isImage) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      setMessages(prev => [...prev, {
        id: `file-${Date.now()}`, role: 'user',
        content: `📷 ${file.name}\n![上传图片](${dataUrl})`,
        timestamp: new Date().toISOString(),
      }]);
    } else if (isPdf) {
      setMessages(prev => [...prev, {
        id: `file-${Date.now()}`, role: 'user',
        content: `📄 ${file.name} (${(file.size / 1024).toFixed(0)}KB)\n_PDF文件已上传。_`,
        timestamp: new Date().toISOString(),
      }]);
    } else {
      const text = await file.text();
      const preview = text.slice(0, 800) + (text.length > 800 ? `\n... (${text.length} 字符)` : '');
      setMessages(prev => [...prev, {
        id: `file-${Date.now()}`, role: 'user',
        content: `📎 ${file.name} (${(file.size / 1024).toFixed(0)}KB)\n\`\`\`\n${preview}\n\`\`\``,
        timestamp: new Date().toISOString(),
      }]);
    }
    e.target.value = '';
  }, []);

  // Export
  const exportMarkdown = useCallback(() => {
    const md = messages.map(m => `### ${m.role === 'user' ? '🧑' : '🤖'} (${m.timestamp.slice(11, 19)})\n\n${m.content}\n`).join('\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `chat-${new Date().toISOString().slice(0, 10)}.md`; a.click();
    toast.success('Markdown 已导出');
  }, [messages]);

  const exportPdf = useCallback(() => {
    const html = messages.map(m =>
      `<div style="margin-bottom:20px;font-family:sans-serif">
        <h3 style="color:${m.role==='user'?'#3b82f6':'#f97316'}">${m.role==='user'?'🧑 你':'🤖 供应链助手'} (${m.timestamp.slice(11,19)})</h3>
        <div style="white-space:pre-wrap;line-height:1.6">${m.content.replace(/\n/g,'<br>')}</div>
      </div><hr>`
    ).join('');
    const w = window.open('', '_blank', 'width=800,height=600');
    if (w) { w.document.write(`<html><head><title>供应链分析报告</title><meta charset="utf-8"></head><body>${html}</body></html>`); w.document.close(); setTimeout(() => w.print(), 500); }
    toast.success('PDF 导出已打开打印窗口');
  }, [messages]);

  // Send message with SSE streaming
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`, role: 'user', content: text.trim(),
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages); setInput(''); setIsLoading(true);
    setStreaming(true); setThinking(false); setStreamingToolCalls([]);
    const historyMessages = messages.slice(-10).map(msg => ({ role: msg.role, content: msg.content }));
    const abortController = new AbortController();
    abortRef.current = abortController;
    const assistantMsgId = `msg-${Date.now()}-ai`;
    const assistantMessage: ChatMessage = {
      id: assistantMsgId, role: 'assistant', content: '',
      toolsUsed: [], data: {}, model: selectedModel,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), stream: true, history: historyMessages, provider: selectedProvider, model: selectedModel, apiKey: apiKey || undefined, currency: dashConfig.currency, timeHorizon: dashConfig.timeHorizon, ...(webSearchEnabled !== undefined ? { webSearch: webSearchEnabled } : {}) }),
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) throw new Error('Streaming not available');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const sseBuffer = { value: '' };
      let accumulatedContent = '';
      const toolsUsedSet: string[] = [];
      const toolResults: Record<string, unknown> = {};
      const thinkingSteps: Array<{ status: string; tool?: string; timestamp?: string }> = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const events = parseSSEChunk(chunk, sseBuffer);
        for (const sseEvent of events) {
          switch (sseEvent.event) {
            case 'thinking': {
              setThinking(true);
              const thinkStatus = sseEvent.data.status as string || 'thinking';
              thinkingSteps.push({ status: thinkStatus, timestamp: new Date().toISOString() });
              break;
            }
            case 'tool_call': {
              setThinking(false);
              const toolName = sseEvent.data.tool as string;
              thinkingSteps.push({ status: 'tool_call', tool: toolName, timestamp: new Date().toISOString() });
              if (toolName && !toolsUsedSet.includes(toolName)) { toolsUsedSet.push(toolName); setStreamingToolCalls([...toolsUsedSet]); }
              break;
            }
            case 'tool_result': {
              const toolName = sseEvent.data.tool as string;
              thinkingSteps.push({ status: 'tool_result', tool: toolName, timestamp: new Date().toISOString() });
              if (toolName) toolResults[toolName] = sseEvent.data.result;
              break;
            }
            case 'token': {
              setThinking(false);
              const tokenContent = sseEvent.data.content as string;
              if (tokenContent) {
                accumulatedContent += tokenContent;
                const currentContent = accumulatedContent;
                setMessages(prev => prev.map(msg => msg.id === assistantMsgId ? { ...msg, content: currentContent } : msg));
              }
              break;
            }
            case 'confirm_required': {
              const confirmCard = sseEvent.data.confirmationCard as ConfirmationCardData;
              if (confirmCard) {
                setConfirmationCards(prev => ({
                  ...prev,
                  [assistantMsgId]: [...(prev[assistantMsgId] || []), confirmCard],
                }));
              }
              break;
            }
            case 'done': {
              const finalToolsUsed = sseEvent.data.toolsUsed as string[] || toolsUsedSet;
              const passport = sseEvent.data.passport as Record<string, unknown> | undefined;
              setMessages(prev => prev.map(msg => msg.id === assistantMsgId ? {
                ...msg,
                content: accumulatedContent || '查询完成，但未能生成回复。',
                toolsUsed: finalToolsUsed,
                data: Object.keys(toolResults).length > 0 ? toolResults : undefined,
                thinkingSteps,
                durationMs: sseEvent.data.durationMs as number,
                steps: sseEvent.data.steps as number,
                tier: sseEvent.data.tier as number,
                mode: sseEvent.data.mode as string,
              } : msg));
              if (passport) {
                setPassports(prev => ({ ...prev, [assistantMsgId]: passport }));
              }
              break;
            }
            case 'error': {
              const errMsg = sseEvent.data.message as string || '服务端处理异常';
              setMessages(prev => prev.map(msg => msg.id === assistantMsgId ? { ...msg, content: `⚠️ ${errMsg}` } : msg));
              break;
            }
          }
        }
      }
    } catch (streamError) {
      if (abortController.signal.aborted) return;
      console.warn('SSE streaming failed, falling back to non-streaming:', streamError);
      try {
        const fallbackResponse = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text.trim(), history: historyMessages, provider: selectedProvider, model: selectedModel, apiKey: apiKey || undefined, currency: dashConfig.currency, timeHorizon: dashConfig.timeHorizon, ...(webSearchEnabled !== undefined ? { webSearch: webSearchEnabled } : {}) }),
        });
        const result = await fallbackResponse.json();
        if (result.success && result.data) {
          setMessages(prev => prev.map(msg => msg.id === assistantMsgId ? {
            ...msg,
            content: result.data.reply || '查询完成，但未能生成回复。',
            toolsUsed: result.data.toolsUsed || [],
            data: result.data.data,
            durationMs: result.data.durationMs as number,
            steps: result.data.steps as number,
            tier: result.data.tier as number,
            mode: result.data.mode as string,
          } : msg));
        } else {
          setMessages(prev => prev.map(msg => msg.id === assistantMsgId ? { ...msg, content: result.error || '抱歉，查询时发生了错误。' } : msg));
        }
      } catch {
        setMessages(prev => prev.map(msg => msg.id === assistantMsgId ? { ...msg, content: '网络连接异常，请检查网络后重试。' } : msg));
      }
    } finally {
      setIsLoading(false); setStreaming(false); setThinking(false);
      setStreamingToolCalls([]); abortRef.current = null;
    }
  }, [isLoading, messages, selectedModel, selectedProvider, apiKey, webSearchEnabled]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };
  const handleQuickAction = (message: string) => { sendMessage(message); };
  const toggleDataExpand = (msgId: string) => { setExpandedData(prev => prev === msgId ? null : msgId); };

  // Generate context-aware follow-up questions
  const generateFollowUps = (content: string): string[] => {
    const suggestions: string[] = [];
    const lower = content.toLowerCase();
    const productMatch = content.match(/(便携榨汁[杯机]|智能加湿[器壶]|无线吸尘[器机]|智能电热[水壶]|便携咖啡[机壶]|空气净化[器机]|负离子吹风[机筒])/g) || [];
    const mentionedProduct = productMatch.length > 0 && productMatch[0] ? productMatch[0] : null;
    if (lower.includes('补货') || lower.includes('缺货') || lower.includes('库存不足')) {
      if (mentionedProduct) suggestions.push(`立即为${mentionedProduct}创建补货订单`);
      suggestions.push('空运补货5000台的到岸成本是多少？');
    }
    if (lower.includes('关税') || lower.includes('tariff') || lower.includes('贸易战')) {
      suggestions.push('模拟关税从25%降到10%对全部SKU的利润影响');
    }
    if (lower.includes('供应商') || lower.includes('supplier') || lower.includes('1688')) {
      suggestions.push('帮我在1688找备选供应商');
    }
    if (lower.includes('合规') || lower.includes('认证') || lower.includes('fcc') || lower.includes('ce')) {
      suggestions.push('检查这个产品出口美国需要的全部认证和费用');
    }
    if (lower.includes('物流') || lower.includes('货运') || lower.includes('港口') || lower.includes('延误')) {
      suggestions.push('查当前所有延误货运的详细状态');
    }
    if (lower.includes('召回') || lower.includes('recall') || lower.includes('安全')) {
      suggestions.push('查一下这个品类的CPSC召回历史');
    }
    if (suggestions.length === 0) {
      if (lower.includes('毛利') || lower.includes('成本') || lower.includes('利润')) suggestions.push('跑一下财务模拟看看降本空间');
      suggestions.push('做一次全面的供应链一致性审计');
    }
    return suggestions.slice(0, 3);
  };

  const handleClaimVerdict = useCallback(async (msgId: string, claims: ClaimData[], claimId: string, verdict: ClaimVerdict) => {
    setFeedbackMap(prev => ({ ...prev, [claimId]: verdict }));
    const updatedClaims = claims.map(c => ({
      claimId: c.id, claimText: c.text, citedSource: c.source,
      statedConfidence: c.confidence,
      verdict: c.id === claimId ? verdict : (feedbackMap[c.id] || 'unverified' as ClaimVerdict),
    }));
    try {
      await fetch('/api/engine-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditId: `chat-${msgId}`, engine: 'chat-agent',
          action: verdict === 'accurate' ? 'accepted' : 'modified',
          claims: updatedClaims,
        }),
      });
    } catch { /* non-blocking */ }
  }, [feedbackMap]);

  // ─── Keyboard shortcut: Escape to close drawer ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) setIsOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* FAB Button — hidden when drawer is open */}
      <Button
        onClick={() => setIsOpen(true)}
        className={`fixed z-50 h-14 w-14 rounded-full shadow-lg bg-gradient-to-br from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white transition-all duration-300 hover:scale-110 hover:shadow-xl group ${isOpen ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100 scale-100'}`}
        style={{ right: '1.25rem', bottom: '1.25rem' }}
        size="icon"
        aria-label="打开供应链 AI 助手"
      >
        <MessageSquare className="h-6 w-6 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-400 animate-pulse border-2 border-white" />
      </Button>

      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Right drawer — slides in/out from right, resizable */}
      <div
        className={`fixed top-0 right-0 z-50 h-full flex flex-col bg-background dark:bg-card shadow-2xl border-l border-border transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: `min(${drawerWidth}px, 100vw)` }}
      >
        {/* Resize handle — left edge */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-w-resize z-20 hover:bg-orange-500/30 hover:w-1.5 transition-colors select-none"
          style={{ marginLeft: '-2px' }}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onLostPointerCapture={onResizeEnd}
        />
        {/* ─── Header ─── */}
        <div className="shrink-0 p-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">供应链 AI 助手</p>
                <p className="text-[10px] text-white/80">SupplyChain Cortex · AI 决策助手</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Model selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-white/90 hover:text-white hover:bg-white/20 text-xs">
                    <span>{currentModel?.icon || '🤖'}</span>
                    <span className="hidden sm:inline">{currentModel?.name || selectedModel}</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto">
                  <div className="px-2 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">提供商</div>
                  {Object.values(AI_PROVIDERS).map((prov) => (
                    <DropdownMenuItem key={prov.id} onClick={() => { setSelectedProvider(prov.id); const dm = getDefaultModel(prov.id); setSelectedModel(dm); saveSettings(prov.id, dm, apiKey); }} className="flex items-center gap-2 p-2 cursor-pointer">
                      <Globe className="h-3.5 w-3.5" /><span className="flex-1 text-sm">{prov.name}</span>
                      {selectedProvider === prov.id && <Check className="h-3 w-3 text-orange-500" />}
                    </DropdownMenuItem>
                  ))}
                  <div className="border-t my-1" />
                  <div className="px-2 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">模型</div>
                  {providerModels.map((model) => (
                    <DropdownMenuItem key={model.id} onClick={() => { setSelectedModel(model.id); saveSettings(selectedProvider, model.id, apiKey); }} className="flex items-start gap-2 p-2 cursor-pointer">
                      <span className="text-sm">{model.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2"><span className="font-medium text-sm">{model.name}</span>
                          {selectedModel === model.id && <Check className="h-3 w-3 text-orange-500" />}</div>
                        <p className="text-xs text-muted-foreground">{model.description}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Web search toggle */}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-7 w-7 text-white/80 hover:text-white hover:bg-white/20 ${webSearchEnabled === true ? 'bg-green-500/30 text-green-400' : webSearchEnabled === false ? 'bg-red-500/20 text-red-300' : ''}`}
                  onClick={() => { const next = webSearchEnabled === undefined ? true : webSearchEnabled === true ? false : undefined; setWebSearchEnabled(next); }}
                  aria-label="联网搜索"><Globe className="h-3.5 w-3.5" /></Button>
              </TooltipTrigger><TooltipContent side="bottom" className="text-xs">{webSearchEnabled === true ? '搜索: 开' : webSearchEnabled === false ? '搜索: 关' : '搜索: 自动'}</TooltipContent></Tooltip>

              {/* Settings */}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-7 w-7 text-white/80 hover:text-white hover:bg-white/20 ${showSettings ? 'bg-white/20' : ''}`}
                  onClick={() => setShowSettings(!showSettings)} aria-label="设置"><Settings className="h-3.5 w-3.5" /></Button>
              </TooltipTrigger><TooltipContent side="bottom" className="text-xs">API 设置</TooltipContent></Tooltip>

              {/* More actions */}
              <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt,.json,.pdf,.png,.jpg,.jpeg,.gif,.webp" onChange={handleFileUpload} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20" aria-label="更多操作"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="text-xs gap-2 cursor-pointer"><Paperclip className="h-3.5 w-3.5" />上传文件</DropdownMenuItem>
                  {messages.length > 0 && (
                    <>
                      <DropdownMenuItem onClick={exportMarkdown} className="text-xs gap-2 cursor-pointer"><FileDown className="h-3.5 w-3.5" />导出 Markdown</DropdownMenuItem>
                      <DropdownMenuItem onClick={exportPdf} className="text-xs gap-2 cursor-pointer"><FileText className="h-3.5 w-3.5" />导出 PDF 报告</DropdownMenuItem>
                      <DropdownMenuItem onClick={saveToServer} className="text-xs gap-2 cursor-pointer"><HardDrive className="h-3.5 w-3.5" />保存到服务器</DropdownMenuItem>
                      <DropdownMenuItem onClick={loadConvList} className="text-xs gap-2 cursor-pointer"><FolderOpen className="h-3.5 w-3.5" />加载历史对话</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={clearMessages} className="text-xs gap-2 cursor-pointer text-red-500"><Trash2 className="h-3.5 w-3.5" />清除聊天记录</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Collapse drawer */}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20" onClick={() => setIsOpen(false)} aria-label="收起面板">
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* ─── Settings Panel ─── */}
        {showSettings && (
          <div className="shrink-0 px-4 py-3 border-b bg-muted/30 space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Key className="h-3.5 w-3.5" /> API 设置</div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">AI 提供商</label>
              <div className="flex gap-1 flex-wrap">
                {Object.values(AI_PROVIDERS).map((prov) => (
                  <Button key={prov.id} variant={selectedProvider === prov.id ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
                    onClick={() => { setSelectedProvider(prov.id); const dm = getDefaultModel(prov.id); setSelectedModel(dm); saveSettings(prov.id, dm, apiKey); }}>{prov.name}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">API Key ({currentProvider?.envKeyName || 'DEEPSEEK_API_KEY'})</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => { setApiKey(e.target.value); saveSettings(selectedProvider, selectedModel, e.target.value); }} placeholder={`输入 ${currentProvider?.name || 'DeepSeek'} API Key...`} className="h-8 text-xs font-mono pr-8" />
                  <button type="button" onClick={() => setShowApiKey(v => !v)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}>
                    {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" disabled={!apiKey || testingConnection}
                  onClick={async () => { setTestingConnection(true); try { const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '你好', stream: false, provider: selectedProvider, model: selectedModel, apiKey }) }); const data = await res.json(); if (data.success) toast.success('连接测试成功'); else toast.error(`连接失败: ${data.error || '未知错误'}`); } catch { toast.error('连接测试失败'); } setTestingConnection(false); }}>
                  {testingConnection ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}<span className="ml-1 hidden sm:inline">测试</span></Button>
              </div>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />API Key 存储在浏览器本地，请勿在公共电脑上使用
              </p>
            </div>
            {selectedProvider === 'local' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-muted-foreground">Ollama 地址: {currentProvider?.baseURL || 'http://localhost:11434/v1'}</label>
                  <Button variant="outline" size="sm" className={`h-6 text-[10px] gap-1 ${ollamaStatus === 'error' ? 'border-amber-500' : ollamaStatus === 'found' ? 'border-green-500' : ''}`} disabled={scanningOllama} onClick={scanOllama}>
                    {scanningOllama ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}扫描模型</Button>
                </div>
                {ollamaModels.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {ollamaModels.map((m) => (
                      <button key={m.name} onClick={() => { setSelectedModel(m.name); saveSettings(selectedProvider, m.name, apiKey); }}
                        className={`w-full flex items-center gap-2 p-1.5 rounded text-xs transition-colors ${selectedModel === m.name ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'}`}>
                        <Cpu className="h-3 w-3 shrink-0 text-muted-foreground" /><span className="flex-1 text-left truncate font-medium">{m.name}</span><span className="text-[10px] text-muted-foreground shrink-0">{fmtBytes(m.size)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Messages Area (flex-1 to fill available space) ─── */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-950/30 dark:to-rose-950/30 flex items-center justify-center mx-auto mb-3">
                <Bot className="h-6 w-6 text-orange-500 dark:text-orange-400" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">你好！我是供应链助手</p>
              <p className="text-xs text-muted-foreground mb-4">我可以帮你查询库存、成本、销售、物流等数据</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.slice(0, 6).map((action) => (
                  <Button key={action.label} variant="outline" size="sm" className="text-xs h-8 justify-start" onClick={() => handleQuickAction(action.message)}>{action.label}</Button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`group flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-950/30 dark:to-rose-950/30 flex items-center justify-center shrink-0 mt-1"><Bot className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" /></div>
                )}
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                  <div className="flex items-end gap-1">
                    <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-br-md' : 'bg-muted dark:bg-muted/80 text-foreground rounded-bl-md'}`}>
                      {msg.content ? renderMarkdown(msg.content) : null}
                      {streaming && msg.id.endsWith('-ai') && msg.role === 'assistant' && (<span className="inline-block w-1.5 h-4 bg-orange-500 dark:bg-orange-400 animate-pulse ml-0.5 align-middle rounded-sm" />)}
                    </div>
                    {msg.content && !(streaming && msg.id.endsWith('-ai')) && <CopyButton text={msg.content} />}
                  </div>
                  {/* Claims */}
                  {msg.role === 'assistant' && msg.content && !(streaming && msg.id.endsWith('-ai')) && (() => {
                    const claims = parseClaimsFromText(msg.content);
                    if (claims.length === 0) return null;
                    return (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-muted-foreground mb-1">📌 分析声明 (点击标注准确性):</p>
                        <div className="flex flex-wrap gap-1">
                          {claims.map(claim => (
                            <ClaimLabel key={`${msg.id}-${claim.id}`} claim={{ ...claim, verdict: feedbackMap[claim.id] }} onVerdict={(claimId, verdict) => handleClaimVerdict(msg.id, claims, claimId, verdict)} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Confirmation cards */}
                  {msg.role === 'assistant' && confirmationCards[msg.id] && confirmationCards[msg.id].length > 0 && (
                    <div className="mt-2 space-y-2">
                      <p className="text-[10px] text-muted-foreground">🛡️ 待确认操作:</p>
                      {confirmationCards[msg.id].map((card, i) => (<ActionCard key={`${msg.id}-action-${i}`} card={card} msgId={msg.id} />))}
                    </div>
                  )}
                  {/* Passport */}
                  {msg.role === 'assistant' && passports[msg.id] && (() => {
                    const passport = passports[msg.id];
                    const isExpanded = expandedPassports[msg.id];
                    return (
                      <div className="mt-1">
                        <button onClick={() => setExpandedPassports(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))} className="text-[10px] text-muted-foreground hover:text-orange-500 transition-colors flex items-center gap-1">
                          <Shield className="h-3 w-3" />Passport · 置信度 {((passport.confidence as number) * 100).toFixed(0)}% · audit: {(passport.auditId as string)?.slice(-8)}
                        </button>
                        {isExpanded && (
                          <Card className="mt-1 border-dashed"><CardContent className="p-2 text-[10px] space-y-1">
                            <div className="flex items-center gap-2"><span className="text-muted-foreground">Audit ID:</span><span className="font-mono">{passport.auditId as string}</span></div>
                            <div className="flex items-center gap-2"><span className="text-muted-foreground">Time:</span><span>{passport.generatedAt as string}</span></div>
                            <div><span className="text-muted-foreground">Provenance:</span>
                              <div className="flex flex-wrap gap-1 mt-0.5">{((passport.dataProvenance as Array<{ source: string; status: string }>) || []).map((p, i) => (
                                <Badge key={i} variant="secondary" className={`text-[9px] h-4 ${p.status === 'ok' ? 'bg-emerald-50 text-emerald-600' : p.status === 'degraded' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>{p.source} · {p.status}</Badge>
                              ))}</div>
                            </div>
                          </CardContent></Card>
                        )}
                      </div>
                    );
                  })()}
                  {/* Thinking Process — collapsible header */}
                  {msg.role === 'assistant' && !(streaming && msg.id.endsWith('-ai')) && (msg.durationMs || msg.thinkingSteps?.length || msg.tier != null) && (() => {
                    const isExpanded = expandedPassports[`think-${msg.id}`];
                    const toggle = () => setExpandedPassports(prev => ({ ...prev, [`think-${msg.id}`]: !prev[`think-${msg.id}`] }));
                    const duration = msg.durationMs ? `${(msg.durationMs / 1000).toFixed(1)}s` : '';
                    const tierLabel = msg.tier != null ? `Tier ${msg.tier}` : '';
                    const toolCount = msg.toolsUsed?.length ? `${msg.toolsUsed.length}个工具` : '';
                    const modeLabel = msg.mode ? (msg.mode === 'react' ? 'ReAct' : msg.mode) : '';
                    const meta = [duration, toolCount, tierLabel, modeLabel].filter(Boolean).join(' · ');
                    const steps = msg.thinkingSteps || [];
                    return (
                      <div className="mt-1">
                        <button onClick={toggle} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors group w-full">
                          <Brain className="h-3 w-3 text-purple-500" />
                          <span className="font-medium">思考过程</span>
                          <span className="tabular-nums">{meta}</span>
                          <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isExpanded && (
                          <div className="mt-1.5 p-2 rounded-md bg-muted/30 border text-[10px] space-y-1 max-h-48 overflow-y-auto">
                            {steps.length > 0 ? steps.map((s, i) => {
                              const time = s.timestamp ? new Date(s.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                              if (s.status === 'tool_call') return (
                                <div key={i} className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                                  <Wrench className="h-2.5 w-2.5 shrink-0" />
                                  <span className="text-muted-foreground">{time}</span>
                                  <span>调用 {TOOL_LABELS[s.tool || ''] || s.tool || '工具'}</span>
                                </div>
                              );
                              if (s.status === 'tool_result') return (
                                <div key={i} className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                  <Check className="h-2.5 w-2.5 shrink-0" />
                                  <span className="text-muted-foreground">{time}</span>
                                  <span>{TOOL_LABELS[s.tool || ''] || s.tool} 完成</span>
                                </div>
                              );
                              return (
                                <div key={i} className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                                  <CircleDot className="h-2.5 w-2.5 shrink-0" />
                                  <span className="text-muted-foreground">{time}</span>
                                  <span>{s.status === 'context' ? '分析上下文' : s.status === 'analyzing' ? '分析中...' : s.status}</span>
                                </div>
                              );
                            }) : (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <CircleDot className="h-2.5 w-2.5" />
                                <span>耗时 {duration} · {msg.steps || 0}步完成</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* Tool calls */}
                  {msg.role === 'assistant' && (() => {
                    const isCurrentlyStreaming = streaming && msg.id.endsWith('-ai');
                    const toolsToShow = isCurrentlyStreaming ? streamingToolCalls : (msg.toolsUsed || []);
                    if (toolsToShow.length === 0) return null;
                    return (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {Array.from(new Set(toolsToShow)).map((tool, i) => (
                          <Badge key={`${tool}-${i}`} variant="secondary" className="text-[10px] h-5 gap-1 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300 border-orange-200 dark:border-orange-800">
                            {isCurrentlyStreaming ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : TOOL_ICONS[tool]}{TOOL_LABELS[tool] || tool}
                          </Badge>
                        ))}
                        {!isCurrentlyStreaming && msg.data && (
                          <button onClick={() => toggleDataExpand(msg.id)} className="text-[10px] text-muted-foreground hover:text-orange-500 transition-colors ml-1"><ChevronDown className={`h-3 w-3 inline transition-transform ${expandedData === msg.id ? 'rotate-180' : ''}`} /> 数据</button>
                        )}
                      </div>
                    );
                  })()}
                  {expandedData === msg.id && msg.data && (
                    <Card className="mt-2 text-xs border-dashed"><CardContent className="p-2 max-h-40 overflow-y-auto"><pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all">{JSON.stringify(msg.data, null, 2).substring(0, 2000)}</pre></CardContent></Card>
                  )}
                  {/* Regenerate */}
                  {msg.role === 'assistant' && msg.content && !streaming && msg.id === messages[messages.length - 1]?.id && (
                    <button onClick={() => { const lastUserMsg = [...messages].reverse().find(m => m.role === 'user'); if (lastUserMsg) { setMessages(prev => prev.slice(0, -1)); sendMessage(lastUserMsg.content); } }} className="text-[10px] text-muted-foreground hover:text-orange-500 mt-1 flex items-center gap-1"><RotateCcw className="h-3 w-3" /> 重新生成</button>
                  )}
                  {/* Follow-ups */}
                  {msg.role === 'assistant' && msg.content && !streaming && msg.id === messages[messages.length - 1]?.id && messages.length > 0 && (() => {
                    const suggestions = generateFollowUps(msg.content);
                    if (suggestions.length === 0) return null;
                    return (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {suggestions.map((q, i) => (
                          <button key={i} onClick={() => sendMessage(q)} className="text-[10px] px-2 py-1 rounded-full border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors">{q}</button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                {msg.role === 'user' && (
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-950/30 dark:to-cyan-950/30 flex items-center justify-center shrink-0 mt-1"><User className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" /></div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && <TypingIndicator thinking={thinking} />}
          </div>
        </div>

        {/* ─── Conversation list popup ─── */}
        {showConvList && (
          <div className="absolute bottom-20 left-4 z-50 bg-card border rounded-lg shadow-lg p-2 w-56 max-h-48 overflow-y-auto">
            <div className="text-[10px] text-muted-foreground mb-1 px-1">已保存的对话</div>
            {convList.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1 py-2">暂无</div>
            ) : convList.map(c => (
              <button key={c.id} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/50 flex justify-between" onClick={() => loadFromServer(c.id)}>
                <span className="truncate">{c.title}</span><span className="text-muted-foreground shrink-0">{c.messageCount}条</span>
              </button>
            ))}
            <button className="w-full text-center text-[10px] text-muted-foreground mt-1 hover:text-foreground" onClick={() => setShowConvList(false)}>关闭</button>
          </div>
        )}

        {/* ─── Quick actions bar (when messages exist) ─── */}
        {messages.length > 0 && !isLoading && (
          <div className="shrink-0 px-3 pb-1 flex gap-1 overflow-x-auto border-t border-border/50 pt-2">
            {QUICK_ACTIONS.slice(0, 6).map((a) => (
              <Button key={a.label} variant="ghost" size="sm" className="text-[10px] h-6 px-2 shrink-0" onClick={() => handleQuickAction(a.message)}>{a.label}</Button>
            ))}
          </div>
        )}

        {/* ─── Input Area (fixed at bottom) ─── */}
        <div className="shrink-0 p-3 border-t bg-background dark:bg-card border-border">
          {(tokenUsage.input > 0) && (
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1 px-1">
              <span>📊 输入 ~{tokenUsage.input.toLocaleString()}tk · 输出 ~{tokenUsage.output.toLocaleString()}tk</span>
              <span>≈ ¥{((tokenUsage.input * 0.002 + tokenUsage.output * 0.008) / 1000).toFixed(3)}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Tooltip><TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-orange-500 shrink-0" onClick={() => fileInputRef.current?.click()} aria-label="上传文件"><Paperclip className="h-4 w-4" /></Button>
            </TooltipTrigger><TooltipContent side="top" className="text-xs">上传 CSV/TXT/JSON</TooltipContent></Tooltip>
            <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="输入问题... (Enter发送)"
              className="flex-1 h-9 text-sm rounded-full border-orange-200 focus-visible:ring-orange-300 dark:border-orange-800" disabled={isLoading} maxLength={2000} />
            {isLoading ? (
              <Button type="button" size="icon" className="h-9 w-9 rounded-full bg-red-500 hover:bg-red-600 text-white shrink-0" onClick={() => { abortRef.current?.abort(); setIsLoading(false); setStreaming(false); }}><Square className="h-4 w-4" /></Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} className="h-9 w-9 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white shrink-0"><Send className="h-4 w-4" /></Button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
