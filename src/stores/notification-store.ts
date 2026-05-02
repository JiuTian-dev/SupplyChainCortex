import { create } from 'zustand';
import type { BackendNotification } from '@/lib/types';

// ==================== Notification Store ====================

interface NotificationState {
  backendNotifications: BackendNotification[];
}

interface NotificationActions {
  /** Computed: count of unread notifications */
  unreadCount: () => number;
  /** Add a single notification to the front of the list */
  addNotification: (notification: BackendNotification) => void;
  /** Mark a specific notification as read by id */
  markAsRead: (id: string) => void;
  /** Mark all notifications as read */
  markAllRead: () => void;
  /** Replace the entire notifications list (e.g. from API fetch) */
  setNotifications: (notifications: BackendNotification[]) => void;
}

export const useNotificationStore = create<NotificationState & NotificationActions>((set, get) => ({
  // ==================== Initial State ====================
  backendNotifications: [],

  // ==================== Computed ====================
  unreadCount: () => get().backendNotifications.filter((n) => !n.isRead).length,

  // ==================== Actions ====================
  addNotification: (notification) =>
    set((state) => ({
      backendNotifications: [notification, ...state.backendNotifications],
    })),

  markAsRead: (id) =>
    set((state) => ({
      backendNotifications: state.backendNotifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    })),

  markAllRead: () =>
    set((state) => ({
      backendNotifications: state.backendNotifications.map((n) => ({
        ...n,
        isRead: true,
      })),
    })),

  setNotifications: (notifications) => set({ backendNotifications: notifications }),
}));
