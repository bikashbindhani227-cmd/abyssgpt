import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { getAppLimitsConfig, getAppSettingsConfig } from '../services/configService.js';
import { calculateEffectiveLimits } from '../services/userService.js';
import { persistentStorage } from '../services/storage.js';
import { adminDb } from '../config/firebaseAdmin.js';
import { sendActiveNotificationEmail } from '../services/emailService.js';
import { listConversations, createConversation, addMessage } from '../services/conversationService.js';
import type { UserProfile, UserAdSubmission } from '../../types.js';

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

// Update user profile display name or preferences
userRouter.patch(
  '/profile',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { displayName, hideAds } = req.body;
      const updates: Partial<UserProfile> = {};

      if (displayName !== undefined) {
        if (!displayName || typeof displayName !== 'string') {
          res.status(400).json({ error: 'Display name cannot be empty.' });
          return;
        }
        updates.displayName = displayName.trim().slice(0, 50);
      }

      if (hideAds !== undefined) {
        const isPremiumOrAdmin = req.user!.plan === 'premium' || req.user!.isAdmin;
        if (!isPremiumOrAdmin && hideAds === true) {
          res.status(403).json({ error: 'Ad-free toggle is reserved exclusively for Premium members.' });
          return;
        }
        updates.hideAds = Boolean(hideAds);
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'No fields provided to update.' });
        return;
      }

      updates.updatedAt = new Date().toISOString();

      const updated = persistentStorage.updateUser(req.user!.uid, updates);

      if (hasServiceAccount) {
        adminDb.collection('users').doc(req.user!.uid).set(
          updates,
          { merge: true }
        ).catch(() => {});
      }

      res.json(updated || { ...req.user!, ...updates });
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

// Trigger automatic proactive greeting and "I am active" notification email
userRouter.post(
  '/notify-active',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const origin = req.get('origin') || req.get('referer') || '';

      // 1. Dispatch email notification in background
      let emailResult = { success: true, delivered: false, message: 'Skipped' };
      if (user.email) {
        emailResult = await sendActiveNotificationEmail({
          to: user.email,
          name: user.displayName,
          appUrl: origin,
        });
      }

      // 2. Check if user needs a proactive welcome conversation
      let welcomeConvId: string | null = null;
      try {
        const convs = await listConversations(user.uid);
        if (convs.length === 0) {
          const welcomeConv = await createConversation(user.uid, 'Welcome to AbyssGPT 👋');
          const greetingText = `Hello ${user.displayName || 'there'}! 👋 I am active, online, and ready to assist you.\n\nYou can ask me anything — from writing and debugging code to researching any topic, drafting documents, or brainstorming ideas. What would you like to build or explore today?`;
          await addMessage(user.uid, welcomeConv.id, 'assistant', greetingText);
          welcomeConvId = welcomeConv.id;
        }
      } catch (convErr) {
        console.warn('Could not create initial welcome conversation:', convErr);
      }

      res.json({
        success: true,
        email: emailResult,
        welcomeConversationId: welcomeConvId,
        message: 'Active notification processed.',
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to process active notification';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Get current user's submitted ads
userRouter.get(
  '/ads',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const ads = persistentStorage.getAdSubmissions(req.user!.uid);
      res.json({ ads });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch ad submissions';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Submit a new ad request
userRouter.post(
  '/ads',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { title, description, linkUrl, bannerUrl, contactInfo, durationDays, budgetInr, notes } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Ad headline/title is required.' });
        return;
      }
      if (!linkUrl || typeof linkUrl !== 'string' || !linkUrl.trim()) {
        res.status(400).json({ error: 'Destination URL (link) is required.' });
        return;
      }
      if (!contactInfo || typeof contactInfo !== 'string' || !contactInfo.trim()) {
        res.status(400).json({ error: 'Contact info (Telegram handle, WhatsApp, or email) is required so we can reach you.' });
        return;
      }

      const now = new Date().toISOString();
      const newAd: UserAdSubmission = {
        id: `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: user.uid,
        userEmail: user.email || '',
        userDisplayName: user.displayName || 'Anonymous User',
        title: title.trim().slice(0, 80),
        description: (description || '').toString().trim().slice(0, 300),
        linkUrl: linkUrl.trim().slice(0, 500),
        bannerUrl: bannerUrl ? bannerUrl.toString().trim().slice(0, 500) : undefined,
        contactInfo: contactInfo.trim().slice(0, 100),
        durationDays: Number(durationDays) || 7,
        budgetInr: budgetInr ? Number(budgetInr) : undefined,
        notes: notes ? notes.toString().trim().slice(0, 500) : undefined,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };

      persistentStorage.saveAdSubmission(newAd);

      if (hasServiceAccount) {
        adminDb.collection('adSubmissions').doc(newAd.id).set(newAd).catch(() => {});
      }

      res.status(201).json({
        success: true,
        ad: newAd,
        message: 'Your ad request has been submitted successfully! We will review and activate it shortly.',
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to submit ad request';
      res.status(500).json({ error: errorMsg });
    }
  }
);


