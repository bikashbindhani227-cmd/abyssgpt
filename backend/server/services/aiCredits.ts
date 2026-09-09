import dotenv from 'dotenv';
dotenv.config();
import { BudgetTracker, createBudgetForRequest, ABSOLUTE_CEILING_BOUNDS, type BudgetPlan } from './agentBudget.js';
export interface ChatMessagePayload { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; }
export interface StreamEvent { type: 'chunk' | 'thinking' | 'done' | 'error'; text?: string; error?: string; tokens?: number; }
export interface AgentToolDefinition { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export type AgentToolExecutor = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<string>;
const MODEL_ID = process.env.MODEL_ID?.trim() || '';
const AICREDITS_API_KEY = process.env.AICREDITS_API_KEY?.trim() || '';

export function normalizeAiCreditsBaseUrl(rawUrl?: string): string {
  let url = String(rawUrl || '').trim().replace(/\/$/, '');
  if (!url) {
    return 'https://api.aicredits.in/v1';
  }
  url = url.replace(/api\.aicredits\.com/gi, 'api.aicredits.in');
  if (url.startsWith('http://api.aicredits.in')) {
    url = url.replace('http://', 'https://');
  }
  if (/^https:\/\/api\.aicredits\.in$/i.test(url)) {
    url = `${url}/v1`;
  }
  return url;
}

const getAiCreditsBaseUrl = () => normalizeAiCreditsBaseUrl(process.env.AICREDITS_BASE_URL);
function assertConfigured() { if (!AICREDITS_API_KEY) throw new Error('AICREDITS_API_KEY is not configured on the backend.'); if (!MODEL_ID) throw new Error('MODEL_ID is not configured on the backend.'); }
function sleep(ms: number, signal?: AbortSignal) { if (signal?.aborted) return Promise.resolve(); return new Promise<void>((resolve) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); }); }

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
async function requestAICredits(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  assertConfigured(); let lastError: unknown = undefined;
  const requestUrl = `${getAiCreditsBaseUrl()}/chat/completions`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fetchStart = Date.now();
    console.log('[ai-credits-network]', JSON.stringify({ event: 'fetch_start', attempt: attempt + 1, timestamp: new Date(fetchStart).toISOString() }));
    try {
      const response = await fetch(requestUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AICREDITS_API_KEY}`, Accept: body.stream ? 'text/event-stream' : 'application/json' }, body: JSON.stringify(body), signal });
      const elapsedMs = Date.now() - fetchStart;
      console.log('[ai-credits-response]', JSON.stringify({ event: 'response_received', attempt: attempt + 1, timestamp: new Date().toISOString(), status: response.status, elapsed_ms: elapsedMs }));
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      lastError = `${response.status}: ${(await response.text().catch(() => '')).slice(0, 500)}`;
    } catch (error) {
      const elapsedMs = Date.now() - fetchStart;
      const details = safeNetworkErrorDetails(error);
      const category = classifyNetworkError(error, signal);
      console.log('[ai-credits-network-error]', JSON.stringify({ event: 'fetch_error', attempt: attempt + 1, timestamp: new Date().toISOString(), elapsed_ms: elapsedMs, category, ...details, signal_aborted: signal?.aborted === true }));
      if (signal?.aborted) throw error;
      lastError = error;
    }
    if (attempt < 2) await sleep(350 * (2 ** attempt), signal);
  }
  const finalError = new Error(`AI Credits request failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError || 'unknown error')}`, { cause: lastError });
  throw finalError;
}
const TOOL_UNSUPPORTED_PATTERN = /no endpoints found|support tool use|does not support tools?|tool_choice|function_call/i;
async function getJsonCompletion(messages: ChatMessagePayload[], tools: AgentToolDefinition[], signal?: AbortSignal, forcedToolName?: string): Promise<{ message?: ChatMessagePayload; finishReason?: string }> {
  const response = await requestAICredits({ model: MODEL_ID, messages, tools, tool_choice: forcedToolName ? { type: 'function', function: { name: forcedToolName } } : 'auto', stream: false }, signal);
  let raw = await response.text().catch(() => '');
  if (!response.ok && tools.length && TOOL_UNSUPPORTED_PATTERN.test(raw)) {
    const fallback = await requestAICredits({ model: MODEL_ID, messages, stream: false }, signal); raw = await fallback.text().catch(() => '');
    if (!fallback.ok) throw new Error(`AI Credits API returned ${fallback.status}: ${raw.slice(0, 700)}`);
    let fallbackData: any; try { fallbackData = JSON.parse(raw); } catch { throw new Error('AI Credits returned invalid JSON.'); }
    const fallbackChoice = fallbackData?.choices?.[0]; return { finishReason: fallbackChoice?.finish_reason, message: fallbackChoice?.message };
  }
  if (!response.ok) throw new Error(`AI Credits API returned ${response.status}: ${raw.slice(0, 700)}`);
  let data: any; try { data = JSON.parse(raw); } catch { throw new Error('AI Credits returned invalid JSON.'); }
  const choice = data?.choices?.[0]; return { finishReason: choice?.finish_reason, message: choice?.message };
}

async function* streamFinalCompletion(messages: ChatMessagePayload[], signal?: AbortSignal): AsyncGenerator<StreamEvent, void, unknown> {
  const response = await requestAICredits({ model: MODEL_ID, messages, stream: true }, signal);
  if (!response.ok) { const raw = await response.text().catch(() => ''); throw new Error(`AI Credits API returned ${response.status}: ${raw.slice(0, 700)}`); }
  if (!response.body) throw new Error('AI Credits API returned an empty stream.');
  const reader = response.body.getReader(); const decoder = new TextDecoder('utf-8'); let buffer = ''; let fullText = ''; let sawDone = false;
  try {
    while (true) {
      if (signal?.aborted) { await reader.cancel().catch(() => {}); return; }
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim(); if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim(); if (!payload) continue;
        if (payload === '[DONE]') { sawDone = true; yield { type: 'done', text: fullText }; return; }
        let data: any; try { data = JSON.parse(payload); } catch { throw new Error('AI Credits returned malformed streaming data.'); }
        if (data?.error) throw new Error('AI Credits returned a streaming error.');
        const delta = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content ?? '';
        if (typeof delta === 'string' && delta) { fullText += delta; yield { type: 'chunk', text: delta }; }
      }
    }
    buffer += decoder.decode();
    const tailLines = buffer.split(/\r?\n/);
    for (const line of tailLines) {
      const trimmed = line.trim(); if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim(); if (!payload) continue;
      if (payload === '[DONE]') { sawDone = true; yield { type: 'done', text: fullText }; return; }
      let data: any; try { data = JSON.parse(payload); } catch { throw new Error('AI Credits ended with an incomplete SSE event.'); }
      if (data?.error) throw new Error('AI Credits returned a streaming error.');
      const delta = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content ?? '';
      if (typeof delta === 'string' && delta) { fullText += delta; yield { type: 'chunk', text: delta }; }
    }
    if (!sawDone) throw new Error('AI Credits stream ended before [DONE]; response is incomplete.');
  } finally { reader.releaseLock(); }
}

function budgetNudge(tracker: BudgetTracker): ChatMessagePayload {
  return { role: 'system', content: `[RESOURCE BUDGET] Remaining tool calls: ${Math.max(0, tracker.plan.budget.MAX_TOOL_CALLS - tracker.toolCallsUsedCount)}. Remaining reasoning steps: ${Math.max(0, tracker.plan.budget.MAX_AGENT_STEPS - tracker.stepsUsedCount)}. Approximately ${Math.max(0, Math.floor(tracker.remainingMs / 1000))}s left before this request is finalized. If the information gathered so far is sufficient, stop calling tools and answer now. Do not repeat a tool call that already returned the same result or failed.` };
}

export async function* streamAgenticCompletion(messages: ChatMessagePayload[], tools: AgentToolDefinition[], executeTool: AgentToolExecutor, signal?: AbortSignal, forcedFirstTool?: string, plan?: BudgetPlan, tracker?: BudgetTracker): AsyncGenerator<StreamEvent, void, unknown> {
  assertConfigured(); if (!tools.length) { yield* streamFinalCompletion(messages, signal); return; }
  const resolvedPlan = plan || createBudgetForRequest(messages.filter((m) => m.role === 'user').slice(-1)[0]?.content || ''); const sharedTracker = tracker || new BudgetTracker(resolvedPlan); const working = [...messages]; let expandedOnce = false;
  while (true) {
    if (signal?.aborted) return;
    const stepGate = sharedTracker.canStartStep(); if (!stepGate.allowed) { yield { type: 'thinking', text: 'Finishing the answer…' }; yield* streamFinalCompletion(working, signal); return; }
    sharedTracker.recordStep(); yield { type: 'thinking', text: sharedTracker.stepsUsedCount === 1 ? 'Planning the best approach…' : 'Reviewing tool results…' };
    const planningMessages = sharedTracker.stepsUsedCount === 1 ? working : [...working, budgetNudge(sharedTracker)];
    const planned = await getJsonCompletion(planningMessages, tools, signal, sharedTracker.stepsUsedCount === 1 ? forcedFirstTool : undefined); const assistant = planned.message; const calls = assistant?.tool_calls || [];
    if (!assistant || calls.length === 0) { if (assistant?.content) working.push({ role: 'assistant', content: assistant.content }); yield* streamFinalCompletion(working, signal); return; }
    working.push({ role: 'assistant', content: assistant.content || '', tool_calls: calls }); const toolCallsBefore = sharedTracker.toolCallsUsedCount; yield { type: 'thinking', text: calls.length === 1 ? 'Running the tool…' : `Running ${calls.length} tools in parallel…` };
    const results = await Promise.all(calls.map(async (call) => {
      let args: Record<string, unknown> = {}; try { const parsed = JSON.parse(call.function.arguments || '{}'); if (parsed && typeof parsed === 'object') args = parsed; } catch { return { id: call.id, result: 'Tool arguments were invalid JSON.' }; }
      try { const result = await executeTool(call.function.name, args, signal); return { id: call.id, result: String(result).slice(0, ABSOLUTE_CEILING_BOUNDS.MAX_TOOL_OUTPUT_SIZE) }; } catch (error) { return { id: call.id, result: `Tool failed: ${error instanceof Error ? error.message : String(error)}` }; }
    }));
    for (const result of results) working.push({ role: 'tool', tool_call_id: result.id, content: result.result });
    const executedNothing = sharedTracker.toolCallsUsedCount === toolCallsBefore; const term = sharedTracker.shouldTerminate();
    if (executedNothing) { yield { type: 'thinking', text: 'Wrapping up with the available information…' }; yield* streamFinalCompletion(working, signal); return; }
    if (term.terminate) {
      const makingProgress = sharedTracker.identicalResultStreakCount === 0 && term.reason !== 'total request timeout reached';
      if (!expandedOnce && makingProgress && (resolvedPlan.classification.category === 'research' || resolvedPlan.classification.complexity >= 7)) { sharedTracker.adapt('expand', 'complex task in progress'); expandedOnce = true; continue; }
      yield { type: 'thinking', text: 'Finishing the answer…' }; yield* streamFinalCompletion(working, signal); return;
    }
  }
}

export async function* streamChatCompletion(messages: ChatMessagePayload[], signal?: AbortSignal): AsyncGenerator<StreamEvent, void, unknown> { assertConfigured(); yield* streamFinalCompletion(messages, signal); }
export async function generateConversationSummary(history: Array<{ role: string; content: string }>): Promise<string> {
  assertConfigured(); const textPrompt = ['Summarize this conversation in 2-3 concise sentences.', 'Capture durable user preferences, key facts, and important open threads only.', '', ...history.map((m) => `${m.role.toUpperCase()}: ${m.content}`)].join('\n');
  const response = await requestAICredits({ model: MODEL_ID, messages: [{ role: 'user', content: textPrompt }], stream: false }); if (!response.ok) return ''; const data: any = await response.json().catch(() => ({})); return data?.choices?.[0]?.message?.content || '';
}
export function getConfiguredModelId(): string { return MODEL_ID || 'not-configured'; }
