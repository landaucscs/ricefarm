/**
 * Search Orchestrator
 * 여러 학술 API에 동시 검색 요청을 보내고 결과를 통합합니다.
 */

import type { RepositoryId } from '@/types';

export interface SearchResult {
  repository: RepositoryId;
  externalId: string;       // DOI or repo-specific ID
  title: string;
  authors: string[];
  year?: number;
  abstract?: string;
  doi?: string;
  sourceUrl: string;        // 논문 페이지 URL
  fullTextUrl?: string;     // OA 전문 URL (있으면)
  pdfUrl?: string;
}

interface SearchOptions {
  query: string;
  repositories: RepositoryId[];
  perPage?: number;         // per repository
  yearFrom?: number;
}

// ---- OpenAlex ----

async function searchOpenAlex(query: string, perPage: number): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    search: query,
    filter: 'has_fulltext:true,language:en',
    per_page: String(perPage),
    select: 'id,doi,title,authorships,publication_year,abstract_inverted_index,primary_location,open_access',
  });

  const res = await fetch(`https://api.openalex.org/works?${params}`, {
    headers: { 'User-Agent': 'SuneungSentinel/1.0 (mailto:contact@example.com)' },
  });
  if (!res.ok) return [];

  const data = await res.json();

  return (data.results || []).map((work: Record<string, unknown>) => {
    const oa = work.open_access as Record<string, unknown> | undefined;
    const loc = work.primary_location as Record<string, unknown> | undefined;
    const source = loc?.source as Record<string, unknown> | undefined;

    // Reconstruct abstract from inverted index
    let abstract = '';
    const invertedIndex = work.abstract_inverted_index as Record<string, number[]> | undefined;
    if (invertedIndex) {
      const words: [string, number][] = [];
      for (const [word, positions] of Object.entries(invertedIndex)) {
        for (const pos of positions) {
          words.push([word, pos]);
        }
      }
      words.sort((a, b) => a[1] - b[1]);
      abstract = words.map(([w]) => w).join(' ');
    }

    return {
      repository: 'openalex' as RepositoryId,
      externalId: String(work.id || ''),
      title: String(work.title || ''),
      authors: ((work.authorships as Array<Record<string, unknown>>) || [])
        .map((a) => {
          const author = a.author as Record<string, unknown> | undefined;
          return String(author?.display_name || '');
        })
        .filter(Boolean),
      year: work.publication_year as number | undefined,
      abstract,
      doi: work.doi ? String(work.doi).replace('https://doi.org/', '') : undefined,
      sourceUrl: String(
        (loc?.landing_page_url as string) ||
        (work.doi as string) ||
        work.id ||
        ''
      ),
      fullTextUrl: (oa?.oa_url as string) || undefined,
      pdfUrl: (loc?.pdf_url as string) || (oa?.oa_url as string) || undefined,
    } satisfies SearchResult;
  });
}

// ---- Semantic Scholar ----

async function searchSemanticScholar(query: string, perPage: number): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    query,
    limit: String(perPage),
    fields: 'paperId,title,authors,year,abstract,externalIds,isOpenAccess,openAccessPdf,url',
  });

  const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`);
  if (!res.ok) return [];

  const data = await res.json();

  return (data.data || []).map((paper: Record<string, unknown>) => {
    const externalIds = paper.externalIds as Record<string, string> | undefined;
    const oaPdf = paper.openAccessPdf as Record<string, string> | undefined;

    return {
      repository: 'semantic_scholar' as RepositoryId,
      externalId: String(paper.paperId || ''),
      title: String(paper.title || ''),
      authors: ((paper.authors as Array<Record<string, unknown>>) || [])
        .map((a) => String(a.name || '')).filter(Boolean),
      year: paper.year as number | undefined,
      abstract: (paper.abstract as string) || undefined,
      doi: externalIds?.DOI,
      sourceUrl: String(paper.url || ''),
      fullTextUrl: oaPdf?.url,
      pdfUrl: oaPdf?.url,
    } satisfies SearchResult;
  });
}

// ---- arXiv ----

async function searchArxiv(query: string, perPage: number): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    search_query: `all:${query}`,
    start: '0',
    max_results: String(perPage),
  });

  const res = await fetch(`http://export.arxiv.org/api/query?${params}`);
  if (!res.ok) return [];

  const text = await res.text();

  // Simple XML parsing for arXiv Atom feed
  const entries: SearchResult[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(text)) !== null) {
    const entry = match[1];
    const getTag = (tag: string): string => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].trim() : '';
    };

    const id = getTag('id');
    const arxivId = id.replace('http://arxiv.org/abs/', '').replace(/v\d+$/, '');

    // Extract all author names
    const authors: string[] = [];
    const authorRegex = /<author>\s*<name>([^<]+)<\/name>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(authorMatch[1].trim());
    }

    entries.push({
      repository: 'arxiv',
      externalId: arxivId,
      title: getTag('title').replace(/\s+/g, ' '),
      authors,
      abstract: getTag('summary').replace(/\s+/g, ' '),
      doi: undefined,
      sourceUrl: `https://arxiv.org/abs/${arxivId}`,
      fullTextUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
    });
  }

  return entries;
}

// ---- CORE ----

async function searchCore(query: string, perPage: number): Promise<SearchResult[]> {
  // CORE API v3 - free tier allows 10 req/min
  const res = await fetch('https://api.core.ac.uk/v3/search/works', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: query,
      limit: perPage,
      exclude: ['fullText'], // don't fetch full text in search
    }),
  });
  if (!res.ok) return [];

  const data = await res.json();

  return (data.results || []).map((work: Record<string, unknown>) => ({
    repository: 'core' as RepositoryId,
    externalId: String(work.id || ''),
    title: String(work.title || ''),
    authors: ((work.authors as Array<Record<string, unknown>>) || [])
      .map((a) => String(a.name || '')).filter(Boolean),
    year: work.yearPublished as number | undefined,
    abstract: (work.abstract as string) || undefined,
    doi: (work.doi as string) || undefined,
    sourceUrl: String(
      (work.downloadUrl as string) ||
      (work.sourceFulltextUrls as string[])?.[ 0] ||
      ''
    ),
    fullTextUrl: (work.downloadUrl as string) || undefined,
    pdfUrl: (work.downloadUrl as string) || undefined,
  } satisfies SearchResult));
}

// ---- DOAJ ----

async function searchDoaj(query: string, perPage: number): Promise<SearchResult[]> {
  const res = await fetch(
    `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?page=1&pageSize=${perPage}`
  );
  if (!res.ok) return [];

  const data = await res.json();

  return (data.results || []).map((item: Record<string, unknown>) => {
    const bibjson = item.bibjson as Record<string, unknown>;
    const links = (bibjson?.link as Array<Record<string, string>>) || [];
    const fullTextLink = links.find((l) => l.type === 'fulltext');
    const identifiers = (bibjson?.identifier as Array<Record<string, string>>) || [];
    const doiObj = identifiers.find((i) => i.type === 'doi');

    return {
      repository: 'doaj' as RepositoryId,
      externalId: String(item.id || ''),
      title: String(bibjson?.title || ''),
      authors: ((bibjson?.author as Array<Record<string, string>>) || [])
        .map((a) => a.name || '').filter(Boolean),
      abstract: (bibjson?.abstract as string) || undefined,
      doi: doiObj?.id,
      sourceUrl: fullTextLink?.url || '',
      fullTextUrl: fullTextLink?.url || undefined,
    } satisfies SearchResult;
  });
}

// ---- PubMed (via E-utilities) ----

async function searchPubmed(query: string, perPage: number): Promise<SearchResult[]> {
  // Step 1: Search for PMIDs
  const searchRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${encodeURIComponent(query)}+AND+open+access[filter]&retmax=${perPage}&retmode=json`
  );
  if (!searchRes.ok) return [];

  const searchData = await searchRes.json();
  const ids: string[] = searchData.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  // Step 2: Fetch summaries
  const summaryRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&id=${ids.join(',')}&retmode=json`
  );
  if (!summaryRes.ok) return [];

  const summaryData = await summaryRes.json();
  const results: SearchResult[] = [];

  for (const id of ids) {
    const doc = summaryData.result?.[id];
    if (!doc) continue;

    results.push({
      repository: 'pubmed',
      externalId: `PMC${id}`,
      title: String(doc.title || ''),
      authors: ((doc.authors as Array<Record<string, string>>) || [])
        .map((a) => a.name || '').filter(Boolean),
      year: doc.pubdate ? parseInt(String(doc.pubdate).substring(0, 4)) : undefined,
      doi: (doc.doi as string) || undefined,
      sourceUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${id}/`,
      fullTextUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${id}/`,
    });
  }

  return results;
}

// ---- Dispatcher ----

const SEARCH_HANDLERS: Partial<Record<RepositoryId, (q: string, n: number) => Promise<SearchResult[]>>> = {
  openalex: searchOpenAlex,
  semantic_scholar: searchSemanticScholar,
  arxiv: searchArxiv,
  core: searchCore,
  doaj: searchDoaj,
  pubmed: searchPubmed,
  // SSRN, ERIC, PhilPapers, CrossRef, Unpaywall, BASE — Phase 2+
};

export async function searchAll(options: SearchOptions): Promise<{
  results: SearchResult[];
  errors: { repository: RepositoryId; error: string }[];
}> {
  const perPage = options.perPage || 10;
  const allResults: SearchResult[] = [];
  const errors: { repository: RepositoryId; error: string }[] = [];

  const promises = options.repositories.map(async (repo) => {
    const handler = SEARCH_HANDLERS[repo];
    if (!handler) {
      errors.push({ repository: repo, error: `No handler for ${repo} yet` });
      return;
    }

    try {
      const results = await handler(options.query, perPage);
      allResults.push(...results);
    } catch (err) {
      errors.push({ repository: repo, error: String(err) });
    }
  });

  await Promise.all(promises);

  return { results: allResults, errors };
}
