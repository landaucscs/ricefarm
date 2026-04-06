/**
 * Gemini-powered Scorer
 * Gemini Flash (무료)로 지문 적합도를 평가합니다.
 */

import { geminiJsonCall } from '@/lib/gemini';
import { buildEvaluationPrompt } from '@/lib/prompt-builder';
import type { RuleExtractedPassage } from './rule-extractor';
import type { QuestionType, PassageScoreMetrics } from '@/types';

interface GeminiScoreResponse {
  topic_depth: number;
  logical_structure: number;
  standalone_coherence: number;
  vocabulary_level: number;
  question_type_fit: number;
  distractor_potential: number;
  question_types: string[];
  reasoning: string;
  type_hints?: Record<string, Record<string, unknown>>;
}

export interface GeminiScoredPassage extends RuleExtractedPassage {
  scores: PassageScoreMetrics;
  totalWeighted: number;
  suggestedTypes: QuestionType[];
  scoreReasoning: string;
  typeHints: Record<string, Record<string, unknown>>;
}

function calculateTotal(s: PassageScoreMetrics): number {
  return Math.round(
    (s.topicDepth * 15 + s.logicalStructure * 20 + s.standaloneCoherence * 15 +
     s.vocabularyLevel * 15 + s.questionTypeFit * 20 + s.distractorPotential * 15) / 10
  );
}

export async function scoreWithGemini(
  passage: RuleExtractedPassage,
  questionType: QuestionType,
): Promise<GeminiScoredPassage | null> {
  const systemPrompt = await buildEvaluationPrompt(questionType);

  const userMessage = `다음 지문을 "${questionType}" 유형 수능 문항 적합도 관점에서 평가하세요.

JSON 형식으로 응답:
{
  "topic_depth": 0~10,
  "logical_structure": 0~10,
  "standalone_coherence": 0~10,
  "vocabulary_level": 0~10,
  "question_type_fit": 0~10,
  "distractor_potential": 0~10,
  "question_types": ["적합한 유형 코드 배열"],
  "reasoning": "평가 근거",
  "type_hints": {
    "유형코드": { 유형별 출제 힌트 }
  }
}

유형별 type_hints 작성 규칙:
- blank: {"suggested_blank_phrase": "빈칸 어구 원문 인용", "why_this_blank": "이유"}
- implication: {"underline_phrase": "밑줄 표현 원문 인용", "implied_meaning": "함축 의미"}
- claim: {"core_claim": "~하라/~말라 형태"}
- gist: {"core_gist": "~하다/~이다 형태"}
- topic: {"core_topic": "영어 명사형 표현"}
- title: {"suggested_title": "Title Case 영어"}
- insertion: {"removable_sentence": "원문 인용", "why_removable": "이유"}
- vocabulary: {"target_words": ["5개 어휘"]}
- grammar: {"target_points": ["5개 어법 포인트"]}
- summary: {"summary_sentence": "(A)(B) 포함 요약문", "answer_a": "정답", "answer_b": "정답"}
- order: {"intro": "첫 부분", "part_a": "(A)", "part_b": "(B)", "part_c": "(C)", "correct_order": "(B)-(A)-(C)"}

지문:
"""
${passage.text}
"""

단어 수: ${passage.wordCount}
출처: ${passage.sourceDocument.searchResult.title}`;

  const response = await geminiJsonCall<GeminiScoreResponse>(systemPrompt, userMessage);

  if (!response) return null;

  const scores: PassageScoreMetrics = {
    topicDepth: Number(response.topic_depth) || 0,
    logicalStructure: Number(response.logical_structure) || 0,
    standaloneCoherence: Number(response.standalone_coherence) || 0,
    vocabularyLevel: Number(response.vocabulary_level) || 0,
    questionTypeFit: Number(response.question_type_fit) || 0,
    distractorPotential: Number(response.distractor_potential) || 0,
  };

  return {
    ...passage,
    scores,
    totalWeighted: calculateTotal(scores),
    suggestedTypes: (response.question_types || []) as QuestionType[],
    scoreReasoning: response.reasoning || '',
    typeHints: response.type_hints || {},
  };
}
