import { NextRequest, NextResponse } from 'next/server';
import { generateV3Predictions } from '@/lib/prediction-engine/v3';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('date_from') ?? undefined;
    const dateTo = searchParams.get('date_to') ?? undefined;
    const leagueId = searchParams.get('league_id') ? Number(searchParams.get('league_id')) : undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 100;

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const predictions = await generateV3Predictions({
      dateFrom: dateFrom ?? today,
      dateTo: dateTo ?? nextWeek,
      leagueId,
      limit,
    });

    return NextResponse.json({
      results: predictions,
      count: predictions.length,
      engineVersion: '3.0.0',
    });
  } catch (error) {
    console.error('V3 Predictions API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate predictions' },
      { status: 500 }
    );
  }
}
