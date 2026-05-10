'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  ChevronDown,
  Package,
  DollarSign,
  TrendingUp,
  Ship,
  Building2,
  Shield,
  BarChart3,
  Trash2,
  StickyNote,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  Settings,
  Key,
  Globe,
  Cpu,
  Wifi,
  GripVertical,
  RefreshCw,
  Play,
  CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';
import { AI_PROVIDERS, getProviderModels, getDefaultModel, type AIModel } from '@/lib/services/ai-providers.service';

// ─── Constants ────────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'supply-chain-chat-history';
export const SETTINGS_KEY = 'ai-provider-settings';
const MAX_MESSAGES = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  toolsUsed?: string[];
  data?: Record<string, unknown>;
  model?: string;
  timestamp: string; // ISO string for serialization
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

export function loadMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

export function saveMessages(msgs: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    const toSave = msgs.slice(-MAX_MESSAGES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function clearStoredMessages() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently ignore
  }
}

// ─── useDraggable hook ─────────────────────────────────────────────────────────

interface DragPos { x: number; y: number }

export function loadDragPos(key: string, dx: number, dy: number): DragPos {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const p = JSON.parse(raw) as DragPos;
      if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch { /* ignore */ }
  return { x: dx, y: dy };
}
export function saveDragPos(key: string, p: DragPos) {
  try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* ignore */ }
}

export function useDraggable(sKey: string, dx: number, dy: number) {
  const [pos, setPos] = useState<DragPos>(() => loadDragPos(sKey, dx, dy));
  const pr = useRef<DragPos>({ x: pos.x, y: pos.y });
  const dragging = useRef(false);
  const off = useRef({ x: 0, y: 0 });
  const onDown = useCallback((e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); dragging.current = true; off.current = { x: e.clientX - pr.current.x, y: e.clientY - pr.current.y }; }, []);
  const onMove = useCallback((e: React.PointerEvent) => { if (!dragging.current) return; const np = { x: e.clientX - off.current.x, y: e.clientY - off.current.y }; pr.current = np; setPos(np); }, []);
  const onUp = useCallback(() => { if (!dragging.current) return; dragging.current = false; saveDragPos(sKey, pr.current); }, [sKey]);
  return { pos, onDown, onMove, onUp };
}

// ─── useResizable hook ─────────────────────────────────────────────────────────

interface SizeState { w: number; h: number }

export function loadSize(key: string, dw: number, dh: number): SizeState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const s = JSON.parse(raw) as SizeState; if (typeof s.w === 'number' && typeof s.h === 'number') return s; }
  } catch { /* ignore */ }
  return { w: dw, h: dh };
}
export function saveSize(key: string, s: SizeState) {
  try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* ignore */ }
}

type ResizeEdge = 'left' | 'top' | 'top-left' | 'bottom';

export function useResizable(sKey: string, defW: number, defH: number, minW = 280, minH = 200, maxW = 800, maxH = 700) {
  const [size, setSize] = useState<SizeState>(() => loadSize(sKey, defW, defH));
  const sr = useRef<SizeState>({ w: size.w, h: size.h });
  const resizing = useRef<ResizeEdge | null>(null);
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const onResizeDown = useCallback((edge: ResizeEdge) => (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizing.current = edge;
    startRef.current = { x: e.clientX, y: e.clientY, w: sr.current.w, h: sr.current.h };
    e.preventDefault();
  }, []);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const dx = startRef.current.x - e.clientX;
    const dy = startRef.current.y - e.clientY;
    let nw = startRef.current.w;
    let nh = startRef.current.h;
    const edge = resizing.current;
    if (edge === 'left' || edge === 'top-left') nw = Math.min(maxW, Math.max(minW, startRef.current.w + dx));
    if (edge === 'top' || edge === 'top-left') nh = Math.min(maxH, Math.max(minH, startRef.current.h + dy));
    if (edge === 'bottom') nh = Math.min(maxH, Math.max(minH, startRef.current.h + (e.clientY - startRef.current.y)));
    const ns = { w: nw, h: nh };
    sr.current = ns;
    setSize(ns);
  }, [minW, minH, maxW, maxH]);

  const onResizeUp = useCallback(() => {
    if (!resizing.current) return;
    resizing.current = null;
    saveSize(sKey, sr.current);
  }, [sKey]);

  return { size, onResizeDown, onResizeMove, onResizeUp, setSize };
}

// ─── Ollama helpers ─────────────────────────────────────────────────────────────

export interface OllamaModel { name: string; size: number; modified_at: string }

export async function fetchOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const url = baseUrl.replace(/\/v1\/?$/, '') + '/api/tags';
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { models?: OllamaModel[] };
  return data.models || [];
}

export function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1e3).toFixed(1)} KB`;
}

// ─── Format timestamp ─────────────────────────────────────────────────────────

export function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

// ─── Tool Icon Mapping ────────────────────────────────────────────────────────

export const TOOL_ICONS: Record<string, React.ReactNode> = {
  query_inventory: <Package className="h-3 w-3" />,
  query_cost: <DollarSign className="h-3 w-3" />,
  query_sales: <TrendingUp className="h-3 w-3" />,
  query_logistics: <Ship className="h-3 w-3" />,
  query_suppliers: <Building2 className="h-3 w-3" />,
  query_dashboard: <BarChart3 className="h-3 w-3" />,
  query_risk: <Shield className="h-3 w-3" />,
  create_reorder: <Package className="h-3 w-3" />,
  update_shipment_status: <Ship className="h-3 w-3" />,
  query_analytics: <BarChart3 className="h-3 w-3" />,
  adjust_inventory: <Package className="h-3 w-3" />,
  update_cost_record: <DollarSign className="h-3 w-3" />,
  create_note: <StickyNote className="h-3 w-3" />,
  resolve_alert: <AlertTriangle className="h-3 w-3" />,
};

export const TOOL_LABELS: Record<string, string> = {
  query_inventory: '库存查询',
  query_cost: '成本查询',
  query_sales: '销售查询',
  query_logistics: '物流查询',
  query_suppliers: '供应商查询',
  query_dashboard: '仪表盘',
  query_risk: '风险查询',
  create_reorder: '创建补货',
  update_shipment_status: '更新货运',
  query_analytics: '深度分析',
  adjust_inventory: '库存调整',
  update_cost_record: '成本更新',
  create_note: '创建备注',
  resolve_alert: '解除预警',
};

export const QUICK_ACTIONS = [
  { label: '📊 供应链概览', message: '给我看看供应链的整体情况' },
  { label: '📦 库存状态', message: '当前库存情况怎么样？' },
  { label: '💰 成本分析', message: '分析一下成本情况' },
  { label: '⚠️ 风险评估', message: '当前有什么风险？' },
  { label: '🚢 物流状况', message: '物流货运情况如何？' },
  { label: '📈 销售数据', message: '最近销售数据怎么样？' },
  { label: '🛡️ 风险评分', message: '查看供应链风险评分' },
  { label: '👥 供应商', message: '查看供应商概况' },
  { label: '📊 成本结构', message: '查看成本结构分析' },
  { label: '🚛 物流状态', message: '查看物流货运状态' },
];

// ─── Enhanced Markdown Renderer ────────────────────────────────────────────────

export function renderMarkdown(content: string): React.ReactNode[] {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let inOrderedList = false;
  let orderedListItems: React.ReactNode[] = [];
  let listKey = 0;

  const flushOrderedList = () => {
    if (inOrderedList && orderedListItems.length > 0) {
      nodes.push(
        <ol key={`ol-${listKey++}`} className="list-decimal list-inside space-y-0.5 ml-1">
          {orderedListItems}
        </ol>
      );
      orderedListItems = [];
      inOrderedList = false;
    }
  };

  const renderInline = (text: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    // Process inline code first: `code`
    const codeParts = text.split(/(`[^`]+`)/g);
    let inlineKey = 0;

    for (const part of codeParts) {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        const codeContent = part.slice(1, -1);
        result.push(
          <code
            key={`code-${inlineKey++}`}
            className="px-1 py-0.5 rounded bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 text-xs font-mono"
          >
            {codeContent}
          </code>
        );
      } else if (part) {
        // Process bold within non-code parts: **bold**
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        for (const bp of boldParts) {
          if (bp.startsWith('**') && bp.endsWith('**') && bp.length > 4) {
            result.push(
              <strong key={`b-${inlineKey++}`} className="font-semibold">
                {bp.slice(2, -2)}
              </strong>
            );
          } else if (bp) {
            result.push(bp);
          }
        }
      }
    }
    return result;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ### headers → h4
    if (line.startsWith('### ')) {
      flushOrderedList();
      nodes.push(
        <h4 key={`h4-${i}`} className="text-sm font-semibold mt-2 mb-1 text-foreground">
          {renderInline(line.slice(4))}
        </h4>
      );
      continue;
    }

    // ## headers → h3
    if (line.startsWith('## ')) {
      flushOrderedList();
      nodes.push(
        <h3 key={`h3-${i}`} className="text-sm font-bold mt-2 mb-1 text-foreground">
          {renderInline(line.slice(3))}
        </h3>
      );
      continue;
    }

    // Numbered lists: 1. 2. 3.
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      if (!inOrderedList) {
        flushOrderedList();
        inOrderedList = true;
      }
      orderedListItems.push(
        <li key={`li-${i}`} className="text-sm leading-relaxed">
          {renderInline(numberedMatch[2])}
        </li>
      );
      continue;
    }

    // Flush any ongoing ordered list if we hit a non-list item
    flushOrderedList();

    // Bullet lists: - item
    if (line.startsWith('- ')) {
      nodes.push(
        <div key={`bl-${i}`} className="flex gap-1.5">
          <span className="text-orange-400 dark:text-orange-500 shrink-0">•</span>
          <span className="text-sm leading-relaxed">{renderInline(line.slice(2))}</span>
        </div>
      );
      continue;
    }

    // Sub-bullet lists:  - item (indented)
    if (line.startsWith('  - ')) {
      nodes.push(
        <div key={`sbl-${i}`} className="flex gap-1.5 pl-4">
          <span className="text-orange-300 dark:text-orange-600 shrink-0">◦</span>
          <span className="text-sm leading-relaxed">{renderInline(line.slice(4))}</span>
        </div>
      );
      continue;
    }

    // Markdown table: | col1 | col2 |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const isHeader = nextLine.includes('---') && nextLine.includes('|');

      if (isHeader && i + 2 < lines.length) {
        // Collect header + all data rows
        const headerCells = line.split('|').filter(c => c.trim()).map(c => c.trim());
        const dataRows: string[][] = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim().startsWith('|')) {
          dataRows.push(lines[j].split('|').filter(c => c.trim()).map(c => c.trim()));
          j++;
        }

        nodes.push(
          <div key={`table-${i}`} className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-border">
                  {headerCells.map((h, ci) => (
                    <th key={ci} className="text-left px-2 py-1.5 font-semibold text-muted-foreground">{renderInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-border/50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1">{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        i = j - 1; // skip processed rows
        continue;
      }
    }

    // Empty lines → line break with spacing
    if (line.trim() === '') {
      nodes.push(<div key={`br-${i}`} className="h-1" />);
      continue;
    }

    // Regular text with inline markdown
    nodes.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }

  // Flush any remaining ordered list
  flushOrderedList();

  return nodes;
}

// ─── Copy Button Component ────────────────────────────────────────────────────

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败');
    }
  }, [text]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          aria-label="复制消息"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {copied ? '已复制' : '复制'}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Typing Indicator Component ───────────────────────────────────────────────

export function TypingIndicator({ thinking }: { thinking?: boolean }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-950/30 dark:to-rose-950/30 flex items-center justify-center shrink-0">
        <Bot className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
      </div>
      <div className="rounded-2xl rounded-bl-md bg-muted dark:bg-muted/80 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{thinking ? '正在调用工具...' : '思考中'}</span>
          <span className="flex items-center gap-[3px]">
            <span
              className="h-1.5 w-1.5 rounded-full bg-orange-400 dark:bg-orange-500 animate-bounce"
              style={{ animationDelay: '0ms', animationDuration: '600ms' }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-orange-400 dark:bg-orange-500 animate-bounce"
              style={{ animationDelay: '150ms', animationDuration: '600ms' }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-orange-400 dark:bg-orange-500 animate-bounce"
              style={{ animationDelay: '300ms', animationDuration: '600ms' }}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── SSE Stream Parser ────────────────────────────────────────────────────────

interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Parse SSE text chunks into event objects.
 * Handles partial chunks that may span multiple SSE messages.
 */
export function parseSSEChunk(text: string, buffer: { value: string }): SSEEvent[] {
  const events: SSEEvent[] = [];
  buffer.value += text;

  const parts = buffer.value.split('\n\n');
  // Keep the last incomplete part in the buffer
  buffer.value = parts.pop() || '';

  for (const part of parts) {
    if (!part.trim()) continue;

    let event = '';
    let dataStr = '';

    for (const line of part.split('\n')) {
      if (line.startsWith('event: ')) {
        event = line.slice(7);
      } else if (line.startsWith('data: ')) {
        dataStr = line.slice(6);
      } else if (line.startsWith(':')) {
        // Comment/heartbeat, ignore
        continue;
      }
    }

    if (event && dataStr) {
      try {
        events.push({ event, data: JSON.parse(dataStr) });
      } catch {
        // Skip unparseable data
      }
    }
  }

  return events;
}

