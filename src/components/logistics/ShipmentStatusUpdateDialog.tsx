'use client';

import { useState, useMemo } from 'react';
import {
  Truck, MapPin, Calendar as CalendarIcon, FileText, Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from '@/lib/constants';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateShipmentStatus } from '@/lib/api-client';
import type { ShipmentItem } from '@prisma/client';

// ==================== Status Flow ====================
const STATUS_FLOW: Record<string, string[]> = {
  pending: ['in_transit', 'delayed'],
  in_transit: ['customs', 'delivered', 'delayed'],
  customs: ['delivered', 'delayed'],
  delayed: ['in_transit', 'customs', 'delivered'],
  delivered: [],
  exception: ['in_transit', 'customs', 'delivered'],
};

// ==================== Timeline Step ====================
function TimelineStep({
  label,
  isActive,
  isCurrent,
  isPast,
  color,
}: {
  label: string;
  isActive: boolean;
  isCurrent: boolean;
  isPast: boolean;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 relative">
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
          isCurrent
            ? 'border-primary bg-primary text-primary-foreground scale-125 shadow-lg'
            : isPast
              ? 'border-green-500 bg-green-500 text-white'
              : isActive
                ? 'border-primary/50 bg-primary/10'
                : 'border-muted-foreground/30 bg-muted'
        }`}
        style={isCurrent ? { borderColor: color, backgroundColor: color } : undefined}
      >
        {isPast && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {isCurrent && (
          <div className="w-2 h-2 rounded-full bg-white" />
        )}
      </div>
      <span className={`text-[10px] font-medium whitespace-nowrap ${
        isCurrent ? 'text-foreground' : isPast ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
      }`}>
        {label}
      </span>
    </div>
  );
}

// ==================== Props ====================
interface ShipmentStatusUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: ShipmentItem | null;
}

// ==================== Component ====================
export function ShipmentStatusUpdateDialog({
  open,
  onOpenChange,
  shipment,
}: ShipmentStatusUpdateDialogProps) {
  const queryClient = useQueryClient();

  const [newStatus, setNewStatus] = useState('');
  const [eta, setEta] = useState<Date | undefined>(undefined);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Initialize form when dialog opens with shipment data
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && shipment) {
      setNewStatus('');
      // Parse existing ETA
      if (shipment.eta) {
        try {
          const etaDate = new Date(shipment.eta);
          if (!isNaN(etaDate.getTime())) {
            setEta(etaDate);
          }
        } catch {
          setEta(undefined);
        }
      } else {
        setEta(undefined);
      }
      // Estimate progress from status
      const statusProgress: Record<string, number> = {
        pending: 0,
        in_transit: 40,
        customs: 70,
        delivered: 100,
        delayed: 50,
        exception: 30,
      };
      setProgress(statusProgress[shipment.status] ?? 0);
      setNotes('');
    }
    onOpenChange(newOpen);
  };

  // Available next statuses
  const availableStatuses = useMemo(() => {
    if (!shipment) return [];
    return STATUS_FLOW[shipment.status] || [];
  }, [shipment]);

  // Timeline steps
  const timelineSteps = useMemo(() => {
    if (!shipment) return [];
    const allSteps = ['pending', 'in_transit', 'customs', 'delivered'];
    const currentIdx = allSteps.indexOf(shipment.status);
    const newIdx = newStatus ? allSteps.indexOf(newStatus) : -1;
    const effectiveIdx = newIdx >= 0 ? Math.max(currentIdx, newIdx) : currentIdx;
    const isDelayed = shipment.status === 'delayed' || newStatus === 'delayed';

    return allSteps.map((step, idx) => ({
      key: step,
      label: SHIPMENT_STATUS_LABELS[step] || step,
      isActive: idx <= effectiveIdx || isDelayed,
      isCurrent: (idx === effectiveIdx && !isDelayed) || (step === newStatus),
      isPast: idx < effectiveIdx,
      color: SHIPMENT_STATUS_COLORS[step] || '#94a3b8',
    }));
  }, [shipment, newStatus]);

  // Mutation
  const updateMutation = useMutation({
    mutationFn: updateShipmentStatus as (data: { trackingNumber: string; status: string; eta?: string; progress?: number; notes?: string }) => Promise<Record<string, unknown>>,
    onSuccess: (data: Record<string, unknown>) => {
      if (data.success) {
        toast.success('状态更新成功', {
          description: `${shipment?.trackingNumber} 已更新为 ${SHIPMENT_STATUS_LABELS[newStatus] || newStatus}`,
        });
        queryClient.invalidateQueries({ queryKey: ['logistics'] });
        onOpenChange(false);
      } else {
        toast.error('更新失败', { description: String(data.error || '未知错误') });
      }
    },
    onError: (error: Error) => {
      toast.error('更新失败', { description: error.message || '网络错误' });
    },
  });

  const handleSubmit = () => {
    if (!shipment || !newStatus) {
      toast.error('请选择新状态');
      return;
    }
    updateMutation.mutate({
      trackingNumber: shipment.trackingNumber,
      status: newStatus,
      eta: eta ? eta.toISOString().split('T')[0] : undefined,
      progress,
      notes,
    });
  };

  if (!shipment) return null;

  const currentStatusColor = SHIPMENT_STATUS_COLORS[shipment.status] || '#94a3b8';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-orange-500" />
            更新货运状态
          </DialogTitle>
          <DialogDescription>
            追踪号: {shipment.trackingNumber} · {shipment.productName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Current Status */}
          <div className="p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">当前状态</span>
              <Badge
                style={{
                  backgroundColor: currentStatusColor + '20',
                  color: currentStatusColor,
                  borderColor: currentStatusColor + '40',
                }}
                variant="outline"
              >
                {SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {shipment.origin} → {shipment.destination}
            </div>
          </div>

          {/* Visual Timeline */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">物流时间线</h4>
            <div className="relative px-2">
              {/* Connecting line */}
              <div className="absolute top-[10px] left-[22px] right-[22px] h-0.5 bg-muted">
                <div
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{
                    width: `${
                      timelineSteps.length > 0
                        ? (timelineSteps.filter((s) => s.isPast || s.isCurrent).length / timelineSteps.length) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="flex items-start justify-between relative">
                {timelineSteps.map((step) => (
                  <TimelineStep
                    key={step.key}
                    label={step.label}
                    isActive={step.isActive}
                    isCurrent={step.isCurrent}
                    isPast={step.isPast}
                    color={step.color}
                  />
                ))}
              </div>
            </div>
            {/* Delayed indicator */}
            {(shipment.status === 'delayed' || newStatus === 'delayed') && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                <span className="text-xs text-red-600 dark:text-red-400 font-medium">⚠ 延误中</span>
              </div>
            )}
          </div>

          {/* New Status Select */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">新状态 *</label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="选择新状态" />
              </SelectTrigger>
              <SelectContent>
                {availableStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: SHIPMENT_STATUS_COLORS[status] || '#94a3b8' }}
                      />
                      {SHIPMENT_STATUS_LABELS[status] || status}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableStatuses.length === 0 && (
              <p className="text-xs text-muted-foreground italic">该货运已完成，无法继续更新状态</p>
            )}
          </div>

          {/* ETA Date Picker */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">预计到达日期</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 w-full justify-start text-sm font-normal"
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {eta ? eta.toLocaleDateString('zh-CN') : '选择日期'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={eta}
                  onSelect={(date) => {
                    setEta(date);
                    setCalendarOpen(false);
                  }}
                  disabled={{ before: new Date() }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Progress Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Navigation className="h-3 w-3" />
                运输进度
              </label>
              <span className="text-xs font-mono font-semibold">{progress}%</span>
            </div>
            <Slider
              value={[progress]}
              onValueChange={(v) => setProgress(v[0])}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>待发货</span>
              <span>已送达</span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" />
              备注说明
            </label>
            <Textarea
              placeholder="输入状态更新备注（可选）"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[72px] text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            取消
          </Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={handleSubmit}
            disabled={updateMutation.isPending || !newStatus || availableStatuses.length === 0}
          >
            {updateMutation.isPending ? '更新中...' : (
              <>
                <Truck className="h-4 w-4 mr-1" />
                确认更新
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
