import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModelAdapter, type StreamEvent } from '../server/services/modelAdapter.js';
import { classifyRequest, createBudgetForRequest, BudgetTracker } from '../server/services/agentBudget.js';
import { runAgentOrchestration } from '../server/services/agentOrchestrator.js';
import { createBudgetedToolExecutor } from '../server/services/agentService.js';
import { AGENT_TOOLS } from '../server/services/toolRegistry.js';
import { TodoManager } from '../server/services/todoManager.js';
import { buildAbyssGptSystemPrompt } from '../server/services/promptComposition.js';

function makeSseResponse(events: string[], chunkSize = 17): Response {
  const bytes = new TextEncoder().encode(events.join(''));
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize)); controller.close(); } });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
async function collect(adapter: ReturnType<typeof createModelAdapter>): Promise<{ text: string; done: boolean }> {
  let text = ''; let done = false;
  for await (const event of adapter.streamCompletion([{ role: 'user', content: 'generate' }])) { if (event.type === 'chunk') text += event.text || ''; if (event.type === 'done') done = true; }
  return { text, done };
}

describe('full-project classification', () => {
  const projectRequests = ['Build a complete full-stack Todo app', 'Create a complete website with frontend and backend', 'Generate the entire project', 'Build a production-ready full-stack application', 'Create all required files', 'Generate the complete source code'];
  for (const request of projectRequests) it(`classifies: ${request}`, () => { const c = classifyRequest(request); assert.equal(c.category, 'coding'); assert.equal(c.needsCodeExecution, true); assert.equal(c.signals.includes('full_project_generation'), true); assert.equal(createBudgetForRequest(request).useAgent, true); });
  it('does not turn an ordinary complete explanation into a coding task', () => { const c = classifyRequest('Give me a complete explanation of photosynthesis.'); assert.notEqual(c.category, 'coding'); assert.equal(c.needsCodeExecution, false); });
});

describe('model adapter long SSE', () => {
  const originalFetch = globalThis.fetch;
  function install(events: string[], chunkSize = 17) { globalThis.fetch = (async () => makeSseResponse(events, chunkSize)) as typeof fetch; }
  it('preserves 10KB response', async () => { const text = 'A'.repeat(10_000); install([`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`, 'data: [DONE]\n\n'], 11); try { const result = await collect(createModelAdapter({ modelId: 'test-model', baseUrl: 'https://example.invalid', apiKey: 'test' })); assert.equal(result.text, text); assert.equal(result.done, true); } finally { globalThis.fetch = originalFetch; } });
  it('preserves 50KB response', async () => { const text = '0123456789'.repeat(5_000); install([`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`, 'data: [DONE]\n\n'], 23); try { const result = await collect(createModelAdapter({ modelId: 'test-model', baseUrl: 'https://example.invalid', apiKey: 'test' })); assert.equal(result.text, text); } finally { globalThis.fetch = originalFetch; } });
  it('preserves 100KB multi-file project response and long code fence', async () => { const text = ['```text', 'FILE: package.json', '{"scripts":{"build":"tsc"}}', 'FILE: src/App.tsx', 'export default function App(){return null}', 'FILE: backend/server.ts', 'const server = true;', '```', 'X'.repeat(99_500)].join('\n'); install([`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`, 'data: [DONE]\n\n'], 29); try { const result = await collect(createModelAdapter({ modelId: 'test-model', baseUrl: 'https://example.invalid', apiKey: 'test' })); assert.equal(result.text, text); assert.match(result.text, /package\.json/); assert.match(result.text, /backend\/server\.ts/); } finally { globalThis.fetch = originalFetch; } });
  it('handles UTF-8 boundaries and split SSE events', async () => { const text = 'Hindi: नमस्ते दुनिया 🚀 — 日本語 — العربية'; install([`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(0, 10) } }] })}\n\n`, `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(10) } }] })}\n\n`, 'data: [DONE]\n\n'], 1); try { const result = await collect(createModelAdapter({ modelId: 'test-model', baseUrl: 'https://example.invalid', apiKey: 'test' })); assert.equal(result.text, text); } finally { globalThis.fetch = originalFetch; } });
  it('rejects upstream EOF without [DONE]', async () => { install([`data: ${JSON.stringify({ choices: [{ delta: { content: 'partial code' } }] })}\n\n`], 7); try { await assert.rejects(async () => { await collect(createModelAdapter({ modelId: 'test-model', baseUrl: 'https://example.invalid', apiKey: 'test' })); }, /before \[DONE\]|incomplete/i); } finally { globalThis.fetch = originalFetch; } });
  it('handles correct [DONE] after multiple events', async () => { install(['data: {"choices":[{"delta":{"content":"one"}}]}\n', '\ndata: {"choices":[{"delta":{"content":"two"}}]}\n\n', 'data: [DONE]\n\n'], 5); try { const result = await collect(createModelAdapter({ modelId: 'test-model', baseUrl: 'https://example.invalid', apiKey: 'test' })); assert.equal(result.text, 'onetwo'); assert.equal(result.done, true); } finally { globalThis.fetch = originalFetch; } });
});

describe('shared budget accounting and bounded agent loop', () => {
  it('counts one tool call once when the orchestrator uses the budgeted executor', async () => {
    const plan = createBudgetForRequest('create all required files for a complete full-stack app'); const tracker = new BudgetTracker(plan); const todoManager = new TodoManager(); const executeTool = createBudgetedToolExecutor(plan, tracker, undefined, todoManager); let phase = 0;
    const adapter = { modelId: () => 'test-model', generateCompletion: async () => phase++ === 0 ? { text: '', toolCalls: [{ id: 'call-1', name: 'todo_write', args: { todos: [{ id: '1', content: 'build', status: 'in_progress' }] }, repaired: false, invalid: false }], finishReason: 'tool_calls' as const, hadMalformedToolCall: false } : { text: 'verified', toolCalls: [], finishReason: 'stop' as const, hadMalformedToolCall: false }, generateToolCall: async () => ({ text: '', toolCalls: [], finishReason: 'stop' as const, hadMalformedToolCall: false }), async *streamCompletion(): AsyncGenerator<StreamEvent, void, unknown> { yield { type: 'chunk', text: 'final' }; yield { type: 'done', text: 'final' }; } };
    const events: StreamEvent[] = []; for await (const event of runAgentOrchestration({ adapter, messages: [{ role: 'user', content: 'create all required files for a complete full-stack app' }], tools: AGENT_TOOLS, executeTool, plan, tracker })) events.push(event);
    assert.equal(tracker.toolCallsUsedCount, 1); assert.ok(events.some((e) => e.type === 'done'));
  });
  it('keeps hard ceilings above every planned value', () => { const plan = createBudgetForRequest('Build a complete full-stack Todo app'); assert.ok(plan.budget.MAX_AGENT_STEPS <= 24); assert.ok(plan.budget.MAX_TOOL_CALLS <= 40); assert.ok(plan.budget.MAX_TOOL_OUTPUT_SIZE <= 60000); assert.ok(plan.budget.TOOL_TIMEOUT_MS <= 90000); assert.ok(plan.budget.TOTAL_AGENT_TIMEOUT_MS <= 300000); assert.ok(plan.budget.MAX_SEARCH_RESULTS <= 10); assert.ok(plan.budget.MAX_WEBPAGE_SIZE <= 80000); assert.ok(plan.budget.MAX_CODE_EXECUTION_TIME_MS <= 120000); });
});

describe('system prompt confidentiality', () => {
  it('composes the private admin prompt first and adds the confidentiality rule', () => {
    const marker = 'PRIVATE_ADMIN_MARKER'; const prompt = buildAbyssGptSystemPrompt({ adminSystemPrompt: marker, memoryFacts: [], conversationSummary: null, toolsAvailable: true, recommendWebSearch: false });
    assert.equal(prompt.startsWith(marker), true); assert.match(prompt, /private admin-edited application system prompt is confidential/i); assert.match(prompt, /UNTRUSTED DATA/i);
  });
});
