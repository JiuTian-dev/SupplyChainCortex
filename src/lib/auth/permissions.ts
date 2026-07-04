/**
 * Three-tier RBAC Permission Model (Organization → Team → User)
 *
 * This module is the incremental permission system enabled via RBAC_ENABLED=true.
 * When RBAC is disabled (default), all users retain all permissions for backward
 * compatibility with the legacy single-level system in `src/lib/rbac.ts`.
 *
 * Roles:
 * - org_admin:  Full access — manages the organization, teams, users, and billing.
 * - team_admin: Manages a team's members and has full business read/write within the team scope.
 * - member:     Business read/write within their team scope.
 * - viewer:     Read-only access across permitted business domains.
 */

// ─── Roles ───────────────────────────────────────────────────────────────────

export type Role = 'org_admin' | 'team_admin' | 'member' | 'viewer';

/** All valid roles (useful for validation / iteration). */
export const ALL_ROLES: Role[] = ['org_admin', 'team_admin', 'member', 'viewer'];

// ─── Permissions ─────────────────────────────────────────────────────────────

export type Permission =
  // Inventory
  | 'inventory:read'
  | 'inventory:write'
  // Cost
  | 'cost:read'
  | 'cost:write'
  // Supplier
  | 'supplier:read'
  | 'supplier:write'
  // Logistics
  | 'logistics:read'
  | 'logistics:write'
  // Risk
  | 'risk:read'
  | 'risk:write'
  // Report
  | 'report:read'
  | 'report:write'
  | 'report:export'
  // Audit (read-only by design)
  | 'audit:read'
  // Management
  | 'user:manage'
  | 'team:manage'
  | 'org:manage'
  // Billing
  | 'billing:read'
  | 'billing:manage'
  // Legacy-compatible permissions (kept for backward compatibility with src/lib/rbac.ts)
  | 'dashboard:read'
  | 'sales:read'
  | 'sales:write'
  | 'analytics:read'
  | 'notes:read'
  | 'notes:write'
  | 'alert:read'
  | 'alert:write'
  | 'system:config'
  | 'mcp:execute';

/** All valid permissions (useful for "grant all" fallback / iteration). */
export const ALL_PERMISSIONS: Permission[] = [
  'inventory:read', 'inventory:write',
  'cost:read', 'cost:write',
  'supplier:read', 'supplier:write',
  'logistics:read', 'logistics:write',
  'risk:read', 'risk:write',
  'report:read', 'report:write', 'report:export',
  'audit:read',
  'user:manage', 'team:manage', 'org:manage',
  'billing:read', 'billing:manage',
  'dashboard:read',
  'sales:read', 'sales:write',
  'analytics:read',
  'notes:read', 'notes:write',
  'alert:read', 'alert:write',
  'system:config',
  'mcp:execute',
];

// ─── Role → Permission Mapping ───────────────────────────────────────────────

/**
 * Static role-to-permission mapping.
 *
 * - org_admin:  every permission (org management + team management + billing + full business).
 * - team_admin: team management + full business read/write (no org/billing management).
 * - member:     full business read/write (no management of users/teams/org/billing).
 * - viewer:     read-only across all business domains.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  org_admin: [...ALL_PERMISSIONS],
  team_admin: [
    'inventory:read', 'inventory:write',
    'cost:read', 'cost:write',
    'supplier:read', 'supplier:write',
    'logistics:read', 'logistics:write',
    'risk:read', 'risk:write',
    'report:read', 'report:write',
    'audit:read',
    'team:manage',
    // Legacy-compatible permissions
    'dashboard:read',
    'analytics:read',
    'notes:read', 'notes:write',
    'alert:read', 'alert:write',
    'mcp:execute',
    'report:export',
  ],
  member: [
    'inventory:read', 'inventory:write',
    'cost:read', 'cost:write',
    'supplier:read', 'supplier:write',
    'logistics:read', 'logistics:write',
    'risk:read', 'risk:write',
    'report:read', 'report:write',
    'audit:read',
    // Legacy-compatible permissions
    'dashboard:read',
    'analytics:read',
    'notes:read', 'notes:write',
    'alert:read', 'alert:write',
    'mcp:execute',
    'report:export',
  ],
  viewer: [
    'inventory:read',
    'cost:read',
    'supplier:read',
    'logistics:read',
    'risk:read',
    'report:read',
    'audit:read',
    // Legacy-compatible permissions
    'dashboard:read',
    'analytics:read',
    'notes:read',
    'alert:read',
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check whether a value is a valid three-tier Role. */
export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && ALL_ROLES.includes(value as Role);
}

/** Check whether a value is a valid Permission. */
export function isValidPermission(value: unknown): value is Permission {
  return typeof value === 'string' && ALL_PERMISSIONS.includes(value as Permission);
}

/** Get all permissions granted to a role. Returns empty array for unknown roles. */
export function getRolePermissions(role: Role | string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] ?? [];
}

/** Check if a role grants a specific permission. */
export function roleHasPermission(role: Role | string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  return perms.includes(permission);
}

/** Check if a role grants ALL of the specified permissions. */
export function roleHasAllPermissions(role: Role | string, permissions: Permission[]): boolean {
  return permissions.every((p) => roleHasPermission(role, p));
}

/** Check if a role grants ANY of the specified permissions. */
export function roleHasAnyPermission(role: Role | string, permissions: Permission[]): boolean {
  return permissions.some((p) => roleHasPermission(role, p));
}

// ─── Display Metadata ────────────────────────────────────────────────────────

/** Human-readable labels for each role (Chinese). */
export const ROLE_LABELS: Record<Role, string> = {
  org_admin: '组织管理员',
  team_admin: '团队管理员',
  member: '成员',
  viewer: '观察者',
};

/** Badge color classes for each role (Tailwind). */
export const ROLE_COLORS: Record<Role, string> = {
  org_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  team_admin: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  member: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  viewer: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

// ─── RBAC Toggle ─────────────────────────────────────────────────────────────

/**
 * Whether the three-tier RBAC system is enabled.
 *
 * When disabled (default), permission checks short-circuit to `true` so that
 * existing behaviour (legacy single-level RBAC in `src/lib/rbac.ts`) is preserved.
 */
export function isRbacEnabled(): boolean {
  return process.env.RBAC_ENABLED === 'true';
}

// ─── Legacy Compatibility API ──────────────────────────────────────────────────
// Backward-compatible aliases for src/lib/rbac.ts consumers.
// New code should use roleHasPermission / roleHasAllPermissions / roleHasAnyPermission.

/** @deprecated Use roleHasPermission */
export function hasPermission(role: Role | string, permission: Permission): boolean {
  return roleHasPermission(role, permission);
}
/** @deprecated Use roleHasAllPermissions */
export function hasAllPermissions(role: Role | string, permissions: Permission[]): boolean {
  return roleHasAllPermissions(role, permissions);
}
/** @deprecated Use roleHasAnyPermission */
export function hasAnyPermission(role: Role | string, permissions: Permission[]): boolean {
  return roleHasAnyPermission(role, permissions);
}

/** Map API action types to required permissions (legacy) */
export const ACTION_PERMISSION_MAP: Record<string, Permission> = {
  'dashboard': 'dashboard:read',
  'inventory_read': 'inventory:read',
  'cost_read': 'cost:read',
  'logistics_read': 'logistics:read',
  'sales_read': 'sales:read',
  'supplier_read': 'supplier:read',
  'risk_read': 'risk:read',
  'report': 'report:read',
  'analytics': 'analytics:read',
  'notes_read': 'notes:read',
  'alert_read': 'alert:read',
  'audit': 'audit:read',
  'inventory_write': 'inventory:write',
  'cost_write': 'cost:write',
  'logistics_write': 'logistics:write',
  'sales_write': 'sales:write',
  'supplier_write': 'supplier:write',
  'risk_write': 'risk:write',
  'export': 'report:export',
  'notes_write': 'notes:write',
  'alert_write': 'alert:write',
  'mcp': 'mcp:execute',
  'user': 'user:manage',
  'system': 'system:config',
};
