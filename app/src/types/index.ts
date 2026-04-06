// ============================================================================
// 수능 Sentinel - Core Type Definitions
// ============================================================================

// -- Question Types (12종) --------------------------------------------------

export const QUESTION_TYPES = [
  'claim',        // 20번 주장
  'implication',  // 21번 함축 의미
  'gist',         // 22번 요지
  'topic',        // 23번 주제
  'title',        // 24번 제목
  'grammar',      // 29번 어법
  'vocabulary',   // 30번 어휘
  'blank',        // 31~34번 빈칸 추론
  'irrelevant',   // 35번 무관한 문장
  'order',        // 36~37번 순서 배열
  'insertion',    // 38~39번 문장 삽입
  'summary',      // 40번 요약문
] as const;

export type QuestionType = typeof QUESTION_TYPES[number];

// 장문 복합 유형
export const JANGMUN_TYPES = ['jangmun_title', 'jangmun_vocabulary'] as const;
export type JangmunType = typeof JANGMUN_TYPES[number];

export type AllQuestionType = QuestionType | JangmunType;

// 유형 -> 문항 번호 매핑
export const TYPE_TO_NUMBERS: Record<QuestionType, number[]> = {
  claim:       [20],
  implication: [21],
  gist:        [22],
  topic:       [23],
  title:       [24],
  grammar:     [29],
  vocabulary:  [30],
  blank:       [31, 32, 33, 34],
  irrelevant:  [35],
  order:       [36, 37],
  insertion:   [38, 39],
  summary:     [40],
};

// -- Seed Data (기출 문항) ---------------------------------------------------

export interface SeedExample {
  id?: string;
  questionCode: number;      // YYMMQQ (예: 230631)
  questionNumber: number;
  questionType: QuestionType;
  passage: string;           // 지문 + 선지 포함 원문
  passageOnly?: string;      // 선지 분리된 순수 지문
  choices?: string[];        // 분리된 선지 배열
  wordCount: number;
  answer: number;            // 정답 번호
  isJangmun?: boolean;       // 장문 세트 여부
  jangmunNote?: string;      // 장문 메모 (예: "장문 독해 - 제목 (41번)")
  jangmunGroupId?: string;   // 같은 지문을 공유하는 장문 세트 ID (예: "2306_41_42")
  jangmunSubType?: JangmunType; // 장문 내 하위 유형 (jangmun_title | jangmun_vocabulary)
}

/**
 * 장문A 세트: 하나의 긴 지문(250~280w)에서 2문항 출제
 * - 41번: 제목 (title 규칙 상속)
 * - 42번: 어휘 (vocabulary 규칙 상속, 정답 ① 지양)
 *
 * Seed data에서는 41번과 42번이 각각 별도 레코드이지만,
 * jangmunGroupId로 연결하여 같은 지문임을 명시.
 * 크롤링 시에도 250~280w 지문을 찾으면 장문 후보로 태깅.
 */

// -- Guidelines (출제 지침) --------------------------------------------------

export interface GuidelineGlobal {
  description: string;
  passage_rules: string[];
  word_count: {
    standard: { min: number; max: number; note: string };
    order_insertion: { min: number; max: number; note: string };
    jangmun: { min: number; max: number; note: string };
  };
}

export interface GuidelineType {
  question_number?: number;
  question_number_range?: number[];
  name: string;
  passage_criteria: string[];
  choice_rules: string[];
  choice_format: string;
  pitfalls: string[];
  inherits?: string;
  additional_rules?: string[];
  word_count_override?: string;
  variants?: Record<string, string>;
}

export interface Guidelines {
  _meta: { description: string; version: string; updated: string };
  global: GuidelineGlobal;
  types: Record<string, GuidelineType>;
}

// -- Repositories (크롤링 소스) -----------------------------------------------

export const REPOSITORIES = [
  // --- Tier 1: 무료 API + 전문 접근 용이 ---
  { id: 'openalex',          label: 'OpenAlex',           tier: 1, description: '2.5억+ 학술 저작물. 무료 API, 광범위한 분야 커버리지' },
  { id: 'semantic_scholar',  label: 'Semantic Scholar',   tier: 1, description: 'AI2 운영. 의미 검색, 논문 전문 일부 접근 가능' },
  { id: 'arxiv',             label: 'arXiv',              tier: 1, description: '과학/수학/CS 프리프린트. 전문 무료 접근' },
  { id: 'doaj',              label: 'DOAJ',               tier: 1, description: 'Directory of Open Access Journals. 검증된 OA 저널' },
  { id: 'core',              label: 'CORE',               tier: 1, description: '전 세계 OA 리포지토리 통합. 전문 접근 가능' },
  // --- Tier 2: 특정 분야 강점 ---
  { id: 'pubmed',            label: 'PubMed / PMC',       tier: 2, description: '생명과학/의학. 수능 과학 지문에 적합' },
  { id: 'ssrn',              label: 'SSRN',               tier: 2, description: '사회과학 프리프린트. 수능 사회/심리 지문에 적합' },
  { id: 'eric',              label: 'ERIC',               tier: 2, description: '교육학 연구. 수능 교육/학습 주제 지문' },
  { id: 'philpapers',        label: 'PhilPapers',         tier: 2, description: '철학 논문. 추상적 논증/논리 지문에 적합' },
  // --- Tier 3: 보충/메타데이터 ---
  { id: 'crossref',          label: 'CrossRef',           tier: 3, description: 'DOI 메타데이터. Unpaywall과 연계하여 OA 전문 확보' },
  { id: 'unpaywall',         label: 'Unpaywall',          tier: 3, description: 'OA 버전 URL 제공. CrossRef과 병행 사용' },
  { id: 'base',              label: 'BASE',               tier: 3, description: 'Bielefeld Academic Search. OAI-PMH 메타데이터 수집' },
] as const;

export type RepositoryId = typeof REPOSITORIES[number]['id'];

// -- Crawled Sources (크롤링 원문) -------------------------------------------

export interface Source {
  id: string;
  title: string;
  authors: string[];
  sourceUrl: string;
  repository: RepositoryId;
  fullText?: string;
  fetchedAt: Date;
}

// -- Extracted Passages (추출된 지문) ----------------------------------------

export type PassageStatus = 'pending' | 'approved' | 'rejected';

export interface Passage {
  id: string;
  sourceId: string;
  text: string;              // verbatim 추출된 지문
  startIndex: number;
  endIndex: number;
  wordCount: number;
  status: PassageStatus;
  isJangmunCandidate: boolean; // 250~280w -> 장문 후보
  createdAt: Date;
  // Relations
  source?: Source;
  scores?: PassageScore[];
  feedback?: PassageFeedback[];
}

// -- Passage Scores (지문 평가 점수) -----------------------------------------

export interface PassageScoreMetrics {
  topicDepth: number;          // 0~10
  logicalStructure: number;
  standaloneCoherence: number;
  vocabularyLevel: number;
  questionTypeFit: number;
  distractorPotential: number;
}

export interface PassageScore {
  id: string;
  passageId: string;
  scorer: 'ai' | 'user';
  metrics: PassageScoreMetrics;
  totalWeighted: number;
  questionTypes: QuestionType[];
  typeHints?: Record<string, Record<string, unknown>>;
  comment?: string;
  createdAt: Date;
}

// -- Passage Feedback (지문 피드백) ------------------------------------------

export interface PassageFeedback {
  id: string;
  passageId: string;
  approved: boolean;
  aiScores?: PassageScoreMetrics;
  userScores?: PassageScoreMetrics;
  questionTypes: QuestionType[];
  comment?: string;
  createdAt: Date;
}

// -- Generated Questions (생성된 문항) ---------------------------------------

export type QuestionStatus = 'draft' | 'approved' | 'rejected';

export interface GeneratedQuestion {
  id: string;
  passageId: string;
  questionType: QuestionType;
  questionText: string;       // 문제 지시문
  passageModified: string;    // 문항용 가공 지문
  choices: string[];          // 5개 선지
  correctAnswer: number;      // 1~5
  distractorRationale?: string;
  status: QuestionStatus;
  createdAt: Date;
  // Relations
  passage?: Passage;
  feedback?: QuestionFeedback[];
}

// -- Question Feedback (문항 피드백) -----------------------------------------

export interface QuestionFeedback {
  id: string;
  questionId: string;
  score: number;              // 0~10
  comment?: string;
  corrections?: Record<string, unknown>;
  createdAt: Date;
}

// -- Explanation (해설, Phase 2) ---------------------------------------------

export interface Explanation {
  id: string;
  questionId: string;
  templateId?: string;
  content: string;
  status: 'draft' | 'approved';
  createdAt: Date;
}

// -- Workbench State (UI 상태) -----------------------------------------------

export interface CrawlRequest {
  keywords: string[];
  questionTypes: QuestionType[];
  repositories: string[];
}

export interface CrawlProgress {
  repository: string;
  status: 'idle' | 'searching' | 'fetching' | 'extracting' | 'done' | 'error';
  found: number;
  total: number;
  message?: string;
}
