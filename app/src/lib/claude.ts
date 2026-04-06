import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';

// -- Client -------------------------------------------------------------------

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default anthropic;

// -- Model Selection ----------------------------------------------------------
// Haiku for high-volume low-stakes tasks (extract, score)
// Sonnet for quality-critical tasks (generate questions)

export const MODEL_HAIKU = 'claude-haiku-4-5-20251001';
export const MODEL_SONNET = 'claude-sonnet-4-20250514';

// -- Tool Definitions ---------------------------------------------------------

export const EXTRACT_PASSAGE_TOOL: Tool = {
  name: 'extract_passage',
  description: '원문에서 수능 지문으로 적합한 구간의 위치를 지정합니다. 텍스트를 생성하지 말고, 반드시 문장 인덱스만 반환하세요.',
  input_schema: {
    type: 'object' as const,
    properties: {
      start_sentence_index: {
        type: 'integer',
        description: '추출 시작 문장의 인덱스 (0-based)',
      },
      end_sentence_index: {
        type: 'integer',
        description: '추출 종료 문장의 인덱스 (inclusive)',
      },
      reasoning: {
        type: 'string',
        description: '이 구간을 선택한 이유',
      },
    },
    required: ['start_sentence_index', 'end_sentence_index', 'reasoning'],
  },
};

export const COUNT_WORDS_TOOL: Tool = {
  name: 'count_words',
  description: '주어진 영문 텍스트의 정확한 단어 수를 반환합니다. 직접 세지 말고 이 도구를 사용하세요.',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: {
        type: 'string',
        description: '단어 수를 셀 텍스트',
      },
    },
    required: ['text'],
  },
};

export const SCORE_PASSAGE_TOOL: Tool = {
  name: 'score_passage',
  description: '지문의 수능 적합도를 6개 metric으로 평가하고, 적합한 문항 유형을 태깅하며, 각 유형별 출제 힌트를 제공합니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      topic_depth: { type: 'integer', description: '주제 깊이/학술성 (0~10)' },
      logical_structure: { type: 'integer', description: '논리 전개 명확성 (0~10)' },
      standalone_coherence: { type: 'integer', description: '발췌 완결성 (0~10)' },
      vocabulary_level: { type: 'integer', description: '어휘 난이도 적합성 (0~10)' },
      question_type_fit: { type: 'integer', description: '유형 적합도 (0~10)' },
      distractor_potential: { type: 'integer', description: '오답 선지 생성 가능성 (0~10)' },
      question_types: {
        type: 'array',
        items: { type: 'string' },
        description: '적합한 문항 유형 코드 배열 (예: ["blank", "order"])',
      },
      reasoning: { type: 'string', description: '평가 근거' },
      type_hints: {
        type: 'object',
        description: '각 추천 유형별 구체적 출제 힌트. question_types에 포함된 유형에 대해서만 작성.',
        properties: {
          blank: {
            type: 'object',
            description: '빈칸 추론 힌트',
            properties: {
              suggested_blank_phrase: { type: 'string', description: '빈칸으로 뚫기에 이상적인 핵심 어구/문장 부분 (원문 그대로 인용)' },
              why_this_blank: { type: 'string', description: '왜 이 부분이 빈칸에 적합한지 (논리적 귀결, 주제 핵심 등)' },
            },
          },
          implication: {
            type: 'object',
            description: '함축 의미 힌트',
            properties: {
              underline_phrase: { type: 'string', description: '밑줄 그을 비유적/함축적 표현 (원문 그대로 인용)' },
              implied_meaning: { type: 'string', description: '해당 표현이 내포하는 의미 (정답 선지의 방향)' },
            },
          },
          claim: {
            type: 'object',
            description: '주장 힌트',
            properties: {
              core_claim: { type: 'string', description: '필자의 핵심 주장 (~하라/~말라 형태로)' },
            },
          },
          gist: {
            type: 'object',
            description: '요지 힌트',
            properties: {
              core_gist: { type: 'string', description: '글의 요지 (~하다/~이다 형태로)' },
            },
          },
          topic: {
            type: 'object',
            description: '주제 힌트',
            properties: {
              core_topic: { type: 'string', description: '글의 주제 (명사형 표현, 영어)' },
            },
          },
          title: {
            type: 'object',
            description: '제목 힌트',
            properties: {
              suggested_title: { type: 'string', description: '적절한 제목 (비유적/상징적 표현, Title Case, 영어)' },
            },
          },
          insertion: {
            type: 'object',
            description: '문장 삽입 힌트',
            properties: {
              removable_sentence: { type: 'string', description: '빼서 삽입 문제로 출제하기 좋은 문장 (원문 그대로 인용)' },
              why_removable: { type: 'string', description: '이 문장이 삽입 문제에 적합한 이유' },
            },
          },
          vocabulary: {
            type: 'object',
            description: '어휘 힌트',
            properties: {
              target_words: {
                type: 'array',
                items: { type: 'string' },
                description: '선지로 출제하기 좋은 5개 어휘 (원문에서 그대로 인용, 문맥상 의미 판단이 필요한 것들)',
              },
            },
          },
          grammar: {
            type: 'object',
            description: '어법 힌트',
            properties: {
              target_points: {
                type: 'array',
                items: { type: 'string' },
                description: '어법 선지로 출제하기 좋은 5개 부분 (원문 인용 + 어법 사항 간략 설명, 예: "which → 관계대명사 vs 접속사")',
              },
            },
          },
          summary: {
            type: 'object',
            description: '요약문 힌트',
            properties: {
              summary_sentence: { type: 'string', description: '요약문 문장 ((A)와 (B)로 빈칸 표시 포함)' },
              answer_a: { type: 'string', description: '(A)에 들어갈 정답 단어' },
              answer_b: { type: 'string', description: '(B)에 들어갈 정답 단어' },
            },
          },
          order: {
            type: 'object',
            description: '순서 배열 힌트',
            properties: {
              intro: { type: 'string', description: '주어진 글 (발문으로 제시될 첫 부분, 원문 인용)' },
              part_a: { type: 'string', description: '(A) 파트 (원문 인용)' },
              part_b: { type: 'string', description: '(B) 파트 (원문 인용)' },
              part_c: { type: 'string', description: '(C) 파트 (원문 인용)' },
              correct_order: { type: 'string', description: '정답 순서 (예: "(B)-(A)-(C)")' },
            },
          },
        },
      },
    },
    required: [
      'topic_depth', 'logical_structure', 'standalone_coherence',
      'vocabulary_level', 'question_type_fit', 'distractor_potential',
      'question_types', 'reasoning', 'type_hints',
    ],
  },
};

export const GENERATE_QUESTION_TOOL: Tool = {
  name: 'generate_question',
  description: '수능 영어 문항을 생성합니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      question_type: {
        type: 'string',
        enum: [
          'blank', 'order', 'insertion', 'topic', 'title',
          'gist', 'claim', 'implication', 'grammar', 'vocabulary',
          'summary', 'irrelevant',
        ],
        description: '문항 유형',
      },
      question_text: {
        type: 'string',
        description: '문제 지시문 (예: 다음 빈칸에 들어갈 말로 가장 적절한 것은?)',
      },
      passage_modified: {
        type: 'string',
        description: '문항용으로 가공된 지문 (빈칸 처리, 순서 섞기, 번호 삽입 등)',
      },
      choices: {
        type: 'array',
        items: { type: 'string' },
        minItems: 5,
        maxItems: 5,
        description: '5개 선지',
      },
      correct_answer: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: '정답 번호 (1~5)',
      },
      distractor_rationale: {
        type: 'string',
        description: '각 오답 선지의 매력도 및 오답인 이유 설명',
      },
    },
    required: [
      'question_type', 'question_text', 'passage_modified',
      'choices', 'correct_answer', 'distractor_rationale',
    ],
  },
};

// -- Tool Collections ---------------------------------------------------------

export const EXTRACTION_TOOLS: Tool[] = [EXTRACT_PASSAGE_TOOL, COUNT_WORDS_TOOL];
export const EVALUATION_TOOLS: Tool[] = [SCORE_PASSAGE_TOOL, COUNT_WORDS_TOOL];
export const GENERATION_TOOLS: Tool[] = [GENERATE_QUESTION_TOOL];

// -- Utility: Word Count (server-side, tool result) ---------------------------

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
