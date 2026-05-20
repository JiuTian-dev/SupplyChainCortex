// ==================== Type definitions ====================

export interface CertificateRecord {
  id: string;
  certName: string;
  certNumber: string | null;
  issuer: string | null;
  sku: string | null;
  productName: string | null;
  category: string;
  issueDate: string | null;
  expiryDate: string;
  status: string;
  scope: string | null;
  documentUrl: string | null;
  notes: string | null;
  reminderDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegulationRecord {
  id: string;
  title: string;
  source: string;
  category: string;
  description: string;
  impactLevel: string;
  effectiveDate: string | null;
  deadline: string | null;
  affectedSkus: string;
  affectedCerts: string;
  actionRequired: string | null;
  status: string;
  sourceUrl: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OverviewData {
  certificates: {
    active: number;
    expiring: number;
    expired: number;
    pending: number;
    revoked: number;
    expiringSoon: number;
    criticalExpiring: number;
    total: number;
    byCategory: { category: string; count: number }[];
    byStatus: { status: string; count: number }[];
  };
  regulations: {
    new: number;
    reviewing: number;
    actionRequired: number;
    nonCompliant: number;
    total: number;
  };
}

// ==================== Color mappings ====================

export const CATEGORY_COLORS: Record<string, string> = {
  safety: '#ef4444',
  emc: '#8b5cf6',
  environmental: '#22c55e',
  quality: '#f59e0b',
  other: '#6b7280',
};

export const CATEGORY_LABELS: Record<string, string> = {
  safety: '安全认证',
  emc: '电磁兼容',
  environmental: '环保认证',
  quality: '质量认证',
  other: '其他',
};

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expiring: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  revoked: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export const STATUS_LABELS: Record<string, string> = {
  active: '有效',
  expiring: '即将过期',
  expired: '已过期',
  revoked: '已撤销',
  pending: '待审核',
};

export const SOURCE_LABELS: Record<string, string> = {
  EU: '欧盟 EU',
  FDA: '美国 FDA',
  GB: '国标 GB',
  SAA: '澳洲 SAA',
  other: '其他',
};

export const SOURCE_COLORS: Record<string, string> = {
  EU: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  FDA: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  GB: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  SAA: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

export const IMPACT_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export const IMPACT_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
};

export const REG_STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  reviewing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  action_required: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  compliant: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  non_compliant: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export const REG_STATUS_LABELS: Record<string, string> = {
  new: '新规',
  reviewing: '审核中',
  action_required: '需行动',
  compliant: '已合规',
  non_compliant: '不合规',
};

export const PIE_COLORS = ['#ef4444', '#8b5cf6', '#22c55e', '#f59e0b', '#6b7280'];

// ==================== Helper functions ====================

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

// ==================== Custom Pie Tooltip ====================

export function CustomPieTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-md text-xs">
        <p className="font-medium">{payload[0].name}</p>
        <p className="text-muted-foreground">{payload[0].value} 个证书</p>
      </div>
    );
  }
  return null;
}
