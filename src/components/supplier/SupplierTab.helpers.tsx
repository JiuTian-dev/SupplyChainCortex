'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SUPPLIER_CATEGORIES, SUPPLIER_REGIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';

// ─── Shared chart tooltip style ────────────────────────────────────────────────

export const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

// ─── Star Rating Helper ────────────────────────────────────────────────────────

export function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  return (
    <div className="flex items-center gap-1">
      <span className={cn('text-sm font-medium', rating >= 4.5 ? 'text-green-600' : rating >= 3.5 ? 'text-amber-500' : 'text-red-500')}>
        {rating.toFixed(1)}
      </span>
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={cn(sizeClass, star <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200 dark:text-gray-700')}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
    </div>
  );
}

// ─── Supplier Form Component ───────────────────────────────────────────────────

export function SupplierForm({
  form,
  onChange,
}: {
  form: { code: string; name: string; contact: string; email: string; phone: string; region: string; category: string; leadTime: number; rating: number };
  onChange: (field: string, value: string | number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">编码 *</label>
          <Input placeholder="SUP-XX001" value={form.code} onChange={(e) => onChange('code', e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">名称 *</label>
          <Input placeholder="供应商名称" value={form.name} onChange={(e) => onChange('name', e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><label className="text-xs text-muted-foreground">联系人</label><Input placeholder="张经理" value={form.contact} onChange={(e) => onChange('contact', e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1.5"><label className="text-xs text-muted-foreground">电话</label><Input placeholder="+86-xxx-xxxx" value={form.phone} onChange={(e) => onChange('phone', e.target.value)} className="h-8 text-sm" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><label className="text-xs text-muted-foreground">邮箱</label><Input placeholder="email@example.com" value={form.email} onChange={(e) => onChange('email', e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1.5"><label className="text-xs text-muted-foreground">交货期(天)</label><Input type="number" min={1} value={form.leadTime} onChange={(e) => onChange('leadTime', Number(e.target.value))} className="h-8 text-sm" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">地区 *</label>
          <Select value={form.region} onValueChange={(v) => onChange('region', v)}><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择地区" /></SelectTrigger><SelectContent>{SUPPLIER_REGIONS.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent></Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">品类 *</label>
          <Select value={form.category} onValueChange={(v) => onChange('category', v)}><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择品类" /></SelectTrigger><SelectContent>{SUPPLIER_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent></Select>
        </div>
      </div>
    </div>
  );
}
