import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, apiSuccess, apiError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { getEvents, createEvent, markEventRead, markAllEventsRead } from "@/lib/queries/events.queries";
import { createAuditLog } from "@/lib/services/audit.service";

// GET /api/events - List supply chain events
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || undefined;
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  const result = await getEvents({ type, unreadOnly, page, pageSize });

  return NextResponse.json({
    events: result.events,
    unreadCount: result.unreadCount,
    pagination: result.pagination,
  });
}));

// POST /api/events - Create a new supply chain event
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { type, title, description, icon, color, severity, sku } = body;

  // Validate required fields
  if (!type || !title || !description) {
    return NextResponse.json(
      { error: "缺少必填字段: type, title, description" },
      { status: 422 }
    );
  }

  const event = await createEvent({ type, title, description, icon, color, severity, sku });

  await createAuditLog({
    action: 'CREATE',
    entity: 'event',
    entityId: event.id,
    sku: sku || undefined,
    details: { type, title, description, severity },
  });

  return NextResponse.json({ success: true, event });
}));

// PUT /api/events - Mark events as read
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { eventIds, markAllRead } = body;

  if (markAllRead) {
    const result = await markAllEventsRead();

    await createAuditLog({
      action: 'UPDATE',
      entity: 'event',
      details: { action: 'markAllRead', count: result.count },
    });

    return NextResponse.json({ success: true, updatedCount: result.count });
  }

  if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
    return NextResponse.json(
      { error: "缺少必填字段: eventIds (非空数组) 或 markAllRead: true" },
      { status: 422 }
    );
  }

  let totalUpdated = 0;
  for (const id of eventIds) {
    const result = await markEventRead(id);
    totalUpdated += result.count;
  }

  await createAuditLog({
    action: 'UPDATE',
    entity: 'event',
    details: { action: 'markRead', eventIds, count: totalUpdated },
  });

  return NextResponse.json({ success: true, updatedCount: totalUpdated });
}));
