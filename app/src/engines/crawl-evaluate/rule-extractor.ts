/**
 * Enhanced Rule-based Passage Extractor (ricefarm)
 * Claude API 없이 원문에서 수능 지문 후보를 추출합니다.
 *
 * 개선점 (ricemachine 대비):
 * 1. 학술 논문 구조 인식 (Introduction/Discussion 등 섹션 가중치)
 * 2. 문장 연결성 점수 (접속사, 대명사, 전환어 빈도)
 * 3. 어휘 수준 추정 (평균 단어 길이 + 학술 단어 빈도)
 * 4. 복합 품질 점수 기반 정렬
 */

import { countWords } from '@/lib/claude';
import type { FetchedDocument } from './fetcher';

export interface RuleExtractedPassage {
  text: string;
  startIndex: number;
  endIndex: number;
  wordCount: number;
  isJangmunCandidate: boolean;
  qualityScore: number;       // 0~100 복합 품질 점수
  reasoning: string;          // 선택 이유 (rule-based 자동 생성)
  sourceDocument: FetchedDocument;
}

// ── 학술 텍스트 패턴 ──────────────────────────────────────────────

/** 논리 전환어 / 접속사 — 문장 간 연결성 지표 */
const CONNECTIVES = new Set([
  'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
  'consequently', 'thus', 'hence', 'meanwhile', 'nonetheless',
  'in addition', 'in contrast', 'on the other hand', 'as a result',
  'for example', 'for instance', 'in other words', 'that is',
  'in fact', 'indeed', 'specifically', 'similarly', 'likewise',
  'conversely', 'alternatively', 'rather', 'instead', 'yet',
  'although', 'despite', 'whereas', 'while', 'since', 'because',
]);

/** 학술 단어 — 수능 지문에 자주 등장하는 중급~고급 어휘 */
const ACADEMIC_WORDS = new Set([
  'phenomenon', 'hypothesis', 'paradigm', 'cognitive', 'empirical',
  'perception', 'inherent', 'underlying', 'fundamental', 'significant',
  'context', 'framework', 'mechanism', 'perspective', 'assumption',
  'complexity', 'dimension', 'dynamic', 'interpretation', 'implication',
  'correlation', 'tendency', 'constraint', 'distinction', 'consequence',
  'inevitable', 'precisely', 'explicitly', 'implicitly', 'predominantly',
  'constitute', 'facilitate', 'enhance', 'diminish', 'reinforce',
  'influence', 'contribute', 'demonstrate', 'illustrate', 'indicate',
  'acknowledge', 'emphasize', 'neglect', 'overlook', 'undermine',
  'conventional', 'contemporary', 'preliminary', 'subsequent', 'prior',
  'abstract', 'concrete', 'arbitrary', 'comprehensive', 'coherent',
]);

/** 논문 섹션 헤더 패턴 (본문 분리용) */
const SECTION_HEADERS = [
  /^(?:abstract|introduction|background|literature\s+review)/i,
  /^(?:method(?:s|ology)?|materials?\s+and\s+methods?)/i,
  /^(?:results?|findings?)/i,
  /^(?:discussion|analysis|interpretation)/i,
  /^(?:conclusion|summary|implications?)/i,
  /^(?:references?|bibliography|acknowledgments?)/i,
];

/** 수능 지문으로 부적합한 패턴 */
const REJECT_PATTERNS = [
  /table\s*\d/i,              // Table 1, Table 2...
  /figure\s*\d/i,             // Figure 1...
  /et\s+al\.\s*[,(]/,        // 인용 (et al., 2020)
  /p\s*[<>=]\s*0?\.\d/,      // 통계 수치 (p < 0.05)
  /\d+\.\d+\s*%/,            // 백분율 (73.2%)
  /doi:\s*/i,                 // DOI 참조
  /https?:\/\//,              // URL
  /\[\d+\]/,                  // 참조 번호 [1], [2]
  /^\d+\.\s+/,               // 번호 매기기 1. 2.
];

// ── 품질 측정 함수들 ──────────────────────────────────────────────

/**
 * 문장 연결성 점수 (0~25)
 * 접속사/전환어 사용 빈도로 논리적 흐름 추정
 */
function scoreConnectivity(sentences: string[]): number {
  if (sentences.length <= 1) return 0;
  const text = sentences.join(' ').toLowerCase();
  let count = 0;
  for (const conn of CONNECTIVES) {
    // 단어 경계 매칭 (in addition 같은 구 포함)
    const regex = new RegExp(`\\b${conn.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) count += matches.length;
  }
  // 문장당 연결어 비율 → 0~25 점
  const ratio = count / sentences.length;
  return Math.min(25, Math.round(ratio * 50));
}

/**
 * 어휘 수준 점수 (0~25)
 * 학술 단어 비율 + 평균 단어 길이로 추정
 */
function scoreVocabularyLevel(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;

  // 학술 단어 비율
  const academicCount = words.filter(w => ACADEMIC_WORDS.has(w.replace(/[^a-z]/g, ''))).length;
  const academicRatio = academicCount / words.length;

  // 평균 단어 길이 (수능: 5~7자가 적정)
  const avgLen = words.reduce((sum, w) => sum + w.replace(/[^a-z]/g, '').length, 0) / words.length;
  const lenScore = avgLen >= 4.5 && avgLen <= 7.5 ? 10 : avgLen >= 3.5 && avgLen <= 8.5 ? 5 : 0;

  // 학술 비율 5~15%가 수능에 적합 (너무 많으면 어려움)
  const ratioScore = academicRatio >= 0.03 && academicRatio <= 0.20 ? 15 : academicRatio > 0 ? 8 : 0;

  return Math.min(25, lenScore + ratioScore);
}

/**
 * 문장 구조 다양성 점수 (0~15)
 * 문장 길이의 변이계수 (적당한 변화 = 읽기 좋음)
 */
function scoreSentenceVariety(sentences: string[]): number {
  if (sentences.length < 3) return 0;
  const lengths = sentences.map(s => countWords(s));
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 0;
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  const cv = Math.sqrt(variance) / mean; // 변이계수
  // CV 0.3~0.6 이 자연스러운 학술 글
  if (cv >= 0.25 && cv <= 0.65) return 15;
  if (cv >= 0.15 && cv <= 0.80) return 10;
  return 5;
}

/**
 * 독립 완결성 점수 (0~20)
 * 첫 문장이 주제 도입인지, 마지막이 결론인지 확인
 */
function scoreStandaloneCoherence(sentences: string[]): number {
  if (sentences.length < 3) return 0;
  let score = 0;

  const first = sentences[0].toLowerCase();
  const last = sentences[sentences.length - 1].toLowerCase();

  // 첫 문장: 일반적 진술/주제 도입 패턴
  const introPatterns = [
    /^(?:the|a|an|one|many|most|some|in|when|people|we|it is|there is|there are)/i,
    /^(?:research|studies|scientists|scholars|experts|humans|society|individuals)/i,
  ];
  if (introPatterns.some(p => p.test(first))) score += 8;

  // 마지막 문장: 결론/요약 패턴
  const conclusionWords = ['therefore', 'thus', 'hence', 'consequently', 'ultimately',
    'in short', 'in sum', 'overall', 'in conclusion', 'as a result'];
  if (conclusionWords.some(w => last.includes(w))) score += 7;

  // 대명사 해결: 첫 문장에 선행사 없는 대명사가 있으면 감점
  if (/^(?:they|them|he|she|it|this|these|those)\b/i.test(first)) score -= 5;

  // 문장 수가 적정 범위 (5~10문장)
  if (sentences.length >= 5 && sentences.length <= 12) score += 5;

  return Math.max(0, Math.min(20, score));
}

/**
 * 부적합 패턴 감점 (0~-15)
 */
function penalizeRejectPatterns(text: string): number {
  let penalty = 0;
  for (const pattern of REJECT_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, 'gi'));
    if (matches) penalty += matches.length * 3;
  }
  return -Math.min(15, penalty);
}

/**
 * 복합 품질 점수 계산 (0~100)
 */
function calculateQualityScore(text: string, sentences: string[]): number {
  const connectivity = scoreConnectivity(sentences);      // 0~25
  const vocabulary = scoreVocabularyLevel(text);           // 0~25
  const variety = scoreSentenceVariety(sentences);         // 0~15
  const coherence = scoreStandaloneCoherence(sentences);   // 0~20
  const penalty = penalizeRejectPatterns(text);            // -15~0

  // 기본 점수 15 (최소 보장)
  return Math.max(0, Math.min(100, 15 + connectivity + vocabulary + variety + coherence + penalty));
}

/**
 * 품질 점수를 사람이 읽을 수 있는 이유로 변환
 */
function generateReasoning(text: string, sentences: string[], score: number): string {
  const parts: string[] = [];
  const conn = scoreConnectivity(sentences);
  const vocab = scoreVocabularyLevel(text);
  const variety = scoreSentenceVariety(sentences);

  if (conn >= 15) parts.push('논리 전환어가 풍부하여 논리적 흐름이 명확함');
  else if (conn >= 8) parts.push('접속사/전환어 적정 수준');
  else parts.push('논리 전환어 부족');

  if (vocab >= 15) parts.push('수능 수준에 적합한 학술 어휘 포함');
  else if (vocab >= 8) parts.push('어휘 수준 적정');

  if (variety >= 12) parts.push('문장 길이 변화가 자연스러움');

  parts.push(`종합 품질 점수: ${score}/100`);
  return parts.join('. ') + '.';
}

// ── 텍스트 품질 기본 체크 ─────────────────────────────────────────

function isAcceptableText(text: string): boolean {
  const alphaRatio = text.replace(/[^a-zA-Z\s]/g, '').length / text.length;
  if (alphaRatio < 0.7) return false;

  const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
  if (sentenceCount < 3) return false;

  const avgWords = countWords(text) / sentenceCount;
  if (avgWords < 8 || avgWords > 50) return false;

  // 부적합 패턴이 너무 많으면 거부
  let rejectCount = 0;
  for (const p of REJECT_PATTERNS) {
    if (p.test(text)) rejectCount++;
  }
  if (rejectCount >= 3) return false;

  return true;
}

// ── 논문 섹션 감지 (Introduction/Discussion 우선) ──────────────────

interface SectionRange {
  name: string;
  start: number;
  end: number;
  priority: number; // 낮을수록 우선
}

/**
 * 문장 배열에서 논문 섹션 경계를 감지
 */
function detectSections(sentences: string[]): SectionRange[] {
  const sections: SectionRange[] = [];
  let currentName = 'unknown';
  let currentStart = 0;

  // 섹션별 우선순위 (수능 지문으로의 적합도)
  const priorities: Record<string, number> = {
    'introduction': 1,
    'discussion': 1,
    'background': 2,
    'conclusion': 2,
    'analysis': 2,
    'results': 3,
    'methods': 4,
    'references': 5,
    'unknown': 3,
  };

  for (let i = 0; i < sentences.length; i++) {
    const trimmed = sentences[i].trim();
    // 짧은 문장(10단어 이하)이 섹션 헤더인지 확인
    if (countWords(trimmed) <= 10) {
      for (const pattern of SECTION_HEADERS) {
        if (pattern.test(trimmed)) {
          // 이전 섹션 마감
          if (i > currentStart) {
            const name = currentName.toLowerCase();
            sections.push({
              name,
              start: currentStart,
              end: i - 1,
              priority: priorities[name] ?? 3,
            });
          }
          currentName = trimmed.toLowerCase().split(/\s/)[0];
          currentStart = i + 1; // 헤더 다음 문장부터
          break;
        }
      }
    }
  }

  // 마지막 섹션
  if (currentStart < sentences.length) {
    const name = currentName.toLowerCase();
    sections.push({
      name,
      start: currentStart,
      end: sentences.length - 1,
      priority: priorities[name] ?? 3,
    });
  }

  return sections.sort((a, b) => a.priority - b.priority);
}

// ── 메인 추출 함수 ────────────────────────────────────────────────

/**
 * 문서에서 수능 지문 후보를 추출 (강화된 rule-based)
 *
 * 알고리즘:
 * 1. 논문 섹션 감지 → 우선순위 높은 섹션부터 탐색
 * 2. 슬라이딩 윈도우로 150~180w / 250~280w 구간 탐색
 * 3. 각 후보에 복합 품질 점수 계산
 * 4. 점수 기반 정렬 후 상위 maxCandidates개 반환
 */
export function extractPassagesRuleBased(
  document: FetchedDocument,
  maxCandidates = 5,
): RuleExtractedPassage[] {
  const { sentences } = document;
  if (sentences.length < 5) return [];

  // 영어 비율 체크
  const asciiRatio = document.fullText.replace(/[^\x20-\x7E]/g, '').length / document.fullText.length;
  if (asciiRatio < 0.7) return [];

  const candidates: RuleExtractedPassage[] = [];
  const ranges = [
    { min: 150, max: 180, jangmun: false },
    { min: 250, max: 280, jangmun: true },
  ];

  // 섹션 감지 — 우선순위 높은 섹션부터 탐색
  const sections = detectSections(sentences);
  const searchOrder: number[] = [];

  if (sections.length > 1) {
    // 우선순위순으로 섹션의 문장 인덱스를 추가
    for (const section of sections) {
      if (section.name === 'references' || section.name === 'methods') continue; // 참조/방법론 제외
      for (let i = section.start; i <= section.end; i++) {
        searchOrder.push(i);
      }
    }
  }
  // 섹션 감지가 안 되면 전체 순서대로
  if (searchOrder.length === 0) {
    for (let i = 0; i < sentences.length; i++) searchOrder.push(i);
  }

  // 이미 커버된 시작점 추적 (중복 방지)
  const usedStarts = new Set<number>();

  for (const { min, max, jangmun } of ranges) {
    for (const start of searchOrder) {
      if (usedStarts.has(start)) continue;
      // 근접 시작점 건너뛰기
      let tooClose = false;
      for (const used of usedStarts) {
        if (Math.abs(used - start) < 5) { tooClose = true; break; }
      }
      if (tooClose) continue;

      let text = '';
      let endIdx = start;
      for (let end = start; end < sentences.length; end++) {
        text += (text ? ' ' : '') + sentences[end];
        const wc = countWords(text);

        if (wc > max + 20) break;

        if (wc >= min && wc <= max) {
          if (!isAcceptableText(text)) break;

          const windowSentences = sentences.slice(start, end + 1);
          const qualityScore = calculateQualityScore(text, windowSentences);
          const reasoning = generateReasoning(text, windowSentences, qualityScore);

          candidates.push({
            text,
            startIndex: start,
            endIndex: end,
            wordCount: wc,
            isJangmunCandidate: jangmun,
            qualityScore,
            reasoning,
            sourceDocument: document,
          });

          usedStarts.add(start);
          endIdx = end;
          break;
        }
      }
      // 사용된 구간 내 시작점도 마킹
      for (let i = start; i <= endIdx; i++) usedStarts.add(i);

      if (candidates.length >= maxCandidates * 3) break; // 충분한 후보 확보
    }
  }

  // 품질 점수 기준 정렬 후 상위 N개
  candidates.sort((a, b) => b.qualityScore - a.qualityScore);

  // 최종 중복 제거 (시작점 5문장 이내 겹침)
  const final: RuleExtractedPassage[] = [];
  for (const c of candidates) {
    const overlaps = final.some(
      f => Math.abs(f.startIndex - c.startIndex) < 5 && f.isJangmunCandidate === c.isJangmunCandidate
    );
    if (!overlaps) final.push(c);
    if (final.length >= maxCandidates) break;
  }

  return final;
}
