/**
 * AbyssGPT — AI Credits compatibility layer
 * ==========================================
 *
 * Historical entry point for AI completions. All transport, normalization and
 * agent-loop logic now lives in modelAdapter.ts / agentOrchestrator.ts; this
 * module keeps the existing public API stable for the routes and services:
 *
 *   streamChatCompletion()          -> adapter.streamCompletion()
 *   streamAgenticCompletion()       -> runAgentOrchestration()
 *   generateConversationSummary()   -> adapter.generateCompletion()
 *   getConfiguredModelId()          -> adapter.modelId()
 *
 * The MODEL_ID is an opaque configuration value resolved per request. Nothing
 * here branches on which model is configured.
 */

import {
  ModelError,
  createModelAdapter,
  type AgentToolDefinition,
  type ChatMessagePayload,
  type ModelAdapter,
  type StreamEvent,
} from './modelAdapter.js';
import { runAgentOrchestration } from './agentOrchestrator.js';
import type { BudgetPlan } from './agentBudget.js';

export type { AgentToolDefinition, ChatMessagePayload, StreamEvent };
export type AgentToolExecutor = (
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<string>;
export { ModelError };

/** Shared adapter instance; configuration is resolved from env per request. */
const defaultAdapter: ModelAdapter = createModelAdapter();

export function getConfiguredModelId(): string {
  return defaultAdapter.modelId() || 'not-configured';
}

export async function* streamChatCompletion(
  messages: ChatMessagePayload[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, unknown> {
  yield* defaultAdapter.streamCompletion(messages, { signal });
}

export async function* streamAgenticCompletion(
  messages: ChatMessagePayload[],
  tools: AgentToolDefinition[],
  executeTool: AgentToolExecutor,
  signal?: AbortSignal,
  forcedFirstTool?: string,
  plan?: BudgetPlan,
  tracker?: import('./agentBudget.js').BudgetTracker,
): AsyncGenerator<StreamEvent, void, unknown> {
  yield* runAgentOrchestration({
    adapter: defaultAdapter,
    messages,
    tools,
    executeTool,
    signal,
    forcedFirstTool,
    plan,
    tracker,
  });
}

export async function generateConversationSummary(
  history: Array<{ role: string; content: string }>,
): Promise<string> {
  const textPrompt = [
    'Summarize this conversation in 2-3 concise sentences.',
    'Capture durable user preferences, key facts, and important open threads only.',
    '',
    ...history.map((m) => `${m.role.toUpperCase()}: ${m.content}`),
  ].join('\n');

  try {
    const response = await defaultAdapter.generateCompletion(
      [{ role: 'user', content: textPrompt }],
      { tools: [] },
    );
    return response.text || '';
  } catch (error) {
    // Summaries are best-effort; a model outage must never break conversation listing.
    if (error instanceof ModelError) {
      console.warn('[aiCredits] conversation summary skipped:', error.code, error.detail);
    } else {
      console.warn('[aiCredits] conversation summary skipped:', error instanceof Error ? error.message : error);
    }
    return '';
  }
}
