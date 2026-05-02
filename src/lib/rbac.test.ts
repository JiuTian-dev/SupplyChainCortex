import { describe, it, expect } from 'vitest';
import { hasPermission, hasAllPermissions, hasAnyPermission, getRolePermissions, ROLE_LABELS, ROLE_COLORS, type Role } from './rbac';

describe('RBAC Permission System', () => {
  describe('hasPermission', () => {
    it('admin has all permissions', () => {
      expect(hasPermission('admin', 'dashboard:read')).toBe(true);
      expect(hasPermission('admin', 'inventory:write')).toBe(true);
      expect(hasPermission('admin', 'user:manage')).toBe(true);
      expect(hasPermission('admin', 'system:config')).toBe(true);
    });

    it('manager has read+write but no admin permissions', () => {
      expect(hasPermission('manager', 'dashboard:read')).toBe(true);
      expect(hasPermission('manager', 'inventory:write')).toBe(true);
      expect(hasPermission('manager', 'user:manage')).toBe(false);
      expect(hasPermission('manager', 'system:config')).toBe(false);
    });

    it('viewer has only read permissions', () => {
      expect(hasPermission('viewer', 'dashboard:read')).toBe(true);
      expect(hasPermission('viewer', 'inventory:read')).toBe(true);
      expect(hasPermission('viewer', 'inventory:write')).toBe(false);
      expect(hasPermission('viewer', 'supplier:write')).toBe(false);
    });

    it('unknown role has no permissions', () => {
      expect(hasPermission('unknown', 'dashboard:read')).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('returns true when all permissions are present', () => {
      expect(hasAllPermissions('admin', ['dashboard:read', 'inventory:write'])).toBe(true);
    });

    it('returns false when any permission is missing', () => {
      expect(hasAllPermissions('viewer', ['dashboard:read', 'inventory:write'])).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('returns true when any permission is present', () => {
      expect(hasAnyPermission('viewer', ['inventory:write', 'dashboard:read'])).toBe(true);
    });

    it('returns false when no permissions are present', () => {
      expect(hasAnyPermission('viewer', ['inventory:write', 'user:manage'])).toBe(false);
    });
  });

  describe('getRolePermissions', () => {
    it('returns all permissions for admin', () => {
      const perms = getRolePermissions('admin');
      expect(perms.length).toBeGreaterThan(10);
      expect(perms).toContain('user:manage');
      expect(perms).toContain('system:config');
    });

    it('returns empty array for unknown role', () => {
      expect(getRolePermissions('unknown')).toEqual([]);
    });
  });

  describe('ROLE_LABELS', () => {
    it('has labels for all roles', () => {
      expect(ROLE_LABELS.admin).toBe('管理员');
      expect(ROLE_LABELS.manager).toBe('经理');
      expect(ROLE_LABELS.viewer).toBe('观察者');
    });
  });

  describe('ROLE_COLORS', () => {
    it('has color classes for all roles', () => {
      expect(ROLE_COLORS.admin).toBeTruthy();
      expect(ROLE_COLORS.manager).toBeTruthy();
      expect(ROLE_COLORS.viewer).toBeTruthy();
    });
  });
});
