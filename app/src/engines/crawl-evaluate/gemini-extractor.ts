/**
 * Gemini-powered Passage Extractor
 * Gemini Flash (무료)로 원문에서 수능 지문 후보를 추출합니다.
 * 실패 시 rule-based로 fallback.
 */

import { geminiJsonCall, countWords } from '@/lib/gemini';
import { buildExtractionPrompt } from '@/lib/prompt-builder';
import { getWordCountRange } from '@/lib/guidelines-loader';
import { extractPassagesRuleBased, type RuleExtractedPassage } from './rule-extractor';
import type { FetchedDocument } from './fetcher';
import type { QuestionType } from '@/types';

interface GeminiExtractResponse {
  passages: {
    start_sentence_index: number;
    end_sentence_index: number;
    reasoning: string;
  }[];
}

/**
 * Gemini로 추출 시도, 실패 시 rule-based fallback
 */
export async function extractWithGemini(
  document: FetchedDocument,
  questionType: QuestionType,
  maxCandidates = 3,
): Promise<RuleExtractedPassage[]> {
  const { sentences, fullText } = document;

  // 기본 필터
  if (sentences.length < 5) return [];
  const asciiRatio = fullText.replace(/[^\x20-\x7E]/g, '').length / fullText.length;
  if (asciiRatio < 0.7) return [];

  // 긴 문서는 앞부분만 (토큰 절약)
  const maxSentences = Math.min(sentences.length, 80);
  const subset = sentences.slice(0, maxSentences);

  const systemPrompt = buildExtractionPrompt(questionType);
  const wordRange = getWordCountRange(questionType);

  const numberedText = subset.map((s, i) => `[${i}] ${s}`).join('\n');

  const userMessage = `다음 원문에서 수능 영어 지문으로 적합한 구간을 최대 ${maxCandidates}개 찾으세요.

[요구사항]
- 각 구간은 ${wordRange.min}~${wordRange.max} 단어
- 원문의 문장 인덱스(start, end)로만 지정
- standalone으로 의미가 완결되는 구간
- 학술적이면서 수능 수준에 적합한 어휘/논리 구조

JSON 형식으로 응답:
{"passages": [{"start_sentence_index": 0, "end_sentence_index": 5, "reasoning": "이유"}]}

추출할 수 없으면: {"passages": []}

[원문 (${subset.length}개 문장)]
${numberedText}`;

  try {
    const response = await geminiJsonCall<GeminiExtractResponse>(systemPrompt, userMessage);

    if (!response?.passages?.length) {
      // Gemini 실패 → rule-based fallback
      return extractPassagesRuleBased(document, maxCandidates);
    }

    const results: RuleExtractedPassage[] = [];

    for (const p of response.passages) {
      const start = Math.max(0, p.start_sentence_index);
      const end = Math.min(subset.length - 1, p.end_sentence_index);
      const text = subset.slice(start, end + 1).join(' ');
      const wc = countWords(text);

      // Verbatim 검증
      const normalize = (t: string) => t.replace(/\s+/g, ' ').trim();
      if (!normalize(fullText).includes(normalize(text))) continue;

      // 단어 수 범위 검증
      const inStandard = wc >= wordRange.min && wc <= wordRange.max;
      const isJangmun = wc >= 250 && wc <= 280;
      if (!inStandard && !isJangmun) continue;

      results.push({
        text,
        startIndex: start,
        endIndex: end,
        wordCount: wc,
        isJangmunCandidate: isJangmun,
        sourceDocument: document,
      });

      if (results.length >= maxCandidates) break;
    }

    // Gemini가 유효한 결과를 못 줬으면 rule-based fallback
    if (results.length === 0) {
      return extractPassagesRuleBased(document, maxCandidates);
    }

    return results;
  } catch (err) {
    console.error('[gemini-extractor] Failed, falling back to rule-based:', err);
    return extractPassagesRuleBased(document, maxCandidates);
  }
}
