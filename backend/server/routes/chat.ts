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
  getConfiguredModelId,
  type ChatMessagePayload,
} from '../services/aiCredits.js';
import { AGENT_TOOLS, createBudgetedToolExecutor } from '../services/agentService.js';
import { createBudgetForRequest, BudgetTracker } from '../services/agentBudget.js';

export const chatRouter = Router();

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

    // Setup SSE streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send metadata event
    res.write(
      `data: ${JSON.stringify({
        type: 'meta',
        conversationId: conv.id,
        userMessage: userMsg,
        model: getConfiguredModelId(),
      })}\n\n`
    );

    // Native agent routing under AUTOMATIC RESOURCE MANAGEMENT:
    // 1) TASK CLASSIFICATION -> 2) AUTOMATIC BUDGET PLANNER -> 3) AGENT EXECUTION.
    // The budget is derived server-side from the task itself; the client and the
    // model can never raise it, and every value stays below the hard ceilings.
    const budgetPlan = createBudgetForRequest(cleanMessage, Boolean(webSearch));
    const useWebSearchTool = budgetPlan.webSearchEnabled;
    const useAgent = budgetPlan.useAgent;
    if (useAgent) {
      res.write(`data: ${JSON.stringify({ type: 'thinking', text: 'Agent planning…' })}\n\n`);
    }

    // Build messages payload
    const payloadMessages: ChatMessagePayload[] = [];

    // 1. System Prompt
    let fullSystemPrompt = systemConfig.systemPrompt;
    fullSystemPrompt += `\n\n[ABYSSGPT AGENT BEHAVIOR]\nBe highly capable, precise, and practical. For coding tasks, produce complete production-ready code with correct imports, types, error handling, security considerations, and runnable structure. Do not use fake implementations, placeholders, or TODOs. When debugging, identify the root cause and give the exact fix. Prefer concise answers for simple questions and deep step-by-step reasoning for complex engineering work. Use tools only when they materially improve accuracy; prefer the fewest tool calls that fully answer, and stop calling tools as soon as you have enough information. Never repeat a tool call that already returned the same result or failed. Never claim a tool was used unless it actually returned a result.`;
    if (useWebSearchTool) {
      fullSystemPrompt += `\n\n[WEB SEARCH REQUIRED] This request depends on current/live web information or asks to find websites/sources. You MUST call the web_search tool first before answering. Do not answer from memory when web search is available.`;
    }

    // 2. User Memory (if enabled)
    if (memory.enabled && memory.facts.length > 0) {
      fullSystemPrompt += `\n\n[User Memory Profile:\n${memory.facts.map((f) => `- ${f}`).join('\n')}]`;
    }

    // 3. Conversation summary (if exists)
    if (conv.summary) {
      fullSystemPrompt += `\n\n[Summary of earlier conversation:\n${conv.summary}]`;
    }

    payloadMessages.push({
      role: 'system',
      content: fullSystemPrompt,
    });

    // 5. Past conversation context (excluding the user message we just saved if already in pastMessages)
    for (const msg of pastMessages) {
      if (msg.id === userMsg.id) continue;
      payloadMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    // 6. Current message
    payloadMessages.push({
      role: 'user',
      content: cleanMessage,
    });

    const abortController = new AbortController();
    const abortUpstream = () => {
      if (!abortController.signal.aborted) abortController.abort();
    };
    req.on('aborted', abortUpstream);
    res.on('close', () => {
      if (!res.writableEnded) abortUpstream();
    });

    // AGENT EXECUTION under the planned budget. Every tool call passes through
    // the BudgetTracker (gating, per-call timeout, output clamp, loop protection).
    const tracker = new BudgetTracker(budgetPlan);
    const budgetedExecutor = createBudgetedToolExecutor(budgetPlan, tracker, abortController.signal);
    if (useAgent) {
      // Server-side observability only. Never sent to the client.
      console.log('[agent-budget] plan:', JSON.stringify(tracker.snapshot()));
    }

    // SERVER-SIDE HARD LIMIT: total wall-clock for this request, enforced by the
    // backend regardless of what the model or planner does.
    const totalTimeoutMs = budgetPlan.budget.TOTAL_AGENT_TIMEOUT_MS + 5000;
    const totalTimer = setTimeout(abortUpstream, totalTimeoutMs);
    totalTimer.unref?.();

    let accumulatedText = '';
    let pendingClientText = '';
    let lastClientFlush = Date.now();
    const modelUsed = getConfiguredModelId();

    const flushClientText = () => {
      if (!pendingClientText) return;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: pendingClientText })}\n\n`);
      pendingClientText = '';
      lastClientFlush = Date.now();
    };

    try {
      const streamGenerator = useAgent
        ? streamAgenticCompletion(payloadMessages, AGENT_TOOLS, budgetedExecutor, abortController.signal, useWebSearchTool ? 'web_search' : undefined, budgetPlan, tracker)
        : streamChatCompletion(payloadMessages, abortController.signal);

      for await (const event of streamGenerator) {
        if (abortController.signal.aborted) {
          break;
        }

        if (event.type === 'chunk' && event.text) {
          accumulatedText += event.text;
          pendingClientText += event.text;
          if (pendingClientText.length >= 48 || Date.now() - lastClientFlush >= 24) flushClientText();
        } else if (event.type === 'thinking') {
          res.write(`data: ${JSON.stringify({ type: 'thinking', text: event.text })}\n\n`);
        } else if (event.type === 'done') {
          flushClientText();
          break;
        }
      }

      // Handle empty response fallback
      if (!accumulatedText.trim() && !abortController.signal.aborted) {
        accumulatedText = 'The AI returned an empty response. Please try again.';
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: accumulatedText })}\n\n`);
      }

      // Save assistant message to Firestore
      const assistantMsg = await addMessage(
        user.uid,
        conv.id,
        'assistant',
        accumulatedText,
        modelUsed
      );

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
      const errorMsg = streamErr instanceof Error ? streamErr.message : 'AI stream failed';
      console.error('Streaming error:', errorMsg);

      // If partial text was received before error, save it
      if (accumulatedText.trim()) {
        await addMessage(user.uid, conv.id, 'assistant', accumulatedText, modelUsed).catch(() => {});
      }

      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
      res.end();
    } finally {
      clearTimeout(totalTimer);
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

    const payloadMessages: ChatMessagePayload[] = [];
    let fullSystemPrompt = systemConfig.systemPrompt;
    fullSystemPrompt += `\n\n[ABYSSGPT AGENT BEHAVIOR]\nBe highly capable, precise, and practical. For coding tasks, produce complete production-ready code with correct imports, types, error handling, security considerations, and runnable structure. Do not use fake implementations, placeholders, or TODOs. When debugging, identify the root cause and give the exact fix. Prefer concise answers for simple questions and deep step-by-step reasoning for complex engineering work. Use tools only when they materially improve accuracy; prefer the fewest tool calls that fully answer, and stop calling tools as soon as you have enough information. Never repeat a tool call that already returned the same result or failed. Never claim a tool was used unless it actually returned a result.`;
    if (memory.enabled && memory.facts.length > 0) {
      fullSystemPrompt += `\n\n[User Memory Profile:\n${memory.facts.map((f) => `- ${f}`).join('\n')}]`;
    }
    if (conv.summary) {
      fullSystemPrompt += `\n\n[Summary of earlier conversation:\n${conv.summary}]`;
    }
    payloadMessages.push({ role: 'system', content: fullSystemPrompt });

    // Include history up to the last user message
    const historySlice = messages.slice(0, messages.indexOf(lastUserMsg) + 1).slice(-contextLimit);
    for (const msg of historySlice) {
      payloadMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.write(
      `data: ${JSON.stringify({
        type: 'meta',
        conversationId: conv.id,
        isRegeneration: true,
        model: getConfiguredModelId(),
      })}\n\n`
    );

    const abortController = new AbortController();
    const abortUpstream = () => {
      if (!abortController.signal.aborted) abortController.abort();
    };
    req.on('aborted', abortUpstream);
    res.on('close', () => {
      if (!res.writableEnded) abortUpstream();
    });

    let accumulatedText = '';
    let pendingClientText = '';
    let lastClientFlush = Date.now();
    const modelUsed = getConfiguredModelId();

    const flushClientText = () => {
      if (!pendingClientText) return;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: pendingClientText })}\n\n`);
      pendingClientText = '';
      lastClientFlush = Date.now();
    };

    try {
      for await (const event of streamChatCompletion(payloadMessages, abortController.signal)) {
        if (abortController.signal.aborted) break;
        if (event.type === 'chunk' && event.text) {
          accumulatedText += event.text;
          pendingClientText += event.text;
          if (pendingClientText.length >= 48 || Date.now() - lastClientFlush >= 24) flushClientText();
        } else if (event.type === 'thinking') {
          res.write(`data: ${JSON.stringify({ type: 'thinking', text: event.text })}\n\n`);
        } else if (event.type === 'done') {
          flushClientText();
          break;
        }
      }

      if (!accumulatedText.trim() && !abortController.signal.aborted) {
        accumulatedText = 'The AI returned an empty response. Please try again.';
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: accumulatedText })}\n\n`);
      }

      const assistantMsg = await addMessage(user.uid, conv.id, 'assistant', accumulatedText, modelUsed);

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          messageId: assistantMsg.id,
          conversationId: conv.id,
        })}\n\n`
      );
      res.end();
    } catch (streamErr: unknown) {
      const errorMsg = streamErr instanceof Error ? streamErr.message : 'Regeneration failed';
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
      res.end();
    }
  }
);
