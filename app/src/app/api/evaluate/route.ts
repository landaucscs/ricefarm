import { NextRequest, NextResponse } from 'next/server';
import { EVALUATION_TOOLS } from '@/lib/claude';
import { runWithTools, findToolCall } from '@/lib/claude-runner';
import { buildEvaluationPrompt } from '@/lib/prompt-builder';
import type { QuestionType } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { passageText, questionType } = await request.json() as {
      passageText: string;
      questionType: QuestionType;
    };

    const systemPrompt = await buildEvaluationPrompt(questionType);

    const result = await runWithTools({
      system: systemPrompt,
      tools: EVALUATION_TOOLS,
      userMessage: `다음 지문을 "${questionType}" 유형 수능 문항 적합도 관점에서 평가해주세요.
단어 수를 먼저 count_words 도구로 확인한 후, score_passage 도구로 점수를 매겨주세요.

지문:
"""
${passageText}
"""`,
    });

    const wordCountCall = findToolCall(result, 'count_words');
    const scoresCall = findToolCall(result, 'score_passage');

    return NextResponse.json({
      success: true,
      wordCount: wordCountCall?.text ? String(wordCountCall.text).split(/\s+/).length : null,
      scores: scoresCall,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
