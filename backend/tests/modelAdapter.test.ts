/**
 * Model Adapter tests — provider-behavior compatibility (spec §32).
 *
 * Mocks the HTTP provider and feeds every documented model behavior shape
 * through the adapter. The agent system must see ONE normalized format for
 * all of them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createModelAdapter,
  normalizeAssistantMessage,
  normalizeFinishReason,
  parseToolCallArguments,
  extractContentEmbeddedToolCall,
  ModelError,
  type ModelAdapterConfig,
} from '../server/services/modelAdapter.js';

const CONFIG: ModelAdapterConfig = {
  modelId: 'any-configured-model-id',
  baseUrl: 'https://provider.test/v1',
  apiKey: 'test-key',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(chunks: Array<unknown>): Response {
  const body = chunks
    .map((c) => (c === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(c)}\n\n`))
    .join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function withFetch<T>(impl: (url: string, init?: RequestInit) => Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    return impl(String(url), init);
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

describe('normalizeFinishReason', () => {
  it('maps provider-specific finish reasons to the common set', () => {
    assert.equal(normalizeFinishReason('stop'), 'stop');
    assert.equal(normalizeFinishReason('end_turn'), 'stop');
    assert.equal(normalizeFinishReason('tool_calls'), 'tool_calls');
    assert.equal(normalizeFinishReason('tool_use'), 'tool_calls');
    assert.equal(normalizeFinishReason('max_tokens'), 'length');
    assert.equal(normalizeFinishReason('content_filter'), 'content_filter');
    assert.equal(normalizeFinishReason('weird_unknown_value'), 'unknown');
    assert.equal(normalizeFinishReason(null), 'unknown');
  });
});

describe('parseToolCallArguments', () => {
  it('accepts pre-parsed objects (Model B behavior)', () => {
    const { args, repaired } = parseToolCallArguments({ query: 'ai news' });
    assert.deepEqual(args, { query: 'ai news' });
    assert.equal(repaired, false);
  });

  it('parses JSON strings', () => {
    const { args } = parseToolCallArguments('{"query":"ai news"}');
    assert.equal(args.query, 'ai news');
  });

  it('repairs JSON wrapped in markdown fences', () => {
    const { args, repaired } = parseToolCallArguments('```json\n{"query":"x"}\n```');
    assert.equal(args.query, 'x');
    assert.equal(repaired, true);
  });

  it('repairs JSON with prose around it', () => {
    const { args } = parseToolCallArguments('Sure! Here are the arguments: {"query":"x"} as requested');
    assert.equal(args.query, 'x');
  });

  it('repairs smart quotes', () => {
    const { args } = parseToolCallArguments('{\u201Cquery\u201D:\u201Cx\u201D}');
    assert.equal(args.query, 'x');
  });

  it('never throws on hopeless input and flags it', () => {
    const { args, repaired } = parseToolCallArguments('not json at all {');
    assert.deepEqual(args, {});
    assert.equal(repaired, true);
  });
});

describe('extractContentEmbeddedToolCall', () => {
  it('detects strict JSON tool calls emitted as text', () => {
    const call = extractContentEmbeddedToolCall('{"name":"web_search","arguments":{"query":"x"}}');
    assert.ok(call);
    assert.equal(call!.name, 'web_search');
    assert.deepEqual(call!.args, { query: 'x' });
  });

  it('rejects prose or non-tool JSON to avoid false positives', () => {
    assert.equal(extractContentEmbeddedToolCall('Let me search for that.'), null);
    assert.equal(extractContentEmbeddedToolCall('{"answer":42}'), null);
    assert.equal(extractContentEmbeddedToolCall('[1,2,3]'), null);
  });
});

describe('normalizeAssistantMessage — model behaviors A–E', () => {
  it('Model A: normal native tool call', () => {
    const r = normalizeAssistantMessage(
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"query":"ai news"}' } }],
      },
      'tool_calls',
    );
    assert.equal(r.toolCalls.length, 1);
    assert.equal(r.toolCalls[0].name, 'web_search');
    assert.equal(r.toolCalls[0].args.query, 'ai news');
    assert.equal(r.toolCalls[0].id, 'call_1');
    assert.equal(r.finishReason, 'tool_calls');
    assert.equal(r.hadMalformedToolCall, false);
  });

  it('Model B: multiple tool calls in one response', () => {
    const r = normalizeAssistantMessage(
      {
        content: '',
        tool_calls: [
          { id: 'a', type: 'function', function: { name: 'web_search', arguments: '{"query":"one"}' } },
          { id: 'b', type: 'function', function: { name: 'read_url', arguments: '{"url":"https://x.test"}' } },
        ],
      },
      'tool_calls',
    );
    assert.equal(r.toolCalls.length, 2);
    assert.equal(r.toolCalls[1].name, 'read_url');
  });

  it('Model C: malformed tool arguments are repaired or flagged, never thrown', () => {
    const r = normalizeAssistantMessage(
      {
        content: null,
        tool_calls: [{ id: 'c', type: 'function', function: { name: 'web_search', arguments: '{"query": broken' } }],
      },
      'tool_calls',
    );
    assert.equal(r.toolCalls.length, 1);
    assert.deepEqual(r.toolCalls[0].args, {});
    assert.equal(r.hadMalformedToolCall, true);
  });

  it('Model D: plain text response', () => {
    const r = normalizeAssistantMessage({ content: 'Recursion is a function calling itself.' }, 'stop');
    assert.equal(r.text, 'Recursion is a function calling itself.');
    assert.equal(r.toolCalls.length, 0);
    assert.equal(r.finishReason, 'stop');
  });

  it('Model E: legacy function_call shape and missing tool-call ids', () => {
    const legacy = normalizeAssistantMessage(
      { content: null, function_call: { name: 'functions.web_search', arguments: '{"query":"legacy"}' } },
      'function_call',
    );
    assert.equal(legacy.toolCalls.length, 1);
    assert.equal(legacy.toolCalls[0].name, 'web_search');
    assert.ok(legacy.toolCalls[0].id.startsWith('call_synth_'));

    const noId = normalizeAssistantMessage(
      { content: null, tool_calls: [{ type: 'function', function: { name: 'web_search', arguments: '{"query":"noid"}' } }] },
      'tool_calls',
    );
    assert.ok(noId.toolCalls[0].id.length > 0);
    assert.equal(noId.hadMalformedToolCall, true);
  });

  it('empty and null responses normalize without crashing', () => {
    const r = normalizeAssistantMessage(null, null);
    assert.equal(r.text, '');
    assert.equal(r.toolCalls.length, 0);
  });
});

describe('createModelAdapter.generateCompletion', () => {
  it('sends MODEL_ID as an opaque string and normalizes the response', async () => {
    await withFetch(async () => jsonResponse({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 't1', type: 'function', function: { name: 'web_search', arguments: '{"query":"q"}' } }],
        },
      }],
    }), async () => {
      const adapter = createModelAdapter(CONFIG);
      const res = await adapter.generateCompletion([{ role: 'user', content: 'hi' }], {
        tools: [{ type: 'function', function: { name: 'web_search', description: 'd', parameters: {} } }],
      });
      assert.equal(res.toolCalls[0].name, 'web_search');
    });
  });

  it('throws typed ModelError with a client-safe message on provider 500s', async () => {
    await withFetch(async () => jsonResponse({ error: 'internal: secret-endpoint /v1/xyz key sk-live-123' }, 500), async () => {
      const adapter = createModelAdapter(CONFIG);
      await assert.rejects(
        () => adapter.generateCompletion([{ role: 'user', content: 'hi' }]),
        (err: unknown) => {
          assert.ok(err instanceof ModelError);
          assert.equal(err.code, 'provider_error');
          // Client-safe copy contains no provider internals.
          assert.ok(!/sk-live-123|secret-endpoint/.test(err.userMessage));
          // Diagnostics retained for server logs only.
          assert.ok(/sk-live-123/.test(err.detail));
          return true;
        },
      );
    });
  });

  it('degrades gracefully when the provider rejects forced tool choice (4xx)', async () => {
    let calls = 0;
    await withFetch(async (_url, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.tool_choice && typeof body.tool_choice === 'object') {
        return jsonResponse({ error: 'tool_choice function forcing is not supported (400)' }, 400);
      }
      return jsonResponse({
        choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'z', type: 'function', function: { name: 'web_search', arguments: '{}' } }] } }],
      });
    }, async () => {
      const adapter = createModelAdapter(CONFIG);
      const res = await adapter.generateCompletion([{ role: 'user', content: 'hi' }], {
        tools: [{ type: 'function', function: { name: 'web_search', description: 'd', parameters: {} } }],
        forcedToolName: 'web_search',
      });
      assert.equal(calls, 2);
      assert.equal(res.toolCalls[0].name, 'web_search');
    });
  });

  it('degrades gracefully when the provider rejects tools entirely (404/400)', async () => {
    let calls = 0;
    const receivedBodies: any[] = [];
    await withFetch(async (_url, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body || '{}'));
      receivedBodies.push(body);
      if (body.tools) {
        return jsonResponse({ error: 'No endpoints found that support tool use. Try disabling "web_search"' }, 404);
      }
      return jsonResponse({
        choices: [{ finish_reason: 'stop', message: { content: 'Direct text answer' } }],
      });
    }, async () => {
      const adapter = createModelAdapter(CONFIG);
      const res = await adapter.generateCompletion([{ role: 'user', content: 'hi' }], {
        tools: [{ type: 'function', function: { name: 'web_search', description: 'd', parameters: {} } }],
      });
      assert.equal(calls, 2);
      assert.equal(receivedBodies[0].tools !== undefined, true);
      assert.equal(receivedBodies[1].tools, undefined);
      assert.equal(res.text, 'Direct text answer');
      assert.equal(res.toolCalls.length, 0);
    });
  });

  it('streamCompletion omits tools and tool_choice from request body', async () => {
    let receivedBody: any = null;
    await withFetch(async (_url, init) => {
      receivedBody = JSON.parse(String(init?.body || '{}'));
      return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }, async () => {
      const adapter = createModelAdapter(CONFIG);
      const chunks: string[] = [];
      for await (const ev of adapter.streamCompletion([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'draft' }])) {
        if (ev.type === 'chunk') chunks.push(ev.text || '');
      }
      assert.equal(receivedBody.tools, undefined);
      assert.equal(receivedBody.tool_choice, undefined);
      assert.equal(receivedBody.stream, true);
      assert.equal(receivedBody.messages.length, 1);
      assert.equal(receivedBody.messages[0].role, 'user');
    });
  });

  it('reports not_configured as typed ModelError when MODEL_ID missing', async () => {
    const adapter = createModelAdapter({ modelId: '', baseUrl: 'https://x.test', apiKey: 'k' });
    await assert.rejects(
      () => adapter.generateCompletion([{ role: 'user', content: 'hi' }]),
      (err: unknown) => err instanceof ModelError && err.code === 'not_configured',
    );
  });
});

describe('createModelAdapter.streamCompletion', () => {
  it('parses SSE chunks, batches text, and honors [DONE]', async () => {
    await withFetch(async () => sseResponse([
      { choices: [{ delta: { content: 'Hello' } }] },
      { choices: [{ delta: { content: ' world' } }] },
      '[DONE]',
    ]), async () => {
      const adapter = createModelAdapter(CONFIG);
      const events: Array<{ type: string; text?: string }> = [];
      for await (const ev of adapter.streamCompletion([{ role: 'user', content: 'hi' }])) {
        events.push(ev as { type: string; text?: string });
      }
      assert.equal(events.filter((e) => e.type === 'chunk').map((e) => e.text).join(''), 'Hello world');
      assert.equal(events[events.length - 1].type, 'done');
    });
  });

  it('ignores malformed keepalive lines without failing', async () => {
    await withFetch(async () => new Response(
      ': keepalive\n\ndata: not-json\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
      { status: 200 },
    ), async () => {
      const adapter = createModelAdapter(CONFIG);
      let text = '';
      for await (const ev of adapter.streamCompletion([{ role: 'user', content: 'hi' }])) {
        if (ev.type === 'chunk') text += ev.text ?? '';
      }
      assert.equal(text, 'ok');
    });
  });
});
