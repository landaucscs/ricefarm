'use client';

import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import PassageCard from './PassageCard';
import { useWorkbench } from '@/store/workbench';
import type { PassageStatus } from '@/types';

type FilterTab = 'all' | PassageStatus;

export default function PassageReview() {
  const { passages, setPassages } = useWorkbench();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [loadedFromDb, setLoadedFromDb] = useState(false);

  // Load saved passages from DB on first mount
  useEffect(() => {
    if (loadedFromDb || passages.length > 0) return;

    (async () => {
      try {
        const res = await fetch('/api/passages');
        if (!res.ok) return;
        const data = await res.json();
        if (data.passages?.length > 0) {
          setPassages(data.passages);
        }
      } catch {
        // Silent fail
      } finally {
        setLoadedFromDb(true);
      }
    })();
  }, [loadedFromDb, passages.length, setPassages]);

  const counts = {
    all: passages.length,
    approved: passages.filter((p) => p.status === 'approved').length,
    rejected: passages.filter((p) => p.status === 'rejected').length,
    pending: passages.filter((p) => p.status === 'pending').length,
  };

  const filtered = filter === 'all'
    ? passages
    : passages.filter((p) => p.status === filter);

  const tabs: { key: FilterTab; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: 'border-zinc-600 text-zinc-300' },
    { key: 'pending', label: 'Pending', color: 'border-yellow-700 text-yellow-400' },
    { key: 'approved', label: 'Approved', color: 'border-emerald-700 text-emerald-400' },
    { key: 'rejected', label: 'Rejected', color: 'border-red-700 text-red-400' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-zinc-200">
            Passage Review
          </h2>
          <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
            {passages.length} total
          </Badge>
        </div>
        <p className="text-xs text-zinc-500">
          Review extracted passages. Approve, reject, or provide feedback to train the model.
        </p>

        {/* Filter tabs */}
        {passages.length > 0 && (
          <div className="flex gap-2 mt-3">
            {tabs.map(({ key, label, color }) => {
              const count = counts[key];
              if (key !== 'all' && count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    filter === key
                      ? `${color} bg-zinc-800`
                      : 'border-transparent text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Separator className="bg-zinc-800" />

      {/* Passage List */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              {passages.length === 0 ? (
                <>
                  <p className="text-sm text-zinc-500">No passages yet.</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    Use the Search panel to crawl and extract passages.
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">
                  No {filter} passages.
                </p>
              )}
            </div>
          ) : (
            filtered.map((passage) => (
              <PassageCard key={passage.id} passage={passage} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
