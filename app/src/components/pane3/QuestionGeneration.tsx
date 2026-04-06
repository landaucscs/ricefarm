'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import TypeBadge from '@/components/shared/TypeBadge';
import { useWorkbench } from '@/store/workbench';
import type { GeneratedQuestion, QuestionType } from '@/types';

function QuestionCard({ question }: { question: GeneratedQuestion }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700">
      <CardContent className="p-3 space-y-2">
        {/* Type + Status */}
        <div className="flex items-center justify-between">
          <TypeBadge type={question.questionType as QuestionType} />
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${
              question.status === 'approved'
                ? 'border-emerald-700 text-emerald-400'
                : question.status === 'rejected'
                  ? 'border-red-700 text-red-400'
                  : 'border-zinc-700 text-zinc-500'
            }`}
          >
            {question.status}
          </Badge>
        </div>

        {/* Question text */}
        <p className="text-xs text-zinc-400 italic">
          {question.questionText}
        </p>

        {/* Modified passage preview */}
        <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3">
          {question.passageModified}
        </p>

        {/* Choices */}
        <div className="space-y-1">
          {question.choices.map((choice, i) => (
            <div
              key={i}
              className={`text-[11px] px-2 py-0.5 rounded ${
                i + 1 === question.correctAnswer
                  ? 'bg-emerald-900/30 text-emerald-300'
                  : 'text-zinc-400'
              }`}
            >
              {String.fromCodePoint(0x2460 + i)} {choice}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">
            Approve
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">
            Edit
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">
            Feedback
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function QuestionGeneration() {
  const { passages, questions, generatingFor } = useWorkbench();

  const approvedPassages = passages.filter((p) => p.status === 'approved');
  const isGenerating = generatingFor.length > 0;

  const generateForPassages = async (passageList: typeof approvedPassages) => {
    const ids = passageList.map((p) => p.id);
    useWorkbench.getState().setGeneratingFor(ids);

    for (const p of passageList) {
      const primaryType = p.scores?.[0]?.questionTypes?.[0] || 'blank';

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passageText: p.text,
            questionType: primaryType,
          }),
        });

        const data = await res.json();
        if (data.success && data.question) {
          const q = data.question;
          useWorkbench.getState().addQuestions([{
            id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            passageId: p.id,
            questionType: q.question_type || primaryType,
            questionText: q.question_text || '',
            passageModified: q.passage_modified || '',
            choices: q.choices || [],
            correctAnswer: q.correct_answer || 1,
            distractorRationale: q.distractor_rationale,
            status: 'draft',
            createdAt: new Date(),
          }]);
        }
      } catch (err) {
        console.error('Generation failed for passage:', p.id, err);
      }
    }

    useWorkbench.getState().setGeneratingFor([]);
  };

  const handleGenerateAll = () => generateForPassages(approvedPassages);

  const handleGenerateSelected = () => {
    const selected = approvedPassages.filter(
      (p) => p.id === useWorkbench.getState().selectedPassageId
    );
    if (selected.length > 0) generateForPassages(selected);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-zinc-300">
            Question Generation
          </h2>
          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
            {questions.length} generated
          </Badge>
        </div>

        {/* Generate Controls */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="text-xs"
            disabled={approvedPassages.length === 0 || isGenerating}
            onClick={handleGenerateAll}
          >
            {isGenerating ? 'Generating...' : `Generate All (${approvedPassages.length})`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            disabled={isGenerating}
            onClick={handleGenerateSelected}
          >
            Generate Selected
          </Button>
        </div>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Question List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {questions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-zinc-600">No questions generated yet.</p>
              <p className="text-xs text-zinc-700 mt-1">
                Approve passages in the Review panel, then generate questions here.
              </p>
            </div>
          ) : (
            questions.map((q) => <QuestionCard key={q.id} question={q} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
