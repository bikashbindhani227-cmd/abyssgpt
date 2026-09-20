import dotenv from 'dotenv';
dotenv.config();
import { normalizeAiCreditsBaseUrl } from './modelAdapter.js';

export interface WebSearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface WebSearchResponse {
  query: string;
  answer?: string;
  results: WebSearchResultItem[];
  citations?: string[];
  modelUsed?: string;
}

export interface WebSearchOptions {
  maxResults?: number;
  timeoutMs?: number;
  searchDepth?: 'basic' | 'advanced';
  modelId?: string;
  signal?: AbortSignal;
}

export const DEFAULT_PERPLEXITY_MODEL = 'perplexity/sonar-pro';

const DEFAULT_TIMEOUT_MS = 25000;

function resolveConfig(explicitModel?: string) {
  const apiKey = (process.env.PERPLEXITY_API_KEY || process.env.AICREDITS_API_KEY || '').trim();
  const rawBaseUrl = process.env.PERPLEXITY_BASE_URL || process.env.AICREDITS_BASE_URL;
  const baseUrl = normalizeAiCreditsBaseUrl(rawBaseUrl);
  // Default to 'perplexity/sonar-pro' directly in code so no Render secret is required
  const preferredModel = (explicitModel || process.env.PERPLEXITY_MODEL_ID || DEFAULT_PERPLEXITY_MODEL).trim();

  // Model fallback candidates for Perplexity on AI Credits / OpenAI-compatible proxies
  const candidateModels = [
    preferredModel,
    'perplexity/sonar-pro',
    'sonar-pro',
    'perplexity/sonar',
    'sonar',
    'sonar-reasoning',
  ].filter(Boolean);

  // Deduplicate while preserving order
  const uniqueModels = Array.from(new Set(candidateModels));

  return { apiKey, baseUrl, candidateModels: uniqueModels };
}

/**
 * Searches the live web using the Perplexity AI model through AI Credits.
 * This delivers deep real-time research, verified facts, sources, and citations.
 * Even when small default models are active, they receive this high-grade agentic research data.
 */
export async function searchPerplexityWeb(
  query: string,
  options: WebSearchOptions = {},
): Promise<WebSearchResponse | null> {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) return null;

  const { apiKey, baseUrl, candidateModels } = resolveConfig(options.modelId);
  if (!apiKey) {
    console.warn('[perplexity-search] Neither PERPLEXITY_API_KEY nor AICREDITS_API_KEY is configured.');
    return null;
  }

  const timeoutMs = Math.max(3000, Math.min(Math.floor(options.timeoutMs || DEFAULT_TIMEOUT_MS), 90000));
  const maxResults = Math.max(1, Math.min(Math.floor(options.maxResults || 10), 20));

  let lastError: unknown = null;

  for (const modelToTry of candidateModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Perplexity search timeout')), timeoutMs);

    const onCallerAbort = () => controller.abort(options.signal?.reason);
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeout);
        return null;
      }
      options.signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const endpoint = `${baseUrl}/chat/completions`;
      const systemPrompt = options.searchDepth === 'advanced'
        ? 'You are AbyssGPT live web research engine. Search the live web thoroughly, analyze up-to-date sources, and return an exhaustive, highly detailed factual report with verified figures, names, dates, quotes, and full clickable Markdown source URLs [Title](https://...). When recommending or finding websites, platforms, tools, streaming/movie websites, or portals, provide their exact active URLs and domains. Do NOT mention any company, search engine, provider, or model names.'
        : 'You are AbyssGPT live web research engine with real-time web access. Search the current web to answer the query accurately. When the user asks to find websites, tools, resources, movies, streams, or links, search and find active, working websites and provide exact clickable Markdown links [Website Name](https://...) along with helpful details and source URLs. Do NOT mention any company, search engine, provider, or model names.';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelToTry,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: trimmedQuery },
          ],
          stream: false,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onCallerAbort);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        // If model not found or unsupported endpoint on this specific model ID, try next candidate
        if (response.status === 404 || response.status === 400 && /model|not found|unsupported/i.test(errorBody)) {
          console.warn(`[perplexity-search] Model ${modelToTry} not available (${response.status}), trying next candidate...`);
          lastError = new Error(`Model ${modelToTry} error: ${errorBody.slice(0, 300)}`);
          continue;
        }

        console.warn(`[perplexity-search] API returned ${response.status}: ${errorBody.slice(0, 300)}`);
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        citations?: string[];
      };

      let content = data.choices?.[0]?.message?.content?.trim() || '';
      if (!content) {
        return null;
      }

      // Scrub any third-party provider or engine names from the search summary
      content = content
        .replace(/\b(?:perplexity\s*ai|perplexity\.ai|perplexity)\b/gi, 'Live Web Search')
        .replace(/\b(?:sonar-pro|sonar-reasoning|sonar|sonar-medium|sonar-small)\b/gi, 'web search engine');

      // Extract markdown links [Title](https://...) from the content (excluding provider links)
      const markdownLinks: Array<{ title: string; url: string }> = [];
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s<>"')]+)\)/g;
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(content)) !== null) {
        if (!/perplexity\.ai/i.test(match[2])) {
          markdownLinks.push({ title: match[1], url: match[2] });
        }
      }

      // Extract citations if provided directly by API or from markdown links (filter out provider links)
      const rawCitations: string[] = Array.isArray(data.citations)
        ? data.citations.filter((c) => typeof c === 'string' && /^https?:\/\//i.test(c) && !/perplexity\.ai/i.test(c))
        : [];

      // Extract URLs from content if raw citations are empty
      const urlMatches = (content.match(/\bhttps?:\/\/[^\s<>"')]+/gi) || []).filter((u) => !/perplexity\.ai/i.test(u));
      const allUrls = Array.from(new Set([...rawCitations, ...markdownLinks.map((m) => m.url), ...urlMatches])).slice(0, maxResults);

      const items: WebSearchResultItem[] = [];
      const seenUrls = new Set<string>();

      // First prioritize explicit markdown links with titles
      for (const ml of markdownLinks) {
        if (!seenUrls.has(ml.url) && items.length < maxResults) {
          seenUrls.add(ml.url);
          items.push({
            title: ml.title,
            url: ml.url,
            content: `Active Resource: [${ml.title}](${ml.url})`,
            score: 1.0,
          });
        }
      }

      // Then fill with citations and other found URLs
      for (const u of allUrls) {
        if (!seenUrls.has(u) && items.length < maxResults) {
          seenUrls.add(u);
          let domain = u;
          try {
            domain = new URL(u).hostname.replace(/^www\./, '');
          } catch {}
          items.push({
            title: domain,
            url: u,
            content: `Reference: ${u}`,
            score: 0.9 - (items.length * 0.05),
          });
        }
      }

      // If no URLs were found in citations, create at least a generic reference to the synthesized output
      if (!items.length) {
        items.push({
          title: 'Live Web Reference',
          url: 'https://duckduckgo.com',
          content: content.slice(0, 1500),
          score: 1.0,
        });
      }

      return {
        query: trimmedQuery,
        answer: content,
        results: items,
        citations: allUrls,
        modelUsed: 'live-web-search',
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onCallerAbort);
      lastError = err;
      if (options.signal?.aborted) {
        return null;
      }
      console.warn(`[perplexity-search] Error with model ${modelToTry}:`, err instanceof Error ? err.message : String(err));
    }
  }

  console.warn('[perplexity-search] All Perplexity model candidates failed.', lastError instanceof Error ? lastError.message : String(lastError));
  return null;
}
