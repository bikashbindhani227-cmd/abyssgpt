import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  getUserMemory,
  updateUserMemory,
  deleteMemoryFact,
  clearAllMemory,
} from '../services/conversationService.js';

export const memoryRouter = Router();

// Get memory
memoryRouter.get(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const memory = await getUserMemory(req.user!.uid);
      res.json(memory);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch memory';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Toggle memory on/off or update facts
memoryRouter.patch(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { enabled, facts } = req.body;
      const updates: { enabled?: boolean; facts?: string[] } = {};
      if (typeof enabled === 'boolean') updates.enabled = enabled;
      if (Array.isArray(facts)) updates.facts = facts.filter((f) => typeof f === 'string' && f.trim());

      const updated = await updateUserMemory(req.user!.uid, updates);
      res.json(updated);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update memory';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Delete a specific fact by index
memoryRouter.delete(
  '/:index',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const index = parseInt(req.params.index, 10);
      if (isNaN(index)) {
        res.status(400).json({ error: 'Invalid index parameter.' });
        return;
      }
      const updated = await deleteMemoryFact(req.user!.uid, index);
      res.json(updated);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete memory item';
      res.status(500).json({ error: errorMsg });
    }
  }
);

// Clear all memory
memoryRouter.delete(
  '/all',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const updated = await clearAllMemory(req.user!.uid);
      res.json(updated);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to clear memory';
      res.status(500).json({ error: errorMsg });
    }
  }
);
