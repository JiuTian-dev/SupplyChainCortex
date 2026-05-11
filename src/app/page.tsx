'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ThemeProvider } from 'next-themes';
import { QueryProvider } from '@/lib/query-provider';
import { Separator } from '@/components/ui/separator';
import { LazyLoader } from '@/components/shared/LazyLoader';

// ── TabbedSection (lightweight, always needed) ──────────────────────────────
import { TabbedSection } from '@/components/dashboard/TabbedSection';

// ── Panel registry + config ─────────────────────────────────────────────────
import { PANEL_REGISTRY } from '@/lib/dashboard/panel-registry';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';

// ── Layout (always visible, lightweight) ────────────────────────────────────
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { SectionErrorBoundary, OfflineBanner, ErrorReportProvider } from '@/components/error';
import { UserMenu } from '@/components/auth/UserMenu';
import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { ScrollToTop } from '@/components/shared/ScrollToTop';
import { QuickActions } from '@/components/shared/QuickActions';

// ── Stores & hooks ──────────────────────────────────────────────────────────
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useSSE } from '@/hooks/use-sse';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { useWebVitals } from '@/hooks/use-web-vitals';

// ── Dynamic dialogs & overlays ──────────────────────────────────────────────
const NotificationCenter = dynamic(() => import('@/components/shared/NotificationCenter').then(m => ({ default: m.NotificationCenter })), { ssr: false });
const ProductDetailSheet = dynamic(() => import('@/components/shared/ProductDetailSheet').then(m => ({ default: m.ProductDetailSheet })), { ssr: false });
const NotesPanel = dynamic(() => import('@/components/shared/NotesPanel').then(m => ({ default: m.NotesPanel })), { ssr: false });
const CSVImportDialog = dynamic(() => import('@/components/shared/CSVImportDialog').then(m => ({ default: m.CSVImportDialog })), { ssr: false });
const ChatPanel = dynamic(() => import('@/components/shared/ChatPanel').then(m => ({ default: m.ChatPanel })), { ssr: false });
const LoginDialog = dynamic(() => import('@/components/auth/LoginDialog').then(m => ({ default: m.LoginDialog })), { ssr: false });
const PasswordChangeDialog = dynamic(() => import('@/components/auth/PasswordChangeDialog').then(m => ({ default: m.PasswordChangeDialog })), { ssr: false });
const UserManagementPanel = dynamic(() => import('@/components/admin/UserManagementPanel').then(m => ({ default: m.UserManagementPanel })), { ssr: false });

// Lazy engine persistence init
let engineInitPromise: Promise<void> | null = null;
function initEngine() {
  if (!engineInitPromise) {
    engineInitPromise = import('@/lib/engine/persistence').then(m => m.initEnginePersistence());
  }
  return engineInitPromise;
}

// ── Main Page ───────────────────────────────────────────────────────────────

function HomePageContent() {
  // Engine + auth
  useEffect(() => { initEngine(); }, []);
  const { checkAuth } = useAuthStore();
  useEffect(() => { checkAuth(); }, [checkAuth]);

  // SSE + auto-refresh + web vitals
  useSSE();
  const { refreshAll } = useAutoRefresh();
  useWebVitals();

  // ── Tab state ────────────────────────────────────────────────────────────
  const [decisionTab, setDecisionTab] = useState('monitor');
  const activeTab = useUIStore(s => s.activeTab);
  const setActiveTab = useUIStore(s => s.setActiveTab);
  const setShowScrollTop = useUIStore(s => s.setShowScrollTop);
  const setScrollProgress = useUIStore(s => s.setScrollProgress);
  const setSelectedInventorySku = useUIStore(s => s.setSelectedInventorySku);
  const setInventoryDetail = useUIStore(s => s.setInventoryDetail);

  // ── Panel visibility from config ─────────────────────────────────────────
  const panels = useDashboardConfigStore(s => s.config.panels);

  const decisionPanels = useMemo(() =>
    PANEL_REGISTRY.filter(p => p.category === 'decision' && (panels[p.id] !== false)),
  [panels]);

  const opsPanels = useMemo(() =>
    PANEL_REGISTRY.filter(p => p.category === 'ops' && (panels[p.id] !== false)),
  [panels]);

  // ── Dialog states ────────────────────────────────────────────────────────
  const [productDetailSku, setProductDetailSku] = useState<string | null>(null);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesSku, setNotesSku] = useState<string | undefined>(undefined);
  const [csvImportOpen, setCSVImportOpen] = useState(false);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);

  // ── Scroll ───────────────────────────────────────────────────────────────
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

  // ── Navigation callbacks ─────────────────────────────────────────────────
  const handleNavigate = useCallback((tab: string) => { setActiveTab(tab); }, [setActiveTab]);
  const handleViewProductDetail = useCallback((sku: string) => {
    setProductDetailSku(sku); setProductDetailOpen(true);
  }, []);
  const handleOpenNotes = useCallback((sku?: string) => {
    setNotesSku(sku); setNotesOpen(true);
  }, []);
  const handleViewInventoryDetail = useCallback(async (sku: string) => {
    setSelectedInventorySku(sku);
    try {
      const [healthRes, safetyRes, reorderRes] = await Promise.all([
        fetch(`/api/inventory?action=health&sku=${sku}`),
        fetch(`/api/inventory?action=safety_stock&sku=${sku}&serviceLevel=0.95`),
        fetch(`/api/inventory?action=reorder&sku=${sku}`),
      ]);
      const [health, safety, reorder] = await Promise.all([healthRes.json(), safetyRes.json(), reorderRes.json()]);
      setInventoryDetail({ health, safety, reorder });
    } catch { /* silent */ }
  }, [setSelectedInventorySku, setInventoryDetail]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ErrorReportProvider>
      <div className="min-h-screen flex flex-col overflow-x-hidden">
        <OfflineBanner />
        <Header
          onRefresh={refreshAll}
          onOpenNotes={() => handleOpenNotes()}
          onOpenCSVImport={() => setCSVImportOpen(true)}
          userMenu={
            <UserMenu
              onOpenPasswordChange={() => setPasswordChangeOpen(true)}
              onOpenUserManagement={() => setUserManagementOpen(true)}
            />
          }
        />

        <ConfigToolbarLazy />

        <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          {/* ── Decision Flow ── */}
          <TabbedSection
            panels={decisionPanels}
            activeTab={decisionTab}
            onTabChange={setDecisionTab}
          />

          <Separator />

          {/* ── Operational Drill-down ── */}
          <TabbedSection
            panels={opsPanels}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </main>

        <Footer />

        {/* ── Shared dialogs & overlays ── */}
        <NotificationCenter onNavigate={handleNavigate} onViewInventoryDetail={handleViewInventoryDetail} />
        <ProductDetailSheet sku={productDetailSku || ''} open={productDetailOpen} onOpenChange={setProductDetailOpen} />
        <NotesPanel open={notesOpen} onOpenChange={setNotesOpen} initialSku={notesSku} />
        <CSVImportDialog open={csvImportOpen} onOpenChange={setCSVImportOpen} />
        <ChatPanel />
        <LoginDialog />
        <PasswordChangeDialog open={passwordChangeOpen} onOpenChange={setPasswordChangeOpen} />
        <UserManagementPanel open={userManagementOpen} onOpenChange={setUserManagementOpen} />
        <GlobalSearch />
        <ScrollToTop />
        <QuickActions onRefresh={refreshAll} isRefreshing={false} activeTab={activeTab} />
      </div>
    </ErrorReportProvider>
  );
}

// ── Lazy ConfigToolbar (imports panel registry → moderate weight) ────────────
const ConfigToolbarLazy = dynamic(
  () => import('@/components/dashboard/ConfigToolbar').then(m => ({ default: m.ConfigToolbar })),
  { ssr: false, loading: () => <div className="h-8 bg-muted/30 border-b" /> },
);

// ── Root export ─────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryProvider>
        <HomePageContent />
      </QueryProvider>
    </ThemeProvider>
  );
}
