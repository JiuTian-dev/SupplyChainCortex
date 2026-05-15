import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler, apiSuccess, apiError, parsePagination, ValidationError, NotFoundError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';

// ==================== GET /api/compliance ====================
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "overview";
  const { page, pageSize } = parsePagination(searchParams);

  switch (action) {
    // ---- List compliance certificates ----
    case "certs": {
      const status = searchParams.get("status") || undefined;
      const category = searchParams.get("category") || undefined;
      const sku = searchParams.get("sku") || undefined;
      const expiringWithin = searchParams.get("expiringWithin");

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (category) where.category = category;
      if (sku) where.sku = sku;

      // Filter by expiring within N days
      if (expiringWithin) {
        const days = parseInt(expiringWithin);
        if (!isNaN(days) && days > 0) {
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + days);
          const futureDateStr = futureDate.toISOString().split("T")[0];
          const todayStr = new Date().toISOString().split("T")[0];
          where.expiryDate = { gte: todayStr, lte: futureDateStr };
        }
      }

      const [records, total] = await Promise.all([
        db.complianceCert.findMany({
          where,
          orderBy: { expiryDate: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.complianceCert.count({ where }),
      ]);

      const totalPages = Math.ceil(total / pageSize) || 1;

      return apiSuccess({
        records,
        pagination: { page, pageSize, total, totalPages },
      });
    }

    // ---- List regulation changes ----
    case "regulations": {
      const status = searchParams.get("status") || undefined;
      const source = searchParams.get("source") || undefined;
      const category = searchParams.get("category") || undefined;
      const impactLevel = searchParams.get("impactLevel") || undefined;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (source) where.source = source;
      if (category) where.category = category;
      if (impactLevel) where.impactLevel = impactLevel;

      const [records, total] = await Promise.all([
        db.regulationChange.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.regulationChange.count({ where }),
      ]);

      const totalPages = Math.ceil(total / pageSize) || 1;

      return apiSuccess({
        records,
        pagination: { page, pageSize, total, totalPages },
      });
    }

    // ---- Check certificate expiry alerts ----
    case "check_expiry": {
      const days = parseInt(searchParams.get("days") || "0");
      const todayStr = new Date().toISOString().split("T")[0];
      const now = new Date();

      // Fetch active/expiring certificates that haven't expired yet
      const candidates = await db.complianceCert.findMany({
        where: {
          status: { in: ["active", "expiring"] },
          expiryDate: { gte: todayStr },
        },
        orderBy: { expiryDate: "asc" },
      });

      // Filter by reminderDays if not explicitly overridden by ?days=
      const relevantCerts = candidates.filter((cert) => {
        if (days > 0) {
          const diff = Math.ceil(
            (new Date(cert.expiryDate).getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          return diff <= days;
        }
        const diff = Math.ceil(
          (new Date(cert.expiryDate).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return diff <= cert.reminderDays && diff >= 0;
      });

      // Create SupplyChainEvent alerts with dedup (24h window)
      let alertsCreated = 0;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const cert of relevantCerts) {
        const diffDays = Math.ceil(
          (new Date(cert.expiryDate).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const isCritical = diffDays <= 30;

        try {
          const existing = await db.supplyChainEvent.findFirst({
            where: {
              type: "alert",
              title: { contains: cert.certName },
              createdAt: { gte: oneDayAgo },
            },
          });
          if (existing) continue;

          await db.supplyChainEvent.create({
            data: {
              type: "alert",
              title: `证书即将过期: ${cert.certName}`,
              description: `${
                cert.certName
              } (${cert.certNumber || ""}) 将在 ${diffDays} 天后过期，到期日: ${cert.expiryDate}`,
              icon: isCritical ? "🚨" : "⚠️",
              color: isCritical ? "#ef4444" : "#f59e0b",
              severity: isCritical ? "critical" : "warning",
              sku: cert.sku || undefined,
            },
          });
          alertsCreated++;
        } catch {
          continue;
        }
      }

      const criticalCount = relevantCerts.filter((c) => {
        const diff = Math.ceil(
          (new Date(c.expiryDate).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return diff <= 30;
      }).length;

      return apiSuccess({
        checked: relevantCerts.length,
        alertsCreated,
        critical: criticalCount,
        certs: relevantCerts.map((c) => ({
          id: c.id,
          certName: c.certName,
          expiryDate: c.expiryDate,
          daysLeft: Math.ceil(
            (new Date(c.expiryDate).getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        })),
      });
    }

    // ---- Compliance overview / dashboard ----
    case "overview": {
      const todayStr = new Date().toISOString().split("T")[0];
      const ninetyDaysLater = new Date();
      ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);
      const ninetyDaysStr = ninetyDaysLater.toISOString().split("T")[0];

      const [
        activeCerts,
        expiringCerts,
        expiredCerts,
        pendingCerts,
        revokedCerts,
        newRegulations,
        reviewingRegulations,
        actionRequiredRegulations,
        nonCompliantRegulations,
        certsByCategory,
        certsByStatus,
      ] = await Promise.all([
        db.complianceCert.count({ where: { status: "active" } }),
        db.complianceCert.count({ where: { status: "expiring" } }),
        db.complianceCert.count({ where: { status: "expired" } }),
        db.complianceCert.count({ where: { status: "pending" } }),
        db.complianceCert.count({ where: { status: "revoked" } }),
        db.regulationChange.count({ where: { status: "new" } }),
        db.regulationChange.count({ where: { status: "reviewing" } }),
        db.regulationChange.count({ where: { status: "action_required" } }),
        db.regulationChange.count({ where: { status: "non_compliant" } }),
        db.complianceCert.groupBy({ by: ["category"], _count: true }),
        db.complianceCert.groupBy({ by: ["status"], _count: true }),
      ]);

      // Certificates expiring within 90 days (even if currently "active")
      const expiringSoon = await db.complianceCert.count({
        where: {
          status: { in: ["active", "expiring"] },
          expiryDate: { lte: ninetyDaysStr, gte: todayStr },
        },
      });

      // Critical expiring certs (within 30 days)
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const thirtyDaysStr = thirtyDaysLater.toISOString().split("T")[0];
      const criticalExpiring = await db.complianceCert.count({
        where: {
          status: { in: ["active", "expiring"] },
          expiryDate: { lte: thirtyDaysStr, gte: todayStr },
        },
      });

      return apiSuccess({
        certificates: {
          active: activeCerts,
          expiring: expiringCerts,
          expired: expiredCerts,
          pending: pendingCerts,
          revoked: revokedCerts,
          expiringSoon,
          criticalExpiring,
          total: activeCerts + expiringCerts + expiredCerts + pendingCerts + revokedCerts,
          byCategory: certsByCategory.map(c => ({ category: c.category, count: c._count })),
          byStatus: certsByStatus.map(s => ({ status: s.status, count: s._count })),
        },
        regulations: {
          new: newRegulations,
          reviewing: reviewingRegulations,
          actionRequired: actionRequiredRegulations,
          nonCompliant: nonCompliantRegulations,
          total: newRegulations + reviewingRegulations + actionRequiredRegulations + nonCompliantRegulations,
        },
      });
    }

    // ---- Get certificates expiring within N days ----
    case "expiring": {
      const days = parseInt(searchParams.get("days") || "90");
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      const futureDateStr = futureDate.toISOString().split("T")[0];
      const todayStr = new Date().toISOString().split("T")[0];

      const records = await db.complianceCert.findMany({
        where: {
          expiryDate: { gte: todayStr, lte: futureDateStr },
          status: { in: ["active", "expiring"] },
        },
        orderBy: { expiryDate: "asc" },
      });

      // Group by urgency
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const thirtyDaysStr = thirtyDaysLater.toISOString().split("T")[0];

      const critical = records.filter(r => r.expiryDate <= thirtyDaysStr);
      const warning = records.filter(r => r.expiryDate > thirtyDaysStr);

      return apiSuccess({
        days,
        total: records.length,
        critical: critical.length,
        warning: warning.length,
        records,
      });
    }

    default:
      return apiError(`未知操作: ${action}`, 400, 'UNKNOWN_ACTION');
  }
}));

// ==================== POST /api/compliance ====================
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (!action) {
    throw ValidationError("缺少 action 参数");
  }

  const body = await request.json();

  switch (action) {
    case "create_cert": {
      const {
        certName, certNumber, issuer, sku, productName,
        category, issueDate, expiryDate, status, scope,
        documentUrl, notes, reminderDays,
      } = body as {
        certName: string; certNumber?: string; issuer?: string;
        sku?: string; productName?: string; category: string;
        issueDate?: string; expiryDate: string; status?: string;
        scope?: string; documentUrl?: string; notes?: string; reminderDays?: number;
      };

      if (!certName || !category || !expiryDate) {
        throw ValidationError("缺少必填字段: certName, category, expiryDate");
      }
      const validCategories = ["safety", "emc", "environmental", "quality", "other"];
      if (!validCategories.includes(category)) {
        throw ValidationError(`无效的认证类别: ${category}`);
      }

      const record = await db.complianceCert.create({
        data: {
          certName,
          certNumber: certNumber || null,
          issuer: issuer || null,
          sku: sku || null,
          productName: productName || null,
          category,
          issueDate: issueDate || null,
          expiryDate,
          status: status || "active",
          scope: scope || null,
          documentUrl: documentUrl || null,
          notes: notes || null,
          reminderDays: reminderDays || 90,
        },
      });

      return apiSuccess(record, 201);
    }

    case "create_regulation": {
      const {
        title, source, category, description, impactLevel,
        effectiveDate, deadline, affectedSkus, affectedCerts,
        actionRequired, status, sourceUrl,
      } = body as {
        title: string; source: string; category: string; description: string;
        impactLevel?: string; effectiveDate?: string; deadline?: string;
        affectedSkus?: string[]; affectedCerts?: string[];
        actionRequired?: string; status?: string; sourceUrl?: string;
      };

      if (!title || !source || !category || !description) {
        throw ValidationError("缺少必填字段: title, source, category, description");
      }
      const validSources = ["EU", "FDA", "GB", "SAA", "other"];
      if (!validSources.includes(source)) {
        throw ValidationError(`无效的法规来源: ${source}`);
      }

      // Auto-match affected SKUs: query products whose category/subCategory
      // matches the regulation category
      const manuallySelected = affectedSkus || [];
      const suggestedSkus: Array<{ sku: string; productName: string }> = [];
      try {
        const matchingProducts = await db.product.findMany({
          where: {
            OR: [
              { category: { contains: category, mode: "insensitive" } },
              { subCategory: { contains: category, mode: "insensitive" } },
            ],
          },
          select: { sku: true, name: true },
          take: 50,
        });
        for (const p of matchingProducts) {
          if (!manuallySelected.includes(p.sku)) {
            suggestedSkus.push({ sku: p.sku, productName: p.name });
          }
        }
      } catch {
        // non-critical: auto-match is a best-effort enhancement
      }

      const record = await db.regulationChange.create({
        data: {
          title,
          source,
          category,
          description,
          impactLevel: impactLevel || "medium",
          effectiveDate: effectiveDate || null,
          deadline: deadline || null,
          affectedSkus: JSON.stringify(manuallySelected),
          affectedCerts: JSON.stringify(affectedCerts || []),
          actionRequired: actionRequired || null,
          status: status || "new",
          sourceUrl: sourceUrl || null,
        },
      });

      return apiSuccess({
        ...record,
        suggestedSkus,
      }, 201);
    }

    default:
      return apiError(`未知 POST 操作: ${action}`, 400, 'UNKNOWN_ACTION');
  }
}));

// ==================== PUT /api/compliance ====================
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (!action) {
    throw ValidationError("缺少 action 参数");
  }

  const body = await request.json();

  switch (action) {
    case "update_cert": {
      const {
        id, certName, certNumber, issuer, sku, productName,
        category, issueDate, expiryDate, status, scope,
        documentUrl, notes, reminderDays,
      } = body as {
        id: string; certName?: string; certNumber?: string; issuer?: string;
        sku?: string; productName?: string; category?: string;
        issueDate?: string; expiryDate?: string; status?: string;
        scope?: string; documentUrl?: string; notes?: string; reminderDays?: number;
      };

      if (!id) {
        throw ValidationError("缺少必填字段: id");
      }

      const existing = await db.complianceCert.findUnique({ where: { id } });
      if (!existing) throw NotFoundError(`合规证书不存在: ${id}`);

      if (status) {
        const validStatuses = ["active", "expiring", "expired", "revoked", "pending"];
        if (!validStatuses.includes(status)) {
          throw ValidationError(`无效的证书状态: ${status}`);
        }
      }

      const updateData: Record<string, unknown> = {};
      if (certName !== undefined) updateData.certName = certName;
      if (certNumber !== undefined) updateData.certNumber = certNumber;
      if (issuer !== undefined) updateData.issuer = issuer;
      if (sku !== undefined) updateData.sku = sku;
      if (productName !== undefined) updateData.productName = productName;
      if (category !== undefined) updateData.category = category;
      if (issueDate !== undefined) updateData.issueDate = issueDate;
      if (expiryDate !== undefined) updateData.expiryDate = expiryDate;
      if (status !== undefined) updateData.status = status;
      if (scope !== undefined) updateData.scope = scope;
      if (documentUrl !== undefined) updateData.documentUrl = documentUrl;
      if (notes !== undefined) updateData.notes = notes;
      if (reminderDays !== undefined) updateData.reminderDays = reminderDays;

      const updated = await db.complianceCert.update({
        where: { id },
        data: updateData,
      });

      return apiSuccess(updated);
    }

    case "update_regulation": {
      const { id, status, reviewedBy, actionRequired } = body as {
        id: string; status?: string; reviewedBy?: string; actionRequired?: string;
      };

      if (!id) {
        throw ValidationError("缺少必填字段: id");
      }

      const existing = await db.regulationChange.findUnique({ where: { id } });
      if (!existing) throw NotFoundError(`法规变更记录不存在: ${id}`);

      const updateData: Record<string, unknown> = {};
      if (status) {
        const validStatuses = ["new", "reviewing", "action_required", "compliant", "non_compliant"];
        if (!validStatuses.includes(status)) {
          throw ValidationError(`无效的法规状态: ${status}`);
        }
        updateData.status = status;
      }
      if (reviewedBy !== undefined) {
        updateData.reviewedBy = reviewedBy;
        updateData.reviewedAt = new Date();
      }
      if (actionRequired !== undefined) updateData.actionRequired = actionRequired;

      const updated = await db.regulationChange.update({
        where: { id },
        data: updateData,
      });

      return apiSuccess(updated);
    }

    default:
      return apiError(`未知 PUT 操作: ${action}`, 400, 'UNKNOWN_ACTION');
  }
}));
