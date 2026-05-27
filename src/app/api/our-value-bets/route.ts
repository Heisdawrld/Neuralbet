import { NextResponse } from 'next/server';
import { generatePredictions, fetchEventOdds, enrichWithMarketData } from '@/lib/prediction-engine';
import type { PunterPrediction } from '@/lib/prediction-engine/types';

// Cache for 5 minutes
export const revalidate = 300;

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Generate predictions from our engine
    const predictions = await generatePredictions({
      dateFrom: today,
      dateTo: nextWeek,
      limit: 100,
    });

    // Enrich predictions with market odds and value detection
    const enrichedPredictions: PunterPrediction[] = [];
    const batchSize = 10;

    for (let i = 0; i < predictions.length; i += batchSize) {
      const batch = predictions.slice(i, i + batchSize);
      const oddsPromises = batch.map(async (pred) => {
        try {
          const odds = await fetchEventOdds(pred.eventId);
          return { prediction: pred, odds };
        } catch {
          return { prediction: pred, odds: null };
        }
      });

      const results = await Promise.all(oddsPromises);

      for (const { prediction, odds } of results) {
        if (odds) {
          const enriched = enrichWithMarketData(prediction, odds);
          enrichedPredictions.push(enriched);
        } else {
          // Keep prediction without market data
          enrichedPredictions.push(prediction);
        }
      }
    }

    // Extract actionable value bets from enriched predictions
    const valueBets: Array<{
      match: {
        id: number;
        homeTeam: string;
        awayTeam: string;
        homeTeamId: number;
        awayTeamId: number;
        leagueId: number;
        leagueName: string;
        eventDate: string;
        status: string;
        homeScore: number | null;
        awayScore: number | null;
        currentMinute: number | null;
        period: string;
      };
      prediction: typeof enrichedPredictions[0];
      market: string;
      selection: string;
      modelProbability: number;
      impliedProbability: number;
      odds: number;
      edge: number;
      kellyStake: number;
      adjustedKelly: number;
      valueRating: number;
      isActionable: boolean;
    }> = [];

    for (const pred of enrichedPredictions) {
      const matchData = {
        id: pred.eventId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        homeTeamId: pred.homeTeamId,
        awayTeamId: pred.awayTeamId,
        leagueId: pred.leagueId,
        leagueName: pred.leagueName,
        eventDate: pred.eventDate,
        status: pred.status,
        homeScore: null,
        awayScore: null,
        currentMinute: null,
        period: '',
      };

      for (const vb of pred.valueBets) {
        valueBets.push({
          match: matchData,
          prediction: pred,
          market: vb.market,
          selection: vb.selection,
          modelProbability: vb.modelProbability,
          impliedProbability: vb.impliedProbability,
          odds: vb.odds,
          edge: vb.edge,
          kellyStake: vb.kellyStake,
          adjustedKelly: vb.adjustedKelly,
          valueRating: vb.valueRating,
          isActionable: vb.isActionable,
        });
      }
    }

    // Sort by edge descending, only actionable bets
    const actionalValueBets = valueBets
      .filter((vb) => vb.isActionable)
      .sort((a, b) => b.edge - a.edge);

    return NextResponse.json({
      results: actionalValueBets,
      count: actionalValueBets.length,
    });
  } catch (error) {
    console.error('Punter Brain value bets API error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate value bets' },
      { status: 500 }
    );
  }
}
