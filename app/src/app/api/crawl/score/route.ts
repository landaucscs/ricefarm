import { NextRequest, NextResponse } from 'next/server';
import { EVALUATION_TOOLS, MODEL_HAIKU } from '@/lib/claude';
import { runWithTools, findToolCall } from '@/lib/claude-runner';
import { buildEvaluationPrompt } from '@/lib/prompt-builder';
import { prisma } from '@/lib/db';
import type { QuestionType } from '@/types';

/**
 * POST /api/crawl/score
 *
 * ricefarm: Claude 2차 정밀 평가 (상위 후보에만 사용)
 * Gemini 1차 평가는 crawl/extract 라우트에서 자동으로 수행됨.
 * 이 라우트는 사용자가 수동으로 Claude 재평가를 요청할 때 사용.
 *
 * Body: {
 *   passage: { text, startIndex, endIndex, wordCount, sourceTitle, sourceUrl, repository, authors, isJangmunCandidate },
 *   questionType: QuestionType,
 *   passageId?: string   // 기존 passage DB ID (있으면 기존 레코드에 점수 추가)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { passage, questionType, passageId } = await request.json() as {
      passage: {
        text: string;
        startIndex: number;
        endIndex: number;
        wordCount: number;
        sourceTitle: string;
        sourceUrl: string;
        repository: string;
        authors: string[];
        isJangmunCandidate: boolean;
      };
      questionType: QuestionType;
      passageId?: string;
    };

    const systemPrompt = await buildEvaluationPrompt(questionType);

    const result = await runWithTools({
      system: systemPrompt,
      tools: EVALUATION_TOOLS,
      model: MODEL_HAIKU,
      userMessage: `다음 지문을 "${questionType}" 유형 수능 문항 적합도 관점에서 평가해주세요.
count_words로 단어 수 확인 후 score_passage로 점수를 매겨주세요.

지문:
"""
${passage.text}
"""

출처: ${passage.sourceTitle}`,
    });

    const scoresInput = findToolCall(result, 'score_passage');
    if (!scoresInput) {
      return NextResponse.json({ success: true, scored: null, reason: 'Scoring failed' });
    }

    const scores = {
      topicDepth: Number(scoresInput.topic_depth) || 0,
      logicalStructure: Number(scoresInput.logical_structure) || 0,
      standaloneCoherence: Number(scoresInput.standalone_coherence) || 0,
      vocabularyLevel: Number(scoresInput.vocabulary_level) || 0,
      questionTypeFit: Number(scoresInput.question_type_fit) || 0,
      distractorPotential: Number(scoresInput.distractor_potential) || 0,
    };

    const totalWeighted = Math.round(
      (scores.topicDepth * 15 + scores.logicalStructure * 20 +
       scores.standaloneCoherence * 15 + scores.vocabularyLevel * 15 +
       scores.questionTypeFit * 20 + scores.distractorPotential * 15) / 10
    );

    const suggestedTypes = (scoresInput.question_types as string[]) || [];
    const typeHints = (scoresInput.type_hints as Record<string, unknown>) || {};

    const commentData = JSON.stringify({
      reasoning: String(scoresInput.reasoning || ''),
      typeHints,
    });

    // DB 저장: passageId가 있으면 기존 passage에 Claude 점수 추가
    let dbPassageId = passageId;

    if (!dbPassageId) {
      const source = await prisma.source.create({
        data: {
          title: passage.sourceTitle,
          authors: JSON.stringify(passage.authors),
          sourceUrl: passage.sourceUrl,
          repository: passage.repository,
        },
      });

      const dbPassage = await prisma.passage.create({
        data: {
          sourceId: source.id,
          text: passage.text,
          startIndex: passage.startIndex,
          endIndex: passage.endIndex,
          wordCount: passage.wordCount,
          isJangmunCandidate: passage.isJangmunCandidate,
          status: 'pending',
        },
      });

      dbPassageId = dbPassage.id;
    }

    // Claude 점수를 별도 레코드로 저장 (scorer: 'claude')
    await prisma.passageScore.create({
      data: {
        passageId: dbPassageId,
        scorer: 'claude',
        ...scores,
        totalWeighted,
        questionTypes: JSON.stringify(suggestedTypes),
        comment: commentData,
      },
    });

    return NextResponse.json({
      success: true,
      scored: {
        id: dbPassageId,
        text: passage.text,
        wordCount: passage.wordCount,
        sourceUrl: passage.sourceUrl,
        sourceTitle: passage.sourceTitle,
        repository: passage.repository,
        scores,
        totalWeighted,
        suggestedTypes,
        isJangmunCandidate: passage.isJangmunCandidate,
        typeHints,
        scoredBy: 'claude',
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
