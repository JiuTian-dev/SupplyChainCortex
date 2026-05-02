'use client';

import { useState } from 'react';
import {
  StickyNote,
  Plus,
  CheckCircle2,
  Trash2,
  X,
  AlertTriangle,
  Clock,
  User,
  Tag,
  Package,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotes, useCreateNote, useResolveNote, useDeleteNote } from '@/hooks/use-supply-chain-data';
import { toast } from 'sonner';
import type { SupplyChainNote } from '@/lib/types';

// ==================== Constants ====================
const CATEGORY_LABELS: Record<string, string> = {
  general: '通用',
  inventory: '库存',
  cost: '成本',
  logistics: '物流',
  sales: '销售',
};

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  inventory: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  cost: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  logistics: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  sales: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
};

const PRIORITY_LABELS: Record<string, string> = {
  normal: '普通',
  important: '重要',
  urgent: '紧急',
};

const PRIORITY_COLORS: Record<string, string> = {
  normal: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  important: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

type FilterTab = 'all' | 'unresolved' | 'resolved';

// ==================== Component Props ====================
export interface NotesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill SKU when opening from a product context */
  initialSku?: string;
  /** Navigate to a product detail when SKU is clicked */
  onViewProduct?: (sku: string) => void;
}

// ==================== Note Card ====================
function NoteCard({
  note,
  onResolve,
  onDelete,
  onViewProduct,
  isResolving,
  isDeleting,
}: {
  note: SupplyChainNote;
  onResolve: () => void;
  onDelete: () => void;
  onViewProduct?: (sku: string) => void;
  isResolving: boolean;
  isDeleting: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg border transition-all duration-200 hover:shadow-sm ${
        note.isResolved
          ? 'bg-muted/30 border-muted opacity-70'
          : 'bg-card border-border hover:border-primary/20'
      }`}
    >
      {/* Header row: priority + category badges */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[note.priority]}`}>
          {PRIORITY_LABELS[note.priority] || note.priority}
        </Badge>
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[note.category]}`}>
          {CATEGORY_LABELS[note.category] || note.category}
        </Badge>
        {note.isResolved && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
            已解决
          </Badge>
        )}
      </div>

      {/* Content */}
      <p className={`text-sm leading-relaxed ${note.isResolved ? 'line-through text-muted-foreground' : ''}`}>
        {note.content}
      </p>

      {/* SKU link */}
      {note.sku && note.sku !== 'GENERAL' && (
        <button
          onClick={() => onViewProduct?.(note.sku)}
          className="inline-flex items-center gap-1 mt-1.5 text-xs text-primary hover:underline cursor-pointer"
        >
          <Package className="h-3 w-3" />
          {note.sku}
        </button>
      )}

      {/* Footer: author + time + actions */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/50">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {note.author}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(note.createdAt).toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!note.isResolved && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
              onClick={onResolve}
              disabled={isResolving}
            >
              <CheckCircle2 className="h-3 w-3 mr-0.5" />
              标记已解决
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ==================== Create Note Dialog ====================
function CreateNoteDialog({
  open,
  onOpenChange,
  initialSku,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSku?: string;
}) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [author, setAuthor] = useState('系统用户');
  const [sku, setSku] = useState(initialSku || '');

  const createMutation = useCreateNote();

  const handleSubmit = () => {
    if (!content.trim()) {
      toast.error('备注内容不能为空');
      return;
    }
    createMutation.mutate(
      {
        content: content.trim(),
        category,
        priority,
        author: author.trim() || '系统用户',
        sku: sku.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('备注创建成功');
          setContent('');
          setCategory('general');
          setPriority('normal');
          setAuthor('系统用户');
          setSku('');
          onOpenChange(false);
        },
        onError: () => {
          toast.error('创建备注失败');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-violet-500" />
            新建备注
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="note-content" className="text-sm">备注内容 *</Label>
            <Textarea
              id="note-content"
              placeholder="输入备注内容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Category + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1">
                <Tag className="h-3 w-3" />
                分类
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                优先级
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Author + SKU row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1">
                <User className="h-3 w-3" />
                作者
              </Label>
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="系统用户"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1">
                <Package className="h-3 w-3" />
                SKU (可选)
              </Label>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="关联产品SKU"
                className="h-9"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!content.trim() || createMutation.isPending}
            size="sm"
          >
            {createMutation.isPending ? '创建中...' : '创建备注'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== NotesPanel Main Component ====================
export function NotesPanel({ open, onOpenChange, initialSku, onViewProduct }: NotesPanelProps) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [createOpen, setCreateOpen] = useState(false);

  // Fetch notes with a generous limit
  const { data, isLoading, error } = useNotes(50) as { data: Record<string, any> | undefined; isLoading: boolean; error: Error | null };
  const resolveMutation = useResolveNote();
  const deleteMutation = useDeleteNote();

  const notes: SupplyChainNote[] = data?.notes || [];
  const unresolvedCount = data?.unresolvedCount || 0;

  // Filter notes
  const filteredNotes = notes.filter((n) => {
    if (filter === 'unresolved') return !n.isResolved;
    if (filter === 'resolved') return n.isResolved;
    return true;
  });

  const resolvedCount = notes.length - unresolvedCount;

  const handleResolve = (id: string) => {
    resolveMutation.mutate(id, {
      onSuccess: () => toast.success('备注已标记为已解决'),
      onError: () => toast.error('操作失败'),
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success('备注已删除'),
      onError: () => toast.error('删除失败'),
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          {/* Header */}
          <SheetHeader className="px-4 pt-4 pb-3 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-violet-500" />
                供应链备注
                <Badge variant="secondary" className="text-[10px]">
                  {notes.length}
                </Badge>
              </SheetTitle>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3 w-3" />
                新建备注
              </Button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 mt-2">
              {[
                { key: 'all' as FilterTab, label: '全部', count: notes.length },
                { key: 'unresolved' as FilterTab, label: '未解决', count: unresolvedCount },
                { key: 'resolved' as FilterTab, label: '已解决', count: resolvedCount },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    filter === tab.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {tab.label}
                  <span className={`text-[10px] ${filter === tab.key ? 'text-primary-foreground/70' : 'text-muted-foreground/60'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </SheetHeader>

          {/* Notes list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border space-y-2">
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">加载备注失败</p>
                <p className="text-xs mt-1">请刷新页面重试</p>
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <StickyNote className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">
                  {filter === 'all'
                    ? '暂无备注'
                    : filter === 'unresolved'
                      ? '没有未解决的备注'
                      : '没有已解决的备注'}
                </p>
                {filter === 'all' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-7 text-xs gap-1"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-3 w-3" />
                    创建第一条备注
                  </Button>
                )}
              </div>
            ) : (
              filteredNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onResolve={() => handleResolve(note.id)}
                  onDelete={() => handleDelete(note.id)}
                  onViewProduct={(sku) => {
                    onViewProduct?.(sku);
                    onOpenChange(false);
                  }}
                  isResolving={resolveMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                />
              ))
            )}
          </div>

          {/* Footer summary */}
          {notes.length > 0 && (
            <div className="px-4 py-2.5 border-t bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>共 {notes.length} 条备注</span>
              <span>{unresolvedCount} 条未解决</span>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create note dialog */}
      <CreateNoteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialSku={initialSku}
      />
    </>
  );
}
