import { NextRequest, NextResponse } from 'next/server';
import { searchAll } from '@/engines/crawl-evaluate/searcher';
import { fetchAllFullTexts } from '@/engines/crawl-evaluate/fetcher';
import { extractPassagesRuleBased } from '@/engines/crawl-evaluate/rule-extractor';
import { prefilterDocument } from '@/engines/crawl-evaluate/prefilter';
import { scoreWithGemini, type GeminiScoredPassage } from '@/engines/crawl-evaluate/gemini-scorer';
import { scorePassage as scoreWithClaude } from '@/engines/crawl-evaluate/scorer';
import { prisma } from '@/lib/db';
import type { QuestionType, RepositoryId } from '@/types';

/**
 * POST /api/crawl
 *
 * ricefarm 파이프라인 (토큰 최소화):
 *   Search (코드) → Fetch (코드) → Pre-filter (코드) → Extract (강화 룰)
 *   → Score 1차 (Gemini 무료) → Score 2차 (Claude, 상위 N개만)
 *
 * Body: {
 *   query: string,
 *   questionTypes: QuestionType[],
 *   repositories: RepositoryId[],
 *   perPage?: number,
 *   claudeTopN?: number   // Claude 2차 평가 대상 수 (기본 3)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      query,
      questionTypes,
      repositories,
      perPage = 10,
      claudeTopN = 3,
    } = body as {
      query: string;
      questionTypes: QuestionType[];
      repositories: RepositoryId[];
      perPage?: number;
      claudeTopN?: number;
    };

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const primaryType = questionTypes[0] || 'blank';

    // ── Step 1: Search (코드, 토큰 0) ────────────────────────────
    const { results: searchResults, errors: searchErrors } = await searchAll({
      query,
      repositories,
      perPage,
    });

    if (searchResults.length === 0) {
      return NextResponse.json({
        success: true,
        passages: [],
        searchErrors,
        message: 'No results found from any repository.',
      });
    }

    // ── Step 2: Fetch (코드, 토큰 0) ─────────────────────────────
    const documents = await fetchAllFullTexts(searchResults, 3);

    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        passages: [],
        searchCount: searchResults.length,
        message: 'Found papers but could not access full text.',
      });
    }

    // ── Step 3: Pre-filter + Extract (강화 룰, 토큰 0) ───────────
    const allCandidates = [];

    for (const doc of documents) {
      const precheck = prefilterDocument(doc);
      if (!precheck.pass) continue;

      const candidates = extractPassagesRuleBased(doc, 3); // 문서당 상위 3개
      allCandidates.push(...candidates);
    }

    if (allCandidates.length === 0) {
      return NextResponse.json({
        success: true,
        passages: [],
        searchCount: searchResults.length,
        fetchedCount: documents.length,
        message: 'Full texts found but no suitable passages extracted.',
      });
    }

    // 품질 점수 기준 전체 정렬
    allCandidates.sort((a, b) => b.qualityScore - a.qualityScore);

    // ── Step 4: Gemini 1차 평가 (무료, 토큰 0) ───────────────────
    const geminiScored: GeminiScoredPassage[] = [];
    const geminiFailedButKept = [];

    for (const candidate of allCandidates) {
      try {
        const scored = await scoreWithGemini(candidate, primaryType);
        if (scored) {
          geminiScored.push(scored);
        } else {
          // Gemini 실패해도 rule qualityScore가 높으면 유지
          if (candidate.qualityScore >= 50) {
            geminiFailedButKept.push(candidate);
          }
        }
      } catch (err) {
        console.error(`Gemini scoring failed for passage from: ${candidate.sourceDocument.searchResult.title}`, err);
        if (candidate.qualityScore >= 50) {
          geminiFailedButKept.push(candidate);
        }
      }
    }

    // Gemini 점수 기준 정렬
    geminiScored.sort((a, b) => b.totalWeighted - a.totalWeighted);

    // ── Step 5: Claude 2차 평가 (상위 N개만, 토큰 절약) ───────────
    // Gemini 상위 claudeTopN개만 Claude로 재평가
    const topForClaude = geminiScored.slice(0, claudeTopN);
    const restGeminiOnly = geminiScored.slice(claudeTopN);

    const claudeScored = [];
    for (const gPassage of topForClaude) {
      try {
        // RuleExtractedPassage → ExtractedPassage 변환
        const asExtracted = {
          text: gPassage.text,
          startIndex: gPassage.startIndex,
          endIndex: gPassage.endIndex,
          wordCount: gPassage.wordCount,
          reasoning: gPassage.reasoning || '',
          isJangmunCandidate: gPassage.isJangmunCandidate,
          sourceDocument: gPassage.sourceDocument,
        };
        const scored = await scoreWithClaude(asExtracted, primaryType);
        if (scored) {
          claudeScored.push({ ...scored, scoredBy: 'claude' as const });
        } else {
          // Claude 실패 시 Gemini 점수 유지
          claudeScored.push({ ...gPassage, scoredBy: 'gemini' as const });
        }
      } catch {
        claudeScored.push({ ...gPassage, scoredBy: 'gemini' as const });
      }
    }

    // ── Step 6: 결과 통합 + DB 저장 ──────────────────────────────
    // Claude 평가된 것 + Gemini만 평가된 나머지 통합
    interface ScoredResult {
      text: string;
      startIndex: number;
      endIndex: number;
      wordCount: number;
      isJangmunCandidate: boolean;
      sourceDocument: { searchResult: { title: string; authors: string[]; sourceUrl: string; repository: string } };
      scores: { topicDepth: number; logicalStructure: number; standaloneCoherence: number; vocabularyLevel: number; questionTypeFit: number; distractorPotential: number };
      totalWeighted: number;
      suggestedTypes: QuestionType[];
      scoreReasoning: string;
      typeHints: Record<string, Record<string, unknown>>;
      scoredBy: 'claude' | 'gemini';
    }

    const allScored: ScoredResult[] = [
      ...claudeScored.map(s => ({
        text: s.text,
        startIndex: s.startIndex,
        endIndex: s.endIndex,
        wordCount: s.wordCount,
        isJangmunCandidate: s.isJangmunCandidate,
        sourceDocument: s.sourceDocument,
        scores: s.scores,
        totalWeighted: s.totalWeighted,
        suggestedTypes: s.suggestedTypes,
        scoreReasoning: s.scoreReasoning,
        typeHints: s.typeHints,
        scoredBy: s.scoredBy,
      })),
      ...restGeminiOnly.map(s => ({
        text: s.text,
        startIndex: s.startIndex,
        endIndex: s.endIndex,
        wordCount: s.wordCount,
        isJangmunCandidate: s.isJangmunCandidate,
        sourceDocument: s.sourceDocument,
        scores: s.scores,
        totalWeighted: s.totalWeighted,
        suggestedTypes: s.suggestedTypes,
        scoreReasoning: s.scoreReasoning,
        typeHints: s.typeHints,
        scoredBy: 'gemini' as const,
      })),
    ];

    // totalWeighted 기준 최종 정렬
    allScored.sort((a, b) => b.totalWeighted - a.totalWeighted);

    const savedPassages = [];

    for (const sp of allScored) {
      const sr = sp.sourceDocument.searchResult;

      const source = await prisma.source.create({
        data: {
          title: sr.title,
          authors: JSON.stringify(sr.authors),
          sourceUrl: sr.sourceUrl,
          repository: sr.repository,
        },
      });

      const passage = await prisma.passage.create({
        data: {
          sourceId: source.id,
          text: sp.text,
          startIndex: sp.startIndex,
          endIndex: sp.endIndex,
          wordCount: sp.wordCount,
          isJangmunCandidate: sp.isJangmunCandidate,
          status: 'pending',
        },
      });

      const commentData = JSON.stringify({
        reasoning: sp.scoreReasoning,
        typeHints: sp.typeHints,
      });

      await prisma.passageScore.create({
        data: {
          passageId: passage.id,
          scorer: 'ai',
          topicDepth: sp.scores.topicDepth,
          logicalStructure: sp.scores.logicalStructure,
          standaloneCoherence: sp.scores.standaloneCoherence,
          vocabularyLevel: sp.scores.vocabularyLevel,
          questionTypeFit: sp.scores.questionTypeFit,
          distractorPotential: sp.scores.distractorPotential,
          totalWeighted: sp.totalWeighted,
          questionTypes: JSON.stringify(sp.suggestedTypes),
          comment: commentData,
        },
      });

      savedPassages.push({
        id: passage.id,
        text: sp.text,
        wordCount: sp.wordCount,
        sourceUrl: sr.sourceUrl,
        sourceTitle: sr.title,
        repository: sr.repository,
        scores: sp.scores,
        totalWeighted: sp.totalWeighted,
        suggestedTypes: sp.suggestedTypes,
        isJangmunCandidate: sp.isJangmunCandidate,
        scoredBy: sp.scoredBy,
        typeHints: sp.typeHints,
      });
    }

    return NextResponse.json({
      success: true,
      passages: savedPassages,
      stats: {
        searched: searchResults.length,
        fetched: documents.length,
        extracted: allCandidates.length,
        geminiScored: geminiScored.length,
        claudeScored: claudeScored.length,
        totalSaved: savedPassages.length,
      },
      searchErrors,
    });
  } catch (error) {
    console.error('Crawl error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
