import { searchTavily } from './tavilyService.js';
import { readUrlWithJina } from './jinaService.js';
import { runCodeInDaytona } from './daytonaService.js';
import {
  BudgetTracker,
  clampToolOutput,
  createBudgetForRequest,
  runToolWithTimeout,
  type BudgetPlan,
} from './agentBudget.js';
import type { AgentToolDefinition, AgentToolExecutor } from './aiCredits.js';

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the live web for current facts, recent information, prices, news, documentation, or sources. Use when the answer depends on information that may have changed.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'A focused web search query.' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_url',
      description: 'Read and extract the useful text from a specific public URL supplied by the user or discovered during research.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The full http or https URL to read.' } },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_code',
      description: 'Execute code safely in an isolated Daytona sandbox to test, debug, calculate, compile, or validate code. Never use it for destructive or credential-exfiltration actions.',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: ['python', 'javascript', 'typescript'] },
          code: { type: 'string', description: 'Complete runnable code.' },
        },
        required: ['language', 'code'],
        additionalProperties: false,
      },
    },
  },
];

function normalizeLanguage(value: unknown): 'python' | 'javascript' | 'typescript' {
  const raw = String(value || 'python').toLowerCase();
  if (raw === 'js' || raw === 'javascript') return 'javascript';
  if (raw === 'ts' || raw === 'typescript') return 'typescript';
  return 'python';
}

/** Models often wrap executable code in markdown fences; strip them before sandboxing. */
function stripCodeFences(code: string): string {
  const fence = code.match(/```(?:python|javascript|typescript|js|ts|py)?\s*\n([\s\S]*?)```/i);
  return (fence ? fence[1] : code).trim();
}

/**
 * Raw tool implementations. Callers should normally use createBudgetedToolExecutor()
 * so every call is gated, timed, clamped, and loop-protected by the resource manager.
 */
export const executeAgentTool: AgentToolExecutor = async (name, args) => {
  if (name === 'web_search') {
    const query = String(args.query || '').trim();
    if (!query) return 'No search query was provided.';
    const result = await searchTavily(query);
    if (!result) throw new Error('Live web search failed or is unavailable. Do not claim that live search succeeded.');
    if (!result.results.length) return 'Live web search completed but returned no results.';
    return [
      result.answer ? `Answer: ${result.answer}` : '',
      ...result.results.slice(0, 6).map((r, i) => `Source ${i + 1}: ${r.title}\nURL: ${r.url}\n${r.content}`),
    ].filter(Boolean).join('\n\n').slice(0, 30000);
  }

  if (name === 'read_url') {
    const url = String(args.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return 'Invalid URL. Only http/https URLs are supported.';
    const content = await readUrlWithJina(url);
    if (content == null) throw new Error('Webpage reader failed or is unavailable. Do not claim the page was successfully read.');
    return content.slice(0, 30000) || 'The page was read but contained no extractable text.';
  }

  if (name === 'run_code') {
    const code = stripCodeFences(String(args.code || ''));
    if (!code.trim()) return 'No code was provided.';
    const output = await runCodeInDaytona(code, normalizeLanguage(args.language));
    if (output == null) throw new Error('Code execution failed or the sandbox is unavailable. Do not claim that the code was executed successfully.');
    return output;
  }

  return `Unknown tool: ${name}`;
};

/**
 * SERVER-SIDE RESOURCE-MANAGED EXECUTOR.
 *
 * Every tool invocation passes through the BudgetTracker before it runs:
 *   1. budget/capability gate   -> canCallTool() (also anti-loop protection)
 *   2. per-call timeout         -> runToolWithTimeout(budget.TOOL_TIMEOUT_MS)
 *   3. output clamp             -> clampToolOutput(budget.MAX_TOOL_OUTPUT_SIZE)
 *   4. accounting               -> recordToolCall() updates loop/failure state
 */
export function createBudgetedToolExecutor(plan: BudgetPlan, tracker: BudgetTracker, signal?: AbortSignal): AgentToolExecutor {
  const budget = plan.budget;

  return async (name, args) => {
    // 1. Gate: budget + capability + anti-loop. Blocked calls consume nothing.
    const gate = tracker.canCallTool(name, args);
    if (!gate.allowed) {
      return `Resource manager blocked this tool call: ${gate.reason}. If you already have enough information, answer now; otherwise continue without this call.`;
    }

    // 2. Execute under the per-call timeout and the request-level abort signal.
    const perCallTimeout = Math.min(budget.TOOL_TIMEOUT_MS, tracker.remainingMs > 0 ? tracker.remainingMs : budget.TOOL_TIMEOUT_MS);
    const result = await runToolWithTimeout(async () => {
      if (name === 'web_search') {
        const query = String(args.query || '').trim();
        if (!query) return 'No search query was provided.';
        const searchResult = await searchTavily(query, {
          maxResults: budget.MAX_SEARCH_RESULTS,
          timeoutMs: perCallTimeout,
          searchDepth: plan.classification.category === 'research' && plan.classification.complexity >= 7 ? 'advanced' : 'basic',
        });
        if (!searchResult) throw new Error('Live web search failed or is unavailable. Do not claim that live search succeeded.');
        if (!searchResult.results.length) return 'Live web search completed but returned no results.';
        return [
          searchResult.answer ? `Answer: ${searchResult.answer}` : '',
          ...searchResult.results.slice(0, budget.MAX_SEARCH_RESULTS).map((r, i) => `Source ${i + 1}: ${r.title}\nURL: ${r.url}\n${r.content}`),
        ].filter(Boolean).join('\n\n');
      }

      if (name === 'read_url') {
        const url = String(args.url || '').trim();
        if (!/^https?:\/\//i.test(url)) return 'Invalid URL. Only http/https URLs are supported.';
        const content = await readUrlWithJina(url, { maxChars: budget.MAX_WEBPAGE_SIZE, timeoutMs: perCallTimeout });
        if (content == null) throw new Error('Webpage reader failed or is unavailable. Do not claim the page was successfully read.');
        return content || 'The page was read but contained no extractable text.';
      }

      if (name === 'run_code') {
        const code = stripCodeFences(String(args.code || ''));
        if (!code.trim()) return 'No code was provided.';
        const timeoutSec = Math.floor(budget.MAX_CODE_EXECUTION_TIME_MS / 1000);
        const output = await runCodeInDaytona(code, normalizeLanguage(args.language), { timeoutSec });
        if (output == null) throw new Error('Code execution failed or the sandbox is unavailable. Do not claim that the code was executed successfully.');
        return output;
      }

      return `Unknown tool: ${name}`;
    }, perCallTimeout, name);

    void signal; // request-level abort is enforced by the agent loop + route

    // 3 & 4. Account for the call, then clamp the returned payload.
    tracker.recordToolCall(name, args, result.ok, result.output, result.durationMs);
    return clampToolOutput(result.output, budget);
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
 * non-streaming consumer.
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
