import { NextRequest, NextResponse } from 'next/server';
import { extractPassagesRuleBased } from '@/engines/crawl-evaluate/rule-extractor';
import { prefilterDocument } from '@/engines/crawl-evaluate/prefilter';
import { scoreWithGemini } from '@/engines/crawl-evaluate/gemini-scorer';
import type { FetchedDocument } from '@/engines/crawl-evaluate/fetcher';
import { prisma } from '@/lib/db';
import type { QuestionType } from '@/types';

/**
 * POST /api/crawl/extract
 * ricefarm: 강화된 룰 기반 추출 + Gemini 평가 (토큰 0)
 *
 * Body: { cacheKey, docIndex, questionType? }
 */
export async function POST(request: NextRequest) {
  try {
    const { cacheKey, docIndex, questionType } = await request.json() as {
      cacheKey: string;
      docIndex: number;
      questionType?: QuestionType;
    };

    const documents = (globalThis as Record<string, unknown>)[cacheKey] as FetchedDocument[] | undefined;
    if (!documents || !documents[docIndex]) {
      return NextResponse.json({ success: false, error: 'Document not found in cache' }, { status: 404 });
    }

    const doc = documents[docIndex];
    const qType = questionType || 'blank';

    // Pre-filter
    const precheck = prefilterDocument(doc);
    if (!precheck.pass) {
      return NextResponse.json({ success: true, passages: [], reason: precheck.reason });
    }

    // Step 1: 강화된 룰 기반 추출 (토큰 0)
    const candidates = extractPassagesRuleBased(doc, 3);

    if (candidates.length === 0) {
      return NextResponse.json({ success: true, passages: [], reason: 'No suitable passages found' });
    }

    // Step 2: Gemini 평가 (토큰 0)
    const source = await prisma.source.create({
      data: {
        title: doc.searchResult.title,
        authors: JSON.stringify(doc.searchResult.authors),
        sourceUrl: doc.searchResult.sourceUrl,
        repository: doc.searchResult.repository,
      },
    });

    const saved = [];

    for (const candidate of candidates) {
      const scored = await scoreWithGemini(candidate, qType);

      const passage = await prisma.passage.create({
        data: {
          sourceId: source.id,
          text: candidate.text,
          startIndex: candidate.startIndex,
          endIndex: candidate.endIndex,
          wordCount: candidate.wordCount,
          isJangmunCandidate: candidate.isJangmunCandidate,
          status: 'pending',
        },
      });

      if (scored) {
        const commentData = JSON.stringify({
          reasoning: scored.scoreReasoning,
          typeHints: scored.typeHints,
        });

        await prisma.passageScore.create({
          data: {
            passageId: passage.id,
            scorer: 'ai',
            topicDepth: scored.scores.topicDepth,
            logicalStructure: scored.scores.logicalStructure,
            standaloneCoherence: scored.scores.standaloneCoherence,
            vocabularyLevel: scored.scores.vocabularyLevel,
            questionTypeFit: scored.scores.questionTypeFit,
            distractorPotential: scored.scores.distractorPotential,
            totalWeighted: scored.totalWeighted,
            questionTypes: JSON.stringify(scored.suggestedTypes),
            comment: commentData,
          },
        });

        saved.push({
          id: passage.id,
          text: candidate.text,
          wordCount: candidate.wordCount,
          isJangmunCandidate: candidate.isJangmunCandidate,
          qualityScore: candidate.qualityScore,
          sourceTitle: doc.searchResult.title,
          sourceUrl: doc.searchResult.sourceUrl,
          repository: doc.searchResult.repository,
          scores: scored.scores,
          totalWeighted: scored.totalWeighted,
          suggestedTypes: scored.suggestedTypes,
          typeHints: scored.typeHints,
          scoredBy: 'gemini',
        });
      } else {
        saved.push({
          id: passage.id,
          text: candidate.text,
          wordCount: candidate.wordCount,
          isJangmunCandidate: candidate.isJangmunCandidate,
          qualityScore: candidate.qualityScore,
          sourceTitle: doc.searchResult.title,
          sourceUrl: doc.searchResult.sourceUrl,
          repository: doc.searchResult.repository,
          scoredBy: 'rule-only',
        });
      }
    }

    return NextResponse.json({ success: true, passages: saved });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
