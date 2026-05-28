import { NextRequest, NextResponse } from 'next/server';
import { generateV4Tips } from '@/lib/prediction-engine/v4';
import type { TipQuality } from '@/lib/prediction-engine/v4/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('date_from') ?? undefined;
    const dateTo = searchParams.get('date_to') ?? undefined;
    const leagueId = searchParams.get('league_id') ? Number(searchParams.get('league_id')) : undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 100;
    const minQuality = searchParams.get('min_quality') as TipQuality | null;

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const tips = await generateV4Tips({
      dateFrom: dateFrom ?? today,
      dateTo: dateTo ?? nextWeek,
      leagueId,
      limit,
      minQuality: minQuality ?? undefined,
    });

    // Stats
    const gold = tips.filter(t => t.tip?.quality === 'gold').length;
    const silver = tips.filter(t => t.tip?.quality === 'silver').length;
    const bronze = tips.filter(t => t.tip?.quality === 'bronze').length;
    const skipped = tips.filter(t => t.tip === null).length;

    return NextResponse.json({
      results: tips,
      count: tips.length,
      stats: { gold, silver, bronze, skipped, withTip: gold + silver + bronze },
      engineVersion: '4.0.0',
    });
  } catch (error) {
    console.error('V4 Predictions API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate predictions' },
      { status: 500 }
    );
  }
}
