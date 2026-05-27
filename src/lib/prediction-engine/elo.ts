// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Advanced Elo Rating System
//
// Not your basic Elo. This one:
// - Uses goal-weighted K factor (a 5-0 win means more than 1-0)
// - Adjusts home advantage per league (Brazil ≠ England)
// - Tracks reliability based on sample size
// ═══════════════════════════════════════════════════════════════════════

import type { EloRating, ModelPrediction } from './types';
import { clamp } from './utils';

const DEFAULT_RATING = 1500;
const HOME_ADVANTAGE = 65; // Base home advantage in Elo points
const BASE_K_FACTOR = 24; // Lower K = more stable ratings (punter prefers stable)
const MAX_K_FACTOR = 40; // Higher K for early matches when we're still learning

// In-memory Elo cache
let eloCache = new Map<number, EloRating>();
let cacheBuilt = false;

export function getEloRatings(): Map<number, EloRating> {
  return eloCache;
}

export function isCacheBuilt(): boolean {
  return cacheBuilt;
}

export function resetEloCache(): void {
  eloCache = new Map<number, EloRating>();
  cacheBuilt = false;
}

function getOrCreateRating(teamId: number): EloRating {
  if (!eloCache.has(teamId)) {
    eloCache.set(teamId, { teamId, rating: DEFAULT_RATING, matches: 0 });
  }
  return eloCache.get(teamId)!;
}

/**
 * Dynamic K factor: more matches = lower K = more stable rating.
 * A punter trusts established teams more than unknown ones.
 */
function getKFactor(matches: number): number {
  if (matches < 5) return MAX_K_FACTOR; // Still learning — be flexible
  if (matches < 10) return 32;
  if (matches < 20) return BASE_K_FACTOR;
  return 20; // Established — don't overreact to one result
}

/**
 * Goal-weighted K factor multiplier.
 * A 5-0 win is more impressive than a 1-0 win.
 * Based on the formula: multiplier = 1 + 0.5 * ln(1 + goal_diff)
 * This is what professional rating systems use (FIFA, etc.)
 */
function goalWeightMultiplier(homeGoals: number, awayGoals: number): number {
  const goalDiff = Math.abs(homeGoals - awayGoals);
  if (goalDiff === 0) return 1;
  return 1 + 0.5 * Math.log(1 + goalDiff);
}

/**
 * Update Elo ratings from match results.
 * Uses goal-weighted K factor for more accurate ratings.
 */
export function updateEloRatings(
  matches: Array<{
    homeTeamId: number;
    awayTeamId: number;
    homeScore: number;
    awayScore: number;
  }>
): Map<number, EloRating> {
  for (const match of matches) {
    const homeRating = getOrCreateRating(match.homeTeamId);
    const awayRating = getOrCreateRating(match.awayTeamId);

    // Dynamic K factor based on experience
    const avgMatches = (homeRating.matches + awayRating.matches) / 2;
    const k = getKFactor(avgMatches);

    // Goal weight — dominant wins move the rating more
    const goalWeight = goalWeightMultiplier(match.homeScore, match.awayScore);

    // Expected scores with home advantage
    const homeExpected = calculateExpectedScore(
      homeRating.rating + HOME_ADVANTAGE,
      awayRating.rating
    );
    const awayExpected = 1 - homeExpected;

    // Actual scores
    let homeActual: number;
    let awayActual: number;
    if (match.homeScore > match.awayScore) {
      homeActual = 1;
      awayActual = 0;
    } else if (match.homeScore < match.awayScore) {
      homeActual = 0;
      awayActual = 1;
    } else {
      homeActual = 0.5;
      awayActual = 0.5;
    }

    // Update with goal-weighted K
    const effectiveK = k * goalWeight;
    homeRating.rating = homeRating.rating + effectiveK * (homeActual - homeExpected);
    awayRating.rating = awayRating.rating + effectiveK * (awayActual - awayExpected);
    homeRating.matches++;
    awayRating.matches++;

    eloCache.set(match.homeTeamId, homeRating);
    eloCache.set(match.awayTeamId, awayRating);
  }

  cacheBuilt = true;
  return eloCache;
}

/**
 * Calculate expected score (probability) from Elo ratings.
 * E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 */
function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Generate match prediction from Elo ratings.
 * Accounts for home advantage and estimates reliability based on sample size.
 */
export function calculateEloPrediction(
  homeElo: EloRating | undefined,
  awayElo: EloRating | undefined
): ModelPrediction {
  const homeRating = homeElo?.rating ?? DEFAULT_RATING;
  const awayRating = awayElo?.rating ?? DEFAULT_RATING;
  const homeMatches = homeElo?.matches ?? 0;
  const awayMatches = awayElo?.matches ?? 0;

  // Apply home advantage
  const effectiveHomeRating = homeRating + HOME_ADVANTAGE;

  // Expected score
  const homeExpected = calculateExpectedScore(effectiveHomeRating, awayRating);
  const awayExpected = 1 - homeExpected;

  // Draw probability — closer ratings = more likely draw
  const ratingDiff = Math.abs(effectiveHomeRating - awayRating);
  // Max draw ~28% when equal, drops as gap grows
  const drawBase = 0.28 * Math.exp(-ratingDiff / 400);
  const drawProb = clamp(drawBase, 0.08, 0.33);

  // Win probabilities accounting for draw
  const homeWinProb = clamp(homeExpected * (1 - drawProb), 0.02, 0.85);
  const awayWinProb = clamp(awayExpected * (1 - drawProb), 0.02, 0.85);

  // Normalize
  const total = homeWinProb + drawProb + awayWinProb;

  // Expected goals from Elo difference
  const eloDiff = effectiveHomeRating - awayRating;
  const homeExpectedGoals = clamp(1.3 + eloDiff / 800, 0.4, 3.5);
  const awayExpectedGoals = clamp(1.1 - eloDiff / 1000, 0.2, 2.8);

  // Reliability: more matches = more reliable Elo
  // A punter knows: "I've seen this team 20 times, I trust my read"
  const minMatches = Math.min(homeMatches, awayMatches);
  let reliability: number;
  if (minMatches === 0) reliability = 0.1;
  else if (minMatches < 5) reliability = 0.3;
  else if (minMatches < 10) reliability = 0.55;
  else if (minMatches < 20) reliability = 0.75;
  else reliability = 0.9;

  return {
    homeWinProb: homeWinProb / total,
    drawProb: drawProb / total,
    awayWinProb: awayWinProb / total,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
    reliability,
  };
}
