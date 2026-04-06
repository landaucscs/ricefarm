import { create } from 'zustand';
import type {
  QuestionType,
  Passage,
  GeneratedQuestion,
  CrawlProgress,
  PassageScoreMetrics,
} from '@/types';

interface WorkbenchState {
  // -- Pane 1: Search & Crawl --
  searchKeywords: string;
  selectedTypes: QuestionType[];
  selectedRepos: string[];
  crawlProgress: CrawlProgress[];
  isCrawling: boolean;

  // -- Pane 2: Passage Review --
  passages: Passage[];
  selectedPassageId: string | null;

  // -- Pane 3: Question Generation --
  questions: GeneratedQuestion[];
  selectedQuestionId: string | null;
  generatingFor: string[]; // passage IDs being generated

  // -- Actions --
  setSearchKeywords: (kw: string) => void;
  setSelectedTypes: (types: QuestionType[]) => void;
  toggleType: (type: QuestionType) => void;
  setSelectedRepos: (repos: string[]) => void;
  setCrawling: (v: boolean) => void;
  setCrawlProgress: (progress: CrawlProgress[]) => void;
  updateCrawlProgress: (repo: string, update: Partial<CrawlProgress>) => void;

  setPassages: (passages: Passage[]) => void;
  addPassages: (passages: Passage[]) => void;
  updatePassageStatus: (id: string, status: 'pending' | 'approved' | 'rejected') => void;
  updatePassageScores: (id: string, scores: PassageScoreMetrics, types: QuestionType[]) => void;
  selectPassage: (id: string | null) => void;

  setQuestions: (questions: GeneratedQuestion[]) => void;
  addQuestions: (questions: GeneratedQuestion[]) => void;
  selectQuestion: (id: string | null) => void;
  setGeneratingFor: (ids: string[]) => void;
}

export const useWorkbench = create<WorkbenchState>((set) => ({
  // -- Initial State --
  searchKeywords: '',
  selectedTypes: [],
  selectedRepos: ['openalex', 'semantic_scholar', 'arxiv', 'doaj', 'core'],
  crawlProgress: [],
  isCrawling: false,

  passages: [],
  selectedPassageId: null,

  questions: [],
  selectedQuestionId: null,
  generatingFor: [],

  // -- Actions --
  setSearchKeywords: (kw) => set({ searchKeywords: kw }),
  setSelectedTypes: (types) => set({ selectedTypes: types }),
  toggleType: (type) =>
    set((s) => ({
      selectedTypes: s.selectedTypes.includes(type)
        ? s.selectedTypes.filter((t) => t !== type)
        : [...s.selectedTypes, type],
    })),
  setSelectedRepos: (repos) => set({ selectedRepos: repos }),
  setCrawling: (v) => set({ isCrawling: v }),
  setCrawlProgress: (progress) => set({ crawlProgress: progress }),
  updateCrawlProgress: (repo, update) =>
    set((s) => ({
      crawlProgress: s.crawlProgress.map((p) =>
        p.repository === repo ? { ...p, ...update } : p
      ),
    })),

  setPassages: (passages) => set({ passages }),
  addPassages: (newPassages) =>
    set((s) => ({ passages: [...s.passages, ...newPassages] })),
  updatePassageStatus: (id, status) =>
    set((s) => ({
      passages: s.passages.map((p) =>
        p.id === id ? { ...p, status } : p
      ),
    })),
  updatePassageScores: (id, scores, types) =>
    set((s) => ({
      passages: s.passages.map((p) =>
        p.id === id
          ? {
              ...p,
              scores: [
                {
                  id: 'user-override',
                  passageId: id,
                  scorer: 'user' as const,
                  metrics: scores,
                  totalWeighted: 0,
                  questionTypes: types,
                  createdAt: new Date(),
                },
              ],
            }
          : p
      ),
    })),
  selectPassage: (id) => set({ selectedPassageId: id }),

  setQuestions: (questions) => set({ questions }),
  addQuestions: (newQuestions) =>
    set((s) => ({ questions: [...s.questions, ...newQuestions] })),
  selectQuestion: (id) => set({ selectedQuestionId: id }),
  setGeneratingFor: (ids) => set({ generatingFor: ids }),
}));
