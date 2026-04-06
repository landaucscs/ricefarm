/**
 * Rule-based Pre-filter
 * Claude API 호출 전에 부적합한 문서를 걸러내어 API 비용을 절감합니다.
 * 이 단계는 무료 (순수 코드 로직).
 */

import type { FetchedDocument } from './fetcher';
import { countWords } from '@/lib/word-count';

export interface PrefilterResult {
  pass: boolean;
  reason?: string;
  // 사전 분석 결과 — extract 단계에서 활용
  candidateWindows?: { start: number; end: number; wordCount: number }[];
}

/**
 * 문서가 수능 지문 추출에 적합한지 사전 검증
 */
export function prefilterDocument(doc: FetchedDocument): PrefilterResult {
  // 1. 최소 문장 수
  if (doc.sentences.length < 8) {
    return { pass: false, reason: `Too few sentences (${doc.sentences.length})` };
  }

  // 2. 전체 단어 수 — 최소 200단어는 있어야 150~180w 구간 추출 가능
  if (doc.wordCount < 200) {
    return { pass: false, reason: `Too short (${doc.wordCount} words)` };
  }

  // 3. 영어 비율 체크 — 비영어 텍스트 거르기
  const asciiRatio = doc.fullText.replace(/[^\x20-\x7E]/g, '').length / doc.fullText.length;
  if (asciiRatio < 0.7) {
    return { pass: false, reason: `Low English ratio (${Math.round(asciiRatio * 100)}%)` };
  }

  // 4. 150~180 단어 윈도우가 존재하는지 확인 (sliding window)
  const windows = findCandidateWindows(doc.sentences, 150, 180);
  if (windows.length === 0) {
    // 장문 후보도 체크 (250~280)
    const jangmunWindows = findCandidateWindows(doc.sentences, 250, 280);
    if (jangmunWindows.length === 0) {
      return { pass: false, reason: 'No suitable word-count windows found' };
    }
    return { pass: true, candidateWindows: jangmunWindows };
  }

  return { pass: true, candidateWindows: windows };
}

/**
 * 문장 배열에서 min~max 단어 범위에 해당하는 윈도우를 찾기
 */
function findCandidateWindows(
  sentences: string[],
  minWords: number,
  maxWords: number,
): { start: number; end: number; wordCount: number }[] {
  const windows: { start: number; end: number; wordCount: number }[] = [];

  for (let start = 0; start < sentences.length; start++) {
    let text = '';
    for (let end = start; end < sentences.length; end++) {
      text += (text ? ' ' : '') + sentences[end];
      const wc = countWords(text);

      if (wc > maxWords) break;
      if (wc >= minWords && wc <= maxWords) {
        windows.push({ start, end, wordCount: wc });
        break; // 이 시작점에서 첫 번째 유효 윈도우만
      }
    }

    if (windows.length >= 5) break; // 후보 5개면 충분
  }

  return windows;
}
