import React, { useState } from 'react';
import { ChevronRight, Pencil, Search, Shield, Sparkles, Trash2, X, LogOut, FilePlus2 } from 'lucide-react';
import { useChat } from '../contexts/ChatContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import { AbyssLogo } from './AbyssLogo.js';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile?: () => void;
  onOpenSettings: () => void;
  onOpenPremium: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onCloseMobile,
  onOpenSettings,
  onOpenPremium,
  onOpenAdmin,
  onLogout,
}) => {
  const {
    conversations,
    filteredConversations,
    searchQuery,
    setSearchQuery,
    activeConversationId,
    selectConversation,
    createNewChat,
    renameConversation,
    deleteConversation,
  } = useChat();
  const { userProfile, isAdmin, isPremium, logout } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const handleNewChat = async () => {
    await createNewChat();
    onCloseMobile?.();
  };

  const handleStartRename = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(title);
  };

  const handleSaveRename = async (id: string, e: React.MouseEvent | React.KeyboardEvent | React.FocusEvent) => {
    e.stopPropagation();
    if (editingTitle.trim()) await renameConversation(id, editingTitle.trim());
    setEditingId(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this conversation?')) await deleteConversation(id);
  };

  const handleSignOut = () => {
    logout();
    onLogout();
  };

  const userInitial = (userProfile?.displayName || userProfile?.email || 'U')[0].toUpperCase();

  return (
    <>
      {isOpen && <button className="sidebar-backdrop" onClick={onCloseMobile} aria-label="Close sidebar" tabIndex={-1} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Conversations sidebar">
        <div className="sidebar-head">
          <button
            className="abyss-brand"
            onClick={() => {
              selectConversation(null);
              onCloseMobile?.();
            }}
            aria-label="AbyssGPT home"
          >
            <span className="abyss-brand-mark">
              <AbyssLogo size={18} />
            </span>
            <span>AbyssGPT</span>
          </button>
          <button className="sidebar-close" onClick={onCloseMobile} aria-label="Close sidebar">
            <X size={19} />
          </button>
        </div>

        <button className="sidebar-action primary" onClick={handleNewChat}>
          <FilePlus2 size={18} />
          <span>New chat</span>
        </button>

        <div className="sidebar-search">
          <Search size={15} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats…"
            aria-label="Search conversations"
          />
        </div>

        <div className="sidebar-section-title">
          <span>Recent</span>
        </div>

        <div className="history">
          {conversations.length === 0 ? (
            <div className="empty-history">Your conversations will appear here once you start chatting.</div>
          ) : filteredConversations.length === 0 ? (
            <div className="empty-history">No conversations match “{searchQuery}”.</div>
          ) : (
            filteredConversations.map((conv) => {
              const active = conv.id === activeConversationId;
              const editing = editingId === conv.id;
              return (
                <div
                  key={conv.id}
                  className={`conv-row ${active ? 'active' : ''}`}
                  onClick={() => {
                    if (!editing) {
                      selectConversation(conv.id);
                      onCloseMobile?.();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !editing) {
                      e.preventDefault();
                      selectConversation(conv.id);
                      onCloseMobile?.();
                    }
                  }}
                  aria-current={active ? 'true' : undefined}
                >
                  {editing ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      aria-label="Rename conversation"
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(conv.id, e);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={(e) => handleSaveRename(conv.id, e)}
                    />
                  ) : (
                    <span>{conv.title || 'New chat'}</span>
                  )}
                  {!editing && (
                    <div className="conv-row-actions">
                      <button onClick={(e) => handleStartRename(conv.id, conv.title, e)} aria-label={`Rename "${conv.title}"`}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={(e) => handleDelete(conv.id, e)} aria-label={`Delete "${conv.title}"`} className="danger">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="sidebar-spacer" />

        <button className={`upgrade-card${isPremium ? ' pro' : ''}`} onClick={onOpenPremium}>
          <div>
            <strong>{isPremium ? 'Pro plan' : 'Upgrade to Pro'}</strong>
            <span>{isPremium ? 'Premium features unlocked' : 'Unlock more features'}</span>
          </div>
          <span className="upgrade-icon">
            <Sparkles size={16} />
          </span>
        </button>

        <button className="account-card" onClick={onOpenSettings}>
          <span className="account-avatar">
            {userProfile?.photoURL ? <img src={userProfile.photoURL} alt="" /> : userInitial}
          </span>
          <span className="account-copy">
            <strong>{userProfile?.displayName || 'Abyss User'}</strong>
            <span>{isPremium ? 'Pro plan' : 'Free plan'}</span>
          </span>
          <ChevronRight size={16} className="account-chevron" />
        </button>

        {/* The account card above already opens Settings, so this row only
            needs the actions that live nowhere else. */}
        <div className="sidebar-bottom-actions">
          {isAdmin && (
            <button onClick={onOpenAdmin}>
              <Shield size={15} />
              <span>Admin</span>
            </button>
          )}
          <button onClick={handleSignOut}>
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
};
