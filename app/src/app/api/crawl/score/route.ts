import { NextRequest, NextResponse } from 'next/server';
import { geminiJsonCall } from '@/lib/gemini';
import { buildEvaluationPrompt } from '@/lib/prompt-builder';
import { prisma } from '@/lib/db';
import type { QuestionType } from '@/types';

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

/**
 * POST /api/crawl/score
 *
 * ricefarm: Gemini 기반 평가 (토큰 0)
 * 사용자가 수동으로 재평가를 요청할 때 사용.
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
  "type_hints": { "유형코드": { 유형별 출제 힌트 } }
}

지문:
"""
${passage.text}
"""

출처: ${passage.sourceTitle}
단어 수: ${passage.wordCount}`;

    const response = await geminiJsonCall<GeminiScoreResponse>(systemPrompt, userMessage);

    if (!response) {
      return NextResponse.json({ success: true, scored: null, reason: 'Scoring failed' });
    }

    const scores = {
      topicDepth: Number(response.topic_depth) || 0,
      logicalStructure: Number(response.logical_structure) || 0,
      standaloneCoherence: Number(response.standalone_coherence) || 0,
      vocabularyLevel: Number(response.vocabulary_level) || 0,
      questionTypeFit: Number(response.question_type_fit) || 0,
      distractorPotential: Number(response.distractor_potential) || 0,
    };

    const totalWeighted = Math.round(
      (scores.topicDepth * 15 + scores.logicalStructure * 20 +
       scores.standaloneCoherence * 15 + scores.vocabularyLevel * 15 +
       scores.questionTypeFit * 20 + scores.distractorPotential * 15) / 10
    );

    const suggestedTypes = response.question_types || [];
    const typeHints = response.type_hints || {};

    const commentData = JSON.stringify({
      reasoning: response.reasoning || '',
      typeHints,
    });

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

    await prisma.passageScore.create({
      data: {
        passageId: dbPassageId,
        scorer: 'ai',
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
        scoredBy: 'gemini',
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
