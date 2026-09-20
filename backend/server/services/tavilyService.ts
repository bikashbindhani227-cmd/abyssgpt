import dotenv from 'dotenv';
dotenv.config();
import { searchPerplexityWeb, type WebSearchResultItem, type WebSearchResponse } from './perplexitySearchService.js';

export interface TavilySearchResult extends WebSearchResultItem {}
export interface TavilySearchResponse extends WebSearchResponse {}

export interface TavilySearchOptions {
  maxResults?: number;
  timeoutMs?: number;
  searchDepth?: 'basic' | 'advanced';
}

/**
 * Legacy searchTavily wrapper redirected to Perplexity AI model via AI Credits.
 * This completely removes the Tavily dependency while ensuring full backwards compatibility.
 */
export async function searchTavily(query: string, options: TavilySearchOptions = {}): Promise<TavilySearchResponse | null> {
  return searchPerplexityWeb(query, options);
}
