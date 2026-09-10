import { searchTavily } from './tavilyService.js';
import { readUrlWithJina } from './jinaService.js';
import { runCodeInDaytona, runCommandInDaytona, runProjectInDaytona } from './daytonaService.js';
import { stripCodeFences } from './toolRegistry.js';
import type { AgentToolExecutor } from './modelAdapter.js';
import {
  type BudgetPlan,
  BudgetTracker,
  createBudgetForRequest,
  runToolWithTimeout,
  clampToolOutput,
} from './agentBudget.js';
import { TodoManager, summarizeTodosForModel } from './todoManager.js';
import { ProjectStateManager } from './projectState.js';

function normalizeLanguage(value: unknown): 'python' | 'javascript' | 'typescript' {
  const raw = String(value || 'python').toLowerCase().trim();
  if (raw === 'js' || raw === 'javascript' || raw === 'node' || raw === 'nodejs') return 'javascript';
  if (raw === 'ts' || raw === 'typescript') return 'typescript';
  if (raw === 'py' || raw === 'python' || raw === 'python3') return 'python';
  return 'python';
}

/**
 * Raw tool implementations. Callers should normally use createBudgetedToolExecutor()
 * so every call is gated, timed, clamped, and loop-protected by the resource manager.
 *
 * `todoManager` is optional. When provided, todo_write tool calls are routed to it.
 * `projectStateManager` is optional. When provided, file and project state calls are handled.
 */
export function createRawToolExecutor(
  todoManager?: TodoManager,
  projectStateManager?: ProjectStateManager,
): AgentToolExecutor {
  return async (name, args) => {
    if (name === 'todo_write') {
      if (!todoManager) return 'Todo tracking is not available for this request.';
      const todos = Array.isArray(args?.todos) ? args.todos : [];
      const merge = Boolean(args?.merge);
      const updated = todoManager.setTodos(todos, merge);
      return `Todo list updated. ${summarizeTodosForModel(updated)}`;
    }

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

    if (name === 'run_command') {
      const command = String(args.command || '').trim();
      if (!command) return 'No command was provided.';
      const timeoutSec = typeof args.timeoutSec === 'number' ? args.timeoutSec : 30;
      let output: string | null = null;
      if (projectStateManager && Object.keys(projectStateManager.exportManifest()).length > 0) {
        output = await runProjectInDaytona(projectStateManager.exportManifest(), command, { timeoutSec });
      } else {
        output = await runCommandInDaytona(command, { timeoutSec });
      }
      if (output == null) throw new Error('Command execution failed or the sandbox is unavailable.');
      return output;
    }

    if (name === 'file_write') {
      if (!projectStateManager) return 'Project state tracking is not available for this request.';
      const path = String(args.path || '').trim();
      const content = String(args.content || '');
      const purpose = typeof args.purpose === 'string' ? args.purpose : undefined;
      const file = projectStateManager.writeFile(path, content, purpose);
      const pending = projectStateManager.getPendingFiles();
      return `File written: "${file.path}" (${file.size} bytes). ${pending.length ? `Remaining pending files: ${pending.join(', ')}` : 'All planned files now exist.'}`;
    }

    if (name === 'file_read') {
      if (!projectStateManager) return 'Project state tracking is not available for this request.';
      const path = String(args.path || '').trim();
      const file = projectStateManager.readFile(path);
      if (!file) {
        const completed = projectStateManager.getCompletedFiles();
        return `File "${path}" not found in project state. Available files: ${completed.length ? completed.join(', ') : 'none'}`;
      }
      return `[File: ${file.path} | Language: ${file.language} | Size: ${file.size} bytes]\n${file.content}`;
    }

    if (name === 'project_state') {
      if (!projectStateManager) return 'Project state tracking is not available for this request.';
      const action = String(args.action || 'get');
      if (action === 'get') {
        return projectStateManager.summarizeForPrompt();
      }
      if (action === 'update_plan') {
        projectStateManager.updatePlan({
          filesPlanned: Array.isArray(args.filesPlanned) ? args.filesPlanned.map(String) : undefined,
          architectureNotes: typeof args.architectureNotes === 'string' ? args.architectureNotes : undefined,
          framework: typeof args.framework === 'string' ? args.framework : undefined,
          language: typeof args.language === 'string' ? args.language : undefined,
          runtime: typeof args.runtime === 'string' ? args.runtime : undefined,
        });
        return `Plan updated.\n${projectStateManager.summarizeForPrompt()}`;
      }
      if (action === 'record_error') {
        const error = args.error as { file?: string; command?: string; message?: string } | undefined;
        if (error && error.message) {
          projectStateManager.recordError({
            file: error.file,
            command: error.command,
            message: error.message,
          });
          return `Error recorded.\n${projectStateManager.summarizeForPrompt()}`;
        }
        return 'No valid error message provided.';
      }
      if (action === 'record_fix') {
        const fix = args.fix as { errorId?: string; file?: string; description?: string; resolved?: boolean } | undefined;
        if (fix && fix.file && fix.description) {
          projectStateManager.recordFix({
            errorId: fix.errorId,
            file: fix.file,
            description: fix.description,
            resolved: fix.resolved ?? true,
          });
          return `Fix recorded.\n${projectStateManager.summarizeForPrompt()}`;
        }
        return 'Fix requires "file" and "description".';
      }
      if (action === 'record_verification') {
        const v = args.verification as { name?: string; status?: 'passed' | 'failed' | 'warning'; details?: string } | undefined;
        if (v && v.name && v.status) {
          projectStateManager.recordVerification(v.name, v.status, v.details);
          return `Verification recorded: ${v.name} -> ${v.status}`;
        }
        return 'Verification requires "name" and "status".';
      }
      return projectStateManager.summarizeForPrompt();
    }

    return `Unknown tool: ${name}`;
  };
}

/** Backwards-compatible raw executor without todo support. */
export const executeAgentTool: AgentToolExecutor = createRawToolExecutor();

/**
 * SERVER-SIDE RESOURCE-MANAGED EXECUTOR.
 *
 * Every tool invocation passes through the BudgetTracker before it runs:
 *   1. budget/capability gate   -> canCallTool() (also anti-loop protection)
 *   2. per-call timeout         -> runToolWithTimeout(budget.TOOL_TIMEOUT_MS)
 *   3. output clamp             -> clampToolOutput(budget.MAX_TOOL_OUTPUT_SIZE)
 *   4. accounting               -> recordToolCall() updates loop/failure state
 *
 * `todoManager` (optional) wires the todo_write tool to a per-request TodoManager
 * `projectStateManager` (optional) coordinates authoritative multi-file engineering state
 */
export function createBudgetedToolExecutor(
  plan: BudgetPlan,
  tracker: BudgetTracker,
  signal?: AbortSignal,
  todoManager?: TodoManager,
  projectStateManager?: ProjectStateManager,
): AgentToolExecutor {
  const budget = plan.budget;

  return async (name, args) => {
    // 1. Gate: budget + capability + anti-loop. Blocked calls consume nothing.
    const gate = tracker.canCallTool(name, args);
    if (!gate.allowed) {
      return `Resource manager blocked this tool call: ${gate.reason}. If you already have enough information, answer now; otherwise continue without this call.`;
    }

    // Metadata tools (todo_write, project_state, file_write, file_read) run in-memory
    // without remote network latency, but still pass through budget accounting.
    if (name === 'todo_write') {
      if (!todoManager) {
        tracker.recordToolCall(name, args, false, 'todo tracking unavailable', 0);
        return 'Todo tracking is not available for this request.';
      }
      const todos = Array.isArray(args?.todos) ? args.todos : [];
      const merge = Boolean(args?.merge);
      const updated = todoManager.setTodos(todos, merge);
      const summary = summarizeTodosForModel(updated);
      tracker.recordToolCall(name, args, true, summary, 0);
      return clampToolOutput(summary, budget);
    }

    if (name === 'file_write') {
      if (!projectStateManager) {
        tracker.recordToolCall(name, args, false, 'project state tracking unavailable', 0);
        return 'Project state tracking is not available for this request.';
      }
      const path = String(args.path || '').trim();
      const content = String(args.content || '');
      const purpose = typeof args.purpose === 'string' ? args.purpose : undefined;
      const file = projectStateManager.writeFile(path, content, purpose);
      const pending = projectStateManager.getPendingFiles();
      const resultMsg = `File written: "${file.path}" (${file.size} bytes). ${pending.length ? `Remaining pending files: ${pending.join(', ')}` : 'All planned files now exist.'}`;
      tracker.recordToolCall(name, args, true, resultMsg, 0);
      return clampToolOutput(resultMsg, budget);
    }

    if (name === 'file_read') {
      if (!projectStateManager) {
        tracker.recordToolCall(name, args, false, 'project state tracking unavailable', 0);
        return 'Project state tracking is not available for this request.';
      }
      const path = String(args.path || '').trim();
      const file = projectStateManager.readFile(path);
      if (!file) {
        const completed = projectStateManager.getCompletedFiles();
        const msg = `File "${path}" not found. Existing files: ${completed.length ? completed.join(', ') : 'none'}`;
        tracker.recordToolCall(name, args, false, msg, 0);
        return clampToolOutput(msg, budget);
      }
      const output = `[File: ${file.path} | Size: ${file.size} bytes]\n${file.content}`;
      tracker.recordToolCall(name, args, true, output, 0);
      return clampToolOutput(output, budget);
    }

    if (name === 'project_state') {
      if (!projectStateManager) {
        tracker.recordToolCall(name, args, false, 'project state tracking unavailable', 0);
        return 'Project state tracking is not available for this request.';
      }
      const action = String(args.action || 'get');
      let out = '';
      if (action === 'get') {
        out = projectStateManager.summarizeForPrompt();
      } else if (action === 'update_plan') {
        projectStateManager.updatePlan({
          filesPlanned: Array.isArray(args.filesPlanned) ? args.filesPlanned.map(String) : undefined,
          architectureNotes: typeof args.architectureNotes === 'string' ? args.architectureNotes : undefined,
          framework: typeof args.framework === 'string' ? args.framework : undefined,
          language: typeof args.language === 'string' ? args.language : undefined,
          runtime: typeof args.runtime === 'string' ? args.runtime : undefined,
        });
        out = `Plan updated.\n${projectStateManager.summarizeForPrompt()}`;
      } else if (action === 'record_error') {
        const error = args.error as { file?: string; command?: string; message?: string } | undefined;
        if (error && error.message) {
          projectStateManager.recordError({
            file: error.file,
            command: error.command,
            message: error.message,
          });
          out = `Error recorded.\n${projectStateManager.summarizeForPrompt()}`;
        } else {
          out = 'No valid error message provided.';
        }
      } else if (action === 'record_fix') {
        const fix = args.fix as { errorId?: string; file?: string; description?: string; resolved?: boolean } | undefined;
        if (fix && fix.file && fix.description) {
          projectStateManager.recordFix({
            errorId: fix.errorId,
            file: fix.file,
            description: fix.description,
            resolved: fix.resolved ?? true,
          });
          out = `Fix recorded.\n${projectStateManager.summarizeForPrompt()}`;
        } else {
          out = 'Fix requires "file" and "description".';
        }
      } else if (action === 'record_verification') {
        const v = args.verification as { name?: string; status?: 'passed' | 'failed' | 'warning'; details?: string } | undefined;
        if (v && v.name && v.status) {
          projectStateManager.recordVerification(v.name, v.status, v.details);
          out = `Verification recorded: ${v.name} -> ${v.status}`;
        } else {
          out = 'Verification requires "name" and "status".';
        }
      } else {
        out = projectStateManager.summarizeForPrompt();
      }
      tracker.recordToolCall(name, args, true, out, 0);
      return clampToolOutput(out, budget);
    }

    // 2. Execute external tools under the per-call timeout and request-level abort signal.
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

      if (name === 'run_command') {
        const command = String(args.command || '').trim();
        if (!command) return 'No command was provided.';
        const timeoutSec = Math.min(Math.floor(budget.MAX_CODE_EXECUTION_TIME_MS / 1000), 60);
        let output: string | null = null;
        if (projectStateManager && Object.keys(projectStateManager.exportManifest()).length > 0) {
          output = await runProjectInDaytona(projectStateManager.exportManifest(), command, { timeoutSec });
        } else {
          output = await runCommandInDaytona(command, { timeoutSec });
        }
        if (output == null) throw new Error('Command execution failed or the sandbox is unavailable.');
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

export async function buildAgentContext(input: string, explicitWebSearch = false): Promise<AgentContextResult> {
  const plan = createBudgetForRequest(input, explicitWebSearch);
  const diagnostics: Record<string, unknown> = {
    category: plan.classification.category,
    complexity: plan.classification.complexity,
    signals: plan.classification.signals,
    budget: plan.budget,
  };

  if (!plan.useAgent) {
    return {
      category: plan.classification.category,
      complexity: plan.classification.complexity,
      useAgent: false,
      context: null,
      diagnostics,
    };
  }

  const tracker = new BudgetTracker(plan);
  const execute = createBudgetedToolExecutor(plan, tracker);

  const gathered: string[] = [];
  if (plan.forcedFirstTool === 'web_search') {
    try {
      const output = await execute('web_search', { query: input.slice(0, 200) });
      gathered.push(output);
    } catch {
      // Background context gathering is best-effort.
    }
  }

  return {
    category: plan.classification.category,
    complexity: plan.classification.complexity,
    useAgent: true,
    context: gathered.length ? gathered.join('\n\n---\n\n') : null,
    diagnostics: { ...diagnostics, tracker: tracker.snapshot() },
  };
}
