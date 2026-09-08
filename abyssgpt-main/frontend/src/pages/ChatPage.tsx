import React, { useRef, useEffect } from 'react';
import { BarChart3, Code2, Globe, PenLine, Sparkles, Telescope } from 'lucide-react';
import { useChat } from '../contexts/ChatContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import { ChatMessageItem } from '../components/ChatMessageItem.js';
import { ChatComposer } from '../components/ChatComposer.js';
import { MarkdownContent } from '../components/MarkdownContent.js';
import { AbyssLogo } from '../components/AbyssLogo.js';
import { ChatSkeleton } from '../components/ui.js';
import { AgentActivity } from '../components/AgentActivity.js';

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

/** Curated starting points — each one sends a real message through the
 *  normal chat pipeline; nothing here is decorative. */
const EXAMPLE_PROMPTS: Array<{ icon: React.ComponentType<{ size?: number }>; label: string; prompt: string }> = [
  {
    icon: Telescope,
    label: 'Research',
    prompt: 'Research the current state of solid-state batteries and summarize the key challenges',
  },
  {
    icon: Code2,
    label: 'Coding',
    prompt: 'Write a type-safe useDebounce hook for React with proper cleanup on unmount',
  },
  {
    icon: PenLine,
    label: 'Writing',
    prompt: 'Draft a friendly launch announcement for a small productivity app',
  },
  {
    icon: Globe,
    label: 'Latest',
    prompt: "What are this week's most important developments in AI?",
  },
  {
    icon: BarChart3,
    label: 'Analysis',
    prompt: 'Compare Postgres and MongoDB for a high-write analytics workload',
  },
];

export const ChatPage: React.FC<ChatPageProps> = ({ onOpenPremium, onToast }) => {
  const {
    messages,
    isStreaming,
    streamingContent,
    thinkingText,
    agentSteps,
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

  const isEmpty = messages.length === 0 && !isStreaming && !isLoadingMessages;

  return (
    <>
      <section className="chat" id="chat" ref={chatRef} aria-label="Conversation">
        {isLoadingMessages && <ChatSkeleton />}

        {!isLoadingMessages && isEmpty && (
          <div className="empty" id="empty">
            <div className="empty-brand">
              <AbyssLogo size={24} />
            </div>
            <h1 className="empty-title">What will you explore today?</h1>
            <p className="empty-sub">Ask anything — AbyssGPT researches, writes, codes, and reasons with you.</p>
            <div className="prompt-grid">
              {EXAMPLE_PROMPTS.map(({ icon: Icon, label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  className="prompt-card"
                  onClick={() => sendMessage(prompt)}
                >
                  <span className="prompt-head">
                    <Icon size={14} />
                    <span>{label}</span>
                  </span>
                  <span className="prompt-text">{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!isEmpty && (
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
                  {/* Pre-first-token progress states; once content arrives the
                      caret itself signals ongoing generation (calmer, no dupes). */}
                  <AgentActivity
                    steps={agentSteps.length ? agentSteps : [friendlyStatus(thinkingText)]}
                    active
                  />
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
        onSend={(text) => sendMessage(text)}
        onStop={stopGenerating}
        isStreaming={isStreaming}
        disabled={isLimitReached}
      />
    </>
  );
};
