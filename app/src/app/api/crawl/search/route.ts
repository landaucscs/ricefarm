import { NextRequest, NextResponse } from 'next/server';
import { searchAll } from '@/engines/crawl-evaluate/searcher';
import { fetchAllFullTexts } from '@/engines/crawl-evaluate/fetcher';
import type { RepositoryId } from '@/types';

/**
 * POST /api/crawl/search
 * Step 1: Search + Fetch full texts. Fast (no Claude calls).
 */
export async function POST(request: NextRequest) {
  try {
    const { query, repositories, perPage = 5 } = await request.json() as {
      query: string;
      repositories: RepositoryId[];
      perPage?: number;
    };

    // Search
    const { results: searchResults, errors } = await searchAll({
      query,
      repositories,
      perPage,
    });

    if (searchResults.length === 0) {
      return NextResponse.json({ success: true, documents: [], searchCount: 0, errors });
    }

    // Fetch full texts
    const documents = await fetchAllFullTexts(searchResults, 3);

    // Return serializable document info (not full text — too large)
    const docs = documents.map((d, i) => ({
      index: i,
      title: d.searchResult.title,
      authors: d.searchResult.authors,
      sourceUrl: d.searchResult.sourceUrl,
      repository: d.searchResult.repository,
      wordCount: d.wordCount,
      fetchMethod: d.fetchMethod,
      sentenceCount: d.sentences.length,
      // Store full text server-side via a temp key
      preview: d.fullText.substring(0, 300) + '...',
    }));

    // Cache documents in a global store for the extract step
    const cacheKey = `crawl_${Date.now()}`;
    (globalThis as Record<string, unknown>)[cacheKey] = documents;

    // Auto-cleanup after 10 minutes
    setTimeout(() => { delete (globalThis as Record<string, unknown>)[cacheKey]; }, 600000);

    return NextResponse.json({
      success: true,
      cacheKey,
      documents: docs,
      searchCount: searchResults.length,
      fetchedCount: documents.length,
      errors,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
