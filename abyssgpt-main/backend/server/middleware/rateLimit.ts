import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { getAppLimitsConfig } from '../services/configService.js';
import { calculateEffectiveLimits } from '../services/userService.js';

interface RequestRecord {
  timestamps: number[];
}

const userRequestHistory = new Map<string, RequestRecord>();

// Clean up stale records periodically
setInterval(() => {
  const oneMinuteAgo = Date.now() - 60 * 1000;
  for (const [uid, record] of userRequestHistory.entries()) {
    record.timestamps = record.timestamps.filter((ts) => ts > oneMinuteAgo);
    if (record.timestamps.length === 0) {
      userRequestHistory.delete(uid);
    }
  }
}, 30000);

export async function checkRateLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user) {
    next();
    return;
  }

  // Admins bypass normal rate limits for operational management
  if (user.isAdmin) {
    next();
    return;
  }

  const limitsConfig = await getAppLimitsConfig();
  const { rateLimit } = calculateEffectiveLimits(user, limitsConfig);

  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;

  let record = userRequestHistory.get(user.uid);
  if (!record) {
    record = { timestamps: [] };
    userRequestHistory.set(user.uid, record);
  }

  // Filter timestamps within the last 60 seconds
  record.timestamps = record.timestamps.filter((ts) => ts > oneMinuteAgo);

  if (record.timestamps.length >= rateLimit) {
    const oldestTimestamp = record.timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldestTimestamp + 60000 - now) / 1000));

    res.set('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: `Rate limit exceeded. You can send up to ${rateLimit} requests per minute on your current plan. Please try again in ${retryAfterSec} seconds or upgrade to Premium for higher limits.`,
      retryAfter: retryAfterSec,
      limit: rateLimit,
    });
    return;
  }

  record.timestamps.push(now);
  next();
}
