/**
 * Passage Extractor
 * Claude API를 사용하여 원문에서 수능 지문에 적합한 구간을 추출합니다.
 * 핵심: Claude는 인덱스만 반환하고, 백엔드가 원문에서 슬라이싱 → 환각 원천 차단.
 */

import { EXTRACTION_TOOLS, countWords, MODEL_HAIKU } from '@/lib/claude';
import { runWithTools, findToolCall } from '@/lib/claude-runner';
import { buildExtractionPrompt } from '@/lib/prompt-builder';
import { getWordCountRange } from '@/lib/guidelines-loader';
import { prefilterDocument } from './prefilter';
import type { FetchedDocument } from './fetcher';
import type { QuestionType } from '@/types';

export interface ExtractedPassage {
  text: string;
  startIndex: number;
  endIndex: number;
  wordCount: number;
  reasoning: string;
  isJangmunCandidate: boolean;
  sourceDocument: FetchedDocument;
}

function verifyVerbatim(extractedText: string, fullText: string): boolean {
  const normalize = (t: string) => t.replace(/\s+/g, ' ').trim();
  return normalize(fullText).includes(normalize(extractedText));
}

function sliceByIndex(sentences: string[], start: number, end: number): string {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(sentences.length - 1, end);
  return sentences.slice(safeStart, safeEnd + 1).join(' ');
}

export async function extractPassage(
  document: FetchedDocument,
  questionType: QuestionType,
): Promise<ExtractedPassage | null> {
  const { sentences, fullText } = document;

  // Rule-based pre-filter (무료) — 부적합 문서 사전 제거
  const precheck = prefilterDocument(document);
  if (!precheck.pass) {
    console.log(`Pre-filter skipped: ${document.searchResult.title} — ${precheck.reason}`);
    return null;
  }

  const systemPrompt = buildExtractionPrompt(questionType);
  const wordRange = getWordCountRange(questionType);

  // 후보 윈도우 주변 문장만 추출하여 Haiku에게 전달 (토큰 절약)
  const windows = precheck.candidateWindows || [];
  let sentenceSubset: string[];
  let indexOffset = 0;

  if (sentences.length > 80 && windows.length > 0) {
    // 첫 번째 후보 윈도우 주변 ±15 문장만 사용
    const best = windows[0];
    const padStart = Math.max(0, best.start - 15);
    const padEnd = Math.min(sentences.length - 1, best.end + 15);
    sentenceSubset = sentences.slice(padStart, padEnd + 1);
    indexOffset = padStart;
  } else {
    // 짧은 문서는 전체 사용, 하지만 최대 100문장
    sentenceSubset = sentences.slice(0, 100);
    indexOffset = 0;
  }

  const windowHint = windows.slice(0, 3)
    .map(w => `  sentences [${w.start - indexOffset}]~[${w.end - indexOffset}] = ${w.wordCount} words`)
    .join('\n') || '';

  const numberedText = sentenceSubset
    .map((s, i) => `[${i}] ${s}`)
    .join('\n');

  const result = await runWithTools({
    system: systemPrompt,
    tools: EXTRACTION_TOOLS,
    model: MODEL_HAIKU,
    userMessage: `다음 원문에서 수능 영어 "${questionType}" 유형 지문으로 적합한 구간을 찾으세요.

[요구사항]
- ${wordRange.min}~${wordRange.max} 단어 범위
- extract_passage 도구로 시작/종료 문장 인덱스만 반환
- 반드시 count_words 도구로 단어 수를 확인
- standalone으로 의미가 완결되는 구간을 선택

[참고: 단어 수 기준에 맞는 후보 구간]
${windowHint}

[원문 (${sentenceSubset.length}개 문장)]
${numberedText}`,
  });

  const extractCall = findToolCall(result, 'extract_passage');
  if (!extractCall) return null;

  // Claude가 반환한 인덱스에 offset을 더해서 원래 문장 배열의 인덱스로 변환
  const startIdx = Number(extractCall.start_sentence_index) + indexOffset;
  const endIdx = Number(extractCall.end_sentence_index) + indexOffset;
  const reasoning = String(extractCall.reasoning || '');

  if (isNaN(startIdx) || isNaN(endIdx)) return null;

  const extractedText = sliceByIndex(sentences, startIdx, endIdx);
  const wordCount = countWords(extractedText);

  // Verbatim check
  if (!verifyVerbatim(extractedText, fullText)) {
    console.warn(`Verbatim check FAILED for ${document.searchResult.title}`);
    return null;
  }

  // Word count range check — allow jangmun candidates (250-280)
  const inStandardRange = wordCount >= wordRange.min && wordCount <= wordRange.max;
  const isJangmunCandidate = wordCount >= 250 && wordCount <= 280;

  if (!inStandardRange && !isJangmunCandidate) return null;

  return {
    text: extractedText,
    startIndex: startIdx,
    endIndex: endIdx,
    wordCount,
    reasoning,
    isJangmunCandidate,
    sourceDocument: document,
  };
}

export async function extractPassagesFromDocuments(
  documents: FetchedDocument[],
  questionType: QuestionType,
): Promise<ExtractedPassage[]> {
  const passages: ExtractedPassage[] = [];

  for (const doc of documents) {
    try {
      const passage = await extractPassage(doc, questionType);
      if (passage) passages.push(passage);
    } catch (err) {
      console.error(`Extraction failed for: ${doc.searchResult.title}`, err);
    }
  }

  return passages;
}
