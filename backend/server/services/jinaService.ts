import dotenv from 'dotenv';
dotenv.config();

const JINA_BASE_URL = 'https://r.jina.ai/';

export interface JinaReadOptions {
  /** Budget-driven cap on extracted characters (hard ceiling: 80000). */
  maxChars?: number;
  /** Budget-driven per-call timeout in ms (hard ceiling: 90000). */
  timeoutMs?: number;
}

export async function readUrlWithJina(url: string, options: JinaReadOptions = {}): Promise<string | null> {
  const apiKey = process.env.JINA_API_KEY?.trim();
  if (!apiKey || !/^https?:\/\//i.test(url)) return null;
  const maxChars = Math.max(2000, Math.min(Math.floor(options.maxChars || 30000), 80000));
  const timeoutMs = Math.max(3000, Math.min(Math.floor(options.timeoutMs || 12000), 90000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${JINA_BASE_URL}${url}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/plain',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const text = await response.text();
    return text.slice(0, maxChars);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
