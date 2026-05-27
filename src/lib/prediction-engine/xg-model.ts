import type { TeamStats, ModelPrediction, LeagueAvgData } from './types';

/**
 * xG-Based Model
 *
 * Uses xG (expected goals) data which is more predictive than actual goals
 * because it's less noisy. xG captures chance quality rather than just
 * finishing luck.
 *
 * Attack xG rating = team's xGF per game / league average xGF per game
 * Defense xG rating = team's xGA per game / league average xGA per game
 */
export function calculateXgPrediction(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvg: LeagueAvgData
): ModelPrediction {
  // If no xG data available, fall back to a neutral prediction
  if (
    leagueAvg.avgXgf <= 0 ||
    leagueAvg.avgXga <= 0 ||
    homeStats.matchesPlayed === 0 ||
    awayStats.matchesPlayed === 0
  ) {
    return {
      homeWinProb: 0.42,
      drawProb: 0.28,
      awayWinProb: 0.30,
      homeExpectedGoals: 1.35,
      awayExpectedGoals: 1.15,
    };
  }

  const homeXgfPerGame = homeStats.xgf / homeStats.matchesPlayed;
  const homeXgaPerGame = homeStats.xga / homeStats.matchesPlayed;
  const awayXgfPerGame = awayStats.xgf / awayStats.matchesPlayed;
  const awayXgaPerGame = awayStats.xga / awayStats.matchesPlayed;

  // Attack xG rating: how much better/worse than average
  const homeAttackXg = homeXgfPerGame / leagueAvg.avgXgf;
  const awayAttackXg = awayXgfPerGame / leagueAvg.avgXgf;

  // Defense xG rating: how much better/worse at preventing goals
  // Lower xGA = better defense, so we invert for "weakness"
  const homeDefenseXg = homeXgaPerGame / leagueAvg.avgXga;
  const awayDefenseXg = awayXgaPerGame / leagueAvg.avgXga;

  // Expected goals using xG interaction
  // Home expected goals = home xG attack * away xG defense weakness * league home avg
  const homeExpectedGoals =
    homeAttackXg * awayDefenseXg * leagueAvg.avgHomeGoals;

  // Away expected goals = away xG attack * home xG defense weakness * league away avg
  const awayExpectedGoals =
    awayAttackXg * homeDefenseXg * leagueAvg.avgAwayGoals;

  // Use Poisson-inspired probability estimation from expected goals
  const homeLambda = Math.max(0.3, homeExpectedGoals);
  const awayLambda = Math.max(0.2, awayExpectedGoals);

  // Simplified Poisson-based win/draw/loss estimation
  const { homeWinProb, drawProb, awayWinProb } = poissonMatchOdds(
    homeLambda,
    awayLambda
  );

  return {
    homeWinProb,
    drawProb,
    awayWinProb,
    homeExpectedGoals: Math.round(homeLambda * 100) / 100,
    awayExpectedGoals: Math.round(awayLambda * 100) / 100,
  };
}

/**
 * Simplified Poisson match odds calculation.
 * Uses the Skellam distribution approximation for the difference
 * of two Poisson random variables.
 */
function poissonMatchOdds(
  homeLambda: number,
  awayLambda: number
): { homeWinProb: number; drawProb: number; awayWinProb: number } {
  const maxGoals = 7;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob =
        poissonProb(homeLambda, h) * poissonProb(awayLambda, a);
      if (h > a) homeWin += prob;
      else if (h === a) draw += prob;
      else awayWin += prob;
    }
  }

  const total = homeWin + draw + awayWin;
  if (total === 0) return { homeWinProb: 0.4, drawProb: 0.3, awayWinProb: 0.3 };

  return {
    homeWinProb: homeWin / total,
    drawProb: draw / total,
    awayWinProb: awayWin / total,
  };
}

function poissonProb(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let result = 1;
  for (let i = 2; i <= k; i++) {
    result *= i;
  }
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / result;
}
