import type { TeamStats, ModelPrediction, LeagueAvgData } from './types';

/**
 * Calculate factorial iteratively to avoid stack overflow.
 */
function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Poisson probability: P(X=k) = (λ^k * e^-λ) / k!
 */
function poissonProbability(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Calculate attack and defense strengths for home and away teams.
 */
function calculateStrengths(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvg: LeagueAvgData
) {
  // Attack strength = team's goals scored per game / league average goals scored per game
  const homeAttackStrength =
    homeStats.matchesPlayed > 0
      ? (homeStats.goalsScored / homeStats.matchesPlayed) / leagueAvg.avgGoalsScored
      : 1;

  const awayAttackStrength =
    awayStats.matchesPlayed > 0
      ? (awayStats.goalsScored / awayStats.matchesPlayed) / leagueAvg.avgGoalsScored
      : 1;

  // Defense weakness = team's goals conceded per game / league average goals conceded per game
  const homeDefenseWeakness =
    homeStats.matchesPlayed > 0
      ? (homeStats.goalsConceded / homeStats.matchesPlayed) / leagueAvg.avgGoalsConceded
      : 1;

  const awayDefenseWeakness =
    awayStats.matchesPlayed > 0
      ? (awayStats.goalsConceded / awayStats.matchesPlayed) / leagueAvg.avgGoalsConceded
      : 1;

  return { homeAttackStrength, awayAttackStrength, homeDefenseWeakness, awayDefenseWeakness };
}

/**
 * Calculate Poisson-based match prediction.
 *
 * Uses attack strength * opponent defense weakness * league average to
 * determine expected goals (lambda) for each team, then builds a goal
 * probability matrix using the Poisson distribution.
 */
export function calculatePoissonPrediction(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvg: LeagueAvgData
): ModelPrediction {
  const strengths = calculateStrengths(homeStats, awayStats, leagueAvg);

  // Expected goals (lambda) for each team
  const homeLambda =
    strengths.homeAttackStrength *
    strengths.awayDefenseWeakness *
    leagueAvg.avgHomeGoals;

  const awayLambda =
    strengths.awayAttackStrength *
    strengths.homeDefenseWeakness *
    leagueAvg.avgAwayGoals;

  // Build goal probability matrix (0-7 goals each)
  const maxGoals = 7;
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = poissonProbability(homeLambda, h) * poissonProbability(awayLambda, a);
      if (h > a) {
        homeWinProb += prob;
      } else if (h === a) {
        drawProb += prob;
      } else {
        awayWinProb += prob;
      }
    }
  }

  // Normalize
  const total = homeWinProb + drawProb + awayWinProb;
  if (total === 0) {
    return {
      homeWinProb: 0.4,
      drawProb: 0.3,
      awayWinProb: 0.3,
      homeExpectedGoals: Math.round(homeLambda * 100) / 100,
      awayExpectedGoals: Math.round(awayLambda * 100) / 100,
    };
  }

  return {
    homeWinProb: homeWinProb / total,
    drawProb: drawProb / total,
    awayWinProb: awayWinProb / total,
    homeExpectedGoals: Math.round(homeLambda * 100) / 100,
    awayExpectedGoals: Math.round(awayLambda * 100) / 100,
  };
}

/**
 * Build the full goal matrix for derived markets (over/under, BTTS, etc.)
 */
export function buildGoalMatrix(
  homeLambda: number,
  awayLambda: number,
  maxGoals = 7
): number[][] {
  const matrix: number[][] = [];
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      matrix[h][a] = poissonProbability(homeLambda, h) * poissonProbability(awayLambda, a);
    }
  }
  return matrix;
}

/**
 * Calculate over/under and BTTS probabilities from a goal matrix.
 */
export function calculateDerivedMarkets(matrix: number[][], threshold: number = 0): {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  over15Prob: number;
  over25Prob: number;
  over35Prob: number;
  bttsProb: number;
  mostLikelyScore: string;
} {
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  let over15Prob = 0;
  let over25Prob = 0;
  let over35Prob = 0;
  let bttsProb = 0;
  let maxProb = 0;
  let mostLikelyScore = '1-1';

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
      const prob = matrix[h][a] - (threshold || 0);
      const actualProb = matrix[h][a];

      if (h > a) homeWinProb += actualProb;
      else if (h === a) drawProb += actualProb;
      else awayWinProb += actualProb;

      if (h + a > 1.5) over15Prob += actualProb;
      if (h + a > 2.5) over25Prob += actualProb;
      if (h + a > 3.5) over35Prob += actualProb;
      if (h > 0 && a > 0) bttsProb += actualProb;

      if (actualProb > maxProb) {
        maxProb = actualProb;
        mostLikelyScore = `${h}-${a}`;
      }
    }
  }

  return {
    homeWinProb,
    drawProb,
    awayWinProb,
    over15Prob,
    over25Prob,
    over35Prob,
    bttsProb,
    mostLikelyScore,
  };
}
