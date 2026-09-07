import React, { useState } from 'react';
import { Users, Terminal, Gauge, Settings as SettingsIcon, Shield, ArrowLeft, Menu, X, LayoutDashboard } from 'lucide-react';
import { AdminUsers } from './AdminUsers.js';
import { AdminSystemPrompt } from './AdminSystemPrompt.js';
import { AdminLimits } from './AdminLimits.js';
import { AdminSettings } from './AdminSettings.js';
import { AdminDashboard } from './AdminDashboard.js';

interface AdminLayoutProps {
  onBackToChat: () => void;
}
type AdminSection = 'dashboard' | 'users' | 'system-prompt' | 'limits' | 'settings';

export const AdminLayout: React.FC<AdminLayoutProps> = ({ onBackToChat }) => {
  const [currentSection, setCurrentSection] = useState<AdminSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems = [
    { id: 'dashboard' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'system-prompt' as const, label: 'System Prompt', icon: Terminal },
    { id: 'limits' as const, label: 'Limits & Quotas', icon: Gauge },
    { id: 'users' as const, label: 'Users', icon: Users },
    { id: 'settings' as const, label: 'App Settings', icon: SettingsIcon },
  ];
  const go = (section: AdminSection) => {
    setCurrentSection(section);
    setMobileMenuOpen(false);
  };
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-line bg-bg/90 px-3 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface sm:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open admin menu"
          >
            <Menu size={17} />
          </button>
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface" style={{ color: 'var(--accent)' }}>
            <Shield size={15} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">AbyssGPT Admin</div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-3">Control Center</div>
          </div>
        </div>
        <button onClick={onBackToChat} className="btn btn-soft btn-sm shrink-0">
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Back to Chat</span>
          <span className="sm:hidden">Exit</span>
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {mobileMenuOpen && (
          <button
            className="fixed inset-0 z-30 sm:hidden"
            style={{ background: 'var(--scrim)' }}
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          />
        )}
        <aside
          className={`fixed sm:static inset-y-0 left-0 z-40 w-[82vw] max-w-[285px] transform border-r border-line bg-deep p-3 transition-transform duration-200 sm:z-auto sm:w-60 sm:p-4 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
          }`}
        >
          <div className="mb-3 flex items-center justify-between sm:hidden">
            <div className="text-xs font-bold">Management</div>
            <button
              className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mb-2 hidden px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3 sm:block">
            Management
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                    active
                      ? 'border border-line bg-surface-3 text-ink'
                      : 'border border-transparent text-ink-3 hover:bg-surface-2 hover:text-ink-2'
                  }`}
                >
                  <Icon size={15} style={active ? { color: 'var(--accent)' } : undefined} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-5 lg:p-7" style={{ maxHeight: 'calc(100dvh - 56px)' }}>
          <div className="mx-auto max-w-6xl">
            {currentSection === 'dashboard' && <AdminDashboard onNavigateUsers={() => go('users')} />}
            {currentSection === 'system-prompt' && <AdminSystemPrompt />}
            {currentSection === 'limits' && <AdminLimits />}
            {currentSection === 'users' && <AdminUsers />}
            {currentSection === 'settings' && <AdminSettings />}
          </div>
        </main>
      </div>
    </div>
  );
};
