import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { apiRequest, streamChatApi } from '../lib/api.js';
import { useAuth } from './AuthContext.js';
import type { Conversation, ChatMessage } from '../types.js';

interface ChatContextType {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  messages: ChatMessage[];
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  streamingContent: string;
  thinkingText: string | null;
  agentSteps: string[];
  error: string | null;
  searchQuery: string;
  filteredConversations: Conversation[];
  setSearchQuery: (q: string) => void;
  selectConversation: (id: string | null) => void;
  createNewChat: () => Promise<string>;
  sendMessage: (text: string) => Promise<void>;
  stopGenerating: () => void;
  regenerateMessage: () => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  deleteMessageItem: (messageId: string) => Promise<void>;
  clearError: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

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
  const [agentSteps, setAgentSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamBufferRef = useRef('');
  const streamTextRef = useRef('');
  const streamFlushTimerRef = useRef<number | null>(null);

  const flushStreamBuffer = useCallback(() => {
    streamFlushTimerRef.current = null;
    const next = streamBufferRef.current;
    if (!next) return;
    streamBufferRef.current = '';
    setStreamingContent((prev) => prev + next);
  }, []);

  const queueStreamChunk = useCallback((chunk: string) => {
    streamTextRef.current += chunk;
    streamBufferRef.current += chunk;
    if (streamFlushTimerRef.current === null) {
      // Batch stream updates to keep React rendering smooth on mobile.
      streamFlushTimerRef.current = window.setTimeout(flushStreamBuffer, 110);
    }
  }, [flushStreamBuffer]);

  const clearStreamQueue = useCallback(() => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    streamBufferRef.current = '';
    streamTextRef.current = '';
  }, []);

  const pushAgentStep = useCallback((raw: string | null | undefined) => {
    if (!raw) return;
    const normalized = raw.trim();
    if (!normalized) return;
    setAgentSteps((prev) => {
      const key = normalized.toLowerCase();
      if (prev[prev.length - 1]?.toLowerCase() === key) return prev;
      const next = [...prev, normalized];
      return next.length > 8 ? next.slice(-8) : next;
    });
  }, []);

  // Load conversations when user logs in
  const loadConversations = useCallback(async () => {
    if (!firebaseUser) {
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      return;
    }

    setIsLoadingConversations(true);
    try {
      const data = await apiRequest<Conversation[]>('/api/conversations');
      setConversations(data);
      if (data.length > 0 && !activeConversationId) {
        // Optionally select first conversation if none selected
      }
    } catch (err: unknown) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [firebaseUser, activeConversationId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages when activeConversationId changes
  useEffect(() => {
    if (!firebaseUser || !activeConversationId) {
      setMessages([]);
      return;
    }

    if (isStreaming) {
      return;
    }

    let isMounted = true;
    setIsLoadingMessages(true);

    apiRequest<ChatMessage[]>(`/api/conversations/${activeConversationId}/messages`)
      .then((data) => {
        if (isMounted) {
          // Merge server truth with unsaved local messages (optimistic user
          // message, error bubble) so a failed or stopped exchange doesn't
          // silently vanish from the conversation.
          setMessages((prev) => {
            const serverIds = new Set(data.map((m) => m.id));
            const locals = prev.filter(
              (m) =>
                !serverIds.has(m.id) &&
                (m.id.startsWith('temp-') || m.id.startsWith('local-error-'))
            );
            return locals.length > 0 ? [...data, ...locals] : data;
          });
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load messages:', err);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingMessages(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [firebaseUser, activeConversationId, isStreaming]);

  const selectConversation = (id: string | null) => {
    if (isStreaming) {
      stopGenerating();
    }
    setActiveConversationId(id);
    setError(null);
  };

  const createNewChat = async (): Promise<string> => {
    if (isStreaming) {
      stopGenerating();
    }
    setError(null);
    try {
      const newConv = await apiRequest<Conversation>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Chat' }),
      });
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages([]);
      return newConv.id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create new chat';
      setError(msg);
      throw err;
    }
  };

  const stopGenerating = () => {
    clearStreamQueue();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setThinkingText(null);
    setAgentSteps([]);
  };

  // Human-friendly wording for stream-level failures. Never leaks
  // provider names, stack traces, or internal implementation details.
  const friendlyStreamError = (raw: string): string => {
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
  };

  // Show a retryable inline error bubble in the conversation instead of
  // leaving the user with only a transient toast.
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

  const friendlyAgentStatus = (raw: string | null): string => {
    if (!raw) return 'Thinking';
    const t = raw.toLowerCase();
    if (t.includes('search')) return 'Searching the web';
    if (t.includes('read')) return 'Reading sources';
    if (t.includes('run') || t.includes('execut') || t.includes('code')) return 'Executing code';
    if (t.includes('plan')) return 'Planning';
    if (t.includes('finish') || t.includes('wrap') || t.includes('review') || t.includes('answer') || t.includes('writ')) return 'Writing response';
    return 'Thinking';
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setError(null);

    const cleanText = text.trim();
    let currentConvId = activeConversationId;

    // Optimistic user message preview
    const tempUserMsgId = 'temp-' + Date.now();
    const optimisticUserMsg: ChatMessage = {
      id: tempUserMsgId,
      role: 'user',
      content: cleanText,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setIsStreaming(true);
    clearStreamQueue();
    setStreamingContent('');
    streamTextRef.current = '';
    setThinkingText('Reasoning...');
    setAgentSteps(['Planning']);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await streamChatApi(
        {
          message: cleanText,
          conversationId: currentConvId || undefined,
        },
        {
          onMeta: (meta) => {
            if (meta.conversationId && meta.conversationId !== currentConvId) {
              currentConvId = meta.conversationId;
              setActiveConversationId(meta.conversationId);
            }
          },
          onThinking: (th) => {
            setThinkingText(th);
            pushAgentStep(friendlyAgentStatus(th));
          },
          onChunk: (chunk) => {
            setThinkingText(null);
            queueStreamChunk(chunk);
          },
          onDone: async (data) => {
            // Flush any final buffered characters synchronously before leaving streaming mode.
            if (streamFlushTimerRef.current !== null) {
              window.clearTimeout(streamFlushTimerRef.current);
              streamFlushTimerRef.current = null;
            }
            streamBufferRef.current = '';
            const finalText = streamTextRef.current;

            setIsStreaming(false);
            setThinkingText(null);
            abortControllerRef.current = null;

            // Put the completed assistant message into the UI immediately; do not wait for Firestore.
            if (currentConvId && data?.messageId) {
              setMessages((prev) => [
                ...prev,
                {
                  id: data.messageId,
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
              void apiRequest<ChatMessage[]>(`/api/conversations/${currentConvId}/messages`)
                .then((updated) => setMessages(updated))
                .catch(() => {});
            }
          },
          onError: (errMsg) => {
            setIsStreaming(false);
            setThinkingText(null);
            abortControllerRef.current = null;
            pushErrorBubble(errMsg, streamTextRef.current);
          },
        },
        abortController.signal
      );
    } catch (err: unknown) {
      clearStreamQueue();
      setIsStreaming(false);
      setThinkingText(null);
      abortControllerRef.current = null;
      pushErrorBubble(
        err instanceof Error ? err.message : 'Message failed to send.',
        streamTextRef.current
      );
    }
  };

  const regenerateMessage = async () => {
    if (!activeConversationId || isStreaming) return;
    setError(null);

    // Find last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    // Remove any trailing assistant message visually
    setMessages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
        return prev.slice(0, -1);
      }
      return prev;
    });

    setIsStreaming(true);
    clearStreamQueue();
    setStreamingContent('');
    setThinkingText('Regenerating with deep reasoning...');
    setAgentSteps(['Planning']);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await streamChatApi(
        {
          message: lastUserMsg.content,
          conversationId: activeConversationId,
        },
        {
          onThinking: (th) => { setThinkingText(th); pushAgentStep(friendlyAgentStatus(th)); },
          onChunk: (chunk) => {
            setThinkingText(null);
            queueStreamChunk(chunk);
          },
          onDone: async () => {
            flushStreamBuffer();
            setIsStreaming(false);
            setThinkingText(null);
            abortControllerRef.current = null;
            refreshProfile();
            const updated = await apiRequest<ChatMessage[]>(
              `/api/conversations/${activeConversationId}/messages`
            );
            setMessages(updated);
            setStreamingContent('');
          },
          onError: (errMsg) => {
            setIsStreaming(false);
            setThinkingText(null);
            abortControllerRef.current = null;
            pushErrorBubble(errMsg, streamTextRef.current);
          },
        },
        abortController.signal
      );
    } catch (err: unknown) {
      clearStreamQueue();
      setIsStreaming(false);
      setThinkingText(null);
      abortControllerRef.current = null;
      pushErrorBubble(err instanceof Error ? err.message : 'Regeneration failed.', streamTextRef.current);
    }
  };

  const renameConversation = async (id: string, title: string) => {
    try {
      const updated = await apiRequest<Conversation>(`/api/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to rename conversation');
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await apiRequest(`/api/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  };

  const deleteMessageItem = async (messageId: string) => {
    if (!activeConversationId) return;
    try {
      await apiRequest(`/api/conversations/${activeConversationId}/messages/${messageId}`, {
        method: 'DELETE',
      });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    }
  };

  const clearError = () => setError(null);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || null;

  const filteredConversations = conversations.filter((c) =>
    searchQuery
      ? c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.lastMessagePreview && c.lastMessagePreview.toLowerCase().includes(searchQuery.toLowerCase()))
      : true
  );

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        activeConversation,
        messages,
        isLoadingConversations,
        isLoadingMessages,
        isStreaming,
        streamingContent,
        thinkingText,
        agentSteps,
        error,
        searchQuery,
        filteredConversations,
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
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
