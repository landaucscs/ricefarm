'use client';

import { Badge } from '@/components/ui/badge';
import type { QuestionType } from '@/types';

const TYPE_LABELS: Record<QuestionType, string> = {
  claim: '주장',
  implication: '함축',
  gist: '요지',
  topic: '주제',
  title: '제목',
  grammar: '어법',
  vocabulary: '어휘',
  blank: '빈칸',
  irrelevant: '무관문장',
  order: '순서',
  insertion: '삽입',
  summary: '요약',
};

const TYPE_COLORS: Record<QuestionType, string> = {
  claim: 'bg-blue-900/50 text-blue-300 border-blue-700',
  implication: 'bg-purple-900/50 text-purple-300 border-purple-700',
  gist: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  topic: 'bg-teal-900/50 text-teal-300 border-teal-700',
  title: 'bg-cyan-900/50 text-cyan-300 border-cyan-700',
  grammar: 'bg-amber-900/50 text-amber-300 border-amber-700',
  vocabulary: 'bg-orange-900/50 text-orange-300 border-orange-700',
  blank: 'bg-rose-900/50 text-rose-300 border-rose-700',
  irrelevant: 'bg-zinc-800/50 text-zinc-300 border-zinc-600',
  order: 'bg-indigo-900/50 text-indigo-300 border-indigo-700',
  insertion: 'bg-violet-900/50 text-violet-300 border-violet-700',
  summary: 'bg-lime-900/50 text-lime-300 border-lime-700',
};

export default function TypeBadge({
  type,
  onClick,
  selected,
}: {
  type: QuestionType;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={`cursor-pointer text-[10px] px-1.5 py-0 ${TYPE_COLORS[type]} ${
        selected ? 'ring-1 ring-white/30' : ''
      } ${onClick ? 'hover:brightness-125' : ''}`}
      onClick={onClick}
    >
      {TYPE_LABELS[type]}
    </Badge>
  );
}

export { TYPE_LABELS };
