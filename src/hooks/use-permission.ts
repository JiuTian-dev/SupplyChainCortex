'use client';

import { useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import type { Permission, Role } from '@/lib/rbac';

/**
 * Check if the current user has a specific permission.
 * Returns boolean for quick one-permission checks.
 */
export function usePermission(permission: Permission): boolean {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  return hasPermission(permission);
}

/**
 * Comprehensive permission hook with multiple check methods.
 * Returns an object with has, hasAny, hasAll functions plus role & auth state.
 */
export function usePermissions() {
  const permissions = useAuthStore((s) => s.permissions);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  const has = useCallback(
    (p: Permission) => permissions.includes(p),
    [permissions]
  );

  const hasAny = useCallback(
    (ps: Permission[]) => ps.some((p) => permissions.includes(p)),
    [permissions]
  );

  const hasAll = useCallback(
    (ps: Permission[]) => ps.every((p) => permissions.includes(p)),
    [permissions]
  );

  return {
    has,
    hasAny,
    hasAll,
    role: (user?.role as Role) ?? null,
    isAuthenticated,
    isLoading,
  };
}
