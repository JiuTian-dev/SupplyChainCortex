/**
 * Server-side auth helpers for API route protection
 */
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasPermission, hasAnyPermission, type Permission, type Role } from '@/lib/rbac';
import { UnauthorizedError, ForbiddenError } from '@/lib/api-utils';
import { db } from '@/lib/db';

/** Extract role from session, defaulting to 'viewer' */
function getSessionRole(session: Session): Role {
  const user = session.user as Record<string, unknown> | undefined;
  if (user && typeof user.role === 'string') return user.role as Role;
  return 'viewer';
}

/** Get current session or throw UnauthorizedError */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw UnauthorizedError('请先登录');
  }
  return session;
}

/** Get current session or return null (for optional auth) */
export async function getAuth() {
  const session = await getServerSession(authOptions);
  return session;
}

/** Require auth + specific permission */
export async function requirePermission(permission: Permission) {
  const session = await requireAuth();
  const role = getSessionRole(session);
  if (!hasPermission(role, permission)) {
    throw ForbiddenError(`权限不足：需要 ${permission} 权限`);
  }
  return session;
}

/** Require auth + ANY of the specified permissions */
export async function requireAnyPermission(permissions: Permission[]) {
  const session = await requireAuth();
  const role = getSessionRole(session);
  if (!hasAnyPermission(role, permissions)) {
    throw ForbiddenError('权限不足');
  }
  return session;
}

/** Check if current user is admin */
export async function requireAdmin() {
  const session = await requireAuth();
  const role = getSessionRole(session);
  if (role !== 'admin') {
    throw ForbiddenError('需要管理员权限');
  }
  return session;
}

/**
 * Optionally require a permission — if no users exist in the database (bootstrap mode),
 * the check is skipped and returns null. Otherwise, behaves like requirePermission.
 * This allows the first admin to set up the system without being blocked by auth.
 */
export async function optionalRequirePermission(permission: Permission) {
  const userCount = await db.user.count();
  if (userCount === 0) return null; // Bootstrap mode — no users yet
  return requirePermission(permission);
}

/**
 * Optionally require authentication — if no users exist in the database (bootstrap mode),
 * the check is skipped and returns null. Otherwise, behaves like requireAuth.
 */
export async function optionalRequireAuth() {
  const userCount = await db.user.count();
  if (userCount === 0) return null; // Bootstrap mode — no users yet
  return requireAuth();
}
