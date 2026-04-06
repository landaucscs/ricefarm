/**
 * Quality Scorer
 * Claude API를 사용하여 추출된 지문의 수능 적합도를 평가합니다.
 */

import { EVALUATION_TOOLS, MODEL_HAIKU } from '@/lib/claude';
import { runWithTools, findToolCall } from '@/lib/claude-runner';
import { buildEvaluationPrompt } from '@/lib/prompt-builder';
import type { ExtractedPassage } from './extractor';
import type { QuestionType, PassageScoreMetrics } from '@/types';

export interface ScoredPassage extends ExtractedPassage {
  scores: PassageScoreMetrics;
  totalWeighted: number;
  suggestedTypes: QuestionType[];
  scoreReasoning: string;
  typeHints: Record<string, Record<string, unknown>>;
}

function calculateTotal(scores: PassageScoreMetrics): number {
  return Math.round(
    (scores.topicDepth * 15 +
      scores.logicalStructure * 20 +
      scores.standaloneCoherence * 15 +
      scores.vocabularyLevel * 15 +
      scores.questionTypeFit * 20 +
      scores.distractorPotential * 15) /
      10
  );
}

export async function scorePassage(
  passage: ExtractedPassage,
  questionType: QuestionType,
): Promise<ScoredPassage | null> {
  const systemPrompt = await buildEvaluationPrompt(questionType);

  const result = await runWithTools({
    system: systemPrompt,
    tools: EVALUATION_TOOLS,
    model: MODEL_HAIKU,
    userMessage: `다음 지문을 "${questionType}" 유형 수능 문항 적합도 관점에서 평가해주세요.

1. 먼저 count_words 도구로 단어 수를 확인하세요.
2. 그 다음 score_passage 도구로 6개 metric 점수를 매기세요.

지문:
"""
${passage.text}
"""

출처: ${passage.sourceDocument.searchResult.title}
원문 단어 수: ${passage.wordCount}`,
  });

  const scoresInput = findToolCall(result, 'score_passage');
  if (!scoresInput) return null;

  const scores: PassageScoreMetrics = {
    topicDepth: Number(scoresInput.topic_depth) || 0,
    logicalStructure: Number(scoresInput.logical_structure) || 0,
    standaloneCoherence: Number(scoresInput.standalone_coherence) || 0,
    vocabularyLevel: Number(scoresInput.vocabulary_level) || 0,
    questionTypeFit: Number(scoresInput.question_type_fit) || 0,
    distractorPotential: Number(scoresInput.distractor_potential) || 0,
  };

  return {
    ...passage,
    scores,
    totalWeighted: calculateTotal(scores),
    suggestedTypes: (scoresInput.question_types as string[] || []) as QuestionType[],
    scoreReasoning: String(scoresInput.reasoning || ''),
    typeHints: (scoresInput.type_hints as Record<string, Record<string, unknown>>) || {},
  };
}

export async function scorePassages(
  passages: ExtractedPassage[],
  questionType: QuestionType,
): Promise<ScoredPassage[]> {
  const scored: ScoredPassage[] = [];

  for (const passage of passages) {
    try {
      const result = await scorePassage(passage, questionType);
      if (result) scored.push(result);
    } catch (err) {
      console.error(`Scoring failed for passage from: ${passage.sourceDocument.searchResult.title}`, err);
    }
  }

  return scored.sort((a, b) => b.totalWeighted - a.totalWeighted);
}
