import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversationTitle,
  deleteConversation,
  getConversationMessages,
  deleteMessage,
} from '../services/conversationService.js';

export const conversationsRouter = Router();

// List conversations
conversationsRouter.get(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const convs = await listConversations(req.user!.uid);
      res.json(convs);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to list conversations';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Create conversation
conversationsRouter.post(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const title = req.body?.title || 'New Conversation';
      const conv = await createConversation(req.user!.uid, title);
      res.status(201).json(conv);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create conversation';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Get conversation details
conversationsRouter.get(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const conv = await getConversation(req.user!.uid, req.params.id);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      res.json(conv);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get conversation';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Update conversation title
conversationsRouter.patch(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const title = req.body?.title;
      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'Title is required.' });
        return;
      }
      const updated = await updateConversationTitle(req.user!.uid, req.params.id, title);
      if (!updated) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      res.json(updated);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update conversation';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Delete conversation
conversationsRouter.delete(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await deleteConversation(req.user!.uid, req.params.id);
      res.json({ success: true, message: 'Conversation deleted.' });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete conversation';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Get conversation messages
conversationsRouter.get(
  '/:id/messages',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limit = Number(req.query.limit) || 100;
      const messages = await getConversationMessages(req.user!.uid, req.params.id, limit);
      res.json(messages);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get messages';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Delete message
conversationsRouter.delete(
  '/:id/messages/:messageId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await deleteMessage(req.user!.uid, req.params.id, req.params.messageId);
      res.json({ success: true, message: 'Message deleted.' });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete message';
      res.status(500).json({ error: errorMsg });
    }
  }
);
