'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare, X, Send, Bot, User, Sparkles, ChevronDown,
  Package, DollarSign, TrendingUp, Ship, Building2, Shield, BarChart3,
  Trash2, StickyNote, AlertTriangle, Settings, Key, Globe, Cpu,
  Download, Upload,
  Wifi, GripVertical, RefreshCw, Play, CircleDot, Loader2, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { AI_PROVIDERS, getProviderModels, getDefaultModel, type AIModel } from '@/lib/services/ai-providers.service';
import {
  ChatMessage, OllamaModel,
  STORAGE_KEY, SETTINGS_KEY,
  TOOL_ICONS, TOOL_LABELS, QUICK_ACTIONS,
  loadMessages, saveMessages, clearStoredMessages,
  useDraggable, useResizable,
  formatTimestamp, parseSSEChunk,
  renderMarkdown, CopyButton, TypingIndicator,
  fetchOllamaModels, fmtBytes,
} from './ChatPanel.helpers';

// ─── ChatPanel Component ──────────────────────────────────────────────────────

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
  const [showSettings, setShowSettings] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [scanningOllama, setScanningOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'scanning' | 'found' | 'error'>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Drag hooks for entry button and panel
  const entryDrag = useDraggable('chat-entry-pos', 0, 0);
  const panelDrag = useDraggable('chat-panel-pos', 0, 0);

  // Resize hook for panel
  const panelResize = useResizable('chat-panel-size', 380, 500);

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

  // Auto-scan Ollama when local provider selected
  useEffect(() => {
    if (selectedProvider === 'local' && ollamaModels.length === 0 && ollamaStatus === 'idle') {
      scanOllama();
    }
  }, [selectedProvider, ollamaModels.length, ollamaStatus, scanOllama]);

  // Load messages from localStorage on mount
  useEffect(() => {
    const stored = loadMessages();
    if (stored.length > 0) setMessages(stored);
    setHydrated(true);
  }, []);

  // Save messages to localStorage (after hydration)
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
    if (isOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  // Cleanup abort controller on unmount
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

  // Save settings
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
  const [convList, setConvList] = useState<Array<{ id: string; title: string; messageCount: number }>>([]);
  const [showConvList, setShowConvList] = useState(false);

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
        body: JSON.stringify({ message: text.trim(), stream: true, history: historyMessages, provider: selectedProvider, model: selectedModel, apiKey: apiKey || undefined }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) throw new Error('Streaming not available');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const sseBuffer = { value: '' };
      let accumulatedContent = '';
      const toolsUsedSet: string[] = [];
      const toolResults: Record<string, unknown> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const events = parseSSEChunk(chunk, sseBuffer);

        for (const sseEvent of events) {
          switch (sseEvent.event) {
            case 'thinking': setThinking(true); break;
            case 'tool_call': {
              setThinking(false);
              const toolName = sseEvent.data.tool as string;
              if (toolName && !toolsUsedSet.includes(toolName)) { toolsUsedSet.push(toolName); setStreamingToolCalls([...toolsUsedSet]); }
              break;
            }
            case 'tool_result': {
              const toolName = sseEvent.data.tool as string;
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
            case 'done': {
              const finalToolsUsed = sseEvent.data.toolsUsed as string[] || toolsUsedSet;
              setMessages(prev => prev.map(msg => msg.id === assistantMsgId ? { ...msg, content: accumulatedContent || '查询完成，但未能生成回复。', toolsUsed: finalToolsUsed, data: Object.keys(toolResults).length > 0 ? toolResults : undefined } : msg));
              break;
            }
          }
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) return;
      if (process.env.NODE_ENV === 'development') console.warn('SSE streaming failed, falling back:', error);
      try {
        const fallbackResponse = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text.trim(), history: historyMessages, provider: selectedProvider, model: selectedModel, apiKey: apiKey || undefined }),
        });
        const result = await fallbackResponse.json();
        if (result.success && result.data) {
          setMessages(prev => prev.map(msg => msg.id === assistantMsgId ? { ...msg, content: result.data.reply || '查询完成，但未能生成回复。', toolsUsed: result.data.toolsUsed || [], data: result.data.data } : msg));
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
  }, [isLoading, messages, selectedModel, selectedProvider, apiKey]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };
  const handleQuickAction = (message: string) => { sendMessage(message); };
  const toggleDataExpand = (msgId: string) => { setExpandedData(prev => prev === msgId ? null : msgId); };

  // ─── Render: Floating Entry Button ──────────────────────────────────────────

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        onPointerDown={entryDrag.onDown} onPointerMove={entryDrag.onMove} onPointerUp={entryDrag.onUp}
        className="fixed z-50 h-12 w-12 sm:h-14 sm:w-14 rounded-full shadow-lg bg-gradient-to-br from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white transition-all duration-300 hover:scale-110 hover:shadow-xl group cursor-grab active:cursor-grabbing touch-none select-none"
        style={{ right: `calc(1rem - ${entryDrag.pos.x}px)`, bottom: `calc(1rem - ${entryDrag.pos.y}px)` }}
        size="icon" aria-label="打开供应链助手"
      >
        <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 group-hover:scale-110 transition-transform pointer-events-none" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-400 animate-pulse border-2 border-white" />
      </Button>
    );
  }

  // ─── Render: Chat Panel ────────────────────────────────────────────────────

  return (
    <div className="fixed z-50" style={{ right: `calc(0.5rem - ${panelDrag.pos.x}px)`, bottom: `calc(0.5rem - ${panelDrag.pos.y}px)`, width: `${panelResize.size.w}px`, maxWidth: 'calc(100vw - 48px)' }}>
      <Card className="relative shadow-2xl border-0 sm:border overflow-hidden bg-background dark:bg-card rounded-none sm:rounded-lg">
        {/* Resize handles */}
        <div className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize z-10 hover:bg-primary/10 transition-colors" onPointerDown={panelResize.onResizeDown('left')} onPointerMove={panelResize.onResizeMove} onPointerUp={panelResize.onResizeUp} />
        <div className="absolute top-0 left-0 right-0 h-2 cursor-n-resize z-10 hover:bg-primary/10 transition-colors" onPointerDown={panelResize.onResizeDown('top')} onPointerMove={panelResize.onResizeMove} onPointerUp={panelResize.onResizeUp} />
        <div className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-20 hover:bg-primary/20 rounded-br transition-colors" onPointerDown={panelResize.onResizeDown('top-left')} onPointerMove={panelResize.onResizeMove} onPointerUp={panelResize.onResizeUp} />
        <div className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize z-10 hover:bg-primary/10 transition-colors" onPointerDown={panelResize.onResizeDown('bottom')} onPointerMove={panelResize.onResizeMove} onPointerUp={panelResize.onResizeUp} />

        {/* Header */}
        <CardHeader className="p-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white cursor-grab active:cursor-grabbing touch-none select-none" onPointerDown={panelDrag.onDown} onPointerMove={panelDrag.onMove} onPointerUp={panelDrag.onUp}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 opacity-50 shrink-0" />
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center"><Sparkles className="h-4 w-4" /></div>
              <div>
                <CardTitle className="text-sm font-semibold">供应链 AI 助手</CardTitle>
                <p className="text-[10px] text-white/80">SupplyChain Cortex · AI 决策助手</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-7 w-7 text-white/80 hover:text-white hover:bg-white/20 ${showSettings ? 'bg-white/20' : ''}`} onClick={() => setShowSettings(!showSettings)} aria-label="设置"><Settings className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="bottom" className="text-xs">API 设置</TooltipContent></Tooltip>
              {messages.length > 0 && (
                <>
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20" onClick={saveToServer} aria-label="保存对话"><Download className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="bottom" className="text-xs">保存到服务器</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20" onClick={loadConvList} aria-label="加载对话"><Upload className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="bottom" className="text-xs">加载历史对话</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20" onClick={clearMessages} aria-label="清除历史"><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="bottom" className="text-xs">清除历史</TooltipContent></Tooltip>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20" onClick={() => setIsOpen(false)} aria-label="关闭聊天面板"><X className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>

        {/* Settings Panel */}
        {showSettings && (
          <div className="px-4 py-3 border-b bg-muted/30 space-y-3">
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
                <Input type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); saveSettings(selectedProvider, selectedModel, e.target.value); }} placeholder={`输入 ${currentProvider?.name || 'DeepSeek'} API Key...`} className="h-8 text-xs font-mono" />
                <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" disabled={!apiKey || testingConnection}
                  onClick={async () => { setTestingConnection(true); try { const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '你好', stream: false, provider: selectedProvider, model: selectedModel, apiKey }) }); const data = await res.json(); if (data.success) toast.success('连接测试成功'); else toast.error(`连接失败: ${data.error || '未知错误'}`); } catch { toast.error('连接测试失败'); } setTestingConnection(false); }}>
                  {testingConnection ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}<span className="ml-1 hidden sm:inline">测试</span></Button>
              </div>
            </div>
            {selectedProvider === 'local' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-muted-foreground">Ollama 地址: {currentProvider?.baseURL || 'http://localhost:11434/v1'}</label>
                  <Button variant="outline" size="sm" className={`h-6 text-[10px] gap-1 ${ollamaStatus === 'error' ? 'border-amber-500' : ollamaStatus === 'found' ? 'border-green-500' : ''}`} disabled={scanningOllama} onClick={scanOllama}>
                    {scanningOllama ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}扫描模型</Button>
                </div>
                {ollamaStatus === 'error' && ollamaModels.length === 0 && (
                  <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1"><CircleDot className="h-2.5 w-2.5" />Ollama 未连接</p>
                  </div>
                )}
                {ollamaModels.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">已发现 {ollamaModels.length} 个本地模型</label>
                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                      {ollamaModels.map((m) => (
                        <button key={m.name} onClick={() => { setSelectedModel(m.name); saveSettings(selectedProvider, m.name, apiKey); }}
                          className={`w-full flex items-center gap-2 p-1.5 rounded text-xs transition-colors ${selectedModel === m.name ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'}`}>
                          <Cpu className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="flex-1 text-left truncate font-medium">{m.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{fmtBytes(m.size)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Messages Area */}
        <CardContent className="p-0">
          <div className="p-3 overflow-y-auto custom-scrollbar" style={{ height: `${panelResize.size.h - 140}px` }} ref={scrollRef}>
            {messages.length === 0 && (
              <div className="text-center py-6">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-950/30 dark:to-rose-950/30 flex items-center justify-center mx-auto mb-3"><Bot className="h-6 w-6 text-orange-500 dark:text-orange-400" /></div>
                <p className="text-sm font-medium text-foreground mb-1">你好！我是供应链助手</p>
                <p className="text-xs text-muted-foreground mb-4">我可以帮你查询库存、成本、销售、物流等数据</p>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_ACTIONS.map((action) => (
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
                    {msg.role === 'assistant' && (() => {
                      const isCurrentlyStreaming = streaming && msg.id.endsWith('-ai');
                      const toolsToShow = isCurrentlyStreaming ? streamingToolCalls : (msg.toolsUsed || []);
                      if (toolsToShow.length === 0) return null;
                      return (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {toolsToShow.map((tool) => (
                            <Badge key={tool} variant="secondary" className="text-[10px] h-5 gap-1 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300 border-orange-200 dark:border-orange-800">
                              {isCurrentlyStreaming ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : TOOL_ICONS[tool]}
                              {TOOL_LABELS[tool] || tool}
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
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-950/30 dark:to-cyan-950/30 flex items-center justify-center shrink-0 mt-1"><User className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" /></div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && <TypingIndicator thinking={thinking} />}
            </div>
          </div>
          {/* Conversation list popup */}
          {showConvList && (
            <div className="absolute top-12 right-2 z-50 bg-card border rounded-lg shadow-lg p-2 w-56 max-h-48 overflow-y-auto">
              <div className="text-[10px] text-muted-foreground mb-1 px-1">已保存的对话</div>
              {convList.length === 0 ? (
                <div className="text-xs text-muted-foreground px-1 py-2">暂无</div>
              ) : convList.map(c => (
                <button key={c.id} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/50 flex justify-between" onClick={() => loadFromServer(c.id)}>
                  <span className="truncate">{c.title}</span>
                  <span className="text-muted-foreground shrink-0">{c.messageCount}条</span>
                </button>
              ))}
              <button className="w-full text-center text-[10px] text-muted-foreground mt-1 hover:text-foreground" onClick={() => setShowConvList(false)}>关闭</button>
            </div>
          )}

          {messages.length > 0 && !isLoading && (
            <div className="px-3 pb-2 flex gap-1 overflow-x-auto"><div className="flex gap-1">{QUICK_ACTIONS.map((a) => <Button key={a.label} variant="ghost" size="sm" className="text-[10px] h-6 px-2 shrink-0" onClick={() => handleQuickAction(a.message)}>{a.label}</Button>)}</div></div>
          )}
          <form onSubmit={handleSubmit} className="p-3 pt-2 border-t bg-background dark:bg-card border-border">
            <div className="flex gap-2">
              <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入问题，如：当前库存情况..." className="flex-1 h-9 text-sm rounded-full border-orange-200 focus-visible:ring-orange-300 dark:border-orange-800" disabled={isLoading} maxLength={2000} />
              <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="h-9 w-9 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white shrink-0"><Send className="h-4 w-4" /></Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
