import { auth } from './firebase.js';
import type { ChatMessage } from '../types.js';

const DEFAULT_API_BASE = 'https://abyssgpt-cb9k.onrender.com';
const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
const API_BASE = /^https?:\/\//i.test(configuredApiBase)
  ? configuredApiBase.replace(/\/$/, '')
  : DEFAULT_API_BASE;

function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem('abyssgpt_admin_token');
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem('abyssgpt_admin_token', token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem('abyssgpt_admin_token');
}

export function hasAdminToken(): boolean {
  return Boolean(getAdminToken());
}

async function getAuthToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  return await currentUser.getIdToken();
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers || {});

  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const adminToken = getAdminToken();
  if (adminToken && endpoint.startsWith('/api/admin/')) {
    headers.set('X-Admin-Token', adminToken);
  }

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) {
        errorMsg = errJson.error;
      }
    } catch {
      // keep fallback
    }
    const err = new Error(errorMsg);
    (err as unknown as { status: number }).status = response.status;
    throw err;
  }

  return (await response.json()) as T;
}

export interface StreamChatCallbacks {
  onMeta?: (data: { conversationId: string; userMessage?: ChatMessage; model?: string }) => void;
  onThinking?: (text: string) => void;
  onTool?: (data: { tool: string; status: 'start' | 'success' | 'error'; detail?: string; sources?: Array<{ title: string; url: string }> }) => void;
  onChunk: (chunk: string) => void;
  onDone: (data: { messageId?: string; conversationId?: string; model?: string }) => void;
  onError: (error: string) => void;
}

export async function streamChatApi(
  payload: { message: string; conversationId?: string },
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const token = await getAuthToken();
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const url = `${API_BASE}/api/chat/stream`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: unknown) {
    if (signal?.aborted) return;
    callbacks.onError('Unable to connect to AbyssGPT server. Please try again in a moment.');
    return;
  }

  if (!response.ok) {
    let errorMsg = `Stream request failed: ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // ignore
    }
    callbacks.onError(errorMsg);
    return;
  }

  if (!response.body) {
    callbacks.onError('Readable stream not supported in response.');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === 'meta') {
              callbacks.onMeta?.(data);
            } else if (data.type === 'thinking') {
              callbacks.onThinking?.(data.text);
            } else if (data.type === 'tool') {
              callbacks.onTool?.(data);
            } else if (data.type === 'chunk') {
              callbacks.onChunk(data.text);
            } else if (data.type === 'done') {
              callbacks.onDone(data);
              return;
            } else if (data.type === 'error') {
              callbacks.onError(data.error || 'Stream error');
              return;
            }
          } catch {
            // ignore non-JSON stream ping
          }
        }
      }
    }
    buffer += decoder.decode();
    const finalLine = buffer.trim();
    if (finalLine.startsWith('data: ')) {
      try {
        const data = JSON.parse(finalLine.slice(6));
        if (data.type === 'done') callbacks.onDone(data);
        else if (data.type === 'error') callbacks.onError(data.error || 'Stream error');
        else callbacks.onDone({});
      } catch { callbacks.onDone({}); }
    } else {
      callbacks.onDone({});
    }
  } catch (err: unknown) {
    if (signal?.aborted) return;
    callbacks.onError(err instanceof Error ? err.message : 'Stream processing failed');
  } finally {
    reader.releaseLock();
  }
}
