// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Attack/Defense Strength Model
//
// The classic. Every punter starts here.
// Goals scored vs league average × Goals conceded vs league average.
//
// But a punter knows the subtleties:
// - Home scoring ≠ away scoring (teams play differently at home)
// - Small samples inflate ratios (3 goals in 1 game = 3/game = nonsense)
// - A team that concedes 0 in 3 games isn't suddenly invincible
// ═══════════════════════════════════════════════════════════════════════

import type { TeamStats, ModelPrediction, LeagueAvgData } from './types';
import { buildGoalMatrix, calculateOutcomeProbs, regressToMean, clamp } from './utils';

/**
 * Attack/Defense prediction with proper home/away splits and regression.
 */
export function calculateAttackDefensePrediction(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvg: LeagueAvgData
): ModelPrediction {
  if (
    leagueAvg.avgGoalsScored <= 0 ||
    leagueAvg.avgGoalsConceded <= 0 ||
    homeStats.matchesPlayed === 0 ||
    awayStats.matchesPlayed === 0
  ) {
    return {
      homeWinProb: 0.42,
      drawProb: 0.28,
      awayWinProb: 0.30,
      homeExpectedGoals: 1.35,
      awayExpectedGoals: 1.15,
      reliability: 0.05,
    };
  }

  // ── Home team attack strength ──────────────────────────────────────
  // Use home-specific data when we have enough matches (>=3)
  const homeSampleSize = homeStats.homeMatches > 2 ? homeStats.homeMatches : homeStats.matchesPlayed;
  const homeAttackRaw = homeStats.homeMatches > 2
    ? (homeStats.homeGoalsScored / homeStats.homeMatches) / leagueAvg.avgHomeGoals
    : (homeStats.goalsScored / homeStats.matchesPlayed) / leagueAvg.avgGoalsScored;

  const homeAttackStrength = regressToMean(homeAttackRaw, 1.0, homeSampleSize, 10);

  // ── Away team defense weakness ─────────────────────────────────────
  const awayDefSampleSize = awayStats.awayMatches > 2 ? awayStats.awayMatches : awayStats.matchesPlayed;
  const awayDefenseRaw = awayStats.awayMatches > 2
    ? (awayStats.awayGoalsConceded / awayStats.awayMatches) / leagueAvg.avgAwayGoals
    : (awayStats.goalsConceded / awayStats.matchesPlayed) / leagueAvg.avgGoalsConceded;

  const awayDefenseWeakness = regressToMean(awayDefenseRaw, 1.0, awayDefSampleSize, 10);

  // ── Away team attack strength ──────────────────────────────────────
  const awayAttackSampleSize = awayStats.awayMatches > 2 ? awayStats.awayMatches : awayStats.matchesPlayed;
  const awayAttackRaw = awayStats.awayMatches > 2
    ? (awayStats.awayGoalsScored / awayStats.awayMatches) / leagueAvg.avgAwayGoals
    : (awayStats.goalsScored / awayStats.matchesPlayed) / leagueAvg.avgGoalsScored;

  const awayAttackStrength = regressToMean(awayAttackRaw, 1.0, awayAttackSampleSize, 10);

  // ── Home team defense weakness ─────────────────────────────────────
  const homeDefSampleSize = homeStats.homeMatches > 2 ? homeStats.homeMatches : homeStats.matchesPlayed;
  const homeDefenseRaw = homeStats.homeMatches > 2
    ? (homeStats.homeGoalsConceded / homeStats.homeMatches) / leagueAvg.avgHomeGoals
    : (homeStats.goalsConceded / homeStats.matchesPlayed) / leagueAvg.avgGoalsConceded;

  const homeDefenseWeakness = regressToMean(homeDefenseRaw, 1.0, homeDefSampleSize, 10);

  // ── Expected goals ─────────────────────────────────────────────────
  let homeExpectedGoals = homeAttackStrength * awayDefenseWeakness * leagueAvg.avgHomeGoals;
  let awayExpectedGoals = awayAttackStrength * homeDefenseWeakness * leagueAvg.avgAwayGoals;

  homeExpectedGoals = clamp(homeExpectedGoals, 0.3, 4.0);
  awayExpectedGoals = clamp(awayExpectedGoals, 0.2, 3.5);

  // Build goal matrix
  const matrix = buildGoalMatrix(homeExpectedGoals, awayExpectedGoals, 7, 0.1);
  const outcomes = calculateOutcomeProbs(matrix);

  // Reliability
  const minMatches = Math.min(homeStats.matchesPlayed, awayStats.matchesPlayed);
  const hasHomeAwaySplit = homeStats.homeMatches > 2 && awayStats.awayMatches > 2;
  let reliability: number;
  if (minMatches < 3) reliability = 0.15;
  else if (minMatches < 6) reliability = 0.35;
  else if (minMatches < 10) reliability = 0.55;
  else if (minMatches < 20) reliability = 0.7;
  else reliability = 0.85;

  if (hasHomeAwaySplit) reliability = Math.min(1, reliability + 0.1);

  return {
    homeWinProb: outcomes.homeWinProb,
    drawProb: outcomes.drawProb,
    awayWinProb: outcomes.awayWinProb,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
    reliability,
  };
}
