import dotenv from 'dotenv';
dotenv.config();
import {
  BudgetTracker,
  createBudgetForRequest,
  ABSOLUTE_CEILING_BOUNDS,
  type BudgetPlan,
} from './agentBudget.js';

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

export type AgentToolExecutor = (
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<string>;

const MODEL_ID = process.env.MODEL_ID?.trim() || '';
const AICREDITS_API_KEY = process.env.AICREDITS_API_KEY?.trim() || '';
const AICREDITS_BASE_URL = (process.env.AICREDITS_BASE_URL || 'https://api.aicredits.in/v1').replace(/\/$/, '');

function assertConfigured() {
  if (!AICREDITS_API_KEY) throw new Error('AICREDITS_API_KEY is not configured on the backend.');
  if (!MODEL_ID) throw new Error('MODEL_ID is not configured on the backend.');
}

function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function requestAICredits(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  assertConfigured();
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${AICREDITS_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AICREDITS_API_KEY}`,
          Accept: body.stream ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      lastError = `${response.status}: ${(await response.text().catch(() => '')).slice(0, 500)}`;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 2) await sleep(350 * (2 ** attempt), signal);
  }
  throw new Error(`AI Credits request failed after retries: ${lastError || 'unknown error'}`);
}

// Some upstream routes/models behind AI Credits do not have any endpoint that
// supports tool/function calling for the configured MODEL_ID (e.g. "No
// endpoints found that support tool use. Try disabling \"web_search\".",
// HTTP 404). Detect that specific rejection so we can degrade gracefully
// instead of failing the whole request.
const TOOL_UNSUPPORTED_PATTERN = /no endpoints found|support tool use|does not support tools?|tool_choice|function_call/i;

async function getJsonCompletion(
  messages: ChatMessagePayload[],
  tools: AgentToolDefinition[],
  signal?: AbortSignal,
  forcedToolName?: string,
): Promise<{ message?: ChatMessagePayload; finishReason?: string }> {
  const response = await requestAICredits({
    model: MODEL_ID,
    messages,
    tools,
    tool_choice: forcedToolName
      ? { type: 'function', function: { name: forcedToolName } }
      : 'auto',
    stream: false,
  }, signal);
  let raw = await response.text().catch(() => '');

  if (!response.ok && tools.length && TOOL_UNSUPPORTED_PATTERN.test(raw)) {
    // The model/provider combination cannot do tool calls at all. Retry as a
    // plain completion (no tools, no tool_choice) so the agent falls back to
    // answering directly instead of erroring the whole request out.
    const fallback = await requestAICredits({
      model: MODEL_ID,
      messages,
      stream: false,
    }, signal);
    raw = await fallback.text().catch(() => '');
    if (!fallback.ok) throw new Error(`AI Credits API returned ${fallback.status}: ${raw.slice(0, 700)}`);
    let fallbackData: any;
    try { fallbackData = JSON.parse(raw); } catch { throw new Error('AI Credits returned invalid JSON.'); }
    const fallbackChoice = fallbackData?.choices?.[0];
    return {
      finishReason: fallbackChoice?.finish_reason,
      message: fallbackChoice?.message,
    };
  }

  if (!response.ok) throw new Error(`AI Credits API returned ${response.status}: ${raw.slice(0, 700)}`);
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error('AI Credits returned invalid JSON.'); }
  const choice = data?.choices?.[0];
  return {
    finishReason: choice?.finish_reason,
    message: choice?.message,
  };
}

async function* streamFinalCompletion(
  messages: ChatMessagePayload[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, unknown> {
  const response = await requestAICredits({
    model: MODEL_ID,
    messages,
    tool_choice: 'none',
    stream: true,
  }, signal);
  if (!response.body) throw new Error('AI Credits API returned an empty stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  try {
    while (true) {
      if (signal?.aborted) return;
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
        const raw = trimmed.slice(5).trim();
        if (!raw) continue;
        try {
          const data = JSON.parse(raw);
          const delta = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content ?? '';
          if (typeof delta === 'string' && delta) {
            fullText += delta;
            yield { type: 'chunk', text: delta };
          }
        } catch {
          // Ignore malformed keepalive/provider noise.
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().startsWith('data:') && !buffer.includes('[DONE]')) {
      try {
        const data = JSON.parse(buffer.trim().slice(5).trim());
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

/** Non-blocking budget status line for the model. Numbers stay server-side only. */
function budgetNudge(tracker: BudgetTracker): ChatMessagePayload {
  const remainingCalls = Math.max(0, tracker.plan.budget.MAX_TOOL_CALLS - tracker.toolCallsUsedCount);
  const remainingSteps = Math.max(0, tracker.plan.budget.MAX_AGENT_STEPS - tracker.stepsUsedCount);
  const secondsLeft = Math.max(0, Math.floor(tracker.remainingMs / 1000));
  return {
    role: 'system',
    content: `[RESOURCE BUDGET] Remaining tool calls: ${remainingCalls}. Remaining reasoning steps: ${remainingSteps}. Approximately ${secondsLeft}s left before this request is finalized. If the information gathered so far is sufficient, stop calling tools and answer now. Do not repeat a tool call that already returned the same result or failed.`,
  };
}

/**
 * Native model-selected tool loop under AUTOMATIC RESOURCE MANAGEMENT.
 *
 * The loop length, tool permissions, timeouts, output sizes, early-termination
 * rules, and anti-loop protection are all enforced by the BudgetTracker — the
 * model cannot extend its own budget and never sees user-facing limit values.
 *
 * Normal chat should call streamChatCompletion() directly; this path is only
 * used when the request benefits from tools.
 */
export async function* streamAgenticCompletion(
  messages: ChatMessagePayload[],
  tools: AgentToolDefinition[],
  executeTool: AgentToolExecutor,
  signal?: AbortSignal,
  forcedFirstTool?: string,
  plan?: BudgetPlan,
  tracker?: BudgetTracker,
): AsyncGenerator<StreamEvent, void, unknown> {
  assertConfigured();
  if (!tools.length) {
    yield* streamFinalCompletion(messages, signal);
    return;
  }

  // The plan and tracker come from the server-side planner; if absent, derive
  // both locally. The tracker MUST be shared with the tool executor so gating,
  // accounting, and loop protection all see the same counters.
  const resolvedPlan = plan || createBudgetForRequest(messages.filter((m) => m.role === 'user').slice(-1)[0]?.content || '');
  const sharedTracker = tracker || new BudgetTracker(resolvedPlan);

  const working = [...messages];
  let expandedOnce = false;

  while (true) {
    if (signal?.aborted) return;

    // ---- budget gate before every reasoning step -------------------------
    const stepGate = sharedTracker.canStartStep();
    if (!stepGate.allowed) {
      yield { type: 'thinking', text: 'Finishing the answer…' };
      yield* streamFinalCompletion(working, signal);
      return;
    }
    sharedTracker.recordStep();

    yield { type: 'thinking', text: sharedTracker.stepsUsedCount === 1 ? 'Planning the best approach…' : 'Reviewing tool results…' };

    // Inject the live budget nudge only into the model-visible payload.
    const planningMessages = sharedTracker.stepsUsedCount === 1
      ? working
      : [...working, budgetNudge(sharedTracker)];

    const planned = await getJsonCompletion(
      planningMessages,
      tools,
      signal,
      sharedTracker.stepsUsedCount === 1 ? forcedFirstTool : undefined,
    );
    const assistant = planned.message;
    const calls = assistant?.tool_calls || [];

    // No tool calls => the model considers the answer sufficient. Stop early.
    if (!assistant || calls.length === 0) {
      if (assistant?.content) working.push({ role: 'assistant', content: assistant.content });
      yield* streamFinalCompletion(working, signal);
      return;
    }

    working.push({
      role: 'assistant',
      content: assistant.content || '',
      tool_calls: calls,
    });

    const toolCallsBefore = tracker.toolCallsUsedCount;

    yield { type: 'thinking', text: calls.length === 1 ? 'Running the tool…' : `Running ${calls.length} tools in parallel…` };

    const results = await Promise.all(calls.map(async (call) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(call.function.arguments || '{}');
        if (parsed && typeof parsed === 'object') args = parsed;
      } catch {
        return { id: call.id, result: 'Tool arguments were invalid JSON.' };
      }
      try {
        const result = await executeTool(call.function.name, args, signal);
        return { id: call.id, result: String(result).slice(0, ABSOLUTE_CEILING_BOUNDS.MAX_TOOL_OUTPUT_SIZE) };
      } catch (error) {
        return { id: call.id, result: `Tool failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    }));

    for (const result of results) {
      working.push({ role: 'tool', tool_call_id: result.id, content: result.result });
    }

    // ---- post-execution budget evaluation ---------------------------------
    const executedNothing = sharedTracker.toolCallsUsedCount === toolCallsBefore;
    const term = sharedTracker.shouldTerminate();

    if (executedNothing) {
      // Every call in this round was blocked by the resource manager
      // (budget exhausted or loop protection). Finalize with what we have.
      yield { type: 'thinking', text: 'Wrapping up with the available information…' };
      yield* streamFinalCompletion(working, signal);
      return;
    }

    if (term.terminate) {
      // Budget adaptation: one controlled expansion for genuinely complex
      // research work that is still making progress — strictly below ceilings.
      const makingProgress =
        sharedTracker.identicalResultStreakCount === 0 &&
        term.reason !== 'total request timeout reached';
      if (
        !expandedOnce &&
        makingProgress &&
        (resolvedPlan.classification.category === 'research' || resolvedPlan.classification.complexity >= 7)
      ) {
        tracker.adapt('expand', 'complex research in progress');
        expandedOnce = true;
        continue;
      }
      yield { type: 'thinking', text: 'Finishing the answer…' };
      yield* streamFinalCompletion(working, signal);
      return;
    }

    // Task turned out simpler than planned: shrink the remaining budget so
    // later rounds cannot drift into unnecessary tool usage.
    if (sharedTracker.stepsUsedCount >= 2 && sharedTracker.identicalResultStreakCount === 0 && resolvedPlan.classification.category === 'simple') {
      sharedTracker.adapt('shrink', 'task simpler than planned');
    }
  }
}

export async function* streamChatCompletion(
  messages: ChatMessagePayload[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, unknown> {
  assertConfigured();
  yield* streamFinalCompletion(messages, signal);
}

export async function generateConversationSummary(
  history: Array<{ role: string; content: string }>
): Promise<string> {
  assertConfigured();
  const textPrompt = [
    'Summarize this conversation in 2-3 concise sentences.',
    'Capture durable user preferences, key facts, and important open threads only.',
    '',
    ...history.map((m) => `${m.role.toUpperCase()}: ${m.content}`),
  ].join('\n');

  const response = await requestAICredits({
    model: MODEL_ID,
    messages: [{ role: 'user', content: textPrompt }],
    stream: false,
  });
  if (!response.ok) return '';
  const data = await response.json().catch(() => ({}));
  return data?.choices?.[0]?.message?.content || '';
}

export function getConfiguredModelId(): string {
  return MODEL_ID || 'not-configured';
}
