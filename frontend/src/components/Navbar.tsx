import React, { useState, useRef, useEffect } from 'react';
import { Menu, MoreHorizontal, PanelLeft, Plus, Crown, UserRound, LogOut, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';
import { useChat } from '../contexts/ChatContext.js';
import { AbyssLogo } from './AbyssLogo.js';
import { PWAInstallModal } from './PWAInstallModal.js';
import { usePWAInstall } from '../hooks/usePWAInstall.js';

interface NavbarProps {
  onToggleSidebar: () => void;
  onOpenPremium: () => void;
  onOpenAccount: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleSidebar,
  onOpenPremium,
  onOpenAccount,
}) => {
  const { isPremium, logout } = useAuth();
  const { activeConversation, createNewChat } = useChat();
  const [showMenu, setShowMenu] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const { isInstalled } = usePWAInstall();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showMenu]);

  return (
    <header className="topbar">
      <div className="top-left">
        <button className="icon-btn mobile-menu" onClick={onToggleSidebar} aria-label="Open sidebar">
          <Menu size={20} strokeWidth={2.1} />
        </button>
        <button className="icon-btn desktop-panel-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <PanelLeft size={18} />
        </button>
        <div className="top-title" title={activeConversation?.title || undefined}>
          {activeConversation?.title ? (
            activeConversation.title
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <AbyssLogo size={16} />
              <span>AbyssGPT</span>
            </span>
          )}
        </div>
      </div>

      <div className="top-actions" ref={menuRef}>
        <button className="icon-btn top-new" onClick={() => createNewChat()} aria-label="New chat" title="New chat">
          <Plus size={19} strokeWidth={2.1} />
        </button>
        {!isPremium && (
          <button className="top-upgrade" onClick={onOpenPremium}>
            <Crown size={15} />
            <span>Upgrade</span>
          </button>
        )}
        <button
          className="icon-btn"
          onClick={() => setShowMenu((v) => !v)}
          aria-label="More options"
          aria-expanded={showMenu}
          aria-haspopup="menu"
          title="More options"
        >
          <MoreHorizontal size={19} />
        </button>

        {showMenu && (
          <div className="top-menu" role="menu">
            <button role="menuitem" onClick={() => { setShowMenu(false); createNewChat(); }}>
              <Plus size={15} /> New chat
            </button>
            <button role="menuitem" onClick={() => { setShowMenu(false); onOpenAccount(); }}>
              <UserRound size={15} /> Account & Settings
            </button>
            {!isInstalled && (
              <button role="menuitem" onClick={() => { setShowMenu(false); setShowInstallModal(true); }}>
                <Download size={15} className="text-indigo-400" /> Install AbyssGPT App
              </button>
            )}
            <div className="top-menu-sep" />
            <button role="menuitem" className="danger" onClick={() => { setShowMenu(false); logout(); }}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>

      <PWAInstallModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </header>
  );
};
