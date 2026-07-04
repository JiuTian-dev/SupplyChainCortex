import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  changePassword,
  deactivateUser,
  seedDefaultAdmin,
} from './user.service';

// Use vi.hoisted to define mocks that will be available in hoisted vi.mock factories
const {
  mockUserFindMany,
  mockUserFindUnique,
  mockUserCreate,
  mockUserUpdate,
  mockUserCount,
  mockBcryptHash,
} = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserCount: vi.fn(),
  mockBcryptHash: vi.fn().mockResolvedValue('$2a$10$hashedpassword'),
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    hash: mockBcryptHash,
  },
}));

// Mock db
vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findMany: mockUserFindMany,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
      count: mockUserCount,
    },
  },
}));

describe('User Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBcryptHash.mockResolvedValue('$2a$10$hashedpassword');
  });

  describe('getUsers', () => {
    it('returns list of users without passwords', async () => {
      const mockUsers = [
        { id: '1', email: 'admin@test.com', name: 'Admin', role: 'admin', avatar: null, isActive: true, lastLoginAt: null, createdAt: new Date() },
        { id: '2', email: 'viewer@test.com', name: 'Viewer', role: 'viewer', avatar: null, isActive: true, lastLoginAt: null, createdAt: new Date() },
      ];
      mockUserFindMany.mockResolvedValue(mockUsers);

      const result = await getUsers();
      expect(result).toEqual(mockUsers);
      expect(mockUserFindMany).toHaveBeenCalledWith({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns empty array when no users', async () => {
      mockUserFindMany.mockResolvedValue([]);
      const result = await getUsers();
      expect(result).toEqual([]);
    });
  });

  describe('getUserById', () => {
    it('returns user by id without password', async () => {
      const mockUser = { id: '1', email: 'admin@test.com', name: 'Admin', role: 'admin', avatar: null, isActive: true, lastLoginAt: null, createdAt: new Date() };
      mockUserFindUnique.mockResolvedValue(mockUser);

      const result = await getUserById('1');
      expect(result).toEqual(mockUser);
      expect(mockUserFindUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        select: expect.objectContaining({ id: true, email: true }),
      });
    });

    it('returns null when user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const result = await getUserById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('hashes password and creates user with correct role', async () => {
      const mockCreatedUser = {
        id: 'new-1',
        email: 'new@test.com',
        name: 'New User',
        role: 'viewer',
        isActive: true,
        createdAt: new Date(),
      };
      mockUserCreate.mockResolvedValue(mockCreatedUser);

      const result = await createUser({
        email: 'new@test.com',
        name: 'New User',
        password: 'password123',
      });

      expect(result).toEqual(mockCreatedUser);
      // bcrypt.hash should be called
      expect(mockBcryptHash).toHaveBeenCalledWith('password123', 10);
      // db.user.create should be called with hashed password
      expect(mockUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@test.com',
          name: 'New User',
          password: '$2a$10$hashedpassword',
          role: 'viewer', // default role
        }),
        select: expect.objectContaining({ id: true, email: true, role: true }),
      });
    });

    it('creates user with specified role', async () => {
      mockUserCreate.mockResolvedValue({ id: '1', email: 'a@b.com', name: 'A', role: 'manager', isActive: true, createdAt: new Date() });

      await createUser({
        email: 'a@b.com',
        name: 'A',
        password: 'pass',
        role: 'manager',
      });

      expect(mockUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'manager' }),
        select: expect.any(Object),
      });
    });

    it('defaults to viewer role when role not specified', async () => {
      mockUserCreate.mockResolvedValue({ id: '1', email: 'a@b.com', name: 'A', role: 'viewer', isActive: true, createdAt: new Date() });

      await createUser({
        email: 'a@b.com',
        name: 'A',
        password: 'pass',
      });

      expect(mockUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'viewer' }),
        select: expect.any(Object),
      });
    });
  });

  describe('updateUser', () => {
    it('updates allowed fields', async () => {
      const mockUpdated = { id: '1', email: 'a@b.com', name: 'Updated', role: 'manager', isActive: true, updatedAt: new Date() };
      mockUserUpdate.mockResolvedValue(mockUpdated);

      const result = await updateUser('1', { name: 'Updated', role: 'manager' });
      expect(result).toEqual(mockUpdated);
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Updated', role: 'manager' },
        select: expect.objectContaining({ id: true, name: true, role: true }),
      });
    });

    it('updates only provided fields', async () => {
      mockUserUpdate.mockResolvedValue({ id: '1', email: 'a@b.com', name: 'A', role: 'admin', isActive: true, updatedAt: new Date() });

      await updateUser('1', { name: 'New Name' });
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'New Name' },
        select: expect.any(Object),
      });
    });

    it('deactivates user via isActive field', async () => {
      mockUserUpdate.mockResolvedValue({ id: '1', email: 'a@b.com', name: 'A', role: 'admin', isActive: false, updatedAt: new Date() });

      await updateUser('1', { isActive: false });
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: false },
        select: expect.any(Object),
      });
    });
  });

  describe('changePassword', () => {
    it('hashes new password and updates', async () => {
      mockUserUpdate.mockResolvedValue({ id: '1', password: '$2a$10$hashedpassword' });

      await changePassword('1', 'newpass123');

      expect(mockBcryptHash).toHaveBeenCalledWith('newpass123', 10);
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { password: '$2a$10$hashedpassword' },
      });
    });
  });

  describe('deactivateUser', () => {
    it('sets isActive to false', async () => {
      mockUserUpdate.mockResolvedValue({ id: '1', isActive: false });

      await deactivateUser('1');
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: false },
      });
    });
  });

  describe('seedDefaultAdmin', () => {
    it('creates 3 users when no users exist', async () => {
      mockUserCount.mockResolvedValue(0);
      mockUserCreate.mockResolvedValue({ id: 'seed-1' });

      await seedDefaultAdmin();

      expect(mockUserCount).toHaveBeenCalled();
      expect(mockUserCreate).toHaveBeenCalledTimes(3); // admin, manager, viewer
    });

    it('does not create users when users already exist', async () => {
      mockUserCount.mockResolvedValue(5);

      await seedDefaultAdmin();

      expect(mockUserCount).toHaveBeenCalled();
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it('creates admin user with correct email and role', async () => {
      mockUserCount.mockResolvedValue(0);
      mockUserCreate.mockResolvedValue({ id: 'seed-1' });

      await seedDefaultAdmin();

      // First call should be admin
      expect(mockUserCreate).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          email: 'admin@supply-chain.com',
          name: '系统管理员',
          role: 'org_admin',
        }),
        select: expect.any(Object),
      });
    });

    it('creates manager user with correct email and role', async () => {
      mockUserCount.mockResolvedValue(0);
      mockUserCreate.mockResolvedValue({ id: 'seed-2' });

      await seedDefaultAdmin();

      expect(mockUserCreate).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          email: 'manager@supply-chain.com',
          name: '运营经理',
          role: 'team_admin',
        }),
        select: expect.any(Object),
      });
    });

    it('creates viewer user with correct email and role', async () => {
      mockUserCount.mockResolvedValue(0);
      mockUserCreate.mockResolvedValue({ id: 'seed-3' });

      await seedDefaultAdmin();

      expect(mockUserCreate).toHaveBeenNthCalledWith(3, {
        data: expect.objectContaining({
          email: 'viewer@supply-chain.com',
          name: '观察者',
          role: 'viewer',
        }),
        select: expect.any(Object),
      });
    });
  });
});
