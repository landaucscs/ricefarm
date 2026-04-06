import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/passages
 * Load all passages from DB with their sources and scores.
 * Used to restore UI state on page load.
 */
export async function GET() {
  try {
    const dbPassages = await prisma.passage.findMany({
      include: {
        source: true,
        scores: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        feedback: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const passages = dbPassages.map((p) => {
      const latestScore = p.scores[0];
      const latestFeedback = p.feedback[0];

      // Determine status from latest feedback
      let status: 'pending' | 'approved' | 'rejected' = p.status as 'pending' | 'approved' | 'rejected';
      if (latestFeedback) {
        status = latestFeedback.approved ? 'approved' : 'rejected';
      }

      return {
        id: p.id,
        sourceId: p.sourceId,
        text: p.text,
        startIndex: p.startIndex,
        endIndex: p.endIndex,
        wordCount: p.wordCount,
        status,
        isJangmunCandidate: p.isJangmunCandidate,
        createdAt: p.createdAt,
        source: p.source ? {
          id: p.source.id,
          title: p.source.title,
          authors: JSON.parse(p.source.authors || '[]'),
          sourceUrl: p.source.sourceUrl,
          repository: p.source.repository,
          fetchedAt: p.source.fetchedAt,
        } : undefined,
        scores: latestScore ? [{
          id: latestScore.id,
          passageId: latestScore.passageId,
          scorer: latestScore.scorer,
          metrics: {
            topicDepth: latestScore.topicDepth,
            logicalStructure: latestScore.logicalStructure,
            standaloneCoherence: latestScore.standaloneCoherence,
            vocabularyLevel: latestScore.vocabularyLevel,
            questionTypeFit: latestScore.questionTypeFit,
            distractorPotential: latestScore.distractorPotential,
          },
          totalWeighted: latestScore.totalWeighted,
          questionTypes: JSON.parse(latestScore.questionTypes || '[]'),
          typeHints: (() => {
            try {
              const parsed = JSON.parse(latestScore.comment || '{}');
              return parsed.typeHints || {};
            } catch { return {}; }
          })(),
          createdAt: latestScore.createdAt,
        }] : [],
      };
    });

    return NextResponse.json({ passages });
  } catch (error) {
    return NextResponse.json({ passages: [], error: String(error) }, { status: 500 });
  }
}
