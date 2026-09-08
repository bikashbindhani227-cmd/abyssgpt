import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF || 'proj_abyssgpt',
  dirs: ['./trigger'],
  retries: { enabledInDev: false },
});
