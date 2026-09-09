import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { apiRequest, streamChatApi, type StreamTodo, type StreamAttachmentMeta } from '../lib/api.js';
import { useAuth } from './AuthContext.js';
import type { Conversation, ChatMessage } from '../types.js';

export interface AgentActivityEvent {
  id: string;
  tool: 'search' | 'read' | 'code' | 'think' | 'verify' | 'tool';
  title: string;
  detail?: string;
  status: 'running' | 'done' | 'error';
  sources?: Array<{ title: string; url: string }>;
  startedAt: number;
  completedAt?: number;
}

export interface PendingAttachment {
  id: string;
  filename: string;
  mimeType: string;
  /** Base64-encoded text content for text files; null for binary files. */
  content: string | null;
  size: number;
}

export interface ActiveAttachmentMeta extends StreamAttachmentMeta {}

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
  agentActivity: AgentActivityEvent[];
  agentStartedAt: number | null;
  agentFinishedAt: number | null;
  activeTodos: StreamTodo[];
  pendingAttachments: PendingAttachment[];
  activeAttachments: ActiveAttachmentMeta[];
  error: string | null;
  searchQuery: string;
  filteredConversations: Conversation[];
  setSearchQuery: (q: string) => void;
  selectConversation: (id: string | null) => void;
  createNewChat: () => Promise<string>;
  sendMessage: (text: string, attachments?: PendingAttachment[]) => Promise<void>;
  stopGenerating: () => void;
  regenerateMessage: () => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  deleteMessageItem: (messageId: string) => Promise<void>;
  clearError: () => void;
  addAttachment: (att: PendingAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
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
  const [agentActivity, setAgentActivity] = useState<AgentActivityEvent[]>([]);
  const [agentStartedAt, setAgentStartedAt] = useState<number | null>(null);
  const [agentFinishedAt, setAgentFinishedAt] = useState<number | null>(null);
  const [activeTodos, setActiveTodos] = useState<StreamTodo[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [activeAttachments, setActiveAttachments] = useState<ActiveAttachmentMeta[]>([]);
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
      setConversations(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.warn('Could not load conversations from server:', err);
      setConversations((prev) => prev || []);
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

  const startActivity = useCallback((text: string) => {
    const lower = text.toLowerCase();
    let tool: AgentActivityEvent['tool'] = 'think';
    let title = 'Working';
    if (lower.includes('search')) { tool = 'search'; title = 'Searching the web'; }
    else if (lower.includes('read')) { tool = 'read'; title = 'Reading sources'; }
    else if (lower.includes('run') || lower.includes('execut') || lower.includes('code')) { tool = 'code'; title = 'Running code'; }
    else if (lower.includes('verif')) { tool = 'verify'; title = 'Verifying results'; }
    else if (lower.includes('finish') || lower.includes('answer') || lower.includes('write')) { title = 'Writing response'; }
    else if (lower.includes('plan') || lower.includes('reason')) { title = 'Planning the task'; }
    setAgentActivity((prev) => {
      const current = prev.find((x) => x.status === 'running');
      if (current && current.title === title) return prev;
      const closed = prev.map((x) => x.status === 'running' ? { ...x, status: 'done' as const, completedAt: Date.now() } : x);
      return [...closed, { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, tool, title, status: 'running', startedAt: Date.now() }];
    });
  }, []);

  const finishActivity = useCallback((text?: string, error = false) => {
    const lower = String(text || '').toLowerCase();
    const title = lower.includes('search') ? 'Searching the web' : lower.includes('read') ? 'Reading sources' : lower.includes('code') || lower.includes('execut') || lower.includes('run') ? 'Running code' : undefined;
    setAgentActivity((prev) => {
      const idx = title ? prev.findIndex((x) => x.status === 'running' && x.title === title) : prev.findIndex((x) => x.status === 'running');
      if (idx < 0) return prev;
      return prev.map((x, i) => i === idx ? { ...x, status: error ? 'error' as const : 'done' as const, completedAt: Date.now() } : x);
    });
  }, []);

  const stopGenerating = () => {
    clearStreamQueue();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setThinkingText(null);
    setAgentActivity((prev) => prev.map((x) => x.status === 'running' ? { ...x, status: 'done' as const, completedAt: Date.now(), title: 'Stopped' } : x));
    setAgentFinishedAt(Date.now());
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

  const sendMessage = async (text: string, attachments?: PendingAttachment[]) => {
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
    setThinkingText('Planning the task…');
    setAgentActivity([]);
    setAgentStartedAt(Date.now());
    setAgentFinishedAt(null);
    setActiveTodos([]);
    setActiveAttachments([]);
    if (attachments && attachments.length > 0) {
      setActiveAttachments(
        attachments.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          hasTextContent: a.content !== null,
        })),
      );
    }
    // Clear pending attachments from the composer now that they've been sent.
    setPendingAttachments([]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Build the request payload — include attachments only when at least one
    // was provided with non-null content.
    const payload: { message: string; conversationId?: string; attachments?: Array<{ filename: string; mimeType: string; content: string }> } = {
      message: cleanText,
      conversationId: currentConvId || undefined,
    };
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments
        .filter((a) => a.content !== null)
        .map((a) => ({ filename: a.filename, mimeType: a.mimeType, content: a.content as string }));
    }

    try {
      await streamChatApi(
        payload,
        {
          onMeta: (meta) => {
            if (meta.conversationId && meta.conversationId !== currentConvId) {
              currentConvId = meta.conversationId;
              setActiveConversationId(meta.conversationId);
            }
          },
          onThinking: (th) => {
            setThinkingText(th);
            startActivity(th);
          },
          onTool: (toolEvent) => {
            const map = { web_search: ['search', 'Searching the web'], read_url: ['read', 'Reading sources'], run_code: ['code', 'Running code'] } as const;
            const resolved = map[toolEvent.tool as keyof typeof map] || ['tool', 'Running the tool'];
            setAgentActivity((prev) => {
              const running = prev.find((x) => x.status === 'running' && (x.tool === resolved[0] || x.tool === 'tool'));
              if (toolEvent.status === 'start') {
                if (running) return prev;
                return [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, tool: resolved[0], title: resolved[1], detail: toolEvent.detail, status: 'running', startedAt: Date.now() }];
              }
              if (!running) return prev;
              return prev.map((x) => x.id === running.id ? { ...x, status: toolEvent.status === 'error' ? 'error' as const : 'done' as const, completedAt: Date.now(), detail: toolEvent.detail || x.detail, sources: toolEvent.sources || x.sources } : x);
            });
          },
          onTodo: (todos) => {
            setActiveTodos(todos);
          },
          onAttachments: (atts) => {
            setActiveAttachments(atts);
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
            setAgentActivity((prev) => prev.map((x) => x.status === 'running' ? { ...x, status: 'done' as const, completedAt: Date.now() } : x));
            setAgentFinishedAt(Date.now());
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
            setAgentActivity((prev) => prev.map((x) => x.status === 'running' ? { ...x, status: 'error' as const, completedAt: Date.now() } : x));
            setAgentFinishedAt(Date.now());
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
      setAgentFinishedAt(Date.now());
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
    setThinkingText('Planning the task…');
    setAgentActivity([]);
    setAgentStartedAt(Date.now());
    setAgentFinishedAt(null);
    setActiveTodos([]);
    setActiveAttachments([]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await streamChatApi(
        {
          message: lastUserMsg.content,
          conversationId: activeConversationId,
        },
        {
          onThinking: (th) => { setThinkingText(th); startActivity(th); },
          onTool: (toolEvent) => {
            const resolved = toolEvent.tool === 'web_search' ? ['search', 'Searching the web'] : toolEvent.tool === 'read_url' ? ['read', 'Reading sources'] : toolEvent.tool === 'run_code' ? ['code', 'Running code'] : ['tool', 'Running the tool'];
            setAgentActivity((prev) => {
              const running = prev.find((x) => x.status === 'running' && (x.tool === resolved[0] || x.tool === 'tool'));
              if (toolEvent.status === 'start' && !running) return [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, tool: resolved[0] as AgentActivityEvent['tool'], title: resolved[1], detail: toolEvent.detail, status: 'running', startedAt: Date.now() }];
              if (!running) return prev;
              return prev.map((x) => x.id === running.id ? { ...x, status: toolEvent.status === 'error' ? 'error' as const : 'done' as const, completedAt: Date.now(), detail: toolEvent.detail || x.detail, sources: toolEvent.sources || x.sources } : x);
            });
          },
          onTodo: (todos) => {
            setActiveTodos(todos);
          },
          onChunk: (chunk) => {
            setThinkingText(null);
            queueStreamChunk(chunk);
          },
          onDone: async () => {
            flushStreamBuffer();
            setIsStreaming(false);
            setThinkingText(null);
            setAgentActivity((prev) => prev.map((x) => x.status === 'running' ? { ...x, status: 'done' as const, completedAt: Date.now() } : x));
            setAgentFinishedAt(Date.now());
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
            setAgentFinishedAt(Date.now());
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
      setAgentFinishedAt(Date.now());
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

  const addAttachment = useCallback((att: PendingAttachment) => {
    setPendingAttachments((prev) => [...prev, att]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setPendingAttachments([]);
  }, []);

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
        agentActivity,
        agentStartedAt,
        agentFinishedAt,
        activeTodos,
        pendingAttachments,
        activeAttachments,
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
        addAttachment,
        removeAttachment,
        clearAttachments,
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
