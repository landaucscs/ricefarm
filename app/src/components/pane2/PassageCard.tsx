'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import TypeBadge from '@/components/shared/TypeBadge';
import TypeHints from './TypeHints';
import FeedbackModal from './FeedbackModal';
import ScoreEditor from './ScoreEditor';
import type { Passage } from '@/types';
import { useWorkbench } from '@/store/workbench';

interface Props {
  passage: Passage;
}

export default function PassageCard({ passage }: Props) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [showScoreEdit, setShowScoreEdit] = useState(false);
  const { updatePassageStatus, selectedPassageId, selectPassage } = useWorkbench();

  const latestScore = passage.scores?.[passage.scores.length - 1];
  const isSelected = selectedPassageId === passage.id;

  const totalScore = latestScore
    ? Math.round(
        (latestScore.metrics.topicDepth * 15 +
          latestScore.metrics.logicalStructure * 20 +
          latestScore.metrics.standaloneCoherence * 15 +
          latestScore.metrics.vocabularyLevel * 15 +
          latestScore.metrics.questionTypeFit * 20 +
          latestScore.metrics.distractorPotential * 15) /
          10
      )
    : null;

  const handleStatusChange = async (newStatus: 'approved' | 'rejected') => {
    updatePassageStatus(passage.id, newStatus);

    // Auto-save to DB
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passageId: passage.id,
          approved: newStatus === 'approved',
          questionTypes: latestScore?.questionTypes || [],
          comment: newStatus === 'approved' ? 'Approved by user' : 'Rejected by user',
        }),
      });
    } catch {
      // Silent fail — UI state is already updated
    }
  };

  return (
    <>
      <Card
        className={`bg-zinc-900 border-zinc-800 cursor-pointer transition-colors ${
          isSelected ? 'ring-1 ring-blue-500 border-blue-800' : 'hover:border-zinc-700'
        } ${
          passage.status === 'approved'
            ? 'border-l-2 border-l-emerald-500'
            : passage.status === 'rejected'
              ? 'border-l-2 border-l-red-500 opacity-60'
              : ''
        }`}
        onClick={() => selectPassage(isSelected ? null : passage.id)}
      >
        <CardContent className="p-4 space-y-3">
          {/* Header: source + word count */}
          <div className="flex items-center justify-between">
            <a
              href={passage.source?.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline truncate max-w-[280px]"
              onClick={(e) => e.stopPropagation()}
            >
              {passage.source?.sourceUrl || 'Unknown source'}
            </a>
            <Badge variant="outline" className="text-xs px-2 py-0.5 border-zinc-700 text-zinc-300 shrink-0 ml-2">
              {passage.wordCount}w
            </Badge>
          </div>

          {/* Source title */}
          {passage.source?.title && (
            <p className="text-xs text-zinc-500 italic">
              {passage.source.title}
            </p>
          )}

          {/* Full passage text — no truncation */}
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {passage.text}
          </p>

          {/* Score display */}
          {latestScore && (
            <div
              className="flex items-center gap-3 cursor-pointer bg-zinc-800/50 rounded-md px-3 py-2"
              onClick={(e) => {
                e.stopPropagation();
                setShowScoreEdit(true);
              }}
            >
              <span className="text-base font-bold text-zinc-100">
                {totalScore}/100
              </span>
              <span className="text-xs text-zinc-500 hover:text-zinc-300">[Edit]</span>
              <div className="flex gap-2 text-xs text-zinc-500">
                <span>D:{latestScore.metrics.topicDepth}</span>
                <span>L:{latestScore.metrics.logicalStructure}</span>
                <span>C:{latestScore.metrics.standaloneCoherence}</span>
                <span>V:{latestScore.metrics.vocabularyLevel}</span>
                <span>T:{latestScore.metrics.questionTypeFit}</span>
                <span>X:{latestScore.metrics.distractorPotential}</span>
              </div>
            </div>
          )}

          {/* Type tags */}
          {latestScore && latestScore.questionTypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {latestScore.questionTypes.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
          )}

          {/* Type-specific hints */}
          {latestScore?.typeHints && (
            <TypeHints
              questionTypes={latestScore.questionTypes}
              hints={latestScore.typeHints}
            />
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant={passage.status === 'approved' ? 'default' : 'outline'}
              className="text-xs px-3"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange('approved');
              }}
            >
              {passage.status === 'approved' ? '✓ Approved' : 'Approve'}
            </Button>
            <Button
              size="sm"
              variant={passage.status === 'rejected' ? 'destructive' : 'outline'}
              className="text-xs px-3"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange('rejected');
              }}
            >
              {passage.status === 'rejected' ? '✗ Rejected' : 'Reject'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs px-3"
              onClick={(e) => {
                e.stopPropagation();
                setShowFeedback(true);
              }}
            >
              Feedback
            </Button>
          </div>
        </CardContent>
      </Card>

      {showFeedback && (
        <FeedbackModal
          passage={passage}
          onClose={() => setShowFeedback(false)}
        />
      )}

      {showScoreEdit && latestScore && (
        <ScoreEditor
          passageId={passage.id}
          initialScores={latestScore.metrics}
          initialTypes={latestScore.questionTypes}
          onClose={() => setShowScoreEdit(false)}
        />
      )}
    </>
  );
}
