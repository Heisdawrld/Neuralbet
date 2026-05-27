import { NextResponse } from 'next/server';
import { generatePredictions, fetchEventOdds } from '@/lib/prediction-engine';
import type { EnsemblePrediction } from '@/lib/prediction-engine/types';

// Cache for 5 minutes
export const revalidate = 300;

function calculateKellyStake(
  modelProb: number,
  odds: number,
  bankrollFraction = 0.25
): number {
  const q = 1 - modelProb;
  const b = odds - 1;
  const kelly = (b * modelProb - q) / b;
  return Math.max(0, Math.min(kelly * bankrollFraction, 0.1));
}

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const predictions = await generatePredictions({
      dateFrom: today,
      dateTo: nextWeek,
      limit: 100,
    });

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
      prediction: {
        id: number;
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
        homeWinProb: number;
        drawProb: number;
        awayWinProb: number;
        predicted: string;
        homeXg: number;
        awayXg: number;
        over15Prob: number;
        over25Prob: number;
        over35Prob: number;
        bttsProb: number;
        mostLikelyScore: string;
        confidence: number;
        recommendations: EnsemblePrediction['recommendations'];
        isRecommended: boolean;
        models: EnsemblePrediction['models'];
        weights: EnsemblePrediction['weights'];
        engineVersion: string;
      };
      market: string;
      selection: string;
      modelProbability: number;
      impliedProbability: number;
      odds: number;
      edge: number;
      kellyStake: number;
      valueRating: number;
    }> = [];

    // Fetch odds for predictions in batches
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

      const oddsResults = await Promise.all(oddsPromises);

      for (const { prediction, odds } of oddsResults) {
        if (!odds?.odds) continue;

        const matchData = {
          id: prediction.eventId,
          homeTeam: prediction.homeTeam,
          awayTeam: prediction.awayTeam,
          homeTeamId: prediction.homeTeamId,
          awayTeamId: prediction.awayTeamId,
          leagueId: prediction.leagueId,
          leagueName: prediction.leagueName,
          eventDate: prediction.eventDate,
          status: prediction.status,
          homeScore: null,
          awayScore: null,
          currentMinute: null,
          period: '',
        };

        const predictionData = {
          id: prediction.eventId,
          match: matchData,
          homeWinProb: prediction.homeWinProb,
          drawProb: prediction.drawProb,
          awayWinProb: prediction.awayWinProb,
          predicted: prediction.predicted,
          homeXg: prediction.homeExpectedGoals,
          awayXg: prediction.awayExpectedGoals,
          over15Prob: prediction.over15Prob,
          over25Prob: prediction.over25Prob,
          over35Prob: prediction.over35Prob,
          bttsProb: prediction.bttsProb,
          mostLikelyScore: prediction.mostLikelyScore,
          confidence: prediction.confidence,
          recommendations: prediction.recommendations,
          isRecommended: prediction.isRecommended,
          models: prediction.models,
          weights: prediction.weights,
          engineVersion: prediction.engineVersion,
        };

        // 1x2 markets
        const markets: Array<{
          market: string;
          selection: string;
          modelProb: number;
          odds: number;
        }> = [];

        if (odds.odds.home_win) {
          markets.push({
            market: '1x2',
            selection: prediction.homeTeam,
            modelProb: prediction.homeWinProb,
            odds: odds.odds.home_win,
          });
        }

        if (odds.odds.draw) {
          markets.push({
            market: '1x2',
            selection: 'Draw',
            modelProb: prediction.drawProb,
            odds: odds.odds.draw,
          });
        }

        if (odds.odds.away_win) {
          markets.push({
            market: '1x2',
            selection: prediction.awayTeam,
            modelProb: prediction.awayWinProb,
            odds: odds.odds.away_win,
          });
        }

        // Over/Under markets
        if (odds.odds.over_25_goals) {
          markets.push({
            market: 'Over/Under 2.5',
            selection: 'Over 2.5',
            modelProb: prediction.over25Prob,
            odds: odds.odds.over_25_goals,
          });
        }

        if (odds.odds.btts_yes) {
          markets.push({
            market: 'BTTS',
            selection: 'Yes',
            modelProb: prediction.bttsProb,
            odds: odds.odds.btts_yes,
          });
        }

        for (const m of markets) {
          const impliedProb = 1 / m.odds;
          const edge = m.modelProb - impliedProb;

          if (edge > 0.05) {
            const kelly = calculateKellyStake(m.modelProb, m.odds);
            const valueRating = Math.min(5, Math.round((edge / 0.15) * 5));

            valueBets.push({
              match: matchData,
              prediction: predictionData,
              market: m.market,
              selection: m.selection,
              modelProbability: m.modelProb,
              impliedProbability: impliedProb,
              odds: m.odds,
              edge,
              kellyStake: kelly,
              valueRating,
            });
          }
        }
      }
    }

    // Sort by edge descending
    valueBets.sort((a, b) => b.edge - a.edge);

    return NextResponse.json({
      results: valueBets,
      count: valueBets.length,
    });
  } catch (error) {
    console.error('Our value bets API error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate value bets' },
      { status: 500 }
    );
  }
}
