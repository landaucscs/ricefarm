import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { passageId, comment, approved, aiScores, userScores, questionTypes } = body;

    const feedback = await prisma.passageFeedback.create({
      data: {
        passageId,
        approved: approved ?? false,
        comment: comment ?? null,
        aiScores: aiScores ? JSON.stringify(aiScores) : null,
        userScores: userScores ? JSON.stringify(userScores) : null,
        questionTypes: JSON.stringify(questionTypes ?? []),
      },
    });

    return NextResponse.json({ success: true, id: feedback.id });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const passageId = searchParams.get('passageId');

  const where = passageId ? { passageId } : {};
  const feedback = await prisma.passageFeedback.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(feedback);
}
