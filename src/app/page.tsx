'use client';

import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryProvider } from '@/lib/query-provider';
// ==================== Component Imports ====================
import dynamic from 'next/dynamic';
import { LazyLoader } from '@/components/shared/LazyLoader';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Activity, Boxes, DollarSign, Ship, TrendingUp, Building2, Shield, Eye, Search, Zap, Calendar } from 'lucide-react';

const InventoryTab = dynamic(() => import('@/components/inventory/InventoryTab').then(m => ({ default: m.InventoryTab })), { loading: () => <LazyLoader type="tab" /> });
const CostTab = dynamic(() => import('@/components/cost/CostTab').then(m => ({ default: m.CostTab })), { loading: () => <LazyLoader type="chart" /> });
const LogisticsTab = dynamic(() => import('@/components/logistics/LogisticsTab').then(m => ({ default: m.LogisticsTab })), { loading: () => <LazyLoader type="tab" /> });
const SalesTab = dynamic(() => import('@/components/sales/SalesTab').then(m => ({ default: m.SalesTab })), { loading: () => <LazyLoader type="chart" /> });
const SupplierTab = dynamic(() => import('@/components/supplier/SupplierTab').then(m => ({ default: m.SupplierTab })), { loading: () => <LazyLoader type="tab" /> });
const RiskTab = dynamic(() => import('@/components/risk/RiskTab').then(m => ({ default: m.RiskTab })), { loading: () => <LazyLoader type="chart" /> });

import { MonitorStrip } from '@/components/dashboard/MonitorStrip';
import { DecisionCenter } from '@/components/dashboard/DecisionCenter';
import { SandboxReplay } from '@/components/dashboard/SandboxReplay';
import { PassportPanel } from '@/components/dashboard/PassportPanel';
import { ConfigToolbar } from '@/components/dashboard/ConfigToolbar';
import { initEnginePersistence } from '@/lib/engine/persistence';

// ==================== Dynamic Dialog/Sheet Imports ====================
// Dialogs and sheets are rarely opened, so they are lazy loaded.
// These are OK as dynamic imports because they only load on user interaction.

const NotificationCenter = dynamic(
  () => import('@/components/shared/NotificationCenter').then((m) => ({ default: m.NotificationCenter })),
  { ssr: false }
);

const ProductDetailSheet = dynamic(
  () => import('@/components/shared/ProductDetailSheet').then((m) => ({ default: m.ProductDetailSheet })),
  { ssr: false }
);

const NotesPanel = dynamic(
  () => import('@/components/shared/NotesPanel').then((m) => ({ default: m.NotesPanel })),
  { ssr: false }
);

const CSVImportDialog = dynamic(
  () => import('@/components/shared/CSVImportDialog').then((m) => ({ default: m.CSVImportDialog })),
  { ssr: false }
);

const ChatPanel = dynamic(
  () => import('@/components/shared/ChatPanel').then((m) => ({ default: m.ChatPanel })),
  { ssr: false }
);

const AlertRulesDialog = dynamic(
  () => import('@/components/shared/AlertRulesDialog').then((m) => ({ default: m.AlertRulesDialog })),
  { ssr: false }
);

const ProductCompareDialog = dynamic(
  () => import('@/components/shared/ProductCompareDialog').then((m) => ({ default: m.ProductCompareDialog })),
  { ssr: false }
);

const LoginDialog = dynamic(
  () => import('@/components/auth/LoginDialog').then((m) => ({ default: m.LoginDialog })),
  { ssr: false }
);

const PasswordChangeDialog = dynamic(
  () => import('@/components/auth/PasswordChangeDialog').then((m) => ({ default: m.PasswordChangeDialog })),
  { ssr: false }
);

const UserManagementPanel = dynamic(
  () => import('@/components/admin/UserManagementPanel').then((m) => ({ default: m.UserManagementPanel })),
  { ssr: false }
);

// ==================== Static Imports (lightweight, always needed) ====================

// Layout components - always visible
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

// Lightweight shared components - always visible or tiny
import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { ScrollToTop } from '@/components/shared/ScrollToTop';
import { QuickActions } from '@/components/shared/QuickActions';

// Error boundaries
import { SectionErrorBoundary, OfflineBanner, ErrorReportProvider } from '@/components/error';

// Auth (UserMenu is lightweight and always visible)
import { UserMenu } from '@/components/auth/UserMenu';
import { useAuthStore } from '@/stores/auth-store';

// Hooks & stores
import { useUIStore } from '@/stores/ui-store';
import { useSSE } from '@/hooks/use-sse';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { useWebVitals } from '@/hooks/use-web-vitals';

// ==================== Main Content ====================

function HomePageContent() {
  // Engine persistence + auth check
  useEffect(() => { initEnginePersistence(); }, []);
  const { checkAuth } = useAuthStore();
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // SSE real-time updates & auto-refresh hooks
  useSSE();
  const { refreshAll, isRefreshing } = useAutoRefresh();

  // Web Vitals monitoring
  useWebVitals();

  // Decision layer tab state (monitor / analysis / decision / simulation)
  const [decisionTab, setDecisionTab] = useState('monitor');

  // Operational tab state from Zustand
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  // Scroll state setters
  const setShowScrollTop = useUIStore((s) => s.setShowScrollTop);
  const setScrollProgress = useUIStore((s) => s.setScrollProgress);

  // Inventory detail setters (for notification center cross-tab navigation)
  const setSelectedInventorySku = useUIStore((s) => s.setSelectedInventorySku);
  const setInventoryDetail = useUIStore((s) => s.setInventoryDetail);

  // Product detail sheet state
  const [productDetailSku, setProductDetailSku] = useState<string | null>(null);
  const [productDetailOpen, setProductDetailOpen] = useState(false);

  // Notes panel state
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesSku, setNotesSku] = useState<string | undefined>(undefined);

  // CSV import dialog state
  const [csvImportOpen, setCSVImportOpen] = useState(false);

  // Password change dialog state
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);

  // User management panel state
  const [userManagementOpen, setUserManagementOpen] = useState(false);

  // Scroll listener for ScrollToTop visibility & progress
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setShowScrollTop(scrollTop > 200);
      setScrollProgress(docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [setShowScrollTop, setScrollProgress]);

  // Cross-tab navigation from notification center
  const handleNavigate = useCallback((tab: string) => { setActiveTab(tab); }, [setActiveTab]);

  const handleViewProductDetail = useCallback((sku: string) => {
    setProductDetailSku(sku);
    setProductDetailOpen(true);
  }, []);

  const handleOpenNotes = useCallback((sku?: string) => {
    setNotesSku(sku);
    setNotesOpen(true);
  }, []);

  const handleViewInventoryDetail = useCallback(async (sku: string) => {
    setSelectedInventorySku(sku);
    try {
      const [healthRes, safetyRes, reorderRes] = await Promise.all([
        fetch(`/api/inventory?action=health&sku=${sku}`),
        fetch(`/api/inventory?action=safety_stock&sku=${sku}&serviceLevel=0.95`),
        fetch(`/api/inventory?action=reorder&sku=${sku}`),
      ]);
      const [health, safety, reorder] = await Promise.all([
        healthRes.json(),
        safetyRes.json(),
        reorderRes.json(),
      ]);
      setInventoryDetail({ health, safety, reorder });
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('获取库存详情失败:', err);
    }
  }, [setSelectedInventorySku, setInventoryDetail]);

  return (
    <ErrorReportProvider>
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <OfflineBanner />
      <Header onRefresh={refreshAll} onOpenNotes={() => handleOpenNotes()} onOpenCSVImport={() => setCSVImportOpen(true)} userMenu={<UserMenu onOpenPasswordChange={() => setPasswordChangeOpen(true)} onOpenUserManagement={() => setUserManagementOpen(true)} />} />

      <ConfigToolbar />

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* ── Decision Flow Tabs (Monitor → Analysis → Decision → Simulation) ── */}
        <Tabs value={decisionTab} onValueChange={setDecisionTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 h-10 max-w-xl">
            <TabsTrigger value="monitor" className="gap-1.5 text-xs data-[state=active]:bg-emerald-50 dark:data-[state=active]:bg-emerald-950/30 data-[state=active]:text-emerald-700">
              <Eye className="h-3.5 w-3.5" />监控
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-1.5 text-xs data-[state=active]:bg-purple-50 dark:data-[state=active]:bg-purple-950/30 data-[state=active]:text-purple-700">
              <Search className="h-3.5 w-3.5" />分析
            </TabsTrigger>
            <TabsTrigger value="decision" className="gap-1.5 text-xs data-[state=active]:bg-orange-50 dark:data-[state=active]:bg-orange-950/30 data-[state=active]:text-orange-700">
              <Zap className="h-3.5 w-3.5" />决策
            </TabsTrigger>
            <TabsTrigger value="simulation" className="gap-1.5 text-xs data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950/30 data-[state=active]:text-blue-700">
              <Calendar className="h-3.5 w-3.5" />推演
            </TabsTrigger>
          </TabsList>

          <TabsContent value="monitor" className="tab-fade-in">
            <SectionErrorBoundary sectionName="实时监控">
              <MonitorStrip />
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="analysis" className="tab-fade-in">
            <SectionErrorBoundary sectionName="风险传播分析">
              <div className="space-y-4">
                <PassportPanel />
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 space-y-6"><RiskTab /></div>
                  <div className="space-y-6"><CostTab /></div>
                </div>
              </div>
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="decision" className="tab-fade-in">
            <SectionErrorBoundary sectionName="决策执行">
              <DecisionCenter />
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="simulation" className="tab-fade-in">
            <SectionErrorBoundary sectionName="仿真推演">
              <div className="space-y-4">
                <SandboxReplay />
                <SalesTab />
              </div>
            </SectionErrorBoundary>
          </TabsContent>
        </Tabs>

        {/* ── Operational Drill-down Tabs ── */}
        <Separator />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6 h-9 max-w-xl">
            <TabsTrigger value="inventory" className="gap-1 text-xs px-2 data-[state=active]:bg-emerald-50 dark:data-[state=active]:bg-emerald-950/30"><Boxes className="h-3 w-3" />库存</TabsTrigger>
            <TabsTrigger value="cost" className="gap-1 text-xs px-2 data-[state=active]:bg-rose-50 dark:data-[state=active]:bg-rose-950/30"><DollarSign className="h-3 w-3" />成本</TabsTrigger>
            <TabsTrigger value="logistics" className="gap-1 text-xs px-2 data-[state=active]:bg-violet-50 dark:data-[state=active]:bg-violet-950/30"><Ship className="h-3 w-3" />物流</TabsTrigger>
            <TabsTrigger value="supplier" className="gap-1 text-xs px-2 data-[state=active]:bg-amber-50 dark:data-[state=active]:bg-amber-950/30"><Building2 className="h-3 w-3" />供应商</TabsTrigger>
            <TabsTrigger value="risk" className="gap-1 text-xs px-2 data-[state=active]:bg-red-50 dark:data-[state=active]:bg-red-950/30"><Shield className="h-3 w-3" />风险</TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1 text-xs px-2 data-[state=active]:bg-orange-50 dark:data-[state=active]:bg-orange-950/30"><Activity className="h-3 w-3" />仪表盘</TabsTrigger>
          </TabsList>
          <TabsContent value="inventory" className="tab-fade-in"><SectionErrorBoundary sectionName="库存"><InventoryTab /></SectionErrorBoundary></TabsContent>
          <TabsContent value="cost" className="tab-fade-in"><SectionErrorBoundary sectionName="成本"><CostTab /></SectionErrorBoundary></TabsContent>
          <TabsContent value="logistics" className="tab-fade-in"><SectionErrorBoundary sectionName="物流"><LogisticsTab /></SectionErrorBoundary></TabsContent>
          <TabsContent value="supplier" className="tab-fade-in"><SectionErrorBoundary sectionName="供应商"><SupplierTab /></SectionErrorBoundary></TabsContent>
          <TabsContent value="risk" className="tab-fade-in"><SectionErrorBoundary sectionName="风险"><RiskTab /></SectionErrorBoundary></TabsContent>
          <TabsContent value="dashboard" className="tab-fade-in"><SectionErrorBoundary sectionName="仪表盘"><SalesTab /></SectionErrorBoundary></TabsContent>
        </Tabs>
      </main>

      <Footer />

      {/* Shared dialogs & overlays - lazy loaded */}
      <NotificationCenter onNavigate={handleNavigate} onViewInventoryDetail={handleViewInventoryDetail} />
      <GlobalSearch onViewDetail={handleViewProductDetail} />
      <AlertRulesDialog />
      <ProductCompareDialog />
      <ProductDetailSheet sku={productDetailSku} open={productDetailOpen} onOpenChange={setProductDetailOpen} />
      <NotesPanel open={notesOpen} onOpenChange={setNotesOpen} initialSku={notesSku} onViewProduct={handleViewProductDetail} />
      <CSVImportDialog open={csvImportOpen} onOpenChange={setCSVImportOpen} />
      <ScrollToTop />
      <QuickActions onRefresh={refreshAll} isRefreshing={isRefreshing} activeTab={activeTab} />
      <ChatPanel />
      <LoginDialog />
      <PasswordChangeDialog open={passwordChangeOpen} onOpenChange={setPasswordChangeOpen} />
      <UserManagementPanel open={userManagementOpen} onOpenChange={setUserManagementOpen} />
    </div>
    </ErrorReportProvider>
  );
}

// ==================== Page Root ====================

export default function HomePage() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <QueryProvider>
        <HomePageContent />
      </QueryProvider>
    </ThemeProvider>
  );
}
