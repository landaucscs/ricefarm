'use client';

import { useState } from 'react';
import type { QuestionType } from '@/types';

interface Props {
  questionTypes: QuestionType[];
  hints: Record<string, Record<string, unknown>>;
}

const TYPE_LABELS: Record<string, string> = {
  blank: '빈칸 추론',
  implication: '함축 의미',
  claim: '주장',
  gist: '요지',
  topic: '주제',
  title: '제목',
  insertion: '문장 삽입',
  vocabulary: '어휘',
  grammar: '어법',
  summary: '요약문',
  order: '순서 배열',
};

function HintSection({ type, data }: { type: string; data: Record<string, unknown> }) {
  const label = TYPE_LABELS[type] || type;

  const renderField = (key: string, value: unknown) => {
    if (!value) return null;

    const fieldLabels: Record<string, string> = {
      suggested_blank_phrase: '추천 빈칸 어구',
      why_this_blank: '이유',
      underline_phrase: '밑줄 표현',
      implied_meaning: '함축 의미',
      core_claim: '핵심 주장',
      core_gist: '요지',
      core_topic: '주제',
      suggested_title: '추천 제목',
      removable_sentence: '삽입 대상 문장',
      why_removable: '이유',
      target_words: '출제 어휘',
      target_points: '어법 포인트',
      summary_sentence: '요약문',
      answer_a: '(A) 정답',
      answer_b: '(B) 정답',
      intro: '주어진 글',
      part_a: '(A)',
      part_b: '(B)',
      part_c: '(C)',
      correct_order: '정답 순서',
    };

    const fieldLabel = fieldLabels[key] || key;

    if (Array.isArray(value)) {
      return (
        <div key={key} className="mt-1.5">
          <span className="text-xs text-zinc-500">{fieldLabel}:</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {value.map((item, i) => (
              <span key={i} className="text-xs bg-zinc-800 text-zinc-200 px-2 py-0.5 rounded">
                {String(item)}
              </span>
            ))}
          </div>
        </div>
      );
    }

    const isLongText = String(value).length > 60;

    return (
      <div key={key} className="mt-1.5">
        <span className="text-xs text-zinc-500">{fieldLabel}: </span>
        {isLongText ? (
          <p className="text-xs text-zinc-200 mt-0.5 bg-zinc-800/50 rounded px-2 py-1.5 leading-relaxed italic">
            &ldquo;{String(value)}&rdquo;
          </p>
        ) : (
          <span className="text-xs text-zinc-200 font-medium">{String(value)}</span>
        )}
      </div>
    );
  };

  return (
    <div className="border border-zinc-800 rounded-md p-3">
      <div className="text-xs font-semibold text-zinc-300 mb-1">
        {label}
      </div>
      {Object.entries(data).map(([key, value]) => renderField(key, value))}
    </div>
  );
}

export default function TypeHints({ questionTypes, hints }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!hints || Object.keys(hints).length === 0) return null;

  // Only show hints for recommended types
  const relevantHints = Object.entries(hints).filter(
    ([type]) => questionTypes.includes(type as QuestionType)
  );

  if (relevantHints.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="text-xs text-blue-400 hover:text-blue-300 font-medium"
      >
        {expanded ? '▾ Hide' : '▸ Show'} 출제 힌트 ({relevantHints.length} types)
      </button>

      {expanded && (
        <div className="space-y-2">
          {relevantHints.map(([type, data]) => (
            <HintSection key={type} type={type} data={data as Record<string, unknown>} />
          ))}
        </div>
      )}
    </div>
  );
}
