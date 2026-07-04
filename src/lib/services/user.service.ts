/**
 * User management service
 */
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import type { Role } from '@/lib/auth/permissions';

const SALT_ROUNDS = 10;

/** Get all users (admin only) */
export async function getUsers() {
  return db.user.findMany({
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
}

/** Get user by ID */
export async function getUserById(id: string) {
  return db.user.findUnique({
    where: { id },
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
  });
}

/** Create a new user */
export async function createUser(data: {
  email: string;
  name: string;
  password: string;
  role?: Role;
}) {
  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
  return db.user.create({
    data: {
      email: data.email,
      name: data.name,
      password: hashedPassword,
      role: data.role ?? 'viewer',
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
}

/** Update user */
export async function updateUser(
  id: string,
  data: { name?: string; role?: Role; isActive?: boolean; avatar?: string }
) {
  return db.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  });
}

/** Change password */
export async function changePassword(id: string, newPassword: string) {
  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  return db.user.update({
    where: { id },
    data: { password: hashedPassword },
  });
}

/** Deactivate user */
export async function deactivateUser(id: string) {
  return db.user.update({
    where: { id },
    data: { isActive: false },
  });
}

/** Seed default admin user if no users exist */
export async function seedDefaultAdmin() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    await createUser({
      email: 'admin@supply-chain.com',
      name: '系统管理员',
      password: 'admin123',
      role: 'org_admin',
    });
    // Also create a manager and viewer for demo
    await createUser({
      email: 'manager@supply-chain.com',
      name: '运营经理',
      password: 'manager123',
      role: 'team_admin',
    });
    await createUser({
      email: 'viewer@supply-chain.com',
      name: '观察者',
      password: 'viewer123',
      role: 'viewer',
    });
    if (process.env.NODE_ENV === 'development') console.log('✅ Default users seeded: admin, manager, viewer');
  }
}
