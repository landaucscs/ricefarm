'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Passage } from '@/types';

interface Props {
  passage: Passage;
  onClose: () => void;
}

export default function FeedbackModal({ passage, onClose }: Props) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passageId: passage.id,
          comment,
          approved: passage.status === 'approved',
        }),
      });
      onClose();
    } catch {
      // TODO: error handling
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm text-zinc-200">
            Write Feedback
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
          {/* Passage preview */}
          <div className="bg-zinc-800/50 rounded p-3 text-xs text-zinc-400 leading-relaxed max-h-32 overflow-y-auto">
            {passage.text.substring(0, 400)}
            {passage.text.length > 400 && '...'}
          </div>

          {/* Feedback text */}
          <div>
            <label className="text-xs text-zinc-500 block mb-1">
              이 지문이 수능 문항으로 적합한지/부적합한지, 그 이유를 작성하세요.
              이 피드백은 향후 모델의 판단 기준에 반영됩니다.
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="예: 논리 전개가 명확하고, 빈칸 위치에 따라 추론 난이도 조절이 가능함. 다만 어휘가 다소 쉬움..."
              className="bg-zinc-800 border-zinc-700 text-sm min-h-[100px] max-h-[200px] resize-y"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 shrink-0 border-t border-zinc-800">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!comment.trim() || submitting}
          >
            {submitting ? 'Saving...' : 'Submit Feedback'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
