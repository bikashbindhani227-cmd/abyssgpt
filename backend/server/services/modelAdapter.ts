/**
 * AbyssGPT — Model Adapter / Provider Abstraction
 * ================================================
 *
 * MODEL-ID-AGNOSTIC boundary between the agent system and any AI provider.
 *
 *   MODEL_ID (environment configuration, resolved per request)
 *        ↓
 *   createModelAdapter()            <- the ONLY module that knows the provider
 *        ↓                                transport + response normalization
 *   generateCompletion()            <- non-streaming, tool-aware
 *   generateToolCall()              <- single-shot tool-call helper
 *   streamCompletion()              <- plain text streaming (SSE)
 *        ↓
 *   NORMALIZED MODEL RESPONSE       <- identical shape for every model
 *        ↓
 *   Agent Orchestrator (model-agnostic; never sees the model's name)
 *
 * Hard rules enforced here:
 *  - No model names are referenced anywhere in this file. The model id is a
 *    opaque configuration string (MODEL_ID) read at request time so admin
 *    configuration changes take effect immediately.
 *  - Every provider response is NORMALIZED (tool name, arguments, tool-call
 *    id, text content, finish reason, malformed calls, multiple calls, empty
 *    responses) before it reaches the orchestrator.
 *  - Model failures are converted into typed, recoverable errors. Raw
 *    provider bodies NEVER travel to clients — `ModelError.userMessage` is
 *    the only client-safe surface; `detail` stays in server logs.
 */

// ---------------------------------------------------------------------------
// Shared protocol types (single source of truth for the whole backend)
// ---------------------------------------------------------------------------

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface StreamEvent {
  type: 'chunk' | 'thinking' | 'done' | 'error';
  text?: string;
  error?: string;
  tokens?: number;
}

export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Normalized model response types
// ---------------------------------------------------------------------------

export type NormalizedFinishReason =
  | 'stop'
  | 'tool_calls'
  | 'length'
  | 'content_filter'
  | 'unknown';

/** A tool call extracted from ANY model's response shape, made uniform. */
export interface NormalizedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** True when the raw call needed repair (missing id, stringified/object args, legacy shape…). */
  repaired: boolean;
  /** True when the call could not be salvaged at all (executor must not run it as-is). */
  invalid: boolean;
  invalidReason?: string;
}

export interface NormalizedModelResponse {
  /** Plain assistant text ('' when the model only requested tools). */
  text: string;
  toolCalls: NormalizedToolCall[];
  finishReason: NormalizedFinishReason;
  /** True when at least one raw tool call was structurally broken but recoverable. */
  hadMalformedToolCall: boolean;
}

export type ModelFailureCode =
  | 'not_configured'
  | 'network'
  | 'rate_limited'
  | 'provider_error'
  | 'invalid_response'
  | 'timeout'
  | 'aborted';

/**
 * Typed, normalized model failure. `userMessage` is ALWAYS safe for clients:
 * no provider names, no response bodies, no infrastructure details.
 */
export class ModelError extends Error {
  readonly code: ModelFailureCode;
  readonly userMessage: string;
  /** Server-log-only diagnostic detail. Never sent to clients. */
  readonly detail: string;
  readonly recoverable: boolean;

  constructor(
    code: ModelFailureCode,
    userMessage: string,
    detail: string,
    recoverable = false,
  ) {
    super(userMessage);
    this.name = 'ModelError';
    this.code = code;
    this.userMessage = userMessage;
    this.detail = detail;
    this.recoverable = recoverable;
  }
}

// ---------------------------------------------------------------------------
// Safe, human-readable failure copy (shared by every model)
// ---------------------------------------------------------------------------

export const SAFE_MODEL_ERRORS: Record<ModelFailureCode, string> = {
  not_configured: 'The AI service is not configured. Please contact the administrator.',
  network: 'The AI service could not be reached. Please try again shortly.',
  rate_limited: 'The AI service is busy right now. Please retry in a moment.',
  provider_error: 'The AI service returned an error. Please try again shortly.',
  invalid_response: 'The AI response could not be processed. Please retry.',
  timeout: 'The request took too long to complete. Please try again.',
  aborted: 'The request was cancelled.',
};

function safeMessage(code: ModelFailureCode): string {
  return SAFE_MODEL_ERRORS[code];
}

// ---------------------------------------------------------------------------
// Response normalization (the tool-calling compatibility layer)
// ---------------------------------------------------------------------------

/** Different providers express the same intent with different strings. */
export function normalizeFinishReason(raw: unknown): NormalizedFinishReason {
  const value = String(raw || '').toLowerCase().trim();
  if (!value) return 'unknown';
  if (['stop', 'end_turn', 'eos', 'natural', 'complete'].includes(value)) return 'stop';
  if (['tool_calls', 'tool_use', 'function_call', 'tool', 'tools'].includes(value)) return 'tool_calls';
  if (['length', 'max_tokens', 'token_limit', 'context_length'].includes(value)) return 'length';
  if (['content_filter', 'safety', 'blocked'].includes(value)) return 'content_filter';
  return 'unknown';
}

/** Extract assistant text from either a plain string or a content-parts array. */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * Parse model-generated tool arguments into a plain object.
 *
 * Models emit arguments as: JSON strings, pre-parsed objects, JSON wrapped in
 * markdown fences, or slightly broken JSON. Each repair stage is attempted in
 * order; the output is ALWAYS an object (never throws).
 */
export function parseToolCallArguments(rawArgs: unknown): { args: Record<string, unknown>; repaired: boolean } {
  // Already an object — some providers pre-parse.
  if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    return { args: rawArgs as Record<string, unknown>, repaired: false };
  }
  if (rawArgs === null || rawArgs === undefined) return { args: {}, repaired: false };

  if (typeof rawArgs !== 'string') return { args: {}, repaired: true };

  let text = rawArgs.trim();
  if (!text) return { args: {}, repaired: false };

  // Stage 0: strip markdown/code fences some models wrap arguments in.
  const fenced = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    text = fenced[1].trim();
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { args: parsed, repaired: true };
    } catch { /* fall through */ }
  }

  // Stage 1: direct parse.
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { args: parsed, repaired: false };
  } catch { /* fall through */ }

  // Stage 2: extract the outermost {...} block (model added prose around it).
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { args: parsed, repaired: true };
    } catch { /* fall through */ }
  }

  // Stage 3: smart quotes -> ASCII quotes (some tokenizers emit them).
  const asciiQuotes = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  if (asciiQuotes !== text) {
    try {
      const parsed = JSON.parse(asciiQuotes);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { args: parsed, repaired: true };
    } catch { /* fall through */ }
  }

  return { args: {}, repaired: true };
}

/**
 * Some models without native tool-calling emit a lone JSON object as their
 * text content. Recognize the STRICT pattern only (avoid false positives):
 * { "name": "...", "arguments": {...} } (or "parameters"/"args"/"function").
 */
export function extractContentEmbeddedToolCall(
  text: string,
): { name: string; args: Record<string, unknown> } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const candidate = (obj.function && typeof obj.function === 'object' ? obj.function : obj) as Record<string, unknown>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (!name) return null;
  const rawArgs = candidate.arguments ?? candidate.parameters ?? candidate.args ?? {};
  if (rawArgs && typeof rawArgs !== 'object') return null;
  return { name, args: (rawArgs || {}) as Record<string, unknown> };
}

/** Some models prefix tool names with a legacy namespace ('functions.foo'). */
function normalizeToolName(rawName: unknown): string {
  let name = String(rawName ?? '').trim();
  if (name.startsWith('functions.')) name = name.slice('functions.'.length);
  if (name.startsWith('tools.')) name = name.slice('tools.'.length);
  return name;
}

let syntheticCallCounter = 0;
/** Deterministic per-process unique id for calls that arrive without one. */
function syntheticToolCallId(seed: string): string {
  syntheticCallCounter = (syntheticCallCounter + 1) % 1_000_000;
  return `call_synth_${syntheticCallCounter}_${(seed || 'x').slice(0, 8)}`;
}

interface RawToolCallShape {
  id?: unknown;
  type?: unknown;
  function?: { name?: unknown; arguments?: unknown } | undefined;
  name?: unknown;
  arguments?: unknown;
}

/**
 * Normalize ONE raw tool call from any provider into the internal format.
 * Never throws — unrepairable calls come back with invalid=true.
 */
export function normalizeOneToolCall(raw: RawToolCallShape, index: number): NormalizedToolCall {
  // Legacy single-function shape: { name, arguments } at the top level.
  const name = normalizeToolCallName(raw);
  const rawArguments = raw.function ? raw.function.arguments : raw.arguments;
  const { args, repaired } = parseToolCallArguments(rawArguments);

  let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
  let wasRepaired = repaired;

  if (!id) {
    id = syntheticToolCallId(`${name}:${index}`);
    wasRepaired = true;
  }

  if (!name) {
    return { id, name: '', args: {}, repaired: wasRepaired, invalid: true, invalidReason: 'missing tool name' };
  }

  return { id, name, args, repaired: wasRepaired, invalid: false };
}

function normalizeToolCallName(raw: RawToolCallShape): string {
  if (raw.function && typeof raw.function === 'object') {
    return normalizeToolName(raw.function.name);
  }
  return normalizeToolName(raw.name);
}

/**
 * Full assistant-message normalization.
 *
 * Handles: plain text; native tool_calls; legacy `function_call`; content
 * embedded JSON tool calls; empty responses; unknown finish reasons; content
 * part arrays. The orchestrator only ever sees NormalizedModelResponse.
 */
export function normalizeAssistantMessage(rawMessage: unknown, rawFinishReason: unknown): NormalizedModelResponse {
  const msg = (rawMessage && typeof rawMessage === 'object' ? rawMessage : {}) as Record<string, unknown>;
  let text = extractText(msg.content);
  const finishReason = normalizeFinishReason(rawFinishReason);
  let hadMalformed = false;

  const rawCalls: RawToolCallShape[] = [];
  if (Array.isArray(msg.tool_calls)) {
    for (const rc of msg.tool_calls) {
      if (rc && typeof rc === 'object') rawCalls.push(rc as RawToolCallShape);
    }
  }
  // Legacy OpenAI-style single function_call.
  if (!rawCalls.length && msg.function_call && typeof msg.function_call === 'object') {
    rawCalls.push(msg.function_call as RawToolCallShape);
  }

  let toolCalls = rawCalls.map((rc, i) => normalizeOneToolCall(rc, i));

  // Content-embedded tool call: only for models that returned no native calls.
  if (!toolCalls.length && text) {
    const embedded = extractContentEmbeddedToolCall(text);
    if (embedded) {
      toolCalls = [
        {
          id: syntheticToolCallId(embedded.name),
          name: embedded.name,
          args: embedded.args,
          repaired: true,
          invalid: false,
        },
      ];
      text = '';
      hadMalformed = true; // not native protocol — flag so the loop can adapt
    }
  }

  for (const call of toolCalls) {
    if (call.repaired) hadMalformed = true;
  }

  return { text, toolCalls, finishReason, hadMalformedToolCall: hadMalformed };
}

// ---------------------------------------------------------------------------
// The adapter itself (transport + retry + graceful capability degradation)
// ---------------------------------------------------------------------------

export interface ModelAdapterConfig {
  /** Opaque model id from configuration. Never inspected by the agent system. */
  modelId: string;
  baseUrl: string;
  apiKey: string;
}

/** Resolved from the environment at CALL time, so config changes apply without a code change. */
export function resolveAdapterConfigFromEnv(): ModelAdapterConfig {
  const modelId = process.env.MODEL_ID?.trim() || '';
  const apiKey = process.env.AICREDITS_API_KEY?.trim() || '';
  const baseUrl = (process.env.AICREDITS_BASE_URL || 'https://api.aicredits.in/v1').replace(/\/$/, '');
  return { modelId, baseUrl, apiKey };
}

export interface GenerateCompletionOptions {
  tools?: AgentToolDefinition[];
  /** Protocol-level forced first tool. Providers that reject forcing degrade to 'auto'. */
  forcedToolName?: string;
  signal?: AbortSignal;
}

export interface ModelAdapter {
  /** Opaque configured model id (diagnostics/logging only). */
  modelId(): string;
  /** Non-streaming completion with optional native tool calling. Throws ModelError on unrecoverable failures. */
  generateCompletion(messages: ChatMessagePayload[], options?: GenerateCompletionOptions): Promise<NormalizedModelResponse>;
  /** Single-shot helper: request exactly one tool call (still normalized). */
  generateToolCall(messages: ChatMessagePayload[], toolName: string, options?: GenerateCompletionOptions): Promise<NormalizedModelResponse>;
  /** Streaming text completion (SSE). Yields the shared StreamEvent shape. */
  streamCompletion(messages: ChatMessagePayload[], options?: { signal?: AbortSignal }): AsyncGenerator<StreamEvent, void, unknown>;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function toModelError(err: unknown, signal?: AbortSignal): ModelError {
  if (signal?.aborted) return new ModelError('aborted', safeMessage('aborted'), 'request aborted by caller');
  if (err instanceof ModelError) return err;
  const detail = err instanceof Error ? err.message : String(err);
  return new ModelError('network', safeMessage('network'), detail);
}

/** POST /chat/completions with bounded retry on 429/5xx. Preserves existing transport behavior. */
async function requestChatCompletion(
  config: ModelAdapterConfig,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  if (!config.apiKey) {
    throw new ModelError('not_configured', safeMessage('not_configured'), 'AICREDITS_API_KEY is not set', false);
  }
  if (!config.modelId) {
    throw new ModelError('not_configured', safeMessage('not_configured'), 'MODEL_ID is not set', false);
  }

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          Accept: body.stream ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      lastError = `${response.status}: ${(await response.text().catch(() => '')).slice(0, 500)}`;
      if (response.status === 429) {
        throw new ModelError('rate_limited', safeMessage('rate_limited'), `provider 429: ${lastError}`, true);
      }
    } catch (error) {
      if (signal?.aborted) throw toModelError(error, signal);
      if (error instanceof ModelError && error.code === 'rate_limited') throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 2) await sleep(350 * (2 ** attempt), signal);
  }
  throw new ModelError('provider_error', safeMessage('provider_error'), `AI provider request failed after retries: ${lastError}`, true);
}

/**
 * Some compatible providers reject protocol niceties (forced tool choice,
 * tool_choice:'none'). Degrade gracefully: on a 4xx whose body indicates the
 * field was rejected, retry once without it. Bounded and model-agnostic.
 */
async function requestWithCapabilityFallback(
  config: ModelAdapterConfig,
  buildBody: (remove: { toolChoice: boolean }) => Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await requestChatCompletion(config, buildBody({ toolChoice: true }), signal);
  if (!response.ok && response.status >= 400 && response.status < 500) {
    const rawText = await response.text().catch(() => '');
    if (/tool_choice|function_call|tools|function/i.test(rawText)) {
      return await requestChatCompletion(config, buildBody({ toolChoice: false }), signal);
    }
    // Body was consumed for inspection; re-wrap so downstream error reporting
    // still sees the original status and payload.
    return new Response(rawText, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  return response;
}

function messagesForProtocol(messages: ChatMessagePayload[]): ChatMessagePayload[] {
  // Serialize assistant tool_calls exactly as the wire protocol expects.
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: m.role,
        content: m.content || '',
        tool_calls: m.tool_calls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.function.name, arguments: c.function.arguments || '{}' },
        })),
      };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id || '', content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

export function createModelAdapter(config: ModelAdapterConfig = resolveAdapterConfigFromEnv()): ModelAdapter {
  async function generateCompletion(
    messages: ChatMessagePayload[],
    options: GenerateCompletionOptions = {},
  ): Promise<NormalizedModelResponse> {
    const tools = options.tools || [];
    const protocolMessages = messagesForProtocol(messages);

    const body = (remove: { toolChoice: boolean }): Record<string, unknown> => {
      const b: Record<string, unknown> = {
        model: config.modelId,
        messages: protocolMessages,
        stream: false,
      };
      if (tools.length) {
        b.tools = tools;
        if (remove.toolChoice) {
          b.tool_choice = options.forcedToolName
            ? { type: 'function', function: { name: options.forcedToolName } }
            : 'auto';
        }
      }
      return b;
    };

    let response: Response;
    try {
      response = await requestWithCapabilityFallback(config, body, options.signal);
    } catch (error) {
      throw toModelError(error, options.signal);
    }

    if (!response.ok) {
      const rawText = await response.text().catch(() => '');
      throw new ModelError(
        'provider_error',
        safeMessage('provider_error'),
        `provider HTTP ${response.status}: ${rawText.slice(0, 500)}`,
        response.status >= 500 || response.status === 429,
      );
    }

    const rawBody = await response.text().catch(() => '');
    let data: unknown;
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw new ModelError('invalid_response', safeMessage('invalid_response'), 'provider returned non-JSON body', true);
    }

    const choice = (data as { choices?: Array<Record<string, unknown>> })?.choices?.[0];
    if (!choice) {
      throw new ModelError('invalid_response', safeMessage('invalid_response'), 'provider response had no choices', true);
    }

    return normalizeAssistantMessage(choice.message, choice.finish_reason);
  }

  async function* streamCompletion(
    messages: ChatMessagePayload[],
    options: { signal?: AbortSignal } = {},
  ): AsyncGenerator<StreamEvent, void, unknown> {
    // tool_choice:'none' is requested; providers that reject the field get a
    // retry without it via requestWithCapabilityFallback.
    let response: Response;
    try {
      response = await requestWithCapabilityFallback(config, (remove) => {
        const b: Record<string, unknown> = {
          model: config.modelId,
          messages: messagesForProtocol(messages),
          stream: true,
        };
        if (remove.toolChoice) b.tool_choice = 'none';
        return b;
      }, options.signal);
    } catch (error) {
      throw toModelError(error, options.signal);
    }

    if (!response.body) {
      throw new ModelError('invalid_response', safeMessage('invalid_response'), 'provider returned an empty stream', true);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    try {
      while (true) {
        if (options.signal?.aborted) return;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') {
            yield { type: 'done', text: fullText };
            return;
          }
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          try {
            const data = JSON.parse(payload);
            const delta =
              data?.choices?.[0]?.delta?.content ??
              data?.choices?.[0]?.message?.content ??
              '';
            if (typeof delta === 'string' && delta) {
              fullText += delta;
              yield { type: 'chunk', text: delta };
            }
          } catch {
            // Ignore malformed keepalive/provider noise lines.
          }
        }
      }
      buffer += decoder.decode();
      const tail = buffer.trim();
      if (tail.startsWith('data:') && !tail.includes('[DONE]')) {
        try {
          const data = JSON.parse(tail.slice(5).trim());
          const delta = data?.choices?.[0]?.delta?.content ?? '';
          if (typeof delta === 'string' && delta) {
            fullText += delta;
            yield { type: 'chunk', text: delta };
          }
        } catch { /* final partial event can be ignored */ }
      }
      yield { type: 'done', text: fullText };
    } finally {
      reader.releaseLock();
    }
  }

  return {
    modelId: () => config.modelId,
    generateCompletion,
    generateToolCall: (messages, toolName, options = {}) =>
      generateCompletion(messages, { ...options, tools: options.tools, forcedToolName: toolName }),
    streamCompletion,
  };
}
