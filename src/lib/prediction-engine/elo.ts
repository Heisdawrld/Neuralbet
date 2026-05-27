import type { EloRating, ModelPrediction } from './types';

const K_FACTOR = 32;
const HOME_ADVANTAGE = 65;
const DEFAULT_RATING = 1500;

// In-memory cache for Elo ratings
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
 * Update Elo ratings from a list of match results.
 * Matches should be in chronological order for best results.
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

    // Calculate expected scores with home advantage
    const homeExpected = calculateExpectedScore(
      homeRating.rating + HOME_ADVANTAGE,
      awayRating.rating
    );
    const awayExpected = 1 - homeExpected;

    // Actual scores: 1 for win, 0.5 for draw, 0 for loss
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

    // Update ratings
    homeRating.rating = homeRating.rating + K_FACTOR * (homeActual - homeExpected);
    awayRating.rating = awayRating.rating + K_FACTOR * (awayActual - awayExpected);
    homeRating.matches++;
    awayRating.matches++;

    eloCache.set(match.homeTeamId, homeRating);
    eloCache.set(match.awayTeamId, awayRating);
  }

  cacheBuilt = true;
  return eloCache;
}

/**
 * Calculate expected score (probability of winning) for team A
 * E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 */
function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Generate match prediction from Elo ratings.
 * Uses home advantage bonus of +65 points.
 * Draw probability is estimated from the expected score.
 */
export function calculateEloPrediction(
  homeElo: EloRating | undefined,
  awayElo: EloRating | undefined
): ModelPrediction {
  const homeRating = homeElo?.rating ?? DEFAULT_RATING;
  const awayRating = awayElo?.rating ?? DEFAULT_RATING;

  // Apply home advantage
  const effectiveHomeRating = homeRating + HOME_ADVANTAGE;

  // Expected score for home team
  const homeExpected = calculateExpectedScore(effectiveHomeRating, awayRating);
  const awayExpected = 1 - homeExpected;

  // Estimate draw probability
  // The closer the ratings, the more likely a draw
  // Max draw probability is around 0.28 (when teams are equal)
  // Min draw probability approaches 0 when there's a big gap
  const ratingDiff = Math.abs(effectiveHomeRating - awayRating);
  const drawBase = 0.28 * Math.exp(-ratingDiff / 400);
  const drawProb = Math.min(0.33, Math.max(0.08, drawBase));

  // Adjust win probabilities accounting for draw
  const homeWinProb = Math.max(0.02, homeExpected * (1 - drawProb));
  const awayWinProb = Math.max(0.02, awayExpected * (1 - drawProb));

  // Normalize to sum to 1
  const total = homeWinProb + drawProb + awayWinProb;

  // Expected goals based on Elo difference
  const eloDiff = effectiveHomeRating - awayRating;
  const homeExpectedGoals = Math.max(0.5, 1.3 + eloDiff / 800);
  const awayExpectedGoals = Math.max(0.3, 1.1 - eloDiff / 1000);

  return {
    homeWinProb: homeWinProb / total,
    drawProb: drawProb / total,
    awayWinProb: awayWinProb / total,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
  };
}
