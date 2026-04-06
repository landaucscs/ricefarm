/**
 * Feedback Retriever
 * DB에서 과거 피드백을 검색하여 prompt에 주입할 few-shot examples를 제공합니다.
 * Phase 1: 최근 피드백 기반. Phase 2+: pgvector 유사도 검색.
 */

import { prisma } from './db';
import type { QuestionType } from '@/types';

export interface FeedbackExample {
  passageText: string;
  approved: boolean;
  comment: string;
  questionTypes: QuestionType[];
}

/**
 * 특정 유형에 대한 최근 피드백을 가져오기
 * approved / rejected 각각 최대 limitPerGroup개
 */
export async function getRecentFeedback(
  questionType: QuestionType,
  limitPerGroup = 3,
): Promise<{ approved: FeedbackExample[]; rejected: FeedbackExample[] }> {
  // 모든 피드백을 최근순으로 가져와서 유형 필터링
  const allFeedback = await prisma.passageFeedback.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { passage: true },
  });

  const approved: FeedbackExample[] = [];
  const rejected: FeedbackExample[] = [];

  for (const fb of allFeedback) {
    const types: QuestionType[] = JSON.parse(fb.questionTypes || '[]');

    // 유형 매칭 (빈 배열이면 모든 유형에 해당)
    if (types.length > 0 && !types.includes(questionType)) continue;

    const example: FeedbackExample = {
      passageText: fb.passage.text.substring(0, 300),
      approved: fb.approved,
      comment: fb.comment || '',
      questionTypes: types,
    };

    if (fb.approved && approved.length < limitPerGroup) {
      approved.push(example);
    } else if (!fb.approved && rejected.length < limitPerGroup) {
      rejected.push(example);
    }

    if (approved.length >= limitPerGroup && rejected.length >= limitPerGroup) break;
  }

  return { approved, rejected };
}

/**
 * 피드백을 프롬프트 텍스트로 포맷팅
 */
export function formatFeedbackForPrompt(
  feedback: { approved: FeedbackExample[]; rejected: FeedbackExample[] },
): string {
  if (feedback.approved.length === 0 && feedback.rejected.length === 0) {
    return '';
  }

  const sections: string[] = [];

  if (feedback.approved.length > 0) {
    sections.push('=== 사용자가 승인한 지문 ===');
    for (const fb of feedback.approved) {
      sections.push(`지문: "${fb.passageText}..."\n피드백: ${fb.comment}`);
    }
  }

  if (feedback.rejected.length > 0) {
    sections.push('=== 사용자가 거부한 지문 ===');
    for (const fb of feedback.rejected) {
      sections.push(`지문: "${fb.passageText}..."\n거부 이유: ${fb.comment}`);
    }
  }

  return `[사용자 피드백 히스토리]\n${sections.join('\n\n')}`;
}
