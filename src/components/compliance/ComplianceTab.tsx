'use client';

import { useState, useMemo } from 'react';
import {
  FileCheck, AlertTriangle, Clock, ShieldCheck, Plus, ExternalLink, BookOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MetricCard } from '@/components/shared/MetricCard';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import {
  useComplianceOverview,
  useComplianceCerts,
  useRegulationChanges,
  useExpiringCerts,
  useCreateComplianceCert,
  useCreateRegulationChange,
  useUpdateComplianceCert,
  useUpdateRegulationChange,
} from '@/hooks/use-supply-chain-data';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import type { CertificateRecord, RegulationRecord, OverviewData } from './ComplianceTab.helpers';
import {
  CATEGORY_COLORS, CATEGORY_LABELS, STATUS_COLORS, STATUS_LABELS,
  SOURCE_LABELS, SOURCE_COLORS, IMPACT_COLORS, IMPACT_LABELS,
  REG_STATUS_COLORS, REG_STATUS_LABELS, PIE_COLORS,
  daysUntil, formatDate, CustomPieTooltip,
} from './ComplianceTab.helpers';

// ==================== Main Component ====================

export function ComplianceTab() {
  const [subTab, setSubTab] = useState('certs');

  // Queries
  const overviewQuery = useComplianceOverview();
  const certsQuery = useComplianceCerts();
  const regulationsQuery = useRegulationChanges();
  const expiringQuery = useExpiringCerts(90);

  // Mutations
  const createCertMutation = useCreateComplianceCert();
  const createRegulationMutation = useCreateRegulationChange();
  const updateCertMutation = useUpdateComplianceCert();
  const updateRegulationMutation = useUpdateRegulationChange();

  // Dialog states
  const [createCertOpen, setCreateCertOpen] = useState(false);
  const [createRegulationOpen, setCreateRegulationOpen] = useState(false);
  const [editCertOpen, setEditCertOpen] = useState(false);
  const [selectedCert, setSelectedCert] = useState<CertificateRecord | null>(null);
  const [reviewRegulationOpen, setReviewRegulationOpen] = useState(false);
  const [selectedRegulation, setSelectedRegulation] = useState<RegulationRecord | null>(null);

  // Cert form
  const [certForm, setCertForm] = useState({
    certName: '', certNumber: '', issuer: '', sku: '', productName: '',
    category: 'safety', issueDate: '', expiryDate: '', scope: '',
    notes: '', reminderDays: 90,
  });

  // Regulation form
  const [regForm, setRegForm] = useState({
    title: '', source: 'EU', category: 'safety', description: '',
    impactLevel: 'medium', effectiveDate: '', deadline: '',
    affectedSkus: '', actionRequired: '', sourceUrl: '',
  });

  // Review form
  const [reviewForm, setReviewForm] = useState({ status: 'reviewing', actionRequired: '' });

  // Extract data
  const overview = ((overviewQuery.data as any)?.data ?? overviewQuery.data) as OverviewData | null;
  const certsData = ((certsQuery.data as any)?.data ?? certsQuery.data) as { records: CertificateRecord[] } | null;
  const regulationsData = ((regulationsQuery.data as any)?.data ?? regulationsQuery.data) as { records: RegulationRecord[] } | null;
  const expiringData = ((expiringQuery.data as any)?.data ?? expiringQuery.data) as { records: CertificateRecord[]; critical: number; warning: number; total: number } | null;

  const certs = certsData?.records ?? [];
  const regulations = regulationsData?.records ?? [];
  const expiringCerts = expiringData?.records ?? [];

  // Pie chart data for cert categories
  const categoryPieData = useMemo(() => {
    if (!overview) return [];
    return overview.certificates.byCategory.map((c) => ({
      name: CATEGORY_LABELS[c.category] || c.category,
      value: c.count,
      color: CATEGORY_COLORS[c.category] || '#6b7280',
    }));
  }, [overview]);

  // Loading
  if (overviewQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  // Handlers
  const handleCreateCert = () => {
    if (!certForm.certName || !certForm.expiryDate) {
      toast.error('请填写必填字段：证书名称和到期日期');
      return;
    }
    createCertMutation.mutate(certForm, {
      onSuccess: () => {
        toast.success('证书创建成功');
        setCreateCertOpen(false);
        setCertForm({ certName: '', certNumber: '', issuer: '', sku: '', productName: '', category: 'safety', issueDate: '', expiryDate: '', scope: '', notes: '', reminderDays: 90 });
      },
      onError: () => toast.error('证书创建失败'),
    });
  };

  const handleCreateRegulation = () => {
    if (!regForm.title || !regForm.description) {
      toast.error('请填写必填字段：标题和描述');
      return;
    }
    createRegulationMutation.mutate({
      ...regForm,
      affectedSkus: regForm.affectedSkus ? regForm.affectedSkus.split(',').map(s => s.trim()).filter(Boolean) : [],
    }, {
      onSuccess: () => {
        toast.success('法规变更创建成功');
        setCreateRegulationOpen(false);
        setRegForm({ title: '', source: 'EU', category: 'safety', description: '', impactLevel: 'medium', effectiveDate: '', deadline: '', affectedSkus: '', actionRequired: '', sourceUrl: '' });
      },
      onError: () => toast.error('法规变更创建失败'),
    });
  };

  const handleEditCert = () => {
    if (!selectedCert) return;
    updateCertMutation.mutate({
      id: selectedCert.id,
      ...certForm,
    }, {
      onSuccess: () => {
        toast.success('证书更新成功');
        setEditCertOpen(false);
        setSelectedCert(null);
      },
      onError: () => toast.error('证书更新失败'),
    });
  };

  const handleReviewRegulation = () => {
    if (!selectedRegulation) return;
    updateRegulationMutation.mutate({
      id: selectedRegulation.id,
      status: reviewForm.status,
      actionRequired: reviewForm.actionRequired || undefined,
    }, {
      onSuccess: () => {
        toast.success('法规审核状态已更新');
        setReviewRegulationOpen(false);
        setSelectedRegulation(null);
        setReviewForm({ status: 'reviewing', actionRequired: '' });
      },
      onError: () => toast.error('审核状态更新失败'),
    });
  };

  const openEditCert = (cert: CertificateRecord) => {
    setSelectedCert(cert);
    setCertForm({
      certName: cert.certName,
      certNumber: cert.certNumber || '',
      issuer: cert.issuer || '',
      sku: cert.sku || '',
      productName: cert.productName || '',
      category: cert.category,
      issueDate: cert.issueDate || '',
      expiryDate: cert.expiryDate,
      scope: cert.scope || '',
      notes: cert.notes || '',
      reminderDays: cert.reminderDays,
    });
    setEditCertOpen(true);
  };

  const openReviewRegulation = (reg: RegulationRecord) => {
    setSelectedRegulation(reg);
    setReviewForm({ status: reg.status, actionRequired: reg.actionRequired || '' });
    setReviewRegulationOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* ==================== Expiring Soon Alert ==================== */}
      {expiringCerts.length > 0 && (
        <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/20 card-dashboard">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/40 p-2 mt-0.5">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                  即将过期证书提醒
                </h3>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                  有 {expiringData?.total ?? expiringCerts.length} 个证书将在 90 天内过期，
                  其中 {expiringData?.critical ?? 0} 个在 30 天内过期（紧急）
                </p>
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                  {expiringCerts.slice(0, 5).map((cert) => {
                    const days = daysUntil(cert.expiryDate);
                    const isCritical = days <= 30;
                    return (
                      <div key={cert.id} className="flex items-center gap-2 text-xs">
                        <Badge className={`text-[10px] ${isCritical ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                          {isCritical ? '紧急' : '预警'}
                        </Badge>
                        <span className="font-medium">{cert.certName}</span>
                        <span className="text-muted-foreground">还剩 {days} 天</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ==================== Overview Metric Cards ==================== */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            title="有效证书"
            value={overview.certificates.active}
            icon={<FileCheck className="h-4 w-4" />}
            subtitle={`共 ${overview.certificates.total} 个`}
            color="text-green-600 dark:text-green-400"
            bgColor="bg-green-50 dark:bg-green-950/20"
          />
          <MetricCard
            title="即将过期"
            value={overview.certificates.expiringSoon}
            icon={<Clock className="h-4 w-4" />}
            subtitle="90天内"
            trend={overview.certificates.expiringSoon > 0 ? `⚠ ${overview.certificates.expiringSoon}` : undefined}
            color="text-yellow-600 dark:text-yellow-400"
            bgColor="bg-yellow-50 dark:bg-yellow-950/20"
          />
          <MetricCard
            title="已过期"
            value={overview.certificates.expired}
            icon={<AlertTriangle className="h-4 w-4" />}
            subtitle="需续期"
            color="text-red-600 dark:text-red-400"
            bgColor="bg-red-50 dark:bg-red-950/20"
          />
          <MetricCard
            title="紧急证书"
            value={overview.certificates.criticalExpiring}
            icon={<ShieldCheck className="h-4 w-4" />}
            subtitle="30天内过期"
            trend={overview.certificates.criticalExpiring > 0 ? `⚠ 紧急` : '✓ 安全'}
            color="text-orange-600 dark:text-orange-400"
            bgColor="bg-orange-50 dark:bg-orange-950/20"
          />
        </div>
      )}

      {/* ==================== Sub-tabs: Certs & Regulations ==================== */}
      <Tabs value={subTab} onValueChange={setSubTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="h-9">
            <TabsTrigger value="certs" className="text-xs gap-1.5 px-3">
              <FileCheck className="h-3.5 w-3.5" />
              合规认证
            </TabsTrigger>
            <TabsTrigger value="regulations" className="text-xs gap-1.5 px-3">
              <BookOpen className="h-3.5 w-3.5" />
              法规变更
            </TabsTrigger>
          </TabsList>

          {subTab === 'certs' && (
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCreateCertOpen(true)}>
              <Plus className="h-3.5 w-3.5" />新增证书
            </Button>
          )}
          {subTab === 'regulations' && (
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCreateRegulationOpen(true)}>
              <Plus className="h-3.5 w-3.5" />新增法规
            </Button>
          )}
        </div>

        {/* ==================== Certificates Tab ==================== */}
        <TabsContent value="certs" className="space-y-4">
          {/* Category Pie Chart */}
          {categoryPieData.length > 0 && (
            <Card className="card-dashboard border-l-[4px] border-l-green-400">
              <CardHeader className="pb-2 bg-green-50 dark:bg-green-950/20">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-green-500" />
                  证书类别分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-full sm:w-1/2 h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          dataKey="value"
                          stroke="none"
                        >
                          {categoryPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<CustomPieTooltip />} />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          formatter={(value: string) => <span className="text-xs text-foreground">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full sm:w-1/2 space-y-2">
                    {categoryPieData.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="font-medium">{item.name}</span>
                        </div>
                        <span className="text-muted-foreground">{item.value} 个</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Certificate Cards List */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
            {certs.length === 0 ? (
              <Card className="py-12">
                <CardContent className="flex flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4 mb-3">
                    <FileCheck className="h-8 w-8 text-green-500" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">暂无合规证书</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">点击 &quot;新增证书&quot; 添加第一个合规证书</p>
                </CardContent>
              </Card>
            ) : (
              certs.map((cert) => {
                const days = daysUntil(cert.expiryDate);
                const isCritical = days <= 30 && days > 0;
                const isExpiring = days <= 90 && days > 0;
                const isExpired = days <= 0;
                return (
                  <Card
                    key={cert.id}
                    className={`card-dashboard hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ${
                      isCritical ? 'border-red-300 dark:border-red-700' : isExpiring ? 'border-yellow-300 dark:border-yellow-700' : isExpired ? 'border-red-200 dark:border-red-800' : ''
                    }`}
                    onClick={() => openEditCert(cert)}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        {/* Left: Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-semibold truncate">{cert.certName}</h4>
                            <Badge className={`text-[10px] ${STATUS_COLORS[cert.status] || STATUS_COLORS.other}`}>
                              {STATUS_LABELS[cert.status] || cert.status}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]" style={{ borderColor: CATEGORY_COLORS[cert.category], color: CATEGORY_COLORS[cert.category] }}>
                              {CATEGORY_LABELS[cert.category] || cert.category}
                            </Badge>
                          </div>
                          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {cert.certNumber && <span>证书号: {cert.certNumber}</span>}
                            {cert.issuer && <span>颁发机构: {cert.issuer}</span>}
                            {cert.sku && <span>SKU: {cert.sku}</span>}
                            {cert.productName && <span>产品: {cert.productName}</span>}
                          </div>
                          {cert.scope && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">范围: {cert.scope}</p>
                          )}
                        </div>
                        {/* Right: Dates */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="text-xs text-muted-foreground">
                            签发: {formatDate(cert.issueDate)}
                          </div>
                          <div className={`text-xs font-medium ${isExpired ? 'text-red-600 dark:text-red-400' : isCritical ? 'text-red-500 dark:text-red-400' : isExpiring ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'}`}>
                            到期: {formatDate(cert.expiryDate)}
                            {isExpired ? ' (已过期)' : isCritical ? ` (${days}天)` : isExpiring ? ` (${days}天)` : ''}
                          </div>
                          {!isExpired && days > 0 && days <= 90 && (
                            <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${isCritical ? 'bg-red-500' : 'bg-yellow-500'}`}
                                style={{ width: `${Math.max(5, 100 - (days / 90) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* ==================== Regulations Tab ==================== */}
        <TabsContent value="regulations" className="space-y-4">
          {/* Regulation Stats */}
          {overview && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{overview.regulations.new}</p>
                <p className="text-[10px] text-muted-foreground">新规</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{overview.regulations.reviewing}</p>
                <p className="text-[10px] text-muted-foreground">审核中</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{overview.regulations.actionRequired}</p>
                <p className="text-[10px] text-muted-foreground">需行动</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{overview.regulations.nonCompliant}</p>
                <p className="text-[10px] text-muted-foreground">不合规</p>
              </div>
            </div>
          )}

          {/* Regulation Cards List */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
            {regulations.length === 0 ? (
              <Card className="py-12">
                <CardContent className="flex flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-4 mb-3">
                    <BookOpen className="h-8 w-8 text-blue-500" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">暂无法规变更</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">点击 &quot;新增法规&quot; 添加法规变更记录</p>
                </CardContent>
              </Card>
            ) : (
              regulations.map((reg) => {
                const affectedSkus = (() => {
                  try { return JSON.parse(reg.affectedSkus || '[]'); } catch { return []; }
                })();
                return (
                  <Card key={reg.id} className="card-dashboard hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3">
                        {/* Header: Title + Badges */}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-semibold">{reg.title}</h4>
                            <Badge className={`text-[10px] ${SOURCE_COLORS[reg.source] || SOURCE_COLORS.other}`}>
                              {SOURCE_LABELS[reg.source] || reg.source}
                            </Badge>
                            <Badge className={`text-[10px] ${IMPACT_COLORS[reg.impactLevel] || IMPACT_COLORS.medium}`}>
                              影响: {IMPACT_LABELS[reg.impactLevel] || reg.impactLevel}
                            </Badge>
                            <Badge className={`text-[10px] ${REG_STATUS_COLORS[reg.status] || REG_STATUS_COLORS.new}`}>
                              {REG_STATUS_LABELS[reg.status] || reg.status}
                            </Badge>
                          </div>
                          <Badge variant="outline" className="text-[10px] mt-1" style={{ borderColor: CATEGORY_COLORS[reg.category] || '#6b7280', color: CATEGORY_COLORS[reg.category] || '#6b7280' }}>
                            {CATEGORY_LABELS[reg.category] || reg.category}
                          </Badge>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-muted-foreground line-clamp-2">{reg.description}</p>

                        {/* Details row */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {reg.effectiveDate && <span>生效: {formatDate(reg.effectiveDate)}</span>}
                          {reg.deadline && <span>截止: {formatDate(reg.deadline)}</span>}
                          {affectedSkus.length > 0 && (
                            <span>影响SKU: {affectedSkus.slice(0, 3).join(', ')}{affectedSkus.length > 3 ? ` +${affectedSkus.length - 3}` : ''}</span>
                          )}
                        </div>

                        {/* Action required */}
                        {reg.actionRequired && (
                          <div className="text-xs bg-orange-50 dark:bg-orange-950/20 rounded-md px-2.5 py-1.5 border border-orange-200 dark:border-orange-800">
                            <span className="font-medium text-orange-700 dark:text-orange-400">行动要求: </span>
                            <span className="text-orange-600 dark:text-orange-300">{reg.actionRequired}</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={(e) => { e.stopPropagation(); openReviewRegulation(reg); }}
                          >
                            <ShieldCheck className="h-3 w-3" />标记审核
                          </Button>
                          {reg.sourceUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={(e) => { e.stopPropagation(); window.open(reg.sourceUrl ?? undefined, '_blank'); }}
                            >
                              <ExternalLink className="h-3 w-3" />来源
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ==================== Create Certificate Dialog ==================== */}
      <Dialog open={createCertOpen} onOpenChange={setCreateCertOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-green-500" />新增合规证书
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">证书名称 *</Label>
              <Input className="h-8 text-sm" placeholder="如：CE认证" value={certForm.certName} onChange={(e) => setCertForm(f => ({ ...f, certName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">证书编号</Label>
                <Input className="h-8 text-sm" placeholder="CE-2024-001" value={certForm.certNumber} onChange={(e) => setCertForm(f => ({ ...f, certNumber: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">颁发机构</Label>
                <Input className="h-8 text-sm" placeholder="TÜV" value={certForm.issuer} onChange={(e) => setCertForm(f => ({ ...f, issuer: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-sm" placeholder="SKU-001" value={certForm.sku} onChange={(e) => setCertForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">产品名称</Label>
                <Input className="h-8 text-sm" placeholder="产品名" value={certForm.productName} onChange={(e) => setCertForm(f => ({ ...f, productName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">认证类别 *</Label>
                <Select value={certForm.category} onValueChange={(v) => setCertForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safety">安全认证</SelectItem>
                    <SelectItem value="emc">电磁兼容</SelectItem>
                    <SelectItem value="environmental">环保认证</SelectItem>
                    <SelectItem value="quality">质量认证</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">提醒天数</Label>
                <Input type="number" className="h-8 text-sm" value={certForm.reminderDays} onChange={(e) => setCertForm(f => ({ ...f, reminderDays: parseInt(e.target.value) || 90 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">签发日期</Label>
                <Input type="date" className="h-8 text-sm" value={certForm.issueDate} onChange={(e) => setCertForm(f => ({ ...f, issueDate: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">到期日期 *</Label>
                <Input type="date" className="h-8 text-sm" value={certForm.expiryDate} onChange={(e) => setCertForm(f => ({ ...f, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">认证范围</Label>
              <Input className="h-8 text-sm" placeholder="低电压指令 2014/35/EU" value={certForm.scope} onChange={(e) => setCertForm(f => ({ ...f, scope: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">备注</Label>
              <Textarea className="text-sm min-h-[60px]" placeholder="备注信息..." value={certForm.notes} onChange={(e) => setCertForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateCertOpen(false)}>取消</Button>
            <Button size="sm" disabled={createCertMutation.isPending} onClick={handleCreateCert}>
              {createCertMutation.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Edit Certificate Dialog ==================== */}
      <Dialog open={editCertOpen} onOpenChange={setEditCertOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-green-500" />编辑证书
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">证书名称 *</Label>
              <Input className="h-8 text-sm" value={certForm.certName} onChange={(e) => setCertForm(f => ({ ...f, certName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">证书编号</Label>
                <Input className="h-8 text-sm" value={certForm.certNumber} onChange={(e) => setCertForm(f => ({ ...f, certNumber: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">颁发机构</Label>
                <Input className="h-8 text-sm" value={certForm.issuer} onChange={(e) => setCertForm(f => ({ ...f, issuer: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-sm" value={certForm.sku} onChange={(e) => setCertForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">产品名称</Label>
                <Input className="h-8 text-sm" value={certForm.productName} onChange={(e) => setCertForm(f => ({ ...f, productName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">认证类别</Label>
                <Select value={certForm.category} onValueChange={(v) => setCertForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safety">安全认证</SelectItem>
                    <SelectItem value="emc">电磁兼容</SelectItem>
                    <SelectItem value="environmental">环保认证</SelectItem>
                    <SelectItem value="quality">质量认证</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">提醒天数</Label>
                <Input type="number" className="h-8 text-sm" value={certForm.reminderDays} onChange={(e) => setCertForm(f => ({ ...f, reminderDays: parseInt(e.target.value) || 90 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">签发日期</Label>
                <Input type="date" className="h-8 text-sm" value={certForm.issueDate} onChange={(e) => setCertForm(f => ({ ...f, issueDate: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">到期日期 *</Label>
                <Input type="date" className="h-8 text-sm" value={certForm.expiryDate} onChange={(e) => setCertForm(f => ({ ...f, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">认证范围</Label>
              <Input className="h-8 text-sm" value={certForm.scope} onChange={(e) => setCertForm(f => ({ ...f, scope: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">备注</Label>
              <Textarea className="text-sm min-h-[60px]" value={certForm.notes} onChange={(e) => setCertForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditCertOpen(false)}>取消</Button>
            <Button size="sm" disabled={updateCertMutation.isPending} onClick={handleEditCert}>
              {updateCertMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Create Regulation Dialog ==================== */}
      <Dialog open={createRegulationOpen} onOpenChange={setCreateRegulationOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-500" />新增法规变更
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">标题 *</Label>
              <Input className="h-8 text-sm" placeholder="法规标题" value={regForm.title} onChange={(e) => setRegForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">来源 *</Label>
                <Select value={regForm.source} onValueChange={(v) => setRegForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EU">欧盟 EU</SelectItem>
                    <SelectItem value="FDA">美国 FDA</SelectItem>
                    <SelectItem value="GB">国标 GB</SelectItem>
                    <SelectItem value="SAA">澳洲 SAA</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">类别 *</Label>
                <Select value={regForm.category} onValueChange={(v) => setRegForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safety">安全</SelectItem>
                    <SelectItem value="emc">电磁兼容</SelectItem>
                    <SelectItem value="environmental">环保</SelectItem>
                    <SelectItem value="quality">质量</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">影响级别</Label>
                <Select value={regForm.impactLevel} onValueChange={(v) => setRegForm(f => ({ ...f, impactLevel: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="critical">严重</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">描述 *</Label>
              <Textarea className="text-sm min-h-[80px]" placeholder="法规变更详细描述..." value={regForm.description} onChange={(e) => setRegForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">生效日期</Label>
                <Input type="date" className="h-8 text-sm" value={regForm.effectiveDate} onChange={(e) => setRegForm(f => ({ ...f, effectiveDate: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">截止日期</Label>
                <Input type="date" className="h-8 text-sm" value={regForm.deadline} onChange={(e) => setRegForm(f => ({ ...f, deadline: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">影响SKU (逗号分隔)</Label>
              <Input className="h-8 text-sm" placeholder="SKU-001, SKU-002" value={regForm.affectedSkus} onChange={(e) => setRegForm(f => ({ ...f, affectedSkus: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">行动要求</Label>
              <Input className="h-8 text-sm" placeholder="需要采取的行动" value={regForm.actionRequired} onChange={(e) => setRegForm(f => ({ ...f, actionRequired: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">来源URL</Label>
              <Input className="h-8 text-sm" placeholder="https://..." value={regForm.sourceUrl} onChange={(e) => setRegForm(f => ({ ...f, sourceUrl: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateRegulationOpen(false)}>取消</Button>
            <Button size="sm" disabled={createRegulationMutation.isPending} onClick={handleCreateRegulation}>
              {createRegulationMutation.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Review Regulation Dialog ==================== */}
      <Dialog open={reviewRegulationOpen} onOpenChange={setReviewRegulationOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-500" />标记审核
            </DialogTitle>
          </DialogHeader>
          {selectedRegulation && (
            <div className="space-y-3 py-2">
              <div className="rounded-md border p-3 bg-muted/30">
                <p className="text-sm font-medium">{selectedRegulation.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{selectedRegulation.description}</p>
                <div className="flex gap-2 mt-2">
                  <Badge className={`text-[10px] ${REG_STATUS_COLORS[selectedRegulation.status]}`}>
                    当前: {REG_STATUS_LABELS[selectedRegulation.status]}
                  </Badge>
                  <Badge className={`text-[10px] ${IMPACT_COLORS[selectedRegulation.impactLevel]}`}>
                    影响: {IMPACT_LABELS[selectedRegulation.impactLevel]}
                  </Badge>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">新状态</Label>
                <Select value={reviewForm.status} onValueChange={(v) => setReviewForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reviewing">审核中</SelectItem>
                    <SelectItem value="action_required">需行动</SelectItem>
                    <SelectItem value="compliant">已合规</SelectItem>
                    <SelectItem value="non_compliant">不合规</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">行动要求</Label>
                <Textarea className="text-sm min-h-[60px]" placeholder="补充行动要求..." value={reviewForm.actionRequired} onChange={(e) => setReviewForm(f => ({ ...f, actionRequired: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReviewRegulationOpen(false)}>取消</Button>
            <Button size="sm" disabled={updateRegulationMutation.isPending} onClick={handleReviewRegulation}>
              {updateRegulationMutation.isPending ? '更新中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
