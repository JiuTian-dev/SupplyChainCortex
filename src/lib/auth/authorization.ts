/**
 * Authorization service — three-tier RBAC (Organization → Team → User).
 *
 * Provides permission checks backed by the Prisma models `User`, `Team`, and
 * `TeamMember`. Permission results are cached per-user for the duration of
 * `CACHE_TTL_MS` to keep checks efficient.
 *
 * When `RBAC_ENABLED` is not "true", every check short-circuits to `true`
 * (or, for `getUserPermissions`, returns ALL_PERMISSIONS) so that the legacy
 * single-level RBAC in `src/lib/rbac.ts` continues to govern access.
 */
import { db } from '@/lib/db';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  getRolePermissions,
  isRbacEnabled,
  isValidRole,
  type Permission,
  type Role,
} from './permissions';
import { ForbiddenError, UnauthorizedError } from '@/lib/api-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Resource types that support resource-level permission checks. */
export type ResourceType = 'team' | 'inventory' | 'cost' | 'supplier' | 'logistics' | 'report';

/** Resolved role for a user at a given scope. */
export interface UserRoleResult {
  /** Organization-level role (from User.orgRole). May be null if not assigned. */
  orgRole: Role | null;
  /** Team-level role (from TeamMember.role). May be null if user is not on the team. */
  teamRole: Role | null;
  /** Effective role — the highest-privilege role applicable. */
  effectiveRole: Role;
}

// ─── In-memory permission cache ──────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 1 minute

interface CacheEntry {
  permissions: Permission[];
  role: Role;
  expiresAt: number;
}

const permissionCache = new Map<string, CacheEntry>();

/** Invalidate the cached permissions for a user (call after role changes). */
export function invalidateUserPermissionCache(userId: string): void {
  permissionCache.delete(userId);
}

/** Clear the entire permission cache (useful in tests). */
export function clearPermissionCache(): void {
  permissionCache.clear();
}

// ─── Role resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the effective role for a user, optionally scoped to a team.
 *
 * Precedence (highest first):
 *   1. org_admin  (org-level)
 *   2. team_admin (team-level, only when teamId is provided)
 *   3. member     (team-level, only when teamId is provided)
 *   4. viewer     (default)
 */
export async function getUserRole(userId: string, teamId?: string): Promise<UserRoleResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true } as any,
  });

  const orgRole = (user as any)?.orgRole && isValidRole((user as any).orgRole) ? ((user as any).orgRole as Role) : null;

  let teamRole: Role | null = null;
  if (teamId) {
    const membership = await (db as any).teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });
    if (membership && isValidRole(membership.role)) {
      teamRole = membership.role as Role;
    }
  }

  const effectiveRole = resolveEffectiveRole(orgRole, teamRole);
  return { orgRole, teamRole, effectiveRole };
}

/** Pure helper — picks the most privileged applicable role. */
function resolveEffectiveRole(orgRole: Role | null, teamRole: Role | null): Role {
  const rank: Record<Role, number> = { org_admin: 4, team_admin: 3, member: 2, viewer: 1 };
  const candidates: Role[] = [];
  if (orgRole) candidates.push(orgRole);
  if (teamRole) candidates.push(teamRole);
  if (candidates.length === 0) return 'viewer';
  return candidates.reduce((best, r) => (rank[r] > rank[best] ? r : best));
}

// ─── Permission resolution ──────────────────────────────────────────────────

/**
 * Get all permissions for a user (cached).
 *
 * Combines the permissions of the user's org role and (optionally) the most
 * privileged team role across all teams they belong to.
 */
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  // Backward-compat: when RBAC is disabled, grant everything.
  if (!isRbacEnabled()) {
    return [...ALL_PERMISSIONS];
  }

  const cached = permissionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  const { effectiveRole } = await getUserRole(userId);

  // Also consider the most privileged role across all team memberships.
  const memberships = await (db as any).teamMember.findMany({
    where: { userId },
    select: { role: true },
  });
  const teamRoles = memberships
    .map((m: any) => (isValidRole(m.role) ? (m.role as Role) : null))
    .filter((r: any): r is Role => r !== null);

  const roles: Role[] = [effectiveRole, ...teamRoles];
  const permissionSet = new Set<Permission>();
  for (const r of roles) {
    for (const p of getRolePermissions(r)) permissionSet.add(p);
  }
  const permissions = [...permissionSet];

  permissionCache.set(userId, {
    permissions,
    role: effectiveRole,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return permissions;
}

// ─── Permission checks ───────────────────────────────────────────────────────

/**
 * Check whether a user has a specific permission.
 *
 * When RBAC is disabled, always returns `true` (backward compatibility).
 */
export async function checkPermission(
  userId: string,
  permission: Permission,
): Promise<boolean> {
  if (!isRbacEnabled()) return true;
  const permissions = await getUserPermissions(userId);
  return permissions.includes(permission);
}

/**
 * Check whether a user has a permission for a specific resource.
 *
 * Resource-level checks additionally verify that the user belongs to the team
 * that owns the resource (when the resource is team-scoped). For org-level
 * resources (e.g. `org:manage`, `billing:*`), the team scope is ignored and the
 * check falls back to a plain permission check.
 */
export async function checkPermissionForResource(
  userId: string,
  permission: Permission,
  resourceType: ResourceType,
  resourceId: string,
): Promise<boolean> {
  if (!isRbacEnabled()) return true;

  // Org-scoped permissions ignore the resource scope.
  const orgScoped: Permission[] = ['org:manage', 'billing:read', 'billing:manage', 'user:manage'];
  if (orgScoped.includes(permission)) {
    return checkPermission(userId, permission);
  }

  // Resolve the team that owns the resource.
  const teamId = await resolveResourceTeamId(resourceType, resourceId);
  if (!teamId) {
    // Resource not team-scoped → fall back to plain permission check.
    return checkPermission(userId, permission);
  }

  // Verify the user is a member of the owning team (or an org_admin).
  const { effectiveRole } = await getUserRole(userId, teamId);
  if (effectiveRole === 'org_admin') return true; // org_admin bypasses team scope
  if (effectiveRole === 'viewer') {
    // viewers can only read
    return permission.endsWith(':read') && roleHasPermissionSafe(effectiveRole, permission);
  }
  return roleHasPermissionSafe(effectiveRole, permission);
}

/** Resolve the team that owns a given resource, or null if not team-scoped. */
async function resolveResourceTeamId(
  resourceType: ResourceType,
  resourceId: string,
): Promise<string | null> {
  if (resourceType === 'team') return resourceId;
  // Other resource types are not yet associated with a specific team in the
  // schema; fall back to a plain permission check by returning null.
  // As the multi-tenant migration progresses, extend this mapping to resolve
  // the owning team for each resource type.
  return null;
}

function roleHasPermissionSafe(role: Role, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.includes(permission) : false;
}

// ─── Require helpers (throw on failure) ──────────────────────────────────────

/**
 * Require that the current session user has a permission.
 * Throws `UnauthorizedError` when the user is missing, `ForbiddenError` when
 * the permission check fails.
 *
 * Returns the userId on success so callers can chain checks.
 */
export async function requirePermission(
  userId: string | null | undefined,
  permission: Permission,
): Promise<string> {
  if (!userId) throw UnauthorizedError('请先登录');
  const ok = await checkPermission(userId, permission);
  if (!ok) throw ForbiddenError(`权限不足：需要 ${permission} 权限`);
  return userId;
}

/**
 * Require that the current session user has ANY of the given permissions.
 */
export async function requireAnyPermission(
  userId: string | null | undefined,
  permissions: Permission[],
): Promise<string> {
  if (!userId) throw UnauthorizedError('请先登录');
  if (!isRbacEnabled()) return userId;
  const userPerms = await getUserPermissions(userId);
  const ok = permissions.some((p) => userPerms.includes(p));
  if (!ok) throw ForbiddenError('权限不足');
  return userId;
}

/**
 * Require that the current session user has ALL of the given permissions.
 */
export async function requireAllPermissions(
  userId: string | null | undefined,
  permissions: Permission[],
): Promise<string> {
  if (!userId) throw UnauthorizedError('请先登录');
  if (!isRbacEnabled()) return userId;
  const userPerms = await getUserPermissions(userId);
  const ok = permissions.every((p) => userPerms.includes(p));
  if (!ok) throw ForbiddenError('权限不足');
  return userId;
}
