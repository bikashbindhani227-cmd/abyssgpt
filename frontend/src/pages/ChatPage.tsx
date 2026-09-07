import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useChatConversations, useChatActions, useChatStreaming } from '../contexts/ChatContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import { ChatMessageItem } from '../components/ChatMessageItem.js';
import { ChatComposer } from '../components/ChatComposer.js';
import { StreamingMarkdown } from '../components/MarkdownContent.js';
import { AbyssLogo } from '../components/AbyssLogo.js';
import { ChatSkeleton } from '../components/ui.js';

interface ChatPageProps {
  onOpenPremium: () => void;
  onToast: (text: string) => void;
}


/** Map internal progress events to calm, user-facing status labels.
 *  Never exposes provider or tool implementation names. */
function friendlyStatus(raw: string | null): string {
  if (!raw) return 'Thinking';
  const t = raw.toLowerCase();
  if (t.includes('search')) return 'Searching';
  if (t.includes('read')) return 'Reading';
  if (t.includes('code') || t.includes('execut') || t.includes('run')) return 'Running code';
  if (t.includes('verif') || t.includes('test') || t.includes('check')) return 'Verifying';
  if (t.includes('finish') || t.includes('wrap') || t.includes('answer') || t.includes('writ')) return 'Writing';
  if (t.includes('tool') || t.includes('parallel')) return 'Working';
  return 'Thinking';
}

export const ChatPage: React.FC<ChatPageProps> = ({ onOpenPremium, onToast }) => {
  const {
    messages,
    isLoadingMessages,
    error,
  } = useChatConversations();
  const { isStreaming, streamingContent, thinkingText } = useChatStreaming();
  const {
    sendMessage,
    stopGenerating,
    regenerateMessage,
    deleteMessageItem,
    clearError,
  } = useChatActions();

  // Conversation-level failures (rename, delete, load) surface as toasts;
  // stream failures surface as inline retryable bubbles (see ChatContext).
  useEffect(() => {
    if (error) {
      onToast(error);
      clearError();
    }
  }, [error, onToast, clearError]);

  const { userProfile, limits } = useAuth();

  /* Browser toggle lives here so its state survives the composer moving
   * between the centered home position and the docked chat position. */
  const [webSearch, setWebSearch] = useState(false);
  const toggleWebSearch = useCallback((next: boolean) => setWebSearch(next), []);

  /* ---------- Auto-scroll that never fights the reader ----------
   * A sentinel tracks whether the user is parked near the bottom.
   * Content changes scroll via requestAnimationFrame only while the
   * user is following; scrolling up pauses the follow until they
   * return to the bottom. No scroll work happens on other renders. */
  const scrollerRef = useRef<HTMLElement | null>(null);
  const stickToBottomRef = useRef(true);
  const isEmpty = messages.length === 0 && !isStreaming && !isLoadingMessages;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = dist < 160;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isEmpty]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [messages.length, streamingContent, thinkingText, isLoadingMessages]);

  const handleSend = useCallback(
    (text: string, search: boolean) => {
      stickToBottomRef.current = true;
      sendMessage(text, search);
    },
    [sendMessage]
  );

  const userInitial = (userProfile?.displayName || userProfile?.email || 'U')[0].toUpperCase();

  const dailyUsed = userProfile?.dailyMessageCount ?? 0;
  const dailyLimit = limits?.dailyLimit ?? 20;
  const isLimitReached = dailyUsed >= dailyLimit && userProfile?.plan !== 'premium';

  const lastMsgIndex = messages.length - 1;

  return (
    <div className="chat-screen">
      {isEmpty ? (
        /* ---------- Centered home: greeting + composer, nothing else ---------- */
        <div className="home">
          <div className="home-hero">
            <div className="home-mark" aria-hidden="true">
              <AbyssLogo size={24} />
            </div>
            <h1 className="home-title">How can I help you today?</h1>
          </div>
          <ChatComposer
            onSend={handleSend}
            onStop={stopGenerating}
            isStreaming={isStreaming}
            disabled={isLimitReached}
            webSearch={webSearch}
            onToggleWebSearch={toggleWebSearch}
            autoFocus
          />
          <p className="composer-foot">AbyssGPT can make mistakes — verify important information.</p>
        </div>
      ) : (
        <>
          <section className="chat" id="chat" ref={scrollerRef} aria-label="Conversation">
            <div className="chat-inner">
              {isLoadingMessages && messages.length === 0 && <ChatSkeleton />}

              {messages.map((msg, index) => (
                <ChatMessageItem
                  key={msg.id || index}
                  message={msg}
                  userInitial={userInitial}
                  onRegenerate={
                    index === lastMsgIndex && msg.role === 'assistant' && !isStreaming
                      ? regenerateMessage
                      : undefined
                  }
                  onDelete={msg.isError ? undefined : deleteMessageItem}
                  onToast={onToast}
                />
              ))}

              {isStreaming && (
                <div className="message assistant">
                  <div className="msg-avatar" aria-hidden="true">
                    A
                  </div>
                  <div className="msg-body">
                    <div className="msg-role">AbyssGPT</div>
                    {/* Pre-first-token progress states; once content arrives the
                        caret itself signals ongoing generation (calmer, no dupes). */}
                    {!streamingContent && (
                      <div className="status-line" role="status" aria-live="polite">
                        <span className="status-dot" aria-hidden="true" />
                        <span>{friendlyStatus(thinkingText)}…</span>
                      </div>
                    )}
                    {streamingContent && (
                      <div className="msg-content streaming-text">
                        <StreamingMarkdown content={streamingContent} onToast={onToast} />
                        <span className="stream-caret" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                </div>
              )}

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
            </div>
          </section>

          {/* ---------- Docked composer ---------- */}
          <div className="composer-dock">
            <ChatComposer
              onSend={handleSend}
              onStop={stopGenerating}
              isStreaming={isStreaming}
              disabled={isLimitReached}
              webSearch={webSearch}
              onToggleWebSearch={toggleWebSearch}
            />
            <p className="composer-foot">AbyssGPT can make mistakes — verify important information.</p>
          </div>
        </>
      )}
    </div>
  );
};
