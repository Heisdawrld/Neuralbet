import { NextResponse } from 'next/server';
import { generateV3Predictions } from '@/lib/prediction-engine/v3';

export const revalidate = 300;

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const predictions = await generateV3Predictions({
      dateFrom: today,
      dateTo: nextWeek,
      limit: 100,
    });

    // Extract all actionable value bets
    const allValueBets: Array<{
      eventId: number;
      homeTeam: string;
      awayTeam: string;
      leagueName: string;
      eventDate: string;
      vb: any;
    }> = [];

    for (const pred of predictions) {
      for (const vb of pred.valueBets) {
        if (vb.isActionable) {
          allValueBets.push({
            eventId: pred.eventId,
            homeTeam: pred.homeTeam,
            awayTeam: pred.awayTeam,
            leagueName: pred.leagueName,
            eventDate: pred.eventDate,
            vb,
          });
        }
      }
    }

    // Sort by edge descending
    allValueBets.sort((a, b) => (b.vb.edge ?? 0) - (a.vb.edge ?? 0));

    return NextResponse.json({
      results: allValueBets,
      count: allValueBets.length,
      engineVersion: '3.0.0',
    });
  } catch (error) {
    console.error('V3 Value Bets API error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate value bets' },
      { status: 500 }
    );
  }
}
