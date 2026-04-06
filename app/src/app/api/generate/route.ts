import { NextRequest, NextResponse } from 'next/server';
import { GENERATION_TOOLS, MODEL_SONNET } from '@/lib/claude';
import { runWithTools, findToolCall } from '@/lib/claude-runner';
import { buildGenerationPrompt } from '@/lib/prompt-builder';
import type { QuestionType } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { passageText, questionType } = await request.json() as {
      passageText: string;
      questionType: QuestionType;
    };

    const systemPrompt = await buildGenerationPrompt(questionType);

    const result = await runWithTools({
      system: systemPrompt,
      tools: GENERATION_TOOLS,
      model: MODEL_SONNET,
      userMessage: `다음 지문을 바탕으로 "${questionType}" 유형의 수능 영어 문항을 생성해주세요.
generate_question 도구를 사용하여 문항을 생성하세요.

지문:
"""
${passageText}
"""`,
    });

    const question = findToolCall(result, 'generate_question');

    return NextResponse.json({
      success: true,
      question,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
