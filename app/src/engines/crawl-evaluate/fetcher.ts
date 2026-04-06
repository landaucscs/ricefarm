/**
 * Full-text Fetcher
 * OA 논문의 전문 텍스트를 다운로드하고 추출합니다.
 * PDF → 텍스트 변환, HTML → 본문 추출 지원.
 */

import type { SearchResult } from './searcher';

export interface FetchedDocument {
  searchResult: SearchResult;
  fullText: string;
  sentences: string[];
  wordCount: number;
  fetchMethod: 'pdf' | 'html' | 'abstract_only';
}

/**
 * 텍스트를 문장 단위로 분리
 */
function splitSentences(text: string): string[] {
  return text
    .replace(/([.!?])\s+(?=[A-Z"])/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

/**
 * HTML에서 학술 논문 본문을 추출 (개선된 버전)
 * 학술 사이트별 본문 컨테이너를 우선 탐색하고, 없으면 <p> 태그 기반 추출
 */
function extractTextFromHtml(html: string): string {
  // 1단계: 불필요한 요소 제거
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<button[\s\S]*?<\/button>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 2단계: 학술 논문 본문 영역 탐색 (사이트별 패턴)
  const bodyPatterns = [
    // Springer, Nature, Wiley 등
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    // PubMed Central
    /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    // MDPI, Frontiers
    /<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    // Generic main content
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    // Abstract section specifically
    /<div[^>]*class="[^"]*abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*class="[^"]*abstract[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
  ];

  let bodyHtml = '';
  for (const pattern of bodyPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      bodyHtml = match[1];
      break;
    }
  }

  // 3단계: 본문 영역이 없으면 <p> 태그만 추출
  if (!bodyHtml) {
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(cleaned)) !== null) {
      const text = pMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

      // 본문 문장일 가능성이 높은 것만 (20자 이상, 영문 비율 높은 것)
      if (text.length >= 20) {
        const alphaRatio = text.replace(/[^a-zA-Z\s]/g, '').length / text.length;
        if (alphaRatio > 0.5) {
          paragraphs.push(text);
        }
      }
    }

    return paragraphs.join(' ').replace(/\s+/g, ' ').trim();
  }

  // 4단계: 본문 HTML에서 텍스트 추출
  return bodyHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * PDF에서 텍스트 추출
 */
async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(Buffer.from(buffer));
    return data.text.replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * URL에서 콘텐츠 다운로드
 */
async function downloadContent(url: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'SuneungSentinel/1.0 (Academic Research Tool)',
        Accept: 'application/pdf, text/html, */*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    const buffer = await res.arrayBuffer();
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/**
 * 단일 검색 결과에서 전문 텍스트를 가져오기
 */
export async function fetchFullText(result: SearchResult): Promise<FetchedDocument | null> {
  const urls = [result.pdfUrl, result.fullTextUrl, result.sourceUrl].filter(Boolean) as string[];

  for (const url of urls) {
    const content = await downloadContent(url);
    if (!content) continue;

    let fullText = '';
    let method: 'pdf' | 'html' = 'html';

    if (content.contentType.includes('pdf')) {
      fullText = await extractTextFromPdf(content.buffer);
      method = 'pdf';
    } else if (content.contentType.includes('html') || content.contentType.includes('text')) {
      const html = new TextDecoder().decode(content.buffer);
      fullText = extractTextFromHtml(html);
      method = 'html';
    }

    if (fullText.length > 500) {
      const sentences = splitSentences(fullText);
      const wordCount = fullText.split(/\s+/).length;

      return {
        searchResult: result,
        fullText,
        sentences,
        wordCount,
        fetchMethod: method,
      };
    }
  }

  // 전문을 못 가져오면 abstract라도 반환
  if (result.abstract && result.abstract.length > 100) {
    const sentences = splitSentences(result.abstract);
    return {
      searchResult: result,
      fullText: result.abstract,
      sentences,
      wordCount: result.abstract.split(/\s+/).length,
      fetchMethod: 'abstract_only',
    };
  }

  return null;
}

/**
 * 여러 검색 결과를 병렬로 전문 가져오기
 */
export async function fetchAllFullTexts(
  results: SearchResult[],
  concurrency = 3,
): Promise<FetchedDocument[]> {
  const documents: FetchedDocument[] = [];
  const queue = [...results];

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const result = queue.shift();
      if (!result) break;

      const doc = await fetchFullText(result);
      if (doc) documents.push(doc);
    }
  });

  await Promise.all(workers);
  return documents;
}
