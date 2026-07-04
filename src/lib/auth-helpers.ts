/**
 * Server-side auth helpers for API route protection
 */
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasPermission, hasAnyPermission, type Permission, type Role } from '@/lib/auth/permissions';
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
  if (role !== 'org_admin') {
    throw ForbiddenError('需要管理员权限');
  }
  return session;
}

/**
 * Optionally require a permission — returns the session if present, but
 * does not throw when the user is missing or lacks the permission. Used by
 * read-only endpoints that should display public data even to anonymous
 * visitors (write endpoints must still use `requireAuth`/`requirePermission`).
 */
export async function optionalRequirePermission(permission: Permission) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const role = getSessionRole(session);
  if (!hasPermission(role, permission)) return null;
  return session;
}

/**
 * Optionally require authentication — returns the current session if present,
 * but never throws on missing auth. This is the "truly optional" version used
 * by read-only data endpoints (dashboard, inventory, cost, etc.) so that
 * anonymous users can browse public data. Write endpoints should still use
 * `requireAuth` or `requirePermission`.
 */
export async function optionalRequireAuth() {
  return await getServerSession(authOptions);
}
