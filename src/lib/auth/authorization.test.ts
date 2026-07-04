/**
 * Tests for the three-tier RBAC authorization system.
 *
 * Covers:
 *  - Permission model (permissions.ts): role→permission mapping, helpers.
 *  - Authorization service (authorization.ts): checkPermission, getUserPermissions,
 *    getUserRole, resource-level checks, require* helpers, caching.
 *  - Team service (team.service.ts): CRUD + pagination + member management.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock fixtures ───────────────────────────────────────────────────
// Defined via vi.hoisted so they are available inside vi.mock factories.
const {
  mockUserFindUnique,
  mockUserFindMany,
  mockTeamFindUnique,
  mockTeamFindMany,
  mockTeamCreate,
  mockTeamUpdate,
  mockTeamDelete,
  mockTeamCount,
  mockTeamMemberFindUnique,
  mockTeamMemberFindMany,
  mockTeamMemberCreate,
  mockTeamMemberDelete,
  mockTeamMemberUpdate,
  mockTeamMemberCount,
  mockGetServerSession,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockTeamFindUnique: vi.fn(),
  mockTeamFindMany: vi.fn(),
  mockTeamCreate: vi.fn(),
  mockTeamUpdate: vi.fn(),
  mockTeamDelete: vi.fn(),
  mockTeamCount: vi.fn(),
  mockTeamMemberFindUnique: vi.fn(),
  mockTeamMemberFindMany: vi.fn(),
  mockTeamMemberCreate: vi.fn(),
  mockTeamMemberDelete: vi.fn(),
  mockTeamMemberUpdate: vi.fn(),
  mockTeamMemberCount: vi.fn(),
  mockGetServerSession: vi.fn(),
}));

// Mock the database client
vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
    },
    team: {
      findUnique: mockTeamFindUnique,
      findMany: mockTeamFindMany,
      create: mockTeamCreate,
      update: mockTeamUpdate,
      delete: mockTeamDelete,
      count: mockTeamCount,
    },
    teamMember: {
      findUnique: mockTeamMemberFindUnique,
      findMany: mockTeamMemberFindMany,
      create: mockTeamMemberCreate,
      delete: mockTeamMemberDelete,
      update: mockTeamMemberUpdate,
      count: mockTeamMemberCount,
    },
  },
}));

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}));

// Mock auth options (the auth.ts module imports db which we've mocked)
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// ─── Imports under test ──────────────────────────────────────────────────────
import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  ROLE_COLORS,
  isValidRole,
  isValidPermission,
  getRolePermissions,
  roleHasPermission,
  roleHasAllPermissions,
  roleHasAnyPermission,
  isRbacEnabled,
} from './permissions';

import {
  checkPermission,
  checkPermissionForResource,
  getUserPermissions,
  getUserRole,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  invalidateUserPermissionCache,
  clearPermissionCache,
} from './authorization';

import {
  createTeam,
  getTeam,
  listTeams,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  updateMemberRole,
  getTeamMembers,
} from '@/lib/services/team.service';

import { AppError } from '@/lib/api-utils';

// ─── Test setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearPermissionCache();
  // Default: RBAC disabled (backward compat).
  vi.stubEnv('RBAC_ENABLED', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearPermissionCache();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. PERMISSION MODEL (permissions.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe('Permission Model', () => {
  describe('role-permission mapping', () => {
    it('org_admin has every permission', () => {
      expect(ROLE_PERMISSIONS.org_admin).toEqual(expect.arrayContaining(ALL_PERMISSIONS));
      expect(ROLE_PERMISSIONS.org_admin.length).toBe(ALL_PERMISSIONS.length);
    });

    it('team_admin has team:manage but not org:manage or billing:manage', () => {
      expect(roleHasPermission('team_admin', 'team:manage')).toBe(true);
      expect(roleHasPermission('team_admin', 'org:manage')).toBe(false);
      expect(roleHasPermission('team_admin', 'billing:manage')).toBe(false);
    });

    it('member has business read/write but no management permissions', () => {
      expect(roleHasPermission('member', 'inventory:write')).toBe(true);
      expect(roleHasPermission('member', 'cost:read')).toBe(true);
      expect(roleHasPermission('member', 'user:manage')).toBe(false);
      expect(roleHasPermission('member', 'team:manage')).toBe(false);
      expect(roleHasPermission('member', 'org:manage')).toBe(false);
    });

    it('viewer has only read permissions', () => {
      expect(roleHasPermission('viewer', 'inventory:read')).toBe(true);
      expect(roleHasPermission('viewer', 'inventory:write')).toBe(false);
      expect(roleHasPermission('viewer', 'cost:write')).toBe(false);
      expect(roleHasPermission('viewer', 'audit:read')).toBe(true);
    });
  });

  describe('validation helpers', () => {
    it('isValidRole returns true for all defined roles', () => {
      for (const r of ALL_ROLES) {
        expect(isValidRole(r)).toBe(true);
      }
    });

    it('isValidRole returns false for unknown roles', () => {
      expect(isValidRole('superadmin')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole(null)).toBe(false);
    });

    it('isValidPermission returns true for valid permissions', () => {
      expect(isValidPermission('inventory:read')).toBe(true);
      expect(isValidPermission('org:manage')).toBe(true);
    });

    it('isValidPermission returns false for unknown permissions', () => {
      expect(isValidPermission('inventory:delete')).toBe(false);
      expect(isValidPermission('')).toBe(false);
    });
  });

  describe('getRolePermissions', () => {
    it('returns permissions array for known roles', () => {
      const perms = getRolePermissions('member');
      expect(perms).toContain('inventory:read');
      expect(perms).toContain('inventory:write');
      expect(perms.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown roles', () => {
      expect(getRolePermissions('unknown')).toEqual([]);
    });
  });

  describe('roleHasAnyPermission / roleHasAllPermissions', () => {
    it('roleHasAnyPermission returns true when at least one matches', () => {
      expect(roleHasAnyPermission('viewer', ['inventory:write', 'inventory:read'])).toBe(true);
    });

    it('roleHasAnyPermission returns false when none match', () => {
      expect(roleHasAnyPermission('viewer', ['inventory:write', 'user:manage'])).toBe(false);
    });

    it('roleHasAllPermissions returns false when not all match', () => {
      expect(roleHasAllPermissions('viewer', ['inventory:read', 'inventory:write'])).toBe(false);
    });

    it('roleHasAllPermissions returns true when all match', () => {
      expect(roleHasAllPermissions('member', ['inventory:read', 'inventory:write'])).toBe(true);
    });
  });

  describe('display metadata', () => {
    it('ROLE_LABELS has an entry for every role', () => {
      for (const r of ALL_ROLES) {
        expect(ROLE_LABELS[r]).toBeTruthy();
      }
    });

    it('ROLE_COLORS has an entry for every role', () => {
      for (const r of ALL_ROLES) {
        expect(ROLE_COLORS[r]).toBeTruthy();
      }
    });
  });

  describe('isRbacEnabled', () => {
    it('returns false by default', () => {
      vi.stubEnv('RBAC_ENABLED', '');
      expect(isRbacEnabled()).toBe(false);
    });

    it('returns true when RBAC_ENABLED=true', () => {
      vi.stubEnv('RBAC_ENABLED', 'true');
      expect(isRbacEnabled()).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. AUTHORIZATION SERVICE (authorization.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe('Authorization Service', () => {
  describe('backward compatibility (RBAC disabled)', () => {
    it('checkPermission returns true when RBAC is disabled', async () => {
      vi.stubEnv('RBAC_ENABLED', '');
      const ok = await checkPermission('user-1', 'inventory:write');
      expect(ok).toBe(true);
    });

    it('getUserPermissions returns ALL_PERMISSIONS when RBAC is disabled', async () => {
      vi.stubEnv('RBAC_ENABLED', '');
      const perms = await getUserPermissions('user-1');
      expect(perms).toEqual(expect.arrayContaining(ALL_PERMISSIONS));
      expect(perms.length).toBe(ALL_PERMISSIONS.length);
    });

    it('checkPermissionForResource returns true when RBAC is disabled', async () => {
      vi.stubEnv('RBAC_ENABLED', '');
      const ok = await checkPermissionForResource('user-1', 'inventory:write', 'team', 'team-1');
      expect(ok).toBe(true);
    });
  });

  describe('checkPermission (RBAC enabled)', () => {
    beforeEach(() => {
      vi.stubEnv('RBAC_ENABLED', 'true');
    });

    it('returns true for org_admin with any permission', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'org_admin' });
      mockTeamMemberFindMany.mockResolvedValue([]);
      const ok = await checkPermission('user-1', 'org:manage');
      expect(ok).toBe(true);
    });

    it('returns false for viewer with write permission', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'viewer' });
      mockTeamMemberFindMany.mockResolvedValue([]);
      const ok = await checkPermission('user-1', 'inventory:write');
      expect(ok).toBe(false);
    });

    it('returns true for member with inventory:write', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'member' });
      mockTeamMemberFindMany.mockResolvedValue([]);
      const ok = await checkPermission('user-1', 'inventory:write');
      expect(ok).toBe(true);
    });

    it('returns true for team_admin via team membership', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'viewer' });
      mockTeamMemberFindMany.mockResolvedValue([{ role: 'team_admin' }]);
      const ok = await checkPermission('user-1', 'team:manage');
      expect(ok).toBe(true);
    });
  });

  describe('getUserRole', () => {
    it('returns org role from User.orgRole', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'org_admin' });
      const result = await getUserRole('user-1');
      expect(result.orgRole).toBe('org_admin');
      expect(result.effectiveRole).toBe('org_admin');
    });

    it('returns team role when teamId is provided', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'viewer' });
      mockTeamMemberFindUnique.mockResolvedValue({ role: 'team_admin' });
      const result = await getUserRole('user-1', 'team-1');
      expect(result.teamRole).toBe('team_admin');
      expect(result.effectiveRole).toBe('team_admin'); // team_admin > viewer
    });

    it('defaults to viewer when no roles assigned', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: null });
      const result = await getUserRole('user-1');
      expect(result.orgRole).toBeNull();
      expect(result.effectiveRole).toBe('viewer');
    });

    it('picks the highest-privilege role (org_admin over team member)', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'org_admin' });
      mockTeamMemberFindUnique.mockResolvedValue({ role: 'member' });
      const result = await getUserRole('user-1', 'team-1');
      expect(result.effectiveRole).toBe('org_admin');
    });
  });

  describe('getUserPermissions caching', () => {
    beforeEach(() => {
      vi.stubEnv('RBAC_ENABLED', 'true');
    });

    it('caches permissions so db is only queried once', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'member' });
      mockTeamMemberFindMany.mockResolvedValue([]);

      await getUserPermissions('user-1');
      await getUserPermissions('user-1');
      await getUserPermissions('user-1');

      // user.findUnique should be called only once (cache hit on subsequent calls)
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
    });

    it('invalidateUserPermissionCache forces a fresh db query', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'member' });
      mockTeamMemberFindMany.mockResolvedValue([]);

      await getUserPermissions('user-1');
      invalidateUserPermissionCache('user-1');
      await getUserPermissions('user-1');

      expect(mockUserFindUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkPermissionForResource', () => {
    beforeEach(() => {
      vi.stubEnv('RBAC_ENABLED', 'true');
    });

    it('org_admin bypasses team scope for team resource', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'org_admin' });
      mockTeamMemberFindUnique.mockResolvedValue(null);
      mockTeamMemberFindMany.mockResolvedValue([]);
      const ok = await checkPermissionForResource('user-1', 'inventory:read', 'team', 'team-1');
      expect(ok).toBe(true);
    });

    it('viewer can read team-scoped resource when team member', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'viewer' });
      mockTeamMemberFindUnique.mockResolvedValue({ role: 'viewer' });
      mockTeamMemberFindMany.mockResolvedValue([{ role: 'viewer' }]);
      const ok = await checkPermissionForResource('user-1', 'inventory:read', 'team', 'team-1');
      expect(ok).toBe(true);
    });

    it('viewer cannot write team-scoped resource', async () => {
      mockUserFindUnique.mockResolvedValue({ orgRole: 'viewer' });
      mockTeamMemberFindUnique.mockResolvedValue({ role: 'viewer' });
      mockTeamMemberFindMany.mockResolvedValue([{ role: 'viewer' }]);
      const ok = await checkPermissionForResource('user-1', 'inventory:write', 'team', 'team-1');
      expect(ok).toBe(false);
    });
  });

  describe('requirePermission / requireAnyPermission / requireAllPermissions', () => {
    it('requirePermission throws UnauthorizedError when userId is null', async () => {
      await expect(requirePermission(null, 'inventory:read')).rejects.toThrow();
      try {
        await requirePermission(null, 'inventory:read');
      } catch (error) {
        expect((error as AppError).status).toBe(401);
      }
    });

    it('requirePermission throws ForbiddenError when permission missing', async () => {
      vi.stubEnv('RBAC_ENABLED', 'true');
      mockUserFindUnique.mockResolvedValue({ orgRole: 'viewer' });
      mockTeamMemberFindMany.mockResolvedValue([]);
      try {
        await requirePermission('user-1', 'inventory:write');
      } catch (error) {
        expect((error as AppError).status).toBe(403);
      }
    });

    it('requirePermission returns userId when permission granted', async () => {
      vi.stubEnv('RBAC_ENABLED', 'true');
      mockUserFindUnique.mockResolvedValue({ orgRole: 'member' });
      mockTeamMemberFindMany.mockResolvedValue([]);
      const result = await requirePermission('user-1', 'inventory:write');
      expect(result).toBe('user-1');
    });

    it('requireAnyPermission passes when user has one of the permissions', async () => {
      vi.stubEnv('RBAC_ENABLED', 'true');
      mockUserFindUnique.mockResolvedValue({ orgRole: 'viewer' });
      mockTeamMemberFindMany.mockResolvedValue([]);
      // viewer has inventory:read but not inventory:write
      const result = await requireAnyPermission('user-1', ['inventory:write', 'inventory:read']);
      expect(result).toBe('user-1');
    });

    it('requireAllPermissions fails when user lacks one permission', async () => {
      vi.stubEnv('RBAC_ENABLED', 'true');
      mockUserFindUnique.mockResolvedValue({ orgRole: 'viewer' });
      mockTeamMemberFindMany.mockResolvedValue([]);
      try {
        await requireAllPermissions('user-1', ['inventory:read', 'inventory:write']);
      } catch (error) {
        expect((error as AppError).status).toBe(403);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. TEAM SERVICE (team.service.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe('Team Service', () => {
  describe('createTeam', () => {
    it('creates a team with the provided data', async () => {
      const mockTeam = {
        id: 'team-1', name: 'Alpha Team', orgId: 'org-1',
        description: 'First team', createdAt: new Date(), updatedAt: new Date(),
      };
      mockTeamCreate.mockResolvedValue(mockTeam);

      const result = await createTeam({ name: 'Alpha Team', orgId: 'org-1', description: 'First team' });
      expect(result).toEqual(mockTeam);
      expect(mockTeamCreate).toHaveBeenCalledWith({
        data: { name: 'Alpha Team', orgId: 'org-1', description: 'First team' },
        select: expect.objectContaining({ id: true, name: true, orgId: true }),
      });
    });
  });

  describe('getTeam', () => {
    it('returns a team by id', async () => {
      const mockTeam = { id: 'team-1', name: 'Alpha', orgId: 'org-1', description: null, createdAt: new Date(), updatedAt: new Date() };
      mockTeamFindUnique.mockResolvedValue(mockTeam);
      const result = await getTeam('team-1');
      expect(result).toEqual(mockTeam);
    });

    it('returns null when team not found', async () => {
      mockTeamFindUnique.mockResolvedValue(null);
      const result = await getTeam('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listTeams', () => {
    it('returns paginated teams for an organization', async () => {
      const mockTeams = [
        { id: 'team-1', name: 'A', orgId: 'org-1', description: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'team-2', name: 'B', orgId: 'org-1', description: null, createdAt: new Date(), updatedAt: new Date() },
      ];
      mockTeamCount.mockResolvedValue(2);
      mockTeamFindMany.mockResolvedValue(mockTeams);

      const result = await listTeams('org-1', { page: 1, pageSize: 10 });
      expect(result.data).toEqual(mockTeams);
      expect(result.pagination).toEqual({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
    });

    it('applies skip/take for pagination', async () => {
      mockTeamCount.mockResolvedValue(25);
      mockTeamFindMany.mockResolvedValue([]);
      await listTeams('org-1', { page: 3, pageSize: 10 });
      expect(mockTeamFindMany).toHaveBeenCalledWith(expect.objectContaining({
        skip: 20,
        take: 10,
      }));
    });
  });

  describe('addTeamMember', () => {
    it('adds a member with default role "member"', async () => {
      mockTeamFindUnique.mockResolvedValue({ id: 'team-1' });
      mockUserFindUnique.mockResolvedValue({ id: 'user-1' });
      mockTeamMemberFindUnique.mockResolvedValue(null); // not existing
      const mockMember = { id: 'tm-1', teamId: 'team-1', userId: 'user-1', role: 'member', createdAt: new Date(), updatedAt: new Date() };
      mockTeamMemberCreate.mockResolvedValue(mockMember);

      const result = await addTeamMember({ teamId: 'team-1', userId: 'user-1' });
      expect(result).toEqual(mockMember);
      expect(mockTeamMemberCreate).toHaveBeenCalledWith({
        data: { teamId: 'team-1', userId: 'user-1', role: 'member' },
        select: expect.objectContaining({ teamId: true, userId: true, role: true }),
      });
    });

    it('throws ConflictError when user is already a member', async () => {
      mockTeamFindUnique.mockResolvedValue({ id: 'team-1' });
      mockUserFindUnique.mockResolvedValue({ id: 'user-1' });
      mockTeamMemberFindUnique.mockResolvedValue({ id: 'tm-1', role: 'member' });

      await expect(addTeamMember({ teamId: 'team-1', userId: 'user-1' })).rejects.toThrow();
    });

    it('throws NotFoundError when team does not exist', async () => {
      mockTeamFindUnique.mockResolvedValue(null);
      await expect(addTeamMember({ teamId: 'nope', userId: 'user-1' })).rejects.toThrow();
    });
  });

  describe('removeTeamMember', () => {
    it('removes a member from the team', async () => {
      mockTeamMemberFindUnique.mockResolvedValue({ id: 'tm-1', teamId: 'team-1', userId: 'user-1' });
      mockTeamMemberDelete.mockResolvedValue({});

      const result = await removeTeamMember('team-1', 'user-1');
      expect(result).toEqual({ success: true });
      expect(mockTeamMemberDelete).toHaveBeenCalledWith({
        where: { teamId_userId: { teamId: 'team-1', userId: 'user-1' } },
      });
    });

    it('throws NotFoundError when membership does not exist', async () => {
      mockTeamMemberFindUnique.mockResolvedValue(null);
      await expect(removeTeamMember('team-1', 'user-1')).rejects.toThrow();
    });
  });

  describe('updateMemberRole', () => {
    it('updates the role of a team member', async () => {
      mockTeamMemberFindUnique.mockResolvedValue({ id: 'tm-1', role: 'member' });
      const mockUpdated = { id: 'tm-1', teamId: 'team-1', userId: 'user-1', role: 'team_admin', updatedAt: new Date() };
      mockTeamMemberUpdate.mockResolvedValue(mockUpdated);

      const result = await updateMemberRole('team-1', 'user-1', 'team_admin');
      expect(result).toEqual(mockUpdated);
      expect(mockTeamMemberUpdate).toHaveBeenCalledWith({
        where: { teamId_userId: { teamId: 'team-1', userId: 'user-1' } },
        data: { role: 'team_admin' },
        select: expect.objectContaining({ role: true }),
      });
    });
  });

  describe('getTeamMembers', () => {
    it('returns paginated team members with user info', async () => {
      const mockMembers = [
        {
          id: 'tm-1', teamId: 'team-1', userId: 'user-1', role: 'member',
          createdAt: new Date(), updatedAt: new Date(),
          user: { id: 'user-1', name: 'Alice', email: 'alice@test.com', avatar: null },
        },
      ];
      mockTeamMemberCount.mockResolvedValue(1);
      mockTeamMemberFindMany.mockResolvedValue(mockMembers);

      const result = await getTeamMembers('team-1', { page: 1, pageSize: 20 });
      expect(result.data).toEqual(mockMembers);
      expect(result.pagination.total).toBe(1);
      expect(result.data[0].user.name).toBe('Alice');
    });

    it('applies pagination correctly for page 2', async () => {
      mockTeamMemberCount.mockResolvedValue(50);
      mockTeamMemberFindMany.mockResolvedValue([]);
      await getTeamMembers('team-1', { page: 2, pageSize: 20 });
      expect(mockTeamMemberFindMany).toHaveBeenCalledWith(expect.objectContaining({
        skip: 20,
        take: 20,
      }));
    });
  });

  describe('deleteTeam', () => {
    it('deletes a team and invalidates member caches', async () => {
      mockTeamFindUnique.mockResolvedValue({ id: 'team-1' });
      mockTeamMemberFindMany.mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]);
      mockTeamDelete.mockResolvedValue({ id: 'team-1' });

      await deleteTeam('team-1');
      expect(mockTeamDelete).toHaveBeenCalledWith({ where: { id: 'team-1' } });
    });

    it('throws NotFoundError when team does not exist', async () => {
      mockTeamFindUnique.mockResolvedValue(null);
      await expect(deleteTeam('nope')).rejects.toThrow();
    });
  });
});
