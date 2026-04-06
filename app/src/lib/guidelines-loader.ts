import fs from 'fs';
import path from 'path';
import type { Guidelines, GuidelineType, GuidelineGlobal } from '@/types';

const GUIDELINES_PATH = path.resolve(process.cwd(), '..', 'seed-data', 'guidelines.json');

let cachedGuidelines: Guidelines | null = null;

/**
 * guidelines.json을 로드하고 캐시
 */
export function loadGuidelines(): Guidelines {
  if (cachedGuidelines) return cachedGuidelines;

  const content = fs.readFileSync(GUIDELINES_PATH, 'utf-8');
  cachedGuidelines = JSON.parse(content) as Guidelines;
  return cachedGuidelines;
}

/**
 * 특정 유형의 출제 지침 가져오기.
 * inherits가 설정된 경우 부모 유형의 규칙도 병합.
 */
export function getGuidelineForType(typeName: string): GuidelineType & { global: GuidelineGlobal } {
  const guidelines = loadGuidelines();
  const typeGuideline = guidelines.types[typeName];

  if (!typeGuideline) {
    throw new Error(`Unknown question type in guidelines: ${typeName}`);
  }

  // 상속 처리 (장문 유형)
  if (typeGuideline.inherits) {
    const parent = guidelines.types[typeGuideline.inherits];
    if (parent) {
      return {
        ...parent,
        ...typeGuideline,
        passage_criteria: [
          ...parent.passage_criteria,
          ...typeGuideline.passage_criteria,
        ],
        choice_rules: [
          ...parent.choice_rules,
          ...typeGuideline.choice_rules,
        ],
        pitfalls: [
          ...(parent.pitfalls || []),
          ...(typeGuideline.pitfalls || []),
        ],
        additional_rules: typeGuideline.additional_rules,
        global: guidelines.global,
      };
    }
  }

  return { ...typeGuideline, global: guidelines.global };
}

/**
 * 단어 수 기준 가져오기
 */
export function getWordCountRange(typeName: string): { min: number; max: number } {
  const guideline = getGuidelineForType(typeName);
  const global = guideline.global;

  if (guideline.word_count_override === 'jangmun') {
    return global.word_count.jangmun;
  }

  if (['order', 'insertion'].includes(typeName)) {
    return global.word_count.order_insertion;
  }

  return global.word_count.standard;
}
