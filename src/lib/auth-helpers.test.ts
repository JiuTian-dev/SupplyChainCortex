import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, requirePermission, requireAnyPermission, requireAdmin, getAuth } from './auth-helpers';
import { AppError, UnauthorizedError, ForbiddenError } from './api-utils';

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// Mock auth options
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// Mock db (auth module imports db)
vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { getServerSession } from 'next-auth';

const mockGetServerSession = vi.mocked(getServerSession);

describe('Auth Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('throws UnauthorizedError when no session', async () => {
      mockGetServerSession.mockResolvedValue(null);
      await expect(requireAuth()).rejects.toThrow();
    });

    it('throws UnauthorizedError with correct status when no session', async () => {
      mockGetServerSession.mockResolvedValue(null);
      try {
        await requireAuth();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as AppError).status).toBe(401);
      }
    });

    it('returns session when user is authenticated', async () => {
      const mockSession = {
        user: {
          id: 'user-1',
          email: 'admin@supply-chain.com',
          name: 'Admin',
          role: 'admin',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);
      const session = await requireAuth();
      expect(session).toEqual(mockSession);
    });

    it('throws UnauthorizedError when session has no user', async () => {
      mockGetServerSession.mockResolvedValue({});
      await expect(requireAuth()).rejects.toThrow();
    });
  });

  describe('requirePermission', () => {
    it('throws ForbiddenError when role lacks permission', async () => {
      const mockSession = {
        user: {
          id: 'user-2',
          email: 'viewer@supply-chain.com',
          name: 'Viewer',
          role: 'viewer',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);

      try {
        await requirePermission('inventory:write');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as AppError).status).toBe(403);
      }
    });

    it('returns session when role has permission', async () => {
      const mockSession = {
        user: {
          id: 'user-1',
          email: 'admin@supply-chain.com',
          name: 'Admin',
          role: 'org_admin',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);
      const session = await requirePermission('inventory:write');
      expect(session).toEqual(mockSession);
    });

    it('throws UnauthorizedError when no session', async () => {
      mockGetServerSession.mockResolvedValue(null);
      await expect(requirePermission('inventory:read')).rejects.toThrow();
    });

    it('manager has write permission for inventory', async () => {
      const mockSession = {
        user: {
          id: 'user-3',
          email: 'manager@supply-chain.com',
          name: 'Manager',
          role: 'team_admin',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);
      const session = await requirePermission('inventory:write');
      expect(session).toEqual(mockSession);
    });

    it('viewer lacks user:manage permission', async () => {
      const mockSession = {
        user: {
          id: 'user-2',
          email: 'viewer@supply-chain.com',
          name: 'Viewer',
          role: 'viewer',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);

      try {
        await requirePermission('user:manage');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as AppError).status).toBe(403);
      }
    });
  });

  describe('requireAnyPermission', () => {
    it('returns session when user has at least one permission', async () => {
      const mockSession = {
        user: {
          id: 'user-2',
          email: 'viewer@supply-chain.com',
          name: 'Viewer',
          role: 'viewer',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);
      const session = await requireAnyPermission(['inventory:write', 'inventory:read']);
      expect(session).toEqual(mockSession);
    });

    it('throws ForbiddenError when user has none of the permissions', async () => {
      const mockSession = {
        user: {
          id: 'user-2',
          email: 'viewer@supply-chain.com',
          name: 'Viewer',
          role: 'viewer',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);

      try {
        await requireAnyPermission(['inventory:write', 'user:manage']);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as AppError).status).toBe(403);
      }
    });

    it('throws UnauthorizedError when no session', async () => {
      mockGetServerSession.mockResolvedValue(null);
      await expect(requireAnyPermission(['inventory:read'])).rejects.toThrow();
    });
  });

  describe('requireAdmin', () => {
    it('throws ForbiddenError for non-admin role', async () => {
      const mockSession = {
        user: {
          id: 'user-2',
          email: 'viewer@supply-chain.com',
          name: 'Viewer',
          role: 'viewer',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);

      try {
        await requireAdmin();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as AppError).status).toBe(403);
      }
    });

    it('returns session for admin role', async () => {
      const mockSession = {
        user: {
          id: 'user-1',
          email: 'admin@supply-chain.com',
          name: 'Admin',
          role: 'org_admin',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);
      const session = await requireAdmin();
      expect(session).toEqual(mockSession);
    });

    it('throws ForbiddenError for manager role', async () => {
      const mockSession = {
        user: {
          id: 'user-3',
          email: 'manager@supply-chain.com',
          name: 'Manager',
          role: 'manager',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);

      try {
        await requireAdmin();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as AppError).status).toBe(403);
      }
    });

    it('throws UnauthorizedError when no session', async () => {
      mockGetServerSession.mockResolvedValue(null);
      await expect(requireAdmin()).rejects.toThrow();
    });
  });

  describe('getAuth', () => {
    it('returns null when no session', async () => {
      mockGetServerSession.mockResolvedValue(null);
      const result = await getAuth();
      expect(result).toBeNull();
    });

    it('returns session when user is authenticated', async () => {
      const mockSession = {
        user: {
          id: 'user-1',
          email: 'admin@supply-chain.com',
          name: 'Admin',
          role: 'admin',
        },
      };
      mockGetServerSession.mockResolvedValue(mockSession);
      const result = await getAuth();
      expect(result).toEqual(mockSession);
    });
  });
});
