import React from 'react';
import { Menu, PanelLeft, Plus, Crown } from 'lucide-react';
import { useChatConversations, useChatActions } from '../contexts/ChatContext.js';

interface NavbarProps {
  onToggleSidebar: () => void;
  onOpenPremium: () => void;
}

/** Slim top bar: sidebar toggles, conversation title, new chat (mobile)
 *  and the upgrade shortcut. Everything else lives in the sidebar. */
export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, onOpenPremium }) => {
  const { activeConversation } = useChatConversations();
  const { createNewChat } = useChatActions();

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
          {activeConversation?.title || ''}
        </div>
      </div>

      <div className="top-actions">
        <button className="icon-btn top-new" onClick={() => createNewChat()} aria-label="New chat" title="New chat">
          <Plus size={19} strokeWidth={2.1} />
        </button>
        <button className="top-upgrade" onClick={onOpenPremium} aria-label="Upgrade to Pro">
          <Crown size={15} />
          <span>Upgrade</span>
        </button>
      </div>
    </header>
  );
};
