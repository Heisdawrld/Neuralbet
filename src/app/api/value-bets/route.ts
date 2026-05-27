import { NextResponse } from 'next/server';

const BSD_API_KEY = '631a48f45a20b3352ea3863f8aa23baf610710e2';
const BSD_BASE_URL = 'https://sports.bzzoiro.com/api/v2/';

interface ApiPrediction {
  id: number;
  event: {
    id: number;
    event_date: string;
    status: string;
    home_team_id: number;
    home_team: string;
    away_team_id: number;
    away_team: string;
    league_id: number;
    league_name: string;
  };
  markets: {
    match_result: {
      prob_home: number;
      prob_draw: number;
      prob_away: number;
      predicted: string;
    };
    expected_goals: {
      home: number;
      away: number;
    };
    over_under: {
      prob_over_15: number;
      prob_over_25: number;
      prob_over_35: number;
    };
    btts: {
      prob_yes: number;
    };
    score: {
      most_likely: string;
    };
  };
  recommendations: {
    favorite: string;
    favorite_prob: number;
    bet_favorite: boolean;
    over_15: boolean;
    over_25: boolean;
    over_35: boolean;
    btts: boolean;
    winner: boolean;
  };
  model: {
    confidence: number;
    version: string;
  };
}

interface ApiOdds {
  event_id: number;
  odds: {
    home_win: number | null;
    draw: number | null;
    away_win: number | null;
  };
}

async function fetchBSD<T>(path: string): Promise<T> {
  const url = `${BSD_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${BSD_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`BSD API ${res.status}`);
  return res.json();
}

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
    const predictionsRes = await fetchBSD<{ results?: ApiPrediction[] }>(
      'predictions/?status=upcoming&limit=50'
    );
    const predictions = predictionsRes.results || [];

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
        homeWinProb: number;
        drawProb: number;
        awayWinProb: number;
        predicted: string;
        homeXg: number;
        awayXg: number;
        mostLikelyScore: string;
        confidence: number;
        isRecommended: boolean;
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

    const batchSize = 10;
    for (let i = 0; i < Math.min(predictions.length, 30); i += batchSize) {
      const batch = predictions.slice(i, i + batchSize);
      const oddsPromises = batch.map(async (pred) => {
        try {
          const oddsRes = await fetchBSD<ApiOdds>(`events/${pred.event.id}/odds/`);
          return { prediction: pred, odds: oddsRes };
        } catch {
          return { prediction: pred, odds: null };
        }
      });

      const oddsResults = await Promise.all(oddsPromises);

      for (const { prediction, odds } of oddsResults) {
        if (!odds || !odds.odds.home_win || !odds.odds.draw || !odds.odds.away_win) continue;

        const homeWinProb = prediction.markets.match_result.prob_home / 100;
        const drawProb = prediction.markets.match_result.prob_draw / 100;
        const awayWinProb = prediction.markets.match_result.prob_away / 100;

        const markets = [
          {
            market: '1x2',
            selection: prediction.event.home_team,
            modelProb: homeWinProb,
            odds: odds.odds.home_win,
          },
          {
            market: '1x2',
            selection: 'Draw',
            modelProb: drawProb,
            odds: odds.odds.draw,
          },
          {
            market: '1x2',
            selection: prediction.event.away_team,
            modelProb: awayWinProb,
            odds: odds.odds.away_win,
          },
        ];

        for (const m of markets) {
          const impliedProb = 1 / m.odds;
          const edge = m.modelProb - impliedProb;

          if (edge > 0.05) {
            const kelly = calculateKellyStake(m.modelProb, m.odds);
            const valueRating = Math.min(5, Math.round((edge / 0.15) * 5));

            const isRecommended =
              prediction.recommendations.bet_favorite ||
              prediction.recommendations.over_25 ||
              prediction.recommendations.btts ||
              prediction.recommendations.winner;

            valueBets.push({
              match: {
                id: prediction.event.id,
                homeTeam: prediction.event.home_team,
                awayTeam: prediction.event.away_team,
                homeTeamId: prediction.event.home_team_id,
                awayTeamId: prediction.event.away_team_id,
                leagueId: prediction.event.league_id,
                leagueName: prediction.event.league_name,
                eventDate: prediction.event.event_date,
                status: prediction.event.status,
                homeScore: null,
                awayScore: null,
                currentMinute: null,
                period: '',
              },
              prediction: {
                id: prediction.id,
                homeWinProb,
                drawProb,
                awayWinProb,
                predicted: prediction.markets.match_result.predicted,
                homeXg: prediction.markets.expected_goals.home,
                awayXg: prediction.markets.expected_goals.away,
                mostLikelyScore: prediction.markets.score.most_likely,
                confidence: prediction.model.confidence,
                isRecommended,
              },
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

    valueBets.sort((a, b) => b.edge - a.edge);

    return NextResponse.json({ results: valueBets, count: valueBets.length });
  } catch (error) {
    console.error('Value bets error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate value bets' },
      { status: 500 }
    );
  }
}
