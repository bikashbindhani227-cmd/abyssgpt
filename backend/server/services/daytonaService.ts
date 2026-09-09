import dotenv from 'dotenv';
dotenv.config();

const API_BASE = (process.env.DAYTONA_API_URL || 'https://app.daytona.io/api').replace(/\/$/, '');
const TOOLBOX_BASE = (process.env.DAYTONA_TOOLBOX_URL || 'https://proxy.app.daytona.io/toolbox').replace(/\/$/, '');

export interface DaytonaRunOptions {
  /**
   * Budget-driven sandbox execution time in seconds (hard ceiling: 120s).
   * The planner sets this per request from MAX_CODE_EXECUTION_TIME_MS.
   */
  timeoutSec?: number;
}

export async function runCodeInDaytona(
  code: string,
  language: 'python' | 'javascript' | 'typescript',
  options: DaytonaRunOptions = {},
): Promise<string | null> {
  const apiKey = process.env.DAYTONA_API_KEY?.trim();
  if (!apiKey) return null;

  // 0 => code execution disabled by the budget planner.
  if (options.timeoutSec === 0) return null;
  const timeoutSec = Math.max(5, Math.min(Math.floor(options.timeoutSec || 20), 120));
  const hardDeadlineMs = Math.min((timeoutSec + 5) * 1000, 120000);

  const create = await fetch(`${API_BASE}/sandbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ language, autoDeleteInterval: 5 }),
  });
  if (!create.ok) return null;
  const sandbox = await create.json() as { id?: string; name?: string };
  const sandboxId = sandbox.id || sandbox.name;
  if (!sandboxId) return null;
  try {
    const response = await fetch(`${TOOLBOX_BASE}/${encodeURIComponent(sandboxId)}/process/code-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ code, language, timeout: timeoutSec }),
      signal: AbortSignal.timeout(hardDeadlineMs),
    });
    if (!response.ok) return null;
    const data = await response.json() as { result?: string; output?: string };
    return String(data.result ?? data.output ?? '').slice(0, 20000);
  } catch {
    return null;
  } finally {
    fetch(`${API_BASE}/sandbox/${encodeURIComponent(sandboxId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});
  }
}
