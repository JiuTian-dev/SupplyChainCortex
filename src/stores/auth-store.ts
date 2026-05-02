import { create } from 'zustand';
import type { Permission, Role } from '@/lib/rbac';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar?: string;
  roleLabel: string;
  roleColor: string;
  lastLoginAt?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  permissions: Permission[];
  isAuthenticated: boolean;
  isLoading: boolean;
  showLoginDialog: boolean;
  showUserMenu: boolean;
  
  // Actions
  setUser: (user: AuthUser | null) => void;
  setPermissions: (permissions: Permission[]) => void;
  setIsAuthenticated: (val: boolean) => void;
  setIsLoading: (val: boolean) => void;
  setShowLoginDialog: (val: boolean) => void;
  setShowUserMenu: (val: boolean) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: [],
  isAuthenticated: false,
  isLoading: true,
  showLoginDialog: false,
  showUserMenu: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setPermissions: (permissions) => set({ permissions }),
  setIsAuthenticated: (val) => set({ isAuthenticated: val }),
  setIsLoading: (val) => set({ isLoading: val }),
  setShowLoginDialog: (val) => set({ showLoginDialog: val }),
  setShowUserMenu: (val) => set({ showUserMenu: val }),
  
  logout: () => {
    set({ user: null, permissions: [], isAuthenticated: false });
    // Call NextAuth sign out
    fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
  },
  
  checkAuth: async () => {
    try {
      set({ isLoading: true });
      const res = await fetch('/api/auth-info');
      if (!res.ok) throw new Error('Auth check failed');
      const data = await res.json();
      if (data.success && data.data?.authenticated) {
        set({
          user: data.data.user,
          permissions: data.data.permissions,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ user: null, permissions: [], isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ user: null, permissions: [], isAuthenticated: false, isLoading: false });
    }
  },
  
  hasPermission: (permission) => {
    return get().permissions.includes(permission);
  },
}));
