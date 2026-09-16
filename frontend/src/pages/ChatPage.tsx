import React, { useRef, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useChat } from '../contexts/ChatContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import { ChatMessageItem } from '../components/ChatMessageItem.js';
import { ChatComposer } from '../components/ChatComposer.js';
import { ChatSkeleton } from '../components/ui.js';
import { AbyssLogo } from '../components/AbyssLogo.js';

interface ChatPageProps {
  onOpenSettings: () => void;
  onOpenPremium: () => void;
  onToast: (text: string) => void;
}

function extractFirstName(
  userProfile?: { displayName?: string | null; email?: string | null } | null,
  firebaseUser?: { displayName?: string | null; email?: string | null } | null
): string {
  const email = (userProfile?.email || firebaseUser?.email || '').trim().toLowerCase();
  if (email) {
    const local = email.split('@')[0];
    if (local.startsWith('bikash')) {
      return 'Bikash';
    }
  }

  const rawDisplayName = (userProfile?.displayName || firebaseUser?.displayName || '').trim();
  if (rawDisplayName && !['Abyss User', 'User', 'Admin', 'Anonymous'].includes(rawDisplayName)) {
    if (rawDisplayName.toLowerCase().startsWith('bikash')) {
      return 'Bikash';
    }
    const firstWord = rawDisplayName.split(/[\s,._-]+/)[0];
    if (firstWord && !firstWord.includes('@')) {
      const clean = firstWord.replace(/\d+$/, '');
      if (clean.toLowerCase().startsWith('bikash')) {
        return 'Bikash';
      }
      if (clean.length >= 2) {
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      }
    }
  }

  if (email && email.includes('@')) {
    const local = email.split('@')[0];
    const separatorPart = local.split(/[._\-+]/)[0];
    const cleanSep = (separatorPart || '').replace(/\d+$/, '');
    if (cleanSep && cleanSep.length >= 2) {
      return cleanSep.charAt(0).toUpperCase() + cleanSep.slice(1);
    }
    const noDigits = local.replace(/\d+$/, '');
    if (noDigits && noDigits.length >= 2) {
      return noDigits.charAt(0).toUpperCase() + noDigits.slice(1);
    }
  }

  return '';
}

export const ChatPage: React.FC<ChatPageProps> = ({ onOpenPremium, onToast }) => {
  const {
    messages,
    isStreaming,
    thinkingText,
    agentActivity,
    agentStartedAt,
    agentFinishedAt,
    activeTodos,
    activeAttachments,
    isLoadingMessages,
    error,
    clearError,
    sendMessage,
    stopGenerating,
    regenerateMessage,
    deleteMessageItem,
  } = useChat();

  useEffect(() => {
    if (error) {
      onToast(error);
      clearError();
    }
  }, [error, onToast, clearError]);

  const { userProfile, firebaseUser, limits } = useAuth();
  const chatRef = useRef<HTMLDivElement>(null);

  const lastScrollAt = useRef(0);
  useEffect(() => {
    const now = performance.now();
    if (now - lastScrollAt.current < 80) return;
    const scroller = chatRef.current;
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom > 260 && isStreaming) return;
    lastScrollAt.current = now;
    const id = window.requestAnimationFrame(() => {
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [messages, isStreaming]);

  const userInitial = (userProfile?.displayName || userProfile?.email || 'U')[0].toUpperCase();
  const firstName = extractFirstName(userProfile, firebaseUser);

  const dailyUsed = userProfile?.dailyMessageCount ?? 0;
  const dailyLimit = limits?.dailyLimit ?? 20;
  const isLimitReached = dailyUsed >= dailyLimit && userProfile?.plan !== 'premium';

  return (
    <>
      <section className="chat" id="chat" ref={chatRef} aria-label="Conversation">
        {isLoadingMessages && messages.length === 0 && <ChatSkeleton />}

        {(!isLoadingMessages || messages.length > 0) && (
          <div className="chat-inner" id="chatInner">
            {messages.length === 0 && !isStreaming && (
              <div className="empty" id="chatEmptyState">
                <div className="empty-brand" aria-hidden="true">
                  <AbyssLogo size={52} />
                </div>
                <h1 className="empty-title">
                  Welcome{firstName ? `, ${firstName}` : ''}
                </h1>
                <p className="empty-subtitle">
                  How can I help you today?
                </p>
              </div>
            )}

            {messages.map((msg, index) => {
              const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1;
              const isCurrentStreaming = isStreaming && isLastAssistant;

              return (
                <ChatMessageItem
                  key={msg.clientKey || msg.id}
                  message={msg}
                  userInitial={userInitial}
                  isStreaming={isCurrentStreaming}
                  thinkingText={isCurrentStreaming ? thinkingText : null}
                  activeAttachments={isCurrentStreaming ? activeAttachments : undefined}
                  activeTodos={isCurrentStreaming ? activeTodos : undefined}
                  agentActivity={isLastAssistant ? agentActivity : undefined}
                  agentStartedAt={isLastAssistant ? agentStartedAt : undefined}
                  agentFinishedAt={isLastAssistant ? agentFinishedAt : undefined}
                  onRegenerate={
                    isLastAssistant && !isStreaming
                      ? regenerateMessage
                      : undefined
                  }
                  onDelete={msg.isError ? undefined : deleteMessageItem}
                  onToast={onToast}
                />
              );
            })}

            {isLimitReached && !isStreaming && (
              <div className="inline-error" role="status" style={{ marginBottom: 8 }}>
                <Sparkles size={16} style={{ flex: '0 0 auto' }} />
                <span className="flex-1">
                  You've used all {dailyLimit} free messages for today. Upgrade to Pro for 200 daily messages.
                </span>
                <button type="button" className="retry-btn" onClick={onOpenPremium}>
                  Upgrade
                </button>
              </div>
            )}

            {(messages.length > 0 || isStreaming) && (
              <div className="chat-bottom-spacer" aria-hidden="true" />
            )}
          </div>
        )}
      </section>

      <ChatComposer
        onSend={(text, attachments) => sendMessage(text, attachments)}
        onStop={stopGenerating}
        isStreaming={isStreaming}
        disabled={isLimitReached}
      />
    </>
  );
};
