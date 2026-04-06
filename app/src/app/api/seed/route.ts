import { NextResponse } from 'next/server';
import { syncSeedDataToDb } from '@/lib/seed-loader';

export async function POST() {
  try {
    const count = await syncSeedDataToDb();
    return NextResponse.json({ success: true, loaded: count });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
