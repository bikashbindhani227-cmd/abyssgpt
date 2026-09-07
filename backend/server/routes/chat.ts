import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { checkRateLimit } from '../middleware/rateLimit.js';
import {
  getSystemPromptConfig,
  getAppSettingsConfig,
  getAppLimitsConfig,
} from '../services/configService.js';
import {
  verifyAndIncrementDailyUsage,
  calculateEffectiveLimits,
} from '../services/userService.js';
import {
  createConversation,
  getConversation,
  addMessage,
  getConversationMessages,
  getUserMemory,
  addMemoryFact,
} from '../services/conversationService.js';
import {
  streamChatCompletion,
  streamAgenticCompletion,
  ModelError,
  type ChatMessagePayload,
} from '../services/aiCredits.js';
import { AGENT_TOOLS, createUntrackedToolExecutor } from '../services/agentService.js';
import { createBudgetForRequest, BudgetTracker } from '../services/agentBudget.js';
import { buildAbyssGptSystemPrompt } from '../services/promptComposition.js';

export const chatRouter = Router();

/**
 * Neutral display label for the configured model. The real MODEL_ID stays
 * backend-only (admin configuration + server logs) and is never shipped to
 * clients — the provider/model identity is an internal detail.
 */
const MODEL_DISPLAY_LABEL = 'AbyssGPT';

/**
 * Convert ANY streaming failure into a client-safe message. Raw provider
 * bodies, model identities, and infrastructure details never reach clients;
 * full diagnostics stay in server logs.
 */
function userSafeStreamError(error: unknown, context: string): string {
  if (error instanceof ModelError) {
    console.error(`[${context}] model failure (${error.code}):`, error.detail);
    return error.userMessage;
  }
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] streaming failure:`, detail);
  return 'Something went wrong while generating the response. Please try again.';
}

/** Shared per-request SSE pipeline: batching, accumulation, persistence hooks. */
interface SseWriter {
  write: (payload: Record<string, unknown>) => void;
  accumulateChunk: (text: string) => void;
  flush: () => void;
  accumulatedText: () => string;
}

function createSseWriter(res: Response): SseWriter {
  let accumulated = '';
  let pending = '';
  let lastFlush = Date.now();

  return {
    write: (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    },
    accumulateChunk: (text) => {
      accumulated += text;
      pending += text;
      // Batch tiny deltas: >=48 chars or 24ms since last flush (UI smoothness).
      if (pending.length >= 48 || Date.now() - lastFlush >= 24) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: pending })}\n\n`);
        pending = '';
        lastFlush = Date.now();
      }
    },
    flush: () => {
      if (!pending) return;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: pending })}\n\n`);
      pending = '';
      lastFlush = Date.now();
    },
    accumulatedText: () => accumulated,
  };
}

function setupRequestAbort(req: AuthenticatedRequest, res: Response): { abortController: AbortController; cleanup: () => void } {
  const abortController = new AbortController();
  const abortUpstream = () => {
    if (!abortController.signal.aborted) abortController.abort();
  };
  const onAborted = () => abortUpstream();
  const onClose = () => {
    if (!res.writableEnded) abortUpstream();
  };
  req.on('aborted', onAborted);
  res.on('close', onClose);
  return {
    abortController,
    cleanup: () => {
      req.off('aborted', onAborted);
      res.off('close', onClose);
    },
  };
}

function beginSse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

chatRouter.post(
  '/stream',
  requireAuth,
  checkRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { message, conversationId, webSearch } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'Message content is required.' });
      return;
    }

    // These reads/checks are independent; run them together to reduce pre-model latency.
    const [appSettings, limitsConfig] = await Promise.all([
      getAppSettingsConfig(),
      getAppLimitsConfig(),
    ]);

    // Check maintenance mode
    if (appSettings.maintenanceMode && !user.isAdmin) {
      res.status(503).json({
        error: 'Service is temporarily under maintenance. Please check back shortly.',
      });
      return;
    }

    // Message length limit
    const cleanMessage = message.trim();
    if (cleanMessage.length > appSettings.maxMessageLength) {
      res.status(400).json({
        error: `Message exceeds maximum allowed length of ${appSettings.maxMessageLength} characters.`,
      });
      return;
    }

    // Check daily message count limit
    const usageCheck = await verifyAndIncrementDailyUsage(user.uid);
    if (!usageCheck.allowed) {
      res.status(429).json({
        error: usageCheck.reason || 'Daily message limit reached. Upgrade to Premium for higher limits.',
      });
      return;
    }

    // Load or create conversation
    let conv = conversationId ? await getConversation(user.uid, conversationId) : null;
    if (!conv) {
      conv = await createConversation(user.uid, cleanMessage.slice(0, 60));
    }

    // Prepare context in parallel. The user message write is also started immediately.
    const { contextLimit } = calculateEffectiveLimits(user, limitsConfig);
    const userMessageWrite = addMessage(user.uid, conv.id, 'user', cleanMessage);
    const [systemConfig, memory, pastMessages, userMsg] = await Promise.all([
      getSystemPromptConfig(),
      getUserMemory(user.uid),
      getConversationMessages(user.uid, conv.id, contextLimit),
      userMessageWrite,
    ]);

    beginSse(res);

    // Send metadata event (model identity intentionally neutral — backend-only detail).
    res.write(
      `data: ${JSON.stringify({
        type: 'meta',
        conversationId: conv.id,
        userMessage: userMsg,
        model: MODEL_DISPLAY_LABEL,
      })}\n\n`
    );

    // AGENT ROUTING under AUTOMATIC RESOURCE MANAGEMENT:
    // 1) TASK CLASSIFICATION -> 2) AUTOMATIC BUDGET PLANNER -> 3) AGENT EXECUTION.
    // The budget is derived server-side from the task itself; the client and the
    // model can never raise it, and every value stays below the hard ceilings.
    // An explicit user web-search toggle only STRENGTHENS the plan — it never
    // gates agentic behavior (the planner decides tools from the task itself).
    const explicitWebSearch = Boolean(webSearch);
    const budgetPlan = createBudgetForRequest(cleanMessage, explicitWebSearch);
    const useAgent = budgetPlan.useAgent;
    if (useAgent) {
      res.write(`data: ${JSON.stringify({ type: 'thinking', text: 'Agent planning…' })}\n\n`);
    }

    // Effective system prompt: admin prompt (authoritative) + agent instructions
    // + tool inventory. Identical structure for every configured model.
    const fullSystemPrompt = buildAbyssGptSystemPrompt({
      adminSystemPrompt: systemConfig.systemPrompt,
      memoryFacts: memory.enabled ? memory.facts : [],
      conversationSummary: conv.summary || null,
      toolsAvailable: useAgent,
      recommendWebSearch: useAgent && budgetPlan.webSearchEnabled,
      explicitWebSearch: useAgent && explicitWebSearch,
    });

    const payloadMessages: ChatMessagePayload[] = [{ role: 'system', content: fullSystemPrompt }];

    // Past conversation context (excluding the user message we just saved if already in pastMessages)
    for (const msg of pastMessages) {
      if (msg.id === userMsg.id) continue;
      payloadMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    // Current message
    payloadMessages.push({ role: 'user', content: cleanMessage });

    const { abortController, cleanup } = setupRequestAbort(req, res);
    const sse = createSseWriter(res);

    // AGENT EXECUTION under the planned budget. The orchestrator itself owns
    // gating, accounting, loop protection, and untrusted-data fencing through
    // the shared BudgetTracker; this executor provides validated, timed,
    // clamped tool execution.
    const tracker = new BudgetTracker(budgetPlan);
    const toolExecutor = createUntrackedToolExecutor(budgetPlan, abortController.signal);
    if (useAgent) {
      // Server-side observability only. Never sent to the client.
      console.log('[agent-budget] plan:', JSON.stringify(tracker.snapshot()));
    }

    // SERVER-SIDE HARD LIMIT: total wall-clock for this request, enforced by the
    // backend regardless of what the model or planner does.
    const totalTimeoutMs = budgetPlan.budget.TOTAL_AGENT_TIMEOUT_MS + 5000;
    const totalTimer = setTimeout(() => {
      if (!abortController.signal.aborted) abortController.abort();
    }, totalTimeoutMs);
    totalTimer.unref?.();

    const modelUsed = MODEL_DISPLAY_LABEL;

    try {
      const streamGenerator = useAgent
        ? streamAgenticCompletion(
            payloadMessages,
            AGENT_TOOLS,
            toolExecutor,
            abortController.signal,
            budgetPlan.webSearchEnabled ? 'web_search' : undefined,
            budgetPlan,
            tracker,
          )
        : streamChatCompletion(payloadMessages, abortController.signal);

      for await (const event of streamGenerator) {
        if (abortController.signal.aborted) break;

        if (event.type === 'chunk' && event.text) {
          sse.accumulateChunk(event.text);
        } else if (event.type === 'thinking' && event.text) {
          sse.write({ type: 'thinking', text: event.text });
        } else if (event.type === 'done') {
          sse.flush();
          break;
        } else if (event.type === 'error' && event.error) {
          // Orchestrator surfaced a controlled error — safe message already.
          if (sse.accumulatedText().trim()) {
            await addMessage(user.uid, conv.id, 'assistant', sse.accumulatedText(), modelUsed).catch(() => {});
          }
          sse.write({ type: 'error', error: event.error });
          res.end();
          cleanup();
          return;
        }
      }

      // Handle empty response fallback
      let finalText = sse.accumulatedText();
      if (!finalText.trim() && !abortController.signal.aborted) {
        finalText = 'The AI returned an empty response. Please try again.';
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: finalText })}\n\n`);
      }

      // Save assistant message to Firestore
      const assistantMsg = await addMessage(user.uid, conv.id, 'assistant', finalText, modelUsed);

      // Check if user shared an explicit name or preference to add to memory
      if (memory.enabled) {
        if (cleanMessage.toLowerCase().startsWith('my name is ') || cleanMessage.toLowerCase().startsWith('i prefer ')) {
          addMemoryFact(user.uid, cleanMessage).catch(() => {});
        }
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          messageId: assistantMsg.id,
          conversationId: conv.id,
        })}\n\n`
      );
      console.log('[agent-budget] final:', JSON.stringify(tracker.snapshot()));
      res.end();
    } catch (streamErr: unknown) {
      // Client-safe error only; provider bodies/model identity stay in logs.
      const errorMsg = userSafeStreamError(streamErr, 'chat/stream');
      if (sse.accumulatedText().trim()) {
        await addMessage(user.uid, conv.id, 'assistant', sse.accumulatedText(), modelUsed).catch(() => {});
      }
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
      res.end();
    } finally {
      clearTimeout(totalTimer);
      cleanup();
    }
  }
);

/**
 * Regenerate response for a conversation
 */
chatRouter.post(
  '/conversations/:id/regenerate',
  requireAuth,
  checkRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const conversationId = req.params.id;

    const conv = await getConversation(user.uid, conversationId);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    const messages = await getConversationMessages(user.uid, conversationId, 50);
    if (messages.length === 0) {
      res.status(400).json({ error: 'No messages to regenerate.' });
      return;
    }

    // Find the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) {
      res.status(400).json({ error: 'No user message found to regenerate from.' });
      return;
    }

    // Check usage limits
    const usageCheck = await verifyAndIncrementDailyUsage(user.uid);
    if (!usageCheck.allowed) {
      res.status(429).json({ error: usageCheck.reason });
      return;
    }

    const limitsConfig = await getAppLimitsConfig();
    const { contextLimit } = calculateEffectiveLimits(user, limitsConfig);
    const [systemConfig, memory] = await Promise.all([
      getSystemPromptConfig(),
      getUserMemory(user.uid),
    ]);

    // Same effective prompt structure as the main stream path (consistency).
    const fullSystemPrompt = buildAbyssGptSystemPrompt({
      adminSystemPrompt: systemConfig.systemPrompt,
      memoryFacts: memory.enabled ? memory.facts : [],
      conversationSummary: conv.summary || null,
      toolsAvailable: false,
    });

    const payloadMessages: ChatMessagePayload[] = [{ role: 'system', content: fullSystemPrompt }];

    // Include history up to the last user message
    const historySlice = messages.slice(0, messages.indexOf(lastUserMsg) + 1).slice(-contextLimit);
    for (const msg of historySlice) {
      payloadMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    beginSse(res);

    res.write(
      `data: ${JSON.stringify({
        type: 'meta',
        conversationId: conv.id,
        isRegeneration: true,
        model: MODEL_DISPLAY_LABEL,
      })}\n\n`
    );

    const { abortController, cleanup } = setupRequestAbort(req, res);
    const sse = createSseWriter(res);
    const modelUsed = MODEL_DISPLAY_LABEL;

    try {
      for await (const event of streamChatCompletion(payloadMessages, abortController.signal)) {
        if (abortController.signal.aborted) break;
        if (event.type === 'chunk' && event.text) {
          sse.accumulateChunk(event.text);
        } else if (event.type === 'thinking' && event.text) {
          sse.write({ type: 'thinking', text: event.text });
        } else if (event.type === 'done') {
          sse.flush();
          break;
        }
      }

      let finalText = sse.accumulatedText();
      if (!finalText.trim() && !abortController.signal.aborted) {
        finalText = 'The AI returned an empty response. Please try again.';
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: finalText })}\n\n`);
      }

      const assistantMsg = await addMessage(user.uid, conv.id, 'assistant', finalText, modelUsed);

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          messageId: assistantMsg.id,
          conversationId: conv.id,
        })}\n\n`
      );
      res.end();
    } catch (streamErr: unknown) {
      const errorMsg = userSafeStreamError(streamErr, 'chat/regenerate');
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
      res.end();
    } finally {
      cleanup();
    }
  }
);
