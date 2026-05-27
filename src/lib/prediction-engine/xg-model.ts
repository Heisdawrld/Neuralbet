// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — xG (Expected Goals) Model
//
// The TRUTH TELLER. A punter knows:
// - Goals lie (luck, finishing variance)
// - xG tells you what ACTUALLY happened on the pitch
// - A team creating 2.5 xG but scoring 0.5 goals = unlucky, bet on them next
// - A team scoring 2.5 goals from 0.8 xG = lucky, fade them
//
// This is the model a sharp punter trusts MOST.
// ═══════════════════════════════════════════════════════════════════════

import type { TeamStats, ModelPrediction, LeagueAvgData } from './types';
import { buildGoalMatrix, calculateOutcomeProbs, regressToMean, clamp } from './utils';

/**
 * xG-based prediction model.
 *
 * Uses xGF (expected goals for) and xGA (expected goals against) which
 * are more predictive than actual goals because they measure chance
 * quality rather than finishing luck.
 *
 * Key insight: xG regression to mean is LESS aggressive than goal regression
 * because xG is inherently more stable (less random).
 */
export function calculateXgPrediction(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvg: LeagueAvgData
): ModelPrediction {
  // Check if xG data is available and meaningful
  const hasXgData =
    leagueAvg.avgXgf > 0 &&
    leagueAvg.avgXga > 0 &&
    homeStats.matchesPlayed > 0 &&
    awayStats.matchesPlayed > 0 &&
    homeStats.xgf > 0 &&
    awayStats.xgf > 0;

  if (!hasXgData) {
    return {
      homeWinProb: 0.42,
      drawProb: 0.28,
      awayWinProb: 0.30,
      homeExpectedGoals: 1.35,
      awayExpectedGoals: 1.15,
      reliability: 0.05,
    };
  }

  const homeSampleSize = homeStats.matchesPlayed;
  const awaySampleSize = awayStats.matchesPlayed;

  // xG per game
  const homeXgfPerGame = homeStats.xgf / homeStats.matchesPlayed;
  const homeXgaPerGame = homeStats.xga / homeStats.matchesPlayed;
  const awayXgfPerGame = awayStats.xgf / awayStats.matchesPlayed;
  const awayXgaPerGame = awayStats.xga / awayStats.matchesPlayed;

  // Attack xG rating (regressed) — xG is more stable so less shrinkage
  const homeAttackXg = regressToMean(
    homeXgfPerGame / leagueAvg.avgXgf,
    1.0,
    homeSampleSize,
    6 // Less shrinkage than goals — xG is more reliable
  );

  const awayAttackXg = regressToMean(
    awayXgfPerGame / leagueAvg.avgXgf,
    1.0,
    awaySampleSize,
    6
  );

  // Defense xG weakness (regressed)
  const homeDefenseXg = regressToMean(
    homeXgaPerGame / leagueAvg.avgXga,
    1.0,
    homeSampleSize,
    6
  );

  const awayDefenseXg = regressToMean(
    awayXgaPerGame / leagueAvg.avgXga,
    1.0,
    awaySampleSize,
    6
  );

  // Expected goals using xG interaction
  let homeExpectedGoals = homeAttackXg * awayDefenseXg * leagueAvg.avgHomeGoals;
  let awayExpectedGoals = awayAttackXg * homeDefenseXg * leagueAvg.avgAwayGoals;

  // Sanity bounds
  homeExpectedGoals = clamp(homeExpectedGoals, 0.3, 4.0);
  awayExpectedGoals = clamp(awayExpectedGoals, 0.2, 3.5);

  // Build goal matrix with correlation correction
  const matrix = buildGoalMatrix(homeExpectedGoals, awayExpectedGoals, 7, 0.1);
  const outcomes = calculateOutcomeProbs(matrix);

  // Reliability — xG is the most reliable model when data is available
  const minMatches = Math.min(homeSampleSize, awaySampleSize);
  let reliability: number;
  if (minMatches < 3) reliability = 0.25;
  else if (minMatches < 6) reliability = 0.5;
  else if (minMatches < 10) reliability = 0.7;
  else if (minMatches < 20) reliability = 0.85;
  else reliability = 0.95;

  // Bonus: xGD (expected goal difference) consistency check
  // If a team's xGD aligns with their actual GD, they're genuine
  const homeGdConsistency = homeStats.matchesPlayed > 5
    ? 1 - Math.min(1, Math.abs(homeStats.xgd - (homeStats.goalsScored - homeStats.goalsConceded)) / 10)
    : 0.5;
  const awayGdConsistency = awayStats.matchesPlayed > 5
    ? 1 - Math.min(1, Math.abs(awayStats.xgd - (awayStats.goalsScored - awayStats.goalsConceded)) / 10)
    : 0.5;

  reliability *= (homeGdConsistency + awayGdConsistency) / 2;
  reliability = clamp(reliability, 0.1, 0.95);

  return {
    homeWinProb: outcomes.homeWinProb,
    drawProb: outcomes.drawProb,
    awayWinProb: outcomes.awayWinProb,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
    reliability,
  };
}
