import { getGuidelineForType, getWordCountRange } from './guidelines-loader';
import { getSeedExamplesByType } from './seed-loader';
import type { QuestionType, SeedExample } from '@/types';

/**
 * 시드 예시를 프롬프트 텍스트로 포맷팅
 */
function formatSeedExamples(examples: SeedExample[]): string {
  return examples
    .map((ex, i) => {
      const passagePreview = (ex.passageOnly || ex.passage).substring(0, 300);
      return [
        `예시 #${i + 1} (기출 코드: ${ex.questionCode}, ${ex.questionNumber}번):`,
        `지문: "${passagePreview}${passagePreview.length >= 300 ? '...' : ''}"`,
        `단어수: ${ex.wordCount} | 정답: ${ex.answer}번`,
        ex.choices ? `선지: ${ex.choices.map((c, j) => `${j + 1}) ${c}`).join(' | ')}` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

// ----- System Prompt Builders -----

/**
 * 지문 평가용 System Prompt 생성 (Engine 1: Crawl & Evaluate)
 */
export async function buildEvaluationPrompt(questionType: QuestionType): Promise<string> {
  const guideline = getGuidelineForType(questionType);
  const wordRange = getWordCountRange(questionType);
  const seedExamples = await getSeedExamplesByType(questionType, 5);

  const sections: string[] = [];

  // 1. 역할 정의
  sections.push(`당신은 한국 수능 영어 시험의 지문 선별 및 평가 전문가입니다.
학술 원문에서 추출된 영어 지문이 수능 영어 "${guideline.name}" 유형 (${questionType}) 문항으로 적합한지 평가합니다.`);

  // 2. 대전제
  sections.push(`[대전제 - 모든 유형 공통]
${guideline.global.passage_rules.map(r => `- ${r}`).join('\n')}
- 단어 수 기준: ${wordRange.min}~${wordRange.max}단어`);

  // 3. 유형별 지침
  sections.push(`[${guideline.name} 유형 출제 지침]

지문 요건:
${guideline.passage_criteria.map(r => `- ${r}`).join('\n')}

선지 구성 규칙:
${guideline.choice_rules.map(r => `- ${r}`).join('\n')}

주의사항 (피해야 할 것):
${(guideline.pitfalls || []).map(r => `- ${r}`).join('\n')}`);

  // 4. 평가 기준 (6개 metric)
  sections.push(`[평가 기준 - 각 0~10점]
- topic_depth: 주제의 깊이/학술성 (너무 쉽거나 어렵지 않은)
- logical_structure: 논리 전개의 명확성 (주장-근거-결론)
- standalone_coherence: 발췌만으로 의미가 완결되는 정도
- vocabulary_level: 수능 수준에 적합한 어휘 난이도
- question_type_fit: "${guideline.name}" 유형에 얼마나 잘 맞는지
- distractor_potential: 매력적인 오답 선지 생성 가능성`);

  // 4.5. 유형별 출제 힌트 지시
  sections.push(`[유형별 출제 힌트 - 반드시 type_hints 필드에 작성]
score_passage 도구의 type_hints 필드에, question_types로 추천한 각 유형에 대해 구체적인 출제 힌트를 반드시 작성하세요.
기출 예시와 출제 지침을 철저히 참고하여, 실제 평가원 출제자가 이 지문을 받았을 때 어떻게 문항화할지를 구체적으로 제안하세요.

유형별 힌트 작성 규칙:
- blank (빈칸): 빈칸으로 뚫을 핵심 어구를 원문에서 정확히 인용. 글의 주제/요지와 직결되는 부분이어야 하며, 해당 문장만으로는 답을 유추할 수 없어야 함.
- implication (함축): 밑줄 그을 비유적 표현을 원문에서 정확히 인용 + 그 함축 의미. 전체 글을 읽어야만 의미를 파악할 수 있는 표현이어야 함.
- claim (주장): 핵심 주장을 '~하라/~말라' 형태의 한국어로 작성.
- gist (요지): 요지를 '~하다/~이다' 형태의 한국어로 작성. 주제문 직역이 아닌 재구성.
- topic (주제): 주제를 영어 명사형 표현으로 작성.
- title (제목): 비유적/상징적 제목을 Title Case 영어로 작성.
- insertion (삽입): 빼서 삽입 문제로 출제할 문장을 원문에서 정확히 인용 + 이유.
- vocabulary (어휘): 문맥상 의미 판단이 필요한 어휘 5개를 원문에서 인용. 첫 문장 어휘 제외, 같은 문장에서 2개 이상 금지.
- grammar (어법): 어법 선지 5개 부분을 원문 인용 + 어법 사항 설명. 5개가 서로 다른 어법 사항이어야 함.
- summary (요약): 요약문을 (A)와 (B) 빈칸 포함하여 작성 + 정답 단어. 주어+동사 2~3개 포함 복문.
- order (순서): 지문을 intro + (A)(B)(C)로 분할하여 원문 인용 + 정답 순서.`);

  // 5. 기출 예시
  if (seedExamples.length > 0) {
    sections.push(`[이상적인 기출 예시 - 평가원 실제 출제]
아래는 실제 수능/모의고사에서 "${guideline.name}" 유형으로 출제된 기출 문항입니다.
이 지문들의 구조, 어휘 수준, 논리 전개 패턴을 참고하여 새 지문을 평가하세요.

${formatSeedExamples(seedExamples)}`);
  }

  // 6. 사용자 피드백 (DB에 있으면 주입)
  try {
    const { getRecentFeedback, formatFeedbackForPrompt } = await import('./feedback-retriever');
    const feedback = await getRecentFeedback(questionType, 3);
    const feedbackText = formatFeedbackForPrompt(feedback);
    if (feedbackText) {
      sections.push(feedbackText);
    }
  } catch {
    // feedback retriever 없거나 DB 에러 시 무시 — seed만으로 동작
  }

  return sections.join('\n\n---\n\n');
}

/**
 * 지문 추출용 System Prompt 생성 (verbatim 전용)
 */
export function buildExtractionPrompt(questionType: QuestionType): string {
  const guideline = getGuidelineForType(questionType);
  const wordRange = getWordCountRange(questionType);

  return `당신은 학술 원문에서 수능 영어 "${guideline.name}" 유형에 적합한 지문 구간을 찾는 전문가입니다.

[절대 규칙 - VERBATIM]
- 원문에 존재하지 않는 단어, 문장, 표현을 절대 생성하지 마세요.
- 당신의 역할은 원문의 "위치"를 지정하는 것이지, 텍스트를 작성하는 것이 아닙니다.
- extract_passage 도구를 사용하여 시작/종료 문장 인덱스만 반환하세요.
- 원문을 요약, 패러프레이즈, 재구성하지 마세요.

[단어 수 기준]
${wordRange.min}~${wordRange.max}단어 범위의 standalone 지문을 찾으세요.
범위를 벗어나면 count_words 도구로 확인 후 구간을 재조정하세요.

[${guideline.name} 유형 지문 요건]
${guideline.passage_criteria.map(r => `- ${r}`).join('\n')}

[대전제]
${guideline.global.passage_rules.map(r => `- ${r}`).join('\n')}`;
}

/**
 * 문항 생성용 System Prompt 생성 (Engine 2: Question Generation)
 */
export async function buildGenerationPrompt(questionType: QuestionType): Promise<string> {
  const guideline = getGuidelineForType(questionType);
  const seedExamples = await getSeedExamplesByType(questionType, 3);

  const sections: string[] = [];

  sections.push(`당신은 한국 수능 영어 시험의 문항 출제 전문가입니다.
주어진 지문을 바탕으로 "${guideline.name}" 유형 (${questionType}) 문항을 생성합니다.`);

  sections.push(`[선지 구성 규칙 - 반드시 준수]
${guideline.choice_rules.map(r => `- ${r}`).join('\n')}

선지 형식: ${guideline.choice_format}

주의사항:
${(guideline.pitfalls || []).map(r => `- ${r}`).join('\n')}`);

  if (seedExamples.length > 0) {
    sections.push(`[참고: 실제 기출 문항 예시]
${formatSeedExamples(seedExamples)}`);
  }

  return sections.join('\n\n---\n\n');
}
