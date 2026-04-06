'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import TypeBadge from '@/components/shared/TypeBadge';
import { useWorkbench } from '@/store/workbench';
import { QUESTION_TYPES, type QuestionType, type PassageScoreMetrics } from '@/types';

const METRIC_LABELS: { key: keyof PassageScoreMetrics; label: string; weight: string }[] = [
  { key: 'topicDepth', label: 'Topic Depth', weight: '15%' },
  { key: 'logicalStructure', label: 'Logical Structure', weight: '20%' },
  { key: 'standaloneCoherence', label: 'Standalone Coherence', weight: '15%' },
  { key: 'vocabularyLevel', label: 'Vocabulary Level', weight: '15%' },
  { key: 'questionTypeFit', label: 'Type Fit', weight: '20%' },
  { key: 'distractorPotential', label: 'Distractor Potential', weight: '15%' },
];

interface Props {
  passageId: string;
  initialScores: PassageScoreMetrics;
  initialTypes: QuestionType[];
  onClose: () => void;
}

export default function ScoreEditor({ passageId, initialScores, initialTypes, onClose }: Props) {
  const [scores, setScores] = useState<PassageScoreMetrics>({ ...initialScores });
  const [types, setTypes] = useState<QuestionType[]>([...initialTypes]);
  const { updatePassageScores } = useWorkbench();

  const updateScore = (key: keyof PassageScoreMetrics, value: number) => {
    setScores((prev) => ({ ...prev, [key]: Math.max(0, Math.min(10, value)) }));
  };

  const toggleType = (type: QuestionType) => {
    setTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSave = () => {
    updatePassageScores(passageId, scores, types);
    // TODO: POST to /api/feedback to persist
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm text-zinc-200">Edit Scores</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {METRIC_LABELS.map(({ key, label, weight }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 w-40">
                {label} <span className="text-zinc-600">({weight})</span>
              </span>
              <input
                type="range"
                min={0}
                max={10}
                value={scores[key]}
                onChange={(e) => updateScore(key, parseInt(e.target.value))}
                className="flex-1 h-1.5 accent-blue-500"
              />
              <input
                type="number"
                min={0}
                max={10}
                value={scores[key]}
                onChange={(e) => updateScore(key, parseInt(e.target.value) || 0)}
                className="w-10 text-center text-xs bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200"
              />
            </div>
          ))}
        </div>

        <div className="mt-3">
          <label className="text-xs text-zinc-500 block mb-2">Suitable Types</label>
          <div className="flex flex-wrap gap-1.5">
            {QUESTION_TYPES.map((type) => (
              <TypeBadge
                key={type}
                type={type as QuestionType}
                onClick={() => toggleType(type as QuestionType)}
                selected={types.includes(type as QuestionType)}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
