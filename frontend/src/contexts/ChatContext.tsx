import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiRequest, streamChatApi } from '../lib/api.js';
import { useAuth } from './AuthContext.js';
import type { Conversation, ChatMessage } from '../types.js';

/* ============================================================
   CONTEXT SLICING (performance)

   The chat state is split into three contexts so that the
   high-frequency streaming slice (updates every ~110ms while a
   response streams) never re-renders the sidebar, navbar, or
   conversation list. Before this split, one context object was
   recreated on every render and every stream flush re-rendered
   the entire application tree.
   ============================================================ */

/** High-frequency state: changes many times per second during streaming. */
interface ChatStreamingSlice {
  isStreaming: boolean;
  streamingContent: string;
  thinkingText: string | null;
}

/** Conversation-level state: changes only on conversation/message operations. */
interface ChatConversationSlice {
  conversations: Conversation[];
  filteredConversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  messages: ChatMessage[];
  searchQuery: string;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  error: string | null;
}

/** Stable actions: identities never change for the lifetime of the provider. */
interface ChatActionSlice {
  setSearchQuery: (q: string) => void;
  selectConversation: (id: string | null) => void;
  createNewChat: () => Promise<string>;
  sendMessage: (text: string, webSearch?: boolean) => Promise<void>;
  stopGenerating: () => void;
  regenerateMessage: () => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  deleteMessageItem: (messageId: string) => Promise<void>;
  clearError: () => void;
}

const StreamingContext = createContext<ChatStreamingSlice | undefined>(undefined);
const ConversationContext = createContext<ChatConversationSlice | undefined>(undefined);
const ActionContext = createContext<ChatActionSlice | undefined>(undefined);

/** Human-friendly wording for stream-level failures. Never leaks
 *  provider names, stack traces, or internal implementation details. */
function friendlyStreamError(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes('rate limit') || t.includes('too many')) {
    return 'You are sending messages too quickly. Please wait a moment and try again.';
  }
  if (t.includes('timeout') || t.includes('timed out')) {
    return 'The response took too long to complete. Please try again.';
  }
  if (t.includes('limit')) {
    return raw;
  }
  if (t.includes('auth') || t.includes('unauthor') || t.includes('401') || t.includes('403')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (t.includes('network') || t.includes('connect') || t.includes('fetch')) {
    return 'Connection to the server was interrupted. Please check your network and try again.';
  }
  return 'AbyssGPT could not complete this response. Please try again in a moment.';
}

/**
 * Merge server messages into local state without discarding the optimistic
 * exchange the user can currently see, and WITHOUT breaking React.memo on
 * unchanged items:
 *  - messages whose id AND content match what we already show keep the same
 *    object identity (memoized markdown is not re-parsed);
 *  - optimistic `temp-` user messages are dropped once the server has the
 *    same text persisted under its real id (the backend saves the user
 *    message before streaming, so nothing the user typed is ever lost);
 *  - local failure bubbles survive until they are explicitly removed.
 */
function mergeServerMessages(prev: ChatMessage[], server: ChatMessage[]): ChatMessage[] {
  const serverIds = new Set(server.map((m) => m.id));
  const serverUserTexts = new Set(
    server.filter((m) => m.role === 'user').map((m) => m.content)
  );

  const prevById = new Map(prev.map((m) => [m.id, m]));
  let changed = prev.length === 0;

  const merged = server.map((m) => {
    const p = prevById.get(m.id);
    if (p && p.content === m.content && p.isError === m.isError) return p;
    changed = true;
    return m;
  });

  for (const m of prev) {
    if (serverIds.has(m.id)) continue;
    if (m.id.startsWith('temp-')) {
      // The backend persisted the same text under a real id -> drop the copy.
      if (m.role === 'user' && serverUserTexts.has(m.content)) {
        changed = true;
        continue;
      }
      changed = true;
      merged.push(m);
      continue;
    }
    if (m.id.startsWith('local-error-')) {
      merged.push(m);
      changed = true;
    }
  }

  return changed ? merged : prev;
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, refreshProfile } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingText, setThinkingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  /* Refs mirror the latest values so every action below can be a stable
     useCallback([]) — stable identities keep memoized message items intact. */
  const activeConvIdRef = useRef<string | null>(activeConversationId);
  activeConvIdRef.current = activeConversationId;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamBufferRef = useRef('');
  const streamTextRef = useRef('');
  const streamFlushTimerRef = useRef<number | null>(null);

  /* ---------- Stream batching: chunk accumulation -> 110ms flushes ---------- */

  const flushStreamBuffer = useCallback(() => {
    streamFlushTimerRef.current = null;
    const next = streamBufferRef.current;
    if (!next) return;
    streamBufferRef.current = '';
    setStreamingContent((prev) => prev + next);
  }, []);

  const queueStreamChunk = useCallback(
    (chunk: string) => {
      streamTextRef.current += chunk;
      streamBufferRef.current += chunk;
      if (streamFlushTimerRef.current === null) {
        // Batch stream updates so React renders at most ~9x/second instead
        // of once per token. Markdown work happens on the flushed snapshot.
        streamFlushTimerRef.current = window.setTimeout(flushStreamBuffer, 110);
      }
    },
    [flushStreamBuffer]
  );

  const clearStreamQueue = useCallback(() => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    streamBufferRef.current = '';
    streamTextRef.current = '';
  }, []);

  /* ---------- Data loading ---------- */

  const loadConversations = useCallback(async () => {
    if (!firebaseUser) {
      setConversations([]);
      return;
    }
    setIsLoadingConversations(true);
    try {
      const data = await apiRequest<Conversation[]>('/api/conversations');
      setConversations(data);
    } catch (err: unknown) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  /** Apply a server message list for a conversation, guarding against
   *  stale responses for a conversation the user already left. */
  const applyServerMessages = useCallback((convId: string | null, server: ChatMessage[]) => {
    if ((activeConvIdRef.current ?? '') !== (convId ?? '')) return;
    setMessages((prev) => mergeServerMessages(prev, server));
  }, []);

  // Load messages when the active conversation changes. Deliberately does
  // NOT refetch when streaming finishes — the stream's onDone handler
  // refetches exactly once (previously both paths fetched, doubling reads).
  useEffect(() => {
    if (!firebaseUser || !activeConversationId) {
      setMessages([]);
      return;
    }
    if (isStreamingRef.current) return; // onDone refetch covers this case

    let isMounted = true;
    setIsLoadingMessages(true);

    apiRequest<ChatMessage[]>(`/api/conversations/${activeConversationId}/messages`)
      .then((data) => {
        if (isMounted) applyServerMessages(activeConversationId, data);
      })
      .catch((err) => {
        if (isMounted) console.error('Failed to load messages:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingMessages(false);
      });

    return () => {
      isMounted = false;
    };
  }, [firebaseUser, activeConversationId, applyServerMessages]);

  /* ---------- Stream lifecycle helpers ---------- */

  const beginStream = useCallback(() => {
    clearStreamQueue();
    setStreamingContent('');
    streamTextRef.current = '';
    setIsStreaming(true);
    setThinkingText('Thinking…');
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    return abortController;
  }, [clearStreamQueue]);

  const endStream = useCallback(() => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    streamBufferRef.current = '';
    setIsStreaming(false);
    setThinkingText(null);
    abortControllerRef.current = null;
  }, []);

  const stopGenerating = useCallback(() => {
    clearStreamQueue();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setThinkingText(null);
    setStreamingContent('');
  }, [clearStreamQueue]);

  /** Show a retryable inline error bubble in the conversation instead of
   *  leaving the user with only a transient toast. */
  const pushErrorBubble = useCallback((raw: string, partialContent: string) => {
    const text = friendlyStreamError(raw);
    setMessages((prev) => [
      ...prev,
      {
        id: 'local-error-' + Date.now(),
        role: 'assistant',
        content: partialContent,
        createdAt: new Date().toISOString(),
        isError: true,
        errorText: text,
      },
    ]);
  }, []);

  const sendMessage = useCallback(
    async (text: string, webSearch?: boolean) => {
      if (!text.trim() || isStreamingRef.current) return;
      setError(null);

      const cleanText = text.trim();
      let currentConvId = activeConvIdRef.current;

      // Optimistic user message preview (server persists it immediately,
      // so the refetch after completion will confirm it under a real id).
      const optimisticUserMsg: ChatMessage = {
        id: 'temp-' + Date.now(),
        role: 'user',
        content: cleanText,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticUserMsg]);
      const abortController = beginStream();

      try {
        await streamChatApi(
          {
            message: cleanText,
            conversationId: currentConvId || undefined,
            webSearch,
          },
          {
            onMeta: (meta) => {
              if (meta.conversationId && meta.conversationId !== currentConvId) {
                currentConvId = meta.conversationId;
                activeConvIdRef.current = meta.conversationId;
                setActiveConversationId(meta.conversationId);
              }
            },
            onThinking: (th) => setThinkingText(th),
            onChunk: (chunk) => {
              setThinkingText(null);
              queueStreamChunk(chunk);
            },
            onDone: (data) => {
              // Flush any final buffered characters before leaving streaming mode.
              if (streamFlushTimerRef.current !== null) {
                window.clearTimeout(streamFlushTimerRef.current);
                streamFlushTimerRef.current = null;
              }
              streamBufferRef.current = '';
              const finalText = streamTextRef.current;

              endStream();

              // Show the completed answer immediately; do not wait for Firestore.
              if (currentConvId && data?.messageId) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: data.messageId as string,
                    role: 'assistant',
                    content: finalText,
                    createdAt: new Date().toISOString(),
                    model: data.model,
                  } as ChatMessage,
                ]);
              }
              setStreamingContent('');

              // Refresh metadata in the background; never block the visible answer.
              void loadConversations();
              void refreshProfile();
              if (currentConvId) {
                const convId = currentConvId;
                void apiRequest<ChatMessage[]>(`/api/conversations/${convId}/messages`)
                  .then((updated) => applyServerMessages(convId, updated))
                  .catch(() => {});
              }
            },
            onError: (errMsg) => {
              endStream();
              pushErrorBubble(errMsg, streamTextRef.current);
            },
          },
          abortController.signal
        );
      } catch (err: unknown) {
        endStream();
        pushErrorBubble(
          err instanceof Error ? err.message : 'Message failed to send.',
          streamTextRef.current
        );
      }
    },
    [applyServerMessages, beginStream, endStream, loadConversations, pushErrorBubble, queueStreamChunk, refreshProfile]
  );

  const regenerateMessage = useCallback(async () => {
    const convId = activeConvIdRef.current;
    if (!convId || isStreamingRef.current) return;
    setError(null);

    const lastUserMsg = [...messagesRef.current].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    // Drop any trailing assistant message visually before regenerating.
    setMessages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
        return prev.slice(0, -1);
      }
      return prev;
    });

    const abortController = beginStream();
    setThinkingText('Thinking…');

    try {
      await streamChatApi(
        {
          message: lastUserMsg.content,
          conversationId: convId,
        },
        {
          onThinking: (th) => setThinkingText(th),
          onChunk: (chunk) => {
            setThinkingText(null);
            queueStreamChunk(chunk);
          },
          onDone: () => {
            endStream();
            void refreshProfile();
            void apiRequest<ChatMessage[]>(`/api/conversations/${convId}/messages`)
              .then((updated) => applyServerMessages(convId, updated))
              .catch(() => {});
          },
          onError: (errMsg) => {
            endStream();
            pushErrorBubble(errMsg, streamTextRef.current);
          },
        },
        abortController.signal
      );
    } catch (err: unknown) {
      endStream();
      pushErrorBubble(err instanceof Error ? err.message : 'Regeneration failed.', streamTextRef.current);
    }
  }, [applyServerMessages, beginStream, endStream, pushErrorBubble, queueStreamChunk, refreshProfile]);

  const selectConversation = useCallback(
    (id: string | null) => {
      if (isStreamingRef.current) {
        stopGenerating();
      }
      if (id !== activeConvIdRef.current) {
        setMessages([]); // no stale content while the new list loads
        activeConvIdRef.current = id;
        setActiveConversationId(id);
      }
      setError(null);
    },
    [stopGenerating]
  );

  const createNewChat = useCallback(async (): Promise<string> => {
    if (isStreamingRef.current) {
      stopGenerating();
    }
    setError(null);
    try {
      const newConv = await apiRequest<Conversation>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Chat' }),
      });
      // Dedupe defensively: never render the same conversation twice even if
      // a cached/aliased response already contained it.
      setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);
      activeConvIdRef.current = newConv.id;
      setActiveConversationId(newConv.id);
      setMessages([]);
      return newConv.id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create new chat';
      setError(msg);
      throw err;
    }
  }, [stopGenerating]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      const updated = await apiRequest<Conversation>(`/api/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to rename conversation');
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await apiRequest(`/api/conversations/${id}`, { method: 'DELETE' });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConvIdRef.current === id) {
          activeConvIdRef.current = null;
          setActiveConversationId(null);
          setMessages([]);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete conversation');
      }
    },
    []
  );

  const deleteMessageItem = useCallback(async (messageId: string) => {
    const convId = activeConvIdRef.current;
    if (!convId) return;
    try {
      await apiRequest(`/api/conversations/${convId}/messages/${messageId}`, {
        method: 'DELETE',
      });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /* ---------- Derived, memoized conversation data ---------- */

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.lastMessagePreview && c.lastMessagePreview.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  /* ---------- Memoized slices ---------- */

  const streamingValue = useMemo(
    () => ({ isStreaming, streamingContent, thinkingText }),
    [isStreaming, streamingContent, thinkingText]
  );

  const conversationValue = useMemo(
    () => ({
      conversations,
      filteredConversations,
      activeConversationId,
      activeConversation,
      messages,
      searchQuery,
      isLoadingConversations,
      isLoadingMessages,
      error,
    }),
    [
      conversations,
      filteredConversations,
      activeConversationId,
      activeConversation,
      messages,
      searchQuery,
      isLoadingConversations,
      isLoadingMessages,
      error,
    ]
  );

  const actionValue = useMemo(
    () => ({
      setSearchQuery,
      selectConversation,
      createNewChat,
      sendMessage,
      stopGenerating,
      regenerateMessage,
      renameConversation,
      deleteConversation,
      deleteMessageItem,
      clearError,
    }),
    [
      setSearchQuery,
      selectConversation,
      createNewChat,
      sendMessage,
      stopGenerating,
      regenerateMessage,
      renameConversation,
      deleteConversation,
      deleteMessageItem,
      clearError,
    ]
  );

  return (
    <StreamingContext.Provider value={streamingValue}>
      <ConversationContext.Provider value={conversationValue}>
        <ActionContext.Provider value={actionValue}>{children}</ActionContext.Provider>
      </ConversationContext.Provider>
    </StreamingContext.Provider>
  );
};

export function useChatStreaming(): ChatStreamingSlice {
  const ctx = useContext(StreamingContext);
  if (!ctx) throw new Error('useChatStreaming must be used within a ChatProvider');
  return ctx;
}

export function useChatConversations(): ChatConversationSlice {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useChatConversations must be used within a ChatProvider');
  return ctx;
}

export function useChatActions(): ChatActionSlice {
  const ctx = useContext(ActionContext);
  if (!ctx) throw new Error('useChatActions must be used within a ChatProvider');
  return ctx;
}
