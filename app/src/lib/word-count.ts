/**
 * 단어 수 카운트 유틸리티
 * Claude 의존성 없이 사용 가능.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
