'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Plus,
  Pencil,
  Key,
  UserCheck,
  UserX,
  Loader2,
  Search,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Role } from '@/lib/auth/permissions';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/auth/permissions';

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar?: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserManagementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserManagementPanel({ open, onOpenChange }: UserManagementPanelProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', name: '', password: '', role: 'viewer' as Role });
  const [createLoading, setCreateLoading] = useState(false);

  // Edit user dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'viewer' as Role, isActive: true });
  const [editLoading, setEditLoading] = useState(false);

  // Reset password dialog
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users?action=list&pageSize=100');
      const data = await res.json();
      if (data.success && data.data) {
        setUsers(data.data);
      }
    } catch {
      toast.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open, fetchUsers]);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`用户 ${createForm.name} 创建成功`);
        setCreateOpen(false);
        setCreateForm({ email: '', name: '', password: '', role: 'viewer' });
        fetchUsers();
      } else {
        toast.error(data.error || '创建失败');
      }
    } catch {
      toast.error('创建用户失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editUser.id, ...editForm }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`用户 ${editForm.name} 更新成功`);
        setEditOpen(false);
        setEditUser(null);
        fetchUsers();
      } else {
        toast.error(data.error || '更新失败');
      }
    } catch {
      toast.error('更新用户失败');
    } finally {
      setEditLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUser || !newPassword) return;
    setResetLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resetUser.id, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${resetUser.name} 的密码已重置`);
        setResetUser(null);
        setNewPassword('');
      } else {
        toast.error(data.error || '重置密码失败');
      }
    } catch {
      toast.error('重置密码失败');
    } finally {
      setResetLoading(false);
    }
  };

  const handleToggleActive = async (user: UserRecord) => {
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, isActive: !user.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`用户 ${user.name} 已${user.isActive ? '停用' : '启用'}`);
        fetchUsers();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch {
      toast.error('操作失败');
    }
  };

  const openEditDialog = (user: UserRecord) => {
    setEditUser(user);
    setEditForm({ name: user.name, role: user.role, isActive: user.isActive });
    setEditOpen(true);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '从未';
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                <Users className="h-4 w-4 text-white" />
              </div>
              用户管理
            </SheetTitle>
            <SheetDescription>
              管理系统用户、角色和权限
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4 space-y-4">
            {/* Search + Create */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="搜索用户名或邮箱..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">新建用户</span>
              </Button>
            </div>

            {/* Stats */}
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>共 {users.length} 用户</span>
              <span>·</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {users.filter((u) => u.isActive).length} 活跃
              </span>
              <span>·</span>
              <span className="text-red-600 dark:text-red-400">
                {users.filter((u) => !u.isActive).length} 停用
              </span>
            </div>

            {/* User table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {searchQuery ? '未找到匹配的用户' : '暂无用户数据'}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">用户</TableHead>
                      <TableHead className="text-xs">角色</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">状态</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">最近登录</TableHead>
                      <TableHead className="text-xs text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[user.role]}`}
                          >
                            {ROLE_LABELS[user.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${
                              user.isActive
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                                : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                            }`}
                          >
                            {user.isActive ? '活跃' : '停用'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                          {formatDate(user.lastLoginAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEditDialog(user)}
                              title="编辑"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setResetUser(user);
                                setNewPassword('');
                              }}
                              title="重置密码"
                            >
                              <Key className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleToggleActive(user)}
                              title={user.isActive ? '停用' : '启用'}
                            >
                              {user.isActive ? (
                                <UserX className="h-3.5 w-3.5 text-red-500" />
                              ) : (
                                <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-500" />
              新建用户
            </DialogTitle>
            <DialogDescription>创建新的系统用户并分配角色</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-email">邮箱</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="user@example.com"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">姓名</Label>
              <Input
                id="create-name"
                placeholder="用户姓名"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">初始密码</Label>
              <Input
                id="create-password"
                type="password"
                placeholder="至少6位"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-role">角色</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => setCreateForm({ ...createForm, role: v as Role })}
              >
                <SelectTrigger id="create-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${ROLE_COLORS.org_admin}`}>
                        管理员
                      </Badge>
                      - 完全访问权限
                    </span>
                  </SelectItem>
                  <SelectItem value="team_admin">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${ROLE_COLORS.team_admin}`}>
                        经理
                      </Badge>
                      - 读写权限（无用户管理）
                    </span>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${ROLE_COLORS.viewer}`}>
                        观察者
                      </Badge>
                      - 只读权限
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                创建
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-orange-500" />
              编辑用户
            </DialogTitle>
            <DialogDescription>修改用户信息和角色</DialogDescription>
          </DialogHeader>
          {editUser && (
            <form onSubmit={handleEditUser} className="space-y-4">
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input value={editUser.email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">姓名</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">角色</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(v) => setEditForm({ ...editForm, role: v as Role })}
                >
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org_admin">管理员</SelectItem>
                    <SelectItem value="team_admin">经理</SelectItem>
                    <SelectItem value="viewer">观察者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="edit-active">账号状态</Label>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 cursor-pointer ${
                    editForm.isActive
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                  }`}
                  onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
                >
                  {editForm.isActive ? '活跃' : '停用'}
                </Badge>
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={editLoading}>
                  {editLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  保存
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetUser}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setResetUser(null);
            setNewPassword('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-orange-500" />
              重置密码
            </DialogTitle>
            <DialogDescription>
              为 {resetUser?.name} ({resetUser?.email}) 设置新密码
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-password">新密码</Label>
              <Input
                id="reset-password"
                type="password"
                placeholder="至少6位"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setResetUser(null); setNewPassword(''); }}>
                取消
              </Button>
              <Button
                onClick={handleResetPassword}
                disabled={resetLoading || newPassword.length < 6}
              >
                {resetLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                确认重置
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
