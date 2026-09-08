import { task } from '@trigger.dev/sdk';
import { buildAgentContext } from '../server/services/agentService.js';

export const agentBackgroundTask = task({
  id: 'abyssgpt-agent-background',
  retry: { maxAttempts: 3, factor: 1.8, minTimeoutInMs: 500, maxTimeoutInMs: 10_000, randomize: true },
  run: async (payload: { prompt: string }) => {
    return await buildAgentContext(payload.prompt, true);
  },
});
