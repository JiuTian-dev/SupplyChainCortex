import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import {
  getNotifications,
  getNotificationSummary,
  getNotificationTrends,
} from "@/lib/services/notifications.service";
import { createAuditLog } from "@/lib/services/audit.service";
import { db } from "@/lib/db";

// GET /api/notifications - Get aggregated notifications from various sources
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  // Notification Summary
  if (action === "summary") {
    const result = await getNotificationSummary();
    return NextResponse.json(result);
  }

  // Notification Trends
  if (action === "trends") {
    const result = await getNotificationTrends();
    return NextResponse.json(result);
  }

  // Default: Full Notification List
  const result = await getNotifications({ unreadOnly });
  return NextResponse.json({
    notifications: result.notifications,
    unreadCount: result.unreadCount,
  });
}));

// PUT /api/notifications - Mark notification as read
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { notificationId, markAllRead } = body;

  if (markAllRead) {
    // Mark all SupplyChainEvents as read
    const result = await db.supplyChainEvent.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    });

    await createAuditLog({
      action: 'UPDATE',
      entity: 'event',
      details: { action: 'markAllNotificationsRead', count: result.count },
    });

    return NextResponse.json({ success: true });
  }

  if (!notificationId) {
    return NextResponse.json(
      { error: "缺少必填字段: notificationId 或 markAllRead" },
      { status: 422 }
    );
  }

  // Mark the specific event as read
  await db.supplyChainEvent.updateMany({
    where: { id: notificationId },
    data: { isRead: true },
  });

  await createAuditLog({
    action: 'UPDATE',
    entity: 'event',
    entityId: notificationId,
    details: { action: 'markNotificationRead' },
  });

  return NextResponse.json({ success: true });
}));
