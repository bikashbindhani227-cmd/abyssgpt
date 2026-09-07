import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { ThemeProvider } from './contexts/ThemeContext.js';
import { ChatProvider } from './contexts/ChatContext.js';
import { Navbar } from './components/Navbar.js';
import { Sidebar } from './components/Sidebar.js';
import { ChatPage } from './pages/ChatPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { PremiumPage } from './pages/PremiumPage.js';
import { AdminLayout } from './pages/admin/AdminLayout.js';
import { AdminLogin } from './pages/admin/AdminLogin.js';
import { clearAdminToken, hasAdminToken } from './lib/api.js';
import { AlertOctagon, LogOut } from 'lucide-react';
import { AbyssLogo } from './components/AbyssLogo.js';

type PageView = 'chat' | 'login' | 'register' | 'forgot-password' | 'settings' | 'premium' | 'admin';

const MOBILE_BREAKPOINT = 760;
const isMobileViewport = () => window.innerWidth <= MOBILE_BREAKPOINT;

const AppContent: React.FC = () => {
  const { firebaseUser, userProfile, loading, isAdmin, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageView>(
    () => (window.location.pathname.replace(/\/+$/, '') === '/admin' ? 'admin' : 'chat')
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileViewport());
  const [adminAuthenticated, setAdminAuthenticated] = useState(() => hasAdminToken());
  const [toast, setToast] = useState('');
  const showToast = useCallback((text: string) => setToast(text), []);

  useEffect(() => {
    if (currentPage === 'admin') window.history.replaceState({}, '', '/admin');
    else if (window.location.pathname === '/admin') window.history.replaceState({}, '', '/');
  }, [currentPage]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Keep the sidebar state in sync when the viewport crosses the breakpoint.
  useEffect(() => {
    let lastMobile = isMobileViewport();
    const onResize = () => {
      const mobile = isMobileViewport();
      if (mobile === lastMobile) return;
      lastMobile = mobile;
      setSidebarOpen(!mobile);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    if (isMobileViewport()) setSidebarOpen(false);
  }, []);

  // Splash while the Firebase session is being restored.
  if (loading) {
    return (
      <div className="splash">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line-strong bg-surface shadow-sm">
            <AbyssLogo size={26} />
          </div>
          <h1 className="mb-1 text-xl font-bold tracking-tight text-ink">AbyssGPT</h1>
          <p className="text-xs font-medium text-ink-3">Loading your conversations…</p>
        </div>
      </div>
    );
  }

  // /admin is an independent server-password protected area.
  if (currentPage === 'admin') {
    if (adminAuthenticated) {
      return (
        <AdminLayout
          onBackToChat={() => {
            clearAdminToken();
            setAdminAuthenticated(false);
            setCurrentPage('chat');
          }}
        />
      );
    }
    return (
      <AdminLogin
        onAuthenticated={() => setAdminAuthenticated(true)}
        onBackToChat={() => setCurrentPage('chat')}
      />
    );
  }

  // Not signed in -> auth flows.
  if (!firebaseUser) {
    if (currentPage === 'register') {
      return <RegisterPage onNavigate={(page) => setCurrentPage(page as PageView)} />;
    }
    if (currentPage === 'forgot-password') {
      return <ForgotPasswordPage onNavigate={(page) => setCurrentPage(page as PageView)} />;
    }
    return <LoginPage onNavigate={(page) => setCurrentPage(page as PageView)} />;
  }

  // Account suspended.
  if (userProfile?.isBanned) {
    return (
      <div className="splash p-6">
        <div className="card w-full max-w-md space-y-4 p-8 text-center shadow-lg">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface"
            style={{ color: 'var(--error)' }}
          >
            <AlertOctagon className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-ink">Account suspended</h2>
          <p className="text-[13px] leading-relaxed text-ink-3">
            Your access has been restricted by the administrator. If you believe this is a mistake, contact
            support to review your account status.
          </p>
          <div className="pt-2">
            <button onClick={logout} className="btn btn-soft btn-block">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full-page views.
  if (currentPage === 'settings') {
    return (
      <SettingsPage
        onBack={() => setCurrentPage('chat')}
        onOpenPremium={() => setCurrentPage('premium')}
      />
    );
  }

  if (currentPage === 'premium') {
    return <PremiumPage onBack={() => setCurrentPage('chat')} />;
  }

  // Primary chat application layout.
  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
      <Sidebar
        isOpen={sidebarOpen}
        onCloseMobile={closeMobileSidebar}
        onOpenSettings={() => setCurrentPage('settings')}
        onOpenPremium={() => setCurrentPage('premium')}
        onOpenAdmin={() => setCurrentPage('admin')}
        onLogout={() => setCurrentPage('chat')}
      />

      <div className="main">
        <Navbar
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onOpenPremium={() => setCurrentPage('premium')}
          onOpenAdmin={() => setCurrentPage('admin')}
          onOpenAccount={() => setCurrentPage('settings')}
        />
        <ChatPage
          onOpenSettings={() => setCurrentPage('settings')}
          onOpenPremium={() => setCurrentPage('premium')}
          onToast={showToast}
        />
      </div>

      {toast && (
        <div className="toast show" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ChatProvider>
          <AppContent />
        </ChatProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
