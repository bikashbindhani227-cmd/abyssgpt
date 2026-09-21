import dotenv from 'dotenv';
dotenv.config();
import {
  searchPerplexityWeb,
  type WebSearchResultItem,
  type WebSearchResponse,
} from './perplexitySearchService.js';

export interface TavilySearchResult extends WebSearchResultItem {}
export interface TavilySearchResponse extends WebSearchResponse {}

export interface TavilySearchOptions {
  maxResults?: number;
  timeoutMs?: number;
  searchDepth?: 'basic' | 'advanced';
}

/**
 * Searches the live web using the Tavily Search API.
 * Cleans output, extracts verified active resources, and scrubs third-party provider names.
 */
export async function searchTavilyWeb(
  query: string,
  options: TavilySearchOptions = {},
): Promise<WebSearchResponse | null> {
  const apiKey = (process.env.TAVILY_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[tavily-search] TAVILY_API_KEY is not configured.');
    return null;
  }

  const timeoutMs = Math.max(3000, Math.min(Math.floor(options.timeoutMs || 25000), 60000));
  const maxResults = Math.max(1, Math.min(Math.floor(options.maxResults || 5), 15));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Tavily search timeout')), timeoutMs);

  try {
    const endpoint = 'https://api.tavily.com/search';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: options.searchDepth === 'advanced' ? 'advanced' : 'basic',
        max_results: maxResults,
        include_answer: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(`[tavily-search] API returned ${response.status}: ${errorText.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
    };

    let answer = typeof data.answer === 'string' ? data.answer.trim() : '';

    const rawResults = Array.isArray(data.results) ? data.results : [];
    const items: WebSearchResultItem[] = [];
    const citations: string[] = [];

    for (const r of rawResults) {
      if (!r.url || !/^https?:\/\//i.test(r.url) || /tavily\.com/i.test(r.url)) continue;
      const title = r.title?.trim() || new URL(r.url).hostname.replace(/^www\./, '');
      const content = (r.content || '').trim();
      items.push({
        title,
        url: r.url,
        content: content.slice(0, 1500) || `Resource: ${r.url}`,
        score: typeof r.score === 'number' ? r.score : 0.8,
      });
      citations.push(r.url);
    }

    if (!answer && items.length) {
      answer = items.slice(0, 3).map((it) => `${it.title}: ${it.content.slice(0, 200)}...`).join('\n\n');
    }

    return {
      query,
      answer,
      results: items,
      citations: Array.from(new Set(citations)),
      modelUsed: 'tavily-search',
    };
  } catch (err) {
    clearTimeout(timeout);
    console.warn('[tavily-search] Search failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Unified web search dispatcher:
 * Concurrently queries BOTH Tavily Web Search and Perplexity AI.
 * Merges discovered websites and compiles distinct sections so the AI model can
 * explicitly inform the user what was discovered in Tavily and what was found in Perplexity AI.
 */
export async function searchUnifiedWeb(
  query: string,
  userPlan: 'free' | 'premium' = 'free',
  options: TavilySearchOptions = {},
): Promise<WebSearchResponse | null> {
  const [perplexityResult, tavilyResult] = await Promise.allSettled([
    searchPerplexityWeb(query, options),
    searchTavilyWeb(query, options),
  ]);

  const perp = perplexityResult.status === 'fulfilled' ? perplexityResult.value : null;
  const tav = tavilyResult.status === 'fulfilled' ? tavilyResult.value : null;

  if (perp && tav) {
    const seenUrls = new Set<string>();
    const combinedResults: WebSearchResultItem[] = [];

    for (const item of [...tav.results, ...perp.results]) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        combinedResults.push(item);
      }
    }

    const combinedCitations = Array.from(
      new Set([...(tav.citations || []), ...(perp.citations || [])]),
    );

    const answerParts: string[] = [];

    if (tav.answer || tav.results.length) {
      let tavSec = `### 🔍 Tavily Search Findings:\n`;
      if (tav.results.length) {
        tavSec += `Discovered Websites & Direct Links:\n` +
          tav.results.map((r, i) => `${i + 1}. [${r.title}](${r.url}) — ${r.url}`).join('\n') + '\n\n';
      }
      if (tav.answer) {
        tavSec += `Key Findings: ${tav.answer}`;
      }
      answerParts.push(tavSec.trim());
    }

    if (perp.answer) {
      let perpSec = `### 🧠 Perplexity AI Real-Time Research:\n${perp.answer}`;
      if (perp.citations?.length) {
        perpSec += `\n\nReferenced Citations:\n` + perp.citations.map((c, i) => `[${i + 1}] ${c}`).join('\n');
      }
      answerParts.push(perpSec.trim());
    }

    return {
      query,
      answer: answerParts.join('\n\n'),
      results: combinedResults,
      citations: combinedCitations,
      modelUsed: 'dual-search-engine (tavily + perplexity)',
    };
  }

  if (tav) {
    return {
      ...tav,
      answer: `### 🔍 Tavily Search Findings:\n${tav.answer || ''}`,
    };
  }

  if (perp) {
    return {
      ...perp,
      answer: `### 🧠 Perplexity AI Real-Time Research:\n${perp.answer || ''}`,
    };
  }

  return null;
}

/**
 * Backwards compatibility alias
 */
export async function searchTavily(
  query: string,
  options: TavilySearchOptions = {},
): Promise<TavilySearchResponse | null> {
  return searchTavilyWeb(query, options);
}

