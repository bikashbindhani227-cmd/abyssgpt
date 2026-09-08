import dotenv from 'dotenv';
dotenv.config();

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
}

export interface TavilySearchOptions {
  /** Budget-driven cap on results per search (hard ceiling: 10). */
  maxResults?: number;
  /** Budget-driven per-call timeout in ms (hard ceiling: 90000). */
  timeoutMs?: number;
  /** Deep search costs more; only enabled when the budget plan allows it. */
  searchDepth?: 'basic' | 'advanced';
}

export async function searchTavily(query: string, options: TavilySearchOptions = {}): Promise<TavilySearchResponse | null> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const maxResults = Math.max(1, Math.min(Math.floor(options.maxResults || 5), 10));
  const timeoutMs = Math.max(3000, Math.min(Math.floor(options.timeoutMs || 8000), 90000));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: options.searchDepth === 'advanced' ? 'advanced' : 'basic',
        include_answer: true,
        max_results: maxResults,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`Tavily search API error (${response.status}): ${errText}`);
      return null;
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
      answer?: string;
    };

    return {
      query,
      results: (data.results || []).map((r) => ({
        title: r.title || 'Untitled Result',
        url: r.url || '',
        content: r.content || '',
        score: r.score,
      })),
      answer: data.answer,
    };
  } catch (err: unknown) {
    console.warn('Tavily search request failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
