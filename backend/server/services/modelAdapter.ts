import { createHash } from 'crypto';

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}
export interface StreamEvent { type: 'chunk' | 'thinking' | 'done' | 'error'; text?: string; error?: string; tokens?: number; }
export interface AgentToolDefinition { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export type NormalizedFinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'unknown';
export interface NormalizedToolCall { id: string; name: string; args: Record<string, unknown>; repaired: boolean; invalid: boolean; invalidReason?: string; }
export interface NormalizedModelResponse { text: string; toolCalls: NormalizedToolCall[]; finishReason: NormalizedFinishReason; hadMalformedToolCall: boolean; }
export type ModelFailureCode = 'not_configured' | 'network' | 'rate_limited' | 'provider_error' | 'invalid_response' | 'timeout' | 'aborted';
export class ModelError extends Error {
  readonly code: ModelFailureCode; readonly userMessage: string; readonly detail: string; readonly recoverable: boolean;
  constructor(code: ModelFailureCode, userMessage: string, detail: string, recoverable = false) { super(userMessage); this.name = 'ModelError'; this.code = code; this.userMessage = userMessage; this.detail = detail; this.recoverable = recoverable; }
}
export const SAFE_MODEL_ERRORS: Record<ModelFailureCode, string> = {
  not_configured: 'The AI service is not configured. Please contact the administrator.',
  network: 'The AI service could not be reached. Please try again shortly.',
  rate_limited: 'The AI service is busy right now. Please retry in a moment.',
  provider_error: 'The AI service returned an error. Please try again shortly.',
  invalid_response: 'The AI response could not be processed. Please retry.',
  timeout: 'The request took too long to complete. Please try again.',
  aborted: 'The request was cancelled.',
};
const safeMessage = (code: ModelFailureCode) => SAFE_MODEL_ERRORS[code];

export function normalizeFinishReason(raw: unknown): NormalizedFinishReason {
  const value = String(raw || '').toLowerCase().trim();
  if (!value) return 'unknown';
  if (['stop', 'end_turn', 'eos', 'natural', 'complete'].includes(value)) return 'stop';
  if (['tool_calls', 'tool_use', 'function_call', 'tool', 'tools'].includes(value)) return 'tool_calls';
  if (['length', 'max_tokens', 'token_limit', 'context_length'].includes(value)) return 'length';
  if (['content_filter', 'safety', 'blocked'].includes(value)) return 'content_filter';
  return 'unknown';
}
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === 'string' ? part : part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string' ? (part as { text: string }).text : '').join('');
  return '';
}
export function parseToolCallArguments(rawArgs: unknown): { args: Record<string, unknown>; repaired: boolean } {
  if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) return { args: rawArgs as Record<string, unknown>, repaired: false };
  if (rawArgs === null || rawArgs === undefined) return { args: {}, repaired: false };
  if (typeof rawArgs !== 'string') return { args: {}, repaired: true };
  let text = rawArgs.trim(); if (!text) return { args: {}, repaired: false };
  const fenced = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fenced) { text = fenced[1].trim(); try { const parsed = JSON.parse(text); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { args: parsed, repaired: true }; } catch {} }
  try { const parsed = JSON.parse(text); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { args: parsed, repaired: false }; } catch {}
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) { try { const parsed = JSON.parse(braceMatch[0]); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { args: parsed, repaired: true }; } catch {} }
  const asciiQuotes = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  if (asciiQuotes !== text) { try { const parsed = JSON.parse(asciiQuotes); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { args: parsed, repaired: true }; } catch {} }
  return { args: {}, repaired: true };
}
export function extractContentEmbeddedToolCall(text: string): { name: string; args: Record<string, unknown> } | null {
  const trimmed = text.trim(); if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  let parsed: unknown; try { parsed = JSON.parse(trimmed); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const candidate = (obj.function && typeof obj.function === 'object' ? obj.function : obj) as Record<string, unknown>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (!name) return null;
  const rawArgs = candidate.arguments ?? candidate.parameters ?? candidate.args ?? {};
  if (rawArgs && typeof rawArgs !== 'object') return null;
  return { name, args: (rawArgs || {}) as Record<string, unknown> };
}
function normalizeToolName(rawName: unknown): string { let name = String(rawName ?? '').trim(); if (name.startsWith('functions.')) name = name.slice(10); if (name.startsWith('tools.')) name = name.slice(6); return name; }
let syntheticCallCounter = 0;
function syntheticToolCallId(seed: string): string { syntheticCallCounter = (syntheticCallCounter + 1) % 1000000; return `call_synth_${syntheticCallCounter}_${(seed || 'x').slice(0, 8)}`; }
interface RawToolCallShape { id?: unknown; type?: unknown; function?: { name?: unknown; arguments?: unknown }; name?: unknown; arguments?: unknown; }
function normalizeToolCallName(raw: RawToolCallShape): string { return raw.function && typeof raw.function === 'object' ? normalizeToolName(raw.function.name) : normalizeToolName(raw.name); }
export function normalizeOneToolCall(raw: RawToolCallShape, index: number): NormalizedToolCall {
  const name = normalizeToolCallName(raw); const { args, repaired } = parseToolCallArguments(raw.function ? raw.function.arguments : raw.arguments); let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : ''; let wasRepaired = repaired;
  if (!id) { id = syntheticToolCallId(`${name}:${index}`); wasRepaired = true; }
  if (!name) return { id, name: '', args: {}, repaired: wasRepaired, invalid: true, invalidReason: 'missing tool name' };
  return { id, name, args, repaired: wasRepaired, invalid: false };
}
export function normalizeAssistantMessage(rawMessage: unknown, rawFinishReason: unknown): NormalizedModelResponse {
  const msg = (rawMessage && typeof rawMessage === 'object' ? rawMessage : {}) as Record<string, unknown>;
  let text = extractText(msg.content); const finishReason = normalizeFinishReason(rawFinishReason); let hadMalformed = false; const rawCalls: RawToolCallShape[] = [];
  if (Array.isArray(msg.tool_calls)) for (const rc of msg.tool_calls) if (rc && typeof rc === 'object') rawCalls.push(rc as RawToolCallShape);
  if (!rawCalls.length && msg.function_call && typeof msg.function_call === 'object') rawCalls.push(msg.function_call as RawToolCallShape);
  let toolCalls = rawCalls.map((rc, i) => normalizeOneToolCall(rc, i));
  if (!toolCalls.length && text) { const embedded = extractContentEmbeddedToolCall(text); if (embedded) { toolCalls = [{ id: syntheticToolCallId(embedded.name), name: embedded.name, args: embedded.args, repaired: true, invalid: false }]; text = ''; hadMalformed = true; } }
  for (const call of toolCalls) if (call.repaired) hadMalformed = true;
  return { text, toolCalls, finishReason, hadMalformedToolCall: hadMalformed };
}

export interface ModelAdapterConfig { modelId: string; baseUrl: string; apiKey: string; }
export function resolveAdapterConfigFromEnv(): ModelAdapterConfig { return { modelId: process.env.MODEL_ID?.trim() || '', apiKey: process.env.AICREDITS_API_KEY?.trim() || '', baseUrl: (process.env.AICREDITS_BASE_URL || 'https://api.aicredits.in/v1').replace(/\/$/, '') }; }
export interface GenerateCompletionOptions { tools?: AgentToolDefinition[]; forcedToolName?: string; signal?: AbortSignal; }
export interface ModelAdapter {
  modelId(): string;
  generateCompletion(messages: ChatMessagePayload[], options?: GenerateCompletionOptions): Promise<NormalizedModelResponse>;
  generateToolCall(messages: ChatMessagePayload[], toolName: string, options?: GenerateCompletionOptions): Promise<NormalizedModelResponse>;
  streamCompletion(messages: ChatMessagePayload[], options?: { signal?: AbortSignal }): AsyncGenerator<StreamEvent, void, unknown>;
}
function sleep(ms: number, signal?: AbortSignal): Promise<void> { if (signal?.aborted) return Promise.resolve(); return new Promise((resolve) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); }); }
function toModelError(err: unknown, signal?: AbortSignal): ModelError { if (signal?.aborted) return new ModelError('aborted', safeMessage('aborted'), 'request aborted by caller'); if (err instanceof ModelError) return err; return new ModelError('network', safeMessage('network'), err instanceof Error ? err.message : String(err)); }
type NetworkErrorCategory = 'DNS' | 'TLS' | 'CONNECT' | 'TIMEOUT' | 'RESET' | 'ABORT' | 'UNKNOWN';
function classifyNetworkError(error: unknown, signal?: AbortSignal): NetworkErrorCategory {
  if (signal?.aborted) return 'ABORT';
  const value = error as { name?: unknown; code?: unknown; cause?: { code?: unknown } } | null;
  const name = typeof value?.name === 'string' ? value.name.toUpperCase() : '';
  const code = typeof value?.code === 'string' ? value.code.toUpperCase() : '';
  const causeCode = typeof value?.cause?.code === 'string' ? value.cause.code.toUpperCase() : '';
  const combined = `${name} ${code} ${causeCode}`;
  if (['EAI_AGAIN', 'EAI_FAIL', 'EAI_NONAME', 'ENOTFOUND'].some((item) => combined.includes(item))) return 'DNS';
  if (['ERR_TLS_', 'CERT_', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT'].some((item) => combined.includes(item))) return 'TLS';
  if (['ECONNRESET', 'ERR_CONNECTION_RESET'].some((item) => combined.includes(item))) return 'RESET';
  if (['ETIMEDOUT', 'ERR_TIMEOUT', 'TIMEOUT'].some((item) => combined.includes(item))) return 'TIMEOUT';
  if (['ECONNREFUSED', 'ECONNABORTED', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE'].some((item) => combined.includes(item))) return 'CONNECT';
  return 'UNKNOWN';
}
function safeNetworkErrorDetails(error: unknown) {
  const value = error as { name?: unknown; code?: unknown; errno?: unknown; syscall?: unknown; hostname?: unknown; cause?: { code?: unknown } } | null;
  const cause = value?.cause;
  return {
    name: typeof value?.name === 'string' ? value.name : undefined,
    code: typeof value?.code === 'string' || typeof value?.code === 'number' ? value.code : undefined,
    cause_code: typeof cause?.code === 'string' || typeof cause?.code === 'number' ? cause.code : undefined,
    syscall: typeof value?.syscall === 'string' ? value.syscall : undefined,
    errno: typeof value?.errno === 'string' || typeof value?.errno === 'number' ? value.errno : undefined,
    hostname: typeof value?.hostname === 'string' ? value.hostname : undefined,
  };
}
async function requestChatCompletion(config: ModelAdapterConfig, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  if (!config.apiKey) throw new ModelError('not_configured', safeMessage('not_configured'), 'AICREDITS_API_KEY is not set');
  if (!config.modelId) throw new ModelError('not_configured', safeMessage('not_configured'), 'MODEL_ID is not set');
  let lastError: unknown = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fetchStart = Date.now();
    console.log('[model-ai-credits-network]', JSON.stringify({ event: 'fetch_start', attempt: attempt + 1, timestamp: new Date(fetchStart).toISOString() }));
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}`, Accept: body.stream ? 'text/event-stream' : 'application/json' }, body: JSON.stringify(body), signal });
      console.log('[model-ai-credits-response]', JSON.stringify({ event: 'response_received', attempt: attempt + 1, timestamp: new Date().toISOString(), status: response.status, elapsed_ms: Date.now() - fetchStart }));
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      lastError = `${response.status}: ${(await response.text().catch(() => '')).slice(0, 500)}`;
      if (response.status === 429) throw new ModelError('rate_limited', safeMessage('rate_limited'), `provider 429: ${lastError}`, true);
    } catch (error) {
      console.log('[model-ai-credits-network-error]', JSON.stringify({ event: 'fetch_error', attempt: attempt + 1, timestamp: new Date().toISOString(), elapsed_ms: Date.now() - fetchStart, category: classifyNetworkError(error, signal), ...safeNetworkErrorDetails(error), signal_aborted: Boolean(signal?.aborted) }));
      if (signal?.aborted) throw toModelError(error, signal);
      if (error instanceof ModelError) throw error;
      lastError = error;
    }
    if (attempt < 2) await sleep(350 * (2 ** attempt), signal);
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ModelError('provider_error', safeMessage('provider_error'), `AI provider request failed after retries: ${detail}`, true);
}
async function requestWithCapabilityFallback(config: ModelAdapterConfig, buildBody: (remove: { toolChoice: boolean }) => Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const response = await requestChatCompletion(config, buildBody({ toolChoice: true }), signal);
  if (!response.ok && response.status >= 400 && response.status < 500) {
    const rawText = await response.text().catch(() => '');
    if (/tool_choice|function_call|tools|function/i.test(rawText)) return requestChatCompletion(config, buildBody({ toolChoice: false }), signal);
    return new Response(rawText, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  return response;
}
function messagesForProtocol(messages: ChatMessagePayload[]): ChatMessagePayload[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.function.name, arguments: c.function.arguments || '{}' } })) };
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id || '', content: m.content };
    return { role: m.role, content: m.content };
  });
}

function isSseKeepalivePayload(payload: string): boolean {
  const value = payload.trim().toLowerCase();
  return ['ping', 'pong', 'keepalive', 'keep-alive', 'heartbeat'].includes(value);
}
function parseSseData(payload: string): { data?: any; done?: boolean } {
  const value = payload.trim();
  if (!value) return {};
  if (value === '[DONE]') return { done: true };
  try { return { data: JSON.parse(value) }; }
  catch {
    if (isSseKeepalivePayload(value)) return {};
    throw new ModelError('invalid_response', safeMessage('invalid_response'), 'provider emitted malformed SSE JSON before completion', true);
  }
}

async function parseStreamingResponse(response: Response, signal?: AbortSignal): Promise<AsyncGenerator<StreamEvent, void, unknown>> {
  if (!response.body) throw new ModelError('invalid_response', safeMessage('invalid_response'), 'provider returned an empty stream', true);
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let sawDone = false;
  let fullText = '';
  async function* events(): AsyncGenerator<StreamEvent, void, unknown> {
    try {
      while (true) {
        if (signal?.aborted) { await reader.cancel().catch(() => {}); return; }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          const parsed = parseSseData(payload);
          if (parsed.done) { sawDone = true; yield { type: 'done', text: fullText }; return; }
          const data = parsed.data;
          if (!data) continue;
          if (data?.error) throw new ModelError('provider_error', safeMessage('provider_error'), 'provider emitted a streaming error event', true);
          const delta = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content ?? '';
          if (typeof delta === 'string' && delta) { fullText += delta; yield { type: 'chunk', text: delta }; }
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const tailLines = buffer.split(/\r?\n/);
        for (const line of tailLines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          const parsed = parseSseData(payload);
          if (parsed.done) { sawDone = true; yield { type: 'done', text: fullText }; return; }
          const data = parsed.data;
          if (!data) continue;
          if (data?.error) throw new ModelError('provider_error', safeMessage('provider_error'), 'provider emitted a streaming error event', true);
          const delta = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content ?? '';
          if (typeof delta === 'string' && delta) { fullText += delta; yield { type: 'chunk', text: delta }; }
        }
      }
      if (!sawDone) throw new ModelError('invalid_response', safeMessage('invalid_response'), 'provider stream ended before [DONE]', true);
    } finally { reader.releaseLock(); }
  }
  return events();
}

export function createModelAdapter(config: ModelAdapterConfig = resolveAdapterConfigFromEnv()): ModelAdapter {
  async function generateCompletion(messages: ChatMessagePayload[], options: GenerateCompletionOptions = {}): Promise<NormalizedModelResponse> {
    const tools = options.tools || [];
    const protocolMessages = messagesForProtocol(messages);
    const body = (remove: { toolChoice: boolean }): Record<string, unknown> => {
      const b: Record<string, unknown> = { model: config.modelId, messages: protocolMessages, stream: false };
      if (tools.length) { b.tools = tools; if (remove.toolChoice) b.tool_choice = options.forcedToolName ? { type: 'function', function: { name: options.forcedToolName } } : 'auto'; }
      return b;
    };
    let response: Response; try { response = await requestWithCapabilityFallback(config, body, options.signal); } catch (error) { throw toModelError(error, options.signal); }
    if (!response.ok) { const rawText = await response.text().catch(() => ''); throw new ModelError('provider_error', safeMessage('provider_error'), `provider HTTP ${response.status}: ${rawText.slice(0, 500)}`, response.status >= 500 || response.status === 429); }
    const rawBody = await response.text().catch(() => ''); let data: any; try { data = JSON.parse(rawBody); } catch { throw new ModelError('invalid_response', safeMessage('invalid_response'), 'provider returned non-JSON body', true); }
    const choice = data?.choices?.[0]; if (!choice) throw new ModelError('invalid_response', safeMessage('invalid_response'), 'provider response had no choices', true);
    return normalizeAssistantMessage(choice.message, choice.finish_reason);
  }
  async function* streamCompletion(messages: ChatMessagePayload[], options: { signal?: AbortSignal } = {}): AsyncGenerator<StreamEvent, void, unknown> {
    let response: Response;
    try {
      response = await requestWithCapabilityFallback(config, (remove) => { const b: Record<string, unknown> = { model: config.modelId, messages: messagesForProtocol(messages), stream: true }; if (remove.toolChoice) b.tool_choice = 'none'; return b; }, options.signal);
    } catch (error) { throw toModelError(error, options.signal); }
    if (!response.ok) { const rawText = await response.text().catch(() => ''); throw new ModelError('provider_error', safeMessage('provider_error'), `provider HTTP ${response.status}: ${rawText.slice(0, 500)}`, response.status >= 500 || response.status === 429); }
    const generator = await parseStreamingResponse(response, options.signal);
    yield* generator;
  }
  return { modelId: () => config.modelId, generateCompletion, generateToolCall: (messages, toolName, options = {}) => generateCompletion(messages, { ...options, forcedToolName: toolName }), streamCompletion };
}