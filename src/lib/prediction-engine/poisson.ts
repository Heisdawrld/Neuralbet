// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Poisson Goal Distribution Model
//
// The workhorse. But a punter knows:
// - Raw attack/defense ratios are noisy — regress to the mean
// - Small sample sizes lie — 3 matches don't define a team
// - Home advantage isn't just "goals" — it's a psychological edge
// ═══════════════════════════════════════════════════════════════════════

import type { TeamStats, ModelPrediction, LeagueAvgData } from './types';
import { buildGoalMatrix, calculateOutcomeProbs, regressToMean, clamp } from './utils';

/**
 * Calculate attack and defense strengths with regression to mean.
 *
 * A punter doesn't just take raw goals-per-game. They ask:
 * "Is this team actually good, or did they just get lucky over 5 games?"
 *
 * We shrink extreme values toward the league average based on sample size.
 */
function calculateStrengths(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvg: LeagueAvgData
) {
  const homeSampleSize = Math.max(homeStats.homeMatches, homeStats.matchesPlayed / 2);
  const awaySampleSize = Math.max(awayStats.awayMatches, awayStats.matchesPlayed / 2);

  // Home team attack (use home-specific data when available)
  const homeGoalsPerGame = homeStats.homeMatches > 2
    ? homeStats.homeGoalsScored / homeStats.homeMatches
    : homeStats.matchesPlayed > 0
      ? homeStats.goalsScored / homeStats.matchesPlayed
      : leagueAvg.avgHomeGoals;

  // Regress to league average
  const homeAttackStrength = regressToMean(
    homeGoalsPerGame / leagueAvg.avgGoalsScored,
    1.0, // Mean attack strength is 1.0 by definition
    homeSampleSize,
    8 // Shrinkage rate — reasonable for football
  );

  // Away team defense weakness (use away-specific data)
  const awayGoalsConcededPerGame = awayStats.awayMatches > 2
    ? awayStats.awayGoalsConceded / awayStats.awayMatches
    : awayStats.matchesPlayed > 0
      ? awayStats.goalsConceded / awayStats.matchesPlayed
      : leagueAvg.avgAwayGoals;

  const awayDefenseWeakness = regressToMean(
    awayGoalsConcededPerGame / leagueAvg.avgGoalsConceded,
    1.0,
    awaySampleSize,
    8
  );

  // Away team attack
  const awayGoalsPerGame = awayStats.awayMatches > 2
    ? awayStats.awayGoalsScored / awayStats.awayMatches
    : awayStats.matchesPlayed > 0
      ? awayStats.goalsScored / awayStats.matchesPlayed
      : leagueAvg.avgAwayGoals;

  const awayAttackStrength = regressToMean(
    awayGoalsPerGame / leagueAvg.avgGoalsScored,
    1.0,
    awaySampleSize,
    8
  );

  // Home team defense weakness
  const homeGoalsConcededPerGame = homeStats.homeMatches > 2
    ? homeStats.homeGoalsConceded / homeStats.homeMatches
    : homeStats.matchesPlayed > 0
      ? homeStats.goalsConceded / homeStats.matchesPlayed
      : leagueAvg.avgHomeGoals;

  const homeDefenseWeakness = regressToMean(
    homeGoalsConcededPerGame / leagueAvg.avgGoalsConceded,
    1.0,
    homeSampleSize,
    8
  );

  return {
    homeAttackStrength,
    awayDefenseWeakness,
    awayAttackStrength,
    homeDefenseWeakness,
  };
}

/**
 * Poisson-based match prediction.
 *
 * Uses attack strength × opponent defense weakness × league average
 * to determine expected goals (lambda), then builds a goal probability
 * matrix with Dixon-Coles correlation correction.
 */
export function calculatePoissonPrediction(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvg: LeagueAvgData
): ModelPrediction {
  const strengths = calculateStrengths(homeStats, awayStats, leagueAvg);

  // Expected goals (lambda) for each team
  let homeLambda = strengths.homeAttackStrength * strengths.awayDefenseWeakness * leagueAvg.avgHomeGoals;
  let awayLambda = strengths.awayAttackStrength * strengths.homeDefenseWeakness * leagueAvg.avgAwayGoals;

  // A punter's sanity check: if lambda is extreme, something's off
  homeLambda = clamp(homeLambda, 0.4, 4.0);
  awayLambda = clamp(awayLambda, 0.2, 3.5);

  // Build goal matrix with correlation adjustment
  const matrix = buildGoalMatrix(homeLambda, awayLambda, 7, 0.1);
  const outcomes = calculateOutcomeProbs(matrix);

  // Reliability based on sample size
  const minMatches = Math.min(homeStats.matchesPlayed, awayStats.matchesPlayed);
  let reliability: number;
  if (minMatches < 3) reliability = 0.2;
  else if (minMatches < 6) reliability = 0.4;
  else if (minMatches < 10) reliability = 0.6;
  else if (minMatches < 20) reliability = 0.8;
  else reliability = 0.9;

  // Check if we used home/away specific data
  const hasHomeAwaySplit = homeStats.homeMatches > 2 && awayStats.awayMatches > 2;
  if (hasHomeAwaySplit) reliability = Math.min(1, reliability + 0.1);

  return {
    homeWinProb: outcomes.homeWinProb,
    drawProb: outcomes.drawProb,
    awayWinProb: outcomes.awayWinProb,
    homeExpectedGoals: Math.round(homeLambda * 100) / 100,
    awayExpectedGoals: Math.round(awayLambda * 100) / 100,
    reliability,
  };
}
