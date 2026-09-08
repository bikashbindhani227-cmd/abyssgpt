import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { getAppLimitsConfig, getAppSettingsConfig } from '../services/configService.js';
import { calculateEffectiveLimits } from '../services/userService.js';
import { persistentStorage } from '../services/storage.js';
import { adminDb } from '../config/firebaseAdmin.js';
import type { UserProfile } from '../../types.js';

const hasServiceAccount = Boolean(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL);

export const userRouter = Router();

// Get current user profile and calculated limits
userRouter.get(
  '/profile',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const limitsConfig = await getAppLimitsConfig();
      const limits = calculateEffectiveLimits(user, limitsConfig);

      res.json({
        user,
        limits,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch profile';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Update user profile display name
userRouter.patch(
  '/profile',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { displayName } = req.body;
      if (!displayName || typeof displayName !== 'string') {
        res.status(400).json({ error: 'Display name is required.' });
        return;
      }

      const cleanName = displayName.trim().slice(0, 50);
      const updated = persistentStorage.updateUser(req.user!.uid, {
        displayName: cleanName,
      });

      if (hasServiceAccount) {
        adminDb.collection('users').doc(req.user!.uid).set(
          { displayName: cleanName, updatedAt: new Date().toISOString() },
          { merge: true }
        ).catch(() => {});
      }

      res.json(updated || req.user!);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update profile';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Public/authenticated premium information route
userRouter.get(
  '/premium',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const settings = await getAppSettingsConfig();
      const limitsConfig = await getAppLimitsConfig();

      res.json({
        currentPlan: user.plan,
        premiumExpiresAt: user.premiumExpiresAt,
        priceInr: settings.premiumPriceInr,
        telegramUsername: settings.telegramUsername,
        benefits: settings.premiumBenefits,
        limits: limitsConfig.premium,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch premium info';
      res.status(500).json({ error: errorMsg });
    }
  }
);
