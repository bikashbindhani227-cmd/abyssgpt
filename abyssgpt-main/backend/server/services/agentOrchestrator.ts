/**
 * AbyssGPT — Agent Orchestrator
 * ==============================
 *
 * The PERMANENT system capability. The model is replaceable intelligence; this
 * loop is not tied to any model and never inspects the model's identity.
 *
 *   AGENT ORCHESTRATOR
 *     ↓ budget gate (BudgetTracker — server authority)
 *     ↓ adapter.generateCompletion()   <- normalized for ANY model
 *     ├── FINAL ANSWER  → adapter.streamCompletion()
 *     └── TOOL CALLS    → validate → execute (parallel, budgeted)
 *                          ↓ observation back to the model
 *                          ↓ next action … (multi-iteration)
 *     ↓ verification pass (when useful & budget allows)
 *     ↓ FINAL ANSWER
 *
 * Guarantees:
 *  - Every round is gated by the shared BudgetTracker (steps, calls, time).
 *  - Model-emitted tool calls are normalized + validated server-side.
 *  - Malformed responses trigger ONE bounded recovery, never a crash.
 *  - Tool output is fenced as untrusted data before returning to any model.
 *  - Loop protection + early termination are enforced by the tracker.
 *  - User-facing status events are honest and generic (never fake reasoning,
 *    never provider/model names, never raw tool payloads).
 */

import {
  ModelError,
  type ChatMessagePayload,
  type ModelAdapter,
  type AgentToolDefinition,
  type NormalizedToolCall,
  type StreamEvent,
} from './modelAdapter.js';
import {
  BudgetTracker,
  createBudgetForRequest,
  type BudgetPlan,
} from './agentBudget.js';
import { fenceToolOutput, validateToolArguments } from './toolRegistry.js';

export type AgentToolExecutor = (
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<string>;

/**
 * The executor handed to the orchestrator performs VALIDATION + TIMED,
 * CLAMPED EXECUTION ONLY (see createUntrackedToolExecutor). Gating, loop
 * protection, accounting, and untrusted-data fencing are owned HERE so the
 * loop is self-sufficient and can never be desynchronized from the tracker.
 */
export interface OrchestratorParams {
  adapter: ModelAdapter;
  messages: ChatMessagePayload[];
  tools: AgentToolDefinition[];
  executeTool: AgentToolExecutor;
  /** Server-planned budget. Derived automatically when omitted. */
  plan?: BudgetPlan;
  /** Shared tracker: the SAME instance must gate executor + loop. */
  tracker?: BudgetTracker;
  signal?: AbortSignal;
  /** Protocol-level forced first tool (planner decision). */
  forcedFirstTool?: string;
}

/** Upper bound on tool calls executed in parallel within one round. */
export const MAX_CALLS_PER_ROUND = 4;
/** How many times the loop may ask the model to repair a malformed response. */
const MAX_MALFORMED_RECOVERIES = 1;

/** Honest, tool-specific status lines (spec §22 — never fake reasoning). */
const TOOL_STATUS_TEXT: Record<string, string> = {
  web_search: 'Searching the web…',
  read_url: 'Reading sources…',
  run_code: 'Running code…',
};

function statusForToolCalls(calls: NormalizedToolCall[]): string {
  if (calls.length === 1) {
    return TOOL_STATUS_TEXT[calls[0].name] || 'Running the tool…';
  }
  const names = new Set(calls.map((c) => c.name));
  if (names.size === 1) {
    const shared = TOOL_STATUS_TEXT[calls[0].name];
    if (shared) return shared.replace('…', ` (${calls.length})…`);
  }
  return `Running ${calls.length} tools in parallel…`;
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

/** One-shot verification nudge injected right before the model finalizes. */
function verificationNudge(plan: BudgetPlan): ChatMessagePayload {
  const coding = plan.classification.category === 'coding';
  return {
    role: 'system',
    content: coding
      ? '[VERIFICATION PASS] Before finalizing: if the code has not been executed/tested yet, or a previous run failed and a fix has not been re-tested, make that one tool call now. If everything is already tested and passing, answer immediately.'
      : '[VERIFICATION PASS] Before finalizing: if an important claim still lacks a source or cross-check, make one more search/read now. If the evidence gathered is sufficient, answer immediately.',
  };
}

interface ToolRoundResult {
  id: string;
  content: string;
}

interface ToolRoundOutcome {
  results: ToolRoundResult[];
  /** How many calls were actually accounted against the budget this round. */
  accounted: number;
}

/**
 * Execute one round of tool calls with full protocol consistency: EVERY tool
 * call id emitted by the assistant receives exactly one tool-role response
 * (executed, dropped, duplicate, or invalid) so any provider stays coherent.
 *
 * The round owns budget gating, accounting, and untrusted-output fencing —
 * the tracker can never drift from what the loop actually did.
 */
async function executeToolRound(
  calls: NormalizedToolCall[],
  executeTool: AgentToolExecutor,
  tracker: BudgetTracker,
  signal?: AbortSignal,
): Promise<ToolRoundOutcome> {
  const results: ToolRoundResult[] = [];
  const seenFingerprints = new Set<string>();
  const executable: NormalizedToolCall[] = [];

  for (const call of calls) {
    const fp = `${call.name}:${JSON.stringify(call.args)}`;
    if (seenFingerprints.has(fp)) {
      results.push({ id: call.id, content: 'Duplicate tool call dropped this round.' });
      continue;
    }
    seenFingerprints.add(fp);
    if (executable.length >= MAX_CALLS_PER_ROUND) {
      results.push({ id: call.id, content: 'Skipped: too many parallel tool calls requested this round.' });
      continue;
    }
    executable.push(call);
  }

  let accounted = 0;

  await Promise.all(executable.map(async (call) => {
    // 1. Validate the model-generated arguments before anything runs.
    const validation = validateToolArguments(call.name, call.args);
    if (!validation.ok) {
      // A malformed call wasted the model's turn — account it as a failure
      // so repeated malformed output triggers failure-based termination.
      tracker.recordToolCall(call.name, call.args, false, validation.reason || 'invalid arguments', 0);
      accounted += 1;
      results.push({ id: call.id, content: `Tool call rejected: ${validation.reason}` });
      return;
    }
    const safeArgs = validation.value as Record<string, unknown>;

    // 2. Budget/capability/anti-loop gate. Blocked calls consume nothing.
    const gate = tracker.canCallTool(call.name, safeArgs);
    if (!gate.allowed) {
      results.push({
        id: call.id,
        content: `Resource manager blocked this tool call: ${gate.reason}. If you already have enough information, answer now; otherwise continue without this call.`,
      });
      return;
    }

    // 3. Execute under the executor's timeout/clamp handling.
    try {
      const output = await executeTool(call.name, safeArgs, signal);
      tracker.recordToolCall(call.name, safeArgs, true, output, 0);
      accounted += 1;
      // 4. External output is DATA, never instructions — fence it.
      results.push({ id: call.id, content: fenceToolOutput(call.name, output) });
    } catch (error) {
      // Tool failures are honest, bounded results — never request crashes.
      const message = error instanceof Error ? error.message : String(error);
      tracker.recordToolCall(call.name, safeArgs, false, `Tool failed: ${message}`, 0);
      accounted += 1;
      results.push({ id: call.id, content: `Tool failed: ${message}` });
    }
  }));

  // Preserve the assistant's original call order for coherent conversations.
  const order = new Map(calls.map((c, i) => [c.id, i]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { results, accounted };
}

/**
 * Run the full agentic loop. Yields StreamEvents; the caller forwards them to
 * the SSE client. Throws ModelError only when no controlled continuation is
 * possible (config missing / network dead after retries) — the route converts
 * that into a safe user-facing error.
 */
export async function* runAgentOrchestration(params: OrchestratorParams): AsyncGenerator<StreamEvent, void, unknown> {
  const { adapter, tools, executeTool, signal, forcedFirstTool } = params;

  if (!tools.length) {
    // Nothing to orchestrate — plain streaming completion.
    yield* adapter.streamCompletion(params.messages, { signal });
    return;
  }

  // The plan/tracker come from the server planner; derive locally when absent.
  // The tracker MUST be the same instance the tool executor uses.
  const resolvedPlan = params.plan
    || createBudgetForRequest(params.messages.filter((m) => m.role === 'user').slice(-1)[0]?.content || '');
  const tracker = params.tracker || new BudgetTracker(resolvedPlan);

  const working = [...params.messages];
  let expandedOnce = false;
  let malformedRecoveriesUsed = 0;
  let verificationNudged = false;

  while (true) {
    if (signal?.aborted) return;

    // ---- budget gate before every reasoning step --------------------------
    const stepGate = tracker.canStartStep();
    if (!stepGate.allowed) {
      yield { type: 'thinking', text: 'Finishing the answer…' };
      yield* adapter.streamCompletion(working, { signal });
      return;
    }
    tracker.recordStep();

    yield {
      type: 'thinking',
      text: tracker.stepsUsedCount === 1 ? 'Planning the best approach…' : 'Reviewing tool results…',
    };

    // Inject the live budget nudge only into the model-visible payload.
    const planningMessages: ChatMessagePayload[] = [...working];
    if (tracker.stepsUsedCount > 1) planningMessages.push(budgetNudge(tracker));
    if (verificationNudged) {
      planningMessages.push(verificationNudge(resolvedPlan));
      verificationNudged = false;
    }

    const response = await adapter.generateCompletion(planningMessages, {
      tools,
      forcedToolName: tracker.stepsUsedCount === 1 ? forcedFirstTool : undefined,
      signal,
    });

    // ---- controlled model-failure handling (spec §20) ---------------------
    // generateCompletion throws ModelError for unrecoverable failures; empty
    // content with no tool calls is a valid "I'm done / can't help" signal and
    // is handled by the final-answer branch below.

    const { text, toolCalls } = response;

    // Malformed tool calling with no salvageable call: ONE bounded recovery.
    if (response.hadMalformedToolCall && toolCalls.every((c) => c.invalid) && toolCalls.length > 0
      && malformedRecoveriesUsed < MAX_MALFORMED_RECOVERIES) {
      malformedRecoveriesUsed += 1;
      working.push({ role: 'assistant', content: text || '' });
      working.push({
        role: 'user',
        content:
          '[SYSTEM VALIDATION] Your previous tool call was malformed (missing fields or invalid JSON arguments). Either retry ONCE with a corrected, properly JSON-encoded tool call, or answer directly with what you already know.',
      });
      continue;
    }

    const usableCalls = toolCalls.filter((c) => !c.invalid);

    // No (usable) tool calls => the model is done with tools. Finalize.
    if (!usableCalls.length) {
      if (text) working.push({ role: 'assistant', content: text });
      yield* adapter.streamCompletion(working, { signal });
      return;
    }

    working.push({
      role: 'assistant',
      content: text || '',
      tool_calls: usableCalls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    });

    yield { type: 'thinking', text: statusForToolCalls(usableCalls) };

    const round = await executeToolRound(usableCalls, executeTool, tracker, signal);
    for (const result of round.results) {
      working.push({ role: 'tool', tool_call_id: result.id, content: result.content });
    }

    // ---- post-execution budget evaluation ---------------------------------
    if (round.accounted === 0) {
      // Every call was dropped/duplicated/blocked — nothing new happened this
      // round. Treat as a no-progress round and finalize with what we have.
      yield { type: 'thinking', text: 'Wrapping up with the available information…' };
      yield* adapter.streamCompletion(working, { signal });
      return;
    }

    const term = tracker.shouldTerminate();
    if (term.terminate) {
      // Budget adaptation: ONE controlled expansion for genuinely complex
      // research still making progress — always clamped below hard ceilings.
      const makingProgress =
        tracker.identicalResultStreakCount === 0 &&
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
      yield* adapter.streamCompletion(working, { signal });
      return;
    }

    // Task turned out simpler than planned: shrink remaining budget so later
    // rounds cannot drift into unnecessary tool usage.
    if (
      tracker.stepsUsedCount >= 2 &&
      tracker.identicalResultStreakCount === 0 &&
      resolvedPlan.classification.category === 'simple'
    ) {
      tracker.adapt('shrink', 'task simpler than planned');
    }

    // Schedule the one-shot verification pass for tool-using research/coding
    // rounds when the remaining budget can still afford it.
    if (
      !verificationNudged &&
      (resolvedPlan.classification.category === 'research' || resolvedPlan.classification.category === 'coding') &&
      tracker.stepsUsedCount < tracker.plan.budget.MAX_AGENT_STEPS &&
      tracker.toolCallsUsedCount < tracker.plan.budget.MAX_TOOL_CALLS
    ) {
      verificationNudged = true;
    }
  }
}

export { ModelError };
