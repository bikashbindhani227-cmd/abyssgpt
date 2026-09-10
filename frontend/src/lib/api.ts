import { auth } from './firebase.js';
import type { ChatMessage } from '../types.js';

const FALLBACK_PRODUCTION_API_BASE = 'https://abyssgpt-cb9k.onrender.com';

function resolveApiBase(): string {
  const rawApiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  const isPlaceholder =
    !rawApiBase ||
    /YOUR-RENDER-BACKEND|your-backend|placeholder|example\.com/i.test(rawApiBase);
  if (!isPlaceholder && /^https?:\/\//i.test(rawApiBase)) {
    return rawApiBase.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return FALLBACK_PRODUCTION_API_BASE;
  }
  return '';
}

const API_BASE = resolveApiBase();

function getAdminToken(): string | null {
  try { return sessionStorage.getItem('abyssgpt_admin_token'); } catch { return null; }
}
export function setAdminToken(token: string): void { sessionStorage.setItem('abyssgpt_admin_token', token); }
export function clearAdminToken(): void { sessionStorage.removeItem('abyssgpt_admin_token'); }
export function hasAdminToken(): boolean { return Boolean(getAdminToken()); }
async function getAuthToken(): Promise<string | null> { const currentUser = auth.currentUser; if (!currentUser) return null; return await currentUser.getIdToken(); }

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retries = 2
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      const token = await getAuthToken();
      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'application/json');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const adminToken = getAdminToken();
      if (adminToken && endpoint.startsWith('/api/admin/')) headers.set('X-Admin-Token', adminToken);
      const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers, cache: 'no-store' });
      if (!response.ok) {
        let errorMsg = `Request failed with status ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.error) errorMsg = errJson.error;
        } catch {}
        const err = new Error(errorMsg);
        (err as unknown as { status: number }).status = response.status;
        throw err;
      }
      return (await response.json()) as T;
    } catch (err: unknown) {
      const method = (options.method || 'GET').toUpperCase();
      const isRetryable = method === 'GET' || method === 'HEAD';
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message));
      if (isRetryable && attempt < retries && isNetworkError) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }
      throw err;
    }
  }
}

export interface StreamAttachmentMeta { filename: string; mimeType: string; size: number; rejected?: boolean; rejectionReason?: string; hasTextContent: boolean; }
export interface StreamTodo { id: string; content: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled'; }
export interface StreamChatCallbacks { onMeta?: (data: { conversationId: string; userMessage?: ChatMessage; model?: string }) => void; onThinking?: (text: string) => void; onTool?: (data: { tool: string; status: 'start' | 'success' | 'error'; detail?: string; sources?: Array<{ title: string; url: string }> }) => void; onTodo?: (todos: StreamTodo[]) => void; onAttachments?: (attachments: StreamAttachmentMeta[]) => void; onChunk: (chunk: string) => void; onDone: (data: { messageId?: string; conversationId?: string; model?: string }) => void; onError: (error: string) => void; }
export interface StreamChatPayload { message: string; conversationId?: string; attachments?: Array<{ filename: string; mimeType: string; content: string }>; }

export async function streamChatApi(payload: StreamChatPayload, callbacks: StreamChatCallbacks, signal?: AbortSignal): Promise<void> {
  const token = await getAuthToken(); const headers = new Headers(); headers.set('Content-Type', 'application/json'); if (token) headers.set('Authorization', `Bearer ${token}`);
  const url = `${API_BASE}/api/chat/stream`; let response: Response;
  try { response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal }); } catch { if (signal?.aborted) return; callbacks.onError('Unable to connect to AbyssGPT server. Please try again in a moment.'); return; }
  if (!response.ok) { let errorMsg = `Stream request failed: ${response.status}`; try { const errJson = await response.json(); if (errJson.error) errorMsg = errJson.error; } catch {} callbacks.onError(errorMsg); return; }
  if (!response.body) { callbacks.onError('Readable stream not supported in response.'); return; }
  const reader = response.body.getReader(); const decoder = new TextDecoder('utf-8'); let buffer = ''; let sawDone = false; let sawError = false;
  try {
    while (true) {
      if (signal?.aborted) { await reader.cancel().catch(() => {}); return; }
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }); const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim(); if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data: ')) continue;
        const data = JSON.parse(trimmed.slice(6));
        if (data.type === 'meta') callbacks.onMeta?.(data);
        else if (data.type === 'thinking') callbacks.onThinking?.(data.text);
        else if (data.type === 'tool') callbacks.onTool?.(data);
        else if (data.type === 'todo') callbacks.onTodo?.(Array.isArray(data.todos) ? data.todos : []);
        else if (data.type === 'attachments') callbacks.onAttachments?.(Array.isArray(data.attachments) ? data.attachments : []);
        else if (data.type === 'chunk' && typeof data.text === 'string') callbacks.onChunk(data.text);
        else if (data.type === 'done') { sawDone = true; callbacks.onDone(data); return; }
        else if (data.type === 'error') { sawError = true; callbacks.onError(data.error || 'Stream error'); return; }
      }
    }
    buffer += decoder.decode();
    const finalLine = buffer.trim();
    if (finalLine.startsWith('data: ')) {
      const data = JSON.parse(finalLine.slice(6));
      if (data.type === 'done') { sawDone = true; callbacks.onDone(data); return; }
      if (data.type === 'error') { sawError = true; callbacks.onError(data.error || 'Stream error'); return; }
      if (data.type === 'chunk' && typeof data.text === 'string') callbacks.onChunk(data.text);
    }
    if (!sawDone && !sawError && !signal?.aborted) callbacks.onError('The stream ended before completion. Please try again.');
  } catch (err: unknown) { if (!signal?.aborted) callbacks.onError(err instanceof Error ? err.message : 'Stream processing failed'); }
  finally { reader.releaseLock(); }
}
