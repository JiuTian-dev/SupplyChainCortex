'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ThemeProvider } from 'next-themes';
import { QueryProvider } from '@/lib/query-provider';

// Layout
import { Header } from '@/components/layout/Header';
import { OfflineBanner, ErrorReportProvider } from '@/components/error';
import { UserMenu } from '@/components/auth/UserMenu';
import { ScrollToTop } from '@/components/shared/ScrollToTop';
import { ToolsPanel } from '@/components/shared/ToolsPanel';
import { GlobalSearch } from '@/components/shared/GlobalSearch';

// Core — Chat is the main interface
import { ChatPanel } from '@/components/shared/ChatPanel';

// Stores & hooks
import { useAuthStore } from '@/stores/auth-store';
import { useConnectionStore } from '@/stores/connection-store';
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';
import { useSSE } from '@/hooks/use-sse';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { useWebVitals } from '@/hooks/use-web-vitals';

// Dynamic overlays (keep these)
const NotificationCenter = dynamic(() => import('@/components/shared/NotificationCenter').then(m => ({ default: m.NotificationCenter })), { ssr: false });
const ProductDetailSheet = dynamic(() => import('@/components/shared/ProductDetailSheet').then(m => ({ default: m.ProductDetailSheet })), { ssr: false });
const NotesPanel = dynamic(() => import('@/components/shared/NotesPanel').then(m => ({ default: m.NotesPanel })), { ssr: false });
const CSVImportDialog = dynamic(() => import('@/components/shared/CSVImportDialog').then(m => ({ default: m.CSVImportDialog })), { ssr: false });
const LoginDialog = dynamic(() => import('@/components/auth/LoginDialog').then(m => ({ default: m.LoginDialog })), { ssr: false });
const PasswordChangeDialog = dynamic(() => import('@/components/auth/PasswordChangeDialog').then(m => ({ default: m.PasswordChangeDialog })), { ssr: false });
const UserManagementPanel = dynamic(() => import('@/components/admin/UserManagementPanel').then(m => ({ default: m.UserManagementPanel })), { ssr: false });
const AuditTab = dynamic(() => import('@/components/audit/AuditTab').then(m => ({ default: m.AuditTab })), { ssr: false });

// Legacy panel access (kept but hidden — accessible from data panel links)
const LegacyPanels = dynamic(() => import('@/components/dashboard/TabbedSection').then(m => ({ default: m.TabbedSection })), { ssr: false });
import { PANEL_REGISTRY } from '@/lib/dashboard/panel-registry';

function HomePageContent() {
  const { checkAuth } = useAuthStore();
  useEffect(() => { checkAuth(); }, [checkAuth]);

  useSSE();
  const { refreshAll } = useAutoRefresh();
  useWebVitals();
  const refreshHealth = useConnectionStore((s) => s.refreshHealth);
  useEffect(() => { refreshHealth(); }, [refreshHealth]);

  // View modes: 'chat' (default) | 'audit' | 'legacy'
  const [viewMode, setViewMode] = useState<'chat' | 'audit' | 'legacy'>('chat');
  const [legacyTab, setLegacyTab] = useState('inventory');

  const [productDetailSku, setProductDetailSku] = useState<string | null>(null);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesSku, setNotesSku] = useState<string | undefined>(undefined);
  const [csvImportOpen, setCSVImportOpen] = useState(false);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  // ToolsPanel state from stores
  const wsConnected = useConnectionStore((s) => s.wsConnected);
  const requestReconnect = useConnectionStore((s) => s.requestReconnect);
  const refreshCountdown = useDashboardUIStore((s) => s.refreshCountdown);
  const isRefreshing = useDashboardUIStore((s) => s.isRefreshing);
  const setGlobalSearchOpen = useDashboardUIStore((s) => s.setGlobalSearchOpen);

  // Include all panels except audit (which has its own dedicated view)
  const legacyPanels = PANEL_REGISTRY.filter(p => p.id !== 'audit');

  return (
    <ErrorReportProvider>
      <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <OfflineBanner />
        <Header
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenTools={() => setToolsOpen(true)}
          userMenu={
            <UserMenu
              onOpenPasswordChange={() => setPasswordChangeOpen(true)}
              onOpenUserManagement={() => setUserManagementOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          }
        />

        {/* Minimal nav bar */}
        <div className="border-b bg-white dark:bg-zinc-900 px-6 py-2 flex items-center gap-4">
          <button
            onClick={() => setViewMode('chat')}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
              viewMode === 'chat'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setViewMode('audit')}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
              viewMode === 'audit'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            审计
          </button>
          <button
            onClick={() => setViewMode('legacy')}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
              viewMode === 'legacy'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            数据面板
          </button>
        </div>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'chat' && (
            <ChatPanel
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
              onJumpToPanel={(panelId) => { setViewMode('legacy'); setLegacyTab(panelId); }}
            />
          )}
          {viewMode === 'audit' && (
            <div className="flex-1 overflow-auto">
              <AuditTab />
            </div>
          )}
          {viewMode === 'legacy' && (
            <div className="flex-1 overflow-auto p-6 max-w-[1600px] mx-auto w-full">
              <LegacyPanels
                panels={legacyPanels}
                activeTab={legacyTab}
                onTabChange={setLegacyTab}
              />
            </div>
          )}
        </main>

        {/* Overlays */}
        <GlobalSearch
          onSelectResult={() => {}}
          onViewDetail={(sku) => { setProductDetailSku(sku); setProductDetailOpen(true); }}
        />
        <ToolsPanel
          open={toolsOpen}
          onOpenChange={setToolsOpen}
          wsConnected={wsConnected}
          isRefreshing={isRefreshing}
          refreshCountdown={refreshCountdown}
          riskScore={null}
          onSearch={() => { setToolsOpen(false); setGlobalSearchOpen(true); }}
          onRefresh={refreshAll}
          onExport={() => { setToolsOpen(false); window.open('/api/export?module=all&format=csv', '_blank'); }}
          onImport={() => setCSVImportOpen(true)}
          onReconnect={requestReconnect}
          onOpenNotes={() => { setToolsOpen(false); setNotesSku(undefined); setNotesOpen(true); }}
          notesCount={0}
        />
        <NotificationCenter
          onNavigate={(tab, sku) => {
            setViewMode('legacy');
            setLegacyTab(tab);
            if (sku) setProductDetailSku(sku);
          }}
          onViewInventoryDetail={async (sku) => {
            setProductDetailSku(sku);
            setProductDetailOpen(true);
          }}
        />
        <ProductDetailSheet sku={productDetailSku || ''} open={productDetailOpen} onOpenChange={setProductDetailOpen} />
        <NotesPanel open={notesOpen} onOpenChange={setNotesOpen} initialSku={notesSku} />
        <CSVImportDialog open={csvImportOpen} onOpenChange={setCSVImportOpen} />
        <LoginDialog />
        <PasswordChangeDialog open={passwordChangeOpen} onOpenChange={setPasswordChangeOpen} />
        <UserManagementPanel open={userManagementOpen} onOpenChange={setUserManagementOpen} />
        <ScrollToTop />
      </div>
    </ErrorReportProvider>
  );
}

export default function Home() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryProvider>
        <HomePageContent />
      </QueryProvider>
    </ThemeProvider>
  );
}
