import { NextRequest, NextResponse } from 'next/server';
import { geminiJsonCall } from '@/lib/gemini';
import { buildGenerationPrompt } from '@/lib/prompt-builder';
import type { QuestionType } from '@/types';

interface GeminiQuestionResponse {
  question_type: string;
  question_text: string;
  passage_modified: string;
  choices: string[];
  correct_answer: number;
  distractor_rationale: string;
}

export async function POST(request: NextRequest) {
  try {
    const { passageText, questionType } = await request.json() as {
      passageText: string;
      questionType: QuestionType;
    };

    const systemPrompt = await buildGenerationPrompt(questionType);

    const userMessage = `다음 지문을 바탕으로 "${questionType}" 유형의 수능 영어 문항을 생성하세요.

JSON 형식으로 응답:
{
  "question_type": "${questionType}",
  "question_text": "문제 지시문 (예: 다음 빈칸에 들어갈 말로 가장 적절한 것은?)",
  "passage_modified": "문항용으로 가공된 지문 (빈칸 처리, 순서 섞기, 번호 삽입 등)",
  "choices": ["① 선지1", "② 선지2", "③ 선지3", "④ 선지4", "⑤ 선지5"],
  "correct_answer": 1~5 중 정답 번호,
  "distractor_rationale": "각 오답 선지의 매력도 및 오답인 이유 설명"
}

[중요 규칙]
- choices 배열은 반드시 5개
- correct_answer는 1~5 사이 정수
- passage_modified는 원문을 유형에 맞게 가공한 것 (빈칸, 순서 섞기 등)
- distractor_rationale에 각 오답이 왜 매력적이지만 틀린지 구체적으로 설명

지문:
"""
${passageText}
"""`;

    const question = await geminiJsonCall<GeminiQuestionResponse>(systemPrompt, userMessage);

    if (!question) {
      return NextResponse.json({
        success: false,
        error: 'Gemini failed to generate question',
      }, { status: 500 });
    }

    // 형식 검증
    if (!Array.isArray(question.choices) || question.choices.length !== 5) {
      return NextResponse.json({
        success: false,
        error: `Invalid choices: expected 5, got ${question.choices?.length ?? 0}`,
      }, { status: 500 });
    }

    if (question.correct_answer < 1 || question.correct_answer > 5) {
      return NextResponse.json({
        success: false,
        error: `Invalid correct_answer: ${question.correct_answer}`,
      }, { status: 500 });
    }

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
