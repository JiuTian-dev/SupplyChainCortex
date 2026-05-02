'use client';

import { useAuthStore } from '@/stores/auth-store';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Shield, Key, Users, Clock } from 'lucide-react';
import { usePermission } from '@/hooks/use-permission';

interface UserMenuProps {
  onOpenPasswordChange?: () => void;
  onOpenUserManagement?: () => void;
}

export function UserMenu({ onOpenPasswordChange, onOpenUserManagement }: UserMenuProps) {
  const { user, isAuthenticated, setShowLoginDialog, logout } = useAuthStore();
  const canManageUsers = usePermission('user:manage');

  if (!isAuthenticated || !user) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => setShowLoginDialog(true)}
      >
        <Shield className="h-3.5 w-3.5" />
        登录
      </Button>
    );
  }

  const initials = user.name
    .split('')
    .slice(0, 2)
    .join('');

  const lastLoginDisplay = user.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className={`text-[10px] ${user.roleColor || 'bg-primary text-primary-foreground'}`}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-xs">{user.name}</span>
          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${user.roleColor}`}>
            {user.roleLabel}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            {lastLoginDisplay && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                上次登录: {lastLoginDisplay}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="mr-2 h-4 w-4" />
          个人信息
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onOpenPasswordChange?.()}
          className="cursor-pointer"
        >
          <Key className="mr-2 h-4 w-4" />
          修改密码
        </DropdownMenuItem>
        {canManageUsers && (
          <DropdownMenuItem
            onClick={() => onOpenUserManagement?.()}
            className="cursor-pointer"
          >
            <Users className="mr-2 h-4 w-4" />
            用户管理
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled>
          <Shield className="mr-2 h-4 w-4" />
          偏好设置
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-red-600 dark:text-red-400 cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
