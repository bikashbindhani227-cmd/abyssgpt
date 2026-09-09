import {
  ModelError,
  type ChatMessagePayload,
  type ModelAdapter,
  type AgentToolDefinition,
  type NormalizedToolCall,
  type StreamEvent,
} from './modelAdapter.js';
import { BudgetTracker, createBudgetForRequest, type BudgetPlan } from './agentBudget.js';
import { fenceToolOutput, validateToolArguments } from './toolRegistry.js';

export type AgentToolExecutor = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<string>;
export interface OrchestratorParams {
  adapter: ModelAdapter;
  messages: ChatMessagePayload[];
  tools: AgentToolDefinition[];
  executeTool: AgentToolExecutor;
  plan?: BudgetPlan;
  tracker?: BudgetTracker;
  signal?: AbortSignal;
  forcedFirstTool?: string;
}
export const MAX_CALLS_PER_ROUND = 4;
const MAX_MALFORMED_RECOVERIES = 1;
const TOOL_STATUS_TEXT: Record<string, string> = { web_search: 'Searching the web…', read_url: 'Reading sources…', run_code: 'Running code…' };
function statusForToolCalls(calls: NormalizedToolCall[]): string {
  if (calls.length === 1) return TOOL_STATUS_TEXT[calls[0].name] || 'Running the tool…';
  const names = new Set(calls.map((c) => c.name));
  if (names.size === 1) { const shared = TOOL_STATUS_TEXT[calls[0].name]; if (shared) return shared.replace('…', ` (${calls.length})…`); }
  return `Running ${calls.length} tools in parallel…`;
}
function budgetNudge(tracker: BudgetTracker): ChatMessagePayload {
  return { role: 'system', content: `[RESOURCE BUDGET] Remaining tool calls: ${Math.max(0, tracker.plan.budget.MAX_TOOL_CALLS - tracker.toolCallsUsedCount)}. Remaining reasoning steps: ${Math.max(0, tracker.plan.budget.MAX_AGENT_STEPS - tracker.stepsUsedCount)}. Approximately ${Math.max(0, Math.floor(tracker.remainingMs / 1000))}s left before this request is finalized. If the information gathered so far is sufficient, stop calling tools and answer now. Do not repeat a tool call that already returned the same result or failed.` };
}
function verificationNudge(plan: BudgetPlan): ChatMessagePayload {
  return { role: 'system', content: plan.classification.category === 'coding'
    ? '[VERIFICATION PASS] Before finalizing: if the code has not been executed/tested yet, or a previous run failed and a fix has not been re-tested, make that one tool call now. If everything is already tested and passing, answer immediately.'
    : '[VERIFICATION PASS] Before finalizing: if an important claim still lacks a source or cross-check, make one more search/read now. If the evidence gathered is sufficient, answer immediately.' };
}
interface ToolRoundResult { id: string; content: string; }
interface ToolRoundOutcome { results: ToolRoundResult[]; accounted: number; }

/**
 * The orchestrator validates calls and observes the shared tracker, while the
 * injected executor is the single owner of budget gating/accounting for calls.
 * This is important because chat.ts also uses the same executor for automatic
 * bootstrap tools; counting here as well would consume one budget slot twice.
 */
async function executeToolRound(calls: NormalizedToolCall[], executeTool: AgentToolExecutor, tracker: BudgetTracker, signal?: AbortSignal): Promise<ToolRoundOutcome> {
  const results: ToolRoundResult[] = [];
  const seenFingerprints = new Set<string>();
  const executable: NormalizedToolCall[] = [];
  for (const call of calls) {
    const fp = `${call.name}:${JSON.stringify(call.args)}`;
    if (seenFingerprints.has(fp)) { results.push({ id: call.id, content: 'Duplicate tool call dropped this round.' }); continue; }
    seenFingerprints.add(fp);
    if (executable.length >= MAX_CALLS_PER_ROUND) { results.push({ id: call.id, content: 'Skipped: too many parallel tool calls requested this round.' }); continue; }
    executable.push(call);
  }
  let accounted = 0;
  await Promise.all(executable.map(async (call) => {
    const validation = validateToolArguments(call.name, call.args);
    if (!validation.ok) {
      tracker.recordToolCall(call.name, call.args, false, validation.reason || 'invalid arguments', 0);
      accounted += 1;
      results.push({ id: call.id, content: `Tool call rejected: ${validation.reason}` });
      return;
    }
    const before = tracker.toolCallsUsedCount;
    try {
      const output = await executeTool(call.name, validation.value as Record<string, unknown>, signal);
      const after = tracker.toolCallsUsedCount;
      if (after > before) accounted += after - before;
      results.push({ id: call.id, content: fenceToolOutput(call.name, output) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const after = tracker.toolCallsUsedCount;
      if (after === before) {
        // Defensive compatibility: an executor that throws before accounting
        // must still be represented once in the authoritative tracker.
        tracker.recordToolCall(call.name, validation.value as Record<string, unknown>, false, `Tool failed: ${message}`, 0);
        accounted += 1;
      } else accounted += after - before;
      results.push({ id: call.id, content: `Tool failed: ${message}` });
    }
  }));
  const order = new Map(calls.map((c, i) => [c.id, i]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { results, accounted };
}

export async function* runAgentOrchestration(params: OrchestratorParams): AsyncGenerator<StreamEvent, void, unknown> {
  const { adapter, tools, executeTool, signal, forcedFirstTool } = params;
  if (!tools.length) { yield* adapter.streamCompletion(params.messages, { signal }); return; }
  const resolvedPlan = params.plan || createBudgetForRequest(params.messages.filter((m) => m.role === 'user').slice(-1)[0]?.content || '');
  const tracker = params.tracker || new BudgetTracker(resolvedPlan);
  const working = [...params.messages];
  let expandedOnce = false;
  let malformedRecoveriesUsed = 0;
  let verificationNudged = false;
  while (true) {
    if (signal?.aborted) return;
    const stepGate = tracker.canStartStep();
    if (!stepGate.allowed) { yield { type: 'thinking', text: 'Finishing the answer…' }; yield* adapter.streamCompletion(working, { signal }); return; }
    tracker.recordStep();
    yield { type: 'thinking', text: tracker.stepsUsedCount === 1 ? 'Planning the best approach…' : 'Reviewing tool results…' };
    const planningMessages: ChatMessagePayload[] = [...working];
    if (tracker.stepsUsedCount > 1) planningMessages.push(budgetNudge(tracker));
    if (verificationNudged) { planningMessages.push(verificationNudge(resolvedPlan)); verificationNudged = false; }
    const response = await adapter.generateCompletion(planningMessages, { tools, forcedToolName: tracker.stepsUsedCount === 1 ? forcedFirstTool : undefined, signal });
    const { text, toolCalls } = response;
    if (response.hadMalformedToolCall && toolCalls.every((c) => c.invalid) && toolCalls.length > 0 && malformedRecoveriesUsed < MAX_MALFORMED_RECOVERIES) {
      malformedRecoveriesUsed += 1;
      working.push({ role: 'assistant', content: text || '' });
      working.push({ role: 'user', content: '[SYSTEM VALIDATION] Your previous tool call was malformed (missing fields or invalid JSON arguments). Either retry ONCE with a corrected, properly JSON-encoded tool call, or answer directly with what you already know.' });
      continue;
    }
    const usableCalls = toolCalls.filter((c) => !c.invalid);
    if (!usableCalls.length) { if (text) working.push({ role: 'assistant', content: text }); yield* adapter.streamCompletion(working, { signal }); return; }
    working.push({ role: 'assistant', content: text || '', tool_calls: usableCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })) });
    yield { type: 'thinking', text: statusForToolCalls(usableCalls) };
    const round = await executeToolRound(usableCalls, executeTool, tracker, signal);
    for (const result of round.results) working.push({ role: 'tool', tool_call_id: result.id, content: result.content });
    if (round.accounted === 0) { yield { type: 'thinking', text: 'Wrapping up with the available information…' }; yield* adapter.streamCompletion(working, { signal }); return; }
    const term = tracker.shouldTerminate();
    if (term.terminate) {
      const makingProgress = tracker.identicalResultStreakCount === 0 && term.reason !== 'total request timeout reached';
      if (!expandedOnce && makingProgress && (resolvedPlan.classification.category === 'research' || resolvedPlan.classification.complexity >= 7)) { tracker.adapt('expand', 'complex task in progress'); expandedOnce = true; continue; }
      yield { type: 'thinking', text: 'Finishing the answer…' }; yield* adapter.streamCompletion(working, { signal }); return;
    }
    if (tracker.stepsUsedCount >= 2 && tracker.identicalResultStreakCount === 0 && resolvedPlan.classification.category === 'simple') tracker.adapt('shrink', 'task simpler than planned');
    if (!verificationNudged && (resolvedPlan.classification.category === 'research' || resolvedPlan.classification.category === 'coding') && tracker.stepsUsedCount < tracker.plan.budget.MAX_AGENT_STEPS && tracker.toolCallsUsedCount < tracker.plan.budget.MAX_TOOL_CALLS) verificationNudged = true;
  }
}

export { ModelError };
