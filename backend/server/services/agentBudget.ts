import { createHash } from 'crypto';

export const ABSOLUTE_CEILING_BOUNDS = {
  MAX_AGENT_STEPS: 24,
  MAX_TOOL_CALLS: 40,
  MAX_TOOL_OUTPUT_SIZE: 60000,
  TOOL_TIMEOUT_MS: 90000,
  TOTAL_AGENT_TIMEOUT_MS: 300000,
  MAX_SEARCH_RESULTS: 10,
  MAX_WEBPAGE_SIZE: 80000,
  MAX_CODE_EXECUTION_TIME_MS: 120000,
} as const;

function envInt(name: string, fallback: number, absoluteMax: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), absoluteMax);
}

export interface ServerCeilings {
  MAX_AGENT_STEPS: number;
  MAX_TOOL_CALLS: number;
  MAX_TOOL_OUTPUT_SIZE: number;
  TOOL_TIMEOUT_MS: number;
  TOTAL_AGENT_TIMEOUT_MS: number;
  MAX_SEARCH_RESULTS: number;
  MAX_WEBPAGE_SIZE: number;
  MAX_CODE_EXECUTION_TIME_MS: number;
}

export function getServerCeilings(): ServerCeilings {
  return {
    MAX_AGENT_STEPS: envInt('MAX_AGENT_STEPS', 12, ABSOLUTE_CEILING_BOUNDS.MAX_AGENT_STEPS),
    MAX_TOOL_CALLS: envInt('MAX_TOOL_CALLS', 16, ABSOLUTE_CEILING_BOUNDS.MAX_TOOL_CALLS),
    MAX_TOOL_OUTPUT_SIZE: envInt('MAX_TOOL_OUTPUT_SIZE', 30000, ABSOLUTE_CEILING_BOUNDS.MAX_TOOL_OUTPUT_SIZE),
    TOOL_TIMEOUT_MS: envInt('TOOL_TIMEOUT_MS', 45000, ABSOLUTE_CEILING_BOUNDS.TOOL_TIMEOUT_MS),
    TOTAL_AGENT_TIMEOUT_MS: envInt('TOTAL_AGENT_TIMEOUT_MS', 180000, ABSOLUTE_CEILING_BOUNDS.TOTAL_AGENT_TIMEOUT_MS),
    MAX_SEARCH_RESULTS: envInt('MAX_SEARCH_RESULTS', 8, ABSOLUTE_CEILING_BOUNDS.MAX_SEARCH_RESULTS),
    MAX_WEBPAGE_SIZE: envInt('MAX_WEBPAGE_SIZE', 50000, ABSOLUTE_CEILING_BOUNDS.MAX_WEBPAGE_SIZE),
    MAX_CODE_EXECUTION_TIME_MS: envInt('MAX_CODE_EXECUTION_TIME_MS', 60000, ABSOLUTE_CEILING_BOUNDS.MAX_CODE_EXECUTION_TIME_MS),
  };
}

function clamp(value: number, ceiling: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), ceiling);
}

export type TaskCategory = 'simple' | 'current_info' | 'research' | 'coding';
export interface TaskClassification {
  category: TaskCategory;
  complexity: number;
  needsWebSearch: boolean;
  needsCodeExecution: boolean;
  signals: string[];
}

const CURRENT_INFO_RE = /\b(latest|today|current|currently|right now|news|breaking|price|prices|cost|weather|forecast|who won|release(?:d)? date|update[d]?|202[4-9]\s*[--/]\s*20[2-9]\d|this (?:week|month|year)|stock|exchange rate|score|live|trending|search(?: for| the web for)?|look\s*up|google|internet|online)\b/i;
const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/gi;
const RESEARCH_RE = /\b(compare|comparison|versus|\bvs\.?\b|pros and cons|research|analyze|analyse|evaluate|market analysis|literature|state of the art|survey|benchmarks?)\b/i;
const DEPTH_RE = /\b(in[- ]depth|deep dive|comprehensive|thorough|detailed|extensive|exhaustive|complete report|full report)\b/i;
const MULTIPART_RE = /(\?\s*\S+\?|\b(?:and also|additionally|as well as|furthermore|moreover|first.{0,40}(?:then|second|next))\b)/i;
const CODING_RE = /\b(debug|stack ?trace|traceback|exception|error message|fix (?:this|my|the) (?:code|bug|error|function|script)|run (?:this|my|the) (?:code|script|program)|execute|compile|unit ?test|code review|refactor|optimi[sz]e (?:this|my|the) (?:code|query|function)|syntax error|typeerror|referenceerror|nullpointer|segfault|why (?:is|does) my (?:code|script|program))\b/i;
const PROJECT_GENERATION_RE = /(?:\b(?:build|create|generate|develop|make|implement|code|write|design)\b[\s\S]{0,160}\b(?:complete|entire|full[- ]stack|production[- ]ready|whole|all required|source code|project|application|app|website|files|bot|dashboard|service|api|cli|tool|saas|backend|frontend)\b|\bfull[- ]stack\b|\bentire project\b|\ball required files\b|\bcomplete source code\b|\bgenerate the (?:entire|complete|whole) (?:project|application|app|website|source code)\b|\bproduction[- ]ready (?:full[- ]stack|application|app|website|project)\b)/i;
const SOFTWARE_ENGINEERING_RE = /\b(telegram bot|discord bot|\bbot\b|rest api|graphql api|\bapi\b|backend service|\bbackend\b|admin dashboard|\bdashboard\b|saas|\bcli\b|automation tool|full[- ]stack|web application|crud|sqlite|postgres|fastapi|express|flask|django|react|vite|next\.?js|dockerfile)\b/i;
const CODE_FENCE_RE = /```[\s\S]+```/;
const MATH_RE = /\b(calculate|compute|solve|equation|derivative|integral|matrix|probability|factorial|percentage|sqrt|log\b)/i;
const TRIVIAL_RE = /^\s*(hi|hello|hey|yo|sup|thanks|thank you|thx|ok|okay|cool|nice|great|good (?:morning|afternoon|evening)|how are you|what'?s up|bye|goodbye)\b[\s!.?]*$/i;
const SIMPLE_DEF_RE = /^\s*(what is|what are|who is|who was|define|meaning of|explain (?:what|how)|how do (?:i|you)|can you tell me)\b[\s\S]{0,220}\??\s*$/i;

export function classifyRequest(message: string, explicitWebSearch = false): TaskClassification {
  const text = message.trim();
  const signals: string[] = [];
  let complexity = 2;
  let needsWebSearch = false;
  let needsCodeExecution = false;
  const urls = text.match(URL_RE) || [];
  if (explicitWebSearch) { needsWebSearch = true; signals.push('explicit_web_search'); complexity += 1; }
  const hasFence = CODE_FENCE_RE.test(text);
  const isProjectGeneration = PROJECT_GENERATION_RE.test(text) || (SOFTWARE_ENGINEERING_RE.test(text) && /\b(build|create|develop|make|generate|implement|code|write|setup|add)\b/i.test(text));
  if (isProjectGeneration || CODING_RE.test(text)) {
    needsCodeExecution = true;
    signals.push(isProjectGeneration ? 'full_project_generation' : 'coding_or_debug');
    complexity += isProjectGeneration ? 4 : 2;
  }
  if (hasFence) { needsCodeExecution = true; signals.push('code_block_present'); complexity += 1; }
  if (MATH_RE.test(text) && text.length < 400) { signals.push('computation'); needsCodeExecution = true; complexity += 1; }
  if (CURRENT_INFO_RE.test(text)) { needsWebSearch = true; signals.push('current_info_topic'); complexity += 1; }
  if (urls.length > 0) { needsWebSearch = true; signals.push(`urls_present(${urls.length})`); complexity += urls.length > 2 ? 2 : 1; }
  let researchHits = 0;
  if (RESEARCH_RE.test(text)) { researchHits += 1; signals.push('research_depth'); }
  if (DEPTH_RE.test(text)) { researchHits += 1; signals.push('depth_request'); }
  if (MULTIPART_RE.test(text)) { researchHits += 1; signals.push('multi_part'); }
  if (text.length > 600) { researchHits += 1; signals.push('long_message'); }
  else if (text.length > 280) { researchHits += 1; signals.push('medium_message'); complexity += 1; }
  if (researchHits >= 2) complexity += Math.min(researchHits + 1, 4);
  else if (researchHits === 1) complexity += 1;
  if (TRIVIAL_RE.test(text)) { signals.push('greeting_or_trivial'); complexity = 1; needsWebSearch = false; needsCodeExecution = false; }
  complexity = Math.max(1, Math.min(10, complexity));
  let category: TaskCategory;
  if (needsCodeExecution && (isProjectGeneration || CODING_RE.test(text) || hasFence)) category = 'coding';
  else if (complexity <= 3 && !hasFence && !needsCodeExecution && !urls.length && !needsWebSearch) category = 'simple';
  else if (researchHits >= 2 || complexity >= 6) category = 'research';
  else if (needsWebSearch || complexity >= 4) category = 'current_info';
  else if (SIMPLE_DEF_RE.test(text)) category = 'simple';
  else category = 'current_info';
  return { category, complexity, needsWebSearch, needsCodeExecution, signals };
}

export interface ExecutionBudget extends ServerCeilings {}
export interface BudgetPlan {
  budget: ExecutionBudget;
  classification: TaskClassification;
  useAgent: boolean;
  forcedFirstTool?: string;
  codeExecutionEnabled: boolean;
  webSearchEnabled: boolean;
}

const TIER_PROFILES: Record<TaskCategory, ExecutionBudget> = {
  simple: { MAX_AGENT_STEPS: 2, MAX_TOOL_CALLS: 2, MAX_TOOL_OUTPUT_SIZE: 12000, TOOL_TIMEOUT_MS: 10000, TOTAL_AGENT_TIMEOUT_MS: 45000, MAX_SEARCH_RESULTS: 3, MAX_WEBPAGE_SIZE: 20000, MAX_CODE_EXECUTION_TIME_MS: 0 },
  current_info: { MAX_AGENT_STEPS: 4, MAX_TOOL_CALLS: 5, MAX_TOOL_OUTPUT_SIZE: 20000, TOOL_TIMEOUT_MS: 15000, TOTAL_AGENT_TIMEOUT_MS: 80000, MAX_SEARCH_RESULTS: 4, MAX_WEBPAGE_SIZE: 30000, MAX_CODE_EXECUTION_TIME_MS: 15000 },
  research: { MAX_AGENT_STEPS: 9, MAX_TOOL_CALLS: 12, MAX_TOOL_OUTPUT_SIZE: 30000, TOOL_TIMEOUT_MS: 25000, TOTAL_AGENT_TIMEOUT_MS: 150000, MAX_SEARCH_RESULTS: 6, MAX_WEBPAGE_SIZE: 45000, MAX_CODE_EXECUTION_TIME_MS: 30000 },
  coding: { MAX_AGENT_STEPS: 12, MAX_TOOL_CALLS: 16, MAX_TOOL_OUTPUT_SIZE: 30000, TOOL_TIMEOUT_MS: 30000, TOTAL_AGENT_TIMEOUT_MS: 180000, MAX_SEARCH_RESULTS: 4, MAX_WEBPAGE_SIZE: 30000, MAX_CODE_EXECUTION_TIME_MS: 60000 },
};

export function planBudget(classification: TaskClassification, ceilings = getServerCeilings()): BudgetPlan {
  const tier = TIER_PROFILES[classification.category];
  const c = classification.complexity;
  const factor = c >= 7 ? 1.25 : c >= 5 ? 1 : c <= 2 ? 0.6 : 0.8;
  const budget: ExecutionBudget = {
    MAX_AGENT_STEPS: clamp(Math.round(tier.MAX_AGENT_STEPS * factor), ceilings.MAX_AGENT_STEPS),
    MAX_TOOL_CALLS: clamp(Math.round(tier.MAX_TOOL_CALLS * factor), ceilings.MAX_TOOL_CALLS),
    MAX_TOOL_OUTPUT_SIZE: clamp(Math.round(tier.MAX_TOOL_OUTPUT_SIZE * (c >= 7 ? 1 : 0.75)), ceilings.MAX_TOOL_OUTPUT_SIZE),
    TOOL_TIMEOUT_MS: clamp(tier.TOOL_TIMEOUT_MS, ceilings.TOOL_TIMEOUT_MS),
    TOTAL_AGENT_TIMEOUT_MS: clamp(Math.round(tier.TOTAL_AGENT_TIMEOUT_MS * factor), ceilings.TOTAL_AGENT_TIMEOUT_MS),
    MAX_SEARCH_RESULTS: clamp(tier.MAX_SEARCH_RESULTS, ceilings.MAX_SEARCH_RESULTS),
    MAX_WEBPAGE_SIZE: clamp(tier.MAX_WEBPAGE_SIZE, ceilings.MAX_WEBPAGE_SIZE),
    MAX_CODE_EXECUTION_TIME_MS: clamp(tier.MAX_CODE_EXECUTION_TIME_MS, ceilings.MAX_CODE_EXECUTION_TIME_MS),
  };
  if (budget.MAX_AGENT_STEPS < 1) budget.MAX_AGENT_STEPS = 1;
  if (budget.MAX_TOOL_CALLS < 1) budget.MAX_TOOL_CALLS = 1;
  if (budget.TOTAL_AGENT_TIMEOUT_MS < 15000) budget.TOTAL_AGENT_TIMEOUT_MS = Math.min(15000, ceilings.TOTAL_AGENT_TIMEOUT_MS);
  const codeExecutionEnabled = classification.needsCodeExecution && budget.MAX_CODE_EXECUTION_TIME_MS > 0;
  const webSearchEnabled = classification.needsWebSearch && classification.category !== 'simple';
  const forcedFirstTool = webSearchEnabled && (classification.category === 'current_info' || classification.signals.includes('explicit_web_search')) ? 'web_search' : undefined;
  const useAgent = webSearchEnabled || codeExecutionEnabled || classification.category === 'research' || classification.category === 'coding';
  return { budget, classification, useAgent, forcedFirstTool, codeExecutionEnabled, webSearchEnabled };
}

export function createBudgetForRequest(message: string, explicitWebSearch = false, ceilings = getServerCeilings()): BudgetPlan {
  return planBudget(classifyRequest(message, explicitWebSearch), ceilings);
}

export type ToolName = string;
interface CallRecord { name: ToolName; fingerprint: string; ok: boolean; resultHash: string; durationMs: number; at: number; }
export interface BudgetDecision { allowed: boolean; reason?: string; }
export interface TerminationCheck { terminate: boolean; reason?: string; }
const MAX_IDENTICAL_CALLS = 2;
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_IDENTICAL_RESULT_STREAK = 2;

export class BudgetTracker {
  readonly plan: BudgetPlan;
  readonly startedAt: number;
  private stepsUsed = 0;
  private toolCallsUsed = 0;
  private searchCallsUsed = 0;
  private webpageCallsUsed = 0;
  private codeExecCallsUsed = 0;
  private history: CallRecord[] = [];
  private identicalResultStreak = 0;
  private consecutiveFailures = 0;
  private lastToolName: string | null = null;
  private previousToolName: string | null = null;
  private oscillationCount = 0;
  private forcedStop: TerminationCheck | null = null;
  private lastActivityAt: number;
  constructor(plan: BudgetPlan) { this.plan = plan; this.startedAt = Date.now(); this.lastActivityAt = this.startedAt; }
  private get budget(): ExecutionBudget { return this.plan.budget; }
  get elapsedMs(): number { return Date.now() - this.startedAt; }
  get remainingMs(): number { return Math.max(0, this.budget.TOTAL_AGENT_TIMEOUT_MS - this.elapsedMs); }
  get stepsUsedCount(): number { return this.stepsUsed; }
  get toolCallsUsedCount(): number { return this.toolCallsUsed; }
  canStartStep(): BudgetDecision {
    if (this.stepsUsed >= this.budget.MAX_AGENT_STEPS) return { allowed: false, reason: 'agent step budget exhausted' };
    if (this.remainingMs <= 3000) return { allowed: false, reason: 'total request timeout imminent' };
    if (this.forcedStop) return { allowed: false, reason: this.forcedStop.reason };
    return { allowed: true };
  }
  recordStep(): void { this.stepsUsed += 1; this.lastActivityAt = Date.now(); }
  private fingerprint(name: ToolName, args: Record<string, unknown>): string {
    const normalized = JSON.stringify({ n: name, a: args }, (key, value) => typeof value === 'string' ? value.trim().toLowerCase().slice(0, 2000) : value);
    return createHash('sha1').update(normalized).digest('hex');
  }
  canCallTool(name: ToolName, args: Record<string, unknown>): BudgetDecision {
    if (this.forcedStop) return { allowed: false, reason: this.forcedStop.reason };
    if (this.toolCallsUsed >= this.budget.MAX_TOOL_CALLS) return { allowed: false, reason: 'tool call budget exhausted' };
    if (this.remainingMs <= 2000) return { allowed: false, reason: 'total request timeout imminent' };
    if (name === 'web_search' && !this.plan.webSearchEnabled) return { allowed: false, reason: 'web search not allocated for this task' };
    if (name === 'run_code' && !this.plan.codeExecutionEnabled) return { allowed: false, reason: 'code execution not allocated for this task' };
    if (name === 'run_command' && !this.plan.codeExecutionEnabled) return { allowed: false, reason: 'command execution not allocated for this task' };
    if (name === 'read_url' && !this.plan.webSearchEnabled) return { allowed: false, reason: 'webpage reading not allocated for this task' };
    if (name === 'web_search' && this.searchCallsUsed >= this.budget.MAX_SEARCH_RESULTS) return { allowed: false, reason: 'search budget exhausted' };
    if (name === 'read_url' && this.webpageCallsUsed >= Math.max(2, this.budget.MAX_TOOL_CALLS - this.searchCallsUsed)) return { allowed: false, reason: 'webpage read budget exhausted' };
    if ((name === 'run_code' || name === 'run_command') && this.codeExecCallsUsed >= 6) return { allowed: false, reason: 'code/command execution budget exhausted' };
    const fp = this.fingerprint(name, args);
    const identical = this.history.filter((h) => h.fingerprint === fp).length;
    if (identical >= MAX_IDENTICAL_CALLS) { this.requestStop(`loop detected: identical ${name} call repeated ${identical + 1} times`); return { allowed: false, reason: 'duplicate call blocked (loop protection)' }; }
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) { this.requestStop(`repeated tool failures (${this.consecutiveFailures})`); return { allowed: false, reason: 'tool failures exceeded safe threshold' }; }
    return { allowed: true };
  }
  recordToolCall(name: ToolName, args: Record<string, unknown>, ok: boolean, output: string, durationMs: number): void {
    const fp = this.fingerprint(name, args);
    const resultHash = createHash('sha1').update(String(output || '').slice(0, 4000)).digest('hex');
    this.toolCallsUsed += 1; this.lastActivityAt = Date.now();
    if (name === 'web_search') this.searchCallsUsed += 1;
    if (name === 'read_url') this.webpageCallsUsed += 1;
    if (name === 'run_code' || name === 'run_command') this.codeExecCallsUsed += 1;
    const prev = this.history[this.history.length - 1];
    if (prev && prev.resultHash === resultHash && prev.ok && ok) this.identicalResultStreak += 1;
    else this.identicalResultStreak = ok ? 0 : this.identicalResultStreak;
    this.consecutiveFailures = ok ? 0 : this.consecutiveFailures + 1;
    if (this.lastToolName && this.previousToolName && this.lastToolName === name && this.previousToolName !== name) this.oscillationCount += 1;
    else if (this.lastToolName !== name) this.oscillationCount = Math.max(0, this.oscillationCount - 1);
    this.previousToolName = this.lastToolName; this.lastToolName = name;
    this.history.push({ name, fingerprint: fp, ok, resultHash, durationMs, at: Date.now() });
    if (ok && this.identicalResultStreak >= MAX_IDENTICAL_RESULT_STREAK) this.requestStop('loop detected: tool repeatedly returns the same result');
    if (!ok && this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) this.requestStop(`tool failed ${this.consecutiveFailures} times in a row`);
    if (this.oscillationCount >= 4) this.requestStop('action oscillation detected');
  }
  get identicalResultStreakCount(): number { return this.identicalResultStreak; }
  adapt(direction: 'expand' | 'shrink', _reason: string): void {
    const ceilings = getServerCeilings();
    if (direction === 'expand') {
      this.budget.MAX_AGENT_STEPS = clamp(Math.min(this.budget.MAX_AGENT_STEPS + 1, Math.ceil(ceilings.MAX_AGENT_STEPS * 0.75)), ceilings.MAX_AGENT_STEPS);
      this.budget.MAX_TOOL_CALLS = clamp(Math.min(this.budget.MAX_TOOL_CALLS + 2, Math.ceil(ceilings.MAX_TOOL_CALLS * 0.75)), ceilings.MAX_TOOL_CALLS);
      this.budget.TOTAL_AGENT_TIMEOUT_MS = clamp(Math.min(this.budget.TOTAL_AGENT_TIMEOUT_MS + 20000, ceilings.TOTAL_AGENT_TIMEOUT_MS), ceilings.TOTAL_AGENT_TIMEOUT_MS);
    } else {
      this.budget.MAX_AGENT_STEPS = Math.min(this.budget.MAX_AGENT_STEPS, this.stepsUsed + 1);
      this.budget.MAX_TOOL_CALLS = Math.min(this.budget.MAX_TOOL_CALLS, this.toolCallsUsed + 2);
    }
  }
  requestStop(reason: string): void { if (!this.forcedStop) this.forcedStop = { terminate: true, reason }; }
  shouldTerminate(): TerminationCheck {
    if (this.forcedStop) return this.forcedStop;
    if (this.stepsUsed >= this.budget.MAX_AGENT_STEPS) return { terminate: true, reason: 'agent step budget exhausted' };
    if (this.toolCallsUsed >= this.budget.MAX_TOOL_CALLS) return { terminate: true, reason: 'tool call budget exhausted' };
    if (this.elapsedMs >= this.budget.TOTAL_AGENT_TIMEOUT_MS) return { terminate: true, reason: 'total request timeout reached' };
    return { terminate: false };
  }
  snapshot(): Record<string, unknown> {
    return { category: this.plan.classification.category, complexity: this.plan.classification.complexity, signals: this.plan.classification.signals, steps: `${this.stepsUsed}/${this.budget.MAX_AGENT_STEPS}`, toolCalls: `${this.toolCallsUsed}/${this.budget.MAX_TOOL_CALLS}`, searches: this.searchCallsUsed, webpageReads: this.webpageCallsUsed, codeRuns: this.codeExecCallsUsed, elapsedMs: this.elapsedMs, totalTimeoutMs: this.budget.TOTAL_AGENT_TIMEOUT_MS, stopped: this.forcedStop?.reason ?? null, oscillationCount: this.oscillationCount };
  }
}

export interface GuardedToolResult { ok: boolean; output: string; durationMs: number; }
export async function runToolWithTimeout(fn: () => Promise<string>, timeoutMs: number, label: string): Promise<GuardedToolResult> {
  const startedAt = Date.now();
  const effectiveTimeout = Math.max(1000, Math.min(timeoutMs, ABSOLUTE_CEILING_BOUNDS.TOOL_TIMEOUT_MS));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const output = await Promise.race([fn(), new Promise<string>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${effectiveTimeout}ms`)), effectiveTimeout); })]);
    return { ok: true, output: String(output ?? ''), durationMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, output: `Tool failed: ${error instanceof Error ? error.message : String(error)}`, durationMs: Date.now() - startedAt };
  } finally { if (timer) clearTimeout(timer); }
}

export function clampToolOutput(output: string, budget: ExecutionBudget): string {
  const max = clamp(budget.MAX_TOOL_OUTPUT_SIZE, ABSOLUTE_CEILING_BOUNDS.MAX_TOOL_OUTPUT_SIZE);
  return String(output || '').slice(0, max);
}
