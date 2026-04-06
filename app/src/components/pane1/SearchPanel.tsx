'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import TypeBadge from '@/components/shared/TypeBadge';
import { useWorkbench } from '@/store/workbench';
import { QUESTION_TYPES, REPOSITORIES, type QuestionType } from '@/types';

const REPO_TIERS = [
  { tier: 1, label: 'Primary' },
  { tier: 2, label: 'Specialized' },
  { tier: 3, label: 'Supplementary' },
] as const;

// Broad 1~3 word topics suitable for 수능 passage discovery
const KEYWORD_POOL = [
  'cognition', 'perception', 'memory', 'creativity', 'motivation',
  'decision making', 'social behavior', 'conformity', 'empathy',
  'language', 'communication', 'persuasion', 'narrative',
  'education', 'learning', 'literacy', 'child development',
  'culture', 'identity', 'globalization', 'migration',
  'ethics', 'justice', 'autonomy', 'free will',
  'biodiversity', 'conservation', 'climate', 'sustainability',
  'technology', 'automation', 'artificial intelligence',
  'economics', 'innovation', 'consumption',
  'art', 'aesthetics', 'music', 'photography',
  'evolution', 'adaptation', 'genetics',
  'nutrition', 'sleep', 'stress', 'resilience',
  'urban design', 'architecture', 'community',
  'rhetoric', 'ideology', 'propaganda',
  'cooperation', 'competition', 'altruism',
  'consciousness', 'emotion', 'intuition',
  'ecology', 'pollution', 'deforestation',
  'democracy', 'media', 'privacy',
];

function getRandomKeywords(count = 4): string[] {
  const shuffled = [...KEYWORD_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

type CrawlStage = 'idle' | 'searching' | 'extracting' | 'done' | 'error';

interface StageStatus {
  stage: CrawlStage;
  message: string;
  searched: number;
  fetched: number;
  extracting: { current: number; total: number };
  scoring: { current: number; total: number };
  results: number;
}

export default function SearchPanel() {
  const {
    searchKeywords,
    setSearchKeywords,
    selectedTypes,
    toggleType,
    selectedRepos,
    setSelectedRepos,
    isCrawling,
    setCrawling,
  } = useWorkbench();

  const [localKeywords, setLocalKeywords] = useState(searchKeywords);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => { setSuggestions(getRandomKeywords(4)); }, []);
  const [status, setStatus] = useState<StageStatus>({
    stage: 'idle',
    message: '',
    searched: 0,
    fetched: 0,
    extracting: { current: 0, total: 0 },
    scoring: { current: 0, total: 0 },
    results: 0,
  });

  const handleSearch = async () => {
    if (!localKeywords.trim() || isCrawling) return;

    setSearchKeywords(localKeywords);
    setCrawling(true);
    const primaryType = selectedTypes[0] || 'blank';

    try {
      // ---- Step 1: Search + Fetch ----
      setStatus({
        stage: 'searching',
        message: 'Searching academic repositories & fetching full texts...',
        searched: 0, fetched: 0,
        extracting: { current: 0, total: 0 },
        scoring: { current: 0, total: 0 },
        results: 0,
      });

      const searchRes = await fetch('/api/crawl/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: localKeywords,
          repositories: selectedRepos,
          perPage: 5,
        }),
      });
      const searchData = await searchRes.json();

      if (!searchData.success || searchData.fetchedCount === 0) {
        setStatus(prev => ({
          ...prev,
          stage: 'done',
          message: searchData.fetchedCount === 0
            ? `Found ${searchData.searchCount || 0} papers but couldn't access full text.`
            : 'No results found.',
          searched: searchData.searchCount || 0,
        }));
        setCrawling(false);
        return;
      }

      setStatus(prev => ({
        ...prev,
        searched: searchData.searchCount,
        fetched: searchData.fetchedCount,
        message: `Found ${searchData.fetchedCount} papers with full text. Extracting passages...`,
        stage: 'extracting',
        extracting: { current: 0, total: searchData.fetchedCount },
      }));

      // ---- Step 2: Extract passages (rule-based, no API cost) ----
      let totalExtracted = 0;

      for (let i = 0; i < searchData.fetchedCount; i++) {
        setStatus(prev => ({
          ...prev,
          extracting: { current: i + 1, total: searchData.fetchedCount },
          message: `Extracting ${i + 1}/${searchData.fetchedCount}: ${searchData.documents[i]?.title?.substring(0, 40)}...`,
        }));

        try {
          const extRes = await fetch('/api/crawl/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cacheKey: searchData.cacheKey,
              docIndex: i,
              questionType: primaryType,
            }),
          });
          const extData = await extRes.json();

          if (extData.success && extData.passages?.length > 0) {
            for (const p of extData.passages) {
              useWorkbench.getState().addPassages([{
                id: p.id,
                sourceId: '',
                text: p.text,
                startIndex: 0,
                endIndex: 0,
                wordCount: p.wordCount,
                status: 'pending' as const,
                isJangmunCandidate: p.isJangmunCandidate || false,
                createdAt: new Date(),
                source: {
                  id: '',
                  title: p.sourceTitle,
                  authors: [],
                  sourceUrl: p.sourceUrl,
                  repository: p.repository,
                  fetchedAt: new Date(),
                },
                scores: p.scores ? [{
                  id: 'gemini-initial',
                  passageId: p.id,
                  scorer: 'ai' as const,
                  metrics: p.scores,
                  totalWeighted: p.totalWeighted || 0,
                  questionTypes: p.suggestedTypes || [],
                  typeHints: p.typeHints || {},
                  createdAt: new Date(),
                }] : [],
              }]);
              totalExtracted++;
            }
            setStatus(prev => ({ ...prev, results: totalExtracted }));
          }
        } catch {
          // Skip
        }
      }

      setStatus(prev => ({
        ...prev,
        stage: 'done',
        message: totalExtracted > 0
          ? `Complete — ${totalExtracted} passage candidates from ${searchData.searchCount} papers. Review and provide feedback.`
          : `Searched ${searchData.searchCount} papers, fetched ${searchData.fetchedCount} — no suitable passages found. Try different keywords.`,
        results: totalExtracted,
      }));
    } catch (err) {
      setStatus(prev => ({
        ...prev,
        stage: 'error',
        message: `Error: ${String(err)}`,
      }));
    } finally {
      setCrawling(false);
    }
  };

  const toggleRepo = (id: string) => {
    if (selectedRepos.includes(id)) {
      setSelectedRepos(selectedRepos.filter((r) => r !== id));
    } else {
      setSelectedRepos([...selectedRepos, id]);
    }
  };

  const getProgress = (): number => {
    if (status.stage === 'idle') return 0;
    if (status.stage === 'done') return 100;
    if (status.stage === 'error') return 0;
    if (status.stage === 'searching') return 20;
    if (status.stage === 'extracting') {
      const { current, total } = status.extracting;
      return 20 + (total > 0 ? (current / total) * 80 : 0);
    }
    return 0;
  };

  const stageBg = {
    idle: '',
    searching: 'bg-blue-950/40 border-blue-800/50',
    extracting: 'bg-amber-950/30 border-amber-800/50',
    done: 'bg-emerald-950/30 border-emerald-800/50',
    error: 'bg-red-950/30 border-red-800/50',
  };

  const stageTextColor = {
    idle: 'text-zinc-500',
    searching: 'text-blue-300',
    extracting: 'text-amber-300',
    done: 'text-emerald-300',
    error: 'text-red-300',
  };

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <h2 className="text-base font-semibold text-zinc-200">
        Search & Crawl
      </h2>

      {/* Keyword Input */}
      <div className="space-y-2.5">
        <label className="text-sm text-zinc-400">Keywords / Topic</label>
        <div className="flex gap-2">
          <Input
            value={localKeywords}
            onChange={(e) => setLocalKeywords(e.target.value)}
            placeholder="e.g. cognition, decision making"
            className="bg-zinc-900 border-zinc-700 text-sm h-9"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={isCrawling || !localKeywords.trim()}
            className="shrink-0 h-9 px-4"
          >
            {isCrawling ? 'Running...' : 'Search'}
          </Button>
        </div>

        {/* Keyword suggestions — client-only to avoid hydration mismatch */}
        {suggestions.length > 0 && <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-zinc-600">Try:</span>
          {suggestions.map((kw) => (
            <button
              key={kw}
              className="text-xs text-blue-400 hover:text-blue-300 bg-blue-950/30 hover:bg-blue-900/40 px-2 py-0.5 rounded-md transition-colors"
              onClick={() => setLocalKeywords(kw)}
              disabled={isCrawling}
            >
              {kw}
            </button>
          ))}
          <button
            className="text-xs text-zinc-600 hover:text-zinc-400 ml-1"
            onClick={() => setSuggestions(getRandomKeywords(4))}
            disabled={isCrawling}
            title="Refresh"
          >
            ↻
          </button>
        </div>}
      </div>

      <Separator className="bg-zinc-800" />

      {/* Question Type Filter */}
      <div>
        <label className="text-sm text-zinc-400 block mb-2">
          Question Types
        </label>
        <div className="flex flex-wrap gap-1.5">
          {QUESTION_TYPES.map((type) => (
            <TypeBadge
              key={type}
              type={type as QuestionType}
              onClick={() => toggleType(type as QuestionType)}
              selected={selectedTypes.includes(type as QuestionType)}
            />
          ))}
        </div>
        {selectedTypes.length > 0 && (
          <button
            className="text-xs text-zinc-600 mt-1.5 hover:text-zinc-400"
            onClick={() => useWorkbench.getState().setSelectedTypes([])}
          >
            Clear all
          </button>
        )}
      </div>

      <Separator className="bg-zinc-800" />

      {/* Repository Selection */}
      <div>
        <label className="text-sm text-zinc-400 block mb-2">
          Repositories
        </label>
        <div className="space-y-3">
          {REPO_TIERS.map(({ tier, label }) => (
            <div key={tier}>
              <span className="text-[11px] text-zinc-600 uppercase tracking-wider font-medium">
                {label}
              </span>
              <div className="space-y-1 mt-1">
                {REPOSITORIES.filter((r) => r.tier === tier).map((repo) => (
                  <label
                    key={repo.id}
                    className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer hover:text-zinc-200"
                    title={repo.description}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRepos.includes(repo.id)}
                      onChange={() => toggleRepo(repo.id)}
                      className="rounded border-zinc-600 bg-zinc-900"
                    />
                    {repo.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Pipeline Status — prominent display */}
      <div>
        <label className="text-sm text-zinc-400 block mb-3">
          Pipeline Status
        </label>

        {status.stage === 'idle' ? (
          <p className="text-sm text-zinc-600 italic">
            Enter keywords and click Search to begin.
          </p>
        ) : (
          <div className={`rounded-lg border p-4 space-y-3 ${stageBg[status.stage]}`}>
            {/* Progress bar */}
            <div className="relative h-2.5 bg-zinc-800/80 rounded-full overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                  status.stage === 'done' ? 'bg-emerald-500' :
                  status.stage === 'error' ? 'bg-red-500' :
                  'bg-blue-500'
                } ${status.stage !== 'done' && status.stage !== 'error' ? 'animate-pulse' : ''}`}
                style={{ width: `${getProgress()}%` }}
              />
            </div>

            {/* Stage steps */}
            <div className="flex justify-between text-xs">
              {(['searching', 'extracting', 'done'] as const).map((s) => {
                const stages = ['searching', 'extracting', 'done'];
                const currentIdx = stages.indexOf(status.stage);
                const thisIdx = stages.indexOf(s);
                const isActive = status.stage === s;
                const isPast = currentIdx > thisIdx;
                return (
                  <span
                    key={s}
                    className={`font-medium ${
                      isActive ? stageTextColor[s] :
                      isPast ? 'text-zinc-500' : 'text-zinc-700'
                    }`}
                  >
                    {isPast ? '✓ ' : ''}
                    {s === 'searching' ? 'Search & Fetch' :
                     s === 'extracting' ? 'Extract Passages' : 'Done'}
                  </span>
                );
              })}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-zinc-500">Papers found</span>
              <span className="text-zinc-200 font-medium">{status.searched}</span>
              <span className="text-zinc-500">Full text fetched</span>
              <span className="text-zinc-200 font-medium">{status.fetched}</span>
              {status.extracting.total > 0 && <>
                <span className="text-zinc-500">Extracting</span>
                <span className="text-zinc-200 font-medium">{status.extracting.current} / {status.extracting.total}</span>
              </>}
              {status.results > 0 && <>
                <span className="text-zinc-500">Passages added</span>
                <span className="text-emerald-400 font-semibold">{status.results}</span>
              </>}
            </div>

            {/* Status message — large and prominent */}
            <p className={`text-sm leading-relaxed font-medium ${stageTextColor[status.stage]}`}>
              {status.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
