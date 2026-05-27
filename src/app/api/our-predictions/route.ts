import { NextRequest, NextResponse } from 'next/server';
import { generatePredictions } from '@/lib/prediction-engine';

// Cache for 5 minutes
export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('date_from') ?? undefined;
    const dateTo = searchParams.get('date_to') ?? undefined;
    const leagueId = searchParams.get('league_id')
      ? Number(searchParams.get('league_id'))
      : undefined;
    const limit = searchParams.get('limit')
      ? Number(searchParams.get('limit'))
      : 100;

    // Default date range: today to +7 days
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const predictions = await generatePredictions({
      dateFrom: dateFrom ?? today,
      dateTo: dateTo ?? nextWeek,
      leagueId,
      limit,
    });

    return NextResponse.json({
      results: predictions,
      count: predictions.length,
    });
  } catch (error) {
    console.error('Our predictions API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate predictions' },
      { status: 500 }
    );
  }
}
