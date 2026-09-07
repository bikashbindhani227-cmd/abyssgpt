import { searchTavily } from './tavilyService.js';
import { readUrlWithJina } from './jinaService.js';
import { runCodeInDaytona } from './daytonaService.js';
import {
  ABSOLUTE_CEILING_BOUNDS,
  BudgetTracker,
  clampToolOutput,
  createBudgetForRequest,
  runToolWithTimeout,
  type BudgetPlan,
} from './agentBudget.js';
import type { AgentToolExecutor } from './aiCredits.js';
import {
  AGENT_TOOLS,
  fenceToolOutput,
  validateToolArguments,
} from './toolRegistry.js';

// Tool schemas live in the Tool Registry; re-exported for API stability.
export { AGENT_TOOLS };
export { stripCodeFences } from './toolRegistry.js';

/**
 * UNTRACKED TOOL EXECUTOR (used by the Agent Orchestrator).
 *
 * Performs argument validation, per-call timeout, and output clamping ONLY.
 * Gating, accounting, and fencing are owned by the orchestrator's round
 * executor so the shared BudgetTracker can never drift from the loop.
 */
export function createUntrackedToolExecutor(plan: BudgetPlan, signal?: AbortSignal): AgentToolExecutor {
  const budget = plan.budget;

  return async (name, args) => {
    // 1. Validate the model-generated arguments BEFORE anything runs.
    const validation = validateToolArguments(name, args);
    if (!validation.ok) {
      return `Tool call rejected: ${validation.reason}. Fix the arguments or answer without this call.`;
    }
    const safeArgs = validation.value as Record<string, unknown>;

    // 2. Execute under the per-call timeout and output budget.
    const perCallTimeout = Math.min(budget.TOOL_TIMEOUT_MS, ABSOLUTE_CEILING_BOUNDS.TOOL_TIMEOUT_MS);
    const result = await runToolWithTimeout(async () => {
      if (name === 'web_search') {
        const searchResult = await searchTavily(String(safeArgs.query), {
          maxResults: budget.MAX_SEARCH_RESULTS,
          timeoutMs: perCallTimeout,
          searchDepth: plan.classification.category === 'research' && plan.classification.complexity >= 7 ? 'advanced' : 'basic',
        });
        if (!searchResult?.results?.length) return 'No web results were available. Continue without web grounding.';
        return [
          searchResult.answer ? `Answer: ${searchResult.answer}` : '',
          ...searchResult.results.slice(0, budget.MAX_SEARCH_RESULTS).map((r, i) => `Source ${i + 1}: ${r.title}\nURL: ${r.url}\n${r.content}`),
        ].filter(Boolean).join('\n\n');
      }

      if (name === 'read_url') {
        const content = await readUrlWithJina(String(safeArgs.url), { maxChars: budget.MAX_WEBPAGE_SIZE, timeoutMs: perCallTimeout });
        return content || 'Unable to read this URL.';
      }

      if (name === 'run_code') {
        const timeoutSec = Math.floor(budget.MAX_CODE_EXECUTION_TIME_MS / 1000);
        const output = await runCodeInDaytona(
          String(safeArgs.code),
          safeArgs.language as 'python' | 'javascript' | 'typescript',
          { timeoutSec },
        );
        return output ?? 'Code execution is unavailable because the sandbox service is not configured or failed.';
      }

      return `Unknown tool: ${name}`;
    }, perCallTimeout, name);

    void signal; // request-level abort is enforced by the agent loop + route

    // runToolWithTimeout already wraps failures as "Tool failed: …".
    return result.ok ? clampToolOutput(result.output, budget) : result.output;
  };
}

/**
 * FULL-STACK RESOURCE-MANAGED EXECUTOR (for NON-orchestrator consumers such
 * as the Trigger.dev background context builder).
 *
 * Every tool invocation passes through:
 *   1. argument validation      -> validateToolArguments() (registry, strict)
 *   2. budget/capability gate   -> tracker.canCallTool() (also anti-loop)
 *   3. per-call timeout         -> runToolWithTimeout(budget.TOOL_TIMEOUT_MS)
 *   4. output clamp             -> clampToolOutput(budget.MAX_TOOL_OUTPUT_SIZE)
 *   5. untrusted-data fencing   -> fenceToolOutput() (data never = instructions)
 *   6. accounting               -> tracker.recordToolCall() (loop/failure state)
 *
 * Do NOT pass this into runAgentOrchestration — the orchestrator gates and
 * accounts itself; double accounting would corrupt the budget.
 */
export function createBudgetedToolExecutor(plan: BudgetPlan, tracker: BudgetTracker, signal?: AbortSignal): AgentToolExecutor {
  const untracked = createUntrackedToolExecutor(plan, signal);

  return async (name, args) => {
    // 1. Validate (cheap; mirrors the orchestrator's own first check).
    const validation = validateToolArguments(name, args);
    if (!validation.ok) {
      tracker.recordToolCall(name, args, false, validation.reason || 'invalid arguments', 0);
      return `Tool call rejected: ${validation.reason}. Fix the arguments or answer without this call.`;
    }
    const safeArgs = validation.value as Record<string, unknown>;

    // 2. Gate: budget + capability + anti-loop. Blocked calls consume nothing.
    const gate = tracker.canCallTool(name, safeArgs);
    if (!gate.allowed) {
      return `Resource manager blocked this tool call: ${gate.reason}. If you already have enough information, answer now; otherwise continue without this call.`;
    }

    // 3–4. Timed, clamped execution.
    const output = await untracked(name, safeArgs, signal);
    const failed = output.startsWith('Tool failed:');

    // 5–6. Fence as untrusted data, then account for the call.
    tracker.recordToolCall(name, safeArgs, !failed, output, 0);
    return fenceToolOutput(name, output);
  };
}

// ---------------------------------------------------------------------------
// Lightweight gating helpers (kept for backward compatibility)
// ---------------------------------------------------------------------------

export function shouldUseWebSearch(input: string, explicitWebSearch = false): boolean {
  return createBudgetForRequest(input, explicitWebSearch).webSearchEnabled;
}

export function shouldUseAgentTools(input: string, explicitWebSearch = false): boolean {
  return createBudgetForRequest(input, explicitWebSearch).useAgent;
}

// ---------------------------------------------------------------------------
// Background-agent context builder (used by Trigger.dev background tasks)
// ---------------------------------------------------------------------------

export interface AgentContextResult {
  category: string;
  complexity: number;
  useAgent: boolean;
  context: string | null;
  diagnostics: Record<string, unknown>;
}

/**
 * Classify a prompt, plan a budget, and (optionally) gather tool context under
 * full resource management. Used by background agent jobs and available to any
 * non-streaming consumer. Payload-safe: only stable serializable primitives
 * are returned (Trigger.dev deterministic-argument compatible).
 */
export async function buildAgentContext(prompt: string, allowTools = true): Promise<AgentContextResult> {
  const plan = createBudgetForRequest(prompt);
  const tracker = new BudgetTracker(plan);
  let context: string | null = null;

  if (allowTools && plan.useAgent) {
    const executor = createBudgetedToolExecutor(plan, tracker);
    const gathered: string[] = [];

    // Focused single searches/reads driven by the classification, not the model.
    if (plan.webSearchEnabled) {
      const query = prompt.replace(/\s+/g, ' ').trim().slice(0, 180);
      if (tracker.canCallTool('web_search', { query }).allowed) {
        const res = await executor('web_search', { query });
        tracker.recordStep();
        gathered.push(`[web_search] ${res}`);
      }
    }

    const urls = prompt.match(/\bhttps?:\/\/[^\s<>"')]+/g) || [];
    for (const url of urls.slice(0, 3)) {
      if (!tracker.canCallTool('read_url', { url }).allowed) break;
      const res = await executor('read_url', { url });
      tracker.recordStep();
      gathered.push(`[read_url ${url}] ${res}`);
      if (gathered.join('').length > plan.budget.MAX_TOOL_OUTPUT_SIZE) break;
    }

    if (gathered.length) {
      context = gathered.join('\n\n').slice(0, plan.budget.MAX_TOOL_OUTPUT_SIZE);
    }
  }

  return {
    category: plan.classification.category,
    complexity: plan.classification.complexity,
    useAgent: plan.useAgent,
    context,
    diagnostics: tracker.snapshot(),
  };
}
