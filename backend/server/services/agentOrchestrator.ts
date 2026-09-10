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
import { ProjectStateManager } from './projectState.js';

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
  projectStateManager?: ProjectStateManager;
}
export const MAX_CALLS_PER_ROUND = 4;
const MAX_MALFORMED_RECOVERIES = 1;

const TOOL_STATUS_TEXT: Record<string, string> = {
  web_search: 'Searching the web…',
  read_url: 'Reading sources…',
  run_code: 'Running code in sandbox…',
  run_command: 'Executing command in sandbox…',
  file_write: 'Writing project files…',
  file_read: 'Reading project files…',
  project_state: 'Reviewing project state…',
  todo_write: 'Updating task plan…',
};

function statusForToolCalls(calls: NormalizedToolCall[]): string {
  if (calls.length === 1) {
    const c = calls[0];
    if (c.name === 'file_write' && c.args?.path) return `Writing ${String(c.args.path)}…`;
    if (c.name === 'file_read' && c.args?.path) return `Reading ${String(c.args.path)}…`;
    if (c.name === 'run_command' && c.args?.command) return `Running: ${String(c.args.command).slice(0, 35)}…`;
    return TOOL_STATUS_TEXT[c.name] || 'Running the tool…';
  }
  const names = new Set(calls.map((c) => c.name));
  if (names.size === 1) {
    const shared = TOOL_STATUS_TEXT[calls[0].name];
    if (shared) return shared.replace('…', ` (${calls.length})…`);
  }
  return `Running ${calls.length} tools in parallel…`;
}

function budgetNudge(tracker: BudgetTracker): ChatMessagePayload {
  return {
    role: 'system',
    content: `[RESOURCE BUDGET] Remaining tool calls: ${Math.max(0, tracker.plan.budget.MAX_TOOL_CALLS - tracker.toolCallsUsedCount)}. Remaining reasoning steps: ${Math.max(0, tracker.plan.budget.MAX_AGENT_STEPS - tracker.stepsUsedCount)}. Approximately ${Math.max(0, Math.floor(tracker.remainingMs / 1000))}s left before this request is finalized. If the information gathered so far is sufficient, stop calling tools and answer now. Do not repeat a tool call that already returned the same result or failed.`,
  };
}

function verificationNudge(plan: BudgetPlan, projectStateManager?: ProjectStateManager): ChatMessagePayload {
  if (plan.classification.category === 'coding') {
    const pending = projectStateManager?.getPendingFiles() || [];
    if (pending.length > 0) {
      return {
        role: 'system',
        content: `[IMPLEMENTATION PASS] Planned files remaining to write: ${pending.join(', ')}. Use 'file_write' to complete them before concluding.`,
      };
    }
    return {
      role: 'system',
      content: '[VERIFICATION PASS] Before finalizing: run and test the project in the Daytona sandbox using run_code or run_command. If a previous run failed and a fix has not been re-tested, make that tool call now. If everything is verified and passing, provide the run instructions and finalize.',
    };
  }
  return {
    role: 'system',
    content: '[VERIFICATION PASS] Before finalizing: if an important claim still lacks a source or cross-check, make one more search/read now. If the evidence gathered is sufficient, answer immediately.',
  };
}

interface ToolRoundResult { id: string; content: string; name: string; output: string; hasError: boolean; }
interface ToolRoundOutcome { results: ToolRoundResult[]; accounted: number; errorDetected?: string; }

/**
 * The orchestrator validates and budget-gates calls before invoking the executor.
 */
async function executeToolRound(
  calls: NormalizedToolCall[],
  executeTool: AgentToolExecutor,
  tracker: BudgetTracker,
  projectStateManager?: ProjectStateManager,
  signal?: AbortSignal,
): Promise<ToolRoundOutcome> {
  const results: ToolRoundResult[] = [];
  const seenFingerprints = new Set<string>();
  const executable: NormalizedToolCall[] = [];
  for (const call of calls) {
    const fp = `${call.name}:${JSON.stringify(call.args)}`;
    if (seenFingerprints.has(fp)) {
      results.push({ id: call.id, name: call.name, content: 'Duplicate tool call dropped this round.', output: '', hasError: false });
      continue;
    }
    seenFingerprints.add(fp);
    if (executable.length >= MAX_CALLS_PER_ROUND) {
      results.push({ id: call.id, name: call.name, content: 'Skipped: too many parallel tool calls requested this round.', output: '', hasError: false });
      continue;
    }
    const gate = tracker.canCallTool(call.name, call.args);
    if (!gate.allowed) {
      results.push({ id: call.id, name: call.name, content: `Tool call blocked by resource manager: ${gate.reason}.`, output: '', hasError: false });
      continue;
    }
    executable.push(call);
  }
  let accounted = 0;
  let detectedError: string | undefined;

  await Promise.all(executable.map(async (call) => {
    const validation = validateToolArguments(call.name, call.args);
    if (!validation.ok) {
      tracker.recordToolCall(call.name, call.args, false, validation.reason || 'invalid arguments', 0);
      accounted += 1;
      results.push({ id: call.id, name: call.name, content: `Tool call rejected: ${validation.reason}`, output: '', hasError: true });
      return;
    }
    const before = tracker.toolCallsUsedCount;
    try {
      const output = await executeTool(call.name, validation.value as Record<string, unknown>, signal);
      const after = tracker.toolCallsUsedCount;
      if (after > before) accounted += after - before;
      else {
        tracker.recordToolCall(call.name, validation.value as Record<string, unknown>, true, String(output ?? ''), 0);
        accounted += 1;
      }
      const rawOut = String(output ?? '');
      const isExecutionFailure =
        (call.name === 'run_code' || call.name === 'run_command') &&
        (/(?:exit code:\s*[1-9]|syntaxerror|typeerror|referenceerror|traceback|assertionerror|failed)/i.test(rawOut));

      if (isExecutionFailure) {
        detectedError = rawOut;
        if (projectStateManager) {
          projectStateManager.recordError({
            command: call.name === 'run_command' ? String(call.args?.command || '') : undefined,
            message: rawOut.slice(0, 500),
          });
          projectStateManager.recordTest('failed', rawOut);
        }
      } else if (call.name === 'run_code' || call.name === 'run_command') {
        if (projectStateManager) {
          projectStateManager.recordTest('passed', rawOut);
        }
      }

      results.push({
        id: call.id,
        name: call.name,
        content: fenceToolOutput(call.name, rawOut),
        output: rawOut,
        hasError: isExecutionFailure,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const after = tracker.toolCallsUsedCount;
      if (after === before) {
        tracker.recordToolCall(call.name, validation.value as Record<string, unknown>, false, `Tool failed: ${message}`, 0);
        accounted += 1;
      } else accounted += after - before;
      results.push({ id: call.id, name: call.name, content: `Tool failed: ${message}`, output: message, hasError: true });
      detectedError = message;
    }
  }));

  const order = new Map(calls.map((c, i) => [c.id, i]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { results, accounted, errorDetected: detectedError };
}

export async function* runAgentOrchestration(params: OrchestratorParams): AsyncGenerator<StreamEvent, void, unknown> {
  const { adapter, tools, executeTool, signal, projectStateManager } = params;
  if (!tools.length) { yield* adapter.streamCompletion(params.messages, { signal }); return; }
  const resolvedPlan = params.plan || createBudgetForRequest(params.messages.filter((m) => m.role === 'user').slice(-1)[0]?.content || '');
  const tracker = params.tracker || new BudgetTracker(resolvedPlan);
  const working = [...params.messages];
  const forcedFirstTool = params.forcedFirstTool ?? resolvedPlan.forcedFirstTool;
  let expandedOnce = false;
  let malformedRecoveriesUsed = 0;
  let verificationNudged = false;
  let pendingErrorNudge: string | undefined;

  while (true) {
    if (signal?.aborted) return;
    const stepGate = tracker.canStartStep();
    if (!stepGate.allowed) { yield { type: 'thinking', text: 'Finishing the answer…' }; yield* adapter.streamCompletion(working, { signal }); return; }
    tracker.recordStep();
    yield { type: 'thinking', text: tracker.stepsUsedCount === 1 ? 'Planning the best approach…' : 'Reviewing tool results…' };
    const planningMessages: ChatMessagePayload[] = [...working];
    if (tracker.stepsUsedCount > 1) planningMessages.push(budgetNudge(tracker));
    if (projectStateManager && tracker.stepsUsedCount > 1 && projectStateManager.getCompletedFiles().length > 0) {
      planningMessages.push({ role: 'system', content: projectStateManager.summarizeForPrompt() });
    }
    if (pendingErrorNudge) {
      planningMessages.push({
        role: 'system',
        content: `[ERROR-DRIVEN FIX REQUIRED] The previous test/build execution failed:\n${pendingErrorNudge.slice(0, 1000)}\nAnalyze the error, locate the affected file, write the fix using 'file_write', and re-run verification.`,
      });
      pendingErrorNudge = undefined;
    }
    if (verificationNudged) {
      planningMessages.push(verificationNudge(resolvedPlan, projectStateManager));
      verificationNudged = false;
    }

    const response = await adapter.generateCompletion(planningMessages, {
      tools,
      forcedToolName: tracker.stepsUsedCount === 1 ? forcedFirstTool : undefined,
      signal,
    });
    const { text, toolCalls } = response;
    if (response.hadMalformedToolCall && toolCalls.every((c) => c.invalid) && toolCalls.length > 0 && malformedRecoveriesUsed < MAX_MALFORMED_RECOVERIES) {
      malformedRecoveriesUsed += 1;
      working.push({ role: 'assistant', content: text || '' });
      working.push({ role: 'user', content: '[SYSTEM VALIDATION] Your previous tool call was malformed (missing fields or invalid JSON arguments). Either retry ONCE with a corrected, properly JSON-encoded tool call, or answer directly with what you already know.' });
      continue;
    }
    const usableCalls = toolCalls.filter((c) => !c.invalid);
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
    const round = await executeToolRound(usableCalls, executeTool, tracker, projectStateManager, signal);
    for (const result of round.results) {
      working.push({ role: 'tool', tool_call_id: result.id, content: result.content });
    }
    if (round.errorDetected) {
      pendingErrorNudge = round.errorDetected;
    }

    if (round.accounted === 0) {
      yield { type: 'thinking', text: 'Wrapping up with the available information…' };
      yield* adapter.streamCompletion(working, { signal });
      return;
    }

    const term = tracker.shouldTerminate();
    if (term.terminate) {
      const makingProgress = tracker.identicalResultStreakCount === 0 && term.reason !== 'total request timeout reached';
      if (!expandedOnce && makingProgress && (resolvedPlan.classification.category === 'research' || resolvedPlan.classification.complexity >= 7)) {
        tracker.adapt('expand', 'complex task in progress');
        expandedOnce = true;
        continue;
      }
      yield { type: 'thinking', text: 'Finishing the answer…' };
      yield* adapter.streamCompletion(working, { signal });
      return;
    }

    if (tracker.stepsUsedCount >= 2 && tracker.identicalResultStreakCount === 0 && resolvedPlan.classification.category === 'simple') {
      tracker.adapt('shrink', 'task simpler than planned');
    }
    if (!verificationNudged && (resolvedPlan.classification.category === 'research' || resolvedPlan.classification.category === 'coding') && tracker.stepsUsedCount < tracker.plan.budget.MAX_AGENT_STEPS && tracker.toolCallsUsedCount < tracker.plan.budget.MAX_TOOL_CALLS) {
      verificationNudged = true;
    }
  }
}

export { ModelError };
