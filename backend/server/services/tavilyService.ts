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
    // Scrub vendor mentions for white-label compliance
    answer = answer
      .replace(/\b(?:tavily|tavily\.com)\b/gi, 'Live Web Search')
      .replace(/\b(?:perplexity\s*ai|perplexity\.ai|perplexity)\b/gi, 'Live Web Search');

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
 * Unified web search dispatcher based on user plan:
 * - Free users: uses Tavily API exclusively.
 * - Paid (Premium) users: uses BOTH Perplexity AI and Tavily concurrently,
 *   merging their intelligence, verified links, and citations for maximum coverage and reliability.
 */
export async function searchUnifiedWeb(
  query: string,
  userPlan: 'free' | 'premium' = 'free',
  options: TavilySearchOptions = {},
): Promise<WebSearchResponse | null> {
  if (userPlan === 'premium') {
    // Paid users get Perplexity AI AND Tavily together
    const [perplexityResult, tavilyResult] = await Promise.allSettled([
      searchPerplexityWeb(query, options),
      searchTavilyWeb(query, options),
    ]);

    const perp = perplexityResult.status === 'fulfilled' ? perplexityResult.value : null;
    const tav = tavilyResult.status === 'fulfilled' ? tavilyResult.value : null;

    if (perp && tav) {
      // Merge results and deduplicate URLs
      const seenUrls = new Set<string>();
      const combinedResults: WebSearchResultItem[] = [];

      for (const item of [...perp.results, ...tav.results]) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          combinedResults.push(item);
        }
      }

      const combinedCitations = Array.from(
        new Set([...(perp.citations || []), ...(tav.citations || [])]),
      );

      let blendedAnswer = perp.answer;
      if (tav.answer && !perp.answer.includes(tav.answer.slice(0, 50))) {
        blendedAnswer += `\n\n${tav.answer}`;
      }

      return {
        answer: blendedAnswer,
        results: combinedResults,
        citations: combinedCitations,
        modelUsed: 'dual-search-engine (perplexity + tavily)',
      };
    }

    if (perp) return perp;
    if (tav) return tav;
    return null;
  }

  // Free users use Tavily API exclusively
  return searchTavilyWeb(query, options);
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

