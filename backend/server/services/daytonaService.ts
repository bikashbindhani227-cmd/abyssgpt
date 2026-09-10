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
  cwd?: string;
  language?: 'python' | 'javascript' | 'typescript';
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

/**
 * Execute a shell command inside an isolated Daytona sandbox.
 * Attempts process execution first; if the toolbox expects code execution,
 * runs through a standard Python/Node subprocess runner inside the sandbox.
 */
export async function runCommandInDaytona(
  command: string,
  options: DaytonaRunOptions = {},
): Promise<string | null> {
  const apiKey = process.env.DAYTONA_API_KEY?.trim();
  if (!apiKey) return null;

  if (options.timeoutSec === 0) return null;
  const timeoutSec = Math.max(5, Math.min(Math.floor(options.timeoutSec || 30), 120));
  const hardDeadlineMs = Math.min((timeoutSec + 5) * 1000, 120000);
  const sandboxLang = options.language || 'python';

  const create = await fetch(`${API_BASE}/sandbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ language: sandboxLang, autoDeleteInterval: 5 }),
  });
  if (!create.ok) return null;
  const sandbox = await create.json() as { id?: string; name?: string };
  const sandboxId = sandbox.id || sandbox.name;
  if (!sandboxId) return null;

  try {
    // 1. Try direct process execution if supported by the Daytona toolbox
    const executeUrl = `${TOOLBOX_BASE}/${encodeURIComponent(sandboxId)}/process/execute`;
    const execRes = await fetch(executeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ command, cwd: options.cwd, timeout: timeoutSec }),
      signal: AbortSignal.timeout(hardDeadlineMs),
    }).catch(() => null);

    if (execRes && execRes.ok) {
      const data = await execRes.json() as { result?: string; output?: string; stdout?: string; stderr?: string };
      const out = data.output ?? data.result ?? [data.stdout, data.stderr].filter(Boolean).join('\n');
      return String(out || '').slice(0, 20000);
    }

    // 2. Fallback to executing the command via subprocess inside code-run
    const runnerScript = `
import subprocess, sys
try:
    res = subprocess.run(${JSON.stringify(command)}, shell=True, capture_output=True, text=True, timeout=${timeoutSec})
    output = res.stdout + "\\n" + res.stderr
    print(output.strip())
    if res.returncode != 0:
        print(f"\\n[Exit code: {res.returncode}]")
except Exception as e:
    print(f"Execution failed: {e}")
`.trim();

    const codeRunRes = await fetch(`${TOOLBOX_BASE}/${encodeURIComponent(sandboxId)}/process/code-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ code: runnerScript, language: 'python', timeout: timeoutSec }),
      signal: AbortSignal.timeout(hardDeadlineMs),
    });

    if (!codeRunRes.ok) return null;
    const data = await codeRunRes.json() as { result?: string; output?: string };
    return String(data.result ?? data.output ?? '').slice(0, 20000);
  } catch {
    return null;
  } finally {
    fetch(`${API_BASE}/sandbox/${encodeURIComponent(sandboxId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});
  }
}

/**
 * Execute a command with full project files staged into the Daytona sandbox.
 */
export async function runProjectInDaytona(
  files: Record<string, string>,
  command: string,
  options: DaytonaRunOptions = {},
): Promise<string | null> {
  const apiKey = process.env.DAYTONA_API_KEY?.trim();
  if (!apiKey) return null;

  const timeoutSec = Math.max(5, Math.min(Math.floor(options.timeoutSec || 40), 120));

  // Stager script: writes each file to disk, then executes command
  const serializedFiles = JSON.stringify(files);
  const stagerScript = `
import os, json, subprocess

files = json.loads(${JSON.stringify(serializedFiles)})
for path, content in files.items():
    dirname = os.path.dirname(path)
    if dirname:
        os.makedirs(dirname, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

res = subprocess.run(${JSON.stringify(command)}, shell=True, capture_output=True, text=True, timeout=${timeoutSec})
out = (res.stdout + "\\n" + res.stderr).strip()
print(out)
if res.returncode != 0:
    print(f"\\n[Exit code: {res.returncode}]")
`.trim();

  return runCodeInDaytona(stagerScript, 'python', options);
}
