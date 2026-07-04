/**
 * Team management service — Organization → Team → User three-tier RBAC.
 *
 * Provides CRUD operations for teams and their members, with pagination
 * support for listing teams and members.
 */
import { db } from '@/lib/db';
import { NotFoundError, ConflictError } from '@/lib/api-utils';
import { isValidRole, type Role } from '@/lib/auth/permissions';
import { invalidateUserPermissionCache } from '@/lib/auth/authorization';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateTeamInput {
  name: string;
  orgId: string;
  description?: string;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
}

export interface AddMemberInput {
  teamId: string;
  userId: string;
  role?: Role;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ─── Team CRUD ───────────────────────────────────────────────────────────────

/** Create a new team within an organization. */
export async function createTeam(data: CreateTeamInput) {
  return (db as any).team.create({
    data: {
      name: data.name,
      orgId: data.orgId,
      description: data.description,
    },
    select: {
      id: true,
      name: true,
      orgId: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Get a team by id. */
export async function getTeam(id: string) {
  return (db as any).team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      orgId: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Update a team's mutable fields. */
export async function updateTeam(id: string, data: UpdateTeamInput) {
  const team = await (db as any).team.findUnique({ where: { id } });
  if (!team) throw NotFoundError('团队不存在');
  return (db as any).team.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      orgId: true,
      description: true,
      updatedAt: true,
    },
  });
}

/** Delete a team (cascades to team_members). */
export async function deleteTeam(id: string) {
  const team = await (db as any).team.findUnique({ where: { id } });
  if (!team) throw NotFoundError('团队不存在');
  // Invalidate cache for all members before deletion.
  const members = await (db as any).teamMember.findMany({
    where: { teamId: id },
    select: { userId: true },
  });
  for (const m of members) invalidateUserPermissionCache(m.userId);
  return (db as any).team.delete({ where: { id } });
}

/**
 * List all teams within an organization, with pagination.
 */
export async function listTeams(
  orgId: string,
  params: PaginationParams = { page: 1, pageSize: 20 },
): Promise<PaginatedResult<Awaited<ReturnType<typeof getTeam>>>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.max(1, Math.min(100, params.pageSize));
  const where = { orgId };

  const [total, teams] = await Promise.all([
    (db as any).team.count({ where }),
    (db as any).team.findMany({
      where,
      select: {
        id: true,
        name: true,
        orgId: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize) || 1;
  return {
    data: teams,
    pagination: { page, pageSize, total, totalPages },
  };
}

// ─── Team Member management ──────────────────────────────────────────────────

/** Add a user to a team with a given role (default: member). */
export async function addTeamMember(input: AddMemberInput) {
  const role: Role = input.role ?? 'member';
  if (!isValidRole(role)) {
    throw ConflictError(`无效的角色: ${input.role}`);
  }

  // Verify the team exists.
  const team = await (db as any).team.findUnique({ where: { id: input.teamId } });
  if (!team) throw NotFoundError('团队不存在');

  // Verify the user exists.
  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) throw NotFoundError('用户不存在');

  // Check for existing membership (unique constraint on [teamId, userId]).
  const existing = await (db as any).teamMember.findUnique({
    where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
  });
  if (existing) throw ConflictError('用户已是团队成员');

  const member = await (db as any).teamMember.create({
    data: {
      teamId: input.teamId,
      userId: input.userId,
      role,
    },
    select: {
      id: true,
      teamId: true,
      userId: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  invalidateUserPermissionCache(input.userId);
  return member;
}

/** Remove a user from a team. */
export async function removeTeamMember(teamId: string, userId: string) {
  const existing = await (db as any).teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!existing) throw NotFoundError('成员不在团队中');

  await (db as any).teamMember.delete({
    where: { teamId_userId: { teamId, userId } },
  });

  invalidateUserPermissionCache(userId);
  return { success: true };
}

/** Update a team member's role. */
export async function updateMemberRole(teamId: string, userId: string, role: Role) {
  if (!isValidRole(role)) {
    throw ConflictError(`无效的角色: ${role}`);
  }

  const existing = await (db as any).teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!existing) throw NotFoundError('成员不在团队中');

  const updated = await (db as any).teamMember.update({
    where: { teamId_userId: { teamId, userId } },
    data: { role },
    select: {
      id: true,
      teamId: true,
      userId: true,
      role: true,
      updatedAt: true,
    },
  });

  invalidateUserPermissionCache(userId);
  return updated;
}

/**
 * List all members of a team, with pagination.
 */
export async function getTeamMembers(
  teamId: string,
  params: PaginationParams = { page: 1, pageSize: 20 },
): Promise<PaginatedResult<{
  id: string;
  teamId: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; email: string; avatar: string | null };
}>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.max(1, Math.min(100, params.pageSize));
  const where = { teamId };

  const [total, members] = await Promise.all([
    (db as any).teamMember.count({ where }),
    (db as any).teamMember.findMany({
      where,
      select: {
        id: true,
        teamId: true,
        userId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize) || 1;
  return {
    data: members,
    pagination: { page, pageSize, total, totalPages },
  };
}
