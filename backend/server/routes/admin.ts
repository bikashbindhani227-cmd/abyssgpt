import { Router } from 'express';
import type { Response } from 'express';
import crypto from 'node:crypto';
import { createAdminSessionToken, requireAdmin, type AuthenticatedRequest, verifyAdminSessionToken } from '../middleware/auth.js';
import { adminDb } from '../config/firebaseAdmin.js';
import {
  getSystemPromptConfig,
  updateSystemPrompt,
  getAppLimitsConfig,
  updateAppLimitsConfig,
  getAppSettingsConfig,
  updateAppSettingsConfig,
} from '../services/configService.js';
import {
  getUserById,
  getAllUsers,
  grantUserPremium,
  removeUserPremium,
  setUserBanStatus,
  resetUserDailyUsage,
  setUserCustomLimits,
} from '../services/userService.js';
import type { UserProfile, AdminDashboardStats } from '../../types.js';

export const adminRouter = Router();

const failedAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_MS = 5 * 60 * 1000;

function getClientKey(req: AuthenticatedRequest): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

adminRouter.post('/auth/login', (req: AuthenticatedRequest, res: Response): void => {
  const configuredPassword = String(process.env.ADMIN_PASSWORD || '');
  if (!configuredPassword) {
    res.status(503).json({ error: 'Admin password is not configured on the backend.' });
    return;
  }

  const key = getClientKey(req);
  const attempt = failedAttempts.get(key);
  if (attempt?.blockedUntil && attempt.blockedUntil > Date.now()) {
    res.status(429).json({ error: 'Too many failed admin login attempts. Try again later.' });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const a = Buffer.from(password);
  const b = Buffer.from(configuredPassword);
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!matches) {
    const nextCount = (attempt?.count || 0) + 1;
    failedAttempts.set(key, {
      count: nextCount,
      blockedUntil: nextCount >= MAX_FAILED_ATTEMPTS ? Date.now() + BLOCK_MS : 0,
    });
    res.status(401).json({ error: 'Invalid admin password.' });
    return;
  }

  failedAttempts.delete(key);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ token: createAdminSessionToken(), expiresInSeconds: Number(process.env.ADMIN_SESSION_TTL_SECONDS || 43200) });
});

adminRouter.get('/auth/status', (req: AuthenticatedRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  if (verifyAdminSessionToken(req.header('x-admin-token'))) {
    res.json({ authenticated: true });
    return;
  }
  res.status(401).json({ authenticated: false, error: 'Admin authentication required.' });
});

// Protect all admin management routes. Password login/status stay public.
adminRouter.use(requireAdmin);

// Dashboard stats
adminRouter.get('/dashboard', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const allUsers = await getAllUsers();
    const today = new Date().toISOString().slice(0, 10);

    let totalUsers = 0;
    let freeUsers = 0;
    let premiumUsers = 0;
    let activeUsersToday = 0;
    let messagesToday = 0;
    let bannedUsers = 0;

    allUsers.forEach((data) => {
      totalUsers++;
      if (data.plan === 'premium') {
        premiumUsers++;
      } else {
        freeUsers++;
      }
      if (data.isBanned) {
        bannedUsers++;
      }
      if (data.lastUsageDate === today) {
        messagesToday += data.dailyMessageCount || 0;
      }
      if (data.lastActiveAt && data.lastActiveAt.startsWith(today)) {
        activeUsersToday++;
      }
    });

    const stats: AdminDashboardStats = {
      totalUsers,
      freeUsers,
      premiumUsers,
      activeUsersToday,
      messagesToday,
      bannedUsers,
      aiRequestsTotal: messagesToday,
      failedAiRequests: 0,
    };

    res.json(stats);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to load dashboard stats';
    res.status(500).json({ error: errorMsg });
  }
});

// List / Search users
adminRouter.get('/users', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const query = (req.query.q as string || '').toLowerCase().trim();
    let users = await getAllUsers();
    users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (query) {
      users = users.filter(
        (u) =>
          u.uid.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          (u.displayName && u.displayName.toLowerCase().includes(query))
      );
    }

    res.json(users.slice(0, 200));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to search users';
    res.status(500).json({ error: errorMsg });
  }
});

// Get user by UID
adminRouter.get('/users/:uid', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await getUserById(req.params.uid);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to get user';
    res.status(500).json({ error: errorMsg });
  }
});

// Update custom limits for a user
adminRouter.patch('/users/:uid', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { customDailyMessageLimit, customRateLimitPerMinute } = req.body;
    const updated = await setUserCustomLimits(
      req.params.uid,
      customDailyMessageLimit !== undefined ? customDailyMessageLimit : null,
      customRateLimitPerMinute !== undefined ? customRateLimitPerMinute : null
    );
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update user';
    res.status(500).json({ error: errorMsg });
  }
});

// Grant premium to user
adminRouter.post('/users/:uid/premium', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const durationDays = Number(req.body.durationDays) || 30;
    const updated = await grantUserPremium(req.params.uid, durationDays);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to grant premium';
    res.status(500).json({ error: errorMsg });
  }
});

// Remove premium from user
adminRouter.delete('/users/:uid/premium', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updated = await removeUserPremium(req.params.uid);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to remove premium';
    res.status(500).json({ error: errorMsg });
  }
});

// Ban user
adminRouter.post('/users/:uid/ban', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updated = await setUserBanStatus(req.params.uid, true);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to ban user';
    res.status(500).json({ error: errorMsg });
  }
});

// Unban user
adminRouter.post('/users/:uid/unban', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updated = await setUserBanStatus(req.params.uid, false);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to unban user';
    res.status(500).json({ error: errorMsg });
  }
});

// Reset user daily message usage
adminRouter.post('/users/:uid/reset-usage', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updated = await resetUserDailyUsage(req.params.uid);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to reset usage';
    res.status(500).json({ error: errorMsg });
  }
});

// System prompt config
adminRouter.get('/system-prompt', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const config = await getSystemPromptConfig();
    res.json(config);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to get system prompt';
    res.status(500).json({ error: errorMsg });
  }
});

adminRouter.patch('/system-prompt', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { systemPrompt } = req.body;
    if (!systemPrompt || typeof systemPrompt !== 'string') {
      res.status(400).json({ error: 'Valid systemPrompt string is required' });
      return;
    }
    const updated = await updateSystemPrompt(systemPrompt, req.user!.email || req.user!.uid);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update system prompt';
    res.status(500).json({ error: errorMsg });
  }
});

// PUT alias for clients that send PUT instead of PATCH (frontend compatibility)
adminRouter.put('/system-prompt', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { systemPrompt } = req.body;
    if (!systemPrompt || typeof systemPrompt !== 'string') {
      res.status(400).json({ error: 'Valid systemPrompt string is required' });
      return;
    }
    const updated = await updateSystemPrompt(systemPrompt, req.user!.email || req.user!.uid);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update system prompt';
    res.status(500).json({ error: errorMsg });
  }
});

// Reset system prompt to the default configured via DEFAULT_SYSTEM_PROMPT env var.
adminRouter.post('/system-prompt/reset', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const defaultPrompt = String(process.env.DEFAULT_SYSTEM_PROMPT || '').trim();
    if (!defaultPrompt) {
      res.status(503).json({ error: 'No default system prompt is configured on the backend.' });
      return;
    }
    const updated = await updateSystemPrompt(defaultPrompt, req.user!.email || req.user!.uid);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to reset system prompt';
    res.status(500).json({ error: errorMsg });
  }
});

// Test a candidate system prompt against a fixed sanity message. Returns the
// model's response so admins can preview behaviour without saving the change.
adminRouter.post('/system-prompt/test', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { systemPrompt, testMessage } = req.body;
    if (!systemPrompt || typeof systemPrompt !== 'string') {
      res.status(400).json({ error: 'A candidate systemPrompt string is required.' });
      return;
    }
    const message = typeof testMessage === 'string' && testMessage.trim()
      ? testMessage.trim().slice(0, 1000)
      : 'Reply with a single short sentence confirming you understood the system prompt.';
    // Use the model adapter directly so this works for any configured MODEL_ID.
    const { createModelAdapter } = await import('../services/modelAdapter.js');
    const adapter = createModelAdapter();
    const response = await adapter.generateCompletion([
      { role: 'system', content: systemPrompt.slice(0, 8000) },
      { role: 'user', content: message },
    ]);
    res.json({
      response: response.text || '(empty response)',
      toolCalls: response.toolCalls.length,
      finishReason: response.finishReason,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to test system prompt';
    res.status(500).json({ error: errorMsg });
  }
});

// Limits config
adminRouter.get('/limits', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const config = await getAppLimitsConfig();
    res.json(config);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to get limits';
    res.status(500).json({ error: errorMsg });
  }
});

adminRouter.patch('/limits', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updated = await updateAppLimitsConfig(req.body, req.user!.email || req.user!.uid);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update limits';
    res.status(500).json({ error: errorMsg });
  }
});

// PUT alias for clients that send PUT instead of PATCH (frontend compatibility)
adminRouter.put('/limits', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updated = await updateAppLimitsConfig(req.body, req.user!.email || req.user!.uid);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update limits';
    res.status(500).json({ error: errorMsg });
  }
});

// App settings
adminRouter.get('/settings', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const config = await getAppSettingsConfig();
    res.json(config);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to get settings';
    res.status(500).json({ error: errorMsg });
  }
});

adminRouter.patch('/settings', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updated = await updateAppSettingsConfig(req.body, req.user!.email || req.user!.uid);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update settings';
    res.status(500).json({ error: errorMsg });
  }
});

// PUT alias for clients that send PUT instead of PATCH (frontend compatibility)
adminRouter.put('/settings', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updated = await updateAppSettingsConfig(req.body, req.user!.email || req.user!.uid);
    res.json(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update settings';
    res.status(500).json({ error: errorMsg });
  }
});
