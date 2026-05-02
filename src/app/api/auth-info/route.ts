import { withErrorHandler, apiSuccess } from '@/lib/api-utils';
import { getAuth, requireAuth } from '@/lib/auth-helpers';
import { getRolePermissions, ROLE_LABELS, ROLE_COLORS, type Role } from '@/lib/rbac';
import { db } from '@/lib/db';

/** Get current auth info - used by frontend to check session */
export const GET = withErrorHandler(async () => {
  const session = await getAuth();
  
  if (!session?.user) {
    return apiSuccess({
      authenticated: false,
      user: null,
      permissions: [],
    });
  }
  
  const role = (session.user as Record<string, unknown>).role as Role;
  const userId = (session.user as Record<string, unknown>).id as string;
  const permissions = getRolePermissions(role);

  // Fetch lastLoginAt from DB
  let lastLoginAt: string | null = null;
  try {
    const dbUser = await db.user.findUnique({ where: { id: userId }, select: { lastLoginAt: true } });
    lastLoginAt = dbUser?.lastLoginAt?.toISOString() ?? null;
  } catch {
    // Non-critical, ignore
  }
  
  return apiSuccess({
    authenticated: true,
    user: {
      id: userId,
      email: session.user.email,
      name: session.user.name,
      role,
      avatar: (session.user as Record<string, unknown>).avatar,
      roleLabel: ROLE_LABELS[role],
      roleColor: ROLE_COLORS[role],
      lastLoginAt,
    },
    permissions,
  });
});
