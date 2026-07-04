import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess, apiError, validateBody, validateRequest, parsePagination, apiPaginated } from '@/lib/api-utils';
import { requireAdmin, requireAuth } from '@/lib/auth-helpers';
import { getUsers, createUser, updateUser, changePassword, getUserById } from '@/lib/services/user.service';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Role } from '@/lib/auth/permissions';

const createUserSchema = z.object({
  email: z.string().email('邮箱格式无效'),
  name: z.string().min(1, '姓名不能为空').max(50),
  password: z.string().min(6, '密码至少6位'),
  role: z.enum(['org_admin', 'team_admin', 'member', 'viewer']).default('viewer'),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  role: z.enum(['org_admin', 'team_admin', 'member', 'viewer']).optional(),
  isActive: z.boolean().optional(),
  avatar: z.string().optional(),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(6, '新密码至少6位'),
});

const selfChangePasswordSchema = z.object({
  action: z.literal('change_password'),
  userId: z.string().min(1, '用户ID不能为空'),
  oldPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(8, '新密码至少8位'),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();
  
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';
  
  switch (action) {
    case 'list': {
      const { page, pageSize } = parsePagination(searchParams);
      const allUsers = await getUsers();
      const start = (page - 1) * pageSize;
      const paginatedUsers = allUsers.slice(start, start + pageSize);
      return apiPaginated(paginatedUsers, {
        page,
        pageSize,
        total: allUsers.length,
        totalPages: Math.ceil(allUsers.length / pageSize) || 1,
      });
    }
    case 'detail': {
      const id = searchParams.get('id');
      if (!id) return apiSuccess(null);
      const user = await getUserById(id);
      return apiSuccess(user);
    }
    default:
      return apiSuccess({ error: 'Unknown action' });
  }
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();
  const result = validateRequest(createUserSchema, await request.json());
  if (!result.success) return result.error!;
  const user = await createUser(result.data!);
  return apiSuccess(user, 201);
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();

  // Handle self-service password change (action=change_password)
  if (body.action === 'change_password') {
    const result = validateRequest(selfChangePasswordSchema, body);
    if (!result.success) return result.error!;
    if (!result.data) return apiError('Invalid data', 400, 'INVALID_DATA');

    const { userId, oldPassword, newPassword } = result.data;

    // Verify the user is changing their own password
    const session = await requireAuth();
    const sessionUserId = (session.user as Record<string, unknown>).id as string;
    if (sessionUserId !== userId) {
      return apiError('只能修改自己的密码', 403, 'FORBIDDEN');
    }

    // Verify old password
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return apiError('用户不存在', 404, 'NOT_FOUND');
    }

    const isValidOld = await bcrypt.compare(oldPassword, user.password);
    if (!isValidOld) {
      return apiError('当前密码错误', 400, 'INVALID_PASSWORD');
    }

    // Change password
    await changePassword(userId, newPassword);
    return apiSuccess({ success: true, message: '密码修改成功' });
  }

  // All other PUT operations require admin
  await requireAdmin();
  const { id, ...updateData } = body;
  
  if (!id) {
    return apiSuccess({ error: 'User ID required' });
  }
  
  // Check if admin is resetting password (newPassword without action)
  if (updateData.newPassword) {
    const pwResult = validateRequest(changePasswordSchema, { newPassword: updateData.newPassword });
    if (!pwResult.success) return pwResult.error!;
    await changePassword(id, updateData.newPassword);
    return apiSuccess({ success: true });
  }
  
  const result = validateRequest(updateUserSchema, updateData);
  if (!result.success) return result.error!;
  const user = await updateUser(id, result.data!);
  return apiSuccess(user);
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return apiSuccess({ error: 'User ID required' });
  }
  const user = await updateUser(id, { isActive: false });
  return apiSuccess(user);
});
