/**
 * @deprecated 此文件已废弃，请使用 @/lib/auth/permissions。
 * 此文件保留作为源代码备份，不再被任何代码引用（所有消费者已迁移到 @/lib/auth/permissions）。
 * 迁移日期：2026-06-25
 * 兼容性：auth/permissions.ts 已添加 hasPermission/hasAllPermissions/hasAnyPermission
 *         兼容函数和 ACTION_PERMISSION_MAP，API 完全等价。
 *
 * 旧版角色 → 新版角色映射（语义等价）：
 *   admin    → org_admin
 *   manager  → team_admin
 *   viewer   → viewer
 *
 * 注意：旧版 Role 类型值（'admin'/'manager'/'viewer'）与新版（'org_admin'/'team_admin'/'member'/'viewer'）不同。
 *       迁移后的代码使用新版 Role 类型。如需保留旧版角色名，请参考 auth/permissions.ts 的 Legacy Compatibility API。
 */

/**
 * Role-Based Access Control (RBAC) Permission System
 *
 * Roles: admin, manager, viewer
 *
 * Permissions Matrix:
 * - admin: Full access to all resources
 * - manager: Read + Write access (no user management, no system config)
 * - viewer: Read-only access
 */

export type Role = 'admin' | 'manager' | 'viewer';

export type Permission =
  | 'dashboard:read'
  | 'inventory:read'
  | 'inventory:write'
  | 'cost:read'
  | 'cost:write'
  | 'logistics:read'
  | 'logistics:write'
  | 'sales:read'
  | 'sales:write'
  | 'supplier:read'
  | 'supplier:write'
  | 'risk:read'
  | 'risk:write'
  | 'report:read'
  | 'report:export'
  | 'analytics:read'
  | 'notes:read'
  | 'notes:write'
  | 'alert:read'
  | 'alert:write'
  | 'user:manage'
  | 'system:config'
  | 'audit:read'
  | 'mcp:execute';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'dashboard:read',
    'inventory:read', 'inventory:write',
    'cost:read', 'cost:write',
    'logistics:read', 'logistics:write',
    'sales:read', 'sales:write',
    'supplier:read', 'supplier:write',
    'risk:read', 'risk:write',
    'report:read', 'report:export',
    'analytics:read',
    'notes:read', 'notes:write',
    'alert:read', 'alert:write',
    'user:manage',
    'system:config',
    'audit:read',
    'mcp:execute',
  ],
  manager: [
    'dashboard:read',
    'inventory:read', 'inventory:write',
    'cost:read', 'cost:write',
    'logistics:read', 'logistics:write',
    'sales:read', 'sales:write',
    'supplier:read', 'supplier:write',
    'risk:read', 'risk:write',
    'report:read', 'report:export',
    'analytics:read',
    'notes:read', 'notes:write',
    'alert:read', 'alert:write',
    'audit:read',
    'mcp:execute',
  ],
  viewer: [
    'dashboard:read',
    'inventory:read',
    'cost:read',
    'logistics:read',
    'sales:read',
    'supplier:read',
    'risk:read',
    'report:read',
    'analytics:read',
    'notes:read',
    'alert:read',
  ],
};

/** Check if a role has a specific permission */
export function hasPermission(role: Role | string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  return perms.includes(permission);
}

/** Check if a role has ALL specified permissions */
export function hasAllPermissions(role: Role | string, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/** Check if a role has ANY of the specified permissions */
export function hasAnyPermission(role: Role | string, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/** Get all permissions for a role */
export function getRolePermissions(role: Role | string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] ?? [];
}

/** Role display labels */
export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理员',
  manager: '经理',
  viewer: '观察者',
};

/** Role badge colors */
export const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  manager: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  viewer: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

/** Map API action types to required permissions */
export const ACTION_PERMISSION_MAP: Record<string, Permission> = {
  // Read actions
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
  
  // Write actions
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
