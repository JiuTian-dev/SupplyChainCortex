import { z } from 'zod';
import { shipmentStatusSchema } from './common';

// Valid status transition map
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_transit', 'delayed'],
  in_transit: ['customs', 'delivered', 'delayed'],
  customs: ['delivered', 'delayed'],
  delayed: ['in_transit', 'customs', 'delivered'],
  delivered: [], // terminal state
  exception: [], // terminal state
};

// Shipment status update schema
export const shipmentStatusUpdateSchema = z
  .object({
    trackingNumber: z.string().min(1, '追踪号不能为空'),
    status: shipmentStatusSchema,
    eta: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      // ETA should be a valid date string if provided
      if (data.eta && !/^\d{4}-\d{2}-\d{2}/.test(data.eta)) {
        return false;
      }
      return true;
    },
    { message: 'ETA 格式无效', path: ['eta'] }
  );

// Helper: check if a status transition is valid
export function isValidStatusTransition(
  fromStatus: string,
  toStatus: string
): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.includes(toStatus);
}

// Type exports
export type ShipmentStatusUpdate = z.infer<typeof shipmentStatusUpdateSchema>;
