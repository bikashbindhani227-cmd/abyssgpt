import React, { useRef, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useChat } from '../contexts/ChatContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import { ChatMessageItem } from '../components/ChatMessageItem.js';
import { ChatComposer } from '../components/ChatComposer.js';
import { MarkdownContent } from '../components/MarkdownContent.js';
import { ChatSkeleton } from '../components/ui.js';
import { AgentActivity } from '../components/AgentActivity.js';
import { TodoPanel } from '../components/TodoPanel.js';

interface ChatPageProps {
  onOpenSettings: () => void;
  onOpenPremium: () => void;
  onToast: (text: string) => void;
}

/** Map internal progress events to calm, user-facing status labels.
 *  Never exposes provider or tool implementation names. */
function friendlyStatus(raw: string | null): string {
  if (!raw) return 'Thinking';
  const t = raw.toLowerCase();
  if (t.includes('search')) return 'Searching the web';
  if (t.includes('read')) return 'Reading sources';
  if (t.includes('run') || t.includes('execut') || t.includes('code')) return 'Executing';
  if (t.includes('finish') || t.includes('wrap') || t.includes('review') || t.includes('answer')) return 'Writing response';
  return 'Thinking';
}

export const ChatPage: React.FC<ChatPageProps> = ({ onOpenPremium, onToast }) => {
  const {
    messages,
    isStreaming,
    streamingContent,
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

  // Conversation-level failures (rename, delete, load) surface as toasts;
  // stream failures surface as inline retryable bubbles (see ChatContext).
  useEffect(() => {
    if (error) {
      onToast(error);
      clearError();
    }
  }, [error, onToast, clearError]);

  const { userProfile, limits } = useAuth();
  const chatRef = useRef<HTMLDivElement>(null);

  // Throttled auto-scroll that never fights the user while they read upward.
  const lastScrollAt = useRef(0);
  useEffect(() => {
    const now = performance.now();
    if (now - lastScrollAt.current < 120) return;
    const scroller = chatRef.current;
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom > 220 && streamingContent) return;
    lastScrollAt.current = now;
    const id = window.requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [messages.length, streamingContent, thinkingText]);

  const userInitial = (userProfile?.displayName || userProfile?.email || 'U')[0].toUpperCase();

  const dailyUsed = userProfile?.dailyMessageCount ?? 0;
  const dailyLimit = limits?.dailyLimit ?? 20;
  const isLimitReached = dailyUsed >= dailyLimit && userProfile?.plan !== 'premium';

  return (
    <>
      <section className="chat" id="chat" ref={chatRef} aria-label="Conversation">
        {isLoadingMessages && <ChatSkeleton />}

        {!isLoadingMessages && (
          <div className="chat-inner" id="chatInner">
            {messages.map((msg, index) => (
              <ChatMessageItem
                key={msg.id || index}
                message={msg}
                userInitial={userInitial}
                onRegenerate={
                  index === messages.length - 1 && msg.role === 'assistant' && !isStreaming
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
                  {activeAttachments.length > 0 && (
                    <div className="composer-attachments" style={{ padding: 0, marginBottom: 6 }}>
                      {activeAttachments.map((att, idx) => (
                        <div
                          key={`${att.filename}-${idx}`}
                          className={`attachment-chip${att.rejected ? ' attachment-rejected' : ''}`}
                          title={att.rejected ? att.rejectionReason : att.filename}
                        >
                          <span className="attachment-icon">
                            {att.rejected || !att.hasTextContent ? '⚠' : '📄'}
                          </span>
                          <span className="attachment-name">{att.filename}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {activeTodos.length > 0 && <TodoPanel todos={activeTodos} />}
                  <AgentActivity
                    items={agentActivity}
                    isStreaming={isStreaming}
                    startedAt={agentStartedAt}
                    finishedAt={agentFinishedAt}
                  />
                  {/* Pre-first-token progress states; once content arrives the
                      caret itself signals ongoing generation (calmer, no dupes). */}
                  {!streamingContent && (
                    <div className="status-line" role="status" aria-live="polite">
                      <span className="status-dot" aria-hidden="true" />
                      <span>{friendlyStatus(thinkingText)}</span>
                    </div>
                  )}
                  {streamingContent && (
                    <div className="msg-content streaming-text">
                      <MarkdownContent content={streamingContent} onToast={onToast} />
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
