import { NextRequest, NextResponse } from 'next/server';
import { geminiJsonCall } from '@/lib/gemini';
import { buildEvaluationPrompt } from '@/lib/prompt-builder';
import type { QuestionType } from '@/types';

interface GeminiEvalResponse {
  word_count: number;
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

export async function POST(request: NextRequest) {
  try {
    const { passageText, questionType } = await request.json() as {
      passageText: string;
      questionType: QuestionType;
    };

    const systemPrompt = await buildEvaluationPrompt(questionType);

    const userMessage = `다음 지문을 "${questionType}" 유형 수능 문항 적합도 관점에서 평가하세요.

JSON 형식으로 응답:
{
  "word_count": 단어 수,
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
${passageText}
"""`;

    const response = await geminiJsonCall<GeminiEvalResponse>(systemPrompt, userMessage);

    if (!response) {
      return NextResponse.json({ success: false, error: 'Evaluation failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      wordCount: response.word_count,
      scores: {
        topic_depth: response.topic_depth,
        logical_structure: response.logical_structure,
        standalone_coherence: response.standalone_coherence,
        vocabulary_level: response.vocabulary_level,
        question_type_fit: response.question_type_fit,
        distractor_potential: response.distractor_potential,
        question_types: response.question_types,
        reasoning: response.reasoning,
        type_hints: response.type_hints,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
